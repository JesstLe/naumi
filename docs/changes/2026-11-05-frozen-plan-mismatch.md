# 冻结参数计划错配：测试数据修正

## 结论及证据

结论 **(a)：测试构造过时**。不是本用例证明了生产已受理任务恢复缺陷。基线 `1c0781b727d9fff63a3d3d9fa674df529ea7f8cc` 上原脚本第 86 行复现 `ModelConfigError: 冻结参数映射与原配置不符`，`code: 'EXECUTION_MISMATCH'`。

最小复现是先在 map 配置冻结执行，再发布 omit，用 `resolve({...frozen, snapshot: omitted, billing, facts})` 构造另一执行，最后 `describe`。spread 带入 `imageParameterPlanVersion`、`imageParameterPlans`；resolve 保留传入的计划，却以新 snapshot 写入外层版本和 digest。这不是恢复原任务，而是人为混合两个版本。旧脚本原本想测试一次新的 omit 请求。

实际 fixture 的旧计划与新配置重编译计划只差以下字段（完整 JSON 由修正后脚本输出）：

| 字段 | 旧冻结计划 | omit 配置编译 |
| --- | --- | --- |
| modelVersion | 2 | 7 |
| wire.quality | high | 字段缺失 |
| effective.quality | high | 字段缺失 |

requested 均为 max / 1K / 1:1，wire.size 均为 1024x1024，clear 数组完全相同。旧计划的 modelVersion 已先触发拒绝；即使只篡改版本，映射比对仍会拒绝。不能删除或放宽冻结检查。

## 历史定位

使用 `git log -p` 检查 execution.ts、image-parameter-plan.ts、image-plan-runtime.ts、business-billing.ts 和本脚本：

- `cee8886590502d635336e4151e4bd0d9b6353321` 把脚本以正式 model-management 名称加入，已含 spread 旧执行的 omit 用例。
- **`bc6af06d5ba27b316efd5c3571f31b891b85fa9c`（2026-10-27）使该旧用例失效**：execution.resolve 新增并保留传入计划；describe 新增版本/原配置重编译检查；编译器与运行时模块首次加入；business-billing 冻结逐通道计划。脚本未同步去掉旧计划输入。此前 spread 的执行没有这些计划字段，因此能用于构造新请求。
- `5365ff529404649fe7f8e5c62aa3f62b223631e7` 只调整 image-plan-runtime 的语义质量来源，发生在 describe 检查之后，不解释本失败。
- `c814a023a40d2d8ef95e080e3e11316f1d5cac90` 增加显式 conventional 契约；本用例未开启该契约，不是引入点。

当前 requests.ts 从 accepted/quote 取原版本，并调用 byVersion 同时读取模型和计费；原冻结恢复 describe 也读取 frozen.modelVersion。报价计划与执行版本没有本测试这种主动替换。现有 PG 回归验证 JSONB 冻结往返、无计划历史任务和篡改拒绝；本次补充新版发布后原执行 JSON 往返恢复不变。以上是本地证据，不泛化为所有线上任务验收。

## 实现与交接

模块与职责：模型管理质量参数回归脚本，覆盖发布后新请求与历史执行的分界。

公共接口、依赖方向、数据/状态/事务归属：仅调用现有 executor.resolve/describe 和真实隔离 PG fixture；没有修改公共接口、产品模块、数据库结构或账务归属。

本次实现与迁移状态：omit 新请求使用显式输入，不 spread 旧执行；保留错误混搭作为 EXECUTION_MISMATCH 负向断言；新增旧计划/新计划差异断言和原冻结执行序列化恢复断言。未修改任何 src 文件，冻结校验及旧任务解释原样保留。

验证命令、结果及证据层级：见下方集中验证记录。仅隔离 PG、loopback 和只读配置上的纯函数验证；没有真实供应商付费调用、服务器连接或发布。

未完成项与下一步：无本任务未解决功能问题；交由主任务审阅并整合，本分支按指令只本地提交，不 push/merge/deploy。指定的其他已知失败不在范围。独立数据库 frozen_plan_c4901f63 保留用于复核，未使用或删除他人数据库。

工作树初始实际为 18bdeaa5，已保留原 t3 分支并将本任务新分支定位到用户指定 1c0781b7；fetch 仅刷新引用，不合入其他主线工作。配置导出及 golden 输出留在用户指定临时目录，不进入仓库。

## 集中验证记录

环境：`NAUMI_VERIFY_ISOLATED_DB=1`，`DATABASE_URL=postgres://fixture@127.0.0.1:55439/frozen_plan_c4901f63`，SETTINGS_SECRET 为任务提供的 fixture 值。

原始运行日志在本工作树 ignored `output/frozen-plan-mismatch/`；baseline.log 保留初始失败。以下为正确基线依赖下的最终结果。

### verify-model-management-quality-parameters

```text
npx tsx --conditions react-server scripts/verify-model-management-quality-parameters.ts
exit=0
DISPLAY_RESOLUTIONS_NATIVE=PASS OPEN_CLOSE_RESTORE_REPLAY=PASS FAMILY_HIDDEN_BRANCHES=PASS MATRIX=PASS FROZEN_NATIVE_4K_SIZE=4096x4096 CAPABILITIES_MAPS_BILLING_DRAFT_PRESERVED=1
FROZEN_PLAN_MISMATCH={"before":{"version":1,"upstreamId":"u1","wireModel":"wire-image-one","protocol":"openai-images","modelVersion":2,"requested":{"quality":"max","resolution":"1K","ratio":"1:1"},"wire":{"quality":"high","size":"1024x1024"},"clear":["quality","size","resolution","image_size","image_config.image_size","generationConfig.imageConfig.imageSize"],"effective":{"quality":"high","ratio":"1:1"}},"after":{"version":1,"upstreamId":"u1","wireModel":"wire-image-one","protocol":"openai-images","modelVersion":7,"requested":{"quality":"max","resolution":"1K","ratio":"1:1"},"wire":{"size":"1024x1024"},"clear":["quality","size","resolution","image_size","image_config.image_size","generationConfig.imageConfig.imageSize"],"effective":{"ratio":"1:1"}}}
MODEL_MANAGEMENT_PARAMETERS=PASS FIVE_CUSTOM_LABELS=PASS JSON_MULTIPART_MAP_OMIT=PASS FLOW_MAP_OMIT=PASS NO_DOUBLE_MAPPING=PASS REQUESTED_PRICE_NATIVE_AUDIT=PASS FROZEN_POLICY=PASS CAPABILITIES_PRICE_DRAFT_PRESERVED=PASS REAL_PAID_CALLS=0
```

### verify-image-parameter-plan

```text
npx tsx --conditions react-server scripts/verify-image-parameter-plan.ts
exit=0
IMAGE_PARAMETER_PLAN=PASS CHECKS=25 LOOPBACK_POSTS=1 REAL_SUPPLIER_CALLS=0 AUTO_QUOTE=CONSISTENT OLD_TASK=UNCHANGED
```

### verify-image-parameter-plan-pg

```text
npx tsx --conditions react-server scripts/verify-image-parameter-plan-pg.ts
exit=0
IMAGE_PARAMETER_PLAN_PG=PASS CHECKS=16 FROZEN_ROUNDTRIP=PASS OLD_VERSION=UNCHANGED DISCOVERY=0 SUPPLIER_CALLS=0
```

### verify-image-parameter-contract

```text
npx tsx --conditions react-server scripts/verify-image-parameter-contract.ts
exit=0
IMAGE_PARAMETER_CONTRACT=PASS CHECKS=35 QUALITY_EMPTY=TIER RESOLUTION_EMPTY=PROTOCOL METADATA=NON_BLOCKING STRUCTURAL=KEPT STRICT_DEFAULT=UNCHANGED PUBLISH_RULES=ENFORCED SUPPLIER_CALLS=0
```

### verify-model-management

```text
npx tsx --conditions react-server scripts/verify-model-management.ts
exit=0
MODEL_MANAGEMENT_REPLAY=PASS SAME_RECEIPT_READS=9 ACTIVATIONS=1 MUTATED_INPUT=409 FOREIGN_ACTOR=409
MODEL_MANAGEMENT_CONNECT_PROJECTION=PASS TRANSIENT_READ=JSON503 NOT_STAGED_PROOF=0 ORIGINAL_RECEIPT=APPLIED RECOVERY=200 ACTIVATIONS_UNCHANGED=1
IMAGE_MAPPING_HTTP=PASS ATOMIC_PUBLICATION=PASS ORIGINAL_DRAFT=UNCHANGED SAME_ID=ONCE STALE_VERSION=409
ADMIN_MODEL_MANAGEMENT=PASS HISTORICAL_REASON_FINGERPRINT_REPLAY=PASS ACTIVE_CATALOG=PASS SOURCES=PASS SWITCH_EXECUTION=PASS FROZEN_TASK=PASS DRAFT_PRESERVED=PASS SAME_ID_RECOVERY=PASS RSA_CREDENTIAL=PASS DISCOVERY=PASS EXPLICIT_CAPABILITIES=PASS NON_ADMIN=404 CSRF=403 VERSION_CONFLICT=409 PAID_GENERATION=0
```

### verify-resolution-parameters

```text
npx tsx --conditions react-server scripts/verify-resolution-parameters.ts
exit=0
PASS resolution metadata defaults/revision, native API persistence/replay, display vs wire parameters, JSON+multipart, Flow fallback own mapping, frozen task and restore; paid calls=0
```

### verify-model-execution

```text
npx tsx --conditions react-server scripts/verify-model-execution.ts
exit=0
PASS frozen image/text/video execution, durable credential rotation and replay, private public catalogs, compressed responses and zero uncertain paid retries CURRENT_DRAFTS=PASS STALE_DRAFT_REJECTED=PASS HEADLESS_CANVAS=PASS
```

### verify-billing-image-jobs

```text
npx tsx --conditions react-server scripts/verify-billing-image-jobs.ts
exit=0
PASS blocked serial image route freezes quote, partial charge and metering; original receipt survives changed current price without supplier replay
```

### 安装、类型与零差异门禁

`npm ci --no-audit --no-fund` exit=0，输出 `added 729 packages in 19s`。首次安装发生在原工作树起点，第一次 tsc 因旧锁文件的 sharp/TypeScript 类型不匹配失败；日志保留于 tsc-initial-dependencies.log。按指定基线重新 npm ci 后，上述全部脚本及 tsc 集中重跑通过。

```text
npx tsc --noEmit -p .
exit=0（无输出）
```

此次未改产品代码，条件性门禁本不触发，仍主动执行。PowerShell 命令中的路径变量：

```powershell
$g='C:/Users/ADMINI~1/AppData/Local/Temp/claude/d747dcc19fc0f21f/f7a054ad-871c-4023-9005-b5f209e9d040/scratchpad/golden'
npx tsx --conditions react-server scripts/verify-image-parameter-golden.ts 'C:/Users/Administrator/.t3/worktrees/naumi/t3-c4901f63' "$g/model-103-v117.json" "$g/billing-103.json" "$g/frozen-plan-c4901f63.json"
npx tsx scripts/verify-image-parameter-golden.ts --compare "$g/baseline.json" "$g/frozen-plan-c4901f63.json"
```

```text
GOLDEN keys=7495 models=16
golden EXIT=0
IMAGE_PARAMETER_GOLDEN_COMPARE keys=7495 differences=0
compare EXIT=0
```

`git diff --check` exit=0（无输出）。fetch 后 origin/main 为 a753214572f893886b18d34e73efe76965693320；按用户指定基线执行，不合入新主线。本地提交仅包含测试脚本和本记录。
