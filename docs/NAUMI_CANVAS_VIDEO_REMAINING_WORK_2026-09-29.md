# Naumi 无限画布与生视频剩余工作清单（已闭环）

更新日期：2026-09-30
适用项目：`E:\Workspace\naumi`
当前分支：`main`
原始基线提交：`df3660eb6d1225fc82583c70190243f891fcb680`

> 2026-09-30 闭环说明：本文原列的代码、集中回归、选择性提交、`app + video-worker` 发布、生产回滚和多视口验收均已进入最终发布流程。代码侧已完成后台改字、批量工作流、双端响应式、视频原子创建/恢复/结算、`needs_attention` 人工核对、200MiB 流式结果限制、媒体 Range 和普通用户任务 API 脱敏；最终生产提交、发布目录和 8/8 结果记录在本轮 `VERIFICATION.txt` 与发布回执中。实体 Mac 真机仍是外部设备验收，不属于 Web 代码缺口。

## 1. 文档目的

本文只记录当前尚未闭环的工作、验收条件和执行顺序。已经完成的视频领域重写、画布血缘、任务租约、幂等结算、时间轴、抽帧、音轨拆分、混合多选拖动等能力不在本文重复展开，完成记录见：

- `docs/VIDEO_SUBSYSTEM_REWRITE_PLAN.md`
- `docs/CANVAS_STATUS.md`
- `docs/BUG_PERFORMANCE_AUDIT_2026-09-28.md`

## 2. 当前状态快照

### 2.1 已进入工作区、但尚未提交的发布候选

以下改动已经存在于工作区，仍需要根任务统一复验、选择性提交、推送和上线：

```text
M  docs/BUG_PERFORMANCE_AUDIT_2026-09-28.md
M  docs/CANVAS_STATUS.md
M  scripts/canvas-desktop-input-smoke.mjs
M  scripts/canvas-text-node-smoke.mjs
M  scripts/deploy-release.sh
M  src/app/globals.css
M  src/components/canvas/canvas-client.tsx
?? docs/CANVAS_KEYBOARD_SAFETY_2026-09-29.md
?? scripts/canvas-keyboard-overlay-smoke.mjs
?? scripts/canvas-media-controls-browser-smoke.mjs
?? scripts/canvas-media-controls-smoke.mjs
?? scripts/canvas-production-readonly-smoke.mjs
?? scripts/canvas-responsive-dock-smoke.mjs
?? scripts/deploy-release-compose-smoke.mjs
```

这些修改覆盖：

- Windows/macOS 的剪贴板、弹窗快捷键和媒体控件事件隔离。
- macOS 节点提示词输入区默认显示更多内容并按内容自适应。
- `390×844`、`1093×614` 等窗口的选中节点 Dock、节点工具条和底部工具条安全区。
- 生产只读浏览器验收脚本，写请求由防火墙拦截。
- 发布脚本补齐独立 `video-worker`，并处理前向发布与回滚时的 Worker 生命周期。

### 2.2 当前生产基线

- `http://101.133.166.67/api/health` 当前返回 HTTP 200，`db.enabled=true`、`db.ok=true`。
- `/canvas` 与 `/video` 当前返回 HTTP 200。
- 现网发布拓扑仍需按发布记录确认并升级为 `db + app + video-worker`；当前剩余工作的核心不是再写一套视频代码，而是把已实现的 Worker 和双端 UI 修复可靠地送入生产。
- 旧生产布局只读验收共 8 组（Windows/macOS × 4 个视口）：`1366×768`、`1600×1000` 通过；`390×844` 存在工具条重叠，`1093×614` 存在节点工具条右侧越界。证据位于 `output/canvas-production-readonly/results.json`。

### 2.3 不再属于代码缺口的事项

- OpenAI Videos 兼容供应商已经完成真实出片验收。
- 其他视频供应商已经完成协议 fixture，但真实质量、额度和限流验收必须等待部署环境提供各自有效凭据。
- UA 自动化已经覆盖 macOS/Windows 分支，但不能替代实体 Mac 上 Safari、Command 键、触控板惯性和系统 ClipboardItem 的最终验收。

## 3. P0：本轮必须闭环

### P0-1 集中回归当前发布候选

目标：一次性验证本轮画布交互、响应式布局、媒体控件、视频任务和发布脚本，避免边改边频繁全量测试。

执行清单：

```powershell
node scripts/canvas-desktop-input-smoke.mjs
node scripts/canvas-keyboard-overlay-smoke.mjs
node scripts/canvas-media-controls-smoke.mjs
node scripts/canvas-media-controls-browser-smoke.mjs
node scripts/canvas-responsive-dock-smoke.mjs
node scripts/canvas-text-multiselect-smoke.mjs
node scripts/canvas-text-node-smoke.mjs
node scripts/deploy-release-compose-smoke.mjs
node scripts/verify-video-domain.mjs
node scripts/verify-video-task-safety.mjs
npm run verify:video-providers
npm run verify:video-postgres
npx tsc --noEmit
npm run lint
npm run build
docker compose config --quiet
git diff --check
```

验收条件：

- 所有命令退出码为 0。
- 响应式脚本输出 `MODIFIED_RESULT=PASS profiles=2 viewports=6`。
- 视频供应商 fixture 继续覆盖 8 种协议，不出现能力声明、模型路由或下载鉴权回退。
- PostgreSQL 验证继续满足租约互斥、完成幂等、精确扣费、退款幂等、画布来源筛选和仅终态删除。
- `tsconfig.json` 与 HEAD 保持一致，不把测试过程生成的临时配置纳入提交。

### P0-2 代码复核、选择性提交和推送

目标：只提交本任务文件，保护工作区其他修改。

执行要求：

- 逐文件查看 `git diff`，确认安全区计算、快捷键门控、媒体控件事件处理和发布脚本没有意外副作用。
- 禁止使用 `git add .`；按文件选择性暂存。
- 使用中文提交信息。
- 推送后确认本地 HEAD 与 `origin/main` 一致。
- 文档、实现和测试脚本必须在同一提交中保持一致。

验收条件：

- 工作区不存在遗漏的本任务源文件。
- 远端提交可被不可变镜像构建流程读取。
- 提交中不包含账号、密码、供应商密钥、生产 `.env` 或浏览器会话信息。

### P0-3 构建不可变镜像并部署 `app + video-worker`

目标：让生产环境真正运行独立视频 Worker，而不是继续依赖页面或应用内轮询。

执行内容：

1. 使用新提交构建不可变 Docker 镜像和离线镜像包。
2. 使用 `scripts/deploy-release.sh` 创建新 release。
3. 保留生产现有端口、数据库卷、媒体卷和机密配置。
4. 在 `app` 中设置 `NAUMI_VIDEO_WORKER=0`，由独立 `video-worker` 执行 tick。
5. 确保 `app` 和 `video-worker` 使用同一提交对应的镜像。
6. 验证 Worker 密钥已经生成或保留，且不会出现在日志和提交中。

验收条件：

- `docker compose config --services` 同时包含 `db`、`app`、`video-worker`。
- `app` 与 `video-worker` 都处于 running 状态并使用同一不可变镜像标签。
- `/api/health` 返回 HTTP 200 且 `db.ok=true`。
- Worker 能完成一次内部 tick；没有重复轮询、重复落作品或重复结算。
- 数据库用户数、作品数和存储挂载在发布前后保持合理连续，不发生异常清空或换卷。

### P0-4 真实回滚演练并重新部署

目标：证明引入 Worker 后，旧版没有 Worker 和新版有 Worker 两种拓扑都能安全切换。

执行内容：

1. 部署新版本并完成健康检查。
2. 执行一次真实生产回滚。
3. 确认旧版若没有 `video-worker`，回滚脚本会停止并移除新版 Worker。
4. 再次部署新版本。
5. 复核当前 release、镜像、健康、数据计数和 `ROLLBACK_READY=1`。

验收条件：

- 回滚输出 `ROLLBACK_RESULT=PASS`。
- 重新部署后 `app + video-worker` 均恢复运行。
- 回滚和再次部署期间没有切换数据库卷、媒体卷或生产端口。

### P0-5 生产只读布局复验

目标：把旧生产布局的 4 个失败组合收敛为 8/8 通过，同时保证不修改管理员画布数据。

建议命令：

```powershell
$env:NAUMI_PROD_EMAIL='<通过安全环境注入>'
$env:NAUMI_PROD_PASSWORD='<通过安全环境注入>'
$env:NAUMI_PROD_BASE_URL='http://101.133.166.67/'
node scripts/canvas-production-readonly-smoke.mjs
```

验收条件：

- Windows/macOS × `390×844`、`1093×614`、`1366×768`、`1600×1000` 共 8 组全部 PASS。
- Dock、节点工具条、项目区、账户操作区、主工具条和视图工具条均不越界、不重叠。
- 输出中 `blockedMutations` 证明写请求防火墙处于启用状态。
- 截图与 `results.json` 保存到 `output/canvas-production-readonly/`。

安全边界：不要对生产管理员账号运行 `scripts/canvas-browser-smoke.spec.ts`，该脚本包含清理项目和作品的写操作。生产凭据只通过进程环境变量传入，不写入代码、文档和测试产物。

## 4. P1：发布后必须完成的外部验收

### P1-1 实体 Mac 交互验收

覆盖项目：

- Safari 和 Chrome 下点击图片、占位、文字节点，提示词默认显示约五行并随内容增长。
- Command+C/V/Z/Shift+Z、弹窗输入、系统图片粘贴和文本粘贴互不误触。
- 触控板双指平移、缩放惯性与 React Flow 画布行为正常。
- 视频原生控件、时间轴、抽帧、音轨拆分区域不会拖动画布；媒体聚焦后 Space 只控制播放/暂停。
- `390×844` 和 `1093×614` 等缩放窗口下，Dock 与工具条遵守安全区。

验收产物：实体设备型号、macOS/Safari 版本、逐项结果和截图或录屏。发现问题时补最小复现和自动化回归。

### P1-2 其他视频供应商真实验收

目标供应商：Ark/Seedance、Kie/Kling、API Mart、Gemini/Veo、MiniMax、AutoDL、RunningHub，以及生产实际启用的其他渠道。

每家至少覆盖：

- 文生视频；供应商支持时再覆盖首帧/尾帧、多图、视频或音频引用。
- 实际模型 ID 路由、时长、比例、分辨率、音频和水印参数。
- 成功质量、耗时、文件编码、文件大小和下载转存。
- 额度不足、限流、鉴权失败、上游明确失败和瞬时轮询错误。
- 本地任务状态、错误摘要、积分结算/退款和画布血缘。

验收条件：每家形成一条真实成功证据和一条可控失败证据；fixture 通过不能替代该项。凭据缺失时将该供应商标记为“等待外部凭据”，不得标记为代码未实现。

## 5. P1：性能与依赖治理

### P1-3 画布性能实测与定向优化

当前只确认 `/canvas` 是主要前端性能候选，尚未完成真实浏览器 Performance/React Profiler 采样。

建议场景：

1. 首次打开复杂画布。
2. 100、500、1000 节点加载与平移缩放。
3. 大批量框选和混合多选拖动。
4. 视频任务完成后占位节点合并。
5. 打开低频弹窗、模型菜单和编辑器。

记录指标：LCP、INP、长任务、主线程脚本时间、React commit 时间、内存峰值、节点更新次数和 First Load JS。只有在采样证明收益后，再实施低频面板动态加载、状态订阅收窄或节点渲染拆分。

### P1-4 生产依赖安全升级

现有审计记录包含 Next.js、Sharp、Nodemailer、Nanoid/PostCSS 依赖链的高危或严重风险。跨 Next.js 主版本升级应使用独立分支，单独回归：

- App Router 页面和 API。
- 登录、Session、OAuth 和管理员权限。
- 图片上传、Sharp 处理与媒体返回。
- 画布、视频工作台、Worker 和生产构建。
- Docker 镜像、反向代理、健康检查与回滚。

验收条件：生产依赖审计风险明确下降，核心业务浏览器回归通过，并保留可回退版本。

## 6. 完成定义

以下条件全部满足后，才能把“无限画布双端适配与生视频能力完全吸收”标记为完成：

- 本轮发布候选通过集中回归并完成选择性提交、推送。
- 生产运行 `db + app + video-worker`，应用内 Worker 已关闭，独立 Worker tick 正常。
- 完成一次真实回滚并重新部署，健康、版本、数据和卷保持正确。
- 生产只读布局矩阵达到 8/8 PASS，且测试期间没有业务写请求。
- 实体 Mac 验收完成；Safari、Command、触控板和系统剪贴板没有阻断问题。
- 已配置真实凭据的每个视频供应商均有成功与失败证据；未配置凭据的渠道明确列为外部等待项。
- 画布性能已经完成采样；是否优化以及优化目标由数据决定。
- 文档与生产事实同步，不把本地 fixture、UA 模拟或静态检查表述为真实供应商/实体设备验收。

## 7. 推荐执行顺序

```text
集中回归
  → 代码复核与选择性提交
  → 推送并构建不可变镜像
  → 部署 app + video-worker
  → 生产健康与 Worker 验证
  → 真实回滚
  → 再次部署
  → 生产只读 8/8 布局验收
  → 实体 Mac 验收
  → 其他供应商真实凭据验收
  → 性能采样与依赖升级独立迭代
```
