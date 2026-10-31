# 整体退出审计：R8T，整体未完成

应用/定向接受源码 `d4c7b8d912ec981653462b3785228108ea7ab799`；独立候选，整体ACTIVE，未合回main、未部署，47 HOLD。

| 要求 | 当前权威证据 | 状态 |
|---|---|---|
| 生产业务不反向import路由 | 当前图0；2条release fixture单列 | 结构通过，整版行为待验 |
| DB基础层不依赖业务、已迁消费者不穿旧db | 当前图均0，compat facade仍为实际CLI/tests保留 | 结构通过 |
| 运行代码脱离scripts | 原runtime1/test2→当前全部0；实际runtime bundle和原PG/CLI验收 | 本结构债务关闭 |
| 无导入环 | 四类SCC均0；原dist未解析边单列 | 结构通过，不替代HTTP/SQL动态边 |
| Canvas文档/任务职责 | 本轮root src1838文件raw SHA保持；原模块证据分别归档 | 整版产品浏览器待验 |
| 当前同source完整候选 | 本片6个入口新执行，catalog203；企业独立服务45检查 | OPEN，不是完整Naumi Web/Worker验收 |
| 性能、有效CI、最终main | 独立服务64请求错误0不是100k容量；main仅同步流入候选 | OPEN，未合回main/部署 |

完整事实见`output/refactor-r8t-20261031/WHOLE_EXIT_REQUIREMENTS.json`。结构归属清理后，下一步当前整版core203和实际失败修复，不以更多机械提取替代完整退出。历史R8P135/1/57、旧镜像和产品浏览器不跨source代验；分支超过48h的原因仍为完整退出未达成。

本片详见[R8T模块记录](../changes/2026-10-31-refactor-r8t-enterprise-source-onboarding.md)；上一片[R8S模块记录](../changes/2026-10-31-refactor-r8s-saved-text-results.md)。当前只维护摘要，详细过程/失败/命令回归所属模块。

## 历史固定源记录：R8Q 及更早

# 当前整体候选：R8Q Canvas I/O 分责；整版验收 OPEN

应用/定向验收源码 `00a94230a9e1746a3d0d88b834b7bdcc6f06ce0d`。Canvas 尺寸回写迁入**既有** artwork-document，视频提示词 wire/响应迁入**既有** prompt-optimizer-client；页面只绑定事件。仅3个原产品文件变化，无新增产品模块文件，其他2133个原src/services raw SHA保持。任务、冻结报价、钱包、UNKNOWN和供应商链未改。

本片原/新33用例对照，26组正常trace EXACT，原7个异常夹具观测归零；真实文档/handler/PG23检查通过。同固定source的10个受影响入口全部新执行PASS，runner为subset PARTIAL/exit2，**不代表完整196通过**。完整类型/lintexit0、5087实际类型输入hash保持。副本回滚与原始行为恢复、四产物以本片证据目录为准。

详见[本片模块记录](../changes/2026-10-31-refactor-r8q-canvas-io-boundaries.md)与`output/refactor-r8q-20261031/VERIFICATION.txt`。R8P控制/资源清理已交付，但原整版135PASS/1FAIL/57NOT_RUN仍是其历史source的未通过结果；本片未运行新镜像/runtime177/browser92，不用历史绿灯代验。下一项审查是context-menu/properties共享selection投影；持续容量、有效CI、最终main整版验收继续开放。

**🔴 候选分支超过48h：用户要求完整重构版本，完整退出尚未达到。整体ACTIVE，原工作树保留；main刷新仍e2f56255，产品模块计数1/3，未合main、未部署，47 HOLD。**

## 历史固定源记录：R8P 及更早

# 整体重构退出审计（R8P 当前候选）

当前候选源码 `a98e313bd8441035f2d43d4eac66eca9e2aeffd8`。验证资产的两个窄owner及真实调用方已实现，原13控制/修改18控制与正常合同对照通过；**整版原生GUI验收仍OPEN：当前raw报告135PASS/1FAIL/57NOT_RUN，fullCorePass=false**。失败项在本机提交内存耗尽后中止，不写成业务通过。

本片只改验证资产。scene/director复用GET405路由准备；process-lifecycle观察真实root退出，而不以taskkill成功或失败推断状态；缺失spawnSync streams转为文本，诊断失败保留原异常。全部2136个原src/services raw SHA保持，没有修改产品入口、UI、钱包、任务、UNKNOWN或资源预算。

实际验证分层保留：cafa8050首版core129PASS/1FAIL/63NOT_RUN，在audio未知ACK重启矩阵暴露taskkill255/后代已退休时root退出事件的竞态；修正后a98e313b完整目录继续至135PASS，音频/时间线API矩阵已通过，timeline-native-canvas只读GET发生ECONNRESET。一次同source/digest/env的续跑核验复用135条原日志，未使用cafa129或R8O191冒充当前通过；该次已完成真实时间线导出/采用，随后Next连续ERR_MEMORY_ALLOCATION_FAILED/Jest异常，最低观测可用提交内存116300KiB。原始runtime、进程树与隔离PG快照保留；只终止确证自有的异常App及未收尾case进程树，按精确ID/源码owner清理其tmpfs PG和临时fixture凭据，其他线程/系统分页文件未动。该次中止仍为FAIL，后续57项未运行。

本轮未构建新镜像、未执行新的runtime177或产品browser92；原完整core门槛保持，不伪造PASS父报告、不放宽断言或用历史绿灯覆盖。R8O镜像/450秒/产品92继续只归原source；本片只证明产品raw字节不变，不冒认新的容量、生产或全应用验收。

最终类型exit0，5087个实际compiler/config/依赖输入重新固定；原2个.Next生成route type漂移单列，旧输入/类型结果保留，所有原生进程结束后重新完整类型检查，不改产品或配置。lintexit0、原warning保留。原13控制复现缺准备1/假停止3/原异常被遮盖2，修改18控制为0/0/0，原19读取/director3GET405/POSIX/正常日志EXACT；实际自有子进程退出已运行。

**🔴 独立候选超过48h：用户要求持续完整重构，工作区保留。整体ACTIVE，未合回main、未部署、47 HOLD；验证资产不计产品功能迭代，main刷新仍e2f56255、计数0/3。原生整版验证待资源窗口；继续推进Canvas两处直接I/O与菜单/属性选择投影，持续/生产容量、有效CI、最终main整版与生产验收尚待。**

| 原要求 | 当前证据 | 判定 |
|---|---|---|
| R0/R1/R2/R4/R5 已有产品规则与数据边界 | 2136个产品raw SHA保持，a98同源135条PASS日志 | 保留已有实现；不把未执行项当通过 |
| R3/R6 验证与Canvas职责 | 两个窄验证owner；真实调用方与13/18控制，正常合同EXACT | 验证资产实现已落地；整版原生GUI资源门槛OPEN |
| 完整core同SHA | 135PASS/1FAIL/57NOT_RUN，原报告不改 | 未通过；同源复用不覆盖后续未完成 |
| 同固定镜像runtime/产品 | 本轮未运行；R8O历史证据单列 | 原guard不改，不借历史177/92代验 |
| 100k/持续容量/有效CI | 既有台账与本次精确source远端观测 | 未完成，fixture控制不是生产容量 |
| 最终main/上线 | 原独立分支，main刷新e2f56255 | 未合回main、未部署；47 HOLD |

## 下一步具体工作

1. Canvas仍有两处直接I/O：dimensions元数据回写（canvas-client.tsx:825）与video prompt-assist（:3847）。回归原document/browser adapter，不另起保存/任务系统。
2. 审查context-menu（:3063）与properties（:3884）的重复node-kind投影，复用选择owner；DOM测量和薄事件adapter不按4181行机械拆。
3. 原生GUI待足够本机提交内存或既有固定运行环境的可复现窗口；先记录资源，不重复压测/抬阈值/重放付费任务。
4. 持续/生产容量、原ZIP传输根因、有效CI、最终main整版与生产验收继续保持未完成。

## 历史：R8O 固定源退出审计

# 整体重构退出审计（R8O 当前候选）

应用与镜像源码 `46056b43880772a89da37d72e9b7b4ee9b5f9437`。同源码192目录：191 PASS / 1 FAIL / 0 NOT_RUN，**不标完整core通过**；完整同Web/Worker镜像与实际双浏览器92通过；runtime177被原完整core状态门槛阻止，业务检查尚未执行。原144项的源码、命令、日志SHA逐项保持；原47项独立新执行全部通过（subset runner PARTIAL / exit2），场景失败原记录保留。

| 原要求 | 当前证据 | 本轮判定 |
|---|---|---|
| R0 / R1A / R1B 原价、任务、权限和共用用例 | 原报价/余额/UNKNOWN与原47项集中续验，同镜像原账务链 | 不以局部通过替代整版main与生产；全部状态见CORE_COVERAGE |
| R2 / R5 调度、续交、同版本Worker | 单一scheduling owner，真实PG15→16对照；产品92；runtime177待完整core通过后执行 | 本片实现与固定镜像通过；场景native回归仍OPEN |
| R3 / R6 Canvas和外层组合 | 本片frontend、Canvas、入口字节保持 | 剩余Shell与兼容caller退出继续，不机械拆事件adapter |
| R4 数据/事务、无反向依赖 | 调度SQL唯一owner，原钱包/检查点不拆事务；四类SCC0 | 两条release fixture反向边与一条dist边单列 |
| 变化传播范围 | 6既有产品文件+3新职责，2127原产品SHA保持 | 不是靠文件数量证明，具体接口/依赖和行为已登记 |
| 真实等待与混合容量 | 同负载同预算450秒原/新对照，原字节与177笔1014积分 | 本地诊断通过，不是30分钟过载、24小时长稳、租户公平或10万容量 |
| 完整core同SHA | 同源码192目录：191 PASS / 1 FAIL / 0 NOT_RUN | **场景失败仍OPEN；不标192全部通过** |
| 有效required CI | 本次push后按精确source查看REMOTE_CI | 本地结果不代替远端实际执行，历史billing注释不当当前状态 |
| main整版与上线 | 第三模块普通同步2→3→0 | 未合回main、未部署；47 HOLD |

同负载与预算的450秒原/新对照：每侧165图、12原生媒体、1800读、450保存、177笔1014积分；原像素/字节/单次POST及末尾预占归零通过。整体端到端p95（秒）67.536 → 45.021，surge p95（秒）69.564 → 50.019；冷却且有余量的左采样区间累计（秒）52.001 → 0.000，time-ready且有余量（秒）30.002 → 7.999。这些是一次本地对照，不是每用户等待、全部候选可路由或10万容量证明。

完整core首轮场景测试实际出现sharp加载分页文件不足与V8内存分配失败，且错误日志拼接NaN遮住原异常、留下Next子进程；只核验并终止了自有两个Next后原测试exit1。第二轮同源码复用144条原日志，仅重做场景时在director outputs HTTP500/Jest worker子进程异常后出现输出0/预期1超时；无pageerror。两轮失败及cleanup分别保留，第二次根因仍OPEN，没有抬内存、改业务断言或用历史PASS覆盖。后续原47项与固定镜像验证独立登记，不冒充完整core绿。runtime入口要求timeline所属完整core为PASS，因此实际exit1并在检查前清理；原timeline108项通过也不绕过该门槛，没有伪造PASS父报告或放宽guard。

## 下一步真实工作

1. 在可定位证据下解决场景native的director outputs/Jest worker失败；不继续无条件重跑，不篡改192目录或预期输出。
2. 继续剩余Canvas Shell职责与兼容caller退出；保留原任务、冻结价和UNKNOWN合同。
3. 持续混合、生产到达率/规格/余量与租户公平另验；原ZIP socket传输根因仍OPEN。
4. 有效CI、最终固定main整版验收和生产发布分别给证据，47 HOLD保持。

**🔴 候选分支超过48h：用户要求持续交付完整重构版本，仍保留独立worktree。剩余Canvas Shell、场景原生回归、持续/生产容量、有效CI、最终main整版整合及生产验收尚待；整体ACTIVE，未合回main、未部署、47 HOLD。**

## 历史：R8N 固定源退出审计

# 整体重构退出审计（R8N 当前候选）

当前应用源码 `ba4805e0959af0d00e1a655200b314a134fcc131`；本轮权威结果为R8N DELIVERY。同一source/digest的完整core191、完整同Web/Worker镜像、runtime177及产品双browser92均为本轮新执行；历史源结果不拼接。以下原R0–R6及容量/CI/整合要求不以切片完成替代，后附各阶段均为历史固定源。

| 原要求 | 当前归属 / 权威证据入口 | 当前判定及还需什么 |
|---|---|---|
| R0 已有质量/Canvas定价修复不倒退 | image-price/原任务及参数plan回归、完整镜像产品 | R8N完整191新执行，含真实PG原价/余额/UNKNOWN；同镜像runtime177与产品92。不代表生产上线或历史事故全闭合 |
| R1A typed图片/抠图用例，各HTTP/Agent/workbench共用 | 原imagegen准备/route与同步计费owner、AST运行图 | 结构已实施；R8N未改server原文件，相关链及产品通过；最终main固定全版仍待 |
| R1B 同operation单一prepared与原冻结价 | `imagegen/preparation`、quote/dispatch与3套pricing回归 | 原价/明确取消/不足余额/UNKNOWN必须仍通过，配置缓存不跨Pool |
| R2 生成与原结果续交共享交付 | shared delivery/checkpoint/settlement，delivery/resilience/parent cases | 历史供应商403与原始两笔丢失窗口不因fixture PASS自动关闭；项目历史case单独保留 |
| R3 Canvas文档/任务/渲染/交互分责 | 原document/history/task/selection/navigation及新image-model-selection | R8N共享目录、AuthProvider读身份、quality配置与Canvas投影生命周期闭合；原文档/任务owner保持。剩余Shell仍按职责审查，4180行不是目标 |
| R4A Pool/Tx无业务依赖，数据owner有唯一写入 | `platform/db`，db兼容面；SCC与依赖扫描、PG事务矩阵 | 纯平台结构已落地；兼容出口只为真实脚本调用保留，不算平行writer |
| R4B 无业务请求新建schema或管理bootstrap | Web显式persistence/startup及schema owner、published read | R8B生命周期修复归历史源，本轮没有改schema；后续所有进程/历史规模升级仍须各自证明 |
| R5 同版本独立Worker、单任务owner、协议/排空 | 固定完整Dockerfile/Worker manifest/shared scan、runtime/media gate | R8N完整同Web/Worker镜像/runtime177/产品92/排空通过；R8J450秒样本与生产容量单列 |
| R6 外围管理/工作台/测试资产与旧路径退出 | admin owner、workbench单源、core catalogue/runner；源码边界 | 历史成熟切片保留；需继续剩余Canvas组合与真实兼容caller退出审计，不以新增文件数当结论 |
| 生产lib→app反向调用为0；SCC为0 | `scripts/architecture/analyze.cjs`，静态/运行/emitted图 | 两条release fixture反向边单列，不当生产依赖；最终固定源重新扫描 |
| 用户业务参数改动局部传播 | R8N选择规则/hook、原feature/draft owner | 本片5个原产品文件+2新职责文件，2126原产品hash和Canvas整页原字节保持；20实际生命周期/15旧异常与4正常目录快照对照，原模型117/DOM12在完整core内 |
| 同机UI/server p95、RSS、事件循环与INP对照 | 复用现有benchmark-ui-performance、benchmark-imagegen-pipeline、Canvas probe；原建议无超过10%回退 | **已补同锁五轮，整体仍未退出**：R8E相同机器320节点/12图、同Node/React/Next/lock，5轮10栈30页/300准备600读取；指标与原10%阈值按本轮PERFORMANCE_COMPARISON，仍缺入队/持续混合与fieldINP；180秒读取不当容量证明 |
| 100k+活跃用户容量模型 | PRODUCT_READINESS_100K，实际到达率/并发/规格/资源余量 | 未完成：已有R8J450秒2账号受控混合生成/保存/媒体样本；生产到达率、长稳、租户公平及真实资源/规格模型仍待，不将DAU当并发 |
| required CI实际执行且同SHA | GitHub workflow/run/check annotations，非仅YAML | 未完成：本轮按REMOTE_CI新run观测；本地完整191/runtime177和产品通过不当远端requiredCI。旧账户注释不当实时结论 |
| 完整重构版本main普通整合 | 固定origin/main、普通merge、最终全版验收；不强推共享main | **未完成**：目前只是独立候选分支，尚未合回main；超过48h原因见各模块记录 |
| 部署与生产功能验收 | 实际在线source/image、明确目标与发布锁/原任务保护 | **未完成且本轮不执行**；47 HOLD；代码/候选/本地通过不等于上线 |

## 下一步真实工作

1. 共享目录身份生命周期已在R8N闭合；继续Canvas剩余Shell与面板/事件组合的真实职责归属，不引入平行任务/保存框架，不机械拆纯事件adapter。
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


## 2026-10-31 R8L：视图导航意图封版（整体 ACTIVE）

固定应用/完整验收源码 `53cb03c3532302358838f219ae329a827e9144a0`，生产 Dockerfile 同 Web/Worker 镜像 `sha256:c0428ac91598223f7de52af70491defe4b4d6a2ffa1ab9503957682e4b021b40`。区域聚焦、工作流导入 Fit、显式节点定位和手动导航复用唯一 navigationRevision；view-navigation 纯 owner 只拥有视图意图、scope 与 frame/timer，页面仅组装。旧区域/导入迟到写入 9→0，18 组正常几何及文档/history轨迹 EXACT；实际 React 19 项（含实际project-navigation即时/迟到目录正例），切换项目/账号/workspace 不继承旧定位 ID，同 ID 再次定位及旧 ACK 不清新请求。文字新项目仅允许紧接着的一次目标交接。原动画 320/240/280ms 与节点创建/save顺序保持，不新增任务、钱包、网络或文档 owner。

7 个既有产品文件+1 个新 owner，其他 2121 原 src/services 哈希保持，页面 165 个其他原函数正文按Git规范LF归一后相同（原始raw哈希另存，不混写为原始字节完全相等）。原 27 组节点创建全轨迹、viewport15/arrange25和输入矩阵保持；类型 exit0（全部 2570 个 TS/TSX/package/config 输入逐hash bridge）、lint exit0/38既有warning、四类SCC0。最终同SHA/digest完整 core188 全新执行，0失败/0未运行/0复用；原完整 Linux runtime177 与真实产品双browser92在同 source/image通过，原31图ZIP字节保持，POSIX drain与自有PG/容器/网络清理通过。隔离供应商/PG不当生产上游或10万容量证明，180秒混合读不等于持续混合生成容量。

初次 core `5fb6a84f` 为38PASS/1FAIL/149NOT_RUN：project-navigation夹具仍只声明旧 setFocusId，实际页面已向原 navigation hook 传 focusCanvasNode，深链触发 ReferenceError。只补记录视图port，原八类节点深链/选择/导航/账号及workspace断言不变；最终重新固定并188全新执行，不跨SHA拼绿。532中间完整core188/browser92曾通过但未覆盖实际深链组合，新正例暴露0次定位的回归；明确目标project ticket修正后19项通过，再重新固定并完整验收，不借旧绿灯。5fb6与532旧完整镜像/browser只归各自源，初始部分编辑、DOM重复声明、节点视图反例及TS收窄错误原日志全部保留。

本片第3模块普通同步 main `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，输出 Already up to date、exit0，计数2→3→0。候选未合main未部署，47 HOLD；原5288rawhash、完整源码/字节patch、副本恢复18正常轨迹及9旧迟到写入、later-edit零写入与四产物以本轮DELIVERY/VERIFICATION为准，最终封版仅doc-only bridge。**独立候选超过48h：用户要求完整重构版本，最终退出尚未达到。**剩余Canvas参数/Shell组合、R8J调度等待诊断、持续混合业务/生产容量、有效远端CI与最终main/生产验收继续；R8J测量不借给本片，历史ZIP socket hang up根因仍OPEN。


## 2026-10-31 R8M：模型选择与规格联动封版（整体 ACTIVE）

固定应用/验收源码 `26f787e0fd1f54c9f02571584a7d211b2d01b672`，生产Dockerfile同Web/Worker完整镜像 `sha256:9d9f5b9e6f20cf6dc0baa3f577e1e91b4dce14ac7ff9c58d2e5532de023b7627`。模型/options联合投影、原managed/legacy优先级及规格联动归canvas/image-model-selection和use-canvas-image-model；页面只接原node-draft/feature/quality端口。legacy存储读/访问崩溃2→0、写事件错误1→0，偏好失败不影响内存选择；managed不访问legacy存储。提示词/比例仍归原draft，目录/质量/任务/报价/钱包/UNKNOWN均沿原owner，不新增fetch/cache/task/store或业务限额。

只改变CanvasClient一个既有产品文件，新增2个职责文件；其他2128原src/services逐raw SHA保持，移出pickGenerationModel，167个其他原函数正文逐字节相同。117组实际旧effect/新规则的选择/规格结果EXACT；真实React+原draft12项/8共同快照EXACT，目录/config/quality为明确受控读端口。原58组创作栏HTML/价格输入相等。类型exit0且2572输入逐hash桥，lint exit0/37既有warning，新hook0warning；四类SCC0，2条release fixture反向边与1条dist生成未解析边单列。

同SHA/digest的20个直接受影响入口全部新执行PASS/0失败/0未运行/0复用（只就选中20而言）；scope=r8m-affected、status=PARTIAL、原runner exit2。catalogue190是注册数量，**本轮没有执行全部190或原runtime177**；R8L53cb的完整188/runtime177只保留历史归属。本轮完整固定镜像实际双browser92通过，原31图ZIP逐字节、原任务/原价/账务及七笔42积分fixture保持，POSIX drain与自有PG/容器/网络清理通过；隔离供应商不当生产或10万容量证明。PowerShell驱动外层非零与原runner子进程2分开登记，没有将PARTIAL改写成完整core绿灯。

原DOM undefined/JSON投影比较失败和SSR旧夹具缺focusRevision0的baseline失败原样保留；只对齐相同持久化投影和原UI端口，原模型/价格/草稿/错误断言保持。完整5297源码、字节patch、原5292rawhash独立副本回滚（恢复旧2读崩溃/1写事件错误）、later-edit零写入及四产物以本轮DELIVERY/VERIFICATION为准。最终封版仅5文档bridge；只在独立候选分支推送，未合main未部署，47 HOLD。

本片为R8L同步后第1/3产品模块；最新main仍e2f56255，无新增待合。**独立整体候选超过48h：用户要求完整重构版本，完整退出仍未达到。**继续共享feature catalogue身份生命周期、剩余Canvas Shell、R8J等待诊断、持续混合/生产容量、有效CI和最终main/生产验收。共享feature cache命名空间未在本片改写；历史ZIP socket根因与其他历史问题不因本片通过自动关闭。
