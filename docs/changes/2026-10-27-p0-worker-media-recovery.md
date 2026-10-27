# 47 P0：Worker / NAS 交付 / 容器重启恢复

## 基线与边界

- 用户授权修复全部事故链并整合已完成分支，统一向 47 蓝绿发布；重构和专用回滚分支排除。模拟进度属于产品设计，保持不变。
- 独立工作树基线：`fb5dfe80810ed1d796c6050e5487b92e6fa02c1d`。共享 UI 工作树的未提交内容保持原样。
- 当前线上观测基线：Web / Worker 同 `187559d2f6830a2ab34fc232b9ecdaa1ad6f036b`。Git 整合、隔离验证与实际上线分别记录。
- 已完成业务分支都已包含在 main；四个 t3 旧分支经 `git cherry` 证实 patch-equivalent，不重复套用。分支明细保留本地 ignored output。

## 已确认原因

1. 原 tick 串行等待媒体补传。原真实 tick 耗时 208.616 秒，其中媒体补传 204.984 秒；activePromise 阻止下一轮派发。
2. Worker 将丢失回执记 UNKNOWN 并暂停，但没有自动用原 tick 的服务端完成回执恢复；错误 cause 和 HTTP status 丢失。
3. Web 新 boot 按配置默认 draining。已有恢复服务持续 `CONTAINER_CONFIGURATION_CHANGED`：Docker 重启把 `HostConfig.Dns` 从 `null` 变成 `[]`。只还原这个字段后，两容器哈希均精确匹配原 manifest；没有真实 DNS、镜像或其他配置漂移证据。
4. 私有 NAS S3 经反向 SSH 转发，原图读写慢；媒体补传和变体构建在网络 I/O 期间持有 SQL 事务，放大延迟。此前内核证据不足以把 SSH 故障归因于今天 OOM。
5. 当前生成队列为 PostgreSQL durable jobs + lease，已停止的 Redis 没有当前消费者；本次不引入新的队列系统。

## 模块与实现

### 调度与原回执

- 独立的媒体补传 / 媒体任务恢复 lane，复用 `detachBackgroundActivity`：返回 tick 前登记持久活动，真正完成前心跳保持在途。各 lane 单飞，原跨进程锁和业务幂等保持。
- tick 的 processed 不冒充媒体完成数；独立给出 lane 状态、各阶段耗时、当前 tick 时长。Worker 保存有界错误代码、cause、HTTP status，日志不含响应体、SQL 或凭据。
- 恢复服务只对原 unknown tick 调用 Worker 现有 reconcile。Worker 用 GET 验证原 UUID / boot / commit 的真实完成回执，随后 CAS resume；running / unknown / missing / 错身份仍保持原状态。人工 drain 的 revision 不会被自动覆盖。
- `static_pin` 只把空 DNS 列表归一化为旧登记的 null；非空 DNS、资源、权限、挂载等仍完整绑定。

### 媒体交付

- 47 显式启用 `NAUMI_NAS_DEFER_UPLOAD=1`，仅 private S3 proxy 生效。64 MiB 内对象先原子落本机持久镜像，登记 remote_ready=false 后立即交付；NAS 补传由独立 lane 执行，不重复调用供应商或结算。
- 保留至少 4 GiB 文件系统余量；大视频和低空间场景沿用 remote-first。既有本地媒体不自动删除，本轮没有历史媒体清理。
- 原图及变体按 catalog 内容哈希验证本地镜像，远端确认后仍可直接服务最近已存图片；归属鉴权、Range、cacheVersion 保持。哈希与文件版本不符时重新走权威远端。
- 补传用短原子 SQL claim，网络期间不持行事务；内容摘要 + 原 retry_after CAS 防止过期上传结果覆盖新内容。
- 变体用非阻塞跨进程 advisory lock；网络外短事务附着，原 sha CAS 防止旧变体附到新原图。媒体和下载请求把取消信号传给上游。

## 验收与发布状态

集中验证已通过：24 个 Worker runtime tests，21 个 supervisor tests，59 项真实隔离 PG tick 回执验收，91 项 combined Worker 控制断言，20 项 remote-first 兼容，20 项真实本地 HTTP 黑洞/断网韧性；新增真实 PG + HTTP 媒体交付测试验证立即落盘、原图/变体、账号隔离、Range、补传 CAS、网络期间无 SQL 事务、校验本地读取及取消。完整 `tsc --noEmit --incremental false` 通过。

初次测试发现共享旧 UI 工作树 node_modules 为 React 18，与主线锁文件不符；保留原失败日志，改用与本工作树 package-lock SHA 完全一致的发布准备树只读依赖（React 19.3 / Next 15.5.27），没有修改共享依赖。旧 storage 测试夹具已同步新 import 与短事务 claim 接口，原失败记录保留。

18:51 只读47：最近1小时13个父任务均 succeeded；24小时775 succeeded / 42 failed / 6 partial / 1 needs_review / 1 cancelled / 1 queued。当前 Worker IDLE、未暂停、无未决 tick；媒体待补传0。另有1条13:07旧boot的媒体变体 UNKNOWN 观测，旧进程已在17:42重启；发布须精确保留旧证据并区分当前执行，不能删除或伪造完成。

### 19:21 实际发布完成

- 固定 main `e2217c983fe74f4829f2cacb3f69305428af0b11` / `1793098906`，47 Web 与 Worker 同镜像 `sha256:cb2c92d5a00fed17c49cda9f95f8bff5ef4dc7b0bd0f943d29132b25045fdb26`。
- 三锁蓝绿完成，未接单候选实际重启后新 boot / 默认 draining / 配置 pin 稳定通过。真实现有账号与后台 GET 通过；Windows 外网版本、canvas、34项静态资源200。
- 原任务/冻结绑定/账务保全核验通过，剩余违规0、unknown tables0。旧 Web/Worker 均停止且 restart=no。那1条旧 boot 媒体 UNKNOWN 原样保留，不改业务成功状态。
- 19:22 新 Web open、当前 unknownLeases0；Worker IDLE、paused=false、unresolvedTicks0；恢复服务连续 PASS。现有私有原图3846字节读取200/156ms、原摘要相同，匿名401；这不是大图带宽或新收费生成验收。切流后观测窗口尚无新父任务。
- 追加人工 drain 优先级保护后，最终 Worker tests25 / supervisor22；Linux host gates14通过。独立源码副本回滚恢复原哈希并复现旧阻塞；生产回滚未执行。
- 首次发布在导入前遇到 Linux 文件名大小写问题；原备份、快照、操作 UUID 保持，修正后从同一事务记录续行，未重复备份/创建候选/重放任务。
- 本地封存：`E:/Workspace/naumi-p0-worker-media-recovery-20261027/output/p0-recovery-20261027/VERIFICATION.txt`。服务端：`/opt/naumi-staging/evidence/release47-p0-worker-media-20261027-r1/transaction-r2/`。

用户随后授权完整执行架构升级；P0上线不等于生成执行已移出 Web。该后续改造另开独立任务分支，不合并既有重构分支。

复用入口：
```text
node --import tsx --conditions react-server scripts/verify-p0-media-recovery.ts
node --import tsx --conditions react-server scripts/verify-p0-nas-delivery.ts
node --test scripts/test-worker-runtime.mjs
python -X utf8 -B scripts/ops/test_release47_recovery_supervisor.py -v
```
NAS 与原 tick 回执集成测试必须使用显式隔离的 loopback PostgreSQL，绝不指向线上业务库。
