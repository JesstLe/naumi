# 创作证据读取、历史兼容与界面收尾

日期：2026-10-23。主实施 `codex/saas-admin-20261022`；M04 writer固定整合 `de5d010b`。本记录属于M05/M06和集中验收，供应商真实调用0；不是线上验收或发布回执。

## 已完成

- `creations.ts` 以同actor/tenant递归family读取根/子记录；operation去重并统一列表/详情口径。素材、事件、子任务独立24条分页，不使用固定100条冒充总数。
- `legacy-creations.ts` 以闭合表枚举和稳定source ID适配旧图片/画布/视频/作品；107输出产物的真实总数、末页与跨页素材读取已测试。企业归属未确认，不按当前任职或时间归到租户。
- `creation-source-evidence.ts` 对明确pending的source checkpoint只读恢复已保存的作品引用；仍显示资料待核查，不把部分恢复称完整，不写业务/财务，不重发收费任务。
- 企业API白名单公开参数和安全事件摘要；内部模型/供应商/采购/原始异常不通过响应泄漏。平台保留技术折叠及旧BI稳定来源跳转。
- 费用取精确quote/operation/link/review事实：缺失null、明确免扣0、不适用独立；不以reserve−charged推退款/释放，不以现价估历史。
- 媒体先验证主记录再验证素材；受管存储、Range、过期与删除处理。图片object URL切换/退出撤销。企业音视频通过真实用户鉴权取得10分钟的tenant/record/asset限定播放授权，每次Range重新校验账号、企业、当前岗位/成员范围及功能授权；不是任意URL代理。
- 公共主从详情完整原话、公开参数标签、多个输入/输出、执行过程和费用；移动独立详情与返回、筛选清选中、图片预览锁焦/Esc还焦。根任务已用真实本地浏览器复拍三张核心屏，费用在1440×1024首屏可见。
- 原生/Bearer企业账号与平台会话解耦：企业列表/快照/命令固定当前真实用户，不接受平台cookie提权。平台岗位/组织管理改用独立 `/api/admin/tenants/[id]/organization`，保留平台鉴权、同源、CAS与命令重放。
- 钱包与充值保留唯一模块入口并正确选中，映射充值套餐；旧BI到稳定创作链接；登录保留安全站内redirect；平台退出完整跳转清除旧界面缓存。

## 集中证据

`output/saas-admin-20261022/verification/` 为忽略目录；每脚本独立新建127.0.0.1:55439的fixture数据库，不覆盖预览数据。

| 脚本 | 实际断言与结果 |
| --- | --- |
| verify-saas-tenants.ts | PASS：鉴权/创建幂等/命令冲突/CAS/席位/独立身份/租户暂停/未知指标/计费去重 |
| verify-saas-enterprise.ts | PASS：真实native鉴权、owner/下级/撤权/跨租户、二次登录共存不提权、平台组织独立入口、审计脱敏、全局账号/账本不变 |
| verify-saas-creations.ts | PASS：企业scope与内部字段剔除、false/0/null财务、分页、107历史输出、离职历史、source只读恢复、跨actor/tenant子项排除、媒体Range/SSRF/播放签名篡改过期撤权 |
| verify-saas-creation-writers.ts | PASS：父空间冻结、canonical权益交集、素材scope、SDK原始与处理后mask、多结果/文本、故障副证据不回滚checkpoint、fixture transport恰好一次、离职后video冻结完成、canvas/batch、payer不变 |
| verify-billing-async-tasks/tools/agent、verify-imagegen-execution | PASS：已有受影响计费/异步/Agent/imagegen回归；fake supplier是fixture，真实供应商调用0 |

根任务独占 `design-qa.md`；真实截图和交互证据在 `output/saas-design-qa/`。正式TypeScript与生产build最终应在其他业务分支及新增余额模块整合后执行。预览专用NEXT_DIST_DIR自动改写的tsconfig不得提交。

## 未完成或不等同于通过

- 真正生产Worker进程重启、真实供应商Agent多工具/ComfyUI/视频执行、47数据与线上媒体读取未在此模块执行；隔离源码路径/事务/fixture transport证据不能替代这些。
- 平台音视频也使用限定素材播放授权，逐次检查平台口令修订、原生admin有效身份或Supabase配置管理员邮箱；不在URL存用户Bearer。原生角色撤权的真实隔离API回归覆盖；Supabase真实云账号模式未做端到端登录验收。
- 其他待整合业务分支的新video-batch/Agent recovery入口必须对照writer接入，不能因本轮公共wrapper测试通过而跳过。
- 真实固定镜像、回滚候选的新membership/媒体兼容、三锁蓝绿、整站切流、排空停止及最终验收由根任务串行协调；尚未执行。

同步：M01/M02/M03完成后主实施刷新main仍 `7b1e970c`，归零；M04/M05/M06代码完成，根任务再次fetch main不变。最终跨分支整合后重新登记计数和固定SHA。
