# 现有代码证据、差距与开发衔接

## 1. 本轮核验版本
工作树 `E:/Workspace/naumi-enterprise-workflow-20261016`，方案开工HEAD `087838814f2dcbf49200cab64ea1152a30c7cd9e`，其父基线`c2634fba41fd50a117f9af93e63d865e446f7394`。
本轮从origin/main刷新成功时仍为c2634fba；它是Git证据，不是服务器当前运行版本。共享主工作树有其他UI改动，本任务不处理。

## 2. 源码—模块映射

| 已检查路径 | 当前事实 | 对应方案与必须补齐 |
| --- | --- | --- |
| `src/app/enterprise/page.tsx` | 渲染EnterpriseConsole | M30新增员工业务工作台，不覆盖当前管理体验 |
| `src/components/enterprise/enterprise-console.tsx` | overview/members/roles/records；作品/创作任务内容 | M06/M10/M11业务需求/任务不是已有records |
| `src/lib/enterprise/server.ts` | 企业开关/岗位/成员/上级、scope及audit；email键唯一 | M01多任职/稳定ID/M02业务角色和任务级范围新增 |
| `src/lib/enterprise/access.ts` | 登录/功能授权/限流；管理类入口 | 普通员工工作入口不能仅调用管理者scope |
| `src/lib/enterprise/analytics.ts`、`analytics-contracts.ts` | 创作积分/作品/作业、退款、未知统计 | M24业务工单投影/M25成本关联，不混为同指标 |
| `src/lib/artwork-provenance.ts` | 作品来源/派生/入口标签，历史有待核验 | M13/M15补资产revision和业务任务绑定，不能推断所有旧作品归属 |
| `src/lib/object-storage/adapter.ts` | local/R2/S3统一媒体能力 | M13仍需源文件版本/扫描/公司scope与引用保留 |
| `services/enterprise-workflow/src/contracts.ts` | strict actions、WorkOrder/Task、design/artwork、角色集合 | M05/M07表单路由与团队字段、技能、工作日志等要显式扩展 |
| `.../src/domain.ts` | 需求审批/计划/发布、指派/认领、执行/返工/验收、点数冻结/DAG | M12正式变更/责任区间、M16批注/归因、M17交付签收待增 |
| `.../src/store.ts` | PG事务、command/order锁、指纹幂等、可注入身份/资产、事件 | 生产resolver与任务级查询、outbox投递/inbox/消费水位待做 |
| `.../src/server.ts` | HTTP工厂，四个路径，必填authenticate | 无生产bootstrap/BFF/钉钉适配/部门scope、无列表页面 |
| `.../migrations/001-workflow.sql` | orders(JSON聚合)/commands/events/schema_version | 仅独立服务初始schema；不是完整32模块数据库 |
| `.../tests/*.test.ts` | 8项基础集中测试，含真实隔离PG/HTTP/并发/回滚 | 不代表公司SSO/聚水潭/真实多人页面已验收 |

省略号均指 `services/enterprise-workflow`。

## 3. 正式P1开发第一批建议改动

1. 增加稳定userId映射与业务Team/Scope接口，不直接重建现有账号。
2. 扩展版本化表单/归属决策/冻结规格契约；v1新旧动作同时可读，不能向strict schema塞任意JSON。
3. 建任务池/我的任务/主管队列投影，服务端先scope后分页/字段裁剪，防基础canRead返回整单泄露。
4. 注入真实组织/入口grant/账号有效性及资产可用版本检查；远程依赖有超时和保守失败策略。
5. 增加BFF、员工工作台和表单/任务页面；保持原管理页、原画布/创作API及内容权限。
6. events保留为事实日志；新增独立delivery租约表和consumer inbox，而不是给events加一个“全局已消费”位。
7. 新增schema增量迁移、查询索引、变更/交接证据；保留原动作/数据向后兼容和程序回退路径。

## 4. 本轮不做的事情
本轮为32模块详细方案，不修改运行代码、不连接服务器、不导出公司真实数据、不配置秘密、不发钉钉消息/付费作业/上架，不进行生产发布或数据库迁移。

详细方案完成后，按P0核对旧表、归属和授权样本，再实施P1-A；不根据文档目录直接批量生成32个空菜单/服务。
