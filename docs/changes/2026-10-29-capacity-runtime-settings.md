# 容量审计：运行配置与调度切片

日期：2026-10-29。任务基线：`c328f01c5a1854bce271fa53e64d324986df9329`。

本记录对应总账当前索引中的 **A4/A5/A6/A8/A9/A10/A11/A20**，不重编编号；GLM 原 A26–A31 依总账映射为 A56–A61。本任务不处理 A12/X6、上传像素、tick v2、发布生命周期状态机、collector 或账务模块。

## 状态与归属

- 工具准备的独立工作树：`C:/Users/13357/.t3/worktrees/naumi/t3-3a6f696b`；开工分支 `t3/3a6f696b`，提交时实际分支 `t3/capacity-runtime-settings`。开工 `git status --short` 为空，`git fetch origin main` 成功，HEAD 与 origin/main 均为上述基线。
- 已完成本切片源码、局部验收、原始字节/哈希保存和独立副本回滚。由父任务串行整合；没有 push、合共享 main 或创建 PR。
- **2026-10-30父增量：**固定子版与独立复核的问题已由父补修，当前结果见末尾“父复核闭环”。上面子任务交接状态及下方原始测试记录保留历史，不覆盖父最新结论。配置默认值与真实部署状态仍分别记录。
- 只证明源码/本地模块行为，不证明上线、真实供应商吞吐、生产 RPS 或十万用户容量。47 发布决定不变；没有连接服务器、生产 DB、容器或供应商，没有重复执行 45 笔手术或清理 UNKNOWN。
- 初始可用物理内存 `9,710,792 KiB`；后续只读观察为 `12,696,148 KiB`。测试依赖安装在本任务 `audit-artifacts/capacity-runtime-settings/tooling`，未安装/修改共享 node_modules。没有创建 PostgreSQL fixture；真实 PostgreSQL 锁/跨进程公平不在本轮通过项中。

## 调研结论：常量与真实调用链

| 总账项 | 当前源码与调用证据 | 本切片结论 |
|---|---|---|
| A4 | `release47_controls.py` 对 combined Worker 固定 1024 MiB、1 CPU、媒体并发 1；`combinedWorkerPlan`、媒体健康校验和控制聚合均要求 1。独立 `MediaEngine` 上限 2 不代表 combined 已允许 2。 | **保留防线，不宣称放开并发。** n 并发需要完整 Linux sandbox/退出/排空/峰值内存证据及资源配置变更，不以删 assert 交付。 |
| A5 | `BOUNDED_WORKER_RUNTIME` 给父进程设置 libuv 2、allocator 2；子进程由白名单新建 env，此前两个值均丢失。 | 修复父/子配置漂移：bounded 模式只转交已审配置 `UV_THREADPOOL_SIZE=2`、`MALLOC_ARENA_MAX=2`，不复制任意 `NODE_OPTIONS`、DB 或 Web 秘密。不把 2 本身认定为性能缺陷，也不声称 libuv 线程等同 ffmpeg/vips 内存预算。 |
| A6 | `layout.tsx → startVideoWorker` 是嵌入式扫描；独立 `video-worker.mjs → tick → scanWorkerTick → scanVideoWorkerOnce` 另有默认 15000 ms 间隔。部署设置 `NAUMI_VIDEO_WORKER=0` 时，嵌入式 20 秒不是实际外置 Worker 的周期。 | 增加有界 batch/嵌入式周期配置；模块副本共享扫描和定时器；各 lane 单独 single-flight。修复旧定时器慢扫描重叠/未捕获 cost rejection，保留首次 15 秒及原 interval 语义。修复 Worker 创建丢失已有 `VIDEO_WORKER_INTERVAL_MS`。 |
| A8 | media polling/workflow 共用 process Symbol 下的 session-lock pool；业务 SQL 仍用普通池。原池上限和同步 slot gate 均为 2。 | 配置上限纳入 `db/connection.ts` **同一冻结预算代际**；slot gate 读取实际 pool max；保留 try-lock、checkout 503、锁失败丢弃、finally/idempotent release。query timeout 5000 ms 未改。 |
| A9 | `server.ts` 只把 bootstrap 作为 repository initialize；`current()` 先读 active，事务锁后再读一次，已有配置直接返回。 | 没有证据证明 4 覆盖现有管理员配置；**bootstrap.ts 不改**。实际 bootstrap/schema/repository 模块 fixture 验证首次 4、管理员 13/7、disabled/visible=false、capability 0/false，随后三次 current 均保留，initialize 仍为 1 次。`maxConcurrent=0` 原 schema 就非法，不为测试放宽契约。 |
| A10 | `recoverDurableImageJobsLocal → dispatchImageQueue` 原默认 4，显式 12 仍截成 8。 | 增加独立 per-scan HTTP 派发预算、配置和显式错误，默认 4/预算 8 不变；12 需同时显式预算 12。取消只停止新派发并等待已开始 sends，不把中断解释为付费未受理。 |
| A11 | `NAUMI_IMAGE_JOB_CONCURRENCY_*` 已支持 1–256；原非法值会静默回默认值。 | 保留四个默认和有效整数覆盖；非法值改明确字段诊断，不静默改吞吐。补配置文档。 |
| A20 | `claimImageJob` 容量 SQL 和 `dueImageJobs` budgets 都调用同一 `imageJobConcurrency`；due SQL 按 kind 排 row_number，再按 lane_rank 排序，扣除活动租约。 | “改三处”的假设不成立；不复制规则或改 claim SQL。保留原事务/lease/heartbeat/付费状态路径；公平 SQL 为源码断言，本轮不升级为真实 PG 并发证明。 |

额外窄调用方：`recoverVideoWorkflows` 原来选中批次第一项 throw 后终止整批；现逐项隔离，计数只包含成功返回项，日志不序列化业务异常。验证范围是**选中批次的失败隔离**，不是对任意跨实例/持续失败队首的全局公平承诺。

## 模块职责、接口、依赖和事务归属

- `runtime/positive-integer.ts`：无 I/O 的运行整数解析；只提供一个小函数，业务上限由调用模块给出，不建全局配置 manager。
- `image-job-queue.ts`：队列 kind/default、执行 lane 配置以及 HTTP 派发 fan-out。`dispatchImageQueue(items, send, onError, concurrency?, {signal?}?)` 兼容旧调用；新增 signal 不改变原 send 返回语义。
- `video/worker-settings.ts`：视频扫描周期与两类批量的唯一配置入口。边界 20/10 分别来自现有 due-task repository/workflow SQL 的调用契约，不静默 clamp。
- `video/worker.ts`：同一 Node 进程中 layout/tick 的 scan single-flight，以及嵌入式 video/image/reference/cost 四条 lane。慢 lane 不重复启动，也不阻断其他 lane 后续扫描。`stopVideoWorker()` 停止定时器、拒绝新本地扫描并等待已开始工作；没有安装新 signal handler 或代替 release drain。
- `db/connection.ts → video/coordination-pool.ts`：连接基础设施单向提供冻结 video 预算，基础设施不导入业务。对现有 `databasePoolBudget()` 返回结构保持兼容；老 HMR 代际 `other=8` 仍导出 video 2。只占用已有 release=2/image=4 保留项之外的预算，不复制主池/控制池。
- `release47_controls.py`/combined launcher：仅修复字段传递与校验；无生命周期状态机变更。Worker 容器和 Web 中显式 cadence 不一致会拒绝，不自动改 env。
- 既有 `verify-video-coordination-pool.cjs`、`verify-imagegen-parent-completion.cjs` 只补本次新增依赖的窄 loader 映射；前者仍固定两槽 fixture，聚合配置由本次套件验证。没有放宽两套业务断言。
- SQL、账务、受理/UNKNOWN、原 operation、lease/heartbeat、supplier claim 仍由原模块拥有；未加重放、重结算、改余额或释放未知付费任务。

## 配置契约

只在变量**缺失**时使用默认值；显式空字符串、负数、小数、非十进制表达式等均诊断。值使用无前导零的正十进制整数。以下均为配置接口说明，不是已修改生产环境。

| 字段 | 默认 | 有效范围/预算 | 归属与作用 |
|---|---:|---|---|
| `NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE` | 16 | 1–256 | PostgreSQL 执行 lane 容量 |
| `NAUMI_IMAGE_JOB_CONCURRENCY_SUITE` | 4 | 1–256 | 同上，父编排 lane 独立 |
| `NAUMI_IMAGE_JOB_CONCURRENCY_APLUS` | 4 | 1–256 | 同上 |
| `NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN` | 16 | 1–256 | 同上 |
| `NAUMI_IMAGE_DISPATCH_CONCURRENCY` | 4 | 正安全整数，≤ dispatch budget | 每次恢复扫描的本地 HTTP fan-out，不是供应商 paid concurrency |
| `NAUMI_IMAGE_DISPATCH_BUDGET` | 8 | 正安全整数 | 明确预算，消除隐形硬顶；实际 workers 数不超过 items 数 |
| `NAUMI_VIDEO_SCAN_INTERVAL_MS` | 20000 | 1–2147483647 | **仅嵌入式** timer，保留首次 15000 ms 启动；无需通过调小间隔实现并发 |
| `NAUMI_VIDEO_SCAN_BATCH` | 3 | 1–20 | 嵌入式和 HTTP tick 共用的 due-video 批量；处理仍按原 service 顺序 |
| `NAUMI_VIDEO_WORKFLOW_BATCH` | 2 | 1–10 | 共用 workflow 批量 |
| `NAUMI_VIDEO_COORDINATION_POOL_MAX` | 2 | 正安全整数，受 DB 总预算限制 | 每 Node 进程的协调 session 数 |
| `PGPOOL_MAX` / `NAUMI_TICK_POOL_MAX` / `NAUMI_DB_POOL_BUDGET` | 5 / 2 / 15 | `business + tick + 2 + 4 + video ≤ budget` | 既有配置，加入实际 video reservation；不是站点全部进程之和 |
| `VIDEO_WORKER_INTERVAL_MS` | 未设置时 15000 | 5000–2147483647 | 既有独立 scanner 配置，现可从 clone 的 Web 显式字段准确传递；combined 校验一致性 |

诊断：`INVALID_RUNTIME_SETTING:<字段名>`、`INVALID_IMAGE_DISPATCH_CONCURRENCY`、`IMAGE_DISPATCH_BUDGET_EXCEEDED`、`INVALID_DATABASE_POOL_CONFIG:<字段名>`、`DATABASE_POOL_BUDGET_EXCEEDED`、`INVALID_WORKER_INTERVAL`、`COMBINED_WORKER_INTERVAL_CHANGED`。不输出配置值/连接资料。

参数示例：video pool 从 2 配为 4、其他不变时需要总预算至少 17；没有总预算的显式增加会在创建前失败。增加 batch 不改变 paid provider 配额，也不证明 tick 的整体期限/媒体内存已足够；不同 Node 进程仍须在站点层合计预算。

## 集中验证与原始输出

入口（PowerShell，工作目录为本工作树）：

```powershell
python -X utf8 scripts/verify-capacity-runtime-transaction.py
```

runner 使用大小写无关的 OS 环境白名单并保留 SYSTEMROOT；显式设置 `PYTHONUTF8=1`/`PYTHONDONTWRITEBYTECODE=1`/本任务 NODE_PATH，不读取 `.env`。全部实际命令、合成输入、stdout/stderr、exit 和源码 SHA256 见 `VERIFICATION.txt`/`RUNS.json`。

| 阶段 | 实际命令（node/python 在记录中展开为本机绝对路径） | 字面结果 | exit |
|---|---|---|---:|
| BASELINE | `D:\DEV\NodeJS\node.exe scripts/verify-capacity-runtime-settings.cjs --source C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\baseline` | `CAPACITY_RUNTIME_SETTINGS passed=5 failed=16` | 1 |
| MODIFIED | `D:\DEV\NodeJS\node.exe scripts/verify-capacity-runtime-settings.cjs` | `CAPACITY_RUNTIME_SETTINGS passed=21 failed=0` | 0 |
| BASELINE_CONTROLS | `D:\DEV\Python\python.exe -X utf8 scripts/ops/test_capacity_runtime_settings.py --source C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\baseline` | `CAPACITY_RUNTIME_CONTROLS passed=0 failed=4` | 1 |
| MODIFIED_CONTROLS | `D:\DEV\Python\python.exe -X utf8 scripts/ops/test_capacity_runtime_settings.py` | `CAPACITY_RUNTIME_CONTROLS passed=4 failed=0` | 0 |
| FOCUSED_TYPES | `D:\DEV\NodeJS\node.exe scripts/typecheck-capacity-runtime-settings.cjs` | `FOCUSED_TYPES=PASS files=6 external_io=declarations-only` | 0 |
| 既有 combined | `D:\DEV\NodeJS\node.exe scripts/verify-video-worker-with-media.mjs` | `COMBINED_WORKER_LIFECYCLE=PASS assertions=91 real_processes=0 network_calls=0 supplier_calls=0 sandbox_acceptance=false` | 0 |
| 既有 release controls | `D:\DEV\Python\python.exe -X utf8 -m unittest discover -s scripts/ops -p test_release47_controls.py` | `Ran 27 tests`；`OK (skipped=14)`（13 执行通过，14 POSIX 项在 Windows 跳过） | 0 |
| HASHGUARD | `D:/DEV/Git/bin/bash.exe C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\ROLLBACK.sh C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\rollback-guard-2` | `ROLLBACK_PREFLIGHT_FAILED src/lib/video/workflow.ts writes=0` | 3 |
| ROLLBACK_APPLY | `D:/DEV/Git/bin/bash.exe C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\ROLLBACK.sh C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\rollback-copy-2` | `ROLLBACK_APPLIED files=11 restored=baseline` | 0 |
| ROLLBACK | `D:\DEV\NodeJS\node.exe scripts/verify-capacity-runtime-settings.cjs --source C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\rollback-copy-2` | `CAPACITY_RUNTIME_SETTINGS passed=5 failed=16`，完整 stdout 与 BASELINE 相同 | 1 |
| ROLLBACK_CONTROLS | `D:\DEV\Python\python.exe -X utf8 scripts/ops/test_capacity_runtime_settings.py --source C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\rollback-copy-2` | `CAPACITY_RUNTIME_CONTROLS passed=0 failed=4` | 1 |

baseline/rollback 的 exit 1 表示同一组新契约在原源码上的反例恢复，不是宣称原本就有 16 个生产缺陷。bootstrap/default/single-media 防线在 baseline 同样通过。

输入覆盖：默认 lanes 16/4/4/16、合法 23、非法 0/257/空/小数/Infinity；派发 4/6/9/12 与预算 8/12，40/42 个合成 backlog、FIFO 开始顺序、失败隔离、取消排空；视频 3/2 与 12/7、过界配置、同 process 两份模块、慢 image lane 不重入且 video 继续、stop/restart/cost rejection；pool 2/3/4 和总预算 15/16/17、HMR冻结、checkout/query/unlock失败及幂等释放；管理员 0/false/13 保留；媒体 1 保留、libuv2 到真实 Node 子进程、9000 ms cadence 的 Python→combined→scanner env。

真实 I/O 只包括 loopback HTTP server（42 请求，正常/503 均读取响应体）和同步 Node 环境探针子进程；都已关闭/退出。21 项中的业务 DB/锁是模拟边界，lane SQL 为静态断言，bootstrap 使用实际 schema/repository 但模拟 SQL。focused typecheck 覆盖 6 文件且外部 I/O 是声明，不是完整 Next 构建。既有 combined 91 断言为生命周期注入 fixture，不是 Linux sandbox 实测。

**保留的继承失败：**额外运行 parent-completion 整模块套件，原始 c328 三个受测模块 overlay 与修改版均在 `UNMOCKED_IMPORT:src/lib/imagegen/dispatch.ts:../canvas/image-version-store` 处失败，业务执行尚未开始。两次都是：

```text
IMAGEGEN_PARENT_COMPLETION=FAIL CASES=25 FAILED=25 SUPPLIER_POST=0 SETTLE_CALLS=0 NETWORK=0 EXIT=1
```

准确命令为 `D:\DEV\NodeJS\node.exe scripts/verify-imagegen-parent-completion.cjs --source-root C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\baseline --output-root C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\parent-baseline`，及 `D:\DEV\NodeJS\node.exe scripts/verify-imagegen-parent-completion.cjs --output-root C:\Users\13357\.t3\worktrees\naumi\t3-3a6f696b\audit-artifacts\capacity-runtime-settings\parent-modified`。两个 exit 都为 1；没有把这 25 项记为通过，没有扩改 image-version-store/dispatch 来凑绿。

初轮 bootstrap fixture 失败来自隔离 VM 缺少 URL 全局，补齐标准 URL/URLSearchParams 后真实 schema 验证通过；没有为此修改产品 schema。安装 zod 遇共享 npm cache ENOENT 后改用本任务私有 cache，没有清理共享 cache。早期输出保留，最终以封存 `RUNS.json` 为准。

## 四产物、哈希与回滚

四产物已经实建并重开；tar 每一成员 SHA256 都与工作树修复版一致：

1. MODIFIED_FILE：`C:/Users/13357/.t3/worktrees/naumi/t3-3a6f696b/audit-artifacts/capacity-runtime-settings/MODIFIED_FILE.tar`
2. DIFF_FILE：`C:/Users/13357/.t3/worktrees/naumi/t3-3a6f696b/audit-artifacts/capacity-runtime-settings/DIFF_FILE.patch`
3. VERIFICATION：`C:/Users/13357/.t3/worktrees/naumi/t3-3a6f696b/audit-artifacts/capacity-runtime-settings/VERIFICATION.txt`
4. 可执行 ROLLBACK：`C:/Users/13357/.t3/worktrees/naumi/t3-3a6f696b/audit-artifacts/capacity-runtime-settings/ROLLBACK.sh`

`SOURCE_HASHES.json` 保存 9 个原文件和 11 个修复文件的 SHA256（产品文件 9 个、既有 loader 适配 2 个）；2 个新增 helper 的 baseline 为不存在。回滚先验证全部目标和全部原始字节，再完成 staging，写入前再次全部预检；最后一项被改动时仍 `writes=0`。只对带 fixture 标记的独立源码副本操作，拒绝当前工作树和带 `.git` 的目录。apply 后 9 个原文件恢复原哈希，2 个新增文件不存在；工作树 11 个修复文件的哈希仍未变。

封存结果：

```text
CAPACITY_RUNTIME_SETTINGS_TRANSACTION=PASS
MODIFIED_SOURCE_RETAINED=PASS ROLLBACK_RESTORED=PASS HASHGUARD_WRITES=0 ARTIFACT_REOPEN=PASS
```

## 父任务整合与尚未完成的证据层级

- 父任务整合本 task-only commit 后再按最新 main 定向验证；本工作树保持修复版，不自行 push/merge/发布。
- `audit-artifacts/` 被仓库忽略；父任务清理此托管 worktree 前须保留完整证据目录（至少四产物、baseline、rollback.py、SOURCE_HASHES.json、RUNS.json）。可由已提交 runner 重建，但重建不冒充本次原始执行记录。
- A4 的 combined n 并发、Linux 真实媒体 drain/sandbox/内存预算、站点连接总量/峰值负载、真实 PG 锁与多实例公平仍需要独立验收；本切片不据常量推算容量，不调大默认值或降低画质。
- 本轮未运行依赖 PG 的 `verify-video-coordination-pool.cjs` 和 X3 集成套件；coordination loader 已补两槽预算映射但不声称真实 PG 验收。默认 `databasePoolBudget` 返回形状已保持，未改其既有预算断言。parent-completion 的继承 loader 失败交对应模块继续处理，25 项仍未验收。
- A9/A20 已由实际源码与本地调用断言纠正，不列为“新修复了管理员覆盖/三处配置”；总台账由父任务更新。

## 2026-10-30 父复核闭环：停止栅栏、取消调用链与视频池代际

### 基线与归属

父main基线 `5072324ce9135857692469b36b5e4667321fc1e5`，包含已验收的A60；固定子提交 `7e5ece5fbf0aab7ff5e4a067219a2d91e457bb65` 在父分支普通合入点 `69bd23c504f92d460a26c1abacec86990251593b`。独立审查固定父基线611b7fee、候选相同，报告在 `t3-8405d852/audit-artifacts/capacity-runtime-review/REVIEW.md`。父没有把审查的通过项与2个新增P2/1个继承问题混写。

### 父实际复现与修复

1. **A6 stop完成后再扫描仍进入（新增P2）：**子版 `POST_STOP ... newScanResult=1`。增加独立持久 `state.stopped`，stop完成后不因清除stopping Promise而放开；只有明确start重启才清除。首次外置tick扫描仍可在未启动嵌入式timer时运行。`NAUMI_VIDEO_WORKER=0`下明确start只重开扫描资格、不启动timer；停止中start不抢跑。
2. **A10扫描取消未到调用方（新增P2）：**真实worker/queue与原文AST提取的recovery调用链中，12项/默认4并发，子版stop后最终仍开始12项。父以本地扫描owner的AbortController，经 `recoverDurableImageJobs({signal?})` → local recovery → `dispatchImageQueue(...,undefined,options)` 传递；停止后开始数保持4，原4个send的Promise仍全部等待，原10秒HTTP signal不被本地abort替换。due等待、动态导入、batch和stored-delivery阶段之间均检查本地停止；已开始的phase自然排空，取消不作为未受理证明。
3. **A8视频池结束后的旧代际引用（原/改共有）：**原版/子版真实PG均出现普通池已重建、视频仍是ended旧池/503，且子版新预算3而旧池max2。新增公共 `closeVideoCoordinationPool()`：不创建空池、跨bundle共享关闭Promise、等待借出锁归还，end成功后按引用校验清除旧pool/closing引用；失败保留原异常与closing fence，不分配替代池。持锁期间close不强断业务；下一完整代际video实际max3且可取得锁。期间新的锁checkout仍返回 `VIDEO_COORDINATION_UNAVAILABLE / 503`，不是正常busy。

### 模块接口与生命周期边界

- `video/worker.ts`只拥有嵌入式timer/controller和本地lane；durable-image recovery只接收小型可选signal，不依赖Web Request或release内部对象。实际send仍沿原鉴权、任务ID、独立timeout，原claim/paid/UNKNOWN/账务路径不变。
- `video/coordination-pool.ts`拥有pool与关闭fence；连接基础设施继续单向提供冻结预算，不从db反向导入业务。正确teardown顺序是请求已排空 → video等专用池close → `closeDatabasePools()`；close不是普通业务请求或HMR操作。
- 盘点确认：产品src当前只有layout调用start，没有本地stop或closeDatabasePools调用方。release control的drain只改变持久准入，仍允许已接受工作延续，**不是已排空Web teardown**。父没有把close挂到该route，没有新增信号监听器；外置scanner的shutdown是另一个进程，不关闭Web的池。
- 本地stop只取消它拥有的扫描。若先有外置扫描、嵌入式随后加入同模块single-flight，stop等待它但不取消外部owner；测试仍派完原12项，明确不是“取消失败”。跨bundle两个recoveryScan及外置tick串行公平的既有边界仍开放，不宣称全进程总派发只有4，也不将并行观察当成付费重复执行。

### 父集中验证

所有命令由 `output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs` 用大小写无关环境白名单执行，保留SYSTEMROOT；无stdin、不加载.env。固定合成12项backlog与gate、真实模块、独占256MiB/1CPU PostgreSQL、随机回环口；TCP+SQL就绪，每阶段finally按完整ID和唯一label移除、自有匿名volume一并移除、端口关闭。调用链测试抽取实际两函数原文，不重写算法；due rows/HTTP/admission是明确fixture，不是生产供应商链路。

- 原baseline：配置 `passed=5 failed=16`、exit1；Python `passed=0 failed=4`、exit1；父生命周期10项原行为对照、exit0。
- 固定子候选：配置21/21、Python4/4通过；父10项如实复现stop后12项派发/再次扫描1次/旧视频池503，exit0代表反例复现，不代表符合修复要求。
- 父修改及修改副本：配置21/21、Python4/4、父生命周期11项全部通过。覆盖未开始/已开始send、due等待、已开始batch、原response计数、同模块single-flight、外部owner不可被误取消、post-stop/restart、实际PG借出排空/共享关闭/重建预算与失败close fence。
- 既有真实PG coordination：9组通过，包含实际media/workflow调用点、跨Node进程advisory lock、普通池读、故障/幂等释放。
- combined既有91断言通过（注入fixture，非Linux sandbox）；release controls共27项、13执行通过/14 Windows跳过；A60实际模块/PG32项通过。
- 父完整 `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` 集中一次，exit0，stdout/stderr空。独立review的依赖错配36条/exit2继续保留原记录，不改成review当时通过。
- parent-completion原版/修改版仍同为 `UNMOCKED_IMPORT:src/lib/imagegen/dispatch.ts:../canvas/image-version-store`，25项未验收、exit1。父没有改业务或删除断言凑绿。
- 父生命周期每阶段stderr有1行固定诊断 `[image-queue] worker dispatch failed; retained for next scan`，来自明确失败send；没有将其写成stderr为空。配置与专项Python的stderr为空。

复跑命令（cwd为父工作树）：

```powershell
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs BASELINE
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs CANDIDATE
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs MODIFIED
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs REGRESSIONS
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs PG_EXISTING
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs TSC
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/package.cjs
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs COPY_MODIFIED
D:/DEV/Git/bin/bash.exe output/capacity-audit-wave2-20261029/runtime-parent-20261030/ROLLBACK.sh output/capacity-audit-wave2-20261029/runtime-parent-20261030/ROLLBACK_COPY
node output/capacity-audit-wave2-20261029/runtime-parent-20261030/run.cjs ROLLBACK
```

### 四产物与整合

父证据独立放在 `output/capacity-audit-wave2-20261029/runtime-parent-20261030/`：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。本次完整20路径（原子提交16＋父新增生命周期验证/调用方/两台账），归档逐成员重开，与当前源码hash一致。仅独立副本回滚，恢复12原文件、移除8新增；baseline配置原16失败/Python原4失败及生命周期原行为再次出现，A60原修复仍在回滚基线中。later-edit、原payload损坏、真实source-root均先全量拒绝，exit73、WRITES=0；源码/修改归档保持修复。全部准确命令、输入、字面stdout/stderr、exit、原改hash及最终main/远端一致性在VERIFICATION/DELIVERY。

本增量完成源码、父验证和串行main整合，未部署/SSH/生产写入。默认16/4/4/16、image4/8、video20s/3/2及媒体并发1、管理员false/0保持。Linux媒体sandbox、多实例公平/跨入口单飞、完整HTTP/真实认证、生产峰值、A59、A60其余链路、A62完整保留证明、旧UNKNOWN/CLEANUP_PENDING继续开放；本地通过不等于这些总项已完成。
