import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(process.argv[2] || "."), require = createRequire(import.meta.url);
const code = buildSync({ entryPoints: [path.join(root, "src/components/ui/model-icon.tsx")], bundle: true,
  write: false, platform: "node", format: "cjs", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"),
  external: ["react", "react/jsx-runtime", "lucide-react"] }).outputFiles[0].text;
const mod = { exports: {} };
new Function("require", "module", "exports", code)(require, mod, mod.exports);
const { ModelIcon } = mod.exports;
const render = (brand) => renderToStaticMarkup(React.createElement(ModelIcon, { modelId: "opaque-id", brand, size: 16 }));
if (process.argv.includes("--baseline")) {
  assert.ok(!render("gemini").includes("linearGradient"));
  assert.ok(render("qwen").includes('fill="currentColor"'));
  console.log("BASELINE=PASS GEMINI=MONO QWEN=PARTIAL_MONO COLOR_ISSUE=REPRODUCED");
  process.exit(0);
}
const colors = {
  gemini: ["#3186FF", "#08B962", "#F94543", "#FABC12"], qwen: ["#6336E7", "#6F69F7"],
  kimi: ["#1783FF", "#fff"], jimeng: ["#27B2F0", "#26DFFB", "#30F5FE", "#FD9C22"],
  minimax: ["#E2167E", "#FE603C"], mistral: ["#FFAF00", "#FF8205", "#FA500F", "#E10500"],
  zhipu: ["#3859FF"], meta: ["#0082FB", "#0867DF"], wenxin: ["#012F8D", "#0A51C3", "#23A4FB"],
  hunyuan: ["#0055E9", "#00BCFF", "#A8DFF5", "#ECECEE"],
};
for (const [brand, palette] of Object.entries(colors)) {
  const html = render(brand);
  for (const color of palette) assert.ok(html.includes(color), `${brand} missing ${color}`);
  assert.ok(!html.includes('fill="currentColor"'), `${brand} must use source colors`);
}
assert.ok(render("kimi").includes("background:#000"), "White Kimi glyph needs source-brand dark plate");
for (const brand of ["openai", "grok"]) assert.ok(render(brand).includes('fill="currentColor"'));
const repeated = Object.keys(colors).flatMap(brand => [brand, brand]);
const html = renderToStaticMarkup(React.createElement("div", null,
  repeated.map((brand, i) => React.createElement(ModelIcon, { key: i, modelId: "opaque-id", brand }))));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, "Gradient/clip IDs must be unique across repeated icons");
for (const [, id] of html.matchAll(/url\(#([^\)]+)\)/g)) assert.ok(ids.includes(id), `Missing gradient/clip ${id}`);
const i = process.argv.indexOf("--unchanged-from");
if (i >= 0) {
  const baseline = path.resolve(process.argv[i + 1]);
  for (const file of ["src/lib/model-brand.ts", "src/components/ui/text-model-select.tsx", "src/components/canvas/canvas-client.tsx", "src/components/generate/generate-client.tsx"]) {
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), fs.readFileSync(path.join(baseline, file), "utf8"), file);
  }
  console.log("BUSINESS=PASS MODEL_MATCHING_SELECTORS_ROUTING_BILLING=UNCHANGED");
}
console.log("MODIFIED=PASS SOURCE_COLOR_VARIANTS=10 GEMINI=4_COLOR_GRADIENT REPEATED_SVG_IDS=UNIQUE MONO_BRANDS=OPENAI_GROK");
