# R8O：图片调度归属与可派发等待

## 原始基线与调研

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；原始源码 `d08af9149da0c2a88988a671b88b432c708cad90`，5,301 文件 raw SHA、完整源码和独立副本已保留。R8N 已完整 core191/runtime177/browser92封版；本片为主线同步后的第3个产品模块，完成时执行普通主线同步。

R8J450秒合成负载观察到突发端到端p95约70秒和积压期间约77%合成HTTP槽占用，但当时只有unfinished/executionQueued等汇总，没有区分真实可派发、冷却及provider lease；因此该数字不作为唯一瓶颈归因。

本片首先对当前原实现执行真实隔离PG：15项复现确认未派发任务也冷却10秒、调度锁等待后的过期占用仍按事务开始时间计数、provider lease真实释放后没有唤醒信号。原任务token、同ID单赢家、lane预算、原parent/无证据/旧版本/started及嵌套started冷却负例同时覆盖。该层只有真实调度/容量SQL，不冒充完整钱包/供应商链验收；完整镜像负载另行对照。

## 模块、公共接口与数据归属

- `image-jobs/scheduling` 唯一拥有 `claimImageJob`、`dueImageJobs`、`releaseImageJob` 及其SQL写入。配置的四种lane、每kind的公平顺序、默认预算与DB advisory锁保持；旧repository不再混合调度SQL与账务/结果写入。
- `image-jobs/types` 是调度和持久任务共享的窄合同，kind复用原QueueKind，不复制枚举。
- 真实DurableImageJobs与worker image-recovery直接依赖调度owner。旧 `image-job-repository` 仅重导出同函数，供仍存在的脚本API调用，不保留第二套writer。
- 心跳/120秒执行lease、25秒续租、post-lock fencing、paidOperations检查点、结果保存和结算继续由原owner负责；移动调度不移动或拆分这些事务。
- `application/work-signal` 只拥有原schema-scoped PG NOTIFY合同和有界best-effort I/O；不依赖角色、scanner、任务表或钱包。原task-execution继续决定本地/Worker角色，原wakeup继续唯一拥有LISTEN连接与schema过滤。
- provider capacity释放只在实际DELETE到token后通知该叶子合同，先提交释放再发送可丢失hint；通知失败不反转删除、不抛出新的付费拒绝。空claim、Deferred、重复或不存在token均不制造唤醒，避免自激循环。既有周期scan继续兜底，不新建队列或scheduler。

## 行为修正

1. 只有 `queueState=execution`、数值 `paidOperationVersion=1` 且没有任何started付费检查点的pending任务，释放后立即time-ready。其“未派发”依据仍来自原DurableImageJobs的原子检查点，不从503、超时、缺行或本地猜测推导。
2. 其他pending parent、原结果恢复、旧任务、缺证据及存在started的状态保留10秒恢复冷却。原UNKNOWN不被改成未受理；原operation/pin/报价/预占保持，不增加付费POST重试。
3. claim在取得原kind锁之后用实际DB时钟统计仍有效的占用，不把等待锁之前的事务时间当当前容量。预算不增大。
4. 真正释放provider slot时，现有Worker可按原DB候选继续派发，不必只等新的用户请求或周期timer；hint不是任务受理回执。

## 验证设计与边界

使用R8N原完整固定镜像作baseline，全部产品raw哈希与R8O基线一致（仅封版文档不同）。独立baseline-runner只投影两个只读观测文件，原始baseline-copy不改；新版使用本片完整固定镜像。两侧保持原450秒/165图片/12原生媒体/1800读取/450保存、2账号、原报价、provider4、lane16和相同CPU/RAM/内部网络，不提高并发或降低像素。

同一个只读采样器在原repeatable-read事务内记录DB时钟、已知未派发的time-ready/冷却、活动generate lease与实际p1账户provider lease。未将其他或退休budget当空闲槽；time-ready不等于通道一定eligible。旧R8J缺少新字段时保留unknown，不回填0。可派发窗口、供应商HTTP占用和账务交付分别报告，不能用吞吐或单次450秒替代生产容量证明。

旧静态fairness断言跟随真实scheduling owner，parent-completion fixture继续执行真实调度函数及原DB端口，不恢复旧repository函数体或放宽原价/父子/UNKNOWN断言。完整命令、失败、modified、混合原始记录和副本回滚以本轮VERIFICATION/DELIVERY为准，未运行项不借历史绿灯。

## 当前未完成与整体退出

实现已完成，集中验证/固定镜像新负载/副本回滚/封版尚待实际结果。main未合回、未部署、47 HOLD，整体ACTIVE；分支超过48h按用户完整重构版本继续保留。持续长稳/生产到达率、租户公平、所有视频音频规格、有效远端CI、最终main整版与生产验收仍待；本片不承诺10万容量或所有历史等待已关闭。

## 集中预检与原负载观测

修改后真实PG16项通过：FALSE_DELAY=0、STALE_COUNT=0、RELEASE_WAKE=1，与原15项基线的1/1/0对照；所有正常token/lane/原恢复冷却行为EXACT。新owner和旧API的3个函数identity一致。原parent-completion25项和capacity-runtime-settings21项通过，新增只读采样/unknown口径的mixed合同共14组通过，lint exit0。

旧完整镜像的本轮450秒基线实际165图/12媒体/1800读/450保存、177笔1014积分、原图逐像素/字节与原operation一次POST通过，末尾预占/未完成为0，自有栈清理PASS。同一只读DB采样观察约52秒“已知未派发任务处于冷却、但对应provider与generate lane有余量”的左采样区间，以及约30秒time-ready+余量区间；不是每个任务额外等52秒，也不是证明time-ready都可路由。该轮整体端到端p95=67536ms；新镜像尚待实测，不能提前宣称下降。

首次类型预检因pg的query_timeout字面量过量属性检查exit2，已保持原1000ms query配置变量传递，未使用any、删超时或改I/O语义；修正后完整类型exit0并固定全部输入哈希。原始失败保留。
