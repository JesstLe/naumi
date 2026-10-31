# R8Z：图片预览入口的认证与权益决定归属

## 基线与真实证据

本轮完整原始基线为 b4ebe4e4279eb809ce2cb88564ab94be25f41a86，5331文件raw hash/tar在output/refactor-r8z-20261101；产品行为对应完整验收f0b30bc5。R8Y原5轮prepare p95 +10.57%仍OPEN，不修改原10%调查阈值。

原150/侧逐请求证据说明尾部主要集中于每个新Web进程前几次报价，不能因此删冷样本。两轮SQL/checkout/GC/CPU诊断保留完整页面负载，额外热态样本分开；首版在HTTP内启动Profiler引入约155ms自身开销，原日志保留为污染对照。受控版原30＋额外170延迟样本不启Profiler，另170profile样本在请求外信号ACK后开始，不能代替原5轮性能门禁。

实际完整App链每个普通预览仍有23次SQL，包括3次原生账号检查和3次账号权益读取。独立实际HTTP/native cookie/PG/planner/quote基线20用例33检查已复现：领域入口本身auth=2、policy=2，原报价恢复同为2/2。它们是明确重复职责，不认定为旧p95超差唯一根因。

## 本轮模块职责与公共接口

- creation-context作为HTTP入口的认证/作用域适配：withCreationRoute回调显式接收server-authenticated actor。null表示已确定匿名；undefined保留no-DB未解析适配，不使用客户端身份字段。旧零参callback继续有效。
- creation-access唯一实施当前权益检查，返回actorEmail＋policy的本次决定；企业权益检查顺序及条件保留。没有向ALS、全局对象或数据库保存权限缓存。
- imagegen plan/原报价读取仅在决定actor与本次owner一致时复用该policy；不同actor或无ingress context仍读取自己的当前权益。每次调用和下一请求重新检查，撤权/封禁/会话撤销不跨请求缓存。
- plan route消费入口认证结果；no-DB的undefined才调用原认证fallback，明确null不再重复认证。来源检查、schema、原价/输入归属和未知受理语义保持。

本轮只改5个产品文件；没有新表、事务、业务限额、价格确认或通道选择变化。不调整钱包、原任务ID、报价ID、供应商或生产配置。

## 集中验证与当前状态

新增scripts/verify-imagegen-ingress-ownership.ts并接原catalog，注册209不等于已执行。验证使用实际HTTP handler、原生HMAC cookie/真实PG账号状态、权益、planner、服务器报价与持久化，没有替代这些依赖；provider transport禁止调用。覆盖成功/原价/current新价、匿名/跨站、封禁/过期/会话撤销、跨actor、无context、撤权后恢复、同scope再次检查、读取失败、显式取消、旧callback/no-DB及账务无变更。

基线20/33已实际执行通过（表示重复行为被复现）。修改版20用例33检查已通过，正常公开/授权轨迹与基线EXACT；route及原报价入口auth/policy均2/2→1/1，跨actor依旧分别读、下一调用撤权即时生效。类型/完整固定源码及原5轮配对性能待集中验证；原始失败、source/hash bridge、四产物及copy-only rollback以本轮VERIFICATION/DELIVERY记录为准。

准备阶段两次fixture失败保留：初始配置初始化CONFIG_UNAVAILABLE；独立Router fixture control凭据长度不足。复用已通过的全规格fixture映射并保留加密key，使用符合实际构造器要求的本地长凭据；没有放宽生产校验或发起供应商调用。

整体goal ACTIVE；PR8保持draft，未合main/未部署，47 HOLD。
