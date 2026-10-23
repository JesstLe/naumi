# 图片通道与 A+ 审核恢复：3 个 P2 修复（仅本地）

## 基线与范围

- 父候选基线：`9f049b07b4219b46ef8a5cb51bc49a4a0ad33e26`，已普通合入 `a016518f`。
- 独立 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-7bad40b1`；分支 `t3/image-scheduler-recovery`。
- 开工 fetch 仅记录 `origin/main=1871f84d181c8b5dc48ee506544a3857875907c1`，本轮保持父候选基线，不整合其他业务变更。
- 实现仅修改 `channel-scheduler.ts`、`image-gateway.ts` 与 A+ `kickAplus` 的 reviewing 收尾；测试复用 `verify-image-concurrency-convergence.ts`。报价、请求与客户端文件由父任务处理。
- 本轮一个恢复模块，本地提交交父整合；不 push、不 SSH、不上线、不调用外部供应商。

## 修复边界

### 1. 已接受的非 durable pin 不再变为普通 429

`claimChannel` 在仍有候选但容量不足时，将已存在的 pin 传给 `imageCapacityBusy`。该 helper 先判断 durable：durable 继续抛 `ImageOperationDeferred`，由已经 dispatch 的调用在原低层 claim 循环内等待；非 durable 且有 pin 则抛 `ImageOperationPending`，保留原操作 ID，不能伪造为未收费拒绝。

没有 pin 的非 durable 请求仍使用原 `PROVIDER_BUSY`。不新增无条件 `if (pinned)` 抢先抛 Pending，不移除原 pin、旧 marker 或 supplier task ID，不放开重复 POST。

### 2. 候选耗尽返回原供应商失败

只有 `sorted.length > 0` 才产生本地延期。A 已明确返回 `422 not_charged` 并进入 visited、B 又被实时禁用时，`sorted=[]` 走普通 `PROVIDER_BUSY`；原 `channelRoutingFetch` 的 `attempted` 分支因此 break，返回保存的 `IMAGE_INPUT_REJECTED/422`，而不是每 250ms 等到 timeout 并丢失原分类。

### 3. A+ redo 收尾恢复审核等待

`kickAplus` 的 reviewing 分支完成重做循环后重新 `JOBS.get(id, false)`。仅最新 `status=pending`、`stage=reviewing` 且所有 source 均非 `redoing` 时，恢复 `awaiting_review`。延期后仍有 source 待重做则继续 pending；不使用 kickoff 的旧 sources/status，不改 preparing/generating、done/error/needs_attention。

## 真实 PG / 原 handler 定向反例

命令：

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55886/postgres'
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-image-concurrency-convergence.ts --review-regressions
```

本地独立 Docker PostgreSQL `naumi-scheduler-recovery-pg-7bad40b1`，随机私有 schema，127.0.0.1 HTTP 图片/异步任务供应商。`--review-baseline` 仅用于保存的 `9f049b07` 源码副本；不是对生产或真实供应商的验收。

| 运行反例 | 原始基线 | 修改后 |
| --- | --- | --- |
| 原 A+ POST redo_source → worker POST → GET，初始 awaiting_review/reviewing 与 pending/reviewing | busy 后恢复成功仍 `pending`，再次 due | 同 operation 重做一次后 `awaiting_review`，lease_until=null，due=0，GET 不再 loading |
| PostgreSQL BEFORE UPDATE trigger 在 source 完成时注入最新状态 | 记录现状对照 | done/error/needs_attention、新 source redo、stage generating 5 种状态不被收尾覆盖 |
| 真 channelRoutingFetch：A 422 明确未收费，响应时发布禁用 B | 仅 1 次 POST，但等待到取消后变 Pending，原 422 分类丢失 | 仅 1 次 POST，直接返回 `422 IMAGE_INPUT_REJECTED` |
| 真 APIMart 已受理任务 + pin，非 durable 再遇满额 | `429 not_charged` | `ImageOperationPending`，原 pin 保留 |
| 同一 pin，durable + dispatchState.attempted=true | 低层容量等待对照 | 释放容量后查询原任务，额外付费 POST=0；未 dispatch 的 durable 原始 claim 仍是 Deferred |
| 原 `editImage` SDK 实际接受本地异步任务后，原 `processCanvasImageTask` 满额恢复 | `failed`，实际 reservation 删除 | `needs_attention`，reservation=1、charge=0，task ID/marker/pin 原样保留，busy POST=0 |

定向日志字面终行：`REVIEW_BASELINE=PASS REAL_LOCAL_POSTGRES=1 REAL_HANDLERS=1 EXTERNAL_SUPPLIER_CALLS=0` / `REVIEW_MODIFIED=PASS REAL_LOCAL_POSTGRES=1 REAL_HANDLERS=1 EXTERNAL_SUPPLIER_CALLS=0`，均 exit0。

## 集中回归与封版

- 原完整 `verify-image-concurrency-convergence.ts` 通过：reservation/ledger 幂等、10 秒 backoff、lease/CAS、防重放、APIMart marker、stream cancel、stage audit、DB/provider 6 并发、原 generate route 6 并发及 batch5 均保留，exit0。
- `verify-apimart-async-images.ts`：53 checks 通过，原 pin/CAS、GET-only disabled recovery、冻结参数及 marker-only hold 保留，exit0。
- `verify-channel-live-guards.ts`：真实实时开关、最终 dispatch gate、半开恢复、原 Hub pin、防容量泄漏通过，exit0。
- 全量 `tsc --noEmit --incremental false`、限定文件 ESLint、`git diff --check` 均 exit0。
- `output/scheduler-recovery-20261023/manifest.json` 保存修改前/后原始字节 SHA-256；`ROLLBACK.sh` 仅允许指定 rollback-copy 副本，先校验修改后 hash，再恢复 4 个源/测试文件。该副本随后重跑新反例并恢复原 3 个缺陷行为，最终再检查原始 hash；当前 worktree 保持修复。
- 四件封版：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，以及 BASELINE / REVIEW_MODIFIED / CONVERGENCE / APIMART / CHANNEL_GUARDS / TYPECHECK / LINT / ROLLBACK 日志均位于上述 output 目录。确切命令、输入、字面输出、退出码和哈希见 `VERIFICATION.txt`。

父任务仍需按提交整合、重跑组合验收及独立审阅；本地测试不等于发布、真实供应商交付或正式站点验收。
