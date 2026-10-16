# 领域数据模型、主键、关系与事务边界

## 1. 通用约定

- 内部业务主键UUID，企业ID必须随每条租户数据保存；对外业务号仅供沟通，不作为唯一授权依据。
- 人员新模型使用稳定userId；现有email键保留兼容映射，不能一次改主键破坏旧数据。
- 时间存UTC timestamptz，展示Asia/Shanghai；周期用[start,end)；scheduled/observed/occurred/ingested时间分别定义。
- 金额使用整数最小货币单位或decimal；credit、工作量point和货币金额分列，不混算。贡献比例使用0—10000基点。
- 可变聚合有version；发布规则/交付/周期为不可变revision；删除用tombstone并检查引用。

## 2. 核心实体与最小逻辑结构（规划，不是已建表）

| 领域/实体 | 关键字段 | 关系/约束/数据所有者 |
| --- | --- | --- |
| organization / department | id、enterpriseId、parentId、status、revision | 无环；S01拥有，本地映射钉钉 |
| identity_mapping / membership | userId、sourceTenant、externalUserId、validFrom/To、primaryFlag | 来源组合键唯一；多任职区间/主归属校验 |
| business_team / service_scope | teamId、ownerId、brand/shop/type范围 | 承接团队≠部门≠成本中心 |
| role_binding / policy_revision | userId、permission、scope、effectiveAt、revision | M02计算授权，不能前端声明 |
| brand / shop / product / sku | UUID、externalMapping、sourceRevision、manualOverrides、status | S02拥有；shop↔平台外部ID显式映射 |
| project / milestone | ownerId、brand/shopRefs、baselineVersion、targetAt | 一项目多需求；不扩大需求权限 |
| form_template / form_revision | schema、validation、publishedBy、checksum | 发布后不可改；草稿实例带templateVersion |
| requirement | owner/requester、formSnapshot、productRefs、desiredDue、status、version | 一需求多任务；新建来源键唯一 |
| route_decision | inputDigest、ruleVersion、matchedRuleIds、teamId、reviewRole | 一次提交一个有效决策；冲突/无匹配显式 |
| task / task_dependency | requirementId、type、specs、pointsBaseline、dueBaseline、status | 同工单DAG；P1一任务一执行人 |
| assignment / responsibility_segment | taskId、from/to、confirmedAt、supportAgreementId | 责任区间不重叠、当前执行人唯一 |
| capacity_reservation / calendar | userId、intervals、units、calendarVersion、expiresAt | 原子容量预占/释放；不复制休假敏感原因 |
| block_interval / worklog | taskId、start/end、reasonClass、attributionStatus | 阻塞与工时分别记录；更正追加 |
| change_request / change_approval | baselineVersion、patch、impact、deltaPoints、decisions | 批准后复核原版本再应用 |
| asset / asset_revision / rights | objectKey、hash、status、sourceRefs、validUntil | S04拥有；revision内容不覆盖；租户去重 |
| creative_link | taskId、workspaceId、executionJobId、billingOperationId | 只引用外域；恢复不重提付费任务 |
| review_round / review_comment | revisionIds、reviewers、anchor、issueClass、decision | 批注绑定固定版本；责任已复核再考核 |
| acceptance / delivery_package | taskVersion、acceptedBy、manifest、quality、time事实 | 一次验收事实；纠错有冲销/替代引用 |
| publication | shop/object/slot、revisionIds、externalRequestId、status | 一资产可多发布实例，外部unknown需核查 |
| benchmark / contribution_fact | taskType、frozenPoints、contributor、share、sourceEventId | 来源事件唯一；共享贡献总量守恒 |
| performance_rule / calculation | ruleVersion、engineVersion、inputFactRefs、explanation | 可确定重演；不自动产生最终人事决策 |
| performance_cycle / appeal | period、participantSnapshot、cutoff、reviewChain、lock | 锁定不可就地覆盖；更正新版本 |
| cost_fact / allocation | billingRef、unit/currency、settled/refunded、allocationRule | 账本外部权威；分摊总和=来源金额 |
| outcome_snapshot | publicationId、grain、window、metrics、completeness | 无精确映射则unknown，不猜个人因果 |
| connector / import_batch / external_mapping | scopes、mappingRevision、watermark、rowDigest | 外部ID/批次幂等；缺权限不删资料 |
| audit_event / export_job | actor、action、target、authRevision、reason、retention | 不含秘密；敏感导出可追踪 |

## 3. 基数与导航

```text
企业 1—N 事业部/品牌/店铺/承接团队
用户 N—N 任职/业务团队（受有效区间约束）
活动 1—N 需求 1—N 任务 1—N 责任区间/评审轮次
任务 N—N 资产revision（输入/候选/交付角色明确）
一次验收 1—N 交付revision；一次验收 1—N 贡献事实（P1为1）
一个交付revision 1—N 渠道发布实例 1—N 指标快照
一个绩效周期 1—N 个人核算；核算引用N个冻结事实与1版规则
```

跨域关系为带tenant的ID引用，不做跨库外键/在线SQL联合查询。BFF或读模型组合；域内外键/唯一约束仍应建立。

## 4. 需求/任务状态与当前v1兼容

现有v1 WorkOrder：draft/submitted/approved/active/completed/cancelled/archived。
现有Task：open/assigned/claimed/in_progress/blocked/review/rework/accepted。
M07的“待分配”、M16的“评审轮次”、M17的“签收”是独立子流程状态，不能随意塞进v1枚举而没有迁移。

v1持久化是一个工单JSON聚合+commands+events，适合当前基础验证。正式v2可先扩展JSON schema并建立查询投影，随着单据规模再渐进规范化；不要同时维护两份可写任务真相。
v1每单最多50任务/每交付最多30资产，表单文本2000字符等是当前代码限制，不是公司制度；真实样本超限须扩契约/分批设计，而不是截断数据。

## 5. 事务、一致性与并发

工作流命令：认证/当前授权 → 命令幂等锁 → 工单锁 → expectedVersion → 前置/权限/资产可用版本核查 → 写聚合+审计/outbox+去重结果 → commit。

当前基础锁顺序是租户command锁再租户order锁；跨命令不持有多个工单锁，后续跨单操作需明确全序或Saga。
外部资产/组织跨域无法靠单DB锁保证，生产适配应使用短期版本凭据/批准快照并在高影响动作复核；中途资产被隔离时后续发布拒绝并通知影响方。

贡献消费：inbox唯一eventId → 验证事件schema/aggregateVersion → 写事实/投影 → 保存消费水位；同事务完成。读模型是可重建缓存，不写回业务状态。

## 6. 删除、修订和归属

主数据失效不删历史快照；用户离职不删贡献；文件被交付/发布引用则禁止直接清理；个人敏感数据按保留政策可匿名化展示且保留必要审计映射受限存储。
已锁绩效、已接受事实与发布回执不能直接UPDATE成另一结果；更正有originalFactId、adjustmentReason、approvedBy和newRevision。

跨部门支援的组织归属、绩效归属和成本归属分别保存当时快照，防止改一个departmentId重写全部历史。

## 7. 查询与索引计划

P1任务池以enterprise/team/status/kind/dueAt/id组合索引+游标；我的任务以enterprise/assignee/status；需求以enterprise/owner/status/createdAt；事件以enterprise/order/version。
报表建日级和周期投影，查询按scope限制时间窗口，导出异步；公司规模数据增长后按实测分区，不预先建立几十个空数据库。

## 8. 最小质量约束

- 每个accepted任务有当前执行人、已就绪资产、验收人和可回溯规格。
- 每条绩效事实有来源验收/调整证据，不允许手填孤立总分。
- 每个外部发布实例可追到批准资产版本；每项经营指标有来源/粒度/窗口/水位。
- 每条导入有来源ID与批次，发生冲突/缺字段时隔离，不创建半真半假的业务资料。
