import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const client = await readFile(
  path.join(root, "src/components/canvas/canvas-client.tsx"),
  "utf8"
);
const clipboardFiles = await readFile(
  path.join(root, "src/lib/canvas/clipboard-files.ts"),
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
assert.match(client, /panOnDrag=\{canvasTool === "hand" \? \[0, 1\] : \[1\]\}/);
assert.match(client, /selectionOnDrag=\{canvasTool !== "hand"\}/);
assert.match(client, /selectionKeyCode=\{canvasTool === "hand" \? null : "Shift"\}/);
assert.match(client, /elementsSelectable=\{canvasTool !== "hand"\}/);
assert.match(client, /panOnScroll/);
pass("V/M select on blank drag; H, Space, middle-button drag and two-finger scroll pan");

assert.match(client, /const canvasShortcutLayerOpen = Boolean\(/);
assert.match(client, /const CANVAS_MODAL_SELECTOR = '\.fixed\.inset-0, \[data-canvas-hotkeys-blocked="true"\]\[aria-modal="true"\]'/);
assert.match(client, /document\.querySelector\(CANVAS_MODAL_SELECTOR\)/);
assert.match(client, /e\.defaultPrevented \|\|\s*e\.isComposing \|\|/);
assert.match(client, /el\?\.closest\('\[data-canvas-hotkeys-blocked="true"\], \[data-canvas-hotkeys-scope="assistant"\]'\)/);
pass("canvas shortcuts yield to modal, overlay, menu, and editing layers");

assert.match(client, /e\.shiftKey &&\s*!mod &&\s*!e\.altKey &&\s*e\.code === "KeyT"/);
pass("Shift+T does not swallow Ctrl, Command, or Alt browser shortcuts");

for (const contract of [
  /if \(mod && key === "c"\)/,
  /function handleCanvasPaste\(event: ClipboardEvent\)/,
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

assert.doesNotMatch(client, /key === "v" && hasClip/);
assert.match(client, /window\.addEventListener\("paste", onPaste\)/);
assert.match(client, /function handleCanvasPaste\(event: ClipboardEvent\) \{[\s\S]*?!ready \|\|\s*!user \|\|/);
assert.match(client, /const canvasCopyIntentRef = useRef<string \| null>\(null\)/);
assert.match(client, /const intendedNodeId = canvasCopyIntentRef\.current;\s*canvasCopyIntentRef\.current = null;/);
assert.match(client, /const nativeSelection = window\.getSelection\(\);\s*if \(!selected \|\| \(nativeSelection && !nativeSelection\.isCollapsed\)\) return;/);
assert.match(client, /import \{ clipboardImageFiles \} from "@\/lib\/canvas\/clipboard-files"/);
assert.match(client, /const files = clipboardImageFiles\(data\);\s*if \(files\.length\)/);
assert.match(clipboardFiles, /item\.kind === "file"/);
assert.match(clipboardFiles, /CANVAS_IMAGE_FILE_PATTERN\.test\(file\.name\)/);
assert.match(client, /canvasShortcutLayerOpen \|\|\s*document\.querySelector\(CANVAS_MODAL_SELECTOR\)/);
assert.match(client, /if \(isEditableClipboardTarget\(event\.target\)\) return;/);
assert.match(client, /const nodeId = canvasNodeIdFromClipboard\(data\);/);
assert.match(client, /const copied = nodeClipRef\.current;\s*if \(!copied\) return;\s*if \(nodeId !== copied\.id\) return;/);
pass("copy intent stays one-shot while paste routing yields to editors and portal layers");

assert.match(dict, /\{mod\}C 复制节点/);
assert.match(dict, /\{mod\}C copy/);
assert.match(client, /<CanvasHelpDialog isMac=\{isMac\} english=\{locale === "en"\}/);
pass("Chinese and English help dialog receives the detected keyboard platform");

assert.doesNotMatch(client, /hk="⌘[CVZ]/);
assert.match(client, /hk=\{isMac \? "⌫" : "Del"\}/);
assert.match(client, /hk=\{isMac \? "⇧⌘Z" : "CtrlY"\}/);
pass("menus no longer expose mac-only shortcut labels on Windows");

assert.match(client, /onEdgeClick=\{/);
assert.match(client, /const selected = new Set\(current\.filter\(edge => edge\.selected\)/);
assert.match(client, /if \(!browsing\) e\.preventDefault\(\);\s*if \(readOnly \|\| e\.repeat\) return;\s*if \(selectedEdge\)/);
assert.match(client, /productIds: from\.productIds\?\.filter/);
assert.match(client, /cuttingEdgesRef\.current\.has\(edge\.id\)/);
assert.match(client, /selectable: !p\.generating && !p\.uploading/);
pass("edge selection persists, owns Delete, removes product bindings and protects active jobs");

console.log(`CANVAS_DESKTOP_INPUT_RESULT=PASS checks=${checks.length}`);
