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

主线能力已按重构 owner 完成整合；原／新完整源对照、固定镜像与实际产品控件的集中验收全部通过。四产物、副本回滚、远端同步和自有资源清理的逐条回执统一由本轮 `output/refactor-r6r-20261027/DELIVERY.json` 与 `VERIFICATION.txt` 记录；整体目标保持 active。

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

本轮把 NAS、媒体 lane、真实 Worker/慢 NAS A/B、原回执、remote-first、存储韧性、supervisor 和 direct runtime 接入既有 required core 目录，**44 → 52 项**；不是新测试框架。

## 最终固定源码与产品验收

- 业务与全部验证输入固定在 `216220bd9ea90c03b9e5a88dfe63d05600b778af`；source digest：`bc7592787459e4f2e3bfb208c9480563c2c7c7d8fa5a8d0ed53ed3d08aa09dc6`。随后仅补录文档，不改变被测业务／core／浏览器输入字节。
- 完整 Linux 镜像：`sha256:78e132825d2321a027b24c79d8b2af9b348a312ef596c1978fd611af903ac039`；同一固定镜像包含完整 Web、direct Worker 与媒体运行包，无服务器部署。
- required core **52/52**、failed **0**、notRun **0**；完整 tsc、受影响模块 lint 均 exit **0**。静态、全 import 与 emitted 两类 SCC 均为 **0**；既有两个 fixture Route 导入和 billing toast UI 依赖单列，未包装成全站分层完成。
- 同镜像实际应用／PG runtime **125 检查**通过；真实 Edge 产品控件 **36 检查**通过，双原生登录身份、60 秒混合读取、route mocks **0**、积分确认弹窗 **0**。原图片／文字冲突、剪贴板、三视图、重做、合成和 Comfy 控件保持；Comfy 两张产物增量客户扣款 **0**，原 7 笔／42 fixture 积分保持。
- 两套 runtime/browser 自有容器及网络均已清理，POSIX Worker drain exit **0**。本轮独立 PG 在回滚行为验证完成后统一核实并清理，最终状态以 `CLEANUP.json` 为准。

可复用命令与真实输入、字面输出和退出码保留在本轮各 `*_RUN.json`；原／新为完整 source-root，不用替代业务 scan 或 fake 账务推断通过。完整 package/core/runtime/browser 来源绑定见 `SOURCE_BINDING.json`。

## 保留的失败与边界

初次新夹具的 snapshot 字段、后台完成等待及清理次序错误，以及结构观察器遗漏 named function expression，均保留原始失败，修正后重跑相关完整入口。结构证明使用真实 `git merge-file` 三方结果，不错误要求保留 direct transport 的 Worker runtime 整份等于主线。

中间候选 `2e0cfbfc` 的 NAS 夹具 definite-assignment TypeScript 错误导致 tsc／Linux build 失败；仅修复夹具声明，发射 JS 精确不变，随后重新固定到 `216220bd` 完整跑通 core、tsc、Linux 包及产品验收。旧失败没有改写为成功，也不据此认定生产故障。

本轮无新表、任务引擎、计费 owner、业务限额或确认流程；不合 main、不 SSH、不部署、不接发布锁。完整本地产品验证不等于真实付费供应商质量或 10 万活跃容量验证。

## 后续切片

R6S 继续 Canvas 视频提交、原回执恢复与 batch 编排边界：先跟踪 `generateVideoDraft`、`saveVideoDraft` 及 `canvas-batch-client` 的真实调用，复用现有 node revision CAS、原 receipt body、冻结报价、素材身份、任务／Worker／账务／历史 owner。不建万能 setter hook、新队列或另一套计费状态。先封存本切片，再修改下一模块；整体项目尚未完成。
