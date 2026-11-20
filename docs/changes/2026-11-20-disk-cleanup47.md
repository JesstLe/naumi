# 47 系统盘清理（2026-11-20）

## 职责与边界

按用户“清理一下”的授权，仅清理 47 的已确认过期运维产物。负责人为本任务，工作目录 `E:/workspace/naumi-cleanup47-20261120`，分支 `codex/cleanup47-20261120`，基线 `41217a7d837254d7616b205c251a5ee4804d917a`。共享 checkout 与其他开发任务保持原状。

不发布、不重启，不清理业务媒体、NAS、数据库、volume、凭据、其他人的测试宿主或正在运行的协作系统；不操作 103 或废弃站点。当前线上为 `71e54e07cbcad181b3db0480f746a0b8e01db24f` / `1795085574`，本记录不是新的应用版本。

## 清理依据与实际操作

- 在 Naumi、Hub、参考工作台三部署锁及 lifecycle 锁内，核对 canonical 原文摘要、当前运行实例及最近五轮 COMPLETE 发布。
- 先用当前生产 PostgreSQL 自带的 `pg_restore --list` 验证最新完整备份可读，退出码 0，保留最近七天全部备份。
- 删除超过七天的 `release47-ui-notes-20261112/database-988fcfe5d343.dump`，810,850,186 字节。两份 11 月 13 日备份在核对时尚未满七天，保留；没有按目录日期推断文件年龄。
- 删除 `naumi47-web-capability-fixes-20261113-r1`、同轮 Worker 及唯一关联镜像 `d157193f9ae839275fe769d8d795cc804c0e406451684f56c6a76152c95e0b7b`。容器均已停止、restart=no，且其 ID 在后继 COMPLETE 发布的 retired 回执中。移除前确认该镜像没有其他容器引用。没有使用强制删除或 Docker prune。
- 保留最近五轮 layered-psd、central-resume、central-ack、central-identity、main-20261118-admin-local-r2 的镜像、容器与恢复备份；不删除全局历史债务或改写 canonical。

## 验收与证据层级

真实服务器操作，四锁内执行并记录逐项 ACK，原始证据在 `/opt/naumi-staging/evidence/disk-cleanup47-20261120/`：`PLAN.json`、`INTENT.json`、`ACTIONS.json`、`RESULT.json` 及两份私有旧容器配置；本机回执 `E:/workspace/naumi/output/disk-cleanup47-20261120/postflight.txt`。私有配置不提交 Git。

清理前可用 27,884,654,592 字节，清理后约 29.4 GB（约 27.4 GiB），实际可用增量约 1.5 GB（约 1.4 GiB）。业务仍有正常并发写入，实际空闲增量与删除文件大小分别记录，以最终 RESULT 为准。

最终核验：7 个运行容器的唯一 ID、镜像及启动时间保持；canonical 原文摘要保持；公网版本保持；健康接口 HTTP 200，数据库 ok、视频执行 ready；`nginx -t` 退出码 0。没有将健康检查冒充付费生成或完整用户路径验收。

中间失败保留：首次预检因 11 月 13 日备份未满七天阻断，随后将其排除；删除完成后两次原始 Docker 快照比较断言未通过，停止进一步删除，另按唯一容器 ID 逐项核对镜像和启动时间通过。没有重放删除，也不把中间失败写成从未发生。

## 收尾与恢复边界

四锁均已释放，运行服务继续保留。原数据库和媒体未改，无需回灌；过期备份按保留策略删除，不承诺恢复该旧备份。保留最近五轮完整材料与最新可读备份供后续正常回退。此次为纯运维清理和文档，不增加功能模块或成功发布计数，不触发业务发布；本次空间检查清理计数归零。
