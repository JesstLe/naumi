# 视频执行迁移：默认值保真与不可映射冲突

## 模块与职责

本片属于model-config的显式绑定迁移，不增加运行时能力判断。原Input Resolver/Profile编译、任务冻结、计费/幂等/UNKNOWN、旧reader与管理发布事务均不改。

## 已复现问题

main682d3e6d的真实`proposedVideoExecution`：持久默认分辨率1080p，显示映射仅4K→720p，候选默认值却变成4K。原逻辑在找不到默认key/目标值时回退到Object.keys第一项；两个显示档位对应同一原生值时也默默选择第一个。迁移不应替用户决定一个不同的默认选择。

持久默认字段本身不足以证明它由管理员还是历史seed写入。本片不猜来源、不把它变成ExecutionPolicy；冲突只表示自动迁移不能无损解释原参数，返回需审查，不表示上游不支持。管理员仍可通过原执行编辑器明确设置并发布新Binding。

## 公共接口、依赖与状态归属

- 原proposed/review/plan/apply/rollback公共接口不变。显式显示key优先；原生默认只在唯一反向显示key时无损转换。存在持久默认但无法对应或反向歧义时返回VIDEO_EXECUTION_MAPPING_REQUIRED/defaultResolution。
- 迁移完成参数合并后，直接复用编译器已有mapVideoParameters核对每个已提供默认值（base及合并后的operation规则）；不复制类型/范围/映射判断，不读取verified/modes/limits或发供应商请求。
- 缺默认的required字段仍允许等候用户填写；send=omit继续跳过，false/0继续是值。无人工默认时保留原候选策略。
- 已经发布的videoExecution保持最高优先级，迁移直接保留，不借旧默认冲突重新验证/覆盖已有执行配置。单个需审查条目不阻止其他已明确候选迁移。
- 配置版本、草稿、审查digest/CAS、Router原操作恢复和字段级回退仍由原管理模块负责。旧版本、价格、凭据和账务不回写。

## 集中验证与迁移状态

新增纯规则16项覆盖不匹配/歧义、精确key和唯一反向转换、requested→effective→wire仅一次、已有Binding不动、单项冲突与其他模型批量迁移/精确回退，以及base/mode的类型/枚举/范围冲突、omit/false/0/required语义。

新增实际隔离PG/管理handler/原runtime/冻结reader13项：GET审查不写配置/草稿；强行提交冲突条目被原审查CAS拒绝，未创建配置版本或激活Router；通过原草稿明确修正默认值后，再审查/发布并冻结4K→720p。两次实际fixture激活分别为默认值修正与执行绑定发布，原请求重放不再激活，旧1080p版本、价格、凭据与账务保持。无收费上游。

既有迁移79/实际管理19、readiness15、环境bootstrap56、核心137及完整tsc集中验证，最终日志/副本/回退以 `E:/Workspace/naumi/output/video-migration-defaults-20261115/VERIFICATION.txt` 为准。

原79项中的单次映射/omit/custom path测试同时携带了默认1080p与仅4K→720p的冲突fixture；现为这项正控明确默认4K，原映射/omit/path断言不删，并用新16项独立保留和验证原冲突。初始夹具的NaN测试凭据、错误地假定失败POST不生成管理操作草稿、TS profile/非法显示档位测试错误均保留为测试驱动修正记录；管理owner未改，GET零写和POST零版本/激活分别断言。

## 实际配置审计与未完成项

本轮尝试默认目标103的只读入口：SSH在认证前关闭，匿名版本HTTP返回空响应；未取得当前在线配置，没有声称任何站点已迁移。已询问当前主机/端口或现有连接配置路径，不索取聊天明文密码，不探测47或废弃服务器。

实际启用配置/无profile审计与迁移、生产controller全业务覆盖、真实授权上游、浏览器/RSC/公网和站点蓝绿仍开放。当前为源码/隔离PG验收，不是新固定站点包或部署。目标ACTIVE，47 HOLD；生产配置写入/付费/部署0。
