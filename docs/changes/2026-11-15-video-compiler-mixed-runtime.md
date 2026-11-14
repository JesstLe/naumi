# 视频编译架构：真实历史 v2 与新 v3 混合运行

## 模块与职责

本片从 main `70681bc60e324bec8054e0ca08a27fbf2718eea8` 继续 RFC A15/A19，不将上一轮单版本重启或纯 reader 检查当成混合版本证明。

## 公共接口、依赖方向、状态归属

- 测试 driver 只负责初始化随机隔离 PG schema、本地供应商和实际 HTTP 交互；任务由对应不可变镜像的真实 Web 创建，不通过 SQL 修改 version/state/lease 来模拟旧任务。
- 历史 writer/Worker 固定 `4c2ea711`（编译架构落地前真实生产包）；当前固定 `8201d649`；兼容回滚包固定 `d4b6a58b`，其实际 v3 reader 与恢复能力单独验收。不能把不认识 v3 的历史包当成 v3 回滚候选。
- 宿主仅持有本片 Docker 句柄，产品容器不挂 Docker socket；三个 Web 采用独立身份/端口、同一实际 fixture DB/schema 和媒体；Worker 必须原控制接口 drain 并退出后才能换版本。native media 沿用实际 root launcher/sandbox，Web/Worker 为 UID1001。
- 显式发布新 Binding 后才开放候选；原手工配置、旧 model defaults、历史 request、凭据和账务快照保持。回滚程序/入口不回灌 DB/media、不重提 UNKNOWN。

## 实现与迁移状态

新增 `verify-video-compiler-mixed-process.ts` 与 `video-compiler-mixed-host.mjs`，实际运行历史 Web/Worker→当前 Web/Worker→兼容回滚 Web/Worker→当前 Worker。

目标覆盖真实 v2 未发送图片任务、已受理原回执、UNKNOWN；新 v3 原回执、UNKNOWN、回滚 Web 新建任务；全部冻结字段和原积分、签名素材字节、结果资产身份与单账本分别核对。旧 Worker 在新配置和新任务开放前退出，不通过它试发不认识的 v3。

## 验证命令、结果及证据层级

实际结果完成后追加。证据目录 `E:/Workspace/naumi/output/video-compiler-mixed-runtime-20261115`，本片不是服务器蓝绿、Nginx切流或真实付费上游验收。

## 未完成项与下一步

先完成实际混合进程，再集中类型/原62项回归与独立副本回滚、更新A15/A19。其他全量缺口、47 HOLD、103实验线隔离保持；未调用真实供应商或部署站点。

## 混合运行发现的准入缺口与产品修复

原9项混合运行首轮exit0；加入排空反控后，真实历史Web已draining，`/api/video/generate`仍返回200并创建新任务。失败保留在`COPY.log`；源码核对当前同类入口也没有新操作准入，不能以旧版进程退出/新版本健康检查代替防重入。

新增视频模块`withNewVideoAdmission`，复用release owner已有`startAccountWork`/`withAcceptedExecution`/`endAccountWork`。新操作准备前在原release事务中登记，和drain串行；准入span只表示本地准备/受理生命周期，不宣布远端成功，也不修改任务/工作流UNKNOWN。原操作重放查询先执行，已被服务端证明的同账号active parent可继续子操作；已结束/跨账号parent拒绝。已知准备异常结束本地准入，不虚造UNKNOWN债务。排空拒绝统一转为已有领域错误`VIDEO_RELEASE_DRAINING/503`，避免BYOC吞成不确定的上游502。

托管Canvas/Workbench/Agent共用creation入口、BYOC新建与显式重试、Workflow新run、Canvas批次创建都接同一边界；批次的复制节点/原子回执也在span内。恢复/查询/取消不走新操作边界；工作流既有run重放保留。没有新增模型能力许可，也不把业务输入送到release模块裁决。

真实PG专项最终12项通过：另覆盖跨账号parent和旧v2 BYOC显式重试的新操作边界（后者是内存reader反控，未改写DB任务版本）。旧4c/d4镜像的reader兼容证据不升级为已经拥有新准入保护。

## 最终固定包与回滚结果

- 最终产品固定 `f0757471ec8897946f9ee1466c6f7b14e30b2f37`，完整Dockerfile构建exit0，版号以证据`BUILD_INPUT.json`为准；镜像 `sha256:ae302f798c03ec9e1ad8fae82e07d2bcc542dcd5c1fd240ed63198ec48c290bb`。576个tracked Worker输入逐一匹配固定archive，Worker SHA `e9e5312774273e5d2b64c987a47a09de669d46103ccb8bdb0a633c3cbdf7e148`。原构建警告保留，不声称零警告。初次61e包缺最终领域诊断映射，不作为最终包。
- `fixed-runtime` 的实际三版本混合运行9项exit0：4c旧Web真实创建v2、旧Worker原回执/UNKNOWN；f075接续真实v2 prepared图片和原回执；d4旧reader查询原v3并通过真实Web新建v3；再切回f075不重发。三个Web实际`/api/version`、四次Worker实际direct/commit/instance/boot核对；每个Worker先drain并exit0再换版本。
- 6操作各1次POST，v2旧型号/旧key/720p保持；v3新型号/新key/wire2k保持。结果4笔账本48 fixture积分（7+7+17+17），v2/v3各一个未知受理保留needs_attention且0账本；1份原PNG的供应商读取SHA和4份成片HTTP原字节相符，作品归属/身份保持。未修改task version/state/lease或回灌数据库。
- 最终解包driver `regression-runtime/run-def32725-f5ba-4489-ac1d-9b51b37a9fba` 共70项exit0：底座15＋预算10＋Agent6＋RunningHub/AutoDL10＋Workflow13＋ComfyUI8＋实际HTTP排空8。6个新操作入口在draining均503/明确code，原操作重放与预览/结果读取200，零任务/账务/供应商增量；没有以直接Route函数调用代替HTTP。
- 真实PG准入12、tsc、核心137、Linux Worker49通过。源码探针在baseline/独立回滚副本均输出`VIDEO_DRAIN_SOURCE=FAIL ACCEPTED=1 TASKS_ADDED=1 CODE=none`/exit1；修改副本输出`PASS ACCEPTED=0 TASKS_ADDED=0 CODE=VIDEO_RELEASE_DRAINING`/exit0。14路径回滚恢复原哈希及原不存在状态，修复源和ZIP仍为修改版。
- 保留初始fixture凭据长度/不存在repo方法/错误cancel导出和Windows tar解包失败。tar失败后Python按固定archive解包，历史非法字节文件名只涉及无产品输入的docs，不改产品源。源码探针首次从错误cwd运行导致`VIDEO_COMPILED_TRANSPORT_UNAVAILABLE`，改为目标根目录后才取得真实baseline受理反例，不把首次失败充作受理证明。
- 所有本片Web/Worker容器、native media、随机schema/pools/relay有退出/回收回执。磁盘盘点后清理两个自有闲置源码构建上下文的工具操作被拒，未绕过、未删除；镜像/回滚/业务数据保持，约C60GiB/E33GiB余量下完成增量构建。

本片交付目录四产物为`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`；完整命令/输入/逐字输出/退出码、archive与镜像身份在该目录保留。没有生产写入、收费或部署。

### 剩余边界

旧4c只作为真实v2 writer，发布新绑定前已停止；不允许它消费不认识的v3。d4只证明v3 reader/冻结兼容，其缺少本轮新准入保护，不能据此认证整站回滚候选已经就绪。本片未执行Nginx双槽切流、旧JS/CSS完整兼容、目标站蓝绿或真实付费上游；全目标ACTIVE，下一片继续实际发布/回滚合同与启用绑定清单，不把9/70项局部证明升级为全范围完成。
