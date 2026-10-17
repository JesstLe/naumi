# 团队排期配置契约 v1

## 原型存储

- 业务：既有 `naumi-enterprise-demo-v1`，任务扩展 `planStart/planEnd/estimatedHours/quantity/unit`，承诺沿用 `due`。
- 配置：`naumi-enterprise-scheduling-v1`；schema=1；revision；published；history；draft；fields；values；personal；audit。
- 视图config：columns=[{id,label,width,visible,tint}]；group=`none|assignee|owner`；density=`compact|normal|relaxed`；summary=boolean；layout=`table|split`。
- fields=[{id,label,type,options,archived}]；type=`text|number|date|select`；values[taskId][fieldId]；字段ID永不复用。
- personal[role]={config,filters}；filters={query,assignee,status}；团队发布不复制个人筛选。
- draft={baseRevision,config}；history=[{revision,config,at,actor,note}]；最近20条。

## 硬约束

核心title列必须显示，固定第一列；system状态只读。所有视图引用字段ID；归档时隐藏所有配置引用但不删值。发布读当前存储revision与draft.baseRevision比较，冲突保留编辑副本。字段结构操作不包含在布局草稿中，需明确提示。

业务编辑和配置发布分开写；失败保留内存旧状态、不显示成功。localStorage不具备跨设备事务或生产权限保证，P2以服务端事务/CAS替换。两存储键独立，模板恢复绝不触碰业务键。

## 状态与业务动作

open/assigned/claimed可由主管按现有流程指派；in_progress/blocked/review/rework换人需正式交接（P1不开放）；accepted锁排期。排期改动原因写tasks.logs和动态，不创建贡献事实。使用计划内周一至周五均摊估时，示例8h/人日，无计划不参与容量。

## P2迁移

把上述结构映射为独立字段定义、模板版本、草稿、个人视图、自定义值和排期表；所有行携带tenantId/teamId与version。发布与审计同事务；业务任务通过现有工作流命令更新，通知使用outbox。浏览器只缓存服务端已授权数据。
