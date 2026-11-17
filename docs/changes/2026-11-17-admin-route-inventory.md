# 后台逐入口排查清单

从 Git 跟踪的页面、布局、Next API 方法和工作流服务分发生成。它只枚举入口；同方法内的 `action`、`operation`、筛选、客户端触发及向下调用要在对应行追加证据。POST 也有只读预览，不能按方法直接划为写入。代理与直连分别记账；覆盖本表不代表完成生产验收。

`待核查` 表示尚未逐项验证；`部分` 说明已验证的分支；整行所有读取变体和边界都有证据时才标记 `已核查`。用 `node scripts/audit-admin-read-inventory.mjs --update` 刷新入口并保留未变化行的记录，默认命令仅检查清单是否漂移。

| 入口 | 定义 | 覆盖与证据 |
| --- | --- | --- |
| `DELETE /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `GET /api/admin/artworks` | `src/app/api/admin/artworks/route.ts` | 待核查 |
| `GET /api/admin/bi` | `src/app/api/admin/bi/route.ts` | 部分：overview 的流水、作品、支付合并重复扫描；旧新指标及筛选对照通过，其他 section 继续核查 |
| `GET /api/admin/bi/channel-capacity` | `src/app/api/admin/bi/channel-capacity/route.ts` | 待核查 |
| `GET /api/admin/bi/conversation` | `src/app/api/admin/bi/conversation/route.ts` | 待核查 |
| `GET /api/admin/bi/media` | `src/app/api/admin/bi/media/route.ts` | 待核查 |
| `GET /api/admin/bi/model-config` | `src/app/api/admin/bi/model-config/route.ts` | 待核查 |
| `GET /api/admin/bi/model-config/catalog` | `src/app/api/admin/bi/model-config/catalog/route.ts` | 待核查 |
| `GET /api/admin/bi/model-config/versions` | `src/app/api/admin/bi/model-config/versions/route.ts` | 待核查 |
| `GET /api/admin/bi/provider-ops` | `src/app/api/admin/bi/provider-ops/route.ts` | 待核查 |
| `GET /api/admin/bi/trace` | `src/app/api/admin/bi/trace/route.ts` | 部分：外部追踪的总时限、在途上限及部分结果，`verify-bi-trace-deadline.ts` |
| `GET /api/admin/bi/usage` | `src/app/api/admin/bi/usage/route.ts` | 待核查 |
| `GET /api/admin/billing` | `src/app/api/admin/billing/route.ts` | 待核查 |
| `GET /api/admin/billing/image25-prices` | `src/app/api/admin/billing/image25-prices/route.ts` | 待核查 |
| `GET /api/admin/billing/models/stages` | `src/app/api/admin/billing/models/stages/route.ts` | 待核查 |
| `GET /api/admin/billing/operations` | `src/app/api/admin/billing/operations/route.ts` | 待核查 |
| `GET /api/admin/billing/pending` | `src/app/api/admin/billing/pending/route.ts` | 部分：角标、待核查查询和旧账务状态边界，`verify-billing-pending-view.ts` |
| `GET /api/admin/billing/versions` | `src/app/api/admin/billing/versions/route.ts` | 待核查 |
| `GET /api/admin/creations` | `src/app/api/admin/creations/route.ts` | 部分：时间、精确计数和筛选；混合归档和高归档深页已测，游标原型高归档全站深页放大仍待解决 |
| `GET /api/admin/creations/[id]` | `src/app/api/admin/creations/[id]/route.ts` | 部分：整详情、分页和费用经大任务逐项对照；恢复素材带可选来源定位，源取证、旧 URL 和鉴权已对照 |
| `GET /api/admin/creations/[id]/assets/[assetId]` | `src/app/api/admin/creations/[id]/assets/[assetId]/route.ts` | 部分：历史深页、锁竞争、视频 Range、来源定位和多图浏览器峰值已验证；服务端转码、取消和跨标签待核 |
| `GET /api/admin/creations/[id]/events` | `src/app/api/admin/creations/[id]/events/route.ts` | 部分：规范与历史事件投影、鉴权、无事件历史空结果，`verify-saas-creations.ts`；大任务族待核 |
| `GET /api/admin/enterprise-workbench` | `src/app/api/admin/enterprise-workbench/route.ts` | 待核查 |
| `GET /api/admin/feature-access` | `src/app/api/admin/feature-access/route.ts` | 待核查 |
| `GET /api/admin/fleet` | `src/app/api/admin/fleet/route.ts` | 待核查 |
| `GET /api/admin/fleet/releases` | `src/app/api/admin/fleet/releases/route.ts` | 待核查 |
| `GET /api/admin/fleet/status` | `src/app/api/admin/fleet/status/route.ts` | 待核查 |
| `GET /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `GET /api/admin/model-health` | `src/app/api/admin/model-health/route.ts` | 待核查 |
| `GET /api/admin/model-management` | `src/app/api/admin/model-management/route.ts` | 待核查 |
| `GET /api/admin/model-management/library` | `src/app/api/admin/model-management/library/route.ts` | 待核查 |
| `GET /api/admin/model-management/onboarding` | `src/app/api/admin/model-management/onboarding/route.ts` | 待核查 |
| `GET /api/admin/mvp` | `src/app/api/admin/mvp/route.ts` | 待核查 |
| `GET /api/admin/mvp/library` | `src/app/api/admin/mvp/library/route.ts` | 待核查 |
| `GET /api/admin/owner-account` | `src/app/api/admin/owner-account/route.ts` | 待核查 |
| `GET /api/admin/prompts` | `src/app/api/admin/prompts/route.ts` | 待核查 |
| `GET /api/admin/pubkey` | `src/app/api/admin/pubkey/route.ts` | 待核查 |
| `GET /api/admin/saas-overview` | `src/app/api/admin/saas-overview/route.ts` | 已核查：管理授权、只读快照、日期和租户筛选、20 万条合成记录的单扫描计划 |
| `GET /api/admin/settings` | `src/app/api/admin/settings/route.ts` | 待核查 |
| `GET /api/admin/supplier-cost` | `src/app/api/admin/supplier-cost/route.ts` | 部分：流水、汇总和账户概览分标签，见负载排查记录 |
| `GET /api/admin/supplier-cost/operations/[id]` | `src/app/api/admin/supplier-cost/operations/[id]/route.ts` | 待核查 |
| `GET /api/admin/team-access` | `src/app/api/admin/team-access/route.ts` | 待核查 |
| `GET /api/admin/teams` | `src/app/api/admin/teams/route.ts` | 待核查 |
| `GET /api/admin/templates` | `src/app/api/admin/templates/route.ts` | 待核查 |
| `GET /api/admin/templates/cache` | `src/app/api/admin/templates/cache/route.ts` | 待核查 |
| `GET /api/admin/tenant-usage` | `src/app/api/admin/tenant-usage/route.ts` | 待核查 |
| `GET /api/admin/tenants` | `src/app/api/admin/tenants/route.ts` | 部分：按负责人邮箱核对，`verify-saas-tenants.ts`；其余列表变体待复查 |
| `GET /api/admin/tenants/[id]` | `src/app/api/admin/tenants/[id]/route.ts` | 待核查 |
| `GET /api/admin/tryon` | `src/app/api/admin/tryon/route.ts` | 待核查 |
| `GET /api/admin/update-check` | `src/app/api/admin/update-check/route.ts` | 待核查 |
| `GET /api/admin/usage` | `src/app/api/admin/usage/route.ts` | 待核查 |
| `GET /api/admin/users` | `src/app/api/admin/users/route.ts` | 待核查 |
| `GET /api/enterprise` | `src/app/api/enterprise/route.ts` | 部分：工作区目录和站点范围，`verify-workflow-read-safety.ts`；其余 action 待复查 |
| `GET /api/enterprise/analytics` | `src/app/api/enterprise/analytics/route.ts` | 待核查 |
| `GET /api/enterprise/artworks` | `src/app/api/enterprise/artworks/route.ts` | 待核查 |
| `GET /api/enterprise/content` | `src/app/api/enterprise/content/route.ts` | 待核查 |
| `GET /api/enterprise/creations` | `src/app/api/enterprise/creations/route.ts` | 部分：企业近期固定 5 条、历史归属与统一列表；混合归档深页待核 |
| `GET /api/enterprise/creations/[id]` | `src/app/api/enterprise/creations/[id]/route.ts` | 部分：共用详情查询经大任务 SQL 对照；企业鉴权、证据和费用分页、脱敏、撤权、来源定位已验证 |
| `GET /api/enterprise/creations/[id]/assets/[assetId]` | `src/app/api/enterprise/creations/[id]/assets/[assetId]/route.ts` | 部分：Range、撤权、旧 URL、来源归属、隔离连接和页面并发已验证；服务端转码、取消和跨标签待核 |
| `GET /api/enterprise/creations/[id]/events` | `src/app/api/enterprise/creations/[id]/events/route.ts` | 部分：事件分页、规范与归档脱敏、跨租户、撤权和锁竞争，`verify-saas-creations.ts`；大任务族待核 |
| `GET /api/enterprise/health` | `src/app/api/enterprise/health/route.ts` | 部分：健康统计权限、账户行锁及隔离，`verify-enterprise-analytics.ts` |
| `GET /api/enterprise/integration` | `src/app/api/enterprise/integration/route.ts` | 待核查 |
| `GET /api/enterprise/media` | `src/app/api/enterprise/media/route.ts` | 待核查 |
| `GET /api/enterprise/saas-overview` | `src/app/api/enterprise/saas-overview/route.ts` | 待核查 |
| `GET /api/enterprise/tenant-usage` | `src/app/api/enterprise/tenant-usage/route.ts` | 待核查 |
| `GET /api/enterprise/usage` | `src/app/api/enterprise/usage/route.ts` | 部分：报表账户行锁及撤权，`verify-enterprise-analytics.ts` |
| `GET /api/enterprise/workflow` | `src/app/api/enterprise/workflow/route.ts` | 部分：工作流代理的取消和流限制；动态 action 按工作流直连条目继续追踪 |
| `GET /api/enterprise/workflow/appeals` | `src/app/api/enterprise/workflow/appeals/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/capacity` | `src/app/api/enterprise/workflow/capacity/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/catalog` | `src/app/api/enterprise/workflow/catalog/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/corrections` | `src/app/api/enterprise/workflow/corrections/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/demand-batches` | `src/app/api/enterprise/workflow/demand-batches/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/demand-files` | `src/app/api/enterprise/workflow/demand-files/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/files` | `src/app/api/enterprise/workflow/files/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/forms` | `src/app/api/enterprise/workflow/forms/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/guidelines` | `src/app/api/enterprise/workflow/guidelines/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/imports` | `src/app/api/enterprise/workflow/imports/route.ts` | 部分：代码确认 source/worksheet 流式代理及客户端断开传递；工作流直连两份 64 MiB 已核查，代理实流复查保留 |
| `GET /api/enterprise/workflow/notifications` | `src/app/api/enterprise/workflow/notifications/route.ts` | 部分：JSON 上限、取消和浏览器角标，`verify-workflow-read-safety.ts`、`verify-workflow-polling.mjs` |
| `GET /api/enterprise/workflow/performance` | `src/app/api/enterprise/workflow/performance/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/projects` | `src/app/api/enterprise/workflow/projects/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/publication-files` | `src/app/api/enterprise/workflow/publication-files/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/publication-preflight` | `src/app/api/enterprise/workflow/publication-preflight/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/publications` | `src/app/api/enterprise/workflow/publications/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/references` | `src/app/api/enterprise/workflow/references/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/reviews` | `src/app/api/enterprise/workflow/reviews/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/routing` | `src/app/api/enterprise/workflow/routing/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/sla` | `src/app/api/enterprise/workflow/sla/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/source` | `src/app/api/enterprise/workflow/source/route.ts` | 部分：候选、证据与来源权限，`verify-workflow-read-safety.ts` |
| `GET /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/worklogs` | `src/app/api/enterprise/workflow/worklogs/route.ts` | 待核查 |
| `GET /api/team` | `src/app/api/team/route.ts` | 部分：快照、聚合及账务写入竞争，`verify-team-subaccounts.ts` |
| `GET /api/team/access` | `src/app/api/team/access/route.ts` | 待核查 |
| `GET /api/team/conversation` | `src/app/api/team/conversation/route.ts` | 部分：对话 JSON 投影的锁及撤权，见连续排查首个检查点 |
| `GET /api/team/media` | `src/app/api/team/media/route.ts` | 待核查 |
| `GET /api/team/users` | `src/app/api/team/users/route.ts` | 待核查 |
| `GET /enterprise/workflow` | `src/app/enterprise/workflow/route.ts` | 待核查 |
| `GET /enterprise/workspace` | `src/app/enterprise/workspace/route.ts` | 待核查 |
| `PATCH /api/admin/templates` | `src/app/api/admin/templates/route.ts` | 待核查 |
| `PATCH /api/admin/tenants/[id]` | `src/app/api/admin/tenants/[id]/route.ts` | 待核查 |
| `PATCH /api/enterprise/saas-overview` | `src/app/api/enterprise/saas-overview/route.ts` | 待核查 |
| `POST /api/admin/artworks` | `src/app/api/admin/artworks/route.ts` | 待核查 |
| `POST /api/admin/bi/channel-capacity` | `src/app/api/admin/bi/channel-capacity/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config` | `src/app/api/admin/bi/model-config/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/catalog` | `src/app/api/admin/bi/model-config/catalog/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/credentials` | `src/app/api/admin/bi/model-config/credentials/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/simulate` | `src/app/api/admin/bi/model-config/simulate/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/validate` | `src/app/api/admin/bi/model-config/validate/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/versions` | `src/app/api/admin/bi/model-config/versions/route.ts` | 待核查 |
| `POST /api/admin/bi/users` | `src/app/api/admin/bi/users/route.ts` | 待核查 |
| `POST /api/admin/billing` | `src/app/api/admin/billing/route.ts` | 待核查 |
| `POST /api/admin/billing/models/postprocess/retry` | `src/app/api/admin/billing/models/postprocess/retry/route.ts` | 待核查 |
| `POST /api/admin/billing/models/preview` | `src/app/api/admin/billing/models/preview/route.ts` | 待核查 |
| `POST /api/admin/billing/operations` | `src/app/api/admin/billing/operations/route.ts` | 待核查 |
| `POST /api/admin/billing/simulate` | `src/app/api/admin/billing/simulate/route.ts` | 待核查 |
| `POST /api/admin/billing/versions` | `src/app/api/admin/billing/versions/route.ts` | 待核查 |
| `POST /api/admin/brand-logo` | `src/app/api/admin/brand-logo/route.ts` | 待核查 |
| `POST /api/admin/feature-access` | `src/app/api/admin/feature-access/route.ts` | 待核查 |
| `POST /api/admin/fleet` | `src/app/api/admin/fleet/route.ts` | 待核查 |
| `POST /api/admin/fleet/releases` | `src/app/api/admin/fleet/releases/route.ts` | 待核查 |
| `POST /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `POST /api/admin/model-health` | `src/app/api/admin/model-health/route.ts` | 待核查 |
| `POST /api/admin/model-management` | `src/app/api/admin/model-management/route.ts` | 待核查 |
| `POST /api/admin/model-management/library` | `src/app/api/admin/model-management/library/route.ts` | 待核查 |
| `POST /api/admin/model-management/onboarding` | `src/app/api/admin/model-management/onboarding/route.ts` | 待核查 |
| `POST /api/admin/mvp` | `src/app/api/admin/mvp/route.ts` | 待核查 |
| `POST /api/admin/mvp/library` | `src/app/api/admin/mvp/library/route.ts` | 待核查 |
| `POST /api/admin/owner-account` | `src/app/api/admin/owner-account/route.ts` | 待核查 |
| `POST /api/admin/prompts` | `src/app/api/admin/prompts/route.ts` | 待核查 |
| `POST /api/admin/settings` | `src/app/api/admin/settings/route.ts` | 待核查 |
| `POST /api/admin/smtp-test` | `src/app/api/admin/smtp-test/route.ts` | 待核查 |
| `POST /api/admin/supplier-cost/actions` | `src/app/api/admin/supplier-cost/actions/route.ts` | 待核查 |
| `POST /api/admin/team-access` | `src/app/api/admin/team-access/route.ts` | 待核查 |
| `POST /api/admin/teams` | `src/app/api/admin/teams/route.ts` | 待核查 |
| `POST /api/admin/templates/cache` | `src/app/api/admin/templates/cache/route.ts` | 待核查 |
| `POST /api/admin/templates/sync` | `src/app/api/admin/templates/sync/route.ts` | 待核查 |
| `POST /api/admin/tenants` | `src/app/api/admin/tenants/route.ts` | 待核查 |
| `POST /api/admin/tenants/[id]/members` | `src/app/api/admin/tenants/[id]/members/route.ts` | 待核查 |
| `POST /api/admin/tenants/[id]/organization` | `src/app/api/admin/tenants/[id]/organization/route.ts` | 待核查 |
| `POST /api/admin/tryon` | `src/app/api/admin/tryon/route.ts` | 待核查 |
| `POST /api/admin/users` | `src/app/api/admin/users/route.ts` | 待核查 |
| `POST /api/enterprise` | `src/app/api/enterprise/route.ts` | 待核查 |
| `POST /api/enterprise/members` | `src/app/api/enterprise/members/route.ts` | 待核查 |
| `POST /api/enterprise/workflow` | `src/app/api/enterprise/workflow/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/appeals` | `src/app/api/enterprise/workflow/appeals/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/capacity` | `src/app/api/enterprise/workflow/capacity/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/catalog` | `src/app/api/enterprise/workflow/catalog/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/corrections` | `src/app/api/enterprise/workflow/corrections/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/demand-batches` | `src/app/api/enterprise/workflow/demand-batches/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/demand-files` | `src/app/api/enterprise/workflow/demand-files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/files` | `src/app/api/enterprise/workflow/files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/forms` | `src/app/api/enterprise/workflow/forms/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/guidelines` | `src/app/api/enterprise/workflow/guidelines/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/notifications` | `src/app/api/enterprise/workflow/notifications/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/performance` | `src/app/api/enterprise/workflow/performance/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/projects` | `src/app/api/enterprise/workflow/projects/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/publication-files` | `src/app/api/enterprise/workflow/publication-files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/publication-preflight` | `src/app/api/enterprise/workflow/publication-preflight/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/publications` | `src/app/api/enterprise/workflow/publications/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/reviews` | `src/app/api/enterprise/workflow/reviews/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/routing` | `src/app/api/enterprise/workflow/routing/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/sla` | `src/app/api/enterprise/workflow/sla/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/source` | `src/app/api/enterprise/workflow/source/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/worklogs` | `src/app/api/enterprise/workflow/worklogs/route.ts` | 待核查 |
| `POST /api/team/users` | `src/app/api/team/users/route.ts` | 待核查 |
| `PUT /api/admin/bi/model-config/draft` | `src/app/api/admin/bi/model-config/draft/route.ts` | 待核查 |
| `PUT /api/admin/bi/profile` | `src/app/api/admin/bi/profile/route.ts` | 待核查 |
| `PUT /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `入口 /admin` | `src/middleware.ts` | 待核查 |
| `入口 /enterprise（站点模式）` | `src/middleware.ts` | 待核查 |
| `工作流 GET /healthz` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /readyz` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/appeals` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/assignees` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/availability` | `services/enterprise-workflow/src/server.ts` | 已核查：目标权限、日历与当前配置，`availability.test.ts` |
| `工作流 GET /v1/availability/history` | `services/enterprise-workflow/src/server.ts` | 已核查：权限、隐私和分页，`availability.test.ts` |
| `工作流 GET /v1/availability/members` | `services/enterprise-workflow/src/server.ts` | 已核查：经理范围、筛选与分页，`availability.test.ts` |
| `工作流 GET /v1/batch` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/batch-receipts` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/batches` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/calendar` | `services/enterprise-workflow/src/server.ts` | 已核查：团队权限与默认配置，`calendar.test.ts` |
| `工作流 GET /v1/calendar/history` | `services/enterprise-workflow/src/server.ts` | 已核查：管理权限与快照，`calendar.test.ts` |
| `工作流 GET /v1/capacity` | `services/enterprise-workflow/src/server.ts` | 部分：成员、摘要、历史已走只读快照，跨团队负荷及授权测试见 `capacity.test.ts` |
| `工作流 GET /v1/catalog` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/dashboard` | `services/enterprise-workflow/src/server.ts` | 已核查：一致汇总、分页、团队权限以及撤权并发，`dashboard.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/delivery-reviews` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/delivery/assets` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/delivery/download` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/delivery/library` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/delivery/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/delivery/scan-history` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-batches` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-files/assets` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-files/download` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-files/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-files/scan-history` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/demand-forms` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/facts` | `services/enterprise-workflow/src/server.ts` | 部分：团队及参与人范围、撤权，`performance.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/guidelines` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/handover-candidates` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/identity/workspaces` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/imports/asset` | `services/enterprise-workflow/src/server.ts` | 部分：事务外文件校验、现行权限和批次复核，`formal-import.test.ts`；多下载并发待测 |
| `工作流 GET /v1/imports/context` | `services/enterprise-workflow/src/server.ts` | 部分：只取批次目录字段，复核管理权限及启用状态，`formal-import.test.ts` |
| `工作流 GET /v1/imports/rows` | `services/enterprise-workflow/src/server.ts` | 部分：并发停用、只读投影、原路径隐私，`formal-import.test.ts`；整表网络负载待测 |
| `工作流 GET /v1/imports/worksheet` | `services/enterprise-workflow/src/server.ts` | 部分：首次展开解除批次锁、索引附件、排序兼容；整表网络负载待测 |
| `工作流 GET /v1/imports/worksheet-audit` | `services/enterprise-workflow/src/server.ts` | 已核查：目录管理员与批次范围、定长审计分页及重开，`source-worksheet.ts` |
| `工作流 GET /v1/imports/worksheet-file` | `services/enterprise-workflow/src/server.ts` | 已核查：并发停用、撤权、损坏哈希、图片响应、两个 64 MiB 流、取消与进程上限，`formal-import.test.ts`、`worksheet-download.test.ts` |
| `工作流 GET /v1/notifications` | `services/enterprise-workflow/src/server.ts` | 部分：角标、收件箱、投递、设置与审计改用只读快照，`notifications.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/orders` | `services/enterprise-workflow/src/server.ts` | 部分：分页、可见性及撤权竞争，`read-transaction.test.ts`；大范围扫描待量化 |
| `工作流 GET /v1/orders/[orderId]` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/orders/[orderId]/detail` | `services/enterprise-workflow/src/server.ts` | 已核查：事件一致性及并发移出权限返回 404，`read-transaction.test.ts` |
| `工作流 GET /v1/orders/[orderId]/history` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/people` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/people/audit` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/performance` | `services/enterprise-workflow/src/server.ts` | 部分：结算预览、规则、范围与列表投影，`performance.test.ts` |
| `工作流 GET /v1/performance-corrections` | `services/enterprise-workflow/src/server.ts` | 部分：对账、参与人范围、分页与调整明细，`corrections.test.ts` |
| `工作流 GET /v1/projects` | `services/enterprise-workflow/src/server.ts` | 部分：列表分批、30 项 14 次 SELECT、详情及历史的权限与撤权，`projects.test.ts`；大范围聚合待量化 |
| `工作流 GET /v1/publication-files` | `services/enterprise-workflow/src/server.ts` | 部分：列表 30 项 15 次 SELECT、扫描/下载范围与撤权、ZIP 无锁内整文件重读，`publication-files.test.ts`；大 ZIP 并发待量化 |
| `工作流 GET /v1/publication-preflight` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/publications` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/references` | `services/enterprise-workflow/src/server.ts` | 已核查：仅显式选中附件、租户/团队、旧来源、停用和变更，`reference-assets.test.ts` |
| `工作流 GET /v1/references/file` | `services/enterprise-workflow/src/server.ts` | 部分：快照、权限、哈希、原字节和预览限制，`reference-assets.test.ts`；同屏并发原始文件待测 |
| `工作流 GET /v1/references/library` | `services/enterprise-workflow/src/server.ts` | 部分：24 个订单页共 7 次 SELECT、撤权/停用和跨团队，`reference-assets.test.ts`；大范围精确总数待量化 |
| `工作流 GET /v1/routing` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/sla` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/tasks` | `services/enterprise-workflow/src/server.ts` | 部分：分页、执行人范围、撤权竞争，`tasks.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/teams/[teamId]/scheduling` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/teams/[teamId]/scheduling/audit` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/teams/[teamId]/scheduling/personal/[subject]` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/uploads` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/week` | `services/enterprise-workflow/src/server.ts` | 部分：任务、排期与日历、撤权及跨团队信息边界，`read-transaction.test.ts`、`calendar.test.ts` |
| `工作流 GET /v1/worklogs` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/appeals` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/availability/preview` | `services/enterprise-workflow/src/server.ts` | 已核查：不持日历或订单行锁，最新目标权限，`availability.test.ts` |
| `工作流 POST /v1/availability/save` | `services/enterprise-workflow/src/server.ts` | 部分：预览失效、原子保存及幂等；写链路其它负载待复查，`availability.test.ts` |
| `工作流 POST /v1/batch-close` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/batch-plan` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/batch-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/batch-run` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/calendar/preview` | `services/enterprise-workflow/src/server.ts` | 已核查：不等待订单写锁且哈希和影响一致，`calendar.test.ts` |
| `工作流 POST /v1/calendar/save` | `services/enterprise-workflow/src/server.ts` | 部分：与预览重算、幂等和有效版本，`calendar.test.ts` |
| `工作流 POST /v1/cancellation-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/capacity` | `services/enterprise-workflow/src/server.ts` | 部分：预览只算一次基础负荷、目录撤权、保存校验和 WIP，`capacity.test.ts` |
| `工作流 POST /v1/catalog/apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/catalog/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/change-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/commands` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/delivery-reviews` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/delivery/scan` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/delivery/upload` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-batches/apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-batches/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-files/scan` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-files/upload` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-forms` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/guidelines` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/imports/resolve` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/imports/worksheet-command` | `services/enterprise-workflow/src/server.ts` | 部分：工作表命令保留版本、幂等、并发和回滚，`source-worksheet.ts` |
| `工作流 POST /v1/imports/worksheet-upload` | `services/enterprise-workflow/src/server.ts` | 部分：通用附件额度、类型和哈希，`source-worksheet.ts` |
| `工作流 POST /v1/intake` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/notifications` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/pause-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/profile` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/roster-apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/roster-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/performance` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/performance-corrections` | `services/enterprise-workflow/src/server.ts` | 部分：更正预览不占结算锁，写入重算，`corrections.test.ts` |
| `工作流 POST /v1/plan-move/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/projects` | `services/enterprise-workflow/src/server.ts` | 部分：原命令的原子性、快照、重放及授权回归；预览持项目/订单锁待复现 |
| `工作流 POST /v1/publication-files` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/publication-preflight` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/publications` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/routing` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/routing/resolve` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/scheduling/commands` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/sla` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/uploads` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/worklogs` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 PUT /v1/uploads` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `布局 /admin` | `src/app/admin/layout.tsx` | 待核查 |
| `页面 /admin` | `src/app/admin/page.tsx` | 待核查 |
| `页面 /admin/bi` | `src/app/admin/bi/page.tsx` | 待核查 |
| `页面 /admin/bi/models` | `src/app/admin/bi/models/page.tsx` | 待核查 |
| `页面 /admin/billing` | `src/app/admin/billing/page.tsx` | 待核查 |
| `页面 /admin/billing/price-table` | `src/app/admin/billing/price-table/page.tsx` | 待核查 |
| `页面 /admin/billing/supplier-cost` | `src/app/admin/billing/supplier-cost/page.tsx` | 待核查 |
| `页面 /admin/center` | `src/app/admin/center/page.tsx` | 部分：默认双概览分口径，旧 URL 重复 BI GET 已在真实浏览器复现及修复；导航和各面板仍待复查 |
| `页面 /admin/creations` | `src/app/admin/creations/page.tsx` | 部分：实测可见性、重试、会话取消、预览解码、24 张图请求峰值和切换时清理；真实导航组合待核 |
| `页面 /admin/creations/[id]` | `src/app/admin/creations/[id]/page.tsx` | 待核查 |
| `页面 /admin/creations/resolve` | `src/app/admin/creations/resolve/page.tsx` | 待核查 |
| `页面 /admin/deployments` | `src/app/admin/deployments/page.tsx` | 待核查 |
| `页面 /admin/feature-access` | `src/app/admin/feature-access/page.tsx` | 待核查 |
| `页面 /admin/health` | `src/app/admin/health/page.tsx` | 待核查 |
| `页面 /admin/model-health` | `src/app/admin/model-health/page.tsx` | 待核查 |
| `页面 /admin/model-management` | `src/app/admin/model-management/page.tsx` | 待核查 |
| `页面 /admin/model-management/library` | `src/app/admin/model-management/library/page.tsx` | 待核查 |
| `页面 /admin/mvp` | `src/app/admin/mvp/page.tsx` | 待核查 |
| `页面 /admin/mvp/library` | `src/app/admin/mvp/library/page.tsx` | 待核查 |
| `页面 /admin/pending-review` | `src/app/admin/pending-review/page.tsx` | 待核查 |
| `页面 /admin/pricing` | `src/app/admin/pricing/page.tsx` | 待核查 |
| `页面 /admin/supplier-balances` | `src/app/admin/supplier-balances/page.tsx` | 待核查 |
| `页面 /admin/team-access` | `src/app/admin/team-access/page.tsx` | 待核查 |
| `页面 /admin/teams` | `src/app/admin/teams/page.tsx` | 待核查 |
| `页面 /admin/tenants` | `src/app/admin/tenants/page.tsx` | 待核查 |
| `页面 /admin/tenants/[tenantId]` | `src/app/admin/tenants/[tenantId]/page.tsx` | 待核查 |
| `页面 /admin/usage` | `src/app/admin/usage/page.tsx` | 待核查 |
| `页面 /enterprise` | `src/app/enterprise/page.tsx` | 待核查 |
