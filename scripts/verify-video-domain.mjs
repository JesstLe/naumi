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
assert.match(taskById, /deleteFinishedVideoTask/, "[id] 路由必须支持删除已结束任务历史");

// ── Phase 2 锚点:工作台页面、列表/重试/发送到画布、模拟组件下线 ──
const phase2Files = [
  "src/app/video/page.tsx",
  "src/components/video/video-studio-client.tsx",
  "src/app/api/video/tasks/[id]/retry/route.ts",
  "src/app/api/video/tasks/[id]/send-to-canvas/route.ts",
];
for (const rel of phase2Files) {
  assert.ok(existsSync(new URL(rel, root)), `missing file: ${rel}`);
}
const tasksRoute = read("src/app/api/video/tasks/route.ts");
assert.match(tasksRoute, /listVideoTaskViews/, "tasks 路由必须提供列表模式");
assert.match(tasksRoute, /pollAndSettle/, "tasks 路由必须保持 id 轮询兼容");
assert.match(tasksRoute, /url\.searchParams\.get\("sourceIds"\)/, "tasks 路由必须接收来源作品 ID");
assert.match(tasksRoute, /\.slice\(0,\s*500\)/, "tasks 路由必须限制来源作品 ID 数量");
assert.match(tasksRoute, /sourceIds,\s*\n\s*limit:/, "tasks 路由必须把来源作品 ID 传入列表查询");
const retryRoute = read("src/app/api/video/tasks/[id]/retry/route.ts");
assert.match(retryRoute, /createVideoGeneration/, "重试必须走应用层创建");
const sendRoute = read("src/app/api/video/tasks/[id]/send-to-canvas/route.ts");
assert.match(sendRoute, /addArtworks/, "发送到画布必须能补建作品");
const studio = read("src/components/video/video-studio-client.tsx");
assert.match(studio, /sendToCanvas/, "工作台必须有发送到画布动作");
assert.match(studio, /loadHistory/, "工作台必须恢复历史任务");
assert.match(studio, /taskCount/, "工作台必须支持 1-6 条批量生成");
assert.match(studio, /providerOptions/, "工作台必须按能力传递模型特有参数");
assert.match(studio, /removeTask/, "工作台必须支持删除已结束任务记录");

// 画布视频能力:能力目录、刷新恢复、多模态引用、时间轴与抽取工具必须同时存在。
const canvas = read("src/components/canvas/canvas-client.tsx");
assert.match(canvas, /\/api\/video\/catalog/, "画布必须读取视频能力目录");
const videoRecoveryStart = canvas.indexOf("// 页面刷新/关闭后恢复画布视频任务");
const videoRecoveryEnd = canvas.indexOf("// 改字任务由", videoRecoveryStart);
assert.ok(videoRecoveryStart >= 0 && videoRecoveryEnd > videoRecoveryStart, "画布必须保留视频任务恢复区块");
const videoRecovery = canvas.slice(videoRecoveryStart, videoRecoveryEnd);
assert.match(videoRecovery, /const sourceIds = project\.members\.map\(\(item\) => item\.id\)/, "视频恢复必须按当前项目成员查询");
assert.match(videoRecovery, /Math\.ceil\(sourceIds\.length \/ 80\)/, "视频恢复必须对来源作品 ID 分块");
assert.match(videoRecovery, /sourceIds\.slice\(index \* 80, index \* 80 \+ 80\)/, "视频恢复分块大小必须保持 80");
assert.ok(
  videoRecovery.includes('privateFetchRaw(`/api/video/tasks?source=canvas&limit=500&sourceIds=${encodeURIComponent(chunk.join(","))}`)'),
  "画布必须用 sourceIds 分块和 limit=500 恢复后台视频任务"
);
assert.match(
  videoRecovery,
  /responses\.some\(\(response\) => !response\.ok\)\) throw new Error\("视频任务查询失败"\)/,
  "视频恢复遇到非 2xx 查询必须进入重试"
);
assert.doesNotMatch(videoRecovery, /if \(!response\.ok\) return;/, "视频恢复不得在非 2xx 查询后静默停止");
assert.match(
  videoRecovery,
  /catch\s*\{\s*if \(!stopped\) timer = window\.setTimeout\(sync, 12000\);\s*\}/,
  "视频恢复查询失败后必须安排下一次重试"
);
assert.match(canvas, /taskId\?: string/, "画布占位节点必须持久关联视频任务 ID");
assert.match(canvas, /source_video/, "画布生成必须支持视频参考");
assert.match(canvas, /source_audio/, "画布生成必须支持音频参考");
assert.match(canvas, /hasRenderableImage\(a\.image\) \|\| Boolean\(a\.videoUrl\)/, "音频与视频节点不能因缺少图片地址被画布过滤");
assert.match(canvas, /title="抽取首帧"/, "画布必须支持首帧抽取");
assert.match(canvas, /videoRef\.current\?\.currentTime/, "画布必须维护视频当前时间");
assert.match(canvas, /title="拆分音轨"/, "画布必须支持音轨抽取");

const extractRoute = read("src/app/api/video/extract/route.ts");
assert.match(extractRoute, /parentId: parentArtworkId/, "抽帧与音轨节点必须保留来源血缘");
assert.match(extractRoute, /parentIds: \[\]/, "抽帧与音轨节点不得重复记录主父节点");
assert.match(extractRoute, /category: kind === "frame" \? "main" : "audio"/, "音轨必须创建音频类别节点");
assert.ok(
  !existsSync(new URL("src/components/generate/video-studio.tsx", root)),
  "旧模拟组件应已删除"
);

console.log("PASS video domain contracts: files, capability catalog, service semantics, worker wiring, workbench, legacy compatibility");
