# 画布视频：103 私有文件暂存与容量决策

## 当前状态

开工刷新 origin/main，基线 89d5a97。业务候选仍为固定 e997b290b39fc9df63e4c3b6387fa008b7b0e18d / 1792200281，本轮不改业务源码、不重建镜像。

103 已收到三个完整归档文件，服务器端逐个重新计算 SHA、核对大小和权限。仅私有文件暂存：没有解包、导入 Docker 镜像、启动候选、停旧容器或切换 Nginx，没有数据库/媒体/计费变更，没有持有发布锁，发布计数不增加。传输使用现有 47→103 TCP relay；没有在 47 执行命令、写文件或改服务。原私钥未修改，临时受保护副本按原连接包装器 finally 清理。

目标目录 /opt/naumi-staging/evidence/canvas-video-prestage-e997-20261017-0615，root:root、0700；归档 root:root、0600。只创建本轮明确命名的新目录/文件，先独占写入随机 partial，完成后改名，再由服务器验证 SHA。不覆盖运行服务或其他发布目录。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| naumi-hk103-video-e997b290b39f-deployment-verified.tar.gz | 13994858 | bac2c478784b92439877da28b6731e041413c89617c7578f7ce7ba5f7bf5cb4c |
| naumi-hk103-video-e997b290b39f-rollback-private-verified.tar.gz | 37722 | 5c838f9862d46fe0003e26914f017db817f8af25e75c1b1ce70acf3925565924 |
| image-fixed-9fea/main-image-9fea589fed46-20261017.tar.gz | 243064877 | fa81397e3a656f0141a584aef9519560bea24c18b4213171f27cdc2ec39dd82f |

合计 257097457 字节。前两个文件是已验收 v4 封存包，原 manifest/验证不变。第三个文件从已验收固定 Linux 主镜像直接 docker image save 导出并 gzip，未重新构建。顺序流式重开归档，所有 blob 摘要、OCI manifest/config 描述符大小、linux/amd64、SOURCE_COMMIT 及 22 层均验证；镜像 Config 不包含凭据环境项。

镜像 OCI manifest ID 为 sha256:9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e；其独立 config digest 是 sha256:37b1d84458f32395ce9938baa36338553ec0c12668f2c2997d9b44af42ce7b1b，不能将两种摘要混为一谈。实际 103 Docker 29.1.3、overlayfs/containerd snapshotter。这里只验证归档及目标存储类型，尚未宣称 daemon 导入或目标候选运行验收。

## 暂存后实际复核

服务器再次完整读取三个文件并验证大小/SHA/0600，目录0700。当前主/桌面/企业 UI 13039/40/41 的 /api/version 全 200，均 8af8ee6ee83579fed34a01ac5db86326f9602e3e / 1791975598；核心13012 全 200，仍 c05a923e830d27aafcb1c0856dc15181dc21d92b / 1791911575。8 个受保护的 UI/核心/上传/Worker/企业 API/Fleet CID 仍运行，完整 Nginx 摘要 fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e。目标 daemon 尚无固定 9fea 镜像。

这只是暂存后的状态复核，不替代正式发布持两锁后的最新基线、备份、旁路运行、迁移/任务兼容与切流验收。当前未发布的 canonical session 也没有因文件暂存而被更改；后续必须按已实现的精确未发布会话 supersede 规则处理。

证据在忽略目录 output/canvas-video-fusion-20261013/checkpoint-d/reachable-continuations-20261017/：PRESTAGE_SUMMARY.json、fixed-image-export.json、两次上传回执、read103-post-prestage-20261017.json。后者 SHA 以保存的原始回执为准，不含环境/密钥内容。

## 拥有者延续边界与仍需的决策

继续复核 worker-tick、图片/批次、Agent route/harness、镜像恢复/media/workflow、bridge registry，增加 16 份完整固定源共 229968 字节；4 份实际编译源均与目标采集 manifest 一致。独立 Native 完整读取并验证全部字节数/SHA/内嵌文本。sources.json SHA 05a1db0ea981b39d25974fe83eab1a614bf0978a4d04e1ddd8e6a45168c86f8d。

此边界没有额外自治启动器；直接请求开始可能先于 Session/DB claim。正常图片执行明确等待 handler、队列写入再释放 token，不应将正常释放解释为 handler 仍执行；心跳失败不取消 handler、超时后的内部工具体、移出 Map 后的持久化及租约释放后的供应商账务尾部仍是具体可能路径。没有证据表明这些实例正在目标执行；已有实际 native timer/request、TCP/PG 和 M/N 观察收窄了可能性，但不能追溯补齐旧 boot 未登记的全部执行到最后一笔副作用。新装一个空 registry 不会使旧 boot 自动变成已排空，不再扩大成任意未使用 vendor 代码审计。

Git 比对 c05a923 与目标 UI 3bb：durable-image-jobs、image-job-repository、imagegen、canvas-image-tasks、Agent runtime 和 supplier-cost/worker 本体未变化；但部分 billing/model transport/video、worker tick 已变化，不能宣称整体相同或仅因共用数据库就已完成完整兼容交接。历史 pending9/needs_attention2 及 billing/supplier 不确定状态必须保留，不删除、结算、强制终态或重新提交以获得零计数。

2026-10-17 06:10:11 UTC 实际 MemAvailable=2997064 KiB，约 2926.8 MiB；所需 Web896+caller128+media3072+reserve1024=5120 MiB，缺 2245816 KiB，约 2193.2 MiB，不计 Swap。不能降低既定资源门槛来把发布说成可执行。

已通过本会话异步问题请求用户确定容量边界：允许以明确维护方式退役无现用入口旧 UI、保留 DB/媒体/容器与回滚并接受历史内存态无法完整补证；或增加至少 3 GiB 内存、保留旧 UI 全部运行。这是新增的历史内存态取舍，不是重新请求已授权的普通发布。答复前不执行依赖该选择的停服或满负荷候选启动；原有发布授权不能使缺失的历史状态证明自动成立。

待容量边界明确后，完成对应准备/可恢复串行退役或扩容后的实测；再刷新 main、真实运行/锁/会话基线，备份，按固定包执行蓝绿/维护发布与功能验收，最后审计。当前文件暂存不是 release103 通过。

## 随后发生的主线整合

本文首次推送与同事新 main 竞争，原子推送被安全拒绝；未强推。重新 fetch 后，将 7fb4ff9 的生图参考画幅、扩图和重复面板删除合入本分支，合并提交 7d4d9a06dee5e4f952664d918713cdbd9da233e2，无冲突。新增业务改动 22 个文件，e997 暂存包继续作为完整封存候选保留，不能冒充已包含最新改动。

合并后的集中检查：面板移除210项、实际 plan/generation-core 比例24项、真实POST/Sharp/扩图等55项全部通过，外部供应商0；全量 tsc 通过。视频覆盖库存34/34、55份登记证据审计与安全审计仍通过，它们不替代新固定镜像的浏览器/真实应用回归。当前待重新固定 Linux 候选并集中验证受影响的生成链与三种界面；原 e997 编译运行验收不能无条件沿用到新业务源。
