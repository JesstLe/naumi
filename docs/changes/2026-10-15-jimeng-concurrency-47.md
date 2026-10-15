# 47 即梦并发扩容

## 来源与基线

- 接续 Codex `01a135d3-beda-7db0-9938-2294e4d85100` 最后未完成要求：即梦并发1太小，已有80多人使用。
- 独立分支 `codex/jimeng-concurrency-47-20261015`；开工刷新 `origin/main=daf72b2`。不改共享checkout，不整合专用历史回滚分支。
- 2026-10-15 06:51 UTC实测：Hub即梦并发1、浏览器任务并发1、总任务4；账号池1个启用、无冷却、成功28次；7.1GiB内存、约2.6GiB available。原配置SHA256 `3a22137325462ebf4e5b32957c02d6f54db34bad9c5f341f43fa600fe6be9f04`。

## 实现

- 仅改47 Hub配置：`engines[id=jimeng].concurrency:1→8`、`scheduling.maxBrowserJobs:1→8`、`scheduling.maxConcurrentJobs:4→12`。
- 8是同时在途生成任务，不是8个Chrome。原浏览器传输层仍逐次短请求串行，生成轮询可交错；物理浏览器池4不变，不新增账号、不改上游风控/重试。
- `scripts/ops/hub-concurrency47.py` 同时持Naumi和Hub发布锁，保存原文件/hash、SQLite在线备份和运行观测。先等排队领取，短暂暂停新接单、等待已接任务完全结束；任何未知/核对中任务均阻止重启。
- 不更改已有任务的冻结engine digest；只有非终态任务0时才改配置。保持bind mount inode，校验容器可见配置，只重启已排空Hub Node子进程；容器/即梦引擎/浏览器不重启。
- 原暂停状态保持。暂停期间新调用可能收到503，由应用现有重试处理，不承诺完全零中断。
- 80任务用真实部署模块+独立SQLite+无外部调用adapter集中验证，覆盖并发峰值、队列清空、每任务一次提交、幂等重放。
- 仅新建3笔运营验收任务用于证明确有重叠上游running、唯一attempt、媒体落盘及签名下载；不借用客户身份、不触发客户扣费。专用验收Key用完停用；不重投任何原用户任务。
- 回滚脚本默认持锁排空后只还原本次Hub配置，不回灌数据库。`--copy`在副本验证恢复原hash，线上保持扩容配置。

## 进度

2026-10-15 07:00 UTC已上线并验收：

- 原80任务fixture峰值1，新配置峰值8，80/80完成，每任务attempt1、幂等重放通过；回滚副本恢复原SHA，峰值恢复1。
- 3笔真实即梦5.0 Pro生图同时running（各自已有不同上游history），全部成功；每笔attempt1、各一张1536×1536、Hub本地图片字节/SHA与签名下载一致。
- 3笔验收Hub任务ID：`a2cbc521-10d5-49ae-b0e1-5e9d704da1f9`、`d5efdbe8-f8e0-4c66-b007-e2350ba52149`、`2398908e-1ac2-4d5e-aec7-f8357bc8b175`。验收调用Key已停用，不含客户任务/账本。
- Hub容器ID未变；仅Hub Node PID28→10878，Jimeng引擎PID29保持。物理浏览器池、App/Worker/网关和模型价格未改。
- 暂停状态恢复，最终非终态0；匿名Hub管理接口401；公网健康、版号200（版号沿用原App，不伪造新镜像版号）。Hub在线备份`integrity_check=ok`；双锁已释放。
- 新配置SHA256 `9ac69023737796a9cc2d69312695e1dd4f688ff3d35ac383c1a162352631ae41`；远端证据`/opt/naumi-staging/evidence/jimeng-concurrency47-20261015`；本地`E:/Workspace/naumi/output/jimeng47-concurrency-20261015`。
- 未实施线上回滚；仅副本恢复并执行原调度行为验证，生产继续8并发。上线操作退出0；原锁竞争和fixture读权限两次准备失败均未改线上配置，已修正后执行。

未宣称8路真实满载或80人同时生成通过；只有一个上游账号，采购方账号配额/上游节流仍决定最终吞吐。真实验收证明3笔上游同时处理，不能将配置值8冒充8路负载验收。

## 固定交付与后续

发布脚本、fixture与回滚脚本先选择性提交/push后执行：固定发布代码`683eb70`；事后增加进程识别（含Node flags）与可重放验证脚本，不二次执行发布。两次刷新main均`daf72b2`；同事chat/login/upload最新分支保持独立，运行配置脚本不打包/降级他们的App。未替换App/Worker镜像、网关、模型/积分配置，未操作103或旧服务器。

复核命令：`bash /opt/naumi-staging/evidence/jimeng-concurrency47-20261015/verify-fixture.sh BASELINE`（或MODIFIED/ROLLBACK）。线上回滚：`bash /opt/naumi-staging/evidence/jimeng-concurrency47-20261015/ROLLBACK.sh`，双锁、expected-config-hash、完全排空后恢复1/1/4；保留所有任务、账号和图片。
功能迭代本模块1/3；配置成功发布计1次，不计文档提交。未构建镜像；磁盘52%/可用32GiB，不触发构建前空间门槛；原维护累计计数另行核对，不虚记归零。
