import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile("src/components/canvas/canvas-client.tsx", "utf8");
const css = await readFile("src/app/globals.css", "utf8");
const boundary = await readFile("src/components/canvas/canvas-error-boundary.tsx", "utf8");

const checks = [
  [client.includes('"canvas-stage relative'), "canvas stage owns theme variables"],
  [client.includes('data-testid="canvas-project-chrome"') && client.includes('canvas-ui-surface flex max-w-full'), "project chrome uses themed surface"],
  [client.includes('data-testid="canvas-main-toolbar"') && client.includes('data-testid="canvas-view-toolbar"'), "main and view toolbars expose themed acceptance hooks"],
  [client.includes('data-testid="text-node-card"') && client.includes('canvas-ui-node-card relative min-h-0'), "text cards use themed node surface"],
  [client.includes('data-testid="image-node-dock"') && client.includes('data-testid="pending-node-dock"'), "image and pending docks expose themed acceptance hooks"],
  [client.includes('light={lightCanvas}') && client.includes('canvas-ui-light" : "canvas-ui-dark'), "portal selects receive the canvas theme"],
  [client.includes('maskColor={lightCanvas ? "rgba(91,103,120,0.16)"'), "minimap mask adapts to light canvas"],
  [css.includes('--canvas-ui-panel: rgba(255, 255, 255, .96)') && css.includes('.canvas-ui-surface'), "shared light canvas tokens and surfaces exist"],
  [css.includes('.canvas-light .react-flow__minimap'), "minimap shell has a light treatment"],
  [boundary.includes('localStorage.getItem("nv:canvas:bg") !== "dark"') && boundary.includes('bg-[#f5f6f8]'), "canvas error fallback follows the stored background"],
];

for (const [ok, label] of checks) {
  assert(ok, label);
  console.log(`PASS ${label}`);
}

const unconditionalDarkSurface = /className="[^"]*(?:bg-\[#191b21\]|bg-\[#1f2229\])[^"]*"/g;
const remaining = client.match(unconditionalDarkSurface) ?? [];
assert.equal(remaining.length, 0, `unconditional dark canvas surfaces remain: ${remaining.join(" | ")}`);
console.log("PASS no unconditional fixed-dark canvas surface remains");
console.log(`MODIFIED_RESULT=PASS checks=${checks.length + 1}`);
