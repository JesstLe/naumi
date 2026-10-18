# G49 真实试点接入包与原子人员初始化

## 本轮目标

把已由用户确认的首位设计试点从聊天信息转成可重复校验的来源账号、工作流团队/职责及人员资料初始化输入。来源/admin只定位Naumi，不替代18482原产品界面。同一主干、同一运行程序按共享/独立模式配置，不产生客户分支。

## 现场门禁

2026-10-18只读观察47：4核/MemTotal7270MiB/MemAvailable4665MiB，磁盘79%/约15GiB。运行Web及Worker为alldev-20261018，工作流桥接未配置。固定发布状态current.json仍为CLEANUP_PENDING/MIGRATED_CLEANUP_PENDING revision74。锁当前未被占用不代表前次发布已收尾；本模块不清除状态、不叠生产候选、不原地改env或重启Web。容量只是当前快照，不代表双槽峰值通过。

## 接入包

受控CLI读取明确站点合同、人工确认请求和同一来源数据库的只读快照。必须使用稳定sourceSubject精确匹配，花名只作交叉核对；未找到/停用/同账号重复/别名变化/企业关闭或入口失效拒绝。来源角色、上级不转换为工作流权限。每名人员明确personId、workflowSubject、teamId、权限和工种，不按姓名生成主键，不自动创建管理员。

准备输出采用新建私有目录，保存PROFILE_PROVISION.private.json、REVIEW.private.json和不含姓名/账号的SUMMARY.json。无密码、私钥或源库URL输出。准备不是应用；输出保留源快照摘要/观察时间，最长15分钟用于目标预览及首次执行，过期需重新只读核对；命令重放仅返回已提交结果，不重复写入。

## 原子写入

扩展既有operator-only provision-plan/provision：账户可携带显式确认的personProfile（personId/expectedVersion/真名/花名）。在同一目标数据库事务内提交团队、账户、来源绑定、权限、人员资料和审计；不需要临时为试点授予manage或目录管理员来完成资料录入。旧无profile合同保持。

目标预览把相关person_profiles与source绑定版本纳入hash；资料版本变化、同源账号已有其他personId、personId已有不同账号均拒绝，不按花名合并；已有Excel行链接不动。profile的source字段固定取运行租户与该账户sourceSubject，输入不能另带第三方账号。不同人同名可存在，不自动合并。并发重复同一命令只提交一次，审计失败全事务回滚。

本模块不自动授权未列出的同事，不让本人验收本人作品，不创建或扣减Naumi积分、不导入历史源作品。来源与目标是不同数据库；真实切换仍受现有部署门禁和员工原生会话验收。

## 验收

严格输入/同名别名冲突/稳定账号精确匹配/人员职责不扩权/源只读和跨企业、输出ACL及无秘密、过期输入与新快照、原子账户及profile/CAS/重放/改绑拒绝/审计失败、正式运行CLI/类型检查/原UI与原数据保持、副本回滚。使用合成来源/目标PG验证写入；真实首位人员只生成接入包，不冒充已上线。

## 实际接入中发现的账号兼容问题

Naumi用户名账号使用中文local-part（例如合成账号“设计甲@username.naumi.local”），不是需要投递邮件的邮箱。原人员资料服务采用email格式校验，原UI又使用input type=email，会在稳定账号本已合法时拒绝中文账号。本轮统一为受限账号标识：单个@、无空白/控制字符、ASCII域名、最长254字符、小写规范化；UI使用账号文本输入，花名仍不作为身份键。source binding仍按来源精确账号匹配，不绕过登录或企业权限。

新增runtime pilot-plan/pilot-apply，受保护source-config只供一次性CLI读取。在独立来源库重新执行只读inspectSource并比对快照、企业和逐个账号/花名后，再调用原目标预览或原子初始化。来源与目标数据库混用拒绝；同一命令重放不重复写资料。来源复核与目标提交不是跨库原子事务，真实员工后续每次BFF请求仍检查实时来源授权；这不是永久有效授权证明。

## 可复用命令

```powershell
node scripts/enterprise-pilot-plan.mjs --site docs/enterprise/config/source47-site.json --request ABSOLUTE_CONFIRMED_REQUEST --summary ABSOLUTE_FRESH_SUMMARY --roster ABSOLUTE_PRIVATE_ROSTER --output ABSOLUTE_NEW_PRIVATE_DIRECTORY
node services/enterprise-workflow/dist/runtime.mjs pilot-plan --config ABSOLUTE_RUNTIME --admin ABSOLUTE_TARGET_ADMIN --input ABSOLUTE_PROFILE_PROVISION --source-config ABSOLUTE_SOURCE_CONNECTION
node services/enterprise-workflow/dist/runtime.mjs pilot-apply --config ABSOLUTE_RUNTIME --admin ABSOLUTE_TARGET_ADMIN --input ABSOLUTE_PROFILE_PROVISION --source-config ABSOLUTE_SOURCE_CONNECTION --preview-hash VERIFIED_PREVIEW_HASH
```

source-config严格为databaseUrl与site二字段，只挂载一次性运维CLI，不注入常驻工作流服务。输出planHash不含真实姓名/账号。来源快照过期或原目录变化需重新生成输入，首次执行前再次复核。用户姓名/权限确认可沿用但源证据不无限沿用。sourceInstance尚未设置时，准备包标明proposed-not-configured；这不是声称来源已有该键。

## 实施状态

开发运行61组（包括新的实际CLI/两库来源核对、原子profile、CAS、改绑拒绝、源撤销、过期及精确职责）通过；原服务模块回归通过。原表单的中文账号保存及原生Next专门检查在本轮固定版验收，最终记录以enterprise-pilot-onboarding-g49-20261018/VERIFICATION.txt为准。初始独立目录权限负例实际先由manage门禁返回FORBIDDEN，断言已按实际授权链修正，不额外赋予测试人员管理员；跨服务两版@types/pg通过最小结构接口声明避免混用依赖类型。

本地原导入租户为准备包目标候选，未创建设计团队；teamId/personId/workflowSubject明确生成并固定为新对象候选，不按名字生成、猜测或覆盖已有团队。源角色不复制。实际部署位置仍待用户选择；同机方案先处理47既有发布债务，再重新量测完整双槽资源并按蓝绿发布。
