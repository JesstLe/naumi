#!/usr/bin/env node
// Compatibility CLI for the original background-recovery contract. The current
// owners are modules, not inline component effects. Reuse their executable
// regressions rather than require business orchestration to return to the UI.
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.resolve(process.env.CANVAS_BACKGROUND_RECOVERY_EVIDENCE||path.join(root,"output/canvas-background-task-recovery"));
mkdirSync(output,{recursive:true});
const tasksPath=path.join(root,"src/lib/canvas-image-tasks.ts");
const tasks=ts.createSourceFile(tasksPath,readFileSync(tasksPath,"utf8"),ts.ScriptTarget.Latest,true);
assert.equal(tasks.parseDiagnostics.length,0,"Task use case must parse");
const collect=(scope,predicate)=>{const nodes=[];function visit(node){if(predicate(node))nodes.push(node);ts.forEachChild(node,visit);}visit(scope);return nodes;};
const named=name=>{const nodes=collect(tasks,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.equal(nodes.length,1,`Expected unique ${name}`);return nodes[0];};
const input=collect(tasks,node=>ts.isTypeAliasDeclaration(node)&&node.name.text==="TextEditTaskInput");
assert.equal(input.length,1);
assert.equal(collect(input[0],node=>ts.isPropertySignature(node)&&node.name.getText(tasks)==="operationId").length,1);
assert.ok(named("normalizedInput").getText(tasks).includes("value.operationId"));
const enqueue=named("enqueueTextEditTask");
for(const fragment of ["input.operationId",'createHash("sha256")',"email.toLowerCase()"])
  assert.ok(enqueue.getText(tasks).includes(fragment),`Task identity must retain ${fragment}`);
assert.equal(collect(enqueue,node=>ts.isCallExpression(node)&&node.expression.getText(tasks)==="createCanvasImageTaskWithReservation").length,1,"Task and reservation share the original atomic create");

const suites=[
  ["video-follow","scripts/verify-canvas-video-follow.cjs","CANVAS_VIDEO_FOLLOW=PASS"],
  ["video-submission","scripts/verify-canvas-video-submission.cjs","CANVAS_VIDEO_SUBMISSION=PASS"],
  ["image-text-editor","scripts/verify-canvas-image-text-editor.cjs","CANVAS_IMAGE_TEXT=PASS"],
  ["pending-presentation","scripts/verify-canvas-pending-presentation.mjs","CANVAS_PENDING_PRESENTATION=PASS"],
];
const results=[];
for(const [id,file,marker] of suites){
  const evidence=path.join(output,id);
  const command=[file,"--out",evidence];
  const result=spawnSync(process.execPath,command,{cwd:root,encoding:"utf8",env:{...process.env,IMAGE_TEXT_EVIDENCE:evidence}});
  const stdout=result.stdout||"",stderr=result.stderr||"";
  writeFileSync(path.join(output,id+".log"),stdout+stderr);
  const pass=!result.error&&result.status===0&&stdout.includes(marker);
  results.push({id,command:[process.execPath,...command],exit:result.status,marker,status:pass?"PASS":"FAIL",error:result.error?String(result.error):null});
  writeFileSync(path.join(output,"RESULT.json"),JSON.stringify({status:results.every(row=>row.status==="PASS")?"PASS":"FAIL",suites:results,scope:"Current executable module/caller regressions; controlled auth/network/timers, actual React pending hook in local browser; server atomic-create identity is AST-only here, not PG/production acceptance."},null,2)+"\n");
  process.stdout.write(stdout);process.stderr.write(stderr);
  assert.ok(pass,`${id} recovery regression failed; see ${output}`);
}
console.log("CANVAS_BACKGROUND_TASK_RECOVERY_RESULT=PASS SUITES=4 OWNERS=ACTUAL LEGACY_INLINE_EFFECT_REQUIREMENT=0 ATOMIC_CREATE=AST SUPPLIER=0");
