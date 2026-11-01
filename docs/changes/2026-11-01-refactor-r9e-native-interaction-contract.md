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
