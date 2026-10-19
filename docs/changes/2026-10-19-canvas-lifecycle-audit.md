# 画布任务切换生命周期审计（不修改业务，不上线）

基线：`e374ae255e80ba3e56dd455b16d1a3464039e6f9`。用户问“还有吗”，本轮沿用不上线约束，继续查任务与界面切换组合。业务源码未改，不连接生产、不调用供应商。

## 1. 切换项目丢失编辑任务的待核查卡，但锁仍保留

真实 landEditResult 对 OPERATION_PENDING 保留 uncertain 卡与 node:source-A 锁，这本身正确。真实 openProject 无条件清空 pendNodes。切到 B 再回 A 后，失败卡为 0，操作锁仍为 1，同一源节点再次发起被阻止。

两种时序均复现：先出现失败卡再切项目；提交中切项目、随后返回未知状态、再切回。对照始终留在 A，卡片为 1、锁为 1。

确认的是“可见任务状态与防重锁脱节”，不是要求释放未知付费锁。正确方向应保留/恢复按账户与项目归属的任务状态，而非清锁重发。该路径没有 image-edit taskId，也未登记 imagegen canvas receipt；现有其他任务恢复路径不能据此视为覆盖。

## 2. A 标注完成会关闭后来打开的 B 标注面板

组合运行真实 AnnotateEditorModal.submit → CanvasClient.submitAnnotations → landEditResult。

- 子组件按已有非阻塞设计，提交 A 时立即 onClose，然后后台执行父级提交。
- 用户随后打开 B 的标注面板。
- A 成功后，父级再次无条件 setAnnotateArtwork(null)，把 B 面板关闭。
- 对照 A 返回失败时，父级没有第二次关闭，B 保持打开。

“提交即关闭”是既有明确设计，保持不变；缺陷是旧任务完成不应关闭用户的新编辑对象。判定遵循不抢占正在编辑节点的交互约定，不把主动关闭和非阻塞设计算成 bug。

## 上轮验收表述纠正

上轮“标注失败时保留当前编辑面板和输入”结论过宽。verify-canvas-edit-feedback.cjs 仅验证父级函数失败不再关闭，没有组合实际子组件；实际子组件已在提交时关闭。

本轮保留原测试场景和断言，将输出命名改为 PARENT_NO_SECOND_CLOSE_ON_FAILURE，明确它不证明整个弹窗或草稿被保留。历史修复文档追加更正，旧证据目录追加 ANNOTATION_ACCEPTANCE_CORRECTION.txt，不删除原始输出。尚未验证重新打开后的完整标注草稿恢复，不声称已实现。

## 证据

`node scripts/audit-canvas-lifecycle.cjs [sourceRoot]`：5 个实际函数组合场景，2 类确认缺陷、2 个正常对照，真实编辑组件 submit 已执行，canvas 绘制/网络/数据库边界为 fixture；不当作浏览器渲染或真实供应商验收。

两类缺陷均待修复；本轮只添加审计、纠正验收文案，不重复构建未改的业务源码。现有项目历史隔离、编辑失败父级回归、提交即关闭契约另行复核。

证据目录：`output/canvas-lifecycle-audit47-20261019`。四件产物归档审计及文案修正，回滚只操作带标记的副本；业务源码哈希始终不变。独立分支提交推送，不合 main、不部署，功能迭代计数仍为 2/3。
