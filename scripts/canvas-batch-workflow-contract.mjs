import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(root, "src/lib/canvas/clipboard-files.ts");
const clientPath = path.join(root, "src/components/canvas/canvas-client.tsx");
const helperSource = await readFile(helperPath, "utf8");
const client = await readFile(clientPath, "utf8");

const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Set });
const { clipboardImageFiles, isCanvasImageFile } = module.exports;

const file = (name, type = "") => ({ name, type, size: 10, lastModified: 1 });
const item = value => ({ kind: "file", type: value.type, getAsFile: () => value });

assert.equal(isCanvasImageFile(file("finder-image.PNG")), true);
assert.equal(isCanvasImageFile(file("explorer-image.jpg")), true);
assert.equal(isCanvasImageFile(file("photo.bin", "image/webp; charset=binary")), true);
assert.equal(isCanvasImageFile(file("vector.svg", "image/svg+xml")), false);
assert.equal(isCanvasImageFile(file("readme.txt")), false);

const nativeBatch = [file("one.png"), file("two.webp", "image/webp")];
assert.equal(
  clipboardImageFiles({
    items: nativeBatch.map(item),
    files: [...nativeBatch, file("duplicate-from-files.png", "image/png")],
  }).map(entry => entry.name).join("|"),
  "one.png|two.webp"
);
assert.equal(
  clipboardImageFiles({
    items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    files: [file("fallback.jpeg"), file("ignored.txt", "text/plain")],
  }).map(entry => entry.name).join("|"),
  "fallback.jpeg"
);

for (const contract of [
  /import \{ clipboardImageFiles \} from "@\/lib\/canvas\/clipboard-files"/,
  /selectedBatchIds\.includes\(node\.id\)/,
  /data-testid="canvas-batch-context-count"/,
  /const modified = e\.ctrlKey \|\| e\.metaKey/,
  /applyArtworkSelection\(\[node\.id\]\)/,
  /label=\{t\("canvas\.addToBatchSelection"\)\}/,
  /label=\{t\("canvas\.removeFromBatchSelection"\)\}/,
  /label=\{t\("canvas\.batchGenerate"\)\}/,
  /label=\{t\("canvas\.batchRunImages"\)\}/,
  /label=\{t\("canvas\.batchRunText"\)\}/,
  /onClick=\{createMergeNodeFromSelection\}/,
  /void batchRunImages\(selectedBatchArts\)/,
  /void reversePromptsForSelection\(selectedBatchArts\)/,
  /"parentIds",\s*JSON\.stringify\(inputArts\.slice\(1\)\.map\(\(a\) => a\.id\)\)/,
  /\[pend\.parentId, \.\.\.pend\.inputs\]/,
  /targetIds: Array\.from\(new Set\(\[\.\.\.\(node\.targetIds \?\? \[\]\), \.\.\.newIds\]\)\)/,
]) {
  assert.match(client, contract);
}

console.log("CANVAS_BATCH_WORKFLOW_CONTRACT_RESULT=PASS checks=21");
