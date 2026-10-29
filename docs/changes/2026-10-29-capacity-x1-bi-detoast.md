# X1：BI / 企业查询窄列筛页与 TOAST 审计

## 固定基线与交接范围

- 本任务分支：`t3/x1-bi-narrow-pagination`，工具准备的独立 worktree `C:/Users/13357/.t3/worktrees/naumi/t3-ec30caab`。
- 起点：`ff59e6f0e06410d820bbb4821728ecd219b18f43`；本轮 `git fetch origin main` 后主线：`7c4591361514309b0af1cef295c0c138e84b47c4`。仅记录，不整合其他分支。
- 原始 `src/lib/bi/repository.ts` SHA-256：`9f7825009109d57bef0d57e4a6b5b152158731318d2a3d9d3dbbf4f10a66cc01`。
- 修改后 SHA-256：`946d5e1c563667da6176ce6f4b153324c4bce81db6135c9195e852a6d6de75aa`。
- 本文为独立交接记录，不修改总台账、不分配 A/D 编号。父线程串行整合；47 HOLD 保持。无 SSH、生产 SQL/DDL、供应商请求、Worker 操作、任务重放、push、main merge 或 PR。

## 模块与职责

- `src/lib/bi/repository.ts` 拥有 BI 查询 SQL、筛选、排序、总数和分页投影；本次修复 `queryEnterpriseOperations` 的分页前大字段/账务展开。
- 公共接口 `queryEnterpriseOperations(q, {client, allowedEmails}, exact?)` 和 `queryBi(q, access?)` 不变。
- 企业模块生成授权成员集合并持有 REPEATABLE READ 事务、企业/成员授权共享锁；BI 只用传入连接读取，不自行开事务、不重算或放宽成员范围。
- `access?.client ?? getPool()` 保留；scoped 路径不调用 `ensureBiSchema()`。`eb1290b7` 的连接复用修复保留。
- 依赖仍为入口/企业授权 → BI repository → 已有 DB 接口。任务写入、计费写入、租约、Worker、媒体持久化均不归本次改动。

## 先复现，再修复

基线真实隔离 PG 复现：企业分页 `size=7`、362 条授权范围内记录，`UNION ALL` 各源投影先执行 JSON 提取和账务相关子查询，之后才外层排序/LIMIT。实际 EXPLAIN 的账务 Aggregate SubPlan 总执行次数为 **362**，不是 7。

修复：

1. 三个源只产生 `source_table / id / email / created_at` 键；授权、email、日期、exact source/id、状态筛选全部在这一步。
2. 使用 `selected AS MATERIALIZED` 在键上按原顺序 `created_at DESC, source_table, id` 分页。
3. 仅用当页 `(source_table,id,email)` 联回源表，投影状态、提示词、积分、账务信息。
4. count 使用同一套未分页键；空页仍有准确 total。exact ID 仍只绕过日期，不绕过来源/邮箱授权。
5. 原管理端已有 `operationKeys → selected → operationPageSource`；删除未执行的旧宽列分支与无分页模板，统一为只能连接 selected 的投影，避免未来误用。

无业务 DDL，无状态语义变更，无行数截断/后置状态筛选。新旧结果逐字段对照，不只检查总数。

## 实测结果与证据层级

隔离容器：`naumi-x1-bi-fixture-ec30caab`，PostgreSQL 16，回环端口 `127.0.0.1:51129`，独立数据库 `naumi_x1_fixture`、测试角色 `x1_fixture`。专属测试只接受显式 `X1_TEST_DATABASE_URL`，不回退到既有 `DATABASE_URL`；进程内覆盖数据库地址后才导入 DB。每次运行独立 schema，结束删除自己的 schema。

样本：243 个 image job、121 个 canvas task、80 个 video task；包含状态差异、嵌套 `result.status`、paidOperations、父子、跨来源同 ID、同时间排序、起止边界、超窗 exact ID。`pg_column_size` 实测 snapshot 最大 **5,243,125 bytes**，canvas parameters 最大 **102,497 bytes**，video parameters **102,419 bytes**。这不是生产表估算，也不是进程 RSS。

最终 modified 运行同库同样本的实际页 SQL EXPLAIN：

| 场景 | 原页 / 新页账务聚合次数 | 原页 / 新页共享块访问次数 | 原页 / 新页执行时间 |
|---|---:|---:|---:|
| 无状态筛选，7 条/页 | 362 / 7 | 9,925 / 876 | 30.461 / 3.046 ms |
| `running`，7 条/页 | 40 / 7 | 6,280 / 5,669 | 19.107 / 16.000 ms |

共享块访问为 EXPLAIN 根节点 `Shared Hit Blocks + Shared Read Blocks`，包含重复访问，不是独立块数、实际读盘字节或瞬时内存。时间为本机单次受控执行计划数据，不是生产 SLA 或容量验收。

修复没有消除状态筛选所必需的 snapshot 读取；`running` 场景剩余工作明确保留。无 optional BI 索引时，实际 overview 状态摘要访问 12,883 次共享块；在同一隔离库建立源码定义的 4 个 optional 索引并 VACUUM ANALYZE 后为 16 次。简单窄列 count 为 6 次，`snapshot->>'status'='done'` count 为 3,592 次。Seq Scan 本身并不证明全行 detoast；应看谓词/投影与实际执行数据。

## 查询与索引审计结论

| 实际路径 | 当前结论 / 本次处理 |
|---|---|
| 企业 `queryEnterpriseOperations` | 已证实分页前 JSON/账务展开，本次修复；大字段读取限于当页，但有状态过滤时仍须在分页前读状态。 |
| 管理端 / legacy history `queryBi(operations)` | 基线已有 MATERIALIZED 窄键分页。非空 raw/creation/review 状态过滤会读候选 snapshot，不能宣称键筛选总是便宜。保持原状态及排序语义。 |
| `operationSummary` / overview | failed/review 子查询匹配源码 partial index 谓词；是否实际用索引取决于索引存在、有效性和计划。原“读路径不读取历史 JSON”注释不成立，已改正。 |
| canvas parameters | 状态为独立列；展示 prompt/quality/resolution 才取 parameters。原企业页的全候选展示提取已修，管理页基线已分页。 |
| video 关联 | 本页源读取 `prompt/model/status/size/error` 等列，不读取 video parameters；大 parameters 的存在不等于这个查询会 detoast 它。视频结果巡检的 resultAssets 查询另见下项。 |
| artwork/models 关联 | 基线已有 selected 分页，再关联 image/canvas/video；仅静态审查并由企业作品真实 PG 回归覆盖，不额外改动。 |
| `MODEL_CALL_EVIDENCE_SQL` | 基于当前页的 ID/email 对才展开 paidOperations，授权路径继续使用同一 client；同池 5 连接测试通过。 |
| anomaly watcher | 当前符号位于 `scripts/ops/admin_anomaly_remote.py`，非 repository 内的 `anomalyWatch`。`fixed_image_pages` 已固定主键并以 100 条取 JSON；选择阶段仍有 snapshot 状态谓词。video parameters.resultAssets 的查询虽有 LIMIT，不能仅凭文本断言所有大字段仅在 LIMIT 后取。未运行远程采集、未更改 watcher。 |
| operationList | 本固定源码无同名 repository 符号；实际管理/历史列表是上述 `queryBi(operations)` 路径，不按旧名推断现状。 |

本固定源码 `src/lib/bi/query-indexes.ts` **只有 4 个 `app_bi_jobs_*` 定义：3 个 partial index + 1 个非 partial 表达式索引**。没有把“7 个部分索引”视为已核验的线上事实。

- `app_bi_jobs_failed_window`：`snapshot->>'status' IN ('error','failed')`；与摘要 failed 谓词匹配。
- `app_bi_jobs_review_window`：根 status/stage/error 的 review 谓词；与摘要 review 匹配。计划也可选择覆盖集合更大的 review_list 索引再过滤，不能只看索引名。
- `app_bi_jobs_status_window`：索引表达式为 `COALESCE(snapshot->>'status','unknown')`；列表实际优先 `snapshot#>>'{result,status}'`，两者不等价。
- `app_bi_jobs_review_list_window`：根 status 的 `review` 加上述 review 谓词；不覆盖通用 `creation:*` CASE，也不应把 result.status 优先语义悄悄换成根状态来命中它。

隔离库 `enable_seqscan=off` 仅用于判定表达式可匹配性，不作为自然计划性能数据：根 COALESCE 的状态等值进入 `Index Cond`；result-first COALESCE 仍留在 heap `Filter`，该索引最多用于 created_at 条件。详细 SQL、binds 和完整 JSON 计划在 `modified.json`。

## 集中验证

工作目录为本 worktree；专属命令先显式设置：

```powershell
$env:X1_TEST_DATABASE_URL='postgresql://x1_fixture:x1_local_fixture@127.0.0.1:51129/naumi_x1_fixture'
node --import tsx --conditions react-server scripts/verify-bi-detoast.ts baseline
node --import tsx --conditions react-server scripts/verify-bi-detoast.ts modified
node --import tsx --conditions react-server scripts/verify-bi-detoast.ts rollback output/capacity-x1-bi-20261029 output/capacity-x1-bi-20261029/BASELINE.repository.ts output/capacity-x1-bi-20261029/rollback-fixture/src/lib/bi/repository.ts
```

- **真实 PG**：三个模式均 `X1_<MODE>=PASS realPostgres=true equivalenceCases=45 supplierCalls=0`、exit 0。baseline PASS 表示缺陷成功复现，不是原版性能合格。rollback 恢复原页 362/40 次账务聚合与 9,925/6,280 次共享块访问。
- 覆盖 45 组：全量逐页遍历、重复时间/跨源同 ID、空页 total、owner/member/outsider、email/keyword/accountType、嵌套状态、creation 状态映射、跨窗 exact ID、count/page 之间另一连接提交删除、原快照保持、新事务总数变化。
- **实际企业授权**：运行 `enterpriseCreationRead`；owner total=361，member=160，跨企业身份被拒；并发撤权 UPDATE 在授权共享锁上以 `55P03` 超时，事务结束后撤权生效，owner total=201、被撤成员及 disabled enterprise 被拒。不是仅手工传 allowedEmails 的模拟。
- **真实 PG 池回归**：`node --import tsx --conditions react-server scripts/verify-bi-scoped-pool.ts modified`，exit 0；`completedWhileAllFiveClientsHeld=true,poolWaiters=0,poolMax=5,checks=7`。
- **真实 PG 企业作品/历史回归**：`scripts/verify-enterprise-artworks.ts`，exit 0；范围、分页、回收、CSV、媒体、双管理员、撤权全部通过，provider calls=0。
- **fixture，不冒充 PG**：`node --test scripts/test-admin-anomaly-benchmark.cjs`：15/15，包含父子一个逻辑事件、异 owner 子任务隔离；`python -B -m unittest discover -s scripts/ops -p test_admin_anomaly_watch.py`：14/14。未执行实际采集器。
- **静态**：`node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0；`git diff --check` exit 0。
- **未通过项如实保留**：既有 `verify-enterprise-integration.ts:78` 在专用部署的跨企业路由断言得到 `401 !== 404`，exit 1；修改版与恢复原 repository 的完整源码验证副本均复现相同失败。该脚本之前的实际企业任务列表/积分/范围断言已运行通过，但整套不记 PASS。本次不改平台鉴权或测试预期。
- 初次依赖链接发现共享旧依赖为 React 18.3.1，`react-server` 抛 `This entry point is not yet supported outside of experimental channels`；保留失败日志。随后本 worktree 使用已有 React 19.3.0 依赖目录的只读用途 junction，未写共享 checkout 或它的 node_modules。

## 四产物与副本回滚

证据根：`C:/Users/13357/.t3/worktrees/naumi/t3-ec30caab/output/capacity-x1-bi-20261029/`（ignored）。

- `MODIFIED_FILE.ts`：已修改的生产 repository 精确副本；配套 `MANIFEST.json` 列出三份任务文件及 hash，新增测试/文档也保留在 `task-files/`。
- `DIFF_FILE.patch`：本任务源码、测试、文档的完整差异。
- `VERIFICATION.txt`：BASELINE / MODIFIED / ROLLBACK 的确切命令、输入、全部字面输出、退出码和恢复状态；另含失败及回归记录。
- `ROLLBACK.sh`：可执行，仅能恢复此证据根下带专属 marker 的 `rollback-fixture/src/lib/bi/repository.ts`；固定路径及原/新 hash guard，不作用于 Git 工作树、共享目录或生产。测试/文档是新增审计材料，不属于程序回滚目标。

实际回滚后原 hash 恢复；再次执行因为目标不再是修改后 hash，输出 `ROLLBACK_GUARD=HASH_MISMATCH`、exit 43，目标不改。工作树与 MODIFIED_FILE 保留修改后 hash。每个产物已重开读取并校验。

## A/D 入账建议与未完成项

- 建议在既有 **A25 / D1** 下追加“企业操作分页前投影”子项：本地已证实、已修、真实隔离 PG 通过、待父线程整合、未部署。不要关闭整个 A25/D1，更不要把样本执行次数推算为线上瞬时 1.8 GB 内存。
- 总账校正：管理列表已有窄列分页；源码索引数量为 4（3 partial + 1 expression）；Seq Scan、表尺寸/行数不等于全行 detoast/RSS；原 operationSummary 注释已校正。
- **剩余前置**：result-first 状态 / normalized creation / review 筛选需要匹配表达式索引或事务维护的窄状态投影；先由任务状态模块明确 result/root 优先级、兼容/回填/切换协议，再单独评估 DDL 与写放大。不能把状态过滤移到分页后或偷偷截断匹配集。
- anomaly 选择阶段和企业 analytics 摘要仍可能大量读状态；父子逻辑计数由现有 analyzer 拥有，BI 操作列表保持原物理行合同，不在本切片改变总数口径。
- X5 的 snapshot 图字节迁出仍是减少实际 detoast 成本的独立工作，不因本修复而完成；未改 X2/X3 文件或提出跨模块隐式写入。
- `created_at` 在线索引、45 笔 surgery、生产峰值/故障注入均未执行。生产实际索引、版本、内存与查询行为本轮未采集。后续由父线程依据 HOLD 和统一发布决定处理。

交付状态：本任务仅独立提交，固定 SHA 见父线程交付消息及 ignored `VERIFICATION.txt`；没有推送、合并或发布。
