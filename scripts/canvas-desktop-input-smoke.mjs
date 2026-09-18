import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = await readFile(
  path.join(root, "src/components/canvas/canvas-client.tsx"),
  "utf8"
);
const dict = await readFile(path.join(root, "src/lib/i18n/dict.ts"), "utf8");

const checks = [];
function pass(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}

assert.match(client, /type DesktopPlatform = "mac" \| "windows" \| "other"/);
assert.match(client, /\/Mac\|iPhone\|iPad\|iPod\/i/);
assert.match(client, /\/Win\/i/);
assert.match(client, /const modifierKey = isMac \? "⌘" : "Ctrl"/);
pass("platform detection selects macOS Command or Windows Control labels");

assert.match(client, /zoomActivationKeyCode=\{\["Control", "Meta"\]\}/);
assert.match(client, /if \(e\.ctrlKey \|\| e\.metaKey\) e\.preventDefault\(\)/);
assert.match(client, /zoomOnPinch/);
pass("Control wheel, Command wheel, and trackpad pinch stay inside the canvas");

assert.match(client, /panActivationKeyCode="Space"/);
assert.match(client, /panOnDrag=\{boxSelectMode \? \[1\] : \[0, 1\]\}/);
assert.match(client, /panOnScroll/);
pass("space drag, mouse drag, middle-button drag, and two-finger pan are enabled");

for (const contract of [
  /key === "c" && selected/,
  /key === "v" && hasClip/,
  /key === "z"/,
  /key === "y"/,
  /\["\+", "=", "add"\]\.includes\(key\)/,
  /\["-", "_", "subtract"\]\.includes\(key\)/,
  /key === "0"/,
  /e\.key === "Delete" \|\| e\.key === "Backspace"/,
]) {
  assert.match(client, contract);
}
pass("copy, paste, undo, redo, zoom, fit, and delete shortcuts cover both systems");

assert.match(dict, /\{mod\}C 复制节点/);
assert.match(dict, /\{mod\}C copy/);
assert.match(client, /fmt\(t\("canvas\.help1"\), \{ mod: modifierKey \}\)/);
assert.match(client, /fmt\(t\("canvas\.help6"\), \{ mod: modifierKey \}\)/);
pass("Chinese and English help text receives the detected modifier key");

assert.doesNotMatch(client, /hk="⌘[CVZ]/);
assert.match(client, /hk=\{isMac \? "⌘⌫" : "Del"\}/);
assert.match(client, /hk=\{isMac \? "⇧⌘Z" : "CtrlY"\}/);
pass("menus no longer expose mac-only shortcut labels on Windows");

console.log(`CANVAS_DESKTOP_INPUT_RESULT=PASS checks=${checks.length}`);
