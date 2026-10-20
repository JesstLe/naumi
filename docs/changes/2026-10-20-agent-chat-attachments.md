# 画布 Agent 对话连续添加图片（仅本地修复）

## 问题与定位

用户反馈：已有一张参考图时，无法继续上传第二张。
基线 `6ddfcb6e425d26676ce0e5c444673e37850ed2d5` 的真实 CanvasAssistantPanel 中，“＋”只是展开已有参考图；没有 file input、上传回调或附件追加状态。CanvasClient 请求只收集当前图与上游链。基线真实浏览器点击“＋”后只有参考列表，附件 file input 数为 0。

## 完成的模块

- “＋”打开原生多选文件选择器；支持继续追加、粘贴、拖入。文件选择器每次清空 value，同文件可再次选择。
- 复用现有画布原图上传队列、浏览器预览、就近放置与撤销记录，不重复实现媒体存储。上传到当前项目，但不把当前选择切换为新上传节点。
- 参考列表显示图号，支持逐张移除；上传失败保留既有及同批成功的图片，数量超限有明确反馈。
- UI 与实际请求复用同一参考列表；请求冻结 referencesKey，附件改变不复用旧请求。沿用 Agent 服务端现有 5 图上限，原图与上游也计入，不提高模型能力或通道限制。
- 上传期间阻止提交未完成附件；使用账号、项目、会话与 token 守卫，在异步处理/鉴权/直传准备后重新确认，切项目不把迟到附件带进新对话。
- 服务端 canvas_turn 保存已验证的 contextIds，历史恢复按归属校验恢复顺序；旧会话无该字段时保持原行为。不改写历史任务。
- 已归属作品的对话理解优先读已有、最多 4MiB 的浏览器预览，不在读取时生成缩略图；没有可用预览则沿用 12MiB 原图上界。图片工具仍使用原始素材 URL，不把对话预览替换为生成输入。

## 验收与边界

- 真实本地 Next/CanvasClient + 仅回环模拟 API：已有 1 张追加第 2 张，实际 contextIds=2；多选、移除、部分失败、粘贴、拖入、超 5 张不上传、后续对话、历史恢复、切项目取消延迟上传通过。详见 output/agent-chat-attachments-20261020/browser-modified.json。
- 真实 Agent handler + 独立 PostgreSQL + 本机文字模型 SSE fixture：模型请求包含两张实际图片、冷恢复 referenceIds=2、越权 404、不触发生图通过；大于 12MiB 原图使用已有浏览器预览通过。外部模型/供应商调用 0。
- 独立副本恢复原始源码字节并回测旧“＋只展开、没有上传 input”行为。完整命令、literal output、退出码、hash、构建结果以同目录 VERIFICATION.txt 为准。
- 旧 verify-canvas-agent-execution 的完整收费工具链 fixture 在当前基线上已改走新图像执行链，原 mock 不再覆盖该路径（本机 404）；本轮新验收只复用其真实 Agent/模型/PG 初始化，进行无收费图片理解，不把该旧 fixture 声称为通过。
- 不修改 imagegen/plan.ts、src/lib/imagegen/canvas-client.ts、dispatch、分辨率回退、报价/计费配置、Worker。未合 main、未上线、未 SSH、未使用生产数据或重放用户任务。

## 整合交接

本分支 `codex/agent-chat-attachments-20261020` 以已完成上传分支 6ddfcb6e 为父；保留其浏览器预览和原图保存。canvas-client 只改 Agent 相关状态/发送/历史、uploadRoot 的可选 guarded callback，不修改 Dock JSX 外壳、生成尺寸/参数回退、PDF 的显式连线与布局实现。后续按增量合并，避免整个旧 canvas-client 覆盖别方修改。

本轮完成 1 个功能模块；开工、提交前已 fetch origin main，仍为 038b840bed7dbfea86e230ce6b919918cb43189a；同步计数 1，无自动发布。
