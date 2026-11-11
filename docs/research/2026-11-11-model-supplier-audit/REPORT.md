# 研究报告：现有能力、边界与问题

源码基线：`052665c8cc295cdba04d28a489f8c9cd727c5862`。下文位置属于该版本，不表示服务器当前部署状态。证据分为「源码确认」「本轮本地运行」「待运行验证」，不混写。

## 1. 系统实际有哪些对象

| 对象 | 实际职责 | 不能混同为 |
|---|---|---|
| Provider / 供应商连接 | 协议、地址、凭据引用、超时、容量、启停 | 某个公开模型；供应商余额账户 |
| UpstreamModel / 上游模型 | wire model、能力、参数映射、采购依据 | 用户选择器中的展示身份 |
| PublicModel / 前端模型 | 公开 ID、名称、可见性、范围、默认用途、执行目标 | 任意供应商返回的同名目录项 |
| 供应通道 / supplierRouting | 一个公开模型的多个上游及调度策略 | feature 阶段路由；外部 Router pool |
| Business option | 功能中的可选模型、基础收费、路由、参数/后处理例外 | 整模型唯一价格 |
| BillingConfig | 积分规则、结算、特殊条件、充值商品、成本引用 | 供应商采购账单；ModelConfig 同一版本 |
| Supplier metadata | 来源、资料目录、能力与价格点、人工修订 | 已发布执行配置或已付费验收 |
| Supplier account / call | 冻结采购账户、真实尝试、费用与补查 | 当前连接下次请求；确定净利润 |
| Health target / observation | 配置目标的探针或真实调用观察 | 用户端已拿到可打开的作品 |

核心关系：

```text
用户选择公开模型与规格
  → 功能范围与可用目录
  → 同次选择的 ModelSnapshot + BillingSnapshot
  → 真实报价与原操作身份
  → 冻结执行模型 / 凭据 / 参数计划
  → 直连 / 供应通道 / 功能阶段路由 / Router pool
  → 对应协议 adapter
  → 接受回执、查询、下载、媒体与作品保存
  → 父子任务状态、预占与结算
  → 用户实际可见结果

供应商目录/公开参数/公开价格 → 元数据库 → 管理员确认的执行配置
实际供应商调用 → 成本账本/查询队列/对账 → 后台成本与运行视图
```

这两条资料和账务旁路不应反向静默改写已接受任务。

## 2. 前台看到的“一个模块”，源码实际有多套界面

### 2.1 页面和导航

- `/admin/model-management`：日常模型管理、供应来源、操作弹窗。
- `/admin/model-management/library`：元数据、能力、价格点、来源、修订历史。
- `/admin/bi/models`：完整配置，十个 tab：APIMart 默认预设、批量配置、功能计费与路由、供应商、上游模型、公开模型、混合路由、默认用途、路由模拟、发布记录。
- `/admin/supplier-balances`：余额账户与原币/额度测量。
- `/admin/model-health`：观察、探针、巡检策略、未知探针核对。
- `/admin/center?section=models`：图片质量/费用审计；不是公开模型配置页。
- `/admin/billing`：业务收费、供应商成本引用、特殊规则、充值、积分策略、历史、人工核对。
- `/admin/billing/price-table`：已有 Image 2.5 价格参考视图。
- `/admin/billing/supplier-cost`：实际供应商调用、采购对账、账户与汇率。
- `/admin/pricing`：定价研究展示；不是现行扣费权威。
- `/admin/mvp*` 旧页重定向，`/api/admin/mvp*` 兼容复用 handler；不是独立的第二份模型库。

导航证据：`src/components/admin/navigation.ts:15–23`。完整入口清单见 `ROUTES_AND_ACTIONS.md`，包括不在顶栏的子页。

### 2.2 不舒服并不只是颜色问题

`center-shell.tsx` 已有全站品牌、侧栏、模块导航与搜索；`model-management.tsx:31–34` 又添加品牌、模型工作台、多个重复跳转和内层 tabs。计费页还有 `billing/navigation.tsx` 和自身 tab。管理员在相同屏幕里不断切换“站点—模块—工作台—配置模式”四个心智层级。

模型卡片 `model-mapping-card.tsx:38` 取 `row.pricing?.[0]`，而 `management-pricing.ts:27–37` 默认只算 medium / 1K，且按功能逐项生成价格。**卡片这一格不是完整售价表**。虽然界面有参考规格提示，仍难以快速看出不同用途/档位是否同价。

常用设置分散在多种弹窗和完整配置 tab；后者还需要查看 JSON。应把能力收进对象详情，而不是直接删除后端/高级页。

## 3. 真实管理动作已经相当完整

### 3.1 日常管理

`management-input.ts:20–42`、`management-actions.ts` 覆盖新增公开模型、接入供应商、目录发现、登记上游、改名与公开 ID、更换上游、通道、显示顺序、应用范围、质量/尺寸映射、高级图片参数、视频参数与能力升级。`model-editor.tsx` 已组装相应编辑器。

`onboarding.ts` 的新建流程不只是快捷链接：校验公开 ID 冲突、来源目录、参数计划与每个用途的售价；允许复制旧模型有效价格；新增功能配置用 `inheritExisting` 保护旧选项，不改已有默认模型与历史 ID。

新建公开模型时，初始价可在 **ModelConfig.business option** 中；日后“设置积分”则写 **BillingConfig 中的 managed override**。二者不是重复扣款，但用户需要知道“当前真正生效价来自哪里”。

快捷操作协议没有统一 delete/archive 动作，不能据此宣称所有对象已有完整物理CRUD。`enabled`、`visible`、用途移除和历史引用的生命周期需要分别定义；旧任务仍引用的配置/凭据不随后台“删除”一起抹掉。

### 3.2 草稿、并发、发布与恢复

- 快捷管理：`management-session.ts` 保留原操作 UUID 和已发请求体；离开页面不把已接受写入当作可取消，不确定结果沿同一操作核对。
- 完整配置：`manager.tsx` 有草稿 revision、校验、模拟、发布 diff、历史恢复、未决操作持久化。`save/execute` 位于 `457–502`；不能拿掉页面后丢失这些能力。
- API：`management-access.ts:94–105` 的积分变更调用 billing owner；其他模型动作走 private per-operation draft、配置校验、Router projection 和 model runtime。
- 存储：`repository.ts` 保存规范化草稿、immutable 版本 JSON 和 active pointer；校验 actor、fingerprint、expectedRevision/version、旧草稿基线，阻止过时全量配置覆盖新版本。
- 发布：`runtime.ts` 以 staged / preparing / activating / applied / failed / unknown 表达数据库与 Router 的协调。激活后落库结果不明确时仍是 unknown，不伪装失败后另起一轮。
- 历史恢复：取历史内容创建新版本，版本单调增长，不直接覆盖旧记录，也不回灌业务数据。
- 执行投影：`execution-projections.ts` 按模型+计费版本准备不可变摘要；accepted 验证 SELECT-only。用户读取发布目录不应 bootstrap、discover 或做 DDL。
- 管理GET与用户目录不同：例如 `onboarding-access.ts:23` 的读取会调用 `repo.draft(actor)`，可创建管理草稿；目录/余额还可能写缓存。不能把所有后台GET笼统称纯只读接口。

**“统一发布体验”应统一操作与差异审阅，不应虚构模型与计费已经共享同一个原子版本。**

## 4. 价格不是无法配置，而是配置语义分散

### 4.1 实际优先级

按 `management-pricing.ts:22–33`、`business-billing.ts`、`credit-overrides.ts`：

1. 管理员显式模型积分规则；
2. 命中的默认 APIMart 成本加成预设；
3. 功能-模型 option 收费；
4. 通用业务 tariff 的条件规则；
5. tariff 默认价。

`modelCreditView` 使用真实 quote 路径，不另造一套“后台看起来正确”的价；失败/未知可表现为 null、estimated，不把未知当免费。清除显式规则会回到下一层，不等于设置为 0 积分。

`PriceDialog` 已支持 fixed/matrix，按当前目录生成可用格，0 合法、null 为未开放。结算与报价已冻结；请求规格、有效执行参数、供应商 wire 值是不同字段，降级映射不自动改用户原选档报价。

### 4.2 确认存在的编辑器缺口

**F01：完整配置的功能计费编辑器没有完整呈现合法积分定价。**

- `business-editor.tsx:21,65–66,88–98` 主要处理 `cny-fixed` 与 `usage`。
- 新 onboarding 可合法保存 fixed/matrix（`onboarding.ts:68–79`）。
- 该编辑器把其他合法模式显示为“沿用旧价格”，收费模式下拉则呈现人民币固定，实际字段并不是这个值。
- 这是源码确认的“视图与数据契约不一致”，本轮未做浏览器复现。不能据此宣称生产扣错钱；也不应通过自动改成默认人民币价格来修界面。
- 批量配置 `batch.ts:40` 只接收 cny-fixed/usage，而快捷价格支持积分矩阵：统一入口时必须显式映射能力，不丢 matrix、免费格、特殊规则和原单位。

**F02：多个参考价格入口不能准确表达最终有效价的全貌。**

模型卡片只是第一个功能的标准1K价；`BusinessPrices` 用所编辑 tariff 试算，不等同于叠加 ModelConfig 后的最终模型报价。价格表与定价研究又有各自用途。策略应展示「当前选择/有效价/来源版本」，不是把所有页面都改成同一静态表。

### 4.3 1 元 10 积分应怎么落位

用户的兑换想法尚未由本轮应用。现有充值商品有 `amountFen/baseCredits/bonusCredits`；CNY 定价有 `creditsPerCnyMicros`；采购折算有 FX；成本加成有 factor。它们分别是销售商品、收费换算、供应商成本与利润规则，不是一个可以全局搜索替换的常量。

还有同名开关的语义差别：Billing tariff `enabled=false` 表示不收该项站内积分，不等于停用工具；ModelConfig business `enabled=false` 是执行范围的停用。新UI应显示“收费/开放使用/用户可见”的确切操作，不能把三个字段合成一个“启用”。依据 `src/lib/billing/README.md` 与 `business-billing.ts`。

建议先明确“标准售卖兑换率”和优惠赠送口径；新报价用已发布版本，历史订单/余额批次/已接受任务保留原数值与证据。售价表由管理员维护；成本未知时不承诺毛利。API 差额、贡献利润、净利润分别命名，赠送与折扣积分也不直接按面值当现金收入。

## 5. 供应商资料、连接、余额、成本各有 owner

### 5.1 资料不等于执行

`supplier-models/repository.ts` 和 `catalog-store.ts` 分别维护供应商 metadata、价格点、修订/来源快照和 authenticated directory。公开资料、当前 key 可访问目录、实际验证分开；人工显式数据优先，false/0/omit 是有效意思。

`supplier-models/access.ts` 的 sync 会导入资料、可选访问供应商目录；它不是纯 SQL SELECT，但不会自动修改已发布参数或售价。新 UI 的“刷新资料”不能被命名成“自动适配并启用”。元数据修改有 expectedRevision 和原操作身份。

### 5.2 余额、真实采购与对账

- `provider-balance.ts:15–33` 只有已登记的余额 adapter 才查；目前包括 APIB 和 Geek，不能由协议名推断任意供应商余额接口。
- APIB 当前返回余额的单位仍标待确认，不伪写为人民币。相同 key/endpoint HMAC 分组；成功5分钟缓存、错误30秒、手动刷新15秒节流、并发有界。
- `supplier-cost` 按冻结 account / attempt / task / credential 记真实成本；状态为 pending、estimated、reported、reconciled。金额和额度分开，0 需有证据。
- callbacks 只收有界候选提示并排队，服务端对原供应商任务补查确认，不直接相信回调就扣款或重放生成。
- 成本补查与聚合 usage 通过 outbox/lease 执行 GET；对账重试不是“重新生成”。
- `supplier-cost/actions` 支持账户配置、原任务补查、usage 区间、追加有证据的变动成本；查询页支持过滤、分页和调用链。
- 固定月费、采购价、真实费用、用户收费和充值收入分别管理，不能只以“余额减少 / 用户扣积分”当作每次调用净利润。

**F03：同一供应商的信息跨连接、元数据、余额、采购账户和健康页散落，缺一个稳定详情页把关系展示清楚。** 聚合读模型即可；无需把各账本合成一个表。

## 6. 执行参数与供应通道需要保留的边界

### 6.1 统一配置不等于任意供应商只换 URL/key

`schema.ts:30` 定义已实现协议集合；执行由协议适配器解释请求/响应/查询/下载。地址和密钥只能复用已兼容的协议契约。相同“OpenAI compatible”仍可能在图片输入、异步任务、quality、size、resolution、费用返回上不同。

管理员显式映射 → 编译一次语义到 wire 的 `imageParameterPlan` → 接受时冻结；历史任务不按新资料重新编译。`omit` 是不发送字段，不是 auto 或空串。公开 ID/供应商实际模型/响应报告模型不能相互冒充。

### 6.2 不止一种路由

- 直连 upstream；
- 同公开模型的 supplierRouting（优先级/权重/健康、原操作 pin）；
- 功能 option 的多阶段/恢复路由；
- 外部 Router 的 pool / 规则候选。

`channel-policy`、`business-routing` 等验证不允许随意叠加不兼容的策略。只有已证实 not_charged 的尝试才有依据切换另一个收费通道；超时/5xx/缺回执保持 unknown。SDK 自动重试关闭，后台不能为了“自动切供应商”绕过此边界。

### 6.3 消费者

用户目录 `/api/models`、Canvas、工具、Agent、视频/音频与 Worker 回查都消费本模块。`worker/scan.ts` 只编排领域恢复，不拥有第二套报价/重提逻辑。Router 私有容量回调验证原 model/billing/digest，并有专用鉴权。生成任务、钱包、作品和媒体仍由各自 owner 收尾。

仓内 Router fixture 为 `JesstLe/naumi-router@b3fc8dd61e62c564ac2ba2a08cf943f7c391970c`，archive SHA256 `c4a5b529589dc7535f3bd7c8af455f5c4054726f1a9de487f405b108811e8e2b`。本轮 hash 一致并读取其管理 listener / prepare / activate / endpoint 边界；**没有读取远端实时版本，不能把 fixture 当线上全源码验收**。

## 7. 运行与权限模块

### 7.1 健康能力存在覆盖边界

**F04：主动探针并不覆盖所有已适配模型。** `model-health/targets.ts:20` 支持图片 openai-images/new-api-flow，apimart-images 还要求该 upstream 命中已启用默认 preset。一般应用 APIMart 图片配置、视频、音频、文本不能据此显示“主动验收完成”。应把“不支持探针/未测/真实请求观察/探针通过”分别呈现。

`executor.ts:33–36` 的巡检会 POST 真实生图，虽不扣用户钱包、不入用户作品，仍有供应商费用。`access.ts` 的手动 tick 和周期策略有预算/间隔/原身份核对，不应把“检查连接”和“付费生图探针”合成同一个无提示按钮。

周期探针另有 `scripts/model-health-worker.mjs` 调用 `/api/model-health/worker/tick`，不等同 `worker/scan.ts` 的应用恢复扫描。代码/配置存在不证明该探针进程在线运行，本轮未查询服务器。

### 7.2 质量审计不是全部模态调用台账

`bi/repository.ts:280–289` 的 models 分区源自图片 cost audit；`model-chain.ts` / `model-calls.ts` / supplier calls 投影真实前端模型→请求模型→响应确认模型，缺证据就显示未确认。HTTP成功、模型已响应、流已打开与作品已交付不是一回事。BI telemetry 可降级失败不影响真实执行，故不能把没有观测行等同没有真实调用。

**F05：运行信息散且定义不一致。** 健康、质量审计、供应商成本、Router traces 应有任务/操作关联和模态覆盖标记，而非统称“模型正常”。

### 7.3 权限

页面通过 `requireAdminPage`，API 通过 `biAuthorize/billingAuthorize/requireAdmin` 与 same-site mutation；shell/sidebar 只负责展示。专属企业 owner 不自动成为平台管理员；配置口令启用后也不把邮箱身份当绕行路径。凭据加密存储与版本引用，轮换不破坏旧任务。

旧 `settings/api-panel.tsx:57–77` 在 managed 模式重定向配置中心，但保留 Replicate 商品抠图独立配置；独立处理器不能随模型页重整丢掉。原生身份、Supabase、本地后台口令是既有鉴权通道，不做 UI 隐藏代替授权。

## 8. 发现汇总与证据等级

| ID | 内容 | 等级 | 后续处理 |
|---|---|---|---|
| F01 | 合法积分模式在完整功能编辑器呈现不准确 | 源码确认，未做浏览器复现 | 第一批修编辑契约，禁止自动价格迁移 |
| F02 | 默认参考价、tariff试算、有效模型价混在多入口 | 源码确认 | 统一 effective price 视图与来源 |
| F03 | 供应商关系/余额/资料/采购无统一详情 | 源码确认 | 聚合读模型，不合并账务owner |
| F04 | 主动巡检协议/模态覆盖有限且可能收费 | 源码确认 | 明确覆盖与费用；后续定向补支持 |
| F05 | 运行台混合图片审计/真实调用/健康证据 | 源码确认 | 按操作关联，不虚构交付成功 |
| F06 | 旧批量测试拒绝 tool.upscale，与当前契约冲突 | 本轮真实脚本 exit 1，已定位 | 更新测试契约后再把该套回归作为门禁 |
| F07 | audio 筛选存在，卡片类型文案 map 未列 audio | 源码确认：model-mapping-card.tsx:17 | UI集中修正，验证音频子页 |
| F08 | 重复导航/品牌、常用操作深藏、部分高级配置依赖JSON | 源码确认，UX判断 | 对象化重排，不仅换色 |
| F09 | 充值兑换、收费换算、采购FX缺少统一运营口径 | 源码确认；新口径尚未配置 | 分对象发布，历史不追溯变更 |
| F10 | 可见/允许新任务/收费开关及删除生命周期未统一成管理契约 | 源码确认 | 拆清语义；历史引用保留，不能假设全对象已有删除API |

本轮没有据此认定“所有出图故障均来自后台”或发现确定的当前生产重复扣费。完整源码研究为制定策略服务；具体改造仍需对应 HTTP/PG/浏览器验收。
