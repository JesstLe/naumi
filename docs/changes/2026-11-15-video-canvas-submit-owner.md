# 画布新视频提交的单一输入所有者

## 模块与职责

基线 main `4ed0bb211d4643edc7891bc865410405817bef9c`。本片收口 RFC P1/P3 的 Canvas 提交入口；不更改 Profile、媒体验证、计费或历史任务规则。

`node-submission` 只负责原操作回执、节点归属/修订、项目上下文及将原草稿传给视频应用用例。托管任务的展开、文字读取、媒体身份和编译由原 `createVideoGeneration` / Resolver 拥有；BYOC 使用其既有编译入口。

## 发现与实现

此前只有当前执行上下文含新版 Binding 时才直接传递原草稿。缺 Binding 时仍进入旧 graph expansion、authorizeNodeInputs、owned text、历史工作流和引用转换，最后才由新提交层拒绝为 `VIDEO_EXECUTION_NOT_CONFIGURED`。这不是旧编译器获准创建新任务，但保留了重复输入编排及可能遮蔽映射诊断的错误顺序。

删除该新任务回退分支及其七项运行依赖。Canvas 不再按是否存在 Binding 选择另一套输入语义。旧操作回执先于当前配置/节点读取，项目与节点 revision 校验、BYOC 分流、确认金额、完整参数/素材角色/顺序保持。历史 `workflowTaskId` 不由入口重解释，而由已有应用用例统一核验。

已受理历史 Workflow 不通过此新 Canvas 入口恢复。`runOwnedLegacyWorkflowStage` 的真实归属、加密快照、execution_version=0 检查及旧 v2 受理/查询/资产/账务规则未修改。

## 验证命令与证据层级

- `node scripts/verify-video-canvas-submit-owner.cjs --baseline`：实际基线入口、隔离 I/O ports，输出 `CANVAS_SUBMIT_OWNER_BASELINE=OLD_INPUT_PATH_REACHED LEGACY_CALLS=1 SHARED_CREATE_CALLS=0`，exit0。
- `node scripts/verify-video-canvas-submit-owner.cjs`：实际修改入口，集中覆盖缺 Binding、结构素材、原草稿、参数/角色/顺序、BYOC、原回执、跨工作空间和 revision/project 错误。I/O ports 隔离测试不冒充真实数据库。
- 原 `verify-video-compiled-task.ts --server-exit` 增加真实已保存节点在通道失去 Binding 后的提交；V8 正控/归零证明是否调用旧 `resolveCanvasNodeInputs`，五类任务/账务表及供应商 POST 无增量。基线 59 项 exit0，其中 V8 hits=4；V8 包含导出 accessor 和异步续点，hits 不是业务调用次数。
- 修改版集中组合继续覆盖实际 PG/本地 HTTP/独立媒体 Worker、Canvas 预览/下游、Agent/BYOC/结构/Workflow、原冻结历史恢复；完整数量、命令、输入、逐字输出和副本回退见 `E:/Workspace/naumi/output/video-canvas-submit-owner-20261115/VERIFICATION.txt`。

首轮 V8 驱动错误地把 accessor/异步续点之和当成一次函数入口，基线失败日志保留；改为限定真实源文件的正执行/零可达断言，不删业务断言，不改产品迎合计数。

## 未完成与下一步

本片是当前源码的职责清理与局部实际应用验收，不将历史固定包写成包含本片。实际启用绑定/env-only 清单与迁移、授权上游、目标站网关/Agent/Worker归属及蓝绿仍开放；总体 ACTIVE。47 HOLD、103实验线隔离、共享 checkout 保持；生产配置写入/付费/部署0。

## 最终本地结果

源与独立六路径解包副本各通过152项实际App函数/隔离PG/本地HTTP/独立媒体Worker/原生FFmpeg组合；各30创建/24查询/26下载，随机schema/pools/媒体Worker清理。server-exit21项包含原v2冻结与真正旧未冻结Workflow恢复、配置变更后原回执、单账本、缺快照新run拒绝；缺Binding的实际saved Canvas入口旧展开V8 hits由基线4变0，五表/供应商增量0。基线59项保持原行为。

实际入口ports13、核心137、原Canvas提交/冻结来源16入口、UI9根运行图及旧升级器退出检查、完整tsc通过；source-bound runner33cases471checks通过。旧verify-video-domain.mjs在修改版与原main独立副本均失败于capabilities.ts missing getVideoModelCapability：脚本仍要求已退役的能力执法函数，作为既存失败保留，不为它恢复产品旧门禁，也不称全量零失败。

副本实际可执行ROLLBACK恢复6个原哈希或原不存在状态，原入口再次重现旧展开，core137通过；最后仅刷新文档后再次逐字回退核验，源码和ZIP仍为修改版。此前固定生产镜像不包含本片，真实新整包/站点验收继续开放。
