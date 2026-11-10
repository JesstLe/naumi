# 拉线引用新建统一节点入口

## 模块与职责

- 任务分支 `codex/canvas-reference-node-20261110`，独立工作树 `E:/workspace/naumi-reference-node-20261110`。
- 开工基线 `41a59ff0260ef5550b6ee8ada7ba01c05b201df8`；共享 checkout 的分支和他人文件保持。
- 根因：工具栏和空白右键已使用 8 项节点清单，拉线落空白仍有单独的图片/上传/文字分支，还排除了文字来源及原生节点来源。

## 公共接口、依赖方向、数据和事务归属

- 三个入口共用 `canvasNodeMenuItems`，节点类型直接引用 `CanvasCreatableNodeKind`，不再单独声明一组类型。
- `createCanvasNode(kind, point, sourceId?)` 统一创建；`dispatchCanvasNodeCreation` 返回创建结果，文字及视频包装入口透传节点身份。
- 带来源创建等待现有创建 owner 完成，再调用 `submitCanvasLink` → `compileCanvasLink` → 原有 history owner。图片/文字、角色/场景参考图、导演背景、视频输入角色、音频素材及多轨素材检验均复用普通连线规则。
- 原生节点和占位节点的连线快照从 owner 的实时 `getSnapshot()` 读取，避免异步创建后 React 尚未重渲染时找不到目标。项目作用域在创建前捕获、创建后检查；换项目不继续写引用。
- 创建和连线仍是已有的两个操作/历史步骤，不声称是跨接口原子事务；没有新增任务、计费、存储或重试体系。创建成功后引用失败保留节点并提示，用户可继续编辑或撤销；不自动重建、删除或重放。

## 本次实现与迁移状态

- 移除旧拉线菜单、源图/文字白名单和上传专用创建分支。8 种类型、图标、排序、只读及视频权限/加载禁用状态与“添加节点”一致。
- 拉线菜单复用 `ContextMenuSurface`，使用视口坐标定位、原画布坐标创建；支持键盘、Esc、外部关闭和窄窗口滚动。普通上传仍可从图片节点及原上传入口操作。
- 不适用的源/目标组合沿用已有连线错误；无可添加引用的空操作有明确反馈，不把未建立引用显示为成功。
- 导演来源保留节点身份，在公共连线规则中解析当前输出，同时保留来源锁定校验。
- 实测发现入场缩放动画影响 `getBoundingClientRect`，菜单最终展开后可能越界；共享菜单改用未变换的布局宽高定位。

## 验证与证据层级

- `node scripts/verify-canvas-reference-creation.cjs --browser`：26 个实际 Canvas 函数/公共规则用例；实际拉线菜单 JSX 和共享组件的隔离 Chromium 检查通过。覆盖 8 种创建、文字→文字、角色/场景/音频/多轨→视频、场景→导演台、导演输出→图片、异步保存、换项目、失败、只读及视频禁用。
- 实际菜单覆盖 8 个点击动作、键盘、Esc、1100×720 和 320×240 边界/滚动；页面错误 0。已打开查看桌面和窄窗口截图。
- `node scripts/verify-canvas-node-creation.cjs`：27 个创建用例、9 个语言用例、105 个断言通过。
- `node scripts/verify-canvas-interactions.cjs`：34 个用例、92 个断言通过，包含连线/剪线、撤销、未知响应保留、并发队列及作用域。
- `node scripts/verify-video-image-connect.cjs`：12 项通过，包含视频模式/角色和精确模型能力适配。
- 完整 `tsc --noEmit --incremental false --pretty false` 通过；定向 ESLint 无错误，CanvasClient 保留 6 条既有 Hook 警告。`git diff --check` 通过。
- 使用现有 `E:/workspace/naumi-quality/node_modules` 的只读依赖链接。隔离测试执行实际业务函数，持久化及素材检查为测试端口；没有真实 API/DB/供应商生成，也不代表线上端到端验收。
- 测试过程中修正了测试环境的 Error realm、JSX runtime、配置路径及 React 异步渲染等待问题；边界溢出属于实际共享组件问题，已修复后复测。

## 未完成项与下一步

- 合并前刷新主线为 `f4fe5c007dd50aa2cb4acf121ea74de060d87b85`，整合后执行最终相关检查，结果补记于下方。
- 本轮为 1 个功能模块，刷新整合后同步计数归零；未发布，成功发布计数不变。47 暂缓发布决定保持，未连接任何服务器。
- 真实账号的应用/API 持久化和线上操作留待对应版本发布验收。
