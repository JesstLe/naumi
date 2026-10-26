# 渐进迁移与集中验收台账

R5B（2026-10-26）：实际独立Worker direct执行共享scan，原PG回执绑定Worker，等待detached原回调再完成tick/排空/关pool，HTTP旧协议保持；combined环境分离与direct不强杀、handoff角色观察接通。Linux真实PG旧8/新29、锁阻塞SIGTERM32、崩溃原tick只读核对39、combined31通过，Web POST1→0、冻结原6/current17单次结算18；31unit/91断言/Python30+4、相邻156/36/59和tsc/lint通过。独立bundle验证及Docker/Compose接线完成，47专用clone仍为HTTP，首次提交排队/唤醒与该发布角色整合继续，不冒充全重活已离Web。见 [R5B](../changes/2026-10-26-direct-application-worker-r5b.md) 及DELIVERY；同步后第2模块，剩余媒体runtime/20环/外围UI-CAS/全产品R6继续，不合main、不部署。

R5A（2026-10-26）：套图/A+51声明及DurableImageJobs真实执行owner分离，route780→221/1072→374，恢复四类原任务不再HTTP回跳，tick保留原受理/回执/鉴权。58迁移声明/helper及7069非目标声明保持，12文件恢复环已拆、新owner无环、scan不达HTTP route。完整PG旧5/129→新5/156、实际Next34→37、冻结6/current17及release实际后台排空通过；全项目tsc/20文件lint、相邻15直接通过与middleware24/Linux补验通过。旧stopping新旧同fixture cleanup42P01、无参legacy用例均保留非绿，见 [R5A记录](../changes/2026-10-26-worker-recovery-boundary-r5a.md)。副本回滚/提交见DELIVERY；同步后第1模块。R5B独立进程执行/媒体runtime与R6继续，不合main、不部署。

R4B6（2026-10-25）：核心DDL归真实SQL owner，33声明/片段迁20文件，46+16次query参数与6838个非目标生产声明保持；37-owner启动组合、billing配置/账务服务装配分离及Canvas复制schema闭合。完整PG旧3/35→新3/36、实际Next22→24检查通过，26原公开函数首次DDL20→0，134表/1208列/255约束/241索引一致；21相邻脚本、全项目tsc/99文件lint通过。startup依赖16→3、静态可达215→132，新owner不入环，原20/12等环保持；角色协调与BI显式索引不混入普通Web。失败literal、绑定、回滚/patch与同步证据见 [R4B6记录](../changes/2026-10-25-persistence-startup-owners-r4b6.md) 及DELIVERY。本轮第3模块，收尾普通整合main后归零，整体继续R5/R6，不合main、不部署。

R4B5（2026-10-25）：发布读取删除动态管理bootstrap，缺表/缺current/历史版本不发现或重写；准备归Web启动/原setup写入/管理入口，首启空配置不提前发布。PG旧10/96→新10/99、实际Next旧23→新25检查，首次目录metadata GET2→0/结构与写入SQL37→0；14-owner及真实故障后原管理恢复、10项相邻、全项目tsc/11文件lint通过。发布读→lifecycle边1→0、新owner无环，原20/12环保留；副本回滚与远端证据见 [R4B5记录](../changes/2026-10-25-model-registry-startup-r4b5.md)。同步后第2模块，其余热路径初始化、Worker与最终完整验收继续，不合main、不部署。

R4B4（2026-10-25）：新增Next Node显式Web基础初始化，13-owner保留原SQL/事务，build/Edge/无DB/sidecar跳过；实际Next发现并修正跨bundle Pool/就绪分裂，按真实Pool/owner共享Promise。PG旧2/12→新7/53；Next实际登录/health/probe旧15→新19检查，build SQL=0、首登录DDL3→0、请求DDL15→0；Compose7→12检查，Worker等待Web/DB健康且不迁移。相邻、类型、副本回滚/补丁/远端证据见 [R4B4记录](../changes/2026-10-25-web-startup-r4b4.md)。不是完整产品/standalone build或全站DDL退出，模型首次发现、其它域ensure与R5/R6继续。同步后第1模块，不合main、不部署。

R4B3最新进展（2026-10-25）：实际执行与管理装配4条引用归零，原executor/prepare/发布/计费算法保持；冻结模型/凭据/计费/投影只读原版本。完整旧6/57→新6/71、实际HTTP缺token旧400→新200、冻结原6/current99、lease故障重试通过；相邻模型发布/执行、preparation45、读8/80、身份8/171、视频双入口16、账务/195登录与tsc/14文件lint通过。发现旧视频wire/public报价混用，完整旧基线复现后最小修正；旧MODEL_CHANGED断言按去确认协议更新，未恢复门槛。见 [R4B3记录](../changes/2026-10-25-execution-assembly-r4b3.md)。第3模块同步以DELIVERY为准；显式启动/其它热路径ensure、20/12环与R5/R6继续，不代表全站验收。

R4B2最新进展（2026-10-25）：原生模式、权限持久化、唯一创作scope和项目/媒体访问分别归属，HTTP适配保留同函数兼容出口。25声明和45生产消费者90绑定迁移，339原声明保持；身份/账务/创作7环拆开，HTTP context静态消费者47→21，新owner无环。完整旧8/168→新8/171、195实际登录、权限、钱包/赠额与creation writer、tsc/54文件lint通过；同旧新版均触发的fixture错误预期及TS问题修正留证，无生产逻辑变更。见 [R4B2记录](../changes/2026-10-25-identity-creation-boundaries-r4b2.md)。同步后第2模块；显式Web/Worker生命周期/其余热路径ensure、视频20/恢复12环、R5/R6继续。

日期：2026-10-24。关联：[主方案](../REFACTOR_ARCHITECTURE.md)、[源码证据](2026-10-24-current-state.md)。

R4B1 最新进展（2026-10-25）：已发布快照读侧不再组装管理runtime，纯目录/模拟及legacy目录分离，8动态/6静态模型环拆开，重型repository生产静态消费者14→1。完整冷模块PG原75/新80、真正只读事务、管理凭据缺失、current/历史/损坏pointer、首次初始化失败回滚重试与实际HTTP通过；preparation同SQL观察器原/新45，管理/发布/frozen-source与相邻账务、tsc/lint通过。详见 [R4B1](../changes/2026-10-25-model-read-boundary-r4b1.md)。同步后第1模块；冷库仍有first-use兼容initializer，显式Web/Worker生命周期及其它热路径DDL、身份7环和R5/R6继续，未记全站DDL归零。

R4A7 最新进展（2026-10-25）：旧db商业/管理数据owner收尾，37声明、35消费者/67绑定；db905→51行纯兼容、223原导出保持、生产静态消费者35→0，新owner无环，最大20环不变。完整旧/新PG6/138→6/164（26等价出口）与相邻账务/登录/任务/内容/持久化/platform、全项目tsc和本轮lint通过，接口只换真实owner import。详见 [R4A7](../changes/2026-10-25-commercial-admin-owners-r4a7.md)。本轮第3模块，main同步及归零见DELIVERY。R4B热路径DDL/默认bootstrap/读写组装、授权竞争/owner历史全量改绑与R5/R6仍未完成，不合main/不部署。

R4A6 最新进展：模板/缓存/导入、Agent/Genchat会话、项目、Comfy、竞品及历史流水/赠额实际数据owner迁移，db2361→905、静态消费者64→35，新owner无静态/动态环；最大20环不变。原表同事务Agent改键保留OID/索引/trigger且失败回滚；Genchat原owner写入与HTTP失败语义；竞品release-first消除max5/占4的吞超时。完整基线7/205→新版7/290（76兼容身份、214运行行为），Agent/钱包/entitlement/195登录/任务3/226/持久化6/78与29/90、tsc/lint通过。详见 [R4A6](../changes/2026-10-24-content-session-owners-r4a6.md)。这是同步后第2模块；Genchat客户端仍吞非2xx、剩余db商业/管理、R4B显式DDL/组装、R5/R6继续，整体目标未完成。

R4A5 最新进展：视频/Canvas图片持久任务与预占/成本审计职责已迁出，db3769→2361、静态消费者87→64，含db/video6动态环拆开。真实PG四条legacy终态路径在max5/占4时自等待已复现，现同事务读取计费与settings，原冻结报价不读current；baseline3/78、modified3/226通过，配置bootstrap同事务提交/回滚与unknown/单次扣款通过，相关现有入口/tsc/lint通过。旧video-reliability两边源码提取失败不记绿。见 [R4A5记录](../changes/2026-10-24-durable-task-owners-r4a5.md)。同步后第1模块；剩余模板/会话/管理、初始化/组装/协议/Worker及完整候选验收继续。

R4A4 最新进展：作品读写/管理与Canvas数据职责已迁移；三份30字段映射合一；BI上下文/调用观测/HTTP包装分离，真实managed-client WeakSet唯一。db4793→3769、静态消费者130→87；67动态大环已拆开，最大剩余20，旧19静态模型环拆开为transport/client3；所有新增owner不在SCC。完整旧/新观测21/141、PG108→176，以及Canvas20/14/32、私有媒体/BI/账务/creation/交付27/溯源/tsc/lint通过。见 [R4A4记录](../changes/2026-10-24-artwork-observation-owners-r4a4.md)。本轮第3模块，普通整合main后归零；下一轮继续遗留视频/任务/组装/DDL及整体候选验收，不合main/不发布。

R4A3 最新进展：账户访问事实、会话/注册、钱包余额、支付历史、历史 provider 记录迁入五个 owner，71 个调用文件/126 个绑定切换。db 5321→4793 行、静态消费者144→130并退出静态环；原24环余下报价/执行19，视频20仍在。含动态 import 最大环66→67，session随原runtime/storage链进入，仍需后续实际解环。基线/新版函数28/88、完整源码真实PG88→146（增加同函数兼容出口断言）、195实际登录handler、wallet/entitlements/platform29/creation、tsc/lint通过。详见 [R4A3记录](../changes/2026-10-24-account-owners-r4a3.md)。同步后第2模块；R4A剩余资产/任务/跨表用例、R4B运行DDL/配置组装、R5—R6继续，整体目标active，不合main/不发布。

## 1. 迁移总原则

每轮只完成一个闭合职责，采用“新实现取代旧实现”，不长期双套业务：

1. 固定已整合源码和行为对照。
2. 提取单一用例/数据owner，原入口接同一实现。
3. 集中跑该模块现有测试和最小新增反例。
4. 删被替代判断/旧副本；只留有调用者的协议兼容壳。
5. 留回退提交与冻结历史读取证明，再推进下一模块。

第一阶段不改表名、operation身份算法、公开URL或客户端协议；后续结构变动与业务降级策略分提交记录。不会要求用户再确认一次积分。

## 2. 分阶段工作包

| 阶段 | 可执行改动/主要文件 | 沿用与删除 | 集中验收与退出条件 | 回退 |
|---|---|---|---|---|
| R0 基线与协作 | 固定main及已完成功能提交；整合 `9fc2845`/quality/Canvas修复；登记实际调用方、旧任务格式 | 复用 benchmark runner/catalog，保留历史失败和PARTIAL | 质量回退、指定模型报价、原价receipt和取消正负例绑定整合SHA；未关闭历史case继续单列 | 仅撤本轮整合提交，不回退已明确保留的修复 |
| R1A 图片执行边界 | 从 `generate-image/route.ts` 抽出typed `execute-image-step`/提交与读取用例；generation-core/adapters直接调用 | 复用现有 paidOperation、任务repository、协议实现；删除内部HTTP/FormData再解析和用户cookie伪装 | 旧HTTP、新imagegen、Agent调用同一实现；owner/scope、显式取消、重复operation、unknown不重POST保持；2条生产lib→app归零 | 旧route adapter可恢复到原实现；无DB模式变更；已有任务仍由原ID恢复 |
| R1B 方案与价格一次准备 | 从 requests/plan/billing-model 的重复选择中确定唯一resolver；UI/Agent/workbench只消费Prepared计划 | 沿原quote/plan与冻结版本读；迁入已完质量/Canvas修复；删除重复current比较和重复参数决策 | 同输入各入口effective参数和报价语义一致；目录读取不靠可执行default；真实余额正负例；没有新增确认弹窗或隐性换价 | 在提交前恢复旧adapter映射；已保存计划不重算，不批量重写旧报价 |
| R2 原图交付与恢复 | 抽 `complete-image-delivery`，runJob和stored-delivery共用；统一receipt错误/质量提示投影 | 沿checkpoint、存储adapter、artwork API、settle原ID；删除双份处理/落库/异常映射 | 供应完成后写入失败、后处理失败、对象存储失败、父回执失败均可按已知checkpoint续交；无供应商重复生成/重复扣款；账务pending不冒充settled | 保留原始字节与历史字段；回退只恢复解释代码；不回灌媒体/DB |
| R3 Canvas分域 | 先图片生成controller；再document/history/persistence；最后renderer/interaction；复用video stores | 保留现有API、布局、selection、clipboard、history、账号缓存；删除主组件对应闭包，不另起mega-hook | 同账号/跨账号、项目切换、刷新、弱网、undo/redo、拖动、多任务和报价控件集中浏览器验收；无非本项目回写 | 按controller分批回退；存储键兼容，保留草稿与任务receipt |
| R4A 基础DB与数据owner | 从db拆纯Pool/Tx；按identity/billing/assets/canvas/agent迁query；跨表用窄Tx接口 | 保留锁顺序和事务；旧db暂re-export；删除重复SQL副本 | 平台DB不import业务；迁出domain消费者对db大出口引用归零；并发扣款/任务/历史写入事务一致 | 表结构先不变，re-export可撤；无数据迁移回滚 |
| R4B 配置与DDL | composition组装models+billing；snapshot reader和admin发布分离；ensure逐模块迁移 | 沿现有model版本、CAS、frozen sources；DDL搬迁顺序与旧库兼容 | 执行只读启动不进行DDL/bootstrap管理调用；新库/旧库升级通过；该批跨域SCC消失 | expand-only；旧代码兼容窗口内保留旧列；收缩另次发布 |
| R5 适配器与Worker | 拆wire注册/helpers环、endpoint环、素材授权环；runtime脱离scripts；任务用例在Worker内运行 | 沿已有媒体Worker、lease、receipt、同版本部署；旧tick作有期限adapter | 全profile wire对照一致；单条任务仅一个owner；镜像内imports完整；Web/Worker资源隔离有测量 | 暂停新scanner后恢复旧所有者；不并跑、不重放unknown |
| R6 外围整理 | 工作台资产源、enterprise纯合同、admin大面板；tests/scripts/docs按用途整理 | 有消费者的命令/服务保留；基于调用证据逐项退休旧代码 | 同模块变动只涉及约定owner/adapter；build inputs与CI触发一致；旧路径删除清单为零债务 | 目录移动与行为变更分提交；兼容CLI可恢复 |

**建议顺序：R0 → R1A → R1B → R2 → R3。** R4A中的纯Pool/Tx如果是R1的实际阻塞，可先做最小切片；不要求先迁走242个db调用者才改善用户创作。R5解小环可在对应模块工作时顺手完成；Worker迁执行是独立部署行为，不与UI拆分混一起上线。

## 3. 第一轮的明确范围

推荐第一个实施闭环为 **R1A：消除 imagegen 对 HTTP route 的反向调用**。

### 调用方登记

- `/api/generate-image`：旧FormData协议 adapter，外部URL暂保留。
- `/api/imagegen` 与 planner/dispatch：使用完整冻结计划。
- Agent共享图像工具及 `_category` 旧分支：逐工具登记，不假设全部走同一条。
- 原生参考工作台：保存计划和原operation；不新建执行器。
- Worker恢复、generate-image GET与imagegen GET：恢复同一旧任务，不能改operation算法。
- cutout：同样问题但可独立第二小片；不要为满足统计而仅忽略该import。

### 最小接口

`executeImageStep({ actor, operationId, frozenPlan, step, inputs })` 返回typed receipt，不返回需要内部调用者再解析的Response。鉴权HTTP解析留外面；授权后的素材身份仍由用例校验。保留既有server-only、scope和预占条件。

### 本轮必须删除

- generation-core内 `new Request('http://internal/...')` 的图片执行调用。
- 内部签cookie及计价headers的转译链（仅无其他调用者的部分）。
- 同一意图的重复FormData构造/解析。
- 遗留在route里的新旧两套执行函数副本；route只导入同一实现。

不直接删旧公开route，不改支付、不批量移动db，不增加抽象基类、事件总线或第三套workflow。

## 4. 测试资产复用与补例

不是每改一个函数就跑全套。阶段内以类型/局部静态检查辅助，模块闭合后一次集中回归；仅当失败需要定位时运行针对性用例。

| 类别 | 沿用资产/方向 | 验收事实 |
|---|---|---|
| 历史图片失败 | `scripts/verify-imagegen-history-benchmark.cjs` 与 `docs/benchmarks/imagegen-history-20261023.json` | 保留baseline复现、captured/执行/业务关闭分类；10/10且PARTIAL仍是PARTIAL |
| 定价减法 | `scripts/verify-pricing-friction-image.ts`、`scripts/verify-pricing-friction-agent.ts`、`scripts/verify-pricing-friction-workbench.ts` | 报价冻结/显式取消/current漂移、原operation、足额与不足额；按投影文件范围解释baseline |
| 新Canvas/quality修复 | 从已完成功能提交沿用对应verifier，不改回旧拦截预期 | supplierRouting单primary、catalog-default解耦、精确单价/总价、quality标签回退 |
| HTTP与客户端 | 现有scope/receipt、billing client、真实route fixture | 实际入口调用新用例，非只测试纯helper；unknown不自动POST；取消不生成不扣款 |
| 真实PG | 现有随机schema、wallet/job/quote/recovery fixture | 同任务一次consume、作用域不混、任务与账务一致、cleanup完成 |
| 视频 | 现有能力wire fixture、frozen source真实PG入口 | 完整旧profile不变；新字段/roles/来源不丢；不把image改造扩成video重写 |
| 浏览器 | Canvas已有fixture/Playwright：加载/编辑/保存/生成/刷新/恢复 | UI真实请求、操作号、回执、截图一致；弱网和切账号/项目不污染 |
| 性能 | 在固定机器/固定数据上建立对照，记录CPU/内存/事件循环/请求与供应耗时 | 以真实尾延迟和持续资源占用判断，不能从文件数推吞吐 |

最小故障矩阵：准备失败；真实余额不足；供应明确未受理；供应受理未知；供应已完成→checkpoint故障；对象写失败；作品写失败；结算未完成；客户端断线。每例都检查供应商提交数、原operation、字节/作品、用户提示和账务，不只检查HTTP状态。

## 5. 可量化退出标准

下面是建议的验收目标，不是已经达到的性能承诺。

| 维度 | 固定基线 | 阶段完成目标 |
|---|---|---|
| 生产业务lib→app反向调用 | 2条 | R1结束为0；2条release fixture不混算 |
| 模块运行依赖环 | 最大54；视频20 | 每个迁完边界SCC=0；旧图剩余按owner登记，不用改分组掩盖环 |
| 纯DB基础层业务import | 当前db混合 | R4A新Pool/Tx业务import=0 |
| 客户方案/报价 | 多入口载体，调用次数未测 | 每个新operation仅一个权威prepared合同；重复/恢复不重算价；prepare幂等命中率和读取次数可测 |
| 供应商/账务重复 | 本轮未运行 | 同op并发/恢复用例供应新submit不超过原冻结数量；consume每账务operation最多1笔 |
| HTTP route职责 | generate-image1269行 | 仅传输/鉴权/调用/呈现；150行作为复查提示，不是按行数强拆硬门禁 |
| Canvas复杂度 | 12422行、120依赖、137state/reducer调用 | 主Shell不再持有报价/任务执行/持久化算法；约600行作为组织目标，不设全仓绝对行数封禁 |
| 改动扩散 | 未测真实变更历史中位数 | 质量别名只改规则模块+测试；新增codec只改对应codec/注册和fixture，不改Canvas/wallet |
| UI响应 | 待同机对照 | 首轮约定fixture规模后测p95；建议同场景无超过10%回退，超差查原因，不套用线上SLO |
| 服务端额外延迟 | 待同机对照 | 比较排除供应耗时的准备/入队p95、PG查询和峰值RSS；建议无超过10%回退；低噪声重复样本后判断 |
| 数据与旧任务 | 既有schema/冻结格式 | 老quote、已受理任务、原结果续交兼容；字段扩展可读；供应POST=0的本地恢复可证 |

不把“10万活跃用户”换算成单个并发数字。容量模型和运行SLO仍在 `docs/PRODUCT_READINESS_100K.md` 维护，本方案只改善测量与隔离条件。

## 6. CI和依赖检查：渐进，不新增用户护栏

- 迁移初期用现有TS/ESLint加一个只读边界脚本即可；不引入Nx/Turborepo迁移。
- 新模块禁止业务→app、browser→server、跨模块深层import；旧债务列表固定到具体边和owner，新增违规才阻断。
- 依赖检查计入类型擦除后图，并区分fixture和运行代码；动态/HTTP/SQL边另登记。
- 路径触发覆盖实际build inputs：`services/reference-workbench/static`、enterprise共享合同、引用的design资源等。
- 将相应模块verifier并入同SHA的候选验证链；已有PG/账务/浏览器CI保留。required checks需仓库设置真实核对，本轮未操作。
- 一个模块验收完成后不保留同名旧/新两个“生产默认”实现；适配壳登记调用方、owner和删除条件。

## 7. 回退与上线分开

此工作树不持发布锁、不启动候选或重试发布。代码提交/推送不是上线。实际部署方式和窗口由当次发布负责人按最新明确授权执行，不与其他线程抢锁。

应用回退依赖兼容任务/quote/schema和原字节，不依赖恢复旧DB。迁移时先扩展、验证读写、后收缩；每一步保留原输入、来源、operation与账务ID。切Worker所有者按现有lease/排空交接，不通过更换operation启动新收费请求。

## 8. 可复用实施任务模板

```text
目标：只实施 REFACTOR_MIGRATION.md 中的阶段 <Rxx>，一个闭合职责。
基线：<完整SHA>；已保留功能提交：<SHA列表>。
读取：REFACTOR_ARCHITECTURE、证据Axx、模块文档、实际AGENTS。
旧调用方：<route / Agent / workbench / worker / tests>。
新owner与公共API：<模块、函数、DTO、Tx边界>。
必须保持：owner/workspace、完整冻结方案与原价、原operation/回执、
          显式取消、真实余额、单次结算、unknown不重放、原字节可恢复。
交付：业务实现 + 调用方切换 + 删除旧副本清单 + 模块文档。
验证：先固定baseline；完整模块后集中跑既有受影响suite与最小故障反例；
      输出同SHA命令、literal、exit、未执行项和独立副本回退。
不做：新增用户确认/限额、全站搬迁、新事件总线、另建benchmark、发布现场操作。
```

## 9. 当前进度

R4A2：schema/settings/signup实现迁出db，43调用文件/102绑定切到owner；旧/新门面同函数，DDL SQL不变。db5928→5321行，旧db消费者178→144，最大静态SCC56→24、动态70→66仍待处理。真实6类PG61→78及旧数据保留、池压力同事务修正、core lock/wallet/creation/Canvas32/model publication、tsc/lint通过。同步后第1模块，见 [R4A2](../changes/2026-10-24-persistence-owners-r4a2.md)。业务数据owner和运行DDL退出仍未整体完成。

R4A1：纯Pool/Tx基础层落地，旧db/getPool与billing Tx兼容别名均为同一实现；79纯import＋3混合字段迁移。旧db静态消费者251→178，最大静态SCC60→56，平台层无业务import/依赖环；535个保留函数正文不变。原27/157→新28/166、PG25→29、钱包/创作A/B、画布PG32/32、tsc/lint通过。第3模块按最终SYNC刷新普通整合main后归零；R4A数据owner尚未完成，见 [R4A1](../changes/2026-10-24-platform-db-r4a1.md)。

R3E：三处实际创作栏收敛为 image/text 两个组件，模型/比例/质量/数量控件复用，menu/resize不再混进文档任务。Canvas9342→8534行，174个保留函数正文不变；58组SSR完全一致，真实控件15项（含三尺寸）、文字6/图片5/历史12、最终tsc通过。同步后第2模块。下一步R4A连接/事务边界；R3上传/助手/外围UI与CAS、R4B—R6继续，见 [R3E记录](../changes/2026-10-24-canvas-composers-r3e.md)。

R3D：普通文字、反推、帮写的 request/task/controller 已接实际 Canvas；原答案续存、原 operation/报价和 scoped 文档写入归同一 owner。Canvas 9575→9342 行；基线 3/15、新版 18/77、PG24、实际 Next6、最终 tsc 通过，原有 BillingProvider 防重机制保留。同步后第1模块；旧无 node-slot intent 升级兼容、任务跨刷新 journal、多 tab/CAS、UI 组合与 R4—R6 继续，见 [R3D记录](../changes/2026-10-24-canvas-text-tasks-r3d.md)。

R3C3：复制/历史添加/选择和项目删除由node-operations负责，既有history事务/reducer承接持久回执；selection-run controller管理批执行生命周期。Canvas9800→9575行，171个非目标函数AST正文不变；基线4/9、新版19/59、PG24→32、真实控件11与相邻12＋12＋5＋5通过。第三模块main同步后计数归零。R3剩余文字内容任务及UI组合，R4—R6、跨请求/多tab文档竞态与完整build/容量仍在后续；见 [R3C3记录](../changes/2026-10-24-canvas-node-operations-r3c3.md)。

R3C2：单一选择快照、gesture owner、link compiler 已真实接线。图片/文字/视频移动与连线复用原 history；`canvas-add` primary 归属、显式 parentIds 和环检测由同一规则负责。主组件10300→9800行，基线10/28→新版34/92，真实PG26→28、相邻PG20；真实Next交互12、文字历史12、详情5、图片5通过。下一步收拢创建/复制删除/批处理，R3尚未整体完成；R4—R6与完整候选验收继续。详见 [R3C2记录](../changes/2026-10-24-canvas-interactions-r3c2.md)。本轮为main同步后第2模块。

2026-10-24实施更新：R0已普通整合 `9fc2845`，重构基线固定为 `4478cdca`。R1A拆成生图R1A1与抠图R1A2：生图及抠图typed提交/执行切片均已实现，原HTTP与内部调用共用同一用例，cutout桥已删除。详细修改、A/B和已知旧测试差异见 [R1A1记录](../changes/2026-10-24-image-generation-boundary-r1a.md)。

- [x] 独立worktree与任务分支。
- [x] 固定源码目录/AST依赖盘点及核心链路定向阅读。
- [x] 模块边界、数据所有者、迁移与验收设计。
- [x] R0整合已完成质量/Canvas修复并建立运行对照。
- [x] R1A1生图typed执行、旧HTTP兼容、原指纹/回执/账务行为对照。
- [x] R1A2抠图typed执行、共享同步账务、任务read用例；原抠图HTTP桥删除；见 [R1A2记录](../changes/2026-10-24-cutout-billing-boundary-r1a2.md)。
- [x] R1B核心图片准备与报价：typed quotation、单model snapshot、共享quality、保存并消费preparedImage；见 [R1B记录](../changes/2026-10-24-image-preparation-r1b.md)。
- [x] R2正常生成与原结果恢复共用本地交付；真实结算/partial回执、原字节与阶段兼容；见 [R2记录](../changes/2026-10-24-image-delivery-r2.md)。
- [x] R3A已有图片/空白与文字生图共用 typed request/scope/task controller；两份轮询/定位/receipt逻辑删除，见 [R3A记录](../changes/2026-10-24-canvas-image-task-r3a.md)。
- [x] R3B1 原子文档编辑/历史持久化：22 类动作单编译器、4 个提交点收敛、原请求重试、分域历史及提交/同步分离，见 [R3B1记录](../changes/2026-10-24-canvas-history-r3b1.md)。
- [x] R3B2 文字文档/草稿/保存队列 owner、历史串行边界、域隔离恢复，见 [R3B2记录](../changes/2026-10-24-canvas-text-document-r3b2.md)。
- [x] R3B3 作品文档/读取/合并/回收站 owner，显式读取错误、保留本地修改与按ID原结果同步，见 [R3B3记录](../changes/2026-10-24-canvas-artwork-document-r3b3.md)。
- [x] R3B4 详情与同步编辑任务、原请求/报价/回执与共用结果 attachment，见 [R3B4记录](../changes/2026-10-24-canvas-task-boundaries-r3b4.md)。
- [x] R3C1 场景投影、独立renderer与Flow状态同步，见 [R3C1记录](../changes/2026-10-24-canvas-scene-r3c1.md)。
- [x] R3C2 选择/连线/拖动命令，见 [R3C2记录](../changes/2026-10-24-canvas-interactions-r3c2.md)。
- [x] R3C3 节点生命周期和批运行，见 [R3C3记录](../changes/2026-10-24-canvas-node-operations-r3c3.md)。
- [x] R3D 文字生成/反推/帮写任务，见 [R3D记录](../changes/2026-10-24-canvas-text-tasks-r3d.md)。
- [x] R3E 图片/空白/文字创作栏与共享参数控件，见 [R3E记录](../changes/2026-10-24-canvas-composers-r3e.md)。
- [x] R4A1 纯Pool/Tx与真实基础能力消费者，见 [R4A1记录](../changes/2026-10-24-platform-db-r4a1.md)。
- [x] R4A2 schema兼容初始化、settings与signup owner，见 [R4A2记录](../changes/2026-10-24-persistence-owners-r4a2.md)。
- [ ] R4A后续身份/钱包/资产/任务数据owner、剩余混合db消费者及跨领域事务接口。
- [ ] R3 剩余上传/助手/外围 UI 组合；文字/图片跨请求 CAS、未知历史响应交错及旧 client intent 升级兼容验收。
- [ ] R4—R6业务实现、集中验证、旧路径删除与最终整合。
- [ ] 迁移后的实际性能、容量与生产功能验收。

功能迭代累计3（R1A1、R1A2、R1B）；完成R1B后刷新/整合origin/main并归零，精确结果在本轮VERIFICATION。后续每完成模块更新此表，不靠会话上下文判断。

R1A2复扫：生产lib→app反向边0（另外2条release fixture import保留）；最大静态SCC55、视频20仍未消除。真实PG 49检查及原回执/账务/SSE通过，旧Canvas Agent脚本在完整基线和新版同样失败，不标全项目通过。下一模块R1B。

R1B更新：真实PG baseline29/modified45检查；一笔新报价 model read 2→1、synthetic Request 1→0，发布中途不混价，显式模型不继承外层scope价格。新版SCC60、video20、动态恢复10仍待R4/R2。下一模块R2。

R2更新：shared completeImageDelivery 已替代两套逐图处理/存储/作品/结算，generation-output.ts已删除；full-tree baseline64/modified73对照关闭错误完成/结算口径，原raw checkpoint保留。旧verify-imagegen-receipts的batch planning在基线/新版均exit1，列入最终候选债务；不把主verifier通过扩大为全suite通过。R2是同步后的第1个功能模块。下一模块R3。

R3A更新：Canvas主组件12422→12130行；新request/scope/controller为70/20/94行，46场景176检查及真实Next控件5项通过。原表单字段/文件字节与顺序46组一致；原10条hooks warning仍保留。第2次功能模块；下一R3B，非整个R3完成。

R3B1更新：Canvas 12130→11936行，历史协议提交4→1，22类动作/44个正反方向wire与文档对照一致；baseline64场景134检查、modified67场景184检查。真实PG20检查、真实Next控件7项通过；后置视频刷新失败保留撤销、auth/flush ABA不提交、原operation重试不先受当前节点拦截。第3个功能模块收尾已fetch/普通merge origin/main `905c8c635e41ff3f4443d43db9776d1db3aab469`，返回Already up to date，exit0；计数归零，下一轮从1开始。R3B2/R3C未完成。

R3B2更新：文字文档状态、缓存、保存/恢复队列已迁入独立 owner；Canvas 11936→11872行。baseline10/22、modified21/58、真实PG16、真实控件12通过；历史67/184及图片任务46/176保持。完整旧text-image verifier缺原pinned快照（基线/新版均setup exit1）保留为债务；多tab CAS及未知历史响应叠加写入未声称关闭。同步后第1个功能模块；整体目标继续。

R3B3更新：作品state/初读/刷新/局部补取/回收站迁入owner，Canvas 11872→11747行；baseline14/23、modified26/49、真实PG14、Next控件8、真实缓存20检查通过。局部读失败不整表回退，晚到读取不覆盖本地编辑/复活删除，同workspace仍共享已有缓存。同步后第2模块；下一R3B4，整体重构继续。

R3B4更新：Canvas 11747→11576 行；详情与抠图/扩图/标注拥有 typed request/task；三类结果落地共用定位/文档同步/undo。baseline74/172、modified74/369、PG21、真实Next5＋普通生图5通过。显式原operation优先于同内容缓存；未知提交原回执重读不是新生成。旧billing-client SSR fixture缺workspace exports在基线/新版均setup失败继续记债务。同步后第3模块；普通整合origin/main后归零，下一R3C，不标整体完成。

R3B4 三模块同步已执行：`git fetch origin main` 与 `git merge --no-edit origin/main` 均 exit 0，origin/main=`905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`；累计计数归零。本轮没有把候选合入 main。

R3C1更新：Canvas 11576→10300行；183个保留函数AST正文未变，节点/投影/交互状态分责。基线27/74、新版30/98；32个SSR HTML相同，17组场景保持＋1组隐藏任务busy修正；400节点单改1对象替换400→1（非线上性能结论）。真实Canvas6、文字历史12、详情编辑5、普通生图5通过。同步后第1模块，下一R3C2，整体目标active。
