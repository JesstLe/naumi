# 47 NAS 连接恢复与磁盘紧急抢救（2026-11-16）

## 模块与职责
用户要求尽快恢复47服务器：恢复NAS连接，回收NAS已有且完整校验的本地副本，保留未确认原件。此次为运维恢复，不修改产品源码、不发布，不重放生成。

文档隔离分支 `codex/nas-reconnect47-20261116`，基线 `742bcbc608a0021f5f0fc551e3acae68509759e7`。共享工作区 `codex/admin-ui-modernization` 的未提交内容保持。

## 根因与实施
DSM明确报告LAN2静态地址192.168.16.2与另一MAC冲突；全局DNS仍指向旧虚拟地址198.18.0.2，原Garage处于停止状态，47存储隧道无法有效读取。不能将先前路由器限制推测写成已证实根因。

内置浏览器实际登录DSM，保存原配置；DHCP offer预检确认192.168.16.36可分配后，将原eth1改DHCP，DNS设192.168.16.1/223.5.5.5；地址发现、MAC/设备身份与原容器核对。原Garage卷/镜像保持，恢复其运行并重连原隧道。NAS最终SSH/Telnet均关闭；不依赖开发机长期中继。

## 实际结果与保护行为
- 四批回收6357个本地副本，逻辑大小9041458926B。
- 从普通可用0B恢复到8486572032B，约7.90GiB；磁盘100%降至88%。文件逻辑大小不等于磁盘净增，root保留空间不计普通可用。
- 每份删除前均重新计算本地SHA、NAS签名完整GET的长度/SHA，删除前确认inode/大小/mtime/ctime未变；INTENT/REMOVED均fsync，四批ACK全部配对，无未配对意图。
- 四批目录全量NULL-safe检查6357项：missing=0/notReady=0/changed=0。三项remote_ready=false在重新完整NAS读回后按key/SHA/bytes/原状态CAS修正。
- 原已无本地副本的3个对象，在Web容器应用读取层实际读回200、长度/SHA匹配；另外893599B对象分别恢复至两个独立证据副本，SHA一致。
- 健康接口dbOk=true/videoReady=true；数据库实际临时写盘20000行、23601152B并ROLLBACK，业务行写入0。
- NAS primary/bridge均ok；所有生产回收及状态修正持三部署锁与生命周期锁，结束释放。
- 业务记录删除0、NAS对象删除0；不清volume/备份/镜像，不改用户媒体身份/URL/所有权，不部署或重启Naumi，不重放模型请求。

## 运行版本与证据边界
最终公网源码 `96a2393da654e26b67d1e32139bc223354bd257b`，version `1794795806`。运行容器/canonical相对09:24恢复基线存在变化；保留现场，不回退其他发布。每个回收事务内canonical不变，不宣称全天运行环境完全未变。此运维文档不触发程序发布。

## 公共接口、依赖与状态归属
既有NAS签名GET校验器负责字节读回；一次性维护脚本负责冻结清单、低并发、持锁、期限和逐项回执；媒体目录仅对完整验证后实际存在NAS的同版本记录修正remote_ready。生成任务、账务和画布状态不参与迁移，不启动整个Worker扫描。

## 验证命令与结果
命令均在 `E:/Workspace/naumi/output/nas-reconnect47-20261116` 执行。

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `python run-once.py observe-after-start.py` | 0 | 基线诊断：primary/bridge transport_error、session null；不是健康PASS |
| `python run-once.py emergency-reclaim-no-db.py` | 0 | 298项 |
| `python run-once.py emergency-reclaim-no-db-batch2.py` | 0 | 1299项 |
| `python run-once.py emergency-reclaim-no-db-batch3.py` | 0 | 1921项 |
| `python run-once.py emergency-reclaim-no-db-batch4.py` | 0 | 2839项 |
| `python run-once.py db-disk-write-probe.py` | 0 | 真实临时表写盘后回滚 |
| `python run-once.py catalog-reconcile-final.py` | 0 | 四批完整核对，3项远端状态修复 |
| `python run-once.py final-protection-audit-v2.py` | 0 | NULL-safe全量核对、实际路径/锁源码与保护指纹 |
| `python run-once.py recovery-status-final.py` | 0 | health/db/video ready；版本成功；其removedFiles=298为旧首批计数，不作总数 |
| `python run-once.py restore-copy-and-close-acks.py` | 0 | 全ACK配对与独立副本恢复 |
| `"D:/DEV/Git/bin/bash.exe" ./ROLLBACK.sh` | 0 | 再恢复一个NAS对象至另一证据副本，生产恢复0 |

旧维护驱动、断网阶段失败、final-protection-audit初版stdin参数错误等原始结果均保留；更名重试，不覆写失败记录。产品UI/视觉回归、真实付费生成未执行：本次无产品代码改动。DSM网络设置通过内置浏览器实际操作；后续DSM页面会话过期不等于网络再次故障。

## 交付与审查
本地证据根 `E:/Workspace/naumi/output/nas-reconnect47-20261116`；远端批次位于 `/opt/naumi-staging/evidence/emergency-nas-reclaim47-20261116*`。

四件套已创建并重开：MODIFIED_FILE.json（实际NAS配置快照）、DIFF_FILE.diff、VERIFICATION.txt（实际命令/输入/原始输出/退出码）、可执行ROLLBACK.sh。原配置与哈希保留在ORIGINAL_FILE.json/SOURCE_HASHES.json。ROLLBACK仅证明NAS到独立副本恢复，不回退冲突IP、不整批生产回灌。

独立Reviewer `/root/nas_recovery_review`：已执行范围PASS；整体全量搬迁PARTIAL。

## 未完成项与下一步
- 10GiB空间目标尚未达到；实测约7.90GiB。
- 09:49 UTC目录pending为27833行/28143768534B，本轮不将其写成全部已新补传。后续按当前本地存在、版本与任务claim核对，复用独立镜像恢复用例分批补传，完整GET验证后才能回收。
- 不宣称全站所有创作/生成用户旅程完成付费验收。已闭合的是紧急存储连接、可写空间、基本健康及已镜像对象的安全回收。
