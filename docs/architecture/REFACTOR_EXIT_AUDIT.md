# 整体退出审计

## 当前固定版本

- R9M：[首页显式发送/SSE归属](../changes/2026-11-01-refactor-r9m-workbench-send-owner.md)。同一账号/generation owner接管PUT/SSE/save/PATCH及stream句柄；React保留投影和草稿。新增真实流组合场景复现原可变步骤数组被延后updater重复读取；不可变事件快照修复，不接受重复步骤。原73场景保留，原81中1失败与新版/回滚结果分别留证，仍须本轮最终固定源及整版CI。

- R9L：[业务路由fixture生命周期](../changes/2026-11-01-refactor-r9l-routing-fixture-lifecycle.md)。原完整脚本实际在stale draft409后，自己的heldHTTP使finally悬挂；诊断只改清理即恢复真实异常。候选分开负责新编辑草稿、原请求终态与夹具清理，不动生产CAS/限流/报价；两种真实失败及原业务集中结果归DELIVERY，不把219目录新增当整版PASS。

- R9K当前收敛：[NAS准入输入](../changes/2026-11-01-refactor-r9k-nas-admission-fixture.md)。旧3fa Core实际nas-delivery FAIL；已在原生产源码、真实时钟和自有PG/HTTP中，以显式低容量读复现相同5秒断言失败，正常容量原用例PASS。原测试未控制准入条件；候选分开验证admitted local-first和non-admitted remote-first，原37断言/5000ms不删除。最终执行与回滚归R9K DELIVERY，不把fixture容量读或本地通过当成历史CI磁盘证明。

- R9J当前实施：[首页会话恢复与观察](../changes/2026-11-01-refactor-r9j-workbench-session-owner.md)。独立owner已接入，原新实际浏览器各73场景、非增量tsc0与定向lint0；回滚及最终提交归DELIVERY，完整218未执行；完整发送SSE仍待后续迁移。本轮不把无环或此前216通过当作全项目完成，原3fa远端作业与当前dirty实施保持分层。

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
