# 视频编译架构验收账本

本账本对照 [RFC §14](../architecture/2026-11-14-video-compiler-rfc.md) 的原始 A01–A19；不改变完成范围。代码在 main、函数测试、本地真实 Web/Worker、真实供应商、生产发布是不同证据层级。历史日志只证明其固定版本，不自动升级为当前源码或线上通过。

## 当前完整应用切片

`scripts/verify-video-compiler-process.ts --projected-worker-env` 启动本工作树的真实 Next dev、独立应用 Worker 生产 bundle、独立媒体 Worker，使用随机隔离 PG schema 和本地供应商 HTTP。不是 Route 函数直调，不模拟应用 Worker，也不是生产构建/公网蓝绿。

14 个检查覆盖：真实中间件/用户 Cookie/API，预览五类表零副作用、旧错误元数据不否决、预览和任务 planDigest 一致、同操作并发重试、跨用户读取拒绝、受理后型号/凭据/售价变更不漂移、生产白名单投影、真实签名媒体读取与篡改拒绝、Worker drain/两次重启、原回执查询落片、父子资产、取消前零发送、显式 retryOf 单次新执行、LIVE lease 不抢占、原 sending/UNKNOWN 不重放，以及三个已完成任务三笔账本（7+17+17=41）。

证据目录 `E:/Workspace/naumi/output/video-compiler-process-20261114`，最终包日志及退出状态以 `VERIFICATION.txt` 为准。`--browser` 增量是实际 `/video` 页面，不替换组件/HTTP；4项真实Edge/React检查已独立通过，pageerror0、额外生成0，不由上述 API 检查代替。

## 真实画布增量（2026-11-14）

本轮切片见 [画布历史与下游记录](2026-11-14-video-compiler-canvas.md)。`--canvas-browser` 在同一真实Next/PG/独立Worker底座上新增原生ReactFlow拖线和历史选片，HTTP/组件替换0；独立解包副本已完成14项进程＋4项工作台＋10项Canvas，exit0，pageerror0；最终证据 `E:/Workspace/naumi/output/video-compiler-canvas-20261114/copy-runtime/run-8c912f38-f7ab-4d09-b309-b1f7f1deb67b`。

已复现并修复两个产品问题：新解析器隐式采用未完成任务的旧结果；工作台历史发送到画布后，项目任务列表漏掉已完成原任务而使Dock永久等待核查。前者保留显式历史选片正控，后者用Canvas发送关联补齐查询而不改变原冻结projectKey/参数/报价。

## Workflow/Storyboard/BYOC独立进程增量

[本轮模块记录](2026-11-14-video-compiler-workflow-process.md)新增真实HTTP→独立Worker：8个托管工作流run/13项检查，以及ComfyUI实际上传、冻结DAG、poll/view成片、零积分/重试/Canvas工作流8项检查。源码进程运行 `run-fc6b955a-cab4-468d-87ad-05f10b5cdaf7` exit0；独立解包副本 `copy-runtime/run-bd5ebced-e3f4-4cce-8d26-9bdd8a5bc808` 同时串联4项工作台/10项Canvas，总49项，exit0；完整命令、逐字输出及回滚见 `video-compiler-workflow-process-20261114/VERIFICATION.txt`。

新发现并修复应用Worker白名单漏传显式私网端点策略，基线Web受理而Worker任务queued、上传和prompt0、tick UNKNOWN；仅恢复已配置变量传播，不默认允许私网，不传给native媒体子进程。

## Agent / RunningHub / AutoDL 真实进程增量

[本轮模块记录](2026-11-14-video-compiler-agent-process.md)补齐真实 `/api/agent`→运行时/Harness/报价→签名内部HTTP→独立Worker，以及RunningHub/AutoDL的真实上传或签名素材、冻结工作流、回执后重启、取消/显式重试和UNKNOWN不重发。Agent 6项、两远程协议10项，既有产品校验和协议未改动。

源工作树首次组合中Agent6项已通过；远程协议定向运行 `remote-targeted-runtime/run-3d74b54e-bb93-4ace-be9e-36e5a0c6fe2d` 完成14项底座＋10项增量，exit0。独立解包最终组合 `copy-runtime/run-14eb3aee-d67b-4625-96c1-c479aa90c66a` 已完整通过65项，exit0，账本20笔330 fixture积分、12子进程退出、随机schema移除；全命令和六路径回滚记录在 `E:/Workspace/naumi/output/video-compiler-agent-process-20261114/VERIFICATION.txt`；旧驱动缺draftRevision/错误Authorization断言的失败日志保留，不算产品缺陷或通过证据。

## 冻结预算 HTTP 确认修复

[模块记录](2026-11-14-video-compiler-budget-process.md)：真实HTTP受理后设置显式历史欠授权检查点（授权1、实际17；不伪造状态/任务/确认），独立Worker准确停下，但基线GET仍暴露旧金额，按旧金额确认200后持续needs_confirmation。修复通过独立 `confirmation_quote` 持久化所需报价，原加密冻结预算与公开原预算不变；版本陈旧/金额不足/非整数确认409且不改状态。旧无提案记录仍能经既有路径恢复。

源工作树预算7项＋底座14＋Workflow13通过，独立副本扩展预算10项已通过，其中成本加成cap匹配为纯规则检查，其余为实际HTTP/Worker；独立解包最终75项组合exit0，测试账本21笔347积分、预算新增1笔17，13子进程退出；十路径回滚重现旧行为、原App138通过。完整命令与回滚回执见 `E:/Workspace/naumi/output/video-compiler-budget-process-20261114/VERIFICATION.txt`。真实付费成本加成供应商或新准入自然涨价不由此fixture证明。

## 三媒体输入等价及Worker持久状态修复（2026-11-15）

[本轮模块记录](2026-11-14-video-compiler-input-equivalence.md)：真实Canvas上传、ReactFlow拖线、@提及，同一PNG/MP4/WAV分别经三条入口生成，原素材身份、默认角色、请求/有效参数、计费与语义wire等价；混合image/audio/video顺序及提示词引用随重排/重载保持；跨用户预览拒绝、删除提及不静默改指向。输入21项、10任务170 fixture积分。

完整六路径解包副本 `video-compiler-input-equivalence-20261114/copy-runtime/run-4d5e0317-ea2a-4d9e-807e-561d6811bda2`：96项通过、exit0，31笔517 fixture积分、三浏览器上下文关闭、13子进程退出，供应商真实取回的12份输入字节SHA相符。三条路径的本地行ID不同，未声称planDigest/短期URL逐字相等，也未覆盖全部结构化素材。首次组合暴露Windows状态原子rename EPERM→WORKER_CONTROL_FAULT；仅增加同源同目标有界710ms重试，不重发任务，Worker49项和真实500控制通过；持续失败仍暂停并拒绝resume，六路径回滚恢复基线故障。完整命令/输出/哈希见该证据目录VERIFICATION.txt。

## 固定Linux生产构建与包验收（2026-11-15）

[本轮记录](2026-11-15-video-compiler-production-build.md)：main固定 `dcbb9494`、版号1794674158，完整现有Dockerfile构建退出0，Next standalone及Worker依赖闭包通过。镜像内Worker49项、真实standalone7项/50HTTP/46JS-CSS资源通过；manifest中574个tracked源码输入与git archive逐一核对。运行容器无网络、无数据库、无供应商凭据并已移除。不能把无DB包验收或development96项组合升级为生产镜像的DB/浏览器/生成全链路通过。

## 固定生产镜像带DB/独立Worker/原生sandbox验收（2026-11-15）

[本轮记录](2026-11-15-video-compiler-production-process.md)：扩展同一实际进程驱动的`--production-package`，不修改或替换产品实现。固定dcbb9494/1794674158镜像内standalone Web、独立Worker及原生C launcher/chroot/seccomp媒体处理，随机隔离PG schema、本地供应商，首轮61项和最终解包副本62项均退出0。最终包括底座15、预算10、Agent6、RunningHub/AutoDL10、Workflow13、ComfyUI8，19笔313 fixture积分、18次JSON创建、22次结果下载；13子进程退出、schema及pool清理。实际UID/版本/包哈希、媒体无数据库配置的spawn参数和sandbox health已核对；基线14、默认dev14、tsc、核心137及三项生产运行反控通过。完整精确回执在`video-compiler-production-process-20261115/VERIFICATION.txt`。这不是生产浏览器、combined supervisor活动中断、新旧双槽或真实付费上游证明。

## Storyboard实际操作与两处产品修复（2026-11-15）

[本轮记录](2026-11-15-video-compiler-storyboard.md)：正式方案复用不再错误要求clean fork节点有伪造lastResult，仍由原服务端验证采用归属；制作记录返回编辑显式带方案ID，拆合镜后不另建原节点空方案。最终独立副本串联61项既有进程与10项实际Edge分镜操作，共71项退出0，22笔364 fixture积分、13子进程退出/随机schema及pool清理。UI覆盖拆合、17积分确认按钮、审片批注、采用、clean fork、陈旧方案409、成片和单镜返工。当前为development Next/实际独立Worker/本地供应商；新增UI修复需新的固定生产构建。旧受控UI基线与修改版同样超时，实际副本初始画布account读取失败仍开放，后续暖路由完整通过不抹去首次失败。

## 新固定生产镜像与真实浏览器（2026-11-15）

[本轮记录](2026-11-15-video-compiler-production-browser.md)：产品固定d4b6a58b/1794680841，完整生产构建exit0，574个tracked Worker输入匹配git archive，LinuxWorker49/核心137/tsc通过。最终解包副本实际production Web/独立Worker/native sandbox组合62项，与同一进程上实际Edge工作台4/Canvas读取恢复2/完整Storyboard10串成78项，两个命令均exit0；22笔364 fixture积分、21JSON创建25下载、13子进程/schema/pools/relay清理。前三种环境反控均在DB初始化前退出1，原入口回滚15项仍通过。

完整分镜包括实际17确认/采用clean fork/成片/单镜返工；工作台和Canvas只读操作的供应商/任务/账务无增量由桥接DB另核。首次生产Canvas不做dev API预热、页面错误0；不因此关掉development脚本解析根因。最终测试驱动修复跨OS半写receipt和30行历史分页假设，产品业务源码未改。实际付费/部署0，47 HOLD、总目标ACTIVE。

## A01–A19 逐项状态

### Combined 活动中断增量（2026-11-15）

[本轮模块记录](2026-11-15-video-compiler-combined-interruption.md)：修复真实SIGKILL下已sending无回执任务被误分类为新claim、继而受旧active记录阻塞而永留queued的问题。两恢复入口集中使用`videoRecoveryAdmission`；只对v2/v3非prepared无回执任务允许不重发的continuation，实际重提限制/原UNKNOWN/活动记录不变。

固定8201d649/1794683899生产镜像实际root PID1 combined监督器＋非root scanner＋native sandbox，HTTP4项/中断8项完整exit0；真实SIGTERM在途超过13.5秒、POST/GET各SIGKILL一次、两次210秒lease自然到期、旧UNKNOWN逐字保留。未知POST转待核查且0账本，原回执GET恢复结果及单笔17；另一个原任务单笔7。最终独立解包生产62项、tsc/核心137/Worker49/恢复26项通过，6个combined容器及schema/进程/pools回收；四产物和副本回滚详见同名证据目录VERIFICATION.txt。

这补齐A14/A19的combined在途信号证据，不替代历史v2/新v3混合、新旧双槽、启用绑定、目标站蓝绿和真实付费上游。总目标ACTIVE、生产写入0/付费0/部署0。

| ID | 当前证据 | 仍需完成或证据边界 |
|---|---|---|
| A01 | 核心/发布执行/1,741 App 的 poison modes/limits/verified 正控与显式政策反控；本轮真实 HTTP+Worker 普通图片成功 | 每个生产通道显式发布绑定和真实上游不由本地正控代替 |
| A02 | 绑定迁移79项、实际管理19项，原能力/价格/映射/旧版本不变，send=omit 与独立政策保持 | 线上资料同步和人工维护数据继续由目标站实际版本验收 |
| A03 | 任意新 wire 型号的显式 JSON recipe、本轮 future-process-video 实际发送；缺 Binding/字段准确诊断 | 未知协议不得猜映射；实际环境专用路线仍需列出/迁移 |
| A04 | describe/compile 共用 Profile；实际 Next 预览摘要与受理 planDigest 相等，冻结后配置变更不漂移 | 全部入口和所有 Profile 的等价证据仍分层记录，不从一个输入泛化 |
| A05 | 实际 Next 预览前后 tasks/creations/billing operations/reservations/ledger 数量相等、供应商0；现有 React 测试覆盖陈旧响应/账号和修订 | 陈旧响应的受控 React 测试不冒充所有真实 Web 交互 |
| A06 | 可信输入/顺序/角色核心测试及 Canvas/上传/Agent App 输入路径 | 本轮真实三媒体上传/连线/@提及21项及混合顺序通过；本地行ID不作语义等价依据；字符/场景/多轨等结构化组合仍逐项验收 |
| A07 | 原 text+image 自动意图、两普通图保留reference、明确偏好报缺素材；实际 Next 的 text+普通图进入 single_image | 真实浏览器端口拖线已通过；全部历史输入形态仍逐项保留，不以单条reference概括首尾帧等组合 |
| A08 | 原 UI/图谱18项、实际 React/Edge10项、Dock连续性受控检查；本轮真实Next工作台历史参数展示/复用/390px/当前报价4项通过 | 本轮真实Canvas已覆盖切模型/保存/重载/生成前后Dock/锁定解锁/两节点多选与右键/390px；三媒体上传/提及/拖线等价和混合重排本轮通过；更多结构化节点组合继续 |
| A09 | PG/HTTP 跨用户拒绝、媒体身份/hash/真实解码、结构/角色/数量约束；本轮实际签名输入字节及篡改404；新增5种当前未完成状态不可隐式使用旧结果、显式历史可用；实际HTTP queued反控 | 新增三媒体跨用户实际预览422且零任务/账务/供应商增量、移除提及后生成禁用；完整物理边界仍逐维验收，不能把已授权URL当真实解码 |
| A10 | Canvas/Workbench/Workflow批次/Agent/Storyboard/BYOC/重试共享编译底座；Agent6项；新增实际分镜编辑/拆合/批注/采用/独立分叉/成片/单镜返工与确认按钮10项 | 高级音频/模型辅助审片、原稿Agent分镜质量及生产浏览器完整入口矩阵继续，不从基本10项泛化所有高级操作；初始account读取问题开放 |
| A11 | 注册57个 wire Profile 的分族序列化、上传/JSON/multipart/DAG；ComfyUI、RunningHub、AutoDL新增真实Next/独立Worker上传或签名素材、冻结与结果回执 | 注册覆盖≠所有在用配置已迁移；全部生产启用配置和env-only仍需明确审计/迁移，不能从本地显式recipe推断线上已配置 |
| A12 | 真实PG Workflow22项：future slots、真实前序时长、静态hash、冻结报价确认、批次/不重放；新增实际分镜按钮按17而非历史1确认，两个镜头最终各执行一次 | 独立Worker的8run/13项及HTTP预算反控继承；欠授权历史检查点显式seed，未冒称新准入自然涨价或真实成本加成供应商验收 |
| A13 | 本轮实际 requested4K→effective2K→wire2k 恰好一次，历史恢复4K；冻结原价7、后续新任务17，账本三笔41 | 更多映射组合由各Profile固定输入测试；不把wire值回填用户选择 |
| A14 | 独立应用Worker、持久tick原身份、重启/UNKNOWN/LIVE lease/取消/显式重试及环境投影；Worker49、Windows真实500控制/501状态写入；新增固定Linux生产包62项中实际独立Worker恢复、单账本与原生sandbox | Workflow/BYOC的Linux独立Worker重启与UNKNOWN不重放已通过；本轮固定生产包combined真实PID1在途SIGTERM/SIGKILL、两次自然lease和UNKNOWN原像保持已通过；混合版本和真正多槽回滚继续 |
| A15 | 服务端专项实际持久化加密v2 stage及新发布后恢复；原文本/模型/价格/回执不变，伪造阶段拒绝；v3显式retryOf；新增4c真实HTTP v2 writer/旧Worker、f075新Worker接续v2、d4 reader接续v3、切回f075的9项实际混合运行 | 本地三不可变版本/真实PG/原生sandbox通过；d4缺本轮准入保护，只证明reader兼容，不认证完整回滚候选；目标站仍独立验收 |
| A16 | 原媒体token/版本/过期测试；本轮Worker物化真实签名URL，供应商fixture经真实Next媒体路由读取原字节，篡改404 | 时间推进的过期测试与实际公网CDN/存储恢复分别验收，不把本地域名别名当公网可达 |
| A17 | 本轮真实Next受理→独立Worker落片→结果作为下一Canvas节点source_video→再次落片，父子资产/单账本通过 | 已新增真实浏览器选旧历史→ReactFlow拖线→下一节点提交→独立Worker落片，冻结资产/parent/单账本一致；当前为本地供应商fixture，非真实付费上游 |
| A18 | 编译、供应商fixture受理、成片真实解码保存、账务分别核对，结果含真实输入字节hash | 真实付费供应商质量/成功率和用户采用仍未验，不能标Production-confirmed |
| A19 | 已有源码副本回退/扩展字段兼容、发布控制/版本准备门禁；固定Linux生产镜像构建、Worker49/无DB包HTTP7项；新增带隔离DB/独立Worker/原生sandbox/账务62项实际组合通过 | 本轮生产工作台/Canvas恢复/完整Storyboard16项通过；生产三媒体及更多结构化组合、新旧Web/Worker双槽、排空/切回/旧资产、目标站蓝绿和实际发布仍未验 |

### 真实混合运行与视频新操作准入（2026-11-15）

[模块记录](2026-11-15-video-compiler-mixed-runtime.md)：9项真实v2/v3三版本混合运行补齐A15的本地证据，同时发现draining Web仍受理新任务。视频模块统一接入既有release owner，不触及能力矩阵；managed/BYOC/Workflow/batch及显式重试共用新操作准入，原操作查询先重放，active同账号父操作允许续接，UNKNOWN不重写。

固定f075生产镜像完整构建/576 tracked Worker输入通过；最终独立解包62项原回归＋8项实际HTTP排空＝70项exit0，另有准入PG12、核心137/Worker49/tsc及14路径副本回滚。基线实际drain仍200且增加1任务；修改版503/VIDEO_RELEASE_DRAINING且零业务增量；预览/历史读取与原操作重放保持。混合运行6POST/4账本48 fixture积分/两个UNKNOWN零收费，四份结果原字节与原资产身份保持。

本片仅证明实际固定包的本地进程/合同切换，不证明Nginx完整蓝绿。旧d4 reader兼容不等于具备本轮新准入保护，4c旧writer在新绑定前停止；真正的回滚候选、旧静态资源、站点发布和真实上游继续待验。付费/生产写入/部署0，总目标ACTIVE。

## 发布与总目标

### 完整固定构建与发布创建器带任务验收（2026-11-15）

[模块记录](2026-11-15-video-compiler-release-e2e.md)：完整main7ce2f729/1794692423镜像ac0aadbe构建exit0，实际Worker577个源码输入匹配归档；LinuxWorker49、无DB包7/50HTTP/46资源通过。现有发布创建器扩展实际单图受理、冻结后换型号/价格、Worker重启接续原回执、native保存、结果进入下一Canvas节点、7+17账本及UNKNOWN不重发/不记账；最终源/副本检查与精确数量以四产物VERIFICATION为准。只增加验证驱动，不改产品规则；新旧Nginx/旧资源/完整回滚、启用绑定及真实上游仍独立待验，A19与总目标ACTIVE，47 HOLD/生产写入0/付费0/部署0。

### 发布工具 direct Worker 接入（2026-11-15）

[模块记录](2026-11-15-video-worker-release-mode.md)：修复候选Web已分配worker、但原发布创建器仍生成缺DB/加密配置的HTTP tick caller的问题。沿用原JS配置投影/发布owner，普通与combined direct创建、共享媒体、自己执行身份、启动/恢复核对接通；HTTP历史路径保持。真实创建器→固定Web/Worker→隔离PG的20项空扫描/控制/停启与环境分离验证补充A14/A19，独立副本回退与集成以四产物为准。当前proof包不是新整站生产构建，不替代带任务、付费上游或Nginx蓝绿。总目标ACTIVE、47 HOLD/生产写入0/付费0/部署0。

### 固定程序格式与回滚检查（2026-11-15）

[模块记录](2026-11-15-video-compiler-release-contract.md)：在既有回滚所有者内增加所有 v3 历史任务与 execution_version=1 工作流的只读格式检查，修复只识别六个旧 profile 而误放行新加密计划的问题。plan 1–5 的格式源与真实编译/读回共享；固定 Worker manifest/export/bundle SHA 联动核对，旧包不凭 smoke/名称取得新格式读取权。原排空后重检与兼容当前执行器恢复保持，不写业务数据或重发。

集中验证旧23/新15、计划25、实际隔离PG与固定历史包17项、核心137/恢复26/Worker25/tsc通过；独立副本源码回退、哈希及主线集成以四产物VERIFICATION和INTEGRATION为准。当前只构建Worker格式证明层镜像，不是新整站候选；未接Nginx或站点。历史HTTP tick创建器→direct Worker迁移、完整回滚/旧资源、全部启用绑定和真实上游仍开放。A19与总目标继续ACTIVE，47 HOLD/生产写入0/付费0/部署0。

总目标继续 ACTIVE。47 HOLD 保持；生产配置迁移0、付费0、部署0。下一步按上述缺口推进，不以 main 合并、14个检查、任意一份绿色报告取代完整 RFC 退出。后续通过项追加实际固定版本、命令、输入范围与回执；失败不擦除、不降格为无关项。


## 画布读取失败恢复与导航凭证（2026-11-15）

[模块记录](2026-11-15-video-compiler-canvas-recovery.md)：确认初始项目刷新失败后，原重试只恢复作品、遗漏导航凭证；现有错误按钮接入同一导航读取入口。同一请求并发共享，项目/账号/工作空间 ABA 和晚完成隔离；文字 load=false 不再是成功。新增实际 React/实际 Canvas 读取组合及按钮8项，既有导航30、Assistant联动95、作品49、缓存20及完整tsc通过。实际Next两场景读取恢复与完整分镜10项通过。旧独立版本UI超时确认由夹具缺process.env导致，仅修测试环境后原6项通过。

本片集中副本、回滚和最终集成结果以新模块记录及四产物VERIFICATION.txt为准；冷启动瞬态Invalid or unexpected token的具体脚本/字节根因仍开放，不能据后续暖路由、重试成功或UI修复关单。固定生产镜像需重新构建。全目标ACTIVE，47 HOLD/生产写入0/付费0/部署0保持。

## 双固定包真实 Nginx 切流与回滚（2026-11-15）

[模块记录](2026-11-15-video-compiler-nginx-acceptance.md)：旧完整包7ce2f729/1794692423与新完整包526148e8/1794693854，复用既有静态资源并集、网关完整CAS/语法/原子替换/reload、Worker控制和固定格式回滚守卫。在本地真实Nginx/Next/独立原生Worker/PG中最终源55项通过：旧Worker受理后新Worker续查原回执、全部645旧资源在旧→新→旧SHA相同、两次切流各60HTTP全200、陈旧CAS/错误语法负控、UNKNOWN不重放、账务资产不回退、回旧包仍可接受新任务；最终4任务/3笔video账本/41 fixture积分，7槽/schema/网络清理。独立副本、四产物与main集成以证据VERIFICATION/INTEGRATION为准。

两个固定包之间产品运行源码相同，不泛化为任意跨版本兼容；调用真实组件所有者不等于整站lifecycle/controller CLI已验收，资源HTTP不等于浏览器水合/RSC零刷新。新完整包构建/Worker49/包7项50HTTP46资源/核心137/tsc与现有发布回归通过。真实目标站、全部启用绑定/环境路线、授权上游和浏览器连续性仍开放。总目标ACTIVE、47 HOLD、生产写入/付费/部署0。

## 环境导入协议与连接设置保留（2026-11-15）

[模块记录](2026-11-15-video-environment-bootstrap.md)：确认环境解析器已读取videoProfile/timeout/appUrl，但bootstrap丢失，导致原可审查的显式协议通道退成mapping_required。仅修复导入字段传递，不为env-only虚构recipe。新增实际PG导入/原版本发布/冻结reader56项：41条来源夹具中32明确候选可审查、9条真实待配置保留；路径/授权/幂等/价格/政策/旧版本/凭据不变。数量为夹具，非生产目录；既有注册配置/Flow、迁移79、readiness15、管理19、核心137与完整tsc通过；独立副本/四产物/main以证据VERIFICATION和INTEGRATION为准。线上已发布配置不自动回填，目标站实际绑定/无profile路线、授权上游及完整P4仍开放，总目标ACTIVE、47 HOLD，生产写入/付费/部署0。

## 高级输入真实生产包与节点错误诊断（2026-11-15）

[模块记录](2026-11-15-video-advanced-inputs.md)：现有完整进程驱动新增首尾/双普通图/多模态/音频/镜头元素分组/Canvas/显式retry及native plan4/5十项生成，原始字节、预览摘要、Worker重启后的冻结映射/文字和单账本逐项核对；真实物理超限/权限/身份/结构缺映射反控零业务增量。发现Canvas新建/更新漏接VideoContractError，将正确拒绝错误显示为503，现补齐422/code/fields映射，原校验不变。旧包35高级项＋15底座通过；新增真实POST/PATCH负控后的新包/副本最终数量、四产物回退/main以VERIFICATION和INTEGRATION为准，不把旧包当修复上线。目标站绑定迁移、更多高级Workflow/家族、真实授权上游、浏览器连续性及整站蓝绿仍开放。总目标ACTIVE，47 HOLD、生产写入/付费/部署0。

## Workflow未来元素分组与格式2（2026-11-15）

[模块记录](2026-11-15-video-structured-workflow.md)：复现明确未来video元素因无目标字段/空refs被拒，新增可选elementId，统一冻结/物化位置规则。只有Workflow允许受已声明future slot支撑的空组；普通生成/Canvas schema仍要求具体素材，原flat身份和历史值保持。含新目标的持久run标execution_version2，原run仍1/历史0；reader/固定Worker描述/原回滚守卫一并核对，旧0/1包不得回退消费新组。真实HTTP/独立Worker增量覆盖镜头＋静态元素＋未来普通/分组素材、冻结后改配置/文字/价格和重启、历史欠授权确认、物理超限、取消、UNKNOWN/拒绝和零副作用负控；最终固定包/副本数量与回退以四产物VERIFICATION/INTEGRATION为准。生产启用绑定/全高级家族/真实授权上游/浏览器和整站蓝绿仍开放，总目标ACTIVE、47 HOLD、生产写入/付费/部署0。

## 固定包与真实 lifecycle CLI 事务（2026-11-15）

[模块记录](2026-11-15-video-lifecycle-acceptance.md)：既有真实Nginx/固定Next/独立Worker/PG验证器接到原deploy-release.sh --lifecycle；实际旧槽仍运行时finish→CLEANUP_PENDING，下一发布与陈旧CAS拒绝；实际排空/退役/兼容材料及候选状态分别支持complete/rollback事务。新增fixture适配不被生产调用，原partial覆盖不升级成全局事实，数据库/媒体/UNKNOWN不回退；131集中回归与首次complete51项通过，最终源/独立副本数字、四产物及main以VERIFICATION/INTEGRATION为准。真实生产controller/全部业务覆盖、实际启用配置/授权上游、浏览器/TLS与目标站发布仍开放；A19/总目标ACTIVE，47 HOLD，生产写入/付费/部署0。
