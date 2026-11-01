# R10G：账务与任务写入归属、费用补查与原任务恢复

## 状态与基线

整体重构 ACTIVE；基线 `35c513b4c2df18637728085358e8c7efb83a8f55`，独立分支 `codex/core-refactor-20261024`。本轮保存5405文件原始hash及完整原源码归档。候选未合main，本线程未部署。

## 调研与实际复现

实际PG、真实四条legacy任务API、管理员POST handler及真实费用补查：原24检查复现人工核对已经settled/扣6，但任务投影失败返回503、没有durable恢复入口；另以两个真实backend锁复现fees billing→job与正常job→billing之间的40P01。30处跨owner任务写入候选已定位；不把这些测试当生产事故唯一归因。

## 职责、公共接口和迁移

- `billing/task-settlement.ts`：四类旧row的预占/扣款/释放/原ledger身份和冻结unknown hold政策；只使用调用者传入Tx。任务模块保留自己的行锁、lease/fencing、cost边界和状态机，不再写钱包/ledger/reservation/billing表。不为旧row创建当前报价。
- `saas/billing-evidence.ts`：SaaS证据写入owner，保留原savepoint；失败返回pending，由billing写自己的creationEvidencePending，账务提交权威不变。
- `billing/service.refreshApiCostOperation`：只修改账务并返回本次结算事实；`billing/task-recovery.ts`拥有账务候选及原任务恢复标记。
- `image-jobs/billing-projection.ts`、Canvas repository：各自写任务投影，只使用传入Tx。
- `application/billing-task-recovery.ts`：费用补查先锁task再进入billing，同事务结算及投影。管理员核对在原账务Tx同时保存canvasRecoveryPending；COMMIT后尝试原结果继续处理，后续失败返回recoveryPending而不伪装扣款失败，已有Worker沿原ID接续。清除marker与任务恢复同Tx，完成/终止任务不重置，不重新供应POST。
- supplier-cost/scan只采集费用；application/supplier-cost-recovery编排采集、账务与任务恢复。worker.ts保留两处真实Worker入口和既有CLI兼容导出，不复制调度器或新增全局事件总线。

## 行为与依赖

同PoolClient、任务→账务锁顺序、原quote/model/version、幂等结算、真实余额、UNKNOWN不重放、原lease和旧ledger保持。legacy金额来自已存cost；原image-job统计全部未过期本金、Canvas/video只统计正的未过期本金两种历史口径显式保留，不借模块迁移改写历史脏row语义或客户价。旧未计费/零价reservation记录保留。

这次迁移的是R10F W1列出的任务/账务/证据写入链，不能扩大为所有模块的只读表访问已统一，也不声称R04整体退出通过。W2媒体metadata、W3工作台/Agent应用边界及九类故障剩余维度继续。

## 验证记录

原24检查基线PASS代表反例已复现；首轮基线预期误写400，真实billingFailure合同返回503，失败已保留后纠正夹具。core迁移先完成、legacy脚本有一次语法准备失败，随后的core-only modified在最终foreign-writer断言失败，原日志保留；完整迁移后同24检查PASS、foreign writes0。

集中验证结果：

- 扩展专项35检查PASS：原24保留，新增真实余额不足、零价、重复失败释放、失效lease、已完成任务不重排、核对ID冲突及网络零调用。管理员503→200/recoveryPending，费用反向锁40P01→同序完成；四legacy原价/单次扣款与并发保持。
- 原pricing组16/16子命令PASS；generation23/23子命令PASS。两个runner按局部scope真实返回PARTIAL/exit2，不写成227目录整版全跑。首次pricing缺CANVAS_FEEDBACK_TEST_DATABASE的夹具准备失败、parent25对新billing依赖未登记的loader失败均保留；补专属fixture DB和实际owner端口后完整组通过，不删任何原25断言。
- 原billing runner18/18全部PASS；supplier-cost、credit-billing（37场景）、Canvas task47case/177检查、运行生命周期11case实际PG均PASS。APIMart完整费用/零费/缺费/迟到费/退款修订/并发回执/只GET恢复及freeze/reopen/restore通过。
- APIMart旧验收断言仍要求requestedCredits不等于authorization就抛错；完整基线副本真实同样在62行失败。本轮仅改为doesNotThrow，沿现行服务端冻结计费合同继续跑其后全部费用检查，不恢复积分回显门槛。
- `verify-video-reliability.mjs`在原完整基线/当前均因31行媒体route已迁移的静态marker失败，未改它或冒称通过。`verify-image-job-routes.ts`未经其专属App/三任务DB准备，观测到4!=3；原失败保留，不据此推断产品回归或把它列为有效App验收。
- 非增量项目tsc exit0；定向lint exit0。完整新增源已stage后重做架构：5414文件、1801src代码，语法静态/all及类型擦除静态/all四类SCC均0，唯一未解析是构建产物dist/worker/application.cjs；两条lib→app仍仅release fixture。
- 实际生产Worker构建2426输入、2外部包、0HTTP route输入，bundle hash与全部输入raw绑定，真实导出的createDirectWorkerApplication可加载。首次probe误用runApplicationWorkerTick导出名的准备失败保留；不是新完整Linux Web/Worker镜像验证。

最终精确源码、类型输入、完整hash、四产物、副本回滚及cleanup以本轮VERIFICATION/DELIVERY为准。新候选完整CI独立运行，不把本地这些局部PASS拼为整体退出。无生产操作、新增积分确认或业务上限。
