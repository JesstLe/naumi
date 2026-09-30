import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const createRoute = readFileSync(
  new URL("../src/app/api/video/generate/route.ts", import.meta.url),
  "utf8"
);
// §11 Phase 1:结算/租约/幂等产物语义已迁移到 service.ts,契约锚点随之更新。
const service = readFileSync(new URL("../src/lib/video/service.ts", import.meta.url), "utf8");
const directProvider = readFileSync(new URL("../src/lib/video/providers/direct.ts", import.meta.url), "utf8");

assert.match(db, /CREATE TABLE IF NOT EXISTS app_video_tasks/);
assert.match(db, /poll_lock_until/);
assert.match(db, /credits_refunded/);
assert.match(db, /export async function claimVideoTaskPoll/);
assert.match(db, /FOR UPDATE/);
assert.match(db, /led-video-\$\{input\.id\}/);
assert.match(db, /DELETE FROM app_gen_reservations WHERE job_id = \$1/);
assert.match(db, /export async function deleteFinishedVideoTask/);
assert.match(db, /进行中的任务不能删除/);
assert.match(db, /export async function setArtworkOrigin/);
// 预建任务与预扣必须在短事务中原子完成，上游调用不得占用 session advisory lock。
assert.match(service, /createVideoTaskWithReservation\(/);
assert.match(db, /export async function createVideoTaskWithReservation/);
assert.match(db, /pg_advisory_xact_lock/);
assert.doesNotMatch(db, /pg_advisory_lock\(/, "不得持有 session advisory lock 跨上游网络请求");
assert.match(db, /status, cost, request_body[\s\S]*'queued'/, "必须先持久化 queued creation intent");
assert.match(db, /INSERT INTO app_gen_reservations[\s\S]*INSERT INTO app_video_tasks/, "reservation 与任务必须同事务创建");
assert.match(createRoute, /createVideoGeneration/);
// 轮询租约与幂等产物:并发重试不会重复落节点/重复扣费
assert.match(service, /claimVideoTaskPoll\(email, id\)/);
assert.match(service, /const artworkId = `vid-art-\$\{id\}`/);
assert.match(service, /await completeVideoTask\(\{/);
assert.match(service, /pollSucceeded \|\| error instanceof TransientPollError/, "poll 成功后的本地 DB/落地失败必须按瞬时错误重试");
assert.match(service, /scheduleVideoTaskRetry\(email, id, 10, "", false\)/, "正常轮询必须清零连续失败计数");
assert.match(service, /noteVideoTaskResultObserved\(email, id\)/, "completed 首次观察必须开启独立落地失败预算");
assert.match(service, /stageVideoTaskResult\(/, "视频 URL 必须在作品与计费结算前持久化以支持续跑");
assert.match(service, /origin: task\.source === "canvas" \? "canvas" : null/);
assert.match(service, /parentId: parentIds\[0\] \|\| null/);
assert.match(service, /data:\$\{image\.mime\};base64/, "本地首帧必须转 data URL 后交给 multipart 适配器");
assert.match(service, /result\.status === "failed" \|\| result\.status === "cancelled"/, "取消状态必须终止并退款，不能永久轮询");
assert.match(directProvider, /headers: url \? \{\} : headers\(cfg\)/, "签名下载地址不得携带供应商密钥");
// 价格只在创建时读取并快照进任务行;轮询结算必须使用快照 cost,不受当前配置影响
const pollBody = service.slice(
  service.indexOf("export async function pollAndSettle"),
  service.indexOf("export async function listVideoTaskViews")
);
assert.ok(pollBody.length > 0, "pollAndSettle not found");
assert.doesNotMatch(pollBody, /VIDEO_TASK_COST/);

console.log("PASS video task schema, reservation, poll lock, idempotent artwork and exact-cost settlement contracts");
