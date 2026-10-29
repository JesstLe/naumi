# 容量审计切片：Agent 会话 / SSE 生命周期与大响应解析

## 模块、基线与当前状态

- 工具分配的独立 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-215951ed`，分支 `t3/agent-stream-lifecycle-audit`。未另建 checkout、未再委派。
- 基线及开工 fetch 后 `origin/main`：`9aaf16af7bd1c23395ca4d443c62e7daedcb85c9`。普通连接修复 `19f19d9d27b4ff5c54a36c40ebb6844719503c87` 是该基线祖先，保持原样。
- 本次只有本地源码、固定输入、独占本地 HTTP/PG/Node fixture；无供应商调用或线上操作。47 的 `e1878018 / 1793247893` 是任务给定状态，本次没有远程核验或改变；45 笔历史手术、在线索引仍由父任务挂账。
- 原子任务不分配总台账编号且未推送。父线程已复核固定提交 `fbe30f4e9dd378602f905eb2d5a018ae76c3f482`，登记 **A39 / D21（SSE 生命周期）**、**A40 / D22（Markdown 重复扫描）**，纳入本次主线整合；未部署。父补丁与验收见文末。

## 调研与协议判断

1. 工作台 `PUT /api/agent` 是启动一轮编排，不是附加订阅。已有运行态返回 409；`GET` 只读取事件/状态，客户端 `pollRecoveredRun` 每 1200ms 顺序取状态，不再次 PUT。不同账号使用相同 sessionId 仍由 runtime 的账号键隔离。
2. 现有工作台与画布编排在请求 abort / reader cancel 时停止当前 Agent；已受理图片/视频有自己的持久任务和恢复协议。此次保留该协议：停止编排不等于删除/撤销已受理任务，更不触发重放。
3. 工作台原有**两个** 700ms interval，分别转发积累事件、判断完成；没有新事件时不会每 700ms 发出一个心跳。原台账“100 会话≈140 内部事件/秒”不是实际 wire 测量。画布的 300ms flush / 5s heartbeat 是另一入口，本次未改。
4. runtime 每个新 Agent 注册一次 `agent.subscribe`，重复取用相同活跃 Session 不重复注册；`onDelta` 是当前流的单一回调，不是多订阅广播。真实重复 PUT 由 409 阻止，多个 GET 不新增流计时器。
5. SSE 关闭与编排完成是两个状态：传输回调/计时器应立即释放，`running` 必须等原 prompt、工具回执与 runtime 收尾完成才能释放。否则断线后可过早接纳另一轮。

## 本次实现及实际复现

### 工作台 SSE 的传输清理与运行态归属

修改 `src/app/api/agent/route.ts::handlePut`，没有改会话 CAS/revision、提示词、报价或收费工具：

- 初次持久化 await 后检查已发生的 abort，返回 409 / `RUN_INACTIVE`，不启动模型。原版添加监听时已错过事件，继续返回 200、调用 prompt 并留下三个计时器。
- request abort / reader cancel 立即关闭流、清除 interval/timeout 与 abort listener，并仅清除本流拥有的 `onDelta`；**不在 cancel 中提前设 `running=false`**。原 prompt 的 finally 收尾后才恢复 idle。
- `enqueue` 抛错走同一取消清理。原版只设 `closed=true`，后续 cancel 又因 closed 提前返回，在模型尚未结束期间遗留 callback 和三个计时器。
- 同步 `primeAgentSystemPrompt` 异常也纳入异步 catch/finally，避免初始化抛错后遗留资源和 running。
- 事件投递和完成检查合为一个 700ms pump；完成时主动 flush。正常存续从两个 interval+一个 timeout 变为一个 interval+一个 timeout，周期和 780000ms 期限不变。

真实 PG / runtime / route 复现：取消后立即再次 PUT，原版 `runningAfterCancel=false,retryStatus=200`，修改版 `true,409`；两版实际模型启动次数均为 1。**这证明 admission 窗口，不证明重复供应商执行或重复扣款**。内存替身中记录的 `acceptedTools` 只是合成 prompt callback 次数。

### Harness 的 Markdown 图片替换

修改 `harness.ts::publicText`，由新的模块内函数 `sanitizeAgentMarkdownImages(text)` 取代两条全局替换正则；仍先处理内联图片再处理引用图片，继续调用原 `agentMediaUrl`，保留原大小上限、保密过滤与媒体白名单。

原模式对大量未闭合 `![` 从每个起点重新扫描。新实现每次跨过第一个 `]`；该 `]` 之前所有嵌套起点具有相同失败位置，整段跳过不改变匹配语义。两次单向扫描，没有新增通用 Markdown 库、对话长度限制或模型输出降级。

可达链不是只搜到相似正则：实际 `runtime.ts` 的 `message_end` / `PublicOutputBuffer.finish` / `persistAgentSession` 调用 Harness；独占 PG 测试以真实 pi-agent 的 `streamFunction` 注入固定 **16KiB** 合成模型消息，经过实际 PUT→runtime→SSE→会话持久化，delta/final/DB 文本均与输入相同。源是本地合成事件而非真实供应商，未声称供应商实际产出过该文本。

固定有界压力输入 `"![".repeat(n/2)`，既有 `outputChars=192*1024` 内：

| 输入 ASCII 字节 | 原版 PublicOutputBuffer（ms） | 修改版（ms） | 输出 |
|---|---:|---:|---|
| 16,384 | 68.54 | 0.63 | 原字节相同 |
| 65,536 | 1,086.63 | 0.97 | 原字节相同 |
| 196,608 | 3000ms 子进程超时，`ETIMEDOUT/SIGTERM` | 1.27 | 修改版原字节相同 |

每行来自独立 Node 子进程、单次固定合成样本，不是生产 p95、吞吐或容量。16KiB 实际 runtime+PG+SSE 总耗时原版819ms / 修改31ms；此处还包括 PG 与原版700ms完成轮询，不能把全差值归因于 Markdown 算法。12,009 组固定种子169029差分、含嵌套起点/空URL/空引用/换行/外链和站内媒体，全部保持旧替换结果。

## 公共接口、依赖和数据/状态归属

- HTTP 方法、请求/响应字段、SSE 事件名与鉴权保持不变；运行中的重复 PUT 仍是409，GET 仍只读。
- Route 拥有传输 controller、一个 pump、一个 timeout、abort listener 和当前 `onDelta`；Agent/runtime 拥有 prompt、running、执行证据、release activity；持久工具仍由原模块负责。
- Markdown helper 仅依赖既有 `media-policy`，Harness 单向调用它；不依赖 Route、React、数据库或供应商 SDK。
- 未改 `db.ts/billing`、普通连接修复、canvas-client、画布视频保存、durable-image-jobs、storage codec、Worker tick/recovery、生产发布控制器、父台账或共享 checkout。

## 集中验证与证据层级

### 新专属脚本

```powershell
node scripts/verify-capacity-agent-streams.cjs --out output/agent-streams-20261029/modified-final
node --conditions=react-server --import tsx scripts/verify-capacity-agent-runtime.ts
```

第二条需脚本已要求的独占 loopback PostgreSQL：`NAUMI_VERIFY_ISOLATED_DB=1`，测试自己创建随机 schema；完整环境和临时端口在 ignored `RUNS.json`/`VERIFICATION.txt`，不读取生产配置。

- `verify-capacity-agent-streams.cjs`：**19 组**，原版7组不满足（exit1），修改版19组通过（exit0）。执行实际 route/Harness；auth/持久化/Agent 引擎用明确的内存替身，原生 HTTP 断连另走随机 loopback 端口。验证成功/失败/已abort/中途abort/cancel/重复订阅/GET重连/不同账号同ID隔离/固定期限/初始化与enqueue异常、callback/listener/计时器释放、字节与差分。
- `verify-capacity-agent-runtime.ts`：4组，真实独占 PG、真实 Agent/runtime/route/CAS；原版 admission 失败（exit1），修改版全通过（exit0）。供应商请求0、收费工具0；相同16KiB内容最终持久化。
- 内存路线使用可计数的确定性 scheduler；真实 HTTP 采用原生计时器。不能将前者的活跃 timer 数写成生产 OS 句柄/RSS。

### 既有回归

| 命令后缀（均通过 `node --conditions=react-server --import tsx`） | 结果 |
|---|---|
| `scripts/verify-agent-harness.ts` | 104 checks，exit0 |
| `scripts/verify-agent-stream-intent.ts` | 356 checks，跨chunk/原文/输出语义保持，exit0 |
| `scripts/verify-agent-stream-timeline.ts` | 29 checks，exit0 |
| `scripts/verify-agent-tool-trace.ts` | 25 checks，exit0 |
| `scripts/verify-agent-activity.ts` | 原有进度/重试/终态通过，exit0；未将模拟进度当bug |
| `scripts/verify-agent-session-repair.ts` | 实际PG 58 checks，CAS/跨缓存/引用通过，exit0 |
| `scripts/verify-agent-session-isolation.ts` | 实际PG，入口/账号/项目/控制隔离通过，exit0 |
| `scripts/verify-agent-harness-network.ts` | 15 checks，exit0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 全项目exit0 |

保留的失败：

- 首次 `verify-agent-session-repair` 在容器临时 Unix socket 已 ready、但最终 TCP 尚未稳定时连接中断；启动器改为检查 `pg_isready -h 127.0.0.1` 后，新独占容器复跑58项通过。原失败日志保留，不把它描述为修复了业务连接问题。
- `verify-agent-harness-runtime.ts` 在基线与修改版同样失败于旧 fixture 期望 `undefined`、实际为 `ROUTER_UNAVAILABLE/not_submitted`；未为消除该失败改 billing 或 Router 配置，整套不列为通过。
- 最早 `tsx` CLI `-e` 试探未传递 react-server condition，server-only 导入失败；正式脚本以 `node --conditions=react-server --import tsx` 或 esbuild conditions 运行。

所有自有 HTTP 服务器均 close；两个带独占 `naumi.fixture=agent-stream-UUID` 标签的临时 PG 容器已 stop/--rm，按各自标签 `docker ps -a` 输出为空。完整 Next 构建、浏览器/生产容量及跨实例蓝绿未执行。

## 四产物与回滚

ignored 根：`C:/Users/13357/.t3/worktrees/naumi/t3-215951ed/output/agent-streams-20261029/`。

- `MODIFIED_FILE`：六个本任务文件的 tar 源码快照，解包后逐文件 hash 检查。
- `DIFF_FILE`：本次六路径完整 Git patch。
- `VERIFICATION.txt`：原/改hash、精确命令、输入、stdout/stderr、exit、资源退出和副本回滚结果。
- `ROLLBACK.sh`：可执行、只作用于上述证据目录内自有带标记副本；先验证全部修改hash及原副本hash，才恢复2个原文件并删除副本中新加4文件。任一后来编辑或路径不符时 exit73、`WRITES=0`。

原文件 SHA-256：

```text
src/app/api/agent/route.ts 646c230a33a5e99eda3a053585b50bb843073fdc983a304f567655768a68a19f
src/lib/agent/harness.ts 625fc9c6c0f61c160a27a99d794babd1e2fb1bcf72931b9f0ab272308785e0bf
```

副本回滚后同一专属脚本必须恢复原版7项失败（exit1），不是把旧缺陷恢复写成测试成功。源码与 `MODIFIED_FILE` 留在修改版；hashguard 验证不得覆盖后来编辑。最终字面结果以已重开的 `VERIFICATION.txt` 为准。

## 未完成项与下一步

- 长会话：`persistPending` 串行保存完整会话；消息长期保留、事件超过400后删除前200条、TTL回收只在创建/取用触发。持久化扫描量、请求间内存保留与数组游标遇裁剪组合仍需独立定量测试；本次不凭静态形态增设对话上限或改CAS。
- 客户端 `pollRecoveredRun` 的组件卸载/反复切会话、事件游标裁剪以及画布300ms流的完整生命周期仍待独立Hook/浏览器复现。没有把工作台修复冒充所有Agent入口已闭环。
- Harness 流式边界 `publicOutputBoundary` 的跨chunk累计扫描与完整长会话RSS未作为此次已修项目；本次仅替换已实际复现的两条图片替换正则。
- 父线程 review/编号/固定提交整合；旧 Router fixture 配置不匹配单独修复。线上容量、47发布、45笔手术与在线索引不属于本次完成状态。

### 继续审查提示词

```text
从本切片固定提交审查，不重建checkout，不动并行billing/release collector。
先运行专属19组与真实PG4组，核对取消后running直到prompt收尾、重连只GET。
审查Markdown两次扫描与旧正则差分，保留192KiB上限/原文/媒体白名单。
区分合成callback、真实runtime启动数和实际收费：不得把admission窗口写成重复扣款。
重开VERIFICATION与四产物；随后由父线程统一编号、普通整合，47本轮不动。
```

## 父线程复核、补丁与集中验收（2026-10-29）

父线程先同步最新 main `3ea76ef6daa831b883e8523d4be8dba66851b7a8`，保留并行完成的画布修复，再普通 merge 本切片。独立源码清点确认 `agent_end` 本来就不清 running；正常 prompt 包装器在执行记录/结果收尾后才释放运行态。GET 不重放、DELETE 仅 abort、已有 CAS/账号隔离/原工具状态保持。本次没有修改 runtime、账务或画布入口。

**父补丁只有首帧失败的初始化保护**：`send("open")` 若已使 transport closed，立即退出 start，不再安装 callback/interval/timeout，不启动 prompt，并保存释放后的状态。实际 route + 原生 ReadableStream 的 controller 故障 seam 确定性复现子提交仍 `promptCalls=1 / timers=2 / callback=true`，父补丁为 `0 / 0 / false`。原生 start 同步执行、普通消费者尚未取得 controller，因此此处是初始化清理鲁棒性，不单列为已证明普通网络可达的生产事故。

父线程完整证据目录：`output/capacity-audit-wave2-20261029/agent-parent/`。

- 新增上述首帧边界后，专属 route/Harness/local HTTP 验证共 **20 项**：BASELINE/ROLLBACK 均8项不满足、exit1；原子提交仅父新增边界1项不满足；父修改/修改副本20项通过、exit0。192KiB合成输入基线/恢复仍3秒超时，修改保持原字节；12,009组差分一致。
- 真实 PG/runtime 原4项扩为 **6项**。父新增真实 `app_creation_records FOR UPDATE` 行锁，等模型已经发 `agent_end`、PG实际观测到执行结果写入等待，再取消SSE并再次PUT。基线/恢复接纳200，修改拒绝409，模型启动数均1；释放锁后原结果实际写入`succeeded`。这是“执行证据尚未收尾时的接纳窗口”，不是证明重复供应商执行或双扣费。
- 真实PG基线/恢复最终各2项admission断言不满足（exit1），修改6项通过（exit0）。首次父测试把旧版`running=false`当作清理结束，过早读到queued；父测试改为等待实际原结果状态再收尾，原日志以`prior-*`保留，没有修改业务断言掩盖原问题。
- 真实会话修复58项、账号/项目/入口隔离、网络15项，以及Harness104、流式原文356、timeline29、tool-trace25、activity回归全部exit0；父全项目TypeScript exit0。
- 旧`verify-agent-harness-runtime.ts`父环境原/改仍同样因`ROUTER_UNAVAILABLE/not_submitted`而exit1。保留此失败，不调整Router/账务去凑绿。测试均无真实供应商请求。
- 父真实PG明确关闭 release runtime（`NAUMI_RELEASE_RUNTIME=0`）。有release activity时runtime还会等待toolResultsPending、保存会话及结束activity；无activity时不额外走该等待，后续getOrCreateSession仍等待persistPending。本次PG证明实际creation结果收尾，不冒称已覆盖生产release-activity/多实例全链路。
- 副本回滚恢复2原文件hash、移除新增Markdown helper；源码及修改快照保持。后来编辑guard exit73、零写入；恢复后原8项及真实PG2项失败重现。独占父PG `naumi-agent-parent-20261029 / 55490`停止，端口关闭；HTTP/子进程已结束。

四产物：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。完整原/改hash、每条原生命令、输入、stdout/stderr/exit及恢复状态均已记录并重开；父回滚仅限证据目录中的固定`rollback-copy`。

下一步仍为长会话持久化/RSS、事件裁剪游标、客户端恢复轮询卸载、画布另一套流；发布collector固定`2cd03246`单独排队复核，不混入本次Agent验证。47本轮无SSH/发布，45笔手术和在线索引保留。
