# 47 卡顿：已发布模型读取重复校验

## 模块与职责

基线 `41acebb497d36dc7283ac2c618e8d237eb4bff70`，独立分支
`codex/47-api-latency-20261125`。共享 checkout 的 27 条未提交内容不改动。
本切片只处理普通已发布模型读取的同步 CPU 放大，不调整生成并发、图片质量、媒体字节、权限、价格、账务或任务恢复。

## 现场与根因证据

2026-11-25 11:04—11:08 CST，真实 nginx 日志显示普通动态 API p95 约
3—5 秒，媒体 p95 13.779 秒。11:18 复查主机仍有约 10 GiB 可用内存，
无 Swap 使用或 OOM；旧 Web 的 8 秒线程采样显示主线程 CPU 3.84 秒，
四个 V8 Worker 合计约 1.04 秒。低频 perf 样本出现 GC、对象属性访问和 SHA256，
但没有 JIT 符号，不能把该样本解释为函数级生产归因。

实际公网仍为 `7aece11f282d743542e3c468374a7780954158c7` / `1795151944`。
中央渲染候选 `6541cf69` 的发布专属状态为
`READY_WITH_NATURAL_TASK_DRAIN_PENDING`；不通过根历史 CLEANUP_PENDING 推断新发布失败，
也不接管发布、抢锁或停止旧任务。两者负载不同，不拿空闲新 Web 作性能对照。

已复现的代码缺陷：`createPublishedModelReader.current()` 每次 SELECT 整份配置后，
都调用 `decodeModelSnapshot → validateModelConfig → validateBusinessConfig`。
后者编译所有功能模型的质量×分辨率×比例组合，且产生大量短命副本。
当前发布配置有 99 个上游、52 个公开模型，21 个功能分别重复声明参数组合。
脱敏发布元数据副本在本机 100 轮非 profile 基准中，单次全校验及摘要平均
41.656ms；本地 CPU profile 将热点定位到 `compileImageParameterPlan`、
`structuredClone` 和 Zod。它是已证实的卡顿贡献因素，不声称解释全部媒体长尾。

## 公共接口、依赖、状态归属

- `createPublishedModelReader({pool,...validationOptions}).current()/byVersion()` 接口不变。
- 每次 current 仍查 DB 当前指针、digest 和 PostgreSQL 行版本 xmin；没有 TTL，没有跨请求缓存 current、账号、权限或目录响应。
- 普通读取复用该 reader 已有的最多 64 个不可变版本缓存。首次仍完整校验及核对摘要；同版本并发共享加载；各调用拿独立深拷贝。
- active pointer 发布、恢复、丢失或 DB 错误下一次请求立即可见；行版本变化时完整重读校验，原地破坏配置但不改 digest 也会拒绝，不因缓存隐藏存储损坏。不对 xmin 排序或做事务 ID 算术。
- `readPublishedModelSnapshot(tx, options)` 的事务内读取完全不变，不借其他连接，不把未提交配置放入进程缓存。
- 旧版本执行、管理员 CAS 发布、配置校验、凭据与定价规则保持原 owner。
- 修复原 byVersion 缓存旧失败回调在 LRU 驱逐后误删同版本新 Promise 的竞争；只删除自己的缓存项。

## 实现与验收台账

1. 修改前集中基线：新缺陷回归默认模式 exit1（40 次读取、40 次完整配置）；
   `--baseline` exit0 记录复现，不将它冒充修后通过。
2. 既有参数合同 35 检查、模型启动/真实 PG 10 组 99 检查在修改前通过。
3. 新回归覆盖并发、指针切换/回退/丢失、DB 故障、坏摘要、失败重试、LRU、
   原失败与新 Promise 竞争、调用方变异、reader/信任范围隔离。
4. 新真实 PG 覆盖原 repository stage/markApplied、当前指针立即可见、旧冻结版本、
   REPEATABLE READ 事务快照、未提交版本回滚不污染缓存和定价等价。
5. 测试登记复用 `scripts/verification/refactor-cases.mjs`。最终运行结果、SHA、
   原命令/退出码及副本回滚写入 ignored evidence 的 `VERIFICATION.txt`，完成后补录。

## 未完成项与下一步

生产全链路延迟下降尚未验收。本次不改 UI，浏览器与视觉回归不适用；
没有生产收费调用，没有生产配置、路由、容器或数据库写入。
47 暂缓发布及正在进行的候选排空门禁继续保持。媒体/NAS长尾、长期进程内存和
真实负载的整站收益保留独立核验，不能由本机 benchmark 代替。

## 集中验收完成（本地切片）

- 最终回归默认模式 17 cases / 340 checks；100 并发同版本只加载一次，40 次读取完整配置 40→1，指针仍为40。
- 同一脱敏发布元数据在最终读取路径热读100轮平均1.282ms；旧完整decode基准41.656ms。两者为本机特定路径测量，非生产请求耗时或容量承诺。
- 真实PG新增17检查；既有启动/只读/在途保全10组99检查、管理员连续发布36检查、参数合同35检查、参数计划25检查、完整模型管理回归均exit0。
- 全仓 `tsc --noEmit --pretty false` stdout为空，exit0。
- 独立审查最终xmin版本 PASS；审查者独立重跑默认17/340和真实PG17，未发现支持发布路径的阻断。
- 用户已明确仅对本次卡顿修复授权47发布。正在与原中央候选负责人协调；此授权不解除另一发布的UNKNOWN或旧任务排空门禁。
- 当前仍为已测代码、待整合/固定Linux镜像/生产门禁阶段，不写作上线完成。
