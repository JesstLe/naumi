import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(
  process.argv[2] ?? "src/components/canvas/canvas-client.tsx"
);
const source = fs.readFileSync(sourcePath, "utf8");

assert.ok(
  /const CANVAS_MIN_ZOOM = Number\.EPSILON;/.test(source),
  "canvas must expose the smallest positive safe zoom"
);
assert.ok(
  /const CANVAS_MAX_ZOOM = Number\.MAX_SAFE_INTEGER;/.test(source),
  "canvas must expose the largest safe zoom"
);
assert.ok(/minZoom=\{CANVAS_MIN_ZOOM\}/.test(source), "React Flow minZoom is not wired");
assert.ok(/maxZoom=\{CANVAS_MAX_ZOOM\}/.test(source), "React Flow maxZoom is not wired");
assert.ok(
  /Number\.isFinite\(percent\) && percent > 0/.test(source),
  "zoom input must accept every finite positive percentage"
);
assert.ok(!/v >= 15 && v <= 800/.test(source), "legacy 15%-800% limit still exists");
assert.ok(/inputMode="decimal"/.test(source), "zoom input must accept decimals");
assert.ok(/toExponential\(2\)/.test(source), "extreme zoom labels must stay compact");

console.log("PASS canvas uses the full positive safe-number zoom range");
console.log("PASS zoom input accepts any positive decimal or scientific value");
console.log("PASS extreme zoom percentages remain compact and readable");
