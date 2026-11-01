# 整体退出审计

## 当前固定版本

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
| 类型与结构 | 非增量tsc0；5092编译器输入+4配置；lint0/37既有warning；四类SCC0 | 本轮PASS |
| 历史间歇失败 | 当前原97主题用例及timeline链PASS；R9E主题重载和R9D拖动原FAIL留存 | 历史唯一根因OPEN，不归因为本轮16文件迁移 |
| CI构建证据 | 原npm build/参数/exit保留；完整日志、source/tree、失败注释及always artifact；真实Bash0/7＋Node只读报告5场景18检查 | 接线PASS，不冒称旧build根因或新远端已通过 |
| 有效远端CI | ba497的Core/ Image均真实FAIL，Image在build；新head实际结果见DELIVERY/REMOTE_STATUS | 仍需新head实际通过；不沿用旧支付限制或拿本地绿灯替代 |
| 源码与回退 | 四产物/完整binary patch/原5344raw hash/副本行为与later-edit首写前零写 | 以本轮最终重开记录为准，实际工作树保留新版 |
| main普通整合 | 第3产品模块后fetch及merge origin/main e2f56255已包含，计数3→0，未写main | 最终分支合main仍OPEN；分支已超过48小时 |
| 生产与容量 | 当前未发布，47HOLD；历史供应商/持久化/传输及生产负载沿独立台账 | 不以本轮样本关闭或宣称10万容量 |

## 下一步与历史边界

1. 读取新head的实际CI及可读取的构建失败注释，修复真实失败，不改变原测试/构建退出语义。
2. 有效同源CI后做普通main整合和固定版本交付；仍有真实调用方的兼容边界按职责退出，不按文件/行数机械拆分。
3. 保留R9E两批214PASS/1主题FAIL、R9D211PASS/1timelineFAIL及原截图缺失/诊断中断，当前PASS不改写旧报告。R8Z配对性能、冷样本/跨期漂移和历史回退归因仍属于其旧固定源；本轮未重测配对性能。

[工作区](../REFACTOR_WORKSPACE.md) · [R9F](../changes/2026-11-01-refactor-r9f-native-node-ingress.md) · [迁移合同](REFACTOR_MIGRATION.md) · [100k台账](../PRODUCT_READINESS_100K.md)
