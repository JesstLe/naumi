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

基线20/33已实际执行通过（表示重复行为被复现）。修改版20用例33检查已通过，正常公开/授权轨迹与基线EXACT；route及原报价入口auth/policy均2/2→1/1，跨actor依旧分别读、下一调用撤权即时生效。类型/完整固定源码及原5轮配对性能已实际执行，见下方；原始失败、source/hash bridge、四产物及copy-only rollback以本轮VERIFICATION/DELIVERY记录为准。

准备阶段两次fixture失败保留：初始配置初始化CONFIG_UNAVAILABLE；独立Router fixture control凭据长度不足。复用已通过的全规格fixture映射并保留加密key，使用符合实际构造器要求的本地长凭据；没有放宽生产校验或发起供应商调用。

整体goal ACTIVE；PR8保持draft，未合main/未部署，47 HOLD。


## 固定完整源码验收

applicationSource：f7441ed0f9ae077f5d3f6fafb0f7c70b6d585567；完整5333源码、App/Worker同sha256:5934e621d6fdad7aa36149eea14dd306c62d080af846759146ed8f32adaddce6，SDK完整App字节EXACT，版本1793474041。
core209/0/0/0reuse；runtime177；产品浏览器92/180秒；450秒混合165图片＋12媒体、177consume/1014fixture积分、onePOST/operation，业务不变量PASS。隔离供应商/PG，不是生产容量或真实上游质量验收。
实际5090类型输入raw hash一致、tsc0；先lint再捕获类型避免旧Next生成声明漂移；lint37既有warning；四类SCC0，原2fixture/1dist例外单列。

| 指标 | 3e90完整基线 | 当前f7441ed0完整镜像 | 变化 |
|---|---:|---:|---:|
| 可视就绪 p95 | 7834.70 ms | 7796.28 ms | -0.49% |
| 实验交互估计 p95 | 1744.00 ms | 928.00 ms | -46.79% |
| 报价准备 p95 | 37.69 ms | 19.05 ms | -49.46% |
| 只读请求 p95 | 23.20 ms | 19.26 ms | -16.96% |
| Web采样RSS p95 | 411.41 MiB | 414.84 MiB | +0.83% |

当前判定：**本轮当前候选采样无超过原10%调查阈值的指标**。同3e90完整基线、相同lock/runtime/页面和网络条件，原5轮10栈、每侧15页面/150prepare/300read；没有加入诊断170热态样本，也没有删冷样本。原R8Y和R8X结果仍各归其源码；本轮明确减少重复I/O，不冒称旧差异唯一根因已被证明。

## 交付与回退合同

本轮11路径（5产品、2验证/目录、4文档），原5331→新5333文件；9修改/2新增；其他2136原产品文件raw hash一致。最终文档归档单独记录，以仅文档source bridge证明产品与验证资产和固定f744一致。
四产物在output/refactor-r8z-20261101：完整MODIFIED_FILE.tar、强制binary DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh。独立副本协议：补丁后5333hash一致；实际modified20/33；copy-only恢复9原文件/移除2新增、全部5331原hash和baseline20/33，旧入口2/2与原报价2/2恢复，正常轨迹EXACT；later-edit在首写前exit1/零写；真实工作树保留新版。不回灌DB/媒体、不重放付费POST。实际运行/命令/literal/exit和重开结果以同目录DELIVERY/VERIFICATION为准。

首版Profiler污染、raw Git archive173行尾hash拒绝及两次fixture准备失败原样保留。PR8保持draft；新head远端CI按实际job另录，不用旧账户阻塞报告代验。整体ACTIVE，未合main/未部署，47 HOLD。

本轮汇总门槛满足不代表每轮都变快：对照基线跨期p95有明显漂移，paired第2轮p50仍回退；p50沿原driver nearest-rank估计。不能把汇总约49%的降幅归因为本次改动的确定收益。逐轮原值/旧原始观测与归因不确定性均保留在PAIRED_VARIANCE_ASSESSMENT.json。

## 尚待迁移的同类入口

静态AST盘点59个creation/receipt wrapper调用，本轮只有图片plan入口消费新actor参数；另有7个零参callback经本地handler直接认证的迁移候选（主图片提交/回执、取消、输入、批次回执/下载）。这不是运行事故证明，也不是已完成迁移；下一模块逐入口保留来源、身份、scope、UNKNOWN和原回执协议迁移验证。详见本轮INGRESS_MIGRATION_INVENTORY.json。
