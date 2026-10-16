# 47 发布：真实后台 promise / 原 Agent 续行

## 范围与交付状态

- 追加于上一子模块 `6a66783c6b6ea4a850940dd53c4518820e2b47d7`，仍在独立分支 `codex/release47-app-drain-20261016`。
- 按根任务新增授权，负责后台业务文件、`agent/naumi-tools.ts`、`bi/model-observer.ts` 和 middleware 的最小原Agent续行封装；不改根任务observer、host控制器或Worker tick receipts。
- **只做本机隔离PG/HTTP/Next验证；服务器连接0、真实模型/供应商调用0。** 用户已接受18:30短维护迁移的决定由主控记录；本模块不把维护迁移叫作零中断蓝绿，不证明legacy进程已经排空。

## 实现

### 1. 真实后台所有权，不用timer/Map大小伪造计数

新增 `background-activity.ts`，全部从PG持久登记开始、保持10秒heartbeat，到实际业务promise连同finally结束后才完成。

- `withBackgroundActivity(scope,key,'claim'|'continuation', action,onDraining)`：await完整promise。
- `detachBackgroundActivity(...)`：**先await持久登记再返回**；返回后仍独立追踪void promise，worker tick或HTTP结束不会使该租约结束。
- `bindBackgroundClaim(originalWorkKey,originalLeaseToken?)`：登记实际业务任务ID、原业务lease token和boot；不替换原lease、原幂等或冻结参数。
- 崩溃/心跳过期不自动清零；异常未确认则unknown。重启旧boot仍活动保留unknown，旧active/unknown同scope+admissionKey拒绝自动新claim。显式GET-only恢复可以使用continuation scope，不重发供应商任务。
- 注册时与admission同一boot行事务锁，drain返回后无新普通claim。已接受span和可信原Agent的后续child允许自然完成。
- PostgreSQL新增字段`work_scope/work_key/admission_key/claim_token/parent_id`。`admission_key`不因后续绑定具体taskKey而改变，避免重复扫描绕过同一已接工作；`parent_id`记录可信原run/已接promise的子执行。
- 双层执行权：release lease只观测本地promise；原业务row lock、lease_token、120/330秒业务租约、billing和幂等仍决定业务执行。本模块不增加收费请求重试。
- 已完成request观测15分钟和accepted-work观测7天后才限量清理；active/unknown记录不清理。nonce在签名过期窗口之后才限量清理。

### 2. 已接入的13类执行范围

| scope | 实际接入点 | drain行为 |
| --- | --- | --- |
| durable-image | `DurableImageJobs.kick` 在`claimImageJob`前登记，await原`execution.run`及queue/finally；绑定原lease_token。recovery-dispatch scan也覆盖 | 新claim跳过；已accept callback继续；原未知不重新kick |
| reference-text | 原claim事务到`executeText`、文本持久化、可选自动生图全过程；原active Set早清理不再影响观测 | 新text claim跳过；已接void promise及其已授权child继续 |
| reference-sync | 同步原operation及recovery扫描 | 普通查询只续读；不凭read continuation获得新付费claim权 |
| imagegen-batch | submitted children的查询、结果缓存与父批次状态结算 | 已接子项继续查询/结算 |
| imagegen-child | parent锁内`submitNext`前登记，绑定batch/item和原child/token | drain停止新child领取，已接parent span可自然提交既定子项 |
| canvas-image | `claimNextCanvasImageTask`前登记，贯穿`processCanvasImageTask`和原持久结算 | 无新普通claim；原leased任务继续 |
| media-job | 本地GET/publish/settle全过程；GET404才尝试的dispatch单独claim span | 原GET/DELETE/结算继续；无proof的新dispatch停止 |
| media-mirror | mirror scan及保存字节事务 | 无新mirror scan；已接scan完成，不调用模型 |
| media-variant | `ensureMediaVariants`的实际sharp/存储promise | 原素材读取派生继续并计数，不冒充付费job |
| supplier-scan | 原费用补查worker的整个claim/GET/ledger事务，绑定原job lease_id | 无新费用query claim；已接scan完成 |
| video-poll | 原`pollAndSettle`及business poll claim | 有upstreamId的GET-only续查/结算继续；queued/无upstreamId新创建claim等待open槽 |
| video-workflow | 原workflow锁、依赖和child执行promise | 新resume claim停止；已接workflow完成已冻结子项 |
| app-worker-scan | App内timer触发的video/workflow promise | 新timer扫描claim停止；已接scan真实结束才清计数 |

所有scope仅表示当前源码实际接入，不表示每个供应商已做真实调用验收。实际DurableImageJobs、真实BI重鉴权和通用13scope绑定已用隔离PG执行；其余业务入口保留原逻辑并TypeScript集中验收。

### 3. 原Agent续行：显式、短时、不可重放

避免drain误杀已接Agent下一步合法工具：

1. runtime.prompt从真实PG agent-run lease建立 `withAcceptedExecution`，身份为认证账号hash、runId、原instance/boot；不从模型文本/entry header猜身份。
2. `naumi-tools.internal` 只给**明确已接入正常withBiRequest的七个POST**签名：`generate-image/retouch/recolor/replicate/suite/aplus/packaging3d`。
3. `x-naumi-agent-continuation` HMAC含域分离、认证账号hash、原owner instance/boot/activity、完整path+query、method、30秒时间窗、UUID nonce；不输出日志或对话。nonce持久唯一，跨槽也不复用。
4. middleware在原feature gate之后验证签名、真实登录账号和PG原run仍active，不把middleware的ALS假设成route上下文。
5. `withBiRequest`仍先正常resolveUserEmail，再重新验证并**原子消费nonce**，随后进入独立route里的accepted ALS；实际ModelRequest/计费/能力/冻结上下文保持。
6. 后台claim只在PG验证其原parent仍active且新鲜后，才可越过draining admission；跨槽保留原owner不改写，child保存`parent_id`。结束后的run立即失去续行权，即使proof仍在30秒内。
7. 未接入的tool路径（如comfyui/run及其他无BI包装入口）**没有扩大豁免**，不发该proof；仍按原权限执行，其后台覆盖/续行需单列partial。
8. 普通GET continuation可读已有结果，但自身不能升级为新付费claim。已在drain前accept的后台span本身可持有子工作直到实际完成。

使用 `node:process Symbol.for` 共享ALS实例，避免同进程Next不同bundle各自new AsyncLocalStorage导致直接import工具丢失上下文；HTTP跨bundle必须显式验签恢复，已用实际Next测试。

## 状态schema新增与控制器使用

原 `/api/internal/release/status` 保持原鉴权/boot/commit/CAS。

```json
{
  "observations": {"trackedAcceptedWork":0,"unknownLeases":0,"acceptedTasks":null,"agentSessions":null},
  "background": [{"scope":"durable-image","active":1,"unknown":0}],
  "coverage": {
    "level":"partial",
    "allBackgroundAcceptedWork":false,
    "admissionScope":"agent-new-turns-and-instrumented-background-claims",
    "backgroundObservation":"local-promise-lifetime-only",
    "trackedBackgroundScopes":["durable-image","reference-text","reference-sync","imagegen-batch","imagegen-child","canvas-image","media-job","media-mirror","media-variant","supplier-scan","video-poll","video-workflow","app-worker-scan"]
  }
}
```

- 控制器可以据新实例本地真实`trackedAcceptedWork/agentRuns/trackedRequests/unknownLeases`、scope详情以及匹配preload的HTTP计数，确认这些**已接入的本地执行promise**自然结束。
- `background.active=0`不证明原供应商没有尚在运行的远程任务，也不证明独立media worker没有ffmpeg child；它们要业务租约/原taskId GET/外部worker观测。
- 没有完整启动清单、独立PiBridge、未列功能/第三方扩展与外部worker覆盖证据，所以**不设置complete，不把acceptedTasks/agentSessions改成0**。新槽可以得到真实局部排空，不把局部证据冒充全应用的充分条件。
- 13scope只是静态接入清单，不是运行时注册回执；root不得凭scope齐全数组就当“自进程启动起无遗漏”。

## legacy维护迁移风险复核

- `git show f4b3df1:scripts/video-worker.mjs`只有`running`布尔、fetch tick和setInterval，**无SIGTERM/SIGINT自然drain、无持久operation receipt**。默认SIGTERM可直接终止worker Node进程；不能用kill成功当旧accepted work自然结束。
- 新WorkerRuntime.shutdown也仅等HTTP tick；App内reference void执行可能已超出tick，须本模块后台租约/业务证据补足。
- 旧5fc短SHA未解析到本地对象，不把f4b代码外推为其实际脚本；主控需真实容器内脚本hash/完整commit证明。
- 保留DB、media、冻结credential/channel/model、Router operation intent、原taskId和账本。未知direct付费POST不重发；视频queued无upstreamId只在供应商明确原key幂等契约下恢复。新release表不能倒填成旧进程从启动起的观测。

## 集中验证

专用本机PG：`naumi-release-app-drain-pg-20261016`，192MiB、1CPU，127.0.0.1:55438/release_fixture，测试不使用线上账号或凭据。

- `npx tsx src/lib/release-runtime/test-app-drain.ts`：**37项通过**，包括worker tick返回而真实detached promise仍active、drain不新claim、已接promise继续、重启旧boot UNKNOWN且不重放。
- `npx tsx --conditions=react-server src/lib/release-runtime/test-background.ts`：**30项通过**，真实`DurableImageJobs.kick`、原business lease token不变、drain后callback完成及释放、真实`withBiRequest`重认证+防replay/匿名、13scope实际登记/绑定/结束。
- `npx tsx src/lib/release-runtime/test-continuation.ts`：**17项通过**，伪造、replay、30秒过期、账号切换、method/path、admin与未接入路径不签、原run finish后拒绝、合法工具drain续行、普通read不能升级、已接后台子项自然完成。
- `RELEASE_FIXTURE_OBSERVER_PATH=<根preload路径> npx tsx src/lib/release-runtime/test-next-bundles.ts`：**10项通过**，实际Next middleware/route/status/control独立编译，HTTP/PG可见；middleware验签后route显式恢复ALS；跨slot仍绑定原owner并关联child；nonce消费一次；run结束后middleware拒绝。
- `npx tsc --noEmit --pretty false --incremental false`：集中检查exit0。
- 另跑上一模块`test-store-boundaries.ts`的18项回归通过；合计112项（37+30+17+10+18），不等同线上远程供应商/媒体worker/legacy验收。此次没有改已有生成重试次数，也没有调用任何真实模型。

## 复制回滚与后续

- 四件证据在 `output/background-drain/`：`MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。只在另一源码副本实际回滚，核对原SHA，保留业务源码修改。
- 开关未启用时wrapper直接原调用，无新增release DB操作；DB里的active/unknown证据不因程序回滚删除。
- 根任务负责合并、固定新镜像、全套本机回归与唯一18:30服务器操作；本任务没有发布或停旧槽。
