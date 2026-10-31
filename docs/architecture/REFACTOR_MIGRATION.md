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

## 2026-10-30 R8A：文字手动编辑与原焦点会话归属

固定应用/验证源码 `eb2c5a9b614f711645a42bb2ba23842468bb0a7b`。内容、失焦提交、改名、尺寸、适高和展开状态归 `text-editing`；原 `text-document` 保存队列与 `history` 冲突/事务仍是唯一归属。实际 textarea 捕获焦点时的 id/draft/callback，跨项目 blur 提交原文档，跨账号不写入。

8 条正常命令/保存/历史轨迹 EXACT；5 个旧编辑反例及两类 DOM 重绑定问题闭环。真实隔离 PG 编辑 17 检查覆盖位置+尺寸一次原子 undo/redo、远端内容保留、冲突整笔回滚和 lost ACK 原 operation/body 续查。26 个受影响入口均 PASS（subset 为 PARTIAL/exit 2，不是当前 164 项全量通过）。固定完整 Web/Worker 同镜像实际产品 browser 50 检查通过，其中新增文字编辑 6 项；无新增文字编辑任务/消费/供应商调用。类型检查、lint（37 个既有 warning）通过，四类 SCC 均为 0。

Canvas 页面 4713→4586 行；2105 个原 src/services 文件中 2102 个 hash 保持，另有 2 个新编辑 owner 文件。完整 5226 文件包、5219 原始文件 hash 的独立副本回滚、later-edit 零写入及远端状态以本片 DELIVERY/VERIFICATION 为准。

整体重构 ACTIVE；同步后模块计数 2/3。未合 main、未部署，47 HOLD。历史 R7Y 全 160/runtime 177 仍只归历史固定源码；当前本片不冒充完整 164 验收，冷 DDL/历史 dev 根因、性能容量、有效 CI 与最终整版验收仍待。

## 2026-10-30 R7Z：项目导航会话归属

固定应用/验证d62025d44a1d009a0471993483eed66c554eedf8，Canvas项目导航/URL与刷新恢复/浏览器历史/延迟工作流初始化归scoped owner，页面4880→4713行；20共同轨迹EXACT，原25检查复现四反例→新30通过。21受影响入口同source/digest通过（subset PARTIAL/exit2，不冒充全161），完整生产镜像同Web/Worker/真实PG双browser44检查通过，新导航7检查未增加任务/供应商/消费。类型/lint37warnings、四SCC0，2102原src/services hash保持；5214原hash副本回滚与完整四产物/远端见R7Z DELIVERY。整体ACTIVE，同步后1/3，未合main未部署，47 HOLD；R7Y全160/runtime177属于其原版本，当前完整161和历史dev根因/DDL/容量/有效CI/最终main整合仍待。

## 2026-10-30 R7Y：主线 owner 整合与完整候选本地验收

固定应用/验证00b7e815a361105cf6604769ee4eeeb7dd625cac：普通接入main e2f56255五提交，缓存、企业素材事务和回执读取修复均归既有owner，未恢复第二套Canvas轮询或DB池。完整core160/160从零执行（日志复用0）、同固定生产镜像Linux runtime177与双browser37通过；真实PG/原HTTP/Worker、原价/单次扣款/UNKNOWN/取消及媒体链覆盖，供应商是隔离fixture，不是容量或线上验收。类型exit0、lint37warnings、四类SCC0；2092个原src/services文件hash保持。四产物/5206原hash副本回滚及推送以R7Y DELIVERY为准。整体ACTIVE，主线同步计数0/3，未合main未部署，47 HOLD。历史Windows dev退出根因、一般冷进程DDL、性能容量、有效required CI及最终整版退出仍待。R7X真实lint39与旧文档37口径差异已明确保留。

## 2026-10-30 最新 R7X：选择归属已实施，整体继续

固定应用ca694d87：selection owner复用文档scope，页面4968→4879，16共同事件轨迹EXACT、原20→新31检查；16受影响入口同SHA通过（subset PARTIAL/exit2），类型/lint37warning/四SCC0。完整5206源码实际Next交互12+node11+导航6通过；同项目重开原2个旧多选的真实反例已改为0，原复制/UNKNOWN/undo保持。其余2098原产品hash不变；完整包/5202原hash副本回滚与Git见R7X DELIVERY。整体ACTIVE，当前2/3模块，后续主线同步与完整候选；全158/历史dev退出根因/性能容量/有效远端CI/最终整版验收尚未闭合，未合main未部署，47 HOLD。下文历史阶段按原SHA保留。

## 2026-10-30 当前模块：R7T

## 2026-10-30 最新：R7V 视频任务跟随检查点（整体ACTIVE）

视频恢复编排归canvas/video-task-follow；第三模块后普通整合main bbc8f784六提交，两冲突保留scope缓存隔离和新存储/提示语义。固定c496e36d的156原条目已覆盖，153有通过证据、时间线/场景/角色三项Windows完整原生门禁OPEN，**不是完整core PASS**。新完整Linux镜像及同镜像真实双browser37/PG/Worker/180秒通过；独立Next视频恢复8检查通过。type/lint37warnings与4类SCC0。原full-core门槛未降低，新的Linux runtime177未运行；四产物/回滚/版本以R7V DELIVERY为准。未合main未部署，47 HOLD；后续先闭合三个原生门禁，再继续剩余职责/性能容量与最终整合。历史阶段数据保留原SHA。


浮动层render/live共用projectOverlay与原纯几何；Refs/observer测量、最小pan移出Canvas，文档/history/任务/账务仍原owner。原31轨迹EXACT、b58固定19项受影响PASS（subset exit2）、实际Next9+响应式5、tsc/lint37warnings与四SCC0通过。observer同ID换文档反例关闭，本地端口EACCES与verifier时序失败原样保留。整体ACTIVE，未合main/未发布，47 HOLD；全151与新Linux未在本片重复。见[R7T记录](../changes/2026-10-30-refactor-r7t-overlay-ownership.md)和DELIVERY。下文R7S完整150/同镜像177+52+37仍属于其原版本。

## 2026-10-30 当前整版检查点：R7S

固定接main1754的17提交，主题传递归既有组件，深链/节点定位归`useCanvasViewportFocus`并与view-controls手动导航共用revision。单图原位、多图fanout断言分离，未回退产品。应用/验证4c4f8e29：完整core150/150全新执行、四类SCC0、完整Linux同镜像runtime177/原生媒体52/双browser37通过；原scene门禁本地关闭。整体ACTIVE，Canvas剩余职责/有效远端CI/交互准备开销与容量/最终main整合仍未全部退出。最终包/副本回滚/远端以R7S DELIVERY为准；未合main未部署，47 HOLD。见[R7S模块记录](../changes/2026-10-30-refactor-r7s-viewport-appearance.md)。下方各阶段保留历史来源，不当作当前完成状态。

2026-10-29 R7C：六种实际native hook归同一文档owner，复用Canvas actor/workspace scope，异步auth后再次检查；原method/body/operation先恢复再写下一意图，同节点串行、不同节点并行。12个GET及timeline素材读沿原receipt scope，项目归属批量过滤；同账号个人/A/B、成员撤权与原记录读取通过，节点payload/CAS/任务/账务仍原owner。旧分散端口和猜revision降级在真实调用方迁移后删除；老文字fixture补真实adapter并修正模拟响应base泄漏，原21/58通过。固定b414 core101/101全新执行、同镜像runtime177/产品37通过；补充实际hook对照发现command409漏刷新，最终66da仅一个生产文件及verifier/文档修正，8个受影响入口全部通过，React68组106、PG6组146、最终完整镜像及产品37通过。两层SHA不互相改标；tsc/lint37warning、四类SCC0。4923基线hash副本回滚/完整源码四产物/远端以DELIVERY为准。整体ACTIVE；继续完整退出需求/Canvas剩余编排与变更扩散、性能/INP/容量、有效远端CI及最终整合，不合main不部署。 见[R7C记录](../changes/2026-10-29-refactor-r7c-native-documents.md)。

2026-10-29 R7B：整合固定 main43d46949（25提交），五处冲突按既有 pool/schema/access/context/HTTP owner 迁入；六种原生节点的 copy/delete/project-delete/history 用同事务当前回执，浏览器不再猜 revision+1，回执重放保留完整 kind 形态。workflow fill 准备/上传不占 DB 事务，唯一尝试 key、原 operation/像素对与 COMMIT acknowledgement 丢失恢复复用既有表；manifest actor/workspace 文档分离加载错误和空数据。固定faed4970 core98/98全部新执行、真实HTTP/PG66、客户端11组23、历史67/184、完整Linux同镜像runtime177/双浏览器37、tsc/lint通过（38warning），四类SCC0；首轮54PASS+1FAIL+43NOT_RUN的复制回执结构问题已修，原失败不覆盖。完整源码包/字节patch/4878基线hash副本回滚和远端状态以R7B DELIVERY为准。整体ACTIVE；六种hook的workspace epoch、旧实际caller/未注册text fixture迁移、性能/INP/容量与有效远端CI及最终整合仍待；媒体状态根因OPEN，不合main、不部署。 见[R7B记录](../changes/2026-10-29-refactor-r7b-native-lifecycle.md)。

2026-10-28 R6Z：普通整合固定main b6b5af3b（6提交／26路径），5处冲突按实际owner迁入；解码与Buffer生命期归共享delivery，封面DOM保留归原ProjectBrowser，poll due/cancel与checkout观察归原视频owner，不恢复旧Canvas/db/route巨石。固定b778072d core94/94（54同源复用+40新执行）、完整Linux同镜像runtime177/产品双browser37、原生多轨52及tsc/lint和四类SCC0通过；29文件lint保留9warning。字节旧9／新12，图片组件旧6复现／新14通过，PG视频17／协调9／交付73及placement700随机／70血缘／18浏览器样本通过。一次本地MEDIA_STATE_WRITE_FAILED未复现、根因仍OPEN；诊断与原失败均留证，不记已修。4844原hash副本回滚、四产物、远端和资源清理以本轮DELIVERY为准；最新main eca93b8b另4提交。模板/工作流导入owner仍未实施，整体active、不合main、不部署。见[R6Z记录](../changes/2026-10-28-refactor-r6z-main-performance-integration.md)。

2026-10-28 R6Y最终候选：多轨接入既有Canvas/history/node/project/scene/media owner；原生Linux合成抓出的线程默认值作用域缺陷只改media contract，显式参数、沙箱及原报价/钱包保持。固定 `32cd25de` core90/90（50同源日志哈希复用+40新执行）、完整Linux同镜像运行177（新增原生多轨52）、产品双browser37、类型/lint及四类SCC0通过；五处转场/叠加像素和双音轨增益实测通过。原失败/中断留证；自有根PG及runtime/browser资源已清理。最终四产物/全源码/4817原hash副本回滚与远端以delivery-final为准，不覆盖原模块检查点。最新main `b6b5af3b` 的6条提交待下一模块普通整合；Canvas模板/导入、共享生命周期、性能/CI及最终退出仍待，整体active、不合main、不部署。见[R6Y记录](../changes/2026-10-28-refactor-r6y-timeline-integration.md)。

## 2026-10-27 R6P Canvas创作应用

普通/三视图/详情分发、重做及助手生成意图归真实image-creation；4端口复用原任务/历史/scope。旧48/新49、34合同/9时序、原任务46/176通过；Canvas5849→5688，148原函数、1871其它产品hash保持、控件emitted JS同。固定8de98c45 core41/41、完整Linux同镜像125、真实产品32（本轮新创作5）通过，总7笔42积分；外部观察器2处修正单独hash绑定。完整4622hash/四产物/回滚/远端见DELIVERY；固定主线e4369998已普通同步，功能计数1，整体active。[记录](../changes/2026-10-27-canvas-image-creation-r6p.md)。

## 2026-10-27 R6O 主线 owner 整合

固定 main `4e15e71a`、merge `ffa8882a` 已集中验证：core39/39、完整Linux同镜像125、真实产品browser27、优化控件12、tsc/lint、SCC0；1802原文件hash不变，152原Canvas函数保持，6session声明/1媒体函数/9main leaf相同。新参数计划与会话/交付/传输沿真实owner，未恢复db/runtime/Canvas大文件。完整4591hash与四产物、独立副本回滚及远端见DELIVERY，功能计数归零，整体active、不合main不部署。[模块记录](../changes/2026-10-27-main-owner-integration-r6o.md)。

# 渐进迁移与集中验收台账

2026-10-27 R6N：Canvas剪贴板协议/原HTML marker、账号/工作空间复制会话和native transport归3个owner，旧个人key/owner-only记录保留、由原API授权；6083→5868行，153原函数及1859其它原src/services hash保持，移除11内联函数，SCC0。完整旧22组123→新124/24字节合同同、模型44、输入3948/相邻/类型通过；修新tab旧内存、过期intent、切号/卸载后旧回退及bitmap释放。真实页面又捕获按text-前缀猜类型造成混合工具栏缺失，按实际record修复、保留原r6c-text。固定a8a37079 core34/34、完整Linux同镜像125、产品双browser27（剪贴板6）通过，copyPOST2/undo-redo同ID/额外supplier与consume0；60秒混合读5轮，报告99.49秒含尾部剪贴板阶段。4585hash回滚/四产物/远端见DELIVERY；计数2，开工main bc6af06d的12条待下一轮普通整合，整体active、不合main不部署。见[R6N记录](../changes/2026-10-27-canvas-clipboard-r6n.md)。

2026-10-27 R6M：Canvas快捷键纯decision/单capture监听、视图状态与工具条归独立owner，共用原输入归属与V/M/H切换；6524→6083行，162原函数与1852其它原src/services hash保持、4helper正文迁移、SCC0。完整原21→新3948/3925事件矩阵/2HTML同，修复制旧标题/缩放草稿覆盖/Escape菜单与监听重挂；固定8c21b6a7 core33/33、完整Linux同镜像运行125、产品双浏览器21组/182.2秒16轮/2图2笔12积分/弹窗0/页面异常0，类型及相邻通过。Windows冷dev及精确源码复用仍有layout.js eval解析失败，194段Node/Edge独立语法通过，根因未关闭、原失败保留；不冒用为产品通过。4573hash副本回滚/补丁/四产物及远端以DELIVERY为准；同步后第1模块，下一剪贴板会话，整体active、不合main不部署。见[R6M记录](../changes/2026-10-27-canvas-input-controls-r6m.md)。

2026-10-27 R6L：Canvas项目投影/命名会话/列表菜单标题归独立owner，卡片与标题共用Enter/Escape输入，删工作流说明。7132→6524行，169原函数及3规则正文保持；旧38→新44/18投影/7HTML同，迟到读取/先失败覆盖后成功/切号回写/Escape吞下次保存关闭。真实Next-PG11、固定f319d76e core32/32、完整Linux同镜像运行125和双浏览器9组/180秒/2图2笔12积分、类型及相邻诊断/比例通过。冷dev加载SyntaxError首次根因未关闭，原失败保留。第3模块已普通整合固定main8e412abe（merge6ef35a8a），诊断迁真实owner不恢复旧大文件，SCC0、计数归零。4544hash回滚/补丁/四产物/远端以DELIVERY为准；整体active、不合main不部署。见[R6L记录](../changes/2026-10-27-canvas-project-catalog-r6l.md)。

2026-10-27 R6K：固定Next15.5.28/MCP1.32/SMTP10.1.4/Sharp0.35.5/Zod4.6.6与兼容PostCSS，生产audit13→0/完整lock0；完整旧依赖31→新36，实际后处理/SMTP/旧MCP业务观察相同。1526src字节保持/20纯类型擦除相同/3运行字节边界+1纯helper；固定7f3116e4 core31/31、完整Linux同镜像Web/Worker125、产品双浏览器9组/302.19秒25轮/2图2笔12积分/弹窗0及tsc/lint通过。旧cache专项缺Next准备失败保留，不冒充通过；四产物/raw-byte patch/4541hash副本回滚/清理与远端以DELIVERY为准。同步后第2模块，整体active、不合main不部署，下一模块后普通同步main。见[R6K记录](../changes/2026-10-27-refactor-dependencies-r6k.md)。

2026-10-27 R6J：九UI入口共用原fixture生命周期，Next/checker改在原字节副本运行，源配置恢复写归零；旧wrapper3检查复现覆盖后写→新真实子进程42检查保留，实际Next+PG资料库全流程通过/源码tsconfig与next-env原hash保持。当前生产依赖audit13项原报告保留不批量升级；固定16518614 core30/30/最终实际Next-PG/类型通过，原src-services1846hash保持；四产物/回滚与远端见DELIVERY。同步后第1模块，整体active、不合main不部署。见[R6J记录](../changes/2026-10-27-refactor-model-ui-runner-r6j.md)。

2026-10-27 R6I：供应商资料库查询/详情/单文档草稿与能力/报价/映射分责，去口号和说明，微金额与原资料/原id保留；完整旧21/新25与5组可编辑字段/原POST同、sync旧闭包OLD→CURRENT/卸载导出DOWNLOAD→NONE、PG三组/相邻管理35-18/类型通过。固定31c1bf15 core29/29/最终浏览器25-5/tsc-lint通过，入口109→27行、1476后端hash保持/SCC0；第3模块普通同步cde64c6a完成并归零，四产物/副本回滚/远端见DELIVERY，整体active、不合main不部署。见[R6I记录](../changes/2026-10-27-refactor-supplier-library-r6i.md)。

2026-10-27 R6H：模型管理目录/发布会话与12类编辑器分责，单一带类型editor替代独立弹窗flags，原RSA helper同函数兼容；完整旧33/新53、18HTML与原POST精确同，late-read旧STALE→新FRESH、卸载后原pending保留且GET0，真实PG五组/类型/结构通过。历史参数fixture旧新同失败已修准备，生产CAS不改；固定1bd07c79 core28/28、最终浏览器53/18及tsc/lint通过；17原函数/1476后端字节不变、SCC0。四产物/副本回滚/远端以DELIVERY为准。同步后第2模块，资料大面板/测试资产/长时负载/依赖与最终整合继续，不合main不部署，整体active。见[R6H记录](../changes/2026-10-27-refactor-model-management-r6h.md)。


2026-10-27 R6G：系统设置1971→201行，接口/登录支付/站点内容/账号积分面板各有草稿；共享会话只持安全快照和原提交。RSA三函数/徽标/导航原文保持，原输入/原payload/HTTPfallback不变；跨面板保存不清未保存草稿，旧会话加密continuation不POST，安全回包保留GET独有mode。完整旧57/新59、15HTML同、真实handler/PG36、相邻用量30→31及tsc/lint通过；固定5f31890a core27/27、runner12/68、最终类型/结构通过；四产物/回滚/提交以DELIVERY为准。同步后第1模块，model-management/测试资产/长时负载/依赖和最终整合继续，整体active、不合main不部署。见[R6G记录](../changes/2026-10-27-refactor-admin-settings-r6g.md)。


2026-10-27 R6F：系统设置的可达usage/详情迁独立UI owner，已被旧路由迁走的users/ledger/artworks平行视图删除；3331→1971行，不再配置鉴权成功就读全部用户。关闭/换成员/离开/换token旧读失效，原备注/禁用POST不重放；旧新实际React27→31、7组HTML精确同、真实admin-access PG/tsc/lint/本地媒体链接通过。固定merge8f3bc5bf core25/25、最终浏览器28→31、7快照同、runner12/66通过，第三模块普通同步cde64c6a完成并归零；副本回滚/四产物/Git见DELIVERY；整体active、不合main不部署，剩余配置面板/测试资产/长时负载/依赖和最终整合继续。见[R6F记录](../changes/2026-10-27-refactor-admin-usage-r6f.md)。


2026-10-27 R6E：三工作台页面/history继续共用唯一源，API/账号存储/模型/导航显式归环境adapter；build只复制原字节，删除两份隐式全局字符串转换，补完整head/body。native/desktop/standalone三环境保持独立协议，Python新增鉴权白名单资产URL、旧URL保留；原任务/报价未知查询链不改。完整旧浏览器19/235、新版图片/原wire补强19/712、Python16→17、tsc/lint、固定7ca81bcc core24/24与runner12/65通过；副本回滚/四产物与Git见DELIVERY。同步后第2模块，admin大面板/测试资产/长时负载/依赖和最终整合继续，整体active、不合main不部署。见[R6E记录](../changes/2026-10-27-refactor-workbench-assets-r6e.md)。


2026-10-27 R6D：改名/位置/显示尺寸与布局/标记/分组六份旧metadata SQL统一调用原history行writer，复用同owner锁/单连接事务；纯row投影迁独立叶模块避免循环，旧隐藏metadata/NULL自动布局/原像素与返回形态保留。NULL独立根分组原子拒绝，空legacy根与child保持同项目语义；旧完整树18/80复现，旧相邻receipt预期修正后完整基线180/新版182通过，原失败保留。row及parent-link正文不变，SCC0，metadata SQL6→0。固定清洁cdb5d1e4 core23/23、新writer18/80、实际history PG20、runner12/64及最终tsc/lint通过；副本回滚/四产物/Git以DELIVERY为准；同步后第1模块，外围UI/旧入口、长时负载/依赖及最终整合继续，不合main、不部署，整体active。见[R6D记录](../changes/2026-10-27-refactor-canvas-artwork-writer-r6d.md)。


2026-10-27 R6C：完整产品浏览器实际发现公开config/models/text目录仍依赖管理runtime；已改已发布快照query，提取原priceHint共用投影，运行边4→0；坏/缺管理连接完整旧PG16→新24，core22及完整Linux同镜像通过。真实两browser9组涵盖图片/文字冲突、明确解决/undo-redo、空白生图/参考编辑/刷新、181.68秒16轮混合读取，2图2笔12积分/弹窗0/页面异常0；实际Worker排空exit0。4475hash回滚与旧16行为恢复、被测应用b79f和最终验收脚本提交分层见[R6C记录](../changes/2026-10-27-refactor-product-browser-r6c.md)。第3模块，收尾普通同步main归零，不合main不部署，整体active。

2026-10-26 R6B：R6A固定完整镜像的Web/combined direct Worker实际运行125检查通过，真实登录/报价提交/原价与current/交付账务/Canvas CAS/工作台两图/真实FFmpeg及排空exit0；测试用户4笔57、retained3笔18，UNKNOWN不重放。4471hash副本恢复及验收入口四产物见[R6B记录](../changes/2026-10-26-refactor-runtime-r6b.md)，计数2；不是浏览器或容量证明。

2026-10-26 R6A：21个现有核心入口按六组统一串行、同SHA/全文件摘要/环境与literal日志绑定；dirty或分组PARTIAL、失败NOT_RUN保真，Docker候选构建前依赖同source core。修旧fixture真实owner/研究资料依赖，并发现修复completed-parent忽略deliveryComplete=false的误报成功（保留原图原价改partial）。清洁整组/完整Linux镜像/回滚/remote以本轮DELIVERY为准；第1模块，R6B整包运行/性能/最终CI和历史债务继续，不合main、不部署。见 [R6A记录](../changes/2026-10-26-refactor-acceptance-r6a.md)。

2026-10-26 R5P后三模块普通整合：ee60d3c0接固定a1a56371，24路径自动合并；健康页直连Pool owner，旧草稿保护/原pointerCAS/创作去重/公告/进度保留。旧新发布base3→7、registry/素材PG16/创作完整PG/实际组件UI20、图片20-44/文字16-47/进度与公开合同通过；最终类型/结构/4451hash回滚/双parent与远端见main-sync DELIVERY，计数归零。R6同SHA全候选/旧兼容writer与容量继续，不合main、不部署。见 [同步记录](../changes/2026-10-26-refactor-main-sync-r5p.md)。

2026-10-26 R5P：图片元数据8字段与文字共享纯三方合并，Canvas改名/标记/批组/缩放/drag归原history单写链；canonical原receipt和选择删除基线接真实文档。Canvas7319→7133，174原函数167保持/7明确改绑；完整旧9/18→新20/44、Next双tab6/批量3/相邻15、文字16/47和原history/node/交互20/32/28/纯184、tsc/lint通过（原8warning）。4441hash副本回滚/四产物/远端以DELIVERY为准；第3模块，后续普通整合c622b314见main-sync交付，旧raw wire/系统定位兼容与R6继续，不合main、不部署。见 [R5P记录](../changes/2026-10-26-canvas-artwork-concurrency-r5p.md)。

2026-10-26 R5O：文字autosave/history/选择删除共用12字段三方合并、owner事务与引用防环，原operation重试回canonical，真实冲突两份内容保留；无新DDL/正常创作确认。Canvas7311→7319，173原函数保持；完整旧9/18复现覆盖复活→新16/47关闭、纯96、真实双tab Next4、相邻控件15+5、PG16/24/20/32/28与历史184通过。最终tsc/lint、4433hash完整副本回滚/四产物/远端清理见DELIVERY；第2模块，旧无base入口保留兼容，图片CAS/外围组合/R6继续，不合main、不部署。见 [R5O记录](../changes/2026-10-26-canvas-text-concurrency-r5o.md)。

2026-10-26 R5N：在线改字扫描/草稿/原operation入队与后台观察归唯一owner，原侧栏独立，结果复用attachment；Canvas7791→7311，164函数保持/8adapter，旧平行状态删除。旧10类35→新22类79、SSR24同HTML、实际OCR/任务/账务PG28、Next5/相邻15+5+5、助手55通过；最终compiler/结构/4425hash副本回滚与四产物/远端清理以DELIVERY为准。第1模块，CAS/外围组合/R6继续，不合main、不部署。见 [R5N记录](../changes/2026-10-26-canvas-image-text-r5n.md)。

2026-10-26 R5M后三模块普通整合：0bb21cfb接固定d460e61f，无Git冲突，Pool真owner保持，receipt非import正文等incoming；维护runner补Pool同实例alias且保留固定b15绑定，不执行生产repair。旧新primitive29→35/完整源码入口24→37，placement23/runner真实PG、助手15类55、tsc/lint通过；SCC仍0。4419hash副本回滚/四产物/双parent及远端以main-sync DELIVERY为准，计数归零，整体CAS/外围组合/R6继续，不合main、不部署。见 [同步记录](../changes/2026-10-26-refactor-main-sync-r5m.md)。

2026-10-26 R5M：Canvas助手会话/SSE/历史/附件/停止/原意图重试归唯一owner，Canvas8080→7791行，163函数保持/8adapter；纯Orb合同及兼容同对象，原helper不变。旧9类34→新15类55、实际双HTTP入口与PG20、完整BillingProvider实际Next6/相邻15+5、feedback29/Orb128、tsc/lint通过（原8warning），SCC0。4412hash完整副本回滚/四产物/远端以DELIVERY为准；第3模块封存后普通整合main，整体继续CAS/外围组合/R6，不合main、不部署。见 [R5M记录](../changes/2026-10-26-canvas-assistant-session-r5m.md)。

2026-10-26 R5I后三模块main普通整合：c1578088接73384aaa，三冲突已按真实owner迁入，未恢复巨型durable/存储实现；保留Workerinflight排空、真实失败证据与原素材查询，新增bind失败只释放own lease。完整旧c157 cleanup两例转UNKNOWN已重现；合并后真实PG清理8/失败证据38、父回执25、项目素材33、UI19、unit15/Python14、Linux图片Worker71/实际Next六入口20通过，SCC静态/全导入仍0，tsc通过/lint原3warning保留。双parent提交、4380hash回滚、四产物/远端/清理以main-sync DELIVERY为准；计数归零，外围UI-CAS/R6继续，不合main、不部署。见 [整合记录](../changes/2026-10-26-refactor-main-sync-r5i.md)。

2026-10-26 R5I：对象存储raw/managed-read/upload/metadata-query、项目访问/key、TeamError和Fleet发布合同按owner分离；77存储/媒体消费者及其它调用改绑，旧出口同函数/对象兼容。7194原声明保持、37迁移、2动态import改目标、算法变化0；emitted静态环2→0/全导入环4→0，raw22→8和wire1778→98输入只作结构指标。完整旧新团队/私有媒体/本地回退/项目/Fleet通过；真实项目PNG导入33、loopback存储20/远程优先20两侧通过，Linux图片Worker71/实际Next六入口20及tsc/lint通过。旧视频全站fixture缺Router的setup失败保留。四产物/4368hash副本回滚/patch/提交及三模块main整合以DELIVERY为准；外围UI-CAS/整包CI/基准容量/R6继续，不合main、不部署。见 [R5I记录](../changes/2026-10-26-leaf-owner-boundaries-r5i.md)。

2026-10-26 R5H：功能绑定/默认/工具范围/兼容候选6个原规则归feature-model-policy，15实际生产消费者改绑；business和tool-scope只依赖纯规则，不再双向引用。7194原声明保持/6迁移/算法变化0，24配置13161决策旧新精确同、6兼容导出同对象/函数；旧两文件环拆除、其它SCC成员保持、新owner入环0。完整旧/新管理scope/价格、Canvas真实23、准备45、批次/抠图/工作台/家族和报价36通过；实际控件、完整类型/构建、4365hash副本回滚、patch、四产物与提交远端以R5H DELIVERY为准。真实Next管理控件通过；纠正Node启动import的正向编译分支，原正文/9真值表保持、health500→200；原observer/lint/Next失败留存不改PASS；同步后第2模块，剩余4全导入小环、外围UI-CAS/R6继续，不合main、不部署。见 [R5H记录](../changes/2026-10-26-feature-model-policy-r5h.md)。

2026-10-26 R5G：执行组合/通道策略/阶段策略/provider transport/SDK工厂归属分离，必填函数参数完成路由回调、不建全局registry；旧三文件环拆除，新owner入环0、其余SCC成员保持、最大3→2。7191原声明保持/6迁移/3组合改动，原Flow/路由/SDK正文及10算法文件保持；实际fetch bundle OpenAI SDK输入145→0。完整旧/新五组真实PG/SDK/多进程矩阵通过，修正恢复fixture父审计与review/running状态后两侧恢复通过；健康/参数/供应商/liveguard邻接与图片Worker71通过，历史quota仍OPEN。四产物/4359hash副本回滚/实际Next/tsc/lint/提交远端见R5G DELIVERY；同步后第1模块，剩余2文件小环/外围UI-CAS/R6继续，不合main、不部署。见 [R5G记录](../changes/2026-10-26-model-execution-transport-r5g.md)。

2026-10-26 R5F：媒体纯合同/bundle迁src/modules/media，原生引擎/HTTP/C/runtime组装迁services/media-worker，scripts仅稳定CLI和测试兼容出口；Web到测试媒体runtime边归零。7224声明一致/50迁移，C/shell原字节相同、SCC成员保持最大3；95合同结果精确同、Linux原生引擎/新旧HTTP40/40及frame-trim字节hash相同。实测旧独立容器缺KILL使降权FFmpeg取消迟滞，补齐Compose/独立发布配置后3秒内取消/排空检查通过，负对照保留。完整standalone+Worker+media runtime镜像构建及镜像内媒体40、实际Web六入口20、邻接视频65/图片71/退休7进程38通过；不当容量/上线证明。四产物/4352hash副本回滚/提交远端及第3模块main同步以R5F DELIVERY为准；整体继续剩余环/UI-CAS/R6，不合main、不部署。见 [R5F记录](../changes/2026-10-26-media-runtime-boundary-r5f.md)。

2026-10-26 R5E：视频提交合同/受理/只读查询/runtime/BYOC冻结恢复拆为真实owner，14生产消费者改绑，service569→6行/生产消费者0；Web显式worker角色只保存原报价/预占并通知，原prepared/sending CAS及任务lease执行归独立Worker，BYOC首次和显式重试均ready。完整旧18/新65/本地兼容18，慢视频公平性、取消/真实余额/unknown不重提/live lease/冻结原6-current17/排空重启及consume6/69保持；图片Worker71、实际Next六入口20、53profiles2506精确同结果、912wire/1254场景/8251断言、冻结来源PG16及tsc/lint通过（原2warning保留）。7158原声明保持、28迁移、10表达式/3调度函数明确变更；service/byoc动态环拆除、新owner不入环、其它环保持最大3。旧静态脚本按AST迁真owner，旧失败保留，不当运行故障注入。副本回滚/四产物/提交及远端见R5E DELIVERY；同步后第2模块，媒体runtime/剩余小环/UI-CAS/R6继续，不合main、不部署。见 [R5E记录](../changes/2026-10-26-video-worker-ownership-r5e.md)。

2026-10-26 R5D：视频协议合同/纯helper/registry/endpoint分离，19个protocol模块和4个生产消费者改绑；原20文件codec注册环及adapter/upload2文件环已拆，最大emitted静态/全导入SCC均20→3，其余环成员保持，新owner不入环。7170原生产声明保持（21迁移，仅codec查同Map改窄getter），codec/endpoint正文变化0；helper实际bundle生产输入31→6、codec19→0。完整基线/新版53profiles、2506操作结果精确相同，独立912wire/1254场景8251断言、旧33SKU802断言、family886、真实PG双入口16、实际Next六入口20、Worker31及tsc/lint通过。旧provider夹具Request/原生transport注入已修，同夹具两侧48模拟HTTP通过，原失败留存。副本回滚/四产物/远端以R5D DELIVERY为准；同步后第1模块，视频执行归属/媒体runtime/其它小环/UI-CAS/R6继续，不合main、不部署。见 [R5D记录](../changes/2026-10-26-video-wire-boundaries-r5d.md)。

2026-10-26 R5C 后 main 普通整合：incoming `368c93e2` 的 13 处冲突已按真实 owner 迁入，未恢复巨型 db/任务/Canvas 实现。父完成通知改为应用注入 completion port，Worker 增加视频协调池排空后关闭；settings/OpenAI/SMTP 原批量算法保留。完整8e203648基线和整合版实际Linux/PG同71检查通过，实际Next六入口20、生命周期37、项目归属31、父完成24+PG19、postaccept11/142+PG18、异常12、视频协调9组、settings78、config14及价格控件22组通过；全项目tsc/源码lint通过。原最大20环和所有SCC成员与整合前完全一致，新owner入环0、db生产消费者0；不是全产品/容量验收。原始失败和旧image定价verifier债务保留。副本回滚/patch、双parent提交与远端以本轮VERIFICATION/DELIVERY为准；本轮三模块main同步计数归零，下一阶段继续视频/媒体runtime与R6，不合main、不部署。见 [整合记录](../changes/2026-10-26-refactor-main-sync-r5c.md)。

R5C（2026-10-26）：原四类图片任务、批次/工作台、Canvas改字、原图续交以部署归属统一Web保存/Worker执行，批次HTTP回跳删除；PG通知+单独LISTEN唤醒，失联/漏通知由原scan恢复，同tick按原lane接新任务，drain不补领。完整Linux旧16/新71、实际Next六入口20、策略18、相邻恢复156/回执59/持久化36/工作台13组和旧Worker实际29/32/39通过；单价冻结6/current17，混合unknown/原op/取消/原价保留。7124非目标声明/九算法文件保持，新owner无环、旧最大20仍在；tsc/19lint通过。旧image定价脚本client9后陈旧model注入失败，五文件投影同依赖同失败，留R6不冒充PASS。详见 [R5C](../changes/2026-10-26-image-worker-ownership-r5c.md)，第3模块main普通同步后归零；视频新提交和发布角色迁移、媒体runtime/小环/UI-CAS/全产品验收继续，不合main、不部署。

R5B（2026-10-26）：实际独立Worker direct执行共享scan，原PG回执绑定Worker，等待detached原回调再完成tick/排空/关pool，HTTP旧协议保持；combined环境分离与direct不强杀、handoff角色观察接通。Linux真实PG旧8/新29、锁阻塞SIGTERM32、崩溃原tick只读核对39、combined31通过，Web POST1→0、冻结原6/current17单次结算18；31unit/91断言/Python30+4、相邻156/36/59和tsc/lint通过。独立bundle验证及Docker/Compose接线完成，47专用clone仍为HTTP，首次提交排队/唤醒与该发布角色整合继续，不冒充全重活已离Web。见 [R5B](../changes/2026-10-26-direct-application-worker-r5b.md) 及DELIVERY；同步后第2模块，剩余媒体runtime/20环/外围UI-CAS/全产品R6继续，不合main、不部署。

R5A（2026-10-26）：套图/A+51声明及DurableImageJobs真实执行owner分离，route780→221/1072→374，恢复四类原任务不再HTTP回跳，tick保留原受理/回执/鉴权。58迁移声明/helper及7069非目标声明保持，12文件恢复环已拆、新owner无环、scan不达HTTP route。完整PG旧5/129→新5/156、实际Next34→37、冻结6/current17及release实际后台排空通过；全项目tsc/20文件lint、相邻15直接通过与middleware24/Linux补验通过。旧stopping新旧同fixture cleanup42P01、无参legacy用例均保留非绿，见 [R5A记录](../changes/2026-10-26-worker-recovery-boundary-r5a.md)。副本回滚/提交见DELIVERY；同步后第1模块。R5B独立进程执行/媒体runtime与R6继续，不合main、不部署。

R4B6（2026-10-25）：核心DDL归真实SQL owner，33声明/片段迁20文件，46+16次query参数与6838个非目标生产声明保持；37-owner启动组合、billing配置/账务服务装配分离及Canvas复制schema闭合。完整PG旧3/35→新3/36、实际Next22→24检查通过，26原公开函数首次DDL20→0，134表/1208列/255约束/241索引一致；21相邻脚本、全项目tsc/99文件lint通过。startup依赖16→3、静态可达215→132，新owner不入环，原20/12等环保持；角色协调与BI显式索引不混入普通Web。失败literal、绑定、回滚/patch与同步证据见 [R4B6记录](../changes/2026-10-25-persistence-startup-owners-r4b6.md) 及DELIVERY。本轮第3模块，收尾普通整合main后归零，整体继续R5/R6，不合main、不部署。

R4B5（2026-10-25）：发布读取删除动态管理bootstrap，缺表/缺current/历史版本不发现或重写；准备归Web启动/原setup写入/管理入口，首启空配置不提前发布。PG旧10/96→新10/99、实际Next旧23→新25检查，首次目录metadata GET2→0/结构与写入SQL37→0；14-owner及真实故障后原管理恢复、10项相邻、全项目tsc/11文件lint通过。发布读→lifecycle边1→0、新owner无环，原20/12环保留；副本回滚与远端证据见 [R4B5记录](../changes/2026-10-25-model-registry-startup-r4b5.md)。同步后第2模块，其余热路径初始化、Worker与最终完整验收继续，不合main、不部署。

R4B4（2026-10-25）：新增Next Node显式Web基础初始化，13-owner保留原SQL/事务，build/Edge/无DB/sidecar跳过；实际Next发现并修正跨bundle Pool/就绪分裂，按真实Pool/owner共享Promise。PG旧2/12→新7/53；Next实际登录/health/probe旧15→新19检查，build SQL=0、首登录DDL3→0、请求DDL15→0；Compose7→12检查，Worker等待Web/DB健康且不迁移。相邻、类型、副本回滚/补丁/远端证据见 [R4B4记录](../changes/2026-10-25-web-startup-r4b4.md)。不是完整产品/standalone build或全站DDL退出，模型首次发现、其它域ensure与R5/R6继续。同步后第1模块，不合main、不部署。

R4B3最新进展（2026-10-25）：实际执行与管理装配4条引用归零，原executor/prepare/发布/计费算法保持；冻结模型/凭据/计费/投影只读原版本。完整旧6/57→新6/71、实际HTTP缺token旧400→新200、冻结原6/current99、lease故障重试通过；相邻模型发布/执行、preparation45、读8/80、身份8/171、视频双入口16、账务/195登录与tsc/14文件lint通过。发现旧视频wire/public报价混用，完整旧基线复现后最小修正；旧MODEL_CHANGED断言按去确认协议更新，未恢复门槛。见 [R4B3记录](../changes/2026-10-25-execution-assembly-r4b3.md)。第3模块同步以DELIVERY为准；显式启动/其它热路径ensure、20/12环与R5/R6继续，不代表全站验收。

R4B2最新进展（2026-10-25）：原生模式、权限持久化、唯一创作scope和项目/媒体访问分别归属，HTTP适配保留同函数兼容出口。25声明和45生产消费者90绑定迁移，339原声明保持；身份/账务/创作7环拆开，HTTP context静态消费者47→21，新owner无环。完整旧8/168→新8/171、195实际登录、权限、钱包/赠额与creation writer、tsc/54文件lint通过；同旧新版均触发的fixture错误预期及TS问题修正留证，无生产逻辑变更。见 [R4B2记录](../changes/2026-10-25-identity-creation-boundaries-r4b2.md)。同步后第2模块；显式Web/Worker生命周期/其余热路径ensure、视频20/恢复12环、R5/R6继续。

日期：2026-10-24。关联：[主方案](../REFACTOR_ARCHITECTURE.md)、[源码证据](2026-10-24-current-state.md)。

R4B1 最新进展（2026-10-25）：已发布快照读侧不再组装管理runtime，纯目录/模拟及legacy目录分离，8动态/6静态模型环拆开，重型repository生产静态消费者14→1。完整冷模块PG原75/新80、真正只读事务、管理凭据缺失、current/历史/损坏pointer、首次初始化失败回滚重试与实际HTTP通过；preparation同SQL观察器原/新45，管理/发布/frozen-source与相邻账务、tsc/lint通过。详见 [R4B1](../changes/2026-10-25-model-read-boundary-r4b1.md)。同步后第1模块；冷库仍有first-use兼容initializer，显式Web/Worker生命周期及其它热路径DDL、身份7环和R5/R6继续，未记全站DDL归零。

R4A7 最新进展（2026-10-25）：旧db商业/管理数据owner收尾，37声明、35消费者/67绑定；db905→51行纯兼容、223原导出保持、生产静态消费者35→0，新owner无环，最大20环不变。完整旧/新PG6/138→6/164（26等价出口）与相邻账务/登录/任务/内容/持久化/platform、全项目tsc和本轮lint通过，接口只换真实owner import。详见 [R4A7](../changes/2026-10-25-commercial-admin-owners-r4a7.md)。本轮第3模块，main同步及归零见DELIVERY。R4B热路径DDL/默认bootstrap/读写组装、授权竞争/owner历史全量改绑与R5/R6仍未完成，不合main/不部署。

R4A6 最新进展：模板/缓存/导入、Agent/Genchat会话、项目、Comfy、竞品及历史流水/赠额实际数据owner迁移，db2361→905、静态消费者64→35，新owner无静态/动态环；最大20环不变。原表同事务Agent改键保留OID/索引/trigger且失败回滚；Genchat原owner写入与HTTP失败语义；竞品release-first消除max5/占4的吞超时。完整基线7/205→新版7/290（76兼容身份、214运行行为），Agent/钱包/entitlement/195登录/任务3/226/持久化6/78与29/90、tsc/lint通过。详见 [R4A6](../changes/2026-10-24-content-session-owners-r4a6.md)。这是同步后第2模块；Genchat客户端仍吞非2xx、剩余db商业/管理、R4B显式DDL/组装、R5/R6继续，整体目标未完成。

R4A5 最新进展：视频/Canvas图片持久任务与预占/成本审计职责已迁出，db3769→2361、静态消费者87→64，含db/video6动态环拆开。真实PG四条legacy终态路径在max5/占4时自等待已复现，现同事务读取计费与settings，原冻结报价不读current；baseline3/78、modified3/226通过，配置bootstrap同事务提交/回滚与unknown/单次扣款通过，相关现有入口/tsc/lint通过。旧video-reliability两边源码提取失败不记绿。见 [R4A5记录](../changes/2026-10-24-durable-task-owners-r4a5.md)。同步后第1模块；剩余模板/会话/管理、初始化/组装/协议/Worker及完整候选验收继续。

R4A4 最新进展：作品读写/管理与Canvas数据职责已迁移；三份30字段映射合一；BI上下文/调用观测/HTTP包装分离，真实managed-client WeakSet唯一。db4793→3769、静态消费者130→87；67动态大环已拆开，最大剩余20，旧19静态模型环拆开为transport/client3；所有新增owner不在SCC。完整旧/新观测21/141、PG108→176，以及Canvas20/14/32、私有媒体/BI/账务/creation/交付27/溯源/tsc/lint通过。见 [R4A4记录](../changes/2026-10-24-artwork-observation-owners-r4a4.md)。本轮第3模块，普通整合main后归零；下一轮继续遗留视频/任务/组装/DDL及整体候选验收，不合main/不发布。

R4A3 最新进展：账户访问事实、会话/注册、钱包余额、支付历史、历史 provider 记录迁入五个 owner，71 个调用文件/126 个绑定切换。db 5321→4793 行、静态消费者144→130并退出静态环；原24环余下报价/执行19，视频20仍在。含动态 import 最大环66→67，session随原runtime/storage链进入，仍需后续实际解环。基线/新版函数28/88、完整源码真实PG88→146（增加同函数兼容出口断言）、195实际登录handler、wallet/entitlements/platform29/creation、tsc/lint通过。详见 [R4A3记录](../changes/2026-10-24-account-owners-r4a3.md)。同步后第2模块；R4A剩余资产/任务/跨表用例、R4B运行DDL/配置组装、R5—R6继续，整体目标active，不合main/不发布。

## 1. 迁移总原则

每轮只完成一个闭合职责，采用“新实现取代旧实现”，不长期双套业务：

1. 固定已整合源码和行为对照。
2. 提取单一用例/数据owner，原入口接同一实现。
3. 集中跑该模块现有测试和最小新增反例。
4. 删被替代判断/旧副本；只留有调用者的协议兼容壳。
5. 留回退提交与冻结历史读取证明，再推进下一模块。

第一阶段不改表名、operation身份算法、公开URL或客户端协议；后续结构变动与业务降级策略分提交记录。不会要求用户再确认一次积分。

## 2. 分阶段工作包

| 阶段 | 可执行改动/主要文件 | 沿用与删除 | 集中验收与退出条件 | 回退 |
|---|---|---|---|---|
| R0 基线与协作 | 固定main及已完成功能提交；整合 `9fc2845`/quality/Canvas修复；登记实际调用方、旧任务格式 | 复用 benchmark runner/catalog，保留历史失败和PARTIAL | 质量回退、指定模型报价、原价receipt和取消正负例绑定整合SHA；未关闭历史case继续单列 | 仅撤本轮整合提交，不回退已明确保留的修复 |
| R1A 图片执行边界 | 从 `generate-image/route.ts` 抽出typed `execute-image-step`/提交与读取用例；generation-core/adapters直接调用 | 复用现有 paidOperation、任务repository、协议实现；删除内部HTTP/FormData再解析和用户cookie伪装 | 旧HTTP、新imagegen、Agent调用同一实现；owner/scope、显式取消、重复operation、unknown不重POST保持；2条生产lib→app归零 | 旧route adapter可恢复到原实现；无DB模式变更；已有任务仍由原ID恢复 |
| R1B 方案与价格一次准备 | 从 requests/plan/billing-model 的重复选择中确定唯一resolver；UI/Agent/workbench只消费Prepared计划 | 沿原quote/plan与冻结版本读；迁入已完质量/Canvas修复；删除重复current比较和重复参数决策 | 同输入各入口effective参数和报价语义一致；目录读取不靠可执行default；真实余额正负例；没有新增确认弹窗或隐性换价 | 在提交前恢复旧adapter映射；已保存计划不重算，不批量重写旧报价 |
| R2 原图交付与恢复 | 抽 `complete-image-delivery`，runJob和stored-delivery共用；统一receipt错误/质量提示投影 | 沿checkpoint、存储adapter、artwork API、settle原ID；删除双份处理/落库/异常映射 | 供应完成后写入失败、后处理失败、对象存储失败、父回执失败均可按已知checkpoint续交；无供应商重复生成/重复扣款；账务pending不冒充settled | 保留原始字节与历史字段；回退只恢复解释代码；不回灌媒体/DB |
| R3 Canvas分域 | 先图片生成controller；再document/history/persistence；最后renderer/interaction；复用video stores | 保留现有API、布局、selection、clipboard、history、账号缓存；删除主组件对应闭包，不另起mega-hook | 同账号/跨账号、项目切换、刷新、弱网、undo/redo、拖动、多任务和报价控件集中浏览器验收；无非本项目回写 | 按controller分批回退；存储键兼容，保留草稿与任务receipt |
| R4A 基础DB与数据owner | 从db拆纯Pool/Tx；按identity/billing/assets/canvas/agent迁query；跨表用窄Tx接口 | 保留锁顺序和事务；旧db暂re-export；删除重复SQL副本 | 平台DB不import业务；迁出domain消费者对db大出口引用归零；并发扣款/任务/历史写入事务一致 | 表结构先不变，re-export可撤；无数据迁移回滚 |
| R4B 配置与DDL | composition组装models+billing；snapshot reader和admin发布分离；ensure逐模块迁移 | 沿现有model版本、CAS、frozen sources；DDL搬迁顺序与旧库兼容 | 执行只读启动不进行DDL/bootstrap管理调用；新库/旧库升级通过；该批跨域SCC消失 | expand-only；旧代码兼容窗口内保留旧列；收缩另次发布 |
| R5 适配器与Worker | 拆wire注册/helpers环、endpoint环、素材授权环；runtime脱离scripts；任务用例在Worker内运行 | 沿已有媒体Worker、lease、receipt、同版本部署；旧tick作有期限adapter | 全profile wire对照一致；单条任务仅一个owner；镜像内imports完整；Web/Worker资源隔离有测量 | 暂停新scanner后恢复旧所有者；不并跑、不重放unknown |
| R6 外围整理 | 工作台资产源、enterprise纯合同、admin大面板；tests/scripts/docs按用途整理 | 有消费者的命令/服务保留；基于调用证据逐项退休旧代码 | 同模块变动只涉及约定owner/adapter；build inputs与CI触发一致；旧路径删除清单为零债务 | 目录移动与行为变更分提交；兼容CLI可恢复 |

**建议顺序：R0 → R1A → R1B → R2 → R3。** R4A中的纯Pool/Tx如果是R1的实际阻塞，可先做最小切片；不要求先迁走242个db调用者才改善用户创作。R5解小环可在对应模块工作时顺手完成；Worker迁执行是独立部署行为，不与UI拆分混一起上线。

## 3. 第一轮的明确范围

推荐第一个实施闭环为 **R1A：消除 imagegen 对 HTTP route 的反向调用**。

### 调用方登记

- `/api/generate-image`：旧FormData协议 adapter，外部URL暂保留。
- `/api/imagegen` 与 planner/dispatch：使用完整冻结计划。
- Agent共享图像工具及 `_category` 旧分支：逐工具登记，不假设全部走同一条。
- 原生参考工作台：保存计划和原operation；不新建执行器。
- Worker恢复、generate-image GET与imagegen GET：恢复同一旧任务，不能改operation算法。
- cutout：同样问题但可独立第二小片；不要为满足统计而仅忽略该import。

### 最小接口

`executeImageStep({ actor, operationId, frozenPlan, step, inputs })` 返回typed receipt，不返回需要内部调用者再解析的Response。鉴权HTTP解析留外面；授权后的素材身份仍由用例校验。保留既有server-only、scope和预占条件。

### 本轮必须删除

- generation-core内 `new Request('http://internal/...')` 的图片执行调用。
- 内部签cookie及计价headers的转译链（仅无其他调用者的部分）。
- 同一意图的重复FormData构造/解析。
- 遗留在route里的新旧两套执行函数副本；route只导入同一实现。

不直接删旧公开route，不改支付、不批量移动db，不增加抽象基类、事件总线或第三套workflow。

## 4. 测试资产复用与补例

不是每改一个函数就跑全套。阶段内以类型/局部静态检查辅助，模块闭合后一次集中回归；仅当失败需要定位时运行针对性用例。

| 类别 | 沿用资产/方向 | 验收事实 |
|---|---|---|
| 历史图片失败 | `scripts/verify-imagegen-history-benchmark.cjs` 与 `docs/benchmarks/imagegen-history-20261023.json` | 保留baseline复现、captured/执行/业务关闭分类；10/10且PARTIAL仍是PARTIAL |
| 定价减法 | `scripts/verify-pricing-friction-image.ts`、`scripts/verify-pricing-friction-agent.ts`、`scripts/verify-pricing-friction-workbench.ts` | 报价冻结/显式取消/current漂移、原operation、足额与不足额；按投影文件范围解释baseline |
| 新Canvas/quality修复 | 从已完成功能提交沿用对应verifier，不改回旧拦截预期 | supplierRouting单primary、catalog-default解耦、精确单价/总价、quality标签回退 |
| HTTP与客户端 | 现有scope/receipt、billing client、真实route fixture | 实际入口调用新用例，非只测试纯helper；unknown不自动POST；取消不生成不扣款 |
| 真实PG | 现有随机schema、wallet/job/quote/recovery fixture | 同任务一次consume、作用域不混、任务与账务一致、cleanup完成 |
| 视频 | 现有能力wire fixture、frozen source真实PG入口 | 完整旧profile不变；新字段/roles/来源不丢；不把image改造扩成video重写 |
| 浏览器 | Canvas已有fixture/Playwright：加载/编辑/保存/生成/刷新/恢复 | UI真实请求、操作号、回执、截图一致；弱网和切账号/项目不污染 |
| 性能 | 在固定机器/固定数据上建立对照，记录CPU/内存/事件循环/请求与供应耗时 | 以真实尾延迟和持续资源占用判断，不能从文件数推吞吐 |

最小故障矩阵：准备失败；真实余额不足；供应明确未受理；供应受理未知；供应已完成→checkpoint故障；对象写失败；作品写失败；结算未完成；客户端断线。每例都检查供应商提交数、原operation、字节/作品、用户提示和账务，不只检查HTTP状态。

## 5. 可量化退出标准

下面是建议的验收目标，不是已经达到的性能承诺。

| 维度 | 固定基线 | 阶段完成目标 |
|---|---|---|
| 生产业务lib→app反向调用 | 2条 | R1结束为0；2条release fixture不混算 |
| 模块运行依赖环 | 最大54；视频20 | 每个迁完边界SCC=0；旧图剩余按owner登记，不用改分组掩盖环 |
| 纯DB基础层业务import | 当前db混合 | R4A新Pool/Tx业务import=0 |
| 客户方案/报价 | 多入口载体，调用次数未测 | 每个新operation仅一个权威prepared合同；重复/恢复不重算价；prepare幂等命中率和读取次数可测 |
| 供应商/账务重复 | 本轮未运行 | 同op并发/恢复用例供应新submit不超过原冻结数量；consume每账务operation最多1笔 |
| HTTP route职责 | generate-image1269行 | 仅传输/鉴权/调用/呈现；150行作为复查提示，不是按行数强拆硬门禁 |
| Canvas复杂度 | 12422行、120依赖、137state/reducer调用 | 主Shell不再持有报价/任务执行/持久化算法；约600行作为组织目标，不设全仓绝对行数封禁 |
| 改动扩散 | 未测真实变更历史中位数 | 质量别名只改规则模块+测试；新增codec只改对应codec/注册和fixture，不改Canvas/wallet |
| UI响应 | 待同机对照 | 首轮约定fixture规模后测p95；建议同场景无超过10%回退，超差查原因，不套用线上SLO |
| 服务端额外延迟 | 待同机对照 | 比较排除供应耗时的准备/入队p95、PG查询和峰值RSS；建议无超过10%回退；低噪声重复样本后判断 |
| 数据与旧任务 | 既有schema/冻结格式 | 老quote、已受理任务、原结果续交兼容；字段扩展可读；供应POST=0的本地恢复可证 |

不把“10万活跃用户”换算成单个并发数字。容量模型和运行SLO仍在 `docs/PRODUCT_READINESS_100K.md` 维护，本方案只改善测量与隔离条件。

## 6. CI和依赖检查：渐进，不新增用户护栏

- 迁移初期用现有TS/ESLint加一个只读边界脚本即可；不引入Nx/Turborepo迁移。
- 新模块禁止业务→app、browser→server、跨模块深层import；旧债务列表固定到具体边和owner，新增违规才阻断。
- 依赖检查计入类型擦除后图，并区分fixture和运行代码；动态/HTTP/SQL边另登记。
- 路径触发覆盖实际build inputs：`services/reference-workbench/static`、enterprise共享合同、引用的design资源等。
- 将相应模块verifier并入同SHA的候选验证链；已有PG/账务/浏览器CI保留。required checks需仓库设置真实核对，本轮未操作。
- 一个模块验收完成后不保留同名旧/新两个“生产默认”实现；适配壳登记调用方、owner和删除条件。

## 7. 回退与上线分开

此工作树不持发布锁、不启动候选或重试发布。代码提交/推送不是上线。实际部署方式和窗口由当次发布负责人按最新明确授权执行，不与其他线程抢锁。

应用回退依赖兼容任务/quote/schema和原字节，不依赖恢复旧DB。迁移时先扩展、验证读写、后收缩；每一步保留原输入、来源、operation与账务ID。切Worker所有者按现有lease/排空交接，不通过更换operation启动新收费请求。

## 8. 可复用实施任务模板

```text
目标：只实施 REFACTOR_MIGRATION.md 中的阶段 <Rxx>，一个闭合职责。
基线：<完整SHA>；已保留功能提交：<SHA列表>。
读取：REFACTOR_ARCHITECTURE、证据Axx、模块文档、实际AGENTS。
旧调用方：<route / Agent / workbench / worker / tests>。
新owner与公共API：<模块、函数、DTO、Tx边界>。
必须保持：owner/workspace、完整冻结方案与原价、原operation/回执、
          显式取消、真实余额、单次结算、unknown不重放、原字节可恢复。
交付：业务实现 + 调用方切换 + 删除旧副本清单 + 模块文档。
验证：先固定baseline；完整模块后集中跑既有受影响suite与最小故障反例；
      输出同SHA命令、literal、exit、未执行项和独立副本回退。
不做：新增用户确认/限额、全站搬迁、新事件总线、另建benchmark、发布现场操作。
```

## 9. 历史时点进度（当前状态以上方逐轮记录为准）

R4A2：schema/settings/signup实现迁出db，43调用文件/102绑定切到owner；旧/新门面同函数，DDL SQL不变。db5928→5321行，旧db消费者178→144，最大静态SCC56→24、动态70→66仍待处理。真实6类PG61→78及旧数据保留、池压力同事务修正、core lock/wallet/creation/Canvas32/model publication、tsc/lint通过。同步后第1模块，见 [R4A2](../changes/2026-10-24-persistence-owners-r4a2.md)。业务数据owner和运行DDL退出仍未整体完成。

R4A1：纯Pool/Tx基础层落地，旧db/getPool与billing Tx兼容别名均为同一实现；79纯import＋3混合字段迁移。旧db静态消费者251→178，最大静态SCC60→56，平台层无业务import/依赖环；535个保留函数正文不变。原27/157→新28/166、PG25→29、钱包/创作A/B、画布PG32/32、tsc/lint通过。第3模块按最终SYNC刷新普通整合main后归零；R4A数据owner尚未完成，见 [R4A1](../changes/2026-10-24-platform-db-r4a1.md)。

R3E：三处实际创作栏收敛为 image/text 两个组件，模型/比例/质量/数量控件复用，menu/resize不再混进文档任务。Canvas9342→8534行，174个保留函数正文不变；58组SSR完全一致，真实控件15项（含三尺寸）、文字6/图片5/历史12、最终tsc通过。同步后第2模块。下一步R4A连接/事务边界；R3上传/助手/外围UI与CAS、R4B—R6继续，见 [R3E记录](../changes/2026-10-24-canvas-composers-r3e.md)。

R3D：普通文字、反推、帮写的 request/task/controller 已接实际 Canvas；原答案续存、原 operation/报价和 scoped 文档写入归同一 owner。Canvas 9575→9342 行；基线 3/15、新版 18/77、PG24、实际 Next6、最终 tsc 通过，原有 BillingProvider 防重机制保留。同步后第1模块；旧无 node-slot intent 升级兼容、任务跨刷新 journal、多 tab/CAS、UI 组合与 R4—R6 继续，见 [R3D记录](../changes/2026-10-24-canvas-text-tasks-r3d.md)。

R3C3：复制/历史添加/选择和项目删除由node-operations负责，既有history事务/reducer承接持久回执；selection-run controller管理批执行生命周期。Canvas9800→9575行，171个非目标函数AST正文不变；基线4/9、新版19/59、PG24→32、真实控件11与相邻12＋12＋5＋5通过。第三模块main同步后计数归零。R3剩余文字内容任务及UI组合，R4—R6、跨请求/多tab文档竞态与完整build/容量仍在后续；见 [R3C3记录](../changes/2026-10-24-canvas-node-operations-r3c3.md)。

R3C2：单一选择快照、gesture owner、link compiler 已真实接线。图片/文字/视频移动与连线复用原 history；`canvas-add` primary 归属、显式 parentIds 和环检测由同一规则负责。主组件10300→9800行，基线10/28→新版34/92，真实PG26→28、相邻PG20；真实Next交互12、文字历史12、详情5、图片5通过。下一步收拢创建/复制删除/批处理，R3尚未整体完成；R4—R6与完整候选验收继续。详见 [R3C2记录](../changes/2026-10-24-canvas-interactions-r3c2.md)。本轮为main同步后第2模块。

2026-10-24实施更新：R0已普通整合 `9fc2845`，重构基线固定为 `4478cdca`。R1A拆成生图R1A1与抠图R1A2：生图及抠图typed提交/执行切片均已实现，原HTTP与内部调用共用同一用例，cutout桥已删除。详细修改、A/B和已知旧测试差异见 [R1A1记录](../changes/2026-10-24-image-generation-boundary-r1a.md)。

- [x] 独立worktree与任务分支。
- [x] 固定源码目录/AST依赖盘点及核心链路定向阅读。
- [x] 模块边界、数据所有者、迁移与验收设计。
- [x] R0整合已完成质量/Canvas修复并建立运行对照。
- [x] R1A1生图typed执行、旧HTTP兼容、原指纹/回执/账务行为对照。
- [x] R1A2抠图typed执行、共享同步账务、任务read用例；原抠图HTTP桥删除；见 [R1A2记录](../changes/2026-10-24-cutout-billing-boundary-r1a2.md)。
- [x] R1B核心图片准备与报价：typed quotation、单model snapshot、共享quality、保存并消费preparedImage；见 [R1B记录](../changes/2026-10-24-image-preparation-r1b.md)。
- [x] R2正常生成与原结果恢复共用本地交付；真实结算/partial回执、原字节与阶段兼容；见 [R2记录](../changes/2026-10-24-image-delivery-r2.md)。
- [x] R3A已有图片/空白与文字生图共用 typed request/scope/task controller；两份轮询/定位/receipt逻辑删除，见 [R3A记录](../changes/2026-10-24-canvas-image-task-r3a.md)。
- [x] R3B1 原子文档编辑/历史持久化：22 类动作单编译器、4 个提交点收敛、原请求重试、分域历史及提交/同步分离，见 [R3B1记录](../changes/2026-10-24-canvas-history-r3b1.md)。
- [x] R3B2 文字文档/草稿/保存队列 owner、历史串行边界、域隔离恢复，见 [R3B2记录](../changes/2026-10-24-canvas-text-document-r3b2.md)。
- [x] R3B3 作品文档/读取/合并/回收站 owner，显式读取错误、保留本地修改与按ID原结果同步，见 [R3B3记录](../changes/2026-10-24-canvas-artwork-document-r3b3.md)。
- [x] R3B4 详情与同步编辑任务、原请求/报价/回执与共用结果 attachment，见 [R3B4记录](../changes/2026-10-24-canvas-task-boundaries-r3b4.md)。
- [x] R3C1 场景投影、独立renderer与Flow状态同步，见 [R3C1记录](../changes/2026-10-24-canvas-scene-r3c1.md)。
- [x] R3C2 选择/连线/拖动命令，见 [R3C2记录](../changes/2026-10-24-canvas-interactions-r3c2.md)。
- [x] R3C3 节点生命周期和批运行，见 [R3C3记录](../changes/2026-10-24-canvas-node-operations-r3c3.md)。
- [x] R3D 文字生成/反推/帮写任务，见 [R3D记录](../changes/2026-10-24-canvas-text-tasks-r3d.md)。
- [x] R3E 图片/空白/文字创作栏与共享参数控件，见 [R3E记录](../changes/2026-10-24-canvas-composers-r3e.md)。
- [x] R4A1 纯Pool/Tx与真实基础能力消费者，见 [R4A1记录](../changes/2026-10-24-platform-db-r4a1.md)。
- [x] R4A2 schema兼容初始化、settings与signup owner，见 [R4A2记录](../changes/2026-10-24-persistence-owners-r4a2.md)。
- [ ] R4A后续身份/钱包/资产/任务数据owner、剩余混合db消费者及跨领域事务接口。
- [ ] R3 剩余上传/助手/外围 UI 组合；文字/图片跨请求 CAS、未知历史响应交错及旧 client intent 升级兼容验收。
- [ ] R4—R6业务实现、集中验证、旧路径删除与最终整合。
- [ ] 迁移后的实际性能、容量与生产功能验收。

功能迭代累计3（R1A1、R1A2、R1B）；完成R1B后刷新/整合origin/main并归零，精确结果在本轮VERIFICATION。后续每完成模块更新此表，不靠会话上下文判断。

R1A2复扫：生产lib→app反向边0（另外2条release fixture import保留）；最大静态SCC55、视频20仍未消除。真实PG 49检查及原回执/账务/SSE通过，旧Canvas Agent脚本在完整基线和新版同样失败，不标全项目通过。下一模块R1B。

R1B更新：真实PG baseline29/modified45检查；一笔新报价 model read 2→1、synthetic Request 1→0，发布中途不混价，显式模型不继承外层scope价格。新版SCC60、video20、动态恢复10仍待R4/R2。下一模块R2。

R2更新：shared completeImageDelivery 已替代两套逐图处理/存储/作品/结算，generation-output.ts已删除；full-tree baseline64/modified73对照关闭错误完成/结算口径，原raw checkpoint保留。旧verify-imagegen-receipts的batch planning在基线/新版均exit1，列入最终候选债务；不把主verifier通过扩大为全suite通过。R2是同步后的第1个功能模块。下一模块R3。

R3A更新：Canvas主组件12422→12130行；新request/scope/controller为70/20/94行，46场景176检查及真实Next控件5项通过。原表单字段/文件字节与顺序46组一致；原10条hooks warning仍保留。第2次功能模块；下一R3B，非整个R3完成。

R3B1更新：Canvas 12130→11936行，历史协议提交4→1，22类动作/44个正反方向wire与文档对照一致；baseline64场景134检查、modified67场景184检查。真实PG20检查、真实Next控件7项通过；后置视频刷新失败保留撤销、auth/flush ABA不提交、原operation重试不先受当前节点拦截。第3个功能模块收尾已fetch/普通merge origin/main `905c8c635e41ff3f4443d43db9776d1db3aab469`，返回Already up to date，exit0；计数归零，下一轮从1开始。R3B2/R3C未完成。

R3B2更新：文字文档状态、缓存、保存/恢复队列已迁入独立 owner；Canvas 11936→11872行。baseline10/22、modified21/58、真实PG16、真实控件12通过；历史67/184及图片任务46/176保持。完整旧text-image verifier缺原pinned快照（基线/新版均setup exit1）保留为债务；多tab CAS及未知历史响应叠加写入未声称关闭。同步后第1个功能模块；整体目标继续。

R3B3更新：作品state/初读/刷新/局部补取/回收站迁入owner，Canvas 11872→11747行；baseline14/23、modified26/49、真实PG14、Next控件8、真实缓存20检查通过。局部读失败不整表回退，晚到读取不覆盖本地编辑/复活删除，同workspace仍共享已有缓存。同步后第2模块；下一R3B4，整体重构继续。

R3B4更新：Canvas 11747→11576 行；详情与抠图/扩图/标注拥有 typed request/task；三类结果落地共用定位/文档同步/undo。baseline74/172、modified74/369、PG21、真实Next5＋普通生图5通过。显式原operation优先于同内容缓存；未知提交原回执重读不是新生成。旧billing-client SSR fixture缺workspace exports在基线/新版均setup失败继续记债务。同步后第3模块；普通整合origin/main后归零，下一R3C，不标整体完成。

R3B4 三模块同步已执行：`git fetch origin main` 与 `git merge --no-edit origin/main` 均 exit 0，origin/main=`905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`；累计计数归零。本轮没有把候选合入 main。

R3C1更新：Canvas 11576→10300行；183个保留函数AST正文未变，节点/投影/交互状态分责。基线27/74、新版30/98；32个SSR HTML相同，17组场景保持＋1组隐藏任务busy修正；400节点单改1对象替换400→1（非线上性能结论）。真实Canvas6、文字历史12、详情编辑5、普通生图5通过。同步后第1模块，下一R3C2，整体目标active。

收尾再次fetch发现origin/main已推进到`b15d4761b938428c449531e2d8744401a38a2ec7`（原结果父回执与postaccept原因修复）。当前已完成并验证的普通整合来源固定`73384aaa`；新增提交另列下一轮待整合，不冒充已包含，不开启发布。

R5J更新：已普通整合固定b15d4761到真实owner；完整源码active/notification父回执24检查、GET14、primitive29、后台39、LinuxWorker71/Next20通过，SCC仍0。完整基线4390hash与副本恢复以本轮DELIVERY为准；同步计数0，下一模块Canvas外围UI/CAS和R6，不合main、不部署。见 [R5J](../changes/2026-10-26-parent-receipt-integration-r5j.md)。

R5K：工作区页面导航/7lazy页面/QR生命周期已迁独立UI owner，Canvas8319行、171函数保持、完整旧44/新59及15快照相同，实际Next6+15+5通过；SCC0、原8lint warning保留。副本回滚/提交见DELIVERY，计数1，跨请求CAS/助手上传和R6继续。见 [记录](../changes/2026-10-26-canvas-workspace-pages-r5k.md)。

R5L：三类导入唯一owner、原ID只读同步/队列归属/冻结头和大图预览共用，Canvas8080行/167函数保持；旧40/新63、transport17/SSR18、真实NextPG5和大图10、相邻15+5通过。跨刷新intent未做、多tabCAS/助手和R6继续。四产物/回滚/Git见DELIVERY；计数2，下一模块后main普通同步。见 [R5L](../changes/2026-10-26-canvas-image-imports-r5l.md)。

R5L收尾补正：错误去重仅匹配saved batch的原project，旧项目待同步不隐藏新项目读取错误；15类63检查含实际Canvas条件的跨项目反例。生产修改仅新增batch.project及条件匹配，未重跑相邻浏览器；完整本轮产物刷新到后续修正提交。

## R6Q 请求与工作流 owner

Canvas 请求翻译归 `canvas/creation-request`；Comfy 共享合同、同步图片应用和原回执归 `comfyui`，视频复用既有 BYOC 持久任务；Canvas 控制器只处理原意图及结果 attachment。页面不再定义请求/计价规则或工作流执行循环。新表/任务引擎/计费引擎均 0；整体目标继续，参见 [R6Q](../changes/2026-10-27-canvas-request-workflow-r6q.md)。

R6Q 集中封版：core44/44、runtime125、真实产品36通过；静态/全import/emitted SCC均0。原协议10调用不变、已存在部分产物链接复用，查询与提交分开；UNKNOWN只能查原回执，明确未受理结束旧意图可改参。整体后续Canvas视频提交/批次等应用边界继续，最终四产物及回滚见DELIVERY。

## R6R：媒体 publication 与恢复 ownership

主线媒体lane归 shared worker/scan，原variant/mirror SQL与CAS分别归 media-assets 的两个应用owner，bytes runtime组装独立镜像验证；媒体与download共用serveMedia，不再穿透Route。保留真实后台活动、人工drain和原回执；required core52项。参见 [R6R](../changes/2026-10-27-worker-media-integration-r6r.md)。

R6R 封版来源 `216220bd`：shared scan／媒体 background lane、bytes本地镜像组件、variant／mirror CAS与共用media/download应用owner已整合。core52/52、同镜像runtime125、实际产品36、tsc/lint和SCC全0通过。人工drain／UNKNOWN／原冻结价和原任务恢复保持，tick入口哈希未变，storage兼容面5行、media Route6行；new tables/task/billing owners=0。四产物、独立副本恢复及远端一致见本轮 DELIVERY；下一切片先勘察Canvas视频编排，不把本模块通过扩大为整个重构交付。

## R6S：导演共享文档 owner 与视频提交应用边界

固定 main `2fb3e8d9` 的导演能力接入原 renderer registry／scene projection、history contract/controller、node lifecycle、selection/link/project 和 persistence startup；不复制旧 Canvas/db 单体。`video/canvas-submission` 编排保存、原任务查询、单任务／批次分流及刷新，`canvas-draft` 共享编辑合同，现有文档／账务／任务状态 owner 不迁移。工程内容身份归 `director/project`，解决真实 JSONB 键序导致保存后仍 dirty，不放松实际内容与数组顺序比较。

候选 `231d6930` 完整 core57/57、实际导演 Next/PG/WebGL、独占端口管理GUI、完整 Linux 同镜像 runtime125／产品浏览器36、tsc／lint和四类SCC0通过；原db字节保持，额外表／平行任务／平行账务引擎0。原树4671文件、补丁／副本回滚与最终远端／清理见本片DELIVERY。Canvas仍5626行；本片闭合不等于R3—R6或全项目完成，后续继续实际UI／助手编排与最终整合。详见[R6S模块记录](../changes/2026-10-27-canvas-native-integration-r6s.md)。
## 2026-10-28 R6T：管理入口状态与展示分责

固定main `00a27d6a` 浅色管理台整合到既有真实业务页面；`use-admin-entry` 单独拥有入口本地／云读取、可选缓存及密码响应生命周期，页面仅展示／跳转。账号／ready／mount身份约束异步continuation，旧读可取消、已发送密码POST不取消不重放；服务端授权规则、领域数据和原钱包任务系统不改。254→115行，1421领域/API/服务及113Canvas原hash保持、新schema/task/billing owner0。固定 `f7b86c24` core59/59全部新执行、正式完整Linux同镜像runtime125／产品36／后台真实GUI78、tsc/lint、四类SCC0通过；三条已知fixture/UI反向边继续单列。完整4696hash副本回滚／最终远端／清理以DELIVERY为准，历史失败保留，不将该片当整体完成。剩余Canvas／助手编排、整体性能容量和最终整合继续；不合main、不部署。见[R6T记录](../changes/2026-10-28-admin-entry-ownership-r6t.md)。

## R6U：角色能力接入现有数据与交互owner

角色DDL归canvas/storage-schema并加入显式应用启动；角色渲染/项目投影/历史合同与编译/节点生命周期/混合事务沿原owner，db兼容面不新增实现。video/input-choice纯叶合同消除展示选择与角色预览的type-only循环，旧类型导出保持；新增角色操作不新建任务/计费引擎或确认。固定主线3f3ac34c，完整集中验收进行中，最终证据见本轮DELIVERY；整体active、不合main不部署。见[R6U](../changes/2026-10-28-character-owner-integration-r6u.md)。

R6U固定验收 `511ade12`：core63/63全部新执行、角色共享owner39/规则38/实际Next+PG+Worker+私有媒体+账务和原生浏览器完整交互、同Linux镜像125/36通过，tsc/lint及四类SCC0。主线两张角色表归原schema/startup，db原字节与1874其它产品hash保持；4707hash副本回滚/最终Git/清理以DELIVERY为准。原14/27/27/49阶段失败不拼接最终通过。Canvas仍5687行与5个角色adapter及助手/外围编排待收敛，性能/容量和整体退出审计未由本片替代；整体active，不合main不部署。

2026-10-28 R6V：固定 main `ac71259a` 的场景/状态/显式导演背景与线性Data URL修复已接入现有scene/history/node/project/startup和object-storage owner；12处冲突不恢复Canvas/db/storage旧单体。共享owner51、场景规则39、真实组件与Next/PG/Worker/私有媒体/账务/Chromium完整应用通过（模拟供应商5/真实付费0），角色/导演及原history67/184保持。固定 `2ad57f69` core69/69（同源29复用+40新执行）、完整Linux同镜像runtime125/产品双browser36、tsc/lint和四类SCC0通过；1880原产品文件及db/storage兼容面hash保持，Canvas5687→5752，150原函数不变/13明确改绑/0删除，沿主线两张场景表不另起任务或计费体系。旧decoder41检查中14负例差异原exit1保留，新版41通过；本机旧大图正例通过，不冒称复现线上栈溢出。完整4731hash副本回滚/四产物/远端与cleanup以本轮DELIVERY为准。整体active，不合main不部署；继续Canvas剩余UI组装与完整目标退出审计（复用既有assistant-session）。见[R6V记录](../changes/2026-10-28-scene-owner-integration-r6v.md)。

2026-10-28 R6W：固定main `cfb6f800` 的原位重生成/图片历史版本/输入像素快照接入既有task/request/delivery/history/artwork/creation/startup owner；8处冲突不恢复旧巨石，4兼容入口字节保持、版本表原SQL精确保留、平行任务/计费引擎0。原位等待/失败保留原图，部分与迟到结果只入历史；显式三视图仍派生，版本切换沿共享undo/redo，UNKNOWN原任务重提0。真实owner9组/PG16/真实入口管线通过；固定 `85f164a8` core73/73、完整Linux同镜像runtime125/产品双browser37、tsc/lint和四类SCC0通过。修正原位合同对已有大DataURL的4096字符拒绝，6600022字符真实双schema通过；旧独立重做入口和无调用应用分支退休。4758原hash副本回滚、四产物、远端与自有资源cleanup以本轮DELIVERY为准。Canvas5755行仍待按真实职责收敛；整体active，不合main不部署。见[R6W记录](../changes/2026-10-28-image-version-owner-integration-r6w.md)。

## 2026-10-28 R7A：模板与工作流导入生命周期

模板链路从 CanvasClient 移交 `canvas/template-imports`，服务端 JSON 插入归 `canvas/artwork-import`，React 只绑定现有 document/history/navigation 端口。原 op 与 node-copy receipt 是创建/恢复身份；已知 ID 只读、未知先读 receipt，同 op 输入冲突和已撤销不复活。整批 workflow 的像素准备归独立 media owner，**网络/解码/上传不占数据库事务**；publication 重新检查 owner/scope/目标/胜出 receipt 并一次提交，输家只清自己的随机 key。旧 facade 只供已有实际调用者迁移，未另建任务、账务或 undo 系统。

固定 `b3dc22e7` 的 43 个受影响入口全部实际运行通过（新 PG63、新客户端14组50、旧PG31/旧客户端2组5、原history67/184、node PG32、浏览器组件17等），完整 tsc/lint通过，四类 SCC0。catalog94→96 是注册证据，不是远端 enforcement；本轮没有新完整镜像和完整产品浏览器验收，沿用 R6Z 的验收仅作历史，不为 R7A 代验。媒体状态写失败仍 OPEN。此切片四产物和副本回滚以 R7A DELIVERY 为准，整体重构目标仍 ACTIVE。下一步优先完成原生 kind 生命周期统一传播与 workflow fill/manifest 读取的原 owner 边界，而非开启下一轮纯主线追赶。


## 2026-10-29 R7D：生成活动与容量主线接入

普通整合 main `c63ceb13` 的 9 提交，3 处冲突按现有 owner 处理：平台池、图片持久任务运行时与统一 worker scan，不恢复旧单体。Canvas 五条生成路径的 busy/retry/retain/finally 归小型 `generation-activity`；原任务、报价、交付、文档和账务系统保持。旧同步准备失败遗留 3 个 busy key，新版实际入口不再遗留；集中验证与最终固定源见 [R7D模块记录](../changes/2026-10-29-refactor-r7d-generation-activity.md)。整体 ACTIVE，未合main未部署，47 HOLD；剩余 Canvas 视图/回调、性能/INP/容量、有效远端 required CI 与最终整合退出继续，历史 MEDIA_STATE_WRITE_FAILED 根因仍 OPEN_NOT_REPRODUCED。

R7D最终：应用18a15ab0、完整镜像/产品37PASS，集中回归同SHA汇总102PASS+1OPEN（scene应用ECONNRESET及seed媒体状态写失败，非103全绿），其余46项新执行、不重跑已过56。旧/新真实生成活动37/115→38/134、X1/X2/X3PG通过；tsc/lint37warnings、四SCC0。媒体状态原根因OPEN，实际24次native探测未复现；远端main未保护/required端点403证据保留。整体ACTIVE，不合main不部署；四产物与副本回滚/Git/清理以R7D DELIVERY为准。


## 2026-10-29 R7E：媒体状态所有权与图像优化主线

普通整合main e1878018的8提交；媒体快照/原子写/退休回执归独立state-store，先持久化再受理、终态写入沿原job lock与确认清理同步，原错误与脱敏errno并存。实际Worker旧4/24→新4/34；主线Sharp像素41/409及线性解析HTTP66通过，未知/付费任务不重放。最终固定镜像/场景/回滚/Git证据见[R7E记录](../changes/2026-10-29-refactor-r7e-media-state.md)；MEDIA_STATE_WRITE_FAILED历史根因仍OPEN，整体ACTIVE，未合main未部署。

R7E封版：固定4980c018，实际Worker旧4组24→新4组34、原生同镜像HTTP40/产品双browser37、受影响18入口18PASS/0失败/0未运行，scene完整应用本轮exit0。历史原生errno未捕获仍OPEN；本轮未重跑完整core104/runtime177，不跨SHA拼绿。四产物/4943原hash副本回滚/远端/清理见DELIVERY；整体ACTIVE继续剩余Canvas状态/回调职责、性能/INP/容量、有效远端CI及最终main整合。


## 2026-10-29 R7F：Canvas生成展示状态归属

生成task card、失败卡、busy/占位坐标尺寸归generation-presentation，按既有account/workspace/project scope.key隔离；异步调用捕获原binding，React只订阅当前view。原task/报价/回执/history/账务owner不改。完整基线6/39复现foreign task/busy/layout→新版8/46均0；原图片47/179、详情/编辑74/369、activity38/134、request/workflow39/88与scene/interaction/placement/progress通过。当前完整Next三个控件命令7+5+12通过，真实供应商0；未把分层fixture扩为生产/完整core105验收。Canvas5778→5734，2035其它产品hash保持；最终tsc/lint/SCC、四产物/副本回滚和远端见[R7F模块记录](../changes/2026-10-29-refactor-r7f-generation-presentation.md)及DELIVERY。整体ACTIVE，继续pending/edit占位恢复归属、性能/INP/容量、有效远端CI与最终整合；不合main、不部署。历史媒体原生errno仍OPEN。


## R7G：主线修复归属整合（2026-10-29）

固定main3b6a5279的12提交按既有owner整合，11处冲突未恢复旧storage/durable-job/Canvas/scan单体。X5结果codec/storage、视频持久保存队列与六kind文档、HTTP v2 nonacceptance与direct Worker分别保留职责；修正旧ACK丢失后新隐式revision与自身冲突，显式revision不改。新owner旧3/8→新4/11、真实six-hook68/106、six-kind HTTP/PG6/146、视频PG23/caller8、Worker41+真实协议18、原结果native一次-6及边界11/healthPG4通过，最终固定矩阵/类型/SCC/四产物与回滚见[R7G记录](../changes/2026-10-29-refactor-r7g-owner-integration.md)。整体ACTIVE，不合main不部署；pending/edit占位/恢复尚未迁移，继续此边界与性能/容量、远端CI和最终退出。


## 2026-10-29 R7H：占位与原编辑恢复展示

从Canvas全局pendNodes/useState和editTaskStateRef收敛到按既有document scope.key隔离的pending-presentation，records是唯一节点数据，保留集合仅持ID；hook只订阅当前view，旧binding更新原scope。原任务/报价/attachment/history/账务不改。初次旧React7组28检查复现跨scope同ID覆盖，新React8组36检查纠正，并实际cutout/detail续接零额外生成/报价。全片最终固定回归/类型/SCC与四产物/副本回滚/远端以[R7H记录](../changes/2026-10-29-refactor-r7h-pending-presentation.md)和DELIVERY为准；整体ACTIVE，未合main未部署。


## 2026-10-29 R7I：次级生成应用编排

Canvas编辑/详情/Comfy的任务、attachment、retained billing及timer组合归edit-run/detail-run/workflow-runs，原controller/request/receipt/history/billing保持；Context仅连接既有view/document/geometry/I/O，不另建框架。完整基线50/168与新50/172入口轨迹相同，三个组件函数私有factory8→0、timer2→0；最终类型/SCC/固定矩阵与真实控件、完整副本回滚及Git见[R7I记录](../changes/2026-10-29-refactor-r7i-generation-applications.md)及DELIVERY。整体ACTIVE；本片完成为R7G同步后第2模块，不合main不部署。


## 2026-10-30 R7U：整理布局用例边界

布局投影和flush→原history事务/单步undo→延迟Fit编排归 `canvas/arrange`，Canvas只连接既有文档/Flow/view-controls端口。smartLayout与八类节点规则不变；Fit绑定原scope及导航revision，后来的缩放/拖动/整理退休旧Fit。没有新HTTP写入、任务或账务owner。基线5184文件已保存，16共同轨迹精确对齐；最终集中/原生/回滚以[R7U记录](../changes/2026-10-30-refactor-r7u-arrange-application.md)和DELIVERY为准。整体ACTIVE，未合main未部署；最新main6提交已记录，R7S同步后第2模块，下一模块后统一整合。分支持续超过48小时：保留独立重构候选按用户整体交付要求推进，最终main退出仍未完成；不把独立分支push称整版交付。


## 2026-10-30 R7V：视频任务跟随归属及第三模块同步

Canvas视频GET/占位/结果initialize与merge/积分刷新/定时跟随归 `canvas/video-task-follow`，按现有document scope隔离、React只管订阅生命周期，不另建任务或结算。cancelled终态收起原占位，未知状态保留；readOnly/账号/workspace/project退休后无新副作用。原/新21→22检查、14共同轨迹相同（受控HTTP/auth/React effect端口，非生产）。第三模块后普通整合main bbc8f784的6提交，2冲突保留workspace cache与新存储owner/通知可见性，模块计数归零。集中core156与完整Next/PG及四产物见[R7V记录](../changes/2026-10-30-refactor-r7v-video-follow.md)和DELIVERY；整体ACTIVE、未合main未部署。**独立整体候选分支超过48小时仍未合主线：用户要求整体重构版本，最终main整合验收仍未达到，不以模块push代替退出。**


## 2026-10-30 R7W：账务展示依赖减法

Billing客户端删除仅用于已获准隐藏的分辨率信息提示的Toast组件依赖，不增通知总线、不改RootLayout顺序；原报价、原operation、余额/UNKNOWN及回执owner保持。实际React DOM读取原provider顺序，原8→新9检查、6共同轨迹精确一致，billing→components边1→0。完整5200文件基线与原生child observer诊断已保存，同盘依赖原timeline通过不等于历史退出根因已闭合；集中验收/完整副本回滚及Git以[R7W记录](../changes/2026-10-30-refactor-r7w-billing-presentation.md)与DELIVERY为准。同步后第1模块，整体ACTIVE、未合main未部署，47 HOLD。

R7W固定应用4b8fc715：相关11项同source/digest实际PASS（首轮专项PG变量遗漏保留，续跑7项subset为PARTIAL/exit2）；目录报价22组、工具scope20项、完整类型/lint37warnings与四SCC0。完整5202源码同盘依赖的timeline/scene/character三项原生应用当前均通过，原R7V失败与历史退出根因OPEN不改；真实付费0。产品只改billing client，其余2099原hash保持，运行时lib→UI边0、1条既有type-only边保留。全157未重跑、Linux media gate未绕过。四产物／5200原hash副本回滚／later-edit guard与远端以DELIVERY为准；整体ACTIVE、同步后1/3、未合main未部署。


## 2026-10-30 R7X：选择状态与交互归属（整体 ACTIVE）

Canvas 选择快照、节点/边/Flow/右键/group/clear/IDs/toggle 及复制等待投影归 selection-controller，React hook 绑定已有 CanvasDocumentScope。项目/账号/workspace ABA 的旧选择与迟到 setter 反例已复现；显式导航保留目标焦点，不新建文档、任务、账务或网络写入。模块同步后第2片，集中验收及完整副本回滚以 R7X DELIVERY 为准；历史原生退出原因和最终整版验收继续，未合main未部署，47 HOLD。


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
