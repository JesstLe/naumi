# 后台逐入口排查清单

从 Git 跟踪的页面、布局、Next API 方法和工作流服务分发生成。另列与后台共用业务连接池的素材入口。它只枚举入口；同方法内的 `action`、`operation`、筛选、客户端触发及向下调用要在对应行追加证据。POST 也有只读预览，不能按方法直接划为写入。代理与直连分别记账；覆盖本表不代表完成生产验收。

`待核查` 表示尚未逐项验证；`部分` 说明已验证的分支；整行所有读取变体和边界都有证据时才标记 `已核查`。用 `node scripts/audit-admin-read-inventory.mjs --update` 刷新入口并保留未变化行的记录，默认命令仅检查清单是否漂移。

| 入口 | 定义 | 覆盖与证据 |
| --- | --- | --- |
| `DELETE /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `GET /api/admin/artworks` | `src/app/api/admin/artworks/route.ts` | 部分：旧客户端列表字段、软删除、导入/封禁标记保留；隔离库 4 万行深页、越界、同时间排序、管理员验证、排队超时和真实 HTTP 断开通过。当前导航未挂载旧作品组件；生产网关和更长历史待核 |
| `GET /api/admin/bi` | `src/app/api/admin/bi/route.ts` | 部分：overview 去重复扫描、作品深页先排序键、越界只计数；全分类 145 项新旧结果对照；查询取消；数据快照与其它报表共用池前排队。鉴权/审计、长窗 SQL 成本及真实网关待核 |
| `GET /api/admin/bi/channel-capacity` | `src/app/api/admin/bi/channel-capacity/route.ts` | 部分：同一只读快照内核对发布版、合并预算、租约和通道；隔离库验证五连接压力、断开取消、旧租约不占展示限额、无 Router 调用。真实网关待核 |
| `GET /api/admin/bi/conversation` | `src/app/api/admin/bi/conversation/route.ts` | 部分：按账号和会话取文字、保持 20 条分页；回环 HTTP 断开后 PostgreSQL 在解锁前退出；共享报表连接排队。会话正文大样本结果对照；真实网关与高并发待核 |
| `GET /api/admin/bi/media` | `src/app/api/admin/bi/media/route.ts` | 部分：私有素材只取一次正文、本人原图授权、审计、与企业共用并发槽、断开停止存储和 SQL、实际 Chromium 切换/延迟加载。`verify-platform-bi-preview-pressure.ts`、`verify-bi-preview-browser.cjs`；真实网关待核 |
| `GET /api/admin/bi/model-config` | `src/app/api/admin/bi/model-config/route.ts` | 待核查 |
| `GET /api/admin/bi/model-config/catalog` | `src/app/api/admin/bi/model-config/catalog/route.ts` | 部分：隔离验证管理员、缓存、已配置模型名，以及不暴露凭据；旧草稿读的写入和锁仍待独立核查 |
| `GET /api/admin/bi/model-config/versions` | `src/app/api/admin/bi/model-config/versions/route.ts` | 待核查 |
| `GET /api/admin/bi/provider-ops` | `src/app/api/admin/bi/provider-ops/route.ts` | 部分：隔离回归验证发布凭据隔离、同账户去重、缓存、版本变动拒绝、管理员边界和活动口径；50,000 条聚合、50,001 条原上限、历史索引、并发占用及真实 HTTP 断开配置/凭据/事件/熔断 SQL、最后页面取消上游已通过。缓存本身的现场锁与真实网关待核 |
| `GET /api/admin/bi/trace` | `src/app/api/admin/bi/trace/route.ts` | 部分：外部追踪的总时限、在途上限及部分结果，`verify-bi-trace-deadline.ts` |
| `GET /api/admin/bi/usage` | `src/app/api/admin/bi/usage/route.ts` | 部分：隔离断开、CSV 精简、新旧浏览器兼容；混合企业报表并发占满场景复现与连接保留见 `verify-admin-report-contention.ts`。每页精确统计成本和真实网关待核 |
| `GET /api/admin/billing` | `src/app/api/admin/billing/route.ts` | 已核查：隔离 PG 证实不初始化、不等发布锁、活动版本只读一次，同快照计算开关，断开释放查询；权限与私有响应头保留 |
| `GET /api/admin/billing/image25-prices` | `src/app/api/admin/billing/image25-prices/route.ts` | 已核查：只读发布版本的换算字段，零 Router 发现；预算降级、精确金额、鉴权、私有头及真实 HTTP 断开释放通过 |
| `GET /api/admin/billing/models/stages` | `src/app/api/admin/billing/models/stages/route.ts` | 待核查 |
| `GET /api/admin/billing/operations` | `src/app/api/admin/billing/operations/route.ts` | 已核查：列表和详情不等待账务行锁，不写状态；可取消，旧字段和人工核对资格保持 |
| `GET /api/admin/billing/pending` | `src/app/api/admin/billing/pending/route.ts` | 已核查：汇总和四类列表同一只读快照；角标继续只计已记录的状态及待核查任务 |
| `GET /api/admin/billing/versions` | `src/app/api/admin/billing/versions/route.ts` | 已核查：列表仅元数据，按版本游标翻页并兼容原数组；单版本只读冻结快照。隔离 PG 核对权限、错误、私有头、并发插入和两条读取断开释放 |
| `GET /api/admin/creations` | `src/app/api/admin/creations/route.ts` | 部分：精确计数、正式/归档及混合断开；显式来源和仅正式租户列表不等无关历史表，未启用全站游标 |
| `GET /api/admin/creations/[id]` | `src/app/api/admin/creations/[id]/route.ts` | 部分：详情证据、费用和旧 URL；素材、子任务独立翻页。首次详情与历史失败诊断按实际来源查询，无关表锁隔离通过；无关联历史的深页成本与真实网关待核 |
| `GET /api/admin/creations/[id]/assets/[assetId]` | `src/app/api/admin/creations/[id]/assets/[assetId]/route.ts` | 部分：历史深页、来源定位、Range、浏览器峰值与渲染器已测；隔离 PG 验证连接额度、断开取消和按真实关联读取待补齐素材。真实网关与多实例待核 |
| `GET /api/admin/creations/[id]/events` | `src/app/api/admin/creations/[id]/events/route.ts` | 部分：鉴权、断开、4.8 万事件深页窄排序；新旧响应及正式/归档准确总数对照通过，真实网关待核 |
| `GET /api/admin/enterprise-workbench` | `src/app/api/admin/enterprise-workbench/route.ts` | 部分：名单、成员无权不读指标、流水独立分页；隔离库验证作品/任务深页、精准计数和越界锁竞争；真实网关与高并发待核 |
| `GET /api/admin/feature-access` | `src/app/api/admin/feature-access/route.ts` | 待核查 |
| `GET /api/admin/fleet` | `src/app/api/admin/fleet/route.ts` | 待核查 |
| `GET /api/admin/fleet/releases` | `src/app/api/admin/fleet/releases/route.ts` | 待核查 |
| `GET /api/admin/fleet/status` | `src/app/api/admin/fleet/status/route.ts` | 待核查 |
| `GET /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `GET /api/admin/model-health` | `src/app/api/admin/model-health/route.ts` | 待核查 |
| `GET /api/admin/model-management` | `src/app/api/admin/model-management/route.ts` | 部分：列表、积分细项、视频就绪/迁移按已发布快照；真实隔离 HTTP 验证授权、池占用、断开释放、并发版本切换、冻结缺失不补写与摘要不符拒绝。公网网关及冷启动待核 |
| `GET /api/admin/model-management/library` | `src/app/api/admin/model-management/library/route.ts` | 已核查：可取消只读快照，列表保留精确计数和分页；详情与历史保留 404；单页导出只取完整模型记录 |
| `GET /api/admin/model-management/onboarding` | `src/app/api/admin/model-management/onboarding/route.ts` | 已核查：可取消的单连接只读快照，无草稿写入或行锁等待；版本、归属和最近五份历史恢复保持 |
| `GET /api/admin/mvp` | `src/app/api/admin/mvp/route.ts` | 待核查 |
| `GET /api/admin/mvp/library` | `src/app/api/admin/mvp/library/route.ts` | 已核查：与模型管理共用权限和只读查询，旧入口响应结构保持 |
| `GET /api/admin/owner-account` | `src/app/api/admin/owner-account/route.ts` | 待核查 |
| `GET /api/admin/prompts` | `src/app/api/admin/prompts/route.ts` | 待核查 |
| `GET /api/admin/pubkey` | `src/app/api/admin/pubkey/route.ts` | 待核查 |
| `GET /api/admin/saas-overview` | `src/app/api/admin/saas-overview/route.ts` | 已核查：权限、日期、旧快照、独立指标、共享报表额度和断开；六年合成历史验证近期/一年/空区间索引，生产索引与真实网关待验 |
| `GET /api/admin/settings` | `src/app/api/admin/settings/route.ts` | 待核查 |
| `GET /api/admin/supplier-cost` | `src/app/api/admin/supplier-cost/route.ts` | 部分：四个标签和旧合包隔离验证，共享读取额度与断开取消；48,000 条隔离流水验证长窗口、完整链前 500、旧页码减宽排序和响应一致。更大数据的精确总数、深偏移上界仍待量化 |
| `GET /api/admin/supplier-cost/operations/[id]` | `src/app/api/admin/supplier-cost/operations/[id]/route.ts` | 部分：隔离 PG 验证权限、私有响应、共享额度、断开取消、旧五部分同快照；新版摘要与费用按 25 条翻页、单次详情按归属校验。单调用超大 JSON 和旧完整响应仍需容量验收 |
| `GET /api/admin/team-access` | `src/app/api/admin/team-access/route.ts` | 待核查 |
| `GET /api/admin/teams` | `src/app/api/admin/teams/route.ts` | 待核查 |
| `GET /api/admin/templates` | `src/app/api/admin/templates/route.ts` | 待核查 |
| `GET /api/admin/templates/cache` | `src/app/api/admin/templates/cache/route.ts` | 待核查 |
| `GET /api/admin/tenant-usage` | `src/app/api/admin/tenant-usage/route.ts` | 部分：混合报表额度、HTTP 断开取消、冻结归属及隔离 PG 36,000 根记录的一年范围、单日与空窗口通过；真实站容量待核 |
| `GET /api/admin/tenants` | `src/app/api/admin/tenants/route.ts` | 部分：列表、负责人和操作结果共享读额度与断开取消；操作归属、邮箱三种结果、锁超时和同编号恢复通过；真实网关和高子任务比例计划待核 |
| `GET /api/admin/tenants/[id]` | `src/app/api/admin/tenants/[id]/route.ts` | 部分：平台权限、按需投影、成员分页与搜索、直属上级候选分页、旧全量字段、报表队列和断开取消隔离通过；真实网关与超大租户查询计划待核 |
| `GET /api/admin/tryon` | `src/app/api/admin/tryon/route.ts` | 待核查 |
| `GET /api/admin/update-check` | `src/app/api/admin/update-check/route.ts` | 待核查 |
| `GET /api/admin/usage` | `src/app/api/admin/usage/route.ts` | 待核查 |
| `GET /api/admin/users` | `src/app/api/admin/users/route.ts` | 待核查 |
| `GET /api/enterprise` | `src/app/api/enterprise/route.ts` | 部分：选择器和目录共享额度及 HTTP 断开；隔离 PG 的 1,801 人字段、批量汇总、304 与实时撤权通过；浏览器搜索、50 行分页、切企业取消通过；初次大响应和真实网关待核 |
| `GET /api/enterprise/analytics` | `src/app/api/enterprise/analytics/route.ts` | 部分：账务权限复验、CSV 一次分类/5 万边界、断开和并发排队；八年长窗聚合执行计划、8 组逐字段对照和用途筛选不等待作品表，见 `verify-enterprise-analytics-window.ts`。更多历史分布与真实网关待核 |
| `GET /api/enterprise/artworks` | `src/app/api/enterprise/artworks/route.ts` | 部分：真实授权范围、回收站、跨企业和撤权、深页/素材、CSV 只读当页；隔离 HTTP 断开释放、数据快照共享报表排队；浏览器连续切换/真实网关待核 |
| `GET /api/enterprise/content` | `src/app/api/enterprise/content/route.ts` | 待核查 |
| `GET /api/enterprise/creations` | `src/app/api/enterprise/creations/route.ts` | 部分：近期、历史归属、共享额度和取消；共用查询提前排除无权账号和不匹配来源，企业真实网关与混合深页待核 |
| `GET /api/enterprise/creations/[id]` | `src/app/api/enterprise/creations/[id]/route.ts` | 部分：证据和费用分页、历史脱敏、来源定位；等待期间撤权实测 403。素材、子任务页及首次详情的实时状态均已验证无关任务表锁隔离；真实网关待核 |
| `GET /api/enterprise/creations/[id]/assets/[assetId]` | `src/app/api/enterprise/creations/[id]/assets/[assetId]/route.ts` | 部分：Range、旧 URL、归属、连接和页面并发通过；旧路径和带定位路径均跳过无关来源表，等待时可撤权且原请求 403。渲染器已测，真实网关待核 |
| `GET /api/enterprise/creations/[id]/events` | `src/app/api/enterprise/creations/[id]/events/route.ts` | 部分：正式与归档脱敏、跨租户、撤权和断开；4.8 万事件深页、同时间顺序、越权子链及确切总数已验 |
| `GET /api/enterprise/health` | `src/app/api/enterprise/health/route.ts` | 部分：健康统计权限、账户行锁及隔离，`verify-enterprise-analytics.ts` |
| `GET /api/enterprise/integration` | `src/app/api/enterprise/integration/route.ts` | 部分：实际登录、独立站、下级范围、流水精确分页及配置缺失拒绝；作品/生成历史深页、越界和具体记录读范围通过隔离库验证；真实网关待核 |
| `GET /api/enterprise/media` | `src/app/api/enterprise/media/route.ts` | 部分：隔离 HTTP 验证共用渲染队列并发、过载、取消、镜像回退；单图的作品授权查询在断开时释放，私有权限和缓存版本回归。外围入口鉴权和真实网关待核 |
| `GET /api/enterprise/saas-overview` | `src/app/api/enterprise/saas-overview/route.ts` | 部分：同租户/主管范围、所有者计数、报表额度及断开取消通过；共用授权以万人成员验证暂停链、实时撤权及同人数拓扑变更，完整页面规模和真实网关待核 |
| `GET /api/enterprise/tenant-usage` | `src/app/api/enterprise/tenant-usage/route.ts` | 部分：额度、断开、冻结账务及隔离 PG 年度主管范围通过；万人授权和报表返回前撤权单独通过，叠加真实用量和站点容量待核 |
| `GET /api/enterprise/usage` | `src/app/api/enterprise/usage/route.ts` | 部分：报表账户行锁、撤权；CSV 精简投影不扩大成员权限；关闭 HTTP 后事务释放，与 BI 共用报表排队。长窗 SQL 成本和真实网关待核 |
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
| `GET /api/team/media` | `src/app/api/team/media/route.ts` | 部分：真实回环断开能释放被锁的作品查询或关闭存储连接；共享预览队列、私有响应、版本 409 和旧 WebP 字节通过；生产网关和慢盘待核 |
| `GET /api/team/users` | `src/app/api/team/users/route.ts` | 待核查 |
| `GET /enterprise/workflow` | `src/app/enterprise/workflow/route.ts` | 待核查 |
| `GET /enterprise/workspace` | `src/app/enterprise/workspace/route.ts` | 待核查 |
| `PATCH /api/admin/templates` | `src/app/api/admin/templates/route.ts` | 待核查 |
| `PATCH /api/admin/tenants/[id]` | `src/app/api/admin/tenants/[id]/route.ts` | 待核查 |
| `PATCH /api/enterprise/saas-overview` | `src/app/api/enterprise/saas-overview/route.ts` | 待核查 |
| `POST /api/admin/artworks` | `src/app/api/admin/artworks/route.ts` | 部分：封禁分支与成员管理共享权限，阻止自封、其他管理员和跨站请求，成功记录操作日志（`verify-admin-route-hardening.ts`）；导入和删除的完整读写链路待核 |
| `POST /api/admin/bi/channel-capacity` | `src/app/api/admin/bi/channel-capacity/route.ts` | 部分：隔离模块回归验证预算复位、通道探测状态清理、未知目标拒绝与审计字段；现网管理员入口未验，未在生产复位 |
| `POST /api/admin/bi/model-config` | `src/app/api/admin/bi/model-config/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/catalog` | `src/app/api/admin/bi/model-config/catalog/route.ts` | 部分核查：显式刷新已验证短事务、跨连接池去重、过期结果不覆盖及客户端取消；旧版滚动期及间接写入口另验 |
| `POST /api/admin/bi/model-config/credentials` | `src/app/api/admin/bi/model-config/credentials/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/simulate` | `src/app/api/admin/bi/model-config/simulate/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/validate` | `src/app/api/admin/bi/model-config/validate/route.ts` | 待核查 |
| `POST /api/admin/bi/model-config/versions` | `src/app/api/admin/bi/model-config/versions/route.ts` | 待核查 |
| `POST /api/admin/bi/users` | `src/app/api/admin/bi/users/route.ts` | 待核查 |
| `POST /api/admin/billing` | `src/app/api/admin/billing/route.ts` | 待核查 |
| `POST /api/admin/billing/models/postprocess/retry` | `src/app/api/admin/billing/models/postprocess/retry/route.ts` | 待核查 |
| `POST /api/admin/billing/models/preview` | `src/app/api/admin/billing/models/preview/route.ts` | 待核查 |
| `POST /api/admin/billing/operations` | `src/app/api/admin/billing/operations/route.ts` | 已核查：锁定原操作后复核资格，原报价、审计、原操作号重试和历史隔离保持 |
| `POST /api/admin/billing/simulate` | `src/app/api/admin/billing/simulate/route.ts` | 待核查 |
| `POST /api/admin/billing/versions` | `src/app/api/admin/billing/versions/route.ts` | 部分：隔离 PG 真实路由验证来源、版本 CAS、冻结目标与原操作重试，历史版本未改；生产模型配置兼容与真实用量待验 |
| `POST /api/admin/brand-logo` | `src/app/api/admin/brand-logo/route.ts` | 待核查 |
| `POST /api/admin/feature-access` | `src/app/api/admin/feature-access/route.ts` | 待核查 |
| `POST /api/admin/fleet` | `src/app/api/admin/fleet/route.ts` | 待核查 |
| `POST /api/admin/fleet/releases` | `src/app/api/admin/fleet/releases/route.ts` | 待核查 |
| `POST /api/admin/login` | `src/app/api/admin/login/route.ts` | 待核查 |
| `POST /api/admin/model-health` | `src/app/api/admin/model-health/route.ts` | 待核查 |
| `POST /api/admin/model-management` | `src/app/api/admin/model-management/route.ts` | 部分：接入后的补读及发布前注册目录均不持发布锁等待供应商；显式新增模型不再刷新目录；Router 执行另核 |
| `POST /api/admin/model-management/library` | `src/app/api/admin/model-management/library/route.ts` | 待核查 |
| `POST /api/admin/model-management/onboarding` | `src/app/api/admin/model-management/onboarding/route.ts` | 已核查：预览与保存不访问供应商；首次保存原修订号、并发只写一次、旧草稿 ID、模型版本与权限回归通过 |
| `POST /api/admin/mvp` | `src/app/api/admin/mvp/route.ts` | 部分：与模型管理共用发布入口；接入补读和注册网络读取已移出发布锁，Router 执行待核 |
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
| `共享素材 POST /api/media/image-cache` | `src/app/api/media/image-cache/route.ts` | 部分：原件/两种预览、私有权限、旧版本冲突；企业与旧团队按范围批量读取并在断开后释放，旧团队保留逐项审计与同一限流配额，实时移除成员时不返回旧版本。见 `verify-enterprise-media-manifest.ts` 和 `verify-team-media-manifest.ts`；64 项直接素材回归。本地慢盘、断开前鉴权与真实网关待核 |
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
| `页面 /admin/billing` | `src/app/admin/billing/page.tsx` | 部分：人工核对新旧深链不读现价；列表、详情及当前配置读取取消去重，切换保留草稿和原提交身份；历史翻页、预览防乱序、基线更新保留冻结目标和恢复重试已核。其他分区另核 |
| `页面 /admin/billing/price-table` | `src/app/admin/billing/price-table/page.tsx` | 已核查：实际浏览器验证筛选和导出零请求、下载与显示同一版本、连点刷新去重、离开取消；隔离验证，非生产 |
| `页面 /admin/billing/supplier-cost` | `src/app/admin/billing/supplier-cost/page.tsx` | 部分：调用链切换、去重、取消、分页及账务按需展开，旧服务器返回完整数据时本地分页；长窗口和深页已隔离核查。写操作与真实容量另核 |
| `页面 /admin/center` | `src/app/admin/center/page.tsx` | 部分：双概览分口径和独立读取；新建租户结果不确定时按原编号核对，离开取消且不重复提交；其他面板和真实网关待复查 |
| `页面 /admin/creations` | `src/app/admin/creations/page.tsx` | 部分：预览峰值、可见性及取消；浏览器验证共享容器的素材、事件与子任务独立翻页、深链、独立重试、旧响应兼容及撤权清空；真实网关待核 |
| `页面 /admin/creations/[id]` | `src/app/admin/creations/[id]/page.tsx` | 待核查 |
| `页面 /admin/creations/resolve` | `src/app/admin/creations/resolve/page.tsx` | 待核查 |
| `页面 /admin/deployments` | `src/app/admin/deployments/page.tsx` | 待核查 |
| `页面 /admin/feature-access` | `src/app/admin/feature-access/page.tsx` | 待核查 |
| `页面 /admin/health` | `src/app/admin/health/page.tsx` | 待核查 |
| `页面 /admin/model-health` | `src/app/admin/model-health/page.tsx` | 待核查 |
| `页面 /admin/model-management` | `src/app/admin/model-management/page.tsx` | 待核查 |
| `页面 /admin/model-management/library` | `src/app/admin/model-management/library/page.tsx` | 部分核查：列表、详情、历史与单页导出已核；同步写操作另验 |
| `页面 /admin/mvp` | `src/app/admin/mvp/page.tsx` | 待核查 |
| `页面 /admin/mvp/library` | `src/app/admin/mvp/library/page.tsx` | 部分核查：旧入口 GET 与单页导出已核；同步写操作另验 |
| `页面 /admin/pending-review` | `src/app/admin/pending-review/page.tsx` | 部分：四类清单、计数和核对资格由已验证接口提供；页面本体未单独做浏览器回归 |
| `页面 /admin/pricing` | `src/app/admin/pricing/page.tsx` | 待核查 |
| `页面 /admin/supplier-balances` | `src/app/admin/supplier-balances/page.tsx` | 待核查 |
| `页面 /admin/team-access` | `src/app/admin/team-access/page.tsx` | 待核查 |
| `页面 /admin/teams` | `src/app/admin/teams/page.tsx` | 待核查 |
| `页面 /admin/tenants` | `src/app/admin/tenants/page.tsx` | 待核查 |
| `页面 /admin/tenants/[tenantId]` | `src/app/admin/tenants/[tenantId]/page.tsx` | 部分：浏览器验证标签按需、取消、成员页最多 50 行、搜索、跨页直属上级、岗位总数、兼容旧响应；真实网关待核 |
| `页面 /admin/usage` | `src/app/admin/usage/page.tsx` | 待核查 |
| `页面 /enterprise` | `src/app/enterprise/page.tsx` | 待核查 |
