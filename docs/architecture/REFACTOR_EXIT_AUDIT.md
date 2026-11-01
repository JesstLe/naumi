# 整体退出审计

- R10A：[当前main整合](../changes/2026-11-02-refactor-r10a-current-main-sync.md)。R9Z封版后fetch发现ca63c76f，只新增四个ops／发布记录文件，普通merge无冲突；产品2149／原scripts1737／编译输入5105 raw保持。原22项21PASS1SKIP，新增28项20PASS8SKIP，未运行真实PG选项。R9Z96浏览器与Go/PG保持原source，最终merge未重标为同源整版执行；当前CI、剩余矩阵及候选合main继续。保留main独立47发布证据，本重构未发布，整体ACTIVE。


- R9Z：[真实同任务断网链](../changes/2026-11-02-refactor-r9z-paid-disconnect-acceptance.md)。固定完整61ef Web/Worker＋真实PG／双context单次96PASS、8consume／48积分。新增4项确实从Canvas受理原identity后离线，Worker交付、原图SHA／原账本／原scope恢复／第二次reload全部核对；M09推进这个精确维度，不一并关闭物理掉线／UNKNOWN／M03/M04/M06。原166断言、2149产品文件raw保持，完整business与回滚归R9Z最终DELIVERY。旧61ef Core实际执行93edc006 SUCCESS，tree同2239f511；Image FAIL的经典fixture相对Router路径已本机复现。新headCI、完整语义审阅及合main继续，整体ACTIVE、部署0、47HOLD。


- R9Y：[最新主线同步](../changes/2026-11-01-refactor-r9y-main-sync.md)。origin/main真实推进67bbcddf；独立分支普通merge保留5incoming文件，无冲突。公开目录32→33及完整合同、27个scan策略单测实际PASS；生成/模型/钱包代码与df997b40 raw保持。此为将main合入候选，不是候选已合main/已发布；新头完整223/CI及剩余故障矩阵继续。

- R9X：[发布草稿验收](../changes/2026-11-01-refactor-r9x-model-draft-verification.md)。完整基线真实PG复现execution旧错误码预期exit1；夹具分开发布者旧revision与另一actor旧base，两个拒绝分支均严格保留。原顺序11模型命令单次全exit0，产品2149文件raw不变；旧b24Image失败/日志EOF不改写，新head完整223/CI/main继续。

- R9W当前推进：[首次paid结果检查点](../changes/2026-11-01-refactor-r9w-first-paid-result-checkpoint.md)。真实入口/PG/lease/供应返回后首笔child/root snapshot失败和真实COMMIT丢ACK，原5场景复现、新5场景PASS；不seed done，不重放供应，原6积分/字节/GET提示同case核对。持续失败hold和未持久化风险保留；M05这几个精确场景推进，不一并关闭M03/M04/M06/M09。原相关回归、完整223及main仍分层验收，b24 Image在注册模型组实际FAIL/日志EOF，Core按实际刷新。

## 当前固定版本

- R9V当前推进：[经典发布生命周期](../changes/2026-11-01-refactor-r9v-classic-publication-lifecycle.md)。真实Go/PG浏览器第二次发布明确PUBLISH_STALE_DRAFT_BASE；真实PG原16复现、新17通过，原事务只推进发布者未再改动的同摘要草稿，外来陈旧草稿/在途编辑/CAS/原回执保持。经典UI共享已有sourcecopy/IPC owner，受控子进程104检查通过；本机原load超时/OOM和远端59f billing-ui FAIL均留存，后者精确断言仍OPEN，不用Linux局部通过消除历史失败。本地三原生入口均exit0（真实Go/PG，移动端/非管理员，供应商POST0），batch旧定位和APIMart本地桥接origin的失败及修正分开留存；59f Core已SUCCESS、Image仍billing-ui FAIL，新head222目录/整版/main以本轮DELIVERY和后续固定证据为准。

- R9U当前推进：[后台发布会话](../changes/2026-11-01-refactor-r9u-management-publication-session.md)。F03快照/原publication恢复和只读目录已归纯应用owner，React仅投影/端口。实际hook原25项13PASS12FAIL、新25PASS；完整页面脚本原33PASS、新35PASS，18HTML/20POST精确一致。旧有效pending/原版本保持，scope只代表管理视图生命周期，不冒充账号授权；服务端CAS/价格/任务不变。F01/F02/F03已列职责迁移不等于全量语义耦合审阅或当前整版通过，最终源/回滚归本轮DELIVERY。

- R9T当前推进：[首页目录与附件](../changes/2026-11-01-refactor-r9t-workbench-catalog-attachments.md)。F01列表观察/变更及上传/索引生命周期已归同一会话聚合下的内聚子模块；实际旧43场景37PASS/6FAIL、新43PASS，原恢复/发送47场景原新均PASS。保留原34检查和原始email/JSX字节，ready不取消同账号上传或已受理SSE。证据是实际组件/Chromium与fixture后端，不代替同一真实付费断线链；F03、当前整版CI/main仍OPEN。最终源及回滚见本轮DELIVERY。

- R9S收敛：[免重复确认的实际owner扫描](../changes/2026-11-01-refactor-r9s-direct-submission-ownership.md)。0454f164的Image在原静态generate归属断言FAIL，后续步骤SKIPPED；原实现本地复现同样错误。候选只更新原scanner跟随页面→hook→session→原billing端口及guard/quote，原其他条件保留、37静态正负检查PASS，产品2144文件raw不变。实际业务与新head完整CI仍分别验收，不将静态PASS当作已生成/已扣款。

- R9R当前推进：[旧生成页会话](../changes/2026-11-01-refactor-r9r-generation-session.md)。F02提交/原job观察/结果投影已从组件迁移到单一owner；最终实际组件/Chromium原18场景11PASS7FAIL、新18PASS，原正常wire EXACT，原账号和实际intent指纹保留。auth/账务后端为fixture，真实同一付费断线trace仍OPEN；F01列表/上传与F03publication恢复是剩余应用owner，F02不再误列为完全未迁移。

- 最新固定旧head1e2df80c：Image完整远端SUCCESS；Core执行源为GitHub合并快照d70820f8，在parent-completion的纯依赖导入漏项FAIL。该错误已本地原样复现，加载真实质量模块后原25场景PASS；新head仍需完整CI，不把这一条修正写成Core已通过。

- 当前推进R9Q：[历史供应商兜底](../changes/2026-11-01-refactor-r9q-legacy-provider-fallback.md)。真实PG复现旧原子拒绝挡住平台兜底，修正为同root下独立attempt child；原价、真实租约和UNKNOWN不重放保持。fallback child已存/root未存的精确lease-lost断点已经实际恢复原字节/零额外供应POST；完整原顺序七条单次7/7 PASS、credit37场景、tsc/lint0，副本行为按R9Q最终DELIVERY验收，不拼接上轮5PASS/1FAIL，也不当作新head整版CI。

- 上轮R9P网关实际本机PASS，副本恢复5360原始hash及旧失败，产品源码0修改。本地8980b122尚未单独push；远端最新e8156ee2的Core实际SUCCESS，Image在gateway处FAIL；其前build/账务/路由/模型/浏览器组实际PASS。新head仍需独立有效CI，既有watch不代表放行或审批。

- 最新只读完整退出映射：`output/refactor-exit-e8156ee2-20261101/AUDIT.md`，20要求、9类故障×5维、219目录文件存在，结论仍PARTIAL。不能将已存paid-done恢复当首次paid-result持久化失败、无客户账务quota适配测试当客户余额验证、本地fs失败当远端对象PUT失败，或两条分开的UI/paid记录当同一付费断线链。

- 在e8156ee2退出映射时，F02旧生成页submit/poll/result投影、F01首页会话列表/上传生命周期、F03后台发布恢复均为残余owner；R9R的F02迁移见顶部，不改写旧报告。R9M已完成发送/SSE归属，旧R9J的“仍待迁移”是历史状态。main protection/rulesets API已返回计划功能403，未变更仓库可见性/计划/权限，不宣称required checks已配置。

以下R9N及更早版本条目和表格保存对应固定源的历史证据，不能当作R9Q的新头整版执行：

- R9N：[typed模型覆盖合同](../changes/2026-11-01-refactor-r9n-typed-model-coverage.md)。原脚本实际在headlessCanvas的HTTP调用名断言exit1，生产typed用例API保留。候选只修guard的依赖方向，按实际导入绑定校验、补8个正负例，原SDK/HTTP/video检查不删；完整注册模型组及远端CI分别验收。

- R9M：[首页显式发送/SSE归属](../changes/2026-11-01-refactor-r9m-workbench-send-owner.md)。同一账号/generation owner接管PUT/SSE/save/PATCH及stream句柄；React保留投影和草稿。新增真实流组合场景复现原可变步骤数组被延后updater重复读取；不可变事件快照修复，不接受重复步骤。原73场景保留，原81中1失败与新版/回滚结果分别留证，仍须本轮最终固定源及整版CI。

- R9L：[业务路由fixture生命周期](../changes/2026-11-01-refactor-r9l-routing-fixture-lifecycle.md)。原完整脚本实际在stale draft409后，自己的heldHTTP使finally悬挂；诊断只改清理即恢复真实异常。候选分开负责新编辑草稿、原请求终态与夹具清理，不动生产CAS/限流/报价；两种真实失败及原业务集中结果归DELIVERY，不把219目录新增当整版PASS。

- R9K当前收敛：[NAS准入输入](../changes/2026-11-01-refactor-r9k-nas-admission-fixture.md)。旧3fa Core实际nas-delivery FAIL；已在原生产源码、真实时钟和自有PG/HTTP中，以显式低容量读复现相同5秒断言失败，正常容量原用例PASS。原测试未控制准入条件；候选分开验证admitted local-first和non-admitted remote-first，原37断言/5000ms不删除。最终执行与回滚归R9K DELIVERY，不把fixture容量读或本地通过当成历史CI磁盘证明。

- R9J历史实施：[首页会话恢复与观察](../changes/2026-11-01-refactor-r9j-workbench-session-owner.md)。独立owner接入、原新实际浏览器各73场景、非增量tsc0与定向lint0。后续发送/SSE已由R9M迁移，最新整版和原3fa状态仍分别绑定对应source。

- R9H当前收敛：[账务与历史输入合同](../changes/2026-11-01-refactor-r9h-billing-regression-contract.md)。原顺序18项真实PG账务整模块单次PASS；无历史Git环境的原生管理员19组API/PG检查PASS，55条原业务assert完整保留且原始旧源字节pin；全项目tsc0、runner20/360。产品0改动，不把原9ba的216结果重标为本轮。

- R9G正在收敛实际远端失败：[执行输入记录](../changes/2026-11-01-refactor-r9g-ci-execution-inputs.md)。804ce5af的Image/Core均FAIL，分别为V8 heap OOM及英文界面的中文定位器失败；后者已实际原/新对照，不能用新检查替代其余远端未到达业务用例。

- 应用/验证执行源码：`9ba80e10ed5135e5eeb20cc4c57c93cfb090aa71`，当前216项单次完整PASS/0失败/0未运行/0复用；镜像/SDK及实际命令归本轮DELIVERY。
- 16个原产品文件变更，其余2125个原src/services字节相同。5344原文件→5346当前文件；归档源码与元数据源之间为4文档桥接；应用到元数据源另有3个验收路径/CI报告文件，产品字节不变。
- **wholeGoal=ACTIVE；mainMerged=false；deployed=false；47HOLD。** 本地完整通过不等于有效远端CI或最终main交付。

| 要求 | 当前实际证据 | 判定 |
|---|---|---|
| 完整核心目录 | 应用源9ba单次216PASS/0FAIL/0NOT_RUN/0reuse | 本轮应用PASS；元数据修正源未本地重跑完整216，须新head CI |
| 验收产物归属 | 元数据源292e24f5195e5d416121105a45cff1836a61930f两个真实子进程、原生118/244＋拖动4/14；继承旧路径未写入，正常投影EXACT | 选择范围PARTIAL/exit2；不改原216报告SHA |
| 原生节点身份职责 | 15Route/25handler/5families；原新各98实际HTTP/nativeHMAC/PG＋20无DB Route（118场景244检查）、投影EXACT | 普通账号SQL2→1，管理员代查3→2；保留真实角色检查，无全局缓存 |
| 原生状态与归属 | 原operation、CAS冲突、并发账号/CAS、跨账号/跨站、角色/账号撤权与20无DB401 | 本轮模块通过；不把静态剩余认证候选当全站事故 |
| Web/Worker | 同固定镜像runtime177，真实登录/HTTP/PG/原价/UNKNOWN/取消/FFmpeg/排空 | 本轮独立PASS |
| 产品浏览器 | 同镜像92检查、2context、routeMocks0、原接口/PG及7交付42积分 | 本轮PASS，非生产付费质量 |
| 混合运行 | 原450秒calibration，165图片/12媒体/177consume/1014积分，无付费重放或未完成父任务 | businessInvariantsPASS，capacityClaim=false |
| 类型与结构 | 元数据源292e非增量tsc0；5092编译器输入+4配置（应用源9ba计数5091）；lint0/37既有warning；四类SCC0 | 本轮PASS |
| 历史间歇失败 | 当前原97主题用例及timeline链PASS；R9E主题重载和R9D拖动原FAIL留存 | 历史唯一根因OPEN，不归因为本轮16文件迁移 |
| CI构建证据 | 原npm build/参数/exit保留；完整日志、source/tree、失败注释及always artifact；真实Bash0/7＋Node只读报告5场景18检查 | 接线PASS，不冒称旧build根因或新远端已通过 |
| 有效远端CI | ba497/804及5adb两条均有实际FAIL；5adb的Image build已PASS后失败于账务，Core失败于历史Git对象输入，R9H分别实测修正 | 仍需R9H新head实际通过，不以本地整模块绿灯替代 |
| 源码与回退 | 四产物/完整binary patch/原5344raw hash/副本行为与later-edit首写前零写 | 以本轮最终重开记录为准，实际工作树保留新版 |
| main普通整合 | 第3产品模块后fetch及merge origin/main e2f56255已包含，计数3→0，未写main | 最终分支合main仍OPEN；分支已超过48小时 |
| 生产与容量 | 当前未发布，47HOLD；历史供应商/持久化/传输及生产负载沿独立台账 | 不以本轮样本关闭或宣称10万容量 |

## 下一步与历史边界

1. 读取新head的实际CI及可读取的构建失败注释，修复真实失败，不改变原测试/构建退出语义。
2. 有效同源CI后做普通main整合和固定版本交付；仍有真实调用方的兼容边界按职责退出，不按文件/行数机械拆分。
3. 保留R9E两批214PASS/1主题FAIL、R9D211PASS/1timelineFAIL及原截图缺失/诊断中断，当前PASS不改写旧报告。R8Z配对性能、冷样本/跨期漂移和历史回退归因仍属于其旧固定源；本轮未重测配对性能。

[工作区](../REFACTOR_WORKSPACE.md) · [R9F](../changes/2026-11-01-refactor-r9f-native-node-ingress.md) · [迁移合同](REFACTOR_MIGRATION.md) · [100k台账](../PRODUCT_READINESS_100K.md)
