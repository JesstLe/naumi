# 画布 OCR 与后台改字实现记录（2026-09-30）

## 目标

解决在线改字链路的三类问题：

1. PaddleOCR 报错、慢、结果乱序或重复时，能够限时重试并稳定回退视觉模型。
2. 整张图片中的文字都能进入可编辑列表，而不是只取前 80 项或绑定某一种 PaddleOCR 响应结构。
3. 改字生成脱离 Dock 和浏览器请求生命周期，关闭面板或继续操作画布后任务仍由常驻 worker 执行；完成产物保留源图血缘并回到画布。

## 已实现

### OCR

- 新增 `src/lib/canvas-ocr.ts`，统一处理：
  - PaddleOCR `rec_texts + rec_boxes/rec_polys/dt_boxes` 等响应。
  - 任意深度的 `result/data/json_res` 包装。
  - `xyxy`、多边形和对象坐标框。
  - 最低置信度过滤、同文字重叠框去重、按视觉阅读顺序排序。
  - 视觉模型缩放扫描后的坐标反算。
- PaddleOCR 首选链路增加可配置超时与有界重试：
  - `PADDLE_OCR_TIMEOUT_MS`，默认 35000。
  - `PADDLE_OCR_MAX_ATTEMPTS`，默认 2，最大 4。
  - `PADDLE_OCR_MIN_CONFIDENCE`，默认 0.12。
- 仅对 408、429、5xx、网络超时和无效 JSON 重试；明确的其他 4xx 立即回退，减少无效等待。
- PaddleOCR 未配置、空结果或失败且未启用 `PADDLE_OCR_REQUIRED=true` 时，保留视觉模型兜底。
- API 返回 `diagnostics.elapsedMs/paddleAttempts/fallback`，服务端输出引擎、段数、尝试次数和耗时；错误原因先净化，不回传密钥或模型内部响应。
- 单图上限从 80 提升到 500 个去重后文字片段。

### 后台改字任务

- 新增 PostgreSQL 表 `app_canvas_image_tasks`：保存源作品、编辑参数、状态、进度、尝试次数、租约、结果作品和退款状态。
- 新增接口：
  - `POST /api/canvas/image-tasks`：创建任务并立即返回 HTTP 202。
  - `GET /api/canvas/image-tasks/[id]`：查询任务，页面或 Dock 关闭后仍可恢复。
  - `GET /api/canvas/image-tasks?limit=50`：恢复当前账号近期任务。
- 复用现有常驻 `video-worker` 的 tick，同时处理最多两个图片编辑任务，无需再部署一套进程。
- worker 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 领取任务，并设置可过期租约；进程异常后可被下一次 tick 重新领取。
- 瞬时失败最多尝试 3 次，成功或最终失败都原子结算：
  - 成功使用确定性流水 ID，避免重复扣费。
  - 失败通过 `credits_refunded` 防止重复退款。
  - 生成预约在任务结束时清理，处理中持续续约。
- 结果作品 ID 固定为 `txtedit-${taskId}`，重试不会生成重复作品。
- 结果保存 `parentId=源作品`、继承 `groupId`、`source=源图片`、`origin=canvas`，保证血缘和画布归属。
- 创建接口接受可选 `canvasX/canvasY`，与 `newText` 一起保存在 `task.parameters`；GET/列表会返回 `kind=text-edit`、`sourceArtworkId`、`parameters` 和 `createdAt`，刷新后可区分图片编辑占位并恢复到原定位置。

## 前端接入契约

画布现有 `applyOcrSegment` 应从同步 `/api/canvas/text-edit` 切换为：

1. POST `/api/canvas/image-tasks`，保留返回的 `taskId` 和占位节点。
2. Dock 关闭时只关闭界面，不发送取消请求、不清除服务端任务。
3. 每 2-3 秒 GET `/api/canvas/image-tasks/[taskId]`；也可在画布初始化时 GET 列表恢复未结束任务。
4. `completed`：使用 `resultArtworkId` 调用现有 `mergeWorks`，将结果放到源图右侧并清理占位。
5. `failed`：展示 `task.error` 并清理占位；`queued/processing` 按 `task.progress` 更新。

同步 `/api/canvas/text-edit` 暂时保留，避免旧客户端在前端切换完成前失效；新客户端应使用持久化任务接口。

## 验证

```text
npx tsx scripts/verify-canvas-ocr.ts
PASS canvas OCR nested Paddle shapes, xyxy conversion, confidence, dedupe, reading order and scaling

node scripts/verify-canvas-image-tasks.mjs
PASS persistent canvas image task create, lease, retry, settlement, restore and lineage contracts

DATABASE_URL=... npx tsx --conditions react-server scripts/verify-canvas-image-postgres.ts
PASS canvas image postgres runtime: schema=ready lease=exclusive completion=idempotent billing=exact refund=idempotent restore=position

npx tsc --noEmit
exit 0

npx next lint --file ...
✔ No ESLint warnings or errors
```

## 仍需由画布组件完成

- 按上述契约替换 `applyOcrSegment` 的同步请求和本地计时进度。
- 初始化时恢复当前账号 `queued/processing` 任务，并在完成时定位结果节点。
- 浏览器实测：创建任务后立即关闭 Dock、切换项目、刷新页面，产物仍能回到源图所属项目并保持血缘。
