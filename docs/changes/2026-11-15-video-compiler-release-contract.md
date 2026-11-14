# 视频固定程序格式契约与回滚检查

## 模块与职责

- `video/runtime-formats.ts` 声明**软件读取格式**，不是模型能力、供应商支持证据或新的执行许可。
- `execution-contract.ts` 的计划结构读取器直接使用该格式源，支持 plan 1/2/3/4/5；现有任务 v2/v3、unversioned 和工作流 execution 0/1 的语义不变。
- 应用 Worker 导出相同描述，`build-application-worker.mjs` 将其写入固定 bundle manifest；包检查核对描述与实际 bundle export 一致，原依赖闭包检查继续。
- 原 `release47_video_profile_guard.py` 继续拥有只读回滚评估。没有第二个发布控制器，没有 model/verified/modes/limits 检查。

## 缺陷与改动

基线 `4f4e302dfc37d2cae76cb7dd922802eccf0cb8c8` 的检查只识别六个旧 wire profile。新的 v3 冻结编译任务或 execution_version=1 的加密工作流不在其格式检查内；未知新 profile 的 needs_attention 任务仍得到 safe=true。精确反例、输出及退出状态见四产物证据。

本次在同一个 repeatable-read/read-only 事务中，增加所有任务历史与工作流的分组格式统计：

- 完成的 v3 任务仍保护历史读取、复用和显式重试，不只观察待执行队列。
- execution_version=1 的工作流即使尚未产生子任务/阶段记录，也保护原加密阶段格式。
- 任务版本、planVersion、加密计划是否存在、digest 是否具有正确格式是非敏感标记；不返回 ciphertext、提示词、URLs，不解密冻结内容。
- 旧 schema 经系统目录确认没有 execution_version 时读取为历史 0；不做 ALTER/回填。工作流查询只读取该列，不把整行 TOAST 内容序列化。
- 缺失/畸形/未知格式、摘要不完整、统计截断和坏类型不会降级成旧任务。已确认的 unversioned/v2 仍沿用原兼容路径。

实际回滚在原“检查前”和“排空后启动旧 Worker 前”两处，绑定同一个 prior Web 的不可变 image。元数据检查进程只从固定镜像读 bundle/manifest 并核对 SHA、实际 export；network=none、read-only、没有运行凭据/挂载，不启动 Web、Worker factory 或 scanner。旧容器可写层/配置布尔值不能提供新格式读取权。排空后发现不兼容仍由原 journal 恢复当前兼容执行器；账务/任务/媒体不回退、不重发。

**格式契约不是完整回滚认证。** 原六协议屏障、任务/租约 UNKNOWN、资源、网关、旧资源、Worker 模式与控制身份等检查继续有效。历史 d4/f075 镜像即使曾在本地证明可读取 v3，也没有这份固定包契约；工具不会凭日期、名称或一次 smoke 自动授予它完整回滚资格。没有改写这些旧包。

## 公共接口、依赖与数据归属

- `videoRuntimeFormats` 是无 I/O 叶子值；视频编译契约与 Worker 单向依赖它。
- `assess_formats(summary, runtime_formats)` 是纯评估；`read_runtime_formats(tx, prior)` 读取固定程序；`check_live(tx, config, prior)` 编排观察，沿用调用者整事务部署锁。
- `app_video_tasks`/工作流仍由原视频模块写入；守卫不写任何业务数据。发布操作/journal/恢复仍归原 release owner。
- 新旧版本相容不等于供应商调用成功；没有资料/能力字段取得新的执行否决权。

## 集中验证与证据层级

证据根：`E:/Workspace/naumi/output/video-compiler-release-contract-20261115`。

- 原六协议/冻结版本/排空后重检及恢复：23 tests。
- 新格式/未来版本/畸形/截断/固定包身份：15 tests。
- 实际编译→读回 plan 1–5，及发布 profile/旧提交版本：25 checks。
- 真实隔离 PostgreSQL + 实际旧固定镜像 + 当前 Worker 包：17 checks；7 个任务格式样本、未产生子任务的新工作流、UNKNOWN/全历史原像保持、旧列缺失及实际篡改反控；随机 schema 和临时 metadata 容器清理。
- 核心编译137、恢复分类26、Worker25、原回滚8、恢复2、direct handoff4、normal policy37、完整 tsc、runner468 通过。
- 当前 bundle 在实际 Linux 依赖闭包中读取/核对通过。`naumi:video-format-proof-20261115` **只覆盖 Worker bundle 的证明层镜像**，底层 Web 仍为既有 f075，不是重新构建的整站候选，不发布。
- 完整逐字命令/输入/输出/exit、独立源码副本回退与哈希以及最终主线集成见 `VERIFICATION.txt` / `INTEGRATION.json`。初次 Dockerfile 直接使用 image ID 被当作仓库名、初次篡改夹具移出依赖目录导致 module resolution 失败，原失败日志保留；修正夹具后分别验证，不冒充产品故障。

## 未完成项与下一步

本片补齐 A19 的一个实际程序格式兼容缺口，不关闭 A19/全部目标：

1. 新固定整站生产构建；真实 Nginx 切换/旧资源和完整回滚候选仍需验收。
2. 现行发布 Worker 创建工具的历史 HTTP tick 模式与新 direct 模式需要单独迁移/验证，不能因格式描述就视为一致。
3. 启用绑定、env-only 路线、结构化输入/高级操作、真实付费上游和目标站蓝绿仍保持各自证据边界。

47 HOLD 保持；本片站点访问/生产写入/配置迁移/部署/付费调用均为 0。总目标 ACTIVE。
