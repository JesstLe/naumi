# R5C 后 main 普通整合：修复迁入真实 owner

## 固定输入与交付目标

- 工作树：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 重构侧：`8e203648410b6b7279ce3e589bf29ff2e6d830db`（已完成 R5C）。
- 本轮 incoming main：`368c93e2343c57a330a0db6831ccbef01283ed6d`。
- merge base：`9fc284514aeaed740cdf55cc49b611445676b517`。
- 普通合并最初 13 文件冲突；保留完整两侧 archive、初始 index 及冲突原字节。没有 reset、取整文件一边、重建大文件或将任务分支合回 main。

目标是把 main 已完成的恢复、项目归属、性能和控件修复迁入重构后的真实模块，而不是恢复 `db.ts`、`durable-image-jobs.ts` 和 Canvas 中已删除的重复实现。

## 实现

| 领域 | 迁移结果 |
| --- | --- |
| settings 批量读取 | `getSettings` 归 `settings/repository.ts`；`db.ts` 仅兼容导出。OpenAI/SMTP 使用 main 的原批量读取算法，没有值缓存。 |
| 图片持久任务 | main 的逐图 checkpoint、原始结果恢复、accepted 身份和 token CAS 迁入 `image-jobs/runtime.ts`；保留 Web 持久化/Worker 执行和 tracked background work。 |
| 父回执完成通知 | 应用通过 `ImageJobReleased` completion port 注入；嵌套任务继承同一端口。持久任务模块不反向 import dispatch，通知失败由原恢复扫描兜底，不反转已保存结果。 |
| background 生命周期 | `onSettled` 在 activity 成功结束后执行；action 与通知都登记在原 tracked promise，Worker 排空等待完整链。 |
| 创作项目与历史报价 | 项目归属修复归 `saas/creation-access.ts`，唯一 scope 保持；accepted scope、旧个人 Canvas anchor 与原报价复用保留。 |
| 图片交付账务 | dispatch 使用已有 `readImagegenBilling`；未复制账务 reader，保持真实 settled/confirmed/unavailable 与 chargedCredits 口径。 |
| 图片供应商结果 | main 的 channel response 校验迁入既有 synchronous-operation 边界，没有重建 route 依赖。 |
| Canvas 价格控件 | triptych 的 16:9 修复落在共享 `image-generation-controls.tsx`，两个入口仍复用一个 owner。 |
| 视频协调 | 独立 max=2 PG pool 迁入 platform pool 依赖；业务 SQL 仍用原业务 pool。Worker 先停 listener、等待已登记工作及锁释放，再关闭已存在的视频协调 pool；从未用过视频的进程关闭时不会新建它。 |
| 恢复扫描 | main 的随机 scan key 与 single-flight Promise 归真实 `worker/image-recovery.ts`；没有恢复 Web HTTP 回跳。 |

没有新增审批、积分二次确认、业务限额、队列表或收费任务身份。原冻结报价、真实钱包余额、owner/scope、显式取消、租约和 unknown 不重提继续保留。

## 验证口径

证据目录：`output/refactor-r5c-main-sync-20261026/`。上一轮 R5C 产物继续绑定 8e203648，不覆盖。

- 原始失败日志保留；历史失败索引不是最终全绿索引。
- 本轮基线是完整 8e203648，不是最初旧 Web 执行版本；基线和回滚行为将使用相同的现有 Worker ownership 合同，而不是伪称旧 Web 基线。
- settings 性能验证从固定 incoming Git blob 读取对照算法，不依赖本机 ignored incoming 路径。查询数是夹具计数，不是线上延迟。
- `verify-application-worker-pool-close.cjs` 执行实际 application/helper/inflight 模块和真实 PG sockets；startup/release/receipt/scan 是明确夹具，不属于完整视频任务验收。
- 实际 Next fixture build/start、Linux 独立进程、全项目 TypeScript、定向 lint、依赖 SCC 与副本回滚在本轮集中收尾。

## 完成状态与后续

正文迁移与 13 处文本冲突已处理；本轮三模块同步计数归零。实际运行结果如下，原始命令和字面输出见证据目录：

| 验证 | 结果 | 边界 |
| --- | --- | --- |
| 完整8e203648基线 / 整合后 Worker ownership | 各71检查 PASS，真实Linux child/PG | 两者都执行既有 Worker 合同，非旧Web执行模式；Web执行0，冻结6/current17，11笔consume/66积分，供应商7次仅本地fixture。 |
| 实际 Next 15.5.27 build/start | 6入口20检查 PASS | 新提交已受理、Web claim/扣款/供应调用0；旧Web tick409。不是完整产品standalone镜像。 |
| Worker pool teardown | 4组37检查 PASS | 实际application/helper/inflight和PG；startup/release/scan依赖为fixture。未使用pool不创建、active锁释放后关、同伴关闭失败仍关、初始化失败清理。 |
| 新项目归属与原报价 | PG31 PASS | owner/scope、个人Canvas anchor和原operation；没有新扣款。 |
| 父完成通知 | unit24 + PG19 PASS | lost wake/empty claim、CAS、通知异常；PG通知测试的kick端口是fixture。 |
| postaccept | unit11场景/142检查 + PG18 PASS | 逐图身份、原结果GET-only、checkpoint；不扩大成完整生产route重试。 |
| 异常扫描 | PG12 PASS | 随机scan key、unknown和legacy过滤。 |
| 清理和视频协调 | PG24场景、9组 PASS | 原事务/两独立协调socket；微基准不是生产延迟承诺。 |
| settings/config/价格控件 | 78/14/22组 PASS | 实际AST/VM与明确端口；settings 4→1/5→1无值缓存、共享triptych16:9。 |
| 类型和结构 | 全项目tsc、定向源码lint PASS | emitted静态/动态SCC及成员与8e基线完全相同；新owner不入环，生产db facade消费者0。 |

第一轮Next fixture漏拷贝merge中已staged新文件，构建exit1；已修正harness文件清单纳入当前index，原失败保留，最终通过。未为该失败改生产依赖或恢复旧实现。测试脚本的CRLF统一为LF只用于可重放patch，执行token未变。

本轮四产物、副本回滚/patch、双parent commit、远端和清理结果封存在该目录的 `VERIFICATION.txt` / `DELIVERY.json`；Git结果以实际DELIVERY为准。

整体重构继续；视频新提交/媒体 runtime、剩余依赖环、外围 UI/文档 CAS 和 R6 完整候选仍在原台账。仅推重构分支，不部署。


## 明确保留的验收债务

旧 `verify-pricing-friction-image.ts` 的planner VM仍注入旧管理server，而实际planner已消费execution-services，上一轮新版和五文件投影同依赖均在client9之后 `CONFIG_UNAVAILABLE / exit1`。本轮只保留main的兼容stub合并，没有改旧失败为PASS；后续迁真实测试端口，不为旧测试恢复生产管理bootstrap。全产品构建、完整R6主benchmark与规模验证仍未关闭。
