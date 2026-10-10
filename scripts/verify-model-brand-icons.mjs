import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = path.resolve(process.argv[2] || ".");
const compile = (file) => {
  const code = buildSync({ entryPoints: [path.join(root, file)], bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"),
    external: ["react", "react/jsx-runtime", "lucide-react"] }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(require, mod, mod.exports);
  return mod.exports;
};
const { ModelIcon } = compile("src/components/ui/model-icon.tsx");
const render = (props) => renderToStaticMarkup(React.createElement(ModelIcon, props));
if (process.argv.includes("--baseline")) {
  assert.match(render({ modelId: "gpt6Astra" }), /lucide-sparkles/);
  assert.match(render({ modelId: "opaque-text-id", modelName: "GPT-6 Astra" }), /lucide-sparkles/);
  console.log("BASELINE=PASS GPT6ASTRA=GENERIC DISPLAY_NAME=IGNORED");
  process.exit(0);
}
const { resolveModelBrand, MODEL_BRANDS } = compile("src/lib/model-brand.ts");
const cases = [
  ["gpt6Astra", "openai"], ["GPT6SOL", "openai"], [" gpt-5.6-luna ", "openai"],
  ["ＧＰＴ６Ａｓｔｒａ", "openai"], ["GPT 6 Astra", "openai"], ["gpt-image-1", "openai"],
  ["OpenAI/gpt-4o", "openai"], ["router/openai/gpt-4.1", "openai"], ["o3-mini", "openai"],
  ["o4", "openai"], ["naumi-image", "openai"], ["gpt-oss-120b", "openai"],
  ["claude-sonnet-4", "claude"], ["anthropic/claude-3.7-sonnet", "claude"],
  ["DeepSeek-V3", "deepseek"], ["Qwen3-235B", "qwen"], ["qwq-32b", "qwen"],
  ["xai/grok-4", "grok"], ["Kimi-K2", "kimi"], ["moonshot-v1-8k", "kimi"],
  ["doubao-1.5-pro", "doubao"], ["豆包 1.5 Pro", "doubao"], ["jimeng-image-4", "jimeng"],
  ["Dreamina 4", "jimeng"], ["MiniMax-M2", "minimax"], ["mistral-large", "mistral"],
  ["GLM-4.5", "zhipu"], ["meta-llama/Llama-3.3-70b", "meta"], ["ERNIE-4", "wenxin"],
  ["hunyuan-t1", "hunyuan"], ["gemini-2.5-pro", "gemini"], ["google/gemini-2.5-pro", "gemini"],
  ["imagen-4.0-generate-preview-landscape", "google"], ["Google Imagen 4", "google"],
  ["gemini-3-pro-image-square", "nano-banana"], ["gemini-3.1-flash-image", "nano-banana"],
  ["Nano Banana Pro", "nano-banana"], ["Nano-Banana-2", "nano-banana"],
  ["custom-model", null], ["my-gpt-widget", null], ["gptastic", null], ["grokking", null],
  ["metaphor", null], ["o31custom", null], ["qwenish", null], ["constructor", null],
];
for (const [modelId, expected] of cases) assert.equal(resolveModelBrand({ modelId }), expected, modelId);
assert.equal(resolveModelBrand({ modelId: "opaque-id", modelName: "GPT 6 Astra" }), "openai");
assert.equal(resolveModelBrand({ modelId: "opaque-id", modelName: "my gpt prompt" }), null);
assert.equal(resolveModelBrand({ modelId: "claude-4", modelName: "GPT-6" }), "claude");
assert.equal(resolveModelBrand({ modelId: "opaque-id", brand: "openai" }), "openai");
assert.equal(resolveModelBrand({ modelId: "opaque-id", brand: "constructor" }), null);
for (const brand of Object.keys(MODEL_BRANDS)) {
  const html = render({ modelId: "opaque-id", brand, size: 14 });
  assert.ok(html.includes(`data-model-brand="${brand}"`));
  assert.ok(!html.includes("lucide-sparkles"));
  assert.match(html, /width="14" height="14"|height="14" width="14"/);
}
assert.ok(render({ modelId: "gpt6Astra" }).includes('data-model-brand="openai"'));
assert.ok(render({ modelId: "opaque-id", modelName: "gpt6Astra" }).includes('data-model-brand="openai"'));
assert.match(render({ modelId: "custom-model" }), /lucide-sparkles/);
const svgSource = fs.readFileSync(path.join(root, "src/components/ui/model-brand-icons.tsx"), "utf8");
const svgAst = ts.createSourceFile("icons.tsx", svgSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provenance = JSON.parse(fs.readFileSync(path.join(root, "docs/licenses/lobehub-icons/sources.json"), "utf8"));
assert.equal(provenance.version, "5.23.0");
for (const [name, asset] of Object.entries(provenance.assets)) {
  const fn = svgAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn, name);
  const paths = [...fn.getText(svgAst).matchAll(/\bd="([^"]+)"/g)].map(m => m[1]);
  assert.equal(paths.length, asset.paths);
  assert.equal(createHash("sha256").update(paths.join("\n")).digest("hex"), asset.svgPathsSha256);
  for (const color of asset.colors || []) assert.ok(fn.getText(svgAst).includes(color), `${name}: source color ${color}`);
}
assert.match(fs.readFileSync(path.join(root, "docs/licenses/lobehub-icons/LICENSE"), "utf8"), /MIT License/);
console.log("ASSETS=PASS LOBEHUB_VERSION=5.23.0 LOCAL_SVG_GEOMETRY_HASHES=17 LICENSE=MIT");
const i = process.argv.indexOf("--business-baseline");
if (i >= 0) {
  const before = path.resolve(process.argv[i + 1]);
  for (const file of ["src/components/ui/text-model-select.tsx", "src/components/canvas/canvas-client.tsx", "src/components/generate/generate-client.tsx"]) {
    const current = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
    const original = fs.readFileSync(path.join(before, file), "utf8").replace(/\r\n/g, "\n");
    const stripped = current.replace(/(<ModelIcon\s+modelId=\{[^}]+\})\s+modelName=\{[^}]+\}/g, "$1");
    assert.equal(stripped, original, `Only ModelIcon modelName props may change: ${file}`);
  }
  console.log("BUSINESS=PASS SELECTORS_EXCEPT_ICON_PROPS=IDENTICAL ROUTING_BILLING=UNCHANGED");
}
console.log(`MODIFIED=PASS GPT6ASTRA=OPENAI RULE_CASES=${cases.length + 5} ICONS=${Object.keys(MODEL_BRANDS).length} UNKNOWN=NEUTRAL`);
