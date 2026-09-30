import assert from "node:assert/strict";

import { collectPaddleRows, normalizeOcrSegments, scaleOcrSegments } from "../src/lib/canvas-ocr";

const nested = {
  result: {
    data: [{
      json_res: {
        rec_texts: ["第二行", "第一行", "第一行"],
        rec_scores: [0.91, 0.97, 0.44],
        rec_boxes: [[12, 80, 112, 108], [10, 12, 100, 42], [10, 12, 100, 42]],
      },
    }],
  },
};
const rows = collectPaddleRows(nested);
assert.equal(rows.length, 3, "nested PaddleOCR rows are collected");
const segments = normalizeOcrSegments(rows, 200, 120, { minConfidence: 0.1 });
assert.equal(segments.length, 2, "duplicate nested rows are removed");
assert.deepEqual(segments.map((item) => item.text), ["第一行", "第二行"], "segments use visual reading order");
assert.deepEqual(segments[0].box, { x: 10, y: 12, width: 90, height: 30 }, "rec_boxes xyxy is converted to width/height");

const filtered = normalizeOcrSegments([
  { text: "噪声", confidence: 0.09, box: { x: 1, y: 1, width: 20, height: 10 } },
  { text: "保留", confidence: 0.12, box: { x: 5, y: 20, width: 30, height: 12 } },
], 100, 100, { minConfidence: 0.12 });
assert.deepEqual(filtered.map((item) => item.text), ["保留"], "confidence threshold only drops lower-quality noise");

const scaled = scaleOcrSegments(filtered, { width: 100, height: 100 }, { width: 400, height: 200 });
assert.deepEqual(scaled[0].box, { x: 20, y: 40, width: 120, height: 24 }, "fallback scan coordinates map to original pixels");

const polygons = normalizeOcrSegments({
  segments: [{ text: "倾斜文字", score: 0.88, points: [[20, 10], [80, 8], [82, 30], [18, 32]] }],
}, 100, 100);
assert.deepEqual(polygons[0].box, { x: 18, y: 8, width: 64, height: 24 }, "polygon boxes are supported");

console.log("PASS canvas OCR nested Paddle shapes, xyxy conversion, confidence, dedupe, reading order and scaling");
