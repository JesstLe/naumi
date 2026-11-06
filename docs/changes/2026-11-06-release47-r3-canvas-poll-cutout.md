# 47 r3：画布节点轮询 40001、抠图透明背景与本地副本保留期（2026-11-06）

## 线上现象（47，r2 `bfe3e64f` 上线后只读核查）

1. **画布节点列表 GET 500**：12:55 起 `/api/canvas/video-nodes` 500×1003（≈1.5%），scene 205、timeline 122、director 93、audio 83、character 79；旧版同接口 13.9 万次仅 1 次 500。新 Web 7 小时 `40001 could not serialize access due to concurrent update` 1,653 次（旧 Web 3 天 83 次）。
2. **抠图在 APIB 仍失败**：操作编号修复已生效（APIB 任务完成并报费，单位 `tool-…:tool-image:0`），但发往 APIB 的参数只有 `size/quality/resolution`，没有透明背景；结果被透明像素检查拒绝，任务 `SUBMISSION_UNKNOWN`，计费 `hold`（预占 1、扣费 0），供应商已收费。
3. **本地副本**：媒体本地目录 13G（白天约 1.2G/小时），默认 48 小时保留会把 69G 磁盘推到约 90%。

## 根因

1. r2 起 GET 轮询经 `withCreationReceiptRoute` → `withCreationRequest(receipt)`；47 为企业部署模式，每次轮询进入 `enterpriseCreationRead`：REPEATABLE READ 事务 + 对 `app_users`/成员等行 `FOR SHARE`。快照建立后这些行被并发提交更新即 40001，原实现不重试，直接 500。旧版 GET 直接放行，不经此路径。
2. 第 1 版参数映射下 APIMart/APIB 适配器不转发 SDK body 的 `background`（`apimart-preset.ts`），透明只能由映射的 `imagegen.transparent` 下发；而抠图步骤的参数选择没有声明透明，47 的 APIB 通道也没有 `transparent` 映射（未映射时 `image-parameter-plan.ts` 静默跳过）。

## 模块与职责、接口、依赖与状态归属

- **企业读取（enterprise/server.ts `enterpriseCreationRead`）**：只读快照；遇 `40001/40P01` 整体重试，最多 3 次、15–60ms 抖动退避，ROLLBACK 后重开连接。所有调用方（创作上下文、Agent、企业集成记录/媒体读取）只 SELECT 与断言，无写入，重试安全。其他错误不重试。
- **图片参数计划运行时（model-config/image-plan-runtime.ts）**：抠图（binding `image.cutout` 或 feature `tool.cutout`）的计划选择固定 `output.background=transparent`；`imagegen/plan.ts` 的抠图步骤计划同样声明透明，冻结计划与运行时一致。
- **执行组装入口（model-config/execution-fetch.ts）**：POST 前 `assertCutoutTransparencyMapped`：仅当计划 v1、抠图、协议 `apimart-images` 且通道未配置 `imagegen.transparent` 时，返回本地拒绝（`not_charged`），不发任何供应商字节；`openai-images` 通道仍由 body 转发，不受影响。`api-error.ts` 放行该固定文案，用户/管理员可见原因。
- **本地副本保留（media-assets/mirror-eviction.ts）**：默认保留期 48h → 12h（`NAUMI_NAS_LOCAL_MIRROR_RETENTION_HOURS` 仍可覆盖，`off` 关闭）。
- 不改账务、报价、冻结配置、执行映射或数据库结构。

## 验证（本机隔离 PostgreSQL 16 + HTTP 夹具）

- `verify-enterprise-read-retry.ts`（新）：**基线复现线上报错** `could not serialize access due to concurrent update`；修复后 4 项 PASS（单次冲突透明重试、持续冲突 3 次后抛出 40001、普通错误不重试、无遗留事务）。
- `verify-tool-image-operation-apib.ts`：15 项 PASS；新增：未配映射时提交前拒绝（0 上传/0 提交、settled failed、扣 0、文案点明缺失映射），发布映射后提交载荷 `background=transparent`。基线下“未配映射仍提交”被该用例捕获。
- 相邻回归 PASS：cutout-execution-boundary 49（连续 2 次）、apimart-single-pass 63、apimart-single-pass-pg 52、apimart-async-images、apimart-async-contract、image-gateway、image-parameter-contract 35、media-mirror-eviction 33、p0-nas-delivery、p0-media-recovery、tool-image-receipts 43、storage-resilience 20；`tsc --noEmit` 全量与变更文件 eslint exit 0。
- 与本改动无关、在未改动 main 上同样失败：`verify-canvas-cutout-parameters.ts`（200≠400）、`verify-canvas-tool-quote-scope.cjs`（RECEIPT_UNREADABLE）。环境缺失未运行：`verify-image-parameter-golden.ts`（需基线树路径）、`verify-bi-detoast.ts`（需 BASELINE 产物）、`verify-canvas-text-image-project-pg.cjs`（写死他人工作树 .env）。

## 发布与配置（见后续执行记录）

- 代码以 r3 蓝绿发布到 47；r2 退役，r1（20261103）继续按 r2 记录保留其 615 条未知观测。
- APIB 抠图通道（`apib:gpt-image-2.5-sunburst`、`-flare`）需管理员映射 `imagegen.transparent=background`，并用自备测试图做一次真实抠图透明验收；未通过则抠图通道需改用核验过透明输出的通道。

## 执行记录（47，2026-11-06 20:13–20:25 CST，已上线）

用户授权“全部修复然后发布上线就行，现在没人使用”。发布会话 `release47-main-20261106-r3`，证据 `/opt/naumi-staging/evidence/release47-main-20261106-r3/`（COMMAND_SOURCE/RESULT、PUBLICATION_RECEIPT.json）；本地产物与步骤 `output/release47-main-20261106-r3/`。全程持 47 三把部署锁，结束已释放。

- 固定版本：commit `9c55bb4e`、BUILD_VERSION `1793966370`、镜像 `sha256:1cb09eef…`（WSL 构建 321s；冒烟：版本接口、40/40 静态资源、Worker 语法、server actions=0）。47 导入后镜像 ID 与构建一致。
- 备份：`pg_dump -Fc` 1,387,655,976 字节，`pg_restore --list` 复核可读，未恢复。
- 候选：r3 Web/Worker 从 r2 克隆，端口 13132，准入 draining 启动；内存门槛按 Web 1536 + Worker 1024 + 保留 1024 = 3584 ≤ 3828 通过，r2 退役后 `docker update` 在线调回 Web 2048MiB（身份不变）。
- 就绪：10 个关键页面/接口 200；网关正向与保留旧静态资源的回切配置均生成并通过语法检查。
- 受影响功能：画布 6 类节点列表 GET 候选 120/120 200、0 次 40001；公网入口 60/60 200。r2 同批也 120/120（当前无并发写入，无法在线复现冲突，修复以本地确定性用例为证）。
- 切流：r2 Worker 静止 → r3 准入开放 → 网关平滑 reload → r2 Web draining → r3 Worker 恢复并完成任务。
- 退役 r2：新 Worker 设退役屏障，r2 排空证明（transport/admission/observations/owners/unfinished/domain/worker）两次通过，网关与运行容器无引用、13131 无连接，`restart=no` + `docker stop --time=-1` 先 Worker 后 Web。
- 保全：8 张任务/供应商绑定表原有身份全部保持；r1（20261103）615 条未完成观测逐字节一致，继续保留，r1 Web/Worker 未动。
- 恢复监管重新绑定 r3 并试运行成功，定时器已启用。
- **抠图映射与真实验收**：在 r3 Web 容器内以同代码/环境运行 `scripts/ops/repair-cutout-transparency.ts`（esbuild 单文件）PLAN→APPLY，模型配置 v152→**v153**（publication `2453d82c-05b7-443c-9a2f-c7fcde17545c`），仅 `apib:gpt-image-2.5-sunburst`、`-flare` 增加 `imagegen.transparent=background`，计费未变。随后用自绘图（白底蓝方块）真实抠图一次：wire `size=1:1, quality=medium, background=transparent, resolution=1k`，返回 1024×1024，全透明 812,857 / 不透明 229,104 像素，计费 settled 1 积分，单位 `tool-13023d31-…:tool-image:0`。
- 发布后 5 分钟：切流后 658 个请求全部 200、0 个 5xx、0 次 40001；恢复监管两次运行成功；内存可用 4,297MiB；磁盘 67%（23G 可用）。

### 发布中的问题与处置（如实记录）

1. **主机 Worker 看门狗干扰发布**：`/opt/naumi-staging/releases/worker-watchdog.sh`（每 60s）只看 `docker ps --filter name=worker` 的第一个（最新）容器，见到 paused 就第 1 轮发 resume、第 2 轮“硬复活”（停容器、删 `/release-state/*.json`、启动、resume）。它在 20:17:03 resume 了按设计暂停的候选 Worker（早于切流约 20 秒；期间 r2 20:17:10–13、r3 20:17:13 各一轮 tick，均 completed，r3 那轮针对仍在 draining 的候选，无 unknown），并在 20:17:54 硬复活了已设退役屏障的 r3 Worker。处置：在会话内记录并暂停看门狗定时器，重新固定同一容器身份（仅 startedAt 变化）、对未发送的屏障操作对账为 `RECONCILED_NOT_SENT`，再执行屏障与退役；发布结束已恢复看门狗定时器。**后续发布须在候选创建前暂停该看门狗**，或改造看门狗识别发布控制的暂停。
2. 退役步骤的排空检查在停掉旧 Worker 后仍去读其状态导致失败（脚本顺序问题），续接步骤改为“已退役且已停止”后完成。

### 整体状态

r3 已上线并通过验收；r2 已退役。整站仍为 `SWITCHED_CLEANUP_PENDING`：r1（20261103）的 615 条历史未知观测及其 Web/Worker 按 r2 记录继续保留，需另行授权裁决后才能退役。

## r1 遗留记录收尾与退役（47，2026-11-06 20:41–20:46 CST）

用户授权“授权，全部做完；两个排队任务都照常执行”。维护会话 `maint47-r1-adjudication-20261106`，证据 `/opt/naumi-staging/evidence/maint47-r1-adjudication-20261106/`，本地步骤 `output/maint47-r1-adjudication-20261106/steps/`；全程持三把锁，结束已释放。

- **只读核实（31）**：r1（`naumi47-web-main-20261103-r1`）615 条未完成 `accepted-work` 与 r3 记录的 SHA 一致。参考图同步 603 条（36 个操作全部 `done`）；媒体变体 10 条（缩略/预览均存在且已上 NAS）；画布扫描占位 `canvas-image/claim:0` 1 条（无进行中的画布任务，仅 2 个从未提交的排队任务，各预占 6）；批次 `d1c99c6b…` 1 条（10-23 起 `running`，子任务 `00ada5f7…` 无任务/计费/预占/供应商记录）。r1 Web draining、无活跃请求，Worker 暂停静止。
- **备份（32）**：`pg_dump` 1,387,897,199 字节，复核可读，未恢复。
- **收尾（33）**：单事务、逐条 CAS 与条数校验：批次子任务 → `failed`（`NOT_ACCEPTED`，扣 0），批次 → `failed`；615 条记录 → `finished`，outcome 分别为 `adjudicated:reference-operation-done`(603)、`adjudicated:media-variants-present`(10)、`adjudicated:scan-claim-no-inflight-task`(1)、`adjudicated:batch-closed-child-never-accepted`(1)；对应 session owner 置 idle。SQL SHA256 `48e430c3…`。未改作品、账本、余额。
- **效果（34）**：r1 `unknownLeases` 615→0。占位解除后 r3 扫描器执行两个排队的画布改字任务：今日 17:09 的完成（供应商 1 次，结算 6 积分）；11-05 的 3 次均为“源图片已不存在”失败，未调用供应商，扣 0、预占释放。批次保持 `failed`，子任务无新任务/供应商调用。
- **退役（35）**：r1 排空证明 8 项通过（含开放事务不来自 r1 容器、网关无 13130 引用、无回环连接），`restart=no` + `docker stop --time=-1`。r3 发布记录 `SWITCHED_CLEANUP_PENDING` → **`COMPLETE`**。MemAvailable 5,119MiB；切流后 0 个 5xx。
- 根状态 `MIGRATED_CLEANUP_PENDING` 未改：仍有更早已停止实例（10-17～10-28）遗留的未完成记录，未在本次授权范围内。
