# G15-C Naumi Web接线预检与真实HTTP组合

后续生产构建与Linux实际双镜像组合进度见[ G15-D ](production-composition-g15d.md)；本文开发服务器验收记录保留为本阶段证据，不覆盖后续状态。

## 交付目标

产品仍是18482原HTML，不使用/admin作为协作界面。Naumi保留登录、源企业成员关系、生成记录和积分账本的权威；工作流独立数据库保存显式账号映射、需求/任务/交付/排期等。此模块补齐部署前配置一致性检查，并通过真实Next HTTP服务器与独立运行CLI贯通登录和业务闭环。

## 配置契约

新增`web-composition.example.json`，这是受保护的组合检查输入，不是第二套账号库，也不是可直接公开的前端JSON。

|字段|用途与校验|
|---|---|
|version|固定1，未知字段拒绝|
|NAUMI_ENTERPRISE_PUBLIC_ORIGIN|员工实际访问的规范Origin；HTTPS或本机HTTP，禁止凭证/查询/非根路径|
|productFile|实际Web产物HTML绝对路径；普通文件、体积上限、SHA256与runtime bundle一致|
|DATABASE_URL|Naumi源数据库连接；不复用工作流库；实时检查只读源表，不初始化源schema|
|NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID|必须对应runtime配置中的来源实例|
|NAUMI_ENTERPRISE_DEPLOYMENT_MODE|shared/dedicated与runtime一致|
|NAUMI_ENTERPRISE_ALLOWED_IDS|本来源实例的明确企业集合，与runtime对应集合相等；不把工作流企业UUID当作Naumi企业UUID|
|NAUMI_WORKFLOW_SERVICE_URL|本轮同机组合精确指向127.0.0.1的API端口；拒绝Worker端口、凭证、查询和路径|
|NAUMI_WORKFLOW_SIGNING_KID|runtime公钥字典中的kid|
|NAUMI_WORKFLOW_SIGNING_KEY|Naumi现有Ed25519私钥；导出公钥后与runtime对应公钥逐字节比较；不打印私钥|

文件沿用绝对路径/普通文件/体积门禁；Linux要求0600。私钥只用于选定Web配置的核对，不写入runtime配置、镜像或验证输出。Windows当前仍需安装方核验ACL。

## 两阶段检查

`composition-plan`只读配置与产品文件：核对模式、企业集合、来源实例、签名密钥对、API端口、数据库连接标识和HTML字节。它不连接数据库，不证明员工已经登录。

`composition-check`再核验：

1. 工作流安装标识、schema/文件hash、运行账号权限、来源绑定和成员状态。
2. 使用固定连接的`BEGIN READ ONLY`事务读取Naumi源表，确认选择的企业存在且启用；不调用源schema初始化，不创建或修改源用户。
3. 源库必须具有Naumi相关表且没有工作流安装表；运行库继续执行独立工作流库检查，避免同库混用。测试是同一个隔离PG实例中的两个不同数据库，不冒称两台数据库服务器。
4. API实际readyz的role、installation、slot、releaseId、productSha256和接受业务状态必须完全匹配。HTTP 200本身不是通过条件。

输出仅含检查摘要，始终保留`sourceSessionVerification=external-login-probe-required`。检查和启动之间仍有配置变化窗口；正式发布须固定配置hash并在切换前复核，检查不自动启动、迁移、激活Worker或切流。

```powershell
node services/enterprise-workflow/build.mjs
node services/enterprise-workflow/dist/runtime.mjs composition-plan --config RUNTIME_JSON --web-config WEB_JSON
node services/enterprise-workflow/dist/runtime.mjs composition-check --config RUNTIME_JSON --web-config WEB_JSON
```

运行Web时将该文件的DATABASE_URL和NAUMI_*字段装入同一受保护进程环境；version/productFile是预检字段，不传给浏览器。SETTINGS_SECRET、媒体、其他既有Naumi设置仍使用原安装配置，不被模板覆盖。本轮没有新增另一套Web启动器或账号密码系统。

## 真实Next环境发现并修复的问题

1. 共享node_modules实际Next为14.2.35，而仓库锁定15.5.27。它会忽略Node middleware等配置并错误打包原生依赖。验收器现按锁文件hash在独立目录执行npm ci，保留原Next请求体修补脚本，不修改共享node_modules。安装后核对Next版本，测试源码副本不复制.env文件。
2. 真实Next HTTP中原先仅比较Origin和request.url.origin的写请求被403拒绝，直接调用route函数的旧测试没有暴露这一组合问题。六个工作流写入口现在统一调用workflowSameOrigin：配置存在时必须同时匹配明确公共Origin与原始Host，并继续拒绝sec-fetch-site=cross-site；不信任x-forwarded-host，不自动把localhost和127.0.0.1视为同源。未配置时保留原严格比较，空/非法配置拒绝，不降级放行。

反向代理必须覆盖并保留正确Host（含非默认端口），而不是让客户端伪造forwarded头决定信任域。Naumi Web只监听回环/受控内部网络。真实公网TLS、代理Host和浏览器cookie仍须目标站验收，不能靠本机配置推断。

## 验收实现

入口：`node scripts/verify-enterprise-composition.mjs`。

验证器建立独立源代码副本和独立锁定依赖；新建本轮唯一PG容器、源库与工作流库、合成账号及密码。使用实际Next开发服务器、原生/api/auth/login口令验证和HttpOnly会话，不注入签名cookie，不提供fixture登录路由。工作流使用编译后的runtime CLI独立进程和低权限运行账号，不以内存工厂替代。

覆盖：规范Origin/Host与伪造forwarded负例，错误实例/模式/企业集合/端口/数据库/密钥/HTML拒绝，源企业停用时预检拒绝，匿名登录跳转，原生员工/个人/外企业工作区，原HTML字节一致，需求→审批→拆分发布→认领执行→上传→设计验收→运营签收→贡献事实，以及Naumi生成账号/提示词/6积分流水读取与签名来源关联。账号禁用、工作流映射撤销、切账号和跨站写入分别拒绝。

生成/积分数据是明确合成的已存在测试记录，没有调用真实供应商，读取与关联不重复扣费。原始公司数据和18482入口不在测试执行对象中。

可通过NAUMI_COMPOSITION_RUNTIME_BUNDLE指向已固定的运行包；验证器逐文件校验后复制进隔离副本，不重新构建该包。最终报告记录运行包Git/release/sourceDirty、实际Next版本和Node版本。

## 实施状态与未完成项

9组实际HTTP组合检查已在开发态通过，独立锁定依赖下整份源码及Next生成类型的类型检查exit0；没有替换共享node_modules或降低项目类型检查选项。旧共享依赖下的24项诊断不作为正确依赖环境的当前结论。最终提交后的固定运行包、原模块/BFF、Linux回归、完整类型检查与副本回滚，以本轮VERIFICATION.txt为准。初次路径检查误把Next的[...slug]当成路径越界、顶层await按CJS解析、共享旧依赖和Origin失败日志均保留，不记为首轮全绿。

当前Web验证采用真实Next开发服务器，不是完整Naumi standalone生产镜像。完整生产Web构建、Linux Web/runtime组合、代理蓝绿与4核8GiB整站容量继续待完成。实际企业标识、员工真名/花名/团队、钉钉userid/凭证及聚水潭仍待真实配置。总目标ACTIVE；不因本轮HTTP贯通标记公司已经上线。
