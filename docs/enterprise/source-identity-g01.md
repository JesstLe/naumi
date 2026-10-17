# G01 来源身份桥接实施

## 已实现

新增004-source-identity迁移：source_enterprises、source_identities和identity_binding_audit。来源实例+源企业+源账号映射到工作流租户与subject；姓名/花名不是主键。映射显式启停和版本校验，同一source不能静默改绑到另一租户/人员。

Naumi新增GET `/api/enterprise/workflow?action=context&enterpriseId=<uuid>`。复用原生/既有认证resolveUserEmail，不调用平台管理员代理，不接受role、permissions或任意上游URL。普通员工可以在企业有效授权及明确工作流绑定下获得自己的工作区；不会因此获得企业生成记录/积分经营数据查看权限。

源端每次检查账号禁用/到期、企业启用、实际成员关系、功能权限、老板入口授权和dedicated范围。服务器签发45秒Ed25519来源令牌，仅在BFF到工作流之间传递，浏览器只收到身份和授权团队列表。工作流使用公开密钥验证iss/aud/kid/TTL/严格字段，再从数据库解析绑定和当前团队权限，不合并不同团队的角色。

工作流请求解析后的principal携带sourceBinding。业务事务内resolveDatabaseActor再次锁定并检查绑定、团队、成员，避免“先解析后撤权”仍执行；已解析principal也在撤权后失效。来源端授权变更在下一BFF请求检查；内部令牌最长45秒，不把这个时效说成跨库事务级实时撤权。

新增GET `/v1/identity/workspaces`；既有命令/排期路由可选使用createMappedAuthenticator。保留原S1签名适配供兼容测试，正式接入必须选择source-mapped认证，不暴露内部端口。构建导出映射工厂并带004迁移。

## 配置和绑定

源Naumi：NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID、shared/dedicated范围配置；NAUMI_WORKFLOW_SERVICE_URL为服务端固定origin（HTTPS或回环HTTP），NAUMI_WORKFLOW_SIGNING_KID与NAUMI_WORKFLOW_SIGNING_KEY为Ed25519密钥配置。私钥不入Git/日志/浏览器。

工作流：相同issuer=`naumi-workflow-bff`、audience=`enterprise-workflow-source`和对应公开密钥；显式运行迁移004，建立工作流accounts/teams/team_members并审核source bindings。SourceIdentityStore.configure只供受控provisioning调用，没有公开自动bootstrap端点；数据库账号仍需最小权限配置。

真实源实例、企业UUID、账号对应关系和正式密钥尚未绑定；不把隔离fixture管理员或Excel姓名当真实登录用户。用户已说明Excel真名/Naumi花名不同，G02将基于本模块稳定账号做人工映射。

## 实际验收

- 独立工作流PostgreSQL：原11项+source identity1大项共12项通过。
- 映射未建立拒绝、普通员工工作区、企业/实例隔离、团队角色不合并、版本冲突、禁止静默改绑、签名伪造/过期/未知kid/角色注入拒绝。
- 实际HTTP工作区200、匿名401、绑定/团队撤权403；已解析principal在业务事务内撤权拒绝。
- Naumi实际原生签名会话+实际Next route+实际工作流HTTP：普通无管理角色的企业成员200；原经营数据仍403；role注入400、foreign404、未绑定老板403、禁用401、企业/入口授权停用403、配置缺失503。
- 既有作品/媒体/analytics集中回归通过。全部测试仅一次性合成数据库，真实364行导入记录和292附件没有修改。

## 未完成及下一步

G01是服务端身份基础，不是完整员工UI。G02原UI登录/工作区及真名花名映射；G03源记录转任务草稿；G04-G15继续按实施台账推进。总目标ACTIVE，不以此模块完成代替全部实现。
