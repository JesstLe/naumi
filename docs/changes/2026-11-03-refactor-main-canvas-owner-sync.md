# Canvas 主线能力整合到重构 owner（2026-11-03）

## 模块与职责

- 工作树：`E:/Workspace/naumi-refactor-main-owner-sync-20261103`。
- 本轮来源：重构基线 `64ff0b81a90827a9ba9beb2a8874d8e482e2053f`；整合固定 main `c4b1e2670ea2aebbd056fbf012f2c2ba0a93c513`。
- Canvas 继续作为组装入口，不还原 main 的单体生成循环。`image-creation` 负责创意指令和参数，`image-runs` 负责流程组装，`image-task-controller` 负责原提交/轮询/结果挂载，`generation-presentation` 负责任务展示，`dock-layout` / overlay hook 负责几何和测量。
- 本记录只说明本地模块整合和回归；整体 merge、固定版本构建、CI、主线提交及发布另由集群入口记录。47 的暂缓发布决定不变。

## 本次实现与迁移状态

### 1. 后台生成与原任务身份

- 显式标准 Generate 通过 `newCanvasImageAttempt` 分配新的 attempt。草稿编辑不提交任务；恢复原任务继续使用冻结输入及原身份。
- Canvas 在提示词异步保存之前取得按账号、工作空间、项目、节点分组的 token-CAS single-flight；持久 job 回执释放本次提交锁。旧 finally 不释放新一轮锁。
- `CanvasImageGenerationOptions.onSubmitted` 经 `image-creation`、`image-runs` 进入实际共享 controller，仅在有效 jobId 后触发。分图/三视图/详情原有分支身份保持。
- 已受理空白节点的新 Generate 创建独立 sibling，复制当前可编辑草稿及引用，不复制 job、失败、支付、进度或取消字段。原任务继续运行和可恢复。
- `generation-presentation` 使用 `beginCanvasImageAttemptTasks` 区分当前显示和保留执行；旧 UNKNOWN 的回查不抢占新结果的显示层。
- `scene-projection` 仅将最新非 superseded 替换任务投影到节点，所有原执行仍独立保留。

### 2. 草稿、持久化与完成位置

- 新增窄 owner `image-draft-completion.ts`。完成后移动当前 live draft，既有目的节点编辑优先；冻结生成 prompt 不被最新编辑覆盖。
- 目的项目使用 `project-catalog` 导出的 `canvasArtworkProjectKey`，遵循真实 group、suite batch 及历史父子树算法，不猜 `tree:<resultId>`。
- Canvas 接回主线 `useImagePromptSync`、行内引用、参考图上传、提示词恢复控制；账号/工作空间 revision epoch 绑定持久化 owner。
- 分享、复制前等待提示词 flush，选择切换不迁移旧异步回包；重复作品保留 detached 与原 `singleArtwork` 位置约定。
- 助手 planning、requestedProject 文本深链、项目加载 gating 由独立 assistant/navigation owner 提供窄接口，Canvas 只绑定，不另建平行任务状态。

### 3. 像素、Dock 与缩放

- 像素尺寸留在 `nodes/artwork-node.tsx` 的真实渲染 owner；已知原图 metadata 优先于缩略图，未知时才用当前已加载原图尺寸，节点缩放不改变像素标签。
- 标题避让在 `projectOverlay` 中使用实时 viewport zoom；render 与 live DOM 更新调用同一几何函数。
- overlay hook 测量实际工具条和 composer header/footer，计算最低可编辑区域；展开/收起更新 live height。旧 context 的 ResizeObserver 无权测量新文档。
- `dock-layout` 保留重构的 readOnly 和窄屏布局接口，再接入 main 的 measured toolbar、标题避让和媒体展开。移除自动合并引入的重复 `expandAroundImageTitle`。
- document capture wheel 在启用的编辑视图阻止 Ctrl/Meta 浏览器缩放，包含 portal/sidebar；普通 wheel、项目浏览和禁用状态不保留该捕获。Canvas 自身事件传播和键盘/menu zoom 保持。
- `CanvasImageComposer` 复用实际 shared submit action，接入展开、持久化恢复、引用就绪和原任务多项回查。

## 回归脚本迁移原则

- `verify-canvas-image-creation`、`verify-canvas-background-runs` 从原单体 AST 边界改为执行真实 moved owner；原创意内容、文件字节、顺序、lineage、双并行、UNKNOWN、空画布目的项目等业务断言保留。
- `verify-canvas-pixel-size` 跟随 `ArtNode` / `ArtworkContent`，仍运行 React 19 和 Chromium，而不是复制像素规则。
- `verify-canvas-pixel-dock-wiring` 校验 Canvas hook 输入及 render/live 两次实际 `projectOverlay` 调用，保留三种 zoom 的六次几何断言。
- `verify-canvas-merged-dock-layout` 保留 192 次 main 展开精确比较；折叠基线绑定实际 refactor ABI，192 次精确比较。主线旧第七参数 ABI 不覆盖 refactor 的 readOnly 参数。
- `verify-dock-reference-layout` 保留最终选项可见和 body 不滚动合同；只有 picker 确有溢出时要求 scrollTop > 0。1024 宽全部 16 项已可见时不强制无意义滚动。
- `verify-canvas-overlay-owner` 原 31 traces 保留，新增实际 measured title 三 zoom、header/footer ResizeObserver、媒体展开/收起和 live height 稳定性；`verify-canvas-viewport-owner` 新增 document capture 与 portal 冒泡截断边界。

## 集中验证结果

最终集中批次 **19 条命令全部 exit 0**，批次前后产品 owner SHA-256 不变。

| 脚本 | 观察结果 |
| --- | --- |
| `verify-main-sync-canvas-owners.cjs` | 5 cases / 32 checks；actual runs、ACK release、空白 fork、live draft、原回执保留 |
| `verify-canvas-image-creation.cjs` | 46 checks / 27 creative cases / 8 races；新增 deliberate attempt 身份断言 |
| `verify-canvas-image-task-refactor.cjs` | 47 cases / 177 checks；已知 job 恢复零 submit adapter 重入、partial 回执保留 |
| `verify-canvas-scene.cjs` | 30 cases / 103 checks |
| `verify-canvas-generation-presentation.mjs` | 8 groups / 46 checks；actual React |
| `verify-canvas-overlay-owner.cjs` | 13 checks / 31 原 render/live traces；actual React DOM / ResizeObserver |
| `verify-canvas-viewport-owner.cjs` | 16 checks；actual React hooks / document wheel |
| `verify-canvas-view-navigation.cjs` | 18 normal / 35 checks |
| `verify-canvas-background-submit.cjs` | 5 checks；actual shared component |
| `verify-canvas-background-receipts.cjs` | 9 checks；完整 client/recovery modules |
| `verify-canvas-background-runs.cjs` | 11 checks；双任务两种完成顺序、锁、UNKNOWN 和空画布 group |
| `verify-canvas-pixel-size.cjs` | 21 checks；actual React19 / Chromium |
| `verify-canvas-pixel-dock-wiring.cjs` | 6 actual render/live calls |
| `verify-canvas-merged-dock-layout.cjs` | 192 main expanded + 192 refactor collapsed exact + 174 expanded title cases |
| `verify-canvas-image-title-layout.ts` | 555 title-clearance cases |
| `verify-dock-reference-layout.cjs MODIFIED` | 12 checks；actual production shell/editor/CSS / Chromium |
| `verify-inline-image-prompt-client.mjs` | 12 checks；uncertain ACK、CAS、账号 epoch、no-DB 合同 |
| `verify-inline-node-reference-ui.cjs MODIFIED` | 22 checks；actual React / Chromium / IME / clipboard / mobile |
| `verify-canvas-image-references-ui.cjs` | 19 UI/transport 合同；actual React / Chromium |

全部外部供应商调用为 0；HTTP、业务数据、auth、Flow imperative port 使用明确本地 fixture。actual React/DOM 通过不等于完整固定 Next App、PG、生产计费或上线验收。

精确记录：

- `output/refactor-main-owner-sync-20261103/canvas-agent/CANVAS_BATCH.json`：每条 command、input、stdout、stderr、exit。
- `output/refactor-main-owner-sync-20261103/canvas-agent/DELIVERY.json`：初始/最终 owner hashes、19 commands、sourceStable、未运行项。
- `output/refactor-main-owner-sync-20261103/canvas-agent/INITIAL_OWNER_SNAPSHOT.tar` / `INITIAL_OWNER_HASHES.json`：动手前副本及 hash。
- `output/refactor-main-owner-sync-20261103/canvas-agent/CANVAS_BATCH.attempt1.json`：首次失败诊断保留，不替换为最终通过。

## 未完成项与下一步

- 整体 typecheck、完整 Web/Worker 固定构建、merge/CI、四产物和副本回滚由集群入口集中执行；本模块不代签整体完成。
- 本轮按入口安排未另起 Next 实例；以下完整 CanvasClient/ReactFlow 脚本 **未运行**，留给固定 App 阶段：

```powershell
$env:CANVAS_BACKGROUND_URL='http://127.0.0.1:<fixed-app-port>'
$env:CANVAS_BACKGROUND_OUT='output/<fixed-app>/canvas-background'
node scripts/verify-canvas-background-ui.cjs

$env:CANVAS_PIXEL_DOCK_URL='http://127.0.0.1:<fixed-app-port>'
$env:CANVAS_PIXEL_DOCK_OUT='output/<fixed-app>/canvas-pixel-dock'
node scripts/verify-canvas-pixel-dock-ui.cjs

$env:CANVAS_ZOOM_URL='http://127.0.0.1:<fixed-app-port>'
$env:CANVAS_ZOOM_OUT='output/<fixed-app>/canvas-zoom'
node scripts/verify-canvas-zoom-ui.cjs
```

三者依赖 `scripts/canvas-mapping-ui-fixture.cjs`、`@playwright/test`、`sharp` 和已安装的 `msedge` channel。业务 HTTP、媒体、报价和执行回执由脚本拦截；这些依旧是完整客户端 HTTP-fixture 层，不是收费供应商或真实 PG。

