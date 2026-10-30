# Naumi 重构方案：模块化单体，收敛执行路径

## 2026-10-30 最新：R7V 视频任务跟随检查点（整体ACTIVE）

视频恢复编排归canvas/video-task-follow；第三模块后普通整合main bbc8f784六提交，两冲突保留scope缓存隔离和新存储/提示语义。固定c496e36d的156原条目已覆盖，153有通过证据、时间线/场景/角色三项Windows完整原生门禁OPEN，**不是完整core PASS**。新完整Linux镜像及同镜像真实双browser37/PG/Worker/180秒通过；独立Next视频恢复8检查通过。type/lint37warnings与4类SCC0。原full-core门槛未降低，新的Linux runtime177未运行；四产物/回滚/版本以R7V DELIVERY为准。未合main未部署，47 HOLD；后续先闭合三个原生门禁，再继续剩余职责/性能容量与最终整合。历史阶段数据保留原SHA。


## 2026-10-30 当前：R7T 浮动层布局归属

原页面131行测量/锚点最小pan/live跟随归useCanvasOverlayLayout，纯几何归原dock-layout；同ID文档替换重绑observer，旧callback不污染新dock。固定b58df21a原31共同轨迹EXACT、19项受影响入口全部通过（PARTIAL/exit2）、实际Next9检查+5响应式视口通过；2095应用文件逐hash绑定，类型/lint37warnings、四SCC0。新完整Linux/全151未跑，上一轮完整结果不改标。完整包/回滚/远端见R7T DELIVERY，整体ACTIVE、未合main未部署、47 HOLD。见[R7T记录](changes/2026-10-30-refactor-r7t-overlay-ownership.md)。

### R7S最终本地验收

固定应用/验证4c4f8e29完整core150/150（零日志复用）、同固定完整Linux镜像runtime177/原生媒体52/产品双browser37通过；scene/character/director原生门禁通过。视口旧7组竞争复现→新15通过，主题全Next97检查/0违例。最终归档只补已执行browser可访问名断言及文档，应用字节不变；完整四产物/回滚/远端见R7S DELIVERY。整体ACTIVE，继续剩余Canvas职责/远端CI/性能容量和最终main普通整合，未部署，47 HOLD。

## 2026-10-30 当前：R7S 视口与外观 owner

接入main1754的17提交，主题迁入既有节点/控件；定位视口从页面迁入窄hook，与手动Fit/zoom/pan共用navigation归属。原scene在完整c433副本已实际通过；独立时序反例原7组复现、新15组通过。最终core150/完整产物/远端见本片DELIVERY，不以局部代整体。**整体ACTIVE，未合main未部署，47 HOLD。** 见[R7S记录](changes/2026-10-30-refactor-r7s-viewport-appearance.md)。下方旧阶段统计保留其时间。

## 2026-10-30 当前：R7R 主线行为 owner 整合

固定接入 main `d4dcea3a`（26提交），将fanout/多文件导入/文本反馈/自动画幅/共享限流/Worker停止及抠图回执行为迁入既有owner，不恢复旧大页面。原生Next20检查、主要图片57共同轨迹、真实PG关键链已通过；同固定SHA受影响51项聚合、四产物和副本回滚以本片DELIVERY为准。完整core143/最终Linux/scene门禁和整版验收仍未全部闭合。**整体ACTIVE，长分支超过48小时待普通整合main；当前未合main未部署，47 HOLD。** 详见[R7R模块记录](changes/2026-10-30-refactor-r7r-main-owner-integration.md)。以下旧阶段统计保留其原证据时间，不代表当前版本。


日期：2026-10-24（固定基线设计）；2026-10-27状态：**整体迁移实施中，已推进R6L项目目录/命名会话；最新固定应用core32、完整Linux同镜像运行125、产品双浏览器9组及实际Next-PG项目控件11通过，完整重构版本尚未完成。**

R6D—R6L已进一步统一作品兼容writer、工作台环境资产、管理设置/模型/供应商资料owner、测试生命周期及依赖字节边界；Canvas主组件7132→6524行，原项目聚合规则保留并关闭命名竞态。最近普通整合main固定`8e412abe`（merge`6ef35a8a`），incoming诊断接实际执行owner；emitted静态/全导入SCC仍0。单模块、同镜像运行及本地浏览器证据不替代最终整体交付/容量/生产验收；冷Windows dev首次加载SyntaxError根因仍未证明。详见[R6L记录](changes/2026-10-27-canvas-project-catalog-r6l.md)。

实施状态以 [迁移台账](architecture/REFACTOR_MIGRATION.md) 和 [工作区记录](REFACTOR_WORKSPACE.md) 的各模块证据为准。已推进共享准备/交付、画布文档与交互、持久化owner/显式启动、独立Worker和视频/媒体执行归属；R5G执行装配和R5H功能模型规则已拆除对应循环依赖。下文统计与问题描述仍绑定最初固定扫描基线，不用最新行数覆盖历史证据。截至R5P，文字/图片主编辑链的多tab合并与canonical回执已接入，emitted静态/全literal导入环均0；剩余外围UI、旧兼容writer和R6完整候选/性能/CI/最终整合继续，未合main、未部署。

R6C实际完整产品浏览器发现并修正公开目录到管理组装依赖：config/models/text-models只读消费者改接已发布快照，价格投影与管理端共用，运行边4→0。固定应用core22、同镜像两browser9组/原生HTTP/PG/Worker交付、180秒混合读取通过，见[R6C记录](changes/2026-10-27-refactor-product-browser-r6c.md)；这不关闭旧writer、外围UI、长时混合生成负载、依赖漏洞或历史真实案例。

## 1. 结论先行

**需要重构，但不推倒重写，也不先拆微服务。** 本项目的主要结构问题不是文件多、技术栈旧，而是同一业务决策分散在 UI、HTTP wrapper、planner、计费和 provider adapter 内；基础设施又反向引用业务，导致一个变动有多个修改入口。

本次选择：保留 Next.js / React / TypeScript / PostgreSQL、现有产品入口和数据，演进成**模块化单体 + 同版本独立 Worker**。先把“准备方案 → 冻结报价 → 提交执行 → 原结果交付 → 结算回执”收敛为同一套应用用例，再逐步拆画布和数据访问。

重构收益用三件事判断：

1. 调整一种参数规则，只改它的决策模块，各入口得到相同执行计划和价格。
2. 接入一个供应商，只改对应适配器与明确的能力资料，不修改画布、钱包或任务恢复。
3. 修复一种交付失败，正常交付和恢复交付同时受益，不再各补一个 catch。

不以新增层数、目录数、接口数或每文件行数变少作为完成标准。

## 2. 本轮实际查看了什么

- 工作树：`E:/Workspace/naumi-refactor-20261024`。
- 分支：`codex/core-refactor-20261024`。
- 固定扫描 HEAD：`8b00cb35ddf318ec81d6c7e604d4d11956d50ffc`；产品源码等同起点 `905c8c635e41ff3f4443d43db9776d1db3aab469`，两者只差工作区说明。
- 全部 Git tracked 文件做目录盘点；TS/JS 文件做 AST 导入/导出及字面动态导入扫描。**这不是逐行人工审阅全部文件。** 核心创作、画布、账务、模型、视频、Worker、服务构建和 CI 做了定向源码核对。
- 未加载应用、运行产品测试、连接数据库或供应商，未构建或操作服务器。本轮数字描述源码结构，不描述当前线上状态或十万用户容量。
- `9fc284514aeaed740cdf55cc49b611445676b517`（包含 `0fbdd5a823c58755177412ef4a8a443fb3a03389`）已用本地 Git 对象核对：含质量回退、supplierRouting 计费识别、Canvas 单价/总价及 catalog 解耦改动。**这些不在固定扫描基线中；实施前应整合，不重做也不回退。** 未据此声称它们已上线。

详细证据：[现状审计](architecture/2026-10-24-current-state.md)。实施次序：[迁移与验收](architecture/REFACTOR_MIGRATION.md)。固定统计：[基线 JSON](architecture/2026-10-24-baseline.json)。

| 固定基线指标 | 结果 | 正确解读 |
|---|---:|---|
| tracked 文件 | 4,005 | 包含文档、脚本、设计资源，不等于业务规模 |
| `src` TS/JS 代码文件 | 1,226 | 不含 `.d.ts`、JSON/CSS 等 |
| `src` 物理行 | 148,411 | 含空行/注释，不是有效语句数量 |
| API route 文件 | 271 | 应各自成为适配入口，不集中成一个万能路由 |
| `canvas-client.tsx` | 12,422 行、120 个直接内部依赖 | 文件内有 137 个 state/reducer hook 调用、62 个 effect/layout-effect 调用；不是同时运行次数 |
| `db.ts` | 5,978 行、242 个直接消费者 | 钱包、用户、作品、画布、会话、配置等混在一个出口 |
| 静态导入强连通分量 | 54、20、2、2、2 个文件 | TS 擦除后的扫描也保留这些环；不等于已发生初始化故障 |
| `scripts` / `verify:*` | 1,247 文件 / 85 命令 | 已有大量验证资产，但用途和运行入口需整理 |

## 3. 为什么会“牵一发而动全身”

### 3.1 新生成链路仍把旧 HTTP route 当执行核心

`src/lib/imagegen/generation-core.ts:12-16,40-57` 组装 cookie、HTTP headers、FormData，再 import `app/api/generate-image/route` 调 POST；抠图适配也反向调用 cutout route。旧 route 同时解析 HTTP、选通道、处理图片、存储作品、维护任务和结算。

**正确方向是“所有入口调用应用用例”，不是“业务核心模拟用户请求调用入口”。**

### 3.2 文件已经拆小，职责仍相互依赖

`model-config` 有 80 个代码文件，`imagegen` 有 53 个代码文件。账务、模型、配置、DB、身份等仍组成 54 文件静态环。`model-config/server.ts` 组装账务运行时；`billing/server.ts` 又调用模型执行与配置能力。仅增加 `service.ts / manager.ts / utils.ts` 会延续问题。

### 3.3 画布拥有过多变化理由

画布主文件同时拥有 React Flow 渲染、选择/快捷键、项目缓存、保存、撤销、素材、图片/视频/文字生成、Agent 对话、计价和恢复。改“报价显示”会触及一个同时管理节点拖动和任务回执的文件。

### 3.4 数据出口没有按业务所有权组织

`db.ts` 不只是连接池，它还 import 账务和创作业务、执行 DDL、导出大量业务操作。调用者跨领域读写表，拆接口也难确定事务边界。

### 3.5 后台任务与运行代码的物理位置不清

Worker 的一条主要扫描链通过 HTTP 调 Web 内的 `/api/video/worker/tick`，由 Web 顺序执行多类恢复；部分媒体工作已有独立 Worker。生产媒体实现又位于 `scripts/video-fusion` 并被 `src` import、被 Docker COPY。**有独立 Worker 容器，不代表所有重型任务已离开 Web。**

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


## 13. R1A执行进度（2026-10-24续）

R1A1生图、R1A2抠图/同步账务和任务读取均已切换真实调用，生产lib反向调用app route从2条变0；HTTP仍保留为公开协议adapter。R1A2复用既有claimCreation修复并发唯一键503，保留原回执及一次结算；未增加审批/报价确认。

详见 [R1A2模块记录](changes/2026-10-24-cutout-billing-boundary-r1a2.md)。R1B参数/报价准备、R2统一交付、R3 Canvas、R4 DB/配置等继续推进。最大静态SCC现55（原54，拆分导致文件数增加）、视频20仍在，不能把route瘦身视为全仓解耦或容量达标。完整版本尚未交付、未合main、未部署。


## 14. R1B准备与报价（2026-10-24续）

typed quotation 移除伪Request；model identity/price共用一份snapshot；shared quality覆盖HTTP与三个planner入口；新steps保存私有preparedImage，执行不重选默认参数。原报价、老plan与原回执保持。实际PG的发布中途混价与scope覆盖问题已用A/B对照关闭，见 [R1B记录](changes/2026-10-24-image-preparation-r1b.md)。

R1B结构职责已迁移，跨域SCC仍60，后续R4负责DB和配置的运行依赖剥离。接下来R2统一正常/恢复交付；最终完整候选、UI/性能验收仍未完成。

## 15. R2交付与恢复（2026-10-24续）

正常与恢复入口实际调用completeImageDelivery，删除generation-output以及两套逐图/作品/结算逻辑；media-postprocess阶段原ID复用，旧JSONB顺序兼容，保留paid checkpoint。交付partial与实际billing settled分开，原回执/字节/单次扣款保持。见 [R2记录](changes/2026-10-24-image-delivery-r2.md)。R3 Canvas开始前保留旧batch fixture的基线/新版共同失败债务，不声称整体候选或容量验收完成。

## 16. R3A Canvas图片任务（2026-10-24续）

runGen/generatePend共用typed输入准备、捕获scope和本地controller。主组件移除两套submit/poll/place/receipt，dock和placeholder均恢复同一任务；正常UI未重写。Canvas仍12130行，document/history/persistence、详情/同步编辑任务、renderer/interaction尚待R3B/R3C，不能以本切片宣称Canvas已完全分域。实际对照和浏览器结果见 [R3A记录](changes/2026-10-24-canvas-image-task-r3a.md)。


## 2026-10-30 R7U：整理布局用例边界

布局投影和flush→原history事务/单步undo→延迟Fit编排归 `canvas/arrange`，Canvas只连接既有文档/Flow/view-controls端口。smartLayout与八类节点规则不变；Fit绑定原scope及导航revision，后来的缩放/拖动/整理退休旧Fit。没有新HTTP写入、任务或账务owner。基线5184文件已保存，16共同轨迹精确对齐；最终集中/原生/回滚以[R7U记录](changes/2026-10-30-refactor-r7u-arrange-application.md)和DELIVERY为准。整体ACTIVE，未合main未部署；最新main6提交已记录，R7S同步后第2模块，下一模块后统一整合。分支持续超过48小时：保留独立重构候选按用户整体交付要求推进，最终main退出仍未完成；不把独立分支push称整版交付。


## 2026-10-30 R7V：视频任务跟随归属及第三模块同步

Canvas视频GET/占位/结果initialize与merge/积分刷新/定时跟随归 `canvas/video-task-follow`，按现有document scope隔离、React只管订阅生命周期，不另建任务或结算。cancelled终态收起原占位，未知状态保留；readOnly/账号/workspace/project退休后无新副作用。原/新21→22检查、14共同轨迹相同（受控HTTP/auth/React effect端口，非生产）。第三模块后普通整合main bbc8f784的6提交，2冲突保留workspace cache与新存储owner/通知可见性，模块计数归零。集中core156与完整Next/PG及四产物见[R7V记录](changes/2026-10-30-refactor-r7v-video-follow.md)和DELIVERY；整体ACTIVE、未合main未部署。**独立整体候选分支超过48小时仍未合主线：用户要求整体重构版本，最终main整合验收仍未达到，不以模块push代替退出。**
