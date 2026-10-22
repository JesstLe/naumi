# 多租户后台重构实施记录

任务基线：PRD `be4dbac67fba46868057c90c35e3a67b9cf9a46d`，业务 main `7b1e970c84006c2fb76f8c1748e96da128e12982`。实施 worktree 为 `saas-admin-20261022/naumi`，分支 `codex/saas-admin-20261022`。共享 checkout 未切分支或修改。

## 当前阶段

| 模块 | 状态 | 范围与证据 | 未完成 |
| --- | --- | --- | --- |
| M00 | 代码完成 | 两份 PRD、三张原图（1487×1058）、契约与证据语义；208px海军蓝侧栏；2租户/7用户/8创作的显式fixture | 最终设计QA由根任务完成 |
| M01 | 隔离验收通过 | 租户/权益/命令/CAS/席位/membership；`verify-saas-tenants.ts`真实隔离PG/API通过；新增负责人旧子账号排他、续期/转正式席位校验 | 生产只读及上线验收未执行 |
| M02 | 代码完成 | 平台总览真实指标/日期/折线面积趋势、租户六标签、资料权益/已有成员操作、三态功能开关；`6538ccf0` | 根任务复拍与表单真实浏览器验收收尾 |
| M03 | 隔离验收通过，视觉复核中 | 企业概览/成员/岗位/设置、经营范围、确认资产与私人历史分区；`4a32a66b`/`fd632cbc`；双session不提升企业身份 | 最终设计QA与完整浏览器矩阵 |
| M04 | 代码完成，隔离集中验收通过 | `de5d010b`；逐入口与故障恢复详见 `2026-10-22-saas-creation-writers.md`；实际本地PG、SDK fixture transport恰好一次、冻结video/canvas/batch恢复通过 | 尚未整合的其他业务分支新video-batch/Agent recovery入口须再次对照；没有真实供应商/线上Worker执行证据 |
| M05 | 代码完成，隔离集中验收通过 | 主从/移动详情、素材/事件/子任务真分页、107产物历史分页、精确账务null/0/不适用、source故障只读恢复、双scope私有媒体；`verify-saas-creations.ts` | 根任务最终同尺寸复拍；企业音视频签名播放补验进行中 |
| M06 | 代码完成，浏览器复核中 | 唯一主导航与模块导航、稳定旧BI来源跳转、旧设置分区兼容、钱包真实products映射、登录回跳/退出修复 | 钱包入口恢复后的复拍、旧路径完整回归；新增供应商额度模块独立实施 |
| M07 | 实施中 | 8组隔离集中回归全部通过；正式整仓类型预检通过；根任务浏览器/设计报告进行中 | 最终类型/生产构建、全部设计QA及合并其他业务后的复验 |
| M08 | 实施中 | 根任务已刷新/盘点321refs；origin/main仍 `7b1e970c`；保持独立预览18499 | 完成业务分支整合、固定镜像/回滚及47三锁蓝绿由根任务负责；未发布 |

## 协作与验证

租户/writer负责人 `tenant_core`，企业/平台表单负责人 `enterprise_ui`；独立 codex 分支/worktree，通过提交整合。主实施负责读契约/媒体/历史来源/公共详情。主实施整合 M01/M02/M03 后已刷新 origin/main，仍为 `7b1e970c`，没有需merge的更新，计数归零；M04/M05/M06代码收尾后集中复核，未把代码保存算作正式验收完成。根任务2026-10-23再次fetch确认main未变。

隔离 PostgreSQL 为本地专属 fixture cluster（127.0.0.1:55439），本任务使用单独 `saas_admin_fixture` 数据库。测试材料与本地环境在忽略 `output/saas-admin-20261022/` 和 `output/saas-preview-environment/`。真实供应商调用0，未读取/变更生产数据或服务器。

2026-10-23集中回归通过：`verify-saas-tenants.ts`、`verify-saas-enterprise.ts`、`verify-saas-creations.ts`、`verify-saas-creation-writers.ts`、`verify-billing-async-tasks.ts`、`verify-billing-tools.ts`、`verify-billing-agent.ts`、`verify-imagegen-execution.ts`。每个脚本使用单独新建本地fixture数据库，保留原预览库；日志位于 `output/saas-admin-20261022/verification/`。供应商SDK/HTTP使用脚本内明确fixture transport，不能当作真实模型输出验收。

根任务浏览器已通过：390px成员列固定/紧凑行，1024/390创作详情无全局横溢及返回，图片预览Tab锁焦/Escape还焦，状态筛选清除旧详情。三张核心页面真实截图及同尺寸比对位于 `output/saas-design-qa/`；`design-qa.md`由根任务独占维护，其最终状态优先于这里的阶段记录。

## 读取/媒体与财务收尾

- 递归父子、计费去重和子项分页均约束同actor及tenant；历史来源只用稳定sourceId，不按当前成员或时间猜归属。
- 原始要求完整展示、参数以公开白名单标签显示；技术信息仅平台展开。企业不透传parameters内部字段或供应商错误原文。
- quoted来自requestedCredits，当前reserved不冒称历史预占；历史预占/释放使用精确link事实，退款只取实际review字段；未记录为null，明确免扣为0且其他财务项不适用。
- source checkpoint标记副证据失败时，只读补取已保存作品与待核查状态；不修业务、不扣款、不重发供应商请求。
- 企业API始终使用真实用户身份，平台cookie不扩展列表/快照/命令；平台查看任意租户走独立admin入口。
- 图片object URL在切换/退出清理；音视频按需Range读取，企业Bearer用户通过短时、限定记录/素材的播放授权访问，逐Range重新验证有效企业身份。

## 兼容与发布

新增结构只扩展，不重写历史归属或账务；当前成员email聚合不作为企业资产，不产生企业钱包或所有者代扣。旧任务没有冻结归属时不推断当前企业。新增会员状态需要兼容回滚代码；尚未准备合格回滚镜像和发布验收材料，不能发布或称完成。
