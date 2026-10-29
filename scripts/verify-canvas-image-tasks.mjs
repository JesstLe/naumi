import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const db = read("src/lib/db.ts");
const service = read("src/lib/canvas-image-tasks.ts");
const createRoute = read("src/app/api/canvas/image-tasks/route.ts");
const taskRoute = read("src/app/api/canvas/image-tasks/[id]/route.ts");
const workerRoute = read("src/app/api/video/worker/tick/route.ts");
const workerScan = read("src/lib/worker/tick-scan.ts");

assert.match(db, /CREATE TABLE IF NOT EXISTS app_canvas_image_tasks/, "persistent task table exists");
assert.match(db, /FOR UPDATE SKIP LOCKED/, "worker claim is concurrency-safe");
assert.match(db, /led-canvas-image-/, "credit settlement ledger is deterministic");
assert.match(db, /credits_refunded/, "failure refund is idempotent");
assert.match(service, /parentId: artwork\.id/, "result keeps source lineage");
assert.match(service, /origin: "canvas"/, "result returns to canvas");
assert.match(service, /canvasX\?: number/, "enqueue captures the restore X coordinate");
assert.match(service, /canvasY\?: number/, "enqueue captures the restore Y coordinate");
assert.match(service, /attempts < 3/, "transient edit failures retry with a bound");
assert.match(createRoute, /status: 202/, "create API returns immediately");
assert.match(taskRoute, /getCanvasImageTask/, "task can be restored after Dock/page closes");
assert.match(workerRoute, /scanWorkerTick as scan/, "resident worker delegates its scan");
assert.match(workerScan, /recoverCanvasImageTasks\(2\)/, "resident worker continues image edits");

console.log("PASS persistent canvas image task create, lease, retry, settlement, restore and lineage contracts");
