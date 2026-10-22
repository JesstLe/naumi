# SaaS 企业后台重构（M03）

日期：2026-10-22；分支 `codex/saas-enterprise-ui-20261022`；基线 PRD `be4dbac6`。子模块记录，整体由主实施交接文件归并。

## 实现

- 保留 `/enterprise` 和 `EnterpriseConsole`，按已选 `enterprise-overview.png` 的 1487×1058 比例重构：208px 海军蓝侧栏、60px 顶栏、四项范围指标、最近创作、成员用量、企业授权、待处理、管理动态。沿用中文系统字体和 Lucide 图标，无新增外部字体依赖。
- 六个一级入口为企业概览、组织与成员、岗位与权限、创作记录、额度与用量、企业设置；岗位/创作能力由服务端快照控制，保留真实企业协作工作台和创作工作台入口。
- 企业列表仍来自 `/api/enterprise`；切企业/换账号立即清理快照、媒体、编辑器、历史任务与选中记录，取消旧请求。服务端重新鉴权；身份/岗位/全局状态变化使内容组件重新挂载并撤销 object URL。
- URL 保存 tenantId/view/from/to/user/status/creationId；支持旧 enterpriseId/email 上下文与前进/后退。日期采用上海自然日，默认最近7日；最长一年。
- 企业概览消费主实施 `/api/enterprise/creations` 的已确认归属投影与汇总，公共 `CreationBrowser` 负责同一创作详情。所有确认指标均不从当前成员 email 的历史反推；缩略图使用逐次鉴权代理、AbortController 和 object URL 清理。
- 原历史作品、历史任务和 analytics 保留在单独标注的兼容区域，不计入已确认企业资产；历史用量明确来自成员个人账户，不作为企业钱包。
- 身份暂停/恢复与期限只调用独立 membership 语义；成员表分别显示企业身份和全站账号状态；企业端密码重置入口移除。岗位修改保留版本冲突、影响人数、组织校验、焦点捕获与 Esc。
- 新增 `/api/enterprise/saas-overview`：GET 输出范围内有效成员、临近到期身份、白名单管理动态；不返回原始 changes/result、密码/供应商字段。PATCH 仅真实企业所有者修改企业名称，commandId 幂等、expectedVersion 乐观锁、审计，无积分/账务写入。
- 企业设置支持资料查看、名称变更预览和保存；真实权益来自企业快照，没有套餐记录显示未配置，不使用原图样例数字。窄桌面下减少非核心列，390px 使用折叠菜单、纵向卡片和局部表格滚动。

## 验证与证据

- Product Design user-context preflight：无持久用户上下文，使用本轮已固定图和 PRD。已打开原图并读取 frontend-design、image-to-code、design-qa 指令。
- 本模块第一次整仓 TypeScript 检查：仅报主实施尚未整合的 `@/components/saas/creation-browser` 缺模块；本模块其余变更无类型错误。公共组件已由主实施固定到 `efdc417e`，正式整合后重验。
- PostgreSQL16 本地隔离库 `saas_enterprise_fixture`（127.0.0.1:55439），运行 `NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=<本地fixture> node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-saas-enterprise.ts`。首次测试确认匿名拒绝、跨租户拒绝、私有缓存、所有者有效人数与临期计数后，发现原 M01 scope 的 dangling-else 使非所有者范围为空。已向主实施报告精确文件/语句，由其修复，不绕过鉴权继续冒充通过。
- 集中脚本覆盖预定断言：owner/subordinate 范围、撤权、同源、所有者限定写入、CAS、同 commandId 重放、安全审计裁剪、全局账号和账本不变。待上述范围补丁合入后完整重跑。
- 浏览器同尺寸/390px、真实媒体撤权、交互与设计 QA 由主实施整合三页面后集中执行。当前未取得实现截图，不声称视觉验收通过。

## 未完成与边界

- 本模块代码完成待整体集成；没有完成全链路 writer/Worker 接入、正式构建或生产验收，均由主实施对应模块负责。
- 没有连接服务器、使用生产账号、执行供应商调用或发布。供应商调用为0。
- 当前 PRD要求的所有三屏视觉验收及跨模块端到端仍需主实施集中完成，不能把本记录当正式重构已完成。
- 功能同步计数：本子模块1，已整合 M01基础提交为编译/数据依赖；整体满3模块由主实施统一 fetch/整合，不在本分支擅自更新共享main。
