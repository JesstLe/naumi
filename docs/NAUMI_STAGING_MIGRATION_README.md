# Naumi 新服务器预发布与晚间回传方案

> 状态：新机 app/Worker/Router 与下载代理正常；全量媒体、生图、改图、真实 OCR 与失败视频退款通过；固定镜像回传包及全量快照增量迁移/恢复演练完成；OSS opt-in overlay 和两种寻址的隔离测试已通过，未真实切换 OSS。视频成功出片（供应商 401）、本人密码登录、OSS 参数及晚间生产回传尚未完成。源端既存媒体缺失和未运行的本地业务适配器单独记录（2026-10-09）。
>
> 本文是本任务的交接入口。后续 Agent 先阅读本文，再检查本文列出的状态、证据和阻塞项；不要凭对话上下文猜测迁移进度。

## 1. 目标

建立一套长期可用的 Naumi 预发布环境：

- 旧服务器 `101.133.166.67` 持续承担生产流量，不因准备工作停机。
- 新服务器 `120.27.162.85` 用于构建、部署和真实业务测试。
- 新服务器拥有旧服务器的完整数据库和完整历史媒体副本，不做数据脱敏；当前只有用户本人测试。
- 新服务器允许真实模型调用和真实消费，测试数据只写入新服务器副本。
- 新服务器暂不接 NAS，媒体使用本地持久化目录；后续新环境贯通后独立切换 OSS。
- 验收通过后，在下班窗口将固定 commit 的镜像、代码发布包、配置变更和必要的增量迁移回传到旧服务器；不使用新服务器测试库覆盖生产库。

## 2. 环境边界

| 环境 | 地址 | 用途 | 数据写入 | 媒体 |
|---|---|---|---|---|
| 生产 | `101.133.166.67` | 对外服务 | 生产数据 | 现有 NAS/对象存储配置 |
| 预发布 | `120.27.162.85` | 构建、测试、真实内测 | 生产数据的独立副本 | 新服务器本地磁盘 |

严格禁止：

- 预发布应用连接生产数据库或生产媒体写入路径。
- 预发布 Worker 自动重放复制过来的历史任务、退款、结算或发送生产通知。
- 将预发布数据库、测试用户、测试账单、测试媒体反向覆盖生产。
- 生产使用 `latest` 镜像；发布必须使用完整 40 位 commit tag 和镜像摘要。

允许：

- 在预发布环境使用完整真实数据进行查询、编辑、生成和消费测试。
- 预发布真实调用供应商；消费记录、积分变化、账本和媒体均留在预发布副本。
- 由用户本人访问预发布环境。

## 3. 当前基线

- 本地仓库：`E:\Workspace\naumi`
- 当前本地分支：`codex/supplier-cost-reconciliation`
- 准备前本地 HEAD：`e638540ac09fbad03ed20fa8e034e007cd202c21`；接手时重新执行 `git rev-parse HEAD`，不能将工作分支未提交修改直接当作生产候选。
- 生产发布入口：`scripts/deploy-release.sh`
- 生产回滚入口：每个 release 目录生成的 `ROLLBACK.sh`
- 生产应用：Docker Compose，包含 `app`、`db`、`video-worker`。
- 生产配置、数据库、媒体和模型 Router 的真实状态必须以服务器只读检查结果为准。

### 本次已核验的实际状态（2026-10-08，生产只读）

| 项目 | 结果 |
|---|---|
| 新服务器系统/架构 | Ubuntu 24.04.5 LTS / x86_64 |
| 新服务器 CPU / 内存 | 4 核 / 7,526 MiB |
| 新服务器磁盘 | 总量约 99 GiB；准备前可用约 92 GiB |
| 生产 CPU / 内存 | 2 核 / 1,613 MiB；只读检查可用约 234—242 MiB |
| 生产磁盘 | 40 GiB，剩余约 5.5 GiB |
| 生产固定 commit | `84e1afdee61013f3d5320b00bf688ae125b98179` |
| 生产镜像 ID | `sha256:888b156a7d77fcd3a0cea9f4c8cdb01d6a728f494041ac7397227d48e34135c1` |
| PostgreSQL | 48,045,079 bytes（约 46 MiB） |
| 用户 / 作品 / 账本 | 76 / 2,381 / 1,444 |
| 生图任务 / 视频任务 | 276 / 0 |
| 未结算生图任务 | 1（保留核对，不自动重放） |
| 生产 S3/Garage 对象 | 4,767 个，8,641,139,439 bytes（约 8.05 GiB） |
| 生产残留本地媒体卷 | 约 6.0 GiB；与 S3 可能重复，不相加推断完整性 |
| 生产健康 | `/api/health` 正常，数据库正常；生产服务未重启 |

上表是检查时的快照，不代表未来计数不变。复制全量数据时重新记录源端计数、时间和一致性快照。

## 4. 实施阶段

### 阶段 A：新服务器只读盘点

核验：

- SSH、操作系统、CPU、内存、磁盘和 Docker 版本。
- 是否存在旧项目、旧容器、旧数据卷或端口冲突。
- 出口网络、GHCR/镜像获取、模型供应商连通性。
- 新服务器本地可用空间是否容纳“全量媒体 + 测试增量 + 镜像缓存”。

此阶段不改生产服务器，不创建生产数据连接。

### 阶段 B：建立预发布骨架

- 固定目录、独立 Compose project、独立数据卷和本地媒体目录。
- 导入固定版本镜像或在新服务器构建候选镜像。
- 复制生产配置到受保护的预发布配置文件；不写入 Git、日志或交接文档。
- 设置预发布入口为仅用户本人可访问。
- 保持预发布 Worker 停止，直到历史任务重放保护检查完成。

### 阶段 C：全量数据复制

1. 从生产 PostgreSQL 获取一致性 dump。
2. 将完整数据库恢复到新服务器独立 PostgreSQL。
3. S3/Garage 只作为历史对象的只读导出来源，导出完成后新环境不依赖 NAS 隧道。复制完整本地媒体/历史对象到新服务器本地目录；路径和权限保持兼容。先复制残留本地文件，再用当前 S3 对象覆盖同名文件，保留源端哈希清单，不删除生产对象。
4. 核对用户、作品、画布、任务、积分、账本和媒体数量。
5. 保留不可变原始 dump。历史任务来源清单与“复制后新任务”明确区分：预发布恢复队列跳过历史任务，保留状态、费用和账务供查询；未经专门演练，不直接把 queued/processing 改成失败或调用退款函数。只停止 Worker 不足以防止页面惰性轮询恢复；应用页面/API 恢复路径也必须完成保护后才能启动带真实供应商配置的副本。
6. 记录源端和目标端计数、dump 哈希、媒体清单哈希和恢复时间。

生产在复制期间继续运行。数据库用一致性快照，媒体传输用可重试清单并补齐缺失引用；动态生成/删除导致的差异单独列明，不把大致计数相同当作完整一致。最终晚间发布前再做一次生产数据库备份用于发布恢复，而不是将预发布数据写回生产。

生产机器内存和磁盘都紧张：不在其上打包全量媒体，不并行执行高负载任务。计划将 dump/媒体流式传输到新服务器或受保护的中转目录，分批限速、可续传；公网健康变差时暂停复制。限速约束是为了保留老服务器正常服务，不是消费预算限制。

### 阶段 D：预发布真实测试

测试内容：

- 登录、管理员权限和账号隔离。
- 历史作品、画布、图片、视频读取。
- 上传、生成、编辑、下载、删除和任务查询。
- 真实模型路由、真实消费、失败退款、冻结和账本记录。
- 视频 Worker、重启恢复、幂等结算和异常任务保护。
- 本地媒体读写、磁盘增长和服务重启恢复。
- 构建、镜像启动、数据库迁移和回滚副本演练。

用户已授权预发布真实消费且不设置额外预算上限；每次真实测试记录任务 ID、模型、费用和结果，不使用复制来的历史任务重放。生产支付回调、短信/邮件、外部业务通知和 Router 配置管理不会因“允许模型消费”自动获得向生产写入授权，须隔离环境。复制加密配置时保留 `SETTINGS_SECRET` 等必要解密密钥，独立生成预发布数据库与 Worker 凭据。

### 构建与配置入口

- 新服务器将作为主要构建与测试机器；GitHub Actions 保留为校验/备份通道，本次尚未改写 CI 调度。
- 构建源码必须对应已提交 commit，不把本地 `.next`、`node_modules`、环境文件、dump 或媒体打入镜像。
- 对应同一候选镜像完成预发布验收后 `docker save` 导出并回传；生产不再次构建另一份镜像。保存 commit、架构、BUILD_VERSION、镜像 ID/摘要、构建参数和测试结果。
- 模板：`deploy/staging/docker-compose.yml`、`deploy/staging/.env.example`。
- 主机初始化：`scripts/staging/bootstrap-host.sh`；调用必须设置 `NAUMI_STAGING_BOOTSTRAP=120.27.162.85`。
- 只读生产盘点：`scripts/staging/production-readonly-inventory.sh`。通过 stdin 传入 SSH，Windows 管道先去除 CRLF；不上传或修改生产文件。
- 配置核验：`scripts/staging/verify-compose.py` 检查 resolved Compose JSON。含真实凭据的 JSON 使用 0600 临时文件，核验后删除，不回传到日志。
- 新机目录：`/opt/naumi-staging/{config,snapshots,evidence,releases,source,data}`；媒体目录：`/opt/naumi-staging/data/media`。
- app 暂只绑定 `127.0.0.1:13012`，通过 SSH 隧道供用户本人访问；数据库不发布端口，Worker 使用 opt-in profile，默认不启动。
- 源端配置里的模型 Router 不是一个可以直接复用的生产管理端点。复制实际模型/计费版本与快照到独立 Router，核验管理/生成/费用端点均属于预发布，禁止从测试页面修改生产生效配置。

### 阶段 E：新环境独立迁移 OSS

在预发布本地存储验证完成后单独执行：

1. 创建独立 OSS bucket/前缀。
2. 全量复制本地媒体，校验对象数量、大小和内容哈希。
3. 停止预发布写入，补齐增量。
4. 切换 `STORAGE_DRIVER` 和 S3/OSS 配置。
5. 验证历史媒体、上传、生成、下载、Range/视频读取和删除。
6. 保留本地副本，稳定后再清理。

此阶段不自动改变生产 NAS 配置。

### 阶段 F：下班窗口发布回生产

1. 从预发布验收记录中选定固定 40 位 commit、镜像摘要和迁移清单。
2. 生产备份数据库、配置、Nginx 和必要本地数据。
3. 检查生产在途任务、冻结积分和待人工核对任务。
4. 短暂维护，暂停新写入；不清理或强行结算异常任务。
5. 使用 `scripts/deploy-release.sh` 发布固定镜像。
6. 只执行已审查的 additive 数据库迁移。
7. 验证 `/api/health`、数据库、应用/Worker 版本、登录、历史媒体和关键业务路由。
8. 恢复入口并观察；保留旧 release 和回滚脚本 3—7 天。

回传对象是代码/镜像/配置/迁移，不是预发布数据库。生产当天产生的新用户、任务、账单和媒体必须保留。

## 5. 验收门槛

只有以下项目全部有证据，才能进入晚间回传：

- [x] 新服务器资源和磁盘容量确认。
- [x] 完整数据库恢复，初始 69 表计数/行哈希一致；测试新增数据与原始快照分开记录。
- [x] 完整源媒体清单 4,767 对象全部大小/MD5 一致；4 个不在源清单且生产已 404 的历史引用另列，不宣称历史引用零缺失。
- [x] 历史任务重放保护通过，Worker tick / restart 未重复提交。
- [ ] 全部真实生成/编辑/视频验收完成：生图、局部改图通过，视频成功出片因供应商 401 未通过，不能勾选全模块完成。
- [x] 生图/局部改图账本结算一次、失败视频退款、预约清理和重复轮询保护通过；独立 billing 全套回归通过。
- [x] 新测试任务本地媒体重启恢复通过；全量源清单媒体完成，撤掉 NAS 导出隧道后本地读取通过。
- [x] 镜像 commit、image ID 和构建日志已记录；生产回传 tar 校验仍待准备。
- [ ] 生产回传包、数据库备份和回滚脚本已准备。

## 6. 回滚

- 预发布失败：销毁/重建预发布容器和副本，不触碰生产。
- 生产代码启动失败：按 release 的 `ROLLBACK.sh` 切回上一 release。
- 生产迁移失败：保留新增结构，停止新版本，按在途任务和账务状态决定回滚代码；不恢复旧数据库覆盖新账务。
- 生产已产生新任务或扣费后：先封存新版本数据库和证据，再执行代码回滚；禁止直接用预发布库替换生产库。

## 7. 交接规则

接手 Agent 必须先查看：

1. 本文档。
2. `git status`、当前 commit 和远端状态。
3. `output/staging-setup-20261008/VERIFICATION.txt`（若存在）。
4. 本文“当前状态”和“阻塞项”的最新更新。

每推进一个阶段，更新本文的状态、命令、结果、时间和证据路径。凭据、私钥、API Key、完整 `.env` 和明文备份不得写入本文或 Git。

## 8. 当前状态（2026-10-08，本轮重新核验）

- [x] 用户确认完整不脱敏副本、本人测试、真实消费无额外预算上限；不接 NAS，后续独立迁 OSS。
- [x] 新机 Docker 29.1.3、Compose 2.40.3 与 Mihomo v1.19.32 均 active；Docker/Mihomo 开机恢复已验收。
- [x] PostgreSQL、生产固定 app 与 Node 24 基础镜像离线导入，档案哈希核对通过；不再循环重拉超时的大镜像。
- [x] 全量一致性 dump 恢复为工作库 `naumi_staging` 和参照库 `naumi_snapshot_reference`；69 张 public app 表全行 JSON 排序哈希相同。用户 76、作品 2381、账本 1444、图片任务 276、视频任务 0。
- [x] 原 dump 1,177,992 bytes，SHA256 `4e95627f2a4b65b0089e9f1ab13e1ad7190460d422a61bd2f6953fae6e4e007d`；原配置和 dump 0400，快照父目录 0700。
- [x] 工作库建立 `naumi_staging_guard.origin_rows` 和历史 UPDATE/DELETE 防护；原任务和账务内容不改写。独立第三库恢复演练通过，演练库已删除。
- [x] 历史 helper 首轮类型检查/fixture 通过：生产默认无额外来源查询，错误环境失败关闭。
- [x] 新机独立克隆库真实 runtime 验收：`STAGING_HISTORY_RUNTIME=PASS IMPORTED_ROWS=UNCHANGED PAID_REPLAY=0 RESUMED=0 NEW_TASK=SETTLED`；历史 claim/due/sweep/paidOperation/费用补查/后处理保护通过，新增 fixture 可保存和结算。fixture 库及其临时 env 已清理，工作副本未变。
- [x] S3 全量媒体复制完成：4,767 对象、8,641,139,439 bytes，全部大小和 MD5 一致；目标 `/opt/naumi-staging/data/media`。服务 inactive / Result=success / MainPID=0；完成标记为 `2026-10-08T14:30:40Z`。此前 310 MiB / 3.5 GiB 为中途观察，不再代表当前状态。
- [x] 旧本地媒体来源清单已核验：3,658 文件 / 6,366,112,727 bytes，全部 key 已在 4,767 S3 对象清单中；local-only=0。因此不重复传输旧本地卷，同名使用当前 S3 权威对象，仍须目标内容核验。
- [x] 独立 Router 已安装启动：`naumi-staging-router.service` enabled/active，generation/management 分别只绑定新机 Docker 网关 `172.18.0.1:18081/18082`。独立令牌、execution store、capacity 回调；管理与 models 查询 HTTP 200，旧管理令牌和无凭据访问被拒绝，未调用供应商。
- [x] 新机 npm ci 已成功（官方直连、8 sockets、持久 cache）：`STAGING_NPM_CI=PASS HOST=STAGING COMMIT=959f14fc8445a4b7aa9c2b4fcc2233de0caf627b LOCKFILE=UNCHANGED` / 0。代理首次 ECONNRESET / 1 已记录，不以此成功覆盖失败事实。
- [x] 新机候选 `65adfe8742e7a1fe120e7ce7a94409c50c76eb44` 的 TypeScript/helper/runtime 验收通过。clean 包 SHA256 `47cf7cc203951e4b7baa4d28a38bae2464f8e11d47316175511d60595b098d9b`；仅复用同 lockfile 的新机依赖缓存。
- [x] 候选 `65adfe8742e7a1fe120e7ce7a94409c50c76eb44` 已在新机 Next build 并打包固定镜像；ID `sha256:3cda12e2fe7ce6a6a5ebfb2d0448186569c6ec83a946a82cf111b94963f54056`，BUILD_VERSION `1791464553`，revision label 已核验。初次 Next build 成功但打包脚本输出目录误用 `.next-staging`；随后复用同一 `.next` 产物打包成功，没有伪造前次状态或再次本机构建。
- [x] 新机 app/Worker 已启动；health=200 DB=OK，未鉴权 admin=403，会话 fixture admin=200，模型目录=200（13 模型）。浏览器真实访问登录页面；密码登录尚待用户本人完成，测试未修改原账号密码。
- [x] 首笔真实生图完成：`job-234bb140-6937-45ae-ba2d-4e50711a27f3`，模型 `gpt-image-2`，done/settled，charged=6，reserved=0，ledger rows=1，supplier calls=1，本地媒体=200。保留任务/账务证据，不删除已消费流水。
- [x] Worker tick=200，processed=0，历史 image leases=0；没有重放复制任务。
- [ ] 用户本人密码登录仍待本人在浏览器完成；历史读取/局部改图/失败视频退款已通过，视频成功出片受供应商 401 阻塞；生产回传包待准备。
- [ ] OSS 迁移、下班窗口回传生产。

## 9. 证据、恢复与交接

本地证据：`E:\Workspace\naumi\output\staging-data-20261008`；新机快照 `/opt/naumi-staging/snapshots/20261008-full`，数据库哈希证据 `/opt/naumi-staging/evidence/database-{reference,working}-hashes.txt`。

已执行结果（0 表示退出状态）：

- `bash /opt/naumi-staging/config/verify-database-copies.sh` → `DATABASE_ALL_PUBLIC_TABLES=IDENTICAL APP_TABLES=69` / 0。
- 历史防护 SQL → `MODIFIED_HISTORY_MUTATION=BLOCKED`、`MODIFIED_LEDGER_MUTATION=BLOCKED`、`NEW_TEST_TASK_WRITES=ALLOWED`、`HISTORY_GUARD_VERIFICATION=PASS FIXTURE_DATA=ROLLED_BACK` / 0。
- `/opt/naumi-staging/config/ROLLBACK.sh --fixture` → `DATABASE_ROLLBACK_FIXTURE=PASS ORIGINAL_DUMP_RESTORED=1 PRIMARY_STAGING_DATABASE_CHANGED=0` / 0；这是另一个库的恢复演练，不是撤销工作库保护。
- `npx tsx --conditions react-server scripts/staging/verify-history-helper.ts` → `STAGING_HISTORY_HELPER=PASS PRODUCTION_DEFAULT=UNCHANGED FAIL_CLOSED=1` / 0；首轮类型检查通过，后续新模块需要新机真实库验收。

### 已结束的媒体导出（2026-10-09）

- 复制使用 rclone copy（非 sync），单传输/单检查、2 MiB/s 上限、CPUQuota 50% / MemoryMax 256 MiB；不删除源对象。
- 来源隧道：Windows → 旧机 `-L 127.0.0.1:13900:172.17.0.1:3900`；Windows → 新机 `-R 127.0.0.1:13900:127.0.0.1:13900`。工具会话 `82211`、`16137` 已关闭，源端口只供历史导出；不再是运行依赖。
- 完成标记 `MEDIA_S3_IMPORTED` 与全清单内容核验均已通过；数据库引用检查见第 12 节。旧本地媒体无独有 key，不重复复制。
- 两条媒体隧道已关闭；临时 key 的源 hash 在忽略目录 `output/staging-data-20261008/{new,old}-source.sha256`。原 hash 已复核，原私钥未修改。上一轮 PowerShell 删除命令被执行环境拒绝；本轮已删除两个历史临时副本，app SSH 会话独立保留。
- 导出用私有 `config/media-import.conf`、bucket 文件和临时源查询脚本已删除；受保护原始快照保留，app 不包含源媒体凭据。
- 本轮曾将临时新机 key 误传旧机临时目录；已删除且复查不存在。旧机生产服务配置/数据未改，未重启服务；不要把临时文件操作描述成全部只读。

### 独立 Router 和配置待办

- 生产 Router 位于 `/opt/naumi-gateway/current`，service `naumi-router.service`，state `/var/lib/naumi-gateway/router`；`E:\Workspace\router` 是另一个项目。
- 新机 Router 工作目录 `/opt/naumi-staging/router`；非 root 专用用户，配置 0600，state 0700。旧 execution DB 不导入，以防复制供应商在途任务。
- 新机原始 Router 快照包 SHA256 `d91d3a8f427517b38fab6f354d235587a365516329dff16ff93cb8a0dd43ffda`，解压在快照目录 `router/`。
- 已按实际源码纠正：`configurations.db` 是 **bbolt**，不是 SQLite；SQLite integrity_check 已失败并未作为验收。工作副本 hash 与原始快照一致，Router 成功打开、重建保留版本并返回管理状态；需要进一步 bbolt 页/事务一致性检查时使用 bbolt 工具，而非 sqlite。
- 工作 Router 使用独立 state、generation/management token、监听端口和新机 capacity 回调；不复用生产管理地址。
- app 真配置 `/opt/naumi-staging/config/.env` 已通过生产键白名单生成，0600，保留生产 SETTINGS_SECRET 与独立 Router envelope secret；独立 DB/Worker/Router token，清空源存储和旧内网依赖。仅数据库恢复用 `.env.db-restore` 的 SETTINGS_SECRET 是随机占位，不能用于 app。
- 应用读取 SMTP、短信、微信登录及支付配置时，预发布强制关闭外部动作，不删除数据库原始配置；模型调用不受这一关闭影响。已通过真实库/runtime 验收：`STAGING_EXTERNAL_ACTIONS=BLOCKED SMTP=OFF SMS=OFF WECHAT=OFF PAYMENT=OFF` / 0。
- 生产 Yutang 配置是旧宿主 `host.docker.internal:8766`；它是鱼塘业务工具适配器，不是生图/视频供应商。2026-10-09 刷新检查该端口拒绝连接，旧机也没有运行它；新机缺此宿主别名。OCR 实际走公网视觉模型，真实验收见第 15 节，不再假设存在一个运行中的旧 PaddleOCR 实例可搬迁。

## 10. 下一执行点

1. npm ci、候选构建、runtime 已完成；不重跑整套。先核验运行 app/Worker 的实际镜像、最近日志和媒体传输。`prepare-build-deps.sh <commit>` 从原 lockfile 安装并保存 lock hash；`build-candidate.sh <commit>` 在新机运行 Next build，用同一 standalone 输出构建固定 tag 镜像（revision label/BUILD_VERSION），不含本地构建产物或凭据。`scripts/staging/run-history-runtime.sh <40位commit>` 只克隆工作库为独立 fixture、运行测试并清理，不修改工作副本。
2. 媒体复制与全清单 MD5 已完成；不重跑整卷导出，不为 4 个源端既存缺失伪造文件或改写历史任务。继续历史页面抽样验收，源缺失需要单独恢复来源。
3. 独立 Router/app 白名单配置已生效，后续只补齐旧 Yutang/OCR 依赖所需的独立实例，不改已有公网供应商地址或生产管理端。
4. app/Worker 已通过历史隔离门槛并启动；历史读取、真实改图及失败视频退款已验收，见第 13 节。本人密码登录、成功视频仍未验收。已有付费测试只通过第 14 节 wrapper 查询，先恢复 receipt，不直接重提任务。
5. 同一候选镜像与干净源码已在新机打包并核验，见第 14 节；更新本文和交接四件套后选择性提交推送。晚间回传与 OSS 为后续阶段，目标保持 active，准备包不等于生产发布。

### 接手提示词

```text
继续 Naumi 新服务器预发布任务。任务 worktree 是 C:\Users\13357\.codex\worktrees\staging-media-handoff\naumi，分支 codex/staging-media-handoff；主工作区 E:\Workspace\naumi 由其他工作使用，不切换或覆盖。先读 AGENTS.md、README.md 和 docs/NAUMI_STAGING_MIGRATION_README.md，再核验 Git 和实际 runtime。旧机 101.133.166.67 持续生产；新机 120.27.162.85 使用不脱敏全量副本、本地媒体、独立 Router，允许真实消费，仅用户本人测试。全量复制与候选构建已经完成，勿重复导出或构建。候选 65adfe8742e7a1fe120e7ce7a94409c50c76eb44，已有生图/改图/失败视频 IDs 与 host receipt 见第 13、14 节。已有功能验收通过 run-functional-receipt.sh 恢复 receipt，勿直接重提付费任务。继续处理视频有效凭据、本人浏览器登录、独立旧内网依赖、OSS 参数以及晚间回传门槛；包已在新机，准备不是发布。禁止回灌测试库、串写生产或重放历史任务。每阶段更新 README、literal 证据、四件套与剩余项，选择性提交推送；凭据不进 Git/日志，原私钥不改，临时副本用后清理。
```

## 11. 下载代理（2026-10-08 用户追加授权）

- 用户允许新机安装 Clash 并复用本机配置，供下载使用。安装的是官方 Mihomo/Clash 兼容内核 `v1.19.32`，Linux amd64-compatible；压缩包 SHA256 与 GitHub release asset digest 一致：`ba3ce607747a07f948fc35780e108a4a7c7f552a38b9bd4d115f313ebcb89c20`。
- 原本机 Clash 配置未修改。新机副本保留 52 个节点、516 条规则和本机当前选择；处理 YAML 将部分 REALITY short-id 当科学计数法的问题，保持原始十六进制文本语义，不更换节点凭据。
- 新机 HTTP/SOCKS mixed proxy：`127.0.0.1:7897`；DNS 只监听 `127.0.0.1:1053`，不改宿主 DNS。关闭 TUN、自动路由和控制面，不开放公网代理，不接管 Naumi 应用流量。
- 服务：`mihomo.service`，开机启动，非 root 专用用户，失败自动恢复；配置 `/etc/mihomo/config.yaml` 为 root:mihomo 0640；私有安装包 `/opt/naumi-staging/config/proxy-package` 为 root 0700。
- Docker 专用代理 drop-in：`/etc/systemd/system/docker.service.d/20-naumi-proxy.conf`。只重启了新机 Docker（没有容器运行），没有改老服务器或全局应用环境。
- CLI 下载按需用 `naumi-with-proxy <command>`；私有 GitHub 仓库仍需要独立认证，网络可达不等于拥有仓库读权限。此前未推送的状态记录提交已通过本机现有代理推送成功。
- 新机 Docker 构建涉及容器内 npm 下载时，明确使用 `--network=host` 与预定义代理 build args；这些参数不作为运行时全局代理或写入镜像环境。

```bash
naumi-with-proxy curl -fsSL https://github.com/MetaCubeX/mihomo/releases/latest -o /tmp/mihomo-release.html
docker build --network=host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7897 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7897 \
  --build-arg NO_PROXY=localhost,127.0.0.1,::1,.local \
  --build-arg BUILD_VERSION=<候选提交时间戳> \
  -t ghcr.io/jesstle/naumi:<40位候选提交> .
```

- 操作脚本：`scripts/staging/export-mihomo-config.cjs`（只导出到受保护的忽略目录）、`scripts/staging/install-mihomo.sh`（新机专用，拒绝生产 current/已有容器）。源码里不保存代理配置、节点凭据或订阅链接。
- 回滚：`/opt/naumi-staging/config/proxy-package/ROLLBACK.sh --check`；实际卸载为 `--apply`，会关闭 Mihomo、移除本次 Docker drop-in 并重启新机 Docker，保留私有安装包。副本演练使用 `--fixture /opt/naumi-staging/evidence/proxy-rollback-fixture`，不停止正在使用的代理。
- 代理服务刚重启时应等端口就绪再验证；不要在镜像/数据传输过程中重启代理。一次镜像拉取与代理重启重叠导致 EOF，按原镜像 tag 续拉，不把该次视为成功。
- 已完成真实文件下载（上游 README 3,194 bytes）和 `hello-world` 镜像拉取，镜像 ID：`sha256:5e23090353324d887c48ad5e5c56d294eab81588df9605b07d1afe895f9cc8f8`。代理重启后 GitHub 再次 HTTP 200，Mihomo enabled/active，Docker info 确认 daemon 使用回环代理。
- PostgreSQL/Node 大镜像下载多次超时，已切换为哈希验证的离线导入；PostgreSQL 数据库已启动，app/Worker 已使用新机构建的固定候选启动，状态见第 8 节。小镜像与离线导入不单独代表源码构建链验收完成。

### 本轮模块脚本

- `history-origin-guard.sql` 初次导入保护；`extend-history-guard.sql` 针对既有副本仅扩展后处理来源，不重建历史来源。
- `verify-history-runtime.ts` 读取历史 ID、运行 claim/due/sweep/paidOperation/费用补查/后处理路径，在独立克隆验证历史记录哈希不变；新增 fixture task 可以保存和结算；供应商 fetch 使用 mock，不产生真实费用。
- `prepare-router.py` / `install-router.sh` / `verify-router.py` 准备工作 Router 与只读管理握手；系统依赖 `acl` 已装。
- `prepare-app-config.py` 只白名单导出，绝不打印密钥；已存在配置时停止覆盖，先核对现有状态。
- `prepare-build-deps.sh` / `build-candidate.sh` / `deploy/staging/Dockerfile.runtime` 为新机依赖、构建及固定候选镜像入口。

### Runtime 验收说明（2026-10-08）

- 首轮 runtime 断言发现旧 supplier-call 表添加新 nullable 列后 `to_jsonb(r)` 形状发生变化；历史字段值没有改变，DB UPDATE/DELETE 触发器未被绕过。测试已改为显式投影全部原始列，并保留表名/hash 诊断，兼容已审查的 additive schema。
- 第二轮在新机 `run-history-runtime.sh 65adfe8742e7a1fe120e7ce7a94409c50c76eb44` 全部通过 / 0：历史原始字段无变化、新任务结算正常、外部通知/支付关闭。供应商 mock fetch 0 次，不是“真实生成已验收”。
- 媒体中期约 3.5 GiB；最终 `verify-media.py` 全部 4,767 对象 MD5 通过 / 0，详见第 12 节。源清单每项均提供 MD5，无须再做 rclone download check。

### 当前运行入口与版本

- 入口只绑定新机 `127.0.0.1:13012`，本机 SSH 隧道已建立（工具 session `30585`）；访问 `http://127.0.0.1:13012/sign-in`，页面重定向到 `/?auth=sign-in`。旧脚本 `/login` 返回 404，已核对正确入口，不当作登录失败。
- app 与 Worker 均使用上述固定镜像；独立 Router service 为 enabled/active。代码提交与准备文档不自动发布旧机。
- 媒体复制期间给 `/opt/naumi-staging/data/media` 的现存目录和默认 ACL 授予 UID 1001 访问，新生成本地媒体写入通过；rclone 使用 copy 不 sync，不删除测试新文件。
- full-row JSON 哈希比较在恢复和保护前后相同；启动最新代码后增加 nullable 列和空表，原比较脚本会失败。`verify-original-fields.sql` 已确认旧 69 表原始列仍完全相同 / 0。真实测试开始后会产生新用户积分/任务/媒体变化，改用 `verify-history-preservation.sql` 校验全部导入历史任务/账务原字段，允许新增测试行，不再声称工作库完整全行哈希等于原库。
- 真实 API 验收使用内存会话 fixture，未保存/打印令牌、未改变原账号密码；`LOGIN_PASSWORD_NOT_TESTED=1` 与“页面可访问/管理员权限正确”分开记录。

### 本轮重启验证结果（2026-10-08）

- 仅重启新机 app、Worker、Router；没有重启新机 Docker/Mihomo/媒体传输，也没有重启旧机生产。
- `STAGING_POST_RESTART=PASS JOB_ID=job-234bb140-6937-45ae-ba2d-4e50711a27f3 STATUS=done CHARGED=6 RESERVED=0 LEDGER_ROWS=1 MEDIA=200` / 0。
- `IMPORTED_HISTORY_FIELDS=IDENTICAL TABLES=5 NEW_TEST_ROWS=EXCLUDED` / 0：来源清单中五张有记录的任务/账务表原始列相同；空来源表也设保护，不把 5 说成全库表数。
- 新机 app/Worker 的 image ID 与 revision label 均匹配固定候选；Router 回环管理握手仍通过。重启时媒体中期 MainPID 12219 / 3.5 GiB / 1,842 文件；最终服务已成功结束、目录 4,768 文件（4,767 源对象 + 1 张真实测试结果）。
- 媒体传输中期清单内容核验：1541 对象 MD5 通过、0 wrong-hash，1 个正在写入文件大小未定、3225 missing；exit 2，属于未完成，不宣称全量媒体通过。复制结束后重新核验全部 4767。
- 原新机/旧机 key SHA256 再次与 source hash 相同；媒体隧道现已关闭，app 隧道独立保留；两个历史临时副本已清理；本轮会话副本在最终同步后清理。


## 12. 全量媒体完成与源端缺失（2026-10-09）

- `python3 /opt/naumi-staging/config/verify-media.py` → `MEDIA_VERIFY={"copy_finished": true, "md5_checked": 4767, "missing": 0, "source_bytes": 8641139439, "source_objects": 4767, "wrong_hash": 0, "wrong_size": 0}`；`MEDIA_CONTENT_VERIFICATION=PASS FULL_MANIFEST_MD5=1` / 0。
- `python3 /opt/naumi-staging/config/verify-media-references.py` → `MEDIA_REFERENCES={"managed_reference_keys": 4338, "missing": 4, "missing_in_source_manifest": 4, "present": 4334}` / 2。exit 2 特意保留引用缺失信号，不将源端既存问题当作零缺失。只读遍历原始参照库全部 public 表 JSON，不改写工作库。
- 以下 4 个 key 不在冻结 S3 清单中；旧机本地也无对应文件，生产 `127.0.0.1:3012/media/<key>` 再次均 HTTP 404。临时 S3 `lsjson --stat` 实时补查因导出隧道超时未得到结论，不能将超时说成对象不存在；“冻结源清单缺失 + 生产 404”已分别核实。

| 已有缺失引用 | 生产读取 |
|---|---|
| `canvas-uploads/art-1789365293381-246366.webp` | 404 |
| `generations/gen-1789365293518-249729-0.png` | 404 |
| `generations/gen-1789365293518-249729-1.png` | 404 |
| `sources/src-1789365293520.webp` | 404 |

- 不伪造文件、不修改历史作品/任务、不重复扣费。源清单媒体全量复制与历史引用完整性是两个独立结论。
- `naumi-staging-media-import` inactive / Result=success / MainPID=0；两条 13900 媒体隧道已撤下，临时导出凭据已删。预发布读取本地目录，不依赖 NAS。
- 本地仓库被其他工作切换到 main；本轮交接收尾在独立 worktree `C:\Users\13357\.codex\worktrees\staging-media-handoff\naumi`，分支 `codex/staging-media-handoff`，基于已推送 `af973c465c368594c0268b793c81f76d58c48f91`。不切换或覆盖主工作区，不将其他工作的源码/服务或 `.env.bak-jimeng` 混入提交。
- 运行候选仍为 `65adfe8742e7a1fe120e7ce7a94409c50c76eb44`，本轮仅补齐验证脚本与交接文档，不重新构建或发布生产。
- 原始证据 `/opt/naumi-staging/evidence/media-verification.json`、`media-references.json` 为 0600；交接四件套位于 `/opt/naumi-staging/evidence/data-20261008/handoff`，文档回滚只演练 disposable 副本。

- 原新机/旧机私钥 SHA256 已与源记录核对一致；临时 `{new,old}-key.pem` 已在本轮删除并核对路径不存在；前轮删除拒绝证据仍保留。现有 app 隧道不依赖密钥文件继续留在磁盘；重开连接先按 AGENTS.md 从原路径建立权限受保护的临时副本。


## 13. 2026-10-09 功能验收与视频供应商状态

### 已通过

- `STAGING_HISTORY_READ=PASS ACCOUNT_ARTWORKS=127 HISTORY_ROWS=6 LOCAL_MEDIA_CHECKED=6 NON_LOCAL_REFERENCES=0 PASSWORD_LOGIN_NOT_TESTED=1`：新机独立库可读取历史作品和本地媒体；`PROJECTS=200 VIDEO_LIST=200 VIDEO_UNAUTH=401`。
- 真实局部改图：
  - `STAGING_REAL_EDIT_SUBMITTED OPERATION_ID=tool-staging-edit-8ed46af7-32f8-457c-80a7-af13ddc8cf6c MODEL=gpt-image-2`
  - `STAGING_REAL_EDIT=PASS OPERATION_ID=tool-staging-edit-8ed46af7-32f8-457c-80a7-af13ddc8cf6c ARTWORK_ID=inp-1791476623968-3271 CHARGED=6 RESERVED=0 LEDGER_ROWS=1 MEDIA=200 RANGE=206 LINEAGE=KEPT`
  - 结果媒体 SHA256 `deefc3f0dfb063f70f84baa3b03737cb66917bf35dbb3afebd32ca120603a354`；父作品为真实生图任务结果。
- 真实视频失败/退款链路：
  - `STAGING_REAL_VIDEO_SUBMITTED TASK_ID=vid-1791476654407-5256 MODEL=grok-imagine-video DURATION=4 NO_RESUBMIT=1`
  - 上游返回 `Invalid token (request id: 2026100816241610096455726248298165I68xI)`，任务最终 `failed`。
  - `STAGING_VIDEO_FAILURE_REFUND=PASS TASK_ID=vid-1791476654407-5256 CHARGED=0 RESERVED=0 LEDGER_ROWS=0 RESERVATIONS=0 REPEATED_POLLS=2 WALLET_UNCHANGED=1`。
  - 已验证重复查询不重新提交、不重复扣费；没有再次创建视频任务。
- 视频静态/fixture 验收：`PASS video domain contracts`、`PASS video task schema`、`PASS video reliability fault injection`、`PASS video memory contract`、`PASS video provider fixtures: 48 HTTP calls across 8 protocols`。
- 独立空数据库 billing 回归：`STAGING_BILLING_RUNTIME=PASS DATABASE=EMPTY_DISPOSABLE WORKING_COPY_CHANGED=0 REAL_SUPPLIER_CALLS=0` / 0；覆盖 29 个真实入口、冻结报价、并发、结算/退款、重放、异步意图、canvas、性能和 reconciliation。

### 当前视频阻塞与边界

- 新机视频供应商是从源快照复制的 `video:openai-videos`，端点 origin 为 `https://heyroute.ai`；预发布工作库与原始参照库的 provider、credentialRef、加密凭据逐字一致，环境变量解密值也一致。
- 只读探测 `GET https://heyroute.ai/v1/models` 返回 `401`；完整结果：`STAGING_VIDEO_CREDENTIAL_COPY=PASS SOURCE_REFERENCE_IDENTICAL=1 DECRYPTED=1 ENV_EQUALS_DB=1`，`STAGING_VIDEO_PROVIDER_CATALOG HTTP=401 ORIGIN=https://heyroute.ai PROVIDER=video:openai-videos NEW_GENERATION=0` / exit 2。
- 这不是新机配置串写或凭据复制差异；需要有效的视频供应商 token 后才能继续成功出片验收。不会把同一无效 token 重试成“通过”，不会修改旧机凭据。
- 真实图片消费、局部改图和失败视频退款均已落在新机独立数据库；生产数据库、媒体、Router 未被写入。

### 浏览器登录

- 预发布页面通过本机 SSH 入口保持可访问，页面已打开到 `/works`；页面当前仍显示登录对话框，`LOGIN_PASSWORD_NOT_TESTED=1` 保留。本人密码登录需由用户在此页面完成后再做一次页面/下载验收。

### 本轮临时文件与证据

- 新机证据：`/opt/naumi-staging/evidence/functional-edit-20261009.txt`、`functional-video-20261009.txt`、`functional-verify-20261009.txt`、`functional-receipt-20261009.json`、`video-contracts-20261009.txt`、`video-credential-20261009.txt`、`billing-runtime-final-20261009.txt`。
- 本机真实改图副本：`E:\Workspace\naumi\output\staging-functional-20261009\real-edit-result.png`，SHA256 `deefc3f0dfb063f70f84baa3b03737cb66917bf35dbb3afebd32ca120603a354`。
- 临时媒体导出凭据已删除；本轮 SSH 会话密钥副本已在最终收尾删除并核对不存在，两把原始私钥 hash 均未变；最终执行证据与前次删除拒绝分别保留。
- 视频成功出片仍待可用凭据；用户密码登录、OSS 迁移参数和晚间回传窗口仍待完成，目标继续 active；继续准备其他独立验收和发布包，不把凭据阻塞扩大为整项停工。

- 已发现并修正的验收脚本问题：视频领域契约仍匹配旧 `privateFetch`，应用早已改为 `privateFetchRaw`，只调整契约锚点；billing 老回归要求无管理员密码的空库，且支付回调 fixture 需要非 staging 开关，故明确放在 `naumi_staging_billing_fixture` 的 empty/disposable 环境。首次只读源码 `/app/data/media` 写入失败导致 canvas needs_attention；设置隔离的 `MEDIA_DIR=/app/output/billing-fixture-media` 后全部通过，未改应用业务代码或真实副本。

## 14. 付费测试 receipt 与固定镜像回传档案（2026-10-09）

### 已有测试的唯一 host 入口

```bash
bash /opt/naumi-staging/config/run-functional-receipt.sh \
  65adfe8742e7a1fe120e7ce7a94409c50c76eb44 --verify
```

- wrapper 使用 host `flock`、候选 IMAGE_ID/revision 校验及 staging 标记；每次将 `/opt/naumi-staging/evidence/functional-receipt-20261009.json` 恢复到 app 容器，再执行已有测试查询。
- 缺 receipt、缺 edit operation/video task ID、镜像不符或锁占用时停止，不创建第二笔任务。`--edit`、`--video` 也只核验 receipt 内已有 ID；有效视频凭据到位后，先另行设计新验收记录，再提交一笔新测试，不删除失败记录或清空旧 receipt。
- EXIT trap 在运行成功或失败后均原子保存 host receipt；即使失败视频的 `--video` 返回 2，也保存记录并保留非零状态。若容器消失导致保存失败，原 host receipt 保留并 exit 74；不得把这个 exit 当验收成功。
- fixture：`python3 /opt/naumi-staging/config/verify-functional-wrapper.py` → `FUNCTIONAL_WRAPPER_FIXTURE=PASS RESTORE=1 FAILURE_PERSIST=1 MISSING_BLOCK=1 IMAGE_BLOCK=1 INCOMPLETE_BLOCK=1 LOCK_BLOCK=1 SUPPLIER_CALLS=0` / 0。
- 真实 `--verify` → `FUNCTIONAL_RECEIPT=RESTORED FIXED_IMAGE=VERIFIED MODE=--verify`、第 13 节真实改图/失败视频退款 PASS、`FUNCTIONAL_RECEIPT=PERSISTED COMMAND_EXIT=0` / 0。没有新付费提交；失败视频查询不会请求供应商。
- 本机改图结果已视觉查看：蓝色陶瓷杯、原杯形和白色背景可辨识；这是结果查看，不代替本人密码登录/页面操作，也不据此声称 mask 像素外完全不变。

### 已准备且重新打开校验的回传包

新机目录：
`/opt/naumi-staging/return-packages/65adfe8742e7a1fe120e7ce7a94409c50c76eb44/`

| 文件 | 字节 / SHA256 或内容 |
|---|---|
| `source.tar.gz` | 24,724,372 / `47cf7cc203951e4b7baa4d28a38bae2464f8e11d47316175511d60595b098d9b` |
| `image.tar.gz` | 116,460,606 / `b0854c1c5b985276d169ce9db5c2afcf055566f18916b276ec28b05586042ff4` |
| `COMMIT` | `65adfe8742e7a1fe120e7ce7a94409c50c76eb44` |
| `IMAGE_ID` | 新机 Docker 29 OCI manifest：`sha256:3cda12e2fe7ce6a6a5ebfb2d0448186569c6ec83a946a82cf111b94963f54056` |
| `IMAGE_CONFIG_ID` | 传统 Docker config：`sha256:2fcf4ac8119cc574a73b410cab990112dff0c214ff031b34adeab5ceb09ef2c8` |
| `BUILD_VERSION` | `1791464553`，与新机实际构建一致 |
| `SHA256SUMS` | 上述六文件的完整 SHA256；包内执行 `sha256sum -c SHA256SUMS` 全部 OK |

- `package-return-release.sh` 使用 `docker image save` 导出正在运行的同一镜像，不再构建，不包括 `.env`、数据库、媒体或测试数据。源码使用最初冻结的 clean archive；全部 951 运行源码文件与明确 `git archive 65adfe...` 的文件内容哈希相同，只排除 26 个 Git 已跟踪的 `output/` 和 `audit-artifacts/` 历史验收产物。不是任意工作区打包。
- 源码核验：`verify-return-source.py <source.tar.gz> <explicit-commit-file-hash.json>` → `RETURN_SOURCE_GIT=PASS TRACKED_FILES=951 EXCLUDED_TRACKED_ARTIFACTS=26` / 0。
- 镜像核验重新打开 gzip/tar，确认 tag/revision、OCI manifest 指向 config，并逐 blob 校验内容摘要；`RETURN_IMAGE=PASS FIXED_BUILT_IMAGE=1 IMAGE_CONFIG_ID=sha256:2fcf4ac8119cc574a73b410cab990112dff0c214ff031b34adeab5ceb09ef2c8` / 0。
- 最终：`RETURN_PACKAGE=PASS COMMIT=65adfe8742e7a1fe120e7ce7a94409c50c76eb44 IMAGE_ID=sha256:3cda12e2fe7ce6a6a5ebfb2d0448186569c6ec83a946a82cf111b94963f54056 PRODUCTION_DEPLOYED=0 DATABASE_MEDIA_INCLUDED=0` / 0。
- 首轮包测试错误地将 OCI manifest digest 与 config digest 直接比较而 exit 1；已修正并在同一归档重跑/回读通过。旧机采用传统 Docker store 时 `.Id` 可能显示 IMAGE_CONFIG_ID，而不是新机 OCI manifest；回传验收要按实际 Docker 存储格式验证两者关联与 revision/BUILD_VERSION，不为“对齐 ID”重新构建。
- 脚本支持同一 COMMIT/IMAGE_ID/source hash 的续验，不覆盖不同候选。候选业务镜像仍停在 65adfe...；本轮只增加验收/打包工具和文档，新的工具提交并未进入候选镜像。

### 回传窗口门槛与恢复

1. 本人页面登录及受影响核心功能通过；视频成功链路补验（当前 token 401，失败退款已经通过）。明确旧 Yutang/OCR 独立依赖与 OSS 后续范围，不能把“包存在”当全部功能贯通。
2. 确定具体下班窗口；窗口前重新盘点生产 commit、镜像、容量、在途任务与备份状态。这里的生产版本/计数属于 10-08 快照，不能直接沿用；若生产已前进，先审查候选差异，禁止旧候选盲目降级。
3. 从新机复制该目录的 source/image/hash清单到旧机专用 incoming 目录，旧机只校验/load，不重建。保留生产 `.env`/数据库/NAS、Router配置；不复制新机 runtime 配置，不导入测试库或新机消费记录。
4. 以现有 `scripts/deploy-release.sh <commit> <source.tar.gz> <image.tar.gz>` 流程发布；实际备份和具体 release 的 `ROLLBACK.sh --check` 在窗口内准备。涉及 Router 快照协议的变更按现有 coordinated 发布门槛排空任务、短暂关闭入口后发布，不改全量复制时的源状态。
5. 线上健康/实际 revision/BUILD_VERSION/镜像关联及受影响功能通过后恢复入口与 Worker。失败时用该 release 回滚代码/配置，保留新产生的生产数据与媒体；不会恢复旧 dump 或测试 dump 覆盖生产。
6. 四件套的 `ROLLBACK.sh --fixture` 只恢复另一个 README 副本，不停止新机 app/Mihomo，也不是生产回滚；生产回滚必须使用具体生产 release 的脚本。

### 本轮状态与剩余项

- 最新只读检查：app、video-worker、db 运行；Mihomo 与独立 Router active，Mihomo enabled；新机 app health 200，剩余空间约 80 GiB。Clash/Mihomo 配置已复用，原本机配置未改，不重复安装。
- 本轮下载复验：GitHub release HTML 实际下载 219,873 bytes，`PROXY_DOWNLOAD=PASS` / 0；HTTP/SOCKS 与 DNS 的本地监听地址分别为 `127.0.0.1:7897` / `127.0.0.1:1053`，Docker daemon 的 HTTP/HTTPS 代理均为回环7897。一次 raw.githubusercontent.com 下载 SSL 错误 exit 35，未把它算成功；GitHub release 下载已单独通过，不代表任意站点始终可达。首次监听检查误匹配 peer 的 `0.0.0.0:*`，已改成只检查 ss 本地地址列，实测没有公网监听，也没有更改代理配置。
- 不等待凭据即可完成的收尾：receipt wrapper、fixture、固定候选回传档案、README/证据同步，已完成。
- 尚未完成：视频成功出片、本人密码登录/页面下载、源端既不可用的本地业务适配器独立实例、OSS bucket/参数/凭据及晚间生产回传。OCR 公网视觉路径已通过，见第 15 节。全目标保持 active，本轮没有旧机生产发布。
- 本轮原始 literal 证据增加：`functional-wrapper-fixture-20261009.txt`、`functional-wrapper-20261009.txt`、`return-source-git-20261009.txt`、`return-package-20261009.txt`，均位于 `/opt/naumi-staging/evidence/`，0600。
- 最终密钥状态：历史 `new-key.pem` / `old-key.pem` 和本轮 `E:\Workspace\naumi\output\staging-data-20261008\session-key.pem` 均已删除并核对不存在，两把原始私钥 hash 与 source 记录一致。先前 `Remove-Item` 被工具执行环境拒绝（命令未启动），这一失败记录保留；随后对已核验绝对路径的单一临时文件执行 `cmd.exe /d /c del /f /q <session-key.pem绝对路径>` 成功，`SESSION_KEY_COPY_EXISTS=0` / 0。没有删除目录或原私钥。app 隧道与待本人登录的页面继续保留；额外交接 shell 只用于密钥删除后的最终文档同步，结束即关闭。

## 15. 真实 OCR、依赖刷新与回传增量迁移演练（2026-10-09）

### 真实 OCR 与重放

- 新上传的可读测试图片：`NAUMI TEST` / `20261009`，1000×400；本机用明确 Arial 字体离线绘制，并视觉检查后上传。它是新机测试作品，不改历史图片。
- 作品 `art-1791480355441-779901`，操作 `tool-staging-ocr-054ea2d2-3e96-40c7-af2c-46f8ca052a70`；通过实际 `/api/artworks/add`、`/api/billing/quote`、`/api/canvas/ocr` 运行，不是 mock。
- OCR 使用源配置的 `vision.ocr` 默认绑定 `platform-ocr-e33230db3dd7d2f0`，公网 `platform-ocr`；PaddleOCR env 在生产/预发布均未配置，业务实际结果 engine `vision-fallback`。默认内部 alias 不在用户可见列表，正常路径不传显式 model selection；没有修改凭据、模型绑定、售价或生产配置。
- `bash /opt/naumi-staging/config/run-real-ocr.sh --verify` / 0：

```text
STAGING_OCR_REPLAY=PASS SAME_OPERATION=1 SUPPLIER_CALLS_UNCHANGED=1 WALLET_UNCHANGED=1
STAGING_REAL_OCR=PASS OPERATION_ID=tool-staging-ocr-054ea2d2-3e96-40c7-af2c-46f8ca052a70 ENGINE=vision-fallback SEGMENTS=3 FIXTURE_TEXT=EXACT BOUNDS=VALID CHARGED=0 RESERVED=0 LEDGER_ROWS=0 SUPPLIER_CALLS=1 IMPORTED_OPERATION=0 PASSWORD_LOGIN_NOT_TESTED=1
STAGING_OCR_RECEIPT=PERSISTED COMMAND_EXIT=0
```

- 识别文本包含全部预期字符串，全部框在原图像素边界内。当前 OCR 售价为 0，因此没有负向消费账本；供应商真实调用恰 1 条，不能将“用户扣费0”当“未调用或无供应商成本”。同 operation 再 POST 原请求返回相同持久结果，调用数和钱包均不变。
- Wrapper 加 host 锁、固定镜像核对、host receipt 恢复及不确定执行 latch。host receipt：`/opt/naumi-staging/evidence/ocr-readable-receipt-20261009.json`；latch 若因 kill/container 丢失保留，返回 75 要求核对，不直接再付费提交。`--submit` 对已有 operation 也只核验，不重提。
- 第一次测试 `tool-staging-ocr-0bf738c0-29b8-4038-a19d-6866822d687e` 对应 `art-1791480151641-818048`：容器无字体使 SVG 的文字渲染为方框，OCR 如实识别方框；操作 settled、charged/reserved0，未通过预期文本断言。原作品、任务、供应商记录、`ocr-receipt-20261009.json` 均保留，不伪造 PASS。新的可读 fixture 使用独立 receipt 和独立 operation。
- 其他 fixture 调试失败单独保留：显式传隐藏内部 OCR alias 的报价409（未调用供应商）；复制0600 fixture后应用UID读文件失败（未调用供应商，后改所有者）；零价账本断言把JS负零与零 strictEqual导致 exit1（真实调用已成功），只修断言并 `--verify` 原 operation，没重提第三笔。不是应用业务bug。
- `module-final-20261009.txt`：`IMPORTED_HISTORY_FIELDS=IDENTICAL TABLES=5 NEW_TEST_ROWS=EXCLUDED`，历史来源清单内任务/账务原始字段仍相同；不是整库实时全行相同。

### 生产刷新与本地业务适配器

- 2026-10-09 01:16 CST 只读刷新生产：release `/opt/naumi/releases/84e1afdee610-20261008-160926`，app/worker `84e1afdee61013f3d5320b00bf688ae125b98179`，image `sha256:888b156a7d77fcd3a0cea9f4c8cdb01d6a728f494041ac7397227d48e34135c1`，health200，剩余磁盘约5.5GiB。没有重启生产；检查脚本只短暂复制到 `/tmp`/app容器进行元数据读取，没有业务请求。
- 生产 Yutang env 已配置，而 `host.docker.internal:8766` TCP `ECONNREFUSED`；巡检3966、SCM3967也拒绝连接。运行service/container没有对应实例。新机这三个默认宿主名均 `ENOTFOUND`，没有从预发布建立到生产的桥接。
- 读取两个app的实际模型配置证实 OCR 是公网 `platform-ocr`；不安装一个假设的Paddle服务，不把Yutang误列为生成供应商。若后续要求恢复鱼塘/巡检/SCM业务，需取得相应独立源码、业务快照与配置，在新机独立部署；不将代理指向旧机、不自动触发生产业务工具或真实平台在线采集。
- 源码Yutang/巡检/SCM封装使用空 env 回退默认地址；“env清空”不等于工具被显式禁用。目前缺DNS/服务证明它们不可达；今后为新机添加宿主别名或本地服务前再次核验这些路径，勿把原空 env 当永久隔离门槛。
- 当前生产84e1...和候选65adfe...不构成单纯fast-forward（生产热修复提交独立发布）；主工作区 `main` 有其他工作的2个未推送即梦/图标提交，不加入本任务。正式回传先审查差异与运行测试结果，不仅比较commit字符串；本轮没有替换候选或新建业务镜像。

### 全量参照快照上的增量迁移与副本恢复

运行：`bash /opt/naumi-staging/config/run-return-migrations.sh` / 0。

- 只在新机从不变 `naumi_snapshot_reference` dump恢复 `naumi_return_migration_fixture`，不用正在真实测试的工作库，不终止app DB sessions。
- 在恢复的完整69表上依序应用冻结候选的三个SQL：`20261007-artwork-provenance.sql`、`20261007-supplier-cost-ledger.sql`、`20261007-apimart-default-preset.sql`；同一顺序再运行一次。每次比较原始全部列/行哈希相同。

```text
RETURN_MIGRATION_BASELINE=PASS FULL_SNAPSHOT=1
RETURN_MIGRATION_APPLY=PASS ITERATION=1 ORIGINAL_FIELDS_UNCHANGED=1
RETURN_MIGRATION_APPLY=PASS ITERATION=2 ORIGINAL_FIELDS_UNCHANGED=1
RETURN_MIGRATION_MODIFIED=PASS REQUIRED_COLUMNS=3 REQUIRED_TABLES=2 IDEMPOTENT=1
RETURN_MIGRATION_ROLLBACK=PASS SEPARATE_DATABASE=1 ORIGINAL_SCHEMA_DATA=RESTORED WORKING_COPY_CHANGED=0
RETURN_MIGRATION=PASS SOURCE=FULL_REFERENCE_SNAPSHOT PRODUCTION_RUN=0 SUPPLIER_CALLS=0
```

- 增量字段、表都出现，新增元数据不改原始历史。另建 `naumi_return_rollback_fixture` 用原dump恢复；原始字段/行哈希与schema列顺序/类型/nullable完全一致。恢复的是另一副本，不是在真实工作库/生产逆向DROP新增列；正式生产回滚仍保留additive schema和实时数据。
- 以上证明三个显式增量SQL在全量原始快照上的幂等与恢复，不等于所有运行时代码/Router配置已生产验收，也不代替窗口内生产备份。
- 临时dump SHA256 `128c31dd70dca23e5bb38688e6d903b03239c7066196cd859ca70198defafb61`；成功后删除dump及两个fixture DB，最终 `RETURN_MIGRATION_FIXTURE_CLEANUP=PASS DATABASES=0 TEMP_DUMP=ABSENT`。保留hash、输出与原始参照库，不回灌测试数据。

### 证据与接手顺序

- `/opt/naumi-staging/evidence/ocr-readable-verify-20261009.txt`、`ocr-readable-acceptance-20261009.txt`、`ocr-unreadable-fixture-20261009.txt`、`return-migrations-20261009.txt`、`module-final-20261009.txt`。本机副本在 `E:\Workspace\naumi\output\staging-functional-20261009`；依赖元数据检查输出在 `E:\Workspace\naumi\output\staging-data-20261008\{new,old}-private-dependencies-20261009.txt`。
- 下次已有OCR只执行 `run-real-ocr.sh --verify`；无需再生成fixture或重放图/视频。当前浏览器仍是本人登录对话框，未输入本人密码。
- 下一实际阶段：有效视频凭据→一次新任务成功出片；本人登录与页面验收；OSS bucket/region/endpoint与专用凭据准备→新机独立迁移验证；确认下班发布窗口并刷生产基线→同镜像回传。业务适配器源端既不可用的恢复要求单独确认，不能虚报已迁移。
- 本轮goal分类是 progress：完成真实OCR与幂等重放、全快照迁移/恢复演练并纠正依赖状态；全目标继续 active。

## 16. 下载代理复验与 OSS 切换准备（2026-10-09 01:54 CST）

### 当前实际状态

- 用户授权的新机 Clash 已使用 Mihomo v1.19.32 安装，复用本机实际配置；本轮不重复安装、不重启 Docker/代理/应用。原本机 `clash-verge.yaml` 与导出前 SHA256 记录相同，原私钥 hash 未变，会话副本每次结束清理。
- `bash /opt/naumi-staging/config/check-proxy-final.sh` / 0：enabled/active；HTTP/SOCKS 与 DNS 仅在回环7897/1053；GitHub release HTML 实际下载219,912 bytes；`PROXY_DOWNLOAD=PASS`。`ROLLBACK.sh --check` 和重新建立的文件副本演练通过：`PROXY_ROLLBACK=PASS FIXTURE_ONLY=1 PROXY_FILES_ABSENT=1`、`RESTORED_FIXTURE_STATUS=PREINSTALL_FILES_ABSENT`；线上修改后配置保持原hash、服务继续active。
- 已安装代理的 `ROLLBACK.sh --apply` 含“无容器”门槛；当前已有app/db/worker，因此不要为卸载代理删除真实容器，也不要声称现有脚本能无影响卸载当前环境。此时真正卸载需另行编排应用停机、移除Docker代理并测试恢复；本轮只有文件副本演练。
- app仍为固定候选65adfe...、health200、storage local；`.env.oss` 不存在。新机没有OSS业务写入或NAS连接，旧机没有发布、重启或数据写入。
- 生产热修复84e1af...与开发提交a6b891e的stable patch-id都为 `dbd0a01d994204952cf62688bd299b9c611fdb96`，候选包含对应开发提交。这证明该补丁等价，不证明其他差异都已验收；窗口前仍需刷新生产基线和完整差异。

### OSS overlay 与真实协议门槛

- baseline Compose明确设置 `STORAGE_DRIVER=local` 并清空S3字段；仅把真实OSS参数放env不会切换。新增 `deploy/staging/docker-compose.oss.yml`，必须明确加第二个 `-f`；baseline不改，绝不自动启用overlay。
- overlay只覆盖app存储字段，独立 `NAUMI_OSS_*` 插值；虚拟主机寻址、私有bucket、`S3_PUBLIC_BASE_URL=""`，保留既有 `/media/<key>` 数据库URL及应用媒体代理，不批量改作品历史URL。Worker镜像、数据库、Router、来源guard、本机媒体挂载都保持不变。
- 模板 `deploy/staging/.env.oss.example` 只有字段。真实参数存 `/opt/naumi-staging/config/.env.oss`，root0600；S3兼容区域endpoint不含bucket前缀、path、query，专用Bucket/AccessKey不复用生产媒体凭据；参数本轮未提供。2026-10-09后续官方文档核验纠正了原普通OSS域名说明：采用 `https://s3.oss-<region>.aliyuncs.com` 或同region的 `-internal` 域名，见第17节。
- 当前 `storage.ts` 使用aws4fetch、`service=s3` 和 `AWS4-HMAC-SHA256`。官方已确认OSS的AWS S3兼容SigV4能力，mock仍只验证客户端HTTP行为；实际bucket/区域/账号的数据API可用性待真实PUT/HEAD/GET/Range/DELETE及内容hash核验。失败时留在local，不把mock当真实OSS验收；如需改业务驱动，重新构建并验收新的固定候选及回传包。

### 已完成的隔离模块验收

先将仓库下脚本逐一复制到新机config：`verify-oss-runtime.ts`、`run-oss-fixture.sh`、`verify-oss-module.sh`、`verify-compose.py`、`verify-oss-compose.py`；将baseline模板复制为 `oss-baseline-fixture.yml`，overlay复制为 `docker-compose.oss.yml`。这些是测试/候选模板，不覆盖正在运行的Compose。

```bash
bash /opt/naumi-staging/config/verify-oss-module.sh \
  65adfe8742e7a1fe120e7ce7a94409c50c76eb44
```

- 模块fixture只生成mock env；使用 `--profile workers` 渲染Compose。基线local检查通过，overlay验证所有非存储字段逐字不变；6个负向用例（guard、生产DB连接、错误endpoint、HTTP、path-style、publicBase）被拒绝，缺真实参数时Compose非零退出。
- 两种寻址（path与virtual-host）分别使用现有固定standalone镜像、只读冻结源码/依赖和一个只读可读PNG；`--network none`、不挂数据库/真实媒体/凭据。virtual-host用容器自身127.0.0.1 hosts映射，不解析真实OSS域名。
- 真实 `storage.ts` fixture PUT/GET/HEAD/Range、字节hash、读取大小限制和路径遍历拒绝通过；真实固定镜像 `/media` 返回200/206/404及未读取对象的故障503。

```text
OSS_COMPOSE=PASS OVERLAY_ONLY=1 DATABASE_UNCHANGED=1 IMAGE_UNCHANGED=1 HISTORY_GUARD=1 MEDIA_URL=PRIVATE_PROXY
OSS_COMPOSE_NEGATIVE=PASS CASES=6 CREDENTIALS_PRINTED=0
OSS_COMPOSE_MISSING_PARAMS=BLOCKED EXIT=NONZERO
OSS_TRANSPORT_FIXTURE=PASS PUT=1 GET=1 HEAD=1 RANGE=206 CONTENT_SHA256=IDENTICAL MAX_BYTES=ENFORCED TRAVERSAL=BLOCKED
OSS_FIXED_IMAGE_FIXTURE=PASS MEDIA=200 RANGE=206 MISSING=404 OUTAGE=503 DB=NONE NETWORK=ISOLATED LIVE_OSS=NOT_TESTED
OSS_FIXTURE_CLEANUP=PASS DELETE=2 REAL_CREDENTIALS=0 REAL_SUPPLIER_CALLS=0 STAGING_RUNTIME_CHANGED=0
OSS_RUNTIME_MATRIX=PASS PATH=1 VIRTUAL_HOST=1 LIVE_OSS=NOT_TESTED
OSS_MODULE=PASS MOCK_CREDENTIALS=1 LIVE_SWITCH=0
```

- command exit0；每种寻址各两次上传/删除只在内存mock内，非真实OSS写入。上面的PUT=1等是覆盖断言而非整个fixture的累计请求次数；故障响应会被客户端重试。一次原URL重复GET返回200而非预期503，改用独立未读取key注入故障，保留原失败记录；缓存是可能机制，没有由此声称线上媒体缓存行为完整验收。
- 首次挂载错误exit125：新脚本不存在于只读冻结源码，Docker创建嵌套挂载点失败。现脚本独立挂到 `/tmp`，通过 `NAUMI_STAGING_SOURCE_ROOT=/source` 导入，不创建占位、不改冻结候选。第二次exit1为上述故障测试原URL返回200；Compose第一次exit1因未启用workers profile。均保留证据，未视为通过。Node package type warning不修改候选package.json。

### 真实迁移执行顺序（尚未执行）

1. 取得独立bucket、region、endpoint和受保护凭据路径，确认协议兼容后仅对独立临时key运行上述真实存储读写/删除验收。对私有bucket匿名读取应被拒绝；应用代理仍能读。
2. 使用新机专用rclone配置，先验证列举/复制权限及目标bucket现有对象；保留本地媒体。先 `copy`，不用 `sync` 或删除源；不能复用生产Garage脚本的size-only检查。rclone本机v1.60.1-DEV已存在，不据此证明OSS后端可用。
3. 首轮本地→OSS copy可在线进行，记录原清单、对象数/字节/hash；源随测试变化时不能将一次copy视作最终一致。停新机app与worker前检查所有“新增测试任务”无未结算/未完成项（按 `origin_rows` 排除冻结导入任务；本轮全表未结算1不代表新增任务正在运行），保存持久receipt和本地快照，确认测试停止后冻结写入。
4. 冻结期间再做增量copy、全量源清单SHA256、目标下载内容完整核验（如rclone `check --download`，不要只比较size/不可靠multipart ETag）；保留详细结果和冻结清单hash。清单包含迁移后新增测试对象，不能只用原4767源清单证明新数据也迁走。
5. 同时加载受保护base env和OSS env，渲染baseline+overlay到0600临时文件，运行 `verify-oss-compose.py <baseline.json> <merged.json>` 并核对候选镜像未变。再明确启用overlay，仅重建新机app/worker；健康、历史/新媒体、Range、一次独立新写入和真实页面验收通过才完成切换。所有渲染文件受保护并及时删除，不打印环境/凭据。
6. 切换后本地副本继续保留。回滚先停新机写入，保存OSS清单并将OSS切换后新增/变更对象copy回本地，完整下载hash校验；空间不足或核验失败时保持停止并保留证据。核验通过再去掉overlay重建local服务，恢复健康和全部新旧媒体。不得直接去overlay而丢OSS切换后媒体；不删OSS对象，不更改数据库URL。

以上是执行门槛和设计，不是已实现/已跑通的自动迁移/回滚工具；待实际OSS参数与协议验收后按结果实现并测试专用工具。当前只准备overlay和隔离模块fixture。

### 交接状态与下一输入

- 新证据：`/opt/naumi-staging/evidence/oss-module-20261009.txt`、`oss-runtime-first-mount-failure-20261009.txt`、`oss-runtime-cache-failure-20261009.txt`、`oss-compose-profile-failure-20261009.txt`、`proxy-final-20261009.txt`；本机已回读的模块/代理证据在 `E:\Workspace\naumi\output\staging-functional-20261009`。
- 分支 `codex/staging-media-handoff`；本轮仅准备脚本/overlay/README，不改生产业务运行候选。主工作区其他人的即梦/图标工作及未跟踪文件保持原样。
- 浏览器本人登录框仍未完成；保留登录tab与13012隧道。缺有效视频凭据、OSS专用配置、下班回传时刻；不重复问已发的问题、不重复创建收费任务。目标保持 active，已完成Clash授权事项与OSS隔离准备，不宣称全部迁移/发布完成。

接手Agent可复用以下提示词：

```text
先读AGENTS.md和docs/NAUMI_STAGING_MIGRATION_README.md第13—16节，在
codex/staging-media-handoff独立worktree核对Git与新机现态。旧机保持生产，
不回灌测试DB，不重提receipt中图/视频/OCR。先读取用户新增的视频/OSS私有
配置路径与窗口信息；缺配置时不猜bucket/token。OSS mock通过不等于真实
兼容；先验真实协议，再实现新机copy/download-hash/冻结切换/媒体回收回滚
工具。每模块更新README与证据，选择性提交推送，不改原私钥与主工作区。
```

## 17. OSS 官方端点纠正与真实验收探针（2026-10-09）

### 官方协议证据与已纠正项

本轮直接读取阿里官方正文，不仅使用搜索摘要：

- [Accessing OSS with the AWS SDK](https://www.alibabacloud.com/help/en/oss/developer-reference/use-aws-sdks-to-access-oss)（2026-04-17更新）：公开S3兼容域名 `https://s3.oss-{region}.aliyuncs.com`，内部域名 `https://s3.oss-{region}-internal.aliyuncs.com`；Node示例使用同bucket区域和SigV4。官方支持AWS SigV4，某些SDK的aws-chunked编码仍存在差异。
- [S3 API on OSS: supported operations and limitations](https://www.alibabacloud.com/help/en/oss/developer-reference/compatibility-with-amazon-s3)（2026-09-17更新）：包括PutObject/GetObject/HeadObject/DeleteObject；采用virtual-host请求；multipart ETag不同于S3，不能直接当内容hash。另一SDK文档的path-style文字存在不一致，本任务按更新的兼容性正文用virtual-host；path-style仅作通用客户端fixture。
- AWS SDK页面另提示大陆新OSS用户的默认公网数据API可能需自定义域名；实际账号情况未取得，不宣称该账号一定受影响，也不让应用走匿名公网bucket来避开。优先核验新机与bucket同区域内网S3兼容入口；若确需CNAME/SDK适配，另行实现测试，不在校验器里放行任意域名。

上一版 `verify-oss-compose.py` 只接受普通 `oss-...`，漏了S3兼容域名。本轮按官方入口纠正为 `s3.oss-<region>`，支持同区域internal并检查region完全匹配；更新mock env模板。旧结果保留历史记录，不再据旧fixture声称端点选择正确。当前新机storage仍local，不曾把错误端点用于真实数据。

### 新增探针与凭据解析

脚本：`prepare-oss-probe.py`、`verify-oss-live.ts`、`run-oss-live-probe.sh`。将三个脚本及 `verify-compose.py`/`verify-oss-compose.py` 放新机config后执行：

```bash
bash /opt/naumi-staging/config/run-oss-live-probe.sh \
  65adfe8742e7a1fe120e7ce7a94409c50c76eb44
```

- 当前真实输出 `OSS_LIVE_PROBE=CONFIG_PENDING REAL_REQUESTS=0` / exit78，`.env.oss`仍不存在。本轮没有真实OSS网络请求；probe准备完成不等于live通过。
- 用户只需把模板五字段放在该受保护文件中并告知路径；parser不执行shell/source、命令替换或插值，拒绝未知/重复/缺字段、错region/端点、非root当前UID所有者、group/world权限和symlink。只渲染临时0600 Docker env，不打印值，不改源配置，完成后清理私有临时env。
- wrapper核对当前app候选revision/image、host staging标记并使用flock。独立容器运行正在验收的固定镜像与只读冻结源码，不挂app DB/工作媒体/模型凭据；它不是重启真实app。container临时bridge网络仅用于该OSS协议验收，standalone server只绑容器回环。
- probe创建唯一 `naumi-staging-preflight/<uuid>.bin` 1024-byte随机对象，在PUT前原子保存receipt/key；以候选真实 `storage.ts` 验PUT、HEAD、全文byte/SHA256、Range206、匿名403、候选实际 `/media`200/206。原媒体、历史URL、DB和模型账务不改。
- DELETE只针对该唯一探针key；PUT超时可能已经写入也会尝试清理，必须DELETE成功且最终GET404才通过cleanup。不用“exists=false”冒充404（权限/网络失败也可能false）。receipt在私有证据目录，包含对象key、候选image/commit、源配置hash及结果，不含AccessKey/secret。
- probe返回0代表本次live读写+删除链通过；读写失败但删除确认成功返回2；清理失败或receipt缺失返回74。host `oss-live-probe.inflight` 在启动前记录证据目录和具名容器句柄，完成且cleanup确认PASS才解除；中断/清理不确定会保留receipt位置。下一次wrapper exit75而不再创建对象，先检查该具名容器是否仍在运行（若运行继续等待该句柄，缺配置文件也先保留旧latch），再核对旧key、人工清理并解除latch，不循环探测。
- 真实bucket测试到位后仍需生产级媒体copy/full-download-hash/冻结overlay切换及回收新媒体回滚；probe不自动启用overlay、不回传生产。

### 新模块验收

```bash
bash /opt/naumi-staging/config/verify-oss-module.sh \
  65adfe8742e7a1fe120e7ce7a94409c50c76eb44
bash /opt/naumi-staging/config/run-oss-probe-fixture.sh \
  65adfe8742e7a1fe120e7ce7a94409c50c76eb44
```

1. 更新后的Compose模块：非存储字段不变，8个负向用例拒绝；普通OSS/native endpoint与region不匹配拒绝，S3 public/internal入口接受；两种通用寻址的固定镜像模拟传输继续通过。此处public/internal是配置验证，不是live网络验证。
2. parser fixture：8种异常（native入口、重复字段、命令替换、错region、HTTP、未知字段、0644、symlink）拒绝，不执行命令。
3. 实际候选容器中，新的live probe对内存存储完整运行三个分支：成功exit0、GET字节不符exit2且清理PASS、清理403 exit74且receipt标记FAIL。该fixture使用 `--network none`、`/evidence` tmpfs；23次模拟HTTP请求，真实OSS/模型请求0。清理失败fixture对象仅存在内存，随fixture结束销毁，不是删真实bucket。

```text
OSS_PROBE_CONFIG_FIXTURE=PASS PUBLIC=1 LITERAL_PARSER=1 MODE_0600=1 NEGATIVE_CASES=8 COMMAND_EXECUTION=0
OSS_LIVE_PROBE_FIXTURE=PASS CASE=success EXPECTED_EXIT=0 RECEIPT=1 CLEANUP=PASS
OSS_LIVE_PROBE_FIXTURE=PASS CASE=read-failure EXPECTED_EXIT=2 RECEIPT=1 CLEANUP=PASS
OSS_LIVE_PROBE_FIXTURE=PASS CASE=cleanup-failure EXPECTED_EXIT=74 RECEIPT=1 CLEANUP=FAIL
OSS_LIVE_PROBE_CONTRACT=PASS CASES=3 MOCK_HTTP_REQUESTS=23 REAL_OSS_REQUESTS=0 MODEL_CALLS=0
OSS_PROBE_FIXTURE=PASS LIVE_SWITCH=0 REAL_REQUESTS=0
```

fixture整体exit0。wrapper的缺配置门槛实际exit78；有真实配置的整个wrapper、kill/断连后的人工清理和真实OSS ACL尚未live验收，不以子进程fixture代替这些。

### 当前推进分类与回传门槛

- 上一goal turn是progress（七文件提交4f99658、隔离模块PASS、文档副本回滚和远端hash同步）；本轮继续有协议纠正和真实探针准备进展，目标保持active。没有已确认仍在运行的付费任务供等待，也不将缺参数当一个运行中job。
- 本轮新旧机只读刷新：新机65adfe...、app/worker/db运行、history guard1、storage local、health200、Mihomo enabled/active；旧机仍84e1af...、health200。随后只读来源核验：`IMAGE_UNSETTLED_IMPORTED=1`、`IMAGE_UNSETTLED_NEW=0`、`VIDEO_PENDING_NEW=0`；这笔未结算确实属于冻结历史，不重放、不自动退款/结算，不能当作仍运行的新增job。证据 `staging-pending-origin-20261009.txt` / exit0。
- 旧机固定镜像回传包已准备，但 `deploy-release.sh` 不执行本次三份显式增量SQL，也不自动发布Router快照。正式窗口沿协调发布流程：入口维护、暂停worker、检查生产未完成任务、当场备份、增量SQL及Router协调、同镜像发布/回滚与验收后开放；不得把“调用deploy-release.sh”当所有迁移和模型配置已完成。本轮没有执行生产发布。
- 本轮证据：`oss-probe-fixture-20261009.txt`、`oss-live-config-gate-20261009.txt`、`oss-module-s3-endpoint-20261009.txt`（新机evidence）；固定运行候选/回传包保持65adfe...，新增脚本属于交接分支，不替换候选业务源码。
- 本人页面登录、有效视频供应商token、OSS参数/凭据和下班回传时刻仍待用户输入；未重复收费或测试库回灌。接手时在第16节提示词基础上优先读第17节端点纠正、探针receipt与latch规则。

## 18. 回传部署脚本隔离演练与最新输入检查（2026-10-09）

### 本轮完成

- 已将 `scripts/staging/check-goal-inputs.mjs` 和 `scripts/staging/run-return-deploy-fixture.sh` 纳入交接分支。前者只查询新机工作库和冻结参照库，两个 PostgreSQL 连接都设置 `default_transaction_read_only=on`；不解密、不输出 token，不登录或访问供应商，不创建任务。后者核对新机 staging 标记、无生产 current、候选 revision 和固定 IMAGE_ID，再运行候选本身的部署/协调验收脚本。
- 在新机执行 `docker exec naumi-staging-app-1 node /tmp/check-goal-inputs.mjs`（先将已核验脚本复制到容器 `/tmp`），exit0：

```text
VIDEO_CONFIG_CHANGED_FROM_SNAPSHOT=0 PROVIDER_REQUESTS=0 GENERATED_TASKS=0
NEW_VIDEO_DONE=0
GOAL_INPUT_REFRESH=READONLY DB_WRITES=0
```

这表示相关视频配置和加密凭据与冻结参照一致，且没有新增成功视频；不是再次请求401供应商的结果。`.env.oss` 和探针 latch 均不存在，没有待等待的真实 OSS 作业。app health200，Mihomo enabled/active；原密钥 hash 保持，SSH 临时副本每次调用后不存在。本人页面仍显示登录框，未完成密码登录验收。

- 运行 `bash /opt/naumi-staging/config/run-return-deploy-fixture.sh`，输入是候选65adfe...内的 `scripts/deploy-release.sh` 和 `scripts/verify-coordinated-release.sh`，分别传 `FAIL_HEALTH=0/1`。固定镜像内 network none，不挂 Docker socket、生产目录或真实数据库；mock Docker/DB/nginx，仅改一次性容器文件系统。

```text
MODEL_ROLLBACK_PENDING_TASKS_AND_INGRESS_GUARD=PASS
COORDINATED_SUCCESS_MAINTENANCE_AND_WORKER_GUARD=PASS
COORDINATED_FAILURE_ROLLBACK_WORKER_GUARD=PASS
RETURN_DEPLOY_FIXTURE=PASS CANDIDATE_DEPLOY_SCRIPT=1 SUCCESS_AND_FAILURE=1 DATABASE=MOCK DOCKER=MOCK SOCKET_MOUNTED=0 REAL_SERVICES_CHANGED=0
RETURN_DEPLOY_FIXTURE_EXIT=0
```

- 本轮证明候选部署脚本成功/健康失败两分支保留维护入口、worker暂停，以及回滚前有未完成模型任务时拒绝提前恢复；不是生产发布/生产回滚，不证明旧机真实 Docker load 已完成。既有回传包、运行候选和生产 release 均未替换。
- 证据：`/opt/naumi-staging/evidence/goal-input-refresh-20261009.txt`、`/opt/naumi-staging/evidence/return-deploy-fixture-20261009.txt`；本机回读副本在 `E:\Workspace\naumi\output\staging-functional-20261009`。

### 接手与剩余输入

独立准备与本轮交接收尾已完成，全目标仍 active；视频成功、本人页面验收、OSS实迁及窗口内旧机回传未完成。仅执行配置缺失检查不能把目标标为完成，也不应重复收费请求或无限增加mock演练。

接手优先处理用户提供的新输入：有效视频配置、本人完成页面登录验收、独立OSS bucket/region/S3 endpoint与受保护配置文件、明确北京时间发布日期和时刻。缺输入时保持现有服务，不选未经确认窗口，不回灌测试DB，不重放已验收receipt；按实际连续阻塞轮次记录状态。

```text
在 codex/staging-media-handoff worktree 先读 AGENTS.md 和本 README 第13—18节。
核验当前新机/生产版本后，只推进新提供输入对应阶段。Clash/Mihomo已安装，
不重复导出凭据或重启服务。已有图/改图/OCR/失败视频只用receipt核验；视频
成功须有效配置与独立新receipt。OSS先运行真实探针，后做copy、全内容hash、
冻结切换和新增媒体回收回滚；缺配置不把mock算live。本人页面验收与指定
发布窗口到位后才把同一镜像、源码及增量迁移回传旧机，不覆盖生产DB。
每模块更新文档和证据，选择性提交推送，原私钥和其他工作区保持不动。
```
