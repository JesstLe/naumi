# naumi 参数/请求护栏全量审计（2026-10-24）

> 只读审计生成。总量：src/ 下 `ModelConfigError` 368 处、`BillingError` 65 处、`needs_attention` 残留 79 处。
> git 溯源：参数护栏主要来自 `ed267b10`（功能计费+模型路由后台）、`92ab9971`（收敛画布生图参数并拦截无效尺寸比例，2026-10-09）与 `32b17d18`/`a7a1b74b`（冻结执行快照）。
> **初衷多数是"计费口径与实际执行必须一致"（防按 A 价钱跑 B 规格），实现手段却是"提交前硬拒"——这是用户受伤的根源。**
> 项目方向（2026-10-23 定调）：**参数护栏只审计不阻断；付费创作显式请求不得被拒绝。**

## A. 资金安全类（幂等/防重复扣费/结算保护）——全部合理保留

| # | 位置 | 挡什么（用户视角） | 存在理由 | 判定 |
|---|---|---|---|---|
| A1 | src/lib/billing/intent.ts:27 | 同一提交编号被用于不同请求内容 → 409 | 防 replay 伪造/重复扣费 | 合理保留 |
| A2 | src/lib/billing/intent.ts:30 | 提交结果未知（响应丢失）→ 409 OPERATION_PENDING，任务保留不重复执行 | 防 HTTP 丢失后重复建任务 | 合理保留 |
| A3 | src/lib/billing/repository.ts:29 | 操作编号已用于不同计费操作 → 409 | 幂等指纹 | 合理保留 |
| A4 | src/lib/billing/repository.ts:40,64 | 积分账户不存在/可用积分不足 → 402 | 预占前余额检查 | 合理保留 |
| A5 | src/lib/billing/service.ts:48,70 | 不足额时不得占用他任务预留 → 402 | 预留池隔离 | 合理保留 |
| A6 | src/lib/billing/service.ts:84-87,106,114 | 核对编号幂等 / 未预占不可结算 → 409 | 人工核对流程保护 | 合理保留 |
| A7 | src/lib/billing/synchronous.ts:96,177 | 相同提交编号不同内容 / 任务已提交 → 409 | 幂等 | 合理保留 |
| A8 | src/lib/billing/synchronous.ts:143-145,194,216 | 上游结果/费用未知 → 落 manual + "结果已保留…请勿重复提交" | 防未知付费结果被重复提交或漏记账 | 合理保留（文案可更友好，需配管理员核查 UX） |
| A9 | src/lib/billing/request.ts:12 | 提交价与最新报价不一致 → 409 PRICE_CHANGED | 防按旧价扣费争议 | 合理保留（前端自动重报价，正常无感） |
| A10 | src/lib/billing/quote.ts:112 | 结算超过授权积分 → 409 | 结算上限 | 合理保留 |
| A11 | src/lib/db.ts:734 | FIFO 扣完仍缺 → 402 INSUFFICIENT_CREDITS | 余额保护 | 合理保留 |
| A12 | src/lib/db.ts:4891-4892,5600 | 操作编号已用于不同视频/画布任务 → 409 | 幂等指纹 | 合理保留 |
| A13 | src/lib/video/service.ts:214、node-submission.ts:14、byoc.ts:50,83、script-assets.ts:46、assets.ts:20、workflow.ts:70-78 | 操作/指纹编号冲突 → 409 | 全视频链路幂等 | 合理保留 |
| A14 | src/lib/imagegen/dispatch.ts:118,126、batch.ts:31,44 | 提交/批次编号冲突 → 冲突报错并 resume 原任务 | 幂等重放而非拒绝 | 合理保留（好范例：命中即返回原结果） |
| A15 | src/lib/imagegen/batch.ts:33、dispatch.ts:120 | 未确认最新报价/积分 → 拒 | 两步确认（plan→submit）防价格漂移扣费 | 合理保留 |
| A16 | src/lib/canvas/node-copy.ts:20,35、video-node-repository.ts:39 | 复制操作编号冲突 → 409 | 幂等 | 合理保留 |
| A17 | src/lib/durable-image-jobs.ts:144-167 | 付费上游已 started 且不可重放 → ImageOperationPending + holdImageJobBilling；400/401/403/422/429 明确拒绝可安全重试 | 防重复付费提交 | 合理保留（核心资金闸） |
| A18 | src/lib/model-config/apimart-preset.ts:58、reverse-hub-images.ts:107 | 相同调用编号请求内容变化 → 409 | 供应商调用幂等 | 合理保留 |
| A19 | src/app/api/generate-image/route.ts:1245 | ratiogen 强制 count=1 | 防 count 被改大超扣 | 合理保留 |
| A20 | src/lib/billing/media-billing.ts(video):11 | 本地媒体处理禁用供应商用量计费 → 422 | 计费模式防呆 | 合理保留 |

## B. 输入合法性类（提交前 400 合理）

| # | 位置 | 挡什么 | 存在理由 | 判定 |
|---|---|---|---|---|
| B1 | src/app/api/generate-image/route.ts:1137 | prompt 为空且非改比例 → 400 | 防空跑付费请求 | 合理保留 |
| B2 | route.ts:1142-1152 | 自定义尺寸非 64–MAX/宽高不成对 → 400 | 防呆 | 合理保留 |
| B3 | route.ts:1154-1158 | 单图 >12MB → 400 | 上游限制 | 合理保留 |
| B4 | route.ts:1120-1128 | 表单/JSON 解析失败 → 400 | 防呆 | 合理保留 |
| B5 | src/lib/imagegen/schema.ts:19-42 | zod 校验：控制字符、宽高成对、像素>40MP、variants 1-4、batch 1-100 项 | 防呆 | 合理保留；注意 strictObject 会对未知字段 400，升级老客户端时留意 |
| B6 | src/lib/imagegen/body.ts:3-5 | 请求体超限 → 拒 | 内存保护 | 合理保留 |
| B7 | src/lib/imagegen/pixels.ts:5-8 | 图 >12MiB / 非静态 PNG/JPEG/WebP / 像素超限 → 拒 | sharp 处理能力 | 合理保留（建议提示支持格式清单；可考虑 GIF 取首帧） |
| B8 | src/lib/imagegen/inputs.ts:12-23 | 素材合计>64MiB/>80MP；蒙版须第一张、尺寸一致、需含重绘+保留区 → 拒 | 合成正确性 | 合理保留 |
| B9 | src/lib/imagegen/mask.ts:8-9 | 蒙版尺寸不一致 / 模型改变画面比例 → 拒（原图保留） | 防错位合成 | 合理保留 |
| B10 | src/lib/imagegen/jsonl.ts:5-8 | JSONL>256KiB、>100 行、key 重复 → 拒 | 批次防呆 | 合理保留 |
| B11 | src/lib/imagegen/postprocess.ts:16-30 | 全透明结果/JPEG 透明冲突 → 拒但保留原图 | 输出可交付性 | 合理保留 |
| B12 | src/lib/model-config/clients.ts:85,109,113,117 | 编码无效/参考图非文件/prompt 空 → 400 | 协议防呆 | 合理保留 |
| B13 | src/lib/model-config/apimart-preset.ts:39,41,47,67 | n∉1-4、prompt 空、参考图格式/20MiB、蒙版 PNG≤4MiB 且像素匹配 → 400 | 提交前防呆 | 合理保留 |
| B14 | src/lib/model-config/reverse-hub-images.ts:32-36 | n/prompt/附件字段/参考图>32MiB → 422 | 提交前防呆 | 合理保留 |
| B15 | src/lib/model-config/access.ts:24-27、router-capacity.ts:22-23 | 管理面请求体超限 → 413/400 | 内存保护 | 合理保留 |
| B16 | src/lib/billing/request.ts:26、intent.ts:16,20 | 操作编号格式 / 跨站提交 403 / 未登录 401 | CSRF+认证 | 合理保留 |
| B17 | src/lib/feature-access/server.ts featureRequestGate | 功能未授权 → 403 | 管理员授权体系（自托管默认全开） | 合理保留 |
| B18 | src/lib/video/media-inspection.ts:24,26、media-jobs.ts:50-53,91-96 | 媒体 hash 不符/MIME 非法/包>250MiB/文件>1000 → 422 | worker 容量与校验 | 合理保留 |

## C. 参数准入类（重点：全部建议改为"回退+审计"，不再 400）

| # | 位置 | 挡什么 | 存在理由 | 判定 |
|---|---|---|---|---|
| C1 | **src/lib/model-config/requests.ts:138-148** | 质量标签不在白名单 → 400（"standard"事故元凶，**2026-10-24 已修为回退**，codex/quality-fallback-20261024） | 计费档位一一对应 | **已改回退默认档+审计** |
| C2 | requests.ts:135 | 比例不在 option.parameters.ratios → 400 "所选模型未开放该比例" | 防计费口径漂移 | **建议回退最近比例+审计**（enforceOutputShape 裁切/补边工具链现成） |
| C3 | requests.ts:162 | 尺寸不在 resolutions → 400 "所选模型未开放该尺寸" | 同上 | **建议回退最近档+审计**（upscaleImages 可补 2K/4K） |
| C4 | requests.ts:166 | canvas 尺寸×比例组合未经预设核验 → 400 | 防未核验组合计费 | **建议回退已核验组合+审计** |
| C5 | requests.ts:105 + resolution-options.ts:7 | assertDisplayResolution：分辨率不在 displayResolutions → 409 | 管理员圈定展示范围 | **建议回退+审计** |
| C6 | quality-policy.ts:21 | 质量档不在 policy.choices → 409 | 参数映射防呆 | **建议回退 medium+审计** |
| C7 | requests.ts:105 + billing-model.ts:27 | 前端模型版本 ≠ 当前快照 → 409 MODEL_CHANGED | 计费快照一致性 | 保留但建议服务端自动取当前版重报价 |
| C8 | billing/quote.ts:13 | 该质量×分辨率未配价格 → 400 | 价目表缺项 | **建议回退已配价默认规格+审计**（价目缺项是管理员问题） |
| C9 | requests.ts:128 | 功能模型未开放 image/mask 输入类型 → 400 | 能力不满足 | **建议自动路由到支持输入的通道** |
| C10 | selection-policy.ts:6 | model 带 byok: 前缀 → 409 | BYOK 下线迁移 | 保留过渡期提示 |
| C11 | tool-scope.ts:16 | 模型未应用到当前工具 → 400 MODEL_OUTSIDE_TOOL_SCOPE | 工具圈定 | **建议回退该工具默认模型+审计** |
| C12 | execution.ts:90 | 模型被禁用/不可见 → 409 "所选模型不可用" | 配置变更 | **建议回退默认模型+审计** |
| C13 | execution.ts:96 | 模型不支持当前操作 → 400 | 能力核验 | **建议自动路由+审计** |
| C14 | **execution.ts:99** | simulate 无 eligible 通道 → 400 "所选模型不满足图片质量、尺寸或参考要求" | "不静默退档"核心执行点 | **建议选最接近通道+审计** |
| C15 | execution.ts:103,105,107 | 路由目标能力不满足 / 原生尺寸缺参数映射 → 400 | 映射未配置防呆 | **建议回退 1K（已有 upscale 兜底）+审计** |
| C16 | execution.ts:48,112 | 外部路由候选不满足图像参数 → 400 "不能静默回退" | 冻结能力 | **建议放行首选+结果核验+审计** |
| C17 | execution.ts:61 | 无符合参数的供应通道 → 400 | 同上 | **建议回退+审计** |
| C18 | imagegen/plan.ts:57 | simulate 无 eligible → 拒 | 能力核验不足即拒 | **建议回退+审计** |
| C19 | imagegen/plan.ts:58 | 抠图通道未核实透明能力 → 拒 | 核验不完整 | **建议先跑后验+审计** |
| C20 | imagegen/plan.ts:60,62,63,64 | 聚合通道未开放原生参数 → 拒 | 参数映射未实现 | **建议丢弃未映射参数并审计警告** |
| C21 | **imagegen/plan.ts:74** | 不支持原生透明且无核实抠图路径 → "不会静默更换模型" | 透明路径防呆 | **建议自动走两步或交付不透明图+警告审计** |
| C22 | imagegen/plan.ts:27,32,36,38,41-43 | JPEG×透明、蒙版比例不符、规格圈定 → 拒 | 防呆+规格 | 防呆部分保留；规格圈定**建议回退+审计** |
| C23 | imagegen/plan.ts:50,51,69,70 | 无模型/未开放/抠图 variants≠1 → 拒 | 配置缺失+防呆 | 配置缺失保留（503 化）；variants≠1 建议自动取 1 |
| C24 | new-api-image.ts:110 | 参考图数超上限 → 400 | 上游限制 | **建议截断至上限+审计** |
| C25 | new-api-image.ts:114 | 即梦比例不在白名单 → 400 | 上游硬限制 | **建议就近映射比例+审计**（reverse-hub 已有 nearest-ratio） |
| C26 | apimart-preset.ts:37,40 | 透明未核验 / 不支持蒙版 → 422 | 能力核验 | **建议降级（透明→不透明+提示）+审计** |
| C27 | apimart-preset.ts:83 | 供应商实际返回模型≠冻结模型 → 422（结果已产出但不交付） | 防偷换模型 | 建议改为**标记交付+审计**（钱已花，拒交付伤用户） |
| C28 | apimart-preset.ts:89 | 输出像素≠核验规格 → 422 "结果需核查" | 防降规格 | 同上：标记交付+审计 |
| C29 | reverse-hub-images.ts:37,39,55 | 即梦未声明透明/比例不支持/分辨率映射无效 → 422 | 上游白名单 | **建议回退+审计** |
| C30 | clients.ts:106,114,115,116 | Flow 不支持蒙版 / n≠1 / 编辑参考图要求 → 400 | 协议能力 | n≠1 **建议拆分 fanOut**；蒙版建议提示替代路径 |
| C31 | canvas/generation-parameters.ts:41-48,75-76 | 画布参数不在枚举 → 400 CANVAS_PARAMETER_UNSUPPORTED | 92ab9971 | **同文件已有 normalizeCanvas* 套件，把 validate 换成 normalize 即回退+审计，成本最低** |
| C32 | generate-image route.ts:1210-1215 | 模型不支持参考图 → 400 | 目录能力 | **建议 routeImageModel 自动换 supportsEdit 模型+审计** |
| C33 | generate-image route.ts:1195-1204 | 目录找不到模型 → 400 | 目录变更 | 建议回退默认模型+审计 |
| C34 | imagegen/dispatch.ts:95 | 透明意图但结果无有效透明主体 → failed（已扣费） | 结果核验 | 建议改 warning 交付原图 |
| C35 | business.ts:17,25,27 | 功能停用 409 / 模型不在生效列表 → 400 | 功能开关 | 停用保留；**"未在生效列表"建议回退默认+审计** |
| C36 | business-billing.ts:74 | 报价版本不符 → 409 MODEL_CHANGED | 报价一致 | 同 C7 |
| C37 | resolution-policy.ts:34 | 通道未配置该分辨率映射 → 409 | 映射缺失 | **建议回退 1K+审计** |
| C38 | video/workflow-freeze.ts:50,52 | 视频模型无 definition/不支持 camera → 422 | 能力核验 | 视频同理 **建议参数丢弃或就近档+审计** |
| C39 | video billing server.ts:93,95 | 供应商未配置/模型不可用 → 400 | 配置缺失 | 保留（503 化更合适） |

## D. 状态机类（pending/冻结/needs_attention/租约）

| # | 位置 | 挡什么 | 判定 |
|---|---|---|---|
| D1 | **src/lib/durable-image-jobs.ts:115,192,206** | 付费结果/费用未知 → needs_attention "请联系管理员" | **残留阻断主力**。建议：不可重放且无结果→自动释放积分置 error；仅"已有结果但账务缺失"才留 needs_attention |
| D2 | generate-image route.ts:1094 | 旧任务缺 BYOK 快照 → needs_attention | 一次性残留，建议改释放 |
| D3 | route.ts:1069 | 后处理重试≥3 → needs_attention | 有恢复路径，保留但建议自动降级交付基图 |
| D4 | imagegen/dispatch.ts:51,59-60,112 | 提交未知/子任务丢失 → needs_attention | 同 D1 策略 |
| D5 | src/lib/db.ts:4984,4992,5716 | 视频/画布任务 needs_attention | 同 D1；视频已有自动恢复 |
| D6 | durable-image-jobs.ts:135 | 已结束/暂停任务不可重新提交 | 合理保留 |
| D7 | durable-image-jobs.ts:190-193 | paidOperationVersion≠1 不执行 | 合理保留（安全侧） |
| D8 | image-job-failure.ts:17 | needs_attention 呈现为 error（不伪装进行中） | 合理保留 |
| D9 | image-job-repository.ts:48,56 | 租约认领排除终态 | 合理保留 |
| D10 | staging-history.ts:30-32 | staging 历史任务禁止执行 | 合理保留 |
| D11 | model-config/runtime.ts:141 | 配置准备中 → 503 | 保留，建议内建短重试 |
| D12 | 管理面并发保护（repository.ts、access.ts、management-access.ts、billing/catalog.ts） | 草稿/发布冲突 409 | 合理保留 |
| D13 | canvas/video-node-service.ts、video-node-repository.ts | 节点不存在/未完成 → 404/409 | 合理保留 |
| D14 | video/cancellation.ts、workflow.ts、resolve route | 取消/核对状态机 → 404/409 | 合理保留 |
| D15 | video/canvas-workflow.ts、node-submission.ts | 节点 revision/模型变化 → 409 | 合理保留（有恢复路径） |
| D16 | accepted-context.ts:16-22 | 版本凭证无效/过期 → 403 | 合理保留（防配置漂移改变计费） |
| D17 | execution.ts:28-48,123-125、byoc.ts:39、frozen-capability.ts | 冻结快照不一致 → 503 | 合理保留（保护已接受任务不被换模型） |

## E. 限流与容量类

| # | 位置 | 挡什么 | 策略 | 判定 |
|---|---|---|---|---|
| E1 | generate-image route.ts:858-880 | 全局并发闸 GEN_MAX_CONCURRENT=4 | **排队等待不拒绝** | 优秀范例 |
| E2 | route.ts:1166-1171 | gen:ip 30/10min → 429 | 拒绝 | 保留；建议改账号+IP 双键 |
| E3 | api/imagegen/route.ts:18 | owner 30/10min → **误标 400（应 429）** | 拒绝 | 保留限额，**修状态码** |
| E4 | api/imagegen/plan/route.ts:12 | 预览 60/10min → 429 | 拒绝 | 合理保留 |
| E5 | video/generate/route.ts:19 | 30/10min → 429 | 拒绝 | 合理保留 |
| E6 | model-config/capacity.ts:64 | 供应商租约满 → 429 PROVIDER_BUSY | 拒绝 | 合理保留；建议带 open_until |
| E7 | channel-scheduler.ts:40-43,63 | 3 败熔断+探测；全忙 429 | 拒绝+自动恢复 | 合理保留；建议带 retryAfter |
| E8 | video/media-jobs.ts:88,111 | pending≥64/单人≥8 → 429 | 拒绝 | 保留；建议改排队提示 |
| E9 | imagegen/batch.ts:58 | 批次并发排队 | **排队** | 优秀范例 |
| E10 | agent/harness.ts:188-200 | Agent 预算 → 429 | 中止失控 | 合理保留 |
| E11 | 各管理面限流 | 120-600/60s → 429 | 拒绝 | 合理保留 |
| E12 | api-error.ts:16 | safeError 把上游配额统一净化为"繁忙" | 错误净化 | **建议至少区分 402 与 429** |

## 建议立即处理的 Top 10（用户受伤频率×严重度）

1. **requests.ts 质量档**（"standard"事故元凶）——**2026-10-24 已修**（codex/quality-fallback-20261024）
2. **requests.ts:135 比例 400** —— enforceOutputShape 裁切链路现成，回退最近比例零新增能力
3. **requests.ts:162 尺寸 400 + resolution-options.ts:7** —— 同改回退最近档
4. **canvas/generation-parameters.ts:41-48** —— validate 换 normalize（一行式改动，覆盖画布全部入口）
5. **execution.ts:99 + imagegen/plan.ts:57**（无核实通道即全灭）—— 选最接近通道 + 审计
6. **imagegen/plan.ts:74**（透明"不会静默更换模型"）—— 自动两步抠图或交付不透明图+警告
7. **execution.ts:105,107 / resolution-policy.ts:34**（2K/4K 映射缺失）—— 回退 1K + upscale + 审计
8. **new-api-image.ts:114 + reverse-hub-images.ts:39**（即梦比例白名单）—— 就近映射
9. **durable-image-jobs.ts:115 等 needs_attention 残留** —— 无结果→自动释放积分置 error；有结果→交付+账务标记
10. **api/imagegen/route.ts:18 限流误报 400 + E6/E7 429 体验** —— 状态码 429 + 预计恢复时间

**总体结论**：A 类（20 条）全部保留；B 类（18 条）保留；**C 类 39 条中 32 条建议"回退+审计"**；D 类 needs_attention 是被移除的冻结机制的残留阻断面（6 处任务级卡点）；E 类策略健康（排队范例可直接推广），仅 1 处状态码 bug 和 2 处提示策略需修。
