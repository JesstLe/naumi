# R6L：Canvas 项目目录与命名会话

基线 `922992e45726764e81c20bde163378e896a13cba`；独立目录 `E:/Workspace/naumi-refactor-20261024`。原4544文件hash与完整源码归档保存在 `output/refactor-r6l-20261027/`。

## 实施

- 原图片血缘/套图、文字、视频项目聚合与按月分组迁入纯 `src/lib/canvas/project-catalog.ts`；规则正文沿原实现，主组件保留当前项目与文档/任务组合职责。
- 项目名读取、乐观命名、输入草稿、列表 tab/菜单归 `useCanvasProjectCatalog`。账号/工作空间 session 不与所选项目混为一谈；原 scope 的 `canvasDocumentFetch` 负责请求归属。
- 项目列表、项目菜单及编辑器标题迁独立视图；卡片与编辑器共用唯一 Enter/Escape/blur 输入。删除四条工作流说明文字，不新增口号、积分确认或限额。
- 同项目改名沿原请求协议按意图顺序提交；迟到目录读取不覆盖已编辑名称，旧请求失败不回写新账号。项目切换允许原账号内的写入完成，账号/工作空间切换抑制尚未发出的旧请求。
- 节点文档、原项目删除事务、生成、报价、钱包、Worker、数据库 schema 与实际后端 handler 均不在本模块重写。

## 实际关闭的交互问题

- 旧目录 GET 比用户保存晚返回时，原名称覆盖已保存的新名；新版只合入尚未本地修改的键。
- 同项目两次改名，较早失败会覆盖后一次成功；新版沿原协议串行提交，同名版本只回写自己的最新意图，失败恢复最近确证值。
- 切账号后，旧失败请求会把旧账号名称与提示写到新页；新版账号/工作空间 session 与原 scope 控制本地回写，所选项目变化不取消原账号的正常完成。
- 旧 Escape 取消依赖后续 blur 清布尔值，输入卸载不触发 blur 时下一次 Enter 被吞；共用输入直接取消当前编辑，不保留跨输入的取消标志。

## 集中验收

| 层次 | 实际结果 |
|---|---|
| 完整原源码的原函数/JSX | 38检查、18投影场景、7组HTML；上述迟到读/有序写/账号反例均复现 |
| 新owner与视图 | 44检查、18投影场景与原规则相同，7组HTML除明确删除的工作流说明外相同，原POST字段相同 |
| 结构 | Canvas7132→6524行；169原函数正文不变，3纯规则正文迁入；主组件和runProjectDelete仅明确组合改绑；main同步前1846其它生产/服务原文件hash不变 |
| 实际Next＋真实PG | 11检查，浏览器/标题改名与Escape→Enter、菜单返回、tab、刷新、作品不变通过；恰好2次项目POST，供应调用0、pageerror0、浏览器route mock0 |
| 固定core | 应用`f319d76ed954d73a27ff14f8c6435c5d393aadd4`，32/32、failed0、notRun0 |
| 完整Linux镜像 | 同core摘要，生产Dockerfile、Web/Worker同镜像和原生媒体打包通过 |
| 完整镜像运行 | 125检查通过，原6/current17、单次结算、UNKNOWN不重放、图片文字CAS、工作台、FFmpeg与POSIX排空保持 |
| 完整产品浏览器 | 两个真实登录context、9组/180秒持续混合读通过，2图/2笔/12积分、确认弹窗0、pageerror0 |
| 类型/规范/结构 | 全项目tsc0、定向ESLint0（原8warning保留）；同步后emitted静态与全导入SCC仍0 |

实际Next11检查使用已停止的既有源码副本；重启前逐一核对**1853个src/services文件与固定应用字节相同**，只换入当前verifier，重新创建自己的PG schema与原生会话。没有替换Next、HTTP handler或PG。其命令及绑定在`REUSED_NEXT_RESULT.json`；不冒充第一次冷启动通过。

## 第三模块普通main同步

- 本模块实现提交`64734841d88ad6f82bbed4d3760dbc68efdbb2b8`；固定incoming `8e412abea62aa0820558baebced576ba66260478`。
- 普通merge提交`6ef35a8a7eb1cf2ae32ff5a93641f7524a96f063`，两个parent分别为上述两项；未合回main。
- 5处冲突按真实owner解决：generate-image HTTP薄壳与durable兼容出口原字节保留，新增失败诊断迁到generation-runtime/generation-jobs/image-jobs runtime；原repository/dispatch/stored-delivery接同一诊断；旧fixture端口按真实Pool/BI/synchronous owner改绑。
- 10个incoming算法文件原字节保持；分辨率和供应成本collector原函数正文保持，仅原动态BI import改真实owner；没有恢复旧大文件或双执行路径。
- 合并定向验收：父回执25、交付重试4故障、失败诊断真实PG24、诊断UI14（1440/390）、自动参考比例139、精确比例62及真实分辨率PG5任务通过；runner12类73检查通过。
- 三模块同步计数归零。最后固定被测应用为`f319d76e`；其后只更新本记录、工作区、主方案与迁移台账四个文档。

## 原失败与仍未证明的边界

首次提取工具用字符串匹配误把内层三元表达式当项目列表结束；已改用TS AST提取实际JSX和规则函数。原生产主组件在提取成功前未写入，工具失败不记为产品运行故障。

原verifier曾误挂列表和编辑器两个autoFocus输入、读依赖路径多一层、比较undefined与JSON、用错标题/字典词；原输出保留。迁移首次缺fragment的真实TS/JSX错误已修，最终类型通过。core第一次与实际Next共占54989造成失败，改串行后固定32项通过，不把旧失败改写为PASS。

冷Windows dev启动两次停在加载页，其中一次记录`Invalid or unexpected token`；保存的chunk和998个eval源码分别通过Node/Edge语法检查，**首次异常具体根因未关闭**。同1853生产文件的实际Next11与最终Linux整包运行/浏览器分别有通过证据，不据此重标冷启动失败，也不将它们推为生产/十万活跃容量或远端required CI验收。

## 交付

原4544文件hash、完整原源码、补丁复放、副本回滚与原38行为恢复、四件产物回读、夹具清理及分支远端匹配统一封存到`output/refactor-r6l-20261027/DELIVERY.json`和`VERIFICATION.txt`。工作树保留新owner及普通整合后的main内容。

整体目标保持active，后续继续Canvas剩余组合/导航及最终完整重构整合；本模块不部署、不操作发布锁或其他工作树。
