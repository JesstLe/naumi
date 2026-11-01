# R9E：原生交互与直接生成验收合同收敛

## 证据与职责

基线964378fd，完整5342raw文件已归档/逐文件核对。R9D原timeline拖动失败，旧版与当前只读观察用例随后PASS，不能从后续通过推出唯一历史根因。源码确认：audio/character/scene已使用现成dragCanvasNode，而timeline/director仍直接取一次boundingBox后手动鼠标事件，未等实际draggable/视口稳定/命中。

新反例使用真实ReactFlow、useCanvasDrag/controller/compileCanvasMove和真实鼠标，节点DOM、scope及commit/history为显式fixture端口。原timeline手势原文从基线读取，控制设置未就绪、取坐标后视口变化两个边界：原手势分别0次移动；复用现有helper后分别1次，原正常轨迹EXACT；遮罩出现时不产生移动。无处理器直接调用、重试、PG或供应商，不能替代原生App/PG验收。

## 实现

- timeline/director复用现有dragCanvasNode，保留原持久化位置变化、undo/redo、锁定/复制/删除、账务与任务断言；手势仍只执行一次，未增加原用例超时。
- theme矩阵只补浏览器crash/主导航/关键静态请求生命周期和截图/读取正文失败原因，原97检查、等待时间及动作不改。原首次空白重载首因仍OPEN，不能把增加取证写成产品已修复。
- CI直接生成检查在同SHA同命令复现 `DIRECT_SUBMISSION=FAIL quote version validation missing`；原扫描器要求已删除的catalog版本误拦、Agent confirm=true，并要求Canvas组件穿透调用已迁出的报价流程。现在核对当前typed创建owner/billing port、原服务器quote透传、operation metadata、无积分弹窗/跨轮同意；27个静态正反检查，不宣称真实账务验收。生产代码未改，删除的误拦未加回。
- 新拖动回归及直接生成合同接入已有catalog，213→215；完整215待集中执行，不新增框架。

## 失败准备与边界

第一次新fixture因tsx CJS不支持顶层await在任何资源启动前exit1，已包装main；第二次fixture误把原始鼠标delta当ReactFlow激活阈值后的节点delta，实际149/132而预期155/135，已按原用例合同验证一次手势、真实变化和精确编译回执，并使用生产compileCanvasMove保留持久化from。失败记录保留，未改变原生断言。

基线反例4场景12检查、修改版4场景14检查通过，原正常轨迹完全一致。实际原生App/PG、整版、质量、回滚和最终源码绑定按后续集中结果更新；当前只有准备及定向证据。整体ACTIVE，main未整合，部署0，47HOLD。

## 重复CI执行归属

已读取新head964的真实run元数据，两个Core refactor regression分别由push与pull_request触发，source完全相同。重构分支改由现有PR完整回归，保留main push、workflow_call的精确source、手动入口、全部路径和完整215测试/发布依赖；不再每次feature更新重复构建并执行同一Core。既有runner自测同步验证这些触发与同源发布条件，image gateway的独立业务覆盖未删。当前两个旧Core运行仅作历史证据，未人为标绿。

## 集中验证续接

e689d0da 的 lint exit0；非增量 tsc exit2，实际诊断为 SourceFile 未公开 parseDiagnostics 以及 fixture evaluate 回调缺少 boolean 类型。保留原 TSC.log / MODULE_RESULTS.json，语法诊断改用 TypeScript 公开 transpileModule API，回调显式标注 boolean；不改产品源码、断言或用例等待时间。不重跑已通过 lint，修正后固定新源码继续类型、runner、原/新手势及直接生成合同验证。原/新结果、完整215及App运行验收以最终固定源码记录为准。

## 最终集中验收

[R9E模块](changes/2026-11-01-refactor-r9e-native-interaction-contract.md)：timeline/director 的原生验证复用既有 `dragCanvasNode`，不再私有读取一次坐标就发手势；原持久化、撤销/重做、锁定、复制、删除、账务断言和等待时间保留。真实 ReactFlow/生产 drag owner 的四场景原/新对照为12/14检查，正常轨迹EXACT；当前同源完整应用中的 timeline 和 director 原生链均PASS。它们不证明历史单次失败的唯一根因。

直接生成旧CI扫描器在同源复现 exit1（要求恢复已删除的报价版本误拦），现在核对 typed 创建owner、原服务器quote、scope/operation透传及无重复积分确认，27项静态正反检查PASS；不是实际钱包验收。feature Core回归仅由PR触发，main push与精确source workflow_call保留，runner16场景282检查PASS，不删除业务测试。

当前验证/完整应用固定 `bb0ebce1ba489222901205db49ca3ae6592127ba`，Web/Worker同镜像与原生SDK应用字节一致。目录215项已全部到达：首批61PASS/1主题FAIL/153未到达，随后只执行153个原未到达项，全部PASS；**两批合计214PASS/1FAIL/0未运行，完整core仍FAIL，不能称单次215全绿**。没有复用旧case结果。主题重载40检查后节点等待超时，导航200、无pageerror，但截图及正文读取也超时；附加协议诊断未给出唯一首因，结束了其自有浏览器，原失败保留。没有提高超时、换浏览器或跳过断言。

同固定镜像 runtime177、实际产品浏览器92（2context、routeMocks0）及450秒混合校准通过：165图片/12媒体，177consume/1014积分，付费重放0，未完成父任务0，capacityClaim=false。非增量tsc exit0，5090个编译器输入+4配置绑定，37个既有lint warning/exit0，四类SCC0。原e689两处脚本类型错误和诊断中断记录均保留。

本轮产品源码改动0，全部2141个原src/services字节不变；完整源码5344文件，对照5342原文件。四产物、副本回滚及最终source/doc桥接见 `output/refactor-r9e-20261101/DELIVERY.json` / `VERIFICATION.txt`。**整体ACTIVE；main未合、部署0、47HOLD**。验证/文档不计产品模块，主线同步计数仍2；下一步是定位主题重载失败并完成真实同源整版退出，而非继续重复已通过批次。远端新head CI以最终DELIVERY快照为准。


原命令、输入、字面输出、退出码、副本回滚与四产物均归本轮VERIFICATION；baseline不是业务正常的声明，旧direct扫描器exit1是已复现的过时验收合同。初始模块tsc exit2日志和唯一附加主题诊断exit2/自有浏览器结束记录保留。诊断只得到了3份导航HTML及加载事件，未形成有效trace或根因栈；不把它写成诊断通过。
