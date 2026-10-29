# A60：持久图片任务关键清理窄切片

日期：2026-10-30。父固定基线：`611b7fee65c5d97b6a5badc14e3c77e44c9c1ed8`。
任务分支：工具提供的 `t3/durable-job-cleanup`，独立 worktree `t3-29458250`。
开工已读取 AGENTS、协作规则、capacity-audit 当前状态索引、X2 租约文档及图片任务停止文档；fetch 后 origin/main 与指定基线一致。只在本任务 worktree 修改，不另建 checkout、不再委派。

## 1. 职责、调用链与分级

`DurableImageJobs.kick → claimImageJob → bindBackgroundClaim → heartbeat + run → failure cleanup → releaseImageJob`。
写入链为 `set/patch → saveImageJob → 权威 snapshot 事务 COMMIT → 可延期 creation evidence 事务`。
失败收尾链为 `kick catch → failUndeliveredImageJob → 原 job/钱包/账务锁及最终 fencing → COMMIT/ROLLBACK`。

| 位置 | 分类与可观察后果 | 本次处置 |
|---|---|---|
| `patch`、`paidOperation` 的 `context.queue = next.catch(...)` | 原调用方 `await next` 收到异常；队列尾 catch 仅使后续写入可继续，不是静默承认成功 | 保留 |
| `executionFor` / `ImageJobLeaseLostError` | 已失去执行权；不是供应商失败或未受理证明，旧 owner 不应失败结算/重放 | 保留早退、fencing、原 checkpoint 与 hold；日志仅有限 reason |
| `releaseImageJob` 的 token 不匹配/重复释放 | UPDATE 0 行是幂等成功；不得释放新 owner | 保留返回契约、无失败日志 |
| SQL `57014` 取消 | 原事务查询取消，不是清理成功或可重试许可 | 原对象原样抛出；正常 ROLLBACK 后归还连接 |
| paid root/child 的可选 accepted proof enrichment catch | 已有 Pending/UNKNOWN 仍是权威；证据读取失败不得授予新 POST 权限 | 保留，不给热恢复循环逐次加日志 |
| `bindBackgroundClaim` 后 lease release catch | 原 activity bind 异常必须继续抛出；释放失败留下占槽租约 | 添加 `claim-release` 脱敏、有界诊断，不覆盖原异常 |
| `kick finally` lease release catch | 已成功执行仍保持成功；释放失败留下原租约，直到原恢复/期限处理 | 添加 `lease-release` 诊断，不补偿账务、不自行重试 SQL/任务 |
| `kick` 执行及失败收尾日志 | 原日志带 job key、自由异常 message/对象；失败清理可能再失败 | 改为 `execute` / `failure-stop` 固定阶段与有限 reason，原行为不变 |
| parent wake 通知失败 | 已保存子结果不可倒退；既有 worker scan 是后续路径 | 保留 fallback，仅改为 `parent-notify` 固定诊断 |
| `saveImageJob` 副证据 checkout / SQL / rollback | 主 checkpoint 已 COMMIT；副证据失败可延期，不应翻成业务写入失败 | 整个副阶段含 checkout 置于可容错边界；保留 savepoint/待补标记与提交前 fencing |
| `saveImageJob` 主事务及 `failUndeliveredImageJob` rollback | 原错误/非 Error 抛出值是业务结果；rollback 失败会污染池连接，不能证明 COMMIT 未受理 | 保留首错 identity；有诊断、坏连接 discard，不重跑 action/COMMIT |
| heartbeat 已有重试、其他 repository 事务、release runtime UNKNOWN 写入 | 有既有机制或属于其他完整切片，未在此次作全量缺陷认定 | 未改；A60 其他调用链继续开放 |

`taskFailureDiagnostic` 已有有限原因词汇与 hostile getter 防护；`release-runtime/background-activity::reportFailure` 已有短 stage/code 及原错误/UNKNOWN 语义。本次未另建通用 logger、事件平台或全局回收器；仅在图片任务内部复用前者，并为清理补充明确 SQLSTATE 集合，不导出任意 code/message。没有机械替换“236 处 catch”。

## 2. 实现与接口/事务归属

业务源码 **3 文件**：

1. `src/lib/durable-image-jobs.ts`：只替换两处 lease release 空 catch 及相邻三个自由文本日志。`kick` / `set` / `patch` / `paidOperation` 公共签名不变；原异常传播、失败/成功返回语义不变。
2. `src/lib/image-job-repository.ts`：`saveImageJob` 主事务安全清理、副证据完整可延期边界；`failUndeliveredImageJob` 首错与连接清理。没有修改业务 SQL、报价、账务状态机、owner 锁或 fencing 判断。
3. `src/lib/image-job-cleanup.ts`：内部窄辅助模块，仅依赖既有 task diagnostic、PG 类型及平台时钟。`reportImageJobCleanupFailure(stage,error)` 只输出固定行；`imageJobCleanupClient(client)` 为**调用方已取得的同一 client**登记借出期 error listener、rollback/discard/release，不另取连接、不拆事务。

依赖方向：durable 执行编排 → repository / cleanup；repository → 原账务与 DB 接口 / cleanup；cleanup → 无 I/O 的既有诊断分类与 PG 类型。没有跨模块直接写别人的数据表，没有反向引入路由或执行编排。

资源边界：借出连接发生 socket error 时置 discard；ROLLBACK 失败同样 discard；最终 release 一次并移除自己的 listener。pg-pool 的 idleListener 由 pg-pool 自己管理，不移除它。主事务失败仍原样抛出任何值，包括 `null`、字符串、非 Error 对象。

诊断边界：最多 **10 个固定 stage 槽**，每 stage 每进程 60 秒首报一次，后续只增加饱和计数（上限 2,147,483,647），下一次有事件时带 `suppressed=N`。无 timer、无 per-job/key Map、无热轮询逐次日志，无凭据/账号/提示词/SQL/stack/自由异常 message。诊断 getter 或输出 sink 自己抛错也不改变业务结果。只有诊断采样，不把采样计数声称为持久审计。

副证据失败：保留权威 checkpoint 与原 receipt，既有 savepoint 内失败仍尝试设置 `creationEvidencePending`；checkout 本身失败时只报告可延期证据故障，不强行追加一次 DB 写入。未增加新的证据重试器，后续沿原 source snapshot 读取。

未触碰 `image-job-queue.ts`、`db/connection.ts`、`video/*`、rate-limit/A15 调用文件；未改父台账。没有增大池/并发/租约或降低质量。

## 3. 原实现复现及状态后果

先保存原文件 SHA256，再运行真实本地 TS 模块与独占 PostgreSQL16：

| 样本 | 原版 | 修改版 |
|---|---|---|
| lease UPDATE 触发真实 PG `22012` | `SUCCESS=done LEASE_RETAINED=1 DIAGNOSTICS=0 REPLAY=0` | 同一成功/租约/不重放状态，`DIAGNOSTICS=1` |
| bind 失败后 lease release 也失败 | 原 bind 对象继续抛出、原 hold/checkpoint 保持，释放失败静默 | identity/hold 保持，新增 `claim-release` 诊断 |
| 权威 COMMIT 后副证据连接连接到本机已关闭随机口，真实 `ECONNREFUSED` | `CHECKPOINT=committed CALL_REJECTED=1 DIAGNOSTICS=0` | `CHECKPOINT=committed CALL_REJECTED=0 DIAGNOSTICS=1` |
| 首次查询 PG `22012`，ROLLBACK seam 再执行失败 SQL | `ROLLBACK_ORIGINAL_IDENTITY=0 DISCARD=0 NEXT_QUERY_OK=0`；下一条真实查询为 `25P02` | `ROLLBACK_ORIGINAL_IDENTITY=1 DISCARD=1 NEXT_QUERY_OK=1` |

最后一项明确是清理 seam 的 SQL 故障注入，非“生产出现同样故障”的结论；错误与事务污染都来自真实 PG，不伪造错误码或数据库返回结果。另有真实 `pg_terminate_backend` 验证借出期断连，不由测试包装器代生产注册 error listener。

原 hash：

```text
src/lib/durable-image-jobs.ts
a28cd9bd0183864ec9ebf2382e2a9d9242002e960647e9187e782ad1b8b9f007
src/lib/image-job-repository.ts
21d22d64d88e3fd3a9c1da01751a76d1732af63871a5d281069fba9b07cda7fe
```

## 4. 集中验证、命令和证据层级

新增 `scripts/verify-critical-image-cleanup.cjs`。每次运行自行启动/销毁 **一个**独占 PG，`--memory 256m --cpus 1 -p 127.0.0.1::5432`，唯一 UUID label；TCP 和真实 SQL 就绪后测试，`finally` 结束各 pool、按完整容器 ID 和本次 label 校验后移除、核对 label 空集合及 TCP 关闭。没有读取 .env/生产 URL，没有共享其他 agent 的 fixture。

```powershell
node scripts/verify-critical-image-cleanup.cjs output/a60-critical-cleanup/baseline baseline
node scripts/verify-critical-image-cleanup.cjs . modified
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node output/a60-critical-cleanup/compare-types.cjs
```

- 原版 **4/4 反例复现**，exit 0；它表示复现成功，不表示原实现通过新要求。
- 修改版 **21/21**，exit 0。含真实 SQL/连接失败、成功返回、bind 原异常、lease 取消、SQL `57014`、同 owner 8 路执行/8 路终止、旧 token 幂等、原 paid root/child checkpoint/nonce/frozen quote/ledger、UNKNOWN hold、已存 paid result 零重放、失败事务账务中途写入整体回滚、Error/字符串/null/对象 identity、主/副证据事务、1000 次诊断压缩与 hostile getter/sink、借出连接与 timer 全归还。
- 模块加载是真实仓储/durable/lease/codec/billing 源码；存储、模型、creation writer 及 release admission adapter 是显式 fixture。为观测 detached action 原异常，测试 admission adapter 等待 action；**不冒充真实 release store/admission 联调或 HTTP/供应商 E2E**。证据状态只覆盖本切片本地模块/独占真实 PG。
- 全量 TypeScript 已运行，exit 2：当前借用的本机依赖存在 three/types 缺失及 React ref 类型不匹配。compiler-host 在同一项目路径覆盖两份基线源码，原/改均 **36 条**且逐项完全一致，`DIAGNOSTICS_IDENTICAL=1 CHANGED_SOURCE_ERRORS=0`（对照器 exit 0）；不把全量检查记成通过，不修改其他模块来隐藏环境缺项。
- 两个脚手架反例单独保留：先前故障样本保留四条活 lease，挤满默认 suite lane；已改为用例结束后只退休本独占 fixture 的 lease，没有抬业务并发。第二个是误要求 pg client error listener 总数为 0；pg-pool 自身会安装 idleListener，已改为只校验本模块 listener 移除。分别见 `HARNESS_LANE_LIMIT_FAILURE.log` / `HARNESS_PG_LISTENER_FAILURE.log`。

## 5. 四产物、copy-only 回滚和交接

证据目录：`output/a60-critical-cleanup/`（ignored，不提交原始测试产物）。

- `MODIFIED_FILE`：任务路径、原/改 SHA256 和修改副本 manifest。
- `DIFF_FILE`：完整 task-only patch。
- `VERIFICATION.txt`：命令、输入、完整字面输出/exit、各阶段状态、最终 commit/clean 和重开核验。
- `ROLLBACK.sh`：可执行入口，只接受证据目录内固定的 `rollback-copy`。先全量校验路径/文件清单/原与修改 hash，不写共享源码，不恢复 DB/媒体，不触发任务。

回滚演练已真实恢复两份原源码并移除该副本的三个新增文件，`ROLLBACK=PASS RESTORED=2 REMOVED=3 WRITES=5`、exit 0。`later-edit` 在最后一个 manifest 文件注入改动，实测 **exit 73、所有副本文件 hash 不变、零写入**；真实源码作为 target 同样拒绝（exit 73、零写入）。副本恢复后重新执行 baseline，四个原反例重新出现；源 worktree 与 `modified/` 保留修复、hash 与 manifest 一致。`ROLLBACK_EXECUTABLE=1`，四产物逐项读回，完整 literal/最终提交及 clean 状态见 VERIFICATION。

```powershell
node output/a60-critical-cleanup/pack-artifacts.cjs
# 封包脚本在固定 rollback-copy 上依次真实执行 later-edit guard、源码目标 guard 和 bash ROLLBACK.sh。
node scripts/verify-critical-image-cleanup.cjs output/a60-critical-cleanup/rollback-copy baseline
```

## 6. 未完成与父线程交接边界

- A60 仅本窄切片完成，不是全部 catch 审计，也不是十万活跃容量/整站验收。其他仓储事务、lease renewal 诊断、release-runtime 的 heartbeats/UNKNOWN 写入、热 recovery 路径继续按实际链路另行分级。
- lease 释放故障不会立即收敛 DB lease；本次仅明确诊断，不以任务/账务重放掩盖问题。未知 COMMIT 仍保持未知，丢弃坏连接不等于证明未受理。
- 已提交 checkpoint 的副证据 checkout 失败仍需既有证据读取/恢复链路后续核验；没有引入独立重试或清理服务。
- 全量 TypeScript 的本机依赖缺项、完整 Next/原生 HTTP、release admission 联调、生产容量、父线程独立 review/整合均未由本任务关闭。
- 本分支只 task-only commit 并 clean 交父；没有 push、共享 main merge、PR、部署、SSH、生产查询或付费调用。
- 用户给定 47 线上仍 `b79`，旧两条 `recovery-dispatch-scan UNKNOWN` 仅有父只读定位。本任务未连接47、未重核线上版本、未消解或操作这些状态；不以本地 PG 结果更改其结论。
