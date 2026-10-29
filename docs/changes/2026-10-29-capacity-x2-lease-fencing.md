# X2：图片持久任务租约、心跳与付费 checkpoint fencing

日期：2026-10-29。独立任务分支：`t3/image-job-lease-fencing`。

## 基线、边界与交付状态

- 应用基线 / 本轮 fetch 后 `origin/main`：`7c4591361514309b0af1cef295c0c138e84b47c4`。
- 派发源码基线：`ff59e6f0e06410d820bbb4821728ecd219b18f43`；开工工作树干净。没有整合远端或其他任务分支。
- 只改本 worktree 的 X2 持久化切片；总台账与编号由父线程维护。没有 SSH、部署、业务库连接、供应商调用、生产故障注入或线上配置变更。47 HOLD 保持；45 笔手术与在线索引未执行。
- 证据目录：`C:/Users/13357/.t3/worktrees/naumi/t3-18c8ab7e/output/capacity-x2-20261029`（ignored）。固定提交由本任务最终交付，供父线程串行整合；本任务不 push、merge、PR 或发布。

## 模块与职责

- `image-job-repository.ts` 拥有 claim/续租、snapshot 写入、租约 fenced 结算与预占释放。业务写入在同一 PostgreSQL 事务内；不拆计费事务、不改公共池。
- `durable-image-jobs.ts` 拥有执行上下文、串行 checkpoint 更新、root/child paid intent 与原结果恢复。供应商/存储 I/O 保持在数据库事务之外。
- 新增 `image-job-lease.ts` 只拥有租约时序和失租信号；无 DB、Route、供应商依赖。repository 和执行器单向使用它，不反向依赖。
- `scripts/verify-image-job-lease.cjs` 是隔离验收入口；真实 repository/durable/gateway/billing 实现与真实 PG 执行，外部适配为明确 fixture。测试时钟压缩与真实 wall-clock 模式分别标记。

## 先复现，再修复

原文件 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `src/lib/image-job-repository.ts` | `1cd62d3705485d1fdf8379a529f4be8d122f3d958f97b9fcc3dcfa4245b02308` |
| `src/lib/durable-image-jobs.ts` | `0db4f90458f089648323c0459f33bf050b59085fc5c8392afc4c4902e6260a87` |

基线测试的 `X2_BASELINE=PASS` 表示**成功复现预期缺陷及已有防线**，不表示这些缺陷已修。

| 本轮实测窗口 | 基线实际结果 | 修复行为 |
|---|---|---|
| 一次续租 backend 连接终止 | catch 永久 clearInterval，`heartbeatRecovered=false` | 单飞续租，1/2/4/8 秒有界退避，成功回 25 秒周期 |
| 行锁等待越过到期时间 | save 与 heartbeat 在过期后仍成功 | 先取行锁，再以 PG `clock_timestamp()` 校验；过期事务回滚 |
| job 行锁已经拿到，但钱包锁等待跨过到期 | 基线仍扣 6 分并提交 | 结算末尾在同一事务复检；扣减、ledger、预占释放、settled 标记全部回滚 |
| 无执行上下文，只有已过期 lease_token 的任务 | null-token paidOperation 可写 intent 并进入付费回调 | DB 模式 paidOperation 必须来自同任务的有效 kick 上下文；null-token snapshot 编辑仅允许真正无 owner 的空闲行 |
| root / child intent 已提交后、回调前租约过期 | 两个回调均执行一次；结果落库被旧防线挡住 | 各自执行前重新查租约；回调次数为 0，保留 started/unknown |
| 旧 owner 调 hold | 可把新 owner 的 reserved 改成 hold | hold 接口要求 token，并与 job 锁串行 fencing |
| checkpoint 已提交，creation evidence 写入前被接管 | 旧 evidence 执行，并把 pending 标记写到新 owner 的 snapshot | 副证据事务也取 job 锁并验证 token/期限；失租不发布旧证据，不反写新 snapshot |

### 已有防线的准确范围

- 两 owner 同时 claim：只有一个取得 token；kind advisory lock 与队列容量门保留。
- 旧 owner 在新 owner claim 后回写/结算：基线已经拦住。`saveImageJob` 的 token 校验不是完全缺失，实际缺陷在期限/等待及回调边界。
- `paidOperations` 的稳定 operation ID、attemptToken CAS、root/child checkpoint 防止同操作并发重复 intent；`done` 返回已存结果，`started` 且受理未知不允许普通 POST。
- 已受理身份使用现有 `acceptedImageOperationIdentities` + `withAcceptedImageRead` 读取原 task；Router 的原稳定 ID/身份语义未改，不将普通适配器当 Router 重放。
- `app_image_jobs` 行锁 / `billing_settled`、`app_billing_operations.id`、`app_gen_reservations.job_id`、`led-image-${id}` 唯一账本键共同保护原收费。8 路同 operation 结算结果始终为 1 笔、-6 积分。
- 基线钱包锁过期测试的额外 6 分是**另一个 operation 的过期 owner 提交**，不是同 operation 双扣费。原台账 D8 的“双执行/双扣费”不能作为本轮已观测事故入账。

## 实现与不变量

1. 租约仍为 120 秒、正常心跳仍为 25 秒，没有用加长租约掩盖缺陷。claim/续租使用统一常量；正常长任务靠持续续租，不需要租约大于 280 秒路由时间。
2. 心跳只重试租约 SQL，不重试付费请求；同一执行至多一个续租在途。使用单调时钟从 claim 发起时保守计时，续租请求发起时计算新的本地期限。超过最后已证明期限、明确 token 丢失或执行结束后，旧上下文永久失效；迟到成功不复活。
3. 续租事务设局部 `lock_timeout=2s` / `statement_timeout=5s`，不修改连接池全局配置。即使 pool checkout 或网络一直不返回，本地 deadline 仍封住新提交/写入，不启动第二个续租占池。
4. snapshot、hold、结算、失败释放先锁 job，再查 DB 当前时间；关键提交前再次复检（失败释放在清 token 的最终 UPDATE 前复检）。计费锁等待不再让过期 owner 提交已扣账。
5. root/child 在 intent 持久化后、实际回调前检查 DB token 和本地期限；失租信号保留到 kick，失租本身不作为供应商失败证据，不清 UNKNOWN、不结算失败、不释放该预占。
6. 副证据故障使用 savepoint；权威 checkpoint 已成功时不撤销它。新 owner 接管后，旧 evidence 不覆盖其状态。
7. 已进入 HTTP/供应商回调的调用不被伪装为可取消的未受理任务；失租只隔离后续执行/落库。DB preflight 与外部网络不是原子事务，极窄的 preflight 后停顿仍依赖已存 intent、稳定 ID 和 accepted/unknown 协议，而非宣称外部 exactly-once。

## 固定公共接口：供 X5 复用

| 接口 | X5 应遵守的约定 |
|---|---|
| `DurableImageJobs.create(id,email,snapshot,payload,cost,reserve,quote?)` | 继续保留冻结 payload、报价和 `paidOperationVersion:1`；图字节外置仅改编码，不改计费身份 |
| `get(id, hydrate=true)` | `false` 返回原始存储形态供 checkpoint CAS 使用；`true` 兼容历史内联结果与现有 Buffer/引用解码 |
| `set(id,snapshot)` / `patch(id,partial)` | 存储 I/O 在 DB 事务外；编码后会再次验证上下文；patch 通过原 `context.queue` 串行，不绕开 repository |
| `kick(id,run,recheckEmptyClaim?)` | 正式执行入口，负责 claim/续租/释放与 AsyncLocalStorage；X5 不自行构造/缓存 token 或另开付费执行器 |
| `paidOperation(id,model,operation,run)` | DB 模式需在该 job 的 kick 内调用；root/child `attemptToken`、`state`、operation ID 保持不变；done 只读原结果，started/unknown 不换 ID 重发 |
| `withImageIndexCheckpoint` / `withImageIndex`（现有 gateway） | child 结果外置继续走此路径，保留成功 sibling 和原 child key；不把 child 提升为新 root 计费项 |
| `settle` / `settleResults` | 使用原 job/quote 与原 ledger ID；不因外置/恢复生成新的预占或结算 ID |
| `repository.assertImageJobLease(id,token)` | 新增窄接口，执行前 DB 只读 preflight；不是跨网络锁，也不授予无 owner 的执行权 |
| `saveImageJob(id,snapshot,token)` / `settleImageJob(id,result,reason,token)` | 签名保持，token 有效性由 DB 再判；null 只用于真实空闲旧接口，不能接管带过期 token 的任务 |
| `holdImageJobBilling(id,token)` | **签名变化：增加必传 token**；所有源码调用方已在 durable 内更新 |
| `ImageJobLeaseLostError` / `isImageJobLeaseLost` | 新增失租信号，支持读取嵌套 cause；不得在 X5 捕获后转成普通失败结算或重新提交 |

X5 建议只修改 encode/decode 与 root result/child result 的存储表示，不改上述队列、CAS、fencing、收费实现。沿用 `$imageJobBuffer`、`$imageJobBase64`、`$imageJobDataURL` 的历史读取兼容。对象上传后失租可产生未引用对象，但不能由旧 owner 强行发布引用；对象清理另按引用与保留策略处理。

## 集中验证与证据分层

专用容器 `naumi-x2-lease-18c8ab7e`，镜像 `postgres:16-alpine`，独占数据库 `naumi_x2_isolated`，只绑定 `127.0.0.1:55432`，用户 `x2_fixture`，测试口令仅用于此 fixture。没有读取/复用任何生产 DATABASE_URL 或凭据。新测试仅接受 `NAUMI_X2_TEST_DATABASE_URL` 并校验 host/port/db/user；schema 重建只在该固定独立库执行。

```powershell
$env:NAUMI_X2_TEST_DATABASE_URL='postgresql://x2_fixture:x2_fixture_only@127.0.0.1:55432/naumi_x2_isolated'
node scripts/verify-image-job-lease.cjs output/capacity-x2-20261029/baseline baseline
node scripts/verify-image-job-lease.cjs . modified
node scripts/verify-image-job-lease.cjs . modified --wall-clock
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

- BASELINE / MODIFIED：真实 PG、真实 repository/durable/gateway/billing；控制时钟加速心跳，显式缩短**测试行**期限触发行锁窗口，`pg_terminate_backend` 只终止本 fixture 的续租连接。baseline 复现缺陷，modified 保持原幂等边界并阻断旧写。
- 覆盖：单次/持续续租失败、过期后接管、两 owner 并发 claim、行锁/钱包锁越期、无 owner 入口、root/child 提交 gap、旧 owner 迟到响应、evidence 故障与接管、同 operation 并发、恢复 checkpoint、accepted 读取成功/失败、UNKNOWN 不重放、结算并发、最终积分/预占一致、挂起续租与迟到成功、执行结束后 detached 写入。
- wall-clock：实际等待 280 秒；125 秒和 275 秒再 claim 均为空，单次本地 PG backend 故障后恢复 25 秒心跳。该回调模拟等待，没有实际供应商调用；不是生产路由容量压测。
- 完整 TypeScript 检查：exit 0。
- 原生应用入口 `verify-image-terminal-failure.ts`：`TERMINAL_FAILURE=PASS CASES=4 ATTENTION_STATES=0 AUTO_RESUME=0 EXISTING_IMAGES=UNCHANGED SUPPLIER_CALLS=0`，exit 0。
- 原生应用 `verify-image-concurrency-convergence.ts`：本地真实 HTTP fixture、真实 route/DB/billing，`MODIFIED=PASS REAL_LOCAL_POSTGRES=1 REAL_HTTP_FIXTURE=1 REAL_ROUTE_BILLING=1 EXTERNAL_SUPPLIER_CALLS=0`，覆盖并发、限流前未提交、accepted timeout、不重放、expired lease CAS、BYOK、批次调度。详见 `NATIVE_CONCURRENCY.log`。
- `verify-billing-rules.ts`：`PASS dynamic quotes, frozen prices, partial/failure/BYOK policies, result validation`，exit 0。

原生脚本命令需要先显式设置上述本地 `DATABASE_URL`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NAUMI_MULTI_USER=1`，再执行：

```text
node --conditions=react-server --import=tsx scripts/verify-image-terminal-failure.ts
node --conditions=react-server --import=tsx scripts/verify-image-concurrency-convergence.ts
```

### 已记录的失败与未完成项

- 旧 `tsx` CLI 启动形式未传递 react-server condition，报 `This module cannot be imported from a Client Component module`；只结束本次确定 PID 的失败测试进程，改为 `node --conditions=react-server --import=tsx` 后终态回归通过。
- 扩展 `--review-regressions`：A+ redo 两种初态与五个 completion race 已通过，随后测试发布旧草稿遇 `PUBLISH_STALE_DRAFT_BASE`（v1 → v2），整条脚本 exit 1。该完整扩展回归**未通过**；没有改模型发布规则或绕过其门禁。日志 `REVIEW_REGRESSIONS.log` 供父线程后续修正 fixture 再测。
- 本轮新用例曾因旧基线多个活跃 fixture 占满 suite 默认 4 槽而未进入恢复回调；仅将测试 VM 的 suite 并发设为 64 后重跑通过，不改业务默认。失败留档 `HARNESS_LANE_LIMIT_FAILURE.log`。
- 连接池 checkout 的独立超时/迟到连接归还由 X3 所有；X2 的本地 deadline 不等同池饱和已解决。未更改/扩容公共池。
- 已接受但无可查询 task ID、且结果未 checkpoint 的旧 owner 迟到响应仍不能覆盖新 owner；保留 UNKNOWN 与原预占，由既有核对链路处理。没有以恢复为名重放供应商请求。
- 没有执行生产 60 并发或生产故障注入，不声称全站容量达标；未修改图字节表示、队列默认值、shared BI/db/worker 文件。

## 副本回滚与父线程入账建议

四产物：证据目录内 `MODIFIED_FILE`（路径/hash manifest 与修改副本）、`DIFF_FILE`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。脚本只允许固定 `rollback-copy`，先全量验证 hash，之后恢复原两文件并移除验证副本新增文件；拒绝后续编辑。回滚复制文件后重新跑 baseline，恢复的是原缺陷与原有防线，主 worktree / modified 副本保持修复状态。确切命令、输入、字面输出、退出码见 `VERIFICATION.txt`。

父线程建议（不擅自分配新编号）：

- A3/A16、D8 更新为“本轮隔离实测并修复，待父线程整合；未部署”，把“一次异常直接双扣费”改为“心跳永久中断、失租后回调/锁等待提交窗口；已有 checkpoint/账务唯一性防线保留”。
- 对行锁等待使用旧时间、钱包锁越期提交、旧 owner hold/evidence 回写分别按父线程编号规则入 A/D；触发→症状→原因→修复证据见上表。
- X5 可依上述接口接入；X3 继续接管 checkout/控制面池隔离；扩展 review fixture、生产验收和 45 笔手术维持未完成状态，不与本轮离线通过混写。
