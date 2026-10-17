# 团队排期配置契约 v1

> V2增量已引入独立视图，以下v1格式保留为兼容迁移输入。当前原型实现以下V2契约；详细需求见 `team-scheduling-v2-prd.md`。

## 当前V2契约

- 新键`naumi-enterprise-workbook-v2`，schema=2，revision为本地全局配置快照版本；旧键只读迁移、保持原字节。
- table={id:production_tasks,name}，views=[{id,name,archived,store}]；store保存每视图revision/published/history/draft/personal，不复制任务/字段值。
- fields、values、options为表级共享；options=[{id,label,color}]，稳定ID，使用中选项不得删除。
- config在v1基础上增加renderer(table/board)、groupAnchor(parent/task)、filters、board{groupField:scheduleTag,cardFields,showEmpty}、rules。
- task.scheduleTag为独立排期标签；task.owner可与req.owner不同。改变标签需原因，不写status/due/facts；父锚定展示不修改子字段。
- 预演契约schema=`enterprise-import-preview-v1`；sourceHash/workbookHash/sheet/headers/rows[{excelRow,title,parentLabel,raw,rawCells,parentCandidates}]/issues[{excelRow,code,message}]/summary。只读工具输出，UI内存查看不写业务键。
- 本地全局旧快照检查和每视图版本都不是正式多用户原子事务。正式接口及租户/行/字段权限仍按P2实施。

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
