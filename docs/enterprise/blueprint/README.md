# 企业电商协作平台详细建设方案

版本：v0.1评审稿｜日期：2026-10-16｜**状态：方案，不代表业务已经实现/上线。**

本方案含 **32份独立模块文档、13份共享规范、128项开发工作包**。每模块写清职责、页面、字段/来源、状态、联动、权限、接口事件、异常验收和开发工作包。

## 已确认输入

- 公司使用钉钉、聚水潭及待盘点其他系统；名称确认不代表接口权限已取得。
- 现有需求在钉钉填表；目标直接在本系统填，按表单业务字段决定承接归属，不再双填。
- 需求负责人/承接团队/执行人/验收人分开，匹配异常进入待分配队列。
- 当前4核8GB，允许需要时升级；32逻辑模块不等于32微服务，不为省资源牺牲完整业务。

## 推荐阅读

- [离线完整阅读版](portal.html)：单HTML内含所有正文，可搜索/切换；不需联网或服务器。
- [总体架构](shared/00-overall-architecture.md) → [表单归属样例](shared/11-routing-form-example.md) → [公司使用场景](shared/04-company-scenarios.md)。
- 开发按[实施计划](shared/06-delivery-roadmap.md)、[工作分解](shared/12-work-breakdown.md)、[API事件](shared/03-api-events.md)和[验收矩阵](shared/08-acceptance-matrix.md)推进。
- IT/数据人员先读[数据源](shared/01-data-sources.md)、[权限责任](shared/05-permissions-raci.md)和[资源升级](shared/07-capacity-upgrade.md)。

## 32份模块目录

| 模块 | 内容 | 直接依赖 | 数据来源 |
| --- | --- | --- | --- |
| M01 | [多公司、事业部、部门与任职](modules/M01-organization.md) | 无 | D01、D02 |
| M02 | [钉钉登录、业务权限与数据隔离](modules/M02-identity-permissions.md) | M01 | D01、D02 |
| M03 | [品牌、店铺、商品与SKU主数据](modules/M03-commerce-master.md) | M01、M02 | D03、D04、D05 |
| M04 | [项目、活动与跨店需求组合](modules/M04-project-campaign.md) | M03、M06 | D03、D06、D07 |
| M05 | [需求表单、字段模板与版本](modules/M05-demand-forms.md) | M02、M03 | D05、D06、D07 |
| M06 | [需求填报、受理与历史钉钉表迁移](modules/M06-demand-intake.md) | M03、M05、M13 | D06、D07 |
| M07 | [按表归属、审批、优先级与受理SLA](modules/M07-routing-approval.md) | M01、M02、M05、M06 | D01、D03、D06、D07 |
| M08 | [任务拆解、交付规格、依赖与标准工作量](modules/M08-task-breakdown.md) | M05、M07 | D07、D08 |
| M09 | [工作日历、产能排期与跨组支援](modules/M09-capacity-calendar.md) | M01、M08 | D01、D07、D08 |
| M10 | [指派、任务池、认领与责任确认](modules/M10-assignment-claim.md) | M02、M07、M08、M09 | D01、D07、D08 |
| M11 | [执行进度、阻塞、工时与交付准备](modules/M11-execution-progress.md) | M10、M13 | D08、D09 |
| M12 | [需求变更、延期、转派与离职交接](modules/M12-change-handover.md) | M01、M09、M10、M11 | D01、D07、D08 |
| M13 | [素材、源文件、版本、权限与复用](modules/M13-assets-dam.md) | M02、M03 | D04、D09、D10 |
| M14 | [品牌规范、商品卖点与内容合规](modules/M14-brand-compliance.md) | M03、M13 | D04、D05、D10 |
| M15 | [任务创作工作区、Naumi画布与AI执行关联](modules/M15-creative-workspace.md) | M10、M13、M14 | D08、D09、D10、D11 |
| M16 | [在线评审、逐项批注与返工责任](modules/M16-review-rework.md) | M11、M13、M14 | D08、D09、D10 |
| M17 | [最终验收、交付包、签收与结项](modules/M17-acceptance-delivery.md) | M13、M16 | D07、D08、D09 |
| M18 | [交付上架、渠道发布、回执与召回](modules/M18-channel-publishing.md) | M03、M14、M17、M26 | D03、D05、D09、D12 |
| M19 | [站内待办、钉钉通知、提醒与升级](modules/M19-notifications-sla.md) | M02、M07、M10、M26 | D01、D07、D08 |
| M20 | [SOP、任务模板、知识库与受控AI助手](modules/M20-sop-knowledge.md) | M05、M13、M14 | D05、D08、D10 |
| M21 | [标准工作量、多人贡献、返工与责任事实](modules/M21-workload-contribution.md) | M08、M12、M17 | D08、D09 |
| M22 | [绩效指标、规则版本与可解释计算](modules/M22-performance-rules.md) | M21、M31 | D08、D13 |
| M23 | [绩效周期、员工查证、复核、申诉与归档](modules/M23-performance-cycles.md) | M21、M22 | D01、D08、D13 |
| M24 | [经营协作看板、指标口径与数据质量](modules/M24-management-bi.md) | M06、M10、M17 | D07、D08、D09、D10、D11、D12、D13、D14 |
| M25 | [创作积分、费用、预算与效率核算](modules/M25-cost-budget.md) | M15、M17、M24 | D08、D11、D14 |
| M26 | [钉钉、聚水潭及其他系统连接器与数据导入](modules/M26-connectors-data.md) | M01、M02 | D01、D02、D03、D04、D05、D06、D12、D13、D14 |
| M27 | [上架效果、实验、经营复盘与归因边界](modules/M27-outcomes-attribution.md) | M03、M18、M24、M26 | D03、D05、D12、D14 |
| M28 | [外包、供应商协作、交付权利与验收结算](modules/M28-outsourcing.md) | M02、M13、M17、M25 | D08、D09、D10、D14 |
| M29 | [审计、数据分级、留存、导出与删除](modules/M29-audit-privacy.md) | M02 | D01、D02、D03、D04、D05、D06、D07、D08、D09、D10、D11、D12、D13、D14 |
| M30 | [员工工作台、角色体验、培训与内部推广](modules/M30-workbench-adoption.md) | M02、M06、M10、M19 | D01、D07、D08 |
| M31 | [流程配置、归属规则发布与版本治理](modules/M31-process-config.md) | M02 | D05、D07、D13 |
| M32 | [部署运维、资源容量、蓝绿发布与升级路线](modules/M32-operations-capacity.md) | M02、M29 | D15 |

## 共享规范

- [总体方案：电商公司的需求—生产—交付—绩效闭环](shared/00-overall-architecture.md)
- [数据获取、钉钉/聚水潭接入与主数据权威清单](shared/01-data-sources.md)
- [领域数据模型、主键、关系与事务边界](shared/02-domain-data-model.md)
- [跨模块API、事件、幂等与副作用契约](shared/03-api-events.md)
- [大电商公司内部使用手册与端到端联动场景](shared/04-company-scenarios.md)
- [权限矩阵、组织范围与实施责任](shared/05-permissions-raci.md)
- [分阶段实施计划、工作包、依赖与验收门槛](shared/06-delivery-roadmap.md)
- [4核8GB起步、容量验证、增配与拆机路线](shared/07-capacity-upgrade.md)
- [集中验收矩阵、业务样本与证据要求](shared/08-acceptance-matrix.md)
- [现有代码证据、差距与开发衔接](shared/09-code-gaps.md)
- [决策登记、假设与待确认清单](shared/10-decisions-questions.md)
- [可评审样例：系统需求表、按表归属与任务计划](shared/11-routing-form-example.md)
- [开发工作分解：32模块、128项实施工作包](shared/12-work-breakdown.md)

## 实施顺序

P0样本/权限/归属/资源确认 → P1系统表单、归属、拆单、认领、执行、评审/验收、签收和证据 → P2自动接入/规模化/绩效影子核算 → P3受控发布、经营效果、外包和公司推广。

当前仅已有独立工作流基础和现有Naumi能力；新业务页面/生产适配/完整绩效均待开发。未确认的制度、容量和SLO是建议，详见[决策登记](shared/10-decisions-questions.md)。

## 文档维护与校验

```sh
node docs/enterprise/blueprint/tools/build.mjs
node docs/enterprise/blueprint/tools/verify.mjs
```

从仓库根目录执行，生成目录/manifest/离线阅读版并校验文档结构、链接、依赖、数据源和工作包；不调用生产/外部接口。模块正文为人工细化设计，构建工具只负责汇编，不用通用模板替代业务内容。
