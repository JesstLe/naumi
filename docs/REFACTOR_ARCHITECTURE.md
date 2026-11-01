# 架构与职责：模块化单体

当前版本和运行结果只在 [工作区快照](REFACTOR_WORKSPACE.md) 与 [退出审计](architecture/REFACTOR_EXIT_AUDIT.md) 维护；本文拥有稳定设计、数据归属和依赖方向。

## 当前实现的职责入口

| 职责 | 现有 owner / 公共接口 | 调用方向与不变量 |
|---|---|---|
| 图片准备与冻结 | `src/lib/model-config/image-preparation.ts`；`src/lib/imagegen/plan.ts`、`quotes.ts` | 入口→准备/报价→保存合同；原 operation 恢复不按 current 重算 |
| 图片执行与原图交付 | `src/lib/imagegen/adapters.ts`、`generation-submission.ts`、`cutout.ts` 等具体用例 | HTTP/Agent/workbench 调用同一业务实现，不反向调用 route |
| 首次paid结果完成 | `image-jobs/runtime` 原lease/update owner | 已返回结果只做同token本地有限重存；COMMIT已提交读回不覆写，不重入供应；持续失败保留原intent/hold并标明保存阶段 |
| 钱包与结算 | `src/lib/billing/` | 真实余额、预占、结算和回执由原 operation 绑定；消费只写一次 |
| DB 与事务 | `src/platform/db/`；各域 repository/schema owner | Pool/Tx 不导入业务；拆模块不拆原共享事务，不在事务内另借连接 |
| 配置读取与发布 | `src/lib/model-config/` 的 published read、execution services、administration | 执行消费冻结快照；公开目录不依赖管理连接或 default 可执行性 |
| 发布后工作草稿 | 原`repository.markApplied`事务 | 只推进发布者仍与确认版本完全相同的草稿base/revision；不覆盖在途编辑、不碰他人草稿、不以原回执重读推进历史状态 |
| 后台发布视图 | `model-config/management-session.ts`、`management-provider-directory.ts`；React `use-model-management` adapter | owner 拥有快照/原发布回执/只读观察，依赖纯合同和窄端口；不接管服务端CAS、配置或表单草稿，已派发发布不因视图卸载重放 |
| 调度与执行角色 | `src/lib/image-jobs/scheduling.ts`、`src/lib/application/work-signal.ts`、`src/lib/worker/` | 唯一 SQL/lease owner，同镜像 Worker；已受理/UNKNOWN 只恢复原任务 |
| Canvas 文档与任务 | `src/lib/canvas/` 的 document/history/image-runs/task owners | UI 不拥有钱包/供应商/持久化算法；原共享 undo/CAS 和账号归属保持 |
| Canvas 交互投影 | `src/lib/canvas/selection-projection.ts`、`node-creation.ts`、`view-navigation.ts`、`native-editor-session.ts` | 纯决策/会话→React adapter→原具体文档；不为每个事件机械新增框架 |
| Canvas 模型与目录 | `image-model-selection.ts`、`model-config/feature-catalog.ts` 及 browser adapter | 目录与参数规则唯一归属；feature/账号/项目生命周期不交叉污染 |
| 首页 Agent 会话 | `src/lib/agent/workbench-session.ts`，内聚子模块 `workbench-session-catalog.ts` / `workbench-attachments.ts` | 同一账号 scope 拥有恢复、发送/SSE、目录观察/变更和附件生命周期；纯合同不依赖 React，投影/草稿留在 UI；目录和索引失效不取消已受理后台任务 |
| 媒体 | `src/modules/media/` + `services/media-worker/` | 纯合同与真实原生引擎分离；runtime 不导入 scripts |
| 验收运行环境 | `scripts/video-fusion/native-parent-database.ts`、`scripts/verify-native-application.py` | 原业务案例保留；固定 SDK 与完整 App/Worker 字节一致；私有父 PG 归运行器清理 |
| 模型原生UI验收 | `scripts/verification/model-management-ui-runner.mjs`，两个固定profile | 12个原入口复用source copy/IPC/端口/退出所有权；真实经典Go Router保留；可选Linux dev校验当前源码和依赖锁，不冒充固定生产镜像 |

目录不是新的万能入口；跨模块只通过实际需要的窄接口。具体迁移调用方、兼容出口与退出条件见 [迁移台账](architecture/REFACTOR_MIGRATION.md)。

## 设计基线保留

以下是 2026-10-24 确定的目标与合同，不是当前目录扫描或“尚未实施”声明。目标目录树是按职责组织的示意；实际实现路径以上表和源码为准。不为机械贴合示意树重命名已稳定 owner。

## 4. 目标结构：按业务归属，不按技术名词堆层

以下是迁移目标，不要求一次创建所有空目录。未迁移文件保持原路径，旧入口在本模块迁移完成后删除。

```text
src/
  app/                         # Next 页面、HTTP、鉴权与响应适配
  server/
    composition.ts             # 唯一组装入口：配置、连接、实现注入
  worker/
    main.ts                    # 同镜像任务执行入口，复用应用用例
  modules/
    image-generation/          # 图片准备、提交、执行、交付、恢复
    video/                     # 视频提交、轮询、制作链；独立领域
    models/                    # 模型目录、能力解析、选择策略、版本发布
    providers/                 # 供应商协议/transport/通道适配
    billing/                   # 售价、冻结账务条款、钱包、预占、结算
    assets/                    # 媒体字节、作品身份、归属、存储与读取
    canvas/                    # 文档、编辑命令、保存、历史、交互和 UI
    agent/                     # 会话、工具适配、用户停止；调用创作用例
    reference-workbench/       # 原生参考工作台 UI 和操作编排
    identity/                  # 身份、账号/工作空间访问与权限事实
    commerce/                  # 订单、支付、充值；通过账务 API 入账
    enterprise/                # 企业业务和现有外部 workflow 连接
    ...                        # BI、模板、3D 等按实际迁移保留独立归属
  platform/
    db/                        # Pool、Tx、迁移工具；零业务 import
    http/                      # 通用有界 IO、超时等机械实现
    observability/             # 日志/追踪写入，不决定业务成败
  components/ui/               # 真正跨业务的基础视觉组件

migrations/                    # 按版本执行的数据库迁移；分批迁出 ensureSchema
tests/                         # 按模块与跨入口合同组织；逐步迁入既有 verifier
scripts/                       # CLI、构建与运维壳，不承载被 src import 的业务实现
services/                      # 已有独立服务，分别核实职责和部署，不批量删除
docs/                          # 架构决策、模块记录、持续迁移台账
```

模块仅在需要时细分，图片模块示例：

```text
image-generation/
  contracts.ts                 # 可安全序列化的请求、公开计划、结果 DTO
  browser.ts                   # 浏览器 API 客户端与原 operation 回执恢复
  server.ts                    # 服务端公共用例导出；不导出 repository
  application/
    prepare-image.ts           # 解析一次意图，选方案，冻结完整计划和价格
    submit-image.ts            # 原回执优先，受理/任务创建
    execute-image-step.ts      # 一次已冻结步骤的执行，不重新报价
    complete-image-delivery.ts # 正常与恢复共用的本地交付 continuation
    read-image-operation.ts    # 只读任务与交付/账务事实的公开投影
  domain/                      # 纯意图、参数、结果规则
  repository.ts                # 本模块任务/检查点数据访问
  adapters/                    # 对外端口的具体连接；按需求出现
```

不为每个函数创建 interface/class/factory。已有 `createModelRepository`、`createModelRuntime`、账务 Tx 和存储 adapter 继续使用。仅外部 IO、可替换供应商、跨模块依赖需要明确端口。

## 5. 依赖方向与公共 API

```text
浏览器 UI → 模块 browser API → HTTP adapter
Agent / 工作台 server caller ───────────────┐
HTTP adapter / Worker runner ──────────────┼→ 应用用例 → 领域规则
                                         │       ↓ 显式窄端口
composition 组装 repositories/adapters ────┘   DB / 存储 / provider
```

规则：

1. UI 只 import `contracts`、`browser`、纯前端模型；不通过大 `index.ts` 混入 server/PG/凭据。
2. app route 负责来源、身份、schema、调用和返回；应用层不 import route，不伪造 cookie。
3. 跨模块只使用明确公共 API；模块内部文件默认私有。不要从同一模块的 barrel 反向导入自己。
4. 领域规则是纯数据函数；provider codec 编码已经确定的计划，不再次决定客户价格或 silently 替换意图。
5. `platform/db` 只知道连接/事务，不知道用户、钱包、作品、租户或模型。
6. 组装在 `composition`；`billing` 不反向构建 `image-generation`，`models` 不反向初始化 billing server。
7. AsyncLocalStorage 可保留用于边界兼容和日志；**计划、报价、operation、输入归属以明确参数传递**，核心用例不从多个隐式上下文猜值。

### 谁决定什么

| 决策 | 唯一归属 | 其他模块怎么使用 |
|---|---|---|
| 用户是谁、在哪个 workspace、可操作什么输入 | identity / assets 的授权 API | HTTP/Agent 解出可信上下文；用例检查本次输入；不信任 body owner |
| 字段别名、默认档、请求参数修正 | 图片/视频准备用例中的纯规则 | UI 只提供选择；旧 HTTP 入口翻译旧格式 |
| 模型与可用通道、参数映射 | models resolver + providers 编码契约 | billing 读取计价事实，不用一个 primary upstream 代表整个候选家族 |
| 售价、预占、实际结算 | billing | 收到确定的有效方案；不自行路由供应商 |
| 原 operation 身份、提交次数、续跑 | image-generation / video 各自用例 | 各入口返回同一个 receipt；恢复不重新购买 |
| 原图、处理后产物、作品归属 | assets + 调用方交付用例 | 存储 adapter 不改变任务和账务状态 |
| 页面选择、拖动、菜单和视口 | canvas/browser | 不决定客户价或供应商能力 |

## 6. 定价和参数：从多层拦截变成一次准备

用户列出的 C1—C39 是定位线索，不直接作为固定基线的已确认缺陷清单：行号和行为已随修复变化。结构整改按下面的单一链路执行。

```text
请求意图 + 当前授权输入
  → 规范化 requested 参数
  → 选择可执行方案，得到 effective 参数和调整说明
  → 按 effective 方案报价
  → 保存同一份完整冻结 plan/quote
  → 提交原 plan，执行，不再沿途拿 current 逐层比较
```

### 6.1 把不同问题分开

- **兼容字段、默认参数、可等价替代档位**：在准备阶段集中自动处理并记录 requested/effective/reason。把 `standard` 等标签映射问题修在一处，不再多次弹积分确认。
- **模型/通道选择**：先把输入要求与候选通道匹配，最终报价对应真实有效方案；报价目录不依赖一个默认模型恰好可执行。
- **新请求的 current 漂移**：服务端完成选择和报价；已有原计划/已受理 operation 使用原计划与原价，不因重构重新定价。
- **原结果已产生的规格偏差**：保留产物并给明确质量提示；交付状态、处理完成和计费事实分别表达。复用已有 output advisory，不将“有原图”误写为“透明/蒙版全部达标”。
- **完整素材、蒙版、透明意图等语义**：换有能力的通道或已有本地处理路径。截掉参考图、丢掉 mask、把透明任务标作不透明成功是产品行为改变，单独定义验收，不藏在目录搬迁里。
- **真实余额、归属、同 operation 防重放**：在唯一权威点执行，不复制到每个 UI 层，也不转成用户反复核对。
- **未配价或供应通道不可用**：记录明确配置/供应阶段错误及请求号，按已有可报价方案处理；不伪装成用户积分不足，也不把未知价当 0。

本次重构不新增业务配额、用户二次确认或运营审核，不引入通用 Policy Engine。参数修正是几个明确的纯函数，audit 是沿现有 operation 记录的一次结构化事实。

### 6.2 报价契约要合并语义，不是一次合并所有历史表

目前 imagegen、通用 image quote、工作台 plan、Agent prepared plan 各有载体。先统一服务端准备结果和引用方式，保留旧 quote ID/operation/fingerprint 的兼容读取；不要立刻批量改写历史记录。

建议接口形状（设计示意，尚未实施；类型名以既有定义收敛）：

```ts
// 只有服务端准备用例可创建 PreparedImage；浏览器只接收 publicPlan + quoteId。
type PreparedImage = {
  operationId: string;
  scope: AuthorizedCreationScope;
  fingerprint: string;
  plan: FrozenImagePlan;        // 完整 steps、sources、执行与处理参数
  quote: FrozenBillingQuote;   // 既有完整客户计价条款
  adjustments: ParameterAdjustment[];
};

prepareImage(command: ImageCommand, actor: ActorContext): Promise<PreparedImage>;
submitImage(input: { operationId: string; quoteId: string }, actor: ActorContext): Promise<ImageReceipt>;
resumeImage(operationId: string, context: RecoveryContext): Promise<ImageReceipt>;
readImage(operationId: string, actor: ActorContext): Promise<ImageReceipt>;
```

服务器内部调用也需要可信身份/输入授权，typed API 不是绕过权限的后门。显式取消与省略确认字段保持不同；原回执优先不等于允许撤销已完成账务。

## 7. 生成、交付、账务：各有一个事实来源

保留 `DurableImageJobs`、paid operation checkpoint、PG lease、现有钱包事务与唯一扣款身份，不创建第二套任务平台。

- **执行事实**：是否派发、供应商是否明确接受、结果是否未知、原始结果是否已保存。
- **交付事实**：后处理是否完成、对象是否可读、作品是否持久化、父子回执是否可查询。
- **账务事实**：reserved / settled / released / reconciliation，不用“settle 函数返回了”代替真实 settled。

公开 receipt 从这些事实投影，不新增一个独立总状态表造成双写。早期保留既有 JSON/status 名称，先统一映射函数。

正常路径和原结果恢复都调用 `completeImageDelivery(checkpoint, frozenPlan, originalOperation)`。它处理已有字节、处理步骤、存储、作品、回执和原账务结算；**不持有供应商 submit 能力**。execute 只有在派发前状态允许时调用 provider；unknown 状态继续原任务查询。

跨 PG 表的任务/账务/作品动作按现有 Tx 原子性和固定锁顺序组织。对象存储与 PG 不是一个事务：保留既有幂等对象键、检查点和补传/续交，以可重复完成的本地阶段收敛，不声称一笔 SQL 事务可以覆盖外部网络。

## 8. Canvas：分清文档、任务与临时交互

```text
canvas/browser/
  document/        # 节点/边/分组与不可变 command；纯 reducer/selector
  history/         # 撤销重做和现有原子历史请求
  persistence/     # 加载、保存队列、草稿、版本冲突、账号/项目切换
  generation/      # 准备、提交、回执订阅、占位节点投影
  interaction/     # 选择、拖动、键盘、粘贴、视口
  ui/              # CanvasShell、节点 renderer、Dock、弹层
```

- **文档状态**：统一节点/边/分组的变更命令和持久化入口，复用已有 history/节点 repository，不另造事件溯源系统。
- **服务器任务状态**：以原 operation/receipt 为准，独立于 UI 组件生命周期。网络失败不会清空画布；切项目后旧请求不回写新项目。
- **临时 UI 状态**：菜单、hover、视口等就近保存；不把 137 个 hooks 搬进一个 `useCanvasEverything`，不强行做一个全局 mega-store。
- **渲染**：React Flow 是文档的视图投影，不再被同时当作数据库、撤销栈和任务状态源。
- **图片/文字/视频**：共用选择/放置/保存命令的基础设施，但保持各自编辑器和任务 DTO，不抽象成一个全字段可选的万能节点。
- **第一刀**：先从 `privateFetch + runGen + receipt recovery` 提取图片生成 controller；再拆持久化/历史；最后拆节点渲染与交互。先提取闭合职责，不先改样式。
- **状态技术**：优先 React reducer/现有 store 与 selector。只有实际渲染剖析显示订阅问题，再决定额外状态库；本轮不引入 Redux/Zustand 迁移工程。

## 9. 数据访问：按数据所有者拆，不破坏事务

| 数据 | 目标唯一写入口 | 迁移说明 |
|---|---|---|
| 用户、会话、账号状态 | identity repository | 钱包不再通过大 db.ts 顺带加载身份业务 |
| 积分批次、账本、预占、结算 | billing repository/service | 保留 wallet lock、唯一 ledger/operation、原价与到期顺序 |
| `app_image_jobs` | image-generation job repository | `kind` 兼容 suite/aplus；跨模块状态更新通过同 Tx API |
| 视频任务、阶段 | video repository | 保留既有 frozen capability/sources、版本和 recovery |
| 媒体元数据、作品基础行 | assets repository | 字节存储与作品数据分层，不复制业务媒体 |
| 画布文字/视频节点、历史/布局 | canvas repository | 旧 `app_artworks` 里的位置/分组列暂由 assets 的窄 Tx API 写；不让两个模块任意 SQL 更新同一行 |
| 已发布模型/能力版本、凭据 | models repository + credential store | 当前快照和历史冻结快照明确分开；凭据不进入 browser 合同 |
| Agent 会话 | agent repository | 工具不直写钱包或作品表 |
| 企业创作关联 | enterprise / creation association API | 与任务创建共用 Tx；不在底层 pool 中 import 企业业务 |

第一步从 db.ts 提出无业务依赖的 Pool/Tx；随后按模块迁走 query。旧 db.ts 暂时 re-export 已迁 API，由外到内逐步去除调用。**不是换名后永远保留 db.ts 大门面。**

DDL 从 `ensureSchema` 逐个迁到发布前、带版本记录的迁移。先验证已有实例升级和新库初始化，采用扩展→迁移→收缩；重构前期不改表名、不拆库，不把所有 ensure 一次删除。

## 10. 模型、协议、Worker 和独立服务

### 模型控制面与执行面

- 控制面负责编辑、验证、发布模型与价格资料。
- 执行面读取已发布/指定版本快照及凭据引用；正常读取不重新 bootstrap 管理运行时。
- 由 composition 把快照读取、报价和路由连接起来，解除 models ↔ billing 的组装环。
- 管理员显式配置和 vendor 资料的来源等级继续保存，不在重新 resolve 时变成统一来源。

### 视频协议的小环要具体拆

`wire.ts → protocols/index.ts → codecs → wire.ts` 的 20 文件环来自注册和 helpers 同文件。拆成 `wire-contracts.ts`、纯 `wire-helpers.ts`、codec 和显式注册装配；helpers 不 import registry。不是给每个 codec 增一层 service。

`wire-adapter ↔ workflow-upload` 把 endpoint 计算移到纯 helper；`canvas/video-node-service ↔ video/assets` 用窄项目授权 API 或调用方注入授权函数解除回调环。

### Worker

先共享真正的任务用例，再让 Worker 在自己的进程直接运行需要隔离的任务。现有 tick HTTP 入口作为过渡兼容入口；保持原 lease、同源码版本、恢复与排空语义。不要同时启用新旧两套扫描器去拥有同一任务。

媒体引擎从 `scripts/video-fusion` 迁到明确 runtime/adapter 目录，CLI 只调用实现；同时修改 Docker tracing/COPY，集中做镜像内入口测试。媒体 Worker 已存在的部分保留，不重造。

### `services` 逐项处理

- `reference-workbench`：现有 HTML/JS 被 prebuild 复制并改写后进入主 Web，另有历史 Python 服务。先明确 UI 资产唯一来源，去掉对字符串替换的隐式依赖；未核实外部部署前不删 Python 服务。
- `pricing-service`：独立价格评审工具，限定的主应用/构建入口搜索未发现直接引用；不把它误判为生产钱包计价服务。登记后保留，删除另核实使用者。
- `enterprise-workflow`：已有独立服务/BFF，维持现有数据与部署边界。只把 BFF 从服务 `routing-store.ts` 等实现文件的 import 改为共享纯合同入口；不借本轮创作重构重写企业业务。
- `design`：部分企业页面是实际构建/渲染输入，不按名字当纯草稿删掉。

## 11. 验收与实施原则

完整阶段计划见 [迁移台账](architecture/REFACTOR_MIGRATION.md)。核心验收：

1. 图片业务层→Next route 反向 import：2 条目标归零，fixture 调用另记。
2. 已迁模块无新增跨模块私有 import；其边界无运行导入环。全仓旧环按 owner 逐批消除，不一次设全仓失败门禁。
3. 一次生成只冻结一次客户方案/报价；重复提交、断线恢复、后处理失败续交不新增供应商生成和重复扣款。
4. 相同有效输入从 Canvas / Agent / 工作台 / 旧入口得到相同计划/价格语义；入口场景元数据保留。
5. 标准质量修复、Canvas supplierRouting/精确价格修复在合并后的固定 SHA 上保留；历史 benchmark 的 PARTIAL/未执行条目如实保留。
6. 正常交付和恢复交付共用同一实现，失败阶段、原任务号和产物在客户端一致显示。
7. 性能在同机器、同数据、同构建下比较；结构统计不能替代容量实测。

## 12. 本轮不做的工程

不做全站重写、全仓重命名、强推微服务、引入 Kafka/通用事件总线/CQRS/工作流 DSL/通用策略引擎、全项目 DI 容器、重做权限和钱包、重建一套 benchmark。新抽象只在两个真实调用者共享同一语义时出现。

本轮产物是可执行的重构设计及证据，不是产品修复上线凭据。后续逐模块记录：旧实现→新 owner→迁移调用方→删除旧路径→集中验收→独立回退；阶段未完成时不继续堆叠平行路径。



## 历史入口

[原调研、代码盘点和逐轮记录](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/REFACTOR_ARCHITECTURE.md)保留在 Git；具体业务变更归各模块文档。本文不复制运行流水，不以文件数量、行数或 SCC 单独证明业务完成。
