import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const createRoute = readFileSync(
  new URL("../src/app/api/video/generate/route.ts", import.meta.url),
  "utf8"
);
// §11 Phase 1:结算/租约/幂等产物语义已迁移到 service.ts,契约锚点随之更新。
const service = readFileSync(new URL("../src/lib/video/service.ts", import.meta.url), "utf8");

assert.match(db, /CREATE TABLE IF NOT EXISTS app_video_tasks/);
assert.match(db, /poll_lock_until/);
assert.match(db, /credits_refunded/);
assert.match(db, /export async function claimVideoTaskPoll/);
assert.match(db, /FOR UPDATE/);
assert.match(db, /led-video-\$\{input\.id\}/);
assert.match(db, /DELETE FROM app_gen_reservations WHERE job_id = \$1/);
// 预扣与精确结算锚定在 service(路由只做兼容代理);结算仍是一次性幂等。
assert.match(service, /addReservation\(taskId, email, cost\)/);
assert.match(service, /settleReservation\(taskId\)/);
assert.match(createRoute, /createVideoGeneration/);
// 轮询租约与幂等产物:并发重试不会重复落节点/重复扣费
assert.match(service, /claimVideoTaskPoll\(email, id\)/);
assert.match(service, /const artworkId = `vid-art-\$\{id\}`/);
assert.match(service, /completeVideoTask\(\{ email, id, artworkId, videoUrl: url \}\)/);
// 价格只在创建时读取并快照进任务行;轮询结算必须使用快照 cost,不受当前配置影响
const pollBody = service.slice(
  service.indexOf("export async function pollAndSettle"),
  service.indexOf("export async function listVideoTaskViews")
);
assert.ok(pollBody.length > 0, "pollAndSettle not found");
assert.doesNotMatch(pollBody, /VIDEO_TASK_COST/);

console.log("PASS video task schema, reservation, poll lock, idempotent artwork and exact-cost settlement contracts");
