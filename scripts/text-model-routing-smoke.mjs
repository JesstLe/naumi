import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const routes = [
  "src/app/api/agent/route.ts",
  "src/app/api/agent/verify-image/route.ts",
  "src/app/api/aplus/route.ts",
  "src/app/api/canvas/ocr/route.ts",
  "src/app/api/canvas/text-generate/route.ts",
  "src/app/api/competitors/[id]/action/route.ts",
  "src/app/api/ipcheck/route.ts",
  "src/app/api/prompt-assist/route.ts",
  "src/app/api/replicate/analyze/route.ts",
  "src/app/api/suite/route.ts",
  "src/app/api/title-gen/route.ts",
];

const helper = await read("src/lib/text-models.ts");
assert.match(helper, /x-naumi-text-model/);
assert.match(helper, /client\.models\.list/);
assert.match(helper, /MODEL_ID\.test/);

for (const route of routes) {
  const source = await read(route);
  assert.match(source, /requestedTextModel/, `${route} does not route the selected text model`);
}

const auth = await read("src/lib/supabase.ts");
assert.match(auth, /naumi:text-model/);
assert.match(auth, /x-naumi-text-model/);

const canvas = await read("src/components/canvas/canvas-client.tsx");
assert.match(canvas, /Math\.min\(maxHeight, Math\.max\(54, textarea\.scrollHeight\)\)/);
assert.match(canvas, /展开编辑窗口/);
assert.match(canvas, /aria-label="编辑生成文本"/);
assert.match(canvas, /TextModelSelect compact dark=/);

const globalPopup = await read("src/components/tools/prompt-assist-popup.tsx");
assert.match(globalPopup, /TextModelSelect/);

console.log(`PASS text model routing covers ${routes.length} text and vision generation endpoints`);
console.log("PASS canvas text composer is auto-sized, capped, window-expandable, and directly editable");

