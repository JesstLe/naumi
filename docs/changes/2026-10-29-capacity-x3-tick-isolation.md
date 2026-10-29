# X3：tick 控制面连接隔离与生命周期（2026-10-29）

## 固定基线与交付状态

- 本任务 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-fa478743`，分支 `t3/x3-tick-isolation`，由派发工具准备；没有创建或切换 checkout。
- 派发源码：`ff59e6f0e06410d820bbb4821728ecd219b18f43`；其应用基线和两次 `git fetch origin main` 的结果都是 `7c4591361514309b0af1cef295c0c138e84b47c4`。远端没有额外整合。
- 当前成果是独立实现与本地验收，交父线程串行整合；没有 push、PR、main merge 或生产发布。总台账未修改，编号仍由父线程分配。
- 本轮没有 SSH、生产数据库/供应商请求、线上配置修改、Worker 恢复、任务重放或 UNKNOWN 清理。47 HOLD、45 笔手术及在线索引挂账保持。

## 模块与职责

`src/lib/db/connection.ts` 负责连接工厂、进程级主池/tick 池、配置和关闭生命周期；没有业务模块依赖。

`src/lib/release-runtime/worker-tick-receipts.ts` 负责 tick UUID、worker 身份和 Web 执行 boot 的持久回执与事务边界。

`src/app/api/video/worker/tick/route.ts` 是实际控制面入口，本次仅把 receipt store 接入专用池。原鉴权、错误映射和 scanner 顺序保留。

`scripts/worker-runtime.mjs` 已核对并执行原实现测试，本轮不改。原 SHA-256 保持：`150cd29ee026829e16f285c929b269b04d5cf8514fb60df2fd56f75d95c44136`。

## 先复现后的结论

1. **池饥饿已在本轮独立 PostgreSQL 复现。** 基线占满实际普通池的 5 个连接后，实际 route GET 返回 `503 / WORKER_TICK_DATABASE_TIMEOUT`；等待队列仍有 1 项。对 accept、complete 的实际 SQL 事务也复现 checkout 超时。释放持有连接后队列回收、查询恢复。
2. **迟到 checkout 不应报成新增泄漏。** 基线 `bounded()` 已在超时后对迟到成功的 client 调用 `release()`。可控 3100 ms checkout 的字面结果是释放 1 次、SQL 0 次；真实池饱和后释放也恢复全部 idle。此逻辑保留。
3. **ROLLBACK 失败后继续归还连接已复现。** 调用真实 `bounded()`，只用可控 client 令 SELECT 与 ROLLBACK 失败，基线 `discarded=false`；修改后 `discarded=true`。这是实现故障注入，不标成真实 PG 网络故障实测。
4. **只有一个普通池源码定义。** `db.ts` 导入并重导出 connection 的 `getPool`，不存在两份 max:5。另一个真实代码风险是 module-local singleton 经模块重新求值会创建不同 Pool；可控重复加载基线 `shared=false`，修改后 `shared=true`。这不是本轮生产 bundle 池数量测量。
5. **已借出连接断开导致进程退出已真实复现。** 在独立子进程中，只终止本任务刚 checkout 的本地测试 PG backend；基线报 `Unhandled 'error' event / Connection terminated unexpectedly`、exit 1。初版仅隔离池仍复现，随后添加借出期间 client error listener，修改后 `ACTIVE_DISCONNECT=HANDLED CLIENTS=0`、exit 0。控制池 idle listener 不覆盖借出的 client，这两个生命周期均须处理。
6. **没有新增“503 就放行”协议。** 原实现对受理前 503、随后 GET 404、timeout/abort 继续 UNKNOWN；对已经完成、但回包断开或之后返回 503 的 tick，重启后仅 GET 原 tick/原 worker boot 回执，保持暂停。匹配 completed 可 reconcile，不匹配 owner/boot 不放行。

## 本次实现与迁移状态

- `getPool()` 默认继续 5，不盲目加大业务池；`PGPOOL_MAX` 可显式配置。
- 新增 `getWorkerTickPool()`，默认 2；仅用于 receipt SQL，不把 scanner 或业务事务迁到控制池。
- 两池由 `process[Symbol.for('naumi.database.pools.v1')]` 持有。模块重载复用同一代池和已冻结连接配置，避免重复池以及同一代 lazy tick 池读取后来改变的数据库配置。
- tick 池使用 checkout 3000 ms、statement 3000 ms、query/wire wait 4000 ms、idle 15000 ms；连接阶段/BEGIN 也受专用池配置约束。原事务内 lock_timeout 500 ms、statement_timeout 3000 ms、idle-in-transaction 5000 ms 保留。没有仅把 3 秒改长。
- pg 原生 checkout timeout 让已过期的等待项移出队列；原 `bounded()` 的迟到 release 仍在，二者覆盖不同层级。
- tick idle socket 的 error 事件有固定无凭据日志处理。`closeDatabasePools()` 并发调用返回同一 promise，等待已借出连接归还，关闭期间拒绝建新池；关闭失败保留关闭 fence，成功后允许下一代创建。route 在池代变化后重建 receipt store。
- 关闭 API 仅用于已排空的进程/测试收尾，先由调用者结束请求并关闭 image/video/release 等其他专用池；不额外注册 SIGTERM、改发布排空或抢先关活跃业务连接。常规进程退出由 OS 回收，tick 的 idle 超时/allowExitOnIdle 避免它独自拖住 CLI 退出。
- 已借出 client 绑定局部 error listener，连接断开置 discard 并阻止 COMMIT；query reject 仍向上返回原错误，坏连接不再发无意义 ROLLBACK；release 后移除该 listener，避免积累。
- 事务异常时，ROLLBACK 确认失败的 client 用 `release(true)` 销毁；成功回滚仍正常归还，原错误不被覆盖。

### 公共接口、依赖方向、数据/状态/事务归属

- `getPool(): Pool`：原业务仓储接口不变。
- `getWorkerTickPool(): Pool`：只在 tick route 组装边界选择，store 仍以显式 Pool 参数注入，便于隔离测试。
- `databasePoolBudget(env = process.env)`：返回 `{business, tick, other, total, budget}`，第一次创建池时严格校验正安全整数、总预算；显式空串/0/负数/NaN/小数/垃圾后缀均报错，不 silently fallback。
- `closeDatabasePools(): Promise<void>`：只管理本模块持有的两池；不是全站排空 API。
- accept INSERT **提交成功后**才调用 scanner；scanner 不持有回执连接。complete 是独立、有全身份条件及 `phase='running'` fencing 的事务。scan/complete 异常只标 unknown，不重跑。
- 回执表归 receipt store，业务任务、账务和租约仍归原模块；没有跨模块直接改业务表，没有拆业务事务/授权规则。

### 总连接预算，而非仅一个 max

默认每个 Node 进程预留：business 5 + tick 2 + release 2 + image coordination 4 + video coordination 2 = **15**，其中 other 固定预留 8 对应本基线实际另外三池。`NAUMI_TICK_POOL_MAX` 默认 2；`NAUMI_DB_POOL_BUDGET` 默认 15。仅改 `PGPOOL_MAX=6` 而仍用默认预算会失败；显式 `PGPOOL_MAX=7, NAUMI_TICK_POOL_MAX=1, NAUMI_DB_POOL_BUDGET=16` 通过。

这只是每个应用进程的保守预算检查，不会查询或调整 PG max_connections，不是全站连接信号量。蓝绿两个 Web 的此项上界是 30，另有独立实例/工具/维护连接须逐项加总；旧槽和候选也计入。当前 `scripts/video-worker.mjs` 是 HTTP 调度器，本身不创建 PG Pool；“一个 Worker 容器”不自动等于再加 15，实际按导入 DB 的 Node 进程逐个统计。源码中的 HTTP observer preload 也不创建 PG Pool。其他池上限后续变化时须同步此表及预算常量。

本轮没有实测目标站进程数、PG headroom、连接总量或用户容量。因此默认多 2 个控制连接是候选代码变化，不证明任何站点已有余量或 D2 全链路已消失；上线前由父线程在解除 HOLD 后核对总预算。

## 验证命令、结果及证据层级

只使用本任务创建的 Docker `naumi-x3-tick-fixture-20261029`（label `io.naumi.fixture=x3-tick-20261029`），固定 `127.0.0.1:55463/naumi_x3_tick_fixture`。每轮随机 schema，退出删除自己的 schema。runner 先删除继承的 DATABASE_URL/PG* 再使用显式 fixture 地址，不读 dotenv/生产凭据。PG 容器仅 loopback 暴露；业务 scanner 为合成回调，真实供应商调用为 0。

`node_modules` 是本 worktree 指向既有依赖的只读使用 junction，没有写共享源码/安装依赖。实测 Node v24.19.0、pg 8.20.0、esbuild 0.28.1；依赖目录 React 为 18.3.1，和仓库清单 19.3.0 不同。

1. `node scripts/verify-capacity-x3-tick-isolation.cjs output/capacity-x3-tick-isolation/baseline baseline`
   - `X3_BASELINE=PASS CASES=14 REAL_PG=1 ACTUAL_ROUTE=1 HTTP=LOCAL FIXTURE_SCANS=2 SUPPLIER_CALLS=0`，exit 0。
   - PASS 表示预期缺陷与已有不变量被成功复现，不表示基线业务可用。关键字面输出：`SATURATION status=503 businessWaiting=1`、`ROLLBACK_FAILURE discarded=false`、`BUNDLE_SINGLETON shared=false`。
2. `node scripts/verify-capacity-x3-tick-isolation.cjs . modified`
   - `X3_MODIFIED=PASS CASES=19 REAL_PG=1 ACTUAL_ROUTE=1 HTTP=LOCAL FIXTURE_SCANS=2 SUPPLIER_CALLS=0`，exit 0。
   - 关键字面输出：`SATURATION status=200 businessWaiting=0`、`ROLLBACK_FAILURE discarded=true`、`BUNDLE_SINGLETON shared=true`。
   - 真实 Pool/PG/事务与实际 route GET；大业务依赖只在该新 runner 中替换为禁止扫描的合成接口，鉴权 stub 不算产品鉴权验收。模块重载、慢 checkout、rollback 失败为受控实现测试；active disconnect 则是独立子进程的真实本地 PG backend 断开实测；HTTP+PG 路径执行真实 WorkerRuntime 和 receipt store。
3. `node output/capacity-x3-tick-isolation/run-existing-receipts.cjs`
   - 包装器明确写入本地 fixture env，执行 `node --require ./scripts/server-only-register.cjs --import tsx scripts/verify-worker-tick-receipts.ts`。
   - `WORKER_TICK_RECEIPTS=PASS CHECKS=59 STORAGE=ISOLATED_POSTGRES RESPONSE_LOST=READONLY_RECONCILE DUPLICATE_TICK=NO_RESCAN RESTART=ORIGINAL_BOOT PAUSED=YES HTTP_TICK_POSTS=2 HTTP_TICK_GETS=1 FIXTURE_JOB_POSTS=3 REAL_SUPPLIER_CALLS=0`，exit 0。
   - 原脚本导入真实 route 和真实鉴权，覆盖 401/400/409/404、duplicate POST 不扫描、实际 schema/事务；server-only 采用仓库已有 Node 测试注册器，不是完整 Next 浏览器/生产构建。
4. `node --test scripts/test-worker-runtime.mjs`：25 tests / 25 pass / 0 fail，exit 0。
5. `node --test scripts/test-worker-recovery-process.mjs`：1 test / 1 pass / 0 fail，exit 0。真实子进程本地状态文件、重启及 SIGKILL 保持 UNKNOWN，不额外 POST。
6. `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext src/lib/db/connection.ts src/lib/release-runtime/worker-tick-receipts.ts`：空输出，exit 0。
7. `git diff --check`：空输出，exit 0。

覆盖矩阵包含借出连接断开不崩进程、业务池饱和而 read/accept/complete 可用、晚 checkout 无 SQL 且释放、PG 等待队列回收、SQL 锁超时回滚、HTTP abort、受理前失败与受理后丢响应/503 对照、无凭证 503/404 保持 UNKNOWN、匹配和不匹配 tick/owner/boot、原 boot 回执跨 Worker 重启、并发同 UUID 只扫描一次、池预算与热重载/关闭代际。

### 保留的未通过尝试

- 直接 `--conditions react-server` 跑旧 PG 脚本，exit 1，字面错误 `This entry point is not yet supported outside of experimental channels`，来自当前依赖 React 18 shared-subset。后改用仓库既有 server-only Node 注册器完成 59 项；原失败日志保留。
- 全项目 `node node_modules/typescript/bin/tsc --noEmit --incremental false`，exit 2：缺少 `three`/类型，及 React ref 类型不匹配。原输出保存在 `TYPECHECK.log`，不称全项目类型或构建通过；未改这些不属 X3 的文件。

## 四产物与副本回滚

证据目录：`C:/Users/13357/.t3/worktrees/naumi/t3-fa478743/output/capacity-x3-tick-isolation/`（Git ignored）。

- `MODIFIED_FILE`：多文件 manifest，映射本任务 5 个文件的修改副本、原副本和 SHA-256；未改的 worker-runtime 另列保留 hash。
- `DIFF_FILE`：任务源码、验证器和文档的差异。
- `VERIFICATION.txt`：BASELINE/MODIFIED/ROLLBACK 的精确命令、输入、字面输出和 exit status，并记录未通过尝试。
- `ROLLBACK.sh`：可执行，只允许证据目录自己的 `rollback-copy`，marker、绝对路径和全文件前置 hash guard；验证失败时在任何写入前退出。既不接受任意目标路径，也不覆盖工作树。

回滚测试命令为 `D:/DEV/Git/bin/bash.exe output/capacity-x3-tick-isolation/ROLLBACK.sh`，随后 `node scripts/verify-capacity-x3-tick-isolation.cjs output/capacity-x3-tick-isolation/rollback-copy baseline`。只在副本恢复基线 503、discarded=false、shared=false，工作树和 `modified-copy` 保持修复版。完整原始结果由 VERIFICATION 封存，产物交付前重开核对。

## 未完成项与下一步

1. **可靠未受理协议仍未实现。** HTTP 状态码和一次 GET404 都不是拒收证据。未来有界恢复需持久的同 tick 身份未受理凭据/tombstone、服务端受理互斥/fence、Worker 控制 revision/boot 与人工 drain 优先级；新增 tick 也不得绕过原 UNKNOWN。当前不存在这类凭据，不新增放行或删 lastTick。
2. 控制池隔离仅减少本地业务池竞争；扫描本身仍使用业务池/供应商与原事务，PG 整体不可用、连接总量耗尽、长扫描及已受理丢回包依然可能 UNKNOWN。不能把本次修复描述为 worker wedge 全部根治。
3. 尚未执行完整固定依赖构建、真实 Next 多 bundle 生命周期及正式蓝绿验收；本轮 HMR/重新求值是受控实现证据。关闭 helper 没有被接为新的生产排空/信号流程。
4. 本任务没有改 X1/X2 接口；父线程整合时核对新增 `getWorkerTickPool` route 组装和配置预算，使用匹配锁文件依赖集中复核，再保留 47 HOLD。

## 供父线程入账的 A/D 建议（不自行编号）

- **A1/A23 校正**：只有一个普通池源码工厂，业务默认 5 保留；增加配置校验与进程共享池，但不存在“两处 max:5 一起修”。重复模块求值多池是新实证风险，不等于线上已测出多个池。
- **A2 / D2 部分修复**：共享业务池导致 receipt checkout 饥饿已本地复现，隔离后饱和业务池不再阻塞 read/accept/complete。状态应记“本地隔离验证通过、固定候选代码、未整合/未部署”，未受理恢复协议仍开放。
- **新增 A/D 候选**：借出控制连接断开触发未处理 Client error，导致 Node 进程退出；本地独立 PG/子进程已实证，从基线 exit 1 修为受控拒绝与销毁连接 exit 0，未声称线上曾发生。
- **新增 A 候选**：ROLLBACK 失败后归还不确定会话，已可控实现复现并改为丢弃连接；证据层级不要写成生产泄漏事故。
- **排除伪新增**：迟到 checkout 基线已经释放；HTTP503/GET404 本轮保持 UNKNOWN 是协议不变量，不应按“无回执自动清理”登记修复。历史 GLM 数量/事故不改写成本轮实测。
