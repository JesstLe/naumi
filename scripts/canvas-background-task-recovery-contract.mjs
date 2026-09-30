#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(root, "src/components/canvas/canvas-client.tsx");
const imageTasksPath = path.join(root, "src/lib/canvas-image-tasks.ts");
const clientSource = readFileSync(clientPath, "utf8");
const imageTasksSource = readFileSync(imageTasksPath, "utf8");

const clientFile = ts.createSourceFile(
  clientPath,
  clientSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const imageTasksFile = ts.createSourceFile(
  imageTasksPath,
  imageTasksSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);

assert.equal(clientFile.parseDiagnostics.length, 0, "canvas-client.tsx must parse before its recovery contract is inspected");
assert.equal(imageTasksFile.parseDiagnostics.length, 0, "canvas-image-tasks.ts must parse before its idempotency contract is inspected");

function collect(scope, predicate) {
  const matches = [];
  const visit = (node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return matches;
}

function one(matches, message) {
  assert.equal(matches.length, 1, `${message}; found ${matches.length}`);
  return matches[0];
}

function compact(value) {
  const text = typeof value === "string" ? value : value.getText(value.getSourceFile());
  return text.replace(/\s+/g, "").replaceAll("'", '"');
}

function namedFunction(sourceFile, name) {
  const declaration = collect(sourceFile, (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
  )[0];
  if (declaration?.body) return declaration;

  const variable = collect(sourceFile, (node) =>
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === name &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  )[0];
  assert.ok(variable?.initializer?.body, `missing function ${name}`);
  return variable.initializer;
}

function namedVariable(scope, name) {
  return one(
    collect(scope, (node) =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
    ),
    `missing unique variable ${name}`
  );
}

function effectForRoute(routeFragment) {
  const effects = collect(clientFile, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText(clientFile) !== "useEffect") return false;
    const callback = node.arguments[0];
    return Boolean(
      callback &&
      (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
      callback.body.getText(clientFile).includes(routeFragment)
    );
  });
  const call = one(effects, `missing unique recovery effect for ${routeFragment}`);
  const callback = call.arguments[0];
  assert.ok(
    (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body),
    `recovery effect for ${routeFragment} must use a block callback`
  );
  assert.ok(ts.isArrayLiteralExpression(call.arguments[1]), `recovery effect for ${routeFragment} must declare dependencies`);
  return { call, callback, body: callback.body, dependencies: call.arguments[1] };
}

function assertDependencies(effect, label) {
  const dependencies = new Set(effect.dependencies.elements.map((element) => compact(element)));
  for (const dependency of ["user?.email", "active?.key"]) {
    assert.ok(dependencies.has(dependency), `${label} recovery effect must depend on ${dependency}`);
  }
  assert.ok(
    compact(effect.body).includes("activeProjectRef.current"),
    `${label} recovery effect must read the latest active project through activeProjectRef`
  );
}

function taskFilterPredicate(effect, kind) {
  const candidates = collect(effect.body, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    if (node.expression.name.text !== "filter") return false;
    const predicate = node.arguments[0];
    const predicateText = predicate?.getText(clientFile) ?? "";
    return Boolean(
      predicateText.includes("taskKind") &&
      predicateText.includes(kind) &&
      predicateText.includes("terminalIds")
    );
  });
  const call = one(candidates, `missing unique ${kind} placeholder filter`);
  const predicate = call.arguments[0];
  assert.ok(
    (ts.isArrowFunction(predicate) || ts.isFunctionExpression(predicate)) &&
      predicate.parameters.length > 0 &&
      ts.isIdentifier(predicate.parameters[0].name),
    `${kind} placeholder filter must have a named predicate parameter`
  );
  return predicate;
}

function assertSubmittingPlaceholderPreserved(effect, kind) {
  const predicate = taskFilterPredicate(effect, kind);
  const item = predicate.parameters[0].name.text;
  const text = compact(predicate);
  const kindGuard = `${item}.taskKind!=="${kind}"`;
  const submittingGuard = `!${item}.taskId`;
  const terminalGuard = `!terminalIds.has(${item}.taskId)`;
  const kindIndex = text.indexOf(kindGuard);
  const submittingIndex = text.indexOf(submittingGuard);
  const terminalIndex = text.indexOf(terminalGuard);
  assert.ok(kindIndex >= 0, `${kind} recovery filter must isolate its own placeholder kind`);
  assert.ok(submittingIndex > kindIndex, `${kind} recovery filter must retain submitting placeholders without taskId`);
  assert.ok(terminalIndex > submittingIndex, `${kind} recovery filter may remove only explicitly terminal taskIds`);
}

function qualifiedCalls(scope, qualifiedName) {
  return collect(scope, (node) =>
    ts.isCallExpression(node) && compact(node.expression) === qualifiedName
  );
}

function mergeAwait(scope, resultField) {
  const awaited = one(
    collect(scope, (node) =>
      ts.isAwaitExpression(node) && compact(node.expression).startsWith("mergeWorks(")
    ),
    `missing unique mergeWorks await for ${resultField}`
  );
  let declaration = awaited.parent;
  while (declaration && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent;
  assert.ok(
    declaration && ts.isIdentifier(declaration.name),
    `mergeWorks result for ${resultField} must be captured for verification`
  );
  return { awaited, variable: declaration.name.text };
}

function ancestor(node, predicate, stopAt) {
  let current = node.parent;
  while (current && current !== stopAt) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

function assertSettledAfterVerifiedMerge(effect, options) {
  const { refName, resultField, requireCompletedAncestor } = options;
  const hasCall = one(qualifiedCalls(effect.body, `${refName}.current.has`), `${refName} must guard repeat recovery`);
  const addCall = one(qualifiedCalls(effect.body, `${refName}.current.add`), `${refName} must record a settled task once`);
  const merge = mergeAwait(effect.body, resultField);

  assert.ok(hasCall.getStart(clientFile) < merge.awaited.getStart(clientFile), `${refName}.has must run before mergeWorks`);
  assert.ok(addCall.getStart(clientFile) > merge.awaited.getEnd(), `${refName}.add must run after mergeWorks resolves`);

  if (requireCompletedAncestor) {
    const completedGuard = ancestor(
      merge.awaited,
      (node) =>
        ts.isIfStatement(node) &&
        compact(node.expression).includes('task.status==="completed"') &&
        compact(node.expression).includes(`task.${resultField}`),
      effect.body
    );
    assert.ok(completedGuard, `${refName} merge must stay inside a completed + ${resultField} guard`);
  }

  const positiveVerification = ancestor(
    addCall,
    (node) => {
      if (!ts.isIfStatement(node)) return false;
      const condition = compact(node.expression);
      return condition.includes(`${merge.variable}.some(`) && condition.includes(`task.${resultField}`);
    },
    effect.body
  );

  const negativeVerification = collect(effect.body, (node) => {
    if (!ts.isIfStatement(node)) return false;
    const start = node.getStart(clientFile);
    if (start <= merge.awaited.getEnd() || start >= addCall.getStart(clientFile)) return false;
    const condition = compact(node.expression);
    const exits = collect(node.thenStatement, (child) =>
      ts.isContinueStatement(child) || ts.isReturnStatement(child) || ts.isThrowStatement(child)
    ).length > 0;
    return (
      condition.includes(`${merge.variable}.some(`) &&
      condition.includes(`task.${resultField}`) &&
      condition.startsWith("!") &&
      exits
    );
  })[0];

  assert.ok(
    positiveVerification || negativeVerification,
    `${refName}.add must be control-flow guarded by a verified ${resultField} in the mergeWorks result`
  );
}

function isStoppedReturn(statement) {
  return Boolean(
    statement &&
    ts.isIfStatement(statement) &&
    compact(statement.expression) === "stopped" &&
    collect(statement.thenStatement, ts.isReturnStatement).length > 0
  );
}

function nextReachableStatement(node, outerScope) {
  let current = node;
  while (current && current !== outerScope) {
    const parent = current.parent;
    if (parent && ts.isBlock(parent)) {
      const statementIndex = parent.statements.findIndex((statement) => statement === current);
      if (statementIndex >= 0 && statementIndex + 1 < parent.statements.length) {
        return parent.statements[statementIndex + 1];
      }
      current = parent.parent;
      continue;
    }
    current = parent;
  }
  return null;
}

function awaitGuardViolations(effect, label) {
  const sync = namedVariable(effect.body, "sync");
  assert.ok(
    sync.initializer && (ts.isArrowFunction(sync.initializer) || ts.isFunctionExpression(sync.initializer)) && ts.isBlock(sync.initializer.body),
    `${label} recovery sync must be an async block function`
  );
  const body = sync.initializer.body;
  const awaits = collect(body, ts.isAwaitExpression).sort(
    (a, b) => a.getStart(clientFile) - b.getStart(clientFile)
  );
  assert.ok(awaits.length >= 3, `${label} recovery sync must expose its awaited recovery checkpoints`);
  return awaits.flatMap((awaited) => {
    const next = nextReachableStatement(awaited, body);
    if (isStoppedReturn(next)) return [];
    const position = clientFile.getLineAndCharacterOfPosition(awaited.getStart(clientFile));
    const nextText = next ? next.getText(clientFile).replace(/\s+/g, " ").slice(0, 90) : "<end-of-sync>";
    return [
      `${label}:${position.line + 1} await ${awaited.expression.getText(clientFile).replace(/\s+/g, " ").slice(0, 90)} -> ${nextText}`,
    ];
  });
}

// 1. Local expand/annotation placeholders must never be claimed by video recovery.
const landEditResult = namedFunction(clientFile, "landEditResult");
const landEditVideoKinds = collect(landEditResult.body, (node) =>
  ts.isPropertyAssignment(node) &&
  node.name.getText(clientFile) === "taskKind" &&
  compact(node.initializer) === '"video"'
);
assert.equal(landEditVideoKinds.length, 0, 'landEditResult placeholder must not contain taskKind: "video"');

const videoEffect = effectForRoute("/api/video/tasks?source=canvas&limit=500");
const imageEffect = effectForRoute("/api/canvas/image-tasks?limit=500");

// 2. A placeholder has no taskId while its POST is still in flight; recovery must retain it.
assertSubmittingPlaceholderPreserved(videoEffect, "video");
assertSubmittingPlaceholderPreserved(imageEffect, "image-edit");

// 3-4. Settled refs are written only after the returned artwork is observed in mergeWorks output.
for (const refName of ["settledCanvasVideoTaskRef", "settledCanvasImageTaskRef"]) {
  const declaration = namedVariable(clientFile, refName);
  const initializer = compact(declaration.initializer ?? "");
  assert.ok(
    initializer.startsWith("useRef(newSet<string>()"),
    `${refName} must remain a persistent Set ref`
  );
}
assertSettledAfterVerifiedMerge(videoEffect, {
  refName: "settledCanvasVideoTaskRef",
  resultField: "artworkId",
  requireCompletedAncestor: false,
});
assertSettledAfterVerifiedMerge(imageEffect, {
  refName: "settledCanvasImageTaskRef",
  resultField: "resultArtworkId",
  requireCompletedAncestor: true,
});

// 5. needs_attention is a visible stopped state, not a permanently animated placeholder.
const videoEffectText = compact(videoEffect.body);
for (const fragment of [
  'task.status==="needs_attention"',
  "needsAttention:true",
  'attentionHref:"/video"',
]) {
  assert.ok(videoEffectText.includes(fragment), `video recovery must expose ${fragment}`);
}
const onGenerateVideo = namedFunction(clientFile, "onGenerateVideo");
const directAttentionGuard = one(
  collect(onGenerateVideo.body, (node) =>
    ts.isIfStatement(node) && compact(node.expression).includes('task?.status==="needs_attention"')
  ),
  "direct video polling must handle needs_attention exactly once"
);
const directAttentionText = compact(directAttentionGuard.thenStatement);
for (const fragment of [
  "needsAttention=true",
  "window.clearInterval(progressTimer)",
  "needsAttention:true",
  'attentionHref:"/video"',
]) {
  assert.ok(directAttentionText.includes(fragment), `direct needs_attention branch must contain ${fragment}`);
}
assert.ok(
  collect(directAttentionGuard.thenStatement, ts.isBreakStatement).length === 1,
  "direct needs_attention branch must stop polling"
);
const timeoutGuard = one(
  collect(onGenerateVideo.body, (node) =>
    ts.isIfStatement(node) && compact(node.expression).includes("Date.now()-startedAt>10*60*1000")
  ),
  "direct video polling must keep one running-task timeout guard"
);
assert.ok(
  directAttentionGuard.getStart(clientFile) < timeoutGuard.getStart(clientFile),
  "needs_attention must be observed before the running-task timeout is evaluated"
);
const attentionRemovalGuard = collect(onGenerateVideo.body, (node) =>
  ts.isIfStatement(node) && compact(node.expression) === "!needsAttention" &&
  compact(node.thenStatement).includes("setPendNodes(") &&
  compact(node.thenStatement).includes("pendingId")
)[0];
assert.ok(attentionRemovalGuard, "needs_attention placeholder must survive direct polling cleanup");
const pendNode = namedFunction(clientFile, "PendNode");
const pendNodeText = compact(pendNode.body);
assert.ok(pendNodeText.includes("d.needsAttention"), "PendNode must render a stopped needs_attention branch");
assert.ok(pendNodeText.includes('href={d.attentionHref||"/video"}'), "PendNode must link needs_attention to /video");

// 6. OCR submission uses a synchronous mutex and sends an idempotency operationId.
const applyOcrSegment = namedFunction(clientFile, "applyOcrSegment");
const lockGuard = collect(applyOcrSegment.body, (node) =>
  ts.isIfStatement(node) &&
  compact(node.expression).includes("ocrApplyLockRef.current") &&
  collect(node.thenStatement, ts.isReturnStatement).length > 0
)[0];
assert.ok(lockGuard, "applyOcrSegment must reject a concurrent call through ocrApplyLockRef");
const lockTrue = one(
  collect(applyOcrSegment.body, (node) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    compact(node.left) === "ocrApplyLockRef.current" &&
    node.right.kind === ts.SyntaxKind.TrueKeyword
  ),
  "applyOcrSegment must acquire ocrApplyLockRef exactly once"
);
const lockFalse = one(
  collect(applyOcrSegment.body, (node) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    compact(node.left) === "ocrApplyLockRef.current" &&
    node.right.kind === ts.SyntaxKind.FalseKeyword
  ),
  "applyOcrSegment must release ocrApplyLockRef exactly once"
);
const firstApplyAwait = collect(applyOcrSegment.body, ts.isAwaitExpression).sort(
  (a, b) => a.getStart(clientFile) - b.getStart(clientFile)
)[0];
assert.ok(firstApplyAwait, "applyOcrSegment must enqueue its background task asynchronously");
assert.ok(lockTrue.getStart(clientFile) < firstApplyAwait.getStart(clientFile), "OCR lock must be acquired synchronously before the first await");
assert.ok(lockFalse.getStart(clientFile) > firstApplyAwait.getEnd(), "OCR lock must be released after the asynchronous enqueue attempt");
const releaseTry = ancestor(lockFalse, ts.isTryStatement, applyOcrSegment.body);
assert.ok(
  releaseTry?.finallyBlock &&
    lockFalse.getStart(clientFile) >= releaseTry.finallyBlock.getStart(clientFile) &&
    lockFalse.getEnd() <= releaseTry.finallyBlock.getEnd(),
  "OCR lock must be released from finally"
);

const operationId = namedVariable(applyOcrSegment.body, "operationId");
assert.ok(operationId.getStart(clientFile) < firstApplyAwait.getStart(clientFile), "operationId must be created before enqueue");
const operationPayload = collect(applyOcrSegment.body, (node) =>
  (ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) &&
  node.name.getText(clientFile) === "operationId" &&
  Boolean(ancestor(node, (parent) =>
    ts.isCallExpression(parent) && compact(parent.expression) === "JSON.stringify",
  applyOcrSegment.body))
);
assert.ok(operationPayload.length > 0, "applyOcrSegment must pass operationId in the image-task request body");

const taskInputType = one(
  collect(imageTasksFile, (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "TextEditTaskInput"),
  "missing TextEditTaskInput contract"
);
assert.ok(
  collect(taskInputType.type, (node) => ts.isPropertySignature(node) && node.name.getText(imageTasksFile) === "operationId").length === 1,
  "TextEditTaskInput must accept operationId"
);
const normalizeInput = namedFunction(imageTasksFile, "normalizedInput");
assert.ok(compact(normalizeInput.body).includes("value.operationId"), "normalizedInput must preserve operationId");
const enqueueTask = namedFunction(imageTasksFile, "enqueueTextEditTask");
const enqueueText = compact(enqueueTask.body);
for (const fragment of [
  "input.operationId",
  'createHash("sha256")',
  "email.toLowerCase()",
  "createCanvasImageTaskWithReservation({",
]) {
  assert.ok(enqueueText.includes(fragment), `enqueueTextEditTask idempotency path must contain ${fragment}`);
}
const atomicCreate = one(
  collect(enqueueTask.body, (node) =>
    ts.isCallExpression(node) && compact(node.expression) === "createCanvasImageTaskWithReservation"
  ),
  "enqueueTextEditTask must use one atomic idempotent task + reservation transaction"
);
assert.ok(atomicCreate, "atomic image task creation must be present");

// 7. Project/account changes restart both effects, and every awaited recovery stage is cancellation guarded.
assertDependencies(videoEffect, "video");
assertDependencies(imageEffect, "image-edit");
const awaitGuardErrors = [
  ...awaitGuardViolations(videoEffect, "video"),
  ...awaitGuardViolations(imageEffect, "image-edit"),
];
assert.equal(
  awaitGuardErrors.length,
  0,
  `every recovery await must be immediately followed by if (stopped) return:\n${awaitGuardErrors.join("\n")}`
);

console.log(
  "CANVAS_BACKGROUND_TASK_RECOVERY_RESULT=PASS " +
  "checks=7 files=2 localEdit=isolated submitting=preserved " +
  "videoSettle=post-merge videoAttention=stopped-actionable imageSettle=post-verify ocr=idempotent effects=cancellation-guarded"
);
