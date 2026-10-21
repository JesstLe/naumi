# 删除生图排队/待核查用户流程

- 用户明确要求删除，不再保留旧任务检查、恢复及节点锁定流程。
- 基线176aae1dc3b88977bea929def735011c33dcba86，独立codex/image-routing-reliability-20261020。origin/main888f5e2f已包含在基线内；未动共享checkout。
- 删除CanvasClient原任务恢复effect、checkGenerationReceipt、失败锁分支、旧任务检查按钮、额外确认/双按钮、续排队延长前端deadline。删除imagegen/canvas-receipts.ts与model-config/channel-wait.ts，以及专用旧回执恢复测试。
- submitCanvasImagegen每次显式点击产生新operationId，不读写sessionStorage任务回执；startImagegen取消提交失败后的自动GET恢复。请求30秒截止，失败结束本次UI请求。
- 失败卡只有重试，生成按钮恢复可点击。没有结果时重试替换失败卡而不是保留一排卡；已取得图片ID仅加载失败时重取已有图片，不自动重新生图。
- 删除ImageOperationQueued/localImageCapacityQueue及其投递、重排队路径。通道容量不足直接429；保留有限并发执行器和数据库幂等，不无限冲击供应商。内部正常任务调度仍有待执行状态，不作为需要用户处理的“排队”流程。
- DurableImageJobs在超时/明确review等异常时终止为error；无已交付结果时按原账务事务释放预占，有已有图片时不删除图片、不伪造费用结论。父任务把异常结束为failed。历史数据库状态/账务不批量改写。
- 本轮无SSH、线上配置、候选或发布动作。用户图片、作品、账务记录不删除。此前上游422根因另行处理，本次不宣称已解决。

## 验收
- 基线实际函数：FAILURE_LOCKS=1 OLD_CHECK=function RETRY=undefined，删除后的目标断言失败exit1。
- 修改：失败释放锁、检查入口不存在、重试替换旧卡，24生成+20详情失败矩阵、编辑并发/双击、15提交准备断言通过。
- 真实隔离PG与实际handler：容量忙失败、供应商0；释放容量后用户新请求POST1/单次结算6；旧失败Worker重入0新POST；APIMart未提交marker清理且无虚假健康失败。终止状态4矩阵/5并行编排池/完整批次通过。
- 原始布局脚本有旧fixture遗漏explicitCanvasParent、旧runCutout内联及isCurrent静态断言，按当前基线接线修正，独立基线目录指定后通过。45比例/参考图场景通过。
- TypeScript通过；浏览器实际按钮/占位/CanvasImage/CachedImage组件通过（locale/zoom/可见性观察器为fixture）：无确认、双击一次、旧检查0、图片重新读取成功。非完整生产页面截图。
- 完整Next发布构建本轮未执行；最终四产物/副本回退与字面输出见C:/Users/13357/.t3/scratch/remove-generation-holds-20261021/VERIFICATION.txt。
- 功能同步计数1→2。只推独立分支，不合main或上线。
