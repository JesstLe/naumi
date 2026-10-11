# 2026-10-12 分支整合与服务器源码同步

用户要求合并分支并更新现有服务器。目标120.27.162.85；华纳云179.236.104.112未迁移，旧机未连接。

刷新远端后，唯一未合入的新工作为codex/staging-data-sync-20261012（a8e084412304f37e76bd5e2ad0f7289b4e0258db，2026-10-12 01:19 +0800），另四条引用为专用历史兼容回滚分支。远端此前重写后的主线ff349d89a95cb415e05b6a5386cbfdc3552f7035与本机原afadc13文件树相同；使用新独立工作副本从origin/main开始，不将旧历史重新推回远端，不重置共享checkout。

main普通快进至a8e0844，只有9个运维脚本/文档文件变化。src、public、依赖、Docker构建文件和Worker无变化。沿用同事既有数据同步验收，不重复迁移或连接旧机。

固定Git源码包SHA256：ed72d1e11a79b12547bf157b89b476aad738695053751ca19877d500b08724ce。服务器源码目录/opt/naumi-staging/source/a8e084412304f37e76bd5e2ad0f7289b4e0258db-clean，releases/LATEST_INTEGRATED_SOURCE记录集成SHA，独立于运行镜像版号。

source-only deploy-release.sh全程持deploy.lock，核对APP/Worker基线、备份可读pg_dump/env/Compose/旧源码指针，然后解包固定源码。Python AST、Bash/Node语法、7个新增脚本哈希通过。只解析脚本，没有执行数据同步或回滚。最终公开健康/版号、容器ID/镜像/启动时间及配置哈希保持，SOURCE_SYNC=PASS，锁已释放。

运行镜像仍为ghcr.io/jesstle/naumi:e04ce4bcd218bc464889bb64dea61071d1c67b3d，Image ID sha256:91b7e82abc9c5109a5a28fce66bc76ea57c89ba3143f9ca0f9becbc60e8d3e08，实际版号1791710526 / v2026.10.11-172206。业务代码无变化，没有重建镜像/重启服务/改变网页版本；不将源码同步冒充新网站功能发布。

证据/源码包/备份/ROLLBACK.sh在/opt/naumi-staging/evidence/branch-release-20261012。ROLLBACK.sh --check确认备份可读；--apply仅持锁且指针仍为本轮SHA时恢复旧源码指针，不回灌数据库，不删除媒体或源码。

磁盘84%，可用16,139,354,112字节，源码96MiB，本轮没有构建。下次构建前须按>80%约定维护。未删除其他任务缓存/媒体/备份；不计业务镜像或配置发布，维护计数仍0。视频/OSS延期保持。
