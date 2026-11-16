# 47：NAS 已确认媒体的本地镜像清理（2026-11-16）

## 模块、目标与边界

用户明确授权：NAS已有原件即可删除本地副本。本次只清理47系统盘中的NAS镜像，不删除NAS对象、业务媒体目录记录、待同步原件，不提交模型请求，不部署/重启服务，不修改应用默认12小时保留配置。

隔离文档基线 `5d069e93cffd7e403e6bbe643bf30bc421bb0be5`；线上固定源码 `19d983853d90154b9c5e9efdecac0806b53a2ceb`。

## 调研结论与实现

实查257,009条remote_ready记录，11,633个本地副本仍存在，共11,239,766,728B；其中51个未满12小时。固定清单及原始文件签名/SHA保留于远端私有证据，不能把remote_ready标记本身当作NAS字节已验证。

复用线上固定提交的storage adapter及原有evictOne算法，按固定清单逐一核对本地哈希、NAS完整HTTP200响应、实际长度及SHA256，读回后再核对本地inode/大小/时间。额外维护驱动按实际字段比较签名，逐行锁定目录记录并检查所有者/公开属性/哈希/大小/创建时间/远端就绪状态；仅将成功回收记录的local_evict_after写为infinity。不调用schema准备、整个Worker扫描或生成/账务入口。

协议实现与维护驱动职责分离：既有适配器负责NAS签名GET；既有逐文件规则负责字节一致性及unlink；一次性驱动负责冻结清单、两并发、停止领取期限、行锁、四运维锁和持久回执。维护脚本在output证据中，不替换应用程序。

## 守卫与集中验证

- 三部署锁及生命周期锁；固定canonical/清单哈希/在线容器与来源核验。
- INTENT不可重放；既有PASS必须有完整RESULT与ACK且哈希匹配，未知中断先核对。
- 逐文件意图与回执flush/fsync；超时、404、206、错字节、文件变化等保留本地副本。
- NAS GET单次30秒；每轮180秒后停止领取，允许在途请求和校验收尾。不是硬性总耗时上限。
- 10项本地真实HTTP/文件正负控：`NAS_EVICTION_GUARDS_PASS CASES=10 REMOTE_DELETE=0 DATABASE_WRITES=0`，exit0。
- 独立Reviewer对12项内存夹具验证通过；对签名比较进行顺序变化接受、5字段真实变化拒绝的独立验证。

第一轮执行未删除文件：Python私有证据排序了JSON字段，字符串化签名比较误判11,633项changed。修正为5字段逐一严格比较，所有比较值要求保持不变；核实首轮evicted0后才进入修正后的下一轮。原始回执保留，不掩盖这次维护驱动问题。

## 最终进度：PARTIAL

已完成下述受控批次；NAS隧道中断导致剩余清理和NAS读取验收未完成。证据根：`E:/Workspace/naumi/output/nas-mirror-cleanup47-20261116/`；远端：`/opt/naumi-staging/evidence/nas-mirror-cleanup47-20261116/`。


## 执行结果与剩余状态

- 成功删除ACK：2,004份，1,984,432,134B（1.85GiB）；其中1份63,016B被后台按原SHA回写，本轮保留。
- 当前本地缺失2,003份，清单内仍在本地9,630份、9,255,397,610B：9,619远端未确认、10项变化、1项回写。
- 成功删除对象原始目录字段变化0、回收标记变化0、未解释缺失0。业务记录删除0、NAS对象删除0。
- 本轮首次实际删除前可用5,025,693,696B；最终6,517,121,024B（6.07GiB）、91%；实测净增1,491,427,328B（1.39GiB），与文件大小之和分别报告。
- 容器、镜像、volume、配置、Nginx、canonical、主站版本保持。没有发布、重启或供应商生成调用，四锁已释放。

## NAS故障与停止条件

PASS02删除2,004份后，两次NAS读回异常触发安全停止。核对确认2份未ACK原件仍在、SHA一致；2,004删除项不存在，2,006相关目录记录哈希/大小/ready及成功标记核对通过，写独立reconciled回执后才继续。

一次性驱动进一步仅在NAS读回边界将fetch/stream异常归入remote-unconfirmed，保留本地；本地哈希、unlink和数据库异常仍触发停止。新增真实HTTP中途断流负控通过，累计11项；独立Reviewer额外验证4项错误边界通过。PASS03新增删除0，远端未确认9,619项保留。

只读诊断：五样本均UND_ERR_SOCKET；现有watchdog observe显示本机和容器bridge均transport_error、session=null，连续失败37次。说明47到NAS的隧道已断；掉线原因未确认，本任务没有重启、杀会话或修改连接配置，也没有继续用remote_ready标记代替真实NAS确认。

## 实际验证与证据层级

证据目录内命令及退出码：

- `python run-once.py baseline-inventory.py`：exit0，冻结11,633项。
- `node verify-guards.cjs`：exit0，`NAS_EVICTION_GUARDS_PASS CASES=11 REMOTE_DELETE=0 DATABASE_WRITES=0`。
- `python run-once.py pass-01b.py`：exit0，签名顺序误判changed，无删除；修正5字段严格比较后重新核对。
- `python run-once.py pass-02.py`：exit1，删除2,004份后安全停；原始ACK保留。
- `python run-once.py reconcile-pass02-v2.py`：exit0，2份未ACK原件完整、2,006目录行核对、保护状态不变，PARTIAL_SAFE_STOP_RECONCILED。
- `python run-once.py pass-03.py`：exit0，新增删除0，9,619项remote-unconfirmed保留。
- `python run-once.py diagnose-nas.py`、`observe-nas-link.py`：均exit0，只读确认传输错误与隧道会话消失。
- `python run-once.py final-audit-v3.py`：exit0，完成上述全清单核账；1份后台回写及1份未清对象元数据并发变化保留，不强制回退业务操作。
- `python run-once.py verify-retained-media.py`：exit0，两个本地保留QA样本鉴权200/全字节哈希、Range206、匿名401。不是已驱逐对象的NAS读取验证。
- `"D:/DEV/Git/bin/bash.exe" ./ROLLBACK.sh`：exit0，1份63,016B相同SHA的本地回写对象复制至独立目录并核验后删除测试副本。productionRestored=0、NASRestoreVerified=false。

全部原始命令、输入、输出、退出码和早期只读驱动错误保留在output。O_EXCL文件名复用、Node内联脚本require/顶层await等工具错误已更正，未覆盖原失败记录。

独立终态审查：PARTIAL，核账通过，不将局部批次通过冒充NAS恢复或全部清理完成。UI/浏览器/付费生成未测试（本任务没有对应代码/行为修改）。

## 后续必须完成

先恢复NAS→47隧道，再验证真实已驱逐对象的完整GET及Range，最后重新冻结并校验剩余清单。主站health/db/video ready不等于所有媒体可用；NAS故障期间，2,003份已无本地副本对象的访问可能受影响，该读取验收明确NOT TESTED。保留本地的QA样本与离线复制通过不能替代它。
