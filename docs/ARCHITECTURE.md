# Naumi 开发者架构文档

> 2026-10-24 由只读架构梳理生成；所有路径均经仓库抽查验证。供新会话开发者快速建立全局认知。

Next.js 15(App Router) + PostgreSQL + S3 兼容对象存储的 AI 生图/视频/画布 SaaS。单仓库，`src/` 为 Next 应用，`scripts/` 为验证/运维脚本与独立 worker，`docker-compose.yml` 编排 `db / app / media-worker / video-worker` 四个服务。

## 1. 顶层结构

| 目录 | 职责 |
|---|---|
| `src/app/api/` | 全部 API 路由（见下） |
| `src/app/{generate,canvas,video,works,...}` | 产品页面：生图页、画布、视频、作品库、工具页（upscale/cutout/tryon/recolor/dewatermark/inpaint/fuse/aplus/suite/printfile/ipcheck 等 40+ 路由段）、账号（account/checkout/cardkeys/licenses/plans/pricing/team）、admin、agent、genchat/brain、templates、enterprise、dashboard/hub |
| `src/components/` | 与页面一一对应的客户端组件：`canvas/canvas-client.tsx`（画布主客户端）、`generate/generate-client.tsx`（生图页）、`imagegen/imagegen-panel.tsx`、`admin/model-management/`、`video/`、`works/`、`credits/`（计费确认弹层）等 |
| `src/lib/` | 服务端子域：`model-config/`（模型/通道配置）、`billing/`（计费）、`imagegen/`（结构化生图管线）、`video/`（视频域）、`agent/`（画布 Agent harness）、`canvas/`（画布领域逻辑）、`durable-image-jobs.ts`（图片任务持久化/租约）、`db.ts`（schema+查询）、`storage.ts`+`object-storage/`（S3/local）、`supplier-cost/`（供应商成本台账）、`feature-access/`、`teams/`、`bi/`、`comfyui/`、`image-skills/` 等 |
| `scripts/` | ① `verify-*`/`*-smoke.mjs` 契约与冒烟验证（约 600+ 个）；② `*-fixture.ts` 测试夹具；③ 独立 worker 入口 `video-worker.mjs`、`video-media-worker.mjs`；④ 子目录 `ops/`（线上运维脚本）、`migrations/`（增量 SQL）、`video-fusion/`（ffmpeg 媒体引擎）、`staging/`、`fixtures/`；⑤ 部署脚本 `deploy-release.sh`、`fleet-*` |
| `services/` | 独立小服务：`pricing-service/`（价格目录服务，含回滚脚本）、`reference-workbench/`（待确认：参考图工作台后端） |
| `deploy/`, `vendor/`, `data/` | 部署资产、内嵌依赖、本地数据（待确认细节） |

### app/api 主要路由组

| 路由组 | 职责 |
|---|---|
| `api/generate-image` | 核心生图/图生图端点：创建 durable job→上游调用→落库→结算，GET 轮询 |
| `api/imagegen`(+`plan/batches/cancel/capabilities/inputs`) | 结构化生图 v2：意图解析→计划/报价→多步执行（生成+抠图+蒙版+后处理） |
| `api/canvas/*` | 画布域：nodes、image-tasks、expand、annotate、local-image-edit、ocr、text-*、video-nodes、video-workflows、history、assistant |
| `api/billing` | `catalog`（计费目录）、`quote`（报价） |
| `api/payments`、`api/redeem`、`api/cardkeys`、`api/credits` | 充值/卡密/兑换/积分 |
| `api/admin/*` | 管理端：`model-management`（模型配置发布）、`billing`、`users`、`settings`、`supplier-cost`、`teams`、`bi`、`fleet` 等 |
| `api/video/*` | 视频：`generate`、`tasks`、`worker/tick`（worker 入口）、`media-jobs`（ffmpeg 任务）、`byoc`、`workflows`、`references`、`results` |
| `api/agent`(+`session/artifacts/verify-image`) | 画布 Agent 对话与工具执行 |
| 其他 | `artworks`、`media`、`templates`、`genchat`、`comfyui`、`competitors`、`text-models`、`prompt-assist`、`cutout/upscale/tryon/...`（各工具端点）、`health`、`setup`、`internal` |

## 2. 核心数据流

### 2.1 生图请求流（旧链路 /api/generate-image）

1. 前端：`src/components/generate/generate-client.tsx` 经 `billing.submit("/api/generate-image")`（`src/lib/billing/client.tsx`）POST，带 `x-naumi-billing-operation-id`；画布走 `src/components/canvas/canvas-client.tsx`（画布内先进 `submitCanvasImagegen`=`src/lib/imagegen/canvas-client.ts` 升级为 imagegen 链路，否则直 POST）。
2. `src/app/api/generate-image/route.ts` `POST`：`canvasParameterError` 校验 → `withBillingIntent`（`src/lib/billing/intent.ts`，写 `app_billing_intents` 提交回执防重）→ `handleObservedPost`。
3. 入口校验：`parseParams` → `rateLimit`（`src/lib/rate-limit.ts`）→ `resolveUserEmail`（`src/lib/admin-auth.ts`）→ 模型目录 `getImageModelCatalog`/`routeImageModel`（`src/lib/image-model-catalog.ts`/`image-model-routing.ts`，由 model-config 派生）；BYOK 走 `src/lib/user-image-provider.ts` 冻结快照。
4. 冻结执行上下文：请求被 `withModelRequest`（`src/lib/model-config/requests.ts`）包裹，按路径/表单推导 ModelFacts，`executor.resolve`（`execution.ts`）生成 `ExecutionBundle` 存入 AsyncLocalStorage（`context.ts`）；`currentModelExecution("image")` 即取用。
5. 报价预占：`resolveConfiguredImageQuality`（`model-config/image-quality.ts`）→ `quoteForRequest`（`src/lib/billing/server.ts` → `quote`（`billing/quote.ts`））→ `JOBS.create` → `src/lib/image-job-repository.ts` `createImageJob`：写 `app_image_jobs` + `billingService.reserveTx`（`billing/service.ts`：`app_billing_operations` prepared→reserved、`app_credit_batches` 按序扣、`app_gen_reservations`、`app_users.credits_used`）。
6. 执行：`kickGeneration` → `JOBS.kick`（`src/lib/durable-image-jobs.ts`）→ `claimImageJob` 抢租约（`lease_token`+120s，`heartbeatImageJob` 续约）→ `withFrozenExecutionBundle(payload.modelExecutions)` 恢复冻结配置 → `runJob`。
7. 供应商调用（`paidOperation` 幂等包裹，`durable-image-jobs.ts`）：
   - 默认/BYOK-OpenAI 协议：`openaiImages` → `modelAwareOpenAI`（`model-config/clients.ts`）→ `executionOpenAI(scope)`，其 fetch 为 `channelRoutingFetch`（`model-config/channel-fetch.ts`）：`claimChannel`（`channel-scheduler.ts`：pg advisory lock + `app_model_channel_balances` 加权轮询 + `app_model_channel_health` 熔断探活 + `app_model_provider_leases` 并发容量）→ 换 `Bearer 通道 apiKey` 转发上游 → `recordChannelOutcome`。外部 Router/pool 目标走 `NAUMI_ROUTER_MANAGEMENT_URL` 网关（`router-client.ts`）；apimart 协议走 `model-config/apimart-preset.ts`（提交/轮询任务+supplier-cost 台账）。
   - new-api-flow 协议：`newApiFlowImages` → `src/lib/new-api-image.ts`（chat-completions 协议生图）。
   - 执行基座：`withImageOperation`（`src/lib/image-gateway.ts`）记录已提交凭证，`ImageOperationPending` 表示"上游已收单但结果未知"。
8. 后处理：透明校验 `inspectImagegenPixels`（`imagegen/postprocess.ts`）→ 业务后处理 `runPostprocess`（`src/lib/media-postprocess.ts`）或 `enforceOutputShape`/`upscaleImages`（sharp 裁切/放大）→ `attachImageDimensions`。
9. 持久化与结算：`persistToStorage`（route.ts 内）→ `uploadImage`（`src/lib/storage.ts` → `object-storage/adapter.ts` S3/local）→ `addArtworks`（`src/lib/db.ts` → `app_artworks`，含血缘 parentId/provenance）→ `JOBS.settleResults` → `repository.settleImageJob` → `billingService.settleTx`（`settlementFor` 按 executedQuality 结算，`app_ledger` 记 consume、释放 `app_gen_reservations`）→ `auditSettledImage`（`src/lib/image-quality-request.ts` → `app_image_cost_audit`）。
10. 前端 GET `?job=` 轮询（`generate-client.tsx` 的 `useImageJobResume`=`src/components/use-image-job-resume.ts` 做断线恢复）。

**imagegen 新链路差异**：`POST /api/imagegen` → `submitImagegen`（`src/lib/imagegen/dispatch.ts`）→ `planImagegen`（`imagegen/plan.ts`：`simulateModel`（`model-config/runtime.ts`）筛合格通道 + `quoteForActor` 报价，产出含步骤与 totalCredits 的计划，客户端确认 billingVersion/credits）→ `submitAcceptedImagegen` 建 kind=`imagegen` 的 job → `runParent` 逐步执行：generate 步经 `submitGenerationCore`（`imagegen/generation-core.ts`）构造签名内部 Request 后**进程内直调** `app/api/generate-image/route.ts` 的 POST（子任务复用旧链路全部计费/持久化），cutout 步直调 `app/api/cutout/route`（`imagegen/adapters.ts`）；蒙版合成 `preserveMaskedOutside`（`imagegen/mask.ts`）+ `saveCanvasLocalEdit`；最终汇总各子操作在 `app_billing_operations` 的 charged_credits。

### 2.2 计费流

- **报价**：`billing/quote.ts` `quote(snapshot, facts)` 按功能 tariff（matrix/api-cost-plus/cost-plus/usage/fixed 等模式）+ 规则（`billing/rules/`）算 `requestedCredits/authorizedCredits/reserveCredits`；`billing/server.ts` `resolveBillingFacts` 从请求头解析 model/provider/byok/metered，`freezeBusinessQuote`（`model-config/business-billing.ts`）叠加业务路由成本。
- **幂等**：HTTP 层 `withBillingIntent`（`app_billing_intents`，防丢失响应导致重复建任务）；操作层 `billing/service.ts` `lockOperation`（`app_billing_operations` ON CONFLICT + FOR UPDATE，`repository.ts`）——同 id 重放直接返回上次结果；`reserve→settle` 状态机，settle 受 `authorizedCredits` 上限约束（`settlementFor`）。
- **结算**：`task-operation.ts`/`image-job-repository.ts` `settleImageJob` 传入 `BillingResult{items:[{id,state,executedQuality}]}`；成功部分按实际执行档计价，失败按 `failureBps`，全失败释放预留。钱包在 `app_users.credits_total/used` + `app_credit_batches`（过期先扣 `debitOrder`），流水 `app_ledger`。
- **表角色**：`app_settings`（站点开关/计费版本指针）、`app_billing_config_versions`（计费配置不可变版本，`billing/catalog.ts`）、`app_billing_intents`（提交回执）、`app_billing_operations`（每次扣费操作+冻结 quote）、`app_gen_reservations`（在途预占）、`app_credit_batches`/`app_ledger`（余额与流水）、`app_image_jobs`（任务快照+payload 内冻结 billingQuote）、`app_image_cost_audit`（质量审计）、`app_billing_api_cost_reviews`/`app_billing_reconciliations`（api-cost-plus 人工核对）。

### 2.3 配置热生效流

1. **草稿**：`model-config/repository.ts` `stage()` 把管理端配置写入 `app_model_drafts` + 明细表（`app_model_providers/upstreams/public_models/pools/candidates/rules/bindings/business/image_presets/fixed_costs`），校验经 `model-config/schema.ts`。
2. **发布**：`publish()` 生成不可变 `app_model_config_versions`（canonical JSON + sha256 digest）+ `app_model_publications(phase=staged)`（同指纹幂等）。
3. **应用**：`model-config/runtime.ts` `apply()` → `prepareExecution()`：`compileRouterProjection`（`projection.ts`）→ `app_model_router_projections`（staged→preparing(租约)→prepared）→ `router.prepare/activate`（`router-client.ts`，推送到外部 Router 服务，env `NAUMI_ROUTER_MANAGEMENT_URL/TOKEN`）→ `markApplied` → `app_model_config_state.active_version` 切到新版本。任一步歧义保持 `unknown` 待人工核对，绝不半提交。
4. **读侧**：每个 API 请求经 `withModelRequest`（`requests.ts`）读 `repo.current()`（`app_model_config_state JOIN versions`）；imagegen 内部步带签名头 `x-naumi-accepted-model-context`（`accepted-context.ts`）冻结到提交时版本。`executor.describe`（`execution.ts`）把版本快照解析成 `ModelExecutionScope`（含连接/凭据 `model-config/credentials.ts`→`app_model_credentials`），任务恢复时用 payload 里冻结的 `modelExecutions` 走 `byVersion` 重放同一版本。
5. **通道发送**：scope 带 `supplierRouting` 时 `executionFetch`（`clients.ts`）切到 `channelRoutingFetch`（`channel-fetch.ts`）完成候选通道选择/熔断/审计（`execution-audit.ts`）。计费配置同理：`app_settings` 指针 → `app_billing_config_versions`，quote 可按 `byVersion` 读冻结版本。

### 2.4 worker 流

- **入口**：`scripts/video-worker.mjs`（compose `video-worker` 服务）每 15s POST `/api/video/worker/tick`（`x-video-worker-secret`，`VIDEO_WORKER_SECRET`≥32 字符）。
- **tick**（`src/app/api/video/worker/tick/route.ts`）聚合恢复：① `scanVideoWorkerOnce`（`video/worker.ts`→`video/service.ts` `recoverDueVideoTasks`：`claimVideoTaskPoll`（db.ts，`poll_lock_until` 租约）→ queued 用相同幂等键重提交上游（`video/submission.ts`，需供应商声明幂等能力，否则 `creation_unknown` 转人工）→ processing 查询上游→下载结果（`video/providers/`，adapter in `providers/adapter.ts`）→ `completeVideoResultSet`→结算；`touchReservation` 续约预留）+ `recoverVideoWorkflows`（`video/workflow.ts`）；② `recoverCanvasImageTasks`；③ `recoverDurableImageJobs`（`durable-image-jobs.ts`：`dueImageJobs()` 找租约过期/到期任务 → POST `/api/generate-image` 或 `/api/imagegen` body `{workerJobId}` → `imageWorkerAuthorized` 鉴权 → `kickGeneration`/`resumeImagegen` 重放）；④ `recoverReferenceWorkbench`；⑤ `scanSupplierCostsOnce`（`supplier-cost/worker.ts`）；⑥ `recoverMediaMirrors`/`recoverMediaJobs`（`video/media-jobs.ts` → `app_video_media_jobs`）。
- **进程内兜底**：`video/worker.ts` `startVideoWorker`（instrumentation 启动，20s 一批，`NAUMI_VIDEO_WORKER=0` 关闭）单机部署时可替代外置 worker。
- **media-worker**：`scripts/video-media-worker.mjs` 独立 HTTP 服务（:3001 health），`MEDIA_WORKER_SECRET` 鉴权，在 `/scratch` 卷沙箱跑 ffmpeg（`scripts/video-fusion/media-engine.mjs`），`worker-state.json` 原子写为回执，终态归档 `.retired/`。
- **image job 协议**：创建即冻结 `paidOperationVersion=1`；执行前 `claimImageJob` 租约 120s+心跳；`paidOperation` 记录每次上游提交（started/done/rejected + gatewayIdentity 摘要）——恢复时 done 直接回放结果、started 且不可重放则 `holdImageJobBilling` 转 `needs_attention`，绝不二次扣上游；`failUndeliveredImageJob` 处理"确认未送达"的失败释放。

## 3. 核心目录文件对应表

### src/lib/model-config（模型与通道配置）

| 文件 | 职责 | 被谁调用 | 调用谁 |
|---|---|---|---|
| `server.ts` | 组装 repo/runtime/router/credentials 单例 | 几乎所有需要配置的服务（billing/server、imagegen/plan、requests） | repository、runtime、router-client、bootstrap |
| `repository.ts` | 草稿/版本/发布的持久化与校验（app_model_* 表） | server.ts、admin/model-management 路由 | schema.ts、capacity.ts、frozen-capability |
| `runtime.ts` | `simulateModel` 通道资格模拟、`publicModelCatalog`、发布 apply、router projection 准备 | plan.ts、admin 路由、execution.ts | projection.ts、router-client、repository |
| `execution.ts` | 把冻结 ExecutionModel 解析成可执行 scope（凭据/通道/能力），`runBundle` | requests.ts、durable-image-jobs、video/service | context.ts、runtime.byVersion、credentials |
| `context.ts` | AsyncLocalStorage：`currentModelExecution`/`currentExecutionBundle`/`currentModelBillingSnapshot` | generate-image route、clients.ts、billing/server | — |
| `requests.ts` | `withModelRequest`：按 API 路径/表单推导用途并构建冻结 bundle | 各生成类 API route 包裹 | execution.ts、selection-policy、image-model-routing |
| `clients.ts` | `executionOpenAI`/`modelAwareOpenAI`/`executionFetch`，注入 channelRoutingFetch | generate-image route、channel-fetch、canvas 文字链路 | channel-fetch.ts、openai SDK |
| `channel-fetch.ts` | 通道化 fetch：多通道重试、审计、熔断记录 | clients.ts（scope 带 supplierRouting 时） | channel-scheduler、channel-image-response、execution-audit |
| `channel-scheduler.ts` | `claimChannel`（加权/优先级+健康+并发容量租约）、`recordChannelOutcome` | channel-fetch.ts | capacity.ts（app_model_provider_leases） |
| `channel-policy.ts` | 由 publicModel.supplierRouting 生成通道策略与候选 | execution.ts、channel-fetch | — |
| `apimart-preset.ts` | apimart 提交/轮询协议适配 + supplier-cost 台账 | clients.ts（protocol=apimart） | supplier-cost/adapters、transport.ts |
| `router-client.ts` | 外部 Router 管理 API（prepare/activate/seal） | runtime.ts、server.ts | env NAUMI_ROUTER_MANAGEMENT_URL |
| `projection.ts` | 编译 Router 执行投影（digest） | runtime.prepareExecution | schema.ts |
| `credentials.ts` | 供应商密钥存取（app_model_credentials，信封加密） | execution.ts、runtime.ts | settings-secret |
| `business.ts`/`business-billing.ts` | 业务级模型路由(按功能绑定)与业务报价冻结 | requests.ts、billing/server、execution | — |
| `tool-scope.ts` | 功能↔模型白名单、默认模型 | plan.ts、runtime.ts | — |
| `selection-policy.ts` | 平台模型选择校验（防 BYOK 越权指定平台模型） | requests、billing/server、generate-image | — |
| `image-preset.ts`/`quality-policy.ts`/`resolution-policy.ts` | 预设画幅/质量映射/分辨率映射 | runtime.simulateModel、requests | — |
| `image-quality.ts` | 请求档→执行档解析与默认档 | generate-image route、plan | — |
| `bootstrap.ts` | 旧 env 配置→首版 model-config 导入 | server.assemble | settings.ts |
| `management.ts`/`management-pricing.ts` | 管理端 DTO 与积分价目视图 | admin/model-management 路由 | — |
| `schema.ts` | ModelConfig zod 校验 + app_model_* 建表 | repository、runtime | — |

### src/lib/billing（计费）

| 文件 | 职责 | 被谁调用 | 调用谁 |
|---|---|---|---|
| `server.ts` | `getBillingRuntime`/`billingSnapshot`/`quoteForRequest`/`quoteForActor`/`meteringFor` | generate-image、video/service、各工具 API | catalog.ts、quote.ts、business-billing、model-config/context |
| `quote.ts` | 纯函数报价 `quote()` 与结算 `settlementFor()` | server.ts、service.ts | rules/*、costs.ts、money.ts、api-cost.ts |
| `service.ts` | `createBillingService`：grant/reserve/settle 事务状态机（幂等锁） | image-job-repository、task-operation、payments | repository.ts、quote.settlementFor、api-cost-ledger |
| `repository.ts` | app_billing_operations/app_credit_batches/app_ledger/app_gen_reservations SQL | service.ts | — |
| `intent.ts` | `withBillingIntent` HTTP 提交回执幂等 | generate-image 等 POST route | db.ts（app_billing_intents） |
| `request.ts` | operationId 解析、`assertQuotedVersion`/`requestQuoteConfirmation`、错误响应 | generate-image route、imagegen | — |
| `task-operation.ts` | 任务型计费操作构造 + video/canvas 指纹 | video/service、canvas 任务 | service.ts、fingerprint.ts |
| `catalog.ts` | 计费配置版本运行时（current/byVersion/publish） | server.ts | app_billing_config_versions |
| `rules/` | tariff 规则匹配与合并（registry/evaluate） | quote.ts | — |
| `costs.ts`/`money.ts`/`api-cost.ts`/`api-cost-ledger.ts` | 成本加成、分→积分换算、api-cost-plus 结算与台账 | quote.ts、service.ts | supplier-cost |
| `client.tsx`/`preview.tsx`/`products.tsx` | 前端计费确认弹层与提交封装 | generate-client、imagegen-panel 等 | — |

### src/lib/imagegen（结构化生图管线）

| 文件 | 职责 | 被谁调用 | 调用谁 |
|---|---|---|---|
| `dispatch.ts` | submit/resume/result：父任务状态机、子任务编排 | api/imagegen route、api/generate-image GET | durable-image-jobs、plan.ts、adapters.ts |
| `plan.ts` | `planImagegen`：意图→能力模拟→步骤+报价计划 | dispatch.ts、agent（submitAcceptedImagegen） | runtime.simulateModel、billing/server、tool-scope、capabilities |
| `generation-core.ts` | 组装内部签名 Request 直调 /api/generate-image POST | adapters.ts、dispatch | native-auth、accepted-context、prompt.ts |
| `adapters.ts` | 步骤执行入口（generate 走 generation-core，cutout 走 /api/cutout） | dispatch.runParent | generation-core、api/cutout route |
| `schema.ts`/`types.ts` | ImagegenRequest zod 契约 | route、plan、client | — |
| `intent.ts`/`legacy-intent.ts` | 意图解析（透明/编辑/抠图/后处理） | plan、generate-image route | — |
| `inputs.ts`/`input-assets.ts` | 输入素材读取（artworkId/asset-） | plan、dispatch、adapters | canvas-image-input.ts |
| `mask.ts` | 蒙版区域合成（保留未选区） | dispatch | sharp |
| `postprocess.ts` | 像素检查（透明/可见像素） | dispatch、generate-image | — |
| `capabilities.ts` | 能力发布视图与缺失检测 | plan、execution.ts | — |
| `client.ts`/`canvas-client.ts`/`http.ts` | 浏览器侧 SDK（start/poll/cancel/plan 预览） | imagegen-panel、canvas-client.tsx | — |
| `batch.ts` | 批量模式提交/恢复 | api/imagegen、route | dispatch.ts |
| `cancel.ts` | 提交幂等锁与停止（ImagegenStopped） | dispatch | — |

### src/lib/video（视频域）

| 文件 | 职责 | 被谁调用 | 调用谁 |
|---|---|---|---|
| `service.ts` | 视频任务全生命周期：提交/轮询/下载/结算/恢复 | api/video/* route、worker.ts | submission.ts、providers/adapter、model-config/execution、billing/server |
| `worker.ts` | `scanVideoWorkerOnce`/`startVideoWorker` 进程内恢复循环 | tick route、instrumentation | video/service、durable-image-jobs、supplier-cost/worker |
| `submission.ts`/`submission-schema.ts` | 创建校验+创建意图摘要（幂等键） | service.ts | billing/task-operation |
| `cancellation.ts` | 取消意图与确认协议 | service.ts、api/video/tasks | db.ts |
| `providers/`（adapter/config/openai-videos/protocols/wire） | 供应商协议适配与能力快照 | service.ts | settings、model-config scope |
| `media-jobs.ts`/`media-job-schema.ts` | ffmpeg 媒体任务（app_video_media_jobs）提交/恢复 | tick route、api/video/media-jobs | media-worker HTTP |
| `workflow.ts`/`workflow-schema.ts` | 视频工作流 DAG 与恢复 | tick route、api/video/workflows | service.ts |
| `repository.ts` | 视频任务轮询租约委托（db.ts 的 claim/release） | service.ts | db.ts（app_video_tasks） |
| `frozen-capability.ts`/`frozen-capability-schema.ts` | 发布时冻结视频模型能力 | repository.ts、execution.ts | — |
| `byoc.ts`/`byoc-settings.ts`/`byoc-recipe.ts` | BYOC（自带算力）执行路径 | service.ts | providers |

## 4. 外部依赖

- **上游供应商**：均为 OpenAI 兼容聚合站，运行时经 model-config providers 配置（非硬编码）。现役两家：GeekNow（`www.geeknow.top`/`r2.geeknow.ai`，被墙需经 Router 代理 `MODEL_CONFIG_PROXY_ORIGINS`）、apib（`api.apib.ai`，直连，协议 `apimart-images`，适配 `model-config/apimart-preset.ts`）。协议类型：`openai-images`/`openai-chat`/`new-api-flow`/`apimart-images`/`openai-videos` 等。代理白名单 env `MODEL_CONFIG_PROXY_ORIGINS`、信任来源 `MODEL_CONFIG_TRUSTED_ORIGINS`。
- **对象存储**：`src/lib/object-storage/`，驱动 `local | r2 | s3`（env `STORAGE_DRIVER`，aws4fetch SigV4，支持 path-style 与 presign）——S3 兼容（Garage/MinIO/R2 均可用；Garage 字样未在 src 中出现，属部署选择，待确认）。
- **外部 Router 服务**：模型池路由/凭据信封（`NAUMI_ROUTER_MANAGEMENT_URL/TOKEN`、`MODEL_CONFIG_ENVELOPE_SECRET`）。
- **postgres 核心表**（`src/lib/db.ts`、`model-config/schema.ts`、`billing/schema.ts` 等）：
  - 用户/作品：`app_users`、`app_artworks`、`app_projects`、`app_templates`、`app_user_favs`、`app_feature_access`、`app_user_image_providers`、`app_banned_ips`
  - 任务：`app_image_jobs`、`app_canvas_image_tasks`、`app_video_tasks`、`app_video_results`、`app_video_media_jobs`、`app_media_postprocess`
  - 计费：`app_settings`、`app_billing_config_versions`、`app_billing_intents`、`app_billing_operations`、`app_gen_reservations`、`app_credit_batches`、`app_ledger`、`app_orders`、`app_image_cost_audit`
  - 模型配置/调度：`app_model_config_state`、`app_model_config_versions`、`app_model_drafts`、`app_model_publications`、`app_model_router_projections`、`app_model_providers`、`app_model_upstreams`、`app_model_public_models`、`app_model_channel_health`、`app_model_channel_balances`、`app_model_provider_leases`、`app_model_credentials`
  - 成本台账：`app_supplier_calls`、`app_supplier_call_outputs`、`app_supplier_usage_buckets`、`app_supplier_variable_costs`
  - 其他：`app_agent_sessions`、`app_genchat_sessions`、`app_canvas_history_ops`、`app_licenses`
