# 对话结果图：焦点切换稳定性与失败恢复

日期：2026-11-11。分支：`codex/conversation-image-focus-20261111`。

## 模块与职责

只修改对话结果展示：`creation-message.tsx` 与所属 CSS。复用 `CachedImage`、账号隔离的 browser-image-cache 和原图片工具，不改共享缓存授权、后端任务、生成、计费、模板或视频工作台。

## 调研与旧行为复现

用户截图显示：图片原先正常，失焦后图片区塌缩为破图，但工具栏仍在。已用实际 `CreationMessage` + `CachedImage` + browser-image-cache + React/Chromium/IndexedDB/Blob 解码复现代码路径：

- 原 Markdown `p` / `img` renderer 在每次 render 中创建。对话列表、登录态或其他父级更新使 renderer type 改变，React 卸载原图片并释放已显示 Blob URL。
- 正常网络下也发生节点替换与 URL revoke；元数据/媒体同时暂时 503 时，焦点关联的父级更新导致已显示图片变成零自然宽度，图片区域塌缩，与截图形态一致。
- fixture 显式触发 blur/focus/visibility 更新，另覆盖真实浏览器页签往返；HTTP/auth/功能授权/动作回调是 fixture，缓存、Blob 生命周期和 DOM 是真实产品实现。这是本机代码级复现，不把它写成已读取用户线上请求日志。

原始基线 `286b29e7cca0f4d08a2883423f40b9e3e1d3f801`：从上一轮 `a1fcdc7312ea477d2432047f2378313df9a27f09` 独立开分支并整合当时最新 main `36ee7dcc511cb22440656694ff33d5f559931931`。Git 默认 schannel fetch 首次 TLS 握手失败，改为单次命令 `git -c http.sslBackend=openssl fetch origin main` 成功，未持久修改 Git 配置。

## 实现、接口与状态归属

- 模块级稳定 `resultComponents` / `ResultMedia` 保持同一 Markdown 图片组件身份；使用窄 `ResultContext` 传入最新 prompt、port、onPreview，不用冻结旧闭包来换取不重绘。
- 同一结果 URL 的普通重绘不卸载图片，不释放其显示 lease；真正换结果用 URL key 分开组件状态。流式正文可更新。
- `ResultImage` 拥有本地 loading/ready/failed、已知尺寸与显式 retry attempt；已加载尺寸保留，新图片冷加载至少预留 220px，失败不显示浏览器破图图标，也不让浮动工具栏压到正文。
- 失败时只显示必要错误和“重新加载”，工具栏只在图片 ready 时显示；重试仅重新读取/授权图片，优先复用已验证字节，不提交生成，不自动循环重试。
- 账号、workspace、资源授权及 Blob 回收仍由原缓存 owner 负责。焦点 503 保留有效像素，但明确撤权、401 和切账号仍清除私有图片。

## 集中验证

证据目录：本工作树 `output/conversation-image-focus/`。

| 命令 | 结果与层级 |
| --- | --- |
| `node scripts/verify-conversation-image-focus.mjs --baseline` | `BASELINE_REPRODUCED checks=5 focusRemount=1 revoked=1 blurOutageBroken=1 supplierCalls=0`；实际旧组件/CSS，exit 0 表示旧缺陷准确复现 |
| `node scripts/verify-conversation-image-focus.mjs` | `CONVERSATION_IMAGE_FOCUS_PASS checks=20 focusRemount=0 retainedDuring503=1 focusImageBytes=0 supplierCalls=0`；真实 React/Chromium/IndexedDB，HTTP/auth 是 fixture |
| `node scripts/verify-conversation-sidebar-ui.mjs` | 28/28 PASS，保留 Markdown/LaTeX、图片操作、代码复制、会话菜单与输入聚焦行为 |
| `node scripts/verify-browser-cache-efficiency.cjs --output-root output/conversation-image-focus/cache-regression` | 13/13 PASS，既有实际浏览器缓存、授权、共享字节、取消、隔离回归 |
| `npx tsc --noEmit --incremental false` | 全项目非增量检查，exit 0 |
| `node scripts/verify-conversation-image-focus.mjs --rollback` | `ROLLBACK_RESTORED checks=5 focusRemount=1 revoked=1 blurOutageBroken=1 supplierCalls=0`；读取另一副本内恢复的组件/CSS |

修改版共 61 项浏览器检查通过，另有基线 5 项和回滚 5 项；pageErrors=0，supplierCalls=0。20 项定向验证包含旧节点/URL lease 保持、图片菜单保持、503 时尺寸保持与零图片字节、真实页签往返、visibility/list 重绘、最新 preview/reference 回调、正文更新、真实换图、重载 IDB 复用、冷失败占位、显式重试，以及撤权/401/切账号清理。

`baseline-focus.png`、`modified-focus.png`、`failed-placeholder.png`、`retry-restored.png` 均已打开检查。图中 PRODUCT 瓶子是本机测试图，不是用户生成结果或公开创作素材。

## 交付与回滚

四产物 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 位于证据目录；原始/修改后 SHA256 在 `hashes.json`，原始字节在 `baseline-files.zip`。只在带 marker 的另一个副本测试回滚，校验原始 hash，正式源码保持修改。

## 未完成与接入

本轮本机修复与验证完成，待 main 接入和线上版本验收。当前分支包含上一轮富文本依赖提交 `a1fcdc73`，不要只拿本轮 diff 套到尚未接入富文本的旧 `creation-message.tsx`；可整条内容分支接入，或连同上一轮提交依赖选择性 cherry-pick。本轮不合 main、不部署、不连接 47/103，不回灌数据库或媒体，不重放任务。
