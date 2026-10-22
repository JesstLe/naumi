# SaaS 后台集中验收矩阵

此表对应实施清单58项。范围为本机独立Next18499、隔离PostgreSQL55439及每脚本独立fixture数据库；生产未发布。本任务真实供应商调用0。脚本中的SDK/供应商HTTP均明确fixture，不能作为真实成片或真实供应商扣费证据。根任务浏览器材料与最终差异以根目录`design-qa.md`为准。

脚本证据在忽略目录`output/saas-admin-20261022/verification/<脚本名>.log`，UI截图在`output/saas-design-qa/`。本文简称：T=`verify-saas-tenants`，E=`verify-saas-enterprise`，W=`verify-saas-creation-writers`，C=`verify-saas-creations`，V=`verify-saas-video-workflow-evidence`，J=`verify-saas-worker-restart`，G=`verify-saas-agent-evidence`，X=`verify-saas-client-context`；均为`.ts`脚本。GUI=根任务真实浏览器+明确本机fixture。

| 编号 | 当前结论 | 证据与边界 |
| --- | --- | --- |
| A01 | 隔离通过 | T/E/C及verify-admin-access，实际路由鉴权拒绝 |
| A02 | 隔离+GUI通过 | E/C跨tenant拒绝；双session手改B URL拒绝 |
| A03 | 隔离通过 | C主记录/素材同scope，账务只经关联operation返回 |
| A04 | 隔离通过 | C私有参数/供应商/错误原文禁止字段断言 |
| A05 | 隔离通过 | C与verify-admin-access的fleet-only限制 |
| A06 | 隔离通过 | E/T实际cookie/JWT和岗位范围，平台cookie不扩企业身份 |
| A07 | 隔离通过 | E及verify-enterprise-hierarchy循环、等级、自我提权事务保护 |
| A08 | 隔离通过 | T/E停membership，全局banned/password/expiry及个人会话不改 |
| A09 | 隔离通过 | T/E所有者移除/暂停拒绝 |
| A10 | 隔离+GUI通过 | C签名逐Range重新鉴权、撤权拒绝；GUI预览关闭锁焦/还焦；下载字节不可召回 |
| A11 | 本机GUI通过 | CDP响应阶段暂停真实租户A GET200，经实际列表导航切B；A请求在卸载时Abort，释放时报Invalid InterceptionId，B未混入A字段。tenant-slow-response-fixture.json/png；验证取消分支，不冒称迟到body已交付 |
| A12 | 本机GUI通过 | owner正常退出后，另一标签原3张blob图片、要求与名称草稿清空；正常登录departed/manager没有旧资料，manager设置重载仅当前有效下级且无名称编辑控件。enterprise-account-switch-fixture.png、enterprise-draft-account-switch-fixture.json/png；平台退出、深链登录另已通过 |
| D01 | 隔离+GUI通过 | T相同commandId重试仅一个tenant、冲突拒绝；GUI创建/刷新持久化 |
| D02 | 隔离通过 | T版本409不覆盖；GUI409保留草稿 |
| D03 | 隔离+GUI通过 | T缩席位409；GUI3有效人数改2拒绝、原3/50保持 |
| D04 | 隔离通过 | T/E false/null/0合同；未知旧权益只原值保留 |
| D05 | 隔离通过 | J企业暂停+成员撤权后已接受任务仍读持久快照且未知收费不重投；生产在途任务未操作 |
| D06 | 隔离通过 | W/V/J actor/tenant/payer历史不变 |
| D07 | 隔离通过 | C legacy_unconfirmed不计确认指标、企业详情拒绝 |
| D08 | 隔离+GUI通过 | 企业显示成员账户用量来源；未制造企业钱包、划拨或owner代扣 |
| D09 | 隔离通过 | T/E/W多次ensure扩展schema及事务故障恢复；生产迁移/备份恢复待发布门禁 |
| D10 | 隔离通过 | W/V/X真实项目校验、phantom/跨scope/请求body group与header冲突拒绝 |
| D11 | 隔离通过 | W/E tenant拒绝不退个人，canonical功能交集与协作membership检查 |
| D12 | 隔离通过 | W/V个人明确输入可用，其他tenant原图/衍生/lineage/项目引用拒绝 |
| D13 | 隔离通过 | W/C/V/J真实actor付款账户，operation去重，无owner代扣 |
| D14 | 隔离通过 | C离职后owner保留确认记录，岗位只看当前下级，私人历史不扩 |
| C01 | 隔离通过 | W两参考+mask保留role/inputPosition/executionRef，原话参数与输出；账务精确链接由C覆盖 |
| C02 | 隔离通过，有明确缺失语义 | W原始与processed分别记录，多SDK步骤不覆盖；浏览器先压缩而未保存原bytes时原始显示未记录，不冒称原图 |
| C03 | 隔离通过 | 接受时request/parameters/model快照；verify-imagegen-execution/config/billing冻结，C缺历史为未记录 |
| C04 | 隔离通过 | G实际/api/agent→runtime→真实naumi-tools双工具，一个turn根、两个child，签名continuation；供应商transport为fixture |
| C05 | 隔离通过 | W同步0积分文字结果、失败与billing-tools；未知账务不转0 |
| C06 | 隔离通过 | W suite/aplus真实checkpoint一成一败为partial，仅成功artwork保留；真实供应商成片未调用 |
| C07 | 隔离通过 | V与billing-async-tasks覆盖prepared/running/cancel/unknown事实；J未知已接受不重投 |
| C08 | 隔离通过 | J三个独立Node进程，真实DurableImageJobs.kick/claim，接受后退出、fixture死lease过期后重启，scope/请求/terms/payer固定；旧null清外层ALS。非线上Worker验收 |
| C09 | 隔离通过 | W/V source已接受后的副证据trigger故障保留checkpoint；SDK执行一次；C只读恢复，无收费重投 |
| C10 | 隔离通过 | V真实node复制source/output链接及跨scope拒绝；W免扣claim；未执行外部ComfyUI服务 |
| C11 | 隔离通过 | W同source/events重复不重复；C父子/账务同scope去重；V批次receipt原子性 |
| C12 | 隔离通过 | C素材/事件/children分页，107历史输出，文字/视频Range与workflow多产物 |
| C13 | 隔离通过 | C已删除artwork素材404，成功状态和账务保持；UI不可用/未记录占位不改业务 |
| C14 | 隔离通过 | C外部URL/遍历/HTML拒绝，SVG服务端转webp，无脚本原文输出，私有CSP/no-store |
| C15 | 隔离通过 | C重复详情禁止network断言且ledger/creation数量无变；source恢复只读，供应商0 |
| C16 | 隔离通过 | C精确quote/reserve/release/refund，未知null；不按当前价格推算 |
| U01 | GUI通过 | 平台总览/租户/账务/模型唯一导航，钱包入口恢复，实际激活正确 |
| U02 | GUI通过 | 唯一钱包与充值link aria-current，首屏套餐，wallet-1440-postfix.png |
| U03 | GUI通过 | 租户资料/权益/创作/成员/审计/用量真实页；创建编辑岗位与409，未保存关闭提示 |
| U04 | GUI通过 | 原生退出→企业完整深链→登录→自动回原tenant/view/creation；状态过滤清旧详情 |
| U05 | GUI通过 | 实测长email/要求/表格与390布局；特殊200字输入未穷举，折行约束保持 |
| U06 | GUI+隔离通过 | 核心loading/empty/error，余额service fixture成功0/不限额/未知/失败缓存/503重试；非生产余额写死 |
| U07 | GUI通过 | 三张源图1487×1058归一CSS1440×1024全surface比较，参考design-qa.md |
| U08 | GUI通过 | 390成员sticky紧凑行、1024/390详情返回无全局横溢；lightbox Tab/Esc还焦；编辑dirty guard真实触发 |
| U09 | 隔离+GUI通过 | E/C多岗位scope，平台cookie共存不提权；企业不可调平台API |
| U10 | 隔离+GUI通过 | 空库/Router未配/权益未知都有真实空或未知；ProviderOps独立于Router错误可访问，无示例线上数据 |
| R01 | 受影响模块通过 | admin-access/feature-access/model-management及billing-tools/agent/async/imagegen-execution集中通过；旧Agent harness-runtime脚本在当前合并基线缺Router fixture准备，原脚本未改、未标通过，新G验证本次Agent证据链 |
| R02 | 隔离通过 | enterprise-artworks/analytics/hierarchy/console及完整enterprise-integration BFF；旧fixture全局身份断言更新为新membership合同，WindowsTEMP canonical只修fixture |
| R03 | 隔离通过 | imagegen-execution/billing及V/J配置、报价、幂等、未知恢复冻结 |
| R04 | 最终正式Linux构建与联合验收通过 | 固定06665b7e/Image1bad9309；18/18实际Web/PG/Worker HTTP、真实PG tick/重启/排空、UNKNOWN拒绝恢复、native完整解码与Linux7进程38断言通过。各fixture/native边界见saas-release-progress，不以Next dev代替 |
| R05 | 未执行 | 根任务协调最新47真实基线/视频profile、三锁蓝绿/排空/最终固定镜像；本任务未操作生产 |
| R06 | 无兼容业务回滚；受控维护替代本机通过 | 470adbc9受控维护renderer/真实Nginx TLS52组合通过，applied=false；现场公网入口闭包/同版Worker/lifecycle接入由根任务收尾。旧0a不得公网回退，未声称业务回滚通过 |

最新供应商视频整合专项本机12组通过，见[视频整合验收](2026-10-23-saas-video-merge-acceptance.md)。R04最终Linux证据已补齐，见[最终联合验收](2026-10-23-saas-release-progress.md)。待根任务补齐：R05生产发布、R06现场维护恢复门禁。A11/A12专门浏览器证据已补齐。真实Worker重启仅本机隔离镜像，无真实Supplier调用、线上数据写入或生产发布完成声明。
