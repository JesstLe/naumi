# 后台逐入口排查清单

从 Git 跟踪的页面、布局、Next API 方法和工作流服务分发生成。另列与后台共用业务连接池的素材入口。它只枚举入口；同方法内的 `action`、`operation`、筛选、客户端触发及向下调用要在对应行追加证据。POST 也有只读预览，不能按方法直接划为写入。代理与直连分别记账；覆盖本表不代表完成生产验收。

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
| `GET /api/admin/creations/[id]/assets/[assetId]` | `src/app/api/admin/creations/[id]/assets/[assetId]/route.ts` | 部分：历史深页、锁竞争、Range、来源定位、浏览器峰值和共用渲染器 HTTP 过载/断开通过；真实网关与多实例待核 |
| `GET /api/admin/creations/[id]/events` | `src/app/api/admin/creations/[id]/events/route.ts` | 部分：规范与历史事件投影、鉴权、无事件历史空结果，`verify-saas-creations.ts`；大任务族待核 |
| `GET /api/admin/enterprise-workbench` | `src/app/api/admin/enterprise-workbench/route.ts` | 部分：租户筛选下推、成员无查看权时不读指标、流水独立分页，真实隔离库验证授权、越界、归属和锁竞争；作品/生成历史大页待复核 |
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
| `GET /api/enterprise` | `src/app/api/enterprise/route.ts` | 部分：目录与站点范围、仅成员管理避开账务/素材表、停用成员指标隔离；超大成员目录和浏览器切换待复核 |
| `GET /api/enterprise/analytics` | `src/app/api/enterprise/analytics/route.ts` | 部分：隔离 PostgreSQL 验证日期边界、汇总、CSV、订单归属、现行权限及写方获取账户锁，`verify-enterprise-analytics.ts`；长窗口/高容量查询、断开和导出峰值待核 |
| `GET /api/enterprise/artworks` | `src/app/api/enterprise/artworks/route.ts` | 待核查 |
| `GET /api/enterprise/content` | `src/app/api/enterprise/content/route.ts` | 待核查 |
| `GET /api/enterprise/creations` | `src/app/api/enterprise/creations/route.ts` | 部分：企业近期固定 5 条、历史归属与统一列表；混合归档深页待核 |
| `GET /api/enterprise/creations/[id]` | `src/app/api/enterprise/creations/[id]/route.ts` | 部分：共用详情查询经大任务 SQL 对照；企业鉴权、证据和费用分页、脱敏、撤权、来源定位已验证 |
| `GET /api/enterprise/creations/[id]/assets/[assetId]` | `src/app/api/enterprise/creations/[id]/assets/[assetId]/route.ts` | 部分：Range、撤权、旧 URL、归属、连接和页面并发通过；共用渲染器 HTTP 限流、断开和回退通过，真实网关待核 |
| `GET /api/enterprise/creations/[id]/events` | `src/app/api/enterprise/creations/[id]/events/route.ts` | 部分：事件分页、规范与归档脱敏、跨租户、撤权和锁竞争，`verify-saas-creations.ts`；大任务族待核 |
| `GET /api/enterprise/health` | `src/app/api/enterprise/health/route.ts` | 部分：健康统计权限、账户行锁及隔离，`verify-enterprise-analytics.ts` |
| `GET /api/enterprise/integration` | `src/app/api/enterprise/integration/route.ts` | 部分：登录、独立站租户、下级范围、流水精确分页及配置缺失拒绝，`verify-enterprise-integration.ts`、`verify-enterprise-analytics.ts`；历史大页和真实网关待复核 |
| `GET /api/enterprise/media` | `src/app/api/enterprise/media/route.ts` | 部分：共用渲染器的并发、过载、取消与镜像回退经本地 HTTP 验证；此入口自身的授权组合待核 |
| `GET /api/enterprise/saas-overview` | `src/app/api/enterprise/saas-overview/route.ts` | 待核查 |
| `GET /api/enterprise/tenant-usage` | `src/app/api/enterprise/tenant-usage/route.ts` | 待核查 |
| `GET /api/enterprise/usage` | `src/app/api/enterprise/usage/route.ts` | 部分：报表账户行锁及撤权，`verify-enterprise-analytics.ts` |
| `GET /api/enterprise/workflow` | `src/app/api/enterprise/workflow/route.ts` | 部分：工作流代理的取消和流限制；动态 action 按工作流直连条目继续追踪 |
| `GET /api/enterprise/workflow/appeals` | `src/app/api/enterprise/workflow/appeals/route.ts` | 部分：实际登录 Cookie 和签名代理专项回归，通过跨企业、跨团队和撤权边界；直连断开实测，真实网关待核 |
| `GET /api/enterprise/workflow/capacity` | `src/app/api/enterprise/workflow/capacity/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/catalog` | `src/app/api/enterprise/workflow/catalog/route.ts` | 部分：隔离代理身份/读契约，直连无目录锁、撤权和分页；真实网关待核 |
| `GET /api/enterprise/workflow/corrections` | `src/app/api/enterprise/workflow/corrections/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/demand-batches` | `src/app/api/enterprise/workflow/demand-batches/route.ts` | 部分：代理身份/有界读，直连列表分页、回执批量读取、范围复核和断开已回归，真实网关待核 |
| `GET /api/enterprise/workflow/demand-files` | `src/app/api/enterprise/workflow/demand-files/route.ts` | 部分：预览代理断开传递、直连取消文件校验、扫描历史和已选附件撤权回归；真实网关待核 |
| `GET /api/enterprise/workflow/files` | `src/app/api/enterprise/workflow/files/route.ts` | 部分：预览代理断开传递、直连原件取消与审计、扫描历史和字节复验；真实网关待核 |
| `GET /api/enterprise/workflow/forms` | `src/app/api/enterprise/workflow/forms/route.ts` | 部分：代理身份/有界读、直连只读快照、表单可见性和列表查询计数；真实网关待核 |
| `GET /api/enterprise/workflow/guidelines` | `src/app/api/enterprise/workflow/guidelines/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/imports` | `src/app/api/enterprise/workflow/imports/route.ts` | 部分：代码确认 source/worksheet 流式代理及客户端断开传递；工作流直连两份 64 MiB 已核查，代理实流复查保留 |
| `GET /api/enterprise/workflow/notifications` | `src/app/api/enterprise/workflow/notifications/route.ts` | 部分：代理 JSON 上限、断开关闭上游 HTTP；浏览器角标、换页/切组去重与取消、旧服务回退、旧授权响应隔离；工作流侧 8 万条隔离样本已核；真实站点网关待验 |
| `GET /api/enterprise/workflow/performance` | `src/app/api/enterprise/workflow/performance/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/projects` | `src/app/api/enterprise/workflow/projects/route.ts` | 部分：隔离代理读契约、服务详情断开释放连接；其他动态组合待核 |
| `GET /api/enterprise/workflow/publication-files` | `src/app/api/enterprise/workflow/publication-files/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/publication-preflight` | `src/app/api/enterprise/workflow/publication-preflight/route.ts` | 部分：隔离代理身份、取消和有界响应；直连列表、详情、释放连接、文件取消和撤权回归，真实网关待核 |
| `GET /api/enterprise/workflow/publications` | `src/app/api/enterprise/workflow/publications/route.ts` | 部分：隔离代理读契约，直连列表、历史、来源及详情的快照、权限与分页验证，真实网关待核 |
| `GET /api/enterprise/workflow/references` | `src/app/api/enterprise/workflow/references/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/reviews` | `src/app/api/enterprise/workflow/reviews/route.ts` | 部分：代理静态确认请求信号和有界响应；直连断开、权限、候选和分页已验证，真实网关待核 |
| `GET /api/enterprise/workflow/routing` | `src/app/api/enterprise/workflow/routing/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/sla` | `src/app/api/enterprise/workflow/sla/route.ts` | 部分：隔离 HTTP 验证读取代理有界并随请求取消，客户端不会轮询 SLA；线上待验收 |
| `GET /api/enterprise/workflow/source` | `src/app/api/enterprise/workflow/source/route.ts` | 部分：候选、证据与来源权限；媒体分支共用渲染器经本地 HTTP 验证，真实代理断开待核 |
| `GET /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `GET /api/enterprise/workflow/worklogs` | `src/app/api/enterprise/workflow/worklogs/route.ts` | 待核查 |
| `GET /api/fleet/media` | `src/app/api/fleet/media/route.ts` | 部分：签名缩略图、拒绝越权原件、原件字节及审计、断开信号保留经隔离站点控制回归；真实中继与网关待核 |
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
| `POST /api/enterprise/workflow/appeals` | `src/app/api/enterprise/workflow/appeals/route.ts` | 部分：签名代理和实际 HTTP 流程，拒绝跨站、独立审核、重放与保留原得分；真实网关待核 |
| `POST /api/enterprise/workflow/capacity` | `src/app/api/enterprise/workflow/capacity/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/catalog` | `src/app/api/enterprise/workflow/catalog/route.ts` | 部分：隔离 HTTP 预览断开取消、已提交命令继续转发；真实网关待核 |
| `POST /api/enterprise/workflow/corrections` | `src/app/api/enterprise/workflow/corrections/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/demand-batches` | `src/app/api/enterprise/workflow/demand-batches/route.ts` | 部分：隔离 HTTP 预览取消、已转发确认继续；直连预览无业务锁、确认原子与重放回归，真实网关待核 |
| `POST /api/enterprise/workflow/demand-files` | `src/app/api/enterprise/workflow/demand-files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/files` | `src/app/api/enterprise/workflow/files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/forms` | `src/app/api/enterprise/workflow/forms/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/guidelines` | `src/app/api/enterprise/workflow/guidelines/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/notifications` | `src/app/api/enterprise/workflow/notifications/route.ts` | 部分：已提交命令不会随读取消，真实代理＋本地 HTTP 通过，`verify-workflow-read-safety.ts` |
| `POST /api/enterprise/workflow/performance` | `src/app/api/enterprise/workflow/performance/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/projects` | `src/app/api/enterprise/workflow/projects/route.ts` | 部分：实际代理预览断开、确认命令继续；直连并发、权限及回执通过，真实网关待核 |
| `POST /api/enterprise/workflow/publication-files` | `src/app/api/enterprise/workflow/publication-files/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/publication-preflight` | `src/app/api/enterprise/workflow/publication-preflight/route.ts` | 部分：直连检查文件、撤权、哈希、原子审计和幂等；代理有界请求与已受理语义静态核对 |
| `POST /api/enterprise/workflow/publications` | `src/app/api/enterprise/workflow/publications/route.ts` | 部分：实际代理预览断开、发布命令继续；直连预览和实际确认契约通过，真实网关待核 |
| `POST /api/enterprise/workflow/reviews` | `src/app/api/enterprise/workflow/reviews/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/routing` | `src/app/api/enterprise/workflow/routing/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/sla` | `src/app/api/enterprise/workflow/sla/route.ts` | 部分：区分只读预览与提交保存；隔离 HTTP 验证预览随断开取消、保存继续，客户端关闭同样仅取消读取 |
| `POST /api/enterprise/workflow/source` | `src/app/api/enterprise/workflow/source/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `POST /api/enterprise/workflow/worklogs` | `src/app/api/enterprise/workflow/worklogs/route.ts` | 待核查 |
| `POST /api/fleet/ack` | `src/app/api/fleet/ack/route.ts` | 待核查 |
| `POST /api/fleet/poll` | `src/app/api/fleet/poll/route.ts` | 待核查 |
| `POST /api/fleet/releases/ack` | `src/app/api/fleet/releases/ack/route.ts` | 待核查 |
| `POST /api/fleet/releases/poll` | `src/app/api/fleet/releases/poll/route.ts` | 待核查 |
| `POST /api/team/users` | `src/app/api/team/users/route.ts` | 待核查 |
| `PUT /api/admin/bi/model-config/draft` | `src/app/api/admin/bi/model-config/draft/route.ts` | 待核查 |
| `PUT /api/admin/bi/profile` | `src/app/api/admin/bi/profile/route.ts` | 待核查 |
| `PUT /api/enterprise/workflow/uploads` | `src/app/api/enterprise/workflow/uploads/route.ts` | 待核查 |
| `入口 /admin` | `src/middleware.ts` | 待核查 |
| `入口 /enterprise（站点模式）` | `src/middleware.ts` | 待核查 |
| `共享素材 GET /media/[...path]` | `src/app/media/[...path]/route.ts` | 部分：旧冷预览占满业务池已复现并修复；隔离 PG、真实处理器与回环 NAS 验证挂起读取/写入、租户归属、版本竞争、恢复回执及旧历史；生产 Range、峰值和网关仍待验收 |
| `共享素材 POST /api/media/image-cache` | `src/app/api/media/image-cache/route.ts` | 部分：与字节路由一致的原件和两种预览描述、缺预览回退、私有授权与旧版本冲突已在隔离处理器验证；全批次、取消与线上请求分布待核查 |
| `工作流 GET /healthz` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /readyz` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/appeals` | `services/enterprise-workflow/src/server.ts` | 隔离已核查：依据与旧指纹、列表、详情、修订历史、审核人回避、成员撤权与改派、断开归还连接；长历史数据库提取成本待量化 |
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
| `工作流 GET /v1/catalog` | `services/enterprise-workflow/src/server.ts` | 部分：上下文、SKU、选择、管理列表与历史进入可取消快照；历史无目录锁、撤权和分页回归，高基数浏览待量化 |
| `工作流 GET /v1/dashboard` | `services/enterprise-workflow/src/server.ts` | 已核查：一致汇总、分页、团队权限以及撤权并发，`dashboard.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/delivery-reviews` | `services/enterprise-workflow/src/server.ts` | 隔离已核查：context/detail 候选批量读取、history 无提交事件查询、深页、执行组与撤权、HTTP 断开归还连接；超大订单历史计划待量化 |
| `工作流 GET /v1/delivery/assets` | `services/enterprise-workflow/src/server.ts` | 部分：列表快照、任务复核、共享扫描查询，回归通过；高峰待量化 |
| `工作流 GET /v1/delivery/download` | `services/enterprise-workflow/src/server.ts` | 部分：直连断开关闭哈希、同句柄字节/审计/撤权回归；真实大文件并发待核 |
| `工作流 GET /v1/delivery/library` | `services/enterprise-workflow/src/server.ts` | 部分：按订单一次查事件、24 项详情；两组合成负载十组返回与旧版一致，HTTP 断开和途中撤权回归、旧库兼容；生产高峰待核 |
| `工作流 GET /v1/delivery/preview` | `services/enterprise-workflow/src/server.ts` | 部分：共用受限预校验、HTTP 代理断开，直连同源下载已证实取消；真实预览高峰待核 |
| `工作流 GET /v1/delivery/scan-history` | `services/enterprise-workflow/src/server.ts` | 部分：快照扫描历史，34 项完整翻页、跨团队拒绝与隔离语义回归；大量失败事件待量化 |
| `工作流 GET /v1/demand-batches` | `services/enterprise-workflow/src/server.ts` | 部分：回执 20 项 2 次订单查询含范围复核，途中失去授权拒绝、不可见项遮蔽、断开和深空页回归；真实高峰待核 |
| `工作流 GET /v1/demand-files/assets` | `services/enterprise-workflow/src/server.ts` | 部分：快照复核已选范围、扫描态单次查询、文件权限回归；高峰待量化 |
| `工作流 GET /v1/demand-files/download` | `services/enterprise-workflow/src/server.ts` | 部分：共享预校验/审计路径，真实文件字节和校验后撤权回归，生产并发待核 |
| `工作流 GET /v1/demand-files/preview` | `services/enterprise-workflow/src/server.ts` | 部分：直连断开关闭哈希、4 活跃/24 等待限制和过载恢复、原图字节回归；多进程和网关待核 |
| `工作流 GET /v1/demand-files/scan-history` | `services/enterprise-workflow/src/server.ts` | 部分：无订单行锁、撤选择拒绝、越界只计数，深历史高峰待量化 |
| `工作流 GET /v1/demand-forms` | `services/enterprise-workflow/src/server.ts` | 部分：四种读走快照，历史无团队锁，禁用复核、30 项 1 次查修订、草稿标题权限通过；深历史高峰待核 |
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
| `工作流 GET /v1/notifications` | `services/enterprise-workflow/src/server.ts` | 部分：角标、收件箱、投递、设置与审计的快照；隔离验证断开、撤权、精确全量/未读统计、投递筛选、深页顺序及越界不读详情，`notifications.test.ts`、`verify-notification-badge-plan.ts`；真实网关及超大背压仍待核 |
| `工作流 GET /v1/orders` | `services/enterprise-workflow/src/server.ts` | 部分：分页、可见性及撤权竞争，`read-transaction.test.ts`；大范围扫描待量化 |
| `工作流 GET /v1/orders/[orderId]` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/orders/[orderId]/detail` | `services/enterprise-workflow/src/server.ts` | 已核查：事件一致性及并发移出权限返回 404，`read-transaction.test.ts` |
| `工作流 GET /v1/orders/[orderId]/history` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/people` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/people/audit` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/performance` | `services/enterprise-workflow/src/server.ts` | 部分：结算预览、规则、范围与列表投影，`performance.test.ts` |
| `工作流 GET /v1/performance-corrections` | `services/enterprise-workflow/src/server.ts` | 部分：对账、参与人范围、分页与调整明细，`corrections.test.ts` |
| `工作流 GET /v1/projects` | `services/enterprise-workflow/src/server.ts` | 部分：列表分批、30 项 14 次 SELECT、详情及历史的权限与撤权、详情断开释放连接；大范围聚合待量化 |
| `工作流 GET /v1/publication-files` | `services/enterprise-workflow/src/server.ts` | 部分：列表 30 项 15 次 SELECT、扫描/下载范围与撤权、ZIP 无锁内整文件重读，`publication-files.test.ts`；大 ZIP 并发待量化 |
| `工作流 GET /v1/publication-preflight` | `services/enterprise-workflow/src/server.ts` | 部分：列表无写锁、同投影、详情文件校验释放连接、取消及撤权；大报告分页和高峰负载待核 |
| `工作流 GET /v1/publications` | `services/enterprise-workflow/src/server.ts` | 部分：四种读取已核；列表字段、历史项目与旧版一致，历史无商铺行锁，途中撤权与来源取消回归，合成深页索引计划通过，真实数据精确计数待量化 |
| `工作流 GET /v1/references` | `services/enterprise-workflow/src/server.ts` | 已核查：仅显式选中附件、租户/团队、旧来源、停用和变更，`reference-assets.test.ts` |
| `工作流 GET /v1/references/file` | `services/enterprise-workflow/src/server.ts` | 部分：快照、权限、哈希、原字节和预览限制，`reference-assets.test.ts`；同屏并发原始文件待测 |
| `工作流 GET /v1/references/library` | `services/enterprise-workflow/src/server.ts` | 部分：24 个订单页共 7 次 SELECT、撤权/停用和跨团队，`reference-assets.test.ts`；大范围精确总数待量化 |
| `工作流 GET /v1/routing` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/sla` | `services/enterprise-workflow/src/server.ts` | 部分：设置、规则历史、提醒记录只读快照，历史越界跳过文档；PG 验证权限、分页与原保存流程 |
| `工作流 GET /v1/tasks` | `services/enterprise-workflow/src/server.ts` | 部分：分页、执行人范围、撤权竞争，`tasks.test.ts`、`read-transaction.test.ts` |
| `工作流 GET /v1/teams/[teamId]/scheduling` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/teams/[teamId]/scheduling/audit` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/teams/[teamId]/scheduling/personal/[subject]` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/uploads` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 GET /v1/week` | `services/enterprise-workflow/src/server.ts` | 部分：任务、排期与日历、撤权及跨团队信息边界，`read-transaction.test.ts`、`calendar.test.ts` |
| `工作流 GET /v1/worklogs` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/appeals` | `services/enterprise-workflow/src/server.ts` | 部分：隔离回归提交、补充、处理、独立审核、写入版本与审计；本轮未改变写事务 |
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
| `工作流 POST /v1/catalog/apply` | `services/enterprise-workflow/src/server.ts` | 部分：原事务回归覆盖哈希、授权、原子回滚、并发竞争和重放；大批量查询成本待量化 |
| `工作流 POST /v1/catalog/preview` | `services/enterprise-workflow/src/server.ts` | 部分：无目录锁、原预览哈希、过程中撤权回归；最大批量查询成本待量化 |
| `工作流 POST /v1/change-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/commands` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/delivery-reviews` | `services/enterprise-workflow/src/server.ts` | 部分：隔离回归评审人、接收门禁、历史与审计、并发、幂等；写入时的素材校验耗时待复查 |
| `工作流 POST /v1/delivery/scan` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/delivery/upload` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-batches/apply` | `services/enterprise-workflow/src/server.ts` | 部分：原哈希重算、回滚、竞争单胜者、回执重放和权限回归；真实负载待核 |
| `工作流 POST /v1/demand-batches/preview` | `services/enterprise-workflow/src/server.ts` | 部分：订单、表单和目录无写锁，旧哈希一致，授权及冻结版本复核；最大复制批次资源待量化 |
| `工作流 POST /v1/demand-files/scan` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-files/upload` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/demand-forms` | `services/enterprise-workflow/src/server.ts` | 部分：保留原锁与事务，隔离独立发布、回滚、并发 CAS 和重放通过；写入峰值待核 |
| `工作流 POST /v1/guidelines` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/imports/resolve` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/imports/worksheet-command` | `services/enterprise-workflow/src/server.ts` | 部分：工作表命令保留版本、幂等、并发和回滚，`source-worksheet.ts` |
| `工作流 POST /v1/imports/worksheet-upload` | `services/enterprise-workflow/src/server.ts` | 部分：通用附件额度、类型和哈希，`source-worksheet.ts` |
| `工作流 POST /v1/intake` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/notifications` | `services/enterprise-workflow/src/server.ts` | 部分：隔离库验证标记已读幂等、通道和收件人管理、投递租约与回执处理，`notifications.test.ts`；未改写事务 |
| `工作流 POST /v1/pause-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/profile` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/roster-apply` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/people/roster-preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/performance` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/performance-corrections` | `services/enterprise-workflow/src/server.ts` | 部分：更正预览不占结算锁，写入重算，`corrections.test.ts` |
| `工作流 POST /v1/plan-move/preview` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/projects` | `services/enterprise-workflow/src/server.ts` | 部分：预览无项目/订单锁、哈希一致、撤权；实际 HTTP 断开释放预览连接，已受理提交及回执保留 |
| `工作流 POST /v1/publication-files` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/publication-preflight` | `services/enterprise-workflow/src/server.ts` | 部分：文件 IO 移出事务，解码及哈希、陈旧来源、撤权、幂等和审计回归；大文件峰值与服务断开待核 |
| `工作流 POST /v1/publications` | `services/enterprise-workflow/src/server.ts` | 部分：预览无订单/目录锁、文件校验、哈希一致和撤权；实际确认、审批、回执与重放回归，大文件高峰待核 |
| `工作流 POST /v1/routing` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/routing/resolve` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/scheduling/commands` | `services/enterprise-workflow/src/server.ts` | 待核查 |
| `工作流 POST /v1/sla` | `services/enterprise-workflow/src/server.ts` | 部分：隔离 PG 验证预览 12→2 输入查询、哈希不变、读无成员锁、撤权和移组拒绝、断开释放；保存原重算及幂等通过 |
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
