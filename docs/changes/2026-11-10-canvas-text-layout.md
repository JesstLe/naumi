# 文字节点自适应高度与创作栏滚动

## 范围与基线

- 用户反馈：部分节点 Dock 输入框过扁、出现重复纵向滚动条、文字节点生成或粘贴长文后底部内容不可见。
- 分支：`codex/canvas-text-layout-20261110`；独立工作树 `E:/workspace/naumi-text-layout-20261110`。
- 开工基线：`41a59ff0260ef5550b6ee8ada7ba01c05b201df8`。共享 checkout 的分支与未提交文件保持原样。
- 只修复显示与布局。未操作服务器、数据库或供应商，47 暂缓发布的决定保持。

## 模块与职责

- `use-growing-textarea.ts` 负责按 textarea 的真实 `scrollHeight`、边框、宽度和字体度量计算高度，使用布局像素，不受画布缩放影响。宽度变化时重新测量，忽略自身高度变化，清理 ResizeObserver。
- `TextCanvasNode` 的卡片和正文取消内嵌滚动，由实际内容撑开；scene projection 将存储高度作为最小框高，React Flow 测量实际高度。初始空白占位和手动框尺寸继续保留，长文可超过旧的 1200px 估算上限。
- `flowNodeSize` 对文字优先使用 React Flow 的实际测量，供工具栏锚定、整理和聚焦使用。
- 文字 Dock 复用同一个 textarea 测量 hook，移除 240px 内部滚动上限和与外层竞争的手动高度观察器。正常由 body 滚动；空间不足 112px 时切为整个 Dock 滚动，保持按钮可达。
- 图片紧凑 Dock 输入区从 56px 提高到 112px，布局测量同时预留输入区空间。图片、文字、视频共用单一滚动表面策略。

## 公共接口、依赖方向、数据和事务归属

- 新 hook 输入为 textarea ref、正文及字体/模式变更标记，只读 DOM 尺寸并更新元素高度，不提交节点、不调用生成接口。
- 节点持久化、撤销历史、手动 resize、编辑会话作用域、计费和任务仍由既有 document/editing/task owner 管理；未更改 API/schema、余额、幂等或冻结执行上下文。
- 本次新增的自适应测量仅为展示状态，不为每次测量添加数据库写入；刷新时从保存正文重新测量。已有估算与手动尺寸存储逻辑保留。
- 文字生成当前协议一次返回完整正文；本轮验证真实客户端结果接入和渐进内容更新的显示，不宣称实现了供应商流式协议。

## 验证与证据层级

隔离 Next dev：`127.0.0.1:15363`，视频 fixture proxy：`127.0.0.1:15364`。真实 Next、CanvasClient、React Flow、Edge DOM；账户、保存、报价和生成结果使用本机 HTTP fixture。外部供应商调用、真实数据库写入和生产操作均为 0。

| 命令 | 结果 |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 通过 |
| `node scripts/verify-canvas-text-editing.cjs` | 14 项通过，包含编辑/历史/作用域与手动尺寸 |
| `node scripts/verify-canvas-text-editing-dom.cjs` | 4 项通过，真实 React focus/change/blur |
| `node scripts/verify-canvas-text-node-ux.cjs` | 17 项通过：新增、保存、刷新、失败保留原文、生成结果、撤销、锁定、移动和手机 |
| `node scripts/verify-canvas-text-node-ux.cjs --layout-only` | 11 项通过：原生剪贴板粘贴、超过 1200px、刷新、渐进更新、实际手柄改宽重排、生成返回、字体/行高、展开/收起及 390×844 / 1000×500 / 1000×300 |
| `node scripts/verify-canvas-compact-dock-ui.cjs --viewport 1440x900 --out output/text-layout/image` | 11 项通过，实际输入至少 112px，长提示词仅 body 滚动，引用、展开/收起与草稿保持 |
| 同上 `--viewport 390x844 --out output/text-layout/image-mobile` | 2 项通过，含无引用和双引用布局、生成按钮可点击 |
| `node scripts/verify-canvas-composer-scroll.cjs` | 1440×900、390×844、1000×300 三组通过；视频长文分别只有 body/body/shell 一个滚动面，保存按钮可达 |

- 证据目录：`output/text-layout/`。实际打开检查图片 Dock、文字 Dock、视频手机和矮窗口截图；不是仅凭编译完成。
- 初次依赖 junction 指向了空的共享 `node_modules`，类型检查未启动；改接本机已有 `naumi-quality/node_modules`，未修改共享依赖。该次错误单独保留。
- 首次浏览器回归暴露 flex-basis 导致 textarea 高度仍被收缩，已改为保持内容自然高度，随后长文验收通过。
- 历史 fixture 缺少 workflow-import 的 `manifests`，会产生无关分组错误提示；本轮测试补齐 GET 响应，未修改产品错误处理。

## 未完成项与下一步

- 已整合最新 main `5bf0d9195954a2339e160452a869b084ee1a4e72`，整合提交 `ea8864e0b6530e8226e7806ef13718fd5235b41a`，无冲突，保留同事画布清晰度、引用节点创建与 Agent 平台文档。
- 整合后全量 TypeScript、文字布局 11 项、图片双引用 6 项与视频三种视口回归全部通过。证据为 `tsc-integrated.log`、`integrated-text/`、`integrated-image/`、`integrated-video/`；最终截图已打开检查。该段之后仅修改文档。
- 首次普通 push 遇到同事同时更新 main 的 ref-lock 拒绝；重新 fetch 并普通合入 `0dd4a392dab18fa3eed60cc1fda63fd13b515a95` 的管理员查询改动，无冲突。该次整合未改变本轮画布文件；最终类型检查记录在 `tsc-final-main.log`，不强推。
- 完成后普通 merge 推送 main，并清理本任务短命分支/worktree。证据归档到共享仓库独立忽略目录 `output/canvas-text-layout-20261110/`，与当前共享 checkout 的源码版本分开。
- 本轮功能模块计数 1/3；已在合并前同步主线。成功发布计数增量 0，不触发服务器清理。
- 本轮不发布，不能将本地浏览器及 Git 合并记为线上生效。后续发布需按目标站现行蓝绿流程执行。
