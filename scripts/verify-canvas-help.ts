import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasHelpSections, canvasHelpGuides, helpText } from "../src/lib/canvas/help-catalog";

const client = readFileSync("src/components/canvas/canvas-client.tsx", "utf8");
const dialog = readFileSync("src/components/canvas/canvas-help-dialog.tsx", "utf8");
let checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
for (const platform of ["windows", "mac"] as const) {
  const sections = canvasHelpSections(platform);
  const items = sections.flatMap(section => section.shortcuts);
  check(sections.length === 3);
  check(items.length === 18);
  check(new Set(items.map(item => item.id)).size === items.length);
  for (const item of items) {
    check(Boolean(item.label.zh && item.label.en));
    check(item.keys.length > 0 && item.keys.every(combo => combo.length > 0));
    check(!item.keys.flat().includes(platform === "mac" ? "Ctrl" : "⌘"));
  }
  check(items.find(item => item.id === "redo")?.keys[0].join(" ") === (platform === "mac" ? "Shift ⌘ Z" : "Ctrl Y"));
  check(items.find(item => item.id === "add-text")?.keys[0].join(" ") === "Shift T");
  check(items.find(item => item.id === "delete")?.keys[0].join(" ") === (platform === "mac" ? "⌫" : "Delete"));
}
for (const guide of canvasHelpGuides) {
  check(Boolean(helpText(guide.description, true) && helpText(guide.description, false)));
  check(guide.description.zh.length < 45);
}
for (const literal of ['key === "v"', 'key === "m"', 'key === "h"', 'e.code === "KeyT"', 'key === "z"', 'key === "y"', 'key === "0"', 'key === "c"', 'e.key === "Delete"', 'e.key === "Backspace"', 'panActivationKeyCode="Space"', 'selectionKeyCode={canvasTool === "hand" ? null : "Shift"}', 'zoomActivationKeyCode={["Control", "Meta"]}']) check(client.includes(literal));
check(client.includes('<CanvasHelpDialog isMac={isMac} english={locale === "en"}'));
check(!client.includes('t("canvas.help4")'));
for (const literal of ['aria-modal="true"', 'data-canvas-hotkeys-blocked="true"', 'event.key === "Escape"', 'event.key !== "Tab"', 'previous?.isConnected', 'canvas-ui-surface-solid', 'useSurfaceAppearance() ?? "light"', 'surfaceAppearanceClass(appearance)', 'overflow-y-auto', 'role="status"', 'aria-pressed={platform === value}']) check(dialog.includes(literal));
console.log(`CANVAS_HELP_CONTRACT=PASS checks=${checks}`);
