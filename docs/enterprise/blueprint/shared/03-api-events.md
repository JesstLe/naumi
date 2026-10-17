# 跨模块API、事件、幂等与副作用契约

## 1. 状态和路径约定

本文件除“当前v1”外均为拟定契约，不代表现有端点可用。浏览器访问BFF `/api/enterprise/v2/*`；内部域API使用版本化路径，不能让浏览器直接拼企业ID访问内部服务。

当前v1真实实现：`POST /v1/commands`、`GET /v1/orders/:id`、`GET /healthz`、`GET /readyz`，其server工厂必须注入认证/当前成员/资产适配；尚无生产启动器。API字段以代码strict schema为准。

## 2. 统一请求与响应

```json
{
  "commandId": "11111111-1111-4111-8111-111111111111",
  "orderId": "22222222-2222-4222-8222-222222222222",
  "expectedVersion": 7,
  "action": {
    "type": "claim",
    "taskId": "33333333-3333-4333-8333-333333333333"
  }
}
```

身份不在业务JSON内，BFF从登录会话映射subject/enterprise/scope，内部验证短时签名+当前授权。未来表单/变更字段不得直接加进v1 strict action，须扩版本或新增受控命令。

当前成功响应 `{order,replayed}`；错误 `{error:{code}}`。拟定v2统一增加traceId/details/retryable，但不能把未实现字段当当前行为。

400字段无效、401无身份、403无权、404不可见或不存在、409版本/幂等冲突、413体积超限、415内容类型、429限流、503依赖不可用。429/503可有限退避；409必须刷新并重新确认，不静默覆盖。

## 3. 命令/查询分组

| 域 | 主要命令/查询（拟定） | 同步结果与后续联动 |
| --- | --- | --- |
| 身份 | me/capabilities、memberships:change | 当前可用权限/版本；任职事件触发交接 |
| 主数据 | catalog/imports:preview/apply、products?cursor | 逐行回执；冻结需求不被刷新覆盖 |
| 表单 | forms版本读取、requirements:validate | 具体字段错误/归属预览，不创建任务 |
| 提单/归属 | requirements:create/submit、routing:simulate、resolve-route/approve | 持久业务号/决策；事件通知受理 |
| 计划/认领 | task-plan:validate/publish、pool查询、assign/claim | 原子责任人/版本；容量/通知异步 |
| 执行/变更 | progress/block/resume、change-request:approve/apply | 冻结/新基线及影响范围 |
| 资产 | uploads:create/complete、revision/download | uploadId/就绪/签名；扫描异步 |
| 评审/验收 | review:decide、accept-delivery、package:acknowledge | 固定证据；绩效事实异步 |
| 分发 | publication:preview/approve/query-status/recall | externalRequest关联；unknown核查 |
| 绩效 | rules:simulate/publish、cycle:freeze/lock、appeal | 版本草稿/批准记录；不自动发薪 |
| 集成 | connector:probe、imports:preview/apply、sync:pause/resume | 权限证据/水位/逐批结果 |
| 导出 | report-exports、audit-exports | 202 jobId；下载再次鉴权 |

查询统一带cursor/limit（建议默认20、上限100，待压测确认）、timeRange、允许的筛选条件；tenant/scope来自服务端。复杂报表/压缩包返回异步job，不在单请求长时间阻塞。

## 4. 当前v1事件信封与未来扩展

```json
{
  "id": "SHA256_OF_ENTERPRISE_AND_COMMAND_ID",
  "schemaVersion": 1,
  "enterpriseId": "44444444-4444-4444-8444-444444444444",
  "orderId": "22222222-2222-4222-8222-222222222222",
  "aggregateVersion": 8,
  "actor": "SERVER_RESOLVED_SUBJECT",
  "type": "workflow.task.accepted.v1",
  "occurredAt": "2026-10-16T08:00:00.000Z",
  "data": { "taskId": "33333333-3333-4333-8333-333333333333" }
}
```

此处data仅展示结构，实际v1验收还包含action、contributor、contributionBps、points、quality、dueAt、submittedAt、acceptedAt、reworkCount、assetIds、measurementVersion。v1事件ID是sha256十六进制字符串，不是UUID。
未来跨域信封新增eventId别名/aggregateType/traceId/causationId/producerRevision，通过适配或v2显式迁移，不让旧消费者猜字段。

## 5. 关键事件目录

| 事件 | 生产者→消费者 | 最小业务含义/防重要求 |
| --- | --- | --- |
| org.membership.changed.v1 | M01→M02/M09/M12/M21 | 当前任职变化；按membershipRevision防回退 |
| auth.policy.changed.v1 | M02→各域/M19 | 撤权/范围变化；写命令仍实时检查 |
| catalog.product.changed.v1 | M03→M05/M06/M14 | 新主数据修订；不重写旧工单 |
| config.revision.published.v1 | M31→所属域 | 发布不可变配置；checksum校验 |
| workflow.submit-requirement.v1 | M06→M07/M19/M24 | 已提交，不是已批准 |
| workflow.route.resolved.v1 | M07→M08/M19 | 归属决策及冻结规则 |
| workflow.approve-requirement.v1 | M07→M08/M24 | 批准可拆单，不等于任务已发布 |
| workflow.publish.v1 | M08→M09/M10/M19 | 任务计划开始生效 |
| workflow.claim.v1 | M10→M09/M11/M21/M19 | 原子责任确认，不能重复加WIP |
| workflow.progress.v1 / workflow.block.v1 / workflow.resume.v1 | M11→M09/M19/M24 | 执行事实，不直接计分 |
| workflow.change.approved.v1 / workflow.handover.completed.v1 | M12→M09/M17/M21 | 新基线/交接责任，保留旧版本 |
| asset.revision.ready.v1 / asset.revision.quarantined.v1 | M13→M11/M16/M18 | 素材可用或风险状态 |
| review.round.closed.v1 | M16→M11/M17/M22 | 轮次决定及归因，评论不等于返工次数 |
| workflow.task.accepted.v1 | M17→M09/M21/M24 | 验收测量事实；来源eventId唯一 |
| delivery.receipt.confirmed.v1 | M17→M06/M24 | 业务签收，不是外部发布 |
| publication.state.changed.v1 | M18→M27/M24/M19 | 发布回执来源及unknown |
| performance.fact.recorded.v1 | M21→M22/M23/M24 | 贡献证据准备好，不是最终评分 |
| performance.calculation.completed.v1 | M22→M23 | 草稿核算完成，待复核 |
| performance.cycle.locked.v1 | M23→授权看板 | 最终周期版本与批准链 |
| billing.operation.settled.v1 / billing.operation.refunded.v1 | 原计费适配→M25 | 账本事实，不允许消费者再次扣费 |
| integration.batch.applied.v1 / integration.sync.failed.v1 | M26→所属域/M19/M24 | 导入批次/失败，不绕域写表 |

基础v1对每种action使用 `workflow.{action}.v1`，只有accept-delivery特判task.accepted。上表中的新领域事件尚需实现，现有events表没有运行中的投递器。

## 6. Outbox / inbox与顺序

领域写入与outbox同事务。投递worker使用独立delivery表保存eventId、consumerId、leaseOwner/Until、attempt、nextAttemptAt、lastError、state；claim用行锁/SKIP LOCKED，不能多个消费者重复持同租约。
消费方在一个本地事务写inbox去重+领域投影+水位。按aggregateVersion检测缺口，缺口先补读/挂起，不能盲用最后到达事件覆盖状态。
采用至少一次投递；死信、重试、补投和重建都有范围/水位/审计。重放事实投影与重新发消息/付费/上架严格分开，默认只重建读模型。

## 7. 副作用可靠性

内部命令幂等键为tenant+commandId，指纹含主体和规范化载荷；同ID不同内容409。重放前仍检查当前可见性，不能绕撤权读取旧快照。
付费生成和外部发布必须保存原接受ID/请求指纹。超时后UNKNOWN：查询原状态/人工核实，禁止自动创建新付费任务或重复发布。
Webhook返回接受不代表领域应用成功；接收后持久入inbox才确认，后续失败有待处理告警。

## 8. 契约验收

每个生产者提供schema、样例、兼容版本和去重语义；消费者有重复、乱序、缺口、过期授权、字段增加/枚举未知测试。发布前做受影响模块集中验证，不为每条字段修改跑全仓重型测试。
