# 统一短维护会话执行器 / 2026-10-16

## 已完成与边界

新增 `scripts/ops/release_maintenance_session.py`、集中测试和本文。它是可执行的
有限动作 RPC/CLI，不再只是验收 gate。CLI 在**同一 process / 同一个
`with HostTransaction(...)`** 中读完整 steps 数组或 stdin NDJSON，整个等待人工
审查、探测、变更、回滚期间不释放目标锁。只接受47与103；当前 Oct16 18:30北京
时间授权由 `release47_maintenance.authorize` 校验，步骤执行时再次核验日期。

本模块尚未安装或调用服务器，不声称生产启用。17项本地测试覆盖主流程、故障恢复、
真实本机 HTTP 工件采集和 CLI 单事务。供应商真实生成、付费结算、完整浏览器操作
需要发布主控另行验收；这里的 GET 采集器不会伪称生成/保存已测。

已知上线阻塞保持原状：此前真实47/103 task snapshot 的5秒 statement timeout
需要独立优化/再次验证；本执行器不放宽超时、不将 fixture 成功当生产快照成功。
当前103容量、三UI、路由/R2保持也仍须主控当次现场复核。

## 会话与持久状态

- Canonical 状态复用 `/opt/naumi-staging/releases/release-lifecycle/current.json`，
  而不是另建互不相识的状态机。旧 active lifecycle / 不同 release / cleanup pending
  拦截第二次发布；`COMPLETE/ROLLED_BACK/ABORTED`历史才允许新 release。
- 私有状态 CAS：revision、计划 SHA、每操作 UUID、原请求 SHA、INTENT_RECORDED
  在首个潜在写操作前 fsync。状态文件出现外部修改即停。UNKNOWN 不删除、不隐式
  重试、不凭新 UUID 绕过；只接受原 UUID/原 expectedRevision/原参数加
  `"reconcile":true` 的显式重审。
- 无回执创建且缺少底层原始创建证据时不认领同名容器；无回执 baseline/retirement
  不重采为新原始基线或盲停，需要人工检查原私有证据。失败会留下 UNKNOWN。
- App/Worker 子操作 UUID 由顶层 UUID 的 UUIDv5 确定，同一不确定控制继续使用
  原CAS请求。任何 UNKNOWN tick阻止resume/恢复原caller。
- 所有 stdout 仅返回phase/revision/未知边界和工件描述符；原任务、cookies、配置与
  raw 响应留在700证据目录，文件600。无SSH、任意shell、数据库恢复、付费任务重POST。

## 有限动作与顺序

1. `baseline`：完整实时 inventory、固定旧身份 pin、原非终态及关联任务快照。
2. `backup`：已有 pg_dump -Fc -Z1，重新打开并 pg_restore --list，绝不 restore。
3. `maintenance`：本次显式维护 bundle 的完整Nginx闭包CAS/syntax/reload。
4. `freeze`：只pause已审计脚本SHA的旧HTTP tickcaller，原App/未知在途仍运行。
5. 每 variant依次 `web-create`→`web-start`→`web-verify`；47仅main；103必须
   main→desktop→enterprise，并分别验证编译后的assetPrefix、DB health、真实version、
   preload boot控制身份。每次启动先看真实MemAvailable，Swap不计预算。
6. `worker-create`→`worker-start`：克隆同镜像直连main Web，受控且paused启动，
   status必须QUIESCENT/activeTicks0/unresolvedTicks0。
7. 可选 `capture-acceptance`：运行固定非付费GET采集器；`acceptance`验证真实工件。
8. `preservation`：使用原private IDs再采样，运行实际 compare + validate_preservation，
   任一缺表/超界/原绑定变化均停，不拿 noMissingJobs单项替代完整覆盖。
9. `activate`：再次校验候选工件与boot→App精确resume→open gateway完整CAS→
   核验实际网关SHA及App身份→新Worker用原UUID明确resume。不会自动恢复旧caller。
10. `finish`：再核验实际网关/App/Worker；旧槽未取得逐个完整drain receipt时结果为
    **MIGRATED_CLEANUP_PENDING**，不强停。`retire`只接受manifest逐身份/工件指定，
    仍通过HostTransaction.retire的完整排空和引用检查。全部列入baseline的工作槽
    已取得退役证据才可COMPLETE；不要把DB/基础设施列进retirement baseline。
11. `rollback`：新Worker drain并观察QUIESCENT且无unknown→候选App draining→
    回退完整gateway→恢复原冻结caller→原任务保全复核。候选Web不强停，旧DB不回灌。

103 manifest还必须带已迁移47的私有JSON回执哈希，且回执包含taskDataPreserved与
workerResumed。各主机持自己的锁/DB/配置，不跨站同步或套用47网关/凭据。

## Manifest 核心字段

完整manifest由发布主控根据当次live inventory生成并hash冻结，以下是字段约定，
不是可以忽略身份校验的占位生产配置：

```python
manifest = {
  "schemaVersion": 1, "releaseId": RELEASE_ID, "target": HOST,
  "hostIdentitySha256": MACHINE_ID_SHA256, "commit": FULL_SHA,
  "buildVersion": BUILD_VERSION,
  "authorization": {"mode":"one-time-maintenance", "target":HOST,
    "date":"2026-10-16", "userAcknowledgement":"本次接受短维护迁移，保留任务和数据",
    "restoreDatabase":False, "replayAcceptedTasks":False},
  "restoreDatabase":False, "replayAcceptedTasks":False,
  "database": DB_PUBLIC_IDENTITY, "baseline": WORKLOAD_PUBLIC_IDENTITIES,
  "legacyCaller":{"identity":OLD_WORKER_PUBLIC_IDENTITY,"scriptSha256":AUDITED_SHA},
  "releaseSecret": PRIVATE_NEW_CONTROL_SECRET,
  "webs":[{"variant":"main", "source":OLD_MAIN_PUBLIC_IDENTITY,
    "name":NEW_NAME,"port":NEW_LOOPBACK_PORT,"image":FIXED_IMAGE_ID,
    "memoryMiB":1024,"cpu":1,"stateDir":NEW_PRIVATE_STATE_DIR,"assetPrefix":"",
    "budget":{"webPeakMiB":1024,"workerPeakMiB":128,"hostReserveMiB":1024},
    "requiredChecks":["login","canvas","private-media","old-client"]}],
  "worker":{"name":NEW_WORKER_NAME,"memoryMiB":128,"cpu":0.25,"stateDir":NEW_WORKER_STATE},
  "gateways": GATEWAY_DESCRIPTORS, "acceptanceSpec": CHECK_SPEC_DESCRIPTOR,
}
```

103另外列desktop/enterprise的独立固定image、loopback port、source、对应编译prefix；
`predecessor47={"path":relative_receipt,"sha256":receipt_sha}`。`gateways`有maintenance、
open、rollback-maintenance、rollback-open四个**独立完整闭包**包。每个包包含
`report:{path,sha256}`、`before:{logical_path:{path,sha256}}`、
`after:{edited_logical_path:{path,sha256}}`。report完全沿用root renderer的
configClosureValidated/baselineFileCasVerified/beforeDumpSha256/afterDumpSha256/patches。
所有相对工件路径只在manifest同目录，拒绝symlink/越界/哈希漂移。

## 可执行实际响应采集最小例子

`checks.json`的每项运行GET，不执行请求里提供的shell或POST。实际path按真实角色调整：

```json
{"checks":[
  {"variant":"main","name":"login","path":"/api/auth/session","expectedStatus":200,
   "cookie":{"path":"acceptance.cookie","sha256":"COOKIE_FILE_SHA256"},
   "jsonAssertions":[{"path":["user","email"],"expected":"FIXTURE_ACCOUNT_EMAIL"}]},
  {"variant":"main","name":"canvas","path":"/api/projects","expectedStatus":200,
   "cookie":{"path":"acceptance.cookie","sha256":"COOKIE_FILE_SHA256"},
   "jsonAssertions":[{"path":["names","FIXTURE_PROJECT"],"expected":"FIXTURE_PROJECT_NAME"}]},
  {"variant":"main","name":"private-media","path":"/api/media/REAL_PRIVATE_FIXTURE_ID",
   "expectedStatus":401,"bodyContains":"REAL_OBSERVED_AUTH_ERROR"},
  {"variant":"main","name":"old-client","path":"/_next/static/REAL_OLD_CHUNK.js",
   "expectedStatus":200,"expectedBodySha256":"ORIGINAL_CHUNK_SHA256"}
]}
```

采集器保存actual response body/receipt/report并重新计算具体JSON路径、内容或原chunk
SHA断言，不接受单独PASS字符串。浏览器可额外提供真实PNG描述符与同boot响应manifest；
图片只校验真实文件/哈希，不冒充人工视觉审阅。所有checks开始时间须在本候选verify后、
距今≤900s，绑定container完整身份、preload appIdentity、image/commit/build/prefix。

```python
# 发送给保持单process、全锁的stdin通道；expectedRevision来自上一条响应。
{"action":"capture-acceptance","operationId":UUID,"expectedRevision":REVISION,
 "artifact":{"path":"checks.json","sha256":CHECK_SPEC_SHA256}}
# 响应 collectedAcceptance 提供实际report描述符；后续acceptance默认使用它。
{"action":"acceptance","operationId":NEXT_UUID,"expectedRevision":NEXT_REVISION}
```

```sh
python3 scripts/ops/release_maintenance_session.py --manifest /opt/naumi-staging/evidence/RELEASE/manifest.json
# 或同进程执行已审阅数组；中间异常停止，不自动回滚/重放。
python3 scripts/ops/release_maintenance_session.py --manifest /opt/naumi-staging/evidence/RELEASE/manifest.json --steps /opt/naumi-staging/evidence/RELEASE/steps.json
```

状态读取stdin单行`{"action":"status"}`。显式同UUID恢复必须保留原expectedRevision，
不能将最新revision写进同UUID请求。EOF结束会话并释放锁，持久UNKNOWN保留阻止其他发布；
下一次重新锁定后只可针对原操作继续重审。

## 集中验证

```powershell
python -m unittest discover -s scripts/ops -p test_release_maintenance_session.py -v
```

Windows17 tests通过。真实本机HTTP collector确实发GET取得非空body，再校验全部报告、
错误boot、旧时间、篡改body、具体feature URL、越界/错误SHA、原UUID恢复与单CLI锁范围。
Linux `python:3.12-slim --network none`：session18 tests通过；session + HostTransaction +
controls + maintenance + worker_handoff集中61 tests全部通过（2.061s），包含真实
HostTransaction三把flock在所有步骤间持续持有、另一process争锁失败以及会话退出才
释放的测试，也覆盖POSIX权限/原子配置与App/Worker CAS。它们是隔离fixture，不是生产发布验收。具体命令、
原始输出与副本回滚另记录于任务VERIFICATION；无生产连接、无供应商请求。
