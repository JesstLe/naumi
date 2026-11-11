# Naumi 生视频子系统吸收重写方案

## 0. 实现完成状态（2026-09-28）

本轮已完成一条可运行的多供应商视频生产链路：

- 已完成供应商运行时注册表：OpenAI Videos、Ark/Seedance、Kie/Kling、API Mart、Gemini/Veo、MiniMax、AutoDL、RunningHub；配置来自旧版 `VIDEO_API_*`、命名环境变量或 `VIDEO_PROVIDERS_JSON`，客户端目录不返回密钥。
- 已完成统一直连适配器：创建、状态轮询、结果取回、瞬时错误重试、200MB 上限和多种响应任务 ID/下载地址解析；`scripts/verify-video-providers.ts` 用本地 HTTP fixture 验证 8 种协议。
- 已完成请求扩展：供应商/模型、负面提示词、比例、分辨率、精确宽高、音频、水印、首尾帧、多图/视频/音频引用、受能力声明约束的 `providerOptions`；旧 `{seconds,size,imageUrl}` 仍兼容。
- 已完成数据库结果历史：运行任务追加渠道/供应商快照、响应摘要、轮询响应、详细错误、结果存储 key；新增 `app_video_results`、结果列表/删除 API，完成结算与历史结果同事务写入。
- 已完成独立 worker：`/api/video/worker/tick` + `scripts/video-worker.mjs`，Docker Compose 增加 `video-worker` 服务；`NAUMI_VIDEO_WORKER=0` 时关闭应用内定时器，数据库租约继续保证多实例幂等。
- 已完成素材上传 API `/api/video/references`，支持图片/视频/音频、大小/MIME 校验和本地/R2 存储。
- 已完成 `/video` 工作台供应商/模型切换、首尾帧、多模态素材、比例/分辨率、负面提示词、音频、水印以及完整请求快照重试。
- 已完成 Agent 视频域工具：`list_video_models`、`plan_video_shot`、`plan_video_storyboard`、`get_video_task`、`extend_video`、`edit_video`，并将 `generate_video` 迁移到统一请求入口。
- 已完成服务器端视频工具 `/api/video/extract`：检测到 FFmpeg 时可从视频抽取指定时间帧 PNG 或音轨 MP3，并通过 Naumi 存储返回可继续连接到画布的素材 URL。
- 已完成画布视频节点工具：选中视频节点可抽取首帧、当前帧、尾帧或拆分音轨；抽取结果通过父节点血缘自动加入当前画布，音轨以可播放音频节点呈现。
- 已完成画布视频时间轴：选中视频节点可拖动当前时间、播放/暂停，并将当前时间直接用于当前帧抽取。
- 已完成画布生成任务刷新恢复：按 `source=canvas` 扫描进行中任务，恢复占位节点和进度，后台完成后自动合并稳定作品 ID，并保留来源图片/视频/音频血缘。
- 已完成工作台批量生成（1–6 条）、能力驱动的多镜头/固定机位开关、终态历史删除，以及“结果仅在用户发送后进入画布”的边界。
- 已完成 PostgreSQL 运行时验收：建表、互斥租约、完成幂等、精确结算、退款幂等、画布来源筛选和仅终态删除均通过。
- 已完成独立 worker 进程验收：任务由 worker 领取并处理一次，结果持久化到媒体目录、`app_artworks` 与 `app_video_results`，父级血缘和 `origin=canvas` 保持正确。
- 已完成真实浏览器登录态回归：工作台历史/结果操作/删除、画布创建、刷新恢复、worker 完成合并、时间轴、首帧抽取、音轨拆分和再次刷新持久化全部通过；截图为 `output/video-browser-acceptance.png`。
- 已修复 Gemini 与 AutoDL 多模型路由：创建 URL 使用用户实际选择的模型/工作流，不再错误回落到供应商默认模型。

代码吸收和本地端到端验收已经完成。仍需按部署环境单独记录的外部验收边界是：除现有 OpenAI Videos 兼容端点之外，其余供应商需要各自有效凭证才能做真实质量、配额和限流验收；这不再是代码实现缺口。fixture/build 通过也不替代真实供应商质量验收。

本机已用现有 `VIDEO_API_*` 配置完成一次真实 OpenAI Videos 兼容端点验收：4.04 秒、1280×720、H.264/AAC，912,300 bytes；脚本为 `scripts/verify-video-provider-real.ts`，产物默认写入 `output/video-real-provider-acceptance.mp4`。其他供应商仍需各自配置凭证后逐家运行同级验收。

## 1. 目标与边界

### 1.1 总目标

将外部参考实现的生视频能力按能力域完整吸收进 Naumi，形成与现有图片、画布、Agent、账户、积分和媒体存储统一的原生子功能。

“完整吸收”指最终覆盖参考项目的视频模型接入、能力声明、异步任务、独立工作台、画布编排、历史恢复和 Agent 策划能力；不复制其 Go 后端、Ant Design 页面、Zustand 数据层或浏览器直存 API Key 的实现。

### 1.2 必须保持

- Naumi 继续使用 Next.js App Router、PostgreSQL、现有鉴权、积分账本和本地/R2 媒体存储。
- 继续使用当前 React Flow 画布，不新建第二套画布，不使用 iframe，不挂载独立 Go 服务。
- 保留现有 `@` 引用、连线、`sourceIds`、`targetIds`、`parentId/parentIds` 等上下文与作品血缘语义。
- 当前 OpenAI Videos 兼容链路作为第一个适配器迁入新架构，迁移前后请求参数、计费和产物行为保持等价。
- UI 使用 Naumi 的浅色工作台风格；不照搬参考项目的 Ant Design 视觉，也不增加无业务价值的宣传文案。

### 1.3 非目标

- 不以“支持供应商数量”替代真实模型验收。
- 不把所有模型参数硬塞进一个公共表单；UI 必须由模型能力声明驱动。
- 不在第一阶段同时重构图片生成、画布上下文和工作流系统。
- 不在没有 A/B 证据时改变现有图片生成输入顺序或自动合并更多上下文。

## 2. 改造前基线与完成态

### 2.1 改造前 Naumi 已有能力

| 能力 | 改造前状态 | 原入口/实现 |
| --- | --- | --- |
| 文生视频 | 已实现 | `/api/video/generate` |
| 单图生视频 | 已实现 | 画布选图后提交 `artworkId` |
| 时长 | 4/8/12 秒 | 固定白名单 |
| 尺寸 | 横屏、竖屏，接口另接受少量固定尺寸 | `size` 字段 |
| 上游协议 | 单一 OpenAI Videos 兼容协议 | `src/lib/video/client.ts` |
| 任务持久化 | 已实现 | `app_video_tasks` |
| 并发轮询保护 | 已实现 | `poll_lock_until` 租约 |
| 积分结算 | 已实现 | 预留、成功精确扣费、失败幂等退款 |
| 产物持久化 | 已实现 | 本地/R2 转存，创建 `category=video` 作品 |
| 画布视频节点 | 已实现 | 原生播放、选中态播放控制、放大入口 |
| Agent 调用 | 已实现 | `generate_video` |
| ComfyUI 视频结果 | 已实现 | 工作流产物落画布视频节点 |
| 任务恢复 | 部分 | 数据库有任务，但主要依赖页面或 Agent 轮询 |
| 独立视频工作台 | 未实现 | `video-studio.tsx` 仍为模拟组件 |

### 2.2 改造前可靠性基线

- `node scripts/verify-video-task-safety.mjs` 覆盖任务表、预留、轮询锁、幂等产物和精确结算契约。
- 视频完成产物 ID 由任务 ID 稳定派生，避免并发重复落节点。
- 改造前最大结构性风险是“客户端驱动轮询”：页面关闭后没有常驻任务执行器继续取回和落盘。
- 改造前任务 API 只有按 ID 查询，没有列表、删除、重试、恢复和来源筛选。

### 2.3 当前完成态

| 能力域 | 完成状态 | Naumi 原生实现 |
| --- | --- | --- |
| 多供应商 | 已完成 | 8 种协议适配器、运行时注册表、脱敏供应商快照 |
| 模型能力 | 已完成 | 共享 `VideoModelCapability`、服务端硬校验、白名单 `providerOptions` |
| 后台任务 | 已完成 | 独立 worker、数据库租约、瞬时错误重试、超时终止退款 |
| 任务与结果 | 已完成 | 运行任务、结果历史、来源筛选、重试、终态删除、发送到画布 |
| 工作台 | 已完成 | `/video` 原生页面、多模态引用、批量生成、历史恢复、下载与重试 |
| 画布 | 已完成 | 多媒体上游引用、刷新恢复、自动合并、时间轴、抽帧和音轨拆分 |
| Agent | 已完成 | 模型目录、单镜头、多镜头、生成、续写、编辑、任务恢复 |
| 计费与存储 | 已完成 | 预留、精确结算、幂等退款、本地/R2 统一媒体存储 |

参考项目的能力已按 Naumi 架构吸收，不引入第二套画布、Go 服务、Ant Design、Zustand 或浏览器直存密钥。

## 3. 改造前差距与吸收结果

| 能力域 | Naumi 改造前 | 参考基线 | 原差距级别 | 已完成吸收方式 |
| --- | --- | --- | --- | --- |
| 供应商协议 | 1 个 OpenAI 兼容适配 | OpenAI、Ark/Seedance、API Mart、Kie/Kling、MiniMax、Gemini/Veo、GLM、AutoDL、RunningHub、ComfyUI | 高 | 建立服务端适配器注册表，不复制前端直连逻辑 |
| 模型能力声明 | 固定时长/尺寸 | 按模型声明帧、参考媒体、音频、水印、清晰度、时长等 | 高 | 建立 `VideoModelCapability`，前后端共用 |
| 后台任务 | 客户端惰性轮询 | 服务端 5 秒轮询、唤醒、清理 | 高 | 建立可恢复 worker，复用数据库租约 |
| 任务模型 | 单任务表、字段较少 | 渠道、来源、请求响应、详细错误、时间戳、精确积分 | 高 | 扩展运行任务并新增结果历史 |
| 工作台 | 模拟/隐藏 | 独立 `/video`、任务恢复、历史、下载、重试 | 高 | 原生实现 Naumi 视频工作台 |
| 输入素材 | 文本 + 单图 | 首尾帧、多图、视频、音频、Kling 元素 | 高 | 统一 `VideoReferenceSet` |
| 参数 | 时长 + 尺寸 | 比例、分辨率、精确尺寸、音频、水印、负面词、多镜头、模型特参 | 高 | 公共参数 + `providerOptions` 白名单 |
| 画布生成 | 选图发起 | 空视频节点、配置节点、图/视频/音频上游引用 | 中高 | 接入现有连线和 `@`，不建重复上下文图 |
| 视频节点工具 | 播放/放大 | 首帧、尾帧、当前帧抽取，音频拆分，更完整时间轴 | 中 | 分模块增强现有视频节点 |
| Agent | 通用生成工具 | 单镜头、多镜头、续写、编辑、可自动提交 | 中高 | 新增参数感知的视频技能与计划结构 |
| 云端同步 | 作品持久化 | 工作台历史、账号同步、远程下载、引用清理 | 中 | 以 PostgreSQL + 媒体存储为唯一事实源 |
| 错误可观测性 | 简单错误文本 | `errorDetail`、请求/响应、轮询时间、渠道快照 | 中高 | 脱敏存储调试信息，UI 分层展示 |

结论：参考项目的核心价值已经作为“视频生产域”吸收到 Naumi 的适配器、能力目录、后台任务、工作台、多模态引用、画布工具和 Agent 中，而不是移植其技术栈或复制一个独立应用。

## 4. 目标架构

### 4.1 分层

```text
UI（/video、Canvas、Agent）
        ↓ 统一 VideoGenerationRequest
应用层（创建、查询、重试、取消、恢复、结算）
        ↓ provider + model capability
适配层（OpenAI / Ark / Kling / Gemini / MiniMax / Workflow）
        ↓ create / poll / fetchResult / cancel?
任务执行器（领取租约、轮询、转存、结算、写历史）
        ↓
PostgreSQL + Local/R2 + app_artworks + app_ledger
```

### 4.2 规范化类型

建议新增 `src/lib/video/types.ts`：

```ts
export type VideoTaskSource = "canvas" | "workbench" | "agent" | "workflow";
export type VideoTaskStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type VideoReference = {
  id: string;
  kind: "image" | "video" | "audio";
  role:
    | "first_frame"
    | "last_frame"
    | "reference"
    | "element"
    | "source_video"
    | "source_audio";
  artworkId?: string;
  storageKey?: string;
  url?: string;
  mimeType?: string;
};

export type VideoGenerationRequest = {
  source: VideoTaskSource;
  sourceId?: string;
  providerId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  references: VideoReference[];
  providerOptions?: Record<string, unknown>;
  idempotencyKey: string;
};

export type VideoProviderCreateResult = {
  upstreamTaskId: string;
  upstreamVideoId?: string;
  status: VideoTaskStatus;
  progress?: number;
  rawResponse?: unknown;
};

export type VideoProviderPollResult = {
  status: VideoTaskStatus;
  progress: number;
  resultUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetail?: unknown;
  rawResponse?: unknown;
};

export interface VideoProviderAdapter {
  id: string;
  create(input: VideoGenerationRequest): Promise<VideoProviderCreateResult>;
  poll(task: VideoTaskSnapshot): Promise<VideoProviderPollResult>;
  fetchResult(task: VideoTaskSnapshot, result: VideoProviderPollResult): Promise<{
    bytes?: Uint8Array;
    url?: string;
    mimeType: string;
  }>;
  cancel?(task: VideoTaskSnapshot): Promise<void>;
}
```

### 4.3 模型能力声明

建议新增 `src/lib/video/capabilities.ts`：

```ts
export type VideoModelCapability = {
  providerId: string;
  modelId: string;
  label: string;
  modes: Array<"text" | "image" | "frames" | "reference" | "video_edit">;
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  exactSizes?: string[];
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudios: number;
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
  supportsGenerateAudio: boolean;
  supportsWatermark: boolean;
  supportsNegativePrompt: boolean;
  supportsMultiShot: boolean;
  providerOptionSchema?: Record<string, unknown>;
};
```

约束：

- 创建接口必须在服务端再次用能力声明校验，不能只相信前端隐藏控件。
- `providerOptions` 只能通过该模型声明的字段白名单，禁止任意透传。
- 任务必须保存提交时的能力、模型、渠道和价格快照，后续配置变化不能改变历史任务结算。
- 首尾帧与普通参考图是否互斥、最多素材数、可用时长和清晰度均由声明表达。

## 5. 数据库设计

### 5.1 扩展 `app_video_tasks`

保留当前表的结算字段，增加：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `provider_id` | text | 适配器 ID |
| `channel_id` | text | 提交时渠道快照 |
| `source` | text | canvas/workbench/agent/workflow |
| `source_id` | text | 画布节点、会话或工作流 ID |
| `input_mode` | text | text/image/frames/reference/video_edit |
| `parameters` | jsonb | 规范化参数快照，不含密钥 |
| `references` | jsonb | 素材角色和本地标识 |
| `provider_snapshot` | jsonb | 协议版本、端点标识、模型快照，密钥脱敏 |
| `capability_snapshot` | jsonb | 提交时能力声明 |
| `upstream_video_id` | text | 与任务 ID 分离 |
| `response_body` | text | 创建响应的脱敏摘要 |
| `last_response` | text | 最近轮询响应的脱敏摘要 |
| `error_code` | text | 可聚合的错误码 |
| `error_detail` | text | 详细错误，限制长度并脱敏 |
| `started_at` | timestamptz | 上游开始时间 |
| `completed_at` | timestamptz | 最终完成时间 |
| `next_poll_at` | timestamptz | worker 调度 |
| `poll_attempts` | integer | 轮询次数 |
| `result_storage_key` | text | 本地/R2 产物标识 |
| `idempotency_key` | text | 用户维度唯一，避免重复提交 |

索引：

- `(email, created_at desc)`
- `(status, next_poll_at)`
- `(email, source, created_at desc)`
- `unique(email, idempotency_key)`

### 5.2 新增 `app_video_results`

运行任务和用户历史分离，历史表保存最终可展示、可重试、可发送到画布的结果：

- `id`, `task_id`, `email`, `status`
- `provider_id`, `channel_id`, `model`
- `prompt`, `negative_prompt`
- `parameters jsonb`, `references jsonb`
- `video_url`, `storage_key`, `poster_url`
- `duration_ms`, `width`, `height`, `mime_type`, `bytes`
- `artwork_id`
- `error`, `error_detail`
- `created_at`, `completed_at`

删除历史默认只删除历史卡；媒体仍被画布作品引用时不得删除物理对象。

## 6. API 契约

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/video/catalog` | 返回可用供应商、模型、能力和价格展示 |
| `POST` | `/api/video/tasks` | 创建规范化任务，返回本地任务 ID |
| `GET` | `/api/video/tasks` | 按状态、来源、游标列出当前用户任务 |
| `GET` | `/api/video/tasks/[id]` | 查看单任务；可触发轻量唤醒但不承担唯一轮询责任 |
| `DELETE` | `/api/video/tasks/[id]` | 删除可删除任务/历史；处理中先尝试取消 |
| `POST` | `/api/video/tasks/[id]/retry` | 使用原始快照新建任务，生成新幂等键 |
| `POST` | `/api/video/tasks/[id]/send-to-canvas` | 将既有结果创建/定位为画布视频作品 |
| `GET` | `/api/video/results` | 历史结果分页与多设备同步 |

兼容期保留 `/api/video/generate` 和 `/api/video/tasks?id=`，内部改为调用新应用层；画布和 Agent 分批迁移后再删除旧入口。

返回结构统一包含：

```ts
{
  ok: true,
  task: {
    id, source, sourceId, providerId, modelId,
    status, progress, prompt, parameters, references,
    cost, artworkId, videoUrl,
    error: { code, message, detail } | null,
    createdAt, startedAt, lastPolledAt, completedAt
  }
}
```

## 7. 后台任务执行器

### 7.1 要求

- 页面关闭、刷新、导航或 Agent 超时后，任务仍继续轮询、转存和结算。
- 多实例部署时只能有一个实例处理同一任务。
- 重启后从 PostgreSQL 发现 `queued/processing` 任务继续执行。
- 成功、失败、取消和未知结果状态分别处理；网络瞬时错误不能直接退款并终止。

### 7.2 建议实现

- 新增 `scripts/video-worker.mjs` 或独立 Node worker 入口，生产 Compose 作为单独进程启动。
- 数据库用 `FOR UPDATE SKIP LOCKED` 或原子租约领取到期任务。
- 建议基础轮询间隔 5 秒，并按模型/错误进行 5、10、20、30 秒退避。
- worker 只调用应用层，不复制 API route 逻辑。
- 当前 `poll_lock_until`、稳定产物 ID、事务结算和退款语义继续复用。
- 完成流程固定为：领取 → poll → 下载/转存 → 写作品与结果 → 精确结算 → 完成任务。
- 明确失败流程固定为：领取 → 写错误 → 幂等退款 → 释放预留 → 完成任务。

## 8. `/video` 工作台

### 8.1 页面布局

采用浅色三段式工作台，不照搬参考项目：

1. 左侧参数区：模型、提示词、素材、公共参数、模型特有参数。
2. 中央预览区：当前任务、视频播放器、进度、错误详情。
3. 右侧/底部历史区：进行中任务和结果卡，可响应窗口宽度切换布局。

### 8.2 状态

- `idle`：编辑配置。
- `validating`：校验模型能力和素材。
- `submitting`：创建本地与上游任务。
- `queued/processing`：显示真实进度、模型、开始时间和恢复提示。
- `completed`：播放、下载、发送到画布、按原配置再生成。
- `failed`：显示用户可读错误；详细错误按需展开；支持修正配置后重试。
- `cancelled`：保留配置快照，可重新生成。

### 8.3 第一版必须有

- 模型选择和能力驱动参数。
- 文生、单图、首尾帧、多参考图。
- 进行中任务恢复。
- 持久化结果历史。
- 原配置重试。
- 下载与发送到画布。
- 错误详情和退款状态。

视频/音频参考、多镜头与元素列表随对应适配器落地，不用无效控件提前占位。

## 9. 画布吸收方案

### 9.1 输入解析

沿用 Naumi 现有上下文：

- 文字节点或 `@文字` → `prompt`/分镜提示词。
- 图片节点 → 首帧、尾帧或普通参考图。
- 视频节点 → `source_video`/视频参考。
- 音频节点 → `source_audio`/音频参考。
- 已有作品血缘继续保存，不新增第二套 graph store。

只有用户在视频配置面板中明确指定素材角色后才提交，避免自动合并全部连线造成主体污染。

### 9.2 节点增强

- 统一视频配置面板替代当前固定 4/8/12 秒小弹层。
- 处理中节点保存真实 `taskId`，刷新后从任务 API 恢复。
- 视频播放器增加真实进度条、拖动、全屏和选中外自动暂停。
- 从首帧、尾帧、当前帧生成图片节点。
- 音轨分离为音频节点；服务端使用成熟媒体工具执行，不在浏览器手写解封装。
- 复制、粘贴、删除、撤销继续走现有画布命令链。

## 10. Agent 能力

新增参数感知工具而不是在系统提示词里硬编码所有模型：

- `list_video_models`：返回当前可用能力。
- `plan_video_shot`：单镜头提示、运镜、时长、参考素材角色。
- `plan_video_storyboard`：多镜头结构和每镜时长。
- `generate_video`：升级为规范化请求并返回可恢复任务 ID。
- `extend_video`：仅在模型支持时出现。
- `edit_video`：仅在模型支持视频参考/编辑时出现。
- `get_video_task`：Agent 超时后查询既有任务，禁止重复创建。

自动提交必须保留用户原始素材选择、模型和价格信息；不支持的参数由能力校验直接反馈给 Agent。

## 11. 分阶段文件级实施记录

### Phase 1：领域基础与后台恢复（已完成）

目标：现有 OpenAI Videos 功能迁入新架构，关闭浏览器后仍能完成。

新增：

- `src/lib/video/types.ts`
- `src/lib/video/capabilities.ts`
- `src/lib/video/providers/adapter.ts`
- `src/lib/video/providers/openai-videos.ts`
- `src/lib/video/service.ts`
- `src/lib/video/repository.ts`
- `src/lib/video/worker.ts`
- `src/app/api/video/catalog/route.ts`
- `src/app/api/video/tasks/[id]/route.ts`
- `scripts/video-worker.mjs`
- `scripts/verify-video-domain.mjs`

修改：

- `src/lib/db.ts`
- `src/app/api/video/generate/route.ts`
- `src/app/api/video/tasks/route.ts`
- `docker-compose.yml`
- `.env.example`
- `scripts/verify-video-task-safety.mjs`

退出条件：旧画布和 Agent 请求行为等价；服务重启和浏览器关闭后任务可恢复；成功/失败计费仍幂等。

### Phase 2：原生视频工作台（已完成）

新增 `/video` 页面、工作台组件、历史卡、任务恢复、重试和发送到画布。删除或重写模拟 `src/components/generate/video-studio.tsx`。

退出条件：用户在独立页面完成一次文生和一次图生视频，刷新后任务不丢失，历史可跨设备读取。

### Phase 3：供应商适配器（已完成代码与协议 fixture）

按验证成本逐个实现：

1. OpenAI Videos（已有迁移）
2. Ark Seedance
3. Kling/Kie 或 API Mart
4. Gemini/Veo
5. MiniMax/H3
6. RunningHub/AutoDL 工作流扩展

所有适配器已提交能力声明、请求映射、响应归一化、错误归一化和契约测试。OpenAI Videos 兼容端点已完成真实供应商验收；其余适配器在取得对应凭证后按同一脚本级别补充外部验收记录。

### Phase 4：画布视频生产工具（已完成）

完成统一配置、上下游多媒体引用、任务恢复、抽帧、音轨分离、全屏和时间轴。

### Phase 5：Agent 视频技能（已完成）

完成模型目录、单镜头、多镜头、续写、编辑和任务恢复工具。

### Phase 6：性能与完整验收（本地完成，外部供应商分层验收）

已完成生产构建、50 条历史上限的按需媒体加载、长任务恢复、独立 worker、数据库互斥租约、媒体持久化和真实浏览器回归。真实供应商按“OpenAI 已实测、其他协议 fixture 已通过、其他真实凭证待部署环境提供”分层记录，禁止把 fixture 冒充真实质量验收。

## 12. 验收标准

### 12.0 本轮验收结果

| 验收层 | 结果 |
| --- | --- |
| TypeScript / lint / domain contracts / task safety | 通过 |
| 8 协议 fixture | 通过，24 次 HTTP 调用 |
| PostgreSQL 运行时 | 通过：租约、幂等、计费、退款、筛选、删除 |
| 独立 worker | 通过：单次领取、完成、持久化、血缘 |
| Next.js 生产构建 | 通过：80 个静态页面 |
| 浏览器登录态 E2E | 通过：工作台、删除、恢复、合并、时间轴、抽帧、音轨、刷新持久化 |
| 真实供应商 | OpenAI Videos 兼容端点通过；其他供应商等待各自有效凭证 |

### 12.1 任务与计费

- 同一幂等键最多创建一个本地任务。
- 同一上游成功任务最多落一个结果和一个画布作品。
- 成功只扣一次实际快照价格；明确失败只退一次；瞬时轮询错误不退款。
- 浏览器关闭、刷新、服务重启后任务继续并可被重新发现。
- 两个 worker 实例并发时不存在重复下载、重复结算或重复作品。

### 12.2 模型与适配器

- 每个模型只展示其支持的参数组合。
- 非法时长、清晰度、素材数和互斥组合在服务端被拒绝。
- 请求、状态、结果和错误统一归一化，供应商密钥和大块媒体数据不进入日志。
- 真实供应商验收与模拟契约测试分开记录。

### 12.3 工作台与画布

- `/video` 可恢复进行中任务、展示历史、下载、重试和发送到画布。
- 视频结果在 Media、Agent、工作台和画布四处均可播放。
- 首/尾/当前帧抽取生成具有血缘关系的图片节点。
- 画布处理中的视频节点刷新后恢复真实进度，失败时显示可读原因和退款状态。
- 50 个视频历史卡和大型画布下不出现持续主线程长任务或媒体同时自动加载。

### 12.4 回归

- 当前 `verify-video-task-safety.mjs` 继续通过。
- TypeScript、lint、生产构建通过。
- 图片生成请求参数和资源顺序与改造前一致。
- 本地存储和 R2 两种产物路径分别验证。
- 未登录/登录、单设备/多设备、成功/失败/超时/取消分别验证。

## 13. 已解决问题与持续运维项

### 13.1 已解决

1. 常驻 worker、页面关闭后任务恢复、任务列表和来源筛选已经完成。
2. Agent 的 `imageUrl` 已转换为首帧引用，不再静默退化为纯文生视频。
3. 创建时保存供应商标识、模型、请求、能力和价格快照；worker 按任务中的供应商标识与请求快照处理，切换默认模型不改变历史模型选择和结算。
4. 适配器使用结构化状态与 `TransientPollError` 区分明确失败和可重试异常。
5. 工作台旧模拟组件已经下线；历史区只加载当前预览视频，避免同时拉取 50 个视频媒体流。
6. 本地媒体引用在远程供应商不可访问时会明确拒绝，配置 `VIDEO_REFERENCE_PUBLIC_BASE_URL` 后才转换为公网地址。
7. Gemini 与 AutoDL 使用实际选择的模型/工作流路由，不再固定使用供应商默认项。

### 13.2 持续运维项

1. 部署时为每个启用供应商执行真实凭证、配额、限流和产物质量验收。
2. 生产环境根据容量设置媒体保留周期、用户配额和孤儿对象清理任务。
3. 大规模画布继续通过节点可见性和按需媒体加载监控主线程、内存和网络占用。

## 14. 交付结论

Phase 1–6 的代码吸收、本地运行时和浏览器垂直切片已经完成。Naumi 现在以自身 Next.js、PostgreSQL、鉴权、积分、存储和 React Flow 体系承载完整生视频子功能；参考项目只作为能力来源，不作为运行时依赖。后续新增供应商只需补充运行时配置、能力声明和同级真实验收，不再改写视频生产主链路。
