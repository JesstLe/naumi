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

## 主线发布回归

加入 Pages API 后，Next 导航钩子的返回值可以为空。原组件继续直接使用 Next 钩子，按页面需要处理未就绪的查询参数或路径名。计费入口和工作台会话恢复均经过浏览器回归，固定镜像验证和线上验收另行记录。

企业连接池回归使用真实身份事件模块，数据库端口仍由工作负载替身控制。企业列表、详情、素材回包和连接占用用例通过，读取链路未触发建表。

## 2026-11-19 Pages API 运行边界修复与中央接通

- 本次起点：独立工作树由1573d7e6快进至origin/main 8050397d；共享E:/Workspace/naumi不切分支、不写文件。
- 线上基线：2778285e / sha256:c52f7b2b6da332fddba7cf8028241dbf7d35afcfa62bf40b72399e1c505230e4；revision2414的全局MIGRATED_CLEANUP_PENDING/legacyDrainProven=false保留，当前reconciledMainRelease已COMPLETE，与历史债务分别处理。
- 根因：Next Pages API的api-node层将server-only外部化，生成require("server-only")，在handler执行前抛错。只将server-only加入transpilePackages，使Next既有按layer别名生效；不删除领域标记、不全局改alias、不修改客户端保护或oidc-provider/pg/sharp外部依赖。
- 集中边界回归：scripts/verify-identity-pages-boundary.mjs使用Next自身makeExternalHandler和标记别名；基线应exit1/externalized，修改后exit0，服务端marker加载且客户端marker仍拒绝。生产镜像HTTP/OIDC、名册普通事务、私有配置及蓝绿验收结果在本节后续追加。
- 职责：只中央代码、中央身份配置、中央名册provision与Naumi蓝绿。消费app/DB/ingress由设计协作线程负责。
- 持久JWKS与独立客户端/服务秘密只写47私有配置；源只保存服务token摘要。202人批准名册与200人真实资格匹配；舒隽/曲飞只生成一次性私有邀请，不兑换、不改真人密码，不删除其余成员。
- 当前状态：边界单元验证通过、provision包构建通过；镜像构建、47启用与消费联调尚未完成。此变更为中央认证运行边界维护，不新增公开内部技术说明。

### 名册准备阶段实测修正

首个生产候选discovery/JWKS实际HTTP200（无私钥字段）；名册CLI在任何人员写入前停于display name比较。徐偃的批准花名规范email与中央、消费真实资格email完全一致；后两者display name也完全一致，但含既有姓名后缀。修正CLI用已验证的批准花名规范email绑定身份，并要求中央与消费真实姓名互相一致；不修改姓名、email、成员绑定或密码。新增7个纯身份匹配用例覆盖后缀、真实姓名不一致、不同email和缺失记录。旧候选不接公网，更新固定main制品后再普通provision。

### 2026-11-19 中央侧实际发布与对接回执

- 修复均已合main：f9ab4e94（Pages API marker编译边界）、9c8fc057c70bdf729af2bfa96f790eb2da9189c8（批准花名规范email与双侧真实display name匹配）。发布固定source=9c8fc057、build=1795051987，Web/Worker同Image ID `sha256:0ecca138be05226efb2780492bce5b62f991748c0fadbb676b8b3beec9100b34`。
- 新Web `naumi47-web-central-identity-20261119-r2`，Worker同后缀；release journal `release47-central-identity-20261119-r1`内保留首个未切流候选的自然退役记录（不是第二个并行发布）。旁路最终候选峰值预算4096MiB，实测MemAvailable12118MiB，未计Swap。
- 完整Next编译/内置类型检查、Worker/identity bundle及standalone依赖校验通过。Debian apt下载失败后，media-runtime复用固定62b2332d镜像；sandbox.c/prepare-runtime.sh相对96a2393d无diff。其余应用完整重编；5423个非docs tracked构建输入逐SHA核对固定main无差异。未以编译通过代替OIDC/业务验收。
- 持三部署锁+lifecycle锁完成备份→旁路就绪→整站nginx语法/CAS/平滑切流→旧任务/连接自然排空→旧Web/Worker停止且restart=no→同版本Worker恢复完成tick→supervisor绑定。旧连接等待约4分38秒；没有强杀、删UNKNOWN或重放生成。7338份新旧静态资源union保留，精确旧alias保持。507次跨切流version/health/既有session实际HTTPS请求全200，0错误，不强刷页面。
- 本轮COMPLETE，canonical revision2491；根历史phase=MIGRATED_CLEANUP_PENDING、legacyDrainProven=false及原历史记录保留。`bash scripts/deploy-release.sh --lifecycle status --state-dir /opt/naumi-staging/releases/release-lifecycle`实际exit0；不把本轮完成改写成历史全局债务清零。
- 公网issuer `https://47.105.59.142/api/identity`，discovery/JWKS实际HTTP200、TLS正常、公开JWKS无私钥；带独立服务令牌的公网projection HTTP200/complete=true/members202/active200。未登录PKCE授权303进入native interaction；匿名/错误机器令牌401。真人成功SSO仍待正常用户登录，不使用伪造native cookie或兑换真人邀请。
- 普通授权CLI `APPLIED_AND_READ_BACK`：批准202人，新增舒隽/曲飞2普通UI设计师、邀请未兑换；名册外7个企业成员保持。原252账号password_hash+原生role逐项哈希保持；产品/岗位角色仅写中央身份域。徐偃保留原始真实display name与账号绑定。
- 原中央DB872470100字节备份已sha256+pg_restore --list读回，不回灌。持久私有JWKS/中央authority.env与独立consumer.env均0600并有受保护私有备份，源只保存service token摘要，配置未入Git/聊天。
- 消费配置：`/opt/naumi-design-ops-test/private/central-identity-consumer.env`（0600）；邀请回执：`/opt/naumi-staging/evidence/release47-central-identity-20261119-r1/roster-invitations.private.json`（0600，仅47私有文件）。公开交付回执：同目录`PUBLICATION_RECEIPT.json`。中央侧不改消费app、DB或ingress。
- 主发布锁已于2026-11-19 01:46:37UTC释放。supervisor锁释放后service实际ExecMainStatus0/Resultsuccess，全部readiness=true、unknown ticks0。消费线程随后遇到周期监督器非抢占锁exit75，双方协调中央三锁内仅暂停timer，给消费共享nginx切流明确窗口；业务容器不动。消费切流回执到达后须核验唯一消费文件变化，重绑中央supervisor全局gateway摘要并恢复timer，随后补充该状态。

### 消费切流协作收尾（2026-11-19）

消费线程报告并提供完整receipt：最终消费main e75bc48635fef02c5423dc24fbf9ba7746d7f98a、Image sha256:e9187e19b6de44bcf3c656699d5fa335ec9a832d6fcfa1b89707c34e16929274，202人激活同中央revision。消费侧修复了审计INSERT占位符UUID/text类型冲突；失败事务先前已回滚，未切流。最终13153候选→13152 canonical同固定镜像收敛，旧消费/候选自然排空停止。该部分由消费线程实施，不由中央侧写消费app/DB/ingress。

中央独立核验47私有receipt与实际nginx -T：唯一消费文件`/etc/nginx/sites-enabled/zz-naumi-design-ops-test`最终字节恢复原始hash75f08a5e；完整dump恢复30338012，与中央发布后固定摘要完全相同，故**无需修改中央gateway pin**。中央三锁+lifecycle锁内实际Supervisor.once通过、readiness全true、unknownTicks0，timer恢复active/enabled；revision2492、runtimeRecovery状态TIMER_ACTIVE_POST_CONSUMER_VERIFIED。三锁随事务退出释放。协调回执：本轮证据目录`consumer-coordination/02-consumer-convergence-timer-restored.json`。

持久中央签名与authority配置备份为0600私有tar且读回通过；consumer.env只交给消费侧私有目录，本轮中央备份不包含其原始service token。消费投影/ACK/定时同步与真人登录最终结果由消费集中验收继续回告；不把未登录303当真人SSO成功。发布后main已新增同事Canvas与文档提交，中央实际运行仍为固定9c8fc057，不声称这些后续提交已部署。

### 真实ACK 500的中央SQL修正（2026-11-19）

消费已提交binding202后，02:01:01UTC真实POST `/api/enterprise/identity/ack`（revision f1bc2845...、sequence202、appliedMembers202、error=null）返回500/uncertain，中央ACK表仍空。无执行PG PREPARE按原始SQL复现`42P08: could not determine data type of parameter $6`（exit3）。将last_error值和CASE中的同一个$6均显式转为text；修改SQL PREPARE通过（PARSE_OK_NO_EXECUTION、exit0）。未手写/伪造消费ACK、未执行INSERT来替代消费重试。新增只读PREPARE回归脚本，真实POST/周期调用在固定新镜像蓝绿后由消费方同body完成。现有已上线中央服务继续运行；新发布仍需三锁、旁路、自然排空，不原位替换bundle。

### ACK修复已真实上线并读回（2026-11-19）

- 固定应用source `02cce26857ac74b2a8dccbed59074cd3a0c2d744`、build1795053797，Web/Worker同Image `sha256:932676bf822e3bb754950b2f33b925f17c979efb0d4a82952ee874cf13d95f1a`，本轮journal `release47-central-ack-20261119-r1`。
- 只修ACK SQL中last_error与CASE两处`$6::text`，原始SQL真实PG只读PREPARE复现42P08/exit3，修改后PARSE_OK_NO_EXECUTION/exit0，副本回滚恢复同42P08/exit3。未执行虚构ACK或用SQL补写回执。
- 完整Next编译/内置类型、Worker/identity bundle与standalone package通过；5428构建输入逐SHA匹配固定main。构建/切流复核发现后续574fa7db只增加独立热更新操作脚本和文档，无应用runtime变更；未安装或执行该工具、未改模型配置。
- 同三部署锁+lifecycle锁：新完整备份、旁路Web+同Image Worker、discovery/JWKS/投影200且kid不变。原在途共享域工作先保持旧Worker运行等待自然完成，再切流；旧中央连接约6分55秒后自然排空，旧Web/Worker停止且restart=no。没有轮换clientSecret/JWKS/service token，不重apply202人名册，不改消费app/DB/ingress。
- 669次跨切流实际HTTPS version/health/既有session请求全200、0错误；7347份新旧静态资源union保留，实际Worker恢复完成tick，原任务/账本/供应商绑定的索引不可变字段读回保持。
- 消费方真实周期重试后，中央只读读回`app_identity_consumer_acks`：revision=f1bc2845984f8da661dd9e129250eb201d8e3999ec8cc5c05cb263f97e45bed7、sequence202、applied_members202、last_error=NULL，last_success_at=2026-11-19T02:17:05.386243Z。私有实际证据：`/opt/naumi-staging/evidence/release47-central-ack-20261119-r1/16-real-consumer-ack.json`。
- 本轮COMPLETE、canonical revision2548；原根历史MIGRATED_CLEANUP_PENDING/legacyDrainProven=false保留。`deploy-release.sh --lifecycle status`实际exit0。监督器重绑新pair、timer恢复active/enabled，三锁+lifecycle于02:17:43UTC释放；锁释放后systemd postflight继续核对。不将真人未登录303或机器ACK当作真人SSO成功回调。

### 最终监督与HTTP回执

ACK修复轮锁释放后实际systemd于10:18:49～10:18:51 CST完成，Result=success/ExecMainStatus0，全部readiness=true、unknownTicks0；timer active/enabled。中央三锁+lifecycle内核对后仅更新监督验收元数据，最终revision2549、TIMER_ACTIVE_SERVICE_POSTFLIGHT_VERIFIED，业务固定版本及历史pending保持。

中央独立只读Nginx access日志还确认消费真实POST `/api/enterprise/identity/ack` 在10:18:16、10:19:33 CST均HTTP200（不是仅看到表已写入就推断HTTP成功），私有证据`release47-central-ack-20261119-r1/20-ack-http-access.json`。中央只读SQL回执与公网HTTP回执相互对应；消费周期/前端验收由消费owner维护，真人正常登录成功回调仍待用户本人反馈。

### admin 正常中央网页登录已验收（2026-11-19）

消费owner提供普通网页登录证据：实际返回`/workbench`，浏览器`/api/workspace` HTTP200，actor.name=admin、roles=[admin]、centralManaged=true、centralTitle=administrator。中央只读核验47私有`/opt/naumi-design-ops-test/private/final-sso-session-metadata.json`（0600）：单一admin会话created_at=2026-11-19T07:55:33.945Z，central_auth_time=2026-11-19T07:55:33Z，expires_at=2026-11-26T07:55:33.945Z；stable_subject_matches=true、enabled=true、authority=naumi47-tdh、issuer=https://47.105.59.142/api/identity。未读取或借用token。本次仅记**admin正常中央SSO通过**，不把它记作其他具名账号组合成功；具体“无涯”组合的密码表述仍由用户与消费侧澄清，不据此猜测或修改密码。

中央三锁+lifecycle内仅更新验收元数据：revision2551，当前release仍COMPLETE，centralOidc.humanSsoLogin=VERIFIED_ADMIN_NORMAL_BROWSER；原根历史MIGRATED_CLEANUP_PENDING保留，应用、Worker、密钥、名册及业务配置不动。回执为本轮证据目录`acceptance-admin-session-20261119/01-admin-sso-verified.json`；所有锁已释放。

同次核验最新真实消费ACK私有receipt：HTTP200/body={"ok":true}、sequence205、appliedMembers204、error=null、revision=0e966028a0134eed9d7a9c8f2e8082dc695257972acac383ee5658b0d9fe0542。这是原202名册基线之后的源授权推进，保留202历史基线，不倒退或重apply；消费忠实同步不等于消费写中央授权。消费owner报告225项隔离PG全PASS/0skip、21组真实隔离HTTP的264请求/54命令通过，分角色页面扫描仍在进行；这些消费回归数字明确为消费owner回告，不冒称中央重复执行。

### 普通员工账号切换 interaction 恢复链诊断（2026-11-19）

admin既有正常中央SSO验收保留；普通员工无涯native登录成功之后的新OIDC流，真实导航链17:00:39 CST为auth303→interaction303→resume200（自动form）→session/end/confirm303→同resume400，正文interaction session not found。并非消费旧回调超时；对应Interaction已不在持久库。未重跑真人登录、未读取cookie/token，也未改密码或名册。

根因与最小修复：oidc-provider在原OIDC账号与当前native账号不同的情况下，先进行旧Session/Grant撤销后再恢复同一Interaction。原PG Adapter `revokeByGrantId`跨所有model按grant_id删除，连携带旧grantId的新Interaction也删除。库自己的撤销器本来逐凭证model调用revokeByGrantId并显式destroy Grant；修复将SQL收敛到当前adapter model与grant_id，不删除Interaction/Session，不扩大或保留已撤销的凭证。

集中隔离验证使用真实oidc-provider@9.15.0、独立PostgreSQL容器/随机schema、RFC路径cookie jar和真实HTTP重定向/自动form，无生产账号/凭据。旧源码成功完成A登录后切B稳定复现ACCOUNT_SWITCH_FAILED=interaction session not found/exit1；修改后完整A→B回调账号绑定正确、旧Grant/旧授权码已撤销、6种凭证model按库调用逐个撤销，Interaction/Session保留/Grant显式销毁约束通过/exit0。该fixture不替代无涯真实浏览器复测；后续按三锁单候选蓝绿、沿用持久JWKS/客户端配置/名册再交消费方重试一次。

### 普通员工账号切换修复已真实上线并完成三角色验收（2026-11-19）

- 最小修复已合main `f15683c84847a360fc8e19ac785555c9a58c1d20`：仅将 `IdentityAdapter.revokeByGrantId` 收敛为 `WHERE model=$1 AND grant_id=$2`，参数 `[this.model,id]`。保留provider自己的逐凭证model撤销及显式Grant销毁，不误删恢复中的Interaction；未放宽cookie/path或认证策略。
- 真实oidc-provider9.15+独立PG+HTTP完整切换回归：基线 `ACCOUNT_SWITCH_FAILED=interaction session not found`/exit1；修改后A→B回调绑定、旧Grant/授权码撤销及6种凭证model约束通过/exit0；另一个副本hash-guard回滚exit0后重新恢复基线同错误/exit1。原始源码hash保留，修改副本保持，不回滚生产DB。隔离fixture容器已优雅停止。
- 固定build `1795079369`，Web/Worker同Image `sha256:5bd507c549be8f469a9d5765edb94e8ccc43ae1bd126a230ff6a03823c784a33`。完整Next编译/内置类型检查、Worker/identity bundle与standalone包校验通过；5438个构建输入逐SHA匹配固定源码。未为了文档重复跑大范围测试。
- 三部署锁+lifecycle锁内完成备份→单候选旁路→09:32:43UTC整站平滑切流→旧Web连接自然归零→Worker屏障及两次全域排空证明→旧ACK Web/Worker优雅停止且restart=no→新Worker恢复完成tick→监督绑定。旧Web传输自然等待96秒，域工作随后完成；未强杀、删除UNKNOWN、回灌DB或重放付费任务。新Web `naumi47-web-central-resume-20261119-r1`、Worker同后缀，journal `release47-central-resume-20261119-r1`。
- 实际公网version、discovery/JWKS、authenticated projection均HTTP200且默认TLS验证；签名kid、持久JWKS、clientSecret/serviceToken保持，202人名册未重apply。当前真实投影204人，不把历史批准202基线覆盖成新数字。1008次跨切流version/health/既有session探测全部200、0错误，不强刷用户页面。
- 空间维护先阻断8.2GiB不足门禁。仅清理已完整本地SHA读回的中央重复传输包、一个从未切流的失败候选和一个超过最近5轮且无恢复引用的Nov7退役round；无force/prune，不碰消费前缀/DB/备份/媒体。36212份同字节、同模式/owner静态副本通过同文件系统硬链接去重，全部URL/内容/manifest保留，未删回滚静态资源。344207177字节新包暂存已核对MemAvailable的tmpfs，根盘仍严格验证10GiB+展开门槛。成功导入/发布后只删除该RAM临时包，保留本地原包和已导入镜像；最终观测root可用10998923264字节，近期5轮及兼容回滚材料保留。
- 消费owner收到FIX_LIVE后仅做既定三次正常凭据+新state/PKCE跨账号验证，中央独立读回两份0600私有回执核对：无涯09:36:30.475Z为admin/administrator、舒靖09:37:38.177Z为operations、青眉09:38:05.318Z为designer；三次均 `/workbench`、workspace200、centralManaged=true，分别4/9/7项正确角色菜单；普通成员无管理菜单。各自created_at/auth_time/expiry、stable_subject_matches=true、enabled=true、authority `naumi47-tdh`、固定issuer核对通过。既有admin正常登录验收独立保留。真人浏览器由消费owner执行，中央只读证据；未读取/借用token或cookie、未改真人口令/权限、未兑换邀请或SQL造会话。
- 三角色原始私有回执：`/opt/naumi-design-ops-test/private/real-members-sso-20261119.json` 与 `real-members-browser-sso-20261119.json`，均0600；中央独立读回结论：本轮目录 `17a-real-member-sso-verified.json`。最新中央只读ACK为sequence205、members204、error=null、revision `0e966028a0134eed9d7a9c8f2e8082dc695257972acac383ee5658b0d9fe0542`；消费09:39:26.153Z实际HTTP200/{ok:true}与之对应，未伪造ACK。
- 本轮COMPLETE；主publisher三锁+lifecycle于09:40:33.533Z释放。锁释放后systemd实际17:41:06～17:41:08 CST `Result=success/ExecMainStatus=0`，readiness全true、unresolvedTicks0，timer active/enabled；postflight元数据事务退出，revision2618、`TIMER_ACTIVE_SERVICE_POSTFLIGHT_VERIFIED`。实际 `bash scripts/deploy-release.sh --lifecycle status --state-dir /opt/naumi-staging/releases/release-lifecycle` exit0。本轮收尾与原根历史 `MIGRATED_CLEANUP_PENDING/legacyDrainProven=false` 分开，历史债务原样保留；未进行故障注入，不把本轮监督正常运行写成崩溃恢复实测。
- 真实发布回执：`/opt/naumi-staging/evidence/release47-central-resume-20261119-r1/PUBLICATION_RECEIPT.json`；监督回执：同目录 `postflight/SUPERVISOR_POSTFLIGHT.json`。消费配置仍为 `/opt/naumi-design-ops-test/private/central-identity-consumer.env`（0600），原私有邀请回执保持；中央侧不写消费app/DB/ingress。
- 消费owner最终封存回告：20机器、225PG/模块、21HTTP组264请求54命令、59角色页面组合与上述三人真人SSO均通过；这些数字为消费owner实施回告，不冒称中央重跑。消费文档main `ffc59d6`，线上仍source `f9641f071db650d3a835a3f4bab78fc410016509` / Web Image `b20b1ba3db1f649b7fc7fa0c1c02f5302819f1810043a17a6ccf9118a24b0a6a` / CLI `ff5be55ec72d470a6fdc12eed14a1a24df28e0de4cff08c8eb80050b2148f7ab`，不是新文档已发Web。双方本轮门禁闭合，不重跑已通过真人流。
