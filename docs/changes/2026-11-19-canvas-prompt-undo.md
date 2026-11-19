# 画布提示词撤销

在画布图片、视频提示词输入框中，刚输入一段文字并全选重输，再按撤销快捷键，原文字有时会一起撤销。Chrome 复现时，输入 `original prompt` 后覆盖成 `x`，第一次撤销错误地恢复为空白。

图片和视频共用 `InlineReferenceEditor`。编辑器现在在原生 `beforeinput` 读取编辑前选区。只合并短时间内同一光标位置接续的普通输入。全选覆盖、移动光标后插入、粘贴及输入法上屏保留各自的撤销边界，撤销时恢复编辑前的文字和选区。输入框继续通过原有 `onChange` 回写提示词，画布节点操作的历史由原画布历史模块处理。

- 基线为 `9c8fc057c70bdf729af2bfa96f790eb2da9189c8`，任务分支为 `codex/canvas-text-undo-20261119`，工作目录为 `E:/workspace/naumi-canvas-text-undo-20261119`。开工同步时基线、远端主线和任务分支一致。改动范围为共用提示词编辑器、已有浏览器测试及本记录，功能同步计数为 1。
- `node scripts/verify-inline-node-reference-ui.cjs UNDO_BEFORE_FIX` 在基线上因替换撤销后内容为空而退出 1。`node scripts/verify-inline-node-reference-ui.cjs UNDO_FINAL` 在 Chrome 通过 24 项检查，退出 0，涵盖两个提示词入口、撤销重做、连续输入合并、移动光标后分步撤销，以及原有引用、输入法、只读和窄屏回归。
- `node scripts/verify-canvas-text-editing-dom.cjs` 和 `node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-text-edit-history.ts` 均退出 0，检查原文字节点的编辑提交、历史基线及账号项目隔离。全仓 TypeScript 检查通过。本地隔离浏览器与临时端口已关闭，供应商调用为 0。回执保存在 `output/canvas-prompt-undo-20261119/`。
- 本次验证范围为本地代码与浏览器交互。正式版构建、公开更新说明绑定与服务器发布由对应发布窗口处理。若需回退，撤回此修复提交即可，数据结构与存储协议无迁移。
