# 清单21：图片执行并发收敛（本地实现）

- 基线：`05598fe53bd03bfbaa74ff6ee5b39c2b689cb055`，包含冻结报价前置提交；独立 worktree `t3-a395edab` / `t3/image-concurrency-convergence`。
- 本轮不访问网络、供应商或生产，不触碰主 checkout；不 push、不发布。报价与批次提交确认由父任务整合。

## 保留的执行控制

1. `image-job-queue.ts` / `claimImageJob` PostgreSQL lane 是常规持久作业的统一执行准入：默认 generate=16、imagegen=16、suite=4、aplus=4，`NAUMI_IMAGE_JOB_CONCURRENCY_<KIND>` 显式调整，允许 1..256。`claimImageJob` 的事务 advisory lock、活跃 lease 计数、120 秒 lease、25 秒 heartbeat、token 写入、结算幂等全部保留。超过容量留 DB，不加载图片到 Web 等待；`runJob` 本地输出重处理/存储/交付仍在同一 generate lease 内。原有 `stored-delivery` 人工恢复使用独立 advisory 锁，不改动，也不把它声称为本轮新覆盖的 lane。
2. 父编排与生成子任务分 lane，避免父占满子执行位的死锁；batch concurrency 仅表达用户批次调度，不再与 `GEN_MAX_CONCURRENT` 重复取 min。
3. 删除 generate route 的模块级默认4内存槽。单 job 内多图片顺序执行，跨 job 继续由 DB 并发；避免解除默认4后一个 8 图 job 放大为 8 个并行图片缓冲。原先结果顺序、稳定 index operation id、部分成功逻辑保留。
4. 供应商并发由后台发布的 PostgreSQL 共享账户预算约束，跨实例、历史冻结任务共享。移除 `NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS` 的实际 bypass，summary 不再显示 unlimited；旧任务不得用旧 maxConcurrent 降低或抬高当前预算。

## busy 与未知受理边界

- `ImageOperationDeferred` 是仅本地 capacity claim / channel scheduler 制造的类型信号，不信任供应商 JSON 的 code/name。OpenAI SDK cause chain 只提取本操作/合法 image index 的信号。
- `paidOperation` 仍先持久化 `started` 保守意图；本次新增 `attemptToken`。仅原先非 started、共享 `dispatchState.attempted=false` 且当前 job 持有效 lease 时，以同一 snapshot 更新把本次相同 token 的 started 改为 queued，同时设置 pending / queueState=execution。`saveImageJob` 的 token/有效期约束是写入 CAS，执行上下文 queue 串行快照变更；异常或进程退出不会放宽重放权。
- `handlePending` 仅识别已经保存的 queued + attemptToken + queueState，保留原 reservation，由现有 `releaseImageJob` 的 10 秒 backoff 和 `dueImageJobs` 恢复同 job / 同 operation，不创建新队列、Redis 或 manager。
- 旧 started 初始化共享 attempted=true；同根 fan-out 任一 POST 使其永远为 true。此后 capacity busy 仅在低层 acquire/claim 内、250ms 间隔、原 signal 与 provider timeoutMs 界内重试，不重跑 adapter 或 POST，不把整根任务改回 queued。取消/超时保持保守未知受理规则，不重放付费调用。
- 同 job 的其他旧 started 也阻止整 job 重排；嵌套图片操作继承根 dispatchState。legacy/BYOK/Flow 的 supplier-cost 原 fetcher 分支统一在实际 POST 调用前记录共享 dispatch 标记；managed costScope 保留更低层 modelEndpointFetch 在容量/实时开关之后的原标记，未 claim 不标 dispatch。
- APIMart 只清本次 `claimed.rowCount` 取得、无 taskId、匹配 requestHash 的未发出 marker；typed 分支不删除 routing pin。旧 marker、已接受 taskId 与旧 pin 均保留。typed 信号沿既有 Pending catch 到 durable，避免供应商健康失败与 cooldown 误计。
- channel claim busy 在创建 execution stage/供应商调用之前；stage-routing 的本地延期记 `not-submitted`，不记 unknown；跨恢复 maxAttempts / 估价只计算非 not-submitted 的阶段，stage-cost 的该状态明确记未收费0。实际 POST 的 submitted/unknown/response-received 原尝试计数不变。模型健康监控排除 typed deferred。

## 集中验收

受控 harness：`scripts/verify-image-concurrency-convergence.ts`；独立本地 PostgreSQL 容器与 schema、127.0.0.1 HTTP PNG 供应商。真实 plan/submit/generate worker/parent poll、reservation/ledger、DB lease 与实际 HTTP 并发，不以源码匹配替代运行验收。

集中 harness 已通过（全部仅本地 fixture）：

| 检查 | 字面结果 |
| --- | --- |
| 基线满额 | `BUSY_POSTS=0 BUSY_STATUS=error PAID_STATE=rejected CHARGED=0` |
| 同 op busy 恢复 | `DB_BACKOFF_SECONDS=10 SAME_OP_POSTS=1 LEDGER=1 CHARGED=6` |
| 原子延期 | `NEW_ATTEMPT_TOKEN_LEASE=1`；`EXPIRED_LEASE_REQUEUE=0 CHANGED_ATTEMPT_REQUEUE=0` |
| DB lane | `CONCURRENT_CLAIMS=6 ACTIVE_MAX=2 WAITING_IN_DB=4` |
| 后台预算/监控 | `EXPLICIT_BUDGET=1 ENV_BYPASS=0 FAILURE_COOLDOWN_DELTA=0` |
| APIMart | `APIMART_OWN_MARKER_CLEAR=1 OLD_MARKER_PIN_PRESERVED=1` |
| 真 stageRoutingFetch | `BUSY_RECORDS=2 NOT_SUBMITTED_COST=0 MAX_ATTEMPTS=1 RECOVERY_POSTS=1` |
| 取消/超时 | `NEW_POSTS=0 OLD_STARTED_NOT_REQUEUED=1 STREAM_CANCEL_LEASES=0` |
| 真已发出后超时 | `ACTUAL_POSTS=1 PAID_STATE=started REPLAYS=0 PROVIDER_LEASES=0` |
| legacy/BYOK | `ACTUAL_BYOK_HTTP_POSTS=1 LATER_DEFER_REQUEUE=0 CAPACITY_BEFORE_DISPATCH=1` |
| fan-out/旧任务 | `FANOUT_TWO_INDICES_POSTS=2 BUSY_RECOVERY_AT_ACQUIRE=1 UNKNOWN_REPLAYS=0 OLD_STARTED_PRESERVED=1` |
| 显式 DB/provider6 | `ACTUAL_HTTP_PEAK=6 OBSOLETE_GEN_ENV=1 PROVIDER_LEASES=0` |
| 真 legacy route6任务 | `SIX_OPERATIONS=6 ACTUAL_HTTP_PEAK=6 GEN_ENV_SLOT_IGNORED=1` |
| 真 batch | `EXPLICIT_CONCURRENCY=5 FIRST_TICK_SUBMITTED=5 GEN_ENV_IGNORED=1 CANCEL_POSTS=0` |

日志/封版：`output/concurrency-convergence-20261023/{BASELINE.log,MODIFIED.log,TYPECHECK.log,ROLLBACK.log,VERIFICATION.txt}`。命令统一为 `node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-image-concurrency-convergence.ts`；baseline/rollback 增加 `--baseline`。测试 DB 环境只允许 `NAUMI_VERIFY_ISOLATED_DB=1` 与 127.0.0.1。最终 `tsc --noEmit`、受影响文件 ESLint、`git diff --check` 均 exit0；副本 `ROLLBACK_SOURCE=PASS RESTORED_FILES=13 BASELINE_HASHES=PASS TARGET_COPY_ONLY=1`，并重新跑出原 busy=error/rejected 行为。当前修改副本保持修改状态。四件封版与逐条命令/字面输出见 `VERIFICATION.txt`；整体整合副本回滚由父任务负责。

未声称：2GiB 生产真实峰值内存/吞吐、线上接单、供应商验收或部署；默认 lane16 仍需由发布负责人按真实图片尺寸/主机容量显式调优。本轮完成一个并发模块，远端同步次数沿父任务登记；本轮无联网同步。
