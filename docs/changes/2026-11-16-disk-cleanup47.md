# 47 站系统盘清理（2026-11-16）

## 模块与职责

纯运维清理：释放47系统盘上的重复传输包和过期轮转日志。不修改应用代码、生产配置、数据库或业务媒体，不发布、不重启，不扩展至103或NAS。

- 开发隔离基线：`96a2393da654e26b67d1e32139bc223354bd257b`
- 清理时线上代码：`19d983853d90154b9c5e9efdecac0806b53a2ceb`，version `1794718498`
- 独立分支：`codex/disk-cleanup47-20261116`
- 现场证据：`E:/Workspace/naumi/output/disk-cleanup47-20261116/`
- 远端回执：`/opt/naumi-staging/evidence/disk-cleanup47-20261116/`

## 调研与边界

系统盘最初93%。主要占用为业务媒体（约33 GB）、数据库及发布证据；Docker无构建缓存，不以reclaimable作为镜像删除许可。NAS ready元数据不足以证明远端字节完整，本批不清业务媒体或本地媒体镜像。

保留最近5轮镜像/配置、现用及兼容直接回退归档、全部数据库dump、57个volume。排除其他任务正在准备的 `release47-canvas-fixes-20261116-r1` 整轮。

## 实现与归属

在原有HostTransaction三部署锁和生命周期锁内执行固定15项清单：8个已有相同SHA256恢复副本的旧传输包，7个超过7天的Nginx压缩轮转日志。重新核对路径、inode/时间/大小/SHA、打开引用；逐项写ACK。canonical漂移或活动引用即停止，存在INTENT禁止重放。

原始文件哈希及恢复位置见 `RECOVERY_VERIFIED.json`。独立只读Reviewer重新核对15个本地文件的真实大小/SHA并审查实际删除回执，结论PASS。

## 实测结果

| 项目 | 结果 |
|---|---:|
| 移除文件数 | 15 |
| 移除文件字节合计 | 2,283,746,724 B |
| 执行前可用空间 | 4,614,946,816 B（4.30 GiB） |
| 执行后可用空间 | 6,889,836,544 B（6.42 GiB） |
| 实测可用空间增加 | 2,274,889,728 B（2.12 GiB） |
| 最后只读df | 69G total / 60G used / 6.4G available / 91% |

文件大小之和与实测空闲增量分别记录，不混用。执行期间业务正常写入仍持续。

前后运行身份/启动时间、镜像、volume、受保护文件、Nginx、canonical和公网版本均未变化。数据库ok=true，视频执行ready=true。14个容器及6个唯一镜像均保留。已有生命周期CLEANUP_PENDING和历史UNKNOWN未被清理脚本篡改或宣称解决。

## 验证命令、结果与证据层级

所有命令工作目录为本地证据根：

- `python run.py preflight-remote.py`：exit0，15项，removed=0，四锁释放。
- `python fetch-recovery.py`：exit0，15文件大小及SHA256全部核对，总2,283,746,724 B。
- `python run-once.py cleanup-remote.py`：exit0，removedCount=15，各保护项unchanged，`CLEANUP_FOUR_LOCKS_RELEASED=1`。
- `"D:/DEV/Git/bin/bash.exe" ./ROLLBACK.sh --fixture ./rollback-fixture-verified`：exit0，`ROLLBACK_OFFLINE_PASS FILES=15 BYTES=2283746724 SHA256_MATCH=15 PRODUCTION_RESTORE=0`。这是完整文件的独立本地恢复演练，不是生产回灌；生产保持清理后的状态。
- 后续持锁复核遇到他人持锁：exit1，BlockingIOError，未抢锁、未执行进一步修改。
- `python run-once.py postflight-readonly.py`：exit0，只读重开远端总回执和15份ACK，15文件确已不存在，canonical仍为revision2287。

完整命令/输入/字面输出/退出码在 `VERIFICATION.txt`；前后清单与差异为 `BASELINE_FILE.json`、`MODIFIED_FILE.json`、`DIFF_FILE.patch`。本次不涉及UI和业务代码，未执行浏览器、视觉或付费生成测试，不冒充全业务验收。

## 未完成项与下一步

本批清理完成且独立验收PASS，但系统盘仍91%，可用空间低于构建前10 GiB门槛，不能称容量压力已彻底消除。进一步空间主要涉及业务媒体，应先完成NAS逐字节读回及现有镜像驱逐机制的单独验证；本次未删除此类数据。其他发布任务继续持有自己的锁，不在本任务内干预。
