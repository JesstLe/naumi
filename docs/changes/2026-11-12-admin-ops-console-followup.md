# 管理运营控制台收尾：积压角标、通道手动恢复、管理日志审计（2026-11-12）

模块与职责：admin 后台运营控制台（billing 待核查读模型、model-config 通道健康、bi 管理日志）与 admin shell 导航。承接 `2026-11-12-admin-pending-console-channel-capacity.md` 记录的三项功能未完成项；门禁失败两处已由 `2026-11-12-verify-gate-node24-fix.md` 单独任务解决，本轮基线为该修复合入后的 main（89581d86）。

公共接口、依赖方向、数据/状态/事务归属：

- `GET /api/admin/billing/pending?view=summary`（新增查询参数）：只读计数视图 `PendingSummary {total, generatedAt}`，供侧边栏角标轮询；不执行 `exposeAbandonedBillingOperations` 写副作用。完整视图（无参数）行为不变，仍先做滞留转人工再返回全量。读模型集中在 `src/lib/billing/pending-read.ts`（新增 `readPendingSummary`，与全量视图共享四源计数 SQL）。
- `POST /api/admin/bi/channel-capacity`（请求体改为 zod discriminatedUnion，`action: "reset-budget" | "clear-channel-probe"`）：`reset-budget` 语义与原参数版一致；新增 `clear-channel-probe`（providerId+upstreamId+reason）由 `resetChannelProbes`（`src/lib/model-config/channel-scheduler.ts`，通道健康归属模块）按 `supplierChannelKey` 定位健康行，清零 failures 并清除 open_until/probe_until/probe_token，保留 last_status 历史通道不在当前发布配置中时拒绝（`CHANNEL_UNAVAILABLE` → 404）。channel key 派生与 `channelHealthSummary` 完全一致，依赖方向不变（route → model-config 公共函数）。
- 两个 mutation 均在变更成功后经 `appendManagementLogAfterChange`（`src/lib/bi/management-log.ts`）写入 `app_bi_management_log`：`channel-budget-reset`（subject `provider:<id>`，changes 含 previous/restored/changed）、`channel-probe-reset`（subject `channel:<upstreamId>`，changes 含 wireModel/previous/cooldown 截止/cleared）；日志失败只记服务器日志，不推翻已完成的变更。审计条目 `email` 列承载 typed subject（`ip:x.x.x.x` 既有约定）。
- `AdminCenterShell`（`src/components/admin/center-shell.tsx`）新增账务入口角标：60 秒轮询 summary 视图，total>0 时在账务导航项渲染计数角标（99+ 封顶，title 提示明细）；仅提示用，失败静默保持原值。桌面侧栏与移动端抽屉共用 `links.map` 渲染，角标自然两处生效。

本次实现与迁移状态：

- 侧边栏积压角标：已实现。用轻量 summary 视图避免 shell 轮询触发暴露写；角标数可能短暂滞后于控制台（等待 worker tick 或控制台首次打开完成转换），与"待核查积压"语义一致。
- 通道手动恢复探测：已实现（标记已恢复按钮，覆盖 cooldown/recovering/failed 三态；unobserved/available 不出按钮）。熔断 60 秒自动探测恢复仍是主路径，该按钮用于供应商侧修复后立即恢复，无需等冷却窗口。
- 预算重置 + 通道恢复接入管理日志持久审计：已实现。POST 请求体从扁平参数升级为带 `action` 的联合类型（旧扁平体不再接受，前端同轮更新）。
- 管理日志表结构未改；`entry.subject` → `email` 列的既有映射在验证脚本中显式断言。

验证命令、结果及证据层级（本机隔离 fixture PostgreSQL，`scripts/verify-billing-pending-view.ts` 扩展后）：

- `NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://fixture:***@127.0.0.1:55479/fixture npx tsx --conditions react-server scripts/verify-billing-pending-view.ts`：8 段全部 PASS、exit 0——原 4 段（暴露转换/四源聚合/容量明细/预算重置）+ 新增 summary 只读视图（计数一致且 reserved 不被转换）、`resetChannelProbes`（清零+清冷却+previous 回执+越界拒绝）、`appendManagementLog`（typed subject 落库、changes jsonb 可查）。
- `npx tsc --noEmit`：0 错误。`npm run lint`：exit 0（仅 tool-generation-receipt.ts 既有警告）。`npm run build`：exit 0，路由表正常产出。
- 层级说明：以上为本地模块级验证；未发布任何服务器，线上证据待后续发布轮次按蓝绿流程产生。

未完成项与下一步：

- 无功能遗留。角标与通道面板的线上观察点：真实积压下角标刷新节奏、通道恢复按钮在生产配置中的表现，随下次发布验收。
- `t3-f69518b0` 遗留目录仍被进程占用无法删除（"Device or resource busy"），属本机清理事项，不阻塞代码合入。
