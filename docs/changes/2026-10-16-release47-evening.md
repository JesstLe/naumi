# 47主站与香港103今晚18:30单次上线 / 2026-10-16

## 用户授权与调度
- **最新覆盖：用户已明确回答“本次接受短维护迁移，保留任务和数据”。本次18:30允许短维护，不以本轮无感蓝绿或legacy完整排空为已通过；之后恢复标准蓝绿。** 原下述常规蓝绿标准仍用于后续更新；本次按单次维护迁移记录，不修改旧进程计数为0以通过原门禁。
- 用户2026-10-16北京时间13:32明确：今晚18:30直接上线，届时无人使用，并要求解决本轮全部已列待解决问题。
- **最新用户新增“可以顺便更新到香港站，香港站无人用”：本窗口按47.105.59.142→103.30.76.93顺序执行。** 授权覆盖本轮修复后的双站发布，无需再次请求同一发布确认；不扩大到其他站点、购买资源或破坏性数据迁移。两站数据/媒体/凭据独立，不互相同步或覆盖。
- T3调度已创建，绑定当前线程3e153cf4-dc4a-4aab-853b-0bccd1905a87。
- scheduledTaskId: scheduled-task:command:mcp:653ace73-a7fb-4307-b5b9-a247be31d240:schedule-task:release47-20261016-1830-bjt-once
- nextRunAt: 2026-10-16T10:30:00.000Z，即北京时间2026-10-16 18:30。
- 当前调度标题已更新为“主站47＋香港103今晚18:30上线（2026-10-16单次）”；沿用同一scheduledTaskId，不创建重复预约。
- 调度器底层按周五18:30触发，任务提示词限定2026-10-16当晚且要求第一次执行立即禁用本调度；不是每周发布授权。过期不执行，不创建第二个同目标调度。

## 本轮问题清单及完成标准
1. 内存：以最新MemAvailable、cgroup anon/file/peak、候选真实业务峰值核算；47不构建，保留至少1GiB主机余量。受控旁路一个Web+同image Worker；无序增加实例或依赖Swap不通过。
2. 旧槽：逐容器固定ID/image/启动时间、Nginx动态及内部引用、系统服务/Worker调用图。只退役证据充分且自然排空的槽；没有引用不等于会话/任务已结束。
3. Worker：新领取与已接受工作分开；旧tick自然完成，新Worker暂停启动，持久控制CAS/幂等，UNKNOWN使用原operation回执核对，不重复发送tick/供应商任务。
4. Agent与App：活动请求、Agent会话、App后台任务及租约可核实；SSE/steer/stop继续归属原实例。旧实例无控制端点时标legacy/unknown，需迁移方案实证，不以数据库历史或TCP0冒充完整排空。
5. 旧客户端：静态JS/CSS原字节保留，RSC/ServerAction兼容验证，原画布保存和任务查询跨切流可用，不强刷。
6. 统一执行器：完整计划/三锁/基线CAS/备份/旁路就绪/切流/故障切回/排空/收敛状态闭合；不是只安装门禁再报告阻断。
7. 用户功能：Skills账号隔离/点击拖放/独立包装页/画布布局进度批次/BI作品权限和模型链/比例完整画幅/禁用通道与原路GET恢复，受影响功能集中验收。

## 已有产物复用
- worktree E:/Workspace/naumi-release47-20261016；branch codex/release47-integrated-20261016。
- 固定业务source5405d23，BUILD_VERSION1792127247，image sha256:8f2b379b386f3b910dfa7cff93ddbfa7403558c4285c1d48aea54650c5c9f857；后续代码改变须重新固定SHA、构建及相应验收。
- 最新文档ae95750；源码/镜像/patch/原始hash/BASELINE100-MODIFIED118-ROLLBACK100位于E:/Workspace/naumi/output/release47-integrated-20261016。
- 上轮26项集中回归及本机新镜像密码登录/导入/保存/390px通过；不是正式生产验收。
- 13:23实时基线只是历史快照：13容器；MemAvailable2119MiB；公网f4b3df1/1791989816；active模型配置117。18:30全部重读。
- 共享主目录18项未提交后台UI仍受保护；吉祥物仅设计及他人暂存Dock不擅自导入。

## 执行原则
- 用户预期无人使用不是后台已排空证据；18:30仍核查实际活动。
- 每次服务器变更蓝绿、共持三锁：/opt/naumi-staging/releases/deploy.lock、/opt/naumi-reverse-hub/releases/deploy.lock、/opt/reference-workbench/deploy.lock。
- 不原地重启在线槽、不回灌DB/媒体、不重放已接受或未知付费任务、不并行清退、不输出秘密。
- 当前生产未变更。后续每个模块记录实现/测试/未完，最终记录实际生产版本、Web/Worker image、内存、连续性、旧槽停止与回滚证据。

## 本次短维护迁移补充（用户明确接受后）
- 白天继续本地整合、固定构建和模拟演练，18:30才进入维护；不提前切线上入口。
- 开始前新鲜核对三锁、主机identity、全容器ID/image/启动时间、Nginx完整闭合、来源配置/媒体、独立后台与任务账本；获取可读一致性备份及原配置回退材料。
- 维护仅阻止新创作/新任务，不修改用户数据库、积分、媒体或供应商任务ID。公网入口维护与容器内部任务分开，不能认为维护503等于Worker已暂停。
- 旧5fc Worker是fetch+setInterval，无SIGTERM handler或tick回执。若先冻结旧tick caller，明确记录为冻结迁移而非自然排空；已发HTTP的App执行需继续核查。不要同时恢复旧caller和新版Worker。
- 核查每个旧Web的NAUMI_VIDEO_WORKER环境；非0可能存在本机20秒扫描，不能只停外部Worker后声称领取关闭。
- 原非终态任务逐表留存，关联原供应商ID/冻结参数/价格/账本与租约；区分可GET恢复、从未提交、有供应商幂等保障、未知提交及纯内存执行。未知/已接受任务禁止重新POST。尚未持久的Agent/工具/文本结果仍须等待或保留原进程，用户接受维护不等于允许丢失结果。
- 可恢复未终态保持原记录，不回灌备份，不靠批量error/退款/清租约来宣告完成；无法确认的单独保留清单与原槽，迁移及清理状态分开。
- 候选同image Web/受控Worker限资源启动；Worker初始paused，核对恢复边界后再resume。原任务恢复和用户新任务并行前检查原归属与幂等。
- 恢复公网前核对真实版本、登录/DB/私有媒体、Skills/包装/画布/BI权限、旧页保存读回及原任务查询。失败切回原程序入口，保留当前DB/媒体/任务账本，不回灌、不重放。
- 已核实的旧槽逐一关闭自启及退役；仍执行或未知的原槽留存并记录CLEANUP_PENDING，不批量停止基础服务/其他负责人实例。

## 下午整合进展（阶段结果，不代表生产上线）
- 已集成Worker持久tick回执7ae3e4f、host原UUID GET-only核对781eded、Agent账号/boot所有权与租约6a66783、真实进程HTTP preload f34dc29、网关/静态闭合02770c8、全量只读盘点d214b1e及tick-Web preload boot绑定ec9f1de。
- 已只读采集6旧Web完整static、原alias字节和4个nginx源文件精确bytes/realPath/SHA；未采集prerender预览密钥。真实旧canvas镜像c952f4a流式取回本地，242561341字节，SHA2569347e7a7051102ffad3441050558a91918f598830a72e988637c692814b3f33e；47无写入/构建。
- 真实6旧static+5405候选并集717文件/10892916字节，无同URL冲突。旧页面在新API保存/undo/redo/PG读回已通过；跨build主动Next Link出现MPA reload，不能称RSC无感通过，维护兼容边界继续实测。
- 本机新Web初轮约270.5MiB cgroup峰值是合成测试观测，不是最终候选或生产重负载峰值；最终版本仍需重新固定构建及资源验收。
- 新后台已接受promise/claim租约、Agent续行proof模块正在独立实现；legacy任务只读快照/比对及统一维护执行器正在收尾。
- 已核对18:30预约enabled=true/nextRunAt=2026-10-16T10:30:00Z，并追加用户本次维护许可，触发后仍立即禁用避免周循环。

## 香港站新增范围与实时准备
- 103只读现场文档：`docs/changes/2026-10-16-release103-evening.md`。两站独立持各自锁及baseline，47三锁、103现有Naumi/Hub两锁；本轮不因默认旧文档连接其他主机。
- 103公网真实8af8ee6/1791975598，machine-id SHA26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35；31运行/38总容器，RAM7941MiB、可用约1053MiB，Swap近耗尽。保持至少1GiB余量，不能直接加三新槽或在103构建。
- 103有真实普通、desktop、enterprise三编译前缀，原R2/private、账号/积分/配置/媒体保留。需同固定最终业务SHA的三种构建，不能用47普通image覆盖三类型；Fleet门户13062独立保留。
- 103完整Nginx有65locations/21端口，历史static回退链最长8级；无引用不等于可停。只读采集当前完整static/原磁盘root和exact配置，先物化原URL字节再移除历史进程依赖。103候选配置适配及维护恢复另行实测。
- 103直连SSH及本机SOCKS曾banner EOF；经已授权47仅SSH direct-tcpip中继到103，独立固定hostkey与DPAPI认证只读成功。没有借用废弃主机；两站未做任何发布写入。

## 最终候选复核中
- 首次下午完整Linux固定9138b0ab316e768802db96f26214a3115bb56e9a / 1792131956已构建成功，完整TypeScript0。此image尚不可交付：后续真实middleware整合审阅发现GET tick receipt被feature gate提前401，虽直接route59项通过，真实入口尚需精确修复。
- 原9138和5405镜像、各失败日志作为历史证据保留，根等待业务修复后重新固定公开条目/业务SHA并重建；不将旧构建签成最终版本。


## 15:20 最新覆盖：Dock整合、真实任务双采样、容量
- 再次fetch origin/main及全部同事分支；main仍c2634fba，发现同事14:55已完成/推送的视频节点Dock004dd038，无冲突cherry-pick为7de4de5。实际整合Canvas八文件与负责人副本逐SHA一致，原生Edge21组/完整tsc exit0，保留原epoch/layout保护。随后固定公开条目与**业务0614f9ae6f9174bf804ca3e98dd7011c54010838 / BUILD_VERSION1792134697**。ops/docs后续HEAD不等于应用source；6272是已经完整验收的前候选，不覆盖其证据。
- 本机Linux仍6GiB RAM/swap=RAM、2CPU、Nodeheap4GiB串行四构建。main d04a89ae12f2904f6b85b782b918d1ca023f4e398a7b055e7a831d02cd451b82、HK0145e1989be2ebb60fa2cd5d5fbc6bdb3907acd48f2bd1b19b9d87bca089cf53已exit0；desktop首尝试DockerHub TLS handshake timeout（在读取基础镜像元数据），保留失败日志后相同固定源码重试。最终以output/release47-evening/final-0614/IMAGES.json及每项exit为准，不拿main成功冒充四构建成功。
- 0614main已重复两轮真实旧客户端→新API save/undo/redo/PG读回/回退，以及46项真实image/Worker entry/control验收。896MiB/heap512峰385.86MiB、旧254.39、Worker38.89，memory.events全0。721实际static与4CAS新包通过；这不代替受控生产并发观测。三UI/统一HK候选另记实际结果。
- 已修正supplier未知状态覆盖、真实frozen请求/owner/wire_model/plan/output ref，并用**最终helper f34be35ba0df1fbcd1a98a1a737fcf02469a705913f82c7eb2ace7bf6538d19b**在47、103各真实只读双采样。两站preservationComplete=true/preservationVerified=true/noOriginalSupplierMutation=true、unknownTables=[]，47允许6新关联行、1030，REMOTE_EXIT0。两站23表的原ID/绑定/digest及ledger比较通过，**drainProven始终false**，不是后台已空。
- 真实私有证据各站在E:/Workspace/naumi/output/release{47|103}-evening-20261016/task-proof-final-{before,after}.json、task-proof-final-summary.json。完整原payload和加密凭据仍需当晚可读一致性DB备份；proof不是恢复备份，reservation正常消失仍保守审查，不凭comparison自动退款/重放。
- 15:28只读47：RAM7270/MemAvailable1753/SwapFree4095MiB、13运行、canonical current.json不存在；所有Web已知video timer为0（auth-login旧独立Node服务无worker secret）。主Webcurrent约2387.83MiB。Nginx完整SHA仍f854851f4c836f2bd4e12425e5ea0944c23c9fd44a7021fa81912b00f37a97e8。当前**未达到896+128+1024=2048MiB**预算，18:30须重采并处理确证的冗余，不先进入维护再强切。
- 15:06只读HK：RAM7941/MemAvailable1045/SwapFree0MiB、31运行、canonical无；旧Web视频timer均0。三新Web需要3840MiB，仍不满足；已审阅单HKmain实际包含三UI routes，正在本机验证显式unified-web-three-ui以降为2048MiB。只有真实三UI行为/权限/媒体/网关验收与session schema通过才采用，不能根据源码就宣称等价。未知内存Agent/后台原槽继续保留，不依赖swap、不批停历史容器。
- 服务器仍仅只读，没有上传、创建/停止/暂停容器、Nginx/DB/媒体写入。单次预约仍同ID、enabled、18:30北京时间，提示词已更新0614与真实容量/任务结果；触发立即禁用防周循环。


## 16:05固定候选准备完成项（上线时仍读最新追加）
- 四种0614构建已全部exit0；desktop第一次、enterprise第一次网络TLS失败保留在final-0614日志，相同源码有界重试成功，不调整业务绕过。builder自有进程已stop。四ImageID与字节见`output/release47-evening/final-0614/IMAGES.json`。
- main `sha256:d04a89ae12f2904f6b85b782b918d1ca023f4e398a7b055e7a831d02cd451b82`；HK统一 `sha256:0145e1989be2ebb60fa2cd5d5fbc6bdb3907acd48f2bd1b19b9d87bca089cf53`；desktop fallback `sha256:93d9041c54cae492008501dc728b33601cef64904c9d18b809f7732dc04479ec`；enterprise fallback `sha256:5d72d2df1cbd8676e1dfb15312a399b434c109e7aa095fd324179b2af9db8124`。
- 4镜像离线包已stream重新读Docker manifest：`E:/Workspace/naumi/output/release47-evening-20261016/final-images-0614/NAUMI_FOUR_IMAGES_0614.tar.gz`，772670707bytes，SHA256`6a388eb20d609c98337476133e22de06dea68fd475fff72b093cfbe154480f7b`。各站仅需其单Webimage+同imageWorker，目标专用256MB包与独立manifest同目录，不必把全部4image都导入内存/磁盘紧张机器。
- 最终47 package：`E:/Workspace/naumi/output/release47-evening-20261016/final-prepared-0614`，721真实static、4 exact源闭包/4CAS链，静态tarSHA`7581ca1b87a5f7495f442ef57a3a5e1f4fd500f663831336f79250d21861cdbe`，privategateway tarSHA`796552ab616c24881699e7c92bc840910d46afd9ba5dabf795e8a9badc672125`；`gateways.json`根相对descriptor SHA`5ca262985537e3e8576e122cf781db73b74898c79e25e99b6acac01966b69875`。旧source symlink/17847/TLS/alias保持，两种rollback均真实Nginx验证。
- 最终香港明确采用**runtimeTopology=unified-web-three-ui**候选（一个HKmain实际Web，三UI都在同一编译产物；不是三常驻Web）：普通/desktop/enterprise真实同cookie/同boot水合与角色交互、desktop真实文字画布、新旧API别名身份、私有媒体字节/匿名401/其他账号404、企业其他账号403，最终**6262断言PASS**（包含3027静态逐HTTP/双hash），pageerror0，896MiB/heap512峰324.07MiB、memory.events全0、swap0。三独立image fallback也实际HK37/desktop51/enterprise39通过，不混作unified证据。
- 统一HK结果：`E:/Workspace/naumi-release47-app-drain-20261016/output/final-image-0614/unified-three-ui-result.json`，SHA`e79cfdd82ad29dcebd7b9fe85db01c5a71c0fea9fda374fe2c9acaa6d9f13420`。附direct loopback response/bodyHTML/PNG/visibleRoleDOM和同boot描述符；本机旧boot绝不可当作当晚生产验收，runner须采新的实际绑定。
- HK网关新包：`E:/Workspace/naumi/output/release103-evening-20261016/final-prepared-0614-unified/package`；旧2684+新343=3027URL，冲突0，root/desktop/enterprise三prefix各1371/670/986，旧字节保留。新HTML三UI都用root chunks，旧bundle仍可走desktop/api别名，同runtime处理。Fleet13062/deny/R2权限不变；不是删除desktop/enterprise功能节省内存。
- HK sealed tar（两个解同一根）：`naumi-hk103-evening-0614-unified-deployment-verified.tar.gz`11123759bytes/SHA`e64afb84a8eaea73b8b420cc84d0bdd4aebe0c5562f3b0d35047886867443f49`；`naumi-hk103-evening-0614-unified-rollback-private-verified.tar.gz`57873bytes/SHA`06dcb8f1896872e5f6002efb22f64c47d23ed783e974ab02565f54e9cb0eb4fa`。完整65class/Nginx-T/TLS/防伪/3027×candidate+maintenance HTTP/MIME/复制rollback通过，未上传。
- session修复14d1dde已合入：同UUID/no-startintent+精确stopped身份才可重gate，backup全量pg_restore解码到/devnull不连DB、gateway自动回原后同UUID精确闭包重审；503前总MemAvailable预算、全程caller frozen+旧Webtimer0复核。香港显式单Web须desktop-ui/enterprise-ui真实PNG/DOM/response，不收HTTP200壳；仍保留默认三image门禁，不靠改manifest绕容量。
- 根集中ops最终`python -m unittest discover -s scripts/ops -p test_release*.py -v`：199tests OK/16条件skip，另prepare3tests OK。第一次因未传私有dump路径而setUpClass失败保留；设置`NAUMI103_FULL_DUMP=C:/Users/13357/.codex/worktrees/release103-evening-readonly-20261016/naumi/output/release103-evening-20261016/nginx-full.txt`及actual捕获后通过。Linuxsession/rootcontrols此前97tests通过（仅2PG条件skip），真实Nginx另有完整证据。
- 16:00只读两站source mount审阅：47原main有readonly `/app/public/reference-workbench/native-bridge.js` overlay，210878bytes/SHA`519c48d6e30bec6c54d7b4b786566d56fb9039efb54b3beef32f70931048cb0c`。stopped最终image实提同文件**相同字节hash**，故manifest可reviewedOmittedMounts显式此destination→此hash，省去程序overlay而不丢桥接功能；不遗漏/data/media。HK source仅数据mount无程序overlay。两站实际legacy worker脚本SHA都`f59106f0e527c2c5beee1b396fa80a84204cdd532d7fe7e3deda19940bb89a64`，freeze前仍实核。
- 最终source四件在`E:/Workspace/naumi/output/release47-evening-20261016/final-source-0614/`：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、LF executable ROLLBACK.sh；329改路径原hash与原ZIP保留。真实isolatedPG BASELINE100/MODIFIED118/独立副本ROLLBACK100均exit0，329原hash全回、应用源码保持新实现。此脚本只回滚隔离源码，不操作线上DB/入口。
- **仍待现场闭合：两站RAM净余量均低于2048MiB；legacy纯内存Agent/后台不完整可观测，不能据快照/用户离线自动停旧App。** 正补逐CID历史UI角色/入口隔离/引用/观测/有限graceful退役与原CID恢复工具，证据不足保持UNPROVEN_VOLATILE_WORK，不伪造自然drain0。不得先强切或批量停旧槽兑现预约。发布窗须刷新真实数据，明确迁移成功与cleanup debt，条件失败保留当前公网服务。


## 16:30保护内存的真实补充
- 可选512MiB/heap256档不是可用候选：旧client两轮和runtime46虽通过，但同一实际Web在4096×4096PNG真实上传/owner读取后，首轮local-image-edit process/downscale2048发生socket hang up，Docker OOMKilled=true/Exit137。停止该档测试、未提高或重复512掩盖；未执行的Sharp后两轮/Skills/包装/HK6262明确未完成。不能为了门槛1664MiB而采用512；无最后已销毁cgroup事件不等于事件0。
- 独立896默认档验证相同payload，不是512重试：main4096PNG实际私有上传/owner字节/他人404、真实HTTP resize fitinside2048并完整decode连续3轮、Skill导入/编辑/精确读回/账号隔离、包装保存/revision/读回/他人404，50项通过，峰602.67MiB/events0/swap0。HK同档50项通过，峰582.74MiB。
- 香港896同真实进程再做**仅2并发**HTTP process POST：相同owner/source、不同operationId，两个start发生在任一response之前；两响应均200/2048，峰692.93MiB、OOMKilled=false、cgroup events全0。100ms资源采样和HTTP/DB/解码证据保留。此结果不外推3/4并发或40MP极限；896仍是本次最低经过代表性大图实测的档位，不降cap，不用合成shell峰替代大图容量。
- 证据分别`E:/Workspace/naumi-release47-app-drain-20261016/output/optional-profile-0614-512`与`optional-profile-0614-896`，原失败证据保留，task-owned fixture清理另记负责人回执。产品source0614不变；只增测试/docs，不重构镜像。
- ops exact安装包`E:/Workspace/naumi/output/release47-evening-20261016/final-ops-0614-exact/RELEASE_OPS_FIXED.tar.gz`，125828bytes/SHA`c99d67160405ad25ef324bca7ee87dcdbe8030f27cb544ccd11049509b3e0b09`；保留15members真实验证源字节（含原CRLF的snapshot f34be35b），Linux导入/CLIhelp exit0。无-exact目录仅归一化旧证据，不作安装源。legacy bounded audit6tests通过，但真实collector/任何旧槽退役与RAM回收尚未验收，完整Next有Agent入口不能凭历史UI描述解锁。


## 最新覆盖：用户要求立即香港发布（2026-10-16 16:41起）
- 用户明确“现在就上线香港”，随后Continue。103立即独立执行，不等待18:30，也不要求47前序回执；47仍留原18:30窗口。即时HK-only授权模块bc39ae9只限本日/103/精确两ack/notBefore08:41Z，不改RAM/任务保护。
- 调度器MCP目前返回Transport send error，更新同一预约范围未获确认；18:30必须先读本段与香港当前canonical/实际结果，不得重复香港发布或重放原UUID。原用户最新指令覆盖旧预约文字。
- 本机TUN同时导致两SSH及47 HTTPS banner/EOF；没有改用户代理/路由。绑定单连接物理网卡后103 pinned hostkey+DPAPI直连成功，47无需中继。实时103machine/nginx与原baseline相等、canonical无，MemAvailable1072/SwapFree0，完整数据保持。
- root已建立**同一process持HK两锁**的即时控制器，私有现场证据路径`/opt/naumi-staging/evidence/hk-immediate-20261016-0614`。固定镜像/静态/回退包开始逐文件hash上传；尚未切入口、停止/暂停业务容器或启动新任务。暂时无法满足内存预检，正在核实六历史UI实际内存Agent/当前连接，而非强停腾空间。
- 本机操作材料`E:/Workspace/naumi/output/release103-evening-20261016/immediate-20261016`，RPC日志private，控制secret/原数据不可输出。启动前长SSH exec命令被远端reset，未建立事务；随后使用受保护bootstrap文件单命令运行成功。未知先原目录核实，不另起并行发布。


## 19:25预约47实际结果（覆盖旧准备状态）

47已切最新7bdcd8b644e8771646003f68055585f257df40f0 /1792146767，Web/Worker同image14a8d2ab2c76。19:00:05–19:14:23短维护，119生产API/真实浏览器文件上传+拖放/包装保存/画布撤销重做、1029真实静态HTTP逐hash、切后任务proof通过；无OOM，三锁已释放。canonical MIGRATED_CLEANUP_PENDING rev34，七旧对象保留、原caller paused，新容器restart=no且新boot恢复未验收；不是完整退役/自动恢复完成。香港即时原事务不动。完整实际证据、失败纠正与四件回退材料见[本次结果](2026-10-16-1830-release47-main7bd-result.md)。
