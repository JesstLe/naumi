# Worker UNKNOWN tick 持久回执与只读核对（2026-10-16）

## 范围与进度

- 独立分支 `codex/release47-worker-receipts-20261016`，起点 `96a0fa50037900fc5bc865f3e9a82ba187139c39`；只实现受控 Worker tick 服务端持久回执与 `reconcile`，不修改 host 执行器、其他 release-runtime 模块、middleware、Dockerfile 或 package。
- 已实现：每 tick UUID 与原 Worker boot/instance/commit、目标 Web instance；先落库接收再扫描；完成落库才确认；同 UUID 不重扫；UNKNOWN 通过认证 GET 查原回执；CAS/operation 幂等复核，成功后继续 paused，另行 resume。
- 未做：服务器连接、生产数据库/供应商调用、部署/切流/退役、host `worker_handoff.py` 适配。主控统一整合及执行；该候选功能未上线，不声称旧线上 Worker 支持新控制。
- 本模块只证明扫描 tick 的完成。`acceptedTasks / agentSessions / workerLeases` 仍为 null，不能作为所有业务已排空的 0。

## 请求与身份契约

受控 POST `/api/video/worker/tick`，全部必填 headers：

| Header | 内容 |
|---|---|
| `x-video-worker-secret` | 既有 Worker 密钥，至少 32 字符，不写日志 |
| `x-naumi-worker-tick-id` | 本次 tick UUID，发出前持久化 |
| `x-naumi-worker-instance-id` | Worker 固定实例 ID |
| `x-naumi-worker-boot-id` | 发起该 tick 的原 Worker boot UUID，重启不替换旧 tick 的此字段 |
| `x-naumi-worker-commit` | Worker 的完整 40 位小写 commit |
| `x-naumi-worker-target-instance-id` | 预期目标 Web 的固定实例 ID |

任一个受控 header 存在就必须提供完整且有效身份，缺失返回 400，不能降级 legacy 扫描。Web 要求 `NAUMI_INSTANCE_ID`、`SOURCE_COMMIT`，且 Web instance/commit 精确等于 Worker 声明目标与同镜像 commit；不匹配 409，配置未知 503，不扫描。

无上述五个受控 header 的既有 Worker POST 仍执行原扫描并返回原 `{ok,processed,...,at}`；没有由此声称 durableControl 或可排空旧 Worker。

GET `/api/video/worker/tick?tickId=<UUID>` 使用同一组身份 headers 与认证；query UUID 必须精确等于 header UUID。GET **只 SELECT**，不建表、不创建任务、不调用任何扫描/供应商。无认证 401，身份错误/冲突 400/409，无记录 404，DB/表不可用 503。

响应（GET 与受控 POST）：

```json
{
  "ok": true,
  "duplicate": false,
  "receipt": {
    "schemaVersion": 1,
    "tickId": "UUID",
    "worker": {"instanceId": "worker-instance", "bootId": "original-worker-boot-UUID", "commit": "40-char-commit"},
    "web": {"instanceId": "web-instance", "bootId": "accepting-web-process-boot-UUID", "commit": "40-char-commit"},
    "phase": "completed",
    "acceptedAt": "ISO-8601",
    "completedAt": "ISO-8601",
    "result": {"ok": true, "processed": 0, "at": "ISO-8601"}
  },
  "server": {"instanceId": "web-instance", "bootId": "currently-answering-web-process-boot-UUID", "commit": "40-char-commit"}
}
```

GET 不含 duplicate；受控 POST 已完成为 200，已接收但 running/unknown 的重复 POST 为 202、`ok:false`，只返回已有状态，不再扫描。回执 `web.bootId` 是原接收进程，`server.bootId` 是当前答复进程；同 instance/commit 的 Web 重启可以返回原已落库完成回执，不伪造新的完成。

## App 持久化与失败边界

- 追加唯一专表 `app_worker_tick_receipts`，tick UUID 全局主键；不调用通用 `ensureSchema`，不锁 app_users 或业务任务表，不启动候选自动领取。
- `running → completed` 通过 tick UUID + 原 Worker 身份 + 原 Web boot/instance/commit 的 UPDATE CAS；完成时间与 result 同事务落库。`completed` 不可重新扫描或覆盖。
- 原接收已落库但进程崩溃/失联时保留 running；扫描或回执写入异常尽力标 unknown。两者都不能视为完成；即使过期也没有“清理后重跑”。
- DB 获取连接上限 3 秒，事务 lock_timeout 500ms / statement_timeout 3s / idle-in-transaction 5s；专表 DDL 同样受限，失败不扫描。完成持久化失败不把内存成功当持久完成。
- 同 UUID 的已知回执优先 SELECT；并发首次到达用主键 `ON CONFLICT DO NOTHING` 只允许一个接收者执行扫描，其他请求返回该 UUID 回执。

## Runner 状态与显式核对

受控 Worker 额外需要环境变量 `NAUMI_WORKER_TARGET_INSTANCE_ID`；状态 identity 包含目标 instance，漂移拒绝复用。`/status` 增加 `durableTickReceipts:true, receiptProtocol:1, targetInstanceId`，旧 Worker 不具备这些字段，host 不得据旧 durableControl 单独认定支持新协议。

每 tick 意图在本地 fsync 后才 POST，携原 workerBootId/workerInstanceId/workerCommit/targetWebInstanceId；受控响应必须精确匹配这四项、UUID、Web commit/instance、合法 boot 与完成时间及 result.ok。旧 `{ok:true}`、损坏 JSON、中间层错 commit/instance、HTTP 错误、超时均不接受为完成；UNKNOWN 自动暂停且无后续 tick。受控模式不能通过 `stopOnUncertain:false` 绕过。

认证 Worker 控制 POST `/control` 新动作：

```json
{"action":"reconcile","operationId":"new-UUID","bootId":"current-worker-boot-UUID","expectedRevision":3,"tickId":"original-unresolved-tick-UUID"}
```

- 只允许 paused + uncertain + lastTick.phase=unknown + activeTicks=0；原 tick 身份必须完整且对应本 Worker/目标。
- 仅向原 origin GET 回执（最长 10 秒、响应 ≤16KiB），不发 tick POST，不发供应商/任务 POST。running、unknown、404、失联、坏响应或身份不符都返回 `WORKER_TICK_RECONCILE_UNVERIFIED` 409，revision/UNKNOWN 保持不变。
- 已完成证据通过后将 lastTick 标 complete、uncertain=false、revision+1，**paused 仍为 true**；复核操作记录持久包含原 Worker boot、完整 serverReceipt、SHA256、当前答复 Web 身份和时间。持久失败转 controlFault，重复操作不承认成功。
- operationId 相同且 fingerprint 相同返回原复核记录，不重复 GET；相同 operationId 变内容冲突。同 UUID 跨 Worker 重启核对原 tick.workerBootId，不用新 boot 替代；新控制动作仍要求当前 boot + revision CAS。
- 需要显式独立 resume 才恢复新 tick。无完成证据的服务端运行/未知/失联、旧状态缺原身份、实际活动请求不会被 reconcile 强清。

## 集中验收

1. 原始字节副本运行 `node --test .../baseline/test-worker-runtime.mjs`：15 tests / 15 pass / 0 fail，退出 0。
2. 修改版 `node --test scripts/test-worker-runtime.mjs`：23 tests / 23 pass / 0 fail，退出 0。覆盖原 15 项及只读核对、跨 boot、错身份/坏响应/运行中/失联拒绝、CAS/幂等/写失败、不能关闭 UNKNOWN 闸、实际活动请求拒绝；受控 401/403 无精确回执也保持 UNKNOWN，不能将中间层拒绝当作可靠未执行证明。
3. `NAUMI_VERIFY_ISOLATED_DB=1 npx tsx --conditions react-server scripts/verify-worker-tick-receipts.ts`：

```text
WORKER_TICK_RECEIPTS=PASS CHECKS=59 STORAGE=ISOLATED_POSTGRES RESPONSE_LOST=READONLY_RECONCILE DUPLICATE_TICK=NO_RESCAN RESTART=ORIGINAL_BOOT PAUSED=YES HTTP_TICK_POSTS=2 HTTP_TICK_GETS=1 FIXTURE_JOB_POSTS=3 REAL_SUPPLIER_CALLS=0
```

退出 0，仅本机随机 schema、随机端口，验证只创建专表；覆盖接收/完成 CAS、并发 5 次同 UUID 只扫描一次、原 boot 冲突、Web 重启查询、扫描失败、完成回执写失败、DB接收失败、500ms 行锁超时；真实 Next GET 认证/404/身份/duplicate POST 不扫描；真实 runner 响应丢失→重启→GET 核对→保持 paused，重复 tick POST 无新增任务。3 次 synthetic job POST 分属独立测试，真实供应商为 0。

4. Linux Docker 网络隔离、192MiB/1CPU、只读脚本挂载、32MiB tmpfs 子进程验收：

```text
WORKER_HANDOFF_PROCESS=PASS PAUSED_START=YES NO_ABORT_ON_DRAIN=YES RESTART_PAUSED=YES CRASH=UNKNOWN READONLY_RECONCILE=YES NO_REPLAY=YES CALLS=2_FIXTURE SUPPLIER_CALLS=0 EXIT=0
```

只终止本机 fixture 子进程，不对真实业务执行 SIGKILL。Windows 直接运行该 Linux 信号测试因 SIGTERM 被实现为进程终止而未通过，其结果不作为 Linux产品失败或验收；已用实际 Linux 容器完成重验。

5. 全库 TypeScript `tsc --noEmit --incremental false` 已通过；只做本模块集中检查，不全量构建。

## 四件复制回滚证据

位置：`C:/Users/13357/.codex/worktrees/release47-worker-receipts-20261016/naumi/output/release47-worker-receipts-20261016/`：`MODIFIED_FILE`（修改版 worker-runtime 的真实副本）、`DIFF_FILE`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。

保留原 Git blob 字节与 SHA256，rollback 只允许本证据目录的已标记 rollback-copy，拒绝操作共享/生产目录。实际执行恢复原四文件后 15 个 baseline 测试全部通过、退出 0；修改版 MODIFIED_FILE 和任务 worktree 保持修改，未回灌业务数据库或清除 unresolved 状态。线上程序回退必须保留持久回执表与原 Worker 状态；旧程序不能消除尚未核实的 tick 债务。
