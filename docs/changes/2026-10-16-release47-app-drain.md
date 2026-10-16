# 47 发布：App / Agent 活动、归属与排空子模块

## 固定范围与状态

- 基于集成分支 `codex/release47-integrated-20261016` 的 `96a0fa50037900fc5bc865f3e9a82ba187139c39`，独立工作副本 `E:/Workspace/naumi-release47-app-drain-20261016`，任务分支 `codex/release47-app-drain-20261016`。
- 开工刷新 `origin/main=c2634fba41fd50a117f9af93e63d865e446f7394`。没有覆盖共享 checkout，没有修改 Dockerfile、package、Worker tick 回执或运维执行器。
- 已实现并本机集中验证：持久 admission CAS / 幂等、Agent run 与 HTTP 请求的独立租约、认证账号+会话归属、合法内网一跳转发、流式透传、重启未知状态保护。
- **未连接任何服务器，未调用真实供应商，未发布。** 全站旧进程排空和后台任务完整观测没有因此自动成立。

## 配置与身份

```text
NAUMI_RELEASE_RUNTIME=1
NAUMI_INSTANCE_ID=<固定槽位名称>
SOURCE_COMMIT=<40位源码SHA>
RELEASE_CONTROL_SECRET=<独立随机密钥, 至少32字节>
NAUMI_RELEASE_ADMISSION_START=draining|open
NAUMI_RELEASE_PEERS={"old-web":"http://old-web:3000","new-web":"http://new-web:3000"}
NAUMI_VIDEO_WORKER=0
```

- `NAUMI_RELEASE_INSTANCE_ID` 仅兼容别名；与 `NAUMI_INSTANCE_ID` 同时配置时必须完全一致。`NAUMI_RELEASE_COMMIT` 与 `SOURCE_COMMIT` 同理。
- 根任务的 `scripts/release-http-observer.cjs` 在 Node 进程启动时生成 `NAUMI_RELEASE_BOOT_ID` 并设置 `NAUMI_RELEASE_BOOT_SOURCE=preload`。不能使用固定 Docker 环境UUID当作每次进程boot。
- 缺少 preload 标记时，本模块生成新的 process-fallback UUID，保持部分覆盖，不信任固定注入的旧boot。DB注册同时绑定commit和注册起始时间，已注册boot被另一注册时间重用时返回409。
- 会话Map / creating去重位于 `node:process` 的 `Symbol.for` 属性，不再仅为每个route模块一个Map。但它不是全应用计数来源；PG租约是真实活动来源。跨进程/不共享realm时runtimeId不同，原owner controls返回503，不悄悄新建Agent。
- 不新增常驻后台扫描；仅活动run/request有10秒心跳timer并unref，结束即清理。独立发布连接池上限2，不复制会话/图片，不为每个请求持有长期DB连接。

## 内部接口契约

仅 `x-release-control-secret`（兼容 `x-naumi-release-secret`）与独立secret恒时匹配可访问。普通登录cookie / 管理员身份不替代此鉴权；middleware和route双检查，未认证404，不泄露状态。

### GET `/api/internal/release/status`

```json
{
  "schemaVersion": 1,
  "observedAt": "ISO时间",
  "identity": {"instanceId":"槽位","bootId":"UUID","commit":"40hex","startedAt":"ISO时间","bootSource":"preload"},
  "admission": {"mode":"draining","revision":2},
  "observations": {
    "activeRequests": null,
    "acceptedTasks": null,
    "trackedRequests": 0,
    "trackedAcceptedWork": 0,
    "agentRuns": 0,
    "unknownLeases": 0,
    "agentSessions": null
  },
  "coverage": {
    "level":"partial",
    "allApplicationRequests":false,
    "allBackgroundAcceptedWork":false,
    "allAgentExecutions":false,
    "admissionScope":"agent-new-turns",
    "allApplicationAdmissions":false,
    "source":"postgres-leases-not-module-map",
    "bootstrapRequiredForLegacy":true
  }
}
```

- `trackedRequests`：已接入的 `/api/agent`、Canvas-Agent和Canvas control真实response body 生命周期；流关闭/取消只结束该请求，不结束后台Agent。
- `agentRuns`：当前boot实际在PG接受且未完成的runtime Agent调用。结束需模型执行、异步工具结果及持久化完成；Canvas额外持有到挂载与流结算finally结束。
- `unknownLeases`：旧boot仍活动、显式unknown或45秒无心跳的活动租约。过期不删除、不改成完成、不自动重放收费任务。
- `acceptedTasks`、`agentSessions` 始终null：还有独立PiBridge、未接入后台任务和旧进程，不能把上述局部Agent计数冒充全站0。
- status可只读请求 `http://127.0.0.1:3002/status`，鉴权同secret；根任务preload的instance/boot/commit完全一致、从进程开始覆盖、无accountingFault时，才合并真实 `activeRequests` 并标 `allApplicationRequests=true`。失联/不匹配仍null，整个coverage仍partial。
- status/control自身由根任务preload排除计数，避免永远至少有1个内部观测请求。

### POST `/api/internal/release/control`

```json
{"instanceId":"槽位","bootId":"UUID","expectedRevision":1,"operationId":"UUID","action":"drain"}
```

- action仅`drain|resume`。DB事务锁boot行，CAS revision后递增；同operationId+相同payload返回原结果，不再次递增。不同payload复用operationId、旧revision、错boot均拒绝。
- 返回 `{identity, admission:{mode,revision}, operationId}`。运行时关闭503；DB或观测失败503并 `observation=unknown`。
- 这不是全站写请求总闸：只阻断新的runtime Agent / Canvas-Agent turn，允许已有run steer/stop/poll和原工具执行。不能粗暴挡掉所有POST，否则正在执行Agent的合法内部工具也被切断。
- 全站新入口关闭仍需持锁切换网关/内部执行图，并结合独立Worker暂停领取与业务任务归属；不能拿局部admission替代。

## 持久化表与未知状态

只创建独立追加表：`app_release_boots`、`app_release_controls`、`app_release_session_owners`、`app_release_activities`、`app_release_forward_receipts`。DDL在事务内取得专用advisory lock，不调用全业务ensureSchema，不改账号/积分/媒体。

- owner键为标准化**认证账号哈希**+sessionId+workbench/canvas。客户端email、ownerId、容器地址不作权威。
- admission row锁与同会话advisory锁覆盖run接受；8个并发claim只1个成功，其他409。active/unknown owner不抢占；idle会话下一turn可用持久历史在新open实例运行。
- 完成必须匹配activity id+instance+boot；持久化不确定则保留unknown owner。崩溃后的旧boot租约不会靠TTL变0。
- 转发receipt仅保留至少2分钟（签名仅30秒有效），每次限量清理100条；已完成request观测保留15分钟再限量清理。**不清理active/unknown租约**。

## 原owner转发与SSE

1. 每个入口先按原认证和Canvas项目/anchor权限验证，再查PG owner。
2. 正在运行的run及controls固定原instance+boot+runtime。新实例只从管理员环境 `NAUMI_RELEASE_PEERS` 精确查origin；只允许http内网IPv4/loopback/显式容器名，不允许公网、元数据地址、凭证、附加path或客户端URL。
3. 转发HMAC绑定来源实例、目标实例+boot、账号哈希、session、kind、method、完整path+query、body hash、30秒时间窗、唯一nonce。收端重新验证真实登录账号，PG nonce防重放，禁止第二跳/循环。
4. 目标boot消失、runtime不共享、owner未allowlist、未知结果均直接失败，不本地重建、不自动重试收费写请求。
5. fetch只单次派发，15秒等首个响应headers超时；响应流不读取成JSON/Buffer、不clone整流，保留SSE、取消和背压，设置`X-Accel-Buffering:no`。转发不会授予feature权限，cookies/authorization仍由原认证验证。
6. 已存在的CanvasGET历史读取仍以原持久历史为准；活动poll通过 `/api/canvas/assistant/control` 的`poll`走原owner，不能把新实例历史页的本地Map缺失当作已完成。

## legacy 一次迁移：最小事实要求与盲区

旧线上程序没有这些端点、preload和租约，必须标`legacy/unknown`。新DB表空不能证明旧程序无活动。

能做的只读bootstrap资料：固定旧容器ID/image/boot、完整Nginx及internal调用引用、旧进程每类后台启动方式、所有可找到账号/session的逐owner真实poll、真实供应商GET-only任务状态和业务账本/挂载租约。仍需证明入口已停止新受理、已有执行已自然结束、无法枚举项有独立可信覆盖。

具体缺口：

- POST `/api/agent` 可以直到首个tool/message事件才落库，pure-text运行中的Map会话可能完全无DB id；PUT创建/视觉准备/鉴权/设running到首persist前同样有间隙。
- Canvas准备、授权、vision和getOrCreate前不在Map/DB。Canvas历史的running实际是`running || canvasExecuting`；普通`/api/agent`拒绝cv且只返回running，不可混用。
- PUT取消、agent_end可先running=false，`toolResultsPending`、`persistPending`及下游已受理任务仍在执行。Canvas history较好但也不是所有工具后台的全局计数。
- 旧Next bundle私有Map、分页/已删除历史、临时会话或启动前已接受工作不能靠已知id枚举闭合。404是无可见会话，不是全进程0。
- 原780秒timeout只触发abort，不保证上游、下载、挂载、结算都完成。静默等待780秒、TCP0或“无人使用”均不是充分的自然排空证明。
- bootstrap逐poll只能发现正活动；全部false/404仍不能补齐未知项。无可信旧进程内观测或完整业务终态证据时，旧槽继续保留，不自动强停或重启。

## 后台入口审计与最小只读覆盖点

| 入口 | 当前事实 / 最小补点 |
| --- | --- |
| `video/worker.ts startVideoWorker` | App内setInterval/setTimeout分别fire-and-forget扫描video/workflow、durable image、reference、supplier cost。新Web设置`NAUMI_VIDEO_WORKER=0`可阻止新timer，但不能证明旧timer已停。最小在每个真实promise开始/结束绑定boot工作lease；不能只数scanVideoWorkerOnce的running。 |
| `/api/video/worker/tick` | 串行调用video、canvas-image、durable-image、reference、supplier-cost、media mirror/job。Worker同事负责operation receipts；tick HTTP完成也不代表内部void工作完成。 |
| `durable-image-jobs.ts` | claim后`void run`及`void execution.run`，已有job lease_token/heartbeat。最小在claim事务固化instance/boot，并只读统计真实lease和UNKNOWN；历史status不是进程执行数。 |
| `reference-workbench/service.ts synchronize` | 文本claim后`void executeText`，外层active Set在finally先清掉。最小给executeText promise独立lease；`active.size=0`不能宣称文本已完。 |
| `imagegen/batch.ts` + repositories | recover tick与child operation有各自持久状态；最小按claim owner/boot统计未结算/在途与未知，不凭queued/submitted总数猜进程归属。 |
| `video/media-jobs`、`media-assets recoverMediaMirrors` | 媒体下载/镜像/ffmpeg可能长于请求。最小按media job实际claim owner+lease收集，不计业务历史总数。 |
| `agent/bridges/pi-bridge.ts` | 独立Agent桥接器并不经过runtime.prompt；是否启用需调用方图证据，本模块不把它算进agentRuns。最小接桥接run lifecycle与取消finally后租约。 |

已有模块提供`beginObservedActivity('accepted-work', detail)`、`heartbeatActivity`、`finishActivity`、`unknownActivity`供后续最小接入，不能仅调用begin后立刻finish来伪造覆盖。

## 集中验证（本机、无供应商）

- 专用PG容器 `naumi-release-app-drain-pg-20261016`，`postgres:16-alpine`，192MiB/1CPU，只绑定`127.0.0.1:55438`，专用`release_fixture`库。测试脚本拒绝其他数据库目标。
- `npx tsx src/lib/release-runtime/test-app-drain.ts`：31项通过。双实例真HTTP/SSE、账号隔离、伪造与重放、CAS幂等/冲突、drain、原owner controls、断连保留accepted、重启未知且不重提交。
- `npx tsx src/lib/release-runtime/test-store-boundaries.ts`：18项通过。8并发只1接受、过期heartbeat不清零、持久化未知不接管、peer SSRF边界、独立accepted-work租约、固定boot重用拒绝。
- `RELEASE_FIXTURE_OBSERVER_PATH=<根任务preload绝对路径> npx tsx src/lib/release-runtime/test-next-bundles.ts`：6项通过。**实际Next15编译middleware / route / status / control独立bundle**，验证同boot及node:process registry、PG状态跨bundle可见、真实HTTP和局部request 1→0、后台继续null、routecontrol的drain能被middleware读到。
- `npx tsc --noEmit --pretty false --incremental false`：exit0（集中最终检查）。
- 这些是隔离fixture，不是线上供应商、真实已有用户、legacy旧进程或全站排空验收。Next fixture仅对测试路由在middleware读取admission；生产middleware没有粗暴拦截原Agent工具POST。

## 回滚与交接

- runtime开关未启用时，新增lease/owner逻辑不发DB操作；已有Agent功能保留原实现。程序回滚不回灌DB；新表保留用于核对未知accepted work。
- 回旧镜像后没有新端点/owner forwarding，必须重新按legacy unknown处理，不能继续使用旧的0观测。
- `output/app-drain/MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`及原SHA/复制回滚实测材料仅为源码副本验证，不对运行服务做回滚。
- 根任务负责同镜像/唯一候选、Worker与全站后台观测、legacy迁移事实、三锁/内存/网关/连续性以及唯一生产操作。
