# 47 生图简化：本地后继发布执行器

## 边界与实现

基线 `05598fe53bd03bfbaa74ff6ee5b39c2b689cb055`（含 d0 供应商余额/租户、2bbf 冻结 quote）。本模块只准备运维脚本、fixture 单元测试和配置交接；不改业务源码，不 SSH、不调用供应商、不持线上锁、不启动云资源、不推 main。父任务统一固定业务 commit/Image/build、真实发布及四产物。没有新增子任务。

用户本次授权逐字保存为 `批准，然后合并并上线`，scope 固定为：

```json
["47-only", "remove-imagegen-repeat-quote-version-gate", "remove-normal-creation-fixed-frequency-limit", "consolidate-duplicate-concurrency"]
```

新增 `scripts/ops/release47_imagegen_simplify_successor.py`，沿用继承链：
`ImagegenSimplifyController → SaasController → VideoFamilyController → ImageDeliveryController → BiController → normal.Controller`。

- 不改旧 SaaS/controller/policy 的授权、release ID、RAM、UNKNOWN、resume 或恢复语义；新授权使用独立 `begin`，不临时改常量、不伪造旧授权、不拿旧 releaseId 套本次事务。
- 新 `configure` 和新鲜 `run` 薄层只解决旧授权/≤2GiB/1536→2048 流程冲突。三锁 `ctl.transaction`、canonical 原路径/CAS/原子写、原 journal/历史债务、操作 UUID/UNKNOWN、完整 DB 备份、运行实例集合检查、静态 union/整站 nginx 切流、Agent/请求/任务/Worker/media 排空、两次任务快照比较、旧槽正常 stop 且 restart=no 均复用原实现。
- `finish_ready`、`retire_ready`、`drain_proof`、`op`、`persist`、`build_gateway`、`recover_failure`、`seal_candidate_ingress` 均未覆盖。没有改 `TASK_PRESERVATION_NOT_VERIFIED`，没有删除未知任务检查，没有引入旧 NAS/resume/settlement/scanner exception。
- 原 CASE05 基线路径、SHA `512245689fb9884732d6f9f9c7d479ca1481bfe2570b4fa4356fd947b572b041`、空 additive allowlist 固定。Guard 在新候选/DDL 前建立，沿 SaaS 就绪、切流、每槽退役、最终、失败前后保持精确保全；不重投、不退款、不清 unknown/pending。
- `release_lifecycle.py` 仅增加分派动作 `publish47-imagegen-simplify`；旧动作不改。统一入口仍是 `bash scripts/deploy-release.sh --lifecycle ...`。

基线没有 `docs/releases/`；本轮审阅最新 `docs/changes/2026-10-23-{saas47-production-acceptance,saas-release-progress,imagegen-frozen-quote}.md` 与容量绑定实现。文档里的生产值只作为交接背景，发布仍要求父任务现场刷新。

## 当前受管恢复闭包与权限

父提供的 12:30 只读观察为 canonical743，active `release47-saas-20261023-r1` COMPLETE/recoveryACK，Web08c7751d… 2GiB、Worker4bb56aa… 1GiB、7容器；不是本模块探测。

新前序证明要求：精确 current.json 文件 SHA + 逻辑 SHA/revision、active前序、所有历史 journal 操作ACK、既有旧槽已停止/restart=no、当前完整容器身份/内存/受管 static pin/source/build。容量绑定 journal 也参与 pending/UNKNOWN 检查，不把其 `retired=[]` 误认当前应用前序。

`PREDECESSOR_RECOVERY_REVIEW.json` 必须指向 **当前** `runtimeRecovery.manifestPath` 和 `runtimeRecovery.controlledMaintenanceReport`，验证文件 SHA 和完整当前 nginx dump SHA。不得取早期 R1 `saas-emergency-gateway` 代替容量绑定后的受管闭包。父提供的最新证据根为 `/opt/naumi-staging/evidence/release47-saas-capacity-binding-20261023-r1/{CAPACITY_BINDING_RECEIPT.json,POST_ACCEPTANCE.json}`；父需据当前 canonical 的受管指针制作新 review，而不是根据本段路径猜测 report。

新候选基于当前全 nginx 闭包生成 forward/maintenance，含容量回调的旧端口引用随完整闭包更新；安装 supervisor 后重新绑定新 `controlledMaintenanceReport` 并记录 `supersedes`，不把旧指针遗留给后继。只增旁路一个临时 Web，同版本独立 combined Worker；不拆分永久功能 Web。

就绪额外要求 6 个真实 GET 权限样例：匿名后台拒绝、平台管理员成功、租户所有者成功、跨租户拒绝、已撤销成员拒绝、双 cookie 不提权。使用父准备的现有测试身份 cookie 文件，不改账号/权限。路径限定 admin/enterprise，对应预期 HTTP 必须由父按实际合同填写；空 cookie/不具备真实企业身份会 HOLD，不把 200 health 当权限证明。既有 SaaS tenant HTTP、真实旧图片解码、媒体原生解码/上传/HEAD/Range、内部Worker鉴权/执行图检查全部保留。

## 两张 quote 表：扩展、备份、就绪与保全

1. `app_imagegen_quotes` 来自本基线 `src/lib/imagegen/quotes.ts`：id UUID PK、owner→app_users(email)、operation_id UUID、fingerprint/context_key TEXT、request/plan JSONB、expires_at/created_at timestamptz；owner(operation_id) 与 expiry 索引。
2. `app_image_billing_quotes` 按父 12:36 明确合同准备：id UUID PK、owner→app_users(email)、scope_key TEXT、quote JSONB、expires_at/created_at timestamptz、expiry 索引。本基线尚无父的新业务文件，最终构建前父必须核对实际 DDL/可空性/索引名字与此合同一致。

候选创建之前先 READ ONLY 读实际存在性，并为两表所有既存行保存 PG `to_jsonb(row)::text` 的 SHA。缺表以确认缺失记录，不作为 drain=0。每表最多5000行，超过明确HOLD，不截断当成功。

原 full pg_dump 必须ACK、文件重开 SHA一致；已存在的 quote 表还必须出现在 pg_restore --list 的 TABLE DATA 中。之后仅一次 journaled additive DDL 事务：`lock_timeout=3s`、`statement_timeout=15s`、`CREATE TABLE/INDEX IF NOT EXISTS`，无 ALTER/DROP/DELETE/UPDATE/INSERT，无旧任务回放。已有不兼容表不改写硬凑；列类型/NOT NULL/PK/FK/有效索引不符就HOLD。就绪与完成前复查结构。

扩展后、候选就绪、切流前、每槽退役前、最终、失败前后核对既存quote行未变/未丢；新增预览行允许。与原通用任务快照并行，未修改其表 allowlist/比较规则。失败前尚未创建新表不误报已存在的旧行丢失。

## RAM：配置审阅，不替父改线上

旧 Web 2GiB OOM 已由父通知。候选从创建起使用父审阅的固定 RAM，最终同值，无在线 `docker update --memory`/重启/1536→2048步骤。

必填 `memoryReview`：reviewed=true、OOM事实2048、rationale、webMinMiB/webMaxMiB、webPeakMiB、workerPeakMiB、hostReserveMiB、前序Web/Worker实际MiB。

- `2048 < min <= webMemoryMiB=webFinalMemoryMiB <= max`；peak≥候选限额；combined Worker固定1024；主机余量≥1024。
- 创建前需要 `MemAvailable >= webPeak + workerPeak + reserve`。就绪/切流/退役/退休后需要 `MemAvailable >= max(0,webPeak-currentUsage)+workerPeak+reserve`。
- 不把Swap或file cache算RAM，不预支旧槽退休 anon 作为信用。每次读取真实cgroup `memory.current/events`，任何 max/oom/oom_kill、身份/内存改变、采样超过5s都会HOLD。
- 父12:30的3355284kB≈3276MiB；若候选按3072/Worker1024/reserve1024审阅，创建门槛5120MiB，当前观察不足。wrapper不自行缩RAM/停旧槽/释放他人资源来过门禁。

## 配置结构和父必须补齐的材料

模板：`scripts/ops/release47_imagegen_simplify_successor.example.json`。占位值/null/reviewed=false 故意不通过校验，没有可用生产秘密。复制到忽略目录或47私有证据根后填，不把完整config/cookie/media secret提交Git。

| 组 | 父填字段/来源 |
| --- | --- |
| 本次固定程序 | releaseId以release47-imagegen-simplify-开头；date当日CST；commit40、image完整sha256、version、imageArchive及SHA；公开说明须绑定此最终版号 |
| 当前基线 | expectedRevision、expectedCanonicalDigest（recovery.encoded逻辑）、expectedCanonicalFileSha256（原字节）、expectedGatewayDigest（nginx -T stdout）；predecessorReleaseId=previousNormalReleaseId |
| 槽身份 | oldWeb/oldWorker完整public_identity六字段；old/newPort、新槽名、oldWebStateDir、独立stateDir/evidenceRoot均按本次releaseId；不换canonical目录 |
| 不变业务配置 | expectedConfigurationFacts按原Controller.configuration_facts实际三组结果；不写本轮135/8为硬编码，不恢复旧配置 |
| RAM | 上述memoryReview，webMemoryMiB=webFinalMemoryMiB；现场资源足够之后再执行 |
| Worker/媒体 | 新combinedMedia.workerName与newWorkerName相同，48—128字符独立media secret，既有scratchSource固定；现有cookie、storage helper/SHA、原真实mp4/SHA、既有成功图片operation IDs |
| 三份review | localAcceptance、recoveryIngressAudit、predecessorRecoveryReview均 `{path,sha256}`，文件在本次evidenceRoot直接下；ingress格式复用saas_maintenance_probe的真实servers/httpEndpoints清单 |
| 权限 | permissionChecks六组各自name/path/status/cookiePath；匿名cookiePath=null，其余私有绝对路径。必须有真实tenant-owner正例，不能沿旧R1 unavailable材料填passed |

`LOCAL_ACCEPTANCE.json` 合同（此处不是验收结果）：

```json
{
  "kind": "imagegen-simplify-prerelease-review",
  "sourceCommit": "FIXED_COMMIT", "linuxBuildImage": "sha256:FIXED_IMAGE",
  "buildVersion": "FIXED_BUILD", "priorImage": "sha256:ACTUAL_PRIOR_SAAS_IMAGE",
  "scope": ["47-only", "remove-imagegen-repeat-quote-version-gate", "remove-normal-creation-fixed-frequency-limit", "consolidate-duplicate-concurrency"],
  "localAcceptancePassed": true, "noUnresolvedP1P2": true,
  "saasPermissionParityPassed": true, "frozenQuotePgPassed": true,
  "legacyImageBillingQuotePgPassed": true, "legacyReceiptRecoveryPassed": true,
  "controlledRecoveryFixturePassed": true, "combinedWorkerMediaPassed": true,
  "additiveSchemaCompatibilityPassed": true
}
```

`PREDECESSOR_RECOVERY_REVIEW.json`：

```json
{
  "kind": "current-saas-recovery-review", "evidenceMode": "live", "target": "47.105.59.142",
  "releaseId": "ACTUAL_ACTIVE_PREDECESSOR", "canonicalFileSha256": "EXACT_CURRENT_JSON_SHA",
  "manifestPath": "CURRENT_RUNTIME_RECOVERY_MANIFEST_PATH", "manifestSha256": "FILE_BYTES_SHA",
  "priorCommit": "CURRENT_MANIFEST_COMMIT", "priorBuildVersion": "CURRENT_MANIFEST_BUILD",
  "gatewayDumpSha256": "CURRENT_FULL_NGINX_DUMP_SHA",
  "maintenanceReport": {"path": "CURRENT_CONTROLLED_MAINTENANCE_REPORT_PATH", "sha256": "CURRENT_REPORT_SHA"}
}
```

### 从父私存前序配置生成本次配置

新增离线 `--prepare-config`，输入前序私存配置、父重新采集的 `live-baseline.private.json`、本次 `candidate-binding.private.json`。后两份可各为完整配置字典，但只读取以下白名单，避免前序配置的 `oldWeb/oldWorker` 实际指向更早退休槽：

- live-baseline：target、oldWeb、oldWorker、oldPort、oldWebStateDir、predecessorReleaseId、expectedRevision、expectedCanonicalDigest、expectedCanonicalFileSha256、expectedGatewayDigest、expectedConfigurationFacts，全部必填且不得从旧config推断。
- candidate-binding：releaseId/date/evidenceRoot/stateDir/newWebName/newWorkerName/newPort/commit/image/version/imageArchive/imageArchiveSha256/webMemoryMiB/webFinalMemoryMiB/memoryReview/combinedMedia/cookiePath/localAcceptance/recoveryIngressAudit/predecessorRecoveryReview/permissionChecks/storageAcceptanceScript/storageAcceptanceSha256/mediaProbePath/mediaProbeSha256/imageAcceptanceOperations，全部必填。

生成器仅清除旧配置中resume/NAS回退/scanner exception/rollbackCompatibility选项；不会读取或修改canonical，不会删除任何UNKNOWN记录。它逐字绑定本次授权/scope，previousNormalReleaseId取live前序，并校验新配置；新输出用O_EXCL、0600和重开核对，既有文件不会被覆盖。生产秘密仅在父私存输入输出间传递，不打印正文。

```bash
python3 "$ROOT/tools/release47_imagegen_simplify_successor.py" \
  --config "$ROOT/predecessor-config.private.json" --prepare-config \
  --live-baseline "$ROOT/live-baseline.private.json" \
  --candidate-binding "$ROOT/candidate-binding.private.json" \
  --output "$ROOT/config.private.json"
# CONFIG_PREPARED=YES HOST_CONNECTIONS=0 LIVE_MUTATIONS=0
```

## 完整执行命令

本地集中回归（PowerShell；不触云；纯fixture suite）：

```powershell
$env:PYTHONUTF8='1'
python -m unittest discover -s scripts/ops -p test_release47_imagegen_simplify_successor.py -v
python -m unittest discover -s scripts/ops -p test_release47_saas_successor.py
python scripts/ops/release47_imagegen_simplify_successor.py --config output/imagegen-simplify47/config.private.json --check-config
```

父在47预先填完私有配置和固定工具闭包后，先只做离线config解析；该命令不拿锁、不连接主机，也不读取live DB：

```bash
RELEASE_ID='release47-imagegen-simplify-YYYYMMDD-rN'
ROOT="/opt/naumi-staging/evidence/$RELEASE_ID"
CONFIG="$ROOT/config.private.json"
python3 "$ROOT/tools/release47_imagegen_simplify_successor.py" --config "$CONFIG" --check-config
# CONFIG=PASS HOST_CONNECTIONS=0 LIVE_MUTATIONS=0 只证明配置形状，不是现场就绪
```

实际发布只能由父在协调holder/刷新当前基线/确认资源和review后执行一次：

```bash
bash "$ROOT/tools/scripts/deploy-release.sh" --lifecycle publish47-imagegen-simplify --config "$CONFIG"
```

工具包布局要保留 repo 的 `scripts/deploy-release.sh` 和 `scripts/ops/*` 相对关系。若父源码包根在 `$ROOT/source`，等价命令为：

```bash
bash "$ROOT/source/scripts/deploy-release.sh" --lifecycle publish47-imagegen-simplify --config "$CONFIG"
```

原supervisor安装还要求 `$ROOT/tools/release47_recovery_supervisor.py` 与其同目录导入闭包存在；storageAcceptanceScript也在 `$ROOT/tools/`。父可将本次固定commit的 `scripts/ops/*.py` 放此目录，不遗漏导入依赖。主入口与固定工具必须同一版本，不能指向旧SaaS wrapper。

控制器在READY/切流后等待父真实GUI验收写入本次 `$ROOT/browser-before.json` / `browser-after.json`（releaseId匹配、passed=true），各600秒；无凭据或无真实浏览器回执会HOLD。禁止用fixture标记冒充现场。切流/排空失败保留原UUID/UNKNOWN与RECOVERY_REQUIRED，沿当前SaaS受控维护，不自动切旧程序。

## 回退门禁与未闭合项

同SaaS祖先不等于可直接旧程序回退：旧程序未必理解新opaque quote、已冻结BillingQuote/权限/新接受任务合同。默认只有受控维护降级；`compatibleBusinessRollback=false`，不回灌DB/媒体、不重放任何accepted/unknown任务。

可另在config加 `rollbackCompatibility: {path,sha256}`，指向本次root下的隔离证明。证明须绑定 actual priorImage、candidateCommit/Image，kind=`isolated-prior-saas-program-compatibility`、evidenceMode=`isolated`、target=47，并含真值 `permissionParityPassed/additiveSchemaCompatible/frozenQuoteContractsCompatible/originalUnknownPreserved/noAcceptedTaskReplay`。父有实际证据后才运行：

```bash
python3 "$ROOT/tools/release47_imagegen_simplify_successor.py" --config "$CONFIG" --check-rollback-proof
```

该命令仅离线校验证明，明确输出 `automaticPriorProgramRollbackEnabled=false/liveDrainedContractGateStillRequired=true`；没有新增真实 `--apply` 回退执行器。后续若要旧程序切回，仍须另行实现/审查当前已接受任务合同/权限/视频profile/实际排空及CAS切回，不能调用旧normal rollback硬过SaaS HOLD。没有证明时 exit2 `PRIOR_SAAS_PROGRAM_NOT_PROVEN_COMPATIBLE` 是正确结果。

未闭合：父最终业务提交（含generic quote层）/固定Linux镜像与全回归、两表真实隔离PG扩展与老程序兼容性、权限真实租户正例、当下资源余量、当前受管闭包/锁归属、新程序实际GUI/排空/旧槽停止/最终canonical/三锁释放；均不由本地单元测试升级为生产完成。父12:36通知原holder退出，本模块未现场复核或抢锁。

## 本地验证记录

BASELINE：`python -m unittest discover -s scripts/ops -p test_release47_saas_successor.py`，17 tests / OK，exit0；无host actions。

新增wrapper首轮20项中两项fixture将SQL list合同错写成dict而报KeyError，已修正测试数据；之后20/20通过。Windows集中217项中两项旧测试依赖POSIX路径/O_DIRECTORY失败，原日志保留，没有改旧测试/门禁来过。

本机复用已有固定Linux测试镜像 `sha256:5453c8bc51c82cb580710aeb9e4cce7e9e2962e97729232e7228eec57cb3c389`（Python3.12/Node24），`--pull never --network none --read-only`、repo只读挂载，集中14模块 **217 tests / OK (skipped=3)、exit0**。三个未启用隔离DSN的PG类明确skip（task_snapshot、snapshot_projection、preserved_unknown），不是PG通过。

另用本机已有Postgres16镜像启动一次性 `--network none`、无published ports、tmpfs隔离库，两表DDL连续执行2次通过；真实列/PK/FK/index就绪查询通过；真实两表冻结行SHA、完整pg_dump/pg_restore TOC含两表通过；billing quote改12→14被 `FROZEN_QUOTE_ROW_CHANGED_OR_MISSING:app_image_billing_quotes` 拒绝；本机fixture unknown/pending未变。容器已精确删除，47连接0/供应商0。本组不是原CASE05生产保全或旧SaaS程序回滚证明。

配置CLI：fixture配置输出 `CONFIG=PASS HOST_CONNECTIONS=0 LIVE_MUTATIONS=0` exit0；未填模板按预期exit2；无兼容证明回退检查输出 `PRIOR_SAAS_PROGRAM_NOT_PROVEN_COMPATIBLE` exit2。父追加配置生成器的两项增量测试与真实CLI生成/重开收尾记录见本机忽略目录 `output/imagegen-simplify-successor-ops/`。没有因父状态通知重跑已过业务/供应商测试。

旧normal/controller/SaaS/video/image-delivery/policy/CASE05/task_snapshot七文件的工作树Git对象hash均与05598fe相同；任务只增加wrapper/test/template/doc，已有文件仅lifecycle分派。真实发布仍NOT_RUN。
