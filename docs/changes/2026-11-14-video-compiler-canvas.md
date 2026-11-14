# 视频编译器：真实画布历史结果与下游验收

## 模块与职责

可信输入解析器拥有前序节点状态和所选资产身份的解析；画布负责选择、连线、草稿与交互，不读取供应商能力作额外否决。本切片基线 main `91d8851e942b94f2db9d13c6de3dfc5969b2514d`，沿用独立工作树，不修改共享 checkout 的25条未提交路径。

## 公共接口、依赖与归属

- `prepareVideoExecutionInputs` / `prepareDeferredVideoInputs` 保持接口不变；解析器通过既有任务仓库读取当前任务状态，不增加数据库写入、模型规则或另一套编译器。
- 有 `displayResultId`：解析显式选择的已完成历史资产。无显式选择且当前任务未完成：返回 `dependency / DEPENDENCY_PENDING`，禁止把旧 `lastResultId` 冒充当前任务输出。
- 已完成结果仍由资产模块验证归属、hash、真实类型/字节和必要解码；执行、报价、扣款、租约和 UNKNOWN 保持原 owner 与事务。
- 实际浏览器验收复用进程 harness 的真实 Next、PG、独立应用 Worker 和媒体 Worker。新增 `--canvas-browser` 只启用隔离fixture的第二个公开模型别名和交互驱动，不修改生产配置。

## 已确认缺陷及修复

基线新解析器只取 `displayResultId || lastResultId`，遗漏旧提交路径的当前任务完成检查。真实PG测试中，节点保留旧结果且新任务 queued，预期 `DEPENDENCY_PENDING`、实际 `OK`，exit 1。修复恢复该不变量，不将任何能力描述/verified门禁加回。

五类当前状态 queued、processing、needs_attention、failed、cancelled 分别覆盖隐式旧结果拒绝和显式历史结果正控；当前completed正控继续通过。基线原有“任务行暂不存在但显式历史已选”场景不改变。

### 真实浏览器发现的第二个缺陷

工作台历史发送到项目后，节点lastTaskId关联原完成任务，但原任务冻结projectKey仍为null。项目任务列表仅按parameters.projectKey筛选，因此缺少该任务。Canvas把“列表缺任务”标为generationBlocked，Dock永久“等待核查”。真实Next/ReactFlow截屏及第一次运行失败日志已保留；补充PG回归的断言 `sent completed task must resolve in target project without rewriting frozen projectKey` 在修复前exit 1。

修复通过Canvas所属的 `attachedVideoTaskIds(actor,projectKey,nodeId?)` 只读公共接口提供活跃节点的发送关联；视频查询用可信ID补充项目/节点过滤，任务仓库不读取Canvas私有表。账号、source、status、sourceIds、cursor和limit仍统一执行，不使用SQL JOIN扩大行数，不修改历史parameters。已删除节点不再传播发送关联。不放宽未知任务防重放/生成门禁。

## 本次迁移与验证

集中验证：可信输入/目录/Route/UI **75项**，核心编译 **137项**，实际App/PG/媒体/协议/Workflow/Agent/BYOC/冻结恢复 **138项**，完整TypeScript通过。命令及原始结果见证据目录 `VERIFICATION.txt` / `COMMANDS.json`。

从实际源码包解出的独立工作副本，完成 **14项独立进程检查 + 4项真实工作台检查 + 10项真实Canvas检查**，HTTP/component mocks=0、pageerror=0。最终运行：`copy-runtime/run-8c912f38-f7ab-4d09-b309-b1f7f1deb67b`，exit0。10项Canvas检查覆盖：

1. 历史发送至画布、原生节点和原4K/素材角色恢复。
2. 真实模型切换、保存、整页重载，保留提示词/参数/输入角色和顺序。
3. 当前任务queued时，实际Next预览返回DEPENDENCY_PENDING，不把旧结果当新结果。
4. 实际Dock提交，独立Worker完成后仍是原生Dock、原参数/提示词。
5. 真实历史选片覆盖较新的lastResult，记录稳定资产身份。
6. 实际ReactFlow端口拖线，原子保存source_video，不重写目标config。
7. 下游冻结计划消费明确选中的旧资产；Worker落片、父资产与单账本一致。
8. 真实锁定/解锁及重载后保留输入与草稿。
9. 真实两节点多选和右键菜单，配置/顺序不变。
10. 390px保留Dock、提示词和屏内生成按钮（不冒充此时另一次付费提交）。

最终总账务5笔75个fixture积分（7+17+17+17+17）；供应商fixture POST6，其中1个未知受理不重发，成片下载5。Canvas增量2个POST、2笔消耗共34。5个自有子进程均有退出回执，两个浏览器context及browser均关闭，随机schema已删除。

早期日志保留：第1次实际产品“等待核查”缺陷；驱动在等待生成按钮前建立未处理响应promise引发退出，已修成Promise.all并核对原回执后备份/删除其独立fixture schema；播放器阻止pointer冒泡，驱动改为点击真实节点标题做多选；新副本首次Next dev并行懒编译超过产品普通请求期限，驱动改为顺序访问14个真实handler预热，没有放宽产品超时或替换响应。旧history-assets独立脚本因未配置专用fixture Router在初始化前Invalid URL；原基线与修改后相同exit1，未计入通过项。

## 证据与剩余项

本切片证据：`E:/Workspace/naumi/output/video-compiler-canvas-20261114`。失败日志保留。源码包、patch、验证说明、可执行回滚脚本按9个任务路径封装，原hash保存在MANIFEST。独立副本执行回滚后重跑原61项测试，并以新回归规格确认两项旧行为恢复；不在开发源码或生产上回退。最终回滚回执以VERIFICATION为准。

全目标仍ACTIVE。A06上传/提及等价、全入口独立进程工作流、env-only配置实际清单、固定生产构建、Linux混合Web/Worker与蓝绿兼容仍继续推进。真实付费上游0，生产配置修改0，部署0，47 HOLD保留。
