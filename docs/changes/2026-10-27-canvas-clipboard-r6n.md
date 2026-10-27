# R6N：Canvas 剪贴板会话与协议

基线 `967c065cbb9211df7c1799b3d2a103c105377ffd`；独立工作树 `E:/Workspace/naumi-refactor-20261024`；完整 4585 原文件 hash/归档在 `output/refactor-r6n-20261027/`。

## 实施

- 自定义 MIME/HTML marker、标题转义与持久选择记录归 `node-clipboard.ts`。
- native ClipboardItem、HTTP/权限失败回退、PNG 转码与 bitmap 释放归 `clipboard-browser.ts`；失效会话不继续异步回退。
- `useCanvasClipboard` 唯一持有单图/混合选择/复制意图与监听生命周期；账号/工作空间切换同步替换会话，项目间复制与原个人持久 key 保留；匹配原生 marker 时可读取另一 tab 最新记录。
- 粘贴仍按原 workflow→image files→internal nodes 顺序，编辑输入、助手、modal、只读、加载与浏览状态保持；图片文件与工作流调用原 importer，节点复制调用原 node operations/history。
- Canvas 只传当前状态和落地 adapter，未新增节点 writer、报价确认、生成或计费框架。

## 验收进度

实现已迁入，完整旧新协议/事件与实际 React/Edge、真实产品 PG 复制/undo/redo、相邻与类型、四产物及独立副本回滚待模块集中执行；整体 active。

本轮为 main 同步后第 2 个模块。开工 fetch 发现 main `bc6af06d5ba27b316efd5c3571f31b891b85fa9c` 尚有 12 条未整合提交，包含参数计划、Agent 修复及提示词优化；按既定三模块节奏后续迁入真实 owner，不在本模块混算为已包含，不合 main、不部署。
