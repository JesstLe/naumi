# Naumi：10万＋活跃用户产品级稳定性与效率总台账

更新：2026-11-07（r6 上线与容量基线）；2026-10-30（容量切片闭环与真实上线/验收状态更新）。总台账原审计基线：`53a6711effa68e05ba39ad2b415d672dcaf461f8`；2026-10-24图片恢复专项产品源码：`147b9f4ec895da6571241377c6b7f9d32880c5f7`，证据不扩展为全项目重新审计。

## 2026-11-17 企业报表锁竞争与重启恢复

[企业用量事故和修复记录](changes/2026-11-17-enterprise-usage-load.md)：生产慢日志和锁日志已确认报表事务在聚合时持有账户锁，账户请求最长排队 73 秒，应用连接池随后取连接超时。报表改用只读快照，返回前短事务复核权限与层级；原版本已通过一次受管恢复，空 DNS 表示导致的监督器误报另有源码修正。两处修复均有隔离测试，47 尚未发布本轮修复。后续应在真实高峰复核连接等待、报表 SQL 耗时、跨接口 503 和计划重启恢复，不能以单次当前健康代替容量验收。

[平台与企业后台负载复查](changes/2026-11-17-admin-load-audit.md)：创作历史、健康和成员快照移除统计期间的账户锁，待核查角标与列表降低连接并发，后台轮询按可见性及在途状态收敛。后续已将企业概览状态筛选改为单次轻量查询、企业选择改为批量只读、平台用户详情去掉账务写锁及现版操作后的全站快照。修复有隔离数据库和客户端回归，真实高峰指标待上线验收；47 未发布。

[私有素材、采购成本和历史翻页](changes/2026-11-17-admin-load-audit.md#继续排查私有素材采购成本和历史翻页)：移除了原图预览权限事务中的二次连接和存储读取，采购页分标签读取并隔离对账阻塞。合成历史的执行计划显示，移除总数仍扫描同样多的数据；下一步应先比较分来源索引和游标查询。隔离测试通过，47 未部署。

[后台连续排查清单](changes/2026-11-17-admin-continuous-sweep.md)：兼容团队读报表移除统计期间的账户锁，租户创建改为精确查负责人，执行追踪限制整体 Router 等待。持续复扫及完整验收仍在进行，47 未发布。

## 2026-11-10 Agent 创作平台规划入口

[Agent 全链路审计](changes/2026-11-10-agent-chain-audit.md) 的 16 项问题（P1 7 项、P2 9 项）已完成 [源码修复和本机隔离验收](changes/2026-11-10-agent-chain-fixes.md)：会话/流恢复、权限、未知结果、预算与产物回执。正向回归 16 项、工作台真实浏览器 51 项、真实 PG 历史 18 项和网关/CLI/MCP 18 项通过。未发布服务器；生产双槽、真实供应商和容量不由本机验收推算。

[Agent 创作平台 PRD](prd/2026-11-10-agent-creation-platform.md) 与 [分阶段执行台账](prd/2026-11-10-agent-creation-platform-execution.md) 承接全面 CLI/MCP 操作、图片、剧本分镜、自动剪辑和一键成片需求。当前仅规划基线，P1–P7业务实施与真实验收待推进；本台账继续负责容量、可靠性与上线证据，不由规划落库改变现有完成状态、47暂停发布决定或发布计数。

## 2026-11-07 架构评估与执行决定

[10 万用户架构评估](changes/2026-11-07-architecture-assessment.md)：

- 结论：现有架构方向（模块化单体 + 独立 Worker + Postgres）不需要推倒重来。要改的是部署形态：Web 可以多开、数据库独立、媒体走对象存储，并让发版流程支持多实例。
- **用户决定：先做不改架构的优化，架构调整（A1–A6）暂缓，按规模触发。**
- 2026-11-07 r6 已上线 47（`7f08bad0`）：浏览器存储治理、轮询与积分刷新、压缩与热点索引、工作台记录瘦身（847 MB → 12.7 MB）、画布小图变体、访问耗时与慢 SQL 日志。待处理图片任务扫描 2,333 ms → 0.64 ms。详见 [第三批与上线记录](changes/2026-11-07-optimize-batch3.md)。
- 容量基线（本地隔离压测，非生产实测）：单 Web（1.5 CPU）生产比例混合约 640–670 req/s、p99<500 ms，瓶颈为 Node 单线程；扩容靠多实例（A1）。
- 未上线：企业页回源校验中间件修复 `0f002de5`。待办：账户余额读接口带写库、工作日全天复测、`pg_stat_statements`（需重启 DB）。

## 2026-10-30 容量审计增量入口

当前执行台账为 [47站容量与稳定性隐患台账](changes/2026-10-29-capacity-audit.md)，先读顶部最新索引，再读历史增量。本轮从含A60的main基线 `5072324c` 接续并整合运行配置/生命周期父修；47上次实核业务镜像为 `b79c8c39 / 1793281629`，本轮未连接或发布，源码与线上不混写。

- 本轮A15共享滑窗及有界回收、A53–A55跨账号迟到续体、A60持久图片任务关键清理窄切片已源码闭环、集中验证并串行整合，尚未再次发布。A60父补验含实际creation历史输出回读、旧副证据乱序、模块副本限频，真实PG32项及完整tsc通过；原生creation-writers的继承scope409单列，见[模块增量](changes/2026-10-30-capacity-critical-cleanup.md#7-2026-10-30-父复核与补齐)。
- 上轮存储验收失败已证实为低空间合法remote-first的probe误判。修正后47真实上传、NAS/HTTP/Range/下载及精确清理通过，没有改变产品存储策略。
- A62闭包重复扫描已修且真实只读采集不再卡该超时点；但33815条选中集合仍超原预算，保持incomplete，不冒称完整保留性通过。
- 运行配置独立review的stop/cancel两个P2及继承视频池close代际问题已父修并集中验收：配置21、controls4、父生命周期11、真实PG协调9组、完整tsc通过。默认并发/媒体防线保持，详见[运行模块父增量](changes/2026-10-29-capacity-runtime-settings.md#2026-10-30-父复核闭环停止栅栏取消调用链与视频池代际)。
- 旧Web两条协调扫描UNKNOWN、外置tick公平/跨入口单飞、Linux媒体sandbox、BI保留、吞错分级其余链路、其他既有开放项和生产容量继续挂账。parent-completion原/改仍同为loader缺项25未验收。固定stage诊断不等于全站可观测/告警I24完成。四产物、原/改/副本回滚及清理证据见对应模块文档与台账。
- 以下2026-10-23/24原80项保留历史时间和范围，不由局部通过推算10万用户容量达标或整项完成。

## 1. 产品目标与本轮结论

用户明确：本项目是面向 **10万＋活跃用户** 的产品级应用；反复的出图失败、状态混乱和不稳定直接损害工作效率。后续优先交付可稳定完成的业务闭环，而不是继续堆入口或把单次接口/脚本通过当产品达标。

### 最新执行收敛：先减法，先恢复正常创作

用户进一步明确：当前最急的是定价系统要求核对积分等误拦、无明确原因的直接失败，以及既有过度设计影响使用。**本台账不是新增80道护栏的实施清单，也不把所有待验证目标叠成正常创作的上线前置。** 暂停将新增业务限额、二次确认、运营审核等建议自动转为产品要求；后续按真实运营情况，由用户明确要求再加。

当前工作只收敛到：①已有去误拦修复的源码/实际发布状态；②重复积分确认与current版本误拦的最小删减；③无原因失败的阶段定位及原结果续交；④复用benchmark证明同一正常请求旧版被误拦、新版正常交付。正常路径应为“明确价格→点击提交→系统处理→拿到结果”，内部报价/成本核对不交给用户反复操作。

**同日实施更新：**图片/通用客户端、Agent、原生工作台及视频/媒体等入口的重复价格确认已本地删减；复用原benchmark新增pricing-friction suite，baseline/modified 8/8符合，真实余额12/价格12由误拦转受理、余额11明确不足、单operation单账本。完整记录见[定价减阻实施](changes/2026-10-23-pricing-friction-reduction.md)。这只是本地代码/隔离验证进展，不关闭全台账、不宣称线上生效；历史catalog仍PARTIAL、47 HOLD。

余额不足、资源归属、防重复扣款和未知受理不重放属于基础业务事实；它们由后台正确处理，不扩成臆测风险的用户侧审批。真正供应商拒绝、存储失败、账务待核对分别呈现和处理，不统一归为“请核对积分”。47原暂缓发布决定不因本段改变。

**2026-10-24 已成图后失败专项更新（F，程序未部署）：**本地固定 `147b9f4ec895da6571241377c6b7f9d32880c5f7` 修复 G01 的 root/indexed 身份错配，并在 root 内持久化逐图检查点，避免恢复时重新生成已完成图片；合法 preset 原 task 与无 channelGuard 的只读 POST 边界已补齐。定向真实模块/AST fixture 11组142检查、隔离真实PG 18检查、原适配器53检查通过，第二轮指定文件窄审原2项P2关闭。G02 只覆盖本轮逐图 checkpoint 与精确 accepted task 续读，不据此关闭所有进程中断窗口；G04 等既有条目保持各自边界。

本轮另将 **2026-10-24 11:31 / 11:32 两单**沿原 task 真实补交，生成 POST=0；两图/父子回执/四条创作台账成功，原任务各仅一次结算8/12积分且预占为0。这不是§4里2026-10-23历史样本的状态改写，也不是新程序已上线。47继续执行最新暂缓发布决定。原始首次异常尚未取得根因证据，不归因为正则栈溢出。详细实现、执行回执与未完成项见[专项记录](changes/2026-10-24-image-postaccept-recovery.md)。

本文件是**优化行动台账和拟定验收标准，不是所有问题已修复、线上SLO已达标或容量已通过的报告**。2026-10-23 初版仅只读审阅代码和已有证据并整理文档；2026-10-24 的专项实现、隔离验证、构建及两单真实补交按上段与专项记录分别列明，不沿用初版未执行声明。47继续维持配置、合并后暂缓发布。

当前有不少正确的机制：持久作业、租约/heartbeat、幂等收费、冻结配置、通道健康、缓存、用户/租户边界和蓝绿状态门禁。优化应补全、压测和贯通这些机制，不把它们抹掉重写，也不把“尚未证明”写成“确定没有”。

本轮完整清单：**80项**，按4组归档，并合成为§9的10个工作包。先处理§5的具体源码缺口；完整证据和验收见§8，汇总见§10。

### 证据与优先级

- **C**：当前源码可确认的缺口/限制；不自动代表线上已发生同一事故。
- **E**：机制已存在，需要产品化贯通、规模/故障验证或运维落地。
- **H**：历史快照/旧镜像测量；本轮未实时刷新，不推算当前故障率。
- **F**：已有本地修复/验证，尚缺对应线上发布验收。
- **R**：产品级目标，当前没有充分验收证据；需建立基线后确认实现差距。
- **P0**：优先止损或与当次放量直接相关的核对项；**P1**：按实际瓶颈与用户影响排期；**P2**：持续效率与成本优化。这里是台账排序，不是声称每项都是代码漏洞、全局发布前置或已批准新增护栏。具体新增业务限制遵循本节最新执行收敛。
- 每项关闭需绑定：负责人、固定源码/镜像/模型及计费版本、环境、命令/输入、指标分母、原始证据、回退结果。代码完成、推送、配置发布、应用部署、真实验收分开记。

## 2. 先把“10万活跃”转换成可测试负载

活跃口径尚未指定MAU/DAU。本轮先保留参数，不擅自把10万活跃等同于10万同时在线或10万生成并发。

必须采集：活跃口径、峰值在线、每活跃用户每日生成次数、每任务图片数、上传/图片像素分布、编辑/批次/视频比例、API操作频率、供应商耗时分布、峰值系数、地域/网络及任务时限。

```text
日任务数 = DAU × 每用户日任务数
平均到达率 λ = 日任务数 / 86400
峰值到达率 = λ × 实测峰值系数
平均在途 L ≈ 实际有效吞吐 λ × 平均在途时间 W（稳定观测窗口的Little定律）
队列变化率 = 到达率 - 有效完成率；供应商容量不足时，不存在靠本机无限加并发消除积压的方案
状态查询RPS ≈ 活跃观察端数量 / 查询间隔；多标签页、父子任务与重试放大会改变该值
```

**仅用于测试场景的假设，不是业务预测或容量承诺：**若未来是10万DAU、每天2/5/10个任务，分别是20/50/100万任务/日，平均2.31/5.79/11.57任务/秒；若峰值系数5，则11.57/28.94/57.87任务/秒。若持续吞吐与到达率平衡、平均在途60秒，则约694/1736/3472个在途任务。一个任务多图、供应商调用、重试、媒体处理必须另分维度计算。

例如3000个任务每3秒各查一次，单状态查询就约1000 RPS；不包含页面、鉴权、图片和多端重复请求。排队任务应轻量持久化，不能把所有在途任务的原图都驻留Web内存。

4096×4096 RGBA解码后的单张像素缓冲约64MiB，远大于压缩PNG字节；并发预算需要区分压缩体、base64、解码、拷贝、后处理和上传缓冲。不得用一次总内存峰值除以任务数线性外推单任务成本。

## 3. 拟定首轮SLO与硬不变量（待基线校准，不是已达成）

| 指标 | 建议验收目标 | 分母/说明 |
|---|---|---|
| 登录、草稿、提交/查询等控制面可用性 | 初期月度≥99.9%，成熟阶段目标≥99.95% | 滚动30天真实有效请求；维护/依赖故障仍需在用户体验指标中记录 |
| 平台可控交付成功率 | ≥99.5% | 输入有效、已受理且供应商返回有效完整结果的任务；平台未交付计失败 |
| 端到端生成成功率 | 按入口/型号/供应商单列，确定基线后设目标；建议主推通道≥99% | 全部有效已受理逻辑请求；不得排除供应商失败来美化用户视角成功率 |
| 受理确认延迟 | p95≤1秒、p99≤2秒 | 明确持久化已接受ID；不含上传和生成耗时；重计算应异步化 |
| 可交付结果发布延迟 | 供应商有效结果到用户可读取p95≤5秒、p99≤15秒 | 基础生图规格；重后处理/视频单独预算，原图优先不等于最终处理已完成 |
| 队列与长任务 | 每任务有创建/排队/受理/最后活动时间、可解释阶段与超时归属 | 不报假进度，不把unknown当成功/免单；持续监测最老任务和饥饿 |
| 核心Web性能 | RUM p75 LCP≤2.5秒、INP≤200ms、CLS≤0.1 | 设备、网络、页面和地域分层；页面空壳不替代真实画布可用 |
| 数据与账务 | 重复扣款/跨用户资源暴露/已确认草稿丢失=0 | 设计硬不变量，有限样本通过不是全量数学证明 |
| 原供应结果续交 | 同operation重复恢复新增供应POST=0，新增结算/作品符合幂等合同 | 单靠租约到期或客户端超时不重提 |
| 受控过载 | 2倍目标峰值30分钟仍保住登录/草稿/状态查询；排队/拒绝有界且可观测 | 先隔离模拟再小流量；不把高429率包装成健康 |
| 长稳与故障恢复 | 目标负载24小时＋混合媒体；按阶段注入重启/断网/依赖故障 | 记录OOM、队列坡度、内存平台、恢复时间、账本/作品一致性 |
| 备份恢复 | 拟定RPO≤5分钟、RTO≤60分钟，演练后再承诺 | 覆盖数据库、媒体索引、配置/凭据可用性；不以备份文件存在代替可恢复 |

建议首轮预算：30天99.9%约43分12秒不可用预算；99.95%约21分36秒。预算消耗超阈值暂停非必要功能发布，优先恢复稳定性。业务故障率、依赖故障率和用户投诉同时看，不能只看服务器5xx。

## 4. 已知历史事实及不可越过的结论边界

- 历史固定24个逻辑失败请求是22笔供应商额度拒绝＋2笔供应商完成但本地未交付，不将父子记录相加为48次。22笔外部额度/免单契约仍OPEN；两笔原字节已取回并通过隔离本地续交，未据此宣称原员工线上已恢复。完整员工原始请求精确重放仍0。见 `docs/changes/2026-10-23-imagegen-history-goal.md:14-26` 及供应商额度文档。
- 旧9f镜像16任务测得Web峰值3,198,701,568B，距3GiB仅21.48MiB；这是旧固定镜像、本地fixture、单波测量，不是53a最终候选或47容量结论。warm-wave、混合媒体、双槽与长期稳态尚未证明。见 `docs/changes/2026-10-23-fixed-image-local-pressure.md:5-11,49-52`。
- 视频32型号参数与协议修复已合main，当前源包含明确升级规划器；线上不可变配置不会因Git变化自动扩大。旧SaaS视频集成脚本在基线和修后同一token hash断言失败保留，不能宣称全suite绿。见 `docs/changes/2026-10-23-video-node-capabilities.md`。
- 当前代码有PostgreSQL lane/lease/heartbeat、幂等、通道health、发布活动归属等实现；旧发布文档“尚未实现”的段落必须结合当前源码重核，不直接当现状。线上实际加载版本/启用状态本轮未核验。

## 5. 首批推进顺序

当前先处理正常创作的重复定价/积分确认、版本误拦和无原因失败；下列全面治理顺序为后续依赖参考，不自动扩大本次范围。已有去误拦修复先核实实际加载版本，避免在未部署问题上重复改同一份源码。

**本轮优先复核的具体源码缺口（C，不代表已线上复现）：**

| 条目 | 明确触发条件 / 现行边界 | 最小关闭方向 |
|---|---|---|
| G01（F，已修未部署） | 原缺陷为外层paid operation恢复查裸ID、逐图pin使用`:image:index`；147b9f4e已本地修复并验证 | 已保存并校验精确父子/逐图任务关联，仅查询原task；保留实际部署及线上恢复验收待办，不重复实现。 |
| G02 | 原结果进入内存后、paid done/result持久化前中断 | 结果接受点持久化原对象及摘要，能仅续本地交付。 |
| G04 | 恢复时finishStoredImage抛错，只加warning而complete未降级 | 原图保留但明确partial，完成原处理合同后才完整成功。 |
| G09 | 结算处于hold/manual而调用正常返回，上层即记confirmed | 传播真实settled/hold状态，回执与账本及预占一致。 |
| U01 | 初始账号/作品或项目读取失败，catch返回空结构 | 区分空数据、读取失败和旧缓存，保留编辑并可恢复读取。 |
| U04 | 图片/文字多tab旧请求后到，只有串行锁但没有expectedRevision | 为高价值写补版本冲突语义，409保留本地内容。 |
| G07/U10 | 已受理未知/待核查的提示被改写为“请重试” | 标签对应检查原任务/续交/新购买，保留底层防重提。 |
| U17 | 某些API直接返回异常message，画布错误边界显示stack | 复用公开错误白名单与诊断编号，详细证据留受控内部。 |
| U23 | 关键恢复/租户脚本未进required suite，PR路径未覆盖全部库变更 | 同SHA、模块化CI与触发样例绑定，不以测试库存代替门禁。 |


1. **先止损与看清现场**：固定真实运行版本/配置；建立端到端成功率、队列年龄、unknown、预占年龄和内存指标；每个用户反馈能定位到一条逻辑任务。
2. **先把已接受的任务交付可靠**：原结果持久化→本地续交→作品/父回执/账务；优先恢复已有原图，未知收费状态不盲目重POST。
3. **把供应商故障与平台故障拆开治理**：健康/额度/429/延迟/有效出图统计，故障新请求避让与已接受pin保留，能力/价格/参数契约一致。
4. **把用户草稿、等待和失败体验兜住**：刷新/断网/多页恢复，不重收费；部分成功可用；错误告诉用户下一步而不让用户猜。
5. **再做容量扩展**：固定最终制品测阶梯/突发/长稳/混合媒体和DB/存储/供应商容量；按瓶颈扩容，发布双槽资源不足继续HOLD。
6. **每个模块整体集中验收再整合**：历史反例、真实入口、必要PG/GUI、故障恢复与副本回退；不每一小改重跑全suite，不靠放宽断言绿灯。

## 6. 工作原则与实施前置

- 先建立一致、少部署单元的现有Web＋Worker链路，不为修复再堆永久按路径Web。需要横向复制时先通过会话归属、幂等、租约、存储共享及连接预算；是否增加副本是独立容量决策，不违反当前发布约定抢先叠实例。
- 不先堆Kubernetes、Kafka、分库分表、新工作流DSL或“统一大平台”。可先在现有PostgreSQL队列、明确职责、索引/连接/媒体隔离和指标上解决问题；只有测量证明瓶颈才引入新基础设施。
- 降级要保护用户意图和报价：不能悄悄降画质/换不兼容模型/丢参考图；重后处理失败可保留原图但状态、收费与最终效果必须明确。
- 端到端使用operation/parent/child/supplier task关联；指标不要把用户ID、任务ID、signed URL当高基数标签，原始材料进入受控证据包。
- 实施前复核来源SHA、现行配置、运行图与负责人；文档里P0/P1不等于授权立即改所有代码或生产。47HOLD和所有数据、媒体、收费边界继续保留。

## 7. 可复用整改任务模板

```text
按 PRODUCT_READINESS_100K.md 实施条目 <ID>：
先核对当前源码/运行版本和证据，报告确定缺口与已有机制。
只修改本条目的明确模块，保留用户草稿、归属、冻结配置、幂等和未知收费防重放。
先补能区分旧错/新对的历史反例；模块完成后集中做真实入口/必要PG/GUI/故障恢复验证。
报告用户可见结果、指标分母、原始日志、固定SHA/镜像、回退验证与未完成项。
不得把fixture、上游成功、提交推送或构建当线上验收；47维持HOLD。
```

## 8. 分模块行动台账

以下模块清单由本轮三路只读审阅汇总；状态与验收目标属于台账，不代表已经执行整改。角色负责人在排期时绑定到具体人，避免无主任务。

### 8.1 产品验收与故障治理（负责人角色：产品负责人＋稳定性负责人）

| ID | 顺序/现状 | 要优化什么、用户影响与关闭标准 | 证据/依赖 |
|---|---|---|---|
| S01 | P0 · R | **负载口径和容量账本**：把活跃、在线、API、任务、图片数和供应商并发分别建模。关闭：取得至少7天分时基线/代表性流量，三档负载配置可复跑；预测与复测偏差解释清楚，不按总用户数拍机器配置。 | 本文§2；历史压力记录只覆盖旧9f单波，不代表当前规模。 |
| S02 | P0 · E/R | **以用户拿到可用结果计成功**：全入口记录已受理、供应商有效输出、存储/作品/父回执/结算/用户可读取。关闭：能按logical operation计算完整漏斗，平台故障和外部故障同时可见，计数守恒、父子不双计。 | `src/lib/imagegen/stored-delivery.ts:48-126`；`docs/changes/2026-10-23-imagegen-history-goal.md:14-26`。 |
| S03 | P0 · E/R | **贯穿请求/任务/账务的可定位编号**：用户“这次失败”能直接定位operation→parent/child→supplier task→artifact→billing。关闭：模拟各失败阶段100%可关联，值班人员5分钟内定位阶段；日志脱敏、指标标签不含高基数任务/用户ID。 | 既有supplier request_id/审计：`src/lib/supplier-cost/repository.ts:26-36,66`、`src/lib/model-config/channel-fetch.ts:49-85`；统一端到端trace验收待补。 |
| S04 | P0 · E/R | **SLO、业务告警与错误预算**：监控失败交付、unknown、预占年龄、队列坡度、供应商health，而非只有CPU/5xx。关闭：按§3定义分母和分位，注入故障能告警、归责、抑制重复通知；供应商异常不得伪装成输入错误。 | `src/app/api/health/route.ts:12-27`只有连接/配置摘要，不能代替业务交付SLO；已有model-health应复用。 |
| S05 | P0 · R | **反馈→故障单→修复→反例回归**：统一用户报告入口和故障负责人，不让用户反复提供同一材料。关闭：故障单含影响范围/阶段/处置/版本/用户通知，P0有人接手且有恢复时限，复发能关联原问题。 | 当前历史取证/benchmark脚本是起点，尚无本轮完整支持运营验收；依赖S03。 |
| S06 | P0 · H/E | **历史失败转固定benchmark**：原参数、媒体hash、原版本、账务和供应商证据分级保留。关闭：baseline能复现、modified能区分，原请求精确回放与机制fixture分别计数；无原材料保留OPEN，不删失败用例凑通过。 | `docs/changes/2026-10-23-imagegen-history-goal.md:14-26`；`scripts/capture-imagegen-benchmark-case.cjs`、历史runner。 |
| S07 | P1 · E/R | **验收矩阵覆盖全部产品入口**：28工具、画布、Agent、套图/A+、工作台、视频及恢复走同一已冻结合同。关闭：每入口正常/参数拒绝/受理后断网/供应商故障/存储失败/结算重试均有对应真实入口检查。 | `README.md:23-52`产品入口；`src/lib/imagegen/generation-core.ts:21-38`仍适配真实generate-image入口；不重写成新框架。 |
| S08 | P1 · E/R | **分层集中测试与有效CI门禁**：快速类型/纯函数、模块PG、少量真实GUI、定时长稳；凭本轮需求选择层次，不每行全量回归。关闭：关键历史反例自动阻断，fixture漂移独立归因，红灯未处置不称全绿；付费探针有预算。 | `.github/workflows/image-gateway.yml:91-130`已有build/billing/生命周期fixture；视频旧token hash失败见本轮视频文档。 |
| S09 | P0 · F/E | **“已合并”到“用户实际使用”闭环**：固定源码/Image/构建/模型与计费版本，核对公网及内部执行图，依旧蓝绿/排空，不按路径长期分裂版本。关闭：真实受影响功能＋回退证据、旧槽排空停止及资源余量齐全才记发布完成。 | `AGENTS.md`发布约定；`src/lib/release-runtime/http.ts:46-119`与`store.ts:84-199`已有运行门禁/活动登记，线上启用状态未复测。 |
| S10 | P1 · E/R | **主推功能/型号发布质量分级**：声明支持、codec接通、真实出片、线上可用四级分开；未接参数不出现在可用菜单。关闭：每个可见组合有来源和协议校验，主推组合有受控真实验收，旧任务不随新目录漂移。 | `docs/changes/2026-10-23-video-node-capabilities.md`；`src/lib/model-config/video-family-capability-upgrade.ts:60-120`。 |
| S11 | P1 · E/R | **单次可用交付成本与资源预算**：平台收入/客户积分/供应商成本/CPU内存/带宽存储分开，失败重试成本可见。关闭：按型号规格有p50/p95成本及资源观测，异常波动告警；unknown采购成本不按0计算。 | `src/lib/supplier-cost/repository.ts:10-36,66`；`src/lib/model-config/provider-balance.ts:5-40`余额单位尚未知，不混算客户积分。 |
| S12 | P2 · R | **量化用户效率收益**：追踪从打开创作到拿到可用素材的总耗时、重试率、手工重传率、人工支持率和每成功任务点击数。关闭：优化前后同口径对照，不拿后端平均耗时或脚本数替代用户节省时间。 | 依赖S02/S03及前端RUM；本轮尚无真实用户效率基线。 |

### 8.2 生成交付、恢复与账务（负责人角色：生成链路＋账务负责人）

#### G01 · P0 · [C][H] 统一外层任务与逐图恢复身份
- **用户影响/证据：** 已接单的任务可能找不到原可查询通道而停在核查。`src/lib/durable-image-jobs.ts:149-160,187-189` 用外层 operation ID 找恢复身份；`src/lib/image-gateway.ts:140-144` 逐图追加 `:image:index`；`src/lib/model-config/channel-availability.ts:45-62,72-77` 按精确 operation/billing_unit 查 pin。历史两笔明确为外层 started、逐图 pin 存在，见 `docs/changes/2026-10-23-imagegen-history-goal.md:22-26`。这是合同层级差异，不宣称已证明原事故唯一根因。
- **动作/验收：** 显式保存外层→逐图 operation/pin/task/account 关联，只有全部精确匹配才能进入原任务 GET；缺失/歧义继续核查。覆盖 1–4 图、混合已完成/unknown、旧 pin、配置变化及重启；重复恢复 10 次新增供应商生成 POST=0、跨图错绑=0。**依赖：** 原冻结执行版本、供应商任务身份证据。

#### G02 · P0 · [C][H] 缩短“上游已完成、原图尚未持久”窗口
- **用户影响/证据：** 上游已出图仍可能没有可自动交付的本地结果。`src/lib/model-config/apimart-preset.ts:139-167` 解码后先写 acceptedOutputs，再返回内存 base64；`src/lib/durable-image-jobs.ts:174-175` 返回后才写 paid done/result；`src/lib/imagegen/delivery-checkpoint.ts:3-8` 不接受 started。历史两笔原图后来取回，但本地 verifier 仍须显式证据导入，见 `docs/changes/2026-10-23-imagegen-history-goal.md:24-26`。
- **动作/验收：** 在原结果接受点保存不可变对象、SHA、原 task/account/逐图身份及交付 checkpoint；补受控的原任务 GET/证据导入续交，不把 started 直接改 done。对下载后、checkpoint 前后、返回前后逐点中断；每个已确认原输出最终可回读且原 SHA 一致、只结算一次、新生成 POST=0。**依赖：** G01、存储可用性、证据导入审计。

#### G03 · P0 · [E][R] 成功指标以最终图交付为准，不以上游 200/completed 为准
- **用户影响/证据：** 用户感知失败会被供应商成功率掩盖。现有 `src/lib/model-config/channel-fetch.ts:61-65` 已校验通道图像响应；`src/lib/imagegen/dispatch.ts:34-38,119-122` 已回读/解码作品；`src/app/api/generate-image/route.ts:836-938` 已执行存储、作品、结算、最终回执。不能写成“没有最终图校验”，但上述分层尚不等于浏览器最终可用。
- **动作/验收：** 用同一 operation 串联受理→原结果→后处理→对象回读→作品→父回执→客户端显示/下载；分别统计供应商完成率、产品最终交付率与交付耗时。100 个受控成功 operation 均有可解码最终对象和所属作品；上游 200 空图/损坏图、存储故障、父回执故障均不能计产品完整交付。**依赖：** G02、G09、前端/媒体验收协作。

#### G04 · P0 · [C][E] 恢复后处理失败必须降为未完整交付
- **用户影响/证据：** 恢复出原图但未达原尺寸/处理合同，可能被报为完整成功。`src/lib/imagegen/stored-delivery.ts:72,82-83,117-119` 初始 complete 可为 true，finishStoredImage 异常只加 warning，未将 complete 置 false。正常路径 `src/app/api/generate-image/route.ts:810-818` 用持久后处理，恢复路径 `src/lib/imagegen/finish-stored-image.ts:11-20` 使用另一套本地处理入口。
- **动作/验收：** 最小修正失败 complete 标记，逐步复用相同冻结处理/结果校验，不另造工作流框架。注入尺寸变换/后处理失败后保留原图但 complete=false、状态 partial/待处理；补处理后符合合同才 complete=true；两次恢复同 artwork/账本且新生成 POST=0。**依赖：** G03、原后处理版本可读。

#### G05 · P1 · [C][E] 明确多步骤/蒙版/抠图/格式转换的恢复边界
- **用户影响/证据：** 简单生图能恢复不代表复杂编辑链完整恢复。`src/lib/imagegen/stored-delivery.ts:19-25,30-42` 限单 child；`src/lib/imagegen/receipt-policy.ts:4-8` 明确排除多步骤、chroma、mask、非 PNG 等；`src/lib/imagegen/dispatch.ts:101-117` 正常链还包含蒙版合成/输出转换。这里是现有明确边界，不是完全没有恢复机制。
- **动作/验收：** 对每个本地阶段持久记录输入/输出和稳定派生 ID；只续做可证明未完成的本地工作，unknown 供应商步骤仍停。至少覆盖单图、4 图、蒙版、生成后抠图、WebP、透明处理 6 类；原图保留率100%，未完成步骤不报完整成功，重复恢复新生成 POST=0。**依赖：** G01、G02、G04。

#### G06 · P1 · [C][E] 恢复扫描增加公平游标和耗尽可见性
- **用户影响/证据：** 某些旧失败可能长期排不到恢复。`src/lib/imagegen/stored-delivery.ts:135-152` 只扫7天、最新16父项、尝试<5，之后才过滤单child/child deliveryAttempts≥3，成功2项即停；跳过项不推进持久游标。可确定筛选边界，是否形成生产饥饿尚未测量。
- **动作/验收：** 将可判定资格尽量前推，采用稳定分页/next_attempt_at，过期/耗尽进入可检索的人工队列，保留现有上限而非无限重试。构造前16项均不合格、后100项可恢复的积压，后者均能在确定扫描轮次内被访问；同一失败不霸占扫描，新生成 POST=0。**依赖：** G05、恢复队列观测。

#### G07 · P0 · [C][E] 用户状态区分未受理、受理未知、已出图待交付
- **用户影响/证据：** 用户看到“请重试”可能另开付费操作。`src/lib/imagegen/dispatch.ts:75-85,132-135` 将 SUBMISSION_UNKNOWN/内部 review 呈现为 failed，部分文案为重试；`src/lib/imagegen/http.ts:15-20` 非 JSON 也提示重试。但客户端已有 unknown 回执防重提，不能据文案推断系统已自动重复 POST。
- **动作/验收：** 保留现终止合同兼容，增加稳定 reason/acceptance/supplierOutcome/deliveryState 与“查原任务/恢复原图/人工核查”动作，只有明确未受理才允许重新提交。对超时、网关 HTML、unknown、known completed、NOT_ACCEPTED 各验证一次；100%可凭 operation 定位阶段，unknown 页面无“新建重试”默认动作，原始 secret/prompt/URL 不进诊断。**依赖：** G01、G03、G12。

#### G08 · P0 · [E][F][R] 所有生成入口守同一冻结合同
- **用户影响/证据：** 同样操作在画布、旧页、工具和 Worker 走不同合同会随机失败。现有 `src/lib/imagegen/generation-core.ts:21-38` 直接 import 旧 POST 并传冻结 quote；`src/lib/agent/naumi-tools.ts:1279-1288` 接共享执行器但保留 `_category` legacy 分支；`src/lib/durable-image-jobs.ts:225-230,260-273` 有冻结恢复与 INTERNAL_APP_ORIGIN。报价/入口机制已实现，见 `docs/changes/2026-10-23-imagegen-simplify-release.md:25-28,40-52`，未部署验收不等于机制缺失。
- **动作/验收：** 维护入口→计划→受理→逐图执行→恢复→账务的最小合同矩阵，核对旧适配器/内部 import/Worker，不靠仅改公网路由收口。画布、旧页、生成/编辑工具、Agent、batch、Worker同请求均保持 owner/scope、数量、显式比例、requested/effective 档位和原价；current变化/重复原op不制造二次拒绝或新账本。**依赖：** G09、G12、最终部署版本绑定。

#### G09 · P0 · [C][E] 真实账务状态不能被“已调用结算”替代
- **用户影响/证据：** 已出图但采购成本未核定时，回执可能把账务说成已确认。`src/lib/image-job-repository.ts:110-127` 在 unknown/manual/hold 返回但不置 billing_settled；`src/app/api/generate-image/route.ts:907-908` 调用后直接 billingSettled=true；`src/lib/imagegen/dispatch.ts:40-41,121-122` 只汇总 charged_credits 就报 billingStatus=confirmed。可确定“调用返回”与“实际清算确认”不是同一条件。
- **动作/验收：** 结算函数返回实际状态；父回执联合读取 operation state、billing_settled 与预占，交付成功和账务待核对分别表达，不为了待账务隐藏已得图片。覆盖 api-cost pending/hold/manual/released/settled，回执100%与账本一致；0扣费不冒充免单或已清算。**依赖：** G03、G10、供应成本回执。

#### G10 · P0 · [E][R] 对预占/清算/退款做跨恢复一致性验收
- **用户影响/证据：** 重复扣费、冻结余额不释放或吞掉他人预占会直接损害信任。已有 `src/lib/image-job-repository.ts:18-39,98-130,210-243` 的事务预占、租约/结算锁、未交付释放和供应费用pending；已有 `src/lib/billing/service.ts:80-120,129-153` 的核对幂等、拒绝unknown强结算、成本修订返还。不应重写成“无账务幂等/无退款”。
- **动作/验收：** 形成同operation的 job/reservation/billing/ledger/supplier 五方不变量查询和待核对账龄处理；对新旧任务、部分成功、余额到期、并发恢复、退款重放做集中专项。每场景重复/并发20次净扣费只一次，预占差额归零或具名hold；他任务预占不变；客户释放与供应成本unknown始终分别保留。**依赖：** G01、G09、原冻结报价。

#### G11 · P0 · [E][H][F] 22 笔额度失败与新请求避让分别闭环
- **用户影响/证据：** 供应商额度耗尽会连续阻断员工。现有 `src/lib/model-config/channel-fetch.ts:67-83` 只允许明确 not_charged 后换通道；`src/lib/model-config/channel-health-policy.ts:11-17` 已有401/403一次触发5分钟冷却。`docs/benchmarks/imagegen-history-20261023.json:133-140` 明确历史22笔仍OPEN；`docs/changes/2026-10-23-image-rejection-diagnostics.md:11-20` 是健康恰好记一次/后续新请求避让的已修增量，不是允许旧请求重投。
- **动作/验收：** 运营核实可用额度/凭据，逐供应商建立可核验的未收费/原task查询合同，按原记录处理22笔；发布后验证健康写入与后续全新op避让。无免单证明原op仍A1/B0、pin不清；明确not_charged对照才A1/B1；后续独立op冷却避让A。22条逐条有处置证据才关闭，不用新请求成功代替旧案闭环。**依赖：** 外部额度与免单合同、G01/G10、部署授权。

#### G12 · P1 · [E][R] 刷新/断网/切空间的原回执恢复验收
- **用户影响/证据：** 断线后找不到图、误新建操作。`src/lib/imagegen/client-recovery.ts:11-38,59-68` 已持久化作用域回执；`src/lib/imagegen/canvas-client.ts:43-52,96-107` 已receipt-first，404/unknown不授权新POST；不是“没做断线恢复”。
- **动作/验收：** 将这些机制纳入真实浏览器多标签/刷新/离线/登录过期/空间切换验收，提供原op检索入口而非让员工记编号。每类连续10次，受理后同op新增供应商POST=0、账本增量=0；跨owner/workspace/project错误附图=0，原回执不因404/HTML响应丢失。**依赖：** G07、G08、浏览器专项。

#### G13 · P1 · [E][R] 批量取消/部分成功/重试的竞争验收
- **用户影响/证据：** 批量失败容易丢已出图片或误重跑收费项。已有 `src/lib/imagegen/batch.ts:85-99,103-125` 的行锁/用户并发、仅NOT_ACCEPTED且0扣费0图才重试、fail-fast和partial汇总；不是“批量完全无幂等”。
- **动作/验收：** 集中覆盖100项批次、取消与受理并发、Worker失联、部分成功、后处理失败、unknown和重复tick。每个真正受理项至多一个生成尝试；unknown自动重试=0；取消后不再受理queued项；已成功作品/账本不丢，批次费用等于子账本和。**依赖：** G07–G10、调度资源预算。

#### G14 · P1 · [C][E] Agent 未完成时返回结构化原任务回执
- **用户影响/证据：** 工具等待超时/部分失败后，Agent可能只得到异常文字，员工难以继续跟踪。`src/lib/imagegen/agent-executor.ts:13-24` 已用原计划op、查询/取消保护，但未成功分支抛 Error（含op），结构化 details 主要在成功返回；`src/lib/agent/harness.ts:142-154` 已有预算和重放拦截，不能写成“Agent无防重放”。
- **动作/验收：** pending/unknown/partial也返回受限结构化 operationId/jobId、acceptance、artifacts、billingStatus、下一可执行查询动作，并持久关联 toolCallId→原op；重连先查原任务，不重新计划购买。覆盖中止、540秒等待上限、进程重启、同toolcall重现；原op可找回率100%、unknown新POST=0，部分成果不因Error丢失。**依赖：** G07、G08、G12、Agent持久会话。

#### G15 · P1 · [E][R] 编辑结果按真实像素合同验收
- **用户影响/证据：** 能出图但错画幅、蒙版外改变或无透明主体仍损耗效率。已有 `src/lib/imagegen/plan.ts:42-45,124-135` 的编辑/抠图计划约束，`src/lib/imagegen/dispatch.ts:101-120` 的蒙版外合成和透明检查；`src/app/api/generate-image/route.ts:823-839` 将合理比例差作为warning并禁止为追比例重POST。
- **动作/验收：** 建立比例/透明/蒙版/EXIF/格式及原图保留矩阵，不把模型能力宣传等同实际效果。至少20个固定像素样本：未选区差异0（按合同允许的透明处理另列）、完全空/全透明主体拒绝、原图可回读、尺寸/格式符合冻结合同；合理取整只warning、没有第二次收费生成。**依赖：** G03–G05、真实像素样本。

#### G16 · P1 · [C][E][H][R] 大图检查点与执行热路径按实际内存成本优化
- **用户影响/证据：** 大图并发可能导致OOM并把已付费结果留在unknown。`src/lib/durable-image-jobs.ts:27-40,174-175` 只对Buffer做对象化，结果中的data URL字符串仍可能进入snapshot；`src/lib/model-config/apimart-preset.ts:158-167` 返回base64；`src/lib/image-job-repository.ts:63-68,187-196` 已有全局DB lane，不是毫无限制。历史初始镜像16job峰仅剩3GiB限额约0.70%，且不是最终镜像，见 `docs/changes/2026-10-23-fixed-image-local-pressure.md:7-11,31-39,49-53`。
- **动作/验收：** 优先将大结果保存为小对象指针/摘要，减少JSONB整体重写和同图重复解码；沿现有DB lane做成本预算，不恢复已删除的普通用户固定调用频率门槛。使用最终镜像的同输入前后对照，记录单op峰值、JSONB字节、解码次数与队列等待；最大合法多图/混合native稳态无OOM、no replay/账务不变量不退化，资源阈值服从全站容量模型。**依赖：** G02、G10、最终镜像与容量专项。

#### G17 · P0 · [F][E][R] 53a 视频增量只按实际发布/验收关闭
- **用户影响/证据：** 本地已修能力未上生产，员工仍可能遇到旧行为。用户交接为53a已推未上线；当前源码已有 `src/lib/video/submission.ts:42-45,66-80,91-99` 的冻结能力/精确协议预检，`src/lib/video/reference-media-token.ts:58-65,76-83` 的签名媒体路径合同。`docs/changes/2026-10-23-video-node-capabilities.md:28-32,55-61` 明确文档能力≠所有组合真实成片，旧集成失败是历史记录。
- **动作/验收：** 发布负责人绑定53a实际差异、最终构建和旧失败的后继证据，不用限定remaining0抵消其他门槛；部署后核对UI目录→提交→wire→冻结恢复。32启用型号的可选组合100%不越声明，选代表完成真实可播放成片；旧冻结版本/管理员显式空值不被新能力覆盖。47维持HOLD至另行发布，不在本审计执行。**依赖：** 视频修复交接、真实供应商、最终Web/Worker同版本。

#### G18 · P0 · [E][R] 视频未知受理与配置漂移不得变成新建重试
- **用户影响/证据：** 视频费用高，断线重提可造成双任务/双费用。`src/lib/video/service.ts:212-229,337-399,461-478` 已有输入digest幂等、submission标记、幂等声明/配置匹配，未知转creation_unknown；`src/lib/video/submission.ts:91-99` 已保存执行/供应商快照。不是缺少视频幂等。
- **动作/验收：** 对每个实际启用profile登记幂等/查询证据；断在接单前后、写upstreamId前后并变更凭据/配置后恢复。无幂等证明新增生成POST=0、保持待核查；有证明只能取回原task；已知upstreamId后只GET；重复恢复20次客户账本至多1条、归属仍为原actor/tenant/payer。**依赖：** G10、G17、供应商真实幂等合同。

#### G19 · P1 · [E][R] 视频交付覆盖全部产物、下载/解码与长期恢复
- **用户影响/证据：** 上游completed但视频不可播放、音轨/副产物丢失或落地失败。已有 `src/lib/video/result-assets.ts:35-67,70-102` 的不可变manifest、逐项stage、SHA/归属、真实probe；`src/lib/video/result-completion.ts:7-25` 汇总全部作品；`src/lib/db.ts:5198-5224` 事务完成账务/状态；`src/lib/video/service.ts:403-427,499-545` 落地失败保持低频重试；`src/lib/video/worker.ts:16-27` 20秒/3项调度。现有本机集成中合成视频/probe不证明真实可播放，见 `docs/changes/2026-10-23-saas-video-merge-acceptance.md:21-23`。
- **动作/验收：** 使用真实native媒体贯穿URL下载、超210秒poll租约/重启竞争、部分多产物落盘、过期签名与Range播放；验证恢复只续下载/本地处理、不新建生成。每任务全部声明产物SHA/类型/音视频轨可核对，重复完成不重复作品/账本；落地失败不提前标completed、不错误退款；积压可在全站SLO内恢复。**依赖：** G17/G18、native combined Worker、对象存储/媒体入口。

#### G20 · P0 · [H][R] 历史benchmark维持分母、原材料和闭案证据边界
- **用户影响/证据：** 若用fixture全绿代替员工问题关闭，会反复发布仍不稳定。`docs/changes/2026-10-23-imagegen-history-benchmark.md:9-28`：完整原行为重放0；10/23的24个失败逻辑请求=22额度403+2已完成未最终交付，30分钟全部请求分母未留；不同cohort/父子/供应商行不能相加。后续 `docs/changes/2026-10-23-imagegen-history-goal.md:16-30,41-43`：10/10输出断言仍PARTIAL，原图本地续交不等于生产已交图，最终镜像容量未测，报告hash绑定还曾单独修正。
- **动作/验收：** 按operation保存历史来源/时窗、失败阶段、原材料完整度、旧版复现、新版最终图、账务、生产处置各列；冻结启动manifest bytes/hash。24条逐条归属22+2且不重叠；两笔分别保留“原图取回/本地续交/生产交付”状态；22条逐条处置；缺原输入或原合同保持NOT_PROVEN，历史总套仍PARTIAL直到真正闭合。任何失败率必须有同窗去重分母，不能用断言数/新成功单/原图数量替代。**依赖：** G01–G03、G10/G11、历史证据汇总。

### 8.3 容量、队列、数据库、存储与发布（负责人角色：平台＋数据库＋存储/运维负责人）

#### I01 · P0 · [C] Web与重型生图/图片处理仍共享资源域
- **用户影响**：生成/解码/后处理峰值可能拖慢登录、画布保存和回执查询；独立scanner并不隔离这些CPU/native/external内存。
- **证据**：`scripts/video-worker.mjs:19-22`、`scripts/worker-runtime.mjs:193-194`由Worker请求Web tick；`src/app/api/video/worker/tick/route.ts:25-32`在Web执行扫描；`src/lib/durable-image-jobs.ts:209-230,260-273`在Web claim、decode、run并回环；`src/lib/imagegen/generation-core.ts:23-38`直接import generate-image POST；`src/lib/imagegen/dispatch.ts:101-119`在Web后处理。
- **具体动作**：先给Web内重型执行设置统一内存/像素权重准入；沿用同镜像独立Worker，把可测得的重型执行逐步交给Worker内受限执行进程，保留Web鉴权、冻结事实、租约、收费/交付幂等和回执。不是拆功能Web或立即微服务化。
- **建议验收**：全站负载模型的混合峰值下，轻请求满足全站SLO；重型池满时新增轻请求仍可服务；故障/进程重启各≥3次，已接受任务丢失0、重复付费提交0。
- **依赖**：全站负载/SLO；I05、I07、I10、I17。

#### I02 · P0 · [H][R] 用最终固定镜像补容量证据，不外推旧16-job样本
- **用户影响**：按旧单波“无OOM”放量可能导致当前版本在热态/混合业务下OOM，影响整站。
- **证据**：`docs/changes/2026-10-23-fixed-image-local-pressure.md:6-11,19-23,29-40,48-53`明确旧9f、6/16/4子组结果、8图NOT_PROVEN、无warm-wave/soak/native混合与final验收；原 `C:/Users/13357/.t3/worktrees/naumi/t3-b5cdab86/output/imagegen-fixed-image-pressure-20261023/SUMMARY.json` 的 `run3/case=16` 同值。`output/imagegen-simplify-release47-20261023/FINAL_BUILD_INPUT.json:2-5`绑定另一个d746源。
- **具体动作**：将全站负载矩阵绑定最终完整commit/Image ID/限额；覆盖冷启动、重复热波、持续混合生成/原生媒体/画布读写、断网/DB慢/存储慢及恢复。8图仅按真实产品合同测试，不绕过画布1–4限制凑“通过”。
- **建议验收**：模块预检至少3轮峰值波、≥2小时稳态；最终放量仍须§3的24小时长稳；OOM/oom_kill=0，建议各cgroup峰≤硬限80%且稳定后残余不逐波单调增长；吞吐、排队和轻请求满足全站SLO，所有失败子组/退出码保留。
- **依赖**：全站负载模型/阶段；I01、I17、I20、I23。当前不执行。

#### I03 · P0 · [H] 47蓝绿主机余量门禁继续HOLD
- **用户影响**：先停在线槽、缩预算或把Swap算RAM，会把更新变成服务中断/OOM风险。
- **证据**：`output/imagegen-simplify-release47-20261023/RELEASE_PREFLIGHT.json:2-23`留存可用3403MiB、需5120MiB、缺1717MiB、candidateCreated=false；`VERIFICATION.txt:136-138`记录HOLD且无生产变更。`scripts/ops/release47_imagegen_simplify_successor.py:106-116,531-536`固定Web/Worker/主机余量门禁，`docs/RELEASE_LIFECYCLE.md:51-55`要求新鲜实测且不计Swap。
- **具体动作**：保持现配置；后续发布窗口只在三锁下刷新MemAvailable、所有基础服务和候选实际峰值，再决定扩主机/释放已确认无引用资源或优化内存。不得提前抵扣未排空旧槽RAM，不用旧时间点读数称当前不足。
- **建议验收**：创建前、切流前、退役后均有≤120秒资源快照，三阶段预算均通过；主机reserve≥1024MiB，候选/旧槽/基础服务峰值全部入账，Swap预算=0。
- **依赖**：I02；总台账后续明确发布安排；不得因本台账自动改47。

#### I04 · P0 · [F] “未发上游才可退回队列”修复须进入实际发布验收
- **用户影响**：源码能力若被当作已部署，线上容量繁忙仍可能走旧语义；恢复时错误重投会重复收费。
- **证据**：当前 `src/lib/durable-image-jobs.ts:111-118,158-185`含attemptToken、dispatchState和ImageOperationDeferred回队；与留存线上5b的只读Git diff确认该段为后续增量。`src/lib/model-config/capacity.ts:80-87`已区分未派发和已派发；`output/imagegen-simplify-release47-20261023/VERIFICATION.txt:4,136-138`为未部署/HOLD记录。
- **具体动作**：只将确证尚未派发的新尝试退回现有lane；已started/受理未知继续冻结并核查，保留原账务与operation ID。后续发布采集Web直接import和Worker恢复同版证据。
- **建议验收**：通道预算耗尽时新任务上游POST=0且保留同一任务/预占；释放后只完成1次收费；已started/UNKNOWN故障恢复额外付费POST=0，至少覆盖3个崩溃边界。
- **依赖**：I03、I07、I21；不得清旧UNKNOWN。

#### I05 · P1 · [C] 执行lane之外补图片入口总量/字节背压
- **用户影响**：执行限16不限制排队数量；突发用户仍可堆积持久输入、JSONB、预占与轮询负担。
- **证据**：`src/lib/imagegen/dispatch.ts:207-213`直接create后kick；`src/lib/image-job-repository.ts:18-41,63-68`只有执行claim cap，create链未见全局/账号/租户待执行数和排队字节阈值。媒体子系统已有全局64/用户8限制（`src/lib/video/media-jobs.ts:88-89,108-115`），不是整站无背压。
- **具体动作**：把图片排队任务数、输入持久字节、总在途像素和tenant/user/global配额纳入原子准入；队满返回明确429/Retry-After，不把用户重试转换成新计费operation。配额按全站负载模型定，不硬抄媒体64。
- **建议验收**：并发提交达队列上限的2倍时上限不超卖，超额请求在入队/预占前拒绝；内存/排队字节有界，拒绝后新账单=0，已接受任务仍可排空。
- **依赖**：全站负载模型；I06、I10、I19。

#### I06 · P1 · [C] lane内补用户/租户公平和大批次隔离
- **用户影响**：大户/批次可先占满同kind，零散用户长期排队；当前按kind公平不等于按租户公平。
- **证据**：`src/lib/image-job-repository.ts:189-196`按kind分组、updated_at/id排序，没有owner/tenant轮转；`src/lib/imagegen/batch.ts:89-96`只限制单batch并发，多batch可累加。
- **具体动作**：在现有PG队列上增加owner/tenant并发份额、批次与交互权重、aging；保留共享provider硬预算，不按活跃用户数直接加并发。
- **建议验收**：一个租户制造90%积压、其余10个租户持续小任务时，在供应商有可用容量且任务符合条件时，均在建议≤2个调度周期获得可用份额；持续30分钟无饥饿，份额超卖0，遵守父排队SLO。
- **依赖**：全站负载模型/权益定义；I05、I07。

#### I07 · P1 · [E] 现有lane/lease/provider预算的跨副本一致性与性能验证
- **用户影响**：未来扩同角色副本若只看吞吐，可能增加DB抢锁、租约过期、重复执行或配置版本争用。
- **证据**：`src/lib/image-job-queue.ts:6-11`默认generate/imagegen16、suite/aplus4；`src/lib/image-job-repository.ts:57-75`按kind advisory互斥与租约；`src/lib/durable-image-jobs.ts:214-216`heartbeat；`src/lib/model-config/capacity.ts:57-69`共享budget与TTL lease；`src/lib/imagegen/coordination-pool.ts:5-19`已有独立池。
- **具体动作**：先测现拓扑，再在隔离环境验证双Web执行者/双scanner、滚动版本、慢响应、heartbeat暂停与DB短断；优化锁持有/claim方式须以竞争数据为依据，先不更换队列产品。
- **建议验收**：每kind和每provider同时有效租约从不超cap；连续≥1万次claim无双领取；杀执行者后在现120秒TTL＋2轮扫描范围内进入可解释恢复/核查，UNKNOWN不重投。记录claim p95和锁wait。
- **依赖**：I04、I06、I10、I12；未来副本准入门槛。

#### I08 · P1 · [C] 串行综合tick的队头阻塞与扫描吞吐
- **用户影响**：慢视频查询/存储补传会推迟图片、参考工作台和其他恢复；大量小扫描也占Web/DB。
- **证据**：`src/app/api/video/worker/tick/route.ts:25-32`串行await各域；`src/lib/video/worker.ts:16-17,26-27`视频batch3/workflow2；`src/lib/durable-image-jobs.ts:264-273`HTTP dispatch后再batch/recovery；`src/lib/imagegen/stored-delivery.ts:135-152`已有1.5秒scan、最多16候选/2成功的限额；`scripts/worker-runtime.mjs:193-214`单飞tick及总超时。
- **具体动作**：给每域明确时间/行数/并发预算、游标和抖动退避；在现Worker内有限并行互不依赖扫描，保留tick receipt/UNKNOWN语义；以最老积压年龄而非只以processed计数调度。
- **建议验收**：注入某域30秒延迟，其他域调度p95延迟增量建议≤1个15秒扫描周期；目标积压下扫描耗时小于所分预算，失败域保留原任务、不触发重复收费。
- **依赖**：I07、I10、I12、I24。

#### I09 · P1 · [C] 进程内限流跨重启/副本不一致
- **用户影响**：重启刷新配额、未来副本放大实际限额；批量注册/Agent/视频请求会抢占正常用户资源。
- **证据**：`src/lib/rate-limit.ts:4-9,18-34`进程Map；`src/lib/agent/canvas.ts:45-48`、`src/app/api/agent/route.ts:77,362`和`src/app/api/video/generate/route.ts:19`调用该机制。登录已有PG持久限流和account/network索引（`src/lib/auth-login-limit.ts:6-19`），不应回退或重复造一套登录器。
- **具体动作**：统一高成本入口的防滥用与资源在途预算，按已定义账号/tenant权益及网络异常设置突发保护；不恢复普通用户创作固定次/分钟门槛。选择现有PG或经测算的共享存储；公共NAT与真实用户区分，重启/滚动期间保留语义。
- **建议验收**：2进程＋滚动重启下窗口总限额偏差≤1个已准入请求；单tenant压满后其他tenant可用，正常共享NAT用例误限率满足父目标。
- **依赖**：I05、I06、I10；不因本轮引入Redis集群。

#### I10 · P1 · [C] PG连接总预算、普通池排队与超时
- **用户影响**：少量慢查询/长事务占满小池后，鉴权、保存、heartbeat同时排队；贸然加池/副本又可耗尽PG max_connections。
- **证据**：`src/lib/db.ts:43-58`普通池max5且未设连接/查询默认超时；`src/lib/imagegen/coordination-pool.ts:12-19`额外max4；`src/lib/release-runtime/store.ts:6-11`另max2且已有5秒连接/8秒语句超时。Next多bundle及候选也需实测计入，不能把5+4+2当整机确定总数。
- **具体动作**：盘点进程/bundle/候选/运维/Router等所有DB连接，保留恢复与管理余量；分别设置连接等待、statement/lock/idle-in-transaction超时与pool wait监控。先测再定池大小；PgBouncer仅在连接证据需要时引入并验证session advisory锁兼容。
- **建议验收**：混合峰值连接占PG预算≤80%，保留≥20%运维/故障余量；普通pool wait p95建议<50ms，超时后连接归还率100%，heartbeat不因池饥饿越过租约边界。
- **依赖**：全站负载；I07、I11、I23、I24。

#### I11 · P1 · [C] 外部I/O仍处在部分数据库事务/协调占用期内
- **用户影响**：存储慢和重型处理会放大锁时长、池等待与取消延迟；独立coordination pool解决嵌套死锁，不等于长持有已消失。
- **证据**：`src/lib/media-assets.ts:88-104`BEGIN/锁后读取原图、decode、上传两个变体；`:113-136`补传在FOR UPDATE事务内读/上传多对象。`src/lib/imagegen/cancel.ts:7-11`和`src/lib/imagegen/batch.ts:84-98`协调事务跨durable child receipt调用，有意保证取消顺序。
- **具体动作**：媒体路径改为短claim→锁外I/O→token/CAS提交；协调路径仅缩短非必要I/O，必须保留“取消 vs 已接受提交”的单序，不用简单删锁换吞吐。
- **建议验收**：存储注入30秒延迟时，普通业务事务p99建议≤1秒，媒体锁外I/O不占普通事务连接；取消/重复提交竞争≥1000轮，重复子任务/付费POST=0。
- **依赖**：I07、I10、I19。

#### I12 · P1 · [C] 图片due扫描的索引谓词和大积压排序
- **用户影响**：任务表增长后，每轮window排序/扫描拖慢恢复，并与前台争IO。
- **证据**：`src/lib/db.ts:198-203`已有owner/lease/active/due索引，但due谓词未覆盖`kind='imagegen' AND status='running'`；实际 `src/lib/image-job-repository.ts:189-196`多OR条件、row_number按kind排序，最后LIMIT份额并不保证前面的扫描有界。当前未运行EXPLAIN，不能声称线上已全表扫。
- **具体动作**：用生产分布脱敏样本取得EXPLAIN(ANALYZE,BUFFERS)；补匹配running/terminal recovery的部分或组合索引，分lane/状态有界候选，必要时单独状态/next_due字段，避免每轮对全积压window排序。
- **建议验收**：建议≥100万历史行、≥1万pending的隔离样本，due scan p95<200ms且无磁盘sort spill；扫描buffer量随候选窗口而非历史总行数增长；claim正确性保持。
- **依赖**：I07、I10、I14；索引并发创建另行变更。

#### I13 · P1 · [C] 列表精确COUNT、深OFFSET与模糊搜索
- **用户影响**：大账号/后台浏览和搜索占DB，牵连创作请求；截断1000条不是规模分页。
- **证据**：`src/lib/db.ts:2648-2654`每次工作台count；`:2667-2673`全字段作品LIMIT1000；`:2909-2914`后台OFFSET＋全表count，现DDL仅见owner顺序索引`:136-137`；`:3614-3641`leading-wildcard lower/unnest(tags)搜索、精确count和OFFSET。已有`app_templates_sort_idx`（`:302-303`），不是所有排序无索引。
- **具体动作**：高频列表用稳定(created_at,id) keyset和轻列；统计允许的地方做增量/有时效缓存；对确有需求的模糊搜索评估PG trigram/全文/标签索引，不先建独立搜索集群。
- **建议验收**：100万作品样本首/深页p95建议<300ms，页间无重漏；搜索/统计满足全站SLO，后台并发不使保存p95恶化>10%，给出索引计划/成本对比。
- **依赖**：业务查询分布；I10、I14、I15。

#### I14 · P0 · [C] 请求/冷启动兼容DDL与历史回填须迁出热路径
- **用户影响**：新槽首请求可持锁、扫描老表或触发旧schema重建，影响在线写入和蓝绿兼容。
- **证据**：`src/lib/db.ts:63-75,85-96`ensureSchema惰性DDL；`:169-184`每次初始化递归构图回填；`src/lib/schema-initialization.ts:4-8`已有全局DDL串行锁但无本函数超时/分批；`src/lib/db.ts:4220-4267`旧Agent PK不符时复制→DROP→RENAME的多独立查询，**条件路径**不是宣称当前库正在执行。`docs/RELEASE_RUNBOOK.md:98-104`已要求扩展/回填/收缩分阶段。
- **具体动作**：版本化迁移账本、发布前旁路受控迁移；回填按主键小批可续跑，索引按需并发建；首请求只校验schema版本；旧破坏性兼容路径改成显式维护任务。
- **建议验收**：升级/重启连测3轮后无请求触发DDL/重复回填；代表性大表迁移建议锁等待≤1秒，读写p95恶化≤10%；混合旧新程序通过权限/账务兼容，失败回滚程序不回灌DB。
- **依赖**：I10、I12、I13、I21、I22。

#### I15 · P1 · [C] 报价/任务检查点/临时对象的保留和可审计GC
- **用户影响**：过期报价完整plan、历史任务snapshot、输入副本和未完成上传持续增长，放大WAL、TOAST、备份与磁盘成本。
- **证据**：`src/lib/imagegen/quotes.ts:21-26,49-51`PG报价只INSERT/到期判读，当前非测试src/scripts检索未见相应DELETE调度；`src/lib/durable-image-jobs.ts:27-39`输入按job落对象；`src/app/api/media/uploads/route.ts:38-40`pending-uploads；`src/lib/media-assets.ts:21-25`上传元数据无expiry索引。本域未见统一引用校验GC；release-runtime已有自己的有限清理（`src/lib/release-runtime/store.ts:139,181,197`），不是系统完全无清理。
- **具体动作**：按产品留存义务给报价/非必要冗余/上传临时对象设分层TTL、引用计数/可达性dry-run、批量归档与GC；收费凭证、UNKNOWN、冻结配置、可恢复原图和业务媒体不按临时缓存清掉；同步量测autovacuum、dead tuple、WAL/TOAST。
- **建议验收**：每类有owner/保留期限/大小指标；建议过期临时对象24小时内清理，1000个跨任务引用/中断上传用例误删0；高更新样本dead tuple建议<10%、GC使前台p95恶化≤10%。
- **依赖**：产品留存要求；I14、I19、I22。

#### I16 · P1 · [C] 大文件上传/直传完成仍有整块内存峰值
- **用户影响**：多个200MiB视频上传或64MiB图片complete可同时放大Web内存；“直传”不代表Web无需读回。
- **证据**：`src/app/api/video/references/route.ts:15,26-36`formData后arrayBuffer（视频200MiB）；`src/app/api/media/uploads/route.ts:24,54-64`已有签名直传，但proxy/local禁用、complete整图读回/处理；`src/lib/storage.ts:127-135,150-157`bounded读取最终Buffer.concat/readFile，`src/lib/object-storage/adapter.ts:66-68`PUT再Buffer.from。
- **具体动作**：给请求体解析/上传校验设总字节信号量，流式落受限scratch并边读边hash；大文件优先multipart/可续传对象上传，Web完成阶段以HEAD/流式校验/受限Worker处理替代整块复制。保留格式、实际大小、归属和冻结SHA检查。
- **建议验收**：建议10路最大允许上传/complete混合，Web峰满足I02；超限在读满前返回413；中断/续传≥100次，已发布坏对象0、孤儿对象按I15清理，轻请求满足全站SLO。
- **依赖**：I01、I05、I15、I19。

#### I17 · P1 · [C] 图片native解码/后处理缺统一跨入口加权预算
- **用户影响**：压缩文件不大但raw解码大；多入口同时处理时可绕过单lane的内存估计。
- **证据**：`src/lib/imagegen/image-limits.ts:2-4`已有12MiB输入/64MiB输出/4000万像素限制；`src/lib/imagegen/pixels.ts:5-11`RGBA raw；`src/lib/media-variants.ts:4-10`最高6400万像素完整raw后出两变体；`src/lib/imagegen/dispatch.ts:101-119`与`src/lib/media-postprocess.ts:33-34,74`仍Web处理。单张4000万RGBA约160MB，6400万约256MB，尚未计多份复制和libvips，不是实测RSS。
- **具体动作**：把generate、variant、mask/chroma、恢复和上传校验接入统一像素/字节权重信号量，逐张释放；量测sharp/libvips缓存、线程、allocator及external内存，重型任务移同镜像Worker受限进程，超预算排队不直接崩溃。
- **建议验收**：最大像素/高熵/透明图混合≥3轮＋热稳态，cgroup峰满足I02；记录heap/external/native分解；正常输出像素/SHA或有损质量合同保持，OOM=0。
- **依赖**：I01、I02、I05、I16。

#### I18 · P1 · [E] 已有私有媒体流/签名/缩略图，补CDN与带宽规模验收
- **用户影响**：浏览图片/视频下载可耗尽回源带宽、鉴权DB/FD；错误缓存策略还可能串账号。
- **证据**：`src/app/media/[...path]/route.ts:60-79,83-120,138-165`已有鉴权、签名307、proxy stream、Range、private缓存；`src/lib/object-storage/adapter.ts:28-38`本地stream/Range；`src/lib/video/reference-media.ts:64-77,94-106`校验后流式GET/HEAD/Range。没有把这些登记为全量buffer下载缺陷。
- **具体动作**：按全站媒体流量测鉴权/首字节/回源/下载占比，公共不可变缩略图与私有签名分开设计边缘缓存；range、HLS/DASH、过期链接、版本变化和跨账号缓存负例都需保留。CDN可用性以实际存储拓扑为准。
- **建议验收**：建议可缓存公共预览命中率≥90%、回源字节降低≥80%（冷启动另计）；私有跨账号/过期/变更负例≥100例泄露0；峰值下载下轻请求和首字节满足全站SLO。
- **依赖**：全站媒体负载；I16、I19、I23；不要求给所有私有媒体公共缓存。

#### I19 · P0 · [C][E] 对象存储降级已有机制，缺落盘容量/积压闭环证据
- **用户影响**：远程故障期间已付费结果落本地是正确保护，但可能吃满Web盘；固定2项补传速度不足时恢复期积压不降。
- **证据**：`src/lib/storage.ts:63-80`remote-first失败本地保留；`src/lib/object-storage/write-availability.ts:11-26,33-34`已有进程内探测合并/15秒ready/30秒block/最多120秒写预算；`src/lib/media-assets.ts:110-136`已有hash验证、FOR UPDATE SKIP LOCKED、每轮2项/5分钟重试。上述写/准入链未见按剩余字节/inode/待补传总量的统一门禁。
- **具体动作**：预留“已接受结果”的持久空间，低水位先拒绝新收费意图而非丢已有结果；盘/对象积压/最老年龄可观测，补传受限自适应吞吐、退避抖动；每个本地副本有owner/hash/remote-ready确认后再按引用清理。
- **建议验收**：建议模拟30分钟远程中断，已接受结果丢失0、磁盘不触底；剩余空间低于运行＋恢复预留时新收费POST=0；恢复后补传净吞吐≥新增字节率2倍，并在父约定恢复窗内排空。
- **依赖**：I05、I11、I15、I22、I23。

#### I20 · P1 · [E] combined媒体Worker的有界队列、scratch与混合压力
- **用户影响**：大媒体任务、未确认终态和重启可占scratch/队列，拖慢恢复；已有边界不等于已证明大流量。
- **证据**：`scripts/video-worker-with-media.mjs:19-39`同镜像combined、scanner uid1001/media root独立子进程、媒体concurrency固定1；`scripts/video-fusion/media-engine.mjs:8`输入250MiB/输出500MiB/timeout180秒/queue8；`src/lib/video/media-jobs.ts:108-115`PG全局64/用户8；`scripts/video-media-worker.mjs:93,104-114,145-163`health/retired/terminal cap/collector。共享退休缓存修复已包含在已发布5b的材料中（`docs/changes/2026-10-23-saas47-production-acceptance.md:24-29`），不列为未部署。
- **具体动作**：统一PG队列与native实际空位反馈，监测scratch bytes/inodes/终态未确认年龄；混合压力涵盖inspection、最大I/O、失败、取消、双进程交接和重启，扩并发必须重算Worker/cgroup/磁盘。
- **建议验收**：≥100个媒体任务循环＋≥3轮重启，active始终≤1、queued/terminal/PG上限各自不越界；确认退休在建议≤2次collector周期清除本进程缓存；真实native mixed OOM=0、任务不重计费。
- **依赖**：I02、I08、I19、I23；不把单样例340–346MiB当降低1GiB预算依据。

#### I21 · P1 · [E] 连续发布已有真实闭环，补当前候选的带载连续性与恢复验收
- **用户影响**：最新源码/文档已合并不等于最新镜像已部署；高峰切换若只看health会中断旧编辑、Agent和在途付费任务。
- **证据**：`docs/changes/2026-10-23-saas47-production-acceptance.md:9-20,48-62`记载真实三锁整站蓝绿及旧槽正常退役；`:50`明确生产未实际触发紧急维护；`docs/changes/2026-10-23-saas-recovery.md:23-40`恢复采用受控维护而非不兼容旧程序；`src/lib/agent/runtime.ts:138-145`仍有进程活动session，已有release归属/排空机制不能删除。
- **具体动作**：按最终候选补真实执行图（公网、直接import、INTERNAL_APP_ORIGIN、Worker origin、Router容量回调）的同版证明；带载验证旧JS/协议、Agent控制/保存、Worker交接与退役；受控维护恢复独立验收并记录真实影响，不冒称无感回滚。
- **建议验收**：建议连续3轮隔离带载切换，发布引起的请求丢失/重复付费=0、旧编辑保存成功100%；旧槽连接/Agent/任务/租约/新领取真实0后才stop且restart=no；5轮恢复材料可读，历史UNKNOWN逐字保留。
- **依赖**：I02、I03、I04、I14、I22、I24；本轮不发布。

#### I22 · P0 · [E][H][R] 备份存在，但DR/PITR及目标恢复时间未被现证据证明
- **用户影响**：程序回滚解决不了PG/NAS/Hub介质丢失；仅有dump目录列表或文件SHA不证明业务可恢复。
- **证据**：`scripts/ops/release47_host.py:316-339`已有一致pg_dump -Fc/-Z1、fsync、pg_restore --list、SHA，明确restoreExecuted=false；`docs/changes/2026-10-20-nas-data-evacuation47.md:15-18,45`留存主PG/Hub SQLite/NewAPI/config/NAS读回备份。已审deploy/核心发布脚本未见持续WAL归档/PITR/定期异地还原调度证据；这不是对线上全部外部运维配置的否定。
- **具体动作**：由总台账确认RPO/RTO；先建立自动定时全量/增量与独立故障域副本、校验及失败告警，量测后决定WAL/PITR/备用机；隔离还原DB＋所引用媒体＋Hub/NewAPI/config/必要秘密并验证一致时间点，绝不回灌生产或重放未知收费任务。
- **建议验收**：首次完整DR演练及每季度复演；候选目标可先审“账务RPO≤5分钟、核心可用RTO≤60分钟”，按实际数据量验证再承诺；恢复后账户/余额/任务/媒体引用校验100%，UNKNOWN不新增付费POST。
- **依赖**：目标RPO/RTO/留存要求；I15、I19、I21、I23。

#### I23 · P1 · [C][H] 基础资源预算与部署模板漂移
- **用户影响**：通用compose、47固定发布和本机压力限额不是同一配置；照抄可引入额外媒体容器、latest漂移或无界资源竞争。
- **证据**：`docker-compose.yml:29,122-132,149-155`latest、独立media-worker/3g/2cpu及video-worker；`deploy/staging/docker-compose.yml:20,56-66,84-90`固定镜像但仍是分离旧模板，app/db段无相应统一资源预算；实际47整站/combined同镜像见 `docs/changes/2026-10-23-saas47-production-acceptance.md:15-18`；当前imagegen候选Web1.5CPU/Worker1CPU见 `scripts/ops/release47_imagegen_simplify_successor.py:531-536`。这些是模板差异，不声称当前47运行了模板三容器。
- **具体动作**：为正式单Web＋同镜像Worker输出唯一可审部署profile，模板明确用途/弃用边界；按实测列Web/Worker/PG/Router/Hub/Redis/Nginx的CPU、RAM、磁盘IO/容量/inode、出口、FD/连接、日志上限与蓝绿临时增量。先补资源或优化明确瓶颈，不拍脑袋上K8s/分库分表。
- **建议验收**：计划与实际Image ID/进程/资源逐项匹配100%；峰时CPU持续利用建议<70%、FD/连接<70%硬限、磁盘保留≥10GiB及备份/候选额外空间（取更高需求），无swap计RAM；日志增长有7天以上预测，基础服务无被动OOM。
- **依赖**：全站负载模型；I02、I03、I10、I18、I19、I22。

#### I24 · P1 · [C][E] 从health/发布回执补到容量可观测与告警闭环
- **用户影响**：HTTP200、storage.enabled或processed计数无法发现排队饥饿、内存逼限、补传落后和账务恢复债务。
- **证据**：`src/app/api/health/route.ts:12-26`返回DB结果和storage enabled但无存储真实就绪、队列年龄/池wait/native内存；已有receipt/UNKNOWN/背景活动（`src/app/api/video/worker/tick/route.ts:16-23,45-63`、`src/lib/release-runtime/store.ts:7-11`）和恢复监督（`scripts/ops/release47_recovery_supervisor.py:90-92,138,211`），不等于完全无监控。
- **具体动作**：把Web轻请求/执行阶段、lane queued/oldest wait/claim、provider budget/lease、PG pool/锁/慢SQL、media/scratch、对象补传、cgroup峰/事件、磁盘/备份年龄与UNKNOWN统一带commit/build/instance关联；liveness、readiness、deep probes分层，昂贵/付费动作不进频繁探针。告警每项有owner和不重投的runbook。
- **建议验收**：建议指标采样≤15秒，关键耗尽/新UNKNOWN/备份过期告警≤2分钟；至少注入DB慢、存储断、队列满、内存逼限4类事件，告警送达与解除各100%，标签不含token/原始用户正文，观察链不拖慢轻请求>5%。
- **依赖**：全站SLO/放量门槛；I05、I07、I08、I10、I19、I22、I23。

### 8.4 画布体验、身份隔离与支持运营（负责人角色：前端＋身份权限＋客服运营负责人）

| ID / 优先级 / 证据类别 | 用户影响及当前证据（仓库相对路径:行） | 建议与量化验收（均待执行） | 依赖 |
| --- | --- | --- | --- |
| **U01 P1 [C] 初始加载错误不得伪装空画布** | `src/components/canvas/canvas-client.tsx:2511-2519,2558-2562`：项目/文字读取失败分别回空结构；整体失败将作品置`[]`且结束ready，用户会误以为作品消失。账号snapshot已有superseded重读保护（2500-2509），不是没有缓存。 | 分开loading/empty/error/stale状态；HTTP非2xx不当合法空列表，不覆盖已有作品；显式重读，不触发新创作。账户/项目/文字任一503、401、断网、坏JSON共至少12反例，**0次假空态/旧数据覆盖**，恢复连接后一次显式操作恢复。 | 统一读取错误合同；U17、U18。 |
| **U02 P1 [E] 保存失败→离页→重开可恢复** | `src/components/canvas/canvas-client.tsx:7336-7360,8846-8848`已有逐节点保存队列、未保存计数和重试；`:2569-2583`有账号级文字localStorage兜底。缺少“本地未同步版本相对服务端”的完整恢复证明；重载先取服务器成功数据可能覆盖本地未同步版本。 | 在已有草稿机制上记录dirty/服务端版本/操作ID；失败持久化后重开提示恢复，不静默自动覆盖服务器。离线编辑100次、关页/崩溃/重开、服务端旧版本20组合，**本地已确认保存草稿丢失0**；在线恢复后可比对并提交，未保存状态不假清零。 | U04版本语义；浏览器存储容量与隐私规则。 |
| **U03 P1 [E] 新tab/浏览器重启后的原任务入口** | `src/lib/imagegen/client-recovery.ts:7-17,22-43`已有owner/workspace/project隔离的sessionStorage回执、in-flight去重；`src/components/canvas/imagegen-pending-recovery.tsx:28-33,35-64`已有挂载快照和显式原任务检查。sessionStorage并非跨新tab/设备任务目录，不能把“当前tab刷新可恢复”写成所有重开可恢复。 | 复用服务端任务记录提供“我的未完成/待核查任务”入口；tab回执作为快捷入口而非唯一索引。关tab、浏览器重启、换设备、存储禁用各5组，**已受理任务可定位率100%，新增付费POST=0**；无权限任务不出现。 | U11、U13、U18；服务端分页任务读模型。 |
| **U04 P0 [C] 图片/文字多tab写入冲突** | `src/lib/canvas-history.ts:25-40,67-79,123-137`有事务/owner锁/operation幂等，视频有expectedRevision；图片位置/标题/尺寸与text-patch没有预期版本。`src/lib/db.ts:2441-2459`文字upsert仅owner条件，后到旧内容可覆盖。锁保证串行，不等于防旧版本覆盖。 | 给这些高价值写入补预期版本/字段冲突语义，复用视频CAS模式，不要求引入完整实时协同。2账号授权协作场景（如产品支持）及同账号3tab×100交错写，**静默丢更新0**；409保留本地编辑，显示冲突并可重读/另存；撤销不覆盖他tab新修改。 | DB兼容扩展；U02；明确多人协作产品边界。 |
| **U05 P1 [C] 历史超过1000节点的完整性** | `src/lib/db.ts:2416-2427,2663-2673`文字/作品均按账号取最近1000；`src/app/api/account/route.ts:52-55`普通画布直接返回此列表；`src/components/canvas/canvas-client.tsx:2511-2526`用它构画布。不是“SQL无限查询”，而是有界但无完整性/分页提示，旧项目可能缺祖先/引用。 | 项目目录分页，进入项目按项目读取完整图或增量分页，返回hasMore/total/截断标记；引用按ID补齐。账号1万作品、200项目、单项目3000混合节点，**应有节点/边完整率100%，0隐性截断**，分页结果稳定不重漏。 | 读模型/索引；U06；与全站容量计划衔接。 |
| **U06 P1 [E] 大量节点交互性能与设备分层** | `src/lib/canvas/virtualization.ts:1-6`已有>300节点/>1000边虚拟化；`src/lib/canvas/image-observers.ts:13-26`共享可见性observer；`src/components/canvas/canvas-performance-probe.tsx:7-16,28-51`已有opt-in性能探针，不能说无性能机制。 | 复用探针建立300/1000/3000节点、1000/5000边及中端设备交互基准；建议拖动/框选/缩放**p95响应<100ms，输入INP p75<200ms**，连续操作20分钟无持续内存增长/崩溃；保留冷/暖/弱网分组，统一设备预算。 | U05、U07；受控基准素材和设备；全站性能目标。 |
| **U07 P1 [E] 弱网素材加载保持可读与可解释** | `src/lib/browser-image-cache.ts:9-16,47-55,127-145`已有128MiB/400项有界缓存、DB不可用退化、临时网络失败不等同撤权；`src/components/canvas/canvas-image.tsx:24-55`已有分辨率阶梯、20秒失败提示和手动重载；不是没有懒加载/重试。 | 补重载分类（网络/权限/过期/缺失）、优先可见与选中素材；不因预览成功声称原图可下载。1Mbps/300ms/2%丢包、100可见节点、过期签名及R2/本地驱动矩阵，**字节并发≤6、未授权旧图回退0、恢复后可见图成功≥99.5%**；原图下载校验SHA。 | 媒体鉴权与签名续期；U16、U21。 |
| **U08 P1 [C] 多tab/后台轮询放大与断网提示** | `src/components/canvas/video/use-video-tasks.ts:10-16`每tab固定4秒查limit500，未按hidden/offline/无活动任务改变周期；`src/components/canvas/canvas-client.tsx:3147-3154,3265-3267`还有sourceIds分块并发查询和8/15秒轮询，异常静默延后。已有轮询恢复，不是缺Worker。 | 前台活动任务优先、终态退订、后台降频/跨tab合并只读查询，失败指数退避+jitter，显示最后成功同步时间；只重读不重提付费创建。3tab×100会话30分钟，**无任务时请求降≥90%、隐藏tab降≥80%，恢复前台5秒内更新**；429服从Retry-After。 | 统一查询协议；U03、U21；全站并发模型。 |
| **U09 P1 [C] 进度必须与真实阶段一致** | `src/lib/canvas/generation-progress.ts:3-20`明确为展示进度，用时间渐近到92%，180秒仍提示“仍在生成中”；底层`src/lib/imagegen/types.ts:14-17`已有queued/pending/needs_attention/partial及progress。长期未同步不能由时间推定task active。 | 显示排队/已提交/供应商处理中/保存/待核查、最后观测时间；模拟百分比标为估计或改阶段指示，不假装供应商进度。注入断网、Worker停扫、needs_attention、partial各5组，**未知状态虚报“活跃生成”0**；2个查询周期无更新显示状态待同步。 | U08、U20；统一状态投影。 |
| **U10 P0 [C] “重试”区分原任务核查与新购买** | `src/lib/canvas/generation-failure.ts:8-17`把含“核查/请勿重复”等提示改成“本次未取得图片，请重试”，classify将未知提交归failed；`src/components/canvas/generation-placeholder.tsx:44-51`按钮统一“重试”。底层`src/lib/imagegen/canvas-client.ts:43-53,104-107`确有原operation查询保护，不能说已经重复扣费。 | UI保留已受理未知/未受理/结果合并失败三分法；按状态写“检查原任务/重新加载结果/重新提交”，新购买须明确。超时已受理、HTML502、查询404、部分成功、返回账号后检查至少20组，**原受理未知额外付费POST=0**；可用操作与标签100%一致。 | U11、U17、U20；保留现有receipt-first与scope guard。 |
| **U11 P0 [E] 全创建入口的幂等验收矩阵** | `src/lib/imagegen/schema.ts:20-22`强制operationId；`src/app/api/imagegen/route.ts:15,30-35`receipt-first；`src/lib/imagegen/canvas-client.ts:96-107`先落回执再POST、未知不新建；`src/lib/canvas-history.ts:53,68-72,156`指纹+事务幂等。不能把已有幂等说成没有。 | 建“用户动作→operation→job/creation→账本”的入口清单，覆盖图像/视频/Agent/工作台及旧入口；新tab同一业务意图的识别规则必须明确，不把内容相同的合法新购买误合并。每入口并发双击/丢响应/重载/Worker恢复/换scope至少10例，**一次意图≤1供应商创建、≤1有效结算，同ID改参409**。 | 生成链路可靠性台账；U03、U10、U23。 |
| **U12 P0 [R] tenant边界覆盖非模型画布写接口** | `src/lib/saas/creation-context.ts:24-35,82-93,117-148`已有服务端租户/项目冻结及跨企业引用保护；`src/lib/enterprise/access.ts:12-21`双cookie不放大企业身份。另`src/app/api/canvas/text-nodes/route.ts:26-42,57-65,94-120`与`src/lib/canvas-history.ts:46-49,105-106`主要按email授权，未在这些handler自身呈现完整tenant context约束。**这不是已证明跨用户泄露**，需明确个人作品权限与企业撤权后的编辑政策。 | 做有界路由矩阵：文字/位置/删除/复制/导入/素材/结果选择；确认每条采用owner还是tenant规则并验证失效。A/B企业+个人+平台cookie+离职+过期各关键读写，**越租户新创作/敏感素材读取0，既有受理回执只读恢复按冻结归属**，不借补测放宽权限。 | 产品数据归属政策；U13、U16；权限负责人。 |
| **U13 P0 [E][R] 真实tenant角色与撤权验收补齐** | `src/lib/enterprise/server.ts:74-117`有账号/租户/成员有效期、层级/可见范围和repeatable-read；`src/lib/saas/tenant-usage.ts:10-16,24-41,78-79`按接受时归属且服务端过滤下属。`docs/changes/2026-10-23-saas47-production-acceptance.md:27,37-40`记录本机正向覆盖，但生产所有者正向/密码登录当时未验证。 | 在授权验收阶段补真实owner/manager/member/离职/账号过期/租户停用及双cookie矩阵，不把平台admin成功当owner成功。**全部目标角色100%按策略通过/拒绝，撤权后新请求拒绝延迟≤5秒，历史归属不改写**；目前只登记待验，47 HOLD。 | U12；真实合规测试账号；发布/验收计划。 |
| **U14 P1 [E][R] 配额、席位与客户预算边界** | `src/lib/saas/tenant-contracts.ts:10-12,46-47`已有席位/权益；`src/lib/saas/tenants.ts:171,205-209`有席位下限及满额拒绝；`src/lib/saas/tenant-usage.ts:10-16`明示平台共享采购、成员账号计费，供应商余额不是tenant钱包。日/月租户创作预算和公平性目标尚未确认，不能拿正常创作固定次数限制替代。 | 明确客户余额不足、席位耗尽、权益撤销、供应商容量不足四类提示和负责方；若产品确认租户预算，按预占/结算/取消原子控制。**20并发加席不超席、余额边界无透支、重复结算0**；所展示待结算/已扣/退回与账本逐笔一致。 | 产品套餐与账务策略；计费/容量台账；U21。 |
| **U15 P1 [C][E] 退出失败与会话撤销闭环** | `src/lib/native-auth.ts:121-130`已有DB封禁/密码重置/有效期撤权；但`src/lib/auth-context.tsx:309-324`先清本地并吞logout请求失败，`src/app/api/auth/logout/route.ts:7-11`仅清cookie。离线“已退出”的视觉状态不等于服务器确认退出，也无该handler的按设备撤销记录。 | 区分本地退出/服务器已确认退出；重连完成服务端注销；若产品需要跨设备登出，复用auth epoch增加会话索引而非重写登录系统。断网退出/500/关闭tab/重连至少10组，**不假报服务器已退出，确认后旧会话拒绝100%**；不清掉无关平台/企业会话。 | 身份策略；U16；服务端会话需求确认。 |
| **U16 P0 [E] 账号切换、共享电脑与缓存隔离** | `src/lib/auth-context.tsx:135-145,337-347`已有verified activate及identityEpoch，迟到响应不能复活旧账号；`src/lib/browser-image-cache.ts:151-161`已有账号切换清理、BroadcastChannel/storage登出；`src/lib/imagegen/client.ts:10-21`回执剔除鉴权头，`src/lib/imagegen/client-recovery.ts:11-16`绑定owner/workspace/project。 | 联合测账号A→B→A、跨tab登出、同域不同tenant、迟到余额/作品/素材响应、坏存储；明确哪些草稿可留存并可按账号清除。至少30混合反例，**B看见A私图/提示词/恢复回执=0，旧响应污染0**；非身份断网不误清有效可见内容。 | U03、U12、U15；浏览器存储清理政策。 |
| **U17 P0 [C] 失败提示与公开接口不回传原文** | `src/lib/api-error.ts:11-53`已有safeError闭合静态提示，`src/lib/reference-workbench/errors.ts:25-47`有脱敏code/stage/trace；但`src/components/canvas/canvas-error-boundary.tsx:35-44,79-81`直接展示message及6行stack；`src/app/api/account/route.ts:56-59`、`src/app/api/canvas/history/route.ts:15-16`和`src/app/api/imagegen/route.ts:42`存在原message回传；`src/app/api/health/route.ts:16-24`公开响应含DB error及模型配置摘要。不能说全链路已净化。 | 复用已存在错误码/白名单：客户仅看可操作说明+编号，内部保留受控脱敏证据；health拆公开alive与受权诊断。注入供应商原文、DB连接串、stack、HTML、URL/query、token形状各至少5样本，**公开响应/UI泄露原文或秘密0**；本地可信校验仍给准确说明。 | U18；日志访问与脱敏词典；公开health合同。 |
| **U18 P1 [E] 用户可复制的请求号贯穿真实操作** | `src/lib/reference-workbench/errors.ts:26,42-47`已有traceId；`src/lib/imagegen/types.ts:14-17`有operationId/jobId；`src/components/canvas/imagegen-pending-recovery.tsx:77-80`显示短operation；`src/lib/model-config/execution-audit.ts:15-20,28-45`有operation索引和阶段。不是没有ID，而是尚缺跨入口一致、用户易获取的关联协议。 | 统一requestId（每HTTP）+operationId（业务意图）+creation/job/ledger映射，错误卡一键复制脱敏编号，客服只读查询；不以原文prompt当检索键。**每条失败反馈≥99.9%能关联到真实operation或明确“未受理”，10次样本客服≤2分钟定位阶段**；伪造编号不能读取他人信息。 | U11、U17、U19；日志/追踪负责人。 |
| **U19 P1 [C] 失败反馈→定位→答复的产品闭环** | `src/components/canvas/generation-placeholder.tsx:44-51`现失败卡只有说明/重试；`src/components/canvas/imagegen-pending-recovery.tsx:70-80`只有原任务检查；`src/lib/canvas/help-catalog.ts:53-59`是操作指南。**所查画布故障路径未接反馈工单入口**，不是断言全公司没有外部客服系统。 | 在失败卡加入“反馈此问题/复制诊断编号”，只提交编号、用户补充、同意的截图及环境摘要；支持后台关联operation、定位阶段、责任人、结论与用户答复，重复故障合并但不丢个体结果。**10个端到端案例100%能反馈→关联→分类→答复→关闭**；受理回执<5秒，客服工作台可查SLA逾期，不自动重投。 | U18、U20；既有客服渠道对接；脱敏/保留期。 |
| **U20 P1 [E][H] 真实失败阶段与恢复动作的支持视图** | `src/lib/model-config/execution-audit.ts:15-23,33-54`已有执行阶段/状态/attempt；`src/lib/bi/model-observer.ts:81,148-172`已有调用/stream outcome；`src/lib/saas/creation-reference.ts:5-15`已有账务/模型/任务→创作定位。历史`docs/changes/2026-10-20-image-delivery-recovery.md:5,15-19,35-37`明确区分子任务成功父交付失败、缺artifact、未知收费；**历史数量不是当前积压**。 | 汇成只读时间线：准备→受理→供应商创建/查询→结果保存→合并画布→结算，标注证据缺失而非猜认证/余额。每类≥5个脱敏案例，**阶段归因准确率100%，unknown明确标记，已保存原结果恢复额外供应商POST=0**；客服可解释“扣费成功但显示失败”的真实边界。 | U18、U19；后端恢复矩阵；账本与媒体证据。 |
| **U21 P1 [E][R] 交付SLI与错误预算接入全站SLO** | `src/lib/model-health/observe.ts:31-49`已有业务结果观察，不只HTTP200；`src/lib/bi/model-observer.ts:81-96,148-172`有耗时及终态；`src/components/canvas/canvas-performance-probe.tsx:7-16`是opt-in DOM诊断，不能当生产RUM；`docs/RELEASE_RUNBOOK.md:132`要求持续监控但没有在该处绑定统一数值预算。 | 全站统一SLO，本模块输出可聚合分母：接受成功率、接受→可见交付成功/耗时、素材失败率、草稿丢失、unknown年龄、刷新恢复成功、客户端崩溃与INP；业务失败/客户端输入错/供应商未知分开但保留用户总体体验。**已受理operation覆盖≥99.9%，分钟聚合延迟<2分钟，30天预算可重算，UI交付失败不被HTTP200抵消**。 | 全站SLO/错误预算；U18、U20；采样与成本边界。 |
| **U22 P1 [E][R] 指标→告警→事故运营闭环** | `src/lib/model-health/service.ts:7-18`已有领取/探测/结果；`src/lib/model-health/repository.ts:29-34,47,72-86`有unknown/最后业务成功/核销机制；`docs/RELEASE_RUNBOOK.md:132`有监控要求。所查链路未证明用户交付故障能自动触达值班与客服；不等于没有健康探针。 | 在统一告警平台接交付burn-rate、长时间无进展/needs_attention、保存/素材/登录异常；告警带脱敏operation样本、影响人数/范围、值班owner和只读runbook，关联U19反馈。**合成故障≤5分钟触达、≤10分钟ACK，恢复通知/复盘有证据**；重复告警去重、不以自动退款或重投代替处理。 | U21；事故分级/值班；U19、U20。 |
| **U23 P0 [C][E] 关键新回归纳入同SHA CI门槛** | `.github/workflows/image-gateway.yml:93-99,107-180`已有大量build、PG、账务、权限、浏览器/生命周期回归；但该工作流未调用现有`verify-imagegen-reload-recovery.cjs`、`verify-imagegen-scope-receipt.cjs`、`verify-imagegen-client-recovery.ts`、`verify-saas-tenants.ts`等本轮关键脚本；PR paths（12-64）未全覆盖独立`src/lib/imagegen/**`/`src/lib/saas/**`/画布lib变更。不是“项目没测试/没CI”。 | 按大模块集中运行，将创建幂等/恢复/tenant/弱网多tab/错误脱敏列为required suite并补触发路径；测试库存和门禁集合分开。至少8个“仅lib/测试变更”触发样例100%命中，关键反例人为破坏必红；**关键suite skip=0，报告绑定同完整SHA、隔离fixture、测试数与失败产物**，禁止把mock供应商当真实上线验收。 | U04、U10-13、U17；CI负责人；不要求本轮执行测试。 |
| **U24 P0 [F][R] 候选、修复、发布证据分层；47继续HOLD** | `docs/changes/2026-10-23-imagegen-simplify-release.md:1-10,48-57`明确最终修复整合/本地验证但暂缓47发布；`docs/changes/2026-10-23-image-scheduler-recovery.md:1,13-25,50-59`记载三个修复及副本回退，不是线上效果。`.github/workflows/docker.yml:79,121-128,172`镜像构建/发布与image-gateway回归是不同工作流，构建候选不自动证明关键suite同SHA已绿。 | 维护“源码修复/测试fixture/固定镜像/已部署/真实功能验收”五列；发布负责人在未来明确发布任务将固定镜像SHA与required suite、兼容恢复证据绑定，保留部署lifecycle门禁。**当前47 HOLD不变；无候选/切流动作**。未来只有同SHA关键suite通过、旁路真实角色与受影响交付验收、旧槽排空和回滚/维护恢复证据齐全才可交付，不把Git push/镜像构建升格上线。 | 容量、阶段计划、发布授权；U13、U23；三锁/lifecycle。 |

## 9. 将台账合成十个依赖工作包

以下是后续排期的合并单位，避免把跨域重复验收拆成几十次小改。它们不是本轮已经修复或全部批准实施的结果；当前先按§1完成最小减法与失败闭环，不启动十个包全面并改。新增业务护栏继续等待实际运营依据与用户明确要求，生产保持现状。

| 顺序 | 工作包 / 主责角色 | 覆盖ID | 模块关闭后用户实际得到什么 |
|---|---|---|---|
| 1 | **可观测与真实状态** / 稳定性＋前后端 | S02–S05、G03/G07、U09/U10/U17–U22 | 每次反馈可定位原任务；待核查不再伪装“新建重试”；能看到真正失败阶段并获得答复。 |
| 2 | **已接受任务的原结果持久化与续交** / 生成链路 | G01/G02/G05/G06、U03 | 找得到原逐图任务；已出的图在中断后仍可续交；原操作不再额外生成。 |
| 3 | **完整交付判定及像素合同** / 生成＋媒体 | G04/G15、G19 | 后处理未完成不报完整成功；原图不丢；最终尺寸、蒙版、格式及视频播放可验证。 |
| 4 | **账务状态与对账闭环** / 账务 | G09/G10、U14 | 图片可交付与扣费待核对分别呈现；不重复扣款、不长期无主冻结，退款可追溯。 |
| 5 | **用户编辑不丢失** / 画布前端＋数据层 | U01/U02/U04/U05 | 读取失败不假装空白，多tab不静默覆盖；重开能找回草稿及完整项目。 |
| 6 | **入口、幂等与历史反例** / 生成＋Agent＋测试 | S06/S07、G08/G12–G14/G20、U11 | 画布、工具、批量、Agent、Worker、刷新和原任务恢复遵守相同报价、归属与防重放合同。 |
| 7 | **供应商与新视频能力闭环** / 上游适配＋运营 | S10、G11/G17/G18 | 新请求避让故障通道，旧受理pin保留；目录参数真能提交，未知受理不变成二次购买；历史22笔逐笔处置。 |
| 8 | **可量化的容量与故障隔离** / 平台＋DB＋媒体 | S01/S11、G16、I01–I24 | 大图/视频不拖垮登录草稿；积压公平、有界、可解释；以最终制品的实测决定扩容，不用用户总数猜机器。 |
| 9 | **身份、权限与弱网大画布** / 身份权限＋前端 | U06–U08/U12/U13/U15/U16 | 企业撤权与账号切换边界明确；大量节点、低网速和多tab仍能稳定操作。 |
| 10 | **同版本质量门禁与持续发布** / 发布＋测试＋产品 | S08/S09/S12、U23/U24 | 关键反例自动拦截；用户体验指标可对照；只把整站同版本、蓝绿排空、真实验收及回退齐全的状态记作发布完成。 |

### 阶段出口

1. **现场与止损阶段**：固定真实版本；用户反馈有operation编号与阶段；unknown、预占账龄、交付漏斗、队列年龄和资源可见。旧已接受任务不重POST。
2. **业务可靠性阶段**：上述具体缺口经旧错/新对反例与真实入口验证；正常交付与原结果续交遵守同一账务、权限和冻结合同；历史案例仍OPEN的部分继续列出，不以新成功替代。
3. **规模与体验阶段**：最终固定镜像按校准负载完成阶梯/突发/混合媒体/24小时长稳与故障恢复；数据库、对象存储、供应商、前端及双槽容量同时有账本。扩容按测得瓶颈实施。
4. **发布与放量阶段**：另行进入已授权发布流程；同SHA关键suite、旁路真实角色/功能、三锁蓝绿、内部执行图同版、旧槽排空停止及回退证据齐全。当前47继续HOLD，本文不执行这些动作。

## 10. 汇总、证据与后续维护

本轮共 **80项行动/验证条目**：**35项P0、44项P1、1项P2**。P0是排期或相应放量门槛，不等于35个已复现的最高级事故；同一可靠性工作包的前端、后端和发布验收有独立ID。

| 组 | 负责范围 | 条目 | P0 | P1 | P2 |
|---|---|---:|---:|---:|---:|
| S | 产品验收与故障治理 | 12 | 7 | 4 | 1 |
| G | 生成交付、恢复与账务 | 20 | 12 | 8 | 0 |
| I | 容量、数据库、存储与发布 | 24 | 7 | 17 | 0 |
| U | 画布体验、身份隔离与运营 | 24 | 9 | 15 | 0 |
| 合计 | 全部行动台账 | 80 | 35 | 44 | 1 |


- S为横向治理，G为生成/账务，I为基础设施，U为用户体验/权限/运营。同一工作包可能引用多个ID；**条目数量不是独立漏洞数量**，更不是全项目漏洞总数。
- 每条详细台账已有证据分类、源码/历史依据、用户影响、具体动作、验收及依赖。负责人目前是角色，实施排期时绑定具体人；没有排期的条目保持OPEN，不冒填姓名或完成日期。
- 本轮仓库新增/更新仅本文件与AGENTS的产品目标；另按用户“切记”要求写入一份持久记忆补充。独立审阅原始报告留在ignored `output/product-readiness-100k-20261023/`；当前源码基线53a不等于线上实际版本。
- 文档核对只检查条目唯一性、优先级计数、引用文件/行数、占位清理、产品源码未变及Git diff whitespace；未执行应用tests/build/压测或生产/供应商操作。
- 维护顺序：复核当前事实 → 修复明确模块 → 大模块集中验收 → 更新ID状态和证据 → 选择性提交整合 → 依真实发布流程验证。重新打开文档时仍应保留未完成项，不删除已发生的失败日志。
