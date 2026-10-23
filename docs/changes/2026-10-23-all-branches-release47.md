# 全分支整合、47 发布与内存预算

## 本次授权与基线

用户明确要求合并所有分支、上线新服务器、旧容器可直接退役且当前无用户使用，并给新版增加内存预算。本轮目标为当前线程的 47.105.59.142；不连接其他历史服务器，不恢复业务数据库，不重放已受理或结果未知的付费任务。

独立工作树 `E:/Workspace/naumi-all-branches-release47-20261023`，分支 `codex/all-branches-release47-20261023`，起点 origin/main `53a6711effa68e05ba39ad2b415d672dcaf461f8`。共享根目录18项未提交改动不复制、stash或代提交。

## 分支整合模块

盘点422个本地/远端分支引用、278个tip，399引用已在main。实际普通合并：

1. `ee6fa655` 后台对话先分页后展开JSON。
2. `5aecb4c6` 创作记录批量账务聚合。
3. `f6f738ea` 画布文字节点通用生图和作用域接线。
4. `bd25048c` 参考图用途解锁、纯参考输入与自动画幅。
5. `c7701af6` 独立企业工作流源码归档整合；本次不创建其独立服务、数据库或入口。

上述合并无文本冲突。四个 t3 分支的补丁已等价进入main；五个历史回滚分支、backup、merge-only baseline保留，不把历史回退恢复成当前功能。即梦无限画布的撤销历史已由文字生图分支携带，不恢复用户撤销的功能。完整分类见本任务 branch-audit.json / branch-audit.md。

## 线上观察与运行预算模块

开工只读现场：当前SaaS Web/Worker均为 `5b8489d9` / build `1792705393`，共7运行容器。内核日志确认Web在2048MiB memcg上限被OOM杀死；不能仅凭重启后的OOMKilled=false宣称无故障。

新版使用创建起固定的容器硬限额、独立V8堆与Sharp/native余量，并限制内存占用较大的本机图像工作槽。供应商预算与用户受理队列保留；排队不以生成失败处理。初步审阅为Web2560MiB/heap1152、combined Worker1024MiB/主控heap64、主机可用余量至少1024MiB；最终取值须以固定镜像压力与退役后实际MemAvailable验收，不把Swap计入RAM。

本次新增无人窗口发布控制器，不伪造旧授权或修改历史事务。内存不足以双槽并存时，先封闭公网维护入口、暂停并核验当前执行、按精确身份退役旧业务槽、重新测量释放后的真实RAM，再启动新槽；数据库、媒体、Hub/Redis及历史付费UNKNOWN保持。此路径是明确授权的维护窗口，不标为无感蓝绿。程序回滚材料与受控维护闭包保留。

## 验收与交付状态

已完成分支合并及参考图用途基线/修改对照。内存配置、集中回归、固定Linux构建、压力与真实发布由本任务继续执行；未完成步骤不凭本文档标为已发布。最终命令、输出、退出码、固定源码/镜像/版本、资源、退役身份和四产物见本任务 VERIFICATION.txt 与最终发布回执。


## 最终镜像与本地集中验收（19:40—20:15）

业务镜像固定 source `30b2c47c95d96af136dfb0f85e7041ce694abfe2`、build `1792753247`、image `sha256:217b5bbcb8bff0f90e0893de5106ac9f0e6e163c591d29000c83790c99a0f2e1`，Linux/amd64 完整产品构建91页 exit0。新加的批次与参考工作台历史 guard 已包含在镜像，不以旧 a2abb/754b 镜像代替最终验收。

- 最终镜像16任务/本机4路：16输出、16模拟供应商POST，Web peak 2050379776 bytes，Worker peak359645184；4图与Worker恢复夹具也通过，memory.events max/oom/oom_kill均0。
- 最终镜像真实combined/native典型50MiB WAV→104857590B输出：fresh cold715.06MiB，warm716.91MiB，512MiB tmpfs采样峰388.82MiB；SHA与ffprobe通过，无OOM/Swap。旧大档200→400MiB ENOSPC原失败保留，不扩写成全档通过。
- 最终类型检查4096MiB exit0；1536MiB那次exit134堆OOM记录保留。history fence67 assertions及Canvas101/403、frozenCanvas138/1208、frozen/simplify PG、reference-workbench18组通过。
- 原creation-writers取消步骤409在main53a6711e独立基线上同错复现；原fail不改PASS。其他fixture环境闭合映射保留在manifest-closed。

## 精确历史保全模块

现场当前Web boot与24条旧boot记录分离。24条activity、18个直接jobs、3个关联父job、2batch、2reference及其15billing/15reservation/11suppliercalls/2queuedcostjob保持原行字节；只向origin_rows插入主25+related43元数据围栏，不改paid/status/lease、不重放、不结算、不退款。3个post-death TTL现已过期的旧lease按真实旧boot、原claim匹配及now过期验证，不把TTL延伸误当进程还活着。

旧Worker仍在原physical boot，1个01:57已结束为unknown的scanner receipt逐字段固定；不清为complete。NoUser专属分支要求paused、activeTicks0、media draining且running/queued0、controlFault明确null/false；新Worker仍必须unknown0且真实complete。原全局policy不放宽。新helper与NoUser接线65离线测试通过，独立源码副本回滚恢复原26项行为；实际PG CAS/触发器验证另列证据。

发布顺序为完整备份→准备停止态候选和三套入口→维护503→旧Worker/Web真实drain→同事务逐行CAS插入68个围栏→原始domain真实0且rawUnknown24精确集合不变→逐一退役旧槽→fresh MemAvailable≥4608MiB→启动候选。任一新activity、hash漂移、item fence或未排空事务仍HOLD，不以计数减法放行。

此阶段尚未切入口或退役旧槽。真实执行结果将在后续模块记录，保留原两次preflight HOLD与canonical revision744的现场记录。


## 发布前独立复核收口

- 远端main新增c94d9347，仅产品级10万活跃目标文档及AGENTS约定，无业务代码差异；已普通合入。root发现其47暂缓发布声明后向用户核对，用户本轮明确再次选择“按本线程要求，继续发布47”；不把该明确授权扩展到其他站点或规模达标。
- 独立review指出cancelBatch未查fence，故元数据本身不是DB保存屏障。本次不改固定业务镜像，在原serializable/CAS围栏事务内仅补batch/ref现有freeze_imported_row('id')触发器；其他5表精确enabled/function/key/tgtype必须匹配。原函数及business行不替换。
- 新Worker创建时精确传PID1 heap64双preload、bounded/MALLOC2/UV2。原scanner64/media96及fresh allowlist子环境不改；不会称所有子进程都load sharp。压测及native测试实际也是该combined编排，不推断不存在的子进程配置。
- 最终ops集中97项：Windows83执行通过/14既有POSIX skip；Linux96执行通过/1 host缺Node skip（实际Node observerdisabled已在Windows跑过）。首个Linux失败是NoUser fixture尚缺新增triggerMatch callback，追加fixture响应后重跑通过；只改测试，原失败保留。线上canonical/容器未由这些离线测试改变。

## 历史生成入口补合与最终镜像（覆盖前述中间镜像）

刷新远端后补合 `2f000869bb623b0fcf929fb028083558a736499c` 的历史生成入口；最终业务 source 为 `0175cecfad8d7e112e39f8012b054a09fd69db9c`、build `1792757830`、image `sha256:8a6023c93a66de94f6a0b50f9cb2a9a894c4fbafada3983e929ddf8de23f8432`。Linux完整构建91页通过；最终镜像压力16/4/worker与典型native复测通过，16任务Web峰1982.95MiB，cold713.49/warm718.38MiB，无cgroup OOM事件。历史入口原PG/实际组件UI通过，供应商调用0；其两个自有fixture DB已精确清理，共享库保持。浏览器清单绑定该镜像462个资产；prepared不记作live验收。

## Snapshot前置失败与精确接续（20:20—21:05）

完整数据库备份1043584318字节、可读校验及quote additive schema、最终镜像导入已ACK；canonical revision752，原journal为RECOVERY_REQUIRED，原3操作UUID与receipt保留。失败在只读任务snapshot首张image jobs proof SQL的15秒statement timeout；旧Web仍运行并公开服务，新候选未创建、维护及切流未执行。原Worker paused，历史UNKNOWN1未改写。

优化仅限 `app_image_jobs` 的proof投影：原生列先冻结摘要再构造窄proof，避开宽JSON重复复制；冻结payload/paid bindings、missing/NULL、graph closure、原5000行和15秒上限保持。本地独立PG旧新完整private.tables相等。相同最终SHA671983e6首次现场probe仍超时，失败证据保留；后续独立只读probe在原上限下exit0，总77.375秒，23表全部observed、6,529,130输出字节，解析确认preservationComplete=True。不将单次通过扩写为性能上限保证。

NoUser仅抽取continue_after_import，snapshot后要求tables非空且preservationComplete is True，才允许BACKED_UP/create。Windows集中102项通过（原POSIX14跳过）；47主机首次因缺Node可执行程序有1项测试前置失败，未删失败记录。随后只为该Node测试采用无网络/128MiB自有最终镜像fixture，Linux102项全部通过exit0（2.491秒），fixture自行移除，无正式槽位动作。

精确接续wrapper绑定原cfg字节/语义、revision752/canonical/journal/3ACK完整hash、原Guard全部proof与supplement、原quote/config/incident、完整备份、旧槽及gateway5文件闭包、最终161个Python模块、最终image配置和未加围栏的metadata。恢复内存Guard而不establish/begin，不改cfg expectedRevision744，不重跑3ACK。case05 succ引用原state journal对象，失败材料使用唯一nonce文件名保留原O_EXCL证据。发布仍待原continuation的全部实际门禁与前后浏览器验收，不因wrapper完成标COMPLETE。

## 切换前新增业务提交与候选替换（21:07起）

原精确接续通过snapshot完整性后，已ACK创建停止态0175候选、暂停旧supervisor、维护入口、旧Worker/Web drain及deadboot围栏。切换前发现远端新增 `e1ee8442443f4593c3220d4d7c9ae6729f0cb6dd`（计费确认减法），root发送SIGINT停止继续推进；中断发生在只读drain观察中。最新canonical revision766、RECOVERY_REQUIRED，原3项加新增6项全部ACK，零UNKNOWN操作，retired=[]。0175候选从未启动，两个旧槽仍running/draining；公网为真实维护503，不再描述为旧公网正常服务。原三项UUID、receipt及全部保全行未重写。

新业务已无冲突普通合并为 `e609c115164a68c5b3f88f353603237eed351d1d`，并普通推送origin/main及任务分支。替换镜像固定build `1792760965`、image `sha256:1bb8dbfd2f310f566922863fe0868ed9e9b28b6cc6f889360f645018732bcb6c`，完整Linux构建exit0。四组新pricing-friction原脚本全部PASS；16任务/4图/Worker恢复实际固定镜像压力通过、replayAddedSupplierPosts=0，16任务Web峰1931.82MiB，cgroup max/oom/oom_kill=0。新镜像典型native cold713.09/warm717.73MiB、tmpfs388.82MiB，SHA/probe通过、无Swap。

旧集中回归保留10PASS/4FAIL：三项仍断言旧报价二次确认/旧current版本拒绝行为，与新明确减法语义不同；另一scope fixture缺staging-history mock。原失败不改PASS，新增4组以及独立scope输出适配证据分别记录，不把聚合回归报告写成全绿。替换配置单独保存，不覆盖原cfg；追加有独立UUID的候选supersession操作，原9个ACK不重放、不覆盖。当前保全、备份、原preSnapshot及业务原始行持续作为最终比较基线。

## 最终 post 快照超时与保全核对（21:55—22:30）

pricing 精确接续已实际退役旧 Web/Worker（stopped/restart=no），启动最终 e609/1792760965 镜像并完成入口切换及前后 GET 浏览器检查。最终 post-task snapshot 首表仍遇15秒 statement timeout，控制器封回公网维护503；canonical revision802、RECOVERY_REQUIRED，23项操作均ACK、无UNKNOWN操作、preservationHold=false。该状态不是发布COMPLETE，旧历史UNKNOWN及原完整备份不变。

定向SQL计时证明选键9.805秒可完成，继续在同语句生成全部proof则超过15秒。snapshot仅优化proof/app_image_jobs：保留四轮graph closure，选键/计数后以256键一条SQL计算proof，全部留在同一READ ONLY REPEATABLE READ事务；原5000行、8MiB proof和每语句15000ms门槛不提高。冻结bd09e0c5，本地隔离PG旧/新/回滚等价均通过；实际完整post probe于22:10完成，76.531秒、23表observed、6,528,000字节、stderr0、exit0。该时间是全部SQL总耗时，不是单语句时间。

解析后preservationComplete=true，但原ec0578 pre→post原比较仍FAIL：恰好3条app_gen_reservations PRESERVED_ROW_MISSING；unknownTables=[]，原supplier binding未变。精确PK补查确认不是筛选漏行：对应三笔billing reserved→settled、charged6/reserved0，image billing_settled false→true且随后done；每笔原确定性ledger各有一条consume -6、reason为“原生成结果交付恢复”。源码stored-delivery→settleImageJob→billing finishTx会原子结算并删除reservation，done在后续事务写入。未据此清除supplier response-received或历史UNKNOWN。

root从原1043584318字节dump只读提取三笔reservation及billing原值，未执行DB恢复；真实PG按jsonb::text/sql_frozen语义复算六个原frozen digest全部匹配原pre。为保留原比较的真实性，采用单独exact3 lifecycle receipt核对原owner/价格/ledger/供应商身份闭环，不改原pre/post/comparator，不泛化允许reservation消失。最终接续器仍须fresh账务闭环、真实quiescent、fresh浏览器、完整原23ACK不变及原retire_ready全部门槛后才可COMPLETE；本节截至22:30仍为维护HOLD。

## 实际发布完成与最终公网验收（22:40—22:45）

最终接续器冻结 `feaaa18e5ea593183159e628c74363b091af4f6d307cada408d29c9e45df6367`，21项集中离线测试通过、独立最终只读review确定P1为0。root先实际只读预检原121文件＋完整dump流式hash、2789外部文件、5网关文件、161模块及fresh exact3账务SQL全PASS，再持三锁执行。严格接续从revision802到816，只追加5项新操作；原23条完整ACK记录逐字节语义编码比较不变，最终28项全部ACK、无UNKNOWN操作。

22:40:33+08:00对应UTC14:40:33签发 `PUBLICATION_RECEIPT.json`：phase COMPLETE，source e609c115、build1792760965，Web43975ba5dbf4和Workerb1b8861a991d同固定image1bb8dbfd。原quote FINAL、schema FINAL、CASE05、七表围栏和基础设施身份门禁全部通过。补证账务采用独立adjudication/accountedPreservationVerified=true、exact3、remainingViolations=[]；原comparison仍保留三条reservation missing，不伪造raw比较全绿。三个原结果交付恢复按各原价6结算，不产生新供应商提交；旧历史UNKNOWN未改为完成。

新Worker最终真实lastTick complete、active0、unresolved0后恢复常态扫描，supervisor timer active。新controlledMaintenanceReport精确指向pricing新emergency/report.json，hash与新gateway digest匹配，supersedes保留原pointer。旧Web/Worker停止且restart=no，未删除其恢复证据；新槽无原地改内存、无重启。额外只读三锁获取与释放核验PASS。

实际容器硬预算：Web2560MiB/heap1152/native余量1408，Worker1024MiB/PID1heap64双preload；generate/imagegen本机4路、suite/A+2路、MALLOC2/UV2/VIPS1。scanner64/media96原allowlist不变。实际检查新Web/Worker memory.events max/oom/oom_kill均0，MemAvailable约4065MiB，不计Swap；在线当前用量不替代前述固定镜像1931.82MiB压力峰验证。

最终独立公网HTTPS GET浏览器after检查全部通过，前后各10张桌面1440/移动390真实截图已逐张打开并检查contact sheet；marker已封存。历史生成同范围baseline非空、12328总数/20首屏和DOM一致。严格GET模式阻断模型管理页自动POST引起“Failed to fetch”红条，39行GET模型仍渲染；此红条原样留在截图，不将只读验收扩称完整写工作流或全部视觉无缺陷。未使用CDP或用户普通浏览器。

本轮最终为明确无人维护窗口发布，不宣称全过程无维护或无感蓝绿。未恢复DB、未重放已接受/UNKNOWN付费供应商任务；完整备份、原快照、旧源码及受控维护回退材料保留。后续提交仅保存运维snapshot分块优化及本记录，业务镜像仍固定e609，无需因纯运维/文档提交重建产品镜像。origin/main已刷新，无新业务提交；共享根18项无关改动未动。
