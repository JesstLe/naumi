# 画布视频完整融合进度

日期：2026-10-13。当前阶段：用户已确认实施计划，选择当前会话Native顺序实施。后台大模块开发中：素材和隔离测试入口、规范能力/引用代码已写入；功能测试留到检查点A。应用E2E/固定镜像/发布均未完成，目标active。

设计：[完整范围及34项矩阵](../superpowers/specs/2026-10-13-canvas-video-fusion-design.md)。计划：[18项实施任务与A/B/C/D验收](../superpowers/plans/2026-10-13-canvas-video-fusion.md)。源审计：[当前缺口与签名事实修订](2026-10-13-canvas-video-source-audit.md)。独立分支codex/canvas-video-fusion-20261013，开工main3f1aa4a；设计记录6048ae7/8684d1f，旧阻塞记录908d687。最新origin/main为12105eb，账号功能权限及独立桌面界面已合入本任务分支，共同db.ts自动合并无冲突；未验收的视频改动尚未合回main。

用户最新追加：在线演示站实操对比；UI不加无用口号/冗余描述；测试大模块完成后集中进行，频率不宜高；每模块更新本文，记实现/未完成/调研/证据，不靠会话记忆。这些已纳入计划，覆盖34项范围保持。

调研纠正：submitQueuedVideoTask已有普通references权限、镜像与900秒R2签名，不再将签名整体误判为缺失；需要扩展到高级元素/嵌套素材并验收真实访问。视频结果真实性、完整引用角色/排序、节点项目归属和Agent持久关联仍是待实现重点。

演示入口调查：IC固定README列有infinite-canvas-cpco.onrender.com的New API配置跳转例；web读取返回Internal Error，还不能确认其当前在线版本。TF当前官方README列有教程/插件市场/官方模型平台api.toonflow.net，未确认可操作公开画布demo。后续必须实际浏览器访问并保存操作证据，不把同名网站/模型平台视为画布演示；无法进入时使用明确标记的本地固定上游实操对照。

| 模块 | 实现状态 | 验收状态 | 未完成/下一步 |
|---|---|---|---|
| 素材/隔离fixture | 初版已写入，尚未验收 | 素材生成完成；功能未执行 | Task1；28份原始素材与SHA/FFprobe清单，真实App/独立Worker/two users/私有签名校验store及HTTP供应商；已补管理配置seed；尚需准备独立PG与真实隔离Router |
| 规范能力/引用 | 初版已写入，尚未验收 | 测试脚本已写；未执行 | Task2；10模式、nullable未知/false/0/omit、组合规格、数量/角色/大小时长/分镜元素校验及双编号；接线到真实提交尚未完成 |
| 后台/资料/公开目录 | 初版已写入，尚未验收 | 配置脚本已写；未执行 | Task3；独立供应商修订、管理员优先、目录/执行共享定义、发布事务内绑定默认能力；完整配置中心与常用模型管理均可编辑。协议和真实提交仍待Task4—9 |
| wire/素材提交 | 共享层初版已写入 | 测试脚本已写；未执行 | Task4；统一普通/元素素材身份权限与临时签名、typed wire接口和严格响应工具；协议绑定在Task5—7、预扣前接线在Task9 |
| IC协议分支 | 初版已写入，尚未验收 | 24个HTTP分支用例已写；未执行 | Task5；OpenAI/Grok/Cog/Agnes两版/Ark/Kling2.6及3/Omni四分支/运动/Gemini/MiniMax；共享适配器已接线，边界和Task9/10完整恢复仍待A/B |
| TokenDance/TF/Compshare | 初版已写入，尚未验收 | 27个HTTP组合已写；未执行 | Task6；8种TokenDance路由/协议前缀、4种TF元数据、7种Compshare Profile；输出列表与口型/续写参数保留，任务恢复/多产物保存待Task9/10 |
| 视频工作流 | 初版已写入，尚未验收 | 脚本已写；未执行 | Task7；plan/manifest、依赖/持久调度与3个原生协议；项目授权、报价逐节点重确认、停止以及BYOC已在Task8/9接线；完整多产物保存待Task10 |
| 节点/项目 | 初版已写入，尚未验收 | 脚本已写；未执行 | Task8；独立视频节点、revision、软删除/恢复、复制、预扣事务回调与目标项目发送；统一生成入口在Task9接线 |
| 持久任务/取消/计费 | 初版已写入，集中验收准备中 | 脚本已写；未执行 | Task9；共享规范提交、完整冻结/恢复、发送前持久标记、取消/结果未知/报价确认、完整重试及加密BYOC；检查点A准备独立PG/Router |
| 真实媒体与工具 | 未实现 | 未执行 | Task10；隔离处理worker、原生多输出与检查点B |
| 参数/高级画布UI | 未实现 | 未执行 | Task11；沿Naumi交互体系，不加入无用文字 |
| 恢复/播放器/工作台 | 未实现 | 未执行 | Task12；真实状态/播放/Range/历史/发送 |
| Agent/制作规则 | 未实现 | 未执行 | Task13；沿用生图、视频配置/任务/串行及检查点C |
| 上游演示实操 | 入口调查 | 未实操 | Task14；确认归属/实际版本，操作+截图比对 |
| 完整矩阵E2E | 未执行 | 未执行 | Task15；检查点D，供应商模拟与真实应用分开 |
| 固定镜像/回滚 | 未执行 | 未执行 | Task16；上线前完整review、一次固定Linux构建与隔离回滚 |
| 103发布/保护验收 | 未执行 | 未执行 | Task17；用户授权保持，最新持锁基线重新获取 |
| 完成审计/交接 | 未执行 | 未执行 | Task18；逐项证据真实且线上版本一致后才完成 |

阶段记录规则：每完成一个功能任务选择性提交并更新对应行/源码SHA；测试脚本编写与运行分开记录。A完成Task1—9后集中后台验收，B完成媒体，C完成画布Agent，D完整端到端/构建/交付。失败只重跑受影响项，必要环境保护及上线/回滚核验不能省。每3个功能任务刷新整合main与测试频率无关。

服务器状态沿用最近已核验基线：103 App/Worker ee351d9、884604db1b01、version1791873866，健康正常；实施初期没有新连接/修改服务器。103维护计数2、已验收功能迭代计数0。120已废弃，香港/101未连接，不使用历史粘贴地址重新操作旧环境。已有本任务产品文件改动，没有付费模型调用或功能测试通过声明。

实施记录：npm ci完成720包，沿用lockfile未升级依赖。FFmpeg生成19份素材（横/竖/方形4/8/12/15/30秒、静音、音频、首尾PNG），资产清单位于忽略output/canvas-video-fusion-20261013/fixtures/assets；生成本身用FFprobe记录真实规格并留SHA，不等于应用E2E通过。新增fixture guard强制loopback、naumi_video_fixture_库名及本任务owner marker；子App使用清理环境，不加载生产dotenv；cookies仅私有管道。基础S3签名模拟验证AWS签名及过期，真实private访问流程待A。当前宿主无Docker/Bash；现有托管worktree保持，计划专属忽略ledger使用Windows原生方式建立。后续A使用独立fixture PG，不以宿主限制连接正式数据库。


Task3实现记录（尚未功能验收）：

- 供应商视频资料使用独立当前表和修订表；采集只读取显式能力定义或TF结构化声明，不凭模型名猜能力，不覆盖管理配置或客户积分价。来源URL去掉认证查询参数，认证参数不能进入能力选项。
- 模型版本发布事务内冻结视频默认定义、每字段来源、wire profile和供应商修订；公开目录和执行解析共享这一绑定。管理员false、0、null继续优先。旧配置不注入视频默认字段，旧digest兼容脚本归入A。升级前已有任务的冻结兼容在Task9落实。
- 完整配置中心和常用模型管理添加视频编辑；常用管理保存沿用原操作ID、draft/发布、版本冲突及待核对流程。通道必须完整且不能重复或越权；图片仍保留32参考上限，视频专属上限128与通用声明须一致。
- fixture seed加入真实加密凭据、公开/禁用视频模型和积分计费开关；每次App/Worker验收使用独立DB schema，避免沿用上次供应商URL。严格要求另外提供loopback的隔离Router管理地址和fixture凭据，不用正式Router，也不模拟Naumi内部API。该测试基础设施尚未启动。
- 修正fixture余额读取为既有余额镜像credits_total、流水表名app_ledger及无效签名日期拒绝。配置、发布冻结、非法通道测试已编写但没有运行；git diff检查仅检查补丁格式，不作为功能通过证据。
- 本模块仍需在A验证实际目录/鉴权/执行冻结与配置保存，在C进行后台浏览器保存、重载和窄屏验收。Task4继续协议wire/私有素材提交，不以初版代码作为本模块验收完成。


Task4共享层记录（尚未功能验收）：引用解析核对artworkId、storageKey、URL的一致性与作品完成状态，真实MIME/大小取服务端媒体记录。普通和嵌套元素在提交副本统一授权、签名900秒，存储身份继续保留；不以不相关作品ID授权外部URL。外部素材先走媒体上传，媒体真实时长核验在Task10补齐。新增typed wire注册/构造/解析接口、有限明确字段、未知状态和无结果完成响应的暂态分类；额外参数只有显式映射才发送，保留false/0，禁止覆盖model/prompt/auth。旧适配器仍保留兼容分支，新profile绑定和实际transport在Task5—7接入，创建前权限/校验在Task9接线。8引用真实读取、跨用户预扣前拒绝、未知响应和脱敏断言已编写，统一A运行。Task3源码提交d1b9116；再次fetch后origin/main仍3f1aa4a，其他同事新分支未作为本轮代码整合。


Task5初版实现记录（尚未运行验收）：

- 新增6个协议模块与统一wire适配器；显式videoProfile才使用新分支，旧无profile任务继续原适配器。Grok2API、CogVideoX3、Agnes帧数与Agnes2.5独立配置，Kling2.6与3.0分开；Omni text/image/reference/transformation使用各自字段与数量限制，超量明确拒绝，未沿用上游slice截断。
- Ark content角色、generate_audio、水印、seed=0/camera_fixed=false保留；Gemini依据固定IC源码使用inlineData原始图片字节和operation路径；MiniMax/METASO使用H3的content和v2创建/查询，不混用Hailuo v1。KIE3/Omni按固定Go翻译器对应multi_shots/kling_elements/elements及定制/智能分镜字段；API Mart分镜index与元素字段、Omni video_list和运动orientation分开。
- 请求沿用域名/DNS固定与凭据保护，只有创建计入供应商费用观察；响应有明确状态/产物字段，缺ID保留创建结果未知，未知轮询/缺视频继续重试。下载当前拒绝重定向且凭据仅给本来源；完整安全重定向和流式媒体核验在Task10落实。停止204空响应已处理。
- API参数格式HTTP用例覆盖24种组合，模拟端校验独立预期endpoint/模型和轮询路径，下载真实可播放fixture；媒体multipart记录收到的字节SHA。错误、无产物和回显URL不当结果已写断言。以上用例未运行，不能视为供应商或应用E2E通过。
- profile加入幂等配置指纹；管理版任务仍按已有规则不自动重提不确定付费创建。Task9将完整请求、元素/分镜、false/省略、预扣前wire校验与恢复接通；Task10将真实时长、安全媒体处理和失败保存恢复接通。共享层提交107ad33。


Task6实现记录（尚未功能验收）：

- TokenDance保留seedance:generations、Kling text/image/motion/omni、Wan3、HappyHorse、MiniMax八种gateway协议，创建ID带协议前缀，轮询只能使用冻结的同一分支；模型选择取实际本次wireModel，不取供应商默认模型。source原本按名称猜路由的部分改为显式wireProfile。
- tfRouter保留原生video/generateVideo和POST video/getVideoStatus(taskICode)，普通、Kling、Omni、Grok各自元数据。规范角色中的last_frame不被一图索引改成first_frame。TF源码Grok分支没有媒体字段，新实现拒绝带媒体而不是静默丢掉；该源码限制需要在演示对比里记录。TF明确base64结果有独立类型，较大JSON安全上限仍待媒体模块。
- Compshare H3与ModelVerse凭据/地址按独立供应商配置冻结；Hailuo原始字节首帧、Vidu文/图/首尾/参考、extend尾帧、lip-sync音频或文字、Wan、Seedance分别构造。ModelVerse所有输出URL保留在resultAssets，当前service完整保存/恢复仍待Task9/10，不以单URL下载初版声称多结果端到端完成。
- 新协议进入配置schema/适配器注册与常用后台来源选择；注册模态按真实协议分类，视频可编辑专属定义与Profile。TF已声明的/v1/models?type=video目录进入真实采集。TokenDance/Compshare未确认标准目录端点，保留unsupported，不编造目录API；可在完整配置中心按已确认源码/供应商资料配置实际模型，独立资料来源记录继续保留。供应商刷新不覆盖手工配置。
- 修正供应商级手工videoProfile也优先于vendor Profile，并计入来源；显式Profile与协议不匹配时发布拒绝。补API Mart运动控制单值image_url/video_url和Omni video_list原始音轨字段。Kling2.6限制5/10秒，测试请求不再沿用通用4秒，避免模拟接口掩盖实际字段限制。
- 原始素材扩充到28份，新增5/6/10秒横/竖/方形，FFprobe/SHA清单及assets-expanded.log记录完成；这是素材准备，不是功能测试。27种新协议HTTP组合和多输出下载断言已写，仍在A集中运行。
- 用户追加分阶段合并授权：A/B/C等大模块验收通过后先合入主线，持续刷新并解决冲突，不等整轮结束。未验收代码留任务分支；完整D交付和上线前全分支复核保持。再次fetch后origin/main仍3f1aa4a；Task5初版b669410已推送。本轮无新服务器连接或部署、无付费供应商调用。


Task7进行中记录：已写plan/manifest schema、变量/环/重复/缺依赖检查和数据库run/node调度；run/node决定稳定operationId，前序必须实际completed且产物仍可读，才能为后续节点补引用并提交。兄弟节点独立，恢复从现有task/idempotencyKey重建关联；不确定创建标needs_attention。当前项目授权调用Task8待实现服务，API/Worker扫描已接线，报价重确认入口仍待补，不具备可交付运行状态。ComfyUI/AutoDL/RunningHub新增manifest映射、上传原始素材、明确历史/结果解码与全产物列表初版；共享上传与重定向/多产物真正保存、原BYOC视频持久化入口仍在接线。新增TokenDance X-App-URL公开署名，供应商密钥继续只在服务端配置与请求内。以上没有运行任何功能测试；未合入main、未部署。Task6提交b048343。

Task7追加：HTTP工作流创建/查询/恢复/停止和Worker扫描已写；调度根节点最多同时提交3个，变量展开后重新执行长度/类型校验，避免模板放大。供应商fixture加入实际Comfy object_info/upload/prompt/history/view与RunningHub上传/状态、AutoDL原生结果格式；只模拟供应商，不替换本站内部API。报价重确认、Task8项目授权、Task9统一提交/取消和原BYOC视频持久化仍待完成；没有运行测试。

Task7脚本已补：纯函数环/变量展开边界、原生状态/映射，以及真实App A→B/C独立分支、跨账号404、重复resume创建次数及真实产物依赖；未运行。现有BYOC ComfyUI图片接口保持，视频持久任务接入与0积分例外将在Task9统一服务改造时落实；不要将当前有结果直链的旧BYOC接口视为本轮已通过。工作流停止依赖Task9 cancellation，项目授权依赖Task8；这些依赖尚未写入。原生工作流结果还需要Task10检查全部产物并保存，当前wire只保留完整列表。

Task8初版记录：独立账号+节点ID表、项目索引和operation幂等记录已写；位置修改保留配置，过期revision返回409，软删除可以按新revision恢复。整批复制使用单事务/整批重放缓存，并重映射内部视频节点ID，生成记录不随复制重放。createVideoTaskWithReservation新增可选onReserved，创建和预扣同事务关联节点；完成时只更新仍指向该任务的节点，不由旧任务覆盖新结果。工作台发送改为授权实际目标项目，跨项目创建确定性媒体引用，重复发送幂等；已删除结果明确不可用，不补建未经核实的失效媒体。任务列表增加本账号projectKey/nodeId筛选。节点脚本含持久空白节点、跨账号404、revision409、回滚积分/任务、复制/恢复及生成关联，登记检查点A未运行；/generate接线和结果真实媒体/多输出仍待Task9/10。未合入main、未发布。

Task9初版记录：统一提交先规范完整输入/素材权限、文字来源与镜头描述，按冻结能力二次检查，并构造实际wire请求后才预扣；保留原始/编译提示词、引用排序、分镜、元素、camera和false/省略，不再裁20引用/1000提示词。请求version2用于完整恢复，旧任务走原冻结/旧字段恢复，不注入最新供应商资料。新增prepared→sending持久边界与行锁，尚未发出的队列取消同事务释放预扣；已发出/未知任务不自动重提，停止ACK后仍须轮询确认取消，协议不支持停止时继续原任务。未知/异常轮询累计后等待核查且保留预扣；明确失败/取消和完成保护已有幂等结算，已终止任务不能再完成。重试必须新operationId、完整旧配置和当前报价确认，缺参考明确拒绝，不降级文生。人工关联上游ID/确认未创建仅管理员可做，已有上游任务只恢复轮询，不能按未创建退款。

工作流补齐逐节点报价确认，确认单独保存、不修改原计划；停止未提交兄弟节点，实际子任务沿统一取消。BYOC视频使用同一App/Worker/任务恢复与原0积分例外，独立AsyncLocalStorage隔离账号端点，不修改全局provider注册表或环境；端点凭据进入既有加密凭据库，工作流图与冻结引用使用加密快照。原图片工作流路径保留，显式视频及已识别视频输出节点进入202持久入口，纯文视频无需伪造图片来源；未知自定义视频节点可显式mediaType=video。BYOC重试使用原加密图和凭据、独立新任务，媒体真实检测/全部产物保存仍待Task10。

节点Task8提交1cf261a；最新main12105eb的账号授权/桌面分支已先同步到视频分支，新增视频节点generate复用video+canvas门槛。新增检查点A任务脚本（并发唯一提交、长提示词/false冻结、真实预扣队列取消、未知创建不重提、终态不重复结算、完整重试和自备工作流持久0积分），fixture队列准备调用实际DB预扣函数，不mock站内API。所有功能脚本、类型检查和构建仍未运行，阶段验收未通过、未回合main、未上线。下一步完成隔离测试环境并集中执行A，修复集中发现的问题后分批合并。

检查点A已开始集中运行：原生规范contract通过，24个IC协议HTTP组合和27个TokenDance/TF/Compshare组合通过，下载使用原始可播放素材；完整TypeScript检查通过（初轮7类问题集中修复，包括脚本CJS入口、JS参数类型、管理发布原因分支、规范JSON类型、header类型及KIE处理中空resultJson）。这些不等于真实供应商质量/额度通过。已通过真实App私有媒体/跨账号隔离fixture与8个私有媒体引用实际签名读取、未经授权不预扣；配置优先/发布冻结/旧digest初轮通过。节点、工作流、任务/停止/计费完整检查仍在进行，没有宣布A完成或视频分支已回合main。

隔离环境证据：103新建独立naumi-video-fixture-db-20261013容器，owner label=canvas-video-fusion-20261013，数据库naumi_video_fixture_20261013含public owner guard，只绑127.0.0.1:14732；Windows受保护临时目录存DPAPI fixture密码，SSH密码仅进stdin内存，loopback隧道本任务PID14868/57301。实际Router使用固定b3fc8dd源码本机Go1.26.4编译，SHA cb4bc506d7dc30a115d6c4bde0dec9669a906f6192da1bb963ece5339d2e39b0；每个App fixture独立Router进程/加密状态/密钥和回调本站真实capacity接口，未mock本站API。每轮独立DB schema与App/Worker，结束清理本轮进程树，不杀其他Node进程。未连接正式DB/Router，未修改正式配置/媒体或部署；只读锁内观察正式App已被同事更新到Image0cce99f4…，空间43%/66GiB，最终发布基线必须刷新。

A补充：节点验收通过，包括创建/位置更新/复制/软删除恢复/跨账号404、预检查409和实际onReserved关联失败时任务与预扣一起回滚。修正新节点/任务重试被通用模型入口误当图片的问题，视频模型改在拥有的节点/旧任务授权后由统一服务选择；视频本身的durable operation取代外层通用待提交回执，提供按幂等编号查任务，避免并发重复请求提前被拒为pending。完成事务保留真实tree/batch项目，不把生成节点当作品父节点。

工作流A→B/C整链通过，前序必须真实completed才提交B、C独立、重复resume不重复创建。由于SSH数据库SELECT耗时约409ms，首次90秒整链预算与手动tick90秒不足；统一按部署Worker的300秒HTTP期限核对并保存运行日志，不把超时当退款依据。随后为后续集中E2E准备本机独立PostgreSQL16.15（EDB官方ZIP43bb45f1...，只解包到本任务output，无系统服务/现有数据库改动；owner marker、独立data/loopback端口53292、DPAPI密码）。Windows数据库查询与App请求已恢复本地速度，保留103独立库作Linux兼容验收备用，临时明文密码文件已删。

节点/批量计划允许完整原生workflowManifest与同一camera schema，工作流任务的manifest使用加密快照+稳定digest，不进公开响应；手工禁用摄影参数时预扣前拒绝。任务集中检查首次其余正常，而BYOC结果被目标URL查询字符串校验误拒，已修正为验证无查询的接口基址、按同一固定域名下载完整查询URL，仍保留凭据/元数据服务拦截。该任务脚本正在复测，AutoDL/RunningHub真实App工作流入口待运行，A仍未宣布全部通过或合回main。

A最新通过项：任务脚本已实际验证同operation并发只创建一次、长提示词/false完整冻结、可靠未提交取消从不发供应商请求、完成不重复结算、已接单断线needs_attention保持并在App真实重启后不重提、失败原配置完整新任务重试，以及BYOC真实队列/历史/媒体保存0积分。AutoDL/RunningHub真实App→Worker→原生供应商HTTP→私有媒体/结果完整入口通过，使用所选workflowId，manifest加密冻结。上游取消支持/明确405不支持的边界补验正在运行；51个原生wire检查和配置/节点/依赖链已通过，A收尾后按用户要求先合回main。

检查点A收尾通过：24个IC/27个新协议HTTP组合、contract、配置优先与发布冻结/旧digest/错误vendor协议拒绝、真实私有媒体fixture、8参考素材读取、节点持久化/复制/恢复/真实事务回滚、A→B/C依赖与重复恢复、完整任务并发/重启/取消/结算/BYOC0，以及AutoDL/RunningHub真实App/Worker工作流均通过。支持取消的Ark实际DELETE后轮询确认取消并释放预扣；明确405不支持取消的上游继续完成并结算，支持标志为false，不重发停止请求。最终完整TypeScript检查通过。结果核验/全产物保存与媒体处理仍在B、画布/Agent在C、完整34矩阵/演示/构建/线上交付在D；真实视频供应商质量和额度未验收。

按用户要求准备首批合回main：再次fetch发现主线已到7b4c970，新增生图能力、folio预览和企业组织功能；本任务先保存A修复，再整合新主线并做受影响的合并验收，保护新功能与已发布版本。不能用之前12105eb或ee351d9覆盖最新代码；没有新部署。

阶段合并验收通过：最新main7b4c970的生图/企业/folio改动完整保留，7处冲突按双方字段合并（schema同时保留imagegen/video、模型执行同时保留图像需求和视频冻结、后台同时保留两组编辑/发布/审计、供应商资料同时验证两类、协作记录保留双方阶段）。合并后的TypeScript、imagegen contract/capabilities、视频配置冻结、完整任务并发/重启/取消/结算/BYOC，以及AutoDL默认映射+RunningHub显式映射真实App/Worker均通过；日志在本任务checkpoint-a目录。未重复不受影响51协议或其他已通过项。准备普通快进main，不操作共享checkout、不强推；本次仅代码阶段合并，不发布103。

首批阶段合并已完成：git普通原子推送成功，origin/main与origin/codex/canvas-video-fusion-20261013均为65db84d0fdc5c2f02e8a338d7b96074e8dac811f（7b4c970→65db84d），无强推、无共享checkout操作。这次是检查点A代码整合，非发布；服务器配置/数据库/媒体未修改，维护次数不因Git合并增加。下一步Task10真实视频核验/全产物/隔离媒体worker与大模块B；任务目标active，C/D、演示站操作、固定镜像与103最终上线仍未完成。

Task10 第一批媒体基础已实现：新增真实媒体任务/账号隔离 API、实际 FFprobe 缓存、首当前尾帧/音轨/分离/裁剪/拼接/原生命令和多输出 Worker 框架，逐任务 Linux chroot/独立UID/干净环境/seccomp网络禁止的 launcher，以及固定源码镜像/Compose内部服务声明。结果下载按实际字节限额，主视频开始用真实探测尺寸且显式owner上传；通用作品事务接口使主视频与媒体产物可同任务状态/计费事务提交。fixture新增独立真实媒体Worker/原创静音素材；媒体集中验收脚本已写入但尚未运行。Node语法和本批TypeScript检查通过，B尚未通过：全供应商产物/输入SHA时长冻结/旧抽帧迁移/手工媒体费用/磁盘并发与回收/完整分片/实际取消/发布回滚接线及Linux执行验证仍待补齐，详见 `docs/changes/2026-10-13-canvas-video-media.md`。

继续遵守分批整合：本批仅保存任务分支，未把未验收的B代码合回main；刷新发现主线已到b42a8cb（含企业分析移动端/数值积分CSV修复），下一次阶段合并前保留这些改动并集中做相关合并回归。此阶段没有业务发布，也没有连接旧服务器。

Task10 第二批接线完成开发：真实字节/完整解码/SHA缓存及版本标志接入引用，冻结SHA并在inline/旧multipart/工作流上传再次核对，实际时长用于能力限制；文件名按真实MIME。新增全部视频/图片/音频产物的持久清单、逐项恢复/所有权/SHA/真实媒体元数据，主视频与全部作品/项目/结果清单/冻结费用同事务完成；记录时长、尺寸、比例与音轨偏差。所有结果下载（含旧OpenAI/URL回退）逐跳固定DNS及清理跨域鉴权，TFRouter inline有独立字节上限。旧抽帧移至持久独立Worker；新增默认免费且保留人工收费的video.process规则、报价确认/冻结/预占及一次结算/失败处理，不改BYOC生成0积分。结构检查发现的新Feature标签和下载返回类型已修复，后续完整TypeScript及Worker语法通过。B实际功能/收费/内存/取消/多产物/异常/沙箱尚未验收；原生辅助文件/序列/完整分片、队列/磁盘与清理、固定发布候选/回滚仍继续开发。主线最新70f1601的企业发布交接将同步保留，尚无本批main合并或新业务发布，详见本模块文档。
