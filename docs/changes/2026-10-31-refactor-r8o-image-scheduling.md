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

## 集中预检与原负载观测

修改后真实PG16项通过：FALSE_DELAY=0、STALE_COUNT=0、RELEASE_WAKE=1，与原15项基线的1/1/0对照；所有正常token/lane/原恢复冷却行为EXACT。新owner和旧API的3个函数identity一致。原parent-completion25项和capacity-runtime-settings21项通过，新增只读采样/unknown口径的mixed合同共14组通过，lint exit0。

旧完整镜像的本轮450秒基线实际165图/12媒体/1800读/450保存、177笔1014积分、原图逐像素/字节与原operation一次POST通过，末尾预占/未完成为0，自有栈清理PASS。同一只读DB采样观察约52秒“已知未派发任务处于冷却、但对应provider与generate lane有余量”的左采样区间，以及约30秒time-ready+余量区间；不是每个任务额外等52秒，也不是证明time-ready都可路由。该轮整体端到端p95=67536ms；新镜像实测及对照见下方本轮交付，不以该旧基线预判改善。

首次类型预检因pg的query_timeout字面量过量属性检查exit2，已保持原1000ms query配置变量传递，未使用any、删超时或改I/O语义；修正后完整类型exit0并固定全部输入哈希。原始失败保留。

## 本轮交付、对照与未关闭项

应用与镜像源码 `46056b43880772a89da37d72e9b7b4ee9b5f9437`。同源码192目录：191 PASS / 1 FAIL / 0 NOT_RUN，**不标完整core通过**；完整同Web/Worker镜像与实际双浏览器92通过；runtime177被原完整core状态门槛阻止，业务检查尚未执行。原144项的源码、命令、日志SHA逐项保持；原47项独立新执行全部通过（subset runner PARTIAL / exit2），场景失败原记录保留。

本片只有6个既有产品文件改变与3个新增职责文件，其他2127原产品raw SHA保持；全部frontend、Canvas页面与src/app入口原字节保持。调度SQL收敛到单一owner；并发、CPU/RAM、报价、余额、原operation及UNKNOWN恢复规则不改。

同负载与预算的450秒原/新对照：每侧165图、12原生媒体、1800读、450保存、177笔1014积分；原像素/字节/单次POST及末尾预占归零通过。整体端到端p95（秒）67.536 → 45.021，surge p95（秒）69.564 → 50.019；冷却且有余量的左采样区间累计（秒）52.001 → 0.000，time-ready且有余量（秒）30.002 → 7.999。这些是一次本地对照，不是每用户等待、全部候选可路由或10万容量证明。

完整core首轮场景测试实际出现sharp加载分页文件不足与V8内存分配失败，且错误日志拼接NaN遮住原异常、留下Next子进程；只核验并终止了自有两个Next后原测试exit1。第二轮同源码复用144条原日志，仅重做场景时在director outputs HTTP500/Jest worker子进程异常后出现输出0/预期1超时；无pageerror。两轮失败及cleanup分别保留，第二次根因仍OPEN，没有抬内存、改业务断言或用历史PASS覆盖。后续原47项与固定镜像验证独立登记，不冒充完整core绿。runtime入口要求timeline所属完整core为PASS，因此实际exit1并在检查前清理；原timeline108项通过也不绕过该门槛，没有伪造PASS父报告或放宽guard。

类型exit0且2578输入raw SHA与最后core边界一致；lint exit0、变更模块无warning。四类SCC0，原两条release fixture反向边与一条dist生成未解析边单列。第三模块普通main同步计数2→3→0，实际Already up to date；不是合回main。

**🔴 候选分支超过48h：用户要求持续交付完整重构版本，仍保留独立worktree。剩余Canvas Shell、场景原生回归、持续/生产容量、有效CI、最终main整版整合及生产验收尚待；整体ACTIVE，未合回main、未部署、47 HOLD。**

接口：image-jobs/scheduling唯一拥有claim/due/release及SQL；image-job-repository仅向真实旧调用方重导出同函数；runtime与worker直接依赖owner。work-signal是原schema-scoped PG通知叶子，provider只在DELETE实际释放token后通知，失败不反转删除；原LISTEN、周期扫描与角色策略保持。原付费检查点、心跳fencing、保存和账务事务仍归原具体owner。

真实隔离PG原15项复现FALSE_DELAY=1、STALE_COUNT=1、RELEASE_WAKE=0；修改16项为0/0/1，正常token/lane/parent/旧版本/started/嵌套started/原通知合同EXACT。patch与独立副本回滚、5301原raw SHA恢复、later-edit首次写入前零写入拒绝，以本片最终VERIFICATION/ROLLBACK_RESULT为准；真实工作树保留新实现。
