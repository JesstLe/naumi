# 账务事务生命周期：原异常与连接归还

日期：2026-10-29。父基线：`cb1d2f4932e402a75511485173027ed049ed342e`。
固定实现 `8f5a3606c2408f656434f448e81c5cc1eaa5741e` 已完成父源码复核与真实隔离验收，归入 **A27 账务事务子项**，不把六个失败场景新增为六个事故。纳入本次主线整合，未部署；原子任务记录保留，父证据见末节。

## 1. 模块与职责、实际调用

独占修改 `src/lib/billing/service.ts::withBillingTransaction`，新增窄验证脚本
`scripts/verify-billing-transaction-lifecycle.cjs`。未修改 repository、quote、rules、普通连接工厂、db.ts、BI、任务持久化、Agent、Worker 或发布采集器。

公开接口仍为 `withBillingTransaction<T>(pool: Pool, action: (tx: Tx) => Promise<T>): Promise<T>`。
包装器负责 checkout、BEGIN、一次 action、COMMIT / cleanup、一次 release；action 在同一借出 client 上执行业务，不负责其释放。checkout 在 try 之外，借出失败不执行 action、ROLLBACK 或 release。池由调用方拥有，包装器不 end 池、不扩大 max、不另开事务连接。

源码调用链：

- `db.ts`：余额镜像刷新、积分批次授予、兑换卡、新用户授予、管理员调整、同步工具失败/未知结果结算。
- `billing/synchronous.ts`：预占、失败/未知结果 settle、无外层 tx 时的成功结算。已有 tx 时直接 `settleTx(tx, ...)` 的路径保持，不嵌套重新借连接。
- `supplier-cost/worker.ts`：`refreshApiCostOperation`；`supplier-cost/runtime.ts` 的 ledger.pool 来自既有 `getPool()`。
- 数据与业务事务仍由原 billing service/repository 负责，依赖方向及冻结报价、operation/ledger 幂等、owner 锁、部分成功/BYOK 和 UNKNOWN hold 不变。

## 2. 本轮确证与既有防线

### 确证缺口：清理错误替换原异常

在独占 loopback PostgreSQL 16 容器中加载当前实际 `db/connection.ts` 和指定 service.ts 源码；不为 Client 注入测试 error listener。只对本测试刚 checkout 并登记 PID 的 backend 执行 `pg_terminate_backend`。

基线在 BEGIN 前断连、业务抛错后 ROLLBACK 断连、执行 `pg_sleep` 中断连、COMMIT 回包丢失时，catch 内 `await tx.query('ROLLBACK')` 的 rejection 替换原异常对象。执行中断连原始 SQL 错误为 `57P01`，对象 identity 比对在修复后保持。不是借用工作台 repository 的复现证据。

### 不重复登记父修复；不夸大坏连接复用

父基线普通池已对物理 Client 安装常驻 error listener，日志只有 `[database] connection lost`。此处不修改 listener、不把其存活记为本次修复。

当前实际依赖 `pg 8.20.0` 的 pg-pool `_release` 在 `!client._queryable` / `client._ending` 时本来就淘汰连接。基线真实断连后的健康 checkout 已更换 backend；不能据 `release()` 无参数声称物理死连接一定被复用。

另有明确标记的 SQL dispatch seam：将 ROLLBACK 的执行替换为真实 PG `SELECT 1/0`，制造“Client 仍 queryable，但事务未清洁”的 cleanup 失败。基线普通归还，修改显式销毁并更换 backend。此 seam 验证释放分支，不宣称普通 ROLLBACK 在生产自然产生 `22012`。

## 3. 最小实现

- 新增本地 `discard` 布尔标记。
- 仅在当前 catch 内保护 ROLLBACK：失败设置 `discard=true`，随后始终 `throw error` 保留原对象（含非 Error 抛出值）。
- finally 恰好一次 `tx.release(discard)`；ROLLBACK 成功的业务/SQL异常和明确 COMMIT约束失败继续复用健康连接，物理断连仍由 pg 状态自动淘汰。
- 成功事务流程、返回值身份、action 调用次数和业务事务持有期不变；不加重试、重放、额外 SQL、日志序列化或通用事务框架。

## 4. COMMIT UNKNOWN 证据与边界

真实 TCP relay 在 COMMIT 发出后丢弃服务器回包，读取服务端 ReadyForQuery 后关闭两侧 socket：

1. 服务端确实提交：独立观察连接查到写入行 `durable=1`。
2. 服务端因 deferred FK 拒绝提交：观察到 `durable=0`。

两例客户端均未收到结果，action 均 `1` 次，修改保留原 transport error；不从 rollback 失败、连接恢复或重新 checkout 推断“未受理”。预先持久化的合成 operation/quote/hold/reserved 行完全不变。此表是生命周期合成证据，不冒充真实供应商账务。

第三例为明确标记的 adapter seam：真实 COMMIT 成功后向调用方拒绝其 ack；随后真实 ROLLBACK 成功、健康 client 可复用，但已提交行仍存在。**ROLLBACK 成功也不是未提交证明。** 原异常仍向上传递，包装器不自动重扣、重发、清 operation/hold。

此修复不新增可判定 UNKNOWN 的协议，不解决所有调用方的 COMMIT 不确定性；后续核对必须沿用原 operation、checkpoint 与 accepted/unknown 协议。真实生产双扣费、端到端供应商幂等和生产吞吐均非本轮结论。

## 5. 集中验证

依赖只读复用父 React `19.3.0` 的 node_modules junction；没有安装/修改共享依赖。测试清空非白名单环境，变量名按大小写无关匹配，保留 SYSTEMROOT；不加载生产 .env。外部供应商调用 `0`。

单 fixture 上限：一个自有 `postgres:16-alpine` 容器，256 MiB / 1 CPU，32 MiB shared_buffers、max_connections=25、127.0.0.1:55432。每轮创建/停止/移除按完整 container ID 和唯一标签留证；不操作其他资源。启动前实测可用物理内存 `16,049,756 KiB`、可用虚拟/提交空间 `13,336,816 KiB`，不是生产容量。

14 组生命周期矩阵：成功与事务持有、业务异常、非 Error 抛出、SQL 错误、checkout 拒绝 seam、BEGIN 断连、ROLLBACK 断连、执行中断连、queryable rollback失败 seam、真实 deferred COMMIT 错误、两种真实丢回包结果、成功回滚仍未知 seam、24 次混合并发。

| 版本 | 字面结果 | exit |
| --- | --- | --- |
| BASELINE | `LIFECYCLE_RESULT cases=14 passed=8 failed=6 suppliers=0` | 1 |
| MODIFIED / 修改副本 | `LIFECYCLE_RESULT cases=14 passed=14 failed=0 suppliers=0` | 0 |
| 独立副本 ROLLBACK | `LIFECYCLE_RESULT cases=14 passed=8 failed=6 suppliers=0` | 1 |

基线与回滚 exit1 为六项原缺口断言失败，不是 fixture 启动失败。修改路径核对每次 checkout 一次 release，活动 action 中 release=0；24 次并发为8成功、16预期业务/SQL失败，峰值5、物理client5，全部归还并复用；不等于生产吞吐指标。

原生集中回归（实际 checkout，非重新实现规则）：

- `node --conditions=react-server --import tsx scripts/verify-billing-rules.ts`：`PASS dynamic quotes, frozen prices, partial/failure/BYOK policies, result validation`，exit0。
- `node --conditions=react-server --import tsx scripts/verify-billing-wallet.ts`：`PASS wallet reserve/settle/release idempotency, unknown holds, expiry rollback, concurrency and transaction rollback`，exit0。
- `node scripts/verify-image-job-lease.cjs . modified`：`X2_MODIFIED=PASS`，exit0。真实仓储/账务 PG，虚拟心跳时钟；单 operation ledger `n=1, delta=-6`，UNKNOWN保留、过期锁等待/钱包等待/旧owner fencing通过；未重跑280秒实钟，不混称新的供应商或双扣费证明。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：stdout、stderr均空，exit0。
- 生命周期子进程 stderr 为五行既有固定连接丢失提示；业务异常携带合成凭据标记和大字符串，日志匹配断言保证未输出这些内容。无新增生产日志。

首次 13 组基线已证实六项缺口，但 fixture 收尾比较遇 Docker 29 `--time` 弃用提示，stop/rm 均已执行后才断言失败。原始 stdout/stderr/exit 保留 `initial-baseline/`；控制器改 `--timeout`，并把 stop/rm 分开尝试。后续完成轮均以完整 ID 确认已移除，原启动/清理诊断不抹除。

## 6. 四产物、回滚与交付

全部位于本 worktree ignored `output/billing-transaction-lifecycle/`：

- `MODIFIED_FILE`：修复后的 service.ts 原字节快照；源文件 SHA256 `c29c09069469680f069a4f911f841293543840a317da0f69d905e1bb85f80857`。
- `DIFF_FILE`：本切片三文件完整统一 diff。
- `VERIFICATION.txt`：精确工作目录、命令、输入、literal stdout/stderr、exit、fixture ID、hash、回滚与重新打开证据。
- 可执行 `ROLLBACK.sh`：只接受本证据目录下显式标记的独立副本，拒绝 checkout；先核全部文件和原始备份 hash、路径/符号链接及 later-edit，再开始还原。恢复 service.ts，移除两新增文件；任何前置 hash 不符均 exit73、`WRITES=0`。

原始 service.ts SHA256：`3d193cec49d9ab34cd6772c34da82c83ff5a243b8b35945fa4589c6019612041`。
副本回滚须恢复该 hash 和六项原失败；原 checkout 与 MODIFIED_FILE 保持修复。后来编辑 guard 用末项文件变更验证全量预检，前项源文件零部分写入。四产物均重开核验，不把脚本存在当作已执行。

交付为本任务分支固定 task-only commit，由父线程审查并串行整合；无 push/main merge/PR、SSH、生产DB/容器/Worker/入口/部署操作。47上一轮部署保持；45手术/在线索引仅挂账。完整 Next 构建、线上验收、其他仓储事务 catch、账务长事务/重复扫描均未纳入本切片。

## 7. 父线程复核与集中验收（2026-10-29）

父从 main `cb1d2f4932e402a75511485173027ed049ed342e` 普通合入固定提交。源码补丁未再修改。独立只读证据清点核对了实际pg-pool淘汰逻辑、relay的C/E/Z消息顺序、错误对象identity与六项基线失败；与父现场复测分别记录，未把只读清点当作又跑一次PG。

父测试副本仅替换脚本root、fixture端口 **55527** 和X2入口的同端口副本，原断言不变；未复用或操作55432已有连接。每轮最多一个256MiB/1CPU自有PG，四轮串行，所有资源都按完整ID核验移除。

- BASELINE与ROLLBACK：14场景中8通过/6失败，exit1，失败名称逐项一致；是原清理缺口复现，不是fixture启动失败。
- MODIFIED与修改副本：14/14、exit0；修改版48checkout/48release，活动action内release0，24混合并发8成功/16预期失败、峰值5。基线47checkout是seam断言提前失败而少一次健康复借，不报告为连接泄漏。
- COMMIT真实TCP丢回包：观察端分别durable1/0、action均1、原transport error保持；`clientOutcome=UNKNOWN`只是测试对不可知结果的说明，不是包装器新增业务状态。合成hold表不替代真实账务回归。
- rollback SQL dispatch与COMMIT ack拒绝均为显式seam；非Error sentinel直接实测为成功ROLLBACK路径，失败ROLLBACK时保持原值由源码同一throw分支支持，不冒称另有专用实测。
- 父原生billing rules、wallet、X2全部exit0；X2实际单operation一笔-6、UNKNOWN留hold、失租/锁等待/钱包等待fencing保持。父完整tsc stdout/stderr为空、exit0。
- 生命周期stderr每轮五行既有`[database] connection lost`；无凭据、URL或大参数。原普通池listener与pg自动淘汰不算本次新增能力。
- 副本恢复单文件原SHA256，原六项失败重新出现；later-edit guard exit73/0写入。父源码、修改副本和MODIFIED_FILE仍为修改hash。55527收尾已关闭。

父证据根：`output/capacity-audit-wave2-20261029/billing-tx-parent/`。四产物`MODIFIED_FILE / DIFF_FILE.patch / VERIFICATION.txt / ROLLBACK.sh`均已重新打开；包含原/改hash、准确argv、stdin、合成输入、字面stdout/stderr/exit、各轮完整CASE/原生回归及fixture ID。copy-only回滚不操作数据库、业务状态或生产。

其他仓储catch、余额重复扫描、COMMIT未知后的具体业务人工核对仍未由本补丁统一解决。工作台恢复切片仍待独立review，未混入本次main账务验收。47无SSH/部署；45笔手术、在线索引、UNKNOWN及历史波动保持。
