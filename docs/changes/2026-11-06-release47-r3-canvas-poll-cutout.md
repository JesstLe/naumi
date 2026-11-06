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
