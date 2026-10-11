# Naumi 新服务器预发布与晚间回传方案

## 最新运行版本：小球移动范围扩大（2026-10-11）

固定业务源码164f9a1dfc2d8979a4b2c4e0558b9af7ad6a7311已发布新机120.27.162.85，APP/Worker Image ID sha256:006d4fca8cbfaf132f2f27ee09f8968d4b3be68bc897518b1d76263a1161a989，实际1791692849 / v2026.10.11-122729。小球四边8px、层级32，720px画布竖向范围396→592（约49%）；四角拖动/工具栏区再拖出/键盘/刷新位置恢复通过，面板与画布平移不误触。126项小球、247项富文本、类型/Linux构建和15项线上资源通过，无新模型消费。

本机共享main由落后19提交的21a6616快进到最新业务164f9a1，远端main/开发HEAD/运行镜像/API commit一致，包含0cf5e63富文本和主题，不是旧版覆盖。全程锁/可读DB备份/固定0cf5e63回滚，配置/元数据/采购价/数据库容器/代理指纹保持；最终ORB_BOUNDS_RELEASE=PASS、健康通过、锁释放。证据/opt/naumi-staging/evidence/canvas-orb-bounds-20261011；源码回滚仅独立副本，线上保持扩大的范围。维护计数1，磁盘81%/19GiB，下次构建前需按>80%规则盘点；本机fixture服务停用，清临时编译产物4,628,838字节。旧机未连接/回传，视频/OSS/实体手机触摸延期。详情docs/changes/2026-10-11-canvas-orb-bounds.md，文档跟进不重复发镜像。以下为历史版本。

## 最新运行版本：Agent富文本与小球主题（2026-10-11）

固定业务源码0cf5e635b13cc24156dbce9ab5dfe51f499e8811已发布新机，APP/Worker Image ID sha256:6cbbe899b7563cb0cb86f023978614a28018b4a12110e984709d0a35b20d0a8d，版号1791692065 / v2026.10.11-121425。小球随画布明暗，Agent回复只读Markdown/表格/代码高亮/复制，兼容React18而不引入要求React19的lobe-editor。247项检查、TypeScript、Linux构建、15项线上资源和真实只读对话/跨标签历史/HTTP复制粘贴通过，工具0/新生图0/对话扣0，旧图片流水保持。全程锁/备份/固定5e4851回滚保留，模型v108/积分v8及配置/元数据/采购价指纹保持、锁已释放。第3次发布后只清本任务两次构建cache，释放1,089,932,750字节，新机80%/20GiB，计数归零；旧机未连接。详情docs/changes/2026-10-11-canvas-agent-richtext.md，下方为历史版本。

## 最新运行版本：画布悬浮 Agent 小球（2026-10-11验收）

固定业务源码5e4851fac70e9260a0cec800e101dc6a7c51ca68已发布新机120.27.162.85；APP/Worker Image ID sha256:322847ab7f484c7c42f5b2fb151e7cc74372e12f3e26a6fa5ee68bebffca5078，实际1791647970 / v2026.10.10-235930。画布加入石墨/柔白可拖动小球、账号位置记忆与键盘操作，点击复用现有Agent侧栏，表情跟随真实SSE及历史终态；没有新增调度器、计费路径或Schema。

114项新模块/102项小球契约、类型/正式Linux构建、线上12项资源/版号和桌面/390px拖动、关闭面板继续运行通过。真实get_balance→recolor_product→verify_image_output，球thinking→working→done、1张图回画布、父节点/项目、数据库历史恢复通过，唯一canvas.image扣6积分/预留0，无重复生图。只读取消时球stopped，恢复错误历史error，不误报完成；另一次只读任务先完成而没有取消，不记为取消通过。触摸注入接口未支持，实体手机触摸仍待实机验收。

全程deploy.lock、DB/env/Compose完整备份、临切最新数据快照及固定9ec5c1回滚--check，模型v108/积分v8与设置/草稿/ComfyUI/元数据/修订/采购价最终指纹保持，仅NAUMI_IMAGE切换。证据 /opt/naumi-staging/evidence/canvas-agent-orb-20261010，ROLLBACK-STAGING.sh --apply只切镜像不回灌DB。最终健康/版本通过、锁释放、临时脚本/私钥副本清理，旧机未连接/回传。维护后累计成功发布2次，约79%占用/21GiB可用；文档提交不另发镜像，视频/OSS延期与禁止自动回传约定保持。详见docs/changes/2026-10-10-canvas-agent-orb.md；以下为历史。

## 最新运行版本：石墨小球柔白眼睛（2026-10-10）

用户要求修改眼睛配色，固定源码9ec5c1f1efec1d0df8cf4ee0e0dd43e57fbe12b2已发布新机；APP/Worker Image ID sha256:a7ac5995337bb81568b748aa1fd8d4d198e25e139b0549c2b5b8b478ef3463c4，实际1791646599 / v2026.10.10-233639。主球、角落球、八状态缩略图和外观按钮从荧光黄绿同步改为柔白#f5f5f7；其他主题/Logo/动效保留。102项契约/正式Linux构建、线上6项资源与版号及实际10个SVG/20只柔白眼/旧荧光色0通过，源码副本恢复原文件精确哈希及74项基线。

全程共享锁与完整DB/env/Compose备份，模型v108/积分v8、设置/草稿/ComfyUI/元数据/修订/采购价指纹和DB/媒体/Compose/代理保持，只有NAUMI_IMAGE切换。证据与固定afaa61d回滚 /opt/naumi-staging/evidence/naumi-orb-eye-palette-20261010，ROLLBACK-STAGING.sh --apply只切镜像不回灌DB；最终健康/版本通过、锁释放、临时脚本/私钥副本清理，旧机未连接/回传。维护后第1次成功发布，约77%占用/22GiB可用；文档提交不另发镜像，视频/OSS延期及第20—21节回传边界继续有效。详见docs/changes/2026-10-10-naumi-orb-eye-palette.md；以下为历史。

## 最新运行版本：A / 胶囊 N 正式Logo（2026-10-10）

用户明确选择第一套Logo，固定源码afaa61d0f1aa184f3b364e6ada27fb569d27cb00已发布新机120.27.162.85；APP/Worker固定镜像同SHA，Image ID sha256:0032e599806245aaf31394a81c7894e2007f8ad3dbb21878e2b1e71e4a590c5a，实际1791637618 / v2026.10.10-210658。导航、共享Logo、明暗画布、小球页及favicon已替换，白标配置保留。50项品牌/28项素材/类型/Linux构建、线上25项资源和版本检查及实际浏览器验收通过；源码副本回滚恢复原Logo和46项基线通过，工作树及新机保持新标。

全程deploy.lock，完整DB/env/Compose备份，模型v108/积分v8、设置及草稿、ComfyUI、供应商元数据/修订/人工采购价格指纹不变。证据和固定c66a826回滚保存在/opt/naumi-staging/evidence/naumi-logo-adoption-20261010；ROLLBACK-STAGING.sh --apply只切镜像，不回灌DB。最终健康/实际版号通过、锁释放、临时脚本和私钥副本清理。旧机未连接/回传，视频/OSS延期保持。首次CRLF祖先清单预检查退出没有线上改动；修正后一次正式构建/发布完成。

累计第三次成功发布后持锁清理仅本轮源码.next/cache 521,501,799 bytes，运行/回滚镜像、源包、standalone和备份以及其他任务保持；约76%占用/23GiB可用，维护计数归零。后续文档提交不另发镜像。详见docs/changes/2026-10-10-naumi-logo-adoption.md；以下记录为历史状态，第20—21节的回传和公网边界约定继续有效。

> 最新状态（2026-10-09）：用户已确认预发布验收完毕；新机继续用于构建和测试，媒体保持 local。视频配置暂时跳过，OSS 后续单独配置，不再作为当前环境交付阻塞项，也不视为已通过。用户明确要求先不回传，只有后续明确要求回传时才操作旧机；不自动发布或安排回传。第20节是最新交接决策。另按用户要求已开放公网Web入口 `http://120.27.162.85/`，第21节记录运行/回滚证据；内部服务仍私有。
>
> 2026-10-09追加：管理后台 MVP 与 APIMart 模型发现/实际单张出图已在新机发布并验收，最新应用 `f5a6f69` / `1791536938`，模型配置v6；见第23节。旧机不回传约定继续有效。
>
> 本文是本任务的交接入口。后续 Agent 先阅读本文，再检查本文列出的状态、证据和阻塞项；不要凭对话上下文猜测迁移进度。

## 1. 目标

建立一套长期可用的 Naumi 预发布环境：

- 旧服务器 `101.133.166.67` 持续承担生产流量，不因准备工作停机。
- 新服务器 `120.27.162.85` 用于构建、部署和真实业务测试。
- 新服务器拥有旧服务器的完整数据库和完整历史媒体副本，不做数据脱敏；当前只有用户本人测试。
- 新服务器允许真实模型调用和真实消费，测试数据只写入新服务器副本。
- 新服务器暂不接 NAS，媒体使用本地持久化目录；后续新环境贯通后独立切换 OSS。
- 验收通过后保留固定 commit 的镜像、代码发布包和增量迁移材料；按用户2026-10-09最新要求，先不回传。只有后续用户明确要求回传时，重新核验生产基线并确定执行安排；不使用新服务器测试库覆盖生产库。

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
- [x] 用户已确认本轮预发布验收完毕（2026-10-09）；生图、局部改图已通过。
- [ ] 视频成功出片：用户明确暂时跳过配置，不阻塞本轮环境交付；保留401失败/退款证据，不记为成功。
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
- [x] 用户本人确认预发布验收完毕（2026-10-09，用户报告，不冒充Agent登录/下载验收）；历史读取/局部改图/失败视频退款已通过，固定回传包已准备。
- [ ] 视频配置与成功出片：暂时跳过，后续用户要求再处理。
- [ ] OSS 迁移：后续单独配置，当前继续使用local。
- [ ] 生产回传：用户要求先不回传，只有明确要求时再启动，不自动选窗口。

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

## 19. 本机验收入口恢复（2026-10-09 13:50 CST）

- 恢复后的第一轮推进审计：上一轮为 no progress（缺输入检查没有改变下一动作），本轮最初仍缺视频/OSS/窗口输入；随后发现本机13012没有监听、页面显示“无法访问此站点”，而新机health200。这是需要实际修复的新情况，不是等待中的模型任务。
- 新增 `scripts/staging/manage-staging-tunnel.ps1`，固定目标新机和回环远端13012；Start/Verify/Stop只管理忽略目录receipt记录的本机SSH进程。PID、进程创建时间、命令目标/forward及监听所属进程必须一致；不杀其他SSH、不暴露公网端口。密钥在随机临时目录创建受保护副本，握手/health通过后立即删除；每次核对原hash与ACL不变，不持久保存key。
- 实际运行入口（在当前独立worktree）：

```powershell
pwsh -NoProfile -File scripts/staging/manage-staging-tunnel.ps1 -Mode Start -ReceiptDirectory E:\Workspace\naumi\output\staging-data-20261008\tunnels
pwsh -NoProfile -File scripts/staging/manage-staging-tunnel.ps1 -Mode Verify -ReceiptDirectory E:\Workspace\naumi\output\staging-data-20261008\tunnels
```

- baseline本机curl：`LOCAL_HEALTH=000` / exit7。Start后 `STAGING_TUNNEL=PASS LOCAL_ADDRESS=127.0.0.1 LOCAL_PORT=13012 HEALTH=200 PID=16872`、`TEMP_KEY=ABSENT ORIGINAL_HASH=UNCHANGED ORIGINAL_ACL=UNCHANGED` / exit0；跨调用Verify相同PID/health200 / exit0。公网/旧机/新机应用均未改。
- 另建13013测试隧道后Stop：`STAGING_TUNNEL=STOPPED LOCAL_PORT=13013 SERVICES_CHANGED=0` / exit0；Get-NetTCPConnection确认13013没有监听，原13012仍health200。恢复副本curl返回 `FIXTURE_RESTORED_HEALTH=000` / exit28（超时而非预期连接拒绝7），按实际记录，不冒充7；端口无监听是恢复状态证据。这是第二隧道进程回滚，不是服务/生产回滚。
- 初版Stop误将PowerShell自动解析的JSON DateTime与字符串比较而返回 `TUNNEL_PID_REUSED` / exit1，未终止任何进程；改为UTC ticks比较，再对同一receipt/进程Stop成功，不重建该测试隧道。首次批量验收命令未启动；改用独立调用并保留失败状态。
- 浏览器重新绑定已有标签页被工具URL检查拒绝，本轮没有绕过或改用另一浏览器。HTTP health与作品页已在本机CLI核验；本人密码登录、页面下载/功能验收仍未完成。用户可打开 `http://127.0.0.1:13012/works` 自行刷新和登录。
- receipt不含私钥，仅保存目标、forward、PID与创建时间；SSH退出后重新Start可恢复，不安装常驻服务/计划任务，也不声称重启后自动重连。Stop命令仅用于主动关闭本机入口；当前13012继续保留。
- 全目标保持active，本轮有实际入口恢复进展；仍缺有效视频配置、本人页面验收、OSS专用配置和明确北京时间回传窗口。不以入口恢复替代全目标完成。

## 20. 用户验收确认、后续事项与暂停回传（2026-10-09，最新决策）

### 用户确认与准确状态

- 用户原话：“验收完毕，视频配置暂时跳过，oss等后续再配”。随后明确：“先不回传，除非我显示要求回传”（按语境即明确要求回传）。
- `USER_ACCEPTANCE=CONFIRMED`：本人预发布验收确认已收到。证据来源是本线程用户消息；这不是Agent代登录或逐项浏览器截图证明，不更改旧验收证据。2026-10-09本轮只读复核新机候选仍65adfe...、health200，与此前候选一致。
- `VIDEO_CONFIGURATION=DEFERRED_BY_USER`：暂时跳过视频配置和成功出片；保留失败视频401、退款/预占释放/幂等核验记录，不重提收费任务，不要求现在提供token。
- `OSS_MIGRATION=DEFERRED_BY_USER`：后续配置，当前 `STORAGE_DRIVER=local`，新机不接NAS；现有overlay/探针是准备材料，不记为live迁移完成。不要求当前提供bucket或凭据。
- `PRODUCTION_RETURN=HOLD_UNTIL_EXPLICIT_USER_REQUEST`：先不回传，不自动选择下班窗口，不创建自动回传计划。当前没有待执行生产发布或需要用户立即确认的时间问题。
- 新机继续运行并承担今后构建/测试；旧机继续生产。保留全量数据库副本、独立媒体、历史来源保护、receipt和固定候选回传包。生产配置/DB/媒体/Router保持独立，新机测试数据不回灌。

### 接手规则

第20节和AGENTS.md最新约定覆盖第13—19节历史“本人验收待完成”“视频/OSS阻塞”“等待窗口”等推进门槛。不要重复要求已确认的验收，不将延期当功能通过，不因旧自动发布约定或目标自动继续而操作旧机。本次只更新文档/交接状态，未发布、重启生产或创建收费任务。

将来用户明确要求回传时，先刷新实际生产版本、当前候选、代码差异和Router状态；旧回传包只是冻结候选，生产可能已前进，禁止盲目覆盖新热修复。明确本次发布内容和执行安排，必要时在新机重新构建/验收固定候选，再备份、执行增量迁移与协调发布、核验线上版本/功能和回滚。仍保留生产配置、数据库和媒体，不把staging guard或local存储配置复制到生产。

当前预发布交付已获用户确认；完整目标中的旧机回传和后续OSS保持未执行。回传阶段按用户要求暂缓，不能把完整目标标为已完成。

```text
先读AGENTS.md及本README第20节，核对新机实际状态。用户已确认预发布验收，
视频暂时跳过，OSS以后再配；不要重复追问这些输入，不把延期记成已通过。
新机继续用于构建/测试，local媒体和历史来源保护保持，旧机继续生产。
先不回传，只有用户后续明确要求回传才启动生产基线刷新、候选差异审查、
新机必要重验、备份、增量迁移/Router协调及固定版本发布；禁止自动回传，
禁止新机测试DB回灌。每模块更新文档，保护原私钥与其他工作区。
```

## 21. 用户授权的公网Web入口（2026-10-09）

### 当前入口与实现

- 用户明确要求“把新服务器允许可以公网访问吧”。本轮只开放Naumi Web，入口为 `http://120.27.162.85/`，作品页 `http://120.27.162.85/works`。当前是HTTP/80；本轮没有域名、TLS证书或443，不声称HTTPS已完成。登录仍沿用原账号，未变更账号密码或禁用认证。
- APP保持 `127.0.0.1:13012:3000`；新增独立systemd `naumi-staging-public.service`，NGINX反代至回环APP，enabled/active，自动启动、失败恢复。配置支持64MiB请求、长生成响应、WebSocket升级及真实来源header；不接管DB、Router或代理端口。公开内部 `/api/video/worker/` 返回403，点文件路径返回404；用户管理员API保留应用403鉴权。
- NGINX来自Ubuntu官方软件源 `nginx` 和 `nginx-common` 固定 `1.24.0-2ubuntu7.18`，只提取到 `/usr/local/lib/naumi-staging-web`，未执行系统包安装/postinst，未引入默认NGINX站点或重启Docker。包/hash在 `/opt/naumi-staging/config/public-nginx-package`，运行二进制hash另存证据；服务使用systemd资源/文件系统约束和www-data worker。请求access日志关闭，不记录cookie/token。
- 本机独立HTTP直连（不走SSH隧道）作品页/health200，未登录admin403、公开worker403；内置浏览器实际打开公网作品页并保留交付标签。匿名session返回user:null。未执行密码登录/收费生成，用户此前的本人验收记录不变。
- APP/Worker/DB的Config、HostConfig、StartedAt与Image完整hash对比前后一致，未重启这三个服务。DB没有公开端口；APP仍回环，Clash7897/1053和Router18081/18082监听地址保持原样。没有更改UFW/云安全组规则，实际公网80连通；旧机未连接或发布。

### 可执行文件与回滚

仓库：`deploy/staging/nginx-public.conf`、`deploy/staging/naumi-staging-public.service`、`scripts/staging/{download-public-nginx,enable-public-web,verify-public-web,rollback-public-web}.sh`。启用脚本拒绝覆盖已有unit/80占用，复用前先检查实际状态；当前已运行，不重复enable。

四件套：`/opt/naumi-staging/evidence/public-web-20261009/{MODIFIED_FILE.conf,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。baseline是原“无公网网关/无80监听”的明确记录，原APP/Worker/DB配置/开始时间hash独立保留；不存在原NGINX配置可备份，不把marker冒充原配置。源码与私有环境/DB/媒体均未改。

```bash
/usr/local/lib/naumi-staging-web/usr/sbin/nginx -e stderr -t -c /opt/naumi-staging/evidence/public-web-20261009/MODIFIED_FILE.conf
systemctl is-active naumi-staging-public.service
systemctl is-enabled naumi-staging-public.service
# 只在用户要求关闭公网时执行；不停止app/db/worker。
/opt/naumi-staging/evidence/public-web-20261009/ROLLBACK.sh --apply
```

- baseline本机公网curl：`BASELINE_PUBLIC_HTTP=000` / exit7；新机本地80也返回 `BASELINE_HOST_HTTP=000` / exit7。
- 修改后：`PUBLIC_WEB=PASS LISTEN=80 HEALTH=200 ADMIN_UNAUTH=403 WORKER_PUBLIC=403 APP_BINDING=UNCHANGED APPLICATION_RESTARTED=0` / exit0。
- 回滚演练使用同一NGINX配置第二副本，只监听回环18080；建立独立临时systemd服务，health200后执行 `ROLLBACK.sh --fixture`，仅停用并删除该临时unit。输出 `PUBLIC_WEB_ROLLBACK=PASS FIXTURE_PORT=18080 RESTORED=NO_LISTENER MAIN_PORT=80 HEALTH=200 APP=200 MODIFIED_FILE_LEFT_CHANGED=1` / exit0。主80仍运行、MODIFIED hash未变；这证明真实第二网关副本回滚，不冒充公网主入口已经被关闭。实际--apply分支保留软件包/配置文件并移除本次unit，关闭80但不动业务容器；主入口--apply未执行。
- `PUBLIC_WEB_INVARIANTS=PASS APP_WORKER_DB_CONFIG_AND_START_TIME=IDENTICAL DB_PUBLIC_PORTS=0 APP_DIRECT=LOOPBACK ENV_PATH=404`。完整命令/输出/hash见四件套VERIFICATION，本机副本 `E:\Workspace\naumi\output\staging-public-web-20261009`。
- 首次Docker官方NGINX下载在中断后进程/句柄均消失且镜像不存在，未重启一个尚在运行的拉取；改用Ubuntu官方apt下载。首版systemd日志配置 `/dev/stderr` 无法重开导致启动失败exit1，改用NGINX原生 `stderr` 后同配置路径通过，保留原失败配置/journal。不更改业务候选来修网关问题。

公网授权只改变访问入口；第20节“视频/OSS后续、先不回传”继续有效，自动目标继续不等于生产回传授权。

## 22. 画布操作模型管理员统一配置（2026-10-09）

用户纠正“这个东西不应该由用户选择，而是应该由管理员统一配置”。本次移除画布编辑模型面板与扩图选择，七个canvas操作通过后台现有业务模型 `defaultModelId` 统一决定。客户端旧缓存/body/header覆盖均被收口，报价、实际执行与任务冻结保持一致；普通生图/视频选择不动。实现、测试和接手提示词见 `docs/CANVAS_ADMIN_MODEL_CONFIGURATION.md`。

baseline和modified在新机一次性空库中集中验证exit0；七功能新请求覆盖、管理员发布切换、21份冻结bundle、过期版本409与business-routing完整回归通过，没有真实供应商调用。源码原hash已保存，另一源码副本逆向patch与11文件hash恢复/基线行为复验exit0。旧65adfe回传包保留为历史候选，不代表此次修复；后续明确回传前必须重新打包并刷新生产基线。旧机仍不连接/回传，视频、OSS和local存储约定不变。

### 固定新候选与上线验收

- 业务代码commit `1f23c02f4841b632698f76b14b3e6fbccf441f1d` 已中文提交并推送 `codex/staging-media-handoff`。固定Git源码归档hash `268443426cb1e62e4add7dcd92dd6d20f7843422c910e6c696789f395577a3f0`；新机使用冻结依赖volume、network none完成完整Next构建exit0与固定镜像构建exit0。
- 实际APP/Worker镜像 `ghcr.io/jesstle/naumi:1f23c02f4841b632698f76b14b3e6fbccf441f1d`，IMAGE_ID `sha256:6df63e822b970e6d05adb453f90f4afcd6a890d19cb212206386fcfe8f8f36b0`，BUILD_VERSION `1791528778`。`/opt/naumi-staging/source/1f23c02f4841b632698f76b14b3e6fbccf441f1d-clean`未更改旧65adfe源码。
- 受保护env仅改 `NAUMI_IMAGE`；备份保留在证据目录 `env.before-release`，权限600，不下载/公开。部署仅重建app/worker，DB的Config/HostConfig/StartedAt/Image hash一致，公网NGINX PID/开始时间一致。数据库、媒体、Router和其他env未覆盖；历史保护1和local存储保留。
- Live七操作目录 `selectionMode=admin`，报价 body/header伪造模型后仍与正常报价相同；普通生图 `selectionMode=user`。隐藏的OCR默认绑定允许目录无可见选项，不因此改为用户选择或擅自曝光隐藏模型。没有新增真实生成/模型消费。公网health/canvas200、未登录admin403、公开worker403、.env404；APP/Worker运行镜像和label核对一致。
- 用户提供测试账号后，在公网浏览器实际登录，打开既有“产品.jpg”项目、选择图片和打开扩图面板；“图片编辑操作模型”与“执行模型”元素均0，普通生图 `gpt-image-2`选择器仍1。未点开始扩图/生成；截图本机 `E:\Workspace\naumi\output\canvas-admin-models-20261009\canvas-admin-ui.jpg`。后台访问沿用独立访问密码门槛，未变更访问认证或实际业务配置。
- 初次部署的验收脚本错误地要求隐藏OCR模型必须出现在可见目录；第二次错误地hash整个docker inspect（包含动态Health日志）。两次均触发真实新机服务回滚并恢复65adfe/health200，再修正验收脚本后第三次发布exit0。失败日志 `DEPLOY-attempt1.log/DEPLOY-attempt2.log`保留，不将这两次失败记为业务代码失败或最终已发布。最终 `DEPLOY.log/DEPLOY.exit=0`，新候选继续运行。
- 四件套 `/opt/naumi-staging/evidence/canvas-admin-models-20261009/{MODIFIED_FILE.tsx,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`；本机同名副本在上述output目录。ROLLBACK源码副本复验、实际服务失败自动回滚均已有记录；主MODIFIED保持修改后状态。新机当前候选已取代旧运行候选，但用户此前验收记录仅覆盖原65adfe，此次修复的验收依据是本节集中/真实页面结果。

```text
接手先读AGENTS.md和README第20—21节。新机公网http://120.27.162.85已开，
app仍回环13012，独立naumi-staging-public.service处理80；不要把DB/Router/
Clash改成公网，不关闭账号鉴权，不重复enable覆盖当前unit。改网关先保存
hash、nginx -t、reload并核验公网200/admin403/worker403与业务容器未重启。
回滚只有明确要求时执行对应public-web证据目录ROLLBACK.sh --apply；
视频/OSS延期，旧机回传仍须用户明确要求，禁止测试DB回灌。
```


## 23. 管理后台 MVP 与 APIMart 端到端验收（2026-10-09）

用户指定只更新新机 `120.27.162.85`。管理导航顶部新增 `/admin/mvp`，展示前端名称→真实模型→来源，支持来源接入、自动目录、能力确认、兼容目标切换。用户侧界面未改。分支核对、实现及完整验收说明见 `docs/admin-model-mvp.md`。

- 当前应用固定 commit：`f5a6f69b217ebeff6733fcd934c48a2d6a351c2c`；镜像 `sha256:bee98a62902b37fc2ce9936d7fdbe1870c13b8c0770a3d8f5ee664799538fe28`；`/api/version` 为 `1791536938`。
- 当前 Router 源码：`b3fc8dd61e62c564ac2ba2a08cf943f7c391970c`；Linux二进制SHA256 `78c263735556b8a06c0f41f80d7cdcebea6d8a45e678344e46ee72cf81376ae2`。运行进程代理环境已核实，不能只检查文件或服务active。
- 新机直连 APIMart 网络异常，显式精确origin批准的代理用于目录和生成；应用经仅Docker私网绑定的 `naumi-staging-model-proxy.service` 转发到既有Mihomo回环代理，Router直接用回环代理。仅批准 `https://api.apimart.ai`，无公网代理开放；其余地址继续原安全检查。
- 真实页面目录发现376个模型、添加与切换通过。真实应用任务 `job-b0a6972b-ae35-4f9f-88f5-adf08fcb1cd3` 完成并保存1254×1254 PNG；作品存在、媒体200、客户结算6积分/预占0，Router回执USD0.0085。
- 测试后还原原主生图默认通道，APImart来源与 `gpt-image-2.5-ext` 候选保留，生效配置v6。此轮验收不代表参考图、蒙版或全部画布能力已验证。
- 未取得上游任务ID的网络测试任务 `job-ad99d97d-ff60-4ac2-bde9-11864d201a19` 已用现有任务失败流程结束并释放客户预占/扣费0；供应商未知结果保留pending，不重发，不声称费用0。
- 证据目录 `/opt/naumi-staging/evidence/admin-mvp-apimart-e2e-20261009`，应用回滚 `ROLLBACK.sh`、Router回滚 `ROLLBACK-router.sh`，均有备份和无变更 `--check` 验证。历史final证据目录回滚检查误恢复Router的问题已修正；后续使用最新证据目录。

数据库、媒体、历史保护、账号鉴权、公网反代与私网服务边界保留；旧生产机未连接/修改。视频与OSS仍按第20节另行处理，不自动回传。

## 24. 画布新增面板 UI 与多 Agent 协作（2026-10-09）

新机已发布并验收画布UI源码e2e607c，公网版本1791533867。新增助手/改字侧栏、工作流弹窗、主工具栏和批量操作沿用canvas-ui主题，标注窄屏纵向布局且质量控件独立一行；既有管理员策略、模型家族与Dock避让保留。实现与证据见 `docs/changes/2026-10-09-canvas-ui-alignment.md`，远程 `/opt/naumi-staging/evidence/canvas-ui-release-20261009`。用户确认多个agent共同更新新机；从现在采用 `docs/AGENT_COLLABORATION.md` 的独立分支/worktree、选择性提交、main整合和串行发布/基线校验规则。旧机不回传、local媒体、视频/OSS延期约定不变。

## 25. 质量选择菜单样式（2026-10-09）

任务分支 `codex/image-quality-dropdown-style`，只替换质量控件的原生菜单，使用与画布一致的主题令牌和portal。质量档位、能力限制、计价与模型配置不变，详细实现与验收状态见 `docs/changes/2026-10-09-image-quality-dropdown.md`。集中源码测试、类型检查、lint、参数/Dock回归通过；新机固定源码f859393已构建、串行发布并完成实际浅/深色、窄屏、选择交互验收，公网版本1791541892。证据 `/opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2`，保留备份与可执行回滚，源码副本反向patch恢复原生菜单通过，主服务保持修改。本节文档提交不是额外业务发布。旧机不连接、不回传；local媒体、视频/OSS延期约定保留。

## 26. 模型家族工具范围与网站版本（2026-10-09）

新机已发布固定组合源码 `75affea3b69ea518ee5270e718faadc77294ab95`，版本 `1791542483`，网页右下角显示 `v2026.10.09-184123`。后台家族统一工具范围支持分组多选、全选和重新启用，原“配置别名”改为明确家族说明；全站区分浏览器实际代码与服务器版本，并提供更新提示和刷新。已合入同事质量菜单和所有前序修复，新增 nullable 范围列。真实 UI 与画布回归通过，测试后模型配置恢复原内容、生效版本25，完整草稿保留、付费生成0。备份和证据 `/opt/naumi-staging/evidence/mvp-tool-scope-version-20261009`；回滚兼容性说明见 `docs/changes/2026-10-09-mvp-tool-scope-version.md`。旧机不连接/不回传，local媒体、视频/OSS延期约定保留。

## 27. MVP 客户积分价格表（2026-10-09）

新机最新固定源码 `44c9eb877c004754cbf06d59ecb70c1ff471dfc4`、版本 `1791546283`、网页 `v2026.10.09-194443`，包含第26节版本。按模型家族/工具维护质量×分辨率价格矩阵，支持批量填价和统一积分，前端参考价/提交报价/冻结结算统一。未开放规格依据当前配置置灰，不冒充自动实测；供应商元数据和成本库由后续独立任务完善。真实UI验证2张=14、矩阵3张=24及价格刷新，测试后原价恢复为计费v8，模型v25/草稿不变、收费生成0。证据与可执行回滚 `/opt/naumi-staging/evidence/mvp-credit-pricing-20261009-r4`；细节及两次脚本断言错误后的真实回滚记录见 `docs/changes/2026-10-09-mvp-credit-pricing.md`。matrix/MVP价格配置在旧代码回滚前须恢复兼容配置。旧机未操作，DB/媒体/Router/账号、公网反代保留；视频/OSS仍延期。

## 28. 供应商模型参数与成本参考库（2026-10-09）

新机最新固定源码 `23abb39547c580d76608c046189187d0474982d6`，版本 `1791549148` / `v2026.10.09-203228`，包含第27节积分价格表。MVP新增 `/admin/mvp/library`，三张增量表维护供应商实际模型ID、家族/品牌/参数、按次/量及输入输出缓存采购价、资料依据和修订历史，支持组合筛选/编辑/导出。目录只自动发现ID；能力与价格标明未知/配置/文档/验证，保留原币种，不猜品牌、不将未知当免费，不覆盖人工记录或客户售价。上线导入861条，其中23条带配置资料；真实UI同步/筛选/参数/精确价格/历史/手机/权限通过，临时样例恢复原内容，模型v33/完整草稿与计费v8不变、收费生成0。全程持共用锁，APP/Worker固定镜像、DB/媒体/Compose/Router/账号与公网代理保留。证据与回滚 `/opt/naumi-staging/evidence/supplier-model-metadata-20261009`；详细记录 `docs/changes/2026-10-09-supplier-model-metadata.md`，数据结构与后续销售平台关系 `docs/supplier-model-metadata.md`。本轮不实现新支付/购买/开票网站，不回传旧机，视频/OSS仍延期。

## 29. 画布模型范围一致（2026-10-09）

新机最新固定源码 `17bfa9c2c40f341b0bbee96f57861476389dc245`，版本 `1791551890` / `v2026.10.09-211810`。原画布Dock读自由生图目录，取消四项画布范围仍显示模型；现在显示/参数/报价/执行统一canvas.image，四操作按管理员默认，旧缓存不覆盖，返回页面自动刷新。普通生图兼容性补查保留原自带通道，实际handler+本地mock回归通过；用户随后明确取消自带接口，后续独立变更待执行。最终真实UI四项切换、报价和手机通过，无真实消费；原v33配置恢复为v42，草稿/计费v8保持。无需迁移，证据 `/opt/naumi-staging/evidence/canvas-model-scope-20261009-r2`；回滚退至稳定23abb395并保留数据，详情及中间版本/脚本错误记录 `docs/changes/2026-10-09-canvas-model-scope.md`。旧机不连接/回传，local媒体/视频/OSS约定保留。

## 30. 取消用户自带图片API（2026-10-09）

按用户明确范围，仅关闭账号自带图片API，保留ComfyUI工作流。新机运行固定源码5618bc6316ca1357dba00e9e6415c6a2507eebd1，版本1791554146 / v2026.10.09-215546；账户/菜单入口和自带模型消失，旧地址重定向，旧API410、旧自带模型新提交/报价409。已接受任务加密快照和历史记录保留，无迁移。隔离handler/冻结恢复/平台积分及实际线上桌面/手机/ComfyUI验收通过，模型v42/草稿/计费v8与旧端点、工作流记录不变，付费生成0。备份和回滚 `/opt/naumi-staging/evidence/disable-user-image-provider-20261009-r2`；共用锁全程持有，APP/Worker同固定镜像，DB/媒体/Compose/Router/公网代理/账号保留，回滚至17bfa9c。详细实现、脚本修正和证据见 `docs/changes/2026-10-09-user-image-api-retirement.md`。旧机不连接/回传，local媒体与视频/OSS延期约定保留；文档提交不另发镜像。

## 31. 模型展示顺序稳定（2026-10-09）

新机最新固定源码65cec1974646877128ed7ccc849f8647aa730c49，版本1791555201 / v2026.10.09-221321。MVP先按持久模型配置建立稳定行序，再附加工具范围；前端默认和缓存选择仅选比例代表、不提升家族。实际关闭/重新启用/即时刷新/前端选择与缓存刷新验收通过，原v42完整配置恢复为v48，草稿和计费v8/历史记录保留，付费生成0，无迁移。备份与证据 `/opt/naumi-staging/evidence/stable-model-order-20261009`，全程共用发布锁，回滚至5618bc6；细节见 `docs/changes/2026-10-09-stable-model-order.md`。APP/Worker固定镜像，DB/媒体/Compose/Router连接/代理/账号保留；旧机不连接/回传，local媒体与视频/OSS延期约定保留。文档和验收等待条件提交不另发镜像。

## 32. MVP 显示质量档位与供应商实际参数（2026-10-09）

新机最新固定源码8ca8329aec4af8af6e526bfa9ab3824648bc1e92，版本1791559097 / v2026.10.09-231817；APP/Worker 镜像 sha256:3c281c586bc309a6f60e1e963428de545766187529ef07a6b2b3c27306902d71。MVP新增“参数设置”，逐档启用/改名及各实际来源映射、原样发送或移除quality，家族比例分支统一展示、分别映射。当前OpenAI Images/Flow直连支持，外部Router/APIMart、路由池与成本预设不能覆盖执行契约；仅质量档位，比例/分辨率沿用现有配置。配置存既有版本JSON，无迁移；报价按平台档，执行/审计记录真实值，已接受任务使用原冻结配置。

当前GPT五档已开放并原样发送，模型配置v58，价格v8/完整草稿/默认模型/行序/历史端点/ComfyUI保留。供应商实际七次尝试：GPT六次（五档和无效值）均返回图片，只记接受请求、效果未验证；Flow一次连接结果不明后停止，未重提，不声称供应商费用0。隔离请求/JSON/multipart/Flow/冻结任务/积分与实际线上五档改名、映射、关闭档拒绝、omit报价、手机、版本均验收通过，浏览器收费生成0。真实供应商测试与浏览器验收消费区分记录。

证据 `/opt/naumi-staging/evidence/mvp-model-parameters-20261009-release`，实测原始结果 `/opt/naumi-staging/evidence/mvp-model-parameters-20261009/probe-results.json`；详情 `docs/changes/2026-10-09-mvp-model-parameters.md`。发布全程共用锁、备份和最终健康验证，锁已释放。旧镜像65cec197不识别qualityPolicy，回滚脚本必须先恢复兼容v48配置，核验拥有版本且无新未结算图片任务；已实际验证临时v56恢复至v57，再正式启用v58，并验证过期版本拒绝覆盖。保留DB/媒体/Compose/Router/代理/账号，旧机不连接/不回传，local与视频/OSS延期约定保持；测试/文档跟进不另发镜像。

## 33. 同事画布 UI 与节点编辑集中合并发布（2026-10-10）

按用户要求，将最新 `codex/canvas-node-editing` /61cc4be（包含图标、工具栏和助手侧栏依赖）整体合入 main 并发布新机。当前固定源码3610074a4db5523798138b997a8045e365f45137，APP/Worker 镜像 sha256:635b89f8e4f415a452fd8f02cd9883c4dcb80c27a50b7a4bb15fa30932432ea4，版本1791561629 / v2026.10.10-000029，浏览器与服务器核对一致。包含高频工具、400px助手/手机浮层、裁剪替换新图片版本、文字样式/锁定/层级/属性，修正版号浮层挡属性保存按钮的合并冲突。

隔离真实数据库和完整HTTP/画布验证像素编辑、撤销重做、文字样式刷新、权限/幂等/事务回滚；关键12个生成函数保留，五档/480参数组合、Dock2625案例、管理员模型/冻结任务/积分/ComfyUI回归通过。线上桌面/390px五档、侧栏、属性和版本通过；线上用模拟节点、history拦截和SSE stub，无真实供应商消费，不冒充线上真实保存/供应商对话。原model v58/billing v8、配置/草稿hash、历史接口/ComfyUI摘要一致。新增两张懒初始化表为增量，实际应用权限创建通过。

证据 `/opt/naumi-staging/evidence/canvas-ui-integration-20261009`，详情 `docs/changes/2026-10-09-canvas-ui-integration.md`。全程deploy.lock、备份/固定构建/上线/健康与实际版本验收完成，锁已释放。回滚至8ca8329保留现有qualityPolicy、新表和图片，不回灌DB/删除媒体；可执行脚本核对当前候选并自行取锁。DB/媒体/Compose/Router/账号/公网代理保持；旧机不连接/回传，视频和OSS延期、local约定保持。文档跟进不另发业务镜像。


## 34. 画布范围内选模型与后台排序（2026-10-10）

用户确认画布组范围保存生效，要求显示所有已开放模型并在后台排序。固定源码 `365878e012d39e5137fc12217c69661f0941fb10`、镜像同SHA、Image ID `sha256:3197935bcfa180f6ef96ee57f2da31af3b433726bd3d6740eea027e4a03e6ba6` 已上线新机，实际版号1791595122 / `v2026.10.10-091842`。画布生图/扩图/改字/标注可选范围内模型；默认仅回退，其他三项文字/视觉用途保留管理员默认。MVP“调整排序”上移下移后保存，家族与比例分支一起排序，各工具目录同步；范围修改与用户选择不置顶。积分、路由、默认绑定原样保留。

TypeScript、隔离原生数据库发布/解析/报价/冻结和浏览器分组、选择/刷新、排序保存/刷新、范围移除回退及手机验收完成。线上原生/浏览器检查生图13分支→4家族（其他三项图片工具当前各1模型）、顺序、选择/刷新、报价、扩图选择、排序弹窗和手机；配置v66、计费v8、整个生效模型配置、所有草稿和用户接口/ComfyUI历史指纹与发布前一致，0付费调用/0业务测试写入。证据 `/opt/naumi-staging/evidence/canvas-scoped-selection-20261010-r2`。

发布全程持deploy.lock，数据库完整备份和固定镜像回滚准备通过，验收后已释放；回滚至3610074，不修改DB或媒体，没有新增字段/迁移。DB容器/Compose/环境其他字段/公网代理保持。只发布新机，旧机未连接/回传；视频/OSS仍延期，媒体仍local。详见 `docs/changes/2026-10-10-canvas-scoped-model-selection.md`。

## 35. 元数据默认参数与画布系统范围（2026-10-10）

固定源码 `08e0354f9d5910b67b174b609a004848d17cd73a` 已发布120.27.162.85，APP/Worker固定镜像同SHA，Image ID `sha256:141f5a05cf11c31c919bffa2e2cc78e8be6f140d2622ca33e67b2fb46da45ca7`，实际版本1791597752 / `v2026.10.10-100232`。质量默认按精确供应商+实际模型元数据匹配，显示来源／修订并开放逐档编辑；保留既有显式配置，缺资料不猜供应商枚举。画布一次授权所有符合能力模块，图片／文字分别选择，Agent对话要求图片理解、出图走图片池；A+画布路径沿用原售价与能力校验，独立抠图和ComfyUI保持。

隔离原生DB、模拟供应商HTTP、真实浏览器发布／元数据冲突保留输入／报价／范围／历史冻结／共享选择／节点编辑均通过。线上七项目录、参数编辑／元数据默认恢复／库编辑弹窗、单个画布勾选和用途、手机、顺序／选择／刷新／报价通过；验收不提交配置或采购资料，不发付费生成。模型v66、计费v8、完整配置与草稿hash保持；采购价格和元数据修订hash保持，861条元数据逐列与完整发布前备份比较，仅目录发现last_seen_at更新时间允许变化。

备份及证据 `/opt/naumi-staging/evidence/metadata-canvas-20261010`，发布全程deploy.lock，最终健康、实际镜像／版本及浏览器验收后锁已释放。固定回滚镜像 `ghcr.io/jesstle/naumi:855762070fa0a973f83cb3f9611b1f933cea57e6` / `sha256:90c6736adeb56a575b6f6677f0ad66a80ebdc7c0724e655746ed5246772c3a79` 基于前序365878e，仅扩展历史systems字段读取；已用旧执行器验证新旧冻结图片／文字／A+任务。正常回滚保留配置原样，scope-compat仅是恢复逐项范围管理的可选鉴权操作。DB容器、媒体、Compose、其他环境字段及公网代理保持；旧机不连接，视频／OSS仍延期。验收和文档提交不另发业务镜像。

## 36. 正式模型管理命名与旧入口兼容（2026-10-10）

固定源码5cb8600f1cbe14be0dbd7fbbe4c705ce7e545f6a已发布新机120.27.162.85，APP／Worker镜像同SHA，Image ID sha256:07370677c52b6958af4ad7fc96d0e26462f9d41b97f0d2e151a4e6bf54045d75，实际版本1791599031 / v2026.10.10-102351。代码、组件、目录和验收脚本统一正式model-management／management命名，入口/admin/model-management和/library，导航“模型管理”；旧页面永久跳转并保留查询，旧API保持同处理器与鉴权。发布reason也属于历史操作指纹，与ID／actor／锁／待处理记录一起保留原协议格式，无业务数据迁移。

原生改名前模型和积分发布记录重试、参数／范围／权限／冻结钱包，以及浏览器旧地址跳转、跨API同操作恢复、旧sessionStorage核对、接入／改名／积分／手机通过；线上正式入口、新旧API权限、参数与单个画布范围、元数据库弹窗、模型顺序／选择刷新／报价／扩图和手机通过。验收不提交生产配置，不发收费生成；模型v66／价格v8／完整配置／草稿及元数据库861条、修订863条、采购价格完整指纹保持。

证据与完整备份 /opt/naumi-staging/evidence/model-management-naming-20261010-r2，全程deploy.lock，最终健康／实际版本／浏览器验证完成，锁已释放。固定兼容回滚b73533d74a2b4c92761bd6d2ef5c2745668d9f64 / sha256:9e98745315e8a637633671f4c7c62326f926a093b2cd53c1ca2a32629df155c4基于08e0354，仅添加新地址兼容层，回滚后新书签和已加载前端仍可访问；DB、媒体、Compose、其他环境字段与代理保持，旧机未连接，视频／OSS仍延期。详见docs/changes/2026-10-10-model-management-naming.md，当前模块说明docs/admin-model-management.md。文档与验收跟进不另发业务镜像。


## 37. 四个同事功能分支集中上线（2026-10-10）

用户要求将此前列出的四个未合入功能分支全部合入：canvas-toolbar-copy、model-brand-icons、image25-output-price-table、pricing-page-preview，已保留提交历史并进入main。固定业务源码6446fab68aaccc6cccdfa8217bbaebed95d27ac9，APP/Worker Image ID sha256:f1c5f505d129d38b08a1aabcfb9a4d1925efd0f22a28f94fbd0348fb8d5235ca，实际版本1791600281 / v2026.10.10-104441。包含工具提示精简、33品牌本地SVG/别名识别、管理员原生输出参考价矩阵/人民币筛选下载、套餐预览代码；公开套餐页遵守主线最新关闭规则，价格表不自动应用到真实积分。

集中类型/源图标和金额/参数/冻结积分/完整节点编辑与浏览器验收通过。线上真实价格API权限/405、公开定价404、菜单品牌/渐变唯一、四家族选择刷新报价/排序弹窗、范围/元数据映射和手机通过；不提交业务配置、不发收费生成。模型v66/计费v8、完整配置/草稿hash与元数据861条/修订863条/采购价格完整hash不变。全程deploy.lock、完整备份与固定5cb8600回滚准备，最终健康db.ok/版号/镜像一致且锁释放，临时浏览器会话清理。证据/备份 /opt/naumi-staging/evidence/colleague-integration-20261010，详见docs/changes/2026-10-10-colleague-branches-integration.md。旧机未连接/回传，DB/媒体/Compose/其他环境字段与代理保持，local媒体/视频OSS延期约定保留；文档跟进不另发镜像。


## 38. 后台文字模型名称与已保存前端名称一致（2026-10-10）

用户保存GPT-6Astra后前端已变而后台仍显示gpt6Astra，根因为混合inventory误用图片家族聚合。固定源码7099f06959934e3a2a8145ba76f4e973d0b5cb2b已发布新机，APP/Worker Image ID sha256:d37d28cda1eea2da592ad6587f4005148dceab1c78b3e38665372cca08a8337d，实际版本1791601939 / v2026.10.10-111219。图片聚合跳过明确非图片项，保持文字/视频label与顺序；未重写任何模型配置。

旧函数复现、原生混合inventory/再次改名/前缀碰撞与完整Next+PG文字保存/标题/目录/刷新/再开编辑框及图片/价格/范围/排序/手机通过。线上所有非图片标题/编辑框与保存名称及前端文字目录一致，GPT-6Astra专门截图/刷新验证，真实hy4-preview保持；参数/库/画布用途、四家族顺序/选择/报价/手机通过。用户最新模型v76/价格v8、整个配置与所有草稿hash、元数据861条/修订863条/采购价格hash不变，收费生成0。

全程deploy.lock、完整备份与固定6446fab回滚准备，最终健康/实际镜像/版本/浏览器验收通过、锁释放，临时会话helper清理。证据/备份 /opt/naumi-staging/evidence/management-text-name-20261010，详见docs/changes/2026-10-10-management-text-display-name.md。DB/媒体/Compose/其他env/公网代理保持，旧机不连接/回传，local媒体/视频OSS延期约定不变；文档跟进不另发镜像。

## 39. 家族前端输出分辨率选项（2026-10-10）

固定源码dc4c4e7de51ca422e59b117078935ad19b7d2381已发布120.27.162.85，APP/Worker Image ID sha256:aeac30a4fb4c8b7b44d8dbedfff7b8307a9ce3e7fd4c8b5b15e3b0246befb759，实际版号1791604344 / v2026.10.10-115224。“模型管理→分辨率设置”可多选1K/2K/4K、全选、恢复默认；按家族统一比例分支，生图、提取、服装/包装3D、画布及积分表同步。新增可选displayResolutions及标准草稿nullable jsonb列，不变更原生能力、参数映射、放大路径或售价。关闭档位请求/报价拒绝，已接受任务读取冻结版本。

用户明确选“两款都开启”，Nano Banana Pro和Nano Banana 2已通过正常配置接口保存三档，模型v80->82、计费v8，完整配置只加授权展示字段，旧草稿与861条元数据/863修订/采购价格保留。原生发布/关闭/恢复/冻结/兼容、完整隔离管理和画布、线上两款刷新/生图/画布1/2/4K与实际4K报价、排序/选中/手机及参数范围文字名验收通过，收费生成0。持续锁、DB/env/Compose备份和证据在/opt/naumi-staging/evidence/model-display-resolutions-20261010，锁已释放；固定兼容回滚d1efcf8d69c753c48a19b0a83076d789c6875a1b支持新字段/API/冻结读写，禁止直接回滚原7099。详情见docs/changes/2026-10-10-model-display-resolutions.md。旧服务器未连接，OSS/视频仍延期。

## 40. 多供应通道调度与上游元数据自动归档（2026-10-10）

固定业务源码f6e9c47a59ae4e9dd8214c1d19dba0e3ed5696d3已发布120.27.162.85，APP/Worker Image ID sha256:8ac5f7eb8598895729d7af96b0d5d4d8a8baf911d3bffb90a061ebca811ded8f，实际版号1791608095 / v2026.10.10-125455。模型管理“供应通道”允许启停、主备优先、优先级分组及权重分流；同账号两个协议入口共享并发4，满载溢出，连续可用性失败熔断恢复，未知接单不重提。Prompt Hubs图片和香蕉入口已接入GPT-Image-2.5/Nano Banana Pro/Nano Banana 2全部比例分支，前端名/顺序/范围/参数/1K2K4K/售价保留。初始原70%/新30%，用户后续v94停用Pro旧Flow，保持最新操作；计费v8。

正常应用3款真实报价/任务/供应/媒体200/积分结算各4积分，接入前3款生成与单参考编辑6次，共9次真实调用；原生加权/多进程/共享容量/拒绝与未知/冻结/任务结算及真实管理和画布手机通过。公开目录与密钥访问清单分别保存，中文ID保留，两个协议入口各107公开模型/20密钥可访问；公开价格只在明确币种单位时入结构化行，倍率留原始资料。三款实测与质量默认映射已登记，原生尺寸/质量效果/多参考上限不冒充全面实测。人工采购数据/旧72草稿保留，208旧未知行补公开文档留史，知识库最终1244行/20归档快照；接入自动归档约定写入AGENTS.md。

全程新机锁、固定兼容回滚ae81746fba321061adef038d62bcd9af27a50578准备、完整DB/env/Compose备份；首次验收脚本读取权限导致自动回滚后刷新基线再发布，最终健康/实际镜像/版本/UI通过、锁释放、临时会话密文清理。备份/证据 /opt/naumi-staging/evidence/multi-supplier-channels-20261010，详情docs/changes/2026-10-10-multi-supplier-channels.md。禁止直接回滚不识别supplierRouting的dc4旧后端；不回灌DB，不连接旧机。DB/媒体/Compose/其他env/代理保持，视频/OSS仍延期；文档跟进不另发业务镜像。

## 41. 生图供应通道失败静默切换修复（2026-10-10）

业务源码95ac9306a516e61e96f5ca26636c6a4421e2fa01已发布120.27.162.85，APP/Worker固定镜像同SHA，Image ID sha256:d45b11afe9b89c19d38cd7783c9d6159f517522fa234fd92a3bf431b8c5fcad3，版号1791609959 / v2026.10.10-132559。修复仅明确未收费拒绝可重试的旧限制，异常、供应商超时、流式报错、空图/坏图或媒体下载失败后，同一任务继续其他已启用兼容供应商；每通道最多一次，有效图片取得后停止，用户取消不开始备用调用，客户成功只结算一次、全部耗尽才失败释放。供应商成本未知独立保留审计，不伪称未收费；历史任务恢复不重放已经记账的供应阶段。

隔离原生HTTP/SSE/无图坏图/断连/超时/参考图/取消/多进程容量与真实任务钱包结算、完整管理浏览器/类型检查通过。真实单参考Nano2任务job-4a1e4220-3c4f-4ded-950f-25361279611b，Flow403后同任务Prompt Hubs200、媒体200、全程pending至done，报价6且唯一consume=-6；Pro任务job-b7875626-c97e-49d8-9c4e-ff4b13ff9549两源分别失败/超时，确认耗尽结束、预占释放、客户扣费0。临时正常API设置主备后均恢复，原完整模型配置指纹保持（v94→恢复v98），Pro旧Flow停用及原7/新3保持；计费v8、原84草稿、元数据库修订与采购价格指纹不变。线上浏览器通道说明、启停/权重、手机和生图分辨率通过且无配置写入。

完整DB/env/Compose备份、固定兼容回滚f6e9c47a59ae4e9dd8214c1d19dba0e3ed5696d3与证据 /opt/naumi-staging/evidence/supplier-fallback-20261010；无Schema新增，DB/媒体/Compose/其他env/代理保持。最终健康、APP/Worker固定镜像与实际版本核实，持续deploy.lock在验收后释放，临时签名会话/容器helper已清理，原SSH私钥保持。旧机未连接，OSS/视频延期不变。详见docs/changes/2026-10-10-supplier-fallback-fix.md；文档跟进不另发业务镜像。
## 42. 后台关闭质量档位时前端直接隐藏（2026-10-10）

业务源码ba84ea3e7c6d05b797338cc0de55427df8aeaaca已发布120.27.162.85，APP/Worker固定镜像同SHA，Image ID sha256:152de000953f139c39808182d41a966ecd656f33cbf42f9ab1f8c4612831ff8b，实际版号1791610783 / v2026.10.10-133943。共享质量控件覆盖画布及其他生图工具，独立生图页同步按allowedQualities过滤，未开放“超高/最高”直接隐藏；后台开放则显示并沿用设置名称，缓存关闭档位回退到可选档，参数映射和售价保持。

隔离真实发布浏览器验证五档→关闭超高→三档、缓存最高回退、实际报价/提交参数和关闭档拒绝、草稿/售价恢复；定位/键盘/TypeScript检查通过。线上GPT五档、两款香蕉三档，生图/画布/手机仅显示允许项且无灰色占位，业务写入和付费生成0。模型v98、计费v8、完整配置和草稿、元数据库/修订/采购价格完整指纹不变。完整DB/env/Compose备份及证据 /opt/naumi-staging/evidence/quality-options-visibility-20261010，固定回滚95ac9306a516e61e96f5ca26636c6a4421e2fa01；无Schema迁移，DB/媒体/Compose/其他env/代理保持。最终健康、APP/Worker镜像、版号和浏览器核验后锁释放，临时会话清理，原SSH私钥保持。旧机未连接，视频/OSS延期不变；详情docs/changes/2026-10-10-quality-options-visibility.md，文档跟进不另发业务镜像。
## 43. 同事近期工具UI、主题切换和复杂整理上线（2026-10-10）

保留历史合入workbench-tools-ui(39f6208)、canvas-theme-toggle(5dfe813)、canvas-smart-layout(66777bb)，业务合并源码8cb835fe90f170b139918ebc3000bb13ec8f9f26已发布新机120.27.162.85。APP/Worker Image ID sha256:54c1fade2b5a89bc7f6453b02b5906722bcfe677f53facd7ac22dc3017af423c，实际版号1791612015 / v2026.10.10-140015。26工具UI与上传/历史/锁定改进、左下独立明暗按钮、复杂图文分区整理和原子撤销上线；主线质量关闭档隐藏、供应商失败静默切换等保留。

沿用分支证据，集中26工具普通/受管三视口、主题、30节点真实隔离DB整理/撤销/失败回滚及供应回归通过。额外质量全链在模拟提交等待未完成，不记通过；用户最新明确不频繁测试，收缩为必要兼容及上线健康/版本/页面冒烟。80e5b87只适配测试定位角色，不改业务源码。线上局部浅色工具页/外置主题按钮和健康/实际镜像/版本通过，模型消费0；模拟节点和拦截写入保留用户项目。模型v98/价格v8/整个配置和草稿指纹保持，构建等待期间元数据库新修订后已刷新备份，部署前后最新知识库/采购价指纹保持。

备份/固定ba84ea3e7c6d05b797338cc0de55427df8aeaaca回滚/证据 /opt/naumi-staging/evidence/colleague-updates-integration-20261010，持续锁最终验收后释放，临时会话清理。无新Schema，DB/媒体/Compose/其他env/代理保持，旧机未连接，OSS/视频延期不变。详见docs/changes/2026-10-10-colleague-updates-integration.md；文档跟进不另发业务镜像。
## 44. 新上游通道入口与远端分支整合上线（2026-10-10）

最新新机业务源码1600cff5c8ad1befbdf6b25e50c875ccc8b95bb5，APP/Worker Image ID sha256:80d5021de0e7f16b826c50739993879ed2ec3e752c3b56453a176a758a5c1bab，版号1791621584 / v2026.10.10-163944。包含前序9a158d7图片/文字从已接入上游新增供应通道、文字优先级/权重/有效输出前失败回退，以及本轮合入c27abc4批量工具栏、e668dc6模型菜单去掉重复参考报价、5510d56单图统一下载命名。历史交接文档一并合入，专用回滚版本保留，不覆盖当前功能。

沿用同事验收，仅补3项快速合并契约、Linux正式构建、线上原生检查及桌面/手机真实Shift选择（模拟节点）、实际模型菜单和报价、后台通道入口冒烟。付费调用0，模型v106/计费v8、完整配置/草稿、数据库/媒体/Compose/其他env/Router和公开代理保留；元数据切换前后指纹一致，打开后台后正常目录发现新增2条system-discovery修订，采购价1144点保持。完整备份含最新切换前DB快照，固定9a158d7回滚及证据 /opt/naumi-staging/evidence/remote-branches-20261010，最终健康/版本/镜像/UI通过，锁释放、临时会话清理。旧机未连接/回传，OSS/视频沿用延期约定。详见docs/changes/2026-10-10-remote-branches-release.md与2026-10-10-channel-onboarding-text-routing.md；文档跟进不另发镜像。


## 2026-10-10 画布 Agent 执行与持久历史发布

新机固定源码36255e03253703d2a524cf72cde67f0305956a2e，镜像同SHA，Image ID sha256:3b0a788fd1aa53a02b45519a0473c7f9caf17a0d93a2e098f6eb7e7adcc0bfff，实际1791624706 / v2026.10.10-173146。已合入canvas-agent-entry界面，并接通工具、画布结果和数据库对话生命周期。隔离工具链和生命周期、集中线上界面与原生失败历史恢复通过；模型v106、计费v8和配置/草稿/元数据/采购价格指纹保留。备份与证据 /opt/naumi-staging/evidence/canvas-agent-execution-20261010-r3，回滚1600cff，最终健康与版本通过，锁已释放。旧机未连接。

真实图片编辑E2E仍受文字供应商阻塞：glm-5.3-flash 404，hy4-preview超时；没有工具执行或图片扣费，不能记录为真实端到端成功。已向用户请求可用、支持图片理解/工具调用的文字上游。保持既有管理员配置，视频/OSS延期约定不变。详见docs/changes/2026-10-10-canvas-agent-execution.md。


## 2026-10-10 Agent 404 地址修复（当前已解除主通道阻塞）

仅向新机发布模型配置v107→v108：供应商“多模态chat”（mvp-592d52d8-cb9b-4fce-9c11-0de433e14532）选择openai-chat协议，却使用https://open.bigmodel.cn/api/anthropic/v1，目录200而chat/completions返回404。相同密钥的普通/api/paas/v4接口返回429余额不足；实测Coding Plan兼容地址https://open.bigmodel.cn/api/coding/paas/v4返回200并成功调用工具，已通过原生配置发布流程改为该地址。

GPT-6 Astra仍为显示名，真实主模型glm-5.3-flash，备用hy4-preview与优先级、工具范围、其他模型、积分配置v8保持。完整配置比较证明只改一个provider.baseUrl，原管理员草稿内容恢复；11个可访问模型目录自动归档至元数据库并记录来源，不覆盖人工维护和采购价。

线上真实Agent单张换色、当前图参考上传、画布结果父节点/origin、数据库历史及结果卡片均通过；唯一canvas.image任务结算4积分，无重复生成。首个验收账号只有2积分，正确被拦截，未出图或扣图片积分；后改用已有充足余额账号成功，不充值、不改用户余额。备用hy4-preview此前超时，未将其记为已修复。

本轮只改运行配置，无网站源码/Schema/镜像切换；仍运行36255e03253703d2a524cf72cde67f0305956a2e，Image ID sha256:3b0a788fd1aa53a02b45519a0473c7f9caf17a0d93a2e098f6eb7e7adcc0bfff，网站版号1791624706 / v2026.10.10-173146。新机健康、版本、env/Compose指纹通过；旧机未连接。

完整数据库备份/可读目录/修复及真实验收证据：/opt/naumi-staging/evidence/agent-404-fix-20261010。配置发布和真实验收均持deploy.lock，现已释放。ROLLBACK.txt及fix-provider.mjs --rollback通过原生版本发布仅回退该provider URL，保留其余管理员后续设置；不回灌数据库/媒体。临时帮助脚本与内存登录令牌已清理，无新本机登录JSON。空间维护计数：自36255起累计成功发布1次（本次配置发布计一次，文档提交不计），尚未到3次清理门槛。


## 2026-10-10 晚间最近分支集中发布准备

用户要求将最近完成分支合入main并发布新机。已整合工作流粘贴、新工作台示例、小球预览与Logo方案，并包含主线Naumi品牌清理；沿用分支验收，必要合并检查通过。发布仍仅120.27.162.85，固定镜像/备份/回滚/全程锁正在准备，尚未宣称上线。详见docs/changes/2026-10-10-recent-branches-release.md。


## 晚间集中发布结果（2026-10-10）

四个同事分支及main品牌清理已完整合入，固定业务源码c66a826c6887642169874d223abb3fcf1ea9cf7a已发布新机120.27.162.85。APP/Worker镜像ghcr.io/jesstle/naumi:c66a826c6887642169874d223abb3fcf1ea9cf7a，Image ID sha256:c469311060bb3ff2b7ee20dfd61f574fbdb50e560baca0c647e91999524d868b，实际版号1791635460 / v2026.10.10-203100。

合入canvas-workflow-paste d36ec8a、workbench-demo-refresh 4495ab0、naumi-brand-orb 60e44db、naumi-logo-explorations 5565c46，并包含21a6616品牌清理。小球保持独立/brand-orb预览，不接业务Agent；Logo六方案作为版本化设计素材保存，不替换正式Logo。工作流导入只迁移复制数据，不触发模型；新增app_canvas_workflow_imports/app_canvas_workflow_asset_ops两张表，回滚保留记录与素材。

沿用各分支已有隔离数据库/真实剪贴板/浏览器/构建验收，补充快速合并契约和集中Linux正式构建通过。线上原生模型管理、文字通道与画布模型用途、工作流鉴权/无效请求/新增表通过；实际生产资源的桌面/390px新示例、套图切换、小球SVG与状态、既有项目画布Agent入口、工作流清单接口通过。线上验收模型消费0。第一次浏览器断言误在画布项目列表找Agent入口，进入已有验收项目后定向检查通过；未重复跑已通过的示例/小球检查。

模型v108/积分v8、完整已发布配置及草稿、用户ComfyUI资料、供应商元数据/修订/人工采购价格切换及浏览器前后指纹保持。DB/业务媒体/Compose/其他env/Router/公网代理不覆盖，仅NAUMI_IMAGE切换；APP/Worker固定镜像和公开健康/版号通过，旧机未连接。

完整DB备份（已核对pg_restore目录）、切换前最新DB快照、env/Compose备份、固定36255e0回滚及证据位于/opt/naumi-staging/evidence/recent-branches-release-20261010。ROLLBACK.sh --apply只切回固定旧镜像，不回灌数据库、不删除新表或媒体。首次切换前检查因帮助脚本引用上一轮备份目录被安全拦住，无线上改动；修正证据引用后刷新锁/基线再发布，未重复构建。最终锁已释放，临时容器帮助脚本和内存登录令牌已清理；未创建本机登录JSON。

空间：构建前新机75%占用/约24.2GiB可用，切换后76%/约24GiB可用；本机C/E均超过190GiB可用。自36255基线起累计成功发布2次（Agent地址配置发布+本次镜像发布），尚未达到每3次清理门槛；本次未删除其他任务或有效回滚资料。文档后续提交不另发镜像。视频/OSS仍按用户约定延期，未记为通过。
