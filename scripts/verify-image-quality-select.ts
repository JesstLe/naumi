import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { qualityMenuPosition, nextQualityOption } from "../src/components/ui/image-quality-select-layout";

const root = path.resolve(process.argv[2] || ".");
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");
const control = read("src/components/image-quality-control.tsx");
// Business contracts are identical before and after the presentation-only fix.
assert.match(control, /pathname === "\/canvas" \? CANVAS_QUALITIES : IMAGE_QUALITY_IDS/);
assert.match(control, /filter\(id => allowedQualities.includes\(id\)\)/);
assert.match(control, /catalog\?\.features\[feature\]\?\.prices\[id\]\?\.\[resolution\]/);
assert.match(control, /value \|\| quality/);
assert.match(control, /nativeHint/);
if (process.argv.includes("--baseline")) {
  assert.match(control, /<select/);
  assert.match(control, /setQuality\(event.target.value\)/);
  console.log("QUALITY_SELECT_BASELINE=PASS NATIVE_MENU=REPRODUCED PRICES_CAPABILITIES=UNCHANGED");
} else {
  assert.doesNotMatch(control, /<select|<option/);
  assert.match(control, /<ImageQualitySelect/);
  assert.match(control, /onChange=\{setQuality\}/);
  const menu = read("src/components/ui/image-quality-select.tsx");
  for (const token of ['role="combobox"', 'role="listbox"', 'role="option"', "aria-disabled", "aria-activedescendant", "canvas-ui-surface-solid", "canvas-ui-control", "canvas-ui-light", "canvas-ui-dark", "createPortal", "ArrowDown", "ArrowUp", '"Home"', '"End"', '"Escape"', '"Tab"', "onBlur={close}", "onPointerDown", "option.disabled || disabled", "data-canvas-hotkeys-blocked", "scrollIntoView", "window.removeEventListener"]) assert.ok(menu.includes(token), token);
  const options = [{ disabled: true }, {}, { disabled: true }, {}, { disabled: true }];
  assert.equal(nextQualityOption(options, -1, 1), 1);
  assert.equal(nextQualityOption(options, 1, 1), 3);
  assert.equal(nextQualityOption(options, 3, 1), 1);
  assert.equal(nextQualityOption(options, 1, -1), 3);
  assert.equal(nextQualityOption(options, 0, -1), 3);
  assert.equal(nextQualityOption([{ disabled: true }], 0, 1), -1);
  assert.equal(nextQualityOption([], -1, 1), -1);
  assert.equal(qualityMenuPosition({ left: 20, top: 20, bottom: 56, width: 160 }, 1440, 900, 3).maxHeight, 118);
  for (const [w, h] of [[1440, 900], [390, 844], [320, 220], [390, 120]]) {
    for (const rect of [{ left: 20, top: 20, bottom: 56, width: 160 }, { left: w - 170, top: h - 60, bottom: h - 24, width: 160 }, { left: -20, top: h / 2 - 18, bottom: h / 2 + 18, width: w + 200 }]) {
      const position = qualityMenuPosition(rect, w, h, 5);
      assert.ok(position.left >= 8 && position.left + position.width <= w - 8);
      assert.ok(position.top >= 8 && position.top + position.maxHeight <= h - 8);
      assert.ok(position.maxHeight >= 0 && position.maxHeight <= 320);
    }
  }
  console.log("QUALITY_SELECT_MODIFIED=PASS CUSTOM_MENU=THEME_MATCHED PORTAL=1 KEYBOARD_DISABLED=PASS VIEWPORT_CASES=12 PRICES_CAPABILITIES=UNCHANGED");
}
