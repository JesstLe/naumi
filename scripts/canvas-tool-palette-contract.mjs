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
  [client.includes('data-testid="canvas-main-toolbar"') && client.includes('left-3 top-[112px]'), "main toolbar is a left-side palette"],
  [["move", "marquee", "hand", "text", "image-node", "upload", "generate", "history", "link", "more"].every(tool => client.includes(`data-tool="${tool}"`)), "primary and creative tools are exposed"],
  [client.includes('nodesDraggable={!readOnly && canvasTool !== "hand"}') && client.includes('canvas-hand-tool'), "hand tool switches the canvas into pan mode"],
  [client.includes('key === "v"') && client.includes('key === "m"') && client.includes('key === "h"'), "V M H tool shortcuts are wired"],
  [client.includes('setShowMinimap') && client.includes('setSnapGrid') && client.includes('tidyLayout();'), "more-tools flyout exposes working canvas utilities"],
  [client.includes('left: readOnly ? 8 : 68') && client.includes('left: readOnly ? 16 : 72'), "docks and minimap reserve the palette safe area"],
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
