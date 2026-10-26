# 核心链路重构专用工作区

2026-10-26 R5D：视频协议合同/纯helper/registry/endpoint分离，19个protocol模块和4个生产消费者改绑；原20文件codec注册环及adapter/upload2文件环已拆，最大emitted静态/全导入SCC均20→3，其余环成员保持，新owner不入环。7170原生产声明保持（21迁移，仅codec查同Map改窄getter），codec/endpoint正文变化0；helper实际bundle生产输入31→6、codec19→0。完整基线/新版53profiles、2506操作结果精确相同，独立912wire/1254场景8251断言、旧33SKU802断言、family886、真实PG双入口16、实际Next六入口20、Worker31及tsc/lint通过。旧provider夹具Request/原生transport注入已修，同夹具两侧48模拟HTTP通过，原失败留存。副本回滚/四产物/远端以R5D DELIVERY为准；同步后第1模块，视频执行归属/媒体runtime/其它小环/UI-CAS/R6继续，不合main、不部署。见 [R5D记录](changes/2026-10-26-video-wire-boundaries-r5d.md)。

2026-10-26 R5C 后 main 普通整合：incoming `368c93e2` 的 13 处冲突已按真实 owner 迁入，未恢复巨型 db/任务/Canvas 实现。父完成通知改为应用注入 completion port，Worker 增加视频协调池排空后关闭；settings/OpenAI/SMTP 原批量算法保留。完整8e203648基线和整合版实际Linux/PG同71检查通过，实际Next六入口20、生命周期37、项目归属31、父完成24+PG19、postaccept11/142+PG18、异常12、视频协调9组、settings78、config14及价格控件22组通过；全项目tsc/源码lint通过。原最大20环和所有SCC成员与整合前完全一致，新owner入环0、db生产消费者0；不是全产品/容量验收。原始失败和旧image定价verifier债务保留。副本回滚/patch、双parent提交与远端以本轮VERIFICATION/DELIVERY为准；本轮三模块main同步计数归零，下一阶段继续视频/媒体runtime与R6，不合main、不部署。见 [整合记录](changes/2026-10-26-refactor-main-sync-r5c.md)。

2026-10-26 R5C：四类持久图片、批次/工作台、改字及原图续交统一Web保存/Worker执行；PG通知仅唤醒、原表/周期恢复兜底，同tick按原lane继续接新任务，排空不补领。完整旧/新Linux16/71、实际Next六入口20、策略18、相邻恢复156/回执59/持久化36/工作台13组及旧进程29/32/39通过；冻结6/current17仍原价，Web执行0/批次HTTP0、混合unknown/显式取消不重提。新owner无环、7124非目标声明和九算法文件保持；tsc/19lint通过。旧image定价verifier端口陈旧导致exit1、五文件对照同失败，仍显式债务，不回退published只读。见 [R5C记录](changes/2026-10-26-image-worker-ownership-r5c.md) 及DELIVERY；本轮第3模块，普通同步main后归零；视频新提交/媒体runtime/20环/UI-CAS/R6继续，不合main、不部署。

建立日期：2026-10-24。

## 工作区与基线

- 目录：`E:/Workspace/naumi-refactor-20261024`
- 分支：`codex/core-refactor-20261024`
- 起点：刷新后的 `origin/main`，固定提交 `905c8c635e41ff3f4443d43db9776d1db3aab469`。
- 原工作区 `codex/imagegen-simplify-release47-20261023` 保留，原提交 `e1ee8442443f4593c3220d4d7c9ae6729f0cb6dd` 不变。
- 本目录是同一仓库的独立 Git worktree，拥有独立工作文件、index 和任务分支；共享 Git 对象库。

## 重构方向

1. 参数与模型选择集中处理一次，执行既定方案，减少各层重复判断。
2. 画布、Agent、参考工作台复用生成任务执行与原结果续交，不增加平行执行框架。
3. 报价冻结、真实余额、幂等结算与交付状态保持明确的唯一职责。
4. 按完整模块替换并删除被替代的旧路径，复用已有 benchmark，集中验收。

保留现有界面、账号、数据库、媒体、素材归属和历史任务；不因重构新增用户侧审批或业务限额。新增需求按实际运营情况确认。

## 当前完成与未完成

- 2026-10-26 R5B：独立scanner接原应用scan，direct回执明确实际Worker，原detached Promise登记/等待后才完成tick和关pool；combined direct scanner不沿用HTTP caller12秒强杀。真实Linux/PG旧8→新29、SIGTERM阻塞排空32、崩溃原回执核对39、combined真进程31通过，Web POST1→0、原6/current17三笔18不变；31unit/combined91、Python30+4、相邻156/36/59及tsc/13文件lint通过。bundle4137396字节/2333输入/HTTP route0，仅外置pg/sharp；Docker/Compose接入并核对，47专用clone仍HTTP未切换。见 [R5B](changes/2026-10-26-direct-application-worker-r5b.md)。第2模块，副本回滚/提交以DELIVERY为准；首次提交排队唤醒、47direct交接、媒体runtime/R6继续，不合main、不部署。

- 2026-10-26 R5A：套图/A+51声明迁真实runtime，route780→221/1072→374；DurableImageJobs/鉴权/恢复owner分离、统一七阶段scan，四类原任务恢复不再HTTP回跳。完整PG旧5/129→新5/156、实际Next34→37通过，原结果/冻结6-current17/三笔结算18、live lease/unknown及release排空保持；12文件恢复环拆开、新owner无环。相邻15项直接通过，middleware24和Linux生命周期补验通过；旧stopping脚本完整新旧同cleanup42P01债务保留、不记绿。见 [R5A记录](changes/2026-10-26-worker-recovery-boundary-r5a.md)。本轮同步后第1模块，提交/回滚/远端以DELIVERY为准。R5B独立进程执行及媒体runtime迁移、剩余环和外围UI/CAS、R6完整候选继续，不合main、不部署。

- 已建立独立工作树和重构说明。
- 已完成固定源码目录/静态依赖盘点及核心调用链审视；主方案见 [REFACTOR_ARCHITECTURE.md](REFACTOR_ARCHITECTURE.md)，实际证据和阶段迁移台账在 `docs/architecture/`。
- 选择模块化单体、单一准备/执行/交付用例、按数据所有者拆分；不先拆微服务或全站重写。首个建议实施闭环为消除 imagegen 对 HTTP route 的反向调用。
- `9fc284514aeaed740cdf55cc49b611445676b517`（包含质量回退 `0fbdd5a8`）已在用户要求开始实施后普通合入，R1基线为 `4478cdca88a6e52b5db186d30ace4ef8724263c7`；不重复开发该修复。
- 2026-10-24已实施R1A1生图与R1A2抠图/同步账务/任务读取切片，生产业务对HTTP route的两条反向调用均已移除；49项真实PG对照保留原价与原回执，并修复并发创作记录503。见 [R1A1](changes/2026-10-24-image-generation-boundary-r1a.md)、[R1A2](changes/2026-10-24-cutout-billing-boundary-r1a2.md)。R1B核心图片准备与报价也已实施，见 [R1B记录](changes/2026-10-24-image-preparation-r1b.md)；R2已统一交付/恢复，见 [R2记录](changes/2026-10-24-image-delivery-r2.md)；R3A图片任务controller已迁移，见 [R3A记录](changes/2026-10-24-canvas-image-task-r3a.md)；R3B/R3C、R4—R6及最终整体验收仍未完成。
- 未复制 `.env`、业务凭据/数据库/媒体。验收使用现有node_modules的只读依赖引用、本任务loopback PG和PNG供应商fixture；不启动产品Web，不构建或调用外部供应商。
- 质量回退已通过 `9fc2845` 保留；其他同事新提交后续按固定SHA逐项核对整合，不自动覆盖未提交工作。
- 47 暂缓发布约定保持；本工作区建立不触发配置发布或服务器更新。

## 开发约定

2026-10-25 R4B6：核心schema与业务runtime分开，33声明/DDL片段迁20个SQL owner文件，Web由轻量37-owner组合准备；billing配置不再构造wallet/task service，Canvas复制移除每次CREATE。46+16次query参数及6838个非目标声明保持，原兼容出口继续复用。完整PG旧3/35→新3/36、实际Next旧22→新24检查通过，26公开函数首次DDL20→0，134表/1208列/255约束/241索引一致；21相邻脚本、全项目tsc/99文件lint通过。startup直接依赖16→3、静态可达215→132，新owner无环；原20/12等环未关。失败literal、绑定、独立副本回滚及patch/提交远端证据见 [R4B6记录](changes/2026-10-25-persistence-startup-owners-r4b6.md) 与DELIVERY。第3模块收尾普通同步main后归零；Fleet/发布协调/Worker及显式BI索引保留边界，R5/R6继续，不合main、不部署。

2026-10-25 R4B5：published读侧删除first-use管理/发现/导入，registry准备归Web启动、原setup配置写入或既有管理链；已有发布只读且不依赖管理token，真正首启不冻结空目录。Supplier video schema共享就绪，基础owner14；模型准备失败保留登录/管理修复。完整PG旧10/96→新10/99、实际Next23→25检查，首次目录metadata GET2→0、结构/写入SQL37→0；10项相邻、全项目tsc/11文件lint通过。新owner无环、读→lifecycle边1→0，原20/12环继续。副本回滚/远端证据见 [R4B5记录](changes/2026-10-25-model-registry-startup-r4b5.md) 与DELIVERY；同步后第2模块，其余ensure/Worker/最终验收继续，不合main、不部署。

2026-10-25 R4B4：Next Node启动钩子顺序初始化13个基础owner，构建/Edge/无DB/sidecar分离；真实Next捕获跨bundle就绪/Pool分裂后，改为进程共用lazy查询Pool和按Pool/owner共享就绪，SQL/事务/任务语义保持。完整PG旧2/12→新7/53；实际Next旧15→新19检查，build SQL均0、首登录DDL3→0、13-owner请求DDL15→0；Compose7→12检查、Worker等Web与DB健康，不接DB迁移。相邻、类型、回滚及远端结果见 [R4B4记录](changes/2026-10-25-web-startup-r4b4.md) 与本轮DELIVERY。同步后第1模块；其它域ensure/模型首次发现、R5/R6继续，不合main、不部署，不将fixture build当完整产品构建。

2026-10-25 R4B3：冻结执行与管理装配分离，4条执行到管理server引用归零；executor/prepare/发布与计费算法保持，已有模型/凭据/计费/投影只读原版本。完整PG旧6/57→新6/71、真实plan HTTP在缺管理token时旧400→新200/current99、冻结原6/current99和投影lease重试通过。相邻模型发布/执行、preparation45、读8/80、身份8/171、frozen-source16、账务/195登录、tsc/14文件lint通过；补正既有视频wire ID误用于公开模型报价及旧测试的MODEL_CHANGED预期，保留旧基线复现。详见 [R4B3记录](changes/2026-10-25-execution-assembly-r4b3.md)。第3模块同步及回滚证据见DELIVERY；显式启动与其它ensure、20/12环和R5/R6继续，不合main、不部署。

2026-10-25 R4B2：原生模式事实、权限repository、唯一创作scope和项目/媒体访问与HTTP适配分离；25声明、45生产消费者90绑定迁移，339原声明AST保持，身份/账务/创作7文件环拆开，HTTP context生产静态消费者47→21。完整PG旧8/168→新8/171，195实际登录、权限、wallet/entitlements与创作writer及tsc/54文件lint通过；fixture首轮错误预期与类型问题日志保留，生产实现未因此修改。详见 [R4B2记录](changes/2026-10-25-identity-creation-boundaries-r4b2.md)；副本回滚/提交远端证据以DELIVERY为准。同步后第2模块，显式生命周期/其余ensure、视频20/恢复12环与R5/R6继续，不合main、不部署。

2026-10-25 R4B1：已发布模型读取与管理组装分离，纯目录/模拟与legacy目录分别归属；原模型8动态/6静态环拆开，重型repository生产静态消费者14→1，reader/catalog到server2边归零。真正冷进程PG只读75→80检查通过，管理token故障不拖已发布读取、历史/坏pointer不seed、空库兼容初始化回滚重试与HTTP保持；原preparation用真实SQL观察器新旧45通过，相关管理/发布/frozen-source16/账务/195登录/任务/内容/商业/持久化/tsc/lint通过。见 [R4B1](changes/2026-10-25-model-read-boundary-r4b1.md)。同步后第1模块；真正空库first-use兼容adapter仍在，显式启动和其余热路径DDL、身份7环、R5/R6继续，不合main、不部署。

2026-10-25 R4A7：旧db最后37声明和35消费者/67绑定迁至卡密、License、订单、后台账号与旧预占owner；db905→51行纯兼容出口，生产静态消费者35→0，223原导出名保持，新owner无环。完整基线6/138→新版6/164（26同函数兼容检查）及原商品/赠额合同、并发单次履约、回滚、unknown不重放通过；相邻账务/195登录/任务3/226/内容7/290/持久化6/78与29/90/平台PG29与unit28/166、tsc/lint通过。见 [R4A7](changes/2026-10-25-commercial-admin-owners-r4a7.md)。本轮第3模块，收尾整合main后计数归零以DELIVERY为准；下一R4B初始化/组装，历史owner全量改绑/授权竞争与最终候选验收仍未完成，不合main、不部署。

2026-10-24 R4A6：模板/缓存/导入、Agent/Genchat会话、项目、Comfy、竞品与历史流水/赠额归属迁移，82声明、36消费者/89绑定，db2361→905行、静态消费者64→35，新owner无环。Agent旧键迁移改原表同事务、Genchat跨owner覆盖与HTTP虚假成功修正、竞品完成后先释放连接再刷新余额；完整基线7/205→新版7/290（含76兼容出口，214行为检查），相邻Agent/钱包/赠额/195登录/任务3/226/持久化6/78与29/90、全项目tsc和本轮lint通过。见 [R4A6](changes/2026-10-24-content-session-owners-r4a6.md)。同步后第2模块；剩余db商业/管理用例、R4B热路径DDL/组装、Genchat客户端错误状态、Worker与最终候选继续，不合main、不部署。

2026-10-24 R4A5：视频与Canvas图片任务的记录/租约/转换事务、预占表和成本审计归属已迁移，53声明/29调用文件85绑定，db3769→2361行、静态消费者87→64，旧db/video6动态环拆开。真实PG复现四条legacy完成/失败持连接再借连接自等待，改显式PoolClient贯穿current/settings/metering，冻报价仍不读current。完整基线3/78→新版3/226，异步任务/视频PG/config/wallet/platform29/Canvas21/frozen-source16/model-publication/creation/auth195/persistence29/90及tsc/lint通过；旧video-reliability两边同样文本提取exit1保留。见 [R4A5](changes/2026-10-24-durable-task-owners-r4a5.md)。同步后第1模块；继续剩余数据owner与R4B组装/DDL，不合main、不部署。

2026-10-24 R4A4：作品查询/写入/后台、Canvas布局/文字/项目/混合删除归属已迁入真实owner；BI上下文、SDK/stream观测、HTTP包装和managed-client身份分离，主迁移144文件358绑定。db4793→3769行、静态消费者130→87，旧67文件动态大环拆开，全项目最大动态环20；旧19静态模型环拆开，残留transport/client3环。原/新观测21/141、真实PG108→176、Canvas20/14/32、私有媒体、BI、钱包、creation、交付27、溯源、tsc与lint通过。见 [R4A4](changes/2026-10-24-artwork-observation-owners-r4a4.md)。本轮第3模块，收尾普通整合main后计数归零，整合与推送SHA见本轮DELIVERY；整体继续，不合main、不部署。

2026-10-24 R4A3：账户访问事实、SessionUser/注册、钱包余额、支付历史和历史provider记录已迁入五个owner；实际71文件126绑定迁移，计费runtime直连真实owner。db5321→4793行，静态消费者144→130且db退出静态环；报价/执行环24→19，视频20仍在，动态最大66→67（session随原runtime链进入）未掩盖。函数对照各28/88、完整源码PG88→146、195实际登录handler及wallet/entitlements/creation/platform29/tsc/lint通过。见 [R4A3](changes/2026-10-24-account-owners-r4a3.md)。同步后第2模块；继续完整候选及R4B组装/DDL，不合main、不部署。

2026-10-24 R4A2：schema兼容初始化、settings raw repository和signup账务策略已有真实owner，43调用文件/102绑定切换；旧门面同函数兼容。db5928→5321行，静态消费者178→144、最大静态SCC56→24，动态最大环70→66仍未关闭。原29/89→新29/90、真实PG6类61→78、35表380列及既有入口通过；原schema第二连接自等待已复现并改同事务。见 [R4A2](changes/2026-10-24-persistence-owners-r4a2.md)。同步后第1模块；继续身份/钱包/资产owner及R4B运行DDL，不合main、不部署。

2026-10-24 R4A1：纯 `src/platform/db/pool`/`transaction` 已接真实消费者，旧入口同实例/函数兼容；79处纯基础import及3混合字段迁出。旧db静态消费者251→178，最大SCC60→56，基础层业务import/环为0，535个非目标函数正文未变。基线27/157→新版28/166、真实PG25→29、wallet/creation A/B及画布PG32/32通过，tsc/lint通过。见 [R4A1](changes/2026-10-24-platform-db-r4a1.md)。本轮第3模块，收尾普通整合main并归零，精确结果见本轮SYNC；R4A2数据owner与DDL/组装环继续，不合main、不部署。

2026-10-24 R3E：图片/空白节点共用创作栏与参数控件，文字创作栏独立持有菜单/尺寸呈现状态。Canvas **8534行**；174个保留执行函数正文不变，58组SSR对照一致，真实控件15项及文字6/图片5/历史12通过，最终tsc通过。见 [R3E](changes/2026-10-24-canvas-composers-r3e.md)。同步后第2模块；下一模块R4A基础DB/事务，R3外围UI、跨请求CAS与R4B—R6继续，不合main/不部署。

2026-10-24 R3D：普通文字/反推/帮写共用 retained text task，已知答案续存不再生成，unknown 保留原 operation/报价；初次请求复用原 BillingProvider 持久 intent。Canvas **9342 行**；基线 3/15、新版 18/77、真实 PG24、实际 Next6 及最终 tsc 通过。见 [R3D](changes/2026-10-24-canvas-text-tasks-r3d.md)。本轮为同步后第1模块；原无 node-slot intent 升级、多 tab/CAS、UI 组合及 R4—R6 仍在后续。不合 main、不部署，整体目标 active。

2026-10-24 R3C3：节点复制/历史添加/删除/项目删除及批运行 owner 已接入。Canvas **9575行**；旧4/9→新19/59，真实PG24→32，真实控件11及相邻12＋12＋5＋5通过。单图/混合复制共用原复制事务，已知结果不再重复创建，删除保留原operation，批运行沿用原任务。见 [R3C3](changes/2026-10-24-canvas-node-operations-r3c3.md)。本轮第3模块，main刷新与普通整合后计数归零；整体继续R3后续及R4—R6，不合main/不部署。

2026-10-24 R3C2 增量：选择快照、单/多/组拖动和连线命令已迁移；原子 history/回执队列覆盖新交互及既有整理/属性/undo，三处 parent 语义统一。Canvas **9800行**，基线10/28→新版34/92，真实PG26→28、相邻PG20，真实控件12＋12＋5＋5通过；详见 [R3C2记录](changes/2026-10-24-canvas-interactions-r3c2.md)。同步后第2模块，继续节点操作和R4—R6；未合main、未部署，整体目标active。

2026-10-24 R3C1 增量：typed scene projection、独立节点renderer、稳定命令代理与完整值reconciliation已接入；Canvas **10300行**，30场景98检查、32组SSR HTML对照、真实Next 6＋12＋5＋5通过。见 [R3C1记录](changes/2026-10-24-canvas-scene-r3c1.md)。本轮为同步后第1模块，继续R3C2选择/连线/拖动命令及R4—R6；未合main或发布。

2026-10-24 R3B4 增量：详情与同步编辑任务 owner 已迁移，普通生图/详情/编辑共享结果落地；未知提交保留原 operation/报价、已知任务只查询、已知结果只续接。Canvas 11576 行，74 场景 369 检查、真实 PG 21、Next 新控件 5/相邻生图 5 通过，见 [R3B4记录](changes/2026-10-24-canvas-task-boundaries-r3b4.md)。本轮是同步后第3模块；完成后刷新/普通整合 main 并归零，不合入 main、不发布。整体重构继续 R3C。

2026-10-24 R3B3 增量：作品文档 owner 已迁移，读取错误/局部补取/迟到合并/回收站统一，Canvas 11747行；26场景49检查、真实PG14、真实Next8及浏览器缓存20检查通过，见 [R3B3记录](changes/2026-10-24-canvas-artwork-document-r3b3.md)。本轮是main同步后第2模块，未合main或部署；继续详情/编辑任务与整体重构。

2026-10-24 R3B2 增量：文字文档、草稿缓存与恢复、保存队列归独立 owner；历史写入排队并保留后来字段修改，真实Next控件12项和PG16检查通过，见 [R3B2记录](changes/2026-10-24-canvas-text-document-r3b2.md)。Canvas主组件11872行。整体重构继续，后续文档写入CAS、作品/编辑任务与R3C—R6仍在台账；本轮为main同步后第1模块。

2026-10-24 R3B1 增量：原子历史/文档编辑已实施，Canvas 减至11936行；22类动作共享编译、持久化和回执重试，详见 [R3B1记录](changes/2026-10-24-canvas-history-r3b1.md)。真实本地 Next Canvas fixture 已运行并停止，PG 随机 schema 及本轮自有容器已清理；没有启动生产 Web 或接管部署。下一轮继续 R3B2，不将模块完成标成整体重构结束。

- 后续重构命令显式以本目录为 cwd，只提交本任务文件。
- 每个完整模块更新实现记录，再集中测试；合并前刷新远端 main。
- Git 分支推送不代表应用部署；部署另走现有蓝绿和实例收敛流程。
- 建立证据：`output/refactor-workspace-setup-20261024/VERIFICATION.txt`。

R3B4 三模块同步已执行：`git fetch origin main` 与 `git merge --no-edit origin/main` 均 exit 0，origin/main=`905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`；累计计数归零。本轮没有把候选合入 main。
