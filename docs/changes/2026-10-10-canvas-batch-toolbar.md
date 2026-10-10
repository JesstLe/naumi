# Shift 框选批量工具栏 UI 修复

## 范围与状态
- 分支：`codex/canvas-interaction-feedback`，接续节点右键和生图等待反馈改动；本轮不合入 main、不发布服务器。
- 开工 HEAD：`88de02e23c1d03de9598bd5bfb89e94127395ecf`；fetch 后主分支：`f834557f9f5c485abcb0be085042a7bcef71a7b4`。未把其他同事的新业务整目录覆盖进当前任务。
- 收尾再次 fetch 主分支为 `b6d226ebeeba525169d4f289a12de79c8b29153d`；本轮仅分支提交，后续统一整合者合并。
- 用户截图问题：按住 Shift 在空白画布拖拽框选多节点，批量操作栏按钮被 flex 压缩，中文字换行、图标缩小，影响辨识与点击。

## 实现
- 图片和文字批量操作栏共用 `BatchSelectionToolbar`。保持原显示门槛、选择状态、操作顺序、文案、禁用条件和业务处理函数。
- 操作按钮统一 36px 高、16px 图标和 8px 圆角；按钮与图标不收缩，文字单行。
- 仅中间动作区横向滚动，选中数量和清除按钮固定可达，滚动条与键盘焦点滚入可见区域。
- 最大宽度限制在画布内，保留桌面/窄屏底部避让位置；使用现有画布主题颜色，不新增长说明、不把高频动作藏进菜单。
- 没有供应商参数、计费、数据库、媒体或发布配置变更。

## 验收
- 原布局实际浏览器复现：真实键盘 Shift + 鼠标框选，确认多行文字或缩小图标。
- 修复后真实 Next/Edge 全页验收：1440×1000、1024×768、800×600、640×480、390×760、320×760；图片和文字均通过真实 Shift 框选、清除、单行/等高/图标尺寸/视口内边界验收。
- 窄屏横向滚动、尾部删除可达、选中数量和关闭位置保持、键盘聚焦自动滚入、主 Dock 不重叠通过。
- 成组/解组 API 选中 ID、批量标记、合并生成空白节点通过隔离 fixture 验收；选中节点 context handler 回归用 dispatchEvent，不将其记作整组选框右键的物理点击验收。
- API 全部使用隔离 mock，供应商调用 0；这些不代表真实付费生成验收。
- 11 个动作的 onClick/disabled/title AST 与基线一致；TypeScript 与定向 ESLint 通过。
- 现有 14 项全页节点右键/生图等待反馈、节点属性编辑、复杂整理画布与主题入口回归通过。
- 源码回滚脚本在独立副本恢复原始文件 SHA-256 与 11 项动作；候选分支仍保持修复。
- 证据：`E:/Workspace/naumi/output/canvas-batch-toolbar-20261010`；最终以 `VERIFICATION.txt` 和 `modified-browser-final/result.json` 为准。

## 接手命令
```text
node scripts/verify-canvas-batch-toolbar.mjs
node scripts/verify-canvas-batch-toolbar-browser.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```
```text
按提交整合 codex/canvas-interaction-feedback，不复制目录覆盖同事改动。
保留现有画布/模型业务，在 canvas-client.tsx 同文件冲突中保留两项 BatchSelectionToolbar。
执行真实 Shift 框选浏览器验收和节点交互回归，统一合并者决定发布新机。
本任务未发布新机、未回传旧机；不要将测试数据库回灌生产。
```
