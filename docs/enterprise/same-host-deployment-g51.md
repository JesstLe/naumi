# G51 47 同机独立工作流：网络拓扑、安装配置与预检

## 需求与发现

用户已选择 47 同机独立服务，并要求既有发布收尾及资源门禁先通过。产品继续使用原 18482 Demo；/admin 为源管理入口。同一代码主干，独立工作流数据库、账户、存储、备份，不增加常驻第二套 Naumi Web。

47 实际 Web/Worker 使用 `naumi47_infra`、`naumi47_public_egress`、`naumi47_staging` Docker 网络。G15-B 的 host-network 工作流示例与现有 Web 的网络命名空间不同，双方 127.0.0.1 不互通。生产组合测试原来使用统一测试 namespace，不能单凭其通过证明 host-network 示例可以直接接 47。

本模块补充同机安装配置编译器及实际 Docker 拓扑验证，不放宽 HTTP 来源地址规则、不暴露工作流公网端口、不改原 HTML，不自动执行生产安装。

## 部署结构和联动

1. 外层全站蓝绿控制器创建唯一完整 Naumi 候选 Web，保留必要源网络，另加入工作流私有 internal 网络。主站 Worker仍与 Web 保持同固定版本；不能因本模块另起功能 Web 并长期保留。
2. 独立 PostgreSQL 16 容器仅加入工作流私有网络，不发布宿主端口。独立 named volume，明确 bootstrap 角色与 application 角色。初始化口令通过只读文件提供，不写入 Compose 环境值、日志或 Git。
3. 工作流 API、Worker 使用同一个固定运行镜像，各自独立进程/文件系统，`network_mode=container:<candidate Web 完整 Docker ID>`。API/Worker 继续监听 127.0.0.1；BFF 不改现有签名与来源权限规则。
4. 工作流通过私有网络 DNS 连接独立数据库。API/Worker 只挂运行配置和独立交付目录；可选原始导入目录只读。DB bootstrap 文件不挂入常驻工作流容器。
5. 配置文件目录由管理员明确创建并核验所有者/权限，bind `create_host_path=false`，避免路径拼错时 Docker 静默创建空目录。UID1000 配置0600验证仍由现有运行程序完成。导入根、交付根、配置及源挂载不得重叠。
6. 新 Worker 保持 standby，数据库迁移、功能启用、来源导入和真实人员应用都是显式计划/应用操作，不是容器启动钩子。
7. 两槽使用不同 Web 网络 namespace，可使用相同的内部 API/Worker 端口。两槽共享独立工作流业务库与交付存储；业务兼容性和 Worker 所有权交接仍按现行协议验证。
8. 退役时先确认 Web/工作流停止接新工作及全部在途状态，再停止工作流 API/Worker，最后退役作为 namespace owner 的 Web。不能先删 Web 再把侧车的残留网络当成有效新槽。

## 输入与输出契约

`scripts/enterprise-production/same-host-plan.mjs` 接收无秘密的 plan：目标主机、安装/槽标识、固定 Git/产品/release 摘要、三个 Image ID、候选 Web 名和源网络、独立数据库名/角色/卷/网络、内部端口、受保护文件引用与资源预算。

严格拒绝未知字段、可变镜像标签、其他服务器、相对路径/路径穿越、源目录重叠、bootstrap/app 角色相同、端口重复、缺少主机余量。读取 UTF-8 BOM；输入错误只输出固定错误码，不回显 JSON 内容。

只读 `collect47.py` 在既有受保护 SSH 通道执行，输出两次相隔至少5秒的 RAM/CPU/磁盘样本、机器ID摘要、生命周期原字节摘要、锁占用、容器固定身份/网络/挂载、镜像标签、已有卷与网络。不输出 Env、数据库 URL、密钥或个人资料，不查询业务数据库、不变更生命周期。扫描结束前再次核对生命周期原字节，变化即拒绝此次观测。

预检时观测不得超过120秒，最多容忍5秒时钟偏差；全部缺失/未知值保留未知。生成以下本地文件，已存在时拒绝覆盖：

- `database.compose.json`：独立数据库安装配置。
- `slot.compose.proposed.json`：按候选名生成的审阅草案，实际启动前必须再绑定完整容器ID。
- `TOPOLOGY.json`：网络、身份、地址和退役顺序契约。
- `PREFLIGHT.json`：绑定 plan/snapshot 摘要的逐项诊断；`startAuthorized` 始终 false。

预检正常退出0仅表示此阶段检查通过；条件不满足退出2；输入错误退出1。工具没有 start/reload/stop 能力。真实部署仍要在完整三锁持有期间重新观察、核验配置/目录/固定镜像、真实就绪/登录/数据和兼容性。

外层控制器创建候选后，使用实际 `docker inspect` 输出走 `--candidate-inspect`。编译器核对完整ID、固定Image ID、Git/产品标签、运行状态、只读根、nextjs用户、必要网络、仅回环发布的 Web 端口，然后生成 `slot.compose.bound.json`；拒绝错误镜像、失效候选、host模式、缺网络或发布工作流端口。它不自行创建/切换 Naumi Web。

## 资源预算

候选预算 = max(新完整 Web + 新 Naumi Worker + 工作流 API + 工作流 Worker + 新独立 PostgreSQL 的限制总量，已测量的组合峰值)。所需空闲 = 候选预算 + 现有业务负载增长余量 + 至少1024MiB主机保留。Swap 不算 RAM，不预支尚未退役旧槽释放的内存。

磁盘预算同时检查根盘及 Docker 所在盘，至少保留10GiB，再计镜像解包、备份及新增数据库/附件的增量；不同盘时取两者约束，不把现有15GiB全部当作可消费空间。

本次提案采用 Web2048 + Naumi Worker128 + API512 + Workflow Worker512 + DB512 = 3712MiB，加保留1024 = 4736MiB；组合峰值和原负载增长尚未测量，明确为 null，不当作0通过。47 采样可用最低4560MiB，仅已有下界就不足176MiB。不能据此保证升级某个档位必然通过；先真实峰值测量，再调优或扩容。

收尾再观察最低4532MiB，预算下界缺口204MiB；磁盘14548MiB。两个时点记录分别保留，最终以HOST_SNAPSHOT_RELEASE.json/PREFLIGHT.json为准。缺口还未计未测的业务增长和组合峰值。

## 本轮实际验收

- 单元与CLI涵盖固定镜像、目录/源数据保护、未知字段、资源、过期观测、锁/发布债务、候选原子身份及错误日志不泄露输入。
- Linux Docker 使用 G50 两个固定镜像：实际 Next standalone Web、实际工作流 API/Worker，独立 PostgreSQL，显式迁移/合成账号初始化、低权限运行、角色健康、回环可达性和同网络其他容器访问拒绝。
- 实际 Web `/api/version`200；同槽 API ready、Worker standby；无宿主发布的工作流/数据库端口；API/Worker排空并exit0之后才退出Web。合成资源按本轮唯一标签清理。
- 本地测试以新建 named volume 代替生产的受保护 bind 路径；不冒充已验证47的实际配置ACL、全流程员工登录或正式容量。G50完整业务回归结果单独保留，本轮不重复声称新跑41/46项。

最终33项单元/CLI、6组Docker拓扑验收通过。中间一轮遇到PostgreSQL入口临时Unix socket服务已ready但正在退出的竞态，保留失败日志；改用TCP pg_isready识别正式服务后重验通过，没有重启任何已有数据库。候选绑定同时核对实际Web内存限制与计划一致；COMPLETE标签也不能绕过未知/非零排空计数。

47本次只读生命周期仍revision74、CLEANUP_PENDING/MIGRATED_CLEANUP_PENDING；legacyDrainProven=false，acceptedTasks/agentSessions/legacyActiveTicks均null。三锁不再显示占用，但不是旧任务已排空证明。固定候选镜像未导入47；与当前线上/同事最新代码的版本整合仍需实际复核。没有修改生产或应用首位真实员工。

## 可复用命令

```powershell
node --test scripts/test-enterprise-same-host.mjs
node scripts/verify-enterprise-same-host.mjs --web-report WEB_BUILD_JSON --runtime-report LINUX_BUILD_JSON --output NEW_EVIDENCE_DIRECTORY
node scripts/enterprise-production/same-host-plan.mjs --plan PLAN_JSON --snapshot FRESH_HOST_SNAPSHOT_JSON --output NEW_PLAN_DIRECTORY
# 外层持锁控制器创建候选后，用实际 inspect 文件固定 namespace owner
node scripts/enterprise-production/same-host-plan.mjs --plan PLAN_JSON --candidate-inspect CANDIDATE_INSPECT_JSON --output NEW_BOUND_DIRECTORY
```

接续：先处理既有发布的实际未知排空证据，刷新候选/现有源码关系与资源峰值；满足后按本模块配置创建独立基础设施、走原有迁移/功能启用/来源导入的plan→apply并核对原Excel哈希，再接原生会话与首位真实人员。真实试点的来源审计必须重新生成，不复用过期包；仍需独立验收人。整体目标 ACTIVE。

本轮证据：`E:/Workspace/naumi/output/enterprise-deployment-preflight-g51-20261018`。此模块为部署工具与文档更新，应用镜像仍明确固定G50的12d3f8a8，不称其包含新工具提交。功能同步计数达到3时刷新main并归零；不因Git推送自动上线。
