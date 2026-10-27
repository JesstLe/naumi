# R6M：Canvas 输入命令与视图工具

基线`844e59df0ddb0c08854bbfefaaa4c6ab2fae407c`；独立工作树`E:/Workspace/naumi-refactor-20261024`；原4573文件hash及归档在`output/refactor-r6m-20261027/`。

## 实施

- `keyboard-command.ts`只决定输入归属、是否阻止默认行为及typed命令；不访问DOM、React、数据库、收费任务或document writer。
- `useCanvasKeyboard`只持一个capture监听器，每次事件读取最新状态及命令adapter，避免依赖数组遗漏导致同ID新数据仍读旧闭包。
- `useCanvasViewControls`拥有主工具、minimap/snap、Canvas主题与缩放输入/菜单/实时HUD及wheel生命周期；键盘与工具条共用同一工具选择和视图API。原移动/缩放实时Dock几何和ReactFlow本体保留在组合层。
- 缩放草稿在输入聚焦时不被实时视口更新覆盖；Escape、项目/账号上下文变化关闭瞬态菜单。只保留原本地主题键，不新增确认或业务上限。
- `view-toolbar.tsx`与`tool-buttons.tsx`负责真实控件；暗色硬编码hover/分隔线改为现有Canvas浅色兼容token。剪贴板与快捷键共享原input-target判定，不复制第二套输入规则。
- 原节点删除、历史、复制、创建、生成、报价及账务仍通过原adapter/owner执行；UNKNOWN不重提与原operation不变。

## 进度

实现已迁入，集中旧新矩阵/React交互/实际Next-PG/相邻验证、四产物与独立副本回滚待本轮封存。整体active；本轮是main同步后第1模块，不合main、不部署、不接管发布现场。
