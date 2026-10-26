# 已成图但父任务仍排队：收尾修复

## 现场与任务边界

2026-10-24 17:49—17:57 线上只读核对，固定 af22c6e5f149215cfd5bf862f781e95e67c88987 / 1792808190。

- 17:39 和 16:08 两笔 edit 子任务均已 done、本地作品存在、原账务各结算 10 积分一次，但父 imagegen 仍 pending / children.generate=submitted，父创作列表投影 queued。
- 父在子未完成时持久化 pending 后退出；子终态只更新自身，父需下次主动轮询或后台扫描才汇总。实际 Worker 自 15:10 的未知扫描进入 paused/UNKNOWN，Web 内扫描 NAUMI_VIDEO_WORKER=0。不能用刷新创作列表代替执行原父任务。
- 15:14 另一笔是供应已成图、本地结果尚未落 checkpoint，和本轮两笔子 done 的断点不同，不在本次补交名单。

诊断证据：output/queued-upstream-completed-20261024-1748/REPORT.md。本轮工作基线 HEAD 628671b305ab23287f28ba7eae17d1aa0ac07b5a；开工 origin/main 已刷新，HEAD 独有 10、main 独有 0；未合入未完成同事重构。

## 产品修复（SOURCE STABLE final，未部署）

生成子任务终态与 lease 释放后主动唤醒精确关联原父；父释放后再检查已完成子，避免父子并发的通知丢失及 10 秒 lease cooldown 造成漏唤醒。继续使用原 runParent、冻结 plan、原作品和原结算，不新增后台服务、不改 UNKNOWN、不将未完成子误记完成。

- durable-image-jobs.ts：SQL lease 释放后退出 execution ALS，等待真实 release activity 完成再通知。成功子与父均补查；父执行异常不自循环。
- imagegen/dispatch.ts：新增 notifyImagegenJobReleased(id,kind)，只匹配同 owner、原父中 submitted 的首个未完成 step、实际终态且无 lease 的子。完整 snapshot CAS 只取消无主 cooldown，不动活动 lease。调用原 resumeImagegen/runParent，不改只读 readImagegenReceipt。
- release-runtime/background-activity.ts：detachBackgroundActivity 新增第五参数 onSettled；仅 finishActivity 成功后、退出该 background ALS 调用，回调失败不把已完成 activity 改 unknown。
- 独立窄审发现并修复“空 claim activity 吞掉 child 通知”的 P2：普通父 kick 即便没领取到业务 lease，也在 activity 完成后补查一次；通知源 resumeImagegen(id,false)，通知源再次空 claim 不递归，容量满时有界。原 Worker 扫描仍作故障兜底，没有增设新扫描器。
- 定向回归首跑真实发现 needs_attention 子分支提前返回，父回执把已结算的 7 fixture 积分显示成 0；已最小补上读取原 childCharges，保留 CHILD_PENDING 错误、原结算不动。未放宽测试断言。

接口/最终 SQL/原字节哈希见 output/imagegen-parent-completion-fix-20261024/INTERFACE.md。产品总增量 3 文件，测试新增 2 个脚本。

## 已存在任务的操作

只处理两对已完成子任务，通过线上既有授权 workerJobId 原父恢复入口收尾，不重新生成、不部署/重启。执行前持三锁、固定在线 Image ID、备份原记录，核对唯一已提交 edit 步骤、作品/尺寸、单次原结算、无后处理和无活动 lease；收尾后核对父子/creation/output/账务/原供应记录。

output/imagegen-parent-completion-fix-20261024/repair-completed-parents.sh 的最终 dry 已通过：PARENT_COMPLETION_DRY=PASS PAIRS=2 GENERATION_POSTS=0，exit 0。独立审阅的两项前验缺口已补齐：冻结 creationScope/paidOperationVersion/父子execution link 精确匹配；最终父 lease_token/lease_until 都为空。

父于本轮真实 apply，回执 IMAGEGEN_PARENT_COMPLETION_APPLY_R1.json，exit 0：

```text
PARENT_COMPLETION_APPLY=PASS PAIRS=2 ORIGINAL_ARTWORKS_REUSED=2 GENERATION_POSTS=0 NEW_DEBITS=0
THREE_LOCKS=RELEASED
```

两父均 done / result.succeeded，四份父子 creation 均 succeeded / output_count=1；原父 payload/冻结 plan、子 snapshot/payload、原作品数据库记录、账务、消费账、预占、供应记录及当时钱包本金摘要均 hash 不变；各原 10 积分消费仍只有一条，没有再次结算。未回灌数据库，未复原成功交付状态；线上 private 原记录备份 SHA256=911435482c0604b5ffbc320b69e31975db0a85dafa0613176a22c8053d8d3e0d，路径 /opt/naumi-staging/evidence/canvas-model-pricing-20261024/imagegen-parent-completion/BEFORE.private.json。媒体原字节未单独重读 hash，不将作品记录 hash 扩大为本轮媒体全字节验收。

## 验收与未完成项

父集中已运行 v2：真实隔离 PostgreSQL 通知 SQL/CAS 19 项 PASS（HTTP/供应请求 0）；既有真实 imagegen 执行模块回归 PASS（独立 PG + 受控 HTTP fixture，非真实供应）；TypeScript --noEmit --incremental false exit 0；原 postaccept 恢复 11 cases / 142 checks PASS，实际供应网络 0。

定向父完成脚本已由父集中运行：baseline 子已成图而父 pending 确实 REPRODUCED，随后旧 runParent 正控成功，exit 1（预期）；最终 modified 24 cases / FAILED=0 / SUPPLIER_POST=0 / SETTLE_CALLS=0 / NETWORK=0，exit 0，真实整模块/ALS/repository/creation writer、SQL和媒体边界 fixture。首跑 needs_attention 失败记录保留于 MODIFIED_R1.json，最终通过为 MODIFIED_R2.json，不抹历史。

v2 独立复核已关闭空 claim P2、未见新确定 P1/P2；最终 needs_attention 小改也完成窄审，无新增确定 P1/P2。其账务查询异常沿原外层 catch 降级，可能将父错误改为 EXECUTION_FAILED，不把“正常路径保留 CHILD_PENDING”扩张为所有异常路径不变。

最终 PG19 再验 PASS；TypeScript 最终 exit 0、stdout/stderr 空。四制品封存于 output/imagegen-parent-completion-fix-20261024/artifacts/，3 原文件和 2 新脚本为修复目标，未把文档混入产品 patch；ZIP 同时保留运行 verifier 所需源码快照，具体清单见 SEAL_MANIFEST.json。另一副本真实回滚恢复 3 原文件、删除 2 新文件，父使用未改字节的原 runner 指向实际 rollback 副本运行，确认加载路径为 source-root 而非 before：原“子 done / 父 pending / creation queued”复现，旧 runParent 正控仍成功，exit 1（预期）；实际供应、结算调用均 0。修改态 worktree 与专用 modified 副本保留，不对真实已补交任务回灌状态或媒体。

最终行为回滚记录 ROLLBACK_BEHAVIOR.json；baseline BASELINE_R1.json；modified MODIFIED_R2.json；类型 TSC_FINAL.json；真实 SQL POSTGRES_FINAL.json。两笔线上任务 18:28 又只读确认：4 job 全 done、4 creation 全 succeeded，输出各 1；原消费每笔 10 积分各一条，预占 0，另一 15:14 pending 样本未动。

新产品代码未上线，原 Worker UNKNOWN 和蓝绿容量/排空债务保持原记录。没有用旧 Linux 镜像声明这三个新增产品修改已 build/部署；没有绕过 UNKNOWN 清债或原地重启。Git 提交和 push 只保存本任务变更，正式发布仍须固定新镜像并通过既定蓝绿全链路验收。
