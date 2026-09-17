import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.CANVAS_TEXT_BASE_URL || "http://127.0.0.1:3100";
const output = path.resolve("output/canvas-text-node-smoke");
await mkdir(output, { recursive: true });
const report = [];
const pass = (message) => {
  const line = `PASS ${message}`;
  report.push(line);
  console.log(line);
};

try {
  const canvasSource = await readFile(
    path.resolve("src/components/canvas/canvas-client.tsx"),
    "utf8"
  );
  assert.match(canvasSource, /function TextCanvasNode/);
  assert.match(canvasSource, /canvas\.textGenerate/);
  assert.match(canvasSource, /\/api\/canvas\/text-generate/);
  pass("canvas registers the text node, add-menu entry, and generation dock");

  const response = await fetch(`${base}/api/canvas/text-generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "为白色保温杯写3条简洁的电商卖点，每条不超过20字",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(typeof body.text, "string");
  assert(body.text.trim().length > 0);
  assert.equal(typeof body.model, "string");
  pass("text generation API returns non-empty generated content and model id");

  const nodeResponse = await fetch(
    `${base}/api/canvas/text-nodes?email=canvas-text-smoke@local.test`
  );
  const nodeBody = await nodeResponse.json();
  assert.equal(nodeResponse.status, 200, JSON.stringify(nodeBody));
  assert.equal(nodeBody.persisted, false);
  assert.deepEqual(nodeBody.nodes, []);
  pass("text-node endpoint exposes the no-database fallback contract");

  console.log(`MODIFIED_RESULT=PASS checks=${report.length}`);
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  throw error;
} finally {
  await writeFile(path.join(output, "test.log"), `${report.join("\n")}\n`);
}
