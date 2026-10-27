# 重构线发布103香港站

用户于2026-10-27明确要求将重构线发布到103香港站。本轮以该指定版本作为独立候选，不将重构线合入main，也不纳入本会话暂停的47本地诊断提交。用户指定分支部署覆盖常规“只从main构建”的来源约定，其余固定版本、备份、锁、蓝绿、排空和数据保护保持。

## 固定来源与首轮只读核验

- 重构线最新已封存tip：`95e08bd11520a51a0cc49791c60721f55fa397dc`（R6R）。其业务/验证输入与已验收`216220bd`相同，仅后续文档差异；记录中的完整Linux镜像为`78e13282…`，是否能复用须核实实际制品。
- 独立托管worktree：`release103-refactor-20261027/naumi`，任务分支`codex/release103-refactor-20261027`。此前诊断分支和未提交文档保持。
- 103 SSH直连在认证前断开，改用已授权47 SSH通道的纯TCP转发；103主机公钥独立核验、密码由本机DPAPI凭据解密并仅在内存使用。未更改47任何服务、文件、数据库或网络配置。
- 21:46只读：103 Web/Worker/media均固定`a57909b0`、同镜像`2c74d3c3…`；现有独立fleet、Hub/NewAPI/DB/Redis保持。Web入口回环13104，内部任务与公网规则均须重新核实。
- 主机约7941MiB RAM、5815MiB MemAvailable，磁盘54%/约53GiB可用；实际旁路预算、当前任务/活动、锁与canonical状态待进一步核对。未创建候选、未备份或切流。

所有配置、凭据、备份清单与完整原始证据仅进入ACL保护的忽略目录`output/release103-refactor-20261027`。后续随固定构建/候选/验收/排空/回滚和最终实际入口更新，不把原本地R6R验收冒充103上线。

## 最新候选与发布准备（未切流）

- 切换前刷新时，重构线封存了 R6S，固定上游 `38e4617951bc5ff2bb356b293e4db079b0eca5e1`；纳入原生导演节点和 Canvas 视频提交 owner。该轮已有57项 core、Linux包、125实际隔离runtime及36产品控件验收，本任务不重复整套。main另新增轻量后台，未进入已封存重构线，不混入本次指定分支。
- 版本预定 `1793111694`，仅整理画布导演/视频提交的公开说明。独立发布分支保留至重构线正式整合；**此分支包含整条重构历史，不得当作普通已完成功能分支自动合main**。旧47诊断分支仍暂停且不推送。
- 增加 `--lifecycle publish103-refactor` 窄的103蓝绿执行入口；使用原canonical与revision CAS、两把部署锁，保留历史未知事实。先验证今天已授权替换的原RESULT与已停止旧实例，才将旧staged handoff标记为被该次替换取代；不伪造历史排空，不删除/换目录绕过状态。
- 保留原HTTP Worker执行方式及128MiB限制；Web1536MiB、独立隔离媒体3072MiB。新版Web/Worker/媒体同镜像，Worker指向新Web、新Web内部自调用与媒体绑定一致；两槽峰值预算扣除已占候选内存，另留1024MiB主机余量，Swap不计。
- 新版仅回环13105，完整Nginx闭包CAS、隔离临时目录语法校验、平滑切流。旧静态文件与新版合并到新目录；旧槽须真实HTTP/Agent会话/共享DB fences/事务/锁/Worker tick/媒体队列排空后停止，restart=no。无法证明则保留候选与明确的CLEANUP_PENDING，不强杀。
- 备份只读可恢复性校验；R2验收仅随机小图上传、原图/变体字节、Range、下载与匿名拒绝，并精确清理本测试数据；不提交供应商任务。保留模型/积分配置摘要及原任务冻结语义对照。回滚仅程序和入口，不回灌DB/媒体，不重放收费任务。
- 本地NPM大包流式下载两次ECONNRESET；保留失败日志，用锁文件SHA512核对的公开包缓存补齐，含Linux SWC/Sharp/libvips。业务源码与锁文件未更改；镜像构建定义只增加显式离线依赖缓存。首个R6R构建不发布，改构建R6S候选。
- 离线发布门禁测试4组通过，覆盖目标/来源/镜像/版本/日期/禁止恢复重放、峰值预算/Swap和UNKNOWN操作。它们不代表103运行验收。后续填写实际镜像、备份、真实就绪、切流和最终排空结果。

## 固定镜像及首次门禁

应用固定 `cd00447eceb12da0ebb58528356f23deab96cd6a`（R6S上游38e46179＋发布工具和公开说明），版本1793111694，镜像 `sha256:d6b8ef7d168fb7eb31f8864548bf15f59f468940afdb6b1bce222b318e6f1480`。完整Linux构建、Web/Worker包校验、实际Node24.21/Next15.5.28/React19.3/Sharp8.18.7加载通过；241281851字节制品SHA256 `5e6261c6df48d9a32367b657668a892960736afebae2a77f42e2ee81e279665f`，103接收后字节校验通过。

14:49 UTC完成原canonical历史核实、配置摘要/原任务快照及新可读备份，导入镜像后瞬时MemAvailable未达完整5760MiB双槽峰值＋预留门槛，发布在创建候选之前ABORTED。旧a579三实例与全部公网路由保持，供应商任务0；两把锁退出后释放。稍后余量回到5778MiB。保留首次失败与原备份，不降低预算；新增受原配置/原canonical revision/相同镜像绑定的唯一续做入口，仅允许这次“未建候选且两项原操作均ACK”的容量中止，从原证据复原执行器并等候未改变的容量门禁。不重新导入镜像或备份，不抹去失败，不新建状态目录。控制器修订独立于已固定的应用镜像。

## 最终交付：COMPLETE

2026-10-27 **23:26:28 北京时间**完成整站切流、真实排空与旧槽停止；23:42再次核验实际运行。入口 `http://103.30.76.93/`，应用仍固定上述 **cd00447e / 1793111694 / d6b8ef7d…**。最终刷新远端，重构线仍为38e46179，main为00a27d6a；没有漏入未封存的业务提交，也没有将本重构历史合main。

- 实际新实例 `naumi103-web-refactor-20261027`、`naumi103-worker-refactor-20261027`、`naumi103-media-refactor-20261027`，三者同Image ID、相同SOURCE_COMMIT，restart=unless-stopped，OOM=false、RestartCount=0。原a579三实例均stopped、restart=no；Fleet/Hub/New API/DB/Redis等原独立服务保留。
- 两把deploy.lock与canonical文件锁均已释放。原canonical仍为唯一真相，revision **140**，`active103BlueGreenReleaseId=release103-refactor-20261027`，对应`blueGreen103Releases`记录为COMPLETE且所有操作ACK。顶层旧hk-immediate的PREPARED/BASELINED属于保留的历史记录，不代表本轮未完成；旧staged handoff有实际替换和已停止实例的明确superseded证明，历史unknown不改写为已完成任务，不重放收费任务。
- 新备份 **35,880,266字节**，pg_restore listing可读，SHA256 `a4041f1af2e8a899c8a2c1a40a0efdd07a0f83b2f2bea9d7334f32637eb55cf0`。未执行restore，未跨站复制数据。模型配置仍v112，模型/积分配置摘要保持。
- 旧槽排空覆盖真实HTTP计数、Agent owner、tracked background/unknown、共享库fences/事务/advisory锁、原Worker tick和媒体队列；未强杀。原任务对照`preservationVerified=true`，missing/supplier mutation/state transitions均0；不据此声称所有历史unknown已结清。
- Web内部调用127.0.0.1:3000；Worker实际origin为新Web容器，保留HTTP执行模式；Web绑定新媒体服务并验证其固定版本。23:42 Worker为IDLE、paused=false、active/unresolved=0，实际新tick在23:42:03提交、150ms完成，有原生server receipt，commit/boot/target均绑定当前实例。
- 发现原Router仍调用已无监听的127.0.0.1:13012。通过同一次完整Nginx闭包切换增加仅回环的精确容量回调，指向当前13105 Web；其余路径404。实际Router进程4460和凭据不变，来源/网络命名空间/管理token匹配；真实鉴权空请求400、匿名404，容量acquire调用0，未重启Router或开放新公网私有端口。
- 实际原生账号会话、画布及后台配置读取通过。真实随机PNG **9,381字节**经网站上传到原R2，原图及两变体3对象直接读回/摘要一致；网站读取、下载、Range206、匿名401通过，测试作品/对象/目录行精确清理。供应商付费调用 **0**。
- 外网Windows独立请求版本/健康200，DB健康；经真实Nginx的鉴权canvas HTML200、RSC200及text/x-component、CSS/JS资源200，公开说明绑定1793111694。没有以原R6S隔离fixture替代这些103证据；没有再次全跑57项旧验证或提交付费生图。

## 保留的中间失败与恢复边界

除网络/容量中止外，启动器旧任务名前缀、验收cookie短TTL触发原生issuedAt校验、后台需要独立nv_admin会话、媒体drain响应与health响应字段不同，以及首次Worker lastTick可为null，均在**发布工具/验收器**中修正；没有因此修改用户密码、降低鉴权、清除未知任务或修改应用业务源码。每次续做绑定同一配置、固定镜像、原canonical CAS、原操作及真实Docker/会话/任务观察；旧操作日志和UNKNOWN原尝试保留，实际创建后才ACK。

第一次切流后，首次tick观察器的null处理触发程序入口回退：恢复原a579入口/实例，候选实际排空并保留，未restore DB/媒体。随后核验原入口确实恢复、候选无当前活动、原R2验收和静态联合目录未改变，再以新的明确操作UUID重新切流。新版等待**本次resume之后、当前boot与commit的真实完成tick**，不使用旧receipt冒充就绪。最后23:26成功，失败未改写成成功。

恢复材料位于 `/opt/naumi-staging/evidence/release103-refactor-20261027`：FINAL_STATUS、FINAL_RECHECK、FINAL_EXTRA_CHECKS、原容器/环境、Nginx全部精确前像与每次切换CAS、可读备份、R2/任务/回调回执及完整失败日志。**不要直接运行其他旧任务的rollback脚本，也不要重跑本轮已完成的续做入口。** 后续回退须持两锁、固定实际基线、旁路就绪、任务/会话排空，审查新增导演数据与旧程序兼容；仅恢复兼容程序和入口，不回灌DB或媒体、不重放未知收费任务。

## 空间、同步及待办

本轮成功发布计1，完成本地/实际103空间审计。仅移除本任务3个已停止失败构建容器、2个Linux源码构建目录和从未发布的R6R镜像，释放 **669,532,160字节（约639MiB）**；保留当前镜像与依赖缓存。不删volume、不做全局prune。103磁盘 **55.77%**、可用 **56,032,239,616字节（约52.2GiB）**，服务器镜像、数据、备份和最近至少5轮恢复材料均未删除；本轮维护后的新基准计数0，既有历史计数字段未覆盖。

重构发布分支及此托管worktree按本次独立部署例外保留，包含整条重构历史及受保护私有证据，**不可整体自动合main或无备份归档忽略目录**。应用版本固定cd00447e；后续仅发布工具/交接提交不会改变已运行应用版本。原47诊断的3个本地提交与未提交文档仍保持暂停，不推送、不合并、不发布；47只承担SSH的TCP跳板，未改其业务服务/配置/DB。废弃120/179/101未连接。无跨站数据同步、域名修改或额外付费生图验收待暗中执行。
