# 47 卡顿：已发布模型读取重复校验

## 模块与职责

基线 `41acebb497d36dc7283ac2c618e8d237eb4bff70`，独立分支
`codex/47-api-latency-20261125`。共享 checkout 的 27 条未提交内容不改动。
本切片只处理普通已发布模型读取的同步 CPU 放大，不调整生成并发、图片质量、媒体字节、权限、价格、账务或任务恢复。

## 现场与根因证据

2026-11-25 11:04—11:08 CST，真实 nginx 日志显示普通动态 API p95 约
3—5 秒，媒体 p95 13.779 秒。11:18 复查主机仍有约 10 GiB 可用内存，
无 Swap 使用或 OOM；旧 Web 的 8 秒线程采样显示主线程 CPU 3.84 秒，
四个 V8 Worker 合计约 1.04 秒。低频 perf 样本出现 GC、对象属性访问和 SHA256，
但没有 JIT 符号，不能把该样本解释为函数级生产归因。

实际公网仍为 `7aece11f282d743542e3c468374a7780954158c7` / `1795151944`。
中央渲染候选 `6541cf69` 的发布专属状态为
`READY_WITH_NATURAL_TASK_DRAIN_PENDING`；不通过根历史 CLEANUP_PENDING 推断新发布失败，
也不接管发布、抢锁或停止旧任务。两者负载不同，不拿空闲新 Web 作性能对照。

已复现的代码缺陷：`createPublishedModelReader.current()` 每次 SELECT 整份配置后，
都调用 `decodeModelSnapshot → validateModelConfig → validateBusinessConfig`。
后者编译所有功能模型的质量×分辨率×比例组合，且产生大量短命副本。
当前发布配置有 99 个上游、52 个公开模型，21 个功能分别重复声明参数组合。
脱敏发布元数据副本在本机 100 轮非 profile 基准中，单次全校验及摘要平均
41.656ms；本地 CPU profile 将热点定位到 `compileImageParameterPlan`、
`structuredClone` 和 Zod。它是已证实的卡顿贡献因素，不声称解释全部媒体长尾。

## 公共接口、依赖、状态归属

- `createPublishedModelReader({pool,...validationOptions}).current()/byVersion()` 接口不变。
- 每次 current 仍查 DB 当前指针、digest 和 PostgreSQL 行版本 xmin；没有 TTL，没有跨请求缓存 current、账号、权限或目录响应。
- 普通读取复用该 reader 已有的最多 64 个不可变版本缓存。首次仍完整校验及核对摘要；同版本并发共享加载；各调用拿独立深拷贝。
- active pointer 发布、恢复、丢失或 DB 错误下一次请求立即可见；行版本变化时完整重读校验，原地破坏配置但不改 digest 也会拒绝，不因缓存隐藏存储损坏。不对 xmin 排序或做事务 ID 算术。
- `readPublishedModelSnapshot(tx, options)` 的事务内读取完全不变，不借其他连接，不把未提交配置放入进程缓存。
- 旧版本执行、管理员 CAS 发布、配置校验、凭据与定价规则保持原 owner。
- 修复原 byVersion 缓存旧失败回调在 LRU 驱逐后误删同版本新 Promise 的竞争；只删除自己的缓存项。

## 实现与验收台账

1. 修改前集中基线：新缺陷回归默认模式 exit1（40 次读取、40 次完整配置）；
   `--baseline` exit0 记录复现，不将它冒充修后通过。
2. 既有参数合同 35 检查、模型启动/真实 PG 10 组 99 检查在修改前通过。
3. 新回归覆盖并发、指针切换/回退/丢失、DB 故障、坏摘要、失败重试、LRU、
   原失败与新 Promise 竞争、调用方变异、reader/信任范围隔离。
4. 新真实 PG 覆盖原 repository stage/markApplied、当前指针立即可见、旧冻结版本、
   REPEATABLE READ 事务快照、未提交版本回滚不污染缓存和定价等价。
5. 测试登记复用 `scripts/verification/refactor-cases.mjs`。最终运行结果、SHA、
   原命令/退出码及副本回滚写入 ignored evidence 的 `VERIFICATION.txt`，完成后补录。

## 未完成项与下一步

生产全链路延迟下降尚未验收。本次不改 UI，浏览器与视觉回归不适用；
没有生产收费调用，没有生产配置、路由、容器或数据库写入。
47 暂缓发布及正在进行的候选排空门禁继续保持。媒体/NAS长尾、长期进程内存和
真实负载的整站收益保留独立核验，不能由本机 benchmark 代替。

## 集中验收完成（本地切片）

- 最终回归默认模式 17 cases / 340 checks；100 并发同版本只加载一次，40 次读取完整配置 40→1，指针仍为40。
- 同一脱敏发布元数据在最终读取路径热读100轮平均1.282ms；旧完整decode基准41.656ms。两者为本机特定路径测量，非生产请求耗时或容量承诺。
- 真实PG新增17检查；既有启动/只读/在途保全10组99检查、管理员连续发布36检查、参数合同35检查、参数计划25检查、完整模型管理回归均exit0。
- 全仓 `tsc --noEmit --pretty false` stdout为空，exit0。
- 独立审查最终xmin版本 PASS；审查者独立重跑默认17/340和真实PG17，未发现支持发布路径的阻断。
- 用户已明确仅对本次卡顿修复授权47发布。正在与原中央候选负责人协调；此授权不解除另一发布的UNKNOWN或旧任务排空门禁。
- 当前仍为已测代码、待整合/固定Linux镜像/生产门禁阶段，不写作上线完成。


## 固定制品与发布协调结果

- 应用修复已普通 merge/push main：`4e01a562ef73ef8c2e9607192aabef5e6528a163`，远端读回一致。此后的本记录补充是纯文档，不改变已测应用源码。
- 固定 Linux production Dockerfile 构建 exit0：Next编译/内置类型、100静态页、Worker2539输入、identity及standalone包检查通过。build `1795577919`。
- 本机 Docker containerd Image ID `sha256:f9158aabb191845fdaec5e2ff2010d1d30d81c7496e4110ddadf537d3862e0a0`；linux平台manifest `sha256:7fe4853d6ea524410598ed9f7be849c2dbd126d0fa693c8cdf187ad86c2f240d`；内部config `sha256:a83d16e419426ad236c18a7e889c3797c0440a3a2af0985f7585dda8a230ca8a`。嵌套OCI身份不混用。
- save tar 327845888字节，SHA256 `1db821eb07eb0b0327c62a8700872a033f2372461063480bf474ae268cabc41f`；未上传或导入47。
- 实际新旧 standalone 容器顺序连接同一隔离PG与同份脱敏配置，固定1.5CPU/2GiB、各96个目录GET/8并发：旧6541 p50/p95=407.265/516.580ms，新4e01=43.931/60.834ms，目录响应完整相等。相对6541实际src运行差异仅本读取模块及公开说明。两个容器均已停止删除、隔离schema已删、fixture环境文件已删；不是生产流量、全站容量或长期压测。
- 副本回滚恢复3个原文件、移除3个新文件；原40次完整读取行为已复测恢复。产品工作区和修改版zip保持修复，未回滚数据库/媒体/生产任务。
- 正式runner绑定4e01 clean源码，两个选定case均PASS。runner整体exit2/PARTIAL因completeCore=false（非全仓core组），不把局部组当全仓通过；单独全仓tsc exit0。
- 原中央owner于03:40Z回告：其候选Worker已被resume、实际参与处理，原Worker tick UNKNOWN仍未闭合，监督service为HOLD。所有生产对象和三锁保持原归属；本线程没有窗口授权，不新起第二候选。
- 修复本地/main/固定制品完成；**47上线仍待原owner闭合UNKNOWN并证明现候选与Worker排空后衔接**，本记录不宣称线上卡顿消失。固定source/image/差异与实测已回告owner。
- 本机D盘构建前10.35GiB、完成及本地HTTP后7.66GiB；未删除他人文件或无筛选prune。后续构建前需先处理磁盘储备，不在本次卡顿修复中扩大清理范围。


## 2026-11-25 13:16 CST 实际上线回执

用户再次要求立即上线后，原中央owner明确交接串行执行权。本线程使用新session217183全程持三部署锁与lifecycle，不重放旧inbox。原6541候选按真实boot的HTTP、scanner、media和PG归属全部排空后优雅停止/restart=no；旧7ae持续服务，随后复用唯一临时槽创建本轮固定Web/Worker。

- `release47-api-latency-20261125-r1` 于 **05:12:28Z / 13:12:28 CST** 平滑切流；公网实际source `4e01a562ef73ef8c2e9607192aabef5e6528a163`、build `1795577919`、Web/Worker同image `sha256:f9158aabb191845fdaec5e2ff2010d1d30d81c7496e4110ddadf537d3862e0a0`。
- 新Web `fca8658ac672dfe6ac38d1a6c553835de20b99e3dfe1cd52d6e8d58095dc9577`；新Worker `85901337c02fd52371f5a46caa103ce885048867372b2deb0e1bf9d6bb513c60` 已完成实际tick、unresolved0、paused=false。
- 真实认证session、projects、canvas、admin、models、config、health/db及公开说明均200，目录响应与旧版相等；匿名管理/Agent工具访问仍拒绝。
- 303次跨切流公网GET全部200，0错；8181项静态联合资源及旧alias保留，不强刷画布。
- 原8类账务/任务/供应商不可变身份和执行绑定核验保持；模型v158与billing摘要不变，32项供应商/存储/identity/concurrency环境保持。无收费测试提交、旧任务重放或DB恢复。
- Desktop R2与cloud被动include逐字节保留，完整新Nginx SHA `4d09e121a39d508f847a9170c26a4eedd325cf5823b07b431fc2c88043acf777`。
- 新备份969882082字节，SHA `350c8f093117732c0af689195f7991ac2f6545bac8f6b2e5012c16ee33182300`，完整重开/list通过。
- 主session05:15:49.149Z退锁；真实systemd05:15:49–51及05:16:12–14 success/exit0，timer active/enabled。再次持锁postflight/CAS验证后退出，canonical **2914**，新pair五项readiness全true，规范manifest摘要重绑通过。
- **修复已接真实公网流量，onlineAcceptance=VERIFIED；整轮phase仍SWITCHED_CLEANUP_PENDING。** 原faf00ffb已受理v1 tick的UNKNOWN和旧7ae pair保留，未将它改为not_accepted或完成，未无证据退役旧槽。监督已绑定健康新pair，旧债务在current中显式retained，并已交回原owner按新baseline维护。
- 远端真实证据：`/opt/naumi-staging/evidence/release47-api-latency-20261125-r1/PUBLICATION_RECEIPT.json` 及 `postflight/SUPERVISOR_POSTFLIGHT.json`。本机回读在 `output/47-api-latency-20261125/publish/`。
- 早期空间预算、空文件投递和字段输出错误均保留原失败记录。首次投递竞争只执行空文件，无业务动作；发送器改为完整临时文件原子rename后执行。新import逐descriptor/layer/config/rootfs验证通过，没有跳过身份验证。
