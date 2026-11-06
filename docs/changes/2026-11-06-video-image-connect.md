# 图片连线后视频节点消失：项目读取与基础图生视频链路

## 范围与基线

- 仅处理图片节点 → 新建视频节点 → 连线 → 编辑 → 保存与刷新恢复，不增加分镜功能。
- 独立分支 `codex/fix-video-image-connect-20261106`，起点 `bfe3e64fb3ceb0f3b42952ad52f7394426167395`。共享 admin checkout 及其未提交内容保持原状。
- 用户确认故障站点为大陆站。只读 `/api/version` 与实际容器核对为同一基线；本轮未修改线上数据、配置、任务或运行实例。

## 已确认根因

1. `createCanvasNativeNodeDocument.refresh()` 调用自己的 request 适配时未传 project，默认值 `null` 清掉了 `x-naumi-project-context`。
2. 站点默认创作空间与已有项目的不可变归属不一定相同。同一 actor、相同 workspace 的实际 GET A/B：不带项目上下文返回 1 个默认空间视频；带目标图片项目上下文返回 27 条记录，其中包含 3 个近期视频节点。数据库中这 3 个节点未删除，几何与图片输入仍在。
3. 前端将前一组响应误当成整个 actor/workspace 的完整快照，六秒轮询遂移除当前项目的视频节点。新建/连线回执正确并不能阻止下一次错误范围的读取覆盖它。
4. 独立的模式缺陷：关闭 composer 后从画布连入图片，原 link compiler 只写 inputs，仍保留 `mode=text`，再次编辑会出现“文生视频不能带媒体参考”。

## 模块与职责

- `native-node-document`：六类原生节点的读取、canonical 快照、写队列与原始回执；读取传捕获的项目上下文，仅对该项目的缺失做移除。其他项目缓存保留，显式 tombstone 仍正常合入。无项目的概览读取不能证明其他不可变项目中不存在节点。
- `use-canvas-native-node-document`：订阅、生命周期与读取调度；项目切换/恢复立即读取一次，不重启视频写队列，不重放保存，不等六秒轮询。actor/workspace/编辑状态的原生命周期隔离不变。
- `link-command`：复用已存在的 `attachVideoInputs` 和当前实际选择的模型能力，将模式与输入一起编译为原子 history patch；撤销同时恢复二者。缺目录、能力不支持和 BYOC 不猜能力、不换模型，断线不擅自重置显式模式。
- `canvas-client`：仅向 link snapshot 注入现有视频目录，继续交给原 history owner 保存。

公共接口、依赖与数据归属：hook → 原生 document / Canvas link compiler → 既有 history 与 node API；服务端归属、权限、revision CAS、operationId、计费、供应商、存储及 schema 均未改变。较早读取不得覆盖新回执、未确认写入保护和工作空间 epoch 继续生效。

## 集中验证与证据层级

### 新增回归

- `node scripts/verify-video-image-connect.cjs <sourceRoot> <phase>`：实际 link/history/settings 校验代码，12 checks。原实现 4 项失败；修复版全部通过。覆盖单图、第二张通用参考图、精确模型、未知目录、BYOC、显式首尾帧、文字、重复/断线、原子 undo 和提交前校验。
- `node scripts/verify-video-project-refresh.cjs <sourceRoot> <phase>`：真实 React、六类实际 hook 与 document scope，55 checks。原实现 36 项失败；修复版全部通过。覆盖项目头、切换即时读取、局部列表不清其他项目、当前项目缺失、真实 tombstone、概览不误清、旧读/新回执、晚响应、503 保留、workspace epoch 及导航不取消正在保存的原 operation。
- `node scripts/verify-video-image-connect-browser.cjs <phase>`：真实 Next/CanvasClient/ReactFlow，HTTP 为本机可控端口，修复版 11 checks 通过。原实现新建后经真实下一次轮询消失；修复版覆盖新建、轮询、真实鼠标连线、409 拒绝不半保存、模式和图片持久化、重载、编辑再次重载、390px。生成端点拦截并计数，不调用付费供应商。
- 前两项已登记到正式 refactor canvas 目录，并使用每项独立 evidence 路径。调整既有 native document 测试中的旧“项目切换不读取”断言为“保留 document，同时按项目上下文读取一次”；不放松身份、保存或删除断言。

### 既有回归

已通过：native documents 68 groups / 106 checks；Canvas interactions 34 cases / 92 checks；video mode selection 42 checks；refactor runner 33 cases / 453 checks；全量 TypeScript noEmit。受影响 TS/TSX ESLint 0 errors，CanvasClient 6 条 hook dependency warnings，基线比对结果单独记录。最终命令、literal 输出、退出码、hash 和回退结果封存在外部任务证据目录。

测试修正记录：初次 browser runner 的连线尝试发生在错误范围轮询已移除视频之后，改为先明确断言真实下一次轮询是否保留节点，再做连接；同时验证两端为未遮挡的真实 handle。HTTP fixture 补齐文字 persisted 与工作流 manifests 的现行响应格式。二次重载的描述编辑器实际是 contenteditable，断言由 input-only 的 toHaveValue 改为 toHaveText；原失败日志保留。这些只修正测试的控制端口/断言，不修改产品行为或删除业务断言。

这些是本地实际组件/完整画布及受控 HTTP 证据，不等于新代码已部署，不等于真实供应商生成或生产视频任务验收。浏览器 fixture 的默认空间/项目空间差异源自线上只读 A/B，不修改业务实现来迎合测试。

## 交付与未完成项

- 修复、diff、验证和可执行回退材料在 `E:/Workspace/naumi-task-evidence/video-image-connect-20261106/`；回退只在另一份副本验证，保留当前修复。
- 主线整合与远端推送以最终 Git 回执为准；本文件不预先宣称已合入。
- 大陆站仍遵守现行 HOLD：本轮不发布、不迁移数据、不自动修写既有节点。发布后应再次核验同一项目新建/连线/刷新，并单独处理历史 `mode=text` 的既有图片输入；本次不批量改写用户历史。
