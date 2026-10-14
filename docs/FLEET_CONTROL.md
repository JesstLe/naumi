# 中央控制台与企业连接器

## 环境划分
- 103是中央管理主站；47是首个独立企业Naumi部署，NAS适配和正式E2E均在47。其他企业沿相同接口注册，不复制客户专用源码。
- 本模块默认关闭，不改变任何现有生产实例。最新main的`docs/changes/2026-10-14-public-naumi47.md`记录其他会话已按新授权开放47 Naumi，媒体仍local；本任务不沿用旧“未开站”状态，也不更改它现有Naumi/旧Python参考工作台的服务、数据或入口。NAS与fleet接入仍独立验收。
- 用户/积分/素材/模型密钥留在对应实例；主站仅按请求接收必要管理结果及审计记录，不同步整库，不公开NAS文件。

## 已实现
- 总后台 `/admin/deployments`：实例注册、在线状态、版本/存储上报、查询用户、启停普通用户、积分调整、功能权限读写、密钥轮换和吊销、指令结果。
- 一次性实例密钥，中央只存SHA256；每实例独立身份，连接器主动HTTPS轮询，TLS证书由平台默认信任链验证，不关闭验证、不跟随重定向。
- 白名单操作、严格JSON和请求长度、签名绑定实例/命令/参数/有效期、nonce防重放；不接受远端shell/SQL/URL，Agent输出不进入执行通道。
- 中央逐实例持久化队列及租约；企业侧持久化执行回执。积分复用原账本operationId，权限复用版本CAS；收到重复指令只回原结果。失败明确，网络/DB异常保留重试，中央断开不影响企业生图。
- 站点管理员负责总控制台；企业岗位权限不等于总后台权限。企业连接器使用凭据不借用用户cookie，不授予企业管理员跨实例访问权。

## 配置模板
以下仅是字段示例；真实密钥不得提交。103需先就绪可信HTTPS，中央入口不可使用明文公网HTTP。

```dotenv
# 仅103中央应用
FLEET_CONTROL_ENABLED=1
# 企业47独立连接器进程；主站自身也可按相同协议注册本地实例
FLEET_CONNECTOR_ENABLED=1
FLEET_CENTRAL_URL=https://CENTRAL_HOST
FLEET_INSTANCE_ID=INSTANCE_UUID
FLEET_INSTANCE_TOKEN=ONE_TIME_INSTANCE_TOKEN
```

开发连接器命令：`node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/fleet-connector.ts`。固定运行制品用 `node scripts/build-fleet-runtime.mjs` 构建，生产执行 `node dist/fleet/connector.js`；不依赖tsx或源码解释器。`deploy/fleet.Dockerfile`提供Node24非root专用运行镜像；启停和systemd模板见deploy/examples/fleet-connector.service。使用与应用一致的受保护DB/配置环境，业务服务器不依赖开发电脑。
连接器身份和主站证书验证必须同时成立；Nginx覆盖转发协议/IP头，App仅绑定受控内网/回环，不允许公网绕过代理伪造 `x-forwarded-proto`。测试的HTTP回环例外由 `FLEET_ISOLATED_TEST=1` 显式启用，禁止在生产设置。

## 47接入前门槛
1. 47 Naumi独立应用及数据库就绪，不覆盖既有reference-workbench；NAS配置和网络已验证。
2. 103可信HTTPS中央入口就绪；运行实例登记/凭据通过受保护通道交付，不保存到作品或浏览器持久缓存。
3. 安装固定连接器制品和服务监管；重启/断网/密钥轮换真实验收。
4. 正式47账号及积分/权限受控验收、NAS端到端和回滚，完成后再开启远程管理。

## 仍待实现
- 模型配置模板及企业显式覆盖项，以及按授权查看积分流水/作品历史。
- 发布执行通道已实现但默认关闭；生产部署仍需本机固定hooks、47 NAS真实验收和正式接入。没有安装生产自动发布timer。
- 47真实企业环境和103上线验收；本机两库HTTP测试不是47真实E2E。
- 控制台用户/积分/权限的完整浏览器交互验收。注册/队列/刷新/浅色桌面1440与手机390已通过隔离真实Next验收，业务指令已通过真实HTTP+双DB回归；仍不替代47实机验收。

## 实例级运维授权（模块二）
总管理员在部署管理中为主站已有账号逐实例授予查看、用户状态、积分、功能权限、发布策略；支持有效期、版本CAS和撤销。运维账号只能看授权实例的状态/指令/审计，不能注册实例、轮换密钥、管理授权或登记主站验收版本。企业本机管理员身份并不自动等于103中央总管理员。
服务端入队和下发前复核权限；尚未下发的指令撤权后标失败，已经租出而结果未确认的指令标“待核实”，不伪称撤销了已执行积分。签名尚在有效期的已租指令可能完成，需要回收真实回执再审计。

## 发布计划与20:00基础
总管理员导入现有GitHub固定manifest，确认对应主站验收证据文件的SHA256；manifest三种镜像、仓库/标签/digest、实际主站心跳SHA和buildVersion必须一致。记录一经创建不可修改，证据摘要为管理员验收声明，不是自动证明测试通过。103多槽运行时需以实测匹配完整候选，不能把单一UI心跳当作核心/Worker三槽均已更新的证明。
企业站可配置跟随主站。定时规划以Asia/Shanghai的20:00为门槛，逐日/逐实例唯一，运行版本相同跳过；主站离线/心跳过期、当前运行版本未登记验收或实例停用则跳过。主站后来回滚到未验收版本时不会跟随最新Git提交。
发布计划冻结manifest和目标基线，支持授权人员暂停/恢复准备；当前切流执行器明确未启用。部署模板 `fleet-scheduler.timer/service` 只用于将来安装，不在本轮安装或启动任何生产定时器。中央调度运行 `node dist/fleet/scheduler.js`，必须同时启用FLEET_CONTROL_ENABLED和FLEET_SCHEDULER_ENABLED；默认0。
timer的Persistent补跑仍由当前北京时间窗口检查，早于20:00不安排旧计划。正式执行阶段必须重新验证候选、源/目标基线、兼容迁移/备份、部署锁和47 E2E，不能凭计划直接docker restart。

## 发布执行通道（模块三，生产默认关闭）

1. 中央 `FLEET_RELEASE_DISPATCH_ENABLED=1` 才签发冻结计划；企业连接器 `FLEET_RELEASE_RELAY_ENABLED=1` 才搬运签名信封。两者默认0，本机root执行器模板`enabled=false`、`nasAccepted=false`。开启页面跟随策略本身不会开启这些门槛。
2. 发布信封使用中央 **Ed25519私钥** 签名，不使用企业token签名。企业token仅认证HTTPS；非root连接器和企业root执行器只持中央公钥，因此连接器不能自行签造root部署命令。实例、计划、租约、有效期、实际目标基线和三镜像manifest都在签名内。
3. 中央推荐挂载专用私钥文件，配置`FLEET_RELEASE_SIGNING_PRIVATE_KEY_FILE`；Linux须普通非symlink文件、root或进程UID所有、0400/0600，不允许组/其他读写。配置文件读取失败不退回inline旧key。生产私钥不进入镜像、仓库、日志或47。inline PEM仍兼容受保护环境，但文件优先。
4. 企业公钥`FLEET_RELEASE_SIGNING_PUBLIC_KEY`用于relay验签；本机root的`publicKeyFile`用于OpenSSL ED25519验签。两处同一个中央公钥。远端任务不提供shell、路径、端口、URL或hook。
5. 租约初次签发后持久化原信封；未过期重复poll只重发原租约，不重新签发执行身份。relay已写同信封时不重复写。丢poll/ack可重试；过期且结果未知转blocked，不盲目重发部署。root持久化started/result：执行中断需人工核实，原回执可在信封过期后重报、不会再次部署。blocked相同回执重试也不重复审计。

### Root与relay的本机边界

模板见`deploy/examples/fleet-release-executor.json`、service/timer。root代码包必须一起安装`fleet-release-executor.py`、`fleet-release-scan.py`、`github-release-manifest.py`；Python3、OpenSSL、Docker CLI、Nginx、pg_restore由现场提供。模板不是已安装或已验收证明。

- config、公钥、activeState、企业env、Nginx配置/模板、hooks及其所有父目录：root所有，无group/world写，非symlink；程序与解释器也由root管理。状态目录0700。
- inbox由非rootrelay写入，内容完全不可信；root只读取受限大小且验签的固定JSON。outbox由root写，目录root:relaygroup 0750，无relay写权限；结果文件与active-status.json为root:relaygroup 0640。relay只读结果，不挂载Docker socket、不开放SSH/DB控制入口。
- `statusFile`固定在outbox；只含本机三槽端口，不含秘密。连接器配置`FLEET_ACTIVE_SLOTS_FILE`读它后逐个请求真实`/api/version`，三槽SHA/版本一致才上报；文件缺失/畸形、混版或断网报unknown，不能退回旧版本或连接器镜像SHA。host上的systemd连接器或host-network容器才可读本机loopback端口。固定三origin配置仍适用于未接入执行器的实例；不能把连接器容器自身localhost误当宿主机。
- locks父目录及锁文件均root管理；全程非阻塞同时持Naumi与Hub两锁。别人持锁则blocked，不抢锁、不删除锁文件。

### 发布与回退门槛

root执行器先核对activeState的SHA、版号、三槽container/image ID和受保护env/gateway指纹，校验七个本地hook的SHA256。可用空间至少10GiB且20%；缺任一门槛不执行发布。`candidatePortRange`由root配置，选3个真实空闲loopback端口、避开当前槽；保留旧槽不会导致下一天固定端口冲突，端口耗尽明确失败，不停止旧服务腾端口。

必需hook返回有`ok=true`的JSON；只有root现场确认并hash固定的脚本可执行：

| Hook | 强制输出/现场职责 |
| --- | --- |
| backup | `databaseDump`必须在本次证据目录，非空且`pg_restore --list`可读；额外保存企业配置与回退材料，禁止打印秘密 |
| compatibility | `backwardCompatible=true`；只允许兼容加法迁移，核查旧应用/worker共存；不还原旧业务库 |
| preaccept | `nasE2E=true`；旁路槽真实账号/积分/权限、NAS Put/Get/Range/Delete和跨账号鉴权；只清验收对象 |
| gatewaytest | `nginxSyntax=true`；完整现场Nginx配置验候选，旧hash静态资源fallback及三flavor分流 |
| postaccept | `publicE2E=true`；公开受控账号的实际版本、页面与API，不只HTTP200 |
| workers | `inflightPreserved=true`；旧在途任务完成、单一worker接管规则，不取消用户生图 |
| rollbackcheck | `oldVersionServing=true`；实际旧槽可访问、数据/积分/媒体和配置未回灌 |

只pull manifest指定固定GHCR digest，检查linux/amd64、SHA/版号/flavor标签；旁路三槽禁止worker与中央控制入口。preaccept通过后再次核基线/env/gateway，Nginx语法检查后平滑reload，postaccept/workers通过才写accepted。旧槽保持供在途与静态fallback；失败恢复旧gateway/activeState/statusFile、reload并验旧版本，不回灌DB/积分/媒体。失败旁路槽目前保留作证据，现场每3次发布按既有持锁盘点规则清理本任务失败槽；保留当前及最近两成功版本，不无筛选prune。进程/主机断电后的started状态需现场核实并恢复，不声称跨文件原子切流。

### 验证边界

本机真实HTTP测试覆盖Ed25519、独立实例、丢poll/ack、租约/回执幂等、过期unknown和默认关闭；Linux root合同覆盖验签、路径/锁/NAS/备份/回退/保留配置（Docker和业务hooks模拟）。独立真实Linux Nginx+六HTTP容器覆盖平滑切换/旧在途/旧hash/三flavor回退；它不是Naumi生图或NAS现场验收。生产103/47、正式7个hooks、可信证书/凭据及NAS端到端仍另行验收。

## 历史NAS配置定位（2026-10-14）

原会话“Naumi · 画布批量生成与账号管理”确认：受保护且git ignored历史完整env在`E:/Workspace/naumi/output/staging-data-20261008/production.env`，S3必要字段及两密钥非空；只提取S3字段，不整份复制其他生产秘密。历史endpoint `http://172.17.0.1:3900`是旧应用主机内部网关，不是47已可达的NAS地址，旧密钥当前有效性未确认。
本机隧道/保活脚本在`E:/Workspace/naumi/audit-artifacts/nas-garage-20260930`且仍指旧101，禁止直接执行。NAS端历史路径`.garage/config/garage.toml`、`.garage/secrets.env`、`.gateway/start-tunnel.sh`、`.gateway/tunnel-supervisor.sh`在`/volume1/naumi-media`下；NAS端当前存在性/47隧道尚未远程验证。旧Put/Get/Delete和重启证据见`docs/NAS_GARAGE_GATEWAY_2026-09-30.md`，不替代47现场E2E。

## 回退
先停连接器，并关闭 `FLEET_CONTROL_ENABLED`；既有企业业务独立运行。回退应用制品不恢复旧用户库/积分/作品/NAS，新增fleet表只保留审计。已执行的积分不能用源码回滚撤销，应另记明确反向业务操作。轮换密钥须在企业重新配置，旧密钥立即拒绝。

## 继续开发交接提示
```text
继续codex/fleet-control-20261014，读取任务记录，刷新origin/main并保护共享checkout。
复用fleet控制通道和既有发布runbook，补实例级角色、模型模板与每天20:00版本同步。
仅允许已验收不可变版本；不接受任意shell/SQL/URL，不覆盖企业DB/媒体/密钥。
103是总后台，47是企业NAS正式E2E目标；先完成47独立环境门槛，不覆盖旧工作台。
每模块更新文档，集中测试和独立回滚，push/合main分别记录；未上线不得称完成上线。
```
