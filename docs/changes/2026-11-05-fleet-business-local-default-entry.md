# Fleet HOLD：默认后台入口保留本地数据

## 问题与状态

review `5776305134` 覆盖 `4e0271bd`。Fleet 启用时，未指定分区的 `/admin/center` 被归一化为 overview 后直接进入 all-site dashboard；`/admin/usage` 也默认走全站视图。公共远端 admission 仍 HOLD，因此有可用远端实例时响应不完整，聚合指标与趋势被隐藏，破坏原本地入口的保留契约。

本轮只修复页面归属和导航 URL，不开放远端 admission、不改余额或账务、不迁移数据。生产发布继续 **PREPARATION ONLY / HOLD**。

## 实现

- `businessExplicitEntry` 区分原始标量 section 和显式 site/view。裸入口保持原 native owner；center 不把缺失、空、非法、数组 section 或非 BI 的 `section=usage` 误当作显式 overview。
- 裸 center 保留原 `AdminCenterShell`、embedded `PlatformConsole` 和完整 embedded `BiDashboard`。裸 usage 保留 `UserUsage`。没有改动这些本地组件的数据源或布局。
- center 的裸入口认证返回目标也保持 `/admin/center`，不凭默认 section 制造 `section=overview` 后把登录完成的用户送回 Fleet。显式/native section 的原认证目标继续保留；本轮没有扩展全局认证返回 URL 的既有 allowlist。
- 明确选择 overview/users/orders/ledger/artworks、site 或 view 时，继续走原 Fleet 页面；native-only BI sections 和 `businessLocalDetail` 的原优先级、空值存在语义、邮箱深链、管理/完整分析链接保持不变。
- Fleet 内部导航清理默认 site/view 时，若没有有效 center section 锚点，保留 `view` 作为明确 owner 标记。切回默认 tab、全站、首页、30天或清空账号后，重载不会无声切回 native owner；有邮箱时仍保留 site/view 双重 scope。
- 两个 Next/browser runner 的 Fleet 场景改为显式 `view=usage`，不再把裸 usage 误当作跨站入口。这里只调整语义；若未实际启动 Next/browser，则只记录语法检查，不宣称浏览器验收。

## 验证

扩展既有 usage-entry verifier，直接调用两份实际 async Next 页面，加载实际 helper、navigation model 和 BI section 常量；认证与显示组件是有限边界。矩阵检查两个本地默认入口、完整 overview 组合、显式/非法/数组 section、native-only section、旧过滤和邮箱、显式 scope、未带邮箱的导航与实际页面重载、权限拒绝及参数不变。

原始275项矩阵复现29项不满足；随后补充 `section=usage` 不是 center 锚点的导航对照，并检查裸 center 认证目标不制造显式 Fleet section。初版278项记录和源码保留，最终279项矩阵及受影响页面 lint/typecheck 集中重验。UI contract、hook、common admission 和两个 browser runner 的相关源码没有因认证目标修正而变化，其同轮记录保留。实际命令/输入/输出/退出码以作者本地 `output/fleet-business-local-entry-20261105/final/VERIFICATION.txt` 为准，不把有限组件结果称为真实 Next/PG/browser 或登录往返验收。

四份本地产物记录原始哈希、实际副本恢复、后续编辑零写拒绝和复开。CI step 使用扩展后的实际双页矩阵；远端 CI、CodeRabbit 全量检查、生产发布分别记录。CodeRabbit 的 ESLint 安装超时属于工具运行状态；本轮不因此改依赖或禁用检查。Docstring 汇总警告仍开放，未改阈值。
