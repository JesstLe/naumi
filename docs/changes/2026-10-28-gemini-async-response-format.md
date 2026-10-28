# Gemini 异步适配器响应格式与失败留证修复

## 模块与职责

处理 Nano Banana Pro / Gemini 在应用异步图片通道失败、供应商调用停在 submitting 且 evidence 为空的问题。复用现有异步任务、报价、台账和幂等，不增加执行架构、Redis、并发参数或新的重试器；47 暂缓发布保持。

## 证据与根因

- 只读绑定当前 nginx→Web→DB，线上来源仍为 `e2217c983fe74f4829f2cacb3f69305428af0b11`，模型配置 v152。滚动时间窗中的旧 Gemini 失败主要是本地参数准入拒绝，不能全部解释成“提交后漏解析 task_id”；只有最新样本留下异步提交 marker。最新调用约 4 秒退出，不支持“生成等待太久”的解释。
- 复核已有探针：纯文本请求未携带 `output_format`，返回 `data[0].task_id`；现有解析器支持该格式，也支持响应版本头下的 `data.id`。
- 2026-10-28 12:37，北京时间：使用自制纯色 256×256 参考图、单张、同样的 high/4K/3:4 参数及应用响应版本头，独立诊断请求明确返回 HTTP 400：`unsupported response format for gemini-3-pro-image-preview: png; only \`url\` is supported`。不是用户原任务重提。
- 根因位于 `apimartImagesFetch` 的 payload 默认字段：在管理员映射之外无条件补 `output_format: png`。Gemini 把它当响应传输格式，只接受 URL；上游因此在受理前返回错误，没有 task_id。应用又丢弃错误体的诊断字段并将异常封装为 Pending，留下 submitting/空 evidence。旧记录未保留原始响应，所以上述是相同参数差异的独立复现，不把历史每一笔都归为同一根因。
- 12:45 的单次修正探针只去掉该默认字段，返回 HTTP 202＋真实 `data.id`。随后只查询一次该任务：completed，下载并解码通过，3584×4800 JPEG、6,262,124 字节；供应商记录成本 0.0285 USD。两个探针共两次新 POST（第一笔 HTTP 400、第二笔受理），均是独立纯色诊断图，未重放原业务任务。真实上游链路通过不等于修复已部署，也不是原用户画布/账务的线上验收。

## 公共接口、依赖与数据归属

- 通用 APIMart 异步适配器只发送已配置映射字段；本地最终导出 PNG 与上游 URL 响应不是同一参数。既有下载、解码、交付与结算路径保持。
- 显式格式映射和显式 omit 继续生效；历史 GPT 默认预设的 PNG 契约保留。没有按 UI 模型名增加特殊开关。
- `supplier-cost/adapter-failure.ts` 拥有安全诊断投影及调用台账写入：保留阶段、HTTP 状态、有限失败分类、字段名、响应 SHA-256 和观察时间，不存任意上游文案、URL、提示词、认证信息。
- 已发出但没有 task_id 的调用记 unknown，不伪装成仍在提交或免费失败；原 marker、费用未知和禁重放语义保持。已知 task_id/完成状态/费用不因诊断写入被覆盖。
- 新诊断沿用后台已有 `httpStatus`、`failureCategory`、`upstreamFailure` 字段，无新表或迁移。失败留证异常不替换原始处理异常。

## 本次实现

1. 移除通用异步通道未经映射的 PNG 默认值，仅保留历史预设例外和管理员显式值。
2. 保留非 2xx/非法 JSON 的有限诊断，区分 upload、submit、submit-receipt、persist-task、poll、download、deliver。
3. catch 留证并仅将无 task_id 的 submitting 调用转为 unknown；保留 marker，重复调用仍不 POST。明确 not_charged 的原处理与留证保持。

## 集中验证与证据层级

- `scripts/verify-apimart-response-format.ts`：真实适配器函数、固定 HTTP 传输、隔离 PostgreSQL、任务查询、图片字节解码。覆盖 Pro/Flash 4K 参考图、202/data.id 与 200/data[0].task_id、GPT 显式格式/omit、历史预设、400 留证、非法 JSON、缺 task_id、丢回执以及重复调用不重提。供应商为回环夹具。
- 既有 `verify-apimart-async-images.ts`：53 项通过，含 16 参考图、直接/家族路由、竞争 CAS、disabled 后只读恢复、未知受理、成本与 acceptedOutputs。
- 原 `verify-apimart-default-preset.ts` 在第 62 行的旧 `assertQuotedVersion` 必须抛错断言失败，发生在适配器测试之前；当前 main 已把客户端报价数字校验改为兼容 no-op，本次未修改该函数/旧断言。保留原失败，不称整套测试全绿；历史 preset 的本模块传输契约另有定向验证。
- 本轮此前发现的 `verify-imagegen-frozen-quote-client.ts` 旧 VM 缺 `Event` 也原样保留；与本次源码差异分开记录。新报价/坐标专项及其他回归结果见集中证据。

证据根目录：`E:/Workspace/naumi/output/canvas-result-placement-fix-20261028/gemini/`。原业务任务、UNKNOWN、线上配置未改；源码整合与线上生效分别验收。

## 未完成项与下一步

最终类型检查、main 整合、四产物及副本回滚以根目录 `VERIFICATION.txt` / `DELIVERY.json` 为准。47 仍未发布，历史业务任务不自动补跑。
