# X3 后续：可靠未受理证明与有界显式恢复（2026-10-29）

## 固定基线、职责与状态

- 工具分配 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-4608267e`，分支 `t3/tick-nonacceptance-protocol`。开工工作树干净；`git fetch origin main` 后 HEAD 与 origin/main 均为 `a65a65d02b0fc5fd46a0eafa5f0f015559446c1c`。没有创建 checkout、整合未知分支或改共享源码。
- 本棒只交独立固定提交，交父线程串行审查。不 push、不 merge main、不 PR、不发布。47 HOLD 继续；无 SSH、生产 SQL、供应商请求、线上重启/切流/故障注入。45 笔手术和在线索引仅挂账。
- 总 ledger/A/D 编号由父线程拥有；本文件是唯一新增的模块交接文档。
- 本地默认普通池 5、tick 池 2 不变；没有新增 Pool、供应商/业务重试或新服务。

### 模块与公共接口

| 模块 | 职责、依赖和状态归属 |
|---|---|
| `worker-tick-receipts.ts` | PG 回执所有者；v1 API 保留，新增 `acceptFenced`、`proveNotAccepted`、`readFenced`、`runFencedWorkerTick`；accept/negative 用同表同 UUID 主键竞争，在自己的短事务提交后释放连接。 |
| `worker-tick-protocol.ts` | v2 固定入口、域分离鉴权、完整身份解析、只读能力声明。只依赖凭据读取和回执身份定义。 |
| `/api/video/worker/tick/v2/route.ts` | 实际鉴权、显式 action、响应映射和组装。没有 legacy/no-identity 扫描分支。 |
| `worker/tick-scan.ts` | 从原 tick route 原样提取现有扫描序列，v1/v2 共用。不改变任何业务扫描、媒体、计费、X5 持久化或 X4 供应商逻辑。 |
| `scripts/worker-runtime.mjs` | 本地意图、原 worker boot、控制 CAS、有限证明请求与持久化操作日志；控制 SQL 与扫描/外部网络没有跨网络持连接。 |
| `src/middleware.ts` | 精确 v2 路径/方法的服务鉴权；旧用户权限和旧 worker 白名单不变。 |
| `video-worker-with-media.mjs` | 只透传显式协议选项，将两个证明操作按 drain 同步到媒体；不自动 resume。 |

## 先复现：503 + GET404 确实没有可恢复证据

使用自己的 Docker `naumi-x3-negative-4608267e`，label `io.naumi.fixture=x3-negative-4608267e`，仅 `127.0.0.1:55469`，数据库 `naumi_x3_negative_fixture`。启动测试前验证 label 与端口绑定；每次随机 schema。runner 清除继承的 DATABASE_URL/PG*/NODE_OPTIONS 后显式设置本地配置，不读 dotenv 或生产凭据。

在源码修改前停掉这个独立 PG，调用真实 v1 route（真实 `imageWorkerAuthorized`），Worker 收到 HTTP503；再启动 PG，GET 原 UUID 返回404。真实 WorkerRuntime 不再扫描，也不 reconcile：

```text
PREACCEPT_CONNECTION_FAILURE HTTP=503 GET=404 STATE=UNKNOWN ORIGINAL_UUID=RETAINED SCANS=0 PAID_CALLBACKS=0
```

这是成功复现缺口，不是基线具备可靠恢复。现有 UNKNOWN 防重放本身正确，保留它；不能把事故中的 v1 UNKNOWN 升级成新证明。

## 协议证明：不是“查无行就签证”

### 1. 所有可以接受原 v2 请求的路径

1. v2 Worker **只**访问固定 `/api/video/worker/tick/v2`，fetch `redirect:'error'`，没有 v1 fallback。
2. v2 使用 `x-naumi-worker-v2-auth = hex(HMAC-SHA256(VIDEO_WORKER_SECRET, "naumi-worker-tick-v2"))`；**不发送** `x-video-worker-secret`。该域分离值不能通过旧 route 的原始 secret 比较。旧服务没有 v2 route；即使中间入口把 URL 错改成旧 `/tick`，实际旧基线 route 也返回401，扫描0。测试同时调用当前与固定基线的真实鉴权代码，不用相等比较 stub 替代。
3. Worker 先 GET v2 `?action=capability`：必须返回协议2、固定 endpoint、`receipt-primary-key-v2`、准确 target instance/commit、preload 进程 boot。缺能力/旧服务/无 preload/不匹配/解析故障时，只读发现停止，Worker 保持UNKNOWN并持久暂停，accept POST为0；没有完整原目标身份时也不生成负凭据。
4. 完整身份和 `phase=dispatched` **先写入本地状态并 fsync/原子 rename**，然后才 POST `?action=accept`。身份包括原 tick UUID、worker instance/boot/commit、目标 web instance/boot/commit、协议2。发现阶段 `preparing` 的重启保留为UNKNOWN并暂停，标记 `CAPABILITY_DISCOVERY_INTERRUPTED`；没有足够绑定身份时不继续POST或签证。
5. 每个 v2 accepting route 检查完整身份，并且只调用共享 receipt store 的 v2 accept。不同 Web boot/commit（包括滚动切流的新进程）拒绝受理或建立新的负凭据；不会替旧进程声明“没接收”。
6. 以上证明依赖已绑定的 Web boot 对应同一持久数据库、连接配置不在同 boot 内替换；不支持数据库回灌、删除回执、克隆 boot 或网关注入旧原始鉴权。线上入口/固定制品/启动 preload 与数据库归属仍需发布前验收。本任务没有自动启用协议。

### 2. 同一持久主键是 fence

增量列：`protocol_version integer NOT NULL DEFAULT 1`、`nonacceptance_at timestamptz`。不替换原表、主键、约束或原回执，不改变现有业务表。

- accept：`INSERT ... phase='running', protocol_version=2, nonacceptance_at=NULL ON CONFLICT(tick_id) DO NOTHING RETURNING *`。
- negative：`INSERT ... phase='unknown', protocol_version=2, nonacceptance_at=clock_timestamp() ON CONFLICT(tick_id) DO NOTHING RETURNING *`。
- 两条 INSERT 使用**同一 `app_worker_tick_receipts(tick_id)` 唯一索引**；并发冲突等另一事务提交/回滚，因此最多一个插入成功。没有“先 SELECT 无行就返回证明”的分支。冲突行再校验所有 owner/目标/协议字段。
- accept 赢：只在该 INSERT 的 COMMIT 已返回后扫描一次。`running/completed/unknown` 且无 `nonacceptance_at` 的行一律不转为 negative；证明返回409。受理后丢响应只 GET 匹配 completed，绝不重扫。
- negative 赢：COMMIT 已返回后才返回 `schemaVersion=2, phase=not_accepted, acceptedAt=null, nonacceptanceAt=...`。原表保存 `phase=unknown` 阻塞旧代码的同 UUID INSERT；真实基线模块也返回 duplicate/unknown、扫描0。回包丢失不删除行，重复证明返回同一时间戳和身份。
- 旧 `accepted_at NOT NULL` 为兼容性保留，在 tombstone 物理行中是建立 fence 的时间，不是发生受理；v2 输出明确 `acceptedAt:null`。审计应同时看 `protocol_version/nonacceptance_at`，不能只看此旧列推断受理。
- 事务保留原 500ms lock、3000ms statement、5000ms idle 预算，并显式 `SET LOCAL synchronous_commit=on`。COMMIT/DB/连接失败均不发有效证明，不调用扫描。原 X3 借出 Client error listener/销毁/迟到 checkout 行为不被测试替代。
- fence 无 TTL、没有删除接口；不能在仍可能有延迟原 POST 时清理 tombstone。无证据的数据库回退不属于恢复手段。

### 3. GET 与滚动重启

- 普通 v1/v2 GET 仅 SELECT（或返回静态进程能力），不建表、写行或生成证明。无表503、无行404均不放行。
- 首次 v2 鉴权 POST 执行加列迁移；迁移超时仍503，不扫描。旧 v1 创建/读取表语义保留。
- 同 instance/commit 的新 Web boot 可 **只读已存在** 的 completed 或 negative 原行；row 的原目标 boot 必须精确匹配持久 Worker 意图。它不能为旧 boot 的缺失行创建 negative。新 boot 的 GET404仍 UNKNOWN。
- 读到旧 Web 已经提交的 negative 不等于新 Web 替旧 Web 签证：所有延迟 v2 accepts 受同一原行主键约束；不符合身份的旧服务先在域分离鉴权处失败。

## Worker 有界恢复：只交显式操作

保持 `NAUMI_WORKER_TICK_PROTOCOL=1` 默认。候选部署核验后才可显式设为 `2`，必须启用原 durable control 与真实 preload；这里只实现，不改任何站点配置。

两个新 Worker `/control` action（仍用原控制服务鉴权）都要求 `operationId`、当前 Worker `bootId`、`expectedRevision`、原 `tickId`：

```json
{
  "action": "prove-nonacceptance",
  "operationId": "OPERATION_UUID",
  "bootId": "CURRENT_WORKER_BOOT_UUID",
  "expectedRevision": 7,
  "tickId": "ORIGINAL_UNKNOWN_TICK_UUID"
}
```

- `prove-nonacceptance`：最多 **3次/原tick** 的显式 POST证明请求，每次最多4000ms（若 tick timeout更短则取较短），请求前先持久计数/操作指纹。重启不清预算；没有自动重试/轮询定时器。
- `reconcile-nonacceptance`：最多 **3次/原tick** 的显式 GET读取已存在negative，同样每次最多4000ms、请求前持久计数。用于负凭据提交后丢回包或 Web重启，404/无匹配行保持UNKNOWN。这不是允许 GET 建立证明。
- 最坏新增证明网络预算为6次×4秒；持久重复成功 operationId直接返原操作回执，不发HTTP。失败后的重复写请求消费剩余预算，不能换操作UUID清零。
- 原 `reconcile` 只接收 completed；不会接收negative。v2不被既有自动 completed 恢复 supervisor选中（`automaticRecoveryEligible=false`）。本棒**无自动resume**。
- 证明网络等待期间释放控制串行队列；一次证明单飞。人工drain可先提交新revision，证明返回后CAS失败，Worker仍UNKNOWN且paused；随后可用新CAS显式读取已提交negative。manual paused永不由证明操作自动转运行。
- 成功闭环保留原tick身份，明确转为 `not_accepted`，操作日志永久保存 `originalUnknown`（原失败、时刻、worker boot、尝试记录）+完整server receipt+SHA256；不是删lastTick或换UUID假装无事。后续只有明确resume的当前boot/revision允许新tick，操作日志仍保留原拒收事实。
- 本地证明落盘失败设置controlFault；不确认成功、不resume。重启读旧已持久UNKNOWN/attempt，重试仍受预算约束。新旧commit/identity变化无法复用状态文件。
- 合并Worker/Media代理只把证明映射为drain，并保持scanner permit关闭；它仍串行处理组合控制。并发drain若经过该代理排队而失去原revision，可返回409并要求刷新状态；此前/此后始终paused，不会因证明隐式恢复扫描。

## 验证命令与证据层级

证据目录（Git ignored）：`C:/Users/13357/.t3/worktrees/naumi/t3-4608267e/output/capacity-x3-nonacceptance/`。

依赖只读复用 `t3-18c8ab7e/node_modules`，仅本worktree创建junction；没有安装/写共享依赖。Node24.19.0、React19.3.0、真实PG16容器。实际route函数经esbuild加载，仅扫描入口替换为合成回调；实际v1/v2鉴权、store、pool、WorkerRuntime未加测试锁/幂等/error listener。真实middleware另直接导入并调用。**这不是完整Next打包启动/生产链路验收**。

1. `node scripts/verify-capacity-x3-nonacceptance.cjs output/capacity-x3-nonacceptance/baseline baseline`：exit0，真实受理前连接故障503/GET404/UNKNOWN/扫描0；`RECOVERY_PROTOCOL=ABSENT FENCE_API=undefined`。
2. `node scripts/verify-capacity-x3-nonacceptance.cjs . modified`：18组真实隔离PG+本地HTTP+实际route鉴权+Worker重启验收，最终一轮 `SCANS=14 PAID_CALLBACKS=14 ACCEPT_REQUESTS=25 PROOF_REQUESTS=23 RECEIPT_GETS=17`，双向竞态受理10/拒收2、重复扫描0。最终字面输出见`MODIFIED.log`和`VERIFICATION.txt`。覆盖双向竞争、旧鉴权误路由、提交后丢响应、重复请求、read-only GET、错owner/protocol/boot/commit、并发control、manual drain、写失败、真实DB停机/恢复、行锁超时、4秒HTTP超时。每次scan严格对应1次合成paid callback；真实供应商0。
3. `node --test scripts/test-worker-runtime.mjs scripts/test-worker-nonacceptance.mjs scripts/test-worker-recovery-process.mjs`：34/34，exit0。新增8组控制/协议边界属于实现fixture；其中既有recovery-process另跑真实进程，不能把34组全标为真实PG。
4. `node output/capacity-x3-nonacceptance/run-existing.cjs`：真实本地DB与实际v1 route鉴权59项，exit0；`WORKER_TICK_RECEIPTS=PASS CHECKS=59 ... HTTP_TICK_POSTS=2 HTTP_TICK_GETS=1 FIXTURE_JOB_POSTS=3 REAL_SUPPLIER_CALLS=0`。
5. `node scripts/verify-video-worker-with-media.mjs`：91断言，exit0，`real_processes=0 network_calls=0 supplier_calls=0 sandbox_acceptance=false`。只称生命周期fixture；新组合证明操作另在新增8项中验证。
6. `node node_modules/typescript/bin/tsc --noEmit --incremental false`：全项目空输出，exit0。
7. `git diff --check`：exit0。

真实Worker重启场景使用原 `scripts/video-worker.mjs`，四次独立启动，原请求/原boot和已持久尝试保留；首次证明丢回包后重启只GET闭环，重复operation无HTTP，人工resume后才新增一个合成扫描。Windows `child.kill('SIGTERM')` 的字面退出为 `exitCode=null, signalCode=SIGTERM`，不伪称Linux优雅退出0；退出前已经实际control drain并核验paused。旧v1重启测试也集中通过。

### 保留的未通过/调整尝试

- `MODIFIED-attempt1.log`：fixture在关闭池后还持有旧store，`Cannot use a pool after calling end on the pool`，exit1；仅修runner按真实pool代重建store。
- `MODIFIED-attempt2.log`：前13组通过，Windows子进程已SIGTERM退出而fixture在finally再次等待exit，runner挂住。确认本任务PID后结束此runner，保留日志；修为同时检查`exitCode`和`signalCode`，不把Windows信号终止记exit0。
- `TYPECHECK-attempt1.log`/`TYPECHECK-attempt2.log`：新增控制队列的JS返回类型推断分别泄漏void/内部intent，exit2。补泛型队列签名并区分公共结果与内部intent后，全项目tsc exit0。旧失败不删除。
- 竞态赢家数量取决于调度，最终统计必须引用同一轮`MODIFIED.log`，不拼接几轮数字。

## 四产物与 copy-only 回滚

- `MODIFIED_FILE`：基线/修改副本的逐文件SHA256 manifest，记录新增文件及保留的不变连接工厂。
- `DIFF_FILE`：本任务源码、测试与此独立文档的完整差异。
- `VERIFICATION.txt`：BASELINE/MODIFIED/ROLLBACK确切命令、输入、完整字面输出/退出码、失败尝试及恢复行为。
- `ROLLBACK.sh`：可执行，目标固定在自身证据目录`rollback-copy`；先核验marker、真实绝对路径、全部当前文件hash与基线副本hash，再写任何文件。只恢复本任务副本；新增文件仅在该副本中删除，不覆盖工作树、修改副本或未来用户编辑。
- 命令：`D:/DEV/Git/bin/bash.exe output/capacity-x3-nonacceptance/ROLLBACK.sh`，再执行 `node scripts/verify-capacity-x3-nonacceptance.cjs output/capacity-x3-nonacceptance/rollback-copy baseline`。副本恢复原503/404/UNKNOWN以及缺少新协议的行为；工作树/`modified-copy`仍为修改版。还验证篡改hash后退出非零且无额外写入。

## 未完成项与父线程下一步

1. 原有v1 UNKNOWN（包括历史事故）保持UNKNOWN，不能由v2能力或GET404补签；本切片解决的是**以新完整协议发出的请求**。已running/unknown且非negative的受理行仍需要原业务证据，不提供重扫捷径。
2. 新Web boot仅可读取已有证明；旧boot消失且缺原持久行时，仍UNKNOWN。本实现不引入跨boot自动签证或自动resume。
3. 协议默认未启用；需要父线程串行代码审查、固定制品及真实Next路由/滚动版本/入口配置验收。生产总连接余量、长期回执增长/保留策略和真实业务端到端尚未验证；禁止用本地scan计数推断目标用户容量。
4. 完整Linux生产构建、真实Next多bundle/中间件HTTP启动、正式组合容器信号退出与蓝绿发布未执行。保留47 HOLD，本任务不解除任何现场状态。
5. 回滚程序只作用于副本；真实版本回退必须保留数据库新增列/tombstone与原Worker状态。旧Worker不识别`preparing/not_accepted`时拒绝启动是fail closed，不删除状态绕过。部署回退要保持可读v2状态的兼容Worker。
