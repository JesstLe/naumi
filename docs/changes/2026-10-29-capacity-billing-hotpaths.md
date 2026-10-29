# 账务/积分热路径增量审计：FIFO 精确扣减前缀

日期：2026-10-29。原子任务交付状态为独立分支完成；父线程现已完成源码复核、真实隔离 PostgreSQL 与原生回归，纳入本次主线整合，登记 **A38 / D20**。**未部署**；父线程证据及未完成边界见第 7 节，原子任务失败记录继续保留。

## 1. 基线与职责边界

- 工具提供 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-94f72f4f`，分支 `t3/billing-hotpath-audit`；开工工作树干净。
- HEAD 与本轮 fetch 后的 origin/main 均为 `3b6a5279b4364590954751e8f5b5c9d566010806`。
- 已读当前 `AGENTS.md`、`docs/AGENT_COLLABORATION.md`、容量审计第七章末；旧协作记录中的历史站点动作不作为本任务指令。
- 本次业务改动仅 `src/lib/billing/repository.ts::debitTx`、`src/lib/db.ts::deductPrincipalFIFO` 及必要 import。没有修改连接池、任务仓储、Worker、画布、存储 codec、共享父树或总台账。
- 47 运行版本 `e1878018 / 1793247893` 是任务交接信息，本轮没有远程核验或生产操作。45 笔手术与在线索引仍挂账。没有 SSH、付费调用、业务库写入、生产压测、UNKNOWN 清理、main 合并/推送或 PR。

## 2. 源码审计：默认行为、调用与退化条件

### 2.1 `app_credit_batches SUM(remaining)` 不是统一的全表扫描

| 源码入口 | 实际调用/用途 | 查询范围与现状 |
| --- | --- | --- |
| `billing/repository.ts::lockWallet` | `createBillingService` 的 reserve、settle、release、grant、adjust，以及 API 成本补查退款 | 先 `app_users FOR UPDATE`，过期流水，再 owner + `expires_at>now()` + `remaining>0` 求和；余额不缓存 |
| `billing/repository.ts::syncBalanceTx` | finish、grant、adjust，仍在原事务中 | owner 活批次求和，同步 `credits_total` 镜像；不替代本金表 |
| `db.ts::refreshBalance` | `toSessionUser/getUser`、积分概览、兼容结算后刷新等 | 每次先过期 SQL，再 BEGIN、owner lock、SUM 更新镜像、COMMIT；已在锁后读本金，既有正确性机制保留 |
| `db.ts::toSessionUser` login-only 分支 | 登录 sidecar | 单次 owner 活批次 SUM，不跑普通迁移、过期写入 |
| `db.ts::reserveCredits` | 21 处静态调用，主要为工具和画布操作 | 同步 operation 已建立时立即放行，由现代 service 负责预占；legacy 分支另执行过期 SQL、带相关 SUM 的 UPDATE。21 个调用点不等于 21 个实际 SUM |
| `db.ts` legacy video/canvas task reserve | 没有冻结 `billingQuote` 的兼容任务 | 相关 owner SUM；现代分支走 `reserveTaskBillingTx`。本轮未改这些任务入口 |
| `image-job-repository.ts` 两处 legacy reserve | image create/恢复预占 | owner SUM；本轮仅阅读，不修改 |
| `bi/repository.ts` users 列表 | 每个候选用户的 lateral 余额投影 | owner 窄范围求和 |
| `bi/repository.ts::overview` | 管理 BI 概览 | 按 email 分组的全体活批次聚合，外层再接账号筛选；不能把此全局聚合等同于普通用户余额查询 |
| `enterprise/server.ts`、`enterprise/analytics.ts`、`teams/server.ts`、`reference-workbench/service.ts` | 团队/企业/参考工作台余额投影 | owner 范围 SUM；本轮未修改 |

`db.ts::liveBatchBalance` 仅找到声明，没有运行调用方；不计入每次请求预算。静态搜索覆盖 `src` 和 `scripts`，不是生产调用次数统计。

现有 DDL 为 B-tree **`app_credit_batches_live_idx(email, expires_at)`**，不是带 `expired=false` / `remaining>0` 的 partial index，也不是冷热分区。本轮不增加或修改 DDL。

- 正常 owner 少量活批次：余额 SUM 可以限定 owner 和未来到期区间，不扫描其他用户的历史。
- owner 有大量未来已耗尽批次：`remaining>0` 是残余过滤，仍可能读取这些索引命中的行。
- 过期清理：同一 owner 的过去区间反复被访问，`expired=false` 残余过滤已经处理过的历史。它是可重复的原子过期流水，不是物理删除。
- BI 全局概览、历史批次密集 owner、普通 owner 请求是不同负载，不能用旧 GLM 表量证明本轮容量。

### 2.2 请求重复清理与镜像更新：本轮量化，尚未修改

`GET /api/auth/session` 通过 getUser 刷新；`GET /api/credits` 用 `Promise.all` 同时调用 `getCreditOverview` 和 `listUserLedgerFiltered`，两条路径各自跑过期清理。多个生成结果/轮询返回 getUser，也可再次刷新。必要的账务写入不能通过跨请求缓存可变余额跳过。

本轮真实 PG 合成一个 **50,000 个已记录过期批次 + 1 个活批次** 的 owner，并另建 150,000 个其他 owner 的过期批次：

- 连续 5 次 `refreshBalance`：过期 SQL 5 次、SUM 镜像写入 5 次、含事务控制总共 25 条 SQL。原/改/回滚一致。
- 过期 `EXPLAIN ANALYZE`：owner + 过去区间 Bitmap Index Scan 命中 50,000 行，Heap Filter 去掉 50,000 行；没有新过期流水。基线观测 3.373 ms / 710 shared-hit blocks；修改观测 3.424 ms / 709 blocks。
- 对同一 owner 的活余额 SUM：索引范围只返回 1 行，基线 0.084 ms、修改 0.098 ms（含镜像 UPDATE 的执行计划）；不是扫描该 owner 全历史。

**实际因果**：读取余额附带重复过期扫描及镜像行写入，历史密集账号可增加 I/O 和同 owner 钱包锁等待。用户可表现为会话/积分页/完成结果刷新变慢。这是本机确定性工作量证据，不是线上慢请求归因，也不据此新增生产事故编号。本轮保留既有过期恰好一次及锁后镜像语义，调度/游标改造另切片。

### 2.3 reserve/settle 的事务与锁序

- 新 operation：先操作行（INSERT 冲突/`FOR UPDATE`），再 owner 行，再过期/余额与必要批次，最后 ledger、reservation、operation、镜像仍在同一事务提交。
- `settleLocked` 使用已保存的 `row.quote`；UNKNOWN/manual 分支直接保留 hold，不进入扣减。
- 兼容 FIFO 先锁 owner 再扣批次，未把批次锁放回 owner 锁之前。legacy 调用方仍持自己的事务。
- 同步工具 `synchronousCost` 在供应商执行前完成 reserve 事务，`settleSynchronous` 在结果后另开/复用调用方事务；本次测试服务事务内没有供应商 I/O。任务包装器复用调用方 Tx；不能把服务用例耗时当整条任务耗时。
- 同 owner 并发本来就应串行；同 operation 则先由 operation 行幂等串行。本轮不删除这些锁、不扩大连接池、不重排任务仓储锁。
- 其他长事务、借出连接错误生命周期、legacy 预占语句在锁等待后的 snapshot 行为尚未在本轮闭环，不将其列为已证明缺陷。

### 2.4 BI 访问日志：已有审计写入，没有发现自动保留实现

- `logBiAccess` 在 schema ready 后逐次 INSERT，不采样或异步丢弃。`/api/admin/bi` 在 queryBi 之前 await 写入；写入失败时返回现有 500，不吞错误。
- trace、conversation、media，以及用户管理/模型发布等有对应审计写入；并不是每个普通用户余额请求都写 BI 访问日志。
- `app_bi_access_created(created_at DESC)` 已有；访问列表按时间范围查询。默认查询最近 30 天、最长 366 天、分页 size 默认 30/最大 100，**查询窗口不是数据保留机制**。
- 对 `src`、`scripts` 的写入/DELETE/清理检索没有发现 `app_bi_access_log` 的生产自动保留/分区/归档机制；测试清理不算保留。没有访问服务器外部 cron，因此不推断服务器绝无额外机制。
- 日志增长和宽窗口查询值得后续单独量化；本轮没有日志表量、磁盘占用或真实 BI HTTP 压测，不把它报为已量化事故，不擅自删审计记录。

## 3. 本轮已复现且修复的完整切片

### 原缺口

`debitTx` 与 `deductPrincipalFIFO` 都先执行 `SELECT id, remaining ... ORDER BY ... FOR UPDATE`，将 **owner 全部活批次** 锁定并传到 Node，然后 JS 只遍历实际需要的前缀，每批次再发一条 UPDATE。

- 合成 owner 有 10,000 个活批次、每批次 10 积分；扣 6 只需要第一批次。
- 原版 PG `LockRows Actual Rows=10000`，返回 10,000 行；事务尚未提交时另一真实连接锁尾批次 `NOWAIT` 得到 `55P03`。
- 扣 600 跨 60 批次，扣减部分 1 SELECT + 60 UPDATE = 61 SQL。全部发生在 owner 锁/借出连接仍持有期间。
- 退化症状是批次数量驱动的锁工作量、Node 行数组和网络往返，使结算变慢并延长同 owner 队列；不是本轮证明的“双扣费”。

### 修改

`billing/repository.ts::debitTx` 保持公开签名，在已有 owner 锁下使用一个 SQL：

1. `ordered` 以原 `expires-first` / `created-first` 次序，按 `ROWS UNBOUNDED PRECEDING` 算此前累计余额。
2. 只对 `consumed_before < n` 的前缀 UPDATE，扣 `LEAST(remaining, n-consumed_before)`。
3. 数据库返回扣减总额一行。未扣足仍抛原现代 `INSUFFICIENT_CREDITS`，外部事务回滚全部修改。

legacy `deductPrincipalFIFO` 保留 `n<=0`、owner lock、成功返回 n 与原错误文案，调用同一 `debitTx`；非余额错误原样抛出。相同 expires/created 时间的 legacy 顺序以前未定义，现在使用现代已有的 id 稳定尾序，不改变先到期优先。

职责：账务 repository 统一拥有批次扣减算法；db.ts 仅保留兼容签名与 owner 锁/错误映射。没有把任务、报价、租约或供应商状态挪进 repository，也没有拆事务。

**明确边界**：窗口函数仍读取并排序该 owner 的全部活候选，不是 O(1) 余额/批次扫描。改进的是必要批次写锁、Node 传输和 per-batch 往返；不声称已经解决所有账务扫描。窗口 CPU/排序成本和同 owner 串行化仍存在。

## 4. 本轮实测

环境：Windows Node `v24.19.0`、pg `8.20.0`、PostgreSQL 16 Alpine 本机独占容器；5 个业务 fixture 连接、2 个观测连接。容器 label `naumi.fixture=billing-hotpaths-94f72f4f`、`naumi.owner=t3-94f72f4f`；仅绑定 `127.0.0.1:55449`。合成数据、ANALYZE、pg_stat_statements 全在该容器，不读取 `.env` 或生产凭据。Python 启动白名单对 Windows 环境变量名大小写无关，保留 SYSTEMROOT。

### 4.1 查询计划、真实执行计数

| 场景 | 原版 | 修改版 |
| --- | --- | --- |
| 10,000 活批次扣 6，Node 返回行 | 10,000 个批次行 | 1 个聚合结果行 |
| 小额扣减尾批次 NOWAIT | `55P03`，被无关锁挡住 | 成功；尾批次没有被扣减锁住 |
| 原版 LockRows / 修改版 Update 实际行 | 10,000 / 不适用 | 不适用 / 1 |
| 跨 60 批次扣 600，扣减 SQL 数 | 61 | 1 |
| 小额扣减计划 shared-hit blocks | 10,219 | 225 |
| 小额计划执行 ms | 4.269（SELECT 锁行，不含后续 UPDATE） | 3.700（含 UPDATE 和聚合） |
| 跨 60 批次计划 shared-hit blocks | 10,224（仅 SELECT） | 1,037（含 UPDATE） |

所有请求 SQL、参数、行数与时间在 JSON trace 中；另保存真实 `pg_stat_statements` calls/rows 和完整 `EXPLAIN(ANALYZE,BUFFERS,TIMING OFF,FORMAT JSON)`。解释 UPDATE 时使用本 fixture 事务 SAVEPOINT 回滚，不重复消耗测试钱包。

4 个测量样本的探针事务中位耗时：现代小额 17.517→9.255 ms；legacy 小额 15.051→9.072 ms；created-first 小额 14.832→8.716 ms；跨 60 批次 68.037→9.533 ms。**这些含独立锁探针、受本机负载影响，不是生产 p95 或稳定吞吐结论**。

### 4.2 完整 service 事务并发

另以每 owner 1,000 活批次运行真实 reserve/settle；每组 3 轮，串行组 3 样本、5 并发组各阶段 15 样本。事务时间从 BEGIN 发出到 COMMIT 返回，另记录 checkout、owner 锁等待及获得锁后到 COMMIT 的持锁时间。不是把 checkout 等待混入持锁时间。

| 5 并发场景 | 原事务中位 / p95 ms | 改事务中位 / p95 ms | 原/改获得 owner 锁后中位 ms |
| --- | --- | --- | --- |
| 同 owner reserve | 14.489 / 64.506 | 18.715 / 48.410 | 3.735 / 5.204 |
| 同 owner settle | 34.732 / 55.028 | 35.628 / 55.586 | 8.808 / 9.803 |
| 不同 owner reserve | 11.668 / 15.218 | 8.616 / 8.839 | 7.069 / 5.680 |
| 不同 owner settle | 22.781 / 31.488 | 12.329 / 13.492 | 19.063 / 9.681 |

p95 用 nearest-rank；15 个样本的 p95 实际为最大值，仅描述本轮小样本。**同 owner 的 settle 中位没有改善，不能宣传所有并发更快**。reserve 算法未改，数值波动保留。完整 reserve 是 10 条 SQL，settle 原 17–18、改 16（包含事务控制；相邻任务有时跨两个批次）。本轮所有并发钱包最终本金、镜像、hold 和 reservation 一致。

### 4.3 语义与实际执行层级

`scripts/verify-billing-hotpaths.cjs` 原/改/回滚各 **11 组通过**，包含 32 个固定种子差分钱包：

- 同 operation 8 路 reserve/settle 仅一笔 ledger、一次释放，冲突 fingerprint 拒绝。
- 部分成功、冻结报价、UNKNOWN hold、BYOK 零扣、失败仅释放自身占位。
- 12 个不同 operation 抢 60 积分，只受理 10 个；并发结算最终为零，不超支。
- 新/旧扣减混合并发，owner-first 锁序不变。
- 两种 FIFO、同时间 id 尾序、刚好耗尽、跨批次、余额不足回滚、过期/空批次、过期流水恰好一次。
- SQL 原错误透传，ledger 写入故障时本金/预占/operation 全部回滚。
- refresh 真实等待 owner 行锁后看到已提交新本金，不回写锁前旧余额。

现代 billing/service/repository 加载真实源码并执行真实 PG；仅无 creation context 的附属 creation hook 是 fixture。legacy 函数从 db.ts AST 原样提取，依赖注入相同真实事务和扣减实现；不冒称完整 Next/db.ts import 验收。

另将现有 `verify-image-job-lease.cjs` 复制到本任务证据目录，仅调整 root 和本地 DB allowlist，不修改任何既有断言。本轮重新执行结果 `X2_MODIFIED=PASS`：失租后写/结算拒绝、等待钱包锁后过期拒绝、UNKNOWN 保留 hold、同 operation 8 路仅一笔 6 积分；最终 principal=982、charged=-18、3 笔消费、reserved=reservations=96。此处是真 PG + 实际 image 仓储/账务，心跳时钟和供应商/附属适配为 fixture，**不是重新做 280 秒墙钟或真实供应商调用**。

### 4.4 保留的失败与未做项

- `verify-billing-rules.ts`：本轮 exit0，literal `PASS dynamic quotes, frozen prices, partial/failure/BYOK policies, result validation`。
- 原生 `verify-billing-wallet.ts`、`verify-billing-review.ts balance-refresh`：当前可读依赖目录为 React 18.3.1，与源码要求 19.3.0 不匹配，`react-server` import 即 exit1：`This entry point is not yet supported outside of experimental channels`。没有改旧断言或替换共享依赖把它们凑绿。
- 全项目 tsc：exit2，36 项诊断（缺少 three/类型、React18 类型不匹配）。CompilerHost 仅替换两份原源码的基线检查也为 36 项，诊断逐字归一后相同；本切片未新增诊断，**整项目类型检查仍未通过**。
- 未执行完整 Next 构建、真实 HTTP/浏览器、生产 DB、生产 BI 压测或线上端到端。企业 401≠404 等其他任务旧失败未运行、未修改、未关闭。

## 5. 回滚、四产物与复现

证据根目录（ignored，不进入 Git）：

`C:/Users/13357/.t3/worktrees/naumi/t3-94f72f4f/output/capacity-billing-hotpaths-20261029/`

四产物：

1. `MODIFIED_FILE.zip`：两份修复源码、专属验证脚本和 hash manifest。
2. `DIFF_FILE.patch`：两份业务源码的精确差异。
3. `VERIFICATION.txt`：完整 command/input/stdout/stderr/exit、原/改 hash、回滚和资源结束状态。
4. `ROLLBACK.sh`：实际可执行；只允许该证据目录 `copies/` 下带标记、hash 完全匹配的副本。先全量检查所有目标再写，拒绝 symlink/junction；不覆盖工作树或后来编辑。

原 SHA256：

```text
src/lib/db.ts
e16c72f6af468b311bd8c2c80b1e4b7dd01b2dd26ce22d07bf21b8a1be98bdc6
src/lib/billing/repository.ts
ad339aa461011d235161084fac5f6a8bf8aae7e8b681d2a1a2a35b717a55ef96
```

复现入口（cwd 为上述 worktree；启动器仅传合成 fixture URL）：

```powershell
python output/capacity-billing-hotpaths-20261029/run.py BASELINE
python output/capacity-billing-hotpaths-20261029/run.py MODIFIED
& D:/DEV/Git/bin/bash.exe output/capacity-billing-hotpaths-20261029/ROLLBACK.sh output/capacity-billing-hotpaths-20261029/copies/rollback-copy
python output/capacity-billing-hotpaths-20261029/run.py ROLLBACK
```

BASELINE 与副本 ROLLBACK 均 exit1：语义 11/11、返回 10,000 行、尾锁不可得、跨 60 批次 61 SQL、2 个性能预算失败。MODIFIED exit0：语义 11/11、聚合返回 1 行、尾锁可得、跨 60 批次 1 SQL、0 个预算失败。

回滚动作 exit0，literal `ROLLBACK=RESTORED;FILES=2;SOURCE_UNCHANGED=true`；副本两文件恢复原 hash/原行为。后来编辑副本和直接指向源码的两次 guard 均 exit73、`ROLLBACK_GUARD=REJECTED;WRITES=0`。源码与 MODIFIED_FILE 保持修复版。结束前重开 ZIP 每项、差异、验证记录和脚本，并核验 hash/可执行状态。

重跑 fixture 的本机启动命令（仅本任务资源，结束只停止匹配 ID/label 的容器）：

```powershell
docker run -d --name naumi-billing-hotpaths-94f72f4f --label naumi.fixture=billing-hotpaths-94f72f4f --label naumi.owner=t3-94f72f4f -p 127.0.0.1:55449:5432 -e POSTGRES_DB=naumi_billing_hotpaths -e POSTGRES_USER=billing_fixture -e POSTGRES_PASSWORD=billing_fixture_local_only postgres:16-alpine -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all
```

这些是明确的公开本地 fixture 身份，不是线上配置。数据库/端口/username 在验证脚本入口全部校验；脚本不会自动启动、连接其他站点或读取环境文件。

## 6. 交接

模块与职责：统一现代/legacy FIFO 批次扣减，减少不必要锁与网络往返。

公共接口、依赖方向、数据/状态/事务归属：签名不变；db 兼容包装 → billing repository；owner 锁由 service/legacy 包装持有，原 Tx 不变；本金、镜像、预占、ledger 仍由原账务事务一起提交/回滚。

本次实现与迁移状态：两个真实扣减入口共用 set-based 前缀 UPDATE；没有任务仓储扩权、没有迁移/索引/缓存/业务限额。

未完成项与下一步：父线程复核后串行整合；在匹配项目依赖环境补原生 wallet/refresh 与完整 tsc。过期历史重复查询、会话镜像写放大、BI 审计保留、其他钱包借出连接生命周期继续独立审计。不能以本轮 prefix 优化关闭全体账务容量、生产容量或已有总台账事项。

## 7. 父线程复核与集中验收（2026-10-29）

父工作树基线为 `9aaf16af7bd1c23395ca4d443c62e7daedcb85c9`，以普通 merge 纳入固定子提交 `7e148a6542a35902adc72d727b3574f685dc80ca`，业务源码未额外修改。独立源码清点核对全部运行时批次写入及调用链：现代 settle/adjust、返还 grant 先锁 owner；五个兼容扣减入口都由 `deductPrincipalFIFO` 在原事务先锁 owner。默认 READ COMMITTED 下，新 CTE 位于 owner 锁之后的另一条语句，读取锁后快照。没有发现此次新增 import 环或绕 owner 锁改 `remaining` 的运行时路径。

明确兼容边界：现代两种排序不变；旧兼容 FIFO 的到期/创建时间顺序保持，原相同时间的未定义并列顺序新增 `id` tie-breaker。`now()` 仍采用事务开始时间，未将跨到期长事务的旧语义写成本轮修复。`expireDueBatches` 的独立调用只更新 `expired`，不更新余额/期限；人工导入回滚、smoke 脚本绕锁写批次属于另外的运维边界，本轮没有执行。

父线程创建独占容器 `naumi-billing-parent-20261029`，端口 `127.0.0.1:55489`，使用公开合成 fixture 身份。验证副本仅替换测试脚本的源码 root / fixture 端口，保留原业务断言，不读取生产环境文件。

- BASELINE / MODIFIED / modified-copy / ROLLBACK：每次账务语义 **11/11**；基线/恢复性能预算 exit1（1 万行、尾锁被占、61 SQL），修改/修改副本 exit0（聚合返回 1 行、尾锁可得、1 SQL）。完整 service 耗时保留原测量，不承诺同 owner 的所有结算场景均提速。
- 原生 `verify-billing-wallet.ts`、`verify-billing-review.ts balance-refresh`、`verify-billing-review.ts recovery`、`verify-billing-rules.ts`：均 exit0，实际应用 import、真实 schema/事务；恢复中的 supplier 是 fixture，并非真实付费供应商。
- 原 `verify-image-job-lease.cjs` 的父 fixture 副本：`X2_MODIFIED=PASS`、exit0，保留失租拒绝、钱包锁等待后期限复检、UNKNOWN hold、同 operation 8 路一笔 -6 等断言；非重新执行 280 秒墙钟测试。
- 父环境 React **19.3.0**，全项目 `tsc --noEmit --incremental false` exit0/无诊断。子环境 React18 导致的原生 import 失败及 36 项类型诊断保留，不改写其历史结果。
- 额外实际 PG 边界在原/改/恢复三版均通过：两批次累计 `4294967294`、最大单次扣减 `2147483647`，两种顺序正确；这是 repository 算术边界，不宣称 int32 钱包镜像支持该累计余额。真实 `pg_sleep` 越过批次到期时间，三版均维持事务时间语义。
- 仅独立副本回滚，恢复两份原 hash及原性能行为；源码/修改副本保持。后来编辑 guard exit73、零写入；回滚脚本可执行。父 fixture 收尾停止并核验端口关闭。

父证据目录：`C:/Users/13357/.t3/worktrees/naumi/codex-capacity-audit-wave2-20261029/output/capacity-audit-wave2-20261029/billing-parent/`。

四产物：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`；完整命令、stdin、合成输入、stdout/stderr、退出码及原/改 hash 均已记录并重开。`run.py` 统一复现 BASELINE / MODIFIED / COPY / ROLLBACK 与原生回归；`run-edges.py` 复现三版额外边界。

**下一切片候选**：`bi/user-management.ts:144` 在 owner 锁后仍将全部活批次 `FOR UPDATE` 传回，即使 profile/ban/role/reset-password 等非积分编辑也执行。它不破坏新扣减的 owner 串行前提，但本轮扣减优化没有消除此调用方负载；仅源码发现，待独立 PG 复现。重复过期扫描、BI 审计保留仍未修复。47 无 SSH/部署，45 笔手术、在线索引和已知 accepted-timeout 波动继续挂账。
