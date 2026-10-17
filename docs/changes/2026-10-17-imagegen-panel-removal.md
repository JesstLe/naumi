# 删除重复图像创作面板

## 最新用户决定

用户明确整个面板与既有能力重复，所有面板代码均可移除。此前未提交的Dock继承/精简设计终止，非隐藏入口或留兼容壳，不再迁移、扩建这套面板。

## 完成范围

- 删除ImagegenPanel、MaskEditor及panel CSS；删除ImagegenFrameChoice及其CSS；删除三个专用UI fixture/验证脚本与仅供UI使用的resolveFrameChoice模块，总计8个受版本控制文件。
- 清除canvas-client的panel import、类型、state、placement ref、open/mount函数、入口按钮和JSX；清除labs/workbench-client的panel import/state/入口/JSX。全部src没有面板引用残留。
- 仅保留既有图片节点Dock、原工作台批量生图、现有蒙版/编辑工具及共用API；不另增第二套配置。
- 服务端参考图比例修复保留：defaultFrameSource/frameRatio合入frame-ratio.ts，唯一reference自动3:4、固定比例优先、风格/蒙版保留target、原始fingerprint与冻结计划语义不改。不能删除被普通Dock和Agent调用的imagegen后端/持久任务基础设施。
- 既有billing/imagegen UI用例改走原Dock并断言重复入口不存在；bottom-dock用例默认removed模式。不删除保留能力的回归。完整PG/供应商UI套件仅更新，本轮未运行，不能沿用历史PASS。
- 前轮比例文档标为历史UI方案被本次决定取代。尚未提交的继承方案仅存忽略output中SUPERSEDED_DOCK_DESIGN.zip，不进入业务分支。

## 验收

本地baseline：两处入口、4组件/样式文件、3专用UI测试、1画幅UI模块存在。修改：210项源码/AST/引用检查通过，原有CanvasClient与WorkbenchClient其他全部命名函数未改；24项实际plan+generation-core FormData比例回归通过，contract/client-recovery/HTTP回执检查、全量TypeScript通过。

真实Next15/React19 CanvasClient本机隔离fixture，T3预览1280×960及390×844：重复入口0、弹窗0，图片节点Dock、模型和生成按钮保留，无横向溢出。原Dock实际确认提交本机替身1次，回执完成后结果节点入画布；供应商调用0。保存并打开桌面/移动截图。fixture首次下载路径缺少图片返回而报原图加载失败，修正本机下载替身后重验提交通过；非业务修复。

实际副本回滚恢复被删组件/入口并逐文件校验原hash，正式worktree保持移除状态。四产物与命令字面输出见output/imagegen-panel-removal-20261017/VERIFICATION.txt。

## Git、协作与上线状态

独立codex/imagegen-frame-choice-20261017，起点aa01e818（已合origin/main bd89ee0c），基于前序ac96076b服务端修复。shared checkout及其他同事未提交保持。开工与提交前刷新main；本模块计数2，未触发3次自动整合计数。

未上线47；本轮无SSH、三锁、候选、Worker变更或切流。已通知统一线程不要仅发布前轮面板UI提交，必须包含本次删除。后续统一固定版本、三锁蓝绿与真实账号/生产在途任务验收另记。
