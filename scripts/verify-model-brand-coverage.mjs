import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(process.argv[2] || "."), require = createRequire(import.meta.url);
function compile(file) {
  const code = buildSync({ entryPoints: [path.join(root, file)], bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"),
    alias: { "@/lib/model-brand": path.join(root, "src/lib/model-brand.ts") },
    external: ["react", "react/jsx-runtime", "lucide-react"] }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(require, mod, mod.exports);
  return mod.exports;
}
const { resolveModelBrand, MODEL_BRANDS } = compile("src/lib/model-brand.ts");
const { ModelIcon } = compile("src/components/ui/model-icon.tsx");
const render = props => renderToStaticMarkup(React.createElement(ModelIcon, props));
const missing = ["seedream-5.0-flash", "seedance-2.0", "flux-1-dev", "sdxl", "ideogram-v3", "recraft-v3", "sora-2", "kling-v2.1", "hailuo-02", "wan-2.2", "pixverse-v5", "runway-gen4", "step-3", "yi-large", "internlm3", "command-r-plus", "midjourney-v7"];
if (process.argv.includes("--baseline")) {
  for (const modelId of missing) {
    assert.equal(resolveModelBrand({ modelId }), null, modelId);
    assert.match(render({ modelId }), /lucide-sparkles/, modelId);
  }
  console.log("BASELINE=PASS MISSING_FAMILIES=17 REGISTERED=17 FALLBACK=NEUTRAL");
  process.exit(0);
}
const groups = {
  bytedance: ["seedream-5.0-flash", "Seedream 4", "doubao-seedream-4-0", "seedance-2.0", "Seedance2.0", "字节跳动", "ByteDance"],
  flux: ["flux-1-dev", "FLUX.1-schnell", "black-forest-labs/FLUX.1-dev", "BFL"],
  stability: ["sdxl", "SD3.5", "sd-3.5", "Stable Diffusion 3.5", "stable-diffusion-xl", "Stability AI"],
  ideogram: ["ideogram-v3", "Ideogram 3"], recraft: ["recraft-v3", "Recraft V3"],
  sora: ["sora-2", "OpenAI/sora-2", "Sora 2"], kling: ["kling-v2.1", "Kling AI", "可灵 2.1", "快手可灵"],
  hailuo: ["hailuo-02", "minimax-hailuo-02", "海螺 02"], alibaba: ["wan-2.2", "Wan2.2", "wanx2.1", "Wan Video", "万相2.2", "通义万相", "Alibaba", "aliyun/wan-2.2"],
  pixverse: ["pixverse-v5", "PixVerse 5", "爱诗"], runway: ["runway-gen4", "gen-3-alpha", "Gen4 Turbo"],
  stepfun: ["step-3", "Stepfun", "阶跃星辰"], yi: ["yi-large", "01.ai", "零一万物"],
  internlm: ["internlm3", "InternLM-2.5", "书生"], cohere: ["command-r-plus", "command-a", "Cohere"],
  midjourney: ["midjourney-v7", "MJ 7"],
};
let checks = 0;
for (const [brand, ids] of Object.entries(groups)) for (const modelId of ids) {
  assert.equal(resolveModelBrand({ modelId }), brand, modelId);
  assert.ok(render({ modelId }).includes(`data-model-brand="${brand}"`));
  assert.equal(resolveModelBrand({ modelId: "opaque-id", modelName: modelId }), brand, modelId);
  checks += 2;
}
for (const modelId of ["fluxible", "sorandom", "waning", "stepwise", "yihao", "recrafting", "runwayish", "ideogrammatic", "generation-3", "mjolnir", "sd3custom"]) {
  assert.equal(resolveModelBrand({ modelId }), null, modelId);
  checks++;
}
const provenance = JSON.parse(fs.readFileSync(path.join(root, "docs/licenses/lobehub-icons/sources.json"), "utf8"));
const registry = fs.readFileSync(path.join(root, "src/components/ui/model-icon.tsx"), "utf8");
assert.equal(Object.keys(MODEL_BRANDS).length, 33);
let colored = 0;
for (const [name, asset] of Object.entries(provenance.assets)) {
  assert.ok(registry.includes(name), `Unregistered ${name}`);
  if (asset.file.endsWith("/Color.js")) colored++;
  for (const color of asset.colors || []) {
    const brand = Object.keys(MODEL_BRANDS).find(key => new RegExp(`${key}: ${name}\\b`).test(registry));
    assert.ok(brand, name);
    assert.ok(render({ modelId: "opaque-id", brand }).includes(color), `${name} ${color}`);
  }
}
assert.equal(colored, 25);
const combined = renderToStaticMarkup(React.createElement("div", null,
  Object.keys(MODEL_BRANDS).flatMap(brand => [0, 1].map(i => React.createElement(ModelIcon, { key: `${brand}-${i}`, modelId: "opaque-id", brand })))));
const ids = [...combined.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const [, id] of combined.matchAll(/url\(#([^\)]+)\)/g)) assert.ok(ids.includes(id));
const i = process.argv.indexOf("--business-baseline");
if (i >= 0) {
  const baseline = path.resolve(process.argv[i + 1]);
  for (const file of ["src/components/ui/text-model-select.tsx", "src/components/canvas/canvas-client.tsx", "src/components/generate/generate-client.tsx"]) {
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), fs.readFileSync(path.join(baseline, file), "utf8"), file);
  }
  console.log("BUSINESS=PASS SELECTORS_ROUTING_BILLING=UNCHANGED");
}
console.log(`MODIFIED=PASS IDENTITIES=33 COLOR=25 MONO=8 COVERAGE_CHECKS=${checks} GRADIENT_IDS=UNIQUE SEED=BYTEDANCE WAN=ALIBABA`);
