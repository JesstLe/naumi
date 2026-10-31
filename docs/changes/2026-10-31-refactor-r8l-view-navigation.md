# R8L：Canvas 视图导航意图归属

## 模块与职责

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；原始基线 `b59dec837890ce07466fc693ae50d6400110a335`，5,288 个原文件的字节哈希及完整归档保留在本轮 output。整体重构仍 ACTIVE，候选未合 main、未部署，47 HOLD。

原区域聚焦是未绑定导航意图的 RAF→timeout；工作流导入的双 RAF Fit 只检查文档 epoch，后来的手动平移/缩放不会使其失效。基线实际旧页面函数及导入回调复现 9 次迟到视图写入。显式节点定位原有 revision 保护，但同 ID 重复请求缺少新 effect 身份；待定位 ID 也可能被新项目中的同名节点继承。新实际 React 反例在切换项目后复现一次旧定位写入，再修复，原失败记录保留。

## 公共接口、依赖方向、状态归属

- `canvas/view-navigation` 是纯调度 owner：复用一个 `navigationRevision`，拥有视图绑定、至多一个待执行 frame/timer 意图及其取消。公开 `bind`、`capture(scope).area/fitNodes/nodeFocus`、`cancel`、`mount/dispose`；不拥有节点、历史、任务或账务。
- 捕获对象使用实际 `CanvasDocumentScope` 身份。原意图只能交给紧接着的一次指定目标项目；手动导航、其他中间视图、项目 ABA、账号/工作空间变化或卸载会退休它。文档写入仍由原 document/history owner 完成，视图退休不回滚已完成的文档。
- `canvas/view-controls` 只拥有原区域可见性/中心/缩放纯几何；不降低既有 zoom，不加规格档位或业务限制。
- `use-canvas-view-controls` 连接浏览器时钟、Flow 和 React 生命周期，拥有显式节点定位状态与请求 revision；视图替换不把旧 ID 重新解释为新意图。`use-canvas-viewport-focus` 保留原几何、双 RAF 和 280ms 动画，只接收新增请求 revision。
- Canvas 页面只捕获当前视图意图、连接原节点创建与工作流导入后的呈现。文字创建给既有 focus 端口传目标 project，不改节点字段、append→activate→focus→history→save 顺序。

依赖方向为页面→React hook→纯视图 owner/几何；owner 的 document scope 是 type-only 依赖。没有新的全局事件总线、DI 容器、任务 store、保存服务或 HTTP 自调用。实际手动导航继续使用原 `cancelFocus`；整理布局与节点定位共享同一 revision，不创建第二套定位系统。

## 已验证及证据层级

- 实际旧 Canvas 函数/导入回调与实际 document scope：基线正常 18 组、30 检查、迟到写入 9 次。改后正常几何及导入 document/history 轨迹精确对照；受控端口是 Flow、frame/timer 与原 document/history I/O，不冒称真实 PG/ReactFlow。
- 实际 React hooks、document context 和文字创建用例在真实浏览器执行：15 项，包括同 ID 重复、旧动画 ACK、area/node 最新意图、手动取消、新项目即时交接、项目/账号/workspace ABA 和旧节点 ID 退休。Flow 几何/ACK、时钟、身份与 document/history I/O 是明确受控端口；完整产品另验。
- 原 node-creation 验证器只补上实际页面新增的 view capture 端口；继续逐项比较原 27 组节点/文档/history/呈现轨迹，不把该 mock 当视图验收。
- 两新验证器接入既有 core catalog 与独占 evidence 环境，完整清单由 186 增为 188。后续类型、架构、完整 core、固定镜像 runtime/browser 与副本回滚以本轮最终原始报告为准；尚未运行的项目不写通过。

原部分编辑、DOM 重复声明及节点视图反例日志保留。脚本外层包装退出状态与真实 child exit 分开登记，不将后接 diff 命令的 exit 0 当 DOM 通过。

## 主线同步与未完成项

本片为上次同步后的第 3 个产品模块，封版前刷新并普通 merge 最新 origin/main，记录结果后计数归零；不合回主线或发布。**独立候选超过 48h：按用户整体候选交付要求保留，完整退出仍未达到。**

剩余 Canvas 参数/Shell 组合归属、R8J 调度等待诊断、持续混合业务与生产容量、有效远端 CI、最终完整 main 整合及生产验收继续。R8J 负载数字和 R8K 验收只归各自固定源，本片不借用旧通过；历史 ZIP socket hang up 根因仍 OPEN。

## 集中预检与实际同步

最终完整 TypeScript `--noEmit --incremental false` exit 0；lint exit 0、38 条既有 warning。原 27 组节点创建全轨迹 EXACT，原 viewport 15 项、arrange 25 项及输入参数 3,925 矩阵保持；专用视图规则 18 正常组/36 检查、迟到写入 0；实际 React 15 项通过。最初类型检查发现 waiting 闭包未显式收窄可选 binding，保留原 exit 2，补明确存在性判断后再集中通过，没有忽略类型诊断。

实际 fetch origin/main 为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，普通 `git merge --no-edit origin/main` 输出 `Already up to date.`、exit 0；本片 2→3→同步归零。候选分支未合回 main。


首轮固定5fb6完整core为38PASS/1FAIL/149NOT_RUN，project-navigation旧夹具在深链时缺少页面新focusCanvasNode端口；实际pageerror明确ReferenceError。只向夹具提供viewControls.focusNode记录端口并编译实际页面薄adapter，不恢复旧产品state，不删原八类深链/选择/账号/工作空间断言。原报告、exit1及自有PG清理保留。5fb6完整镜像真实产品双browser92检查通过（原31图ZIP字节、7笔42积分fixture、POSIX排空及自有栈清理），仅归5fb6固定源；最终更正后的完整core/镜像/产品均重新绑定源码，不拼接旧通过。


## 正向深链交接修正（不借旧绿灯封版）

53236002完整core188及同镜像双browser92均通过，但补入实际project-navigation hook+view-controls+document scope的组合正例后，真实复现新目标项目定位丢失。原因是原navigation controller先select/focus再open，节点定位不能只以“当前view revision相等”判定；该绿灯没有覆盖这一正向跨项目交接，不能作为最终退出。

显式定位现在由同一个纯view owner签发目标项目ticket，节点ID仍归React hook；project-navigation只向现有focus port附带它已解析出的目标project，不改select/open/浏览器history顺序或文档。正常当前项目定位、新链接首次/迟到目录导航可交给紧接着的目标view；手动导航、别的view/ABA、账号/workspace变化仍退休ticket。区域/Fit继续原不在浏览态调度规则，没有另造epoch/store/事件总线或延迟重试。

独立当前源码投影先验证19项实际React组合：保留15项旧断言，新增实际导航hook的即时/迟到目录正例和目标采纳前manual/中间view反例，全部通过。投影结果只归投影；应用到工作区后会重新固定、完整类型/core/同镜像runtime/browser，不借532的188/92替代新源码验收。旧完整报告与失败deep-link-repro保留。

实际工作区完整模块预检已通过：全TypeScript exit0、lint38既有warning/exit0、正常18组/36检查精确对照且迟到写入0、19项实际React组合（含实际navigation hook）和原30项project-navigation全部通过。随后固定新源码执行全新188与同镜像runtime/browser，先前532的绿灯保留但不复用。
