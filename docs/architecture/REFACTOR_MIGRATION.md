# 迁移合同与模块记录索引

## R9W 首次paid结果检查点

[R9W](../changes/2026-11-01-refactor-r9w-first-paid-result-checkpoint.md)把已返回结果的本地完成持久化留在原job owner：child/root共用同lease有限重存及同token已提交读回，不重调供应；持续失败准确分阶段保留hold/原intent。真实首写SQL和COMMIT ACK断点不再借用已有done恢复充当证据；其他故障、浏览器视觉和完整223分开验收。

本文维护迁移方法、兼容条件与模块记录，不复制当前运行状态；当前源码、验收和下一步见 [工作区快照](../REFACTOR_WORKSPACE.md) 与 [退出审计](REFACTOR_EXIT_AUDIT.md)。

## 已迁移职责的核对入口

| 工作包 | 当前实现/记录入口 | 仍需持续保持 |
|---|---|---|
| R0 原功能基线 | 原质量/Canvas 修复与历次普通 main 整合 | 不回退用户已明确保留的修复，不覆盖共享工作树 |
| R1A/R1B 图片执行与准备 | imagegen typed 用例、model-config image-preparation、imagegen quotes | 公共入口复用、原价/权限/输入归属、无重复确认 |
| R2 交付与恢复 | 原 checkpoint / storage / artwork / settlement 链 | 原图可续交，不重放付费 POST；历史事故不自动关闭 |
| R3 Canvas 分域 | 文档/任务/交互/投影 owners，React adapters | 当前视图与持久任务区分；CAS/undo/草稿/导航不跨身份 |
| R4A/R4B 数据与配置 | platform DB、各 repository/schema、published reads、显式启动 | Tx 贯穿单连接；兼容入口只 re-export 原 owner；热路径不做管理初始化 |
| R5 适配与 Worker | 协议小合同/registry、媒体独立引擎、唯一 scheduling 与同版本 Worker | 原 wire、lease/fencing、排空、UNKNOWN 和冻结来源 |
| R6 验收及外围 | admin/workbench 具体 owner、完整 core、固定原生 SDK | 不改业务断言换绿；源码/镜像/日志/退出码一致 |

“已迁移职责”不等于整项目完成；剩余门槛由退出审计逐项列出。Canvas 薄事件/DOM adapter 是否保留按职责判断，不按剩余行数继续机械拆分。

## R9V 经典发布草稿与验收

[R9V](../changes/2026-11-01-refactor-r9v-classic-publication-lifecycle.md)修复已确认发布后本人未改动草稿仍滞留旧base的正常第二次发布误拦；原事务内推进base/revision，外来旧草稿和在途修改保持。经典三个原生入口复用已有runner，保留真实Go/PG和原业务断言，诊断与本地Linux依赖层分别归属，不把环境变化或局部通过当完整222/生产通过。

## R9U 后台模型发布与回执

[R9U](../changes/2026-11-01-refactor-r9u-management-publication-session.md)将 F03 快照/原publication/恢复及目录观察迁入纯应用owner和内聚只读子模块。React只绑定端口与投影；无消费者的旧目录hook退出。原id/完整body/版本、旧pending key和明确failed/unknown语义保持。实际hook原25项13PASS12FAIL、新25PASS；原UI33/35项、18HTML及20POST精确对照，server/CAS/PG不以浏览器fixture替代。

## R9T 首页会话目录与附件

[R9T](../changes/2026-11-01-refactor-r9t-workbench-catalog-attachments.md)将列表观察、rename/remove 和上传/作品索引迁入同一首页会话聚合的两个内聚子模块，共享原账号 scope，React 只投影列表/草稿。修改成功使旧列表 revision 失效；索引与上传分离失效，ready 波动不取消有效同账号上传。旧接口、原始 email 和 JSX 字节保持，原 34 场景及新增 9 场景集中验证；结果及证据层级见本轮交付记录。F03 与整体退出继续单列。

## R9R 旧生成页会话

[R9R](../changes/2026-11-01-refactor-r9r-generation-session.md)由`createGenerationSession`的`bindAccount/generate/resume`统一拥有当前视图epoch、原job观察与结果投影；React hook只绑定原auth/billing/cache及multipart/GET协议。页面不再持有poll ref或付费提交协议。原11正常场景与7实际反例、新18场景及普通wire精确对照有实际浏览器记录；归一化账号只用于比较，不改原请求账号/intent指纹。真实付费断线trace不以此替代。上轮Core的父任务fixture只是补实际纯模块依赖，原25业务场景不删。F01/F03继续按真实职责推进。

## R9E 验证接口职责

[R9E](../changes/2026-11-01-refactor-r9e-native-interaction-contract.md)把原生手势准备职责归现成dragCanvasNode，保留真实鼠标与App/PG原断言；直接生成扫描器核对当前typed owner与冻结quote，而不是恢复已删除的积分确认。feature Core触发归PR、main push/精确source依赖保留。目录215项已全部到达，但两批214PASS/1主题FAIL仍不是完整core通过；产品源码0改动，不增加功能模块计数。后续入口、状态、钱包、幂等和UNKNOWN合同不变。

## R9F 原生节点入口身份

[R9F](../changes/2026-11-01-refactor-r9f-native-node-ingress.md)由原创建包装器向五类原生节点的25处理器传server actor；request-auth统一规范化与管理员目标授权。undefined保留未解析/无DB，null是已知匿名；requireAdmin、企业归属、素材、事务、CAS/幂等及原任务均沿原owner。不设跨请求身份缓存。原新98实际HTTP/PG＋20无DB Route（118/244）EXACT，应用源9ba完整216PASS，随后元数据源292e仅改产物端口/失败报告并另验2个真实子进程，选择范围仍PARTIAL/exit2；最终新head有效CI及main整合单列。

## 原始路线和验收合同

## R9Q 历史供应商兜底

[R9Q](../changes/2026-11-01-refactor-r9q-legacy-provider-fallback.md)将历史BYOK的供应商策略归`generation-provider`，任务runtime只编排原任务/报价/交付。gateway产生不同尝试的child身份，durable runtime拥有逐图明确拒绝证据与写入；同一root继续拥有交付和结算。全部原child明确质量拒绝才准许平台兜底；已存fallback child由新租约读取原字节，不重放UNKNOWN或新增顶层交付root。新BYOK入口仍退役。实际断点及原顺序七条归本轮DELIVERY，局部结果不改标全项目。

## R9J 首页会话恢复与观察

[R9J](../changes/2026-11-01-refactor-r9j-workbench-session-owner.md)将首页的恢复身份、历史安装、观察循环、UNKNOWN映射与原session显式停止迁到独立浏览器应用owner。后续[R9M](../changes/2026-11-01-refactor-r9m-workbench-send-owner.md)已经把发送/SSE迁到同一owner，并固定事件时的不可变工具步骤快照；React保留事件/transport/投影和草稿。原有实际React/Chromium浏览器模块保持业务断言并加入统一core；不把新增目录项当作已经执行。会话列表变更和上传生命周期随后由 R9T 迁移，结果见本轮交付记录；不把 R9J 当作全部首页职责验收。

下列阶段表是原始工作包定义与长期合同，固定基线数字属于 2026-10-24，不是当前未完成数量；原先“第一轮推荐”已退出当前指令，全文在 Git 历史保留。

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


## 模块记录索引

每条记录只代表其绑定源码与验收层级。历史 FAIL / PARTIAL、未执行、部署与 fixture 边界保留在原记录，不以新的当前快照覆盖。

- [2026-10-24-account-owners-r4a3.md](../changes/2026-10-24-account-owners-r4a3.md)
- [2026-10-24-artwork-observation-owners-r4a4.md](../changes/2026-10-24-artwork-observation-owners-r4a4.md)
- [2026-10-24-canvas-artwork-document-r3b3.md](../changes/2026-10-24-canvas-artwork-document-r3b3.md)
- [2026-10-24-canvas-composers-r3e.md](../changes/2026-10-24-canvas-composers-r3e.md)
- [2026-10-24-canvas-history-r3b1.md](../changes/2026-10-24-canvas-history-r3b1.md)
- [2026-10-24-canvas-image-task-r3a.md](../changes/2026-10-24-canvas-image-task-r3a.md)
- [2026-10-24-canvas-interactions-r3c2.md](../changes/2026-10-24-canvas-interactions-r3c2.md)
- [2026-10-24-canvas-node-operations-r3c3.md](../changes/2026-10-24-canvas-node-operations-r3c3.md)
- [2026-10-24-canvas-scene-r3c1.md](../changes/2026-10-24-canvas-scene-r3c1.md)
- [2026-10-24-canvas-task-boundaries-r3b4.md](../changes/2026-10-24-canvas-task-boundaries-r3b4.md)
- [2026-10-24-canvas-text-document-r3b2.md](../changes/2026-10-24-canvas-text-document-r3b2.md)
- [2026-10-24-canvas-text-tasks-r3d.md](../changes/2026-10-24-canvas-text-tasks-r3d.md)
- [2026-10-24-content-session-owners-r4a6.md](../changes/2026-10-24-content-session-owners-r4a6.md)
- [2026-10-24-cutout-billing-boundary-r1a2.md](../changes/2026-10-24-cutout-billing-boundary-r1a2.md)
- [2026-10-24-durable-task-owners-r4a5.md](../changes/2026-10-24-durable-task-owners-r4a5.md)
- [2026-10-24-image-delivery-r2.md](../changes/2026-10-24-image-delivery-r2.md)
- [2026-10-24-image-generation-boundary-r1a.md](../changes/2026-10-24-image-generation-boundary-r1a.md)
- [2026-10-24-image-preparation-r1b.md](../changes/2026-10-24-image-preparation-r1b.md)
- [2026-10-24-persistence-owners-r4a2.md](../changes/2026-10-24-persistence-owners-r4a2.md)
- [2026-10-24-platform-db-r4a1.md](../changes/2026-10-24-platform-db-r4a1.md)
- [2026-10-25-commercial-admin-owners-r4a7.md](../changes/2026-10-25-commercial-admin-owners-r4a7.md)
- [2026-10-25-execution-assembly-r4b3.md](../changes/2026-10-25-execution-assembly-r4b3.md)
- [2026-10-25-identity-creation-boundaries-r4b2.md](../changes/2026-10-25-identity-creation-boundaries-r4b2.md)
- [2026-10-25-model-read-boundary-r4b1.md](../changes/2026-10-25-model-read-boundary-r4b1.md)
- [2026-10-25-model-registry-startup-r4b5.md](../changes/2026-10-25-model-registry-startup-r4b5.md)
- [2026-10-25-persistence-startup-owners-r4b6.md](../changes/2026-10-25-persistence-startup-owners-r4b6.md)
- [2026-10-25-web-startup-r4b4.md](../changes/2026-10-25-web-startup-r4b4.md)
- [2026-10-26-canvas-artwork-concurrency-r5p.md](../changes/2026-10-26-canvas-artwork-concurrency-r5p.md)
- [2026-10-26-canvas-assistant-session-r5m.md](../changes/2026-10-26-canvas-assistant-session-r5m.md)
- [2026-10-26-canvas-image-imports-r5l.md](../changes/2026-10-26-canvas-image-imports-r5l.md)
- [2026-10-26-canvas-image-text-r5n.md](../changes/2026-10-26-canvas-image-text-r5n.md)
- [2026-10-26-canvas-text-concurrency-r5o.md](../changes/2026-10-26-canvas-text-concurrency-r5o.md)
- [2026-10-26-canvas-workspace-pages-r5k.md](../changes/2026-10-26-canvas-workspace-pages-r5k.md)
- [2026-10-26-direct-application-worker-r5b.md](../changes/2026-10-26-direct-application-worker-r5b.md)
- [2026-10-26-feature-model-policy-r5h.md](../changes/2026-10-26-feature-model-policy-r5h.md)
- [2026-10-26-image-worker-ownership-r5c.md](../changes/2026-10-26-image-worker-ownership-r5c.md)
- [2026-10-26-leaf-owner-boundaries-r5i.md](../changes/2026-10-26-leaf-owner-boundaries-r5i.md)
- [2026-10-26-media-runtime-boundary-r5f.md](../changes/2026-10-26-media-runtime-boundary-r5f.md)
- [2026-10-26-model-execution-transport-r5g.md](../changes/2026-10-26-model-execution-transport-r5g.md)
- [2026-10-26-parent-receipt-integration-r5j.md](../changes/2026-10-26-parent-receipt-integration-r5j.md)
- [2026-10-26-refactor-acceptance-r6a.md](../changes/2026-10-26-refactor-acceptance-r6a.md)
- [2026-10-26-refactor-main-sync-r5c.md](../changes/2026-10-26-refactor-main-sync-r5c.md)
- [2026-10-26-refactor-main-sync-r5i.md](../changes/2026-10-26-refactor-main-sync-r5i.md)
- [2026-10-26-refactor-main-sync-r5m.md](../changes/2026-10-26-refactor-main-sync-r5m.md)
- [2026-10-26-refactor-main-sync-r5p.md](../changes/2026-10-26-refactor-main-sync-r5p.md)
- [2026-10-26-refactor-runtime-r6b.md](../changes/2026-10-26-refactor-runtime-r6b.md)
- [2026-10-26-video-wire-boundaries-r5d.md](../changes/2026-10-26-video-wire-boundaries-r5d.md)
- [2026-10-26-video-worker-ownership-r5e.md](../changes/2026-10-26-video-worker-ownership-r5e.md)
- [2026-10-26-worker-recovery-boundary-r5a.md](../changes/2026-10-26-worker-recovery-boundary-r5a.md)
- [2026-10-27-canvas-clipboard-r6n.md](../changes/2026-10-27-canvas-clipboard-r6n.md)
- [2026-10-27-canvas-image-creation-r6p.md](../changes/2026-10-27-canvas-image-creation-r6p.md)
- [2026-10-27-canvas-input-controls-r6m.md](../changes/2026-10-27-canvas-input-controls-r6m.md)
- [2026-10-27-canvas-native-integration-r6s.md](../changes/2026-10-27-canvas-native-integration-r6s.md)
- [2026-10-27-canvas-project-catalog-r6l.md](../changes/2026-10-27-canvas-project-catalog-r6l.md)
- [2026-10-27-canvas-request-workflow-r6q.md](../changes/2026-10-27-canvas-request-workflow-r6q.md)
- [2026-10-27-main-owner-integration-r6o.md](../changes/2026-10-27-main-owner-integration-r6o.md)
- [2026-10-27-refactor-admin-settings-r6g.md](../changes/2026-10-27-refactor-admin-settings-r6g.md)
- [2026-10-27-refactor-admin-usage-r6f.md](../changes/2026-10-27-refactor-admin-usage-r6f.md)
- [2026-10-27-refactor-canvas-artwork-writer-r6d.md](../changes/2026-10-27-refactor-canvas-artwork-writer-r6d.md)
- [2026-10-27-refactor-dependencies-r6k.md](../changes/2026-10-27-refactor-dependencies-r6k.md)
- [2026-10-27-refactor-model-management-r6h.md](../changes/2026-10-27-refactor-model-management-r6h.md)
- [2026-10-27-refactor-model-ui-runner-r6j.md](../changes/2026-10-27-refactor-model-ui-runner-r6j.md)
- [2026-10-27-refactor-product-browser-r6c.md](../changes/2026-10-27-refactor-product-browser-r6c.md)
- [2026-10-27-refactor-supplier-library-r6i.md](../changes/2026-10-27-refactor-supplier-library-r6i.md)
- [2026-10-27-refactor-workbench-assets-r6e.md](../changes/2026-10-27-refactor-workbench-assets-r6e.md)
- [2026-10-27-worker-media-integration-r6r.md](../changes/2026-10-27-worker-media-integration-r6r.md)
- [2026-10-28-admin-entry-ownership-r6t.md](../changes/2026-10-28-admin-entry-ownership-r6t.md)
- [2026-10-28-character-owner-integration-r6u.md](../changes/2026-10-28-character-owner-integration-r6u.md)
- [2026-10-28-image-version-owner-integration-r6w.md](../changes/2026-10-28-image-version-owner-integration-r6w.md)
- [2026-10-28-refactor-r6x-native-audio-integration.md](../changes/2026-10-28-refactor-r6x-native-audio-integration.md)
- [2026-10-28-refactor-r6y-timeline-integration.md](../changes/2026-10-28-refactor-r6y-timeline-integration.md)
- [2026-10-28-refactor-r6z-main-performance-integration.md](../changes/2026-10-28-refactor-r6z-main-performance-integration.md)
- [2026-10-28-refactor-r7a-import-ownership.md](../changes/2026-10-28-refactor-r7a-import-ownership.md)
- [2026-10-28-scene-owner-integration-r6v.md](../changes/2026-10-28-scene-owner-integration-r6v.md)
- [2026-10-29-refactor-r7b-native-lifecycle.md](../changes/2026-10-29-refactor-r7b-native-lifecycle.md)
- [2026-10-29-refactor-r7c-native-documents.md](../changes/2026-10-29-refactor-r7c-native-documents.md)
- [2026-10-29-refactor-r7d-generation-activity.md](../changes/2026-10-29-refactor-r7d-generation-activity.md)
- [2026-10-29-refactor-r7e-media-state.md](../changes/2026-10-29-refactor-r7e-media-state.md)
- [2026-10-29-refactor-r7f-generation-presentation.md](../changes/2026-10-29-refactor-r7f-generation-presentation.md)
- [2026-10-29-refactor-r7g-owner-integration.md](../changes/2026-10-29-refactor-r7g-owner-integration.md)
- [2026-10-29-refactor-r7h-pending-presentation.md](../changes/2026-10-29-refactor-r7h-pending-presentation.md)
- [2026-10-29-refactor-r7i-generation-applications.md](../changes/2026-10-29-refactor-r7i-generation-applications.md)
- [2026-10-29-refactor-r7j-native-actions.md](../changes/2026-10-29-refactor-r7j-native-actions.md)
- [2026-10-29-refactor-r7k-integration-acceptance.md](../changes/2026-10-29-refactor-r7k-integration-acceptance.md)
- [2026-10-29-refactor-r7l-main-integration.md](../changes/2026-10-29-refactor-r7l-main-integration.md)
- [2026-10-29-refactor-r7m-composer-responsive.md](../changes/2026-10-29-refactor-r7m-composer-responsive.md)
- [2026-10-29-refactor-r7n-branch-ci.md](../changes/2026-10-29-refactor-r7n-branch-ci.md)
- [2026-10-29-refactor-r7o-primary-generation.md](../changes/2026-10-29-refactor-r7o-primary-generation.md)
- [2026-10-30-refactor-r7p-text-image-runs.md](../changes/2026-10-30-refactor-r7p-text-image-runs.md)
- [2026-10-30-refactor-r7q-local-image-edits.md](../changes/2026-10-30-refactor-r7q-local-image-edits.md)
- [2026-10-30-refactor-r7r-main-owner-integration.md](../changes/2026-10-30-refactor-r7r-main-owner-integration.md)
- [2026-10-30-refactor-r7s-viewport-appearance.md](../changes/2026-10-30-refactor-r7s-viewport-appearance.md)
- [2026-10-30-refactor-r7t-overlay-ownership.md](../changes/2026-10-30-refactor-r7t-overlay-ownership.md)
- [2026-10-30-refactor-r7u-arrange-application.md](../changes/2026-10-30-refactor-r7u-arrange-application.md)
- [2026-10-30-refactor-r7v-video-follow.md](../changes/2026-10-30-refactor-r7v-video-follow.md)
- [2026-10-30-refactor-r7w-billing-presentation.md](../changes/2026-10-30-refactor-r7w-billing-presentation.md)
- [2026-10-30-refactor-r8a-text-editing.md](../changes/2026-10-30-refactor-r8a-text-editing.md)
- [2026-10-30-refactor-r8b-request-schema-startup.md](../changes/2026-10-30-refactor-r8b-request-schema-startup.md)
- [2026-10-30-refactor-r8c-canvas-stitch.md](../changes/2026-10-30-refactor-r8c-canvas-stitch.md)
- [2026-10-31-refactor-r8d-performance.md](../changes/2026-10-31-refactor-r8d-performance.md)
- [2026-10-31-refactor-r8e-rendering.md](../changes/2026-10-31-refactor-r8e-rendering.md)
- [2026-10-31-refactor-r8f-downloads.md](../changes/2026-10-31-refactor-r8f-downloads.md)
- [2026-10-31-refactor-r8g-node-preferences.md](../changes/2026-10-31-refactor-r8g-node-preferences.md)
- [2026-10-31-refactor-r8h-artwork-picker.md](../changes/2026-10-31-refactor-r8h-artwork-picker.md)
- [2026-10-31-refactor-r8i-native-editors.md](../changes/2026-10-31-refactor-r8i-native-editors.md)
- [2026-10-31-refactor-r8j-mixed-load.md](../changes/2026-10-31-refactor-r8j-mixed-load.md)
- [2026-10-31-refactor-r8k-node-creation.md](../changes/2026-10-31-refactor-r8k-node-creation.md)
- [2026-10-31-refactor-r8l-view-navigation.md](../changes/2026-10-31-refactor-r8l-view-navigation.md)
- [2026-10-31-refactor-r8m-image-model-selection.md](../changes/2026-10-31-refactor-r8m-image-model-selection.md)
- [2026-10-31-refactor-r8n-feature-catalog.md](../changes/2026-10-31-refactor-r8n-feature-catalog.md)
- [2026-10-31-refactor-r8o-image-scheduling.md](../changes/2026-10-31-refactor-r8o-image-scheduling.md)
- [2026-10-31-refactor-r8p-native-fixture-lifecycle.md](../changes/2026-10-31-refactor-r8p-native-fixture-lifecycle.md)
- [2026-10-31-refactor-r8q-canvas-io-boundaries.md](../changes/2026-10-31-refactor-r8q-canvas-io-boundaries.md)
- [2026-10-31-refactor-r8r-selection-projection.md](../changes/2026-10-31-refactor-r8r-selection-projection.md)
- [2026-10-31-refactor-r8s-saved-text-results.md](../changes/2026-10-31-refactor-r8s-saved-text-results.md)
- [2026-10-31-refactor-r8t-enterprise-source-onboarding.md](../changes/2026-10-31-refactor-r8t-enterprise-source-onboarding.md)
- [2026-10-31-refactor-r8u-whole-core.md](../changes/2026-10-31-refactor-r8u-whole-core.md)
- [2026-10-31-refactor-r8v-timeline-readiness.md](../changes/2026-10-31-refactor-r8v-timeline-readiness.md)
- [2026-10-31-refactor-r8w-fixed-native-acceptance.md](../changes/2026-10-31-refactor-r8w-fixed-native-acceptance.md)
- [2026-10-31-refactor-r8x-current-performance.md](../changes/2026-10-31-refactor-r8x-current-performance.md)

- [2026-11-01-refactor-r8y-quote-intent.md](../changes/2026-11-01-refactor-r8y-quote-intent.md)

## R8Y 合同更新

报价意图保存、原预览读取与公开投影统一归quote owner；新确定性quote ID只用于新合同，历史随机ID和子任务ID不改。已有主键冲突胜出，不引入新表/事务锁。完整core208与同镜像runtime/browser已执行；具体源、边界、性能未完成项见R8Y记录与当前快照，不把本模块完成写成全项目完成。

## R8Z 入口归属

[R8Z actor/权益决定](../changes/2026-11-01-refactor-r8z-ingress-ownership.md)：HTTP入口显式传递已认证actor；当前权益检查返回绑定actor的本次决定，领域用例只复用同actor结果，跨actor/no-context仍读自己的权限。没有全局/跨请求缓存，旧callback与no-DB适配保留。 权益新增返回值为可选actor-bound决定，旧调用者继续忽略；新消费者遇undefined走既有账号权益读取。入口callback的null/undefined区分已确定匿名与未解析状态，不依赖跨版本共享内存。

## R9A 图片提交/回执入口迁移

[R9A 记录](../changes/2026-11-01-refactor-r9a-image-ingress-routes.md)：其余 5 个图片路由文件的 7 个 handler 显式消费入口 actor；creation/receipt callback 共用同一类型。BI 入口接受可选的服务端认证结果，省略仍执行旧认证，null 不再重试另一身份，no-DB 行为保持。原生 cookie/实际 HTTP/PG 的完整原/新 39 场景/90 检查证明直接调用链 2/3→1、正常轨迹 EXACT；该数字不含 middleware，终态 ZIP 数据明确为 fixture，不是供应商交付证明。全局原任务/取消/UNKNOWN 与钱包规则仍由原模块拥有，没有 schema/价格/供应商修改。

固定9a52验证源的pricing11/11执行通过，runner保留部分目录PARTIAL/exit2，不称完整210通过；全项目5091类型输入一致/tsc exit0、lint exit0、四类SCC0。独立副本原5333raw hash/原39场景90检查恢复，later-edit首写前拒绝。第三模块刷新并普通整合main（已包含，无源码变化，计数3→0）。完整应用最后证据仍归R8Z；历史generate-image轮询及跨文件身份适配为后续实际代码任务。

## R9B 历史生成入口

[R9B记录](../changes/2026-11-01-refactor-r9b-legacy-generation-ingress.md)：既有intent/BI callback、model/quote适配与领域actor/quote port显式传递服务端身份；undefined保留旧认证、null不借用其他身份。MAC/expiry/owner/scope/输入指纹/冻结价及原任务职责仍在原owner，不共享身份缓存。实际原生HTTP/PG原/新38场景79检查覆盖4～7→1、health0、原价6/当前17、余额不足、原receipt、丢ACK待核查和同编号并发一任务，正常投影EXACT。最后完整应用证据仍是R8Z，当前211整版仍待后续固定验收。

固定b796验证源pricing12/12通过，runner保持部分目录PARTIAL/exit2；5092类型输入/tsc exit0、lint exit0、四SCC0。独立副本原5335raw hash/38场景79检查恢复，later-edit零写；归档仅4文档桥接。本轮同步计数1，不写main、不发布。公共billing/quote与canvas/image-tasks仍有间接身份解析，不以本地AST直接候选0作为全站闭合。

## R9C 公共报价与编辑用例

[R9C记录](../changes/2026-11-01-refactor-r9c-quote-canvas-boundary.md)：quote准备/issue和intent复用入口actor；Canvas HTTP层组装原模型Request适配，任务用例仅接受actor、输入、typed准备port，headless使用withModelOperation；不再接收/构造Request或解析无效价格回显。输入/来源检查仍先于模型/quote读取，原Tx/lease/frozen/结果/账务owner保持。实际原/新29场景59检查含Worker领取、回环PNG/private像素读回、原价6/current17后consume1/charge6、原receipt/丢ACK/并发；正常投影EXACT。现存Request调用方与旧确认断言按当前协议迁移，不恢复已经删除的Agent门槛。

## 历史入口

[收敛前的完整迁移流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/architecture/REFACTOR_MIGRATION.md)保留。文档类改动不增加产品模块计数；后续代码每完成三模块普通同步主线，仍遵从 AGENTS。

## 尚待迁移的同类入口

R8Z的旧盘点只追踪本地resolveUserEmail，7候选数字属于历史方法，不能作为当前剩余数量。R9A/B/C已经迁移图片、历史生成、公共报价和编辑入口。R9D按named-import别名补充authenticatedEmail/authorizedTargetEmail后，在59个creation/receipt wrapper中得到48个零参数认证边界调用、31文件；这是静态迁移线索，不是实际重复SQL次数或事故归因。后续保留管理员目标读取、no-DB/null/undefined、来源、scope与原回执语义，按真实调用链验证；不因旧方法候选0宣称全站闭合。当前数据见output/refactor-r9d-20261101/INGRESS_OWNER_INVENTORY.json。

### R9C 验证资产迁移

旧background contract不再要求恢复逻辑内联到Canvas组件；CLI复用现有video-follow、video-submission、image-text-editor、pending-presentation验证。任务身份/原子创建仍有AST检查，真实PG/Worker与账务证明由R9C实际入口脚本承担，不混写为同一种验收。旧model-execution验证调用方以独立当前草稿完成每轮发布，明确旧草稿仍拒绝，不使用acceptStaleBase换绿。OCR定位断言使用现有initialize语义。原失败日志、修正后固定源和输入字节桥接见R9C目录；源码/报告/有效CI/整版/主线/生产各自记录。

## R9D 验证素材owner

runtime的输入只依赖timeline-rules，不依赖所有无关UI用例通过。`verification.runtime_vectors.verified_timeline_vectors`核对与固定应用同源的owner PASS/exit0/marker、实际日志hash和5个文件hash；复制时再次核对。返回父report状态与completeCore原值，不作发布决定。runtime.py仍检查全部生产输入字节与固定镜像一致；生产代码未替换。19个状态合同检查加入目录后213项，当前完整213尚未执行。独立runtime177/browser92/450秒混合PASS不消除原core的timeline失败和theme首因OPEN。
