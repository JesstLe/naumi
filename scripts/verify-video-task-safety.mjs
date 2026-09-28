import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const createRoute = readFileSync(
  new URL("../src/app/api/video/generate/route.ts", import.meta.url),
  "utf8"
);
const pollRoute = readFileSync(
  new URL("../src/app/api/video/tasks/route.ts", import.meta.url),
  "utf8"
);

assert.match(db, /CREATE TABLE IF NOT EXISTS app_video_tasks/);
assert.match(db, /poll_lock_until/);
assert.match(db, /credits_refunded/);
assert.match(db, /export async function claimVideoTaskPoll/);
assert.match(db, /FOR UPDATE/);
assert.match(db, /led-video-\$\{input\.id\}/);
assert.match(db, /DELETE FROM app_gen_reservations WHERE job_id = \$1/);
assert.match(createRoute, /addReservation\(taskId, email, cost\)/);
assert.match(createRoute, /settleReservation\(taskId\)/);
assert.match(pollRoute, /claimVideoTaskPoll\(email, id\)/);
assert.match(pollRoute, /const artworkId = `vid-art-\$\{id\}`/);
assert.match(pollRoute, /completeVideoTask\(\{ email, id, artworkId, videoUrl: url \}\)/);
assert.doesNotMatch(pollRoute, /VIDEO_TASK_COST/);

console.log("PASS video task schema, reservation, poll lock, idempotent artwork and exact-cost settlement contracts");
