# R6R：主线 Worker／媒体恢复能力与重构 owner 整合

## 基线与目标

- 独立工作树：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整原树：`78e6ff5754c94189b643afb35b8f98455a76bd32`，4661 个原文件及 SHA256 已归档并回读。
- 主线来源：`e2217c983fe74f4829f2cacb3f69305428af0b11`，4 个提交、17 个路径；固定来源后普通 merge，不 cherry-pick、重写或覆盖共享工作树。
- <span style="color:red">本独立分支超过 48 小时继续保留：用户明确要求持续整体重构并独立交付，不在本轮合 main 或部署。</span>

上一轮 R6Q 已封存。本轮先补齐主线 P0 的恢复与交付语义，再继续整体重构；不把来源分支的本地结果当成当前重构树已经通过。

## 需要保留的实际能力

1. 媒体镜像／媒体任务使用独立、单飞、先登记再执行的 background lane；慢 NAS 不串行挡住后续生成调度，未完成活动仍可观测。
2. UNKNOWN 只按原 tick UUID／boot／commit 读取真实完成回执；自动恢复资格必须受原 revision 约束，人工 drain 优先。
3. 私有 S3 proxy 的显式延迟上传、64 MiB 范围和 4 GiB 本地余量；大对象／低余量继续原 remote-first 行为，不修改部署环境或数据库业务配置。
4. 本地镜像原子替换、基于 catalog 摘要与文件版本的验证、Range／cacheVersion／归属和取消信号。
5. 镜像补传使用短原子 claim 和原摘要＋claim 时间 CAS；变体使用非阻塞跨进程锁，网络 I/O 不持 SQL 事务；不重放供应商或重新结算。

## 调研与职责决定

主线仍以旧 `storage.ts` 和 tick Route 为业务 owner；本重构树已有 bytes/runtime、metadata reader、Worker scan 等 owner。直接选整份主线文件会恢复旧耦合，因此六处 merge 冲突按能力归属解决：

- Worker 阶段计时和媒体调度归 `worker/scan`；HTTP Route 保留鉴权／回执适配，direct Worker 与 HTTP 共用该应用序列。
- 延迟写入及显式补传归 `object-storage/runtime`；摘要验证归窄的本地镜像组件，不导入用户、账务或作品业务。
- 媒体变体准备和镜像恢复各有单一应用 owner；metadata reader／schema 继续归原 owner，兼容导出保留真实消费者。
- 媒体响应归复用的应用适配，媒体与下载入口不再互相导入 Route；既有鉴权、Range、缓存和文件字节处理保持。
- direct Worker 的原 receipted tick 仍等待已认领 callback 真正结束，同时复用已有 wakeup/扫描逻辑继续受理后续工作；不得把媒体 admission 冒充媒体完成。

## 当前状态

本记录先固定来源与实现边界。代码整合、集中验证、原／新对照、四产物及副本回滚结果随实施更新；整体目标保持 active。

## 验证要求

原源码完整归档、迁移调用／SQL／锁／CAS 对照，旧／新真实隔离 PG 与 loopback NAS；慢媒体期间下一批生成能推进且 drain 仍观察未完成活动；UNKNOWN 不重放、人工 drain 不被覆盖；媒体 ACL、Range、cacheVersion、损坏镜像回源、取消信号、原价与单次结算。最后在固定源码下集中 core、完整 Linux Web／Worker 和原产品控件验证，再封存和同步 GitHub。本轮不执行 SSH、发布或生产操作。


## 实现与第一轮集中结果

六处冲突已按上述 owner 整合，未覆盖主线已完成修复。变体／镜像短事务、跨进程锁和 CAS 函数保持主线原正文；本地镜像校验移至明确的实例组件，由原 runtime 组装；storage 兼容面没有退回旧单体。媒体 URL 与下载共用 `media/response`，下载不再导入另一 Route。

实际完整源 A/B（非替代 scan）已经通过：

- baseline：HTTP 与 direct 两入口 **33 检查**，慢 NAS 未放行前后续原结果恢复 consume **0**，网络期间 **1 个 idle SQL 事务**；释放 NAS 后原三笔各 6 积分正常收尾。
- modified：同双入口 **35 检查**，NAS 仍未放行时后续三笔已按原冻结价 **18 积分**收尾，网络期间 **0 个 idle SQL 事务**；媒体仍是 active 持久活动，direct tick 未伪报 drain 完成。原 UNKNOWN 和 live lease 均保持，供应商新 POST **0**。
- 主线 NAS 真 PG/HTTP 测试扩充实际下载入口、异账号拒绝、旧内容补传 CAS、同摘要旧 claim CAS、变体非阻塞锁及原行摘要变更后的 stale 变体 CAS，全部通过。原图／变体字节、Range、摘要校验、损坏同尺寸镜像回源及取消保持。
- Worker runtime **25/25**、direct runtime **8/8**、supervisor **22/22**、原 tick PG 回执 **59 检查**、remote-first **20** 及黑洞/慢上传韧性 **20** 均通过。
- 全项目 tsc exit 0；受影响文件 lint exit 0。

首次新增 A/B 夹具将 HTTP tick 返回误当成媒体已结束，并读取不存在的 snapshot.uncertain 字段；已改为查询原 background owner 的实际完成与 unresolvedTicks。其清理必须先等待后台承诺再关闭池；原失败日志及修正后完整两入口结果均保留。结构观察器对具名 function expression 的 AST 支持修正，不改业务预期。

## 集中封版入口

本轮把 NAS、媒体 lane、真实 Worker/慢 NAS A/B、原回执、remote-first、存储韧性、supervisor 和 direct runtime 接入既有 required core 目录，**44 → 52 项**；不是新测试框架。固定源码下的完整 core、Linux 镜像、runtime、产品控件、四产物和副本回滚结果在封版后补录，不以上述首次局部结果冒充。
