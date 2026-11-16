# 47 待同步媒体有限补传（2026-11-16）

## 模块与职责
用户明确要求补传上一轮剩余媒体。范围是47本地媒体→既有NAS、完整读回、目录状态CAS和本地副本回收；不触发生成、计费、程序发布或修改画布。整体状态 **RUNNING / PARTIAL**，不是全部媒体迁移完成。

隔离基线 `ce834673b3e1e562e8cca1759b730f0c43163829`。共享checkout `codex/admin-ui-modernization` / `f45dd9ea25b8303ce7d5c1a07534a553b8648f3c` 及其未提交修改保持。线上源码 `96a2393da654e26b67d1e32139bc223354bd257b` / version1794795806，本任务不部署Naumi。

## 实查基线与重要发现
扫描待同步28262项/28635071143B；本地存在28260项/28625155601B，缺失2项，大小不符0。NAS主机/bridge均ok，普通可用7909994496B。基线扫描保存成功，但附带线上Node require(pg)探针失败，原exit1保留；维护bundle后来内置pg，不假装初次探针成功。

真实Garage QA探针证明 **当前网关忽略If-None-Match**：第二次PUT未返回412，首次测试字节被第二份替换。只涉及本轮随机QA key，已清理，客户对象未参与探针。因此不能以“GET404→PUT”或已发送条件头证明可变目标不会被覆盖。

## 设计与执行边界
复用现有object-storage配置和适配器，增加可选ifAbsent协议条件；旧四参数调用不变，本地条件创建用hardlink。此选项不代表所有S3兼容网关都经过条件语义认证。

本次实际CLI固定conditionalCreateVerified=false，仅当精确内容寻址模板、路径完整SHA、当前目录SHA、本地实际SHA一致，才创建缺失对象。源码独立核定的模板是image-job-results、image-job-inputs、image-delivery、creation-inputs的original/processed完整hash文件，以及canvas-reference-uploads的完整hash原图。不是所有这些路径都经过不可变数据库登记；保障来自实际bytes→完整SHA→目标key的已核构造。

media-variants的文件名含原图hash而不是自身字节hash，不纳入该豁免。旧creation-inputs/taskid-processed.png、-mask.png和collaboration检查点不纳入。非内容寻址但NAS已有完整一致字节，可修复目录并回收；NAS缺失则记录requires-atomic-create，保留原件，不能计为成功补传。两侧缺失也不重新生成。

## 公共接口、依赖、状态及事务归属
- `scripts/ops/nas47_backfill.ts`：backfillOne(Item, Context)，组织单对象流程，Context仅注入媒体根、既有存储适配器、目录claim/publish/evict/defer和持久回执。
- `scripts/ops/nas47_backfill_cli.ts`：PG池2、两并发、当前due/notready且SHA/bytes仍匹配清单的交集、有限批次、SIGTERM停止新领取并等待在途完成。不加载schema初始化或整个Worker。
- `scripts/ops/nas47_conditional_probe.ts`：独立随机QA key真实网关条件语义检查，finally仅清理自己创建的QA对象。
- 既有adapter仅扩展可选条件写入；refactor-cases登记现有验证系统入口，保护回归复用storage-source-fixture。

状态顺序：固定清单→key/SHA/bytes/到期条件领取→稳定本地字节校验→NAS完整GET，已有一致内容不覆盖→允许的缺失目标PUT→完整200 GET/长度/SHA一致→原claim/SHA/bytes CAS发布remote_ready并提交→回收行锁重验目录/回收claim/本地签名和SHA→fsync删除意图→unlink→fsync删除回执。网络I/O不持数据库事务；删除前远端可读状态已提交。

只修改媒体就绪、重试和回收字段，不改key、owner、public或生成/账务状态，不删除目录行或NAS原件。

## 已执行阶段（11:49 UTC核账）
完成1033项/5624158550B的新上传和本地副本回收。六批删除ACK配对183+240+265+292+49+4，未配对0。NULL-safe全量1033项目录missing=0/notReady=0/changed=0/ownerOrPublicChanged=0。不是用活跃批次快照凑最终数。

11:49:58 UTC普通可用13910835200B，约12.96GiB。主站dbOk=true/videoReady=true，版本保持96a2393d。后续任务仍在推进，空间及对象数量会变化。

已完成阶段331项requires-atomic-create原件保留；2项missing-both已识别每项有3份本地SHA一致副本，独立核对/恢复记录另存证据，不冒充其规范NAS目标已补传。

## 集中验证与实际命令
执行目录为隔离工作树；产物根 `E:/Workspace/naumi/output/nas-backfill47-20261116`。

| 命令 | 退出码 | 真实结果及证据边界 |
|---|---:|---|
| `node scripts/verify-nas47-backfill.cjs` | 0 | 24项，真实本地HTTP/文件，生产写0；含完整内容寻址false条件正控和3类排除 |
| 定向TypeScript严格检查三个ops TS入口 | 0 | `BACKFILL_TARGETED_TYPES=PASS ERRORS=0`，TYPES-v4.log保留实际命令 |
| `node scripts/verify-storage-resilience.cjs` | 0 | 原20项默认存储调用回归，R2/本地/NAS默认行为保持 |
| `python run-once.py verify-pg-cas.py` | 0 | 实际PG临时表6项claim/SHA/lease/publish/eviction正负控，回滚，客户表写0 |
| `python run-once.py pass-pilot.py` | 0 | 4项67336283B实际上传、完整读回、CAS及回收 |
| `python run-once.py pass-001.py` | 0 | 183项1420183038B；57项保留 |
| `python run-once.py verify-completed-all.py` | 0 | 六个已完成批次1033项核账、ACK闭合、健康；不包含未完成批次的最终结论 |
| `"D:/DEV/Git/bin/bash.exe" ./ROLLBACK.sh` | 0 | 新上传对象6375310B从NAS恢复至另一证据副本，SHA匹配，生产回灌0 |
| `python run-once.py verify-graceful-drain.py` | 0 | 四锁均busy时向本任务driver SIGTERM，helper实际退出、49回收ACK闭合，无强杀，Web/canonical保持 |

独立Reviewer还实际执行了GET404→并发新内容→PUT的修复前后HTTP竞态；以及从实际request_drain函数注入连续2次TERM失败、helper已退出、意图持久化失败再TERM失败3项，`DRIVER_SIGNAL_RETRY_REVIEW=PASS CASES=3 PRODUCTION_WRITES=0`。原失败结果、QA条件失败、工具/编码/CRLF校验错误均保留，不覆盖。

用户鉴权HTTP/Range新媒体样本当前readbackSamples为空，明确NOT TESTED；NAS完整读回/恢复不冒充浏览器E2E。无产品UI修改，不新增视觉验收结论。

## 服务器有限任务与异常收尾
初版loop已在批界停止并确认无遗留helper，换用修正版本。新任务PID2888194/startTicks164874829，服务器本地执行，不依赖开发机；不是定时任务。固定清单、最多120批/6小时停止继续领取，允许在途排空。每批受限helper384MiB/.75CPU、两并发，210秒停止新领取；持三部署锁和生命周期锁，批间释放3秒。

外层不硬超时杀持锁driver；driver450秒阈值或SIGTERM只核对精确image/labels/cmd/mount后给本任务helper TERM；CLI停领并等待在途，driver实际确认helper退出再释放四锁。Docker状态未知、意图写入失败或TERM发送失败均保锁重核，不因异常释放仍在写入的helper。当前最终driver SHA `e8d6280829a9eb31bf93415eee2a3f1a360a2f23f8843f3c648ee915921527e1`，原版本备份及原子替换回执保存；替换只影响之后启动的driver，不声称进程内热更新。

远端证据根 `/opt/naumi-staging/evidence/nas-backfill47-20261116`：JOB_STARTED_V2.json、JOB_STATUS.json、各pass结果/ACK/PROCESS、私有日志、STOP_AFTER_PASS控制点。源码/清单/线上版本改变、异常或已有未知intent时停止，不重放。

## 审查结论与未完成项
独立审查：单对象模块、24项本地保护、已核1033项、真实温和排空及异常发送重试范围PASS。整批仍RUNNING/PARTIAL。

1. 后台后续批次最终结束后，重核全部ACK、目录、当前pending和磁盘；不能把开始运行写成全量完成。
2. 非内容寻址且NAS缺失的对象保留，仍需可验证的不覆盖路径，不能把当前Garage条件头当成支持。
3. 两个原件缺失对象的同SHA副本恢复和后续规范NAS目标补传分别记录。
4. 准确区分已完成批次数、活跃批次进度、NAS直接字节验证、应用/用户HTTP验收。
5. 本任务工作树因有限生产维护仍在运行而保留；不混入共享checkout改动，不部署main新代码。

## 收尾补充（持续执行中）
11:57快照：完成批次新增NAS上传1692项/7978058462B；回收1693项/7981736535B（其中1项NAS原已存在，未重复上传）。活跃批次不混入完成计数。当前driver PID2889599启动晚于最终私有driver原子替换，SHA为e8d628...，后台任务仍活跃。11:59完整核账已覆盖全部1693个已回收对象，missing/notReady/changed/ownerOrPublicChanged均0，八批ACK配对全部闭合，主站健康正常，普通可用16814161920B，约15.66GiB。

两个原缺失对象在其他3份本地同SHA副本中找到精确字节；持四锁、独占临时文件、全字节SHA校验、hardlink仅创建缺失目标，不覆盖现存文件，已恢复本地2项/9915542B，客户DB写0、模型调用0。首次附带Node验证受生产NODE_OPTIONS影响而失败，记录保留；清空仅此次验证进程的NODE_OPTIONS后，以线上默认UID1001实际读回两份4957771B、SHA均匹配，文件UID1001/mode0600。规范NAS目标仍未上传，不计为新补传成功，也不把历史missingBoth计数当作当前仍无任何副本。

维护容器超时/中断信号重试收尾的源级P1/P2均经独立复核闭合，最终失败重试函数3项本地故障注入通过。全量补传仍RUNNING/PARTIAL，后续应读取JOB_STATUS与全部批次回执，而非复用本阶段数字。
