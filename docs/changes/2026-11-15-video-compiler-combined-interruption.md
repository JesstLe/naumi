# 视频编译架构：真实combined监督器在途信号与恢复

## 模块与职责

源码基线 main `b7ced36254d3a110de40abcd9c51beec4b5d8f36`；固定产品镜像沿用 `d4b6a58b`/1794680841/image958898f7，b7相对产品镜像只增加已验收的测试驱动和文档。本片针对RFC A14/A19尚未覆盖的combined活动中断，不能用单独scanner或先drain再重启替代。

## 公共接口、依赖方向、状态归属

- 复用原实际Next/PG/发布模型fixture，`--combined-interrupt`只在固定production-package下运行；不改变默认底座路径。原Web鉴权HTTP仍拥有任务准入/冻结/幂等，独立combined Worker执行产品代码。
- `video-compiler-combined-host.mjs`在宿主持有精确Docker容器句柄；产品容器不挂Docker socket。driver和Worker是两个独立容器，共用本次本地fixture network namespace；没有公网端口、生产数据库或真实供应商。
- Worker直接执行镜像内`video-worker-with-media.mjs`，root PID1，不通过嵌入supervisor类或假造PID验证；其子scanner为UID1001、媒体为UID0/原生sandbox。状态/素材/共享scratch只属于本次fixture路径。
- file RPC只发出当前拥有容器的start/signal/inspect/wait/cleanup，记录实际image/container/退出状态；SIGTERM、SIGKILL直接发给产品PID1。真实供应商HTTP挂起POST/GET，测试只控制何时返回，不替换产品请求或处理函数。

## 计划的验收与不变量

1. POST已发出、尚未返回回执时SIGTERM；保持响应超过原12秒grace，combined不得强杀scanner或重复POST；释放原响应后先保存真实upstream_id再退出。
2. 同一状态文件重启，按原回执GET、真实解码/落片/单账本，原7积分不因当前17而改变。
3. POST在途SIGKILL；原tick保持UNKNOWN、paused和相同tick身份，media保持draining，resume/显式retry拒绝，原租约不得被提前夺取。
4. 原210秒task lease自然到期后用明确的新Worker身份检查原sending任务转needs_attention，旧UNKNOWN状态文件逐字不变；不把换身份写成旧tick已核实，不重发POST、不收费。
5. GET在途SIGKILL；保存的upstream_id保持，原Worker UNKNOWN不解除。第二次自然租约过期后，替代Worker只GET原任务、落原结果、单次17积分。

不调整时间、lease、任务/receipt状态或数据库余额来制造上述成功。替代Worker代表显式接班实例，不是自动擦除旧UNKNOWN；原实例的待核对债务必须继续保留。

## 验证记录与未完成

精确命令/回执在 `E:/Workspace/naumi/output/video-compiler-combined-interrupt-20261115`。首轮测试sandbox tmpfs误设256MiB，原生字体复制ENOSPC；改为既有验收的1GiB隔离挂载，不放宽sandbox或伪称容量验收。原失败及停止/清理回执保留。

实际进程完成后再登记最终结论；固定生产浏览器/既有Worker49等证据不替代本片。产品配置写入0、付费0、部署0，47 HOLD和103实验线隔离保持。完整RFC仍ACTIVE；混合版本、双槽、实际绑定和授权上游继续独立验收。


## 在真实SIGKILL中确认的产品缺陷与修复

旧scanner发送POST后被SIGKILL，原task保留queued/sending，lease自然210秒到期。替代Worker仍把queued+无upstream_id统一作为新claim；发布活动中的旧active/unknown记录正确地拒绝新付费claim，于是任务也无法走到既有creation_unknown分类。实际失败保留第二轮日志，不能把未重发等同恢复成功。

修复集中在视频模块的`videoRecoveryAdmission`：只有v2/v3已非prepared、无上游回执的任务作为continuation进入原恢复逻辑。原`videoCreationRetryConfigMatches`仍拒绝这些任务重新POST，只将原任务转待核查；旧release activity和Worker UNKNOWN记录不修改。prepared、legacy、未知未来版本及已回执的原分类全部保持。两个实际恢复入口复用同一函数；13输入×2路径反控覆盖这一精确变化，并注册到既有回归目录。

产品修复必须重新固定镜像；旧d4镜像中的五项部分通过和最终失败不作为修复版完整通过。新固定版本、实际重跑和回滚继续追加。

## 固定修复版本与测试装配核对

产品固定为 `8201d649740e27ef7b56c8f4b92619c8710ee504`，构建版号 `1794683899`，实际镜像 `sha256:e9f8cb532b0ab2d4d15976e220635d9d3e5fee756e8b3d5d06bb9e8bbde06750`。完整 Dockerfile 构建 exit0；574 个 tracked Worker 输入与固定 archive 相符；原生 sandbox 和产品程序未被测试 bundle 替换。

两次测试装配失败单独保留，不算产品已通过：

- 旧 `poll-next` 未指向实际任务；改为原 upstream ID 后，成本核查也会查询相同 `/v1/tasks/:id`，测试挂起的是同步 supplier-scan，真实视频 poll 尚未申请 lease，因此 `activeTicks=1/backgroundTasks=0`。另一个装配错误把产品真实 poll 的 `?language=zh` 也拼进 task ID，成本核查却没有该 query。测试现在按 URL pathname 取 ID，并通过只读原 `app_video_tasks.poll_lock_until` 判定，仅挂起真实已持租约的 processing 视频查询；不改 lease、任务状态、成本配置或产品请求。
- driver 早先共享 PG 容器 network namespace，使不同 run 的 Web 端口相撞；改用每轮独立 namespace，通过既有 fixture-only PG relay 访问本机隔离数据库；阶段名称同时隔离 scratch/容器/输出。首次重新打包漏将 Playwright 标为 external 的失败也保留，后续构建 exit0 才启动 driver。

`ATTEMPT_SUPPLIER_SCAN_GET.log`、`ATTEMPT_DRIVER_BUNDLE.log` 与旧失败日志留在证据目录。既有 62 项进程回归和 Worker49 已通过；最终驱动仍需完整中断重跑及集中回归，不把前六项部分通过拼成全绿。

## 最终结果（2026-11-15）

- 最终实际 PID1 中断 run `normalized-runtime/run-3f8c7564-2423-45f3-9fe7-ab346ef78655` 完整通过8项＋HTTP准入4项，driver/host均exit0。SIGTERM保持超过13.5秒、原回执先落库再退出；POST与GET各一次真实SIGKILL/exit137。原UNKNOWN实例均拒绝resume/409，退出2的核查债务保持。
- 两次原210秒租约分别在UTC `19:48:05.777`、`19:51:50.162`自然到期，观测均在到期后、task/lease时钟写入0。接班实例只把未知POST转`needs_attention/creation_unknown`；原release活动行和旧UNKNOWN文件逐字不变。已有回执的GET中断任务最终恢复原成片、原作品身份、原17积分单账本。
- 三任务账本依次为1笔7、0笔0、1笔17，发送各一次；没有把未知任务伪装成失败退款或重新生成。
- 解包副本的最终驱动 `copy-regression-runtime/run-2659a8c4-9e1b-4e76-aea1-ad7ffb1a8984` 完整62项exit0：底座15、预算10、Agent6、RunningHub/AutoDL10、Workflow13、ComfyUI8。实际生产Web/独立Worker/native sandbox、18次JSON创建/22下载，13子进程/schema/pools/relay已回收。
- 完整tsc、核心137、Linux Worker49、13组×2恢复入口26项通过；fixture peer反控覆盖空目标、多个等待者、releaseAll和query-free task ID。新host拒绝重用已有phase，避免回放旧生命周期命令；空driver在容器启动前报错。
- 测试包源和独立解包编译输入2023项按LF内容相符；5项是原checkout CRLF与archive LF差异，依赖标签亦因工作目录变化，未声称两个driver原始字节相等。产品镜像574项原始输入证明独立保留。
- 本片四产物及逐条命令、输入、原始输出、退出码、源码哈希和副本回滚保存在本次证据目录；回滚只针对独立源码副本，保留产品镜像/业务DB/media，不重放任务。修复源和ZIP仍保留修改版。
- 6个本片combined容器均已移除，driver/随机schema/pools/relay退出有回执；其他服务和共享checkout保留。生产写入0、真实付费0、部署0。

本片关闭combined活动中断缺口；不是完整双槽蓝绿或真实上游验收。RFC全目标继续ACTIVE，下一步为混合v2/v3与新旧Web/Worker兼容、实际启用绑定清单及目标站验收；47暂停决定保持。
