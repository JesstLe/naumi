# Naumi统一企业工作台与私有部署 PRD

2026-10-17｜总入口：`/admin`｜目标：一套产品主干、多企业平台和单企业独立部署共用代码。

## 1. 本次决定

采用**统一领域接口 + 数据源适配层 + 服务端部署策略**。不新建天地合专属代码库，不维护长期customer/tdh分支，不复制用户/作品/计费实现，不把部署切换做成浏览器传参。

同源部署优先直接调用Naumi已有服务函数，减少HTTP回环和4核8GB资源负担。分离部署使用同一领域接口的远程适配器；后者需要专用企业限定凭据/授权委托，目前设计已定义、实际远程接入尚未实施。两种传输不能在失败时自动退回更宽权限或旧缓存。

代码版本、部署位置、数据租户是三个独立维度：两台机器可以运行同一commit/镜像，分别使用自己的数据库、媒体和配置；相同镜像不代表自动数据互通。

## 2. 入口和角色

总入口`/admin`保持现有登录与管理员校验，不改为公开门户。现有/admin/center是内部落地页；新增导航“企业流程工作台”到`/admin/enterprise-workbench`，不建立第二个顶级总入口。

平台管理员：管理普通用户、企业目录、授权、接入实例、部署配置及平台统计。可选择多个已授权企业，不通过公司名称筛选来实现权限。

企业老板/管理者：原`/enterprise`仍作为企业授权工作区，沿用组织树/view_records/manage_members和入口授权周期。后续可从统一入口按能力路由进入企业工作区；这不是将其提升为平台管理员。本轮新/admin工作台只允许平台管理员。

员工：进入需求、任务、排期和本人创作，权限由企业和团队显式授予。普通个人用户不因account_type/公司文本有“企业”而成为企业员工。

## 3. 当前代码证据

| 已有源 | 当前功能 | 本次复用 |
|---|---|---|
| src/app/admin/page.tsx、admin-client、center-shell | /admin统一验证、用户与企业、业务任务、作品、流水、后台管理 | 原入口和Shell不另建 |
| /api/enterprise | 企业列表/成员/角色/组织 | 实时企业范围和成员快照 |
| enterprise/server.ts enterpriseRead | 同事务组织树、当前账号、企业/入口授权校验 | 记录读取权限权威 |
| /api/enterprise/artworks + bi/repository | 作品、提示词、溯源、输入与尺寸 | 标准化作品DTO |
| /api/enterprise/content | 旧任务/作品分页 | 保留兼容，不重复改写它 |
| /api/enterprise/media | 资源所属范围和图片变换 | 受保护缩略图引用 |
| enterprise/analytics | 实际流水分类、退款、净额、分页 | 积分明细，不复制算账规则 |
| app_image_jobs / app_canvas_image_tasks / app_video_tasks | 普通生图、画布任务、视频执行事实 | 统一生成记录命名空间 |
| app_ledger / app_billing_operations | 积分变动、计费操作/结算 | 消耗权威，不由新系统记第二笔账 |

重要现状：app_users主键是email；app_enterprise_members以enterprise_id+email为主键且有UNIQUE(email)，当前一个普通成员只能归属一个激活企业，企业目录本身支持多家。不能把“多企业”误表述为“当前每个人可以任意多企业任职”。本次不改这个约束。

app_bi_account_profiles.company/account_type是后台资料，不是租户主键或授权凭据。新适配层以真实企业UUID读取。

## 4. 部署策略

| 项 | shared 多企业平台 | dedicated 企业独立部署 |
|---|---|---|
| 代码/镜像 | 同一候选 | 同一候选 |
| 企业目录 | 当前授权范围内多家 | 服务端固定一家 |
| 企业切换器 | 可选 | 隐藏/禁用 |
| 普通用户 | 仍由现有普通用户系统管理 | 只迁入/创建批准的企业账号与必要管理员 |
| 数据库/媒体 | 平台环境自己的资源 | 独立企业资源，不恢复整个平台库 |
| 凭据 | 平台环境受保护配置 | 专属环境受保护配置 |
| 源记录 | 本地源服务或后续限定远端 | 本地源副本/受限远端，显式确认权威端 |

本轮实现的配置：NAUMI_ENTERPRISE_DEPLOYMENT_MODE=shared|dedicated；NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID=稳定实例标识；NAUMI_ENTERPRISE_ALLOWED_IDS=企业UUID列表，dedicated恰好一项。未知模式、缺实例ID、专属模式空/多ID均失败关闭。默认shared保持旧接口兼容，但新接入入口缺sourceInstanceId返回503配置未完成。

专属模式不仅过滤下拉框：新增适配API与原enterprise scope/list都核验固定企业，即使是平台管理员也不能从这些企业接口跨到另一企业。

**仍需上线门槛：** 原/admin平台全局用户/BI/媒体等接口不在本轮全部转换为专属授权模式。不得将含其他企业的完整平台库恢复到客户环境，再指望一个导航筛选完成隔离。正式私有交付必须做全路由权限矩阵和限定迁移；外企数据留在源平台。

## 5. 统一数据端口

EnterpriseDataPort提供list、members、records，前端不感知SQL表或不同部署数据库。当前实现NaumiEnterpriseAdapter（in-process），调用现有Naumi服务函数。

API：GET /api/admin/enterprise-workbench。action=list|members|records；records.kind=artworks|generations|ledger。读取只通过平台管理员验证；拒绝匿名、普通企业老板、普通用户。企业成员工作区仍走原enterpriseAuthorize，不复用平台管理员令牌。

新查询为白名单参数，拒绝baseUrl、token、permissions、可自报成员列表或动态数据库地址。部署范围来自服务端环境，UI无“切到另一数据库”功能。

## 6. 谁生成了什么、提示词与日志

统一记录包含：来源实例、企业ID、源记录种类/ID、账号sourceKey/email/name、创建时间、标题、原始/展示提示词、状态、操作与溯源、任务关联引用、积分证据、受保护媒体引用。

图片只从Naumi授权媒体端点读取，不传原始私有URL、上游URL签名、API Key或供应商错误体。缩略图重新走现有鉴权，浏览器不永久缓存一个能够绕过撤权的外链。提示词按文本显示，不当HTML执行；支持展开全文。

记录列表包括生图/画布/视频的源表命名空间，避免三类任务ID碰撞。普通生成任务字段没有完整执行Trace时，只展示现有记录，不能声称新增全量Token级执行日志。

本轮作品与生成记录继承原enterprise作品范围：企业老板看到其员工，组织主管看到本人及下级；老板自身的作品不自动加入原“员工作品”列表。账本继承原analytics范围，老板可包含本人。因此三标签总量可能不同，不能直接互相除算。平台总账/老板作品仍有原admin入口；后续统一源权限规范须明确是否扩展老板创作，并覆盖私有媒体权限，不能偷偷扩大。

## 7. 积分口径

预估quoted：任务cost，只供报价提示。

实际charged：存在明确同账号、同来源任务的consume流水证据时，返回该来源已扣费汇总；没有关联返回null，不返回假0；存在确实0积分流水可显示0。

流水delta：原Naumi实际积分变动，扣费和退款分行，保留方向。净消耗由同范围原analytics计算，不按作品张数×预估积分推算，不在作品连接账本时把金额重复放大。

一个任务可生成多图，一张图可能多次编辑，一条账本可能对应批次；不能强行按图平均摊账。没有明确批次/operation/ledger引用的历史记录保持待关联。当前新工作台不执行扣费、退款、发放、重试生成或更改原积分余额。

## 8. 历史归属与新业务关联

现有不少作品/任务/账本按email保存，没有不可变enterpriseIdAtCreation或工作流任务ID。当前组织授权可见不等于生成时企业所有权。新DTO强制标注current-membership-not-historical-ownership，业务归属unconfirmed，不因为名字、提示词关键词或接近的时间自动认领任务。

后续新增generation_context绑定：sourceInstanceId+sourceKind+sourceId、租户ID、工作流任务ID/版本、发起人源账号、记录时企业/组织版本、可验证的assetRevision、确认状态与原因。新生成从任务上下文显式传递并由服务端核验；历史记录人工认领或有证据批量关联，保留撤销审计。

绩效只接受已验收的工作流交付及唯一贡献事实；生成次数/Token/积分用于成本分析，不自动等于产值或绩效分数。相同图片被多个任务引用时，原生成消费仍只统计一次。

## 9. 身份和租户映射

统一平台账号不重新注册。源身份键=(sourceInstanceId,Naumi email)，后续连接钉钉unionId/userId等用外部身份映射。email可修改时要留别名和迁移审计，不能把展示名当不变身份。

localTenantId、Naumi enterpriseId、workflow teamId、钉钉部门ID分别表示不同概念。当前同源界面传Naumi enterpriseId；独立工作流库接入时必须通过审核映射表，不能把“Naumi根team.id”直接当每个排期小组的teamId。

建议后续表：enterprise_sources（实例/协议/状态/凭据引用/范围），enterprise_bindings（本地tenant↔源enterprise），identity_bindings（源账号↔本地人员），generation_links（源记录↔业务任务），sync_checkpoints/inbox。这里只是后续建模，不声称已创建这些表。

## 10. 远程适配与同步设计

源Naumi仍是用户/生成记录/积分权威。工作流系统不持远端数据库超级用户连接。远程适配需固定服务端URL白名单、TLS、企业绑定、专用最小权限服务身份或用户委托、短时令牌/权限版本、请求签名或mTLS、访问审计、超时和分页限额。

不把平台admin密码/token放进客户浏览器或复制到多个客户站点；不设置一个可以传任意enterpriseId查询全平台的共享服务密钥。接入授权的tenantId/enterpriseId必须双端相等；凭据进入受保护配置，日志只记凭据引用/修订。

实时查看优先分页查询；统计/检索投影按(sourceInstanceId,entityType,id,revision)幂等，增量水位用updatedAt+id或可靠事件序号，支持迟到退款、删除/停用墓碑、断点重试、权限变化清理。原作品本地缓存不改变源所有权；任务和账本不双向写。

当前没有远程凭据或真实源实例绑定，不自动探测/连接任何现有服务器。真实公司UUID在/admin目录选择并由配置审核固定，名称“天地合大健康”只用于显示与本轮合成测试，不写死在业务条件中。

## 11. 持续开发与客户部署不分叉

所有通用功能回同一main，短期任务分支用于开发和审阅后合回；禁止长期复制客户目录或在代码写if(company==='天地合')。

企业差异存配置/模板：表单、字段、路由、任务类型、排期布局、颜色、角色、审批和模块开关。某个企业功能尚未验收时通过能力/配置发布门禁关闭，不另留过时客户分支。开关不是授权凭据，每次API继续检查权限。

同一CI固定commit构建一个镜像；平台和客户环境选择同镜像或各自批准的已发布版本，部署配置/品牌/资源/权限独立。客户暂缓升级属于发布节奏差异，不是维护两套源码；数据库用扩展→回填→收缩兼容策略，保留旧前端资源。

按4核8GB先保留单Web+BFF/工作流服务+轻Worker+PG，当前只读适配不新增常驻同步服务。跨部署量大后再启投影Worker；升级依据真实RSS/DB连接/p95/任务队列，而不是逻辑模块数。

## 12. 分阶段交付

U1 已实现：同源只读适配、部署范围、/admin入口、作品/提示词/生成/流水列表、私有媒体读取、隔离测试。当前仍任务分支，本机合成验收，未发布。

U2 下一阶段：在既有完整企业Demo/正式页面整合需求排期+新数据端口，统一身份与workflow租户/团队映射；不要用本轮仅数据列表页替代完整排期页面。

U3：审核真实天地合企业UUID/账号、历史归属与generation_context绑定、试点对账；多图/批次/退款/停用/离职全面覆盖。

U4：独立企业资源准备、按需远程受限适配、数据迁移/增量水位、全路由隔离和负载测试，蓝绿发布与排空回退。

## 13. 本轮验收与剩余条件

隔离PG中两企业、个人账号、不同层级角色；实际扣费6/预估9/退款2，缺证据返回null，源表读取指纹不变。shared返回两家，dedicated恰好一家，外企404、匿名/非平台管理员401、错误部署配置503、坏日期400，关闭企业后成员读取拒绝。

旧作品/媒体授权与enterprise analytics集中回归验证未变宽；浏览器检查10项，真实React组件/Admin Shell+实际新API，合成账号与一次性PG，390px不横溢。

本机共享node_modules实际React18.3.1，而仓库声明19.3.0，根TypeScript存在4处旧组件ref类型错误，先用原commit副本验证相同错误；本轮不改无关画布/版本组件或全局安装。此环境不作为正式Next19构建通过证据。真实发布仍需隔离锁定依赖构建。

## 14. 交付与评审要点

详细接口见`naumi-unified-integration-contract.md`，实施/测试与边界见`naumi-unified-integration-implementation.md`，总图见`naumi-unified-integration-architecture.html`。

评审重点：/admin总入口和企业身份不可混淆；是否包括老板自身创作需显式确认；真实企业UUID/源实例ID不能猜；历史个人与企业归属不能自动推断；跨站是否实时读取或迁移决定权威端；专属数据不能混进平台其他租户；同代码不同配置不等于已完成生产隔离。
