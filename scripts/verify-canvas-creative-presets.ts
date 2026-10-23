/** Run with: npx tsx scripts/verify-canvas-creative-presets.ts (local only). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { appendCreativePreset, CREATIVE_PRESET_CATEGORIES, CREATIVE_PRESETS, filterCreativePresets, type CreativePreset } from "../src/lib/canvas/creative-presets";

const root = path.resolve(process.argv[2] || ".");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const helperSource = read("src/lib/canvas/creative-presets.ts");
const component = read("src/components/canvas/creative-presets.tsx");
const css = read("src/components/canvas/creative-presets.module.css");

assert.deepEqual(CREATIVE_PRESET_CATEGORIES.map(item => [item.id, item.label]), [["color", "配色"], ["style", "风格"], ["camera", "镜头"]]);
assert.equal(CREATIVE_PRESETS.length, 26);
assert.deepEqual(Object.fromEntries(CREATIVE_PRESET_CATEGORIES.map(category => [category.id, CREATIVE_PRESETS.filter(item => item.category === category.id).length])), { color: 10, style: 8, camera: 8 });
assert.equal(new Set(CREATIVE_PRESETS.map(item => item.id)).size, CREATIVE_PRESETS.length);
assert.equal(new Set(CREATIVE_PRESETS.map(item => item.label)).size, CREATIVE_PRESETS.length);
assert.equal(new Set(CREATIVE_PRESETS.map(item => item.promptFragment)).size, CREATIVE_PRESETS.length);

const metadataBefore = JSON.stringify(CREATIVE_PRESETS);
for (const preset of CREATIVE_PRESETS) {
  assert.deepEqual(Object.keys(preset).sort(), ["category", "description", "id", "label", "promptFragment", "swatches", "tags"]);
  assert.match(preset.id, new RegExp(`^${preset.category}-[a-z-]+$`));
  assert.ok(CREATIVE_PRESET_CATEGORIES.some(category => category.id === preset.category));
  assert.ok(preset.label.length >= 2 && preset.label.length <= 8);
  assert.ok(preset.description.length <= 16);
  assert.match(preset.promptFragment, /[\u3400-\u9fff]/u);
  assert.ok([...preset.promptFragment].length >= 12 && [...preset.promptFragment].length <= 64);
  assert.equal(preset.promptFragment, preset.promptFragment.trim());
  assert.doesNotMatch(preset.promptFragment, /[\r\n]|https?:|即梦|jimeng|dreamina/iu);
  assert.equal(preset.swatches.length, 4);
  for (const swatch of preset.swatches) assert.match(swatch, /^#[\da-f]{6}$/iu);
  assert.ok(preset.tags.length >= 2);
  for (const tag of preset.tags) assert.ok(tag.length > 0);
  for (const key of Object.keys(preset)) assert.doesNotMatch(key, /model|price|billing|ratio|resolution|count|quality|width|height|seed|provider|endpoint|request|operation/iu);
}

const original = "  一只白色陶瓷杯，保留蓝色标志与杯柄；背景保持原样。\r\n不要文字。  ";
for (const preset of CREATIVE_PRESETS) {
  const appended = appendCreativePreset(original, preset);
  assert.equal(appended.slice(0, original.length), original, `${preset.id}: old intent is an exact prefix`);
  assert.equal(appended, `${original}\n${preset.promptFragment}`);
  assert.equal(appendCreativePreset(appended, preset), appended, `${preset.id}: repeated Apply is a no-op`);
  assert.equal(appendCreativePreset(appended, { ...preset, id: "same-fragment-other-id" }), appended);
  for (const existing of [preset.promptFragment, `${preset.promptFragment}\n原始主体保持不变`, `原始主体保持不变\n${preset.promptFragment}\n不要文字`, `原始主体保持不变； ${preset.promptFragment}。`]) {
    assert.equal(appendCreativePreset(existing, preset), existing, `${preset.id}: an existing whole fragment must not duplicate`);
  }
  assert.equal(appendCreativePreset("", preset), preset.promptFragment);
}
assert.equal(JSON.stringify(CREATIVE_PRESETS), metadataBefore, "append/search must not mutate metadata");

for (const empty of ["", " ", "\n\t\r\n", "。", "！！"])
  assert.equal(appendCreativePreset(original, empty), original);
assert.equal(appendCreativePreset("主体\n", "  柔和自然光  "), "主体\n柔和自然光");
assert.equal(appendCreativePreset("主体\r\n", "柔和自然光"), "主体\r\n柔和自然光");
assert.equal(appendCreativePreset("主体\r", "柔和自然光"), "主体\r柔和自然光");
assert.equal(appendCreativePreset("主体  ", "柔和自然光"), "主体  \n柔和自然光");
assert.equal(appendCreativePreset("  ", "柔和自然光"), "  \n柔和自然光");
assert.equal(appendCreativePreset("Soft Lighting", "soft lighting"), "Soft Lighting");
assert.equal(appendCreativePreset("Keep the cup. Soft lighting. Preserve the logo.", "soft lighting"), "Keep the cup. Soft lighting. Preserve the logo.");
assert.equal(appendCreativePreset("主体\nＳｏｆｔ　Ｌｉｇｈｔｉｎｇ。", "soft   lighting"), "主体\nＳｏｆｔ　Ｌｉｇｈｔｉｎｇ。");
assert.equal(appendCreativePreset("soft lighting", "soft"), "soft lighting\nsoft", "do not suppress a distinct shorter fragment");
assert.equal(appendCreativePreset("soft", "soft lighting"), "soft\nsoft lighting", "do not suppress a distinct longer fragment");
assert.equal(appendCreativePreset("请勿使用近景取景", "近景取景"), "请勿使用近景取景\n近景取景", "substring overlap must not silently discard a new fragment");
for (const fragment of ["Soft light. Fine grain.", "柔光；保留纹理", "柔光\n保留纹理", "微距 (细节) + 颗粒 [轻微]", "a.* + b? $c^ | d\\e"]) {
  const added = appendCreativePreset(original, fragment);
  assert.equal(appendCreativePreset(added, fragment), added, "multi-clause / regex punctuation fragments remain idempotent");
}
const longPrompt = `${"保留原主体与构图。".repeat(4000)}\r\n  `;
const longApplied = appendCreativePreset(longPrompt, CREATIVE_PRESETS[0]);
assert.equal(longApplied, `${longPrompt}\n${CREATIVE_PRESETS[0].promptFragment}`, "no silent limit or truncation");

let composed = original;
const threeCategories: CreativePreset[] = [CREATIVE_PRESETS[0], CREATIVE_PRESETS[10], CREATIVE_PRESETS[18]];
for (const preset of threeCategories) composed = appendCreativePreset(composed, preset);
assert.equal(composed, `${original}\n${threeCategories.map(item => item.promptFragment).join("\n")}`);
for (const preset of threeCategories) assert.equal(appendCreativePreset(composed, preset), composed);

const generation = Object.freeze({ prompt: original, model: "keep-model", price: 8, ratio: "3:4", resolution: "2K", count: 2, quality: "high", seed: 29 });
const next = { ...generation, prompt: appendCreativePreset(generation.prompt, CREATIVE_PRESETS[0]) };
const { prompt: oldPrompt, ...beforeFields } = generation;
const { prompt: newPrompt, ...afterFields } = next;
assert.equal(oldPrompt, original);
assert.equal(newPrompt, appendCreativePreset(original, CREATIVE_PRESETS[0]));
assert.deepEqual(afterFields, beforeFields, "the only changed field is prompt");
assert.equal(generation.prompt, original, "the caller's old object is unchanged");

assert.equal(filterCreativePresets("color").length, 10);
assert.deepEqual(filterCreativePresets("camera", "微距").map(item => item.id), ["camera-detail"]);
assert.deepEqual(filterCreativePresets("color", "　蓝色　清新　").map(item => item.id), ["color-mist-blue"]);
assert.ok(filterCreativePresets("style", "摄影").length >= 3);
assert.equal(filterCreativePresets("style", "不存在的预设词").length, 0);
for (const category of CREATIVE_PRESET_CATEGORIES)
  assert.ok(filterCreativePresets(category.id, " ").every(item => item.category === category.id));
assert.equal(JSON.stringify(CREATIVE_PRESETS), metadataBefore);

// Syntactic checks only; the parent owns module-wide typecheck and browser QA.
for (const [fileName, source] of [["creative-presets.ts", helperSource], ["creative-presets.tsx", component]]) {
  const diagnostics = ts.transpileModule(source, { fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).diagnostics ?? [];
  assert.equal(diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, `${fileName}: valid TS/TSX syntax`);
}
for (const source of [helperSource, component]) {
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/u);
  assert.doesNotMatch(source, /https?:\/\/|\/api\/|localStorage|sessionStorage/u);
  assert.doesNotMatch(source, /\b(?:runGen|onGenerate|generateImage|setModel|setPrice|setRatio|setResolution|setCount)\s*\(/u);
  assert.doesNotMatch(source, /addEventListener\(["']key(?:down|up)["']/u, "no document/window keyboard listener");
}
for (const token of [
  'role="dialog"', 'aria-modal="false"', 'role="tablist"', 'role="tab"', 'role="tabpanel"', 'role="radiogroup"', 'role="radio"',
  'aria-checked={checked}', 'data-canvas-hotkeys-blocked="true"', "event.nativeEvent.isComposing", "event.stopPropagation()",
  'document.addEventListener("pointerdown", dismissOutside, true)', 'document.removeEventListener("pointerdown", dismissOutside, true)',
  'document.addEventListener("focusin", dismissOutside, true)', 'document.removeEventListener("focusin", dismissOutside, true)',
  'event.key === "Escape"', 'trigger.current?.isConnected', 'setSelectedId(preset.id)',
  'disabled={blocked || !selected}', 'close(true); onApply(selected)', 'className={`canvas-ui-light ${styles.panel}`}',
]) assert.ok(component.includes(token), `UI contract: ${token}`);
assert.equal((component.match(/onApply\(selected\)/gu) ?? []).length, 1, "one explicit application path");
assert.doesNotMatch(component, /if\s*\(event\.key === ["']Enter["']\)/u, "Enter in search/cards must not trigger Apply");
assert.doesNotMatch(component, /aria-modal="true"|inert=|document\.body\.style/u, "non-modal, no background lock");
for (const token of ["var(--canvas-ui-panel-solid)", "var(--canvas-ui-text)", "var(--canvas-ui-border)", "prefers-reduced-motion", "grid-template-columns: repeat(3", "grid-auto-rows: max-content", "grid-template-columns: repeat(2", ".swatches", "[aria-checked=\"true\"]"]) assert.ok(css.includes(token), `CSS contract: ${token}`);
assert.doesNotMatch(css, /url\s*\(|@import|prefers-color-scheme:\s*dark/u, "light local artwork only");

console.log("CREATIVE_PRESETS=PASS TOTAL=26 COLOR=10 STYLE=8 CAMERA=8 METADATA_UNIQUE=PASS APPEND_PREFIX=EXACT REAPPLY=IDEMPOTENT OPERATION_FIELDS=UNCHANGED NETWORK_PATHS=0 KEYBOARD=SCOPED");
