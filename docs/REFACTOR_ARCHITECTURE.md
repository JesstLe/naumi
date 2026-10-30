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

# Naumi 重构方案：模块化单体，收敛执行路径

## 2026-10-30 最新：R7V 视频任务跟随检查点（整体ACTIVE）

视频恢复编排归canvas/video-task-follow；第三模块后普通整合main bbc8f784六提交，两冲突保留scope缓存隔离和新存储/提示语义。固定c496e36d的156原条目已覆盖，153有通过证据、时间线/场景/角色三项Windows完整原生门禁OPEN，**不是完整core PASS**。新完整Linux镜像及同镜像真实双browser37/PG/Worker/180秒通过；独立Next视频恢复8检查通过。type/lint37warnings与4类SCC0。原full-core门槛未降低，新的Linux runtime177未运行；四产物/回滚/版本以R7V DELIVERY为准。未合main未部署，47 HOLD；后续先闭合三个原生门禁，再继续剩余职责/性能容量与最终整合。历史阶段数据保留原SHA。


## 2026-10-30 当前：R7T 浮动层布局归属

原页面131行测量/锚点最小pan/live跟随归useCanvasOverlayLayout，纯几何归原dock-layout；同ID文档替换重绑observer，旧callback不污染新dock。固定b58df21a原31共同轨迹EXACT、19项受影响入口全部通过（PARTIAL/exit2）、实际Next9检查+5响应式视口通过；2095应用文件逐hash绑定，类型/lint37warnings、四SCC0。新完整Linux/全151未跑，上一轮完整结果不改标。完整包/回滚/远端见R7T DELIVERY，整体ACTIVE、未合main未部署、47 HOLD。见[R7T记录](changes/2026-10-30-refactor-r7t-overlay-ownership.md)。

### R7S最终本地验收

固定应用/验证4c4f8e29完整core150/150（零日志复用）、同固定完整Linux镜像runtime177/原生媒体52/产品双browser37通过；scene/character/director原生门禁通过。视口旧7组竞争复现→新15通过，主题全Next97检查/0违例。最终归档只补已执行browser可访问名断言及文档，应用字节不变；完整四产物/回滚/远端见R7S DELIVERY。整体ACTIVE，继续剩余Canvas职责/远端CI/性能容量和最终main普通整合，未部署，47 HOLD。

## 2026-10-30 当前：R7S 视口与外观 owner

接入main1754的17提交，主题迁入既有节点/控件；定位视口从页面迁入窄hook，与手动Fit/zoom/pan共用navigation归属。原scene在完整c433副本已实际通过；独立时序反例原7组复现、新15组通过。最终core150/完整产物/远端见本片DELIVERY，不以局部代整体。**整体ACTIVE，未合main未部署，47 HOLD。** 见[R7S记录](changes/2026-10-30-refactor-r7s-viewport-appearance.md)。下方旧阶段统计保留其时间。

## 2026-10-30 当前：R7R 主线行为 owner 整合

固定接入 main `d4dcea3a`（26提交），将fanout/多文件导入/文本反馈/自动画幅/共享限流/Worker停止及抠图回执行为迁入既有owner，不恢复旧大页面。原生Next20检查、主要图片57共同轨迹、真实PG关键链已通过；同固定SHA受影响51项聚合、四产物和副本回滚以本片DELIVERY为准。完整core143/最终Linux/scene门禁和整版验收仍未全部闭合。**整体ACTIVE，长分支超过48小时待普通整合main；当前未合main未部署，47 HOLD。** 详见[R7R模块记录](changes/2026-10-30-refactor-r7r-main-owner-integration.md)。以下旧阶段统计保留其原证据时间，不代表当前版本。


日期：2026-10-24（固定基线设计）；2026-10-27状态：**整体迁移实施中，已推进R6L项目目录/命名会话；最新固定应用core32、完整Linux同镜像运行125、产品双浏览器9组及实际Next-PG项目控件11通过，完整重构版本尚未完成。**

R6D—R6L已进一步统一作品兼容writer、工作台环境资产、管理设置/模型/供应商资料owner、测试生命周期及依赖字节边界；Canvas主组件7132→6524行，原项目聚合规则保留并关闭命名竞态。最近普通整合main固定`8e412abe`（merge`6ef35a8a`），incoming诊断接实际执行owner；emitted静态/全导入SCC仍0。单模块、同镜像运行及本地浏览器证据不替代最终整体交付/容量/生产验收；冷Windows dev首次加载SyntaxError根因仍未证明。详见[R6L记录](changes/2026-10-27-canvas-project-catalog-r6l.md)。

实施状态以 [迁移台账](architecture/REFACTOR_MIGRATION.md) 和 [工作区记录](REFACTOR_WORKSPACE.md) 的各模块证据为准。已推进共享准备/交付、画布文档与交互、持久化owner/显式启动、独立Worker和视频/媒体执行归属；R5G执行装配和R5H功能模型规则已拆除对应循环依赖。下文统计与问题描述仍绑定最初固定扫描基线，不用最新行数覆盖历史证据。截至R5P，文字/图片主编辑链的多tab合并与canonical回执已接入，emitted静态/全literal导入环均0；剩余外围UI、旧兼容writer和R6完整候选/性能/CI/最终整合继续，未合main、未部署。

R6C实际完整产品浏览器发现并修正公开目录到管理组装依赖：config/models/text-models只读消费者改接已发布快照，价格投影与管理端共用，运行边4→0。固定应用core22、同镜像两browser9组/原生HTTP/PG/Worker交付、180秒混合读取通过，见[R6C记录](changes/2026-10-27-refactor-product-browser-r6c.md)；这不关闭旧writer、外围UI、长时混合生成负载、依赖漏洞或历史真实案例。

## 1. 结论先行

**需要重构，但不推倒重写，也不先拆微服务。** 本项目的主要结构问题不是文件多、技术栈旧，而是同一业务决策分散在 UI、HTTP wrapper、planner、计费和 provider adapter 内；基础设施又反向引用业务，导致一个变动有多个修改入口。

本次选择：保留 Next.js / React / TypeScript / PostgreSQL、现有产品入口和数据，演进成**模块化单体 + 同版本独立 Worker**。先把“准备方案 → 冻结报价 → 提交执行 → 原结果交付 → 结算回执”收敛为同一套应用用例，再逐步拆画布和数据访问。

重构收益用三件事判断：

1. 调整一种参数规则，只改它的决策模块，各入口得到相同执行计划和价格。
2. 接入一个供应商，只改对应适配器与明确的能力资料，不修改画布、钱包或任务恢复。
3. 修复一种交付失败，正常交付和恢复交付同时受益，不再各补一个 catch。

不以新增层数、目录数、接口数或每文件行数变少作为完成标准。

## 2. 本轮实际查看了什么

- 工作树：`E:/Workspace/naumi-refactor-20261024`。
- 分支：`codex/core-refactor-20261024`。
- 固定扫描 HEAD：`8b00cb35ddf318ec81d6c7e604d4d11956d50ffc`；产品源码等同起点 `905c8c635e41ff3f4443d43db9776d1db3aab469`，两者只差工作区说明。
- 全部 Git tracked 文件做目录盘点；TS/JS 文件做 AST 导入/导出及字面动态导入扫描。**这不是逐行人工审阅全部文件。** 核心创作、画布、账务、模型、视频、Worker、服务构建和 CI 做了定向源码核对。
- 未加载应用、运行产品测试、连接数据库或供应商，未构建或操作服务器。本轮数字描述源码结构，不描述当前线上状态或十万用户容量。
- `9fc284514aeaed740cdf55cc49b611445676b517`（包含 `0fbdd5a823c58755177412ef4a8a443fb3a03389`）已用本地 Git 对象核对：含质量回退、supplierRouting 计费识别、Canvas 单价/总价及 catalog 解耦改动。**这些不在固定扫描基线中；实施前应整合，不重做也不回退。** 未据此声称它们已上线。

详细证据：[现状审计](architecture/2026-10-24-current-state.md)。实施次序：[迁移与验收](architecture/REFACTOR_MIGRATION.md)。固定统计：[基线 JSON](architecture/2026-10-24-baseline.json)。

| 固定基线指标 | 结果 | 正确解读 |
|---|---:|---|
| tracked 文件 | 4,005 | 包含文档、脚本、设计资源，不等于业务规模 |
| `src` TS/JS 代码文件 | 1,226 | 不含 `.d.ts`、JSON/CSS 等 |
| `src` 物理行 | 148,411 | 含空行/注释，不是有效语句数量 |
| API route 文件 | 271 | 应各自成为适配入口，不集中成一个万能路由 |
| `canvas-client.tsx` | 12,422 行、120 个直接内部依赖 | 文件内有 137 个 state/reducer hook 调用、62 个 effect/layout-effect 调用；不是同时运行次数 |
| `db.ts` | 5,978 行、242 个直接消费者 | 钱包、用户、作品、画布、会话、配置等混在一个出口 |
| 静态导入强连通分量 | 54、20、2、2、2 个文件 | TS 擦除后的扫描也保留这些环；不等于已发生初始化故障 |
| `scripts` / `verify:*` | 1,247 文件 / 85 命令 | 已有大量验证资产，但用途和运行入口需整理 |

## 3. 为什么会“牵一发而动全身”

### 3.1 新生成链路仍把旧 HTTP route 当执行核心

`src/lib/imagegen/generation-core.ts:12-16,40-57` 组装 cookie、HTTP headers、FormData，再 import `app/api/generate-image/route` 调 POST；抠图适配也反向调用 cutout route。旧 route 同时解析 HTTP、选通道、处理图片、存储作品、维护任务和结算。

**正确方向是“所有入口调用应用用例”，不是“业务核心模拟用户请求调用入口”。**

### 3.2 文件已经拆小，职责仍相互依赖

`model-config` 有 80 个代码文件，`imagegen` 有 53 个代码文件。账务、模型、配置、DB、身份等仍组成 54 文件静态环。`model-config/server.ts` 组装账务运行时；`billing/server.ts` 又调用模型执行与配置能力。仅增加 `service.ts / manager.ts / utils.ts` 会延续问题。

### 3.3 画布拥有过多变化理由

画布主文件同时拥有 React Flow 渲染、选择/快捷键、项目缓存、保存、撤销、素材、图片/视频/文字生成、Agent 对话、计价和恢复。改“报价显示”会触及一个同时管理节点拖动和任务回执的文件。

### 3.4 数据出口没有按业务所有权组织

`db.ts` 不只是连接池，它还 import 账务和创作业务、执行 DDL、导出大量业务操作。调用者跨领域读写表，拆接口也难确定事务边界。

### 3.5 后台任务与运行代码的物理位置不清

Worker 的一条主要扫描链通过 HTTP 调 Web 内的 `/api/video/worker/tick`，由 Web 顺序执行多类恢复；部分媒体工作已有独立 Worker。生产媒体实现又位于 `scripts/video-fusion` 并被 `src` import、被 Docker COPY。**有独立 Worker 容器，不代表所有重型任务已离开 Web。**

## 4. 目标结构：按业务归属，不按技术名词堆层

以下是迁移目标，不要求一次创建所有空目录。未迁移文件保持原路径，旧入口在本模块迁移完成后删除。

```text
src/
  app/                         # Next 页面、HTTP、鉴权与响应适配
  server/
    composition.ts             # 唯一组装入口：配置、连接、实现注入
  worker/
    main.ts                    # 同镜像任务执行入口，复用应用用例
  modules/
    image-generation/          # 图片准备、提交、执行、交付、恢复
    video/                     # 视频提交、轮询、制作链；独立领域
    models/                    # 模型目录、能力解析、选择策略、版本发布
    providers/                 # 供应商协议/transport/通道适配
    billing/                   # 售价、冻结账务条款、钱包、预占、结算
    assets/                    # 媒体字节、作品身份、归属、存储与读取
    canvas/                    # 文档、编辑命令、保存、历史、交互和 UI
    agent/                     # 会话、工具适配、用户停止；调用创作用例
    reference-workbench/       # 原生参考工作台 UI 和操作编排
    identity/                  # 身份、账号/工作空间访问与权限事实
    commerce/                  # 订单、支付、充值；通过账务 API 入账
    enterprise/                # 企业业务和现有外部 workflow 连接
    ...                        # BI、模板、3D 等按实际迁移保留独立归属
  platform/
    db/                        # Pool、Tx、迁移工具；零业务 import
    http/                      # 通用有界 IO、超时等机械实现
    observability/             # 日志/追踪写入，不决定业务成败
  components/ui/               # 真正跨业务的基础视觉组件

migrations/                    # 按版本执行的数据库迁移；分批迁出 ensureSchema
tests/                         # 按模块与跨入口合同组织；逐步迁入既有 verifier
scripts/                       # CLI、构建与运维壳，不承载被 src import 的业务实现
services/                      # 已有独立服务，分别核实职责和部署，不批量删除
docs/                          # 架构决策、模块记录、持续迁移台账
```

模块仅在需要时细分，图片模块示例：

```text
image-generation/
  contracts.ts                 # 可安全序列化的请求、公开计划、结果 DTO
  browser.ts                   # 浏览器 API 客户端与原 operation 回执恢复
  server.ts                    # 服务端公共用例导出；不导出 repository
  application/
    prepare-image.ts           # 解析一次意图，选方案，冻结完整计划和价格
    submit-image.ts            # 原回执优先，受理/任务创建
    execute-image-step.ts      # 一次已冻结步骤的执行，不重新报价
    complete-image-delivery.ts # 正常与恢复共用的本地交付 continuation
    read-image-operation.ts    # 只读任务与交付/账务事实的公开投影
  domain/                      # 纯意图、参数、结果规则
  repository.ts                # 本模块任务/检查点数据访问
  adapters/                    # 对外端口的具体连接；按需求出现
```

不为每个函数创建 interface/class/factory。已有 `createModelRepository`、`createModelRuntime`、账务 Tx 和存储 adapter 继续使用。仅外部 IO、可替换供应商、跨模块依赖需要明确端口。

## 5. 依赖方向与公共 API

```text
浏览器 UI → 模块 browser API → HTTP adapter
Agent / 工作台 server caller ───────────────┐
HTTP adapter / Worker runner ──────────────┼→ 应用用例 → 领域规则
                                         │       ↓ 显式窄端口
composition 组装 repositories/adapters ────┘   DB / 存储 / provider
```

规则：

1. UI 只 import `contracts`、`browser`、纯前端模型；不通过大 `index.ts` 混入 server/PG/凭据。
2. app route 负责来源、身份、schema、调用和返回；应用层不 import route，不伪造 cookie。
3. 跨模块只使用明确公共 API；模块内部文件默认私有。不要从同一模块的 barrel 反向导入自己。
4. 领域规则是纯数据函数；provider codec 编码已经确定的计划，不再次决定客户价格或 silently 替换意图。
5. `platform/db` 只知道连接/事务，不知道用户、钱包、作品、租户或模型。
6. 组装在 `composition`；`billing` 不反向构建 `image-generation`，`models` 不反向初始化 billing server。
7. AsyncLocalStorage 可保留用于边界兼容和日志；**计划、报价、operation、输入归属以明确参数传递**，核心用例不从多个隐式上下文猜值。

### 谁决定什么

| 决策 | 唯一归属 | 其他模块怎么使用 |
|---|---|---|
| 用户是谁、在哪个 workspace、可操作什么输入 | identity / assets 的授权 API | HTTP/Agent 解出可信上下文；用例检查本次输入；不信任 body owner |
| 字段别名、默认档、请求参数修正 | 图片/视频准备用例中的纯规则 | UI 只提供选择；旧 HTTP 入口翻译旧格式 |
| 模型与可用通道、参数映射 | models resolver + providers 编码契约 | billing 读取计价事实，不用一个 primary upstream 代表整个候选家族 |
| 售价、预占、实际结算 | billing | 收到确定的有效方案；不自行路由供应商 |
| 原 operation 身份、提交次数、续跑 | image-generation / video 各自用例 | 各入口返回同一个 receipt；恢复不重新购买 |
| 原图、处理后产物、作品归属 | assets + 调用方交付用例 | 存储 adapter 不改变任务和账务状态 |
| 页面选择、拖动、菜单和视口 | canvas/browser | 不决定客户价或供应商能力 |

## 6. 定价和参数：从多层拦截变成一次准备

用户列出的 C1—C39 是定位线索，不直接作为固定基线的已确认缺陷清单：行号和行为已随修复变化。结构整改按下面的单一链路执行。

```text
请求意图 + 当前授权输入
  → 规范化 requested 参数
  → 选择可执行方案，得到 effective 参数和调整说明
  → 按 effective 方案报价
  → 保存同一份完整冻结 plan/quote
  → 提交原 plan，执行，不再沿途拿 current 逐层比较
```

### 6.1 把不同问题分开

- **兼容字段、默认参数、可等价替代档位**：在准备阶段集中自动处理并记录 requested/effective/reason。把 `standard` 等标签映射问题修在一处，不再多次弹积分确认。
- **模型/通道选择**：先把输入要求与候选通道匹配，最终报价对应真实有效方案；报价目录不依赖一个默认模型恰好可执行。
- **新请求的 current 漂移**：服务端完成选择和报价；已有原计划/已受理 operation 使用原计划与原价，不因重构重新定价。
- **原结果已产生的规格偏差**：保留产物并给明确质量提示；交付状态、处理完成和计费事实分别表达。复用已有 output advisory，不将“有原图”误写为“透明/蒙版全部达标”。
- **完整素材、蒙版、透明意图等语义**：换有能力的通道或已有本地处理路径。截掉参考图、丢掉 mask、把透明任务标作不透明成功是产品行为改变，单独定义验收，不藏在目录搬迁里。
- **真实余额、归属、同 operation 防重放**：在唯一权威点执行，不复制到每个 UI 层，也不转成用户反复核对。
- **未配价或供应通道不可用**：记录明确配置/供应阶段错误及请求号，按已有可报价方案处理；不伪装成用户积分不足，也不把未知价当 0。

本次重构不新增业务配额、用户二次确认或运营审核，不引入通用 Policy Engine。参数修正是几个明确的纯函数，audit 是沿现有 operation 记录的一次结构化事实。

### 6.2 报价契约要合并语义，不是一次合并所有历史表

目前 imagegen、通用 image quote、工作台 plan、Agent prepared plan 各有载体。先统一服务端准备结果和引用方式，保留旧 quote ID/operation/fingerprint 的兼容读取；不要立刻批量改写历史记录。

建议接口形状（设计示意，尚未实施；类型名以既有定义收敛）：

```ts
// 只有服务端准备用例可创建 PreparedImage；浏览器只接收 publicPlan + quoteId。
type PreparedImage = {
  operationId: string;
  scope: AuthorizedCreationScope;
  fingerprint: string;
  plan: FrozenImagePlan;        // 完整 steps、sources、执行与处理参数
  quote: FrozenBillingQuote;   // 既有完整客户计价条款
  adjustments: ParameterAdjustment[];
};

prepareImage(command: ImageCommand, actor: ActorContext): Promise<PreparedImage>;
submitImage(input: { operationId: string; quoteId: string }, actor: ActorContext): Promise<ImageReceipt>;
resumeImage(operationId: string, context: RecoveryContext): Promise<ImageReceipt>;
readImage(operationId: string, actor: ActorContext): Promise<ImageReceipt>;
```

服务器内部调用也需要可信身份/输入授权，typed API 不是绕过权限的后门。显式取消与省略确认字段保持不同；原回执优先不等于允许撤销已完成账务。

## 7. 生成、交付、账务：各有一个事实来源

保留 `DurableImageJobs`、paid operation checkpoint、PG lease、现有钱包事务与唯一扣款身份，不创建第二套任务平台。

- **执行事实**：是否派发、供应商是否明确接受、结果是否未知、原始结果是否已保存。
- **交付事实**：后处理是否完成、对象是否可读、作品是否持久化、父子回执是否可查询。
- **账务事实**：reserved / settled / released / reconciliation，不用“settle 函数返回了”代替真实 settled。

公开 receipt 从这些事实投影，不新增一个独立总状态表造成双写。早期保留既有 JSON/status 名称，先统一映射函数。

正常路径和原结果恢复都调用 `completeImageDelivery(checkpoint, frozenPlan, originalOperation)`。它处理已有字节、处理步骤、存储、作品、回执和原账务结算；**不持有供应商 submit 能力**。execute 只有在派发前状态允许时调用 provider；unknown 状态继续原任务查询。

跨 PG 表的任务/账务/作品动作按现有 Tx 原子性和固定锁顺序组织。对象存储与 PG 不是一个事务：保留既有幂等对象键、检查点和补传/续交，以可重复完成的本地阶段收敛，不声称一笔 SQL 事务可以覆盖外部网络。

## 8. Canvas：分清文档、任务与临时交互

```text
canvas/browser/
  document/        # 节点/边/分组与不可变 command；纯 reducer/selector
  history/         # 撤销重做和现有原子历史请求
  persistence/     # 加载、保存队列、草稿、版本冲突、账号/项目切换
  generation/      # 准备、提交、回执订阅、占位节点投影
  interaction/     # 选择、拖动、键盘、粘贴、视口
  ui/              # CanvasShell、节点 renderer、Dock、弹层
```

- **文档状态**：统一节点/边/分组的变更命令和持久化入口，复用已有 history/节点 repository，不另造事件溯源系统。
- **服务器任务状态**：以原 operation/receipt 为准，独立于 UI 组件生命周期。网络失败不会清空画布；切项目后旧请求不回写新项目。
- **临时 UI 状态**：菜单、hover、视口等就近保存；不把 137 个 hooks 搬进一个 `useCanvasEverything`，不强行做一个全局 mega-store。
- **渲染**：React Flow 是文档的视图投影，不再被同时当作数据库、撤销栈和任务状态源。
- **图片/文字/视频**：共用选择/放置/保存命令的基础设施，但保持各自编辑器和任务 DTO，不抽象成一个全字段可选的万能节点。
- **第一刀**：先从 `privateFetch + runGen + receipt recovery` 提取图片生成 controller；再拆持久化/历史；最后拆节点渲染与交互。先提取闭合职责，不先改样式。
- **状态技术**：优先 React reducer/现有 store 与 selector。只有实际渲染剖析显示订阅问题，再决定额外状态库；本轮不引入 Redux/Zustand 迁移工程。

## 9. 数据访问：按数据所有者拆，不破坏事务

| 数据 | 目标唯一写入口 | 迁移说明 |
|---|---|---|
| 用户、会话、账号状态 | identity repository | 钱包不再通过大 db.ts 顺带加载身份业务 |
| 积分批次、账本、预占、结算 | billing repository/service | 保留 wallet lock、唯一 ledger/operation、原价与到期顺序 |
| `app_image_jobs` | image-generation job repository | `kind` 兼容 suite/aplus；跨模块状态更新通过同 Tx API |
| 视频任务、阶段 | video repository | 保留既有 frozen capability/sources、版本和 recovery |
| 媒体元数据、作品基础行 | assets repository | 字节存储与作品数据分层，不复制业务媒体 |
| 画布文字/视频节点、历史/布局 | canvas repository | 旧 `app_artworks` 里的位置/分组列暂由 assets 的窄 Tx API 写；不让两个模块任意 SQL 更新同一行 |
| 已发布模型/能力版本、凭据 | models repository + credential store | 当前快照和历史冻结快照明确分开；凭据不进入 browser 合同 |
| Agent 会话 | agent repository | 工具不直写钱包或作品表 |
| 企业创作关联 | enterprise / creation association API | 与任务创建共用 Tx；不在底层 pool 中 import 企业业务 |

第一步从 db.ts 提出无业务依赖的 Pool/Tx；随后按模块迁走 query。旧 db.ts 暂时 re-export 已迁 API，由外到内逐步去除调用。**不是换名后永远保留 db.ts 大门面。**

DDL 从 `ensureSchema` 逐个迁到发布前、带版本记录的迁移。先验证已有实例升级和新库初始化，采用扩展→迁移→收缩；重构前期不改表名、不拆库，不把所有 ensure 一次删除。

## 10. 模型、协议、Worker 和独立服务

### 模型控制面与执行面

- 控制面负责编辑、验证、发布模型与价格资料。
- 执行面读取已发布/指定版本快照及凭据引用；正常读取不重新 bootstrap 管理运行时。
- 由 composition 把快照读取、报价和路由连接起来，解除 models ↔ billing 的组装环。
- 管理员显式配置和 vendor 资料的来源等级继续保存，不在重新 resolve 时变成统一来源。

### 视频协议的小环要具体拆

`wire.ts → protocols/index.ts → codecs → wire.ts` 的 20 文件环来自注册和 helpers 同文件。拆成 `wire-contracts.ts`、纯 `wire-helpers.ts`、codec 和显式注册装配；helpers 不 import registry。不是给每个 codec 增一层 service。

`wire-adapter ↔ workflow-upload` 把 endpoint 计算移到纯 helper；`canvas/video-node-service ↔ video/assets` 用窄项目授权 API 或调用方注入授权函数解除回调环。

### Worker

先共享真正的任务用例，再让 Worker 在自己的进程直接运行需要隔离的任务。现有 tick HTTP 入口作为过渡兼容入口；保持原 lease、同源码版本、恢复与排空语义。不要同时启用新旧两套扫描器去拥有同一任务。

媒体引擎从 `scripts/video-fusion` 迁到明确 runtime/adapter 目录，CLI 只调用实现；同时修改 Docker tracing/COPY，集中做镜像内入口测试。媒体 Worker 已存在的部分保留，不重造。

### `services` 逐项处理

- `reference-workbench`：现有 HTML/JS 被 prebuild 复制并改写后进入主 Web，另有历史 Python 服务。先明确 UI 资产唯一来源，去掉对字符串替换的隐式依赖；未核实外部部署前不删 Python 服务。
- `pricing-service`：独立价格评审工具，限定的主应用/构建入口搜索未发现直接引用；不把它误判为生产钱包计价服务。登记后保留，删除另核实使用者。
- `enterprise-workflow`：已有独立服务/BFF，维持现有数据与部署边界。只把 BFF 从服务 `routing-store.ts` 等实现文件的 import 改为共享纯合同入口；不借本轮创作重构重写企业业务。
- `design`：部分企业页面是实际构建/渲染输入，不按名字当纯草稿删掉。

## 11. 验收与实施原则

完整阶段计划见 [迁移台账](architecture/REFACTOR_MIGRATION.md)。核心验收：

1. 图片业务层→Next route 反向 import：2 条目标归零，fixture 调用另记。
2. 已迁模块无新增跨模块私有 import；其边界无运行导入环。全仓旧环按 owner 逐批消除，不一次设全仓失败门禁。
3. 一次生成只冻结一次客户方案/报价；重复提交、断线恢复、后处理失败续交不新增供应商生成和重复扣款。
4. 相同有效输入从 Canvas / Agent / 工作台 / 旧入口得到相同计划/价格语义；入口场景元数据保留。
5. 标准质量修复、Canvas supplierRouting/精确价格修复在合并后的固定 SHA 上保留；历史 benchmark 的 PARTIAL/未执行条目如实保留。
6. 正常交付和恢复交付共用同一实现，失败阶段、原任务号和产物在客户端一致显示。
7. 性能在同机器、同数据、同构建下比较；结构统计不能替代容量实测。

## 12. 本轮不做的工程

不做全站重写、全仓重命名、强推微服务、引入 Kafka/通用事件总线/CQRS/工作流 DSL/通用策略引擎、全项目 DI 容器、重做权限和钱包、重建一套 benchmark。新抽象只在两个真实调用者共享同一语义时出现。

本轮产物是可执行的重构设计及证据，不是产品修复上线凭据。后续逐模块记录：旧实现→新 owner→迁移调用方→删除旧路径→集中验收→独立回退；阶段未完成时不继续堆叠平行路径。


## 13. R1A执行进度（2026-10-24续）

R1A1生图、R1A2抠图/同步账务和任务读取均已切换真实调用，生产lib反向调用app route从2条变0；HTTP仍保留为公开协议adapter。R1A2复用既有claimCreation修复并发唯一键503，保留原回执及一次结算；未增加审批/报价确认。

详见 [R1A2模块记录](changes/2026-10-24-cutout-billing-boundary-r1a2.md)。R1B参数/报价准备、R2统一交付、R3 Canvas、R4 DB/配置等继续推进。最大静态SCC现55（原54，拆分导致文件数增加）、视频20仍在，不能把route瘦身视为全仓解耦或容量达标。完整版本尚未交付、未合main、未部署。


## 14. R1B准备与报价（2026-10-24续）

typed quotation 移除伪Request；model identity/price共用一份snapshot；shared quality覆盖HTTP与三个planner入口；新steps保存私有preparedImage，执行不重选默认参数。原报价、老plan与原回执保持。实际PG的发布中途混价与scope覆盖问题已用A/B对照关闭，见 [R1B记录](changes/2026-10-24-image-preparation-r1b.md)。

R1B结构职责已迁移，跨域SCC仍60，后续R4负责DB和配置的运行依赖剥离。接下来R2统一正常/恢复交付；最终完整候选、UI/性能验收仍未完成。

## 15. R2交付与恢复（2026-10-24续）

正常与恢复入口实际调用completeImageDelivery，删除generation-output以及两套逐图/作品/结算逻辑；media-postprocess阶段原ID复用，旧JSONB顺序兼容，保留paid checkpoint。交付partial与实际billing settled分开，原回执/字节/单次扣款保持。见 [R2记录](changes/2026-10-24-image-delivery-r2.md)。R3 Canvas开始前保留旧batch fixture的基线/新版共同失败债务，不声称整体候选或容量验收完成。

## 16. R3A Canvas图片任务（2026-10-24续）

runGen/generatePend共用typed输入准备、捕获scope和本地controller。主组件移除两套submit/poll/place/receipt，dock和placeholder均恢复同一任务；正常UI未重写。Canvas仍12130行，document/history/persistence、详情/同步编辑任务、renderer/interaction尚待R3B/R3C，不能以本切片宣称Canvas已完全分域。实际对照和浏览器结果见 [R3A记录](changes/2026-10-24-canvas-image-task-r3a.md)。


## 2026-10-30 R7U：整理布局用例边界

布局投影和flush→原history事务/单步undo→延迟Fit编排归 `canvas/arrange`，Canvas只连接既有文档/Flow/view-controls端口。smartLayout与八类节点规则不变；Fit绑定原scope及导航revision，后来的缩放/拖动/整理退休旧Fit。没有新HTTP写入、任务或账务owner。基线5184文件已保存，16共同轨迹精确对齐；最终集中/原生/回滚以[R7U记录](changes/2026-10-30-refactor-r7u-arrange-application.md)和DELIVERY为准。整体ACTIVE，未合main未部署；最新main6提交已记录，R7S同步后第2模块，下一模块后统一整合。分支持续超过48小时：保留独立重构候选按用户整体交付要求推进，最终main退出仍未完成；不把独立分支push称整版交付。


## 2026-10-30 R7V：视频任务跟随归属及第三模块同步

Canvas视频GET/占位/结果initialize与merge/积分刷新/定时跟随归 `canvas/video-task-follow`，按现有document scope隔离、React只管订阅生命周期，不另建任务或结算。cancelled终态收起原占位，未知状态保留；readOnly/账号/workspace/project退休后无新副作用。原/新21→22检查、14共同轨迹相同（受控HTTP/auth/React effect端口，非生产）。第三模块后普通整合main bbc8f784的6提交，2冲突保留workspace cache与新存储owner/通知可见性，模块计数归零。集中core156与完整Next/PG及四产物见[R7V记录](changes/2026-10-30-refactor-r7v-video-follow.md)和DELIVERY；整体ACTIVE、未合main未部署。**独立整体候选分支超过48小时仍未合主线：用户要求整体重构版本，最终main整合验收仍未达到，不以模块push代替退出。**


## 2026-10-30 R7W：账务展示依赖减法

Billing客户端删除仅用于已获准隐藏的分辨率信息提示的Toast组件依赖，不增通知总线、不改RootLayout顺序；原报价、原operation、余额/UNKNOWN及回执owner保持。实际React DOM读取原provider顺序，原8→新9检查、6共同轨迹精确一致，billing→components边1→0。完整5200文件基线与原生child observer诊断已保存，同盘依赖原timeline通过不等于历史退出根因已闭合；集中验收/完整副本回滚及Git以[R7W记录](changes/2026-10-30-refactor-r7w-billing-presentation.md)与DELIVERY为准。同步后第1模块，整体ACTIVE、未合main未部署，47 HOLD。

R7W固定应用4b8fc715：相关11项同source/digest实际PASS（首轮专项PG变量遗漏保留，续跑7项subset为PARTIAL/exit2）；目录报价22组、工具scope20项、完整类型/lint37warnings与四SCC0。完整5202源码同盘依赖的timeline/scene/character三项原生应用当前均通过，原R7V失败与历史退出根因OPEN不改；真实付费0。产品只改billing client，其余2099原hash保持，运行时lib→UI边0、1条既有type-only边保留。全157未重跑、Linux media gate未绕过。四产物／5200原hash副本回滚／later-edit guard与远端以DELIVERY为准；整体ACTIVE、同步后1/3、未合main未部署。


## 2026-10-30 R7X：选择状态与交互归属（整体 ACTIVE）

Canvas 选择快照、节点/边/Flow/右键/group/clear/IDs/toggle 及复制等待投影归 selection-controller，React hook 绑定已有 CanvasDocumentScope。项目/账号/workspace ABA 的旧选择与迟到 setter 反例已复现；显式导航保留目标焦点，不新建文档、任务、账务或网络写入。模块同步后第2片，集中验收及完整副本回滚以 R7X DELIVERY 为准；历史原生退出原因和最终整版验收继续，未合main未部署，47 HOLD。
