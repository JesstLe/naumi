# 统一Naumi企业接入 U1 实施与验收

2026-10-17｜分支codex/enterprise-workflow-foundation-20261016｜接入前基线178898aeaa5db7ed9e0f031993312894ed13dd84。

## 用户确认与产品边界

新增需求：聚合天地合大健康在Naumi的用户、生成图片、提示词、积分消耗等记录；已有/enterprise能力统一整合；项目持续开发与客户私有部署不维护分叉；总入口固定/admin。

本轮增加/admin导航和真实只读数据页面，不改原完整企业Demo的设计基础。当前数据页只有作品/提示词/生成任务/账本，不将其冒充完整需求/排期/绩效最终页面。企业员工仍用原企业权限；新/admin页为平台管理员入口。

## 实现

- src/lib/enterprise/integration：领域端口、部署策略、显式白名单DTO、同源Naumi适配器。
- 新/admin/enterprise-workbench页与/api/admin/enterprise-workbench只读接口；沿用requireAdminPage、requireAdmin、AdminCenterShell和authHeader。
- 新工作台含企业/成员/日期筛选、作品受保护缩略图、提示词全文、生成任务预估/实际积分、账本扣费/退款和来源ID。
- 复用enterpriseList/Snapshot/Read、原artworks查询/展示、enterpriseAnalytics账本分类、enterprise/media与readBrowserImage。
- bi/repository增加源表命名空间与扣费证据，增加窄化queryEnterpriseOperations；不放宽原queryBi scoped-artworks-only门禁。
- dedicated配置恰好绑定一家企业，scope/list和新API同时执行；旧shared未配置保持兼容。缺稳定源实例标识时新入口503，不猜线上源。
- 当前原始生成prompt/charged数据可读，但未新增全量逐Token追踪、跨系统事件同步、历史业务归属或工作流任务关联。

## 发现与决策

1. app_users是email主键，app_enterprise_members有UNIQUE(email)。多企业目录存在，但并非所有成员已经支持多企业任职。先保留源约束，身份键加入sourceInstanceId，后续规范映射。
2. 历史作品/任务/账本多数没有企业生成上下文。所有新DTO标注业务归属unconfirmed，不能直接据此核算企业绩效。
3. 原operationSource将缺扣费流水COALESCE为0。本次加has_ledger_charge，适配器返回null与有证据0分别表示，不用预估冒充实际。
4. 原queryBi scoped路径只允许artworks，第一次直接调用operations得到`Scoped BI supports artworks only`。保留原门禁，另加固定范围和输出字段的queryEnterpriseOperations，避免为了接数据放宽全平台BI。
5. 原作品员工范围与原analytics账本老板范围不同。保持两边语义，契约显式记录，不直接混算张均成本。
6. shared/dedicated只是适配范围和企业端点门禁，不是全路由生产隔离的替代。私有站仍须限定迁移、独立DB/媒体、全接口核验，不能导入全平台库。

## 集中验收

隔离PostgreSQL由verify-enterprise-integration.mjs创建，随机名称/回环端口、无生产卷，结束只移除本次容器。测试进程server-only标记使用测试专用preload，不修改生产代码的server-only保护。

```text
NAUMI_INTEGRATION_PASS: shared_enterprises=2 dedicated_enterprises=1 ordinary_denied=1 cross_enterprise_denied=1 hierarchy_scope=1 prompts=1 linked_charge=6 missing_charge=null refund_delta=2 source_writes=0 raw_secrets=0 admin_entry=1 deployment_not_configured=503
INTEGRATION_BROWSER_PASS: checks=10 admin_shell=1 actual_react_components=1 actual_api_route=1 synthetic_data=1 page_errors=0 mobile=390
```

原作品/媒体回归：ADMIN_ROWS_EXACT、跨企业403、记录ID替换404、缩略480/原预览1024、CSV公式转义、授权关闭/成员改上级后列表/缓存/媒体拒绝均保持。

原analytics回归：CONSUMED=210、REFUNDED=15、NET=195、北京日期边界、跨成员/跨团队403、原授权撤销、异步计费去重、账本39行分页、钱包980/预占25和源DB指纹不变均通过。测试采用不同一次性数据库，无真实供应商调用。

浏览器使用生产React组件和Admin Shell、实际新API、实际权限解析和私有媒体路由，账号/作品/积分为合成数据。测试框架只替换Next导航、authHeader和媒体客户端缓存封装，服务端仍核验合成管理员会话与资源范围；不把fixture当真实登录或完整Next构建。

本机根node_modules实际React/DOM18.3.1，源码锁定19.3.0。根tsc出现canvas-action-menu、video/settings-dialog、site-version共4个既有ref错误；从178898ae原commit完整副本复查相同诊断，新增代码没有新诊断。不改他人组件或共享依赖，不宣称全仓类型/正式Next构建通过。后续固定Linux依赖构建须独立验收。

## 文档与部署状态

PRD14节、领域/查询契约、架构HTML与实际截图；源码/差异/验证/回滚材料保存在E:/Workspace/naumi/output/enterprise-naumi-integration-20261017。

真实天地合Naumi企业UUID、源实例标识和线上连接尚未绑定。测试中的公司名称为合成显示数据，无硬编码公司判断。未访问/发布服务器，未迁移真实用户/作品/账本，未创建第二企业版本或远程管理员连接密钥。

正式总入口/admin及现有管理功能保留，原完整Demo18482继续可用；本轮隔离React/API预览18490用于接入数据页验收，不是替代原排期设计。

## 接续

在同一主干整合工作流身份/租户映射与完整企业UI；再审核真实企业目录/源实例/权限，增加generation_context显式任务关联和历史对账。随后完成独立企业数据裁剪、全路由隔离、远程适配（如需要）、容量与蓝绿发布。细节见本轮PRD U2–U4，不把未实现项记为完成。
