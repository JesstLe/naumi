# R9W：第一次供应原结果检查点

## 实际断点与职责

基线为 `b24b1e733710b9dcc9bad875f90b7fe0dc6c4ea4`，5379 个原始文件冻结在本轮 ignored output。M05 旧证据只有“已经保存 paid done 后恢复”；本轮通过真实 plan/submit/receipt handler、原任务 lease、PG 和受控回环供应 HTTP，在供应接口返回图片后、第一次 paid result snapshot 提交前注入失败，没有 seed done。

旧实现正常正例按原 6 积分交付；第一次 child done 写入失败一次、真实 COMMIT 完成但应答丢失、root done 写入失败一次均转失败：作品 0、consume 0，6 积分预占 hold；页面错误仍为“本次未取得完整图片，请重试”。同一 operation 只调用一次供应，原防重放没有失效。这个新反例不是任何线上历史事故的唯一归因。

结果完成状态继续由 `image-jobs/runtime` 唯一拥有。供应结果已经返回后，`persistResult` 只在同一次持有 lease 的调用内保存同一个结果，最多再尝试一次本地 checkpoint；每次先核对原 lease。它不调用 run/childRun，不改变 operation、供应路由、售价、钱包或调度预算，不增加确认或购买步骤。

## 原子完成与未知提交

- child/root done 写入共享本地结果持久化策略，仍经过原串行 update 和原 SQL/lease fencing。
- COMMIT 应答丢失后重新读取同一个 attempt token。若原 token 已 done，保留已有结果且不再写快照；其他 token 或状态冲突仍为原 Pending，不覆盖其他执行者。
- 第一次结果对象写入继续使用已有 codec 和 inline fallback，不引入新存储、任务或恢复系统。
- 两次 checkpoint 仍失败时只设置本地 typed Pending；handlePending 保留 paid intent 与 hold，暂停任务并返回“图片结果保存未完成，请检查原任务”。诊断阶段是 paid-result-checkpoint，原因是有限代码 IMAGE_RESULT_CHECKPOINT_PENDING，不保留任意原文。
- 这不承诺持续数据库故障或进程退出后一定能找回未持久化的字节，也不把 hold 写成已扣款、退款或供应取消。

## 验收边界与记录

新增 verifier 复用 createModelFixture、实际入口、存储/账务/作品和现有 runner。五场景为正常、child 首写一次失败、child COMMIT 真正完成后的 ACK 丢失、root 首写一次失败、持续首写失败。每场景在同一个 operation 下核对供应 POST、身份、原字节/作品、原 GET 提示及账务；重复 GET 不再 POST，跨账号读取拒绝。

旧五场景 BASELINE_REPRODUCED，新五场景 PASS；前三类瞬时故障正常交付同 SHA 原图，一笔 6 积分 consume；持续失败无作品/consume、原 6 积分 hold，提示与阶段准确。Client SQL 边界为显式故障端口；COMMIT ACK 场景的原 COMMIT 实际执行后才抛异常，不等于全机断电。实际浏览器视觉状态和其他入口不在这五场景证据内。

原相关恢复/账务执行中，真实PG受理证明18检查、原delivery73检查、gateway及credit整模块通过。两条历史AST harness分别因未登记image-plan-runtime与local-image-rejection依赖失败；完整基线同命令复现相同失败，原报告保留，未在本轮改写这些脚本，也不拼成六项全通过。类型/lint/架构、完整副本回滚、原始命令/字面输出及最终 source 以 `output/refactor-r9w-20261101/VERIFICATION.txt` / `DELIVERY.json` 为准。完整目录现登记 223 项，登记不是本轮全量执行。

R9V 的精确头 Image 已实际在 Registered model execution and private control-plane regressions 失败；原始日志读取返回 EOF，未据此认定某个 child 根因。Core 仍按实际运行状态刷新。整体重构 ACTIVE，main 未合、部署 0、47 HOLD；M05 的上述精确 SQL 场景推进，不把 M03/M04/M06/M09 或整张九类矩阵一并关闭。
