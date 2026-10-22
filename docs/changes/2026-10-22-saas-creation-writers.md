# SaaS 创作接受、恢复和结果证据接入

更新：2026-10-23。模块 M04。独立分支 `codex/saas-tenant-core-20261022`，在普通 merge 主实施固定提交 `615d8f4a` 后实施；merge 为 `c3984eca`，冲突只采用主实施的企业 scope 和租户服务版本。未改共享 checkout、reader、schema、公共详情契约或 UI。

## 实现边界

证据层记录可信 actor、冻结空间、真实 payer、原话/公开参数/显示名快照、输入、结果与稳定来源关系；它不代替原调度、供应商幂等或账务状态机。账号与企业身份独立：新企业接受请求重新验证权益，已接受的持久任务恢复只读其冻结 scope，不按当前成员关系重算归属。没有 scope 的旧恢复不推断 tenant。

同一功能的账号授权与企业非禁用策略先求交集，再按既有 catalogue 的 all/any 计算；共享 imagegen 的 any 是可替代入口，不能因企业禁 agent 就连带禁用已授权的手动图片生成。Agent 工具还按 TOOL_ACCESS 的实际工具 key 校验。显式 false 不被默认值覆盖，body email/role 不提供授权。

## 真实入口映射

| 业务入口 | 接受时接入 | 恢复与完成接入 | 来源/例外 |
| --- | --- | --- | --- |
| 通用图片、套图、A+、imagegen | `image-job-repository.createImageJob` 原事务中的 accept；`DurableImageJobs.create` 原始 payload 的受管输入 | 原 `durable-image-jobs` 冻结恢复；`saveImageJob` 与 source snapshot；`addArtworksTx` 记录所有产物 | `image:generate/suite/aplus/imagegen`；未改变 paidOperation/租约/重试条件 |
| imagegen 多提示词批次 | `imagegen/batch.submitAcceptedImagegenBatch` 同事务创建根记录和 plan.creationScope | `submitNextLocal` 从父 plan 继承；tick 记录真实 partial/failed/cancelled；取消申请独立事件 | `imagegen-batch`，子 image job 保留父子关系，不重复统计顶层 |
| Agent 普通/画布会话 | `agent/runtime` 在实际 prompt 前绑定 sessionId 与接受 turn 根；纯文本轮也记录 | originalPrompt 的执行链运行于冻结 scope；工具 continuation 沿既有 HMAC；轮末记录文本/部分失败/中断 | `agent-turn`，sourceId 为 sessionId:turnId。`api/agent` 原 withBiRequest 与 `naumi-tools.internal` 原 continuation 已覆盖，无需复制路由 |
| 视频与 BYOC 视频 | `db.createVideoTaskWithReservation` 原预占事务内 accept、source link、billing link、parameters.creationScope | `video/service.pollAndSettleLocal` 冻结恢复；`completeVideoTask/failVideoTask`；attention/creation_unknown；`video/cancellation` 区分申请与确认 | `video`，真实扣款账号沿旧计费层，绝不换成老板；无quote且cost=0有明确站内免扣证据 |
| 画布异步改字 | `/api/canvas/image-tasks` 的 scope wrapper；`db.createCanvasImageTaskWithReservation` 原事务accept | `canvas-image-tasks.processCanvasImageTask` 冻结恢复；原图引用、标准化图和实际mask分别记录；DB complete/fail | `canvas-image`；不改已有 paidOperationVersion、submission guard 或模型冻结版本 |
| 本地图像裁剪/处理/替换 | `/api/canvas/local-image-edit` 接受 operationId 与源图片 | 原 saveCanvasLocalEdit 完成后关联确定结果 | `canvas-local-edit`，本地处理不冒充模型生成 |
| 画布复制 | `/api/canvas/nodes/copy` scope 和所有对象引用检查、原始来源 | 原 copyCanvasNodes 的返回 artworkIds；不执行生成 | `canvas-copy`，私有素材显式选择可进入企业，其他企业对象ID拒绝 |
| 工作流导入 | `/api/canvas/workflow-import` 接受原 operationId | 原流式 importCanvasWorkflow 完成后记录全部图片及文本 | `workflow-import`，导入不冒充模型执行 |
| ComfyUI 图片/视频 | `/api/comfyui/run`；图片用 claimCreation 在queuePrompt前建立唯一接受回执；视频仍走原 BYOC task | 图片真实结果与全部产物；视频归原持久video恢复 | `comfyui`，重复同operationId返回409，不再次queuePrompt；未新增供应商重试 |
| 同步工具、upscale、printfile | 原 `withBillingRequest` 统一 scope、接受、公开表单参数与原始文件；这两个原路由已使用该包装 | 原 action/settlement 后记录文本/产物；SSE 由complete/failSynchronousStream明确收尾 | 原 feature ID；未知费用不自动填0。`title-gen` 免费路径单独接入真实用户idea和最终完整标题/卖点 |
| 原始图片与音视频上传 | imagegen inputs 路由+input-assets、video references 路由+reference-upload | `app_creation_contexts` 的 media 命名空间固定scope；accept时再次校验 | `asset-*` 在 app_media_assets 中核对owner，不误当作品；不改私人原素材归属 |
| 实际上游图片输入 | `bi/model-observer.observeOpenAI` 的 images.edit 传输钩子 | `captureProcessedCreationInputs` 存实际SDK File/Buffer和mask；原始上传另列original | 存受管引用及可用的hash/MIME/大小，不保存密钥、请求头或无边界上游payload |
| 画布文字产物 | `db.saveCanvasTextNode` 原写入后安全证据事务 | 稳定 text-node link + 实际文本快照 | 不把生成中文字节点再当作新顶层生成 |

`db.createVideoTask` / `createCanvasImageTask` 旧低层无预占函数在实际 src 调用图中没有服务端调用者，仅保留兼容导出；本轮真实入口使用 WithReservation，不把未调用路径冒充真实验收。浏览器端 `video/client.createVideoTask` 是HTTP客户端，不是另一个服务器接受器。

## 冻结、媒体与账务合同

- `app_creation_contexts` 的 project scope 固定项目/会话；没有显式 workspace header 的后续请求继承已持久父空间，显式冲突返回409；已存在且无企业归属证据的旧项目不自动划入企业。
- 原图、已转换输入和蒙版分别写 original/processed。现代私有 input asset 保存原始受管引用；旧通用图片 payload 中的 p.images 是上传原bytes，不能错标成processed。实际SDK files另存processed。素材角色、顺序和未知 metadata 均保真，不用当前配置猜旧显示名。
- 输出使用稳定 artwork/text-node link，多次落库和多个产物不因固定position=0被截断；相同产物与事件去重。
- 明确免扣仅使用 `app_creation_links(target_type='no-charge', relation='explicit-no-charge', target_id=sourceId)`。白名单为本地处理/复制/导入、免费标题、BYOC ComfyUI，以及无quote且明确cost=0的视频/画布任务。其他无账务记录仍为未知，不能全当0。企业归属与payer分开；payer仍为原账号。
- read端由主实施对免扣、pending和source结果投影，writer不通过读接口补扣/退款/补派。

## 证据故障与恢复约定

| 来源 | 主业务保留 | 证据待核查标记 |
| --- | --- | --- |
| image job | 原 snapshot/checkpoint 和任务租约先提交 | `snapshot.creationEvidencePending=true` |
| video/canvas | 原 status、结果、结算在原事务中完成，证据单独 SAVEPOINT | `parameters.creationEvidencePending=true` |
| batch | 原 items/result 和 batch state | `plan.creationEvidencePending=true` |
| SDK实际输入 | 原调用仍仅执行一次，不因副证据错误触发重试 | `evidence:processed-pending` 事件；requestScope.evidencePending 由后续saveImageJob带入持久snapshot |
| 独立文本/本地结果 | 原领域结果保留 | finishCreation尽力标record needs_review；不抛出副证据故障重发原操作 |
| 账务释放证据 | 原实际settlement及reservation释放继续提交 | `app_billing_operations.result_response.creationEvidencePending=true`，不会回滚账务并授权重复付费 |

只读恢复须使用确切 source link：image snapshot.result.artifacts/images/shots、video parameters.resultArtworkIds/resultAssets、canvas result_artwork_id、batch item.result.artifacts。缺失资产/事件可做受控只读投影；不能仅见flag就声称资料完整，也不能由reader写业务或重发收费请求。

## 集中验证与限制

真实本地 PostgreSQL 16，复用既有只回环 cluster 的55439端口；本轮新建独立 `saas_creation_writers_fixture_final`，未访问主预览 `saas_admin_fixture`，未连接服务器。命令：`NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=<127.0.0.1独立fixture库> tsx --conditions react-server scripts/verify-saas-creation-writers.ts`。

集中通过：根/文本/零消费结果、多个图片产物、事件去重、项目空间继承与冲突、canonical all/any权益交集、asset-*输入、上传空间固定、跨企业对象拒绝、同一Comfy接受回执不重执行、image副证据INSERT故障业务checkpoint仍done、SDK实际文件和mask捕获、SDK证据失败fixture transport恰好调用一次、视频离职后冻结scope完成、canvas终态、batch冻结scope/未提交取消、payer不变、账务释放副证据UPDATE故障仍settled。

SDK fixture transport为显式本地假客户端，用于故障和调用次数断言，不是供应商回执。供应商真实调用0；Agent真实模型轮、BYOC真实端点、在线转码和完整UI E2E未由本子模块执行，不作已验收声明。源码已接入这些实际文件，但不能用代码钩子代替真实业务全链路验收。

对本模块入口与传递依赖的 TypeScript Compiler API 检查 `TARGETED_DIAGNOSTICS=0`，`git diff --check`通过。正式全仓类型/构建、集成reader/API、三页面浏览器、私有媒体撤权和视觉QA由主实施/根任务集中验收；本子模块没有发布。

模块同步计数：本子任务累计 M01+M04 两个功能模块；M04前已普通merge主实施固定基线。整体满3模块的fetch/最新main整合由主实施统一执行，本分支不擅自更新main或发布。
