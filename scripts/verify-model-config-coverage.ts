import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const files = execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z","src"],{encoding:"utf8"}).split("\0").filter(f => /\.tsx?$/.test(f));
const calls = (file: string) => {
  const parsed = ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,file.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
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
assert.ok(calls("src/lib/canvas-image-tasks.ts").names.includes("withModelRequest"));
assert.ok(calls("src/lib/video/runtime.ts").names.includes("withFrozenExecutionBundle"));
assert.ok(calls("src/lib/video/creation.ts").names.includes("executor.runBundle"));
console.log(`PASS executable resolver boundaries for ${entries.length} HTTP entries, durable canvas/video restore and centralized SDK construction`);
console.log("Runtime proof is supplied separately by verify:model-execution, verify:model-tools, verify:image-gateway and verify:video-providers; this scan is a regression guard, not a substitute for HTTP assertions.");
