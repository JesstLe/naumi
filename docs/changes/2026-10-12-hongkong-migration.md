# 2026-10-12 迁移到华纳云香港服务器

## 用户授权和范围

用户明确要求把120.27.162.85上的项目迁到刚买的179.236.104.112，并提醒包含反代聚合项目。后续决定：保持现有带宽、不增加费用；先监控迁移，最终公网完整运行并保持源站状态；先不配置域名解析。浏览器操控因无法可靠识别URL被自动检查暂停，浏览器专用接口也连接失败；未修改DNS。

迁移包括Naumi App/Worker/PostgreSQL、完整local媒体、模型配置/参数/价格/供应商元数据、账号/积分/项目/历史会话/历史任务保护，以及当前Reverse Hub/New API/PostgreSQL/Redis、Router、Mihomo模型代理、apimarket.work展示网站静态内容。不连接旧101服务器，不接NAS/OSS，不把源码运维脚本误当新业务版本。源数据保留回退；新IP验收通过后才切流，域名保持原解析。

## 当前状态：预复制完成，最终数据库同步进行中，香港机尚未上线

2026-10-12 08:50（北京时间）：三个复制成功标记齐全，媒体6841文件、12,395,269,396字节全部预复制到目标。两机持锁进程存活，源端七个镜像未改变，目标没有运行业务容器；源端pending生图/视频为0。复核两端脚本/目标固定镜像后，已启动源端 `cutover-source.sh`（PID 3235915，`cutover-run.log`）；`SOURCE_FROZEN` 已出现，源站处于维护，源写入器及数据库停止，正在最终冷复制数据库。两份最新pg_dump及可读目录、完整表行指纹已生成。目标尚无 `TARGET_READY`/`TARGET_ACCEPTING_WRITES`，不能记为上线成功。恢复时必须检查实际阶段和此PID/日志，禁止重跑整个切流脚本。目标开放写入命令补充 `set -Eeuo pipefail`，任何中间步骤失败立即停止；保留既定禁止用旧数据覆盖目标新写入的规则。

2026-10-12 03:33（北京时间）监控：静态配置与固定镜像传输均完成，源端 `STATIC_READY`、`IMAGES_READY` 与 `IMAGES_COPY=PASS` 已确认。完整媒体仍在预复制，目标目录当前1582个文件、1,719,001,163字节（包含正在传输的文件，尚未作完整一致性验收）；`MEDIA_PRECOPY_READY` 尚未出现。两机迁移锁存活，源端七个容器镜像与基线一致、网站健康，目标没有运行业务容器。未停写或切流；继续现有带宽复制。

- 源站继续运行，媒体预复制和静态/镜像复制均为服务器直接SSH传输，不经本机下载。观测总速率约5Mbps；完整12.4GB媒体需数小时，用户明确不加费用。
- 源媒体共6841文件、12,395,269,396字节：PNG3925个/10,411,917,666字节，bin1155个/1,471,041,272字节，其余JPEG/WebP及少量JSON/SVG；不是构建缓存，不删除历史素材。
- 目标Ubuntu24.04、8vCPU/16GiB内存/约48GiB磁盘；Docker29.1.3/Compose2.40.3及rsync已安装。私有Docker网段172.18/19/21按源配置准备，New API私有网段保持internal。Router/Mihomo账号及权限、代理配置、NGINX语法和展示网站复制已准备。
- 固定业务镜像仍e04ce4bcd218bc464889bb64dea61071d1c67b3d，Image ID sha256:91b7e82abc9c5109a5a28fce66bc76ea57c89ba3143f9ca0f9becbc60e8d3e08，版号1791710526 / v2026.10.11-172206；Reverse Hub镜像sha256:a376ac7871a15352a63d236a6cf08fb67c2e5c7d276d2a77f56101b89a88637c。当前与最近两个成功Naumi固定镜像一起传输，不重新构建。
- 原生源站Hub /health与New API /api/status均200；Naumi非历史来源pending图片/视频均0。还未停止源服务、复制最终数据库、启动目标业务或开放目标Web；不能记为迁移完成。

## 连接、锁与监控

独立工作副本C:/Users/Administrator/.codex/worktrees/branch-release-20261012/naumi，分支codex/hongkong-migration-20261012，从main 6dc7afe开始，不重置共享E盘checkout。后续普通fetch/整合/推送，保护并行同事代码。

受保护连接元数据：E:/workspace/naumi/output/hongkong-migration-20261012/source-connection.json与deploy-connection.json，所在目录/密钥已限制Windows ACL。只含host/user/有效私钥路径及已核对known-hosts路径，不记录密码；密钥、登录cookie与原始客户数据不得打印或提交。香港主机密钥SHA256：6uHMLdhELerHz7w79VcUNw4wxIEGKPsfTXsL9bX3myU。

两机证据目录均为/opt/naumi-staging/evidence/hongkong-migration-20261012。hold-migration-locks.sh同时持本机Naumi和Reverse Hub的releases/deploy.lock，直到本次最终验收完毕后写RELEASE_MIGRATION_LOCKS。源端初始两小时锁已转交给持续迁移锁并刷新镜像基线；lock.pid/hub-lock.pid是同一持锁PID，检查存活及MIGRATION_LOCKS_ACQUIRED。切流脚本只允许持锁时执行，禁止其他发布跨过此锁。

用户明确要求监控，已创建本线程heartbeat“香港服务器迁移监控”（id automation，每15分钟）。未改变/失败时保持安静，只在阶段变化、需要用户输入或完成时报告；最终完成后更新为PAUSED，不归档会话。

## 复制与切流执行

源端precopy.sh、transfer-static-images.sh后台正在运行；查看media-precopy.log、precopy-run.log、static-images.log。成功标记为MEDIA_PRECOPY_READY、STATIC_READY、IMAGES_READY。没有标记就不运行切流。断线后检查原进程确已结束再续传，不能产生同一目录的并行写入器；媒体使用rsync --partial，无删除。静态复制含受保护配置、真实公共网关配置、展示网站、固定release元信息及a8e0844整合源码。镜像经docker save/gzip/SSH/docker load直接传输，不在两机磁盘额外堆完整镜像tar。

三标记齐全、原固定镜像保持、目标未开站、源pending为0后，复核并执行源端cutover-source.sh。准备脚本位于本任务output目录与两机证据目录，尚未实际执行，Bash语法已检查。

1. 源Naumi网关短暂503，停App/Worker、Hub/New API写入器和Router；保存最新env/Compose/网关、两份可读pg_dump、两库完整表行指纹、Hub SQLite指纹，Redis SAVE，再停两PG/Redis。
2. 冷复制完整PostgreSQL数据目录（保留全部数据库/角色/历史guard）、Redis、Hub数据/账号秘密、Router最终state、最新配置及媒体增量；保存完整媒体SHA256清单。不删除源数据，不使用原历史同步计划。
3. 目标deploy-release.sh先核对固定镜像ID、重设同名服务账号权限与必要网关host项，再起两个数据库/Redis；必须全部表行指纹、Hub SQLite和完整媒体清单与源一致，才启动App/Hub/New API及Router/代理。
4. 验证签名账号、后台模型配置、图片/文字模型池、工作流、公开页面/health/version、一个真实媒体字节hash、Hub/New API健康、旧虚拟主机静态网站。未新增收费模型调用，不声称已验证所有上游真实生成。
5. 切流前失败有ERR处理：停目标相关写入器、恢复源数据库/业务和原网关。若SOURCE_FROZEN/SOURCE_RESUMED_AFTER_FAILURE或目标TARGET_ACCEPTING_WRITES存在，先检查阶段，禁止盲目重跑。
6. 目标验收后标TARGET_ACCEPTING_WRITES，启动香港Worker，源Naumi网关改代理香港，保留旧IP兼容入口；源写入器不再运行，避免双执行/双扣费。CUTOVER_COMPLETE表示脚本完成，仍需最终公网/页面验收和清理交接。

目标App仍绑定127.0.0.1:13012，Hub39133/New API4300、DB/Redis、Router/Clash保持私有。只开放与源一致的Naumi Web80；没有域名解析或TLS变更，不声称HTTPS已完成。

## 回退与最终收尾

切流前失败恢复源端；切流后香港可能已有新写入，不能直接恢复旧源备份或同时启动旧写入器。需要回退时先停香港写入，备份并反向同步香港最新数据库/媒体，再恢复源服务，核验基线。源数据库/媒体和固定镜像不删除，至少保留当前与最近两成功版本和七日备份。

最终验收成功后移除源端临时transfer_key私钥（本机有效部署凭据保留）、释放两机迁移锁并核对进程退出，更新本文、迁移README、协作记录、成功发布计数及实际空间。当前源磁盘约84%/15GiB可用，目标复制中约6%/45GiB可用，本轮没有构建/清理业务数据；后续源机若还要构建，先按空间约定维护。尚未成功切流，计数不提前增加。
