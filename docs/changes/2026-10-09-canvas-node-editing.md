# 画布节点编辑：高频功能先落地

## 交付范围与 Git
- 分支：`codex/canvas-node-editing`，只提交和推送本分支，不部署、不合并 main。
- 基线：`368309d38e2d55eb3a29c174eec4f7a0c06a3d56`。
- 继承工具条整合 `5e3b433` 和助手侧栏 `368309d`；合并者应连同这两个依赖整合。
- 交接前 fetch 的 origin/main：`138912fbc60935c188d2d7da7c4509b9050d1895`。本轮没有将共享 main 拉回任务分支；统一合并者需重新刷新并处理 canvas-client 的并行改动。
- 独立 worktree：`C:\Users\13357\.codex\worktrees\canvas-node-editing\naumi`。

## 已实现
1. 图片工具条外露裁剪、替换。静态 PNG/JPEG/WebP，输入及结果上限12MB，解码上限40MP；EXIF先旋正再裁剪，拒绝动画。
2. 两种编辑均保存独立新图片节点，保留原图、父节点和项目链；不是覆盖旧图片，也不是模型调用。保留裁剪/替换来源记录。操作 UUID + fingerprint 幂等，同 UUID 不同输入拒绝。
3. 文字工具条外露“样式”，支持字号12–72、三档字重、对齐、行距、预设/自定义颜色。面板先预览，再应用，一次应用一笔历史；未应用的草稿关闭即丢弃。
4. 更多菜单提供锁定/解锁、置顶/置底、属性。锁定是交互防误改，不是权限边界：阻止移动、缩放、改内容、重命名、删除；隐藏文字生成编辑栏并阻止改写锁定文字。图片创建新生成衍生版本仍可使用。复制副本默认解锁/默认样式，不继承设置。
5. 属性面板按需打开，桌面320px并列栏，窄屏8px内距浮层；支持Esc、Tab循环、关闭焦点恢复。打开属性收起对应生成dock；助手/OCR与属性互斥。
6. 属性只读展示节点画布显示尺寸与原图像素，前者含节点已有布局边界，不是上游出图参数；视频不显示静态图片裁剪/替换操作。
7. settings.order作为ReactFlow zIndex，关闭选中时自动提高层级。样式、锁定、层级刷新保留，纳入既有撤销/重做事务。

## 存储与接口
- `GET /api/canvas/node-settings`：鉴权后当前账号或既有管理员只读目标账号；DB错误503，不以空数据覆盖现有设置。
- `POST /api/canvas/history`：新增严格 `node-settings` 操作，复用所有权核验、事务和幂等机制。
- `POST /api/canvas/local-image-edit`：crop JSON / replace multipart；只用会话账号，拒绝跨账号节点，401/400/409边界。
- 增量表 `app_canvas_node_settings`、`app_canvas_local_edits` 懒初始化。不修改现有数据库列，不改模型配置、价格或模型请求。无DB时样式设置沿用本地存储；图片编辑要求DB。
- 删除文字后的设置记录保留，确保撤销恢复文字时样式仍在。旧代码忽略新表，回滚时保留表与已保存图片，不做破坏性删表或数据回灌。

## 验收与证据
证据目录：`E:\Workspace\naumi\output\canvas-node-editing-20261009`。
- 基线复现：固定12px文字，无锁定/层级/本地裁剪替换。
- 严格schema、精确像素4×3、EXIF6×8、末像素1×1、越界/非法媒体拒绝。
- 隔离PostgreSQL真实测试：所有权、设置保存/重载/撤销重做、混合事务失败回滚、文字删除恢复样式、原图不可变、衍生链、UUID幂等和路由401/400/200。
- 本地编辑和属性测试前后 ledger 数量/合计一致；新图片编辑服务没有模型或扣费调用。
- 静态回归：保护12个既有生成函数，工具条/助手/图标/主题/桌面输入、2625组dock碰撞；TypeScript和任务文件lint通过。
- 完整 `next build` 退出0，既有 annotate-editor 的img警告保留；生产构建本地 `/canvas` 返回200。
- 实际浏览器：文字预览与保存24px/600/绿色/居中，撤销12px和重做24px、刷新保留；锁定readOnly、不draggable、0个缩放柄、删除/重命名禁用，zIndex=1且刷新保留。
- 实际浏览器：640×480原图裁剪50%×80%得到320×384新节点，原图保持；新节点撤销消失、重做恢复；上传8×6测试图生成替换版本并保留父链。
- 面板和助手互斥；390px与320×480浮层、Tab循环/Esc、浅色/深色和英文界面检查。生产构建也验证文字保存及英文320px布局。
- 浏览器布局变化期间曾误点到既有生成文案图动作：仅在无上游凭据的隔离环境产生一笔mock任务及6测试积分扣除，记录不属于本地编辑消费；没有生产数据或真实上游调用。临时fixture容器结束后移除。
- 依赖junction曾导致Next字体解析错误，改为本worktree独立npm ci后消除；Next生成的tsconfig缓存改动已恢复，未纳入提交。

## 暂缓
滤镜、蒙版、投影、格式刷、精确XY/WH编辑不在本轮实现。未进行服务器发布，也未在macOS实体设备验收。

## 合并者接手
```text
先读 AGENTS.md、docs/AGENT_COLLABORATION.md 和本文。
刷新origin/main，整合工具条、助手侧栏、节点编辑三个依赖分支，不用复制目录覆盖并行代码。
重点检查canvas-client的属性/助手互斥、dock选择条件、history事务和新API所有权。
运行verify-canvas-node-editing-ui.mjs --business-baseline BASELINE_DIR；隔离loopback PostgreSQL中运行tsx --conditions react-server scripts/verify-canvas-node-editing.ts --postgres。
集中回归、build和真实画布验收后，由统一发布agent使用deploy.lock流程处理新机。
不操作旧机，不回灌测试数据库。源码回滚证据仅在copy演练；运行版本回滚保留增量表与媒体。
```
