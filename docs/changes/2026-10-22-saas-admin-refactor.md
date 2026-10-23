# 多租户后台重构实施记录

任务基线：PRD `be4dbac67fba46868057c90c35e3a67b9cf9a46d`，业务 main `7b1e970c84006c2fb76f8c1748e96da128e12982`。实施 worktree 为 `saas-admin-20261022/naumi`，分支 `codex/saas-admin-20261022`。共享 checkout 未切分支或修改。

## 当前阶段

| 模块 | 状态 | 范围与证据 | 未完成 |
| --- | --- | --- | --- |
| M00 | 代码完成 | 两份 PRD、三张原图（1487×1058）、契约与证据语义；208px海军蓝侧栏；2租户/7用户/8创作的显式fixture | 最终设计QA由根任务完成 |
| M01 | 隔离验收通过 | 租户/权益/命令/CAS/席位/membership；`verify-saas-tenants.ts`真实隔离PG/API通过；新增负责人旧子账号排他、续期/转正式席位校验 | 生产只读及上线验收未执行 |
| M02 | 代码完成 | 平台总览真实指标/日期/折线面积趋势、租户六标签、资料权益/已有成员操作、三态功能开关；`6538ccf0` | 根任务真实表单创建/修改/刷新、旧权益保留与409席位保护、岗位创建及跨企业附加拒绝已通过；最终QA状态见design-qa.md |
| M03 | 隔离验收通过，视觉复核中 | 企业概览/成员/岗位/设置、经营范围、确认资产与私人历史分区；`4a32a66b`/`fd632cbc`；双session不提升企业身份 | 最终设计QA与完整浏览器矩阵 |
| M04 | 代码完成，隔离集中验收通过 | `de5d010b`/`01f4d069`及本批收尾：workflow/batch/node持久scope、画布header、协作JWT membership、旧null ALS清理、lineage/body group校验均补齐；独立进程恢复、真实Agent双工具、故障与读写隔离脚本通过 | 供应商执行仅明确fixture transport；没有线上Worker/真实供应商生成验收，不据此放行生产 |
| M05 | 代码完成，隔离集中验收通过 | 主从/移动详情、素材/事件/子任务真分页、107产物历史分页、精确账务null/0/不适用、source故障只读恢复、双scope私有媒体；`verify-saas-creations.ts` | 根任务同尺寸复拍通过；私有音视频Range/签名/撤权隔离脚本通过；云端Supabase实际登录未实测 |
| M06 | 代码完成，补充验收中 | 唯一导航、旧入口、钱包充值/普通登录完整深链/平台退出经根任务浏览器通过；`9187528e`余额+`14280591`受理统计按当前发布凭据和已验证来源读取 | 供应商余额/受理统计已以实际service显式fixture浏览器通过；真实供应商余额证据由独立源会话提供，未在本任务重打 |
| M07 | 实施中 | 8组隔离集中回归全部通过；正式整仓类型预检通过；根任务浏览器/设计报告进行中 | 最终类型/生产构建、全部设计QA及合并其他业务后的复验 |
| M08 | 实施中 | 根任务已刷新/盘点321refs；origin/main仍 `7b1e970c`；保持独立预览18499 | 完成业务分支整合、固定镜像/回滚及47三锁蓝绿由根任务负责；未发布 |

## 协作与验证

租户/writer负责人 `tenant_core`，企业/平台表单负责人 `enterprise_ui`；独立 codex 分支/worktree，通过提交整合。主实施负责读契约/媒体/历史来源/公共详情。主实施整合 M01/M02/M03 后已刷新 origin/main，仍为 `7b1e970c`，没有需merge的更新，计数归零；M04/M05/M06代码收尾后集中复核，未把代码保存算作正式验收完成。根任务2026-10-23再次fetch确认main未变。

隔离 PostgreSQL 为本地专属 fixture cluster（127.0.0.1:55439），本任务使用单独 `saas_admin_fixture` 数据库。测试材料与本地环境在忽略 `output/saas-admin-20261022/` 和 `output/saas-preview-environment/`。真实供应商调用0，未读取/变更生产数据或服务器。

2026-10-23集中回归通过：`verify-saas-tenants.ts`、`verify-saas-enterprise.ts`、`verify-saas-creations.ts`、`verify-saas-creation-writers.ts`、`verify-billing-async-tasks.ts`、`verify-billing-tools.ts`、`verify-billing-agent.ts`、`verify-imagegen-execution.ts`。每个脚本使用单独新建本地fixture数据库，保留原预览库；日志位于 `output/saas-admin-20261022/verification/`。供应商SDK/HTTP使用脚本内明确fixture transport，不能当作真实模型输出验收。

根任务浏览器已通过：三张核心屏完整1440×1024同尺寸比对、钱包唯一入口/首屏套餐、双session不提权、平台退出清私有页面、普通登录后恢复企业完整创作深链；390px成员列固定/紧凑行，1024/390创作详情无全局横溢及返回，图片预览Tab锁焦/Escape还焦，状态筛选清除旧详情。截图及同尺寸比对位于 `output/saas-design-qa/`；`design-qa.md`由根任务独占维护，其最终状态优先于这里的阶段记录。

2026-10-23业务整合由根任务完成固定 `5a521e971eae81227a224a0d85237ffa289dcc01`，main仍 `7b1e970c`；新stable reference语义、frame/Agent recovery/video controls/模型新增入口/供应商统计/前端型号可见性均保留。后续视频供应商profile授权与配置由独立源会话负责，最终候选须刷新该新提交与线上活动配置，不还原旧配置版本134。

新增模块集中回归：`verify-saas-client-context.ts`实际客户端fake transport证明project header贯穿预览/提交且切空间后不发paid POST；`verify-saas-enterprise.ts`证明协作identity拒绝暂停/过期/企业权益关闭与平台cookie冒充。`verify-admin-access.ts`、`verify-feature-access.ts`、`verify-model-management.ts`、`verify-enterprise-artworks.ts`、`verify-enterprise-analytics.ts`通过；旧hierarchy全局账号重写/密码重置断言按新独立身份合同更新后通过；企业integration完整BFF链已通过（包含既有61秒限流窗口，测试总超时单独设15分钟，未放宽应用限流）；Windows fixture短路径以canonical temp修正，未放宽应用存储安全检查。

## 读取/媒体与财务收尾

- 递归父子、计费去重和子项分页均约束同actor及tenant；历史来源只用稳定sourceId，不按当前成员或时间猜归属。
- 原始要求完整展示、参数以公开白名单标签显示；技术信息仅平台展开。企业不透传parameters内部字段或供应商错误原文。
- quoted来自requestedCredits，当前reserved不冒称历史预占；历史预占/释放使用精确link事实，退款只取实际review字段；未记录为null，明确免扣为0且其他财务项不适用。
- source checkpoint标记副证据失败时，只读补取已保存作品与待核查状态；不修业务、不扣款、不重发供应商请求。
- 企业API始终使用真实用户身份，平台cookie不扩展列表/快照/命令；平台查看任意租户走独立admin入口。
- 图片object URL在切换/退出清理；音视频按需Range读取，企业Bearer用户通过短时、限定记录/素材的播放授权访问，逐Range重新验证有效企业身份。

## 兼容与发布

新增结构只扩展，不重写历史归属或账务；当前成员email聚合不作为企业资产，不产生企业钱包或所有者代扣。旧任务没有冻结归属时不推断当前企业。新增会员状态需要兼容回滚代码；本轮不提供兼容业务回滚镜像，选择已批准PRD12的受控维护恢复替代。根任务470adbc9工具已在本机真实Nginx/TLS验证52组合503，现场公网闭包/同版Worker/维护bundle与lifecycle接入仍须发布前验收；不能把旧0a镜像切公网，也不能把本机结果称为线上完成。

## 最终增量与逐入口覆盖（2026-10-23）

| 接受/恢复入口 | 固定归属与证据 | 实际集中验证 |
| --- | --- | --- |
| imagegen 单次/批次/旧 generate | image job payload、批次plan冻结context，子步骤继承root；SDK实际输入按callId+input顺序保留；旧无scope清空ALS | writer、client-context、imagegen-execution、worker-restart |
| 套图/A+ | 真实shots成功产物关联；终态部分成功不冒称全成功；失败项不伪造artwork；原话和原始输入来自接受payload | writer的suite/aplus各一成一败checkpoint；实际供应商0 |
| canvas image tasks/同步工具 | 创建事务保存scope；终态回写或source pending只读恢复；明确零与失败分别保留 | writer、billing-tools、billing-async-tasks |
| Agent turn/子工具 | runtime先建turn root，再由真实naumi-tools签名continuation/直接import继承；文字轮次有根，length/deferred待核查 | agent-evidence真实Agent路由+runtime+双套图工具，只有供应商transport为fixture |
| 视频/节点/workflow/batch | task parameters、node/run/batch receipt持久scope；真实项目/素材先校验；旧run不推断新企业；已接受恢复不重取当前权益 | video-workflow-evidence、worker-restart及billing-async-tasks |
| ComfyUI/复制/导入/本地处理 | creation route/operation、source/output稳定链接和明确免扣；不伪造生成步骤 | writer免扣claim去重、workflow copy跨scope；完整外部ComfyUI执行未调用 |
| 管理详情/媒体 | 同actor+tenant父子分页、source pending只读投影、逐Range撤权验证；企业白名单投影无供应商字段 | creations真实PG/API、107历史产物分页、已删除/恶意SVG/HTML/路径拒绝、读无财务写/供应商0 |

C02：只展示确实保存的原始输入与处理后输入；画布已有源artwork保留精确引用，浏览器单独上传若先压缩且没有原bytes则原始素材明确“未记录”，不额外双上传或扩大上限。每个SDK调用有独立executionRef与inputPosition，避免多步骤覆盖。历史缺失不回填猜测。

安全收尾：新租户负责人不得是旧团队子账号；过期身份续期/转正式统一席位保护；企业原生身份不被平台cookie提权；协作JWT检查当前membership/有效期/企业权益。未知历史扩展权益update只能原值保留，新增/改变/删除均拒绝，create继续canonical白名单；审计reason正常投影，create/update中文。平台/企业编辑草稿关闭确认，busy不丢弃，平台uncertain先核对原命令，身份清理不保留跨账号草稿。

本批功能同步：M04/M05/M06收尾后再次`git fetch origin main`，main仍`7b1e970c84006c2fb76f8c1748e96da128e12982`，已是当前候选祖先，无新main待整合，同步计数归零。正式Linux构建、最新视频profile整合及47发布由根任务串行处理。

集中结果与未覆盖边界见[58项验收矩阵](2026-10-23-saas-admin-acceptance.md)。最终源码与新增Agent/Worker验收脚本正式`npx tsc --noEmit --pretty false`退出0；不把dev自动写入的预览dist include提交。

## 视频家族合并专项（2026-10-23）

根任务已合并ea7e4ab9及5d568c7b预算补丁。本次新增六profile真实应用/PG接受→换配置/凭据→企业暂停→poll/媒体结果/账务收尾集中验收；APIB与Geek接受未知均不重投。新匿名供应商素材入口local驱动已补冻结SHA路径，真实route+PG+文件验证同长度变字节503、owner变更404。共12组受影响脚本通过、正式tsc退出0；只有原始静态图片是真native解码，视频与media服务是明确fixture，combined Worker脚本为pure生命周期fixture。证据和正式Linux/生产剩余门槛见[视频整合验收](2026-10-23-saas-video-merge-acceptance.md)。没有新的线上消费或发布。

## 真实 Worker 建表后的详情修复（2026-10-23）

Linux 联合验收发现 UUID batch.id 与 text link.target_id 直接 JOIN 导致全部创作详情503。已改来源 ID 转text，回归先初始化真实imagegen schema再读普通与批次创作，平台/企业详情200，真实PG完整读取回归及309断言HEAD素材回归通过，正式tsc退出0。未改供应商媒体业务文件；修后固定镜像联合复验及47发布仍待根任务。同步计数0。细节见[UUID来源读取修复](2026-10-23-saas-uuid-source-reader.md)。

## combined→combined 共享scratch收尾（2026-10-23）

真实双Node媒体Worker已复现旧PATCH后新Map保留8终态导致429。现按严格退休回执同步本地终态Map；不删共享文件、不凭缺目录释放、不清queued/processing。7个真实Node进程/38断言及真实60秒collector、symlink等负例通过，原combined生命周期91断言通过；测试fixture engine不证明native。最终含本修复Linux固定构建/联合验收与47仍待根任务。同步计数0。详见[媒体退休缓存记录](2026-10-23-media-shared-retirement.md)。
