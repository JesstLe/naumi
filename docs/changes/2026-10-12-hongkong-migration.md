# 2026-10-12 迁移到华纳云香港服务器

## 当前状态：迁移完成，香港机已开放写入，旧 IP 兼容转发

2026-10-12 完成 120.27.162.85 → 179.236.104.112 迁移。当前公网入口 http://179.236.104.112/，旧入口 http://120.27.162.85/ 转发香港。目标 TARGET_READY、TARGET_ACCEPTING_WRITES、FINAL_ACCEPTANCE_COMPLETE 与源 CUTOVER_COMPLETE 已确认；香港是唯一业务写入端。源七个业务容器全部停止，restart policy 为 unless-stopped；源 Router、模型代理和 Mihomo 已停用并禁用开机启动，公共网关保留。域名解析未改，未连接旧101服务器，未接OSS/NAS。

范围包含 Naumi App/Worker/PostgreSQL、完整local媒体、账号/积分/项目/历史会话、模型参数/售价/供应商元数据及历史任务保护；Reverse Hub/New API及各自数据库、Redis、Router、Mihomo和模型代理已按原配置迁移。apimarket.work静态展示网站已复制，目标对应Host验收200；域名仍保持原解析，不声称域名/TLS迁移完成。

## 数据与运行验收

- 媒体6841文件、12,395,269,396字节，完整逐文件SHA256清单两机一致；清单指纹9dd39b405269326908af3737a92e123cac2e82c00002631b2621c6d718079694。
- 两个PostgreSQL冷复制前保存最新可读pg_dump和目录；目标启动业务前，完整表行指纹与源一致，Hub SQLite指纹一致。原数据库角色、配置、Redis、历史隔离guard及local媒体保留，不重跑旧增量同步。
- Naumi App/Worker固定镜像ghcr.io/jesstle/naumi:e04ce4bcd218bc464889bb64dea61071d1c67b3d，Image ID sha256:91b7e82abc9c5109a5a28fce66bc76ea57c89ba3143f9ca0f9becbc60e8d3e08；实际版号1791710526 / v2026.10.11-172206。未重建镜像。Reverse Hub及其他容器镜像与源固定基线一致。
- 原生签名账号会话、模型管理、画布图片/文字模型池、工作流接口通过；模型v108、积分v8，78用户、3233作品、2023账本。保留管理员配置/草稿/采购价/元数据，没有新增收费模型调用，不将接口健康等同所有供应商真实生成验收。
- 香港运行七个容器，Naumi/Hub/New API健康通过；新旧公网IP健康和实际版号200；公网实际作品库页面打开并显示v2026.10.11-172206。浏览器未登录，积分目录401为鉴权结果，不声称已登录页面全流程或全部模型调用验收。视频配置与OSS仍按先前约定延期。
- 目标Ubuntu24.04，8vCPU/16GiB，Docker29.1.3/Compose2.40.3。UFW启用，公网仅SSH22及Web80；App127.0.0.1:13012、Hub127.0.0.1:39133、New API127.0.0.1:4300、数据库/Redis/Router/代理保持私有。Docker网段172.18/19/21按原状态保留。

## 维护窗口与实际失败恢复

08:50北京时间进入最终停写；完整数据库冷复制约22分钟，前期媒体约12.4GB按现有约5Mbps带宽预复制，用户明确不增加费用。

第一次切流PID3235915的数据校验已通过，但公共网关刚启动时socket尚未就绪，立即HTTP检查返回000，脚本安全恢复源端。第二次PID3243802因Hub启动就绪前请求health连接重置，同样恢复源端。两次证据与标记分别保留在源证据目录attempt-1/attempt-2；补充公共网关、New API和Hub健康等待后再按实际状态续传，并非并行重复复制。

第三次PID3248777完成目标DB/媒体/固定镜像/原生API和公网媒体验收，移除目标写入门禁并启动Worker。源网关reload后首次检查仍命中短暂维护503；此时目标已接受写入，禁止恢复旧数据库。后续实际检查源代理配置正确、新旧公网健康200、源写入器均停止，才人工记录CUTOVER_COMPLETE。保留原日志，不将整段切流脚本记为无异常退出。

## 连接、锁、回退与收尾

独立工作副本C:/Users/Administrator/.codex/worktrees/branch-release-20261012/naumi，分支codex/hongkong-migration-20261012。受保护连接元数据在E:/workspace/naumi/output/hongkong-migration-20261012/source-connection.json与deploy-connection.json；只记录连接/私钥路径，不提交密钥或原始数据。香港主机指纹SHA256:6uHMLdhELerHz7w79VcUNw4wxIEGKPsfTXsL9bX3myU。

两机证据目录/opt/naumi-staging/evidence/hongkong-migration-20261012，保留备份/TOC、完整DB/媒体指纹、native-api.json、版本/公网健康、启动与切流日志。最终已删除源临时transfer_key私钥；本机受保护有效部署凭据保留。两机Naumi和Hub deploy.lock全程持有，最终写RELEASE_MIGRATION_LOCKS，核对持锁进程退出及两个锁可取得。heartbeat“香港服务器迁移监控”（automation）已更新PAUSED，不归档用户会话。

源原数据库、媒体、配置和历史备份保留。目标当前及最近两个成功固定镜像e04ce4b/a292138/164f9a1和release元信息保留；两个最近发布的固定ROLLBACK.sh及依赖配置/基线已复制至目标原证据路径，--check通过，未执行--apply。代码回滚仅切镜像，不回灌数据库。跨机回退必须先停香港写入、备份并反向同步香港最新数据库及媒体，再恢复源端；禁止直接恢复旧源备份覆盖香港后续写入，禁止同时启动源写入器。

本次环境迁移计成功发布1次，此前计数0；文档提交不计发布。目标磁盘约40%/29GiB可用，源约85%/15GiB可用，本机C约234.65GiB、E约207.29GiB可用。未构建、prune、删除volume或业务数据；只清理本任务临时传输私钥。后续空间维护及发布对象为香港机，源仅保留回退/兼容入口。
