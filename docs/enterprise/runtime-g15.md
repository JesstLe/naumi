# G15-A 统一运行入口、初始化与连续更新准备

## 目标

把已经实现的身份/人员/需求/任务/交付/排期/绩效/归属/通知模块组装为真正可启动、可验证的独立工作流进程，而不是只导出测试工厂。Naumi Web仍负责登录和同源BFF，/admin仍是数据来源；产品UI继续采用18482原HTML，并由Naumi的/enterprise/workflow承载正式员工入口。不另建客户代码分支。

本增量在本机独立数据库、真实Node子进程验证正式构建入口，不连接服务器，不绑定实际公司账号、不迁移真实导入库，也不宣称整站蓝绿/4核8GiB容量已经验收。

## 构建与配置

- dist/runtime.mjs为统一CLI；serve启动API，worker启动通知Worker，check检查，migrate-plan/migrate显式迁移，provision-plan/provision显式初始化，storage-init初始化独立交付目录。
- 构建manifest固定bundle文件和001–012迁移SHA256、原产品HTML SHA256、Git来源及dirty标记。releaseId为manifest内容摘要；启动配置必须引用确切releaseId。文件改动、未知文件名、缺文件或不匹配立即停止，不以README版本代替实际代码。
- 配置为绝对路径的受保护JSON：installationId、slot、expectedDatabase、databaseUrl、releaseId、allowDevelopmentBuild、deploymentMode、tenants、publicKeys、deliveryRoot、apiPort、workerPort、controlToken、connectors。
- tenants显式列出工作流enterpriseId与Naumi sourceInstance/sourceEnterprise；shared可多企业，dedicated必须一个。签名有效但不在配置的来源仍拒绝；数据库绑定必须与配置目标一致。
- 工作流进程只持BFF Ed25519公钥，私钥留在Naumi；拒绝把私钥当公钥配置。DingTalk密钥仅服务端配置，浏览器只见公开连接标识。
- 只监听127.0.0.1；数据库、内部控制接口不直接公开。外层Naumi/Nginx与真实主机配置由后续G15发布阶段完成。

## 数据库与存储门禁

1. 工作流使用独立库。存在public.app_*或其他业务schema用户表时拒绝迁移与启动，不借企业初始化改Naumi源库。
2. 数据库名必须匹配expectedDatabase；012记录installationId、迁移文件校验及兼容版本。启动不能认领无标识的现成库，安装标识不同就拒绝。
3. 迁移只由显式CLI执行，不在serve/worker启动中自动DDL。先生成包含当前版本、构建、文件hash和目标库的预览摘要，再拿同一摘要应用；在数据库锁下重新计算，旧摘要拒绝。
4. 非空旧工作流库需显式adopt-existing，并提供pg_dump自定义格式备份文件；记录其hash。备份头/hash检查不是恢复验收，正式迁移前仍需真实恢复演练。本轮在隔离库验证恢复，不迁真实schema8。
5. 所有缺失迁移、运行标识、迁移回执和权限授予同一事务提交；失败全部回滚，重复执行同一成功计划只返回已执行回执。
6. API/Worker数据库角色必须非superuser、非createdb/createrole/bypassrls、非数据库/schema所有者且无schema CREATE。迁移使用另一个受保护管理员连接文件，只连接同一目标；CLI不自动创建数据库角色或改密码。
7. deliveryRoot必须绝对路径且与安装标识匹配。storage-init只接受空目录或本安装已有标识，拒绝认领原Excel附件目录；读写探针只使用自己的临时文件，既有文件不覆盖。

## 组织与身份初始化

使用显式初始化清单，不按Excel真名/Naumi花名猜测人员：企业/来源稳定ID、团队ID/名称、内部subject、Naumi稳定sourceSubject、团队权限/工种、是否人员目录管理员。清单需confirmedSourceSubjects=true，操作者确认源身份存在；本CLI本身不冒充已在线核验Naumi账号。

provision-plan展示变更数量和预览hash；provision使用同一hash、commandId及原因，事务内重新核对目标状态。仅处理清单指定的对象，不删除未列出的成员；源身份改绑到另一个subject拒绝，另走显式迁移。账号/团队/成员权限、源绑定、目录管理员和回执一起提交，重复提交不重复创建。权限由清单明确填写，无隐藏超级管理员或测试登录入口。

## 运行组装与就绪

API启动同一实例的SourceIdentityStore、DeliveryStore、NotificationStore、RoutingStore、WorkflowStore、SchedulingStore、PeopleStore、PerformanceStore以及签名来源证据验证器；通知同时接普通业务事务与人工归属事务。

healthz只表示进程存活。readyz检查安装标识、迁移校验、兼容版本、角色、企业范围、有效源绑定与成员、交付目录；返回实际releaseId、productSha256、slot/bootId、模块列表和进程资源观察，不输出数据库URL/凭证/账号清单。结构正常但尚未初始化真实身份时仍不标业务就绪。

Worker只暴露健康/控制接口，不提供业务API；共享相同配置/安装标识/连接revision。启动始终standby，acceptingWork=false，不自动领取历史或新通知；外层发布持锁、就绪和登录验收之后，由带凭证的activate显式开启新tick。并发不同激活操作只有一个成功，相同操作可重放；drain后不可再次激活。停机先停止开启新tick，再完成当前任务。旧开发通知入口只保留显式隔离测试用途，正式运行统一走runtime worker。

## 排空与蓝绿对接

内部控制请求需controlToken，并比对installationId/releaseId/slot/bootId/role，防止操作错槽或重启后的新进程。drain单向进入排空：readyz=503，新业务请求503，已进入的业务处理继续；下载流与异步处理完成均计入活跃请求。客户端断开不意味着事务已结束。

stop只在活跃业务/Worker任务均为0时执行；仍在途返回冲突，不强制关闭连接、不回灌DB、不重放任务。SIGTERM同样先排空；排空超时只记录待处理，不以强杀伪造已排空。真实蓝绿仍需外层持锁、旁路健康/登录/资源验收、nginx -t和平滑切流、旧槽停止及回滚材料。此处仅交付工作流进程所需的可观测排空接口。

## 集中验收

真实构建CLI验证：空库迁移、旧版本采用/备份恢复、预览过期/重复/失败回滚、错误库/错安装/未知文件hash/私钥/越权角色拒绝；显式身份计划和重放；双API同库同存储，签名HTTP创建/审批/任务/上传/交付/验收/通知/排期/规则/绩效；持有上传跨drain仍完成，新请求拒绝，旧槽停后新槽读取同一文件/订单；Worker单次运行和停止；真实原表只读复核。

当前：统一构建与CLI、12迁移、安装标识/角色/存储/配置门禁、显式初始化、实际进程组装和排空已实现，首轮真实进程验收通过；固定提交后的独立运行包与最终回归记录见交付材料。总目标ACTIVE；真实公司绑定、主机资源/4核8GiB整站负载、真实Naumi Web组合与最终蓝绿发布仍待后续完成。

## 实施顺序与操作命令

以下均为部署准备操作。CFG/ADMIN/ROSTER/BACKUP均为本机绝对路径，实际值不得贴入公共日志。Linux配置文件要求0600，Windows本轮检查绝对路径/普通文件/体积，实际部署ACL需要操作系统运维单独核验。

1. 固定Git提交，构建并检查dist/manifest.json的sourceDirty=false、gitRevision、releaseId和文件hash。准备独立工作流数据库与低权限登录角色；角色/密码由数据库管理员或凭据管理器创建，CLI不生成账号密码。
2. 填runtime.example.json的占位符，使用实际工作流企业UUID、Naumi企业UUID与公钥。运行用户数据库URL与迁移管理员URL分文件保存；管理员文件只有databaseUrl一个字段，两者须指向同一个host/port/database。
3. 对现有库先pg_dump并在独立库真实恢复核对。迁移预览不会自动认领现有库，非空库必须额外提供--backup和--adopt-existing true。

```powershell
node services/enterprise-workflow/build.mjs
node services/enterprise-workflow/dist/runtime.mjs migrate-plan --config CFG --admin ADMIN --reason CHANGE_TICKET
# 记录输出planHash；现有库在两步都带同一backup/adoption参数：
node services/enterprise-workflow/dist/runtime.mjs migrate --config CFG --admin ADMIN --reason CHANGE_TICKET --preview-hash PLAN_HASH
node services/enterprise-workflow/dist/runtime.mjs storage-init --config CFG
node services/enterprise-workflow/dist/runtime.mjs provision-plan --config CFG --admin ADMIN --input ROSTER
node services/enterprise-workflow/dist/runtime.mjs provision --config CFG --admin ADMIN --input ROSTER --preview-hash PROVISION_HASH
node services/enterprise-workflow/dist/runtime.mjs check --config CFG
node --max-old-space-size=384 services/enterprise-workflow/dist/runtime.mjs serve --config CFG
node --max-old-space-size=384 services/enterprise-workflow/dist/runtime.mjs worker --config CFG
```

迁移请求的原因、备份hash、运行角色或来源范围变化后不能复用旧成功回执；重新预览。初始化审计保存数据库操作者、原因、预览hash、明确清单与修改前目标行，成员到期时间也参与预览hash，防止两个不同日期被当成相同状态。既有账号/成员的expires_at不会被初始化清单静默清空。历史迁移的adopted-baseline表示显式采用的校验基线，不表示重新执行或已经证明历史SQL完全相同。

## Naumi Web侧对应配置

|Naumi设置|与runtime配置关系|
|---|---|
|NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID|对应tenant.sourceInstance|
|NAUMI_ENTERPRISE_DEPLOYMENT_MODE|shared或dedicated；同代码按部署策略选择|
|NAUMI_ENTERPRISE_ALLOWED_IDS|这里填写Naumi的sourceEnterprise，不是工作流enterpriseId|
|NAUMI_WORKFLOW_SERVICE_URL|指向本槽工作流API的回环地址，不能指向Worker端口|
|NAUMI_WORKFLOW_SIGNING_KID|必须在runtime.publicKeys中有对应kid|
|NAUMI_WORKFLOW_SIGNING_KEY|私钥只留Naumi Web；runtime只有匹配公钥|

真实Web登录、当前Naumi企业授权及实际员工访问必须另做受影响功能验收。runtime readyz中的sourceSessionVerification=external-login-probe-required明确指出它只验证配置/本地有效绑定，不证明真实Naumi用户已成功登录。当前18482的本机来源准备代理不因此自动升级成正式登录代理。

## 控制协议与发布门禁对接

API/Worker各自回环端口提供GET /healthz、GET /readyz。内部GET /internal/lifecycle/status、POST /internal/lifecycle/activate、POST /internal/lifecycle/drain、POST /internal/lifecycle/stop均需Authorization: Bearer CONTROL_TOKEN。POST只接受JSON：

```json
{
  "installationId": "INSTALLATION_ID",
  "releaseId": "EXACT_RELEASE_ID",
  "slot": "SLOT_NAME",
  "bootId": "OBSERVED_CURRENT_BOOT_UUID",
  "role": "worker",
  "operationId": "STABLE_OPERATION_UUID",
  "reason": "CHANGE_TICKET"
}
```

activate仅Worker支持，先检查真实本地就绪，再重新比对是否已经排空/被其他激活操作占用。首次成功202，原操作重试202且replayed=true，另一操作409。drain拒绝新业务但保留已进入的处理；stop在未drain或仍有活跃处理时409。接口不接受任意PID、shell命令、数据库恢复或发送任务重放。

发布控制器应记录并使用实时bootId；同端口被新进程接替后旧控制请求409。候选Worker只预热、不激活；切流与旧Worker停止领取/排空后，才按实际发布方案激活候选。真实旧JS/RSC协议兼容、源Web/Worker会话、代理路由与主机资源余量不是本接口自动证明的事实。保留外层全程部署锁与既有用户蓝绿约定。

## 包与验收边界

可运行包包含dist完整自校验文件、package.json/package-lock.json、模板和本文档，不包含实际配置、数据库、原始Excel、媒体或私钥。在Node24环境先npm ci --omit=dev，再按上述CLI启动。包内源文件/产品HTMLhash固定，运行包解压后的进程另做相同验收；依赖由锁文件约束，不能把本机成功替代Linux目标镜像验收。

本轮双槽测试是同一固定构建的两个真实进程共享独立数据库与交付目录，验证排空、持久化与目标校验，不冒充跨版本整站切流。64次/并发8的请求时延和RSS是本机参考观察，非4核8GiB服务器或全公司容量承诺。真实schema8、原导入表/附件和Naumi实例不在迁移执行对象中。
