import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import ts from "typescript";

const files = execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z","src"],{encoding:"utf8"}).split("\0").filter(f => /\.tsx?$/.test(f));
const calls = (file: string, source = readFileSync(file,"utf8")) => {
  const parsed = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const names: string[] = [], constructors: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.push(node.expression.text);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) names.push(node.expression.getText(parsed));
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) constructors.push(node.expression.text);
    ts.forEachChild(node,visit);
  }; visit(parsed); return { names, constructors };
};
for (const file of files) {
  const found = calls(file);
  if (found.constructors.includes("OpenAI")) assert.equal(file,"src/lib/model-config/clients.ts",`Unregistered SDK construction in ${file}`);
  if (file.startsWith("src/app/api/") && found.names.includes("modelAwareOpenAI")) assert.ok(found.names.includes("withBiRequest"),`Model SDK entry lacks an executable request wrapper: ${file}`);
}
const entries = ["generate-image","suite","aplus","agent","agent/verify-image","title-gen","prompt-assist","canvas/assistant","canvas/text-generate","canvas/ocr","competitors/[id]/action","replicate/analyze","retouch","recolor","replicate","inpaint","extract","garment","garment3d","packaging3d","avatar","style","tryon","dewatermark","dewrinkle","cutout","ipcheck","canvas/expand","canvas/text-edit","canvas/annotate"];
for (const entry of entries) assert.ok(calls(`src/app/api/${entry}/route.ts`).names.includes("withBiRequest"),`Missing request-level resolver for ${entry}`);
// The task is a headless use case. Its ingress adapter owns Request parsing;
// the task's fallback must enter the same resolver through the typed public API.
// Resolve imported bindings, so aliases/namespaces remain valid but an unused
// import or identically named function from a different module does not pass.
const canvasTaskFile = "src/lib/canvas-image-tasks.ts";
function assertTypedCanvasTask(source: string) {
  const parsed = ts.createSourceFile(canvasTaskFile,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const typed = new Set<string>(), http = new Set<string>();
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const specifier = statement.moduleSpecifier.text;
    const target = specifier.startsWith("@/") ? "src/"+specifier.slice(2) : specifier.startsWith(".") ? posix.normalize(posix.join(posix.dirname(canvasTaskFile),specifier)) : specifier;
    if (target.replace(/\.ts$/,"") !== "src/lib/model-config/requests") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      typed.add(bindings.name.text+".withModelOperation");http.add(bindings.name.text+".withModelRequest");
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if (binding.isTypeOnly) continue;
        const exported = (binding.propertyName ?? binding.name).text;
        if (exported === "withModelOperation") typed.add(binding.name.text);
        if (exported === "withModelRequest") http.add(binding.name.text);
      }
    }
  }
  const found = calls(canvasTaskFile,source);
  assert.ok(found.names.some(name=>typed.has(name)),"Headless Canvas task must call the imported typed model resolver");
  assert.ok(!found.names.some(name=>http.has(name)),"HTTP model adapter belongs to ingress,not the headless task");
  assert.ok(!found.constructors.includes("Request"),"Headless Canvas task must not construct an HTTP Request");
}
const taskSource = readFileSync(canvasTaskFile,"utf8");
assertTypedCanvasTask(taskSource);
const originalImport = 'import {withModelOperation} from "@/lib/model-config/requests";';
const fixtureSource = originalImport+'\nasync function task(){return withModelOperation({path:"/api/canvas/image-tasks",body:{}},async()=>{});}';
assert.doesNotThrow(()=>assertTypedCanvasTask(fixtureSource.replace(originalImport,'import {withModelOperation as prepareTaskModel} from "@/lib/model-config/requests";').replace('withModelOperation({path:','prepareTaskModel({path:')));
assert.doesNotThrow(()=>assertTypedCanvasTask(fixtureSource.replace(originalImport,'import * as taskModels from "@/lib/model-config/requests";').replace('withModelOperation({path:','taskModels.withModelOperation({path:')));
assert.doesNotThrow(()=>assertTypedCanvasTask(fixtureSource.replace('from "@/lib/model-config/requests"','from "./model-config/requests"')));
assert.throws(()=>assertTypedCanvasTask(fixtureSource.replace('withModelOperation({path:','unpreparedTask({path:')),/must call the imported typed model resolver/);
assert.throws(()=>assertTypedCanvasTask(fixtureSource.replace('from "@/lib/model-config/requests"','from "@/lib/unrelated-resolver"')),/must call the imported typed model resolver/);
assert.throws(()=>assertTypedCanvasTask(fixtureSource.replace(originalImport,'import {withModelOperation,withModelRequest} from "@/lib/model-config/requests";')+'\nwithModelRequest();'),/HTTP model adapter belongs to ingress/);
assert.throws(()=>assertTypedCanvasTask(fixtureSource+'\nnew Request("/fixture");'),/must not construct an HTTP Request/);
assert.ok(calls("src/lib/video/runtime.ts").names.includes("withFrozenExecutionBundle"));
assert.ok(calls("src/lib/video/creation.ts").names.includes("executor.runBundle"));
console.log(`PASS executable resolver boundaries for ${entries.length} HTTP entries, durable canvas/video restore and centralized SDK construction`);
console.log("Runtime proof is supplied separately by verify:model-execution, verify:model-tools, verify:image-gateway and verify:video-providers; this scan is a regression guard, not a substitute for HTTP assertions.");
console.log("MODEL_COVERAGE_CONTRACT=PASS cases=8 TYPED_CANVAS_RESOLVER=REQUIRED HTTP_IN_TASK=REJECTED ALIAS_NAMESPACE_RELATIVE=PASS UNUSED_WRONG_IMPORT=REJECTED RUNTIME_PROOF=SEPARATE");
