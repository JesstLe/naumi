# A62 发布任务保留闭包的选中集重复扫描

## 模块与职责
`release47_task_snapshot.py::build_sql` 在原有单个有界 READ ONLY REPEATABLE READ 事务中生成图闭包和完整性检查。此次仅优化 missing-child 的集合成员检查，不改变图边、seed、递归固定点、原ID、账务/供应商证明或真实发布状态。

## 调研与复现
父线程已上线 b79c8c39；此修复不会阻塞该版本。父线上观测原生分页完成约8万图节点后，闭包语句触及15s statement timeout；本任务未连接服务器，不把线上原因完全归于未直接取得的执行计划。

本地独占 PostgreSQL 16 的真实 EXPLAIN 表明，原 SQL 将 `chosen` 与整个物化 `source` 关联来判断缺child，规划器为每个历史image重扫chosen。在81981节点的诊断输入中，chosen扫描19115次；递归阶段还存在多轮edges排序。JIT耗时约0.16s，不是本次主要瓶颈。

最终固定合成输入按现场各表数量生成81981个图节点，1500个活动image seed，图JSON 8,342,253 bytes，处于显式24MiB图预算内。原版在原15s单句期限下psql exit3；修改版同输入EXPLAIN执行约4.86s、命令含输入与Docker开销约5.58s，选中集合与独立Python邻接集合BFS逐表逐ID一致。这是本地闭包阶段反例，不是生产完整采集或吞吐结论。

## 实现、公共契约与状态归属
- 将“chosen回连source，再对每条child重复查询nodes”改为两个非相关scalar subquery：一次构造选中image ID集合与全部image ID集合，使用JSONB key membership判断存在性。
- 两个map只包含已经过行/图字节预算的ID，不含snapshot正文、图像结果或凭据。EXPLAIN中chosen各扫描节点的loops均为1，不再出现19115次扫描。
- `x.id IS NULL` 显式保持旧NOT EXISTS的缺失语义；NULL child仍拒绝完整证明。重复ID对存在性判断等价，原选中数组中的重复仍保留，由原后续证明处理。
- 不调整60s事务总期限、15s语句期限、DEFAULT/MAX_BUDGET、行/字节/root限额，不修改隔离级别、PK分页、原观察范围与HistoricalEvidence，不创建临时表或新的服务。
- 同阶诊断还试过直接拼nodes来源、半连接和禁用mergejoin；直接拼nodes触发更昂贵JIT并出现回归，禁用mergejoin改变计划策略，因此均未采用。实际产品补丁仅missing-child的集合检查及解释注释。

## 验证命令与证据层级
证据目录 `output/capacity-audit-wave2-20261029/release-closure-20261030/`。

```powershell
python -u -X utf8 scripts/ops/verify_release47_closure_scale.py --baseline-module output/capacity-audit-wave2-20261029/release-closure-20261030/BASELINE.py --output output/capacity-audit-wave2-20261029/release-closure-20261030/modified --phase MODIFIED
```

新矩阵9组：修改版9通过/0失败；原版与副本恢复8通过/1失败，失败为原15s闭包预算。覆盖独立BFS集合、正反父子、12层供应商闭环、原终态ID、missing/null child、重复ID存在性、root/selected预算。小图场景原版与修改版输出状态/选中数组完全一致。

该专属脚本直接安装有界图GUC并执行真实build_sql生成的closure语句，不冒充完整分页/证明或线上运行。完整原生分页、MVCC、paid绑定、原ledger叶、5000边界等另由既有37矩阵集中验证，未改其断言。

初次复用旧37执行器使用其原768MiB/2CPU默认；原日志保留，随后通过本任务 `--regressions` 入口以512MiB/1CPU重新执行。新闭包fixture、最终回归与副本回滚均固定512MiB/1CPU、随机回环端口、目标库TCP SELECT1就绪，独占label和完整ID，finally停止移除。

## 未完成项与下一步
父线程审查并普通整合本任务明确路径；服务器完整快照尚须按原budget重采。此补丁没有证明原整采剩余约42s分页成本已解决，也不宣称生产全图已通过、UNKNOWN已消解或发布COMPLETE。保持线上CLEANUP_PENDING与其他债务，按真实验收另记。

## 最终集中结果
`CLOSURE_REGRESSION_512 passed=37 failed=0 realPostgres=true productionActions=0`，exit0。旧37断言保持，512MiB/1CPU重跑通过。核心原SHA256 `097d172e000d7ac1e4d85a482ea8113c0458b1a592bbcce8e2f5fdc78cba45f0`，修改SHA256 `8dbf894014ac24ba27470d14ecbb6ed33f949011263c6a45d187095bf44325d3`。四产物为同证据目录 MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh；回滚仅标记的独立副本，全量hash预检，第三文件后续修改拒绝且零写入，活动源码保持修改。
