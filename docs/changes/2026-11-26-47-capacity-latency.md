# 47 性能和磁盘余量

2026-11-26，基线 `1e80b598`，线上 Web/Worker `4e01a562`。此轮涉及账务后台扫描和私有 NAS 媒体路径。媒体补传作业的冻结范围、逐对象回执和冲突以 47 私有运维目录为准。

## 实测与已生效修复

47 有 4 核、约 15 GiB 内存，检查时 MemAvailable 约 8.9 GiB，无 swap 使用。数据库 CPU 曾达约 1.5 核。慢日志出现 Worker 分类过期预留的语句，约 3.3 万操作中仅 2 条 reserved。保留完整候选条件、排序和历史隔离条件的只读 EXPLAIN ANALYZE 显示全表扫描，过滤 32987 行。线上已在原部署/生命周期锁内用 CREATE INDEX CONCURRENTLY 建立部分索引：

```sql
CREATE INDEX CONCURRENTLY app_billing_reserved_review_idx
ON public.app_billing_operations(updated_at, id) WHERE state='reserved';
```

相同只读查询执行时间由 735.042 ms 到 0.952 ms，后续 pg_stat_user_indexes 已记录索引被继续使用。此测量针对扫描语句；全站请求耗时还涉及网络、媒体和业务负载。没有执行 EXPLAIN ANALYZE UPDATE 或重放账务。回退此独立索引可在原维护锁内在事务外使用 DROP INDEX CONCURRENTLY public.app_billing_reserved_review_idx。

## 空间与应用侧保护

系统盘实测 94%，约 4.7 GiB 可用。本地媒体约 28.3 GiB；目录对账时约 17.4 GiB 尚未远端确认，约 10.5 GiB 已远端确认且待本地回收。线上使用本地暂存优先。旧应用的媒体补传活动在同一对象上超过 18 小时，心跳仍存在，数据库待补传持续增长；NAS 能通过健康检查。对同一对象执行完整 GET 校验和数据库版本核对后才回收本地副本。2 个待补传对象已在实际传输、回读和回收试运行中验证；更多对象由专门运维作业跟进，不能从试运行推出全量结果。

应用下次发布会对私有 NAS 暂存模式执行两道检查：可用容量超过 6 GiB 加本进程待写字节时正常先写本地；低于该水位优先写 NAS。如果远端也失败，只有能保留 4 GiB 时才接收本地暂存。原版本在远端失败后允许暂存模式跳过该检查。两个数值是本次在现有 4 GiB 保护线上增加缓冲的实现选择；这属于进程内准入，不是文件系统配额。

`node --conditions=react-server --import tsx scripts/verify-nas-remote-first.ts` 以及同一命令加 `--deferred` 均通过。使用真实隔离 HTTP 和本地临时文件，覆盖正常暂存、低水位直接传输、断线回退及磁盘保护。未重新部署 Web/Worker。部署前需处理上轮未完成退役，保留原任务归属。当前实时证据位置为 47 的 `/opt/naumi-staging/evidence/capacity-latency47-20261126-r1/`。本次无应用发布计数。

## 原生补传的缺源路径

分支 `codex/47-mirror-lane-20261126` 从 `a2deddc3` 接续。线上活动已持续超过 19 小时，当前绑定的拼接对象在本地及规范 NAS 路径都找不到。心跳和当前对象名无法提供进程的 JavaScript 调用栈。

用真实隔离 PostgreSQL、HTTP 服务和 Node fetch 复现了一条阻塞路径。两条记录按顺序进入同一批次，第一项本地不存在、NAS 返回带响应体的 404，测试在 HTTP 包装层保留一份未读响应副本。旧实现等待取消完成，第二项超时，回归报 MISSING_OBJECT_STALLED_NEXT_CLAIM。该复现验证具体触发条件，线上是否保留了同样的副本尚无证据。

补传器在本地缺源时直接向规范 NAS 地址做全量流式读取，仅 HTTP 200、长度及 SHA 完全一致才允许通过原租约提交。已有正确的远端对象可直接确认；404、部分内容、摘要冲突都保留待处理状态。提前结束时主动终止本次传输；响应分支释放独立于队列进度。已上传副本的本地回收共用这一读取验证。

验证入口为 scripts/verify-nas-remote-first-recovery.ts 与 scripts/verify-media-mirror-eviction.ts，均以本机独立 PostgreSQL 16 运行，退出码 0。后续对象成功提交，原远端写入次数为零，等长错内容保持未确认；既有本地回收 44 项通过。47 线上仍为 4e01a562，上一轮 SWITCHED_CLEANUP_PENDING。生产收尾需核对旧任务后验收原生队列，不以隔离修复或独立补传回执代替。

候选发布回归中，canvas-extra 在完整收到错误类型的上游响应后仍要求 hold。根据 2845fa22 的业务合同，已知无效文字应保存失败回执、释放预留，再次提交原操作只读回原失败；流式连接意外中断仍需要 hold。在真实隔离 PG 和 mock 供应商上验证普通文本和 SSE 两种入口的财务状态、HTTP 状态、错误码、操作号与供应商调用次数；保留断流未知与收款恢复原断言。修改仅涉及发布测试。

线上只读核验发现旧 Worker 2026-11-24 的原 tick 仍为 unknown，完成时间与结果都为空。时间相近的视频扫描虽已结束，但 work_key 与原 tick 不同，也没有父 ID 关联，因此不能为整轮业务补写完成或作为停止旧槽的凭据。

发布核心回归的画布主题测试单独复现了另一个阻塞。真实 hook 的 flush 开始读取 address 和 projectKey，测试提取了函数却没有传入这两个闭包变量，报告中出现 address is not defined，后续保存和 CAS 检查连带失败。补齐测试调用上下文及当前 key 后，原有断言全部通过，实际 consumer 进入创建端口一次。没有调整生产画布或放宽保存门禁。

## 账务恢复扫描的实测

采样发现按供应商成本恢复结算和按画布恢复标记查找原操作都在读取整份账务历史。两条查询当时均无匹配行，真实 SELECT 的 EXPLAIN ANALYZE 分别为 460.681 ms 和 61.972 ms。持 47 四锁时执行两条 CREATE INDEX CONCURRENTLY，只索引符合既有谓词的数据，原查询的过滤、排序、历史隔离和结算事务继续沿用。两条索引均有效，现场各占 8 KiB。同一查询改走索引后为 0.230 ms 和 0.131 ms。对应证据在本轮服务器目录 cost-canvas-before.txt 和 cost-canvas-after.txt。回退分别用 DROP INDEX CONCURRENTLY public.app_billing_cost_recovery_idx 和 DROP INDEX CONCURRENTLY public.app_billing_canvas_recovery_idx。独立 PostgreSQL 16 新库建表、真实画布计费接口和重试回归均通过。

15 分钟窗口内画布图片任务 P95 1.201→0.811 秒（736→570 个成功请求），视频任务 0.900→0.977 秒（959→872），参考工作台素材列表 1.017→1.051 秒（1140→505）。三个接口样本均无 5xx。两个窗口请求分布不同，结果不宜外推为全站统一提速。该窗口早于本节两个新索引；不将它作为此次新索引的因果证明。
