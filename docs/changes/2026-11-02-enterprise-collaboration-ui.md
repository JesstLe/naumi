# 企业协作 UI 实现与交接

## 基线与路径

- 父合同基线：`09437aaa6f8babfc0e52b28ad049ca72122492a0`；任务工作树 `t3-14e84998` / `t3/enterprise-collaboration-ui`。开工 tracked clean，已 `git fetch origin main`；未改父合同及父进度文档。
- 本文属于 UI 独占切片。没有 push、合共享 main、部署、SSH、数据库容器或供应商请求；当前结果为本地源码及 HTTP 合同 fixture，不是后端权限、线上功能或 10 万用户容量验收。
- `src/components/collaboration/` 拥有通讯客户端及窗口；根 `src/app/layout.tsx` 只挂一次 Provider。CanvasClient 仅传递原生 projectKey / node IDs；Desktop 保留既有导航、项目卡片及身份鉴权。

## 模块与职责

### 公共接口、依赖与状态归属

- Wire 类型唯一依赖 `src/lib/collaboration/contracts.ts`。所有 `/api/collaboration` 非 bootstrap 请求通过 query `enterpriseId`，使用现有 `authHeader()` 及 same-origin cookie。
- `CollaborationProvider` 在 Auth / Toast 内、AppShell 和路由 key 外；`useCollaboration()` 公开 `available`、`unread`、`open(CollaborationOpen?)`、`share(CollaborationShareIntent)`。公开快照只在 available/unread 变化时换引用，编辑草稿和上传进度不触发整个 CanvasClient 重绘。
- `CollaborationClient` 是根生命周期的单一状态拥有者。它拥有会话列表、分页消息、草稿、上传 File、原消息 outbox、SSE、presence、申请及 operation IDs；UI 不直接访问后端内部或另建账号/企业/作品存储。
- 账号、企业变更增加单调 epoch；异步鉴权、fetch、JSON/blob、SSE reader、上传/分享的续体必须通过 epoch。A→B→A 不因 email 再相同而接纳旧续体。ready=false→true 仅视为认证 hydration；实际换号/登出才清理旧账号持久及内存草稿。
- 草稿 key 为 JSON `[account, enterpriseId, conversationId]`，本地只保存正文/引用/提及；附件授权不从磁盘恢复。根内存保留已完成附件与上传 File，所以应用内路由变化/窗口收起不丢失上传。
- SSE 一账号/企业一条 fetch 流，认证 headers、原 cursor 重连、帧上限、JSON 校验、事件去重、75 秒读空闲 watchdog；游标在失效通知对应读取成功后提交。presence 每 30 秒一次，页面隐藏/空闲变 away；退出采用断流及服务端 TTL，不拿换号后的凭据替旧用户补发 offline。
- 请求 deadline 覆盖完整响应 body；非 JSON、401/403/404/409/413/503、流故障均有明确状态。没有产品 fake chat fallback。

### 已实现交互

- 原 `/canvas` 项目列表顶栏和项目右上均有消息入口、未读角标；`/desktop` 复用同一 Provider。新消息不自动展开、不抢焦点，不写画布视口/选择/运行状态。
- 浅色可拖动、CSS resize 浮窗、展开大窗和移动端单栏；窗口上的 `data-canvas-hotkeys-blocked=true` 与现有 Canvas 捕获快捷键协作，键盘/粘贴/复制/拖放停止 React 及冒泡事件。
- 姓名/岗位搜索、在线/离开/离线筛选；私聊、群创建、成员增删、重命名、离开；置顶、免打扰、未读位置及明确“标为已读”。不承诺对端已读回执。
- Markdown 子集工具栏、@、表情、引用、记录搜索、游标历史、多选转发、本人撤回；ReactMarkdown `skipHtml`、allowlist、安全链接，不使用 raw HTML 插件或风险 `dangerouslySetInnerHTML`。
- 选择/拖放/截图粘贴附件，ZIP/RAR/7z 直接分块、不解包；init/GET/PUT/complete、进度、暂停续传、明确 DELETE 取消、同身份幂等重试。发送只使用 complete 回执附件。取消 ACK 不明确时保留“取消未确认”，再次操作恢复原上传身份而不是另造成功。
- 文件 tab、鉴权下载、PNG/JPEG/WebP/GIF/AVIF 图片及 MP4/WebM/OGG 视频预览；blob URL 在卸载/账户变更释放。消息 ACK 丢失后 outbox 保留原 clientId 和不可变 payload，显式“使用原消息重试”。
- 画布整项目、右键作品、真实已保存的多选节点发给成员；未保存占位节点不替换成虚构 ID，不静默丢弃多选的一部分。卡片只存 shareId，详情独立读取；批准前不读取或展示 prompt/流程参数。
- 成员直接申请、offer 卡片→申请→作者在自己 Canvas 选择来源→CAS/operationId 批准/拒绝/撤回→接收者打开独立 resultProjectKey。来源选择跨路由使用 Next Link，保持待审批状态。批准后的撤回明确不删除已有副本。
- 预览封面仅使用服务端 `CanvasShare.previewUrl`，同源带认证 fetch、检查实际图片 MIME，不内联 SVG/HTML/JSON。
- DesktopShell 保留原 NAV / gating / workspace selector；增加消息、成员、申请；项目快捷列表使用现有 `desktopProjects(artworks,texts,names)` 排序，并以 URL 原 projectKey 判选中。DesktopHome 保留图片卡片与既有数据 API，去掉标题标语；已验证 project.nodeId 的作品提供发送入口。
- Canvas desktopAppearance 去掉重复 Logo/账户头部，保留项目菜单与名称；原版 Canvas 完整头部保持。DesktopTransport 仅对 collaboration 前缀不重写：同一根聊天操作不随路由漂移成 `/desktop/api/collaboration`。

## 验证命令与证据层级

集中测试入口：

```powershell
node scripts/verify-enterprise-collaboration-ui.baseline.mjs . --modified
node scripts/verify-enterprise-collaboration-ui.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
git diff --check
```

- baseline 在改动前真实运行：`BASELINE_FEATURE=ABSENT (no enterprise chat provider or canvas messaging entry)`，exit 0 是“断言基线缺功能”通过，不是聊天功能通过。
- 浏览器测试用 esbuild 打包**实际** Provider / client / 窗口 / 发送编辑器 / 文件 / 分享 / DesktopShell / DesktopHome / DesktopTransport / Canvas 狭窄入口组件；React 与 ReactDOM 均 `19.3.0`。现有 node_modules 仅以任务目录 junction 只读复用，未修改共享依赖。
- fixture 是单个随机 `127.0.0.1` HTTP 服务、两独立浏览器身份；服务/浏览器在 `finally` 精确关闭。PG 容器 0、真实上游 0。Canvas 背景与 Next/Auth/FeatureAccess 是测试装配，**未把整个真实 CanvasClient/数据库/所有供应商链路当成已浏览器验收**。
- 覆盖双身份 SSE、关闭角标、不抢焦点/画布 fixture、ACK 同 ID、Markdown XSS、ZIP 分块暂停续传/下载 SHA256、取消/重传、RAR/7z、文件403、路由草稿/上传、ready hydration、企业隔离、A→B→A fence、截图粘贴/快捷键、图片预览、历史/搜索、引用/@、置顶免打扰、群管理、转发撤回、分享申请批准、流错误/重连/去重、HTML503、成员撤权、拖动/移动端/截图、登出资源清理。
- 输出目录：`output/enterprise-collaboration-ui/`，含 `browser.log`、`result.json`、`typecheck.txt` 及 PNG。截图为真实组件渲染结果、HTTP fixture 数据，不是生产截图。
- 测试修复记录：初版 harness 的挂载等待、browser process.env、feature-access callback 稳定性、模拟 ACK 的 Chromium 自动网络重试，以及 idle 断言前尚在途的消息补读，分别修复 harness 后重跑；没有靠产品 fake 数据使测试转绿。

## 未完成项与父线程集成边界

1. 通讯与共享后端未合入此工作树；通讯负责人已提交 `b40cd63e2531bc13811dd45006f74b3260084249` 并在父树整合。本 UI 只读核对其 `validation.ts/service.ts/events.ts/http.ts/uploads.ts`：上传 part 从 0 起、members 首批100/conversations首批50、opaque nextCursor、SSE update/heartbeat 与当前实现匹配。新增浏览器用例证明第101位成员可搜索/发起私聊、第51个以上会话可继续分页。父整合后仍须用真实 session/企业身份替换 HTTP fixture，核对共享 previewUrl 响应 MIME；UI 不自行扩展父 wire 类型，也不依赖未定义 preview JSON 中的 prompt 或节点数据。
2. 本轮上传断点续传覆盖**同一应用生命周期**中的暂停/网络重试/跨路由。浏览器刷新后 File bytes 不持久化；会话正文草稿可恢复。刷新后的上传元数据/重新选择文件匹配恢复仍是后续增强，不冒称浏览器关闭后续传。
3. 原版完整 Canvas 真实项目、所有原生节点类型复制、数据库 CAS/复制独立性/媒体删除后可读、成员到期/后端文件权限、Range 视频字节流、供应商/账务零变化由父真实模块联调验证；本地 UI fixture 的返回值不证明这些服务端性质。
4. 桌面作品发送入口仅在现有 `desktopProjects` 精确返回 `nodeId` 的项目上显示；没有对未关联作品伪造项目 key。Canvas 右键已覆盖该画布真实作品/多选流程。
5. 没有全项目 Next 生产构建或部署；父集成后再做固定候选构建。

## 集中验证结果

- 本次浏览器集中场景覆盖实际 WebM 播放、拖放 RAR、独立结果链接、直接申请拒绝、第101位成员与第51个会话分页、未读边界定位/标记。最终 `browser.log` 与 `result.json` 保留逐项结果和计数，React19 两身份 HTTP fixture，不代表真实后端或生产。
- 完整 TypeScript 检查 `--noEmit --pretty false --incremental false` 已执行 exit 0，字面输出为空。`git diff --check` 已执行 exit 0，输出为空。
- 四产物生成器真实运行过 `ARTIFACTS=PASS TARGETS=23 COPY_ROLLBACK=RESTORED LATER_EDIT_EXIT=73 ZERO_WRITES=YES SOURCE_MODIFIED=YES`；包括 baseline 缺功能恢复、最后一个目标后改导致所有目标零写入、原工作树拒绝写入。最终提交前重建并重新核验相同交付材料。
- baseline 原始字节和修改版逐文件 SHA256 见 `delivery/manifest.json`；DIFF 在另一个临时非 Git 副本 `git apply --check`、实际应用及全文件 SHA256 一致。初次 diff 检查发现 CSS 追加产生 CRLF；统一任务文件 LF 后精确校验通过，未改变父文件。
- 成功完成的上传立即释放 File bytes，仅保留 confirmed attachment metadata；暂停/取消任务保留必要 File 供用户显式续传/重传。
- 第101位成员回归发现会话分页边界缺陷：成员新建的 direct 若不在首50个会话，紧随的 SSE 刷新曾将其丢出当前列表。已改为：分页尚有 nextCursor 时保留已显式创建/打开的会话；只有完整已读范围缺失或鉴权消息读取拒绝才清理，避免把“不在本页”误判撤权。
- 后续只读核对共享固定提交 `c7e1e88ee7f565c77d3d89a5c774c23cf6b62680` 的 domain/service/media：单作品要求恰好一个 artwork ID，previewUrl 为认证二进制图片端点，resultProjectKey 仅申请者返回。`shares` topic 独立刷新申请列表，并通过 sharesRevision 使当前卡片重新 GET 授权详情，即使该卡片不在当前申请列表页中也刷新；测试明确无新消息时卡片从等待申请变待批准。
- 视频 fixture 曾因 headless MediaRecorder 只产生110字节容器头而未解码，保留真实失败定位；改用本机 FFmpeg 生成的固定64×64 VP8 WebM 字节，实际视频元素解码 readyState>=2 后才计通过。

## 四产物 / 回滚约定

最终集中结果：`COLLABORATION_UI=PASS checks=29 react=19.3.0 HTTP_FIXTURE=1 REAL_BACKEND=0 SUPPLIER_CALLS=0 PG_CONTAINERS=0`，browser exit 0，pageerror 0；完整 tsc exit 0（空输出），diff check exit 0。4张 PNG 均已实际打开核查，浮窗/大窗/移动端与 Desktop 保持浅色布局，未以静态列表替代界面。

生成器 `scripts/verify-enterprise-collaboration-ui.artifacts.py` 把本任务明确目标逐字节保存为 `MODIFIED_FILE/`；`DIFF_FILE.patch` 包含新增及修改文件；`VERIFICATION.txt` 记录命令和字面结果；`ROLLBACK.sh` 可执行并调用只读预检所有目标的恢复器。

回滚仅接收独立副本路径，拒绝工作树原目录；全部目标修改版 SHA256 与 baseline archive SHA256 预检完成后才执行任何目标写入/删除。新增文件恢复为不存在，已有文件恢复原始字节；后来编辑任一目标退出 73，零写入。源工作树及 MODIFIED_FILE 保持修改版。
