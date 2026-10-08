# Naumi 新服务器预发布与晚间回传方案

> 状态：预发布 app/Worker 已启动，首笔真实生图与结算通过；全量 4,767 源对象 MD5 核验通过，NAS 导出通道已撤下；4 个源端既存缺失引用单独记录（2026-10-09）。
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
- [ ] 真实生成/编辑/视频/消费测试通过。
- [ ] 账本、积分、失败退款和异常任务状态正确。
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
- [ ] 用户本人密码登录、历史页面/编辑/视频/失败退款等剩余模块验收与生产回传包；媒体内容复制已完成，4 个源端缺失列入已知历史问题。
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
- 两条媒体隧道已关闭；临时 key 的源 hash 在忽略目录 `output/staging-data-20261008/{new,old}-source.sha256`。原 hash 已复核，原私钥未修改。临时副本删除命令被执行环境拒绝，两个受保护副本仍在忽略目录中，不能标记清理完成；app SSH 会话独立保留。
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
- 生产 Yutang 地址为旧宿主 `host.docker.internal:8766`；此供应商依赖需单独迁移/核验，不能标为新环境可用。

## 10. 下一执行点

1. npm ci、候选构建、runtime 已完成；不重跑整套。先核验运行 app/Worker 的实际镜像、最近日志和媒体传输。`prepare-build-deps.sh <commit>` 从原 lockfile 安装并保存 lock hash；`build-candidate.sh <commit>` 在新机运行 Next build，用同一 standalone 输出构建固定 tag 镜像（revision label/BUILD_VERSION），不含本地构建产物或凭据。`scripts/staging/run-history-runtime.sh <40位commit>` 只克隆工作库为独立 fixture、运行测试并清理，不修改工作副本。
2. 媒体复制与全清单 MD5 已完成；不重跑整卷导出，不为 4 个源端既存缺失伪造文件或改写历史任务。继续历史页面抽样验收，源缺失需要单独恢复来源。
3. 独立 Router/app 白名单配置已生效，后续只补齐旧 Yutang/OCR 依赖所需的独立实例，不改已有公网供应商地址或生产管理端。
4. app/Worker 已通过历史隔离门槛并启动；继续按模块完成用户本人登录、历史媒体、编辑、视频与失败账务验收。首笔生图成功不代表所有供应商和视频模块已贯通。
5. 更新本文、验证证据，选择性提交推送；晚间回传与 OSS 为后续阶段，目标保持 active。

### 接手提示词

```text
继续 E:\Workspace\naumi 的新服务器预发布准备任务。先读取 AGENTS.md、README.md 与 docs/NAUMI_STAGING_MIGRATION_README.md，再核验 Git 状态和服务器实际进度。旧服务器 101.133.166.67 保持生产；新服务器 120.27.162.85 使用完整不脱敏副本与独立本地媒体，真实模型消费无额外预算上限，仅用户本人测试。不要共享生产数据库/媒体写路径或 Router 管理配置，不重放复制来的历史任务。按“下一执行点”完成镜像获取、全量复制、独立 Router 与历史任务保护，再启用真实应用。每阶段更新文档、命令证据、剩余工作和恢复方案；任务文件选择性提交推送，不自动在此次准备阶段发布到旧服务器。不在 Git/日志保存凭据或明文数据。
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
- 原新机/旧机 key SHA256 再次与 source hash 相同；媒体隧道现已关闭，app 隧道独立保留；临时副本清理命令被执行环境拒绝，仍待清理。


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

- 原新机/旧机私钥 SHA256 已与源记录核对一致；临时 `{new,old}-key.pem` 删除命令被执行环境拒绝，副本仍保留在受保护的忽略目录，清理项未完成。现有 app 隧道不依赖密钥文件继续留在磁盘；重开连接先按 AGENTS.md 从原路径建立权限受保护的临时副本。
