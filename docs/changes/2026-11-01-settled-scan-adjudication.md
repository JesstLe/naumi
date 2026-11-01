# 47 四条失败协调扫描的独立裁决

## 模块与职责

`scripts/ops/release47_settled_scan_adjudication.py` 是无 I/O 的精确现场 policy。它仅评估两版已固定 Web 的四条 `recovery-dispatch-scan:<UUID>` 记录，分别按槽输出独立证明；不修改普通 controller、数据库、原 Worker 状态、原 tick 回执或业务任务。

本轮基线 main 为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`。目标仅 47；用户最新要求为“我让你上线，你就把全部问题都清完，最后给我上线，听不听得懂话？”。此前只读预检发现的 UNKNOWN 不因这句话自动变成完成，本模块增加可复核的失败协调器证明，后续真实执行与发布由父事务负责。

## 为什么可以区分协调器与业务结果

固定 `e18780188d02ac92c901b8cf5648b4554aef14e8` / `b79c8c397a33cfb3b636acbbe2edfa976f534c39` 的 `withBackgroundActivity` 只有在 `await action()` 或随后的 `finishActivity` 已抛错后，才写 `background-promise-unconfirmed` 并沿 catch 退出；原 action 已 fulfilled/rejected，不会再次进入 action。固定 `runReceiptedWorkerTick` 同样只在 `scan` / `complete` 的 catch 写原 tick UNKNOWN。当前精确原 tick还记录了已收到 HTTP 503 的结束时间。

这些证据只支持 **coordinator settled-with-error**，不支持供应商成功、业务取消、未受理、退款或原 tick completed。内部 HTTP 派发不继承进程内 ALS，因此只查 `parent_id` 不完整，必须另查整个原 boot 的未结束活动、完整领域 fence/事务/advisory lock、HTTP、Agent 和关联媒体。

源码 pin 包含两个完整 commit、各自 8 个源文件的实际 Git 原字节 SHA256，以及两个 Web/Worker 的实际 Docker ID、Image ID、Web boot、精确 scan ID 和 key。不是传入 `reviewed=true` 即接受的通用例外。

## 公共接口与采集合同

```python
proof = adjudicate(spec, samples, now=utc_now)
```

`spec`：

- `target / releaseId / authorization / canonicalSha256`；releaseId 只接受 `release47-main-20261101-r1`。
- `webIdentity / workerIdentity`：实际 `public_identity()` 完整输出。Web必须仍 running/restart=no，关联 Worker r1 必须 stopped/restart=no，r2 必须 running/restart=no。
- `sourceHashes`：对应固定 source commit 的完整 8 文件 SHA256；常量 `SOURCE_HASHES[commit]` 可作为校验目标，采集器须从实际固定 Git 对象取得原字节后计算。
- `scanRows`：该槽精确两条完整原活动行；按 id 排序的 `digest(rows)` 为 `scanRowsSha256`。要求 scope、outcome、claim、未结束状态、boot 与完整随机 key全部匹配。
- `tickReceipt / tickReceiptSha256`：r1 为 None及 `digest(None)`，因为其关联 Worker已停且该模块不裁决它的旧 tick；r2 为原 `f3cd801e-b557-4a12-b492-2841dfd862a4` 完整行，已受理、UNKNOWN、没有 completed_at/result，精确匹配原 worker/web boot和commit。
- `preservation / preservationSha256`：必须含一父一子的 `pendingJobIds` 与七张关联原表的 `tables={table:{rowCount,sha256}}`。表名为 `app_image_jobs / app_supplier_calls / app_billing_operations / app_gen_reservations / app_ledger / app_supplier_call_outputs / app_model_execution_stages`。SHA 对原关联行集合的完整字节投影计算，不只 status；父子至少2行、supplier和billing至少1行，空 ledger仍明确 `rowCount=0 / digest([])`，不推断收费。

`samples`：两份分别重新采集的完整输入，至少相隔1秒，全部在判定前30秒内；其中 App/Worker/domain各自采样也必须在该样本前10秒内。

每份样本包含 `observedAt / canonicalSha256 / webIdentity / workerIdentity`、白名单 `webEnvironment / workerEnvironment`，以及：

1. `app`：原生 status全文；正确 boot/commit、draining与稳定revision、HTTP完整过程计数相等/active0、tracked工作0/Agent0。**raw unknownLeases仍为2，acceptedTasks等null不改成0。**
2. `activities`：整个精确 instance+boot 的所有非 finished 行，必须刚好是对应原两条scan；`activitiesCoverage='all-nonfinished-for-exact-instance-and-boot'`。新增task-level unknown、别scope、额外活动、原行改动均拒绝。
3. `owners`：该实例全部owner，必须全部idle；`ownersCoverage='all-for-exact-instance'`。旧boot非idle owner也不遗漏。
4. `domain / domainObservedAt`：实际 `/api/video/worker/drain-status`，五类domain均0，表无缺失，expired但残留的fence也计入；activeTransactions/advisoryLocks均0，不把“有效lease过期”当排空。
5. `workerStatus`：r1为None，不请求已停止媒体；r2为原生status全文，原身份、paused/activeTicks0/UNKNOWN1、原tick 503结束证据，关联媒体必须draining/running0/queued0。
6. `tickReceipt / preservation`：重读原完整行/关联表摘要，与spec完全一致。
7. `routingReferences=[]`；`internalReferences` 保留真实完整活动内部引用。r1关联worker已停所以要求空；r2唯一允许的是以下已核验paused关联Worker引用，任何网关、其他运行容器或仍有效的supervisor引用都拒绝：

```python
[{"source": "associated-worker", "containerId": spec["workerIdentity"]["id"],
  "environmentKey": "NAUMI_APP_ORIGIN", "origin": "http://" + spec["webIdentity"]["name"] + ":3000"}]
```

两次 HTTP 累计计数可以因只读探测增加，但不回退且每次started=finished；两次admission、scan、tick和业务保全必须一致。采集器使用同一持锁事务和真实完整范围，这个纯模块不代替采集器或凭空认证其数据。

## 输出与真实退役次序

输出包含 `currentExecutableWorkDrained=true`、`coordinatorDisposition=settled-with-error`、`originalResultDisposition=unknown-preserved`、2条carried观察、各原行/源码/样本/spec/业务摘要，以及 `historicalDrainProven=false / originalTickCompleted=false / paidOutcomeReclassified=false / paidTasksReplayed=false / databaseMutationRequired=false`。

r1 proof只涉及旧Web及已经停下的关联Worker，不暂停或操作仍服务的r2媒体。r2 proof明确 `requiresAssociatedWorkerRetirementBeforeWeb=true`、`retirementOrder=[oldWorkerId, oldWebId]`；持锁执行器须先正常停旧Worker，重新核对实际引用，再正常停旧Web。这个输出故意不是可直接喂给 `HostTransaction.retire` 的通用receipt；调用方还需实时版本/引用/控制操作CAS、原业务保全和正常graceful stop证据，不能调用强停或修改raw status凑零。

原 tick / scan UNKNOWN与原Worker状态原字节保留，通过独立裁决把“已终止的本地协调动作”与“未明的历史结果”分开。任何原业务处置必须沿原任务/供应商身份进行，另行保存执行与账务证据。

### 执行前窄审修正

独立窄审提出两个P2，父已补齐：webEnvironment必须显式采集INTERNAL_APP_ORIGIN，仅允许明确未设置（原代码默认本槽loopback）或http://127.0.0.1:3000；跨槽派发和字段遗漏拒绝。第二轮App、domain及运行中Worker的内部观测时间必须各自严格晚于第一轮，复制旧观测仅修改外层时间拒绝。真实采集器每轮重新读取所有活动、owner、tick、关联账务及引用，不复用旧对象。追加对应负控后最终27项通过，exit0；首轮25项及审查发现保留。

## 集中验证与交付边界

命令：`python -B -m unittest test_release47_settled_scan_adjudication -v`，工作目录 `scripts/ops`。

首轮21项通过（exit0）；补齐完整关联Worker引用、先后约束和显式完整采样后，最终 **25项通过，exit0**，literal末尾为 `Ran 25 tests in 0.807s` / `OK`。`git diff --check` exit0。矩阵涵盖两槽正控、原普通退休拒绝、未知scope/job key、精确row bytes、源hash实测Git对象、换boot/image/origin、额外活动/范围缺失、domain缺表/expired fence/非整数零、Agent/HTTP/新工作、原tick身份/503/无完成证明、媒体活动、付费/供应商/账务变化、过期/重复采样、canonical/入口引用变化及输入完全不变。

本模块不连接服务器、不发供应商请求、不执行控制、不改数据库，也不声明本轮发布或业务交付已通过。完整源/改/回滚包和本轮真实采集/线上回执由父统一封存。
