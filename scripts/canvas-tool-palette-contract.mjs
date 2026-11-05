#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientPath = process.env.CANVAS_CLIENT_PATH || path.join(root, "src/components/canvas/canvas-client.tsx");
const globalsPath = process.env.CANVAS_GLOBALS_PATH || path.join(root, "src/app/globals.css");
const dictPath = process.env.CANVAS_DICT_PATH || path.join(root, "src/lib/i18n/dict.ts");
const client = readFileSync(clientPath, "utf8");
const modular=client.includes('from "./use-canvas-view-controls"');
const owner=file=>readFileSync(path.join(root,file),"utf8");
const tools=modular?owner('src/components/canvas/tool-buttons.tsx'):client;
const view=modular?owner('src/components/canvas/view-toolbar.tsx'):client;
const viewOwner=modular?owner('src/components/canvas/use-canvas-view-controls.ts'):client;
const keyboard=modular?owner('src/lib/canvas/keyboard-command.ts'):client;
const toolTypes=modular?owner('src/lib/canvas/view-controls.ts'):client;
const renderers=client.includes('from "./nodes/registry"')?
  ['artwork-node.tsx','text-node.tsx','pending-node.tsx'].map(file=>readFileSync(path.join(path.dirname(clientPath),'nodes',file),'utf8')).join('\n'):client;
const globals = readFileSync(globalsPath, "utf8");
const dict = readFileSync(dictPath, "utf8");

const checks = [
  [/type CanvasPrimaryTool\s*=\s*"move"\s*\|\s*"marquee"\s*\|\s*"hand"/.test(toolTypes), "three primary canvas tools are declared"],
  [client.includes('data-testid="canvas-main-toolbar"') && client.includes('bottom-[76px] left-1/2') && client.includes('min-[800px]:bottom-5'), "main toolbar stays centered at the bottom"],
  [["move", "marquee", "hand"].every(tool => tools.includes(`data-tool="${tool}"`)) && client.includes('dataTool="more"'), "primary tools and settings remain reachable"],
  [["text", "image-node", "upload", "history"].every(tool => client.includes(`data-tool="${tool}"`)) && client.includes('menuTestId="canvas-create-menu"'), "frequent creation shortcuts stay visible alongside the shared node creation menu"],
  [client.includes('data-tool="undo"') && client.includes('data-tool="redo"') && client.includes('onClick={() => void doUndo()}') && client.includes('onClick={() => void doRedo()}'), "visible undo and redo controls use existing history operations"],
  [!client.includes('data-tool="generate"') && !client.includes('data-tool="link"'), "focus-only and hint-only buttons no longer imply real generation or connection tools"],
  [client.includes('nodesDraggable={!readOnly && canvasTool !== "hand"}') && client.includes('canvas-hand-tool'), "hand tool switches the canvas into pan mode"],
  [["v","m","h"].every(key=>new RegExp(`key\\s*===\\s*"${key}"`).test(keyboard)), "V M H tool shortcuts are wired"],
  [viewOwner.includes('setShowMinimap') && viewOwner.includes('setSnapGrid') && (modular?client.includes('onTidy={tidyLayout}')&&view.includes('onClick={onTidy}'):client.includes('onClick={tidyLayout}')), "view toolbar retains working canvas utilities"],
  [client.includes('canvasSize.width < 800 ? 128 : 84') && client.includes('bottom: canvasSize.width > 0 && canvasSize.width < 1000 ? 76 : 20'), "docks, minimap, and batch bars reserve the bottom toolbar safe area"],
  [client.includes('triggerClassName="flex h-7 w-7 flex-none') && client.includes('hover:bg-primary/90 sm:h-9 sm:w-9') && !client.includes('sm:h-12 sm:w-12'), "add and regular palette controls share the same responsive container size"],
  [renderers.includes('ring-2 ring-[#315fc8] ring-offset-2') && renderers.includes('color="#315fc8"'), "image and text selection use the crisp blue workbench treatment"],
  [globals.includes('stroke-width: 4;') && globals.includes('stroke-width: 5;'), "canvas connections remain clearly visible in normal and selected states"],
  [globals.includes('.canvas-hand-tool .react-flow__pane') && globals.includes('cursor: grab'), "hand cursor styling is present"],
  [dict.includes('toolPalette: "画布工具栏"') && dict.includes('toolPalette: "Canvas tools"'), "Chinese and English labels are present"],
];

try {
  for (const [ok, message] of checks) assert.ok(ok, message);
  console.log(`CANVAS_TOOL_PALETTE_RESULT=PASS checks=${checks.length}`);
} catch (error) {
  console.error(`CANVAS_TOOL_PALETTE_RESULT=FAIL reason=${error.message}`);
  process.exitCode = 1;
}
