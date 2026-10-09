#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientPath = process.env.CANVAS_CLIENT_PATH || path.join(root, "src/components/canvas/canvas-client.tsx");
const globalsPath = process.env.CANVAS_GLOBALS_PATH || path.join(root, "src/app/globals.css");
const dictPath = process.env.CANVAS_DICT_PATH || path.join(root, "src/lib/i18n/dict.ts");
const client = readFileSync(clientPath, "utf8");
const globals = readFileSync(globalsPath, "utf8");
const dict = readFileSync(dictPath, "utf8");

const checks = [
  [client.includes('type CanvasPrimaryTool = "move" | "marquee" | "hand"'), "three primary canvas tools are declared"],
  [client.includes('data-testid="canvas-main-toolbar"') && client.includes('bottom-[76px] left-1/2') && client.includes('min-[800px]:bottom-5'), "main toolbar stays centered at the bottom"],
  [["move", "marquee", "hand"].every(tool => client.includes(`data-tool="${tool}"`)) && client.includes('dataTool="more"'), "primary tools and settings remain reachable"],
  [["text", "image-node", "upload", "history"].every(tool => client.includes(`data-tool="${tool}"`) && client.includes(`id: "${tool}"`)) && client.includes('menuTestId="canvas-create-menu"'), "frequent creation actions stay visible alongside the complete creation menu"],
  [client.includes('data-tool="undo"') && client.includes('data-tool="redo"') && client.includes('onClick={() => void doUndo()}') && client.includes('onClick={() => void doRedo()}'), "visible undo and redo controls use existing history operations"],
  [!client.includes('data-tool="generate"') && !client.includes('data-tool="link"'), "focus-only and hint-only buttons no longer imply real generation or connection tools"],
  [client.includes('nodesDraggable={!readOnly && canvasTool !== "hand"}') && client.includes('canvas-hand-tool'), "hand tool switches the canvas into pan mode"],
  [client.includes('key === "v"') && client.includes('key === "m"') && client.includes('key === "h"'), "V M H tool shortcuts are wired"],
  [client.includes('setShowMinimap') && client.includes('setSnapGrid') && client.includes('onClick={tidyLayout}'), "view toolbar retains working canvas utilities"],
  [client.includes('canvasSize.width < 800 ? 128 : 84') && client.includes('min-[800px]:bottom-[84px]'), "docks, minimap, and batch bars reserve the bottom toolbar safe area"],
  [client.includes('triggerClassName="flex h-7 w-7 flex-none') && client.includes('hover:bg-primary/90 sm:h-9 sm:w-9') && !client.includes('sm:h-12 sm:w-12'), "add and regular palette controls share the same responsive container size"],
  [client.includes('ring-2 ring-[#315fc8] ring-offset-2') && client.includes('color="#315fc8"'), "image and text selection use the crisp blue workbench treatment"],
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
