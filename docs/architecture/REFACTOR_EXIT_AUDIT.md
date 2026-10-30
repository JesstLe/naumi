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

# 整体重构退出审计（R8D 当前候选）

本页按原 R0–R6 与量化退出要求核对，而非把已完成切片重新定义为全部目标。固定应用源码以最新 R8D DELIVERY 为准；R8B167/177与R8C34/54仍只归历史源，原始验收要求见 REFACTOR_MIGRATION.md 第 2/4/5/6 节；历史切片的日志只证明对应 SHA，不给最新源码代验。

| 原要求 | 当前归属 / 权威证据入口 | 当前判定及还需什么 |
|---|---|---|
| R0 已有质量/Canvas定价修复不倒退 | 原整合历史 + `image-price`/`canvas-image-task`/参数与prepare真实回归 | R8B历史固定167/50；R8D只完成受影响8、实际媒体/性能链，不当当前全170通过 |
| R1A typed图片/抠图用例，各HTTP/Agent/workbench入口共用 | `imagegen/execute-image-step`、准备/同步计费/route adapter；AST运行图 | 结构已实施；R8B历史167+177+50；当前R8D只作受影响8与媒体/性能验收，最终整版main验收仍待 |
| R1B 同operation单一prepared与原冻结价 | `imagegen/preparation`、quote/dispatch与3套pricing回归 | 原价/明确取消/不足余额/UNKNOWN必须仍通过，配置缓存不跨Pool |
| R2 生成与原结果续交共享交付 | shared delivery/checkpoint/settlement，delivery/resilience/parent cases | 历史供应商403与原始两笔丢失窗口不因fixture PASS自动关闭；项目历史case单独保留 |
| R3 Canvas文档/任务/渲染/交互分责 | document/history、image/task/text/selection/navigation/editing等owner；实际双browser | 已有主链分责；拼接完整链已迁真实owner，页面仍4564行并有下载等组合，尚非最终Shell组织形态；不按行数强拆纯事件adapter |
| R4A Pool/Tx无业务依赖，数据owner有唯一写入 | `platform/db`，db兼容面；SCC与依赖扫描、PG事务矩阵 | 纯平台结构已落地；兼容出口只为真实脚本调用保留，不算平行writer |
| R4B 无业务请求新建schema或管理bootstrap | Web显式persistence/startup，各schema owner与published read；R8B冷PG/跨bundle | 本轮补限流与dedicated site；必须保留角色限定及失败重试；不能外推所有进程/历史规模升级均完成 |
| R5 同版本独立Worker、单任务owner、协议/排空 | 固定完整Dockerfile/Worker manifest/shared scan，runtime与native媒体gate | 应用结构已实施；完整同镜像运行验收与混合资源对照是不同层级 |
| R6 外围管理/工作台/测试资产与旧路径退出 | admin owner、workbench单源、core catalogue/runner；源码边界 | 历史成熟切片保留；需继续剩余Canvas组合与真实兼容caller退出审计，不以新增文件数当结论 |
| 生产lib→app反向调用为0；SCC为0 | `scripts/architecture/analyze.cjs`，静态/运行/emitted图 | 两条release fixture反向边单列，不当生产依赖；最终固定源重新扫描 |
| 用户业务参数改动局部传播 | 此轮限流消费/DDL SQL/计费initialize AST保持；修改8个既有产品文件+1新schema owner | 当前是一个后端生命周期切片；后续质量别名/codec变更仍应在相应owner与调用adapter收敛 |
| 同机UI/server p95、RSS、事件循环与INP对照 | 复用现有benchmark-ui-performance、benchmark-imagegen-pipeline、Canvas probe；原建议无超过10%回退 | **已有本地基线，尚未整体通过**：R8D相同机器320节点/12图，5轮交替共30页、300准备/600读取，RSS/事件循环/EventTiming；10%超差按真实报告待查，仍缺入队/持续混合与field INP；180秒读取不当容量证明 |
| 100k+活跃用户容量模型 | PRODUCT_READINESS_100K，实际到达率/并发/规格/资源余量 | **未完成**：DAU不是并发；需要持久热态混合生成/保存/媒体负载与限额依据，不抬池/降质量凑通过 |
| required CI实际执行且同SHA | GitHub workflow/run/check annotations，非仅YAML | **未完成**：账户支付/额度长期阻止runner启动；本地通过与远端未执行分别记录 |
| 完整重构版本main普通整合 | 固定origin/main、普通merge、最终全版验收；不强推共享main | **未完成**：目前只是独立候选分支，尚未合回main；超过48h原因见各模块记录 |
| 部署与生产功能验收 | 实际在线source/image、明确目标与发布锁/原任务保护 | **未完成且本轮不执行**；47 HOLD；代码/候选/本地通过不等于上线 |

## 下一步真实工作

1. R8B已封版，R8C拼接已完成受影响34与同镜像browser54；原完整退出范围保持。
2. 拼接请求→像素准备→原子作品/回执→原文档/共享history已收拢；继续真正剩余的Canvas下载/呈现组合，不另建任务/账务系统。
3. 复用现有同机性能runner建立固定前后样本，补原退出门槛，不继续以文件拆分替代性能交付。
4. 全版退出审计、有效CI及普通main整合、生产发布各自给证据，不跨层拼绿。
