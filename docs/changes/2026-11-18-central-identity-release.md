# 中央身份完整源码增量 · 2026-11-18

## 交付状态

首次源码提交时尚未进行功能测试、类型检查或构建，未部署、未创建真实账户或下发真实角色。
`e5bae085` 的13组通过结果及旧rollback证据属于历史后端切片，不覆盖本次增量。

合入主线后的发布候选补齐企业工作台的身份开关传递，企业版的管理入口与企业后台共用同一开关。关闭开关或当前租户无权限时，直接进入身份页链接会落回企业概览。Next 在同时包含 App Router 页面和 Pages API 时把导航钩子标为可空，受影响的 App 页面通过同一只读导航接口处理空值。全项目类型检查、独立 PostgreSQL 中央身份 13 项、企业目录身份入口以及平台租户和总览的浏览器用例已执行并通过。OIDC 联调、正式账户初始化和线上启用的验收另计。

## 实现模块

1. 企业后台“组织与权限”：浅色人员目录、搜索、职务/归属组、跨组调度、独立审核范围、技能/职级/容量、制作开关、产品角色及启停、变更理由。组织与产品配置一个事务写入，版本冲突刷新。中央管理员独立于原生业务层级，不能借此扩大创作记录查看范围。
2. 新建账号/重新邀请/启停：中央事务、席位、身份冲突、特权账号保护、幂等与审计、同事务outbox；新账号无默认共享密码，禁用直至本人兑换72小时一次性邀请。令牌仅存SHA256；链接fragment不经HTTP查询串，浏览器读取后清除。重发旧邀请失效，密码变更撤销旧会话。
3. 标准OIDC：`oidc-provider@9.15.0`，Node24，持久PG Adapter、单次消费授权码/防重放、S256 PKCE、静态客户端与严格回调、5分钟token、持久私有JWKS、原生登录会话与企业/产品状态实时约束。协议由成熟库处理，不手写签名令牌协议。
4. 投影/回执：绑定服务令牌的企业/产品、全量与单subject投影、组织/授权/账号版本、实时原生启停/到期/重置状态，完整对账revision/sequence与ACK。服务入口由handler验证机器凭据，不再被交互式cookie中间件误拦。其他企业路径仍走原用户授权。
5. 生命周期：既有企业与账号命令同事务通知outbox；其他原生账号变化即使无事件也由即时完整字段读取和消费方周期全量投影覆盖。sequence仅观察，不冒充事务提交顺序。
6. 批量准备/应用工具：202人批准队列、200个既有账号来源核对、两位UI人员独立创建、CAS、逐项私有回执与最终读回；不删除其余源成员，不重置原密码/积分/任务/媒体。

依赖方向：route/page → identity用例 → enterprise事务与现有原生账号；OIDC只消费该公共能力；事件层仅依赖schema与原事务连接，不反向依赖server。原生底层user/admin字段不写入designer/director等业务角色。

## 关键人员配置

批准名单 `docs/organization/APPROVED_ROSTER_20261118.json`：202人。北方最高系统管理员；无涯/仲远/伽罗管理员；玄策/尺素总监；希言/孙疆/沙曼主管共同管理四个设计组；其余普通设计师46、运营147。
舒隽与舒靖始终为不同账号；曲飞新建，舒隽也从中央独立建号。所属组不等于管理边界。
既有技能、职级、容量从消费方真实资格导出保留；主管/总监不自动授予全部专业审核或制作资格，审核范围独立维护。两名新UI账号技术默认P1/6小时、UI设计技能，不作为实际资历/劳动安排确认。

## 配置

```dotenv
NAUMI_IDENTITY_AUTHORITY_ENABLED=1
NAUMI_IDENTITY_ISSUER=https://47.105.59.142/api/identity
NAUMI_ENTERPRISE_DEPLOYMENT_MODE=dedicated
NAUMI_ENTERPRISE_ALLOWED_IDS=1095114e-6b57-429e-a954-7d663907e0c9
NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID=<保持现有已配置实例标识>
NAUMI_IDENTITY_JWKS=<持久私有JWKS JSON>
NAUMI_IDENTITY_OIDC_CLIENTS=[{"clientId":"naumi-design-ops","clientSecret":"<独立随机值>","enterpriseId":"1095114e-6b57-429e-a954-7d663907e0c9","productId":"design-ops","redirectUri":"https://design-ops.47.105.59.142.sslip.io/api/auth/central/callback"}]
NAUMI_IDENTITY_CONSUMERS=[{"productId":"design-ops","enterpriseId":"1095114e-6b57-429e-a954-7d663907e0c9","tokenSha256":"<独立投影令牌SHA256>"}]
```

JWKS持久保存且按现有备份策略进入加密/受保护配置备份；不要每个进程/部署重新生成。签名私钥/客户端秘密/原始服务令牌不入Git，不打印日志。`node scripts/create-identity-secrets.mjs /PRIVATE/DIR` 只在显式执行时创建私有文件，不覆盖现有文件。
Node端口保持内部，只有可信入口设置/覆写X-Forwarded-*，不接受公网直连伪造代理头。

## 发布者操作（均未执行）

源站镜像用 `npm run build:identity` 打包 CLI。将本次审核通过的人员名单和资格文件通过受保护的渠道放在容器可读的私有目录，再运行以下命令。

```sh
node dist/identity/provision.cjs \
  --plan /PRIVATE/approved-roster.json \
  --eligibility /PRIVATE/eligibility.json

# 上一步仅准备；此操作才修改中央账户和组织，并写私有邀请回执：
node dist/identity/provision.cjs \
  --plan /PRIVATE/approved-roster.json \
  --eligibility /PRIVATE/eligibility.json \
  --apply --private-receipt /PRIVATE/roster-receipt.json
```

资格导出由设计协作 `scripts/export-central-eligibility.ts` 提供，只含身份/角色/技能/容量，不含密码。保留原user/member ID。
部分应用失败，既有成功项目不回滚新身份；使用新私有回执路径重跑，版本检查/幂等处理已完成项。邀请链接丢失时从中央后台重新邀请，不推导或使用共享密码。

消费方迁移、激活、timer与最终集中验收详见设计协作仓库 `docs/implementation/CENTRAL_IDENTITY_RELEASE.md`。
中央功能默认关闭；本轮仅提交源码，不改变47生命周期revision、旧媒体UNKNOWN/未排空实例，不启动新候选、不强制终止进程。

## 后续集中验证与回退

新增代码全标记NOT TESTED。预留集中覆盖：现有企业层级回归、中央管理权限/越权、OIDC协议/重放/错误issuer、邀请/启停/到期/密码重置、消费方绑定/撤权/乱序/ACK、跨组排期/审核/业务验收/文件对象与NAS。
源码交付包保存原始hash、变更overlay和hash-guarded copy-only回滚脚本；包完整性与应用功能测试分开记录。源码回退不回灌数据库、密码、媒体或已受理付费任务。身份切换后保留增量schema和中央认证，不能回退成复制密码旁路。
