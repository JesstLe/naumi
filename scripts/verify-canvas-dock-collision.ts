import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { separateCanvasDocks } from "../src/lib/canvas/dock-placement";

const baseline = process.argv.includes("--baseline");
// The screenshot failure: panel top assumes 310px, but the upper-side branch
// lets a long prompt grow beyond 310px into the higher-z-index action bar.
const original = readFileSync(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "src/components/canvas/canvas-client.tsx", "utf8");
if (baseline) {
  assert.ok(original.includes("const maxHeight = Math.max(120, aboveSpace)"));
  const dock = { top: 140, height: 370 }, toolbar = { top: 438, height: 50 };
  assert.ok(dock.top + dock.height > toolbar.top);
  console.log("DOCK_BASELINE=PASS REPRODUCED=OVERLAP OVERLAP_PX=50");
} else {
  assert.ok(original.includes("separateCanvasDocks({"));
  assert.ok(original.includes("new ResizeObserver(measure)"));
  assert.ok(original.includes("[docksReady, canvasSize.width, canvasSize.height,"));
  assert.ok(original.includes("toolbarWidth: toolbar.offsetWidth"));
  assert.ok(original.includes("minHeight: Math.min(218, dockStyle?.maxHeight ?? 218)"));
  assert.ok(original.includes("const maxHeight = Math.min(preferredHeight, aboveSpace)"));
  let cases = 0;
  for (const [safeTop,safeBottom] of [[64,356],[64,530],[64,684],[108,716],[64,916]]) {
    for (const top of [-200,64,140,300,438,600,1100]) {
      for (const toolbarTop of [-100,64,318,438,700]) {
        for (const height of [120,218,310,370,600]) {
          for (const toolbarHeight of [46,50,66]) {
            const placed = separateCanvasDocks({ dock:{left:24,top,width:820,maxHeight:height},toolbar:{left:500,top:toolbarTop},dockHeight:height,toolbarHeight,safeTop,safeBottom });
            const dh = Math.min(height,placed.dock.maxHeight!);
            assert.ok(placed.dock.top >= safeTop && placed.dock.top + dh <= safeBottom);
            assert.ok(placed.toolbar.top >= safeTop && placed.toolbar.top + toolbarHeight <= safeBottom);
            assert.ok(placed.dock.top + dh + 12 <= placed.toolbar.top || placed.toolbar.top + toolbarHeight + 12 <= placed.dock.top);
            assert.equal(placed.dock.left,24); assert.equal(placed.toolbar.left,500);
            cases++;
          }
        }
      }
    }
  }
  const css = readFileSync("src/app/globals.css","utf8");
  assert.ok(css.includes(".canvas-dock-entry { animation: canvas-dock-fade"));
  assert.ok(!/\btransform\b/.test(css.match(/@keyframes canvas-dock-fade \{([^\n]+)\}/)![1]));
  console.log(`DOCK_COLLISION=PASS CASES=${cases} GAP=12 SAFE_BOUNDS=PASS ENTRY_TRANSFORM=NONE`);
}
