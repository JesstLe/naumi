# 发布生命周期与实例收敛门禁

## 1. 本轮实现及明确边界

已实现：`scripts/ops/release_lifecycle.py`验收/状态工具，通过`scripts/deploy-release.sh --lifecycle`调用；状态锁、原子落盘和revision CAS；候选/实例/容量/版本/路由/恢复执行图/排空/回滚材料验收；已知旧发布入口前置阻断；离线端到端状态CLI及Linux旧入口回归。

未实现：自动构建、自动创建候选、改Nginx、停旧槽、自动接管Worker、Agent会话迁移，以及所有业务的真实任务/会话采集适配。这些动作必须由持锁的蓝绿执行器负责。门禁本身不执行docker stop/rm，不更改数据库、媒体或服务，不把配置/状态回滚当作业务数据回滚。

live模式只适配47.105.59.142；其他站点需另写核实过的锁/状态路径/身份适配，不能把47参数套到别处。所有本轮验证是fixture和本地Docker，未连接/更新47或其他服务器，也未安装或启用此工具。已有服务器脚本副本和仓库外脚本不因Git变更自动失效，必须在后续协调窗口替换并核查调用方；不声称所有人工入口都已强制受控。

## 2. 目标架构与发布完成

- 一个完整Naumi Web：主站、登录、画布、参考工作台、内部容量回调，不为每次修复新增永久Web。
- 一个独立Worker，与Web使用同一固定commit/image；数据库、Redis、Router、Hub等按自身职责独立。
- 整合候选最多一个Web；迁移前可以登记多个既存旧Web作为baseline，但必须把所有待替代实例纳入retire。不能隐去他人候选或把旧Web伪装为基础设施。
- 常态当前版本和最近两个成功回滚版本的镜像/配置/旧静态资源保留；旧版本不需要常驻进程。历史版本未排空时继续服务，不强停、不卡死用户；发布状态保留CLEANUP_PENDING，先完成收尾再发布下一版。

完成不止health200。必须同时证明目标路由及内部执行统一、Worker版本/交接正确、旧槽正常停止且restart=no、旧连接/Agent/已接任务/租约和新领取都为0、近期两版回滚材料可读。

临时按路径应急修复可作为用户明确授权的过渡，但必须记录负责人、作用域、退出条件和仍引用的旧实例。它不满足本工具的整站COMPLETE，不能将应急临时步骤冒充统一发布完成。

## 3. 状态机与并发

```text
begin → PREPARED → ready → READY → switched → DRAINING → finish → COMPLETE
                                             └─ finish未过 → CLEANUP_PENDING
                                             └─ 切换未知 → UNKNOWN
任一未完成阶段 → rollback真实确认 → ROLLED_BACK
回滚验证失败 → ROLLBACK_FAILED
PREPARED + 入口基线不变 + 候选停止且restart=no → abort → ABORTED
```

UNKNOWN/ROLLBACK_FAILED/CLEANUP_PENDING/PREPARED/READY/DRAINING均阻止另一releaseId的begin。不以超时、进程退出、中央确认或删文件消除债务。CLEANUP_PENDING在自然排空并得到新证据后，可用最新revision再次finish；UNKNOWN只在核对真实现场后显式回滚确认。本工具不替你执行回滚。

每次转换带`--revision`与前一状态比较，原子写current.json并fsync；并发旧写者/重复转换拒绝。新事务启动前归档前一终态，releaseId不复用。状态包含plan哈希、现场快照哈希、证据类型、revision及历史。状态文件是根本地真相，不以中央消息替代。

live状态目录固定：`/opt/naumi-staging/releases/release-lifecycle/`。不得换路径逃过未完成记录。fixture目录名必须为fixture-state，与live类型严格分离。

47每个live命令重获Naumi/Hub/参考工作台三锁；若外部执行器全程持锁，可通过`NAUMI_LIFECYCLE_LOCK_FDS=9,8,7`传入真正继承的三个FD，本工具核对/proc/self/fd及fdinfo锁记录。仅传路径或bool无效。状态锁不取代全程部署锁；外部实际切流/创建/退役也必须在同一完整事务锁期内。

## 4. 计划、现场与证据契约

计划固定schemaVersion=1、releaseId、target、evidenceMode(fixture/live)、经保护连接核实的machine-id SHA256、完整40位commit和不可变sha256镜像。逐个登记baseline实例完整Docker ID/role/image/commit/running/restartPolicy/startedAt，指定候选web、worker及retire列表。

计划含baseline与unified的完整nginx -T输出SHA256，不能只哈希一个忽略include/map的片段。路由表必须含main/login/canvas/reference-workbench/router-capacity；执行图必须含generate-image/imagegen-submit/imagegen-query/worker-image-recovery。路由语义与实际动态变量/内部调用由适配器和验收产物证明，不把声明的表当作Nginx解析器已经实现。

snapshot为不超过120秒的新观测，绑定releaseId/target/planSha256；包括所有运行容器、仍保留的基线容器、MemAvailable、实际路由/内部执行图、网关hash及排空状态。内存预算含candidatePeakMiB、reservedMiB和minimumAvailableMiB；主机余量至少1024MiB，Swap不计入可启动预算。

每类evidence需ok=true、observedAt、releaseId、target、planSha256、snapshotSha256、artifact相对路径与artifactSha256。artifact必须实际存在于snapshot目录内且字节hash一致；时间、绑定或文件缺失即阻断，不接受单独写一个PASS。

证据类型：baseline、readiness、old-client-compatibility、backup-and-rollback、worker-handoff、continuity、retirement、rollback、abort。finish的continuity/retirement及drain计数必须在切流之后。

每个待退役槽的drain必须有connections、agentSessions、acceptedTasks、workerLeases、newAdmissions五个**真实整数0**和采样时间；缺失、null、false、字符串0、过期或正数均不通过。尚无可信Agent/任务观测时保留unknown，不用数据库历史数或一个Map大小代替所有在途状态。

live CLI还会重新读machine-id、docker inspect全部运行实例/基线身份、实际RAM、nginx -T，并核验Worker NAUMI_APP_ORIGIN指向的真实Docker容器。当前origin适配仅接受可直接验证的Docker容器名；DNS别名/外部代理等未适配形式会拒绝，需要补适配，不猜测。证据仍需真实调用链和业务采集器；不会伪造Agent、任务数或将fixture升格为live。

## 5. 复用命令与接手提示词

先在本地生成完整、明确标注fixture的计划/快照/证据，并走CLI状态流：

```bash
python scripts/ops/test_release_lifecycle.py -v
python scripts/ops/verify_release_lifecycle_cli.py output/release-example
bash scripts/deploy-release.sh --lifecycle status --state-dir output/release-example/fixture-state
```

真实执行器接入点（PLAN/SNAPSHOT为已生成的真实文件，不是用户手写PASS）：

```bash
bash scripts/deploy-release.sh --lifecycle begin --plan "$PLAN" --snapshot "$SNAPSHOT" --state-dir /opt/naumi-staging/releases/release-lifecycle
# 执行器在同一三锁期内创建唯一旁路、采集新证据，再推进ready/switched。
bash scripts/deploy-release.sh --lifecycle finish --plan "$PLAN" --snapshot "$FRESH_SNAPSHOT" --state-dir /opt/naumi-staging/releases/release-lifecycle --revision "$REVISION"
```

可复用交接提示：

```text
先读AGENTS.md和RELEASE_LIFECYCLE.md。核对指定站点、根本地未完成发布状态及同事候选，持完整部署锁。
整合完整Web候选，不按功能无限叠槽。冻结commit/image与计划，预留候选峰值和主机RAM，保留数据库/媒体。
逐阶段采集真实证据：新提交、查询、App直接import、Worker内部恢复、旧客户端、Agent、租约和结算。
只切流不报完成；旧槽未排空就保留CLEANUP_PENDING，不强停、不重放收费任务、不启动下一发布。
程序回滚不回灌数据库；确认真实恢复后才记ROLLED_BACK，失败保留ROLLBACK_FAILED。
记录已实现/已启用/线上已验收的区别，fixture不能充当真实供应商或正在使用用户的连续性验收。
```

## 6. 旧入口与既有回滚材料

正常deploy-release三参数入口与staging固定镜像原地重建拒绝，退出78且尚无现场修改。Compose升级/媒体准备等独立辅助功能没有被包装成发布成功；涉及运行服务的独立辅助入口仍须各自审计，不能以其绕过生命周期。

已知Geeknow按路径发布、画布静态覆盖、旧103缓存/性能多槽start/cutover及Hub原地配置更新入口均在任何业务动作前阻断。保留既有独立回滚脚本和特定--rollback，避免撤销已有恢复材料；其存在不等于新发布已验收或自动获准执行。

历史原地流程正文仅用于离线契约/回滚回归，需显式--offline-legacy-fixture、fixture环境/标记、Docker容器环境、mock docker路径、fixture旧版本路径及无Docker socket共同满足。仅设置环境变量不能打开生产入口。CI测试在无网络、无Docker socket和生产挂载的容器内运行。

本次没有给服务器安装新门禁，也没有替换另一线程已经准备的发布脚本；合入与启用需协调，先盘点仓库外脚本和CI/人工入口。本协议不把文件修改冒充全机已强制执行。
