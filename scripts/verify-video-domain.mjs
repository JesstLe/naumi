import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

// ── Phase 1 领域基础契约:文件存在性 + 关键导出 + 路由接线 ──

const requiredFiles = [
  "src/lib/video/types.ts",
  "src/lib/video/capabilities.ts",
  "src/lib/video/repository.ts",
  "src/lib/video/service.ts",
  "src/lib/video/worker.ts",
  "src/lib/video/providers/adapter.ts",
  "src/lib/video/providers/openai-videos.ts",
  "src/app/api/video/catalog/route.ts",
  "src/app/api/video/tasks/[id]/route.ts",
  "src/app/layout.tsx",
];
for (const rel of requiredFiles) {
  assert.ok(existsSync(new URL(rel, root)), `missing file: ${rel}`);
}

const types = read("src/lib/video/types.ts");
for (const name of [
  "VideoGenerationRequest",
  "VideoProviderAdapter",
  "VideoTaskSnapshot",
  "TransientPollError",
  "VideoReference",
]) {
  assert.ok(types.includes(name), `types.ts missing ${name}`);
}

const caps = read("src/lib/video/capabilities.ts");
for (const fn of [
  "getVideoModelCapability",
  "validateAgainstCapability",
  "videoCatalog",
  "fallbackCapability",
]) {
  assert.ok(caps.includes(`export function ${fn}`), `capabilities.ts missing ${fn}`);
}
assert.match(caps, /durations: \[15\]/, "seedance 15s-only 必须录入能力声明");

const service = read("src/lib/video/service.ts");
for (const fn of [
  "createVideoGeneration",
  "pollAndSettle",
  "recoverDueVideoTasks",
  "listVideoTaskViews",
]) {
  assert.ok(service.includes(`export async function ${fn}`), `service.ts missing ${fn}`);
}
// 轮询续约:长任务预留不过期(并行会话修复的吸收)
assert.match(service, /touchReservation\(/, "poll 必须续约预留");

// 瞬时错误不退款终止:TransientPollError 走退避重试
assert.match(service, /TransientPollError/, "service 必须区分瞬时错误");
assert.match(service, /scheduleVideoTaskRetry\(/, "瞬时错误必须安排重试");

const worker = read("src/lib/video/worker.ts");
assert.match(worker, /startVideoWorker/, "worker.ts missing startVideoWorker");
assert.match(worker, /recoverDueVideoTasks/, "worker 必须调用恢复扫描");

// worker 由根 layout 服务端模块加载时幂等启动(自托管常驻进程,unref 不阻塞退出)
const layout = read("src/app/layout.tsx");
assert.match(layout, /startVideoWorker/, "layout 必须启动视频 worker");

// 旧入口契约(兼容期):generate 响应字段保持
const generate = read("src/app/api/video/generate/route.ts");
assert.match(generate, /taskId/, "generate 必须返回 taskId");
assert.match(generate, /imageUrl/, "generate 必须支持 agent 的 imageUrl(P0-3)");
const taskById = read("src/app/api/video/tasks/[id]/route.ts");
assert.match(taskById, /getVideoTask/, "[id] 路由必须只读查询");

console.log("PASS video domain contracts: files, capability catalog, service semantics, worker wiring, legacy compatibility");
