# 管理后台：待核查工作台 + 通道健康与容量面板

日期：2026-11-12。任务分支 `codex/admin-ops-console-20261112`（worktree `E:/Workspace/naumi-admin-ops-console-20261112`），基于 origin/main `e54cc36b`。

## 模块与职责

- **待核查工作台（billing 模块）**：把审计确认的「`exposeAbandonedBillingOperations` 只在管理员打开账务页面时触发」问题闭环——过期预占随 worker tick 转入 `manual`，新增统一待核查读模型（账务 hold/manual 操作 + image/canvas/video 三类 `needs_attention` 任务），账务核对写入仍走既有 `POST /api/admin/billing/operations`（含审计记录），本任务不新增写路径。
- **通道健康与容量面板（model-config 模块）**：已发布的通道健康、供应商预算与在途租约此前分散在模型管理页的聚合数字里；新面板给出预算漂移（历史棘轮/停用供应商残留）、merged 凭据账户、在途租约明细（token/到期），并提供「恢复发布预算」维护动作。

## 公共接口、依赖方向、数据/状态/事务归属

- `src/lib/worker/scan.ts`：新增 `billingExposure` phase，调用 `exposeAbandonedBillingOperations()`（返回暴露条数，计入 tick 回执 `billingExposed`）。依赖方向：worker 编排 → billing 模块，无反向依赖。
- `src/lib/billing/synchronous-operation.ts`：`exposeAbandonedBillingOperations()` 返回 `rowCount`（原 `void`，调用方兼容）。表归属不变：`app_billing_operations`。
- `src/lib/billing/pending-read.ts`（新）：`readPendingOverview(pool)` 四源聚合读模型，`LEFT JOIN app_billing_operations` 携带任务↔操作链接；只读，无事务。契约在 `src/lib/billing/pending-contracts.ts`（前后端共享类型）。
- `src/app/api/admin/billing/pending/route.ts`（新）：GET，`billingAuthorize`（管理员 + dbEnabled），进入时先跑一次 expose（与既有 operations GET 行为一致）。薄路由，查询在 pending-read。
- `src/lib/model-config/capacity.ts`：新增 `providerCapacityDetail(pool, config)`（预算 vs 发布值漂移、merged 身份、在途租约，只读）与 `resetProviderBudget(pool, providerId, config)`（把身份预算恢复为发布并发值；`changed:false` 幂等；未知供应商 `PROVIDER_UNAVAILABLE` 404）。预算表写入归属仍在 capacity 模块。
- `src/app/api/admin/bi/channel-capacity/route.ts`（新）：GET `biAuthorize` 返回 `{configVersion, providers[], channels[]}`（通道健康复用 `channelHealthSummary`）；POST `biAuthorize + sameSiteBiMutation + zod`（providerId + 必填 reason ≥3 字符）执行预算重置。
- 前端：`src/app/admin/pending-review/page.tsx`（新页面，`AdminCenterShell active="pending-review"`）+ `src/components/admin/billing/pending-review.tsx`（汇总卡 + 最旧优先表格 + 「核对账务」链接到 `/admin/billing?tab=operations`）；`src/components/admin/model-health/channel-capacity.tsx` 接入 `/admin/model-health` 页（ModelHealthPanel 之下）；`navigation.ts` 增加 `pending-review` 分区与 billing 模块链接；`model-health.module.css` 追加 4 个类（kpiGrid/leaseList/channelRow/reasonInput）。

## 实现说明

- 预算棘轮的根因（LEAST 只降不升）已在 main 的 `registerProviderCapacities` 修复（发布时把启用供应商预算升回发布值，acquire 不再下压）；`resetProviderBudget` 仅作为历史棘轮残留、停用供应商、merged 别名的维护动作，不是根因修复的替代。
- 待核查页面本身只读展示；「核对账务」跳转既有人工核对页，继续复用其 reason/proof/result 审计流程。
- worker tick 中 billingExposure 位于 generation 之后、supplierCosts 之前；失败会随其他 phase 一样传播到 tick 回执（与现有 phase 行为一致）。

## 验证命令、结果及证据层级

- `npx tsc --noEmit`：0 错误（全量）。
- `next lint`（全部改动文件）：无警告无错误（channel-capacity.tsx 的 `sequence.current` warning 与同目录 provider-ops.tsx 既有模式一致）。
- `npm run verify:billing-pending-view`（新脚本，需隔离本地 PostgreSQL）：4 项 PASS —— expose 只转换过期/任务链接预占（fresh/settled 不动）；四源聚合的计数/排序/操作链接/failureDiagnostic 优先/预占积分；容量明细的预算漂移、merged 身份、过期租约过滤；预算重置恢复发布值、幂等、未知供应商拒绝。**证据层级：真实模块代码 + 真实 PostgreSQL 定向验证，非线上。**
- `verify:worker-handoff`、`verify:model-health(-ui)`：在干净 origin/main 基线（`e54cc36b`、`5105aa57` 两个点）复现同一既有失败（tsx 子进程在 `--conditions=react-server` 下解析 `server-only` 报 Client Component 错误；worker-handoff 于 `verify-worker-handoff.mjs:57:82` 断言失败）。与本任务文件无交集，未在本任务内修复。
- `next build`：见下方「构建」一节（合并前门禁）。

## 未完成项与下一步

- 侧边栏积压角标（shell 属 admin-ui-modernization 改动面，本任务刻意避开，待其合入后叠加）。
- 通道级「手动恢复探测」按钮（`probe_until` 清除）未做——现有 60 秒冷却自动恢复已覆盖主要场景。
- 管理日志（center?section=management）接入预算重置操作的持久化审计；当前以必填 reason + 响应回执为准。
- 既有的 `verify:model-health` / `verify:worker-handoff` 门禁失败需要单独任务定位（疑似 Node 24 + tsx 子进程条件解析问题），本任务只记录基线复现证据。
