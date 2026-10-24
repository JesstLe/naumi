# 渐进迁移与集中验收台账

日期：2026-10-24。关联：[主方案](../REFACTOR_ARCHITECTURE.md)、[源码证据](2026-10-24-current-state.md)。

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
- [ ] R3B 后续详情与编辑任务、作品加载合并；文字/图片跨请求 CAS 及未知历史响应交错验收；R3C renderer/interaction。
- [ ] R4—R6业务实现、集中验证、旧路径删除与最终整合。
- [ ] 迁移后的实际性能、容量与生产功能验收。

功能迭代累计3（R1A1、R1A2、R1B）；完成R1B后刷新/整合origin/main并归零，精确结果在本轮VERIFICATION。后续每完成模块更新此表，不靠会话上下文判断。

R1A2复扫：生产lib→app反向边0（另外2条release fixture import保留）；最大静态SCC55、视频20仍未消除。真实PG 49检查及原回执/账务/SSE通过，旧Canvas Agent脚本在完整基线和新版同样失败，不标全项目通过。下一模块R1B。

R1B更新：真实PG baseline29/modified45检查；一笔新报价 model read 2→1、synthetic Request 1→0，发布中途不混价，显式模型不继承外层scope价格。新版SCC60、video20、动态恢复10仍待R4/R2。下一模块R2。

R2更新：shared completeImageDelivery 已替代两套逐图处理/存储/作品/结算，generation-output.ts已删除；full-tree baseline64/modified73对照关闭错误完成/结算口径，原raw checkpoint保留。旧verify-imagegen-receipts的batch planning在基线/新版均exit1，列入最终候选债务；不把主verifier通过扩大为全suite通过。R2是同步后的第1个功能模块。下一模块R3。

R3A更新：Canvas主组件12422→12130行；新request/scope/controller为70/20/94行，46场景176检查及真实Next控件5项通过。原表单字段/文件字节与顺序46组一致；原10条hooks warning仍保留。第2次功能模块；下一R3B，非整个R3完成。

R3B1更新：Canvas 12130→11936行，历史协议提交4→1，22类动作/44个正反方向wire与文档对照一致；baseline64场景134检查、modified67场景184检查。真实PG20检查、真实Next控件7项通过；后置视频刷新失败保留撤销、auth/flush ABA不提交、原operation重试不先受当前节点拦截。第3个功能模块收尾已fetch/普通merge origin/main `905c8c635e41ff3f4443d43db9776d1db3aab469`，返回Already up to date，exit0；计数归零，下一轮从1开始。R3B2/R3C未完成。

R3B2更新：文字文档状态、缓存、保存/恢复队列已迁入独立 owner；Canvas 11936→11872行。baseline10/22、modified21/58、真实PG16、真实控件12通过；历史67/184及图片任务46/176保持。完整旧text-image verifier缺原pinned快照（基线/新版均setup exit1）保留为债务；多tab CAS及未知历史响应叠加写入未声称关闭。同步后第1个功能模块；整体目标继续。
