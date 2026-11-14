# 视频编译架构：固定生产镜像的数据库与独立Worker全链路验收

## 模块与职责

- 实施基线：main `7cc73679a1d51094dd2810aa2c5a1d6e5d894502`。
- 产品镜像沿用固定 `dcbb9494` / 1794674158，main基线相对它仅增加文档；不重新构建或用测试bundle覆盖产品代码。
- 本切片只扩展进程验收驱动，新增 `--production-package` 及 `scripts/video-compiler-production-runtime.ts`，产品源码、数据库结构、能力规则、协议和计费实现没有修改。

## 公共接口、依赖方向、数据与状态归属

测试driver在固定Linux runner容器中运行，生产Web从镜像 `server.js` 启动、独立应用Worker直接加载镜像 `dist/worker/application.cjs`，媒体Worker使用镜像原生C launcher/chroot/seccomp/FFmpeg。没有用fixture媒体引擎、Next dev或驱动内的业务函数冒充供应商执行进程。

driver仅用于fixture发布、账户/素材/报价初始布置及读取回执，与既有进程脚本一致；用户行为通过实际鉴权HTTP，任务由独立Worker消费。driver的源码bundle与产品Web/Worker包相互独立，外部pg/sharp仅从镜像包内解析，不读取Windows node_modules。

driver/媒体launcher按既有Linux需求以root启动，Web/应用Worker通过spawn降为runner的nextjs UID/GID1001。媒体子进程只收到媒体路径、媒体secret、端口和版本，不传播数据库/设置secret。进程UID取自真实`/proc/PID/status`，环境存在性来自实际spawn参数，不将读取受限的`/proc/PID/environ`当作已核验。

容器复用现有专属fixture PG的网络命名空间，连接127.0.0.1:5432的fixture库，每次创建随机schema；没有新公网端口、生产连接、跨站数据或供应商凭据。文件只使用本切片证据目录；宿主已有PG及其他容器保持。媒体临时执行挂载沿用现有Compose的sandbox exec/nosuid/nodev设计，不降低原生sandbox规则。

## 实现与迁移状态

生产选项要求Linux、绝对包根目录、工作目录匹配、合法源码commit、真实Next BUILD_ID、standalone server、Worker bundle SHA及无Route输入。缺包或环境不符会明确失败，不能静默改跑开发服务器。

该选项不隐式安装或替换浏览器。`--browser / --canvas-browser / --input-equivalence` 当前有明确拒绝，相关真实浏览器验收继续由已独立记录的development矩阵承担，后续另接生产浏览器，不把本模块标成它们全部通过。

## 验证命令、结果与证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-production-process-20261115`。

首轮生产组合 `modified-runtime/run-f986784e-a97d-4b96-aff4-9473089b863e` 已通过61项、退出0：底座14、预算10、Agent6、RunningHub/AutoDL10、Workflow13、ComfyUI8。原冻结型号/凭据/报价/映射、单次结算、原回执重启恢复、取消/显式重试、LIVE lease及UNKNOWN不重放全部由实际生产包完成；账本19笔313 fixture积分，托管JSON创建18次、结果下载22次，13个自有子进程退出、随机schema删除、连接池关闭。

原始驱动失败日志保留：外部bundle默认从/evidence查找sharp、直接调用镜像FFmpeg的libpulsecommon查找、测试/tmp默认noexec导致原生exec拒绝。修正驱动的NODE_PATH、仅fixture生成使用的库路径及独立sandbox挂载；未放宽产品媒体验证或使用开发引擎替代。早期/proc环境观测只返回媒体及自观测进程，未据不完整观测宣称Web/Worker环境通过；最终增加准确的UID与spawn参数/版本/原生health核验。

最终四路径包独立解包后运行 `copy-runtime/run-2334a4e8-5e81-41be-848f-1761e0af0d67`，增加实际进程边界核验，合计62项通过、退出0：底座15＋预算10＋Agent6＋远程协议10＋Workflow13＋ComfyUI8。结果仍为19笔313 fixture积分、18次JSON创建、22次成片下载，13子进程退出、schema删除及pool关闭。`PRODUCTION_IDENTITIES.json`确认实际Web/Worker UID1001、媒体UID0、媒体health sandbox=true、实际版本1794674158/源码dcbb9494，媒体spawn参数无DB/设置secret。

原始基线独立工作树14项及修改后默认development路径14项均通过、退出0；完整类型检查、核心137通过。三项生产运行反控（非法commit、错误包根目录、暗中混用浏览器runtime）均在业务初始化前准确退出1，没有fallback到dev。四路径真实回滚和原始行为复测、所有精确命令/输入/逐字输出/exit及原始哈希见本切片VERIFICATION.txt与COMMANDS.json；工作修改及ZIP继续保留。

## 未完成项与下一步

本切片不是完整RFC退出。生产浏览器操作、完整Storyboard编辑/拆并/审片/成片与确认按钮、全部在用/env-only绑定、combined direct supervisor活动中断、新旧Web/Worker及历史v2/新v3混合、双槽排空回滚/旧资产、有授权的真实上游及目标站蓝绿继续。

developer-cache冷加载异常仍未确立根因，不由production成功推导它已修复。付费调用0、生产配置/数据库修改0、部署0，47 HOLD保持，总目标ACTIVE。
