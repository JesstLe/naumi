# VV-03：Agent 接手正式方案、采用版本与粗剪

## 模块与职责

基线：`628c5e93d711e25bd29f0ab975527d7eba86c5e3`。分支：`codex/canvas-video-remaining-20261110`。

本轮承接[剩余 PRD](../prd/2026-11-10-canvas-video-remaining.md)的 VV-03，不重建网页已完成的分镜、连续性、工作流、账务或多轨。原共享 checkout 的改动和 103 独立模型映射线保持。

## 公共接口、依赖方向与状态归属

- `agent/storyboard-tools.ts` 是薄适配：列举、读取、完整保存方案与审片、查询原保存回执、制作预检、创建／更新明确粗剪，共六项具体工具。站内 Agent 和无界面工具注册共用 `createCanvasVideoTools`，功能权限、目录、读写分类和进度名称同步登记。
- 工具只调用正式 HTTP 业务入口，项目上下文显式匹配；`harness-network` 只额外允许 `POST /api/canvas/storyboards/inspect`、`POST /api/canvas/storyboards/roughcut`，没有任意 URL 操作入口。
- 方案完整 JSON schema 从现有 Zod 领域 schema 导出，保留原稿、连续性、剪辑、音轨、候选意见和采用版本。保存直接提交原完整请求，不先重读后重算，避免未知受理重试被最新修订改变。
- 方案仓储增加只读原操作回执，服务验证账号、项目和当前工作空间；`GET /api/canvas/storyboards?projectKey=…&operationId=…` 返回原保存结果，而非当前方案冒充原结果。没有新增数据表或迁移。
- `agent/video-workflow-intent.ts` 统一计费预检与实际执行的输入编译，传递明确 `storyboard: {id, revision}`，不猜同节点所属方案；旧的无方案快捷生成兼容保留。
- `production-schema.ts` 只拥有制作输入契约；服务继续导出旧入口以兼容调用方。方案服务拥有审片与采用的 CAS／事务；工作流拥有冻结、受理与计费；多轨拥有工程与导出。粗剪沿既有持久意图和回执恢复，不假称跨模块一次事务。

## 本次实现与迁移状态

1. Agent 可以读取网页保存的方案，保留完整文档修改意见及明确采用，不将新候选或节点最新结果自动采用。
2. `run_video_workflow` 暴露方案身份与修订。旧实现既不向执行传方案，也不向计费预检传方案；现在同一个函数形成二者意图，避免复用不一致与冻结意图冲突。
3. 预检返回当前粗剪身份／revision；更新必须指向确切多轨，并只换指定镜头素材。创建／更新均不导出、不新增生成和媒体收费；节点 ID 返回现有画布同步路径。
4. 保存和粗剪失败反馈保留原 operation ID 及原完整请求；401／403／503 不被解释成未提交，不自动换操作重做。
5. 规划结果补回正式方案 revision，后续可直接绑定；Agent 制作指引说明代选必须已有授权并记录理由，不再强迫所有已授权选片都返回网页点击。

## 验证命令、结果与证据层级

证据根目录：`E:/Workspace/naumi-task-evidence/canvas-video-remaining-20261110/`。命令、输入、stdout、退出码以 `VERIFICATION.txt` 和原始日志为准。

- `node --conditions=react-server --import tsx scripts/verify-storyboard-agent.ts`：20 项工具适配契约通过；基线同测试明确缺少六项工具且没有 workflow 的 storyboard 字段，exit 1。
- 既有 director 23 项、production 17 项、workflow contract 12 项通过。
- 完整 TypeScript 通过。定向 ESLint 无错误／警告。
- 实际 Next App＋独立 PostgreSQL＋媒体 Worker＋对象存储／账务共34项通过（原19项＋新增15项）。新增场景实际证明：共享节点的方案B明确采用旧版而非最新结果；计费预检与执行冻结一致；全复用零生成零收费；仅03镜新增一个视频任务和一笔账本；生成完成仍保留旧采用版，明确选片后只更新指定粗剪的03镜，其他镜头和独立声音完全保持；原方案不变；保存／粗剪已提交后丢响应、鉴权失效、CAS冲突、操作冲突、跨账号／跨空间与原ID恢复均有实际结果。供应视频是受控测试响应，不是实际商业模型质量验收。
- 初始共享依赖与锁文件不一致；本轮独立安装。npm 下载 Next 包出现 ECONNRESET，使用另一工作树已安装的同版本包补齐，版本与 lockfile integrity 一致，`npm ls --depth=0` 通过。没有修改共享依赖或 package-lock。
- 首轮新增测试的本地预期对象误共享复制方案的 shots 引用，已改深拷贝；另一负控使用不存在账号得到401，改为 fixture 的第二个真实账号；工作流结果按节点身份查询而非数组位置，避免拓扑／节点排序误读。保留首次日志；它们不记为生产缺陷。

## 真实试片与未完成项

- 用户已将环境、素材和费用取舍交由本任务决定；先检查103实际在线版本、22项模型目录和运维测试账户，不扩展到47。
- 当前在线 commit：`268076b7fb4900509817af7321ad34a85698c86c`，不是本轮新实现。已验证主机身份，正式模型目录读取200；不能把有目录等同于真实生成成功。
- 运维操作者实际可用积分为0。没有给测试账户虚增积分，没有借用其他用户余额，也没有直接调用供应商绕开应用计费。此轮真实收费提交为0；VV-01仍待实际试片，不能关闭。
- 初始普通 SSH 连接被关闭；复用项目既有固定主机验证的受保护传输后读目录成功。首次 helper 继承服务专用 NODE_OPTIONS 引起观察器端口冲突，后续仅清空该一次性 helper 的 NODE_OPTIONS，没有改变容器、运行服务环境或观察器。
- VV-02 的完整创作体验／生产验收、VV-03 的真实 Agent 创意行为与外部 CLI/MCP 客户端接手、VV-04／05／06／07／08 仍分别跟踪；当前不把工具接齐等同于全部 PRD 完成。47 暂停发布保持，本轮无部署、无线上模型配置变更。

## 可复用调用顺序

```text
读取 list_video_storyboards，按明确 plan_id 调 get_video_storyboard。
保留 document 全部字段、revision 和已有 adoptedArtworkId。
仅改用户指定镜头，save_video_storyboard 使用固定 operation_id。
inspect_video_storyboard 明确标出本轮新生成与复用采用版。
run_video_workflow 同时传 storyboard.id/revision 和原 operation_id。
新候选完成不自动采用；已有代选授权时记录理由并保存明确采用。
读取确切 timeline 身份与 revision，apply_video_storyboard_roughcut 仅更新指定镜头。
未知时先查询原回执／原制作链，或重发完全相同的原请求，不重建付费任务。
```
