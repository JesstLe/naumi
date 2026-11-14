# KIE / APIMart 视频协议编译迁移

## 模块与职责

本切片基线 `cb39c7e5407d4c009e4aeaa753a174adacced045`，独立分支 `codex/video-compiler-kie-apimart-20261114`。总目标仍为 RFC 的 P0–P4；本模块不是全量完成或站点已上线。

- `profiles/job-layouts.ts`：KIE 8 个、APIMart 5 个实际请求布局，普通参考、明确首尾帧、音视频组合、运动控制，以及支持分支的分镜/元素。只做纯编译，不读取目录能力、型号名单、数据库、网络或 React。
- `profiles/job-structure.ts`：集中维护真实结构化字段映射、可表达意图和 UI 结构投影；UI 不再独立发明一份结构能力表。
- `profiles/native-profile.ts`：发布绑定解析、参数映射、共享入口分派、真实素材限制，以及明确的 wire / direct 查询解码配对。
- `draft-facts.ts`：仅解析 Profile 显式声明的源视频时长依赖，不放宽工作流其他冻结事实的一致性。

## 公共接口、依赖方向与状态归属

现有 Canvas / Workbench / Workflow / Agent → 统一 preview / submission → 可信素材解析 → native Profile → 原任务与计费事务 → 请求物化 → 原供应商执行/查询 → 原资产与账务。

本切片没有新表，没有拆事务。发布绑定拥有执行配方、参数映射及显式 mode 映射；供应商 protocol codec 仅在旧任务兼容及验证对照中继续构造旧请求，新编译器不调用它们。direct 的新版 createCompiled 复用 KIE / APIMart 已有创建回执解码器，旧 create / poll / content 行为不改。

## 实现与迁移状态

1. 迁移全部 13 个 job 布局；同一布局同时验证有 videoProfile 的 wire 路径和无 profile 的 direct 路径。不是以一个通用 JSON 成功冒充全部分支已实现。
2. Kling 的分辨率 → mode 必须在发布配方 `modes` 中明确配置；不按型号或 `1080p` 猜 `std/pro`。保留请求值 `4K`、有效值 `1080p`、实际 wire 字段的不同身份，显式 seed=0 / audio=false / watermark=false 不丢失。
3. 分镜/元素走公共结构化映射和完整素材消费核对；普通两图不转为首尾帧；智能分镜与显式镜头冲突直接报告，不静默覆盖；协议真实数量、类型和五/十秒限制保留。
4. 结构化 native 计划使用 `schemaVersion=5`，普通 native 仍为 4；既有 1/2/3/4 计划及历史冻结任务不重新解释。计划 5 的 JSON URL 槽通过既有 JSON 物化器刷新同身份地址，媒体字节及版本仍核对。
5. 运动控制和仅来源视频的 Omni 操作显式 omit 请求时长；最终计费事实读取真实源视频时长，而不是用户请求的五秒。Workflow 准备阶段用 `durationFromInputId` 记录真实依赖身份，未知值保持 -1。已有素材在冻结时解析，未来素材在归属/版本核对后解析；只替换这一项已声明事实，其他参数和绑定保持精确比较。
6. `durationFromInputId` 仅存在于参数准备/Workflow 冻结记录，不进入最终编译计划、不作为 HTTP 已编译输入。旧 Workflow 记录没有此字段时保持原精确比较语义。

## 验证命令与证据层级

集中命令与完整 literal 输出、exit、输入、原始哈希、交付副本及回滚记录保存在：

`E:/Workspace/naumi/output/video-compiler-jobs-20261114/VERIFICATION.txt`

- `scripts/verify-video-job-layouts.ts`：所有 13 布局、40 组既有真实 codec 字段对照，单次参数映射、源时长、结构版本、物理限制、待解析来源与首尾帧负控。
- `scripts/verify-video-compiled-task.ts --jobs --nested --families --native --byoc --structured --agent --workflow`：真实隔离 PG / 本地供应商 HTTP / 原媒体 Worker 进程 / ffmpeg 解码 / 任务与作品资产 / 单次账务；含每个新布局的预览与提交同摘要、最新配置不改变已受理任务、失败退款、显式重试、UNKNOWN 不重提、取消与请求体幂等。
- 源时长相关 4 个布局 × wire/direct × 静态/未来源，执行真实 Workflow 冻结 → 调度 → 来源资产绑定 → 最终编译 → 结果与恢复，不用假视频元数据代替真实依赖。
- 完整 TypeScript、已迁移协议纯域、历史供应商、冻结来源、Canvas、媒体、账务及实际 React/Edge 控件集中回归；本地隔离证明与真实付费供应商接受分别记录。

集中结果：纯域 90 项、旧 codec 40 组对照；新 job 链路 402 项（其中包含 16 个实际 Workflow 静态/未来来源场景），全部组合 App 1064 项通过。交付 ZIP 在独立基线副本解包后重新执行 90 项纯域及 462 项 job + Workflow App 验证。完整 TypeScript 与核心 137、嵌套 189、参考 64、原生 32、结构 32、Workflow 30、发布预览 61、Canvas 121、媒体 16、旧冻结 16 个入口、账务 14，以及 React/Edge 20 + 8 + 6 项回归通过。副本完整类型检查与最终原哈希回滚回执以证据文件为准。

### 保留的失败记录

早期 fixture 把元素内部 `inputIds` 传入严格提交 schema 导致拒绝，已修正 driver 构造，不放宽产品校验。一次素材解析失败对应同次媒体 Worker 日志 `worker-state / rename / EPERM`；诊断复跑通过不代表该 Windows 状态存储问题已修复。临时异常输出已从产品代码移除，原日志保留，不记录为模型能力失败。结果阶段原有恢复重试未重发供应商 create。

新增 Workflow driver 首次误把 Workbench `source` 字段传入严格 Workflow schema，被正常拒绝；只修 driver。旧供应商回归在继承隔离库环境且重复固定 `fixture-idem` 时触发 `supplier attempt identity conflict`；该回归定义是无数据库的适配器网络端口 fixture，移除本测试进程的 DATABASE_URL 后实际 48 HTTP / 8 protocol 对照通过，原失败记录不改写。

## 未完成项与下一步

剩余 13 个注册协议的 verified / documented / v2 / v3 / storyboard 分支、其他实际无 profile 执行组合、明确的生产绑定迁移候选与保留人工映射/价格/政策证据、P3 新任务旧门禁/fallback/upgrader 调用退出、RFC A01–A19 的完整 Next / API / 独立应用 Worker / 重启 / 浏览器资产链仍在总目标中。

本批生产绑定写入 0、付费调用 0、部署 0；47 HOLD 及 103 参数映射独立验证线保持。main 整合只代表代码整合，未把 fixture 或本地 App 通过写成站点上线。
