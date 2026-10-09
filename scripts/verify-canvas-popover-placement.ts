import assert from "node:assert/strict";
import { canvasPopoverPlacement } from "../src/lib/canvas/popover-placement";
const originalTop = 150 - 8 - 380;
assert.ok(originalTop < 0, "baseline: unscrollable content can be above the viewport despite a 76vh height limit");
let cases = 0;
for (const width of [240, 390, 768, 1093, 1920]) for (const height of [240, 320, 614, 911]) {
  for (const left of [-100, 8, width / 2, width - 20]) for (const top of [-100, 32, height / 2, height - 40, height + 100]) for (const content of [120, 300, 600]) {
    const result = canvasPopoverPlacement({ left, top, bottom: top + 32 }, { width, height }, content);
    assert.ok(result.left >= 8 && result.left + result.width <= width - 8);
    assert.ok(result.top >= 8 && result.top + Math.min(content, result.maxHeight) <= height - 8);
    assert.ok(result.maxHeight > 0 && result.maxHeight <= height - 16);
    cases++;
  }
}
const short = canvasPopoverPlacement({ left: 100, top: 150, bottom: 182 }, { width: 390, height: 320 }, 380);
assert.ok(short.maxHeight < 380, "the actual content must overflow its scroll container so the clipped options become reachable");
assert.equal(canvasPopoverPlacement({ left: 20, top: 30, bottom: 62 }, { width: 390, height: 844 }, 300).side, "below");
console.log("CANVAS_PARAMETER_POPOVER=PASS BOUNDS_CASES=" + cases + " TOP_CROP_REPRODUCED=1 CONSTRAINED_SCROLL=PASS");
