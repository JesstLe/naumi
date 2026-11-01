# 重构工作区：当前交付快照

## 当前推进：R10D 远端对象 PUT 同任务证据

[R10D](changes/2026-11-02-refactor-r10d-remote-put-evidence.md)补 M06 的真实签名对象HTTP写失败，不用本地fs测试冒充网络边界。原087产品在六场景基线全部正确：一次供应／一笔6积分／原PNG／原GET done，独立进程恢复和原mirror补传保持；产品修改0，新专项沿原generation目录登记，总226／组23，固定99e原顺序23子命令单次全PASS（顶层局部PARTIAL/exit2）、runner20/370及非增量tsc/lint0。实际浏览器及云存储基础设施未在本轮验证；回退与同源CI归本轮DELIVERY，整体ACTIVE、未合main、未发布。

## 当前推进：R10C 历史批次回执与陈旧观察

[R10C](changes/2026-11-02-refactor-r10c-historical-batch-retry.md)真实旧派生NOT_ACCEPTED回执仍触发新购买；并发旧tick还能把原第二轮推进到第三轮，账本12而批次仅报6，九条基线已完整复现。生成应用owner现在共享明确证据归集／只读重试接口，批次在锁前读取、锁内匹配原childID＋attempts。首次候选九条PASS：无证据2POST→1，明确未收费仍正常2POST／6积分，并发3POST2consume→2POST1consume。原顺序generation22/22子命令已实际PASS，局部scope顶层PARTIAL/exit2；固定db3a完整镜像102浏览器PASS／8consume48积分、非增量tsc/lint0；四产物按本轮DELIVERY，225登记不当作全跑。整体ACTIVE、未合main、本线程部署0。


## 当前推进：R10B 供应拒绝证据归属

[R10B](changes/2026-11-02-refactor-r10b-supplier-rejection-ownership.md)真实PG／租约／handler复现无证明403被标NOT_ACCEPTED、批次自动购买第二次。模型执行owner在原usage保存逐图身份，纯政策与只读接口核对完整明确未收费证据，父任务只消费结论；不加确认或等待。原七场景复现、新七PASS，无证明批次POST2→1，明确未收费仍2→2；正常6积分／socket未知／客户释放保持。15纯政策、原parent25／首checkpoint5／quota／runner20-368已通过；固定d579完整镜像已构建，原96＋新6实际102PASS／8consume48积分；原顺序generation21/21子命令exit0，顶层按局部scope返回PARTIAL／exit2，不将224登记当全跑。整体ACTIVE，当前CI／剩余矩阵／语义审阅及合main继续，本线程部署0。


## 最新整合：R10A 保留当前 main

[R10A](changes/2026-11-02-refactor-r10a-current-main-sync.md)：R9Z封版后推送前fetch发现main推进ca63c76f，原推送未执行；普通合入四个ops／发布记录文件，无冲突。原task-snapshot22项（21通过／1跳过）在基线／新源一致；新增row-fingerprint28项（20通过／8跳过），不把跳过的真实PG／Docker项写成PASS。2149产品、1737既有scripts、5105编译器输入raw不变；R9Z真实96浏览器与Go/PG结果保持原执行source，不重标为新merge执行。保留同事已发布47主线的历史证据，本重构仍未部署／未合main；最终整合快照归R10A四产物。整体ACTIVE，当前CI和剩余矩阵继续。


## 当前收敛：R9Z 同一付费任务断网恢复与验收运行器

[R9Z记录](changes/2026-11-02-refactor-r9z-paid-disconnect-acceptance.md)：完整固定61ef生产镜像的 Web＋Worker＋真实PG＋双浏览器，原92项加新增4项单次 **96 PASS**；8笔消费／48积分。真实Canvas点击→原scope pending→一次held供应POST→浏览器offline→后台原图／作品／单次6积分→联网点击“检查原任务”→相同回执／字节／pending退休→再次重载零新增。无route mock／seed done／额外付费重提；浏览器offline仿真不代替物理断网、服务器故障或供应UNKNOWN。

经典原生UI共享runner现在在切换sourcecopy前绑定Router输入所属根目录；真实PG旧路径复现`Fixture Router build failed`，与旧61ef Image annotation相符。相对／绝对路径及准备页面的真实子进程122检查通过；完整business真实Go／PG／页面重验已exit0，价格75、工具目录、Canvas文字目录、移动端及非管理员404通过，供应商POST0；回滚以R9Z VERIFICATION/DELIVERY为准。保留原30秒导航和120秒fixture启动预算，不为绿灯扩时。产品2149文件raw不变；原166断言AST文本保留、lint／非增量tsc0。

旧61ef Core实际执行93edc006 SUCCESS，GitHub API核实两者tree相同；旧Image仍FAIL，不能标作新head已绿。整体ACTIVE，M03/M04/M06等剩余矩阵、完整语义耦合审阅、当前CI及候选合main继续；**分支超48小时，退出证据未闭合**。未发布，47HOLD。


## 当前整合：R9Y 同步最新 main

[R9Y记录](changes/2026-11-01-refactor-r9y-main-sync.md)：收尾fetch发现main推进到67bbcddf，已在独立分支普通merge并保留原5个文件；无冲突，不改main、不执行发布/退役。旧公开目录32条、新33条及原完整合同通过；incoming扫描证明27个unittest通过。R9W首结果修复与R9X11模型组保持原source证据，不重标成整合头完整223PASS。最终源/类型/副本回滚以本轮DELIVERY为准；整体ACTIVE，部署0，47HOLD。

## 当前收敛：R9X 发布草稿冲突验收

[R9X模块](changes/2026-11-01-refactor-r9x-model-draft-verification.md)在完整b24/02ff源复现注册模型execution第209行错误预期：发布者旧revision先触发DRAFT_CONFLICT，不是别人的旧base。现分开保留两个严格负例，旧base仍要求PUBLISH_STALE_DRAFT_BASE；原顺序11命令单次全部exit0，产品2149文件与02ff完全相同，R9W首结果修复保持。远端b24失败组已确认，但blobEOF不冒认唯一child原因；新headCI/main/完整223/其余故障继续。完整源/回滚见本轮DELIVERY，整体ACTIVE、部署0、47HOLD。

## 当前推进：R9W 第一次供应原结果检查点

[R9W模块](changes/2026-11-01-refactor-r9w-first-paid-result-checkpoint.md)以真实入口/PG/lease/回环供应返回，补M05原来未覆盖的首笔paid结果SQL断点。原五场景复现三种瞬时写入/COMMIT ACK故障都无交付且hold6；新五场景通过，同token本地保存最多再一次，不重放供应POST，原图SHA及单次6积分结算保持。持续写失败保留hold和原intent，提示保存未完成/检查原任务，诊断不再误归supplier-result。最终相关回归/类型/源码/副本回滚以本轮DELIVERY为准，不把HTTP提示当实际浏览器视觉验收；223目录未本地整跑。b24的Image实际在注册模型组FAIL，原blob日志EOF，唯一child原因仍OPEN；整体ACTIVE、main未合、部署0、47HOLD。

## 当前推进：R9V 经典发布与原生验收

[R9V模块](changes/2026-11-01-refactor-r9v-classic-publication-lifecycle.md)先复现原business-ui的goto/reload load等待超时，保留本机OOM诊断；转到依赖锁一致的Linux当前源码Next dev后，完整业务入口通过，批量配置抓出同一发布者第二次正常发布被旧draft base拦住的真实产品缺陷。原事务只推进本人、内容仍等于确认发布版本的草稿base/revision；他人旧草稿、在途编辑和原回执保持。PG原16反例、新17检查及原admin/publication整模块通过，真实原生三入口均exit0：business75积分，batch三次发布及65/90积分，APIMart两次发布及8→10积分；移动端/非管理员/供应商POST0。实际源码桥接及副本回滚以本轮DELIVERY为准。

三个经典wrapper复用原runner的第二profile，12个命令共享sourcecopy/IPC/随机端口；受控原wrapper3检查复现覆写后续编辑，新真实子进程104检查通过。原23/32/25业务断言不放宽，仅batch旧label改为实际「执行模型」combobox，新增失败DOM/网络/GitHub annotation及always产物。可选Linux执行只消费校验后的当前源码和同锁依赖，不启动旧应用，不当作固定App/Worker整版。APIMart本地Linux首轮origin误配已在fixture精确修正并复测；当前222目录、远端billing/browser失败、main及整体退出继续，整体ACTIVE，部署0、47HOLD。

## 当前推进：R9U 后台模型发布与恢复

[R9U模块](changes/2026-11-01-refactor-r9u-management-publication-session.md)把 F03 的快照、原publication回执、显式核对和目录观察从React hook迁入独立应用owner；React仅投影/端口，表单草稿和服务端CAS保持。只读观察可取消，已派发发布继续原请求；auth await后检查视图归属，提交体在await前冻结，清pending比较原完整字节，旧目录不覆盖新快照。旧有效key/body兼容，损坏存储不锁界面，不新增业务限额/确认。

实际hook/client/React19/Chromium原25项13PASS12FAIL、新25PASS；原完整页面脚本基线33PASS、新35PASS，18HTML/20POST精确相同，原static14PASS。两个历史结构脚本的api正文断言原FAIL保留，改为跟随实际owner并保留其他17个helper/编辑器正文和通道/过滤/payload检查；新25项注册原core221目录。auth/API为fixture，不冒充PG、线上或同一付费断线E2E。质量与全源码副本回滚见R9U VERIFICATION/DELIVERY。F01/F02/F03这些已列应用职责已迁移，完整CI/main及整体退出继续；整体ACTIVE，部署0、47HOLD。

## 当前推进：R9T 首页会话目录与附件

[R9T模块](changes/2026-11-01-refactor-r9t-workbench-catalog-attachments.md)将 F01 的列表观察/变更、上传批次和作品索引从页面迁到同一会话聚合的两个内聚子模块，共享原账号 scope；React 只保留投影/草稿。修改成功退休旧列表观察，作品反查在 auth/response/JSON await 后保持原账号/索引 revision，ready 波动不取消同账号有效上传或已受理 SSE。原 JSX 渲染字节、原 email、multipart/SSE/save 协议保持，没有新任务系统或复制列表。

真实 React19/Chromium：完整旧版43场景37PASS/6FAIL，修改版43/43PASS；原恢复/发送47场景基线与修改版均47/47PASS。原34项保留，新增9项包含六个原反例及缓存/聊天部分成功/门户全部参考正例。auth/backend仍为fixture，不冒充同一真实付费断线 E2E。完整源码、质量、四产物与副本回滚见 R9T VERIFICATION/DELIVERY。F01本轮职责已迁移，F03与整体退出继续；main未合、部署0、47HOLD。

## 当前收敛：R9S 验收跟随生成会话owner

[R9S模块](changes/2026-11-01-refactor-r9s-direct-submission-ownership.md)复现0454f164的Image早期静态检查失败：旧扫描器要求GenerateClient仍直接调用billing.submit。现核对实际named-import/会话返回值/原billing端口、adapter与facade的原quote和POST前guard，保留原Canvas、其他工具、GenChat、Agent、operation及无关删除确认条件；两别名正例和8个漏接/恢复积分confirm负例，完整原静态命令37检查PASS。产品2144文件逐字节不变，不把业务编排搬回页面或跳过generate覆盖。

0454f164的Image实际FAIL，后续build/业务均SKIPPED；不是沿用1e2df80c的整组SUCCESS。Core保持原固定源运行/终态，最终新head CI按R9S交付记录读取，不取消重启已知作业。R9R的18浏览器/父25/真实PG25-74为原固定源执行，当前产品字节桥接，不改标成新head整版。整体ACTIVE，main未合，部署0，47 HOLD。

## 当前推进：R9R 旧生成页会话owner

[R9R模块](changes/2026-11-01-refactor-r9r-generation-session.md)把旧GenerateClient的提交、原job观察、结果投影收拢到同一应用owner；React adapter绑定原billing、auth与job cache。最终真实React19/Chromium18场景原11PASS/7FAIL、新18PASS，普通multipart/quote/文件hash投影EXACT；双击、账号切换、延迟updater、准备阶段退出、unmount、迟到active发现与503读取均有反例。账号比较与原请求账号分开，原email和实际clientIntentKey指纹保持；中间3cc88f19未单独push。后端报价/任务/账务不新建、不改价，不自动重放付费POST。这个浏览器模块的auth/账务后端仍是fixture，不当作真实付费断线全链路。

1e2df80c远端Image完整SUCCESS；Core在父任务夹具25个未登记纯依赖导入处FAIL，实际执行GitHub合并快照d70820f8，不能与PR head混写。原父脚本本地同样复现，登记实际image-quality纯模块后原25项PASS、供应/结算写0。新verifier加入原目录220项及每case产物端口；集中质量、runner和5362原始raw副本回滚以本轮VERIFICATION/DELIVERY为准。F02的owner迁移不再是当前缺失项，F01列表/上传与F03后台恢复继续；真实同一付费断线trace和新head整版CI仍OPEN，整体ACTIVE、main未合、部署0、47 HOLD。

## 当前推进：R9Q 历史供应商兜底的检查点兼容

[R9Q模块](changes/2026-11-01-refactor-r9q-legacy-provider-fallback.md)在真实PG/原Worker链复现旧BYOK明确质量拒绝后，平台兜底复用原逐图拒绝身份而失败。供应商策略收拢到同一provider函数，兜底使用原root下的独立child，只有全部原图明确400质量拒绝才允许；UNKNOWN不授权重发，不开放已退役的新BYOK入口，不增加用户确认。

最终七条原顺序fail-fast单次7/7 PASS，其中credit实际37场景、非loopback请求0；全项目非增量tsc0、定向lint0。实际租约在fallback child保存原字节后、root result保存前注入lease-lost，再观察原10秒cooldown后由新Worker交付相同原字节、额外供应POST0。原先过早resume导致fixture超时的失败保留；全源码副本回退及最终SHA分别见R9Q VERIFICATION/DELIVERY，不等于新head远端CI、main或部署通过。**分支超过48小时：延迟原因仍是有效同源CI/main未闭合。**

## 上一模块：R9P 网关回归与供应未知合同

[R9P模块](changes/2026-11-01-refactor-r9p-gateway-outcome-contract.md)在原生产源码下确认现行合同是未交付客户终止/释放、供应结果仍UNKNOWN/pending，不恢复旧用户等待护栏。网关保留旧Worker零重提、真实lease、原质量/两图单次结算/Canvas/历史恢复；本机完整原命令exit0，独立副本5360原始hash及原`error != pending`失败行为恢复，实际工作区保持新版。该模块产品源码0变更，本地提交8980b122，尚未单独推送。

远端最后固定e8156ee2：Core terminal SUCCESS；Image完整build、账务、路由、模型组、R9O账务浏览器等通过后，在原gateway处FAIL。后六条单次诊断5PASS/credit FAIL不是完整gate通过；R9Q处理后续真实兼容失败，集中推送后读取新head，不将旧Core成功重标为新源码成功。整体ACTIVE，main未合，部署0，47 HOLD。

## 上一模块：R9O 账务浏览器的冻结意图合同

[R9O模块](changes/2026-11-01-refactor-r9o-billing-browser-contract.md)恢复实际浏览器对服务端报价/原operation合同的检查，不把已删除的积分确认加回产品；e8156ee2的该项远端检查已经实际通过，不等于该head的整个Image通过。

## 当前推进：R9N typed模型覆盖合同

[R9N模块](changes/2026-11-01-refactor-r9n-typed-model-coverage.md)实际复现旧模型覆盖脚本要求headlessCanvas任务调用HTTP withModelRequest的exit1；现有用例已经沿typed withModelOperation。候选验证真实导入绑定/调用，保留SDK/HTTP/video原检查，并补别名、namespace、relative正例和4类漏检负例，不把HTTP塞回用例。原11条模型组集中结果与回滚按R9N DELIVERY；远端Image只有组失败证据，blob日志EOF，仍不认远端唯一child根因。

## 当前推进：R9M 首页发送/SSE会话 owner

[R9M模块](changes/2026-11-01-refactor-r9m-workbench-send-owner.md)沿同一会话聚合迁移显式发送、SSE、原身份保存和插话；组件不再持有流句柄或解析协议。原73场景通过，新增8场景实际抓出计划事件延后更新导致工具步骤重复的原缺陷，失败留存；owner固定事件时的步骤快照，不放宽断言。当前实现、集中验证和副本回滚以R9M DELIVERY为准，不把此前R9L的运行中CI当本轮候选验证。

## 当前推进：R9L 业务路由发布/失败清理

[R9L模块](changes/2026-11-01-refactor-r9l-routing-fixture-lifecycle.md)直接复现了原business-routing悬挂：第二次发布因旧基线草稿409，finally又没有释放自有held请求，PG已清理却HTTP关闭永远等待。清理诊断副本取得真实PUBLISH_STALE_DRAFT_BASE，不归因为限流或DB连接不足。候选只修fixture：新发布使用当前基线草稿、等待同时观察提交终态、先排空原请求再关资源；补真实401及上游已到达失败的生命周期检查。原业务断言/生产源码/管理员CAS均保持，最终集中执行与回滚归R9L DELIVERY；新目录219完整验收仍单列。

## 当前推进：R9K NAS交付验收输入

[R9K模块](changes/2026-11-01-refactor-r9k-nas-admission-fixture.md)处理旧3fa Core的nas-delivery失败。原测试真实本机容量通过；只改变自有MEDIA_DIR的容量读到0即可保持原5秒标准复现相同失败，实际NAS PUT约9秒超时。产品早已明确低容量合法remote-first；候选将已准入的即时交付和未准入的远端确认分别验证，保留全部原断言和实际PG/HTTP/文件/Sharp，容量读明确标为fixture。产品源码0改动，历史CI唯一根因不冒称关闭；最终集中执行、回滚、源码及远端状态以R9K DELIVERY为准。

## 当前推进：R9J 首页会话恢复与观察职责

[R9J模块](changes/2026-11-01-refactor-r9j-workbench-session-owner.md)落实R9I只读退出审计确认的组件内应用编排，将account scope/generation、历史安装、观察cursor/phase、UNKNOWN与原session显式停止迁到独立owner。原两套真实React/Chromium浏览器模块保留断言并接入统一core218目录。3fa完整5350原始文件已冻结，原新各39恢复＋34变更场景共73项通过；非增量tsc0、定向lint0。上述是R9J当轮证据；后续发送/SSE已由R9M沿同一身份owner迁移，不再列为当前未迁移项。最新CI归本文顶部实际head，不改写历史3fa状态。整体ACTIVE、未部署、47HOLD。

## 当前推进：R9H 账务整模块与历史输入合同

[R9H模块](changes/2026-11-01-refactor-r9h-billing-regression-contract.md)继续收敛最终整合，不叠加产品功能。5adb的远端Image完整构建已PASS，首次到达账务后FAIL；本地原顺序前4项PASS/API因夹具缺少真实报价所属账号而FAIL。原13项未到达用例以冻结源码、每项独立PG一次诊断，5FAIL/8PASS；该诊断不是完整gate通过。

本轮恢复回归对现行合同的检查：真实账号/opaque报价归属及冻结、图片原operation/首张串行barrier/部分单次结算、工具与文字无需浏览器积分回显且无重放、Agent服务器报价/40次不累计确认/真实余额、静态扫描跟随实际owner而非兼容门面。首次修改版tryon结算前返回合法pending的失败保留；候选沿原等待结算后验证回执。最终原顺序18项单次PASS/0FAIL/0未到达，不拼接独立结果。

Core5adb实际在admin-member-history-pg的历史Git对象缺失处FAIL；真实无历史对象Git+PG原版复现同样错误。该案例以原Git blob9325字节/sha256校验固定输入后，原19组真实API/PG检查PASS，原55条业务断言完整保留，仅加checksum断言；篡改夹具在连接DB前被拒绝。其他有意祖先比较的目录输入由Core checkout显式fetch-depth=0提供，refs已核对为当前祖先。全项目非增量tsc0；最终runner20场景360检查PASS，含18项账务driver的真实child0/7、原始双流、失败后13未运行及只读注释/always artifact。产品源码0改动，原2141字节保持；没有恢复积分误拦、增加业务限额或跳过测试。

R9H副本回滚、原始失败、raw patch、最终source及新head远端状态以output/refactor-r9h-20261101的VERIFICATION/DELIVERY为准。旧9ba216及运行/混合验收不改标为本轮；最终main普通整合仍等待新head实际检查，整体ACTIVE、未部署、47HOLD。

## 上一模块：R9G 远端验收执行输入

[R9G模块](changes/2026-11-01-refactor-r9g-ci-execution-inputs.md)先收敛最终验收，不叠加新业务模块。R9F最终head804ce5af的两条远端CI均已实际FAIL：Image为V8约2GiB heap OOM；Core为主题矩阵在英文界面查找中文“优化预览”超时。后者已在同产品源码、明确en-US浏览器输入下复现，修正为真实zh-CN浏览器和naumi_locale=zh后，原97断言加语言断言共98检查PASS；未改产品翻译/布局、等待时限或重试次数。历史R9E重载停滞的唯一首因仍OPEN，不借此追溯关闭。

同一份5346文件冻结源码在相同隔离Linux下，显式2048MiB堆的真实npm build复现相同V8 OOM/exit1；唯一改为4096MiB后完整npm build/exit0，两次OOMKilled=false。候选只把Image构建步骤预算对齐已有固定Docker构建，不改生产Web/Worker或其他测试环境；原构建命令/退出码和全部后续业务检查保留。真实Bash环境/0与7退出及runner18场景300检查PASS。容器8GiB/2CPU仅为控制环境，不是生产容量；没有提高超时或修改Next来跳过类型/lint。最终逐文件桥接、副本回滚及新headCI归R9G交付，不能把旧9ba整版PASS重标为当前HEAD。

## 上一模块：R9F 五类原生节点身份归属

[R9F模块](changes/2026-11-01-refactor-r9f-native-node-ingress.md)：15个Route、25个处理器消费现成创建包装器的服务端actor；request-auth仍拥有身份规范化及管理员目标授权，undefined保留无DB解析、null代表已知匿名。普通入口原生账号认证SQL2→1，管理员跨账号只读3→2（独立requireAdmin保留），不设全局缓存，不改领域事务、CAS、任务/计费/素材规则。

原5344文件基线与修改版各98个实际HTTP/nativeHMAC/PG场景＋20个无DB Route场景（合计118场景244检查）、普通投影EXACT；包含角色撤销、并发账号隔离、并发CAS、原operation重放及20个无DB401。该SQL计数只属于入口内原生账号校验，不含middleware或管理员角色查询等其他SQL。原/新账务记录精确不变，供应商POST0。

完整应用/整版执行源码 `9ba80e10ed5135e5eeb20cc4c57c93cfb090aa71`：**当前216项单次完整PASS、0FAIL、0NOT_RUN、0reuse**；同源完整Web/Worker与原生SDK应用字节EXACT，runtime177、真实产品浏览器92（routeMocks0）及450秒混合165图片/12媒体/177consume/1014fixture积分通过。capacityClaim=false；不是10万容量或真实供应商质量证明。元数据源292e的非增量tsc0，5092编译器输入+4配置（应用源9ba原计数5091保留），lint0/37既有warning，四类SCC0。

元数据修正源 `292e24f5195e5d416121105a45cff1836a61930f`：完整回归后发现两个新用例虽断言通过，详细文件仍写全局默认目录；已按真实case时间/日志hash冻结原文件，改为runner原有每case端口注入，两个真实子进程（原生118场景244检查＋拖动4场景14检查）归属验证通过，普通投影EXACT，继承的旧路径未被写入。这一选择范围报告保持PARTIAL/exit2，不冒称新元数据源本地重跑了216；最终head整版由新CI放行。应用到元数据源只改3个验收路径/CI报告文件，全部2141产品字节仍与9ba镜像源相同。

本轮原97主题断言在有界诊断及当前完整core中通过；R9E原40检查后重载失败和R9D原timeline失败保留，历史唯一根因仍OPEN，不能归因为本轮身份迁移。旧head ba497的远端Core与Image均已实际FAIL；Image失败步骤为npm build，日志下载TLS失败，根因未读到。新增原构建命令/参数/exit保留、日志/commit/工作树列表/失败注释及always artifact；Core另以只读步骤把真实失败case/退出码/日志尾部发布到检查注释。真实Bash0/7及Node报告5场景18检查通过，不宣称旧CI已修复或新CI已通过。

产品原16文件变更，其余2125个原src/services raw hash相同；5344→5346文件。四产物、当前完整补丁/副本回滚和最终4文档source桥接归output/refactor-r9f-20261101/DELIVERY.json与VERIFICATION.txt。第三产品模块后已刷新/普通整合origin/main e2f56255（已包含），同步计数3→0，没有写main。**整体ACTIVE、main未合、部署0、47HOLD**；下一步是读取新head实际CI结果并闭合失败后做最终普通main整合，不用本地PASS覆盖远端FAIL。

## 上一模块：R9E 原生交互复用与直接生成合同

[R9E模块](changes/2026-11-01-refactor-r9e-native-interaction-contract.md)：timeline/director 的原生验证复用既有 `dragCanvasNode`，不再私有读取一次坐标就发手势；原持久化、撤销/重做、锁定、复制、删除、账务断言和等待时间保留。真实 ReactFlow/生产 drag owner 的四场景原/新对照为12/14检查，正常轨迹EXACT；当前同源完整应用中的 timeline 和 director 原生链均PASS。它们不证明历史单次失败的唯一根因。

直接生成旧CI扫描器在同源复现 exit1（要求恢复已删除的报价版本误拦），现在核对 typed 创建owner、原服务器quote、scope/operation透传及无重复积分确认，27项静态正反检查PASS；不是实际钱包验收。feature Core回归仅由PR触发，main push与精确source workflow_call保留，runner16场景282检查PASS，不删除业务测试。

当前验证/完整应用固定 `bb0ebce1ba489222901205db49ca3ae6592127ba`，Web/Worker同镜像与原生SDK应用字节一致。目录215项已全部到达：首批61PASS/1主题FAIL/153未到达，随后只执行153个原未到达项，全部PASS；**两批合计214PASS/1FAIL/0未运行，完整core仍FAIL，不能称单次215全绿**。没有复用旧case结果。主题重载40检查后节点等待超时，导航200、无pageerror，但截图及正文读取也超时；附加协议诊断未给出唯一首因，结束了其自有浏览器，原失败保留。没有提高超时、换浏览器或跳过断言。

同固定镜像 runtime177、实际产品浏览器92（2context、routeMocks0）及450秒混合校准通过：165图片/12媒体，177consume/1014积分，付费重放0，未完成父任务0，capacityClaim=false。非增量tsc exit0，5090个编译器输入+4配置绑定，37个既有lint warning/exit0，四类SCC0。原e689两处脚本类型错误和诊断中断记录均保留。

本轮产品源码改动0，全部2141个原src/services字节不变；完整源码5344文件，对照5342原文件。四产物、副本回滚及最终source/doc桥接见 `output/refactor-r9e-20261101/DELIVERY.json` / `VERIFICATION.txt`。**整体ACTIVE；main未合、部署0、47HOLD**。验证/文档不计产品模块，主线同步计数仍2；下一步是定位主题重载失败并完成真实同源整版退出，而非继续重复已通过批次。远端新head CI以最终DELIVERY快照为准。

## 上一模块：R9D 整版取证与验证依赖归属

[R9D记录](changes/2026-11-01-refactor-r9d-current-acceptance.md)：完整应用固定79705670，Web/Worker同镜像与原生SDK应用字节一致。原212项全部到达：第二轮完整运行146PASS/1FAIL，未到达65项单独运行全部PASS，合计211PASS/1FAIL，未复用旧结果；**完整core仍FAIL**。首次theme重载超时后原参数97检查通过、timeline原生拖动失败后旧版与当前诊断通过，两项首因均OPEN，不用后续通过抹掉原失败。

验证入口9a1e8b2a把timeline素材依赖收敛为已通过的生产者case、同源commit/digest、实际日志hash/marker与5个文件hash；父级FAIL及completeCore=false原样保留。新增19个状态合同检查，目录212→213，**完整213尚未运行**。没有修改产品文件，全部2141个src/services原始字节仍与应用镜像源码一致。

本轮实际同镜像runtime177、产品浏览器92（routeMocks=0、真实登录/PG）、450秒混合校准通过；混合165图片+12媒体、177consume/1014积分、未知重放0、未完成父任务0，businessInvariants=PASS且capacityClaim=false。lint/非增量tsc exit0、5089编译器输入+4配置绑定、四类SCC0。它们分别证明自己的范围，不把独立验收PASS合成为corePASS。

四产物、回滚、最终源码/验证代码桥接与新head远端状态见output/refactor-r9d-20261101/DELIVERY.json、VERIFICATION.txt。整体ACTIVE，main未合、部署0、47HOLD。下一步优先定位两项间歇性失败、完成当前213全套；入口别名盘点48个调用/31文件只作迁移线索，不作运行事故归因。本轮是验证职责修正，功能同步计数仍2，不因文档或验证资产变化虚增。

## 上一模块：R9C 报价与 Canvas 编辑边界

[R9C模块](changes/2026-11-01-refactor-r9c-quote-canvas-boundary.md)把公共报价/报价保存、Canvas入口/intent/模型准备的身份统一到已认证actor；编辑任务用例不再接收或构造Request，HTTP/header/模型适配由入口承担，headless复用既有withModelOperation。保留输入校验→来源归属→模型准备→真实报价/预占顺序，没有新增确认/限额/缓存/schema。

完整eb65基线5337raw文件与修改版实际原生HTTP/PG/Worker对照29场景59检查、正常投影EXACT：旧报价/编辑认证2～6次→1，headless0/列表1保持。真实lease领取、回环供应商1POST、私有结果像素读回、原价6/current17后只consume1/charge6，原任务重放、丢ACK和并发不重买。现有Request第三参验证调用方已迁到真实HTTP/领取路径，未保留Request重载。

固定产品验证源d35：pricing13/13与APImart实际入口通过；runner仅选pricing，仍PARTIAL/exit2，非完整212。ff6f21f3修正旧辅助fixture后，视频跟随21、视频提交30场景121检查、OCR22场景79检查、pending实际React/调用方8组36检查通过；真实PG model-execution包含headless Canvas/Worker/轮换/未知不重买通过。最终lint exit0/37既有warning、非增量tsc exit0、四类SCC0。类型证据准确口径是5089个编译器列出输入+4配置绑定=5093，保留原计数记录。产品及pricing/APImart输入在d35与ff6间raw一致；没有把旧执行重标成新SHA。四产物、最终副本回滚与推送状态见output/refactor-r9c-20261101/DELIVERY.json及VERIFICATION.txt；完整212/App/Worker当前整版仍待执行。

## 上一模块：R9B 历史生成入口

[R9B 模块](changes/2026-11-01-refactor-r9b-legacy-generation-ingress.md)将历史generate-image的intent、BI、model、opaque quote、signed versions和领域actor/quote port贯穿同一个服务端身份。完整1efb基线5335raw文件与修改版实际native HMAC/HTTP/PG各38场景79检查，正常结果投影EXACT；旧提交4～7次认证、父轮询2次，修改后均1次，health仍0次（不含middleware）。保留原价6/当前17、真实预占和余额不足、丢失ACK后503→原intent409待核查、同编号并发一任务；没有新表、价格确认或跨请求缓存。

固定验证源`b7963e41025fd2e1bdccf7f99a705d11e9128684`：7个产品文件完成显式参数迁移，其他2134原src/services raw hash一致；pricing12/12全部执行通过、0失败/未运行/复用，runner仍PARTIAL/exit2（非完整211，其余199未本轮执行）；5092实际类型输入/tsc exit0、lint exit0/37既有warning、四类SCC0。独立副本恢复5335原始raw hash及原38/79行为，later-edit首写前拒绝/零写。归档与该验证源之间仅4文档变化，产品/验证资产字节一致；最终补丁与四产物见本轮DELIVERY。

本轮为上次主线同步后第1模块，开工fetch确认origin/main仍e2f56255且已包含；没有新main待整合、没有写/推main。最后完整应用验收仍是R8Z，不把本模块通过扩展为完整211目录或当前App/Worker通过。

## 上一模块：R9A 图片入口身份归属

[R9A 模块](changes/2026-11-01-refactor-r9a-image-ingress-routes.md)已迁移其余 5 个图片路由文件的 7 个处理器，并把主提交 BI 包装的身份来源统一到入口。完整 fe9d 基线与修改版实际 HTTP/native cookie/PG 对照各 39 场景、90 检查，正常响应/授权/原字节投影 EXACT；认证 SQL 从 `2/3/2/2/2/2/2` 变为 `1/1/1/1/1/1/1`。该计数不含 middleware。7 个产品文件变更，其他 2134 个原 src/services 文件 raw hash 不变，不改领域/钱包/供应商/schema。

R9A固定验证源码 `9a52ba65b77e729ea724fceff66283c5f020e678`：pricing 11/11 脚本通过、0失败、0未运行、0复用；runner 因部分目录返回 **PARTIAL/exit2**。R9A时目录210项，其他199项未在该轮重新执行。该轮5091实际类型输入一致/tsc exit0、lint exit0/37既有warning、四类SCC=0。独立副本恢复5333原始哈希及39/90原行为，later-edit首写前拒绝/零写。归档1efb与该验证源仅文档更新；不是R9B源码执行结果。

第三功能模块后已刷新 origin/main `e2f562556ea6e71370619686e1fc8d4c634ef5e7` 并执行普通整合（已包含，源码不变），modulesSinceSync 3→0；没有修改或推送 main。当前封装与实际命令归 `output/refactor-r9a-20261101`。

## 最近完整应用验收（R8Z）

| 字段 | 值 |
|---|---|
| 工作目录 | E:/Workspace/naumi-refactor-20261024 |
| 分支 | codex/core-refactor-20261024 |
| 当前完整应用验收 applicationSource | f7441ed0f9ae077f5d3f6fafb0f7c70b6d585567 |
| 文档归档 source | 以本轮DELIVERY.json为准；仅文档raw-source bridge，不冒称文档SHA重跑业务 |
| 完整源码 | 5333文件；本轮11路径：5产品、2验证/目录、4文档；原5331文件 |
| App/Worker固定镜像 | sha256:5934e621d6fdad7aa36149eea14dd306c62d080af846759146ed8f32adaddce6 |
| 固定版本 | 1793474041 |
| SDK | 同完整源码、完整App字节EXACT，七个原生入口 |
| 完整核心目录 | **209 PASS / 0 FAIL / 0 NOT_RUN / 0 reuse** |
| 同镜像运行 / 产品浏览器 | **177检查 / 92检查**，180秒、2context、routeMocks=0 |
| 混合业务 | 450秒calibration：165图片＋12媒体，177consume/1014fixture积分，业务不变量PASS |
| 类型与结构 | tsc exit0；5090实际类型输入；lint exit0/37既有warning；四类SCC=0 |
| 同机配对性能 | 5轮/10栈、每侧15页面/150prepare/300read；本轮当前候选采样无超过原10%调查阈值的指标 |
| GitHub | [PR8](https://github.com/JesstLe/naumi/pull/8)，draft；本次head实际CI见本轮证据 |
| 整体目标 | **ACTIVE；mainMerged=false；deployed=false；47 HOLD** |

## 本轮职责收敛

[R8Z入口归属](changes/2026-11-01-refactor-r8z-ingress-ownership.md)让HTTP入口传递已认证actor，当前权益检查返回actor-bound决定，plan/原报价同actor复用；跨actor/no-context仍读自己的policy，每次调用/下一请求重新检查，无全局或跨请求缓存。实际原生cookie/HTTP/PG/planner/quote原/新20用例33检查，入口内auth/policy2/2→1/1，正常公开/授权轨迹EXACT。此数字不是完整App包含middleware的认证总次数。

产品只改5文件，其他2136原产品raw hash一致；无新表、事务锁、业务限额或价格确认。原任务/报价ID、原价、输入归属、钱包与UNKNOWN保持。R8Y唯一报价意图的职责和兼容合同继续保留。

| 指标 | 3e90完整基线 | 当前f7441ed0完整镜像 | 变化 |
|---|---:|---:|---:|
| 可视就绪 p95 | 7834.70 ms | 7796.28 ms | -0.49% |
| 实验交互估计 p95 | 1744.00 ms | 928.00 ms | -46.79% |
| 报价准备 p95 | 37.69 ms | 19.05 ms | -49.46% |
| 只读请求 p95 | 23.20 ms | 19.26 ms | -16.96% |
| Web采样RSS p95 | 411.41 MiB | 414.84 MiB | +0.83% |

测量口径：同机/Edge、相同package/lock与实际Node24.22.2/React19.3.0/Next15.5.28/glibc2.36，320节点/12张相同1024px图片、4xCPU/5Mbps/80ms、privateMedia1。仍含冷样本；不是线上INP或10万活跃容量证明。旧R8X827的prepare +17.98%与R8Yf0b的+10.57%原始观测继续保留；本次新候选结果不重写旧结果，不宣称已证明旧差异唯一根因。

## 文档职责与下一步

- [架构与职责](REFACTOR_ARCHITECTURE.md)：稳定边界、公共接口、数据归属。
- [迁移合同](architecture/REFACTOR_MIGRATION.md)：阶段方法、兼容条件、模块索引。
- [整体退出审计](architecture/REFACTOR_EXIT_AUDIT.md)：各项当前证据与未完成项。
- 实际命令、失败、source/hash、原/新对照、binary补丁与独立副本回滚归output/refactor-r8z-20261101，以VERIFICATION.txt和DELIVERY.json为准。

1. 当前性能判定：本轮当前候选采样无超过原10%调查阈值的指标；保留原10%阈值与冷样本，历史归因未完成项独立记录。
2. 有效远端CI后进行最终main普通整合与固定整版验收；本地PASS/候选push不是CI通过或部署。
3. 生产容量、历史供应商/持久化/传输问题及生产验收沿独立台账，不以本轮模块通过自动关闭。

**候选分支超过48小时尚未合main。** 整体退出仍有有效CI、最终main整版及独立容量/历史/生产门槛。保留独立工作树和未整合分支，不处理他人资源；47 HOLD未解除。

本轮汇总门槛满足不代表每轮都变快：对照基线跨期p95有明显漂移，paired第2轮p50仍回退；p50沿原driver nearest-rank估计。不能把汇总约49%的降幅归因为本次改动的确定收益。逐轮原值/旧原始观测与归因不确定性均保留在PAIRED_VARIANCE_ASSESSMENT.json。

## 入口迁移边界

R8Z/R9A直接候选由R9B历史轮询迁移收口；R9C继续迁移公共billing quote与canvas/image-tasks的间接链，并移除编辑用例Request边界。局部AST/调用链不是全站闭合；其他跨文件适配、当前216完整固定验收、有效CI、最终main/生产门槛仍独立保留。
