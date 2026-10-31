# 整体重构退出审计（R8K 当前候选）

本页按原 R0–R6 与量化退出要求核对，而非把已完成切片重新定义为全部目标。固定应用源码以最新 R8H DELIVERY 为准；R8G属性证据归原source；R8F下载证据按原source；R8E性能只归其原source；R8D性能/媒体仅归其原source；R8B167/177与R8C34/54仍只归历史源，原始验收要求见 REFACTOR_MIGRATION.md 第 2/4/5/6 节；历史切片的日志只证明对应 SHA，不给最新源码代验。

| 原要求 | 当前归属 / 权威证据入口 | 当前判定及还需什么 |
|---|---|---|
| R0 已有质量/Canvas定价修复不倒退 | 原整合历史及image-price/canvas-image-task/prepare回归 | R8K完整186、同固定应用runtime177/产品92通过，原价/钱包/UNKNOWN保留；不代表生产上线或所有历史事故闭合 |
| R1A typed图片/抠图用例，各HTTP/Agent/workbench共用 | imagegen用例、准备/同步计费/route adapter；AST运行图 | 结构已实施；R8K完整186及同镜像runtime177/产品92新执行；最终main固定全版仍待 |
| R1B 同operation单一prepared与原冻结价 | `imagegen/preparation`、quote/dispatch与3套pricing回归 | 原价/明确取消/不足余额/UNKNOWN必须仍通过，配置缓存不跨Pool |
| R2 生成与原结果续交共享交付 | shared delivery/checkpoint/settlement，delivery/resilience/parent cases | 历史供应商403与原始两笔丢失窗口不因fixture PASS自动关闭；项目历史case单独保留 |
| R3 Canvas文档/任务/渲染/交互分责 | 原document/history/task/selection/navigation与新native-editor-session/组合 | 创建用例新增node-creation；原下载/偏好/图库/原生编辑会话已迁。4257行不作目标；剩余参数/视图/Shell组合需按职责和变化传播审查，不机械逐行拆JSX |
| R4A Pool/Tx无业务依赖，数据owner有唯一写入 | `platform/db`，db兼容面；SCC与依赖扫描、PG事务矩阵 | 纯平台结构已落地；兼容出口只为真实脚本调用保留，不算平行writer |
| R4B 无业务请求新建schema或管理bootstrap | Web显式persistence/startup及schema owner、published read | R8B生命周期修复归历史源，本轮没有改schema；后续所有进程/历史规模升级仍须各自证明 |
| R5 同版本独立Worker、单任务owner、协议/排空 | 固定完整Dockerfile/Worker manifest/shared scan，runtime与native媒体gate | 结构已实施；R8K完整同source/image runtime177/双browser92及排空通过；R8J450秒混合样本与生产容量仍单列 |
| R6 外围管理/工作台/测试资产与旧路径退出 | admin owner、workbench单源、core catalogue/runner；源码边界 | 历史成熟切片保留；需继续剩余Canvas组合与真实兼容caller退出审计，不以新增文件数当结论 |
| 生产lib→app反向调用为0；SCC为0 | `scripts/architecture/analyze.cjs`，静态/运行/emitted图 | 两条release fixture反向边单列，不当生产依赖；最终固定源重新扫描 |
| 用户业务参数改动局部传播 | 本轮只改既有CanvasClient+3新职责文件，2123原产品哈希保持 | 本片只改1个原产品文件+1个创建应用模块，2126原产品hash/161其他函数正文保持；原27创建字段/history/save轨迹EXACT |
| 同机UI/server p95、RSS、事件循环与INP对照 | 复用现有benchmark-ui-performance、benchmark-imagegen-pipeline、Canvas probe；原建议无超过10%回退 | **已补同锁五轮，整体仍未退出**：R8E相同机器320节点/12图、同Node/React/Next/lock，5轮10栈30页/300准备600读取；指标与原10%阈值按本轮PERFORMANCE_COMPARISON，仍缺入队/持续混合与fieldINP；180秒读取不当容量证明 |
| 100k+活跃用户容量模型 | PRODUCT_READINESS_100K，实际到达率/并发/规格/资源余量 | 未完成：已有R8J450秒2账号受控混合生成/保存/媒体样本；生产到达率、长稳、租户公平及真实资源/规格模型仍待，不将DAU当并发 |
| required CI实际执行且同SHA | GitHub workflow/run/check annotations，非仅YAML | 未完成：本地完整186与Linux实际产品证明不等于远端requiredCI；本轮REMOTE_CI按实际run记录，不继承旧账户状态当实时结论 |
| 完整重构版本main普通整合 | 固定origin/main、普通merge、最终全版验收；不强推共享main | **未完成**：目前只是独立候选分支，尚未合回main；超过48h原因见各模块记录 |
| 部署与生产功能验收 | 实际在线source/image、明确目标与发布锁/原任务保护 | **未完成且本轮不执行**；47 HOLD；代码/候选/本地通过不等于上线 |

## 下一步真实工作

1. 继续Canvas剩余Shell与面板/事件组合的真实职责归属，不引入平行任务/保存框架，不机械拆纯事件adapter。
2. 补原退出要求中的持久热态混合生成、保存与媒体入队/队列容量；用实际到达率/规格/资源余量校准10万活跃目标，不抬池或降质量凑过关。
3. 原ZIP传输socket失败保持OPEN，等待同身份可定位证据，不添加付费POST重试或删下载断言。
4. 有效required CI、最终固定main普通整合与整版验收、生产发布分别给证据，47 HOLD保持，不以候选通过冒充上线。

## 历史固定源记录

以下记录只归各自固定源，不覆盖上方当前退出判定。

## 2026-10-31 R8I：原生编辑会话、独立portal与页面组合分责

固定应用源码 `c146956e66f3bef0442a60cc38ceeb893abb8a93`，完整生产Dockerfile同Web/Worker镜像 `sha256:85a6a68afb93c074c6a7e7aa90733b0e5492c2d658fdb207cd29716d343332e1`。角色、场景、导演台、音频、时间线五套编辑器ID/清理Effect/portal与回调从Canvas大页面迁到纯native-editor-session owner、React订阅hook与CanvasNativeEditors组合。只改1个既有产品文件+3个新职责文件，其他2123原src/services哈希保持；Canvas4337行并非验收目标。保存/CAS、上传、引用、渲染/采用、原operation/UNKNOWN、钱包及共享history仍归原具体owner，不建第二套任务或保存系统。

实际原页面13项规则/原React8项复现；新会话25项/实际React9项通过。账号/工作空间同ID旧面板退休，项目ABA与旧open/save/close不污染新会话；failed/not-ready目录不当删除证据。原五独立槽位、输入筛选、旧草稿key、具体动态组件/CSS/文案保留。原多个portal的真实DOM按打开先后叠放，不是JSX书写顺序；最终保留独立keyed portals，关闭重开也保持原行为。新建节点意图先登记再导航，只能交给紧接着的目标项目，不穿越账号/workspace或中间导航。

`2a0053a5`的41受影响入口/五具体应用、PG/WebGL/FFmpeg及92完整产品通过归原source。最终源码重新执行19个直接受影响入口全部PASS、0fail/0notRun/0reuse，subset PARTIAL/exit2（catalog183，不是全183执行），并重新构建完整固定镜像、实际双browser92项通过。前后仅新面板组合、其baseline verifier与模块文档变化；原动作/文档/HTTP/账务哈希相同，CONCRETE_OWNER_SOURCE_BRIDGE明确分开，不把旧41拼成当前19之外的新通过。类型exit0、lint38既有warning、四类SCC0；2条release fixture反向边与1条dist生成未解析边单列。

本轮18个完整产品新检查：五类真实菜单创建/面板、角色/场景/导演保存关闭与CAS/shared undo，音频/时间线不变关闭不增编辑，创建同ID undo/redo与刷新，空白新项目创建后正确打开。原POST6次，新增supplier/consume0；原图/文字/jobs/7笔42积分fixture保持。原31图ZIP逐字节完整。上游为隔离fixture，不是真实供应商/私有R2/10万容量证明；180秒混合读不是持续混合生成容量。POSIX drain exit0、自有PG/容器/网络清理PASS。

原5271rawSHA、完整源码/字节patch/副本原13+8行为回滚与later-edit零写入，以本轮DELIVERY/VERIFICATION为准。包装不存在case ID、旧native-actions fixture缺新focus端口、原比较包含有意调整的view顺序、portal顺序错误假设等原始失败日志全部保留。没有回退业务断言或把UNKNOWN变成未受理。R8H原ZIP socket hang up根因仍OPEN，不因复验成功关闭。整体ACTIVE，未合main未部署，47 HOLD；同步后第1/3模块。**🔴 分支超过48h原因仍为整体退出未完成：剩余Canvas Shell/组合、持续混合生成/入队容量、有效CI、最终main整合及生产验收。**

## 2026-10-31 R8H：历史作品选择会话、视图与原复制回执分责

固定应用源码 `c8f76e93cb0fecf0449f481c21d0c320fa4381b1`，完整生产Dockerfile同Web/Worker镜像 `sha256:3019f6edfa9dffb0fd15ba67dcb7e6b030c1e71ba04e7b39bf29eed2c9661c78`。原页面历史作品选择器的open/point、busy/error、分页/元数据过滤、复制等待与结果选择迁入canvas/artwork-picker；React hook只订阅，CanvasArtworkPicker保留原视图/文案/CachedImage/Escape，Canvas只捕获屏幕点与组装既有copy/selection。只改1个原产品文件+3个新职责文件，其他2120原src/services哈希保持；页面4470→4364行不是验收目标，真实状态/流程归属才是。无新的图库fetch/DB/API/复制系统，原node-operations/history继续唯一拥有operation/body、已知ID恢复、事务和undo；原父子/素材授权/钱包/任务/冻结报价均不改。

原实际页面函数13项→新owner19项；真实React原/新各7项，3类project/account/workspace切换原保留旧弹窗/坐标3→新0。原复制wire、坐标取整、原60/加载更多60、busy/Escape、失败必须显式点击重试、原UNKNOWN身份和已知ID只读恢复保持。新增ABA拒绝旧callback、旧finally不清空替代busy，原共享undo一次语义通过。原node-operations19用例59检查保留，旧inline-wiring断言改跟真实hook/copy端口，不恢复已退休页面函数。

初始1aba的18受影响入口全新执行PASS（subset PARTIAL/exit2）单列；最终固定源码c8f重新完整catalog181全新执行、0reuse，实际结果status=PASS passed=181 failed=0 notRun=0 completeCore=True，不跨SHA拼绿，原逐项日志/PG清理均保留。类型exit0、lintexit0/既有38warning、固定源4类SCC0；2条release fixture lib→app及1条dist/worker生成边单列。DOM测试的copy/auth/workspace/image是明确端口，规则测试实际node-operations/history，不当真实PG；完整产品另验。

完整固定镜像真实双browser 74 项通过，原68项保留。新增真实history控件/Escape、实际tile复制、原PG copy receipt、原parent/坐标/图片字节、共享同IDundo/redo与刷新恢复：copy POST=1，原operation绑定原source/result/project，无新收费。原图/文字/任务/fixture7笔42积分在选择器流程前后保持。复制最终undo后保留原回执，不删除server历史冒充清理；31张原图ZIP仍逐字节完整。上游为本地隔离fixture，非真实供应商/私有R2/10万容量证明；180秒混合读取不是持续混合生成容量。POSIX排空与自有容器/网络/tmpfsPG清理通过。

第三模块普通fetch/merge main `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，新增待合0，实际Already up to date；计数2→3→0。原5264rawhash、完整5271源码、字节patch、副本原13+7行为回滚及later-edit零写入以本轮DELIVERY/VERIFICATION为准。初始fixture VM Error跨realm、esbuild虚拟图片resolveDir和React commit等待问题及原失败输出均保留；修fixture不放宽业务断言。原首轮core父fixture secret长度错误导致34PASS/1setup失败/146未运行，原日志及自有PG清理保留；57续跑至114后暴露R8G已退休inline audio/timeline kind静态接线，保留行为断言跟随实际native registry；CI补专用receipt DB与env并实际执行YAML代码/冷PG读回。最终重新固定完整源码/镜像并181全新执行，不拼接旧SHA或仅改数字。后续整轮使用现有CI fixture配置，不改产品门槛。首轮完整产品在既有ZIP原图GET处socket hang up，pageerror0、Web无OOM，清理通过；本轮后续原镜像整轮复验不抹去该传输根因OPEN，未改下载测试或加入自动重试。整体ACTIVE，未合main未部署，47 HOLD。**候选分支超过48h原因仍为完整退出未达成：剩余Canvas Shell/编辑器组合、持续混合生成/入队容量、有效CI、最终main整合及生产验收。**

## 2026-10-31 R8G：节点偏好、浏览器读取与共享历史分责

固定应用源码 `156b53ec87e123b1971ae030f7f0d0bb075adef9`，完整生产Dockerfile同Web/Worker镜像 `sha256:d4b084077482f49e85799e83ab085475c38c2b96c6080af7c86d17331278ec5c`。Canvas遗留节点锁定、层级、文字样式的读取/ready/error/回执投影/保存意图，迁入canvas/node-preferences应用owner；GET/localStorage归node-preferences-browser，React订阅归use-canvas-node-preferences。页面仅组装当前对象、翻译/图标和事件；锁定/层级计算用typed intent在原UNKNOWN恢复后读取最新设置。六种native kind复用原CANVAS_NATIVE_NODE_KINDS，不建通用插件器。只改2个原产品文件+3个新职责文件，其他2116原src/services哈希保持；钱包/任务/冻结价/媒体像素链未改。

原实际Effect/函数+原document/history controller16项→新版25项；真实React DOM原/新各6项：慢GET覆盖已确认属性1→0、workspace旧锁1→0、属性lostACK身份2→1，原UNKNOWN请求体逐字保持。新增typed lock/front/back、±100000边界、not-ready/只读/shared busy、账号/workspace ABA、慢读merge与删除、local key隔离。写入全部复用原history.submit/串行恢复/undo，不新增API/队列/表；lostACK身份为属性写，不冒称重复付费缺陷。跨项目偏好共享、原project回执可完成，迟到账号/workspace不得跨身份写；GET失败保持not-ready，非空成功。

19受影响入口同SHA/digest全部新执行PASS（含原history67/184、text-document21/58），subset PARTIAL/exit2，不当完整178绿。类型exit0、lintexit0/既有38warning、固定源4类SCC0；2条release fixture lib→app与dist/worker构建产物1条未解析边单列，非生产层倒置。旧node-editing静态gate的arrange内联断言在原80e也失败；现检查真实arrange owner和页面locked连接，原始日志保留，不当产品缺陷。

完整固定镜像真实双browser 68 项通过。新增原生属性面板暂存、应用样式、共享undo/redo、锁/解锁、前/后层级及刷新读回；9笔原history操作/9个原operation，原PG node-settings与实际textarea CSS/Flow z-index一致，另开属性写接口0、供应商新增0/扣款新增0。文字fixture改为实际text-前缀，不修改产品类型推断。原60项流程保留（登录/冲突/任务/账务/剪贴板/导航/拼接/完整31图ZIP）；原图/文字/任务/fixture7笔42积分在属性流程前后完全一致。180秒混合读取不等于持续混合生成容量；上游仅隔离fixture，不称真实供应商/私有R2验收。POSIX排空/自有栈清理通过。

原5257rawhash、完整5264源码、字节patch、副本原16+6行为回滚及later-edit零写入按本轮DELIVERY/VERIFICATION为准。最后文档/验收夹具如有变化用hash bridge逐项登记；src/services与已验镜像保持字节一致。整体ACTIVE，未合main未部署，47 HOLD；主线同步后第2/3模块。**分支超过48h仍未整版退出：Canvas Shell剩余组合、持续混合生成/入队容量、有效CI及最终main整合/生产验收仍待，不将切片完成当完整版本。**

## 2026-10-31 R8F：下载意图、原图字节与页面编排分责

固定应用源码 `c5eba60c2757310161d1c189db3f2979a8264a1e`，完整生产Dockerfile同Web/Worker镜像 `sha256:ff9698636e425e65b36a36530b1eec675cf65106127bf28e2bd83fe65780bdf3`。原页面的下载状态、ZIP准入、异步反馈和DOM取字节拆为canvas/downloads应用owner、download-browser浏览器适配和use-canvas-downloads订阅；媒体URL/名称归纯media/download-href，不再反向依赖播放器。页面只组装原项目/选中集合、翻译和事件，4564→4501行不是验收目标，真实写入/状态责任迁移才是。4个原产品文件改变、4个新职责文件，其他2110原src/services哈希不变；钱包/报价/任务/UNKNOWN/原媒体授权未改。

原实际页面函数14项→新owner15项，真实Edge原/新各7项：31张原30→新31，同tickZIP原2→新1，账号切换迟到下载原1→新0；原项目明确发起的下载导航后继续，文件名/输入原图冻结，迟到提示不污染新页面。账号/workspace ABA或卸载取消原读，取消的旧finally不清空替代busy。只读下载保留，没有新增积分/确认/业务限额。原缓存明确拒绝零下载回退，实际浏览器逐PNG字节哈希、命名、顺序和objectURL释放通过。

原30项server协议保留，完整31张项目分段30+1合一ZIP；共享本地3路读/128MiB边界不改，不以静默漏图规避资源。类型0、lint0/既有38warning、四类SCC0；13个受影响入口同SHA/digest全部新执行通过，subset PARTIAL/exit2，不当完整175绿。R8E五轮性能只归原2c6a源码，本轮未重复性能压测或把旧测量当当前候选结果。

完整固定镜像真实双browser 60 项通过，原54流程保留；新增实际选中图片、初始版本与原项目ZIP下载，PNG/ZIP经原缓存和媒体HTTP/PG；实际31行隔离项目用原服务器suite/download打包成31个逐字节相同PNG。新增下载供应商0、consume0；原创作链保持7笔/42积分fixture账本。初始版本选择/undo仅增加合法revision2，不要求CAS版本回退。原生下载事件无mock、无浏览器路由替换，缓存授权使用实际产品路径（本地public fixture，不冒充私有R2/真实上游验收），POSIX排空及自有容器/网络清理通过。

基线5249原文件与完整5257源码、字节patch、副本原14+7行为回滚及later-edit零写入按本轮DELIVERY/VERIFICATION为准。规则/浏览器原始夹具失败保留：计数必须等待真实download事件，不把事件尚未送达误作产品行为。首轮完整浏览器58项含原图/版本/ZIP均通过；31行从PG观察器直接seed没有触发浏览器元数据失效，旧缓存暂不展示新项目。夹具改走真实browser /api/projects发布项目名触发现有失效，而非注入store/flush缓存或修改产品。未把正常项目导航变成取消护栏；没有新下载服务、表、队列或付费operation。

整体ACTIVE，候选仍未合main、未部署，47 HOLD；主线同步后第1/3模块。**分支超过48h原因仍为最终整版退出未达成：剩余Canvas Shell/组合、持续混合生成/入队容量、有效CI、最终普通main整合与生产验收。**本片的真实字节与集中回归不替代整版要求。

## 2026-10-31 R8E：Canvas内容渲染隔离与同依赖实测

固定应用源码 `2c6a36f6cae75d72c2127df39265d0526df2a329`、完整生产Dockerfile同Web/Worker镜像 `sha256:e84674727d57239cd3699a73f2f4a34ab5299a0da36e243fd1df7a714e06df80`。按实际CPU诊断修正工具/视图变化对节点内容的无关传播：ArtNode保留Flow适配，ArtworkContent以默认shallow memo消费data/selected/id；Handle/Resizer各自store和权限Context仍订阅。formatDate只复用Intl格式器、不缓存用户数据，保留运行时默认时区及原字面输出。仅改2个原产品文件，其他2112个原src/services文件hash不变，未改报价/任务/钱包/UNKNOWN、功能、节点数或画质。

原/新实际DOM与真实ReactFlow：原10项→新11项，1930日期完全一致；16次无关flag，单图原16→新0、双节点实际Flow原32→新0；1000日期/时间调用只构造2个Intl。data/selected/替换callback、权限Context撤销/恢复、locked/主题更新与真实Handle连接、NodeResizer一次回调、拖拽均通过。15个受影响入口同SHA/digest全部新执行通过，subset PARTIAL/exit2，不当完整173通过；类型0、lint0/既有38warning、4类SCC0。

完整固定镜像真实双browser 54 检查通过：原登录/PG/HTTP、图片/文字冲突与共享undo/redo、原任务/报价与Worker交付、图片编辑/原图、导航/剪贴板/拼接均走实际产品；供应商仅隔离本地fixture，不是真实上游质量验收。180秒混合读取不等于持续混合生成容量；业务结果/消费以browser原始报告为准，新增定价确认弹窗0、route mock0。实际POSIX排空及自有栈清理通过。

同机R8D完整源/镜像3e90→本轮2c6a应用，package/lock字节、Node24.22.2/React19.3.0/Next15.5.28/glibc2.36实核相同；320节点（300图20文）、12张1024原图hash相同、1440×1000、CPU4倍、5Mbps/80ms，5轮交替10栈，每侧15页/150准备/300读取。无profiling对照：visualReadyMs p95 8771.72→8316.53（-5.19%）；warmVisualReadyMs p95 6932.40→5763.85（-16.86%）；labSessionInpMs p95 2792.00→1016.00（-63.61%）；interactionLatencyMs p95 1552.00→656.00（-57.73%）；prepareMs p95 22.34→20.92（-6.36%）；readMs p95 21.64→20.74（-4.19%）；rssPeakMiB p95 414.18→424.56（+2.51%）；eventLoopP95Ms p95 10.53→10.56（+0.31%）。超原10%调查阈值指标 {}，如存在继续记真实余项，不改阈值。profiling另作诊断：原tools约17.4s→新6.4s、view10.4s→4.7s；Flow节点DOM变化仍5120，不能称全部页面渲染已消除。实验室EventTiming、5冷/10暖和RSS采样均不是生产fieldINP或10万容量。

本片完成三模块同步：origin/main `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，新增待合0，普通merge结果`Already up to date.`，计数2→3→0。**候选分支超过48h仍未合main：完整退出尚缺Canvas剩余组合/持续混合容量/有效CI和最终整版验收；保留明确未完成项，不将局部通过冒充整版交付。**整体ACTIVE，未合main未部署，47 HOLD。

完整5249源码、5247原hash、字节patch、独立副本原10检查/16无关重渲染回滚、later-edit零写入、远端与CI以本轮DELIVERY/VERIFICATION为准。最后文档与测量schema前缀兼容修正进入证据源bridge，src/services与已验镜像逐hash一致；旧失败准备日志保留，不清洗为成功。首轮完整产品50项已通过，拼接选择检查在重叠节点布局未稳定时原始坐标命中其他节点，拼接POST0；验收只改为先等待首节点选中，再用实际node locator的稳定/命中检查携带Shift点击，不force、不改应用state或挪节点，原4项拼接断言保留。失败日志与独立清理继续留存。第二轮原50项再次通过，但首节点选择后的180ms dock/viewport动画使原点落入composer；最后增加实际viewport和dock位置连续稳定观察后再寻找原生可点击节点，不加产品等待/限制、不降低断言。

## 2026-10-31 R8D：实际性能基线与媒体规格单一归属

固定应用/本地验收源码 `3e90ff3595e2b347fcf907121cd64103aa635169`，同完整生产镜像Web/Worker包 `sha256:a650b2b5471c26f05e5451f2df43b0ada719c889d481fdf0170afe0747286472`。真实320节点校准抓到公开本地媒体manifest选择缩略图但response读取原图的409，已收敛`media/representation`，私有源先授权、清单与字节共用key/asset；不删cacheVersion、不交错账号、不降低图像质量。实际handler+文件+Sharp原38复现2个409→新44检查0，私有401/404和过期409保留；新完整镜像公开模式冷暖2页＋60读取/30准备实际通过，HTTP错误0、付费POST0、供应商0/消费0。

复用原benchmark补真实登录/PG/HTTP模式，原受控API模式保留。重构前4478应用/原锁固定镜像与候选在同机、相同320节点/12图、1440×1000、4倍CPU、5Mbps/80ms下5轮交替、每栈3页，10个隔离栈；每侧15页、150准备、300读取，输入原图hash完全相同。两侧统一私有本地模式，公开模式409另作原/新真实反例，不把已知错误回退耗时塞进性能基线。visualReadyMs p95 7319.65→8231.40；labSessionInpMs p95 2544.00→2328.00；prepareMs p95 19.76→17.58；readMs p95 19.14→20.62；rssPeakMiB p95 381.52→417.46；eventLoopP95Ms p95 10.51→10.52。超过原建议10%调查阈值的指标：{"visualReadyMs": 12.46, "coldVisualReadyMs": 12.46, "warmVisualReadyMs": 29.15, "interactionLatencyMs": 12.5}；保留为真实剩余项，不靠调阈值宣称整版退出。

82项锁记录差异单列，因此结果是整体候选对照、不是纯架构因果归因。实验室EventTiming不等于真实用户field INP；20ms RSS与kernel终身VmHWM分别记录；15页/5冷样本不能当生产尾延迟或10万活跃用户容量。旧镜像恢复经过网络/类型投影失败，最终回到原锁，完整类型/build通过，无产品补丁或跳过门禁；每次准备失败及清理保留。8个受影响入口全部新执行PASS，subset为PARTIAL/exit2，不冒充完整170；类型/lint既有38warning、四SCC0。

原5240hash与完整5247源码/字节patch/独立副本恢复旧38检查和2个409、later-edit零写入及远端以R8D DELIVERY/VERIFICATION为准。仅2个既有产品文件改变，1个新规格owner，其余原产品文件hash保持；未改钱包、任务、冻结合同、Canvas组件或业务限额。整体ACTIVE，未合main未部署，47 HOLD；本片是主线同步后2/3模块。剩余Canvas下载/呈现、INP/退化调查、入队/长时混合容量、有效CI、最终main整合与生产验收继续。

## 2026-10-30 R8C：长图拼接意图、像素与原子发布

固定应用/受影响验收源码 `290b3772c9722cd46e9860c1385581fa5619def9`。原route里的像素与写库拆为stitch-pixels/stitch应用owner，Canvas请求/原意图/只读恢复归stitch-run和窄hook；原作品document/history/node-copy回执继续唯一归属，未建新表、任务或计费引擎。原接口无operationId的POST仍兼容，当前控件在POST前保存原operation；未知只GET、已知结果只同步原ID，scope隔离迟到选择/提示。

实际旧Canvas8组22检查→新12组33检查；原route/真实PG/Sharp29→新54检查。旧同operation重复/并发创建2→新1，位置失败遗留作品1→新整笔0，源图在像素准备后删除不发布；真实已提交COMMIT丢ACK保留可能胜出字节并按receipt恢复，输家只清自己的随机文件。12组原route像素语句AST对照PNG逐字节同，普通谱系/位置不变；新记录真实输出尺寸，suite batch产物留在原batch。

34个受影响入口同SHA/digest全部PASS，subset仍PARTIAL/exit2，不冒充完整169；新完整生产Dockerfile同Web/Worker镜像的实际产品双browser54检查通过，其中4项是原生多选/拼接、原receipt+PNG、共享undo/redo和刷新，拼接POST1/供应商新增0/消费新增0。固定类型/lint38warnings/四SCC0，2106个原产品文件hash不变；Canvas4586→4564行。上一片完整167/runtime177仍归R8B原source，不给本片代验。

最终只补文档和新浏览器验证器：首轮原50检查已过，但固定坐标点被先前Comfy产物遮住；第二轮原50检查也已过，但新verifier误用了不存在的select工具名，实际为move；第三轮命中实际move工具，但原第二图被已完成的Comfy产物完全覆盖，同样未发送拼接POST。三轮原失败与清理证据全部保留；最终使用真实move工具、根图普通点击及同项目实际露出的已有图片原生Shift多选，请求URL由当前页面转换为绝对地址，不force、不注入选择/修改应用。最终完整5240文件包/5230原hash副本回滚/远端状态见R8C DELIVERY与VERIFICATION。整体ACTIVE，未合main未部署，47 HOLD；同步后1/3。后续优先补原退出要求中的同机性能/INP/容量，同时继续剩余Canvas组合与最终普通main整合，不能用文件拆分或历史PASS替代整版交付。

## 2026-10-30 R8B：请求 schema 与 Pool 生命周期归属

固定应用/完整验收源码 `d9d03576b238360e712bd745c2bb1ebb592a67c6`。限流沿原 store 初始化，dedicated 企业站的 site-policy DDL 归轻量 schema owner，两个准备步骤接原显式 Web startup；原 startup/策略就绪和计费配置/装配缓存按实际 Pool 隔离。已有 43 个 owner 顺序与 SQL、限流消费/清理及策略 CAS/绑定/计费 initialize 正文保持。共享平台不创建站点表，sidecar/无 DB 不迁移，Fleet/release/Worker 独立角色不越界。

真实 PG 旧 8 组 73 检查复现→新 8 组 76 检查通过；首次限流及企业策略 DDL 1→0，两个独立 route bundle DDL 2→0，四个 Pool 并发建表旧 3 个23505→新0，已关闭 Pool 的42P01/配置缓存串代闭合；真实DDL失败改在启动暴露并可重试。共享/企业完整 schema columns/constraints/indexes 分别相同。

**完整 core167/167 全部重新执行，0失败/0未运行/0复用**；原分布式限流、站点策略、持久化均纳入同 SHA 目录。新完整生产 Dockerfile 同 Web/Worker 镜像：Linux runtime177/原生媒体与实际产品双 browser50 均通过，原 frozen price/UNKNOWN/单次扣款/原图与历史保持。额外原 Web startup53、registry99 通过；旧 Compose verifier 对已上线 direct Worker 仍断言无 DB 的历史错误已在完整原树复现，改为验证当前 direct/shared DB 及旧HTTP relay的实际角色，14检查通过，产品 Compose 字节未改。

8 个原 src/services 文件改变、1 个新 schema owner，其余 2099 个原产品文件 hash 保持；四类SCC0，类型/lint通过。R8A历史文档的37条warning是抄写差异，原日志及DELIVERY实际38；本片按原始日志计数。最终封版仅补验收脚本/文档，应用源码与镜像逐hash一致；完整包/5226原hash副本回滚及远端以 R8B DELIVERY/VERIFICATION 为准。

第三模块普通 fetch/merge main `e2f56255` 无新提交，计数3→0。整体仍 ACTIVE，未合 main、未部署，47 HOLD；当前完整退出审计见 `docs/architecture/REFACTOR_EXIT_AUDIT.md`，保留剩余Canvas组合/同机性能与容量/有效CI/最终main整合，不用本片通过替代整版交付。

## 2026-10-31 R8J：完整镜像持续混合负载证据

复用R8I c146956e完整同Web/Worker镜像，src/services变化0，不把验证脚本当产品模块改造。原450秒时钟负载165图/12原生图片FFmpeg/1800读/450保存，实际177笔1014积分、每operation一次POST、逐图原字节像素/父子/原价/账务通过，末尾未完成/预占0。突发未完成峰值52、执行等待48、端到端p95约70秒，停止进入后约68秒采样排空；接口快不代表交付快。77%合成HTTP槽占用仅调度诊断，不证明每个parent已可派发，不以加限额或调大并发代替定位。

原450秒网络internal误标已独立更正，原raw/日志不重写；最终驱动及103秒smoke实际internal、20图1媒体/21笔122积分全通过，不能借最终smoke宣称450秒网络修正已重测。原provider默认实际HTTP6组在同固定镜像network none通过。离线报告排除临时采样进程、去重observer窗口，缺样本保持未知；一次在POST返回前的GET404用原编号恢复，没有重POST。原runtime全套因匹配full-core timeline向量缺失在业务负载前失败，门禁未放宽，完整core/runtime NOT_RUN。

具体源码/命令/原始失败/四产物与5278原hash独立副本回滚以[R8J记录](../changes/2026-10-31-refactor-r8j-mixed-load.md)及DELIVERY为准。这里只校准2个隔离个人账号、1K/2K与图片FFmpeg，非生产/全部视频音频/长稳/租户公平/10万容量。整体ACTIVE，继续Canvas Shell剩余组合、端到端等待诊断、有效CI和最终main/生产退出；未合main未部署、47 HOLD。**独立候选超过48h仍按用户整体交付推进，不以切片完成冒充整版完成。**


## 2026-10-31 R8K：节点创建用例归属

固定应用`47b2b334ca7da470c10cc53cf3c2144fa7fd7806`，完整同Web/Worker镜像`sha256:747392c370798bed7a2a9f1eabad1145bee989b55ce0e8713f787977d2b618e3`。空白/连线图片、多参考图片、文字的坐标/创建/history/呈现/save编排归canvas/node-creation，八类入口继续原concrete actions；页面只连接原文档/待执行展示/历史和React呈现。不建第二套任务/存储/钱包；一原产品文件+一新应用模块，2126原产品hash保持、161其他函数正文不变。

原/新27创建场景全轨迹EXACT。最终同SHA完整core186全新通过/0复用，原Linux runtime177、实际双browser92及31图原ZIP字节通过；类型0/lint38warning/四类SCC0。初次109/1/75、第二次78/1/107原失败及修正原因保留，最终不是跨轮拼绿。所有最终产品bytes与固定镜像一致，末次仅doc-only bridge；四产物/原5285hash副本回滚/Git与清理见[R8K记录](../changes/2026-10-31-refactor-r8k-node-creation.md)及DELIVERY。整体ACTIVE、未合main未部署、47 HOLD；同步后2/3。生产容量、真实剩余Canvas组合、有效CI、最终main/生产退出仍未完成。
