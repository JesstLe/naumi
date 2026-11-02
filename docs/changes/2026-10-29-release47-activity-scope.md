# 47 发布观察源范围与快照预算契约

## 模块与职责

`release47_task_snapshot.py` 负责单个有界只读 REPEATABLE READ 事务内的原生主键分页、业务图闭包及保留性证明。`release47_site_single.current_activity_collector` 只选择当前新旧实例的发布观察范围；被排除的其他实例未完成观察及会话归属继续由既有 `HistoricalEvidence` 精确摘要保护。本模块不执行发布、任务恢复、供应商提交或数据库恢复。

## 调研与真实缺口

父线程在本轮 47 发布准备阶段的只读采集，正确于约 60.1 秒返回 `TASK_SNAPSHOT_READ_UNAVAILABLE`，没有伪造完整证明。现有 current-pair 包装只限制闭包 seed，`scan_count` 与 `page_keys` 仍先扫描全部观察记录。

父线程现场观测为约百万条发布观察；当前实例范围自身约 118169 条，其中未完成仅 2 条，其他实例未完成 6034 条。另有约 46397 条 tick 回执。以上为该采样时刻的现场数字，不是后台排空证明，也不是生产容量结论。

源码核查确认 `app_release_activities` 与 `app_worker_tick_receipts` 的 `graph_links()` 都为空数组，业务图不存在进入这些观察叶节点的反向边。未被 previous-ID 跟踪的终态观察既不是 seed，也不可能由业务关联闭包选中。因此，在生成其图元数据之前排除这些记录不会缩减原有业务保护集合。

## 本次实现与公共契约

- 模块内 `ACTIVITY_INSTANCE_SCOPE` 默认为空，普通采集保持原范围。专用 caller 只接受两个不同的、符合既有正则的 47 Web 实例名，并设置当前模块副本的 tuple；没有新增任意表或任意 SQL 过滤入口。
- 开启此专用范围时，activity 的原生源条件为：`(当前两个实例 AND COALESCE(state,'') <> 'finished') OR id 属于 previous 原 ID`。
- tick 的原生源条件为：`COALESCE(phase,'') <> 'completed' OR tick_id 属于 previous 原 ID`。未知/非终态 tick 保留所有实例，不按 current pair 截断。
- `scan_count`、首个 `page_keys`、后续 keyset 页共用同一源条件；PK 不转字符串、不用 OFFSET、不先 JSON 投影整表，也不建立临时表/视图。
- previous 原 ID 优先，记录完成或 activity 换实例后仍读取原行。scoped activity 的 `instance_id` 进入单行冻结摘要；迁移原观察归属会被拒绝，不因源范围变化悄悄丢失原 ID。
- PK 与 source predicate 所需字段均由 catalog 验证；缺失 PK、`instance_id/state/phase` 的范围字段时 fail closed。原 UNKNOWN 消解拒绝、账务/供应商绑定、父子闭包、全局 ledger 原叶摘要保持。
- 业务任务、账务、ledger、supplier 和其他关联表的源范围没有缩减。历史 guard 原代码保持，不将旧 UNKNOWN 改为 finished。

## 有界预算参数

所有 `DEFAULT_BUDGET` 值不变。新增 `MAX_BUDGET`，仅允许调用方基于实测明确设置：

- `page_rows` 最大 1024（默认 128）；
- `graph_bytes` 最大 32 MiB（默认 8 MiB）。

其他上限仍为旧默认，包括总时限 60 秒、scan_rows 100000、selected_rows 20000、proof_bytes 8 MiB、page_bytes 1 MiB、pages 2048、roots 40000。输出 `MAX_BYTES=16 MiB` 不变。graph 元数据保留在 PG 事务内 GUC，未整体通过连接搬回。

父线程已观测 image_jobs 图元数据约 4.79 MB、billing 约 1.59 MB、仅前 3840 个 supplier 已约 1.1 MB，完整普通业务图会超过原 8 MiB 硬上限。此次将默认值与显式最大值分开，不增加业务并发、池大小或付费执行次数，不放宽总时限来掩盖慢查询。每页实际字节及总图/证明字节仍独立检查，较大页数不授权突破原 page_bytes。

`scan_rows` 是进入图采集的逻辑源行预算，不是 PostgreSQL 物理 page/heap 访问量。谓词前推不保证现有线上索引适配或 O(1)；查询仍受单句/事务总时限保护。

## 集中验证与证据层级

证据目录：`output/capacity-audit-wave2-20261029/release47-activity-scope/`。原两个源码文件及 SHA256 清单保留，父线程统一提交和归档，不提交运行产物。

命令：

```powershell
python -u -X utf8 scripts/ops/test_release47_activity_scope.py --output output/capacity-audit-wave2-20261029/release47-activity-scope/real-pg --baseline-module output/capacity-audit-wave2-20261029/release47-activity-scope/release47_task_snapshot.original.py
python -u -X utf8 -m unittest discover -s scripts/ops -p test_release47_task_snapshot.py -v
python -u -X utf8 scripts/ops/verify_release47_snapshot_pagination.py --phase SCOPED_REGRESSION --output output/capacity-audit-wave2-20261029/release47-activity-scope/regression37
```

- 新增独占 PostgreSQL 16 现场：120001 条其他实例观察、120001 条当前实例终态观察、260 条当前实例混合观察、100001 条完成 tick，以及其他实例 running/unknown tick；旧模块在相同 fixture 和默认 scan 预算下保持 incomplete。
- 修改版新增矩阵 **27/27、exit 0**，字面终行：`ACTIVITY_SCOPE passed=27 failed=0 realPostgres=true productionActions=0`。
- 包括原 ID 完成/删除/换实例、未知 tick 消解拒绝、其他实例 unknown tick 保留、缺 PK/缺列、小预算拒绝、业务图保留；真实 EXPLAIN 确认 `page_keys` 与 `page` 均 32 行，范围条件在原生 key 页内。
- 既有 Python 单元 **22 项（21 通过、1 旧隔离库 skip），exit 0**。
- 既有专属分页矩阵结果在下方追加，未把运行中状态写作通过。
- fixture 使用目标 DB 实际 TCP `SELECT 1` 判断就绪；自有容器按完整 ID 清理，子进程退出，所有 SQL/stdout/stderr/exit 在各目录 `RESULT.json` 索引中。没有生产连接或供应商调用。

## 未完成项与下一步

父线程将本修复普通整合后，在已持锁的发布事务中重新采集原前证据，并按实际结果决定是否切换。新 fixture 通过不代表真实 47 完整任务保留已通过，更不代表整站容量通过。本轮调用方的显式预算、实际采集时长、保留证明与最终发布状态由父发布记录绑定。


### 父线程接续核验
独立实现线程在最终传输回复时断连；父从真实文件接续，没有把断连写成测试失败或无产物。父重开两个 RESULT.json、逐命令索引与日志：新增27/27，既有 `SCOPED_REGRESSION passed=37 failed=0 realPostgres=true productionActions=0`，cleanupErrors均为空；22项单元中21通过/1skip。两个fixture完整ID `64d23b87e4b39f20de31b89a8e148119c9d9ee7718b0c179b75d621c1c6d187f`、`bd5ead7d2ec2835dd5ff5f7121c3e3ff421d000f7f1144abf1cdee2378cd21bf` 经父docker inspect均exit1、对象已不存在。父只读复核源diff，业务表仍全范围，previous原ID优先且instance冻结；没有复跑后再冒计一套27/37。
