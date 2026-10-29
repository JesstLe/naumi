# BI 用户编辑：消除调用方全活批次锁

## 1. 模块、基线与边界

- 基线：`be0dcb9be6c283583d40827e6ee1487f2fee3068`；原实现 worktree / `t3/bi-user-mutation-audit`。开工工作树干净，已 `git fetch origin main`。固定实现提交 `8b969fb8cd42c367309d85c7416c9ed6407e3517` 已经独立审查及父整合验收，登记 **A41 / D23**，纳入本次主线整合；未部署。原实施记录保留，父验收见末节。
- 业务修改仅 `src/lib/bi/user-management.ts`，新增专属验证脚本及本文档。没有修改 `db.ts`、billing repository/service、连接池、Worker、画布、Agent 或发布采集器。
- 账务 FIFO 前缀扣减 `7e148a6542a35902adc72d727b3574f685dc80ca` 保持。这里只解除上层 BI 调用方的冗余全批次锁，不退回逐批 SQL。
- 本次是源码及真实隔离 PG / 实际模块、route 验证；没有服务器连接、部署、生产读写、供应商调用或生产容量结论。45 笔手术、在线索引继续留给父线程；不改总 ledger/main。

## 2. 实际调用链与契约

### 权限、命令与幂等

`UserManager.prepare/apply` → `POST /api/admin/bi/users` → `biAuthorize` / `sameSiteBiMutation` → `userCommandSchema` → `manageBiUser`。

- UI 在明确操作时生成 UUID；保留 review 命令进行 uncertain 重试，不在重试时换编号。邮箱经 schema 规范化，除 create 外带 `expectedVersion`。
- route 使用原 `requireAdmin`：企业独立站边界、管理员密码配置优先及原生有效用户角色 / Supabase 管理员检查保持；匿名、普通用户及封禁管理员返回隐藏入口 404。原 CSRF 403、schema 400、Supabase create/reset/role 409 分支不变。
- `manageBiUser` 是受信任内部用例，不自行代替 route 鉴权。调用点源码检索仅发现该生产 route 与测试。自改 ban/role/reset-password 403、先降权才能封禁管理员、最后有效管理员保护、版本冲突 409、用户缺失 404 保持。
- 全局 `pg_advisory_xact_lock(hashtext('naumi-bi-user-management'))` 仍串行化 BI 管理操作；管理日志 ID 查重先于版本校验，actor + 对规范化命令 JSON 的 HMAC fingerprint 相等才 replay。相同 nonce 的不同载荷或 actor 仍 409。全局锁竞争不是本切片已解决项。

### 事务与数据归属

- 同一 client / BEGIN 内：全局管理锁 → 日志幂等读取 → `app_users FOR UPDATE` owner 锁 / create 插入 → 必要账务调整及用户编辑 → 版本递增 → after 投影 → management/access 两种日志 → COMMIT。
- BI 拥有账户编辑、乐观版本和管理审计；积分写入继续调用 `runtime.service.adjustTx(client, ...)`。账务模块保留 operation、owner 锁、预留保护、FIFO 前缀 UPDATE、ledger 与余额同步；没有改事务边界、连接或公共接口。
- 原 `before` 记录 name/phone/note/role/banned，原 `after` 再包含 management_version。只有非零 `delta` 才记录 delta/availableBefore/availableAfter/expiresAt；reset-password 另记 sessionsRevoked，不记录口令/hash。非积分动作没有余额审计字段，这个实际契约允许不读取批次。
- 所有运行时批次写入的 owner-first 前提沿用已合入账务切片。本次另用真实独立 billing adjustment 证明 BI 持 owner 锁时另一事务等待，BI 审计先记录其自身提交点余额，然后另一事务提交；不声称原 global advisory lock 不再存在。

## 3. 已证实问题与实现

基线将 `SELECT id,remaining ... ORDER BY ... FOR UPDATE` 放在所有 action 之前，Node 对全部结果求和。1 万活批次的 profile/ban/role/reset-password 实际返回 1 万行，审计写入前尾批次 NOWAIT 均报 `55P03`，尽管这些动作不需要余额。

修改：先决定 delta；仅 `delta != 0` 时执行一条 `COALESCE(sum(remaining),0)` 窄聚合，保持原 `remaining>0 AND expires_at>now()`、原 owner 锁及原 available 计算。数据库返回一行，不加批次行锁。非积分动作及 initialCredits=0 的 create 不发这条批次读取。审计字段和公共接口不变。

- 不使用余额镜像 `credits_total` 替代真实余额，不加缓存、扩池、索引、业务上限或额外服务。
- 积分动作仍扫描活批次；billing.lockWallet / syncBalance 等重复聚合保持。不能从返回行数减少推断所有场景延迟改善或 O(1)。
- 既有 `now()` 事务时间语义、全局管理锁、配置 current 读取，以及已存在的内部受信任调用约定保持。

## 4. 验证设计与环境

专属脚本：`scripts/verify-capacity-bi-user-mutation.cjs`。父进程使用大小写无关环境白名单，保留 Windows SYSTEMROOT，剔除继承的 DATABASE_URL / PG* / NODE_OPTIONS / 供应商配置，不读取 `.env`。子进程仅连接硬编码 `127.0.0.1:55497/naumi_bi_mutation_fixture` / `bi_fixture`。专有 Docker 名与 label 为 `naumi-capacity-bi-c4c82db7` / `naumi.fixture=capacity-bi-c4c82db7`。

实际导入当前 DB/schema、BI 用例、route、auth、口令和 billing service/repository；baseline/rollback 仅用编译钩子替换一个目标模块的源字节，保留其真实解析路径，断言实际装载一次。没有 mock auth/service/repository。fetch/http/https 外呼设为失败，计数必须 0。PG query 钩子只记录 SQL、返回/影响行，NOWAIT 在另一个连接上发出；探针耗时不可作为正常请求延迟。

21 组集中验证（同一矩阵对原/改/回滚运行）：

1. 四类非积分 action × 1 万活批次：原/后字段、无账务变化、原管理/访问审计、owner 与尾批次 NOWAIT；真实密码哈希与脱敏。
2. +6/-6/-600 各 1 万活批次：余额、预留、审计、ledger、operation；负值确认既有一条 FIFO SQL 和必要前缀批次数。
3. create 0/25：before=null，无隐式注册赠送及正确显式到账审计。
4. 到期/零批次排除，其他 hold 与 reservation 保留，精确可用余额扣减；不足、缺失用户、stale version 保留原错误及零变化。
5. 同 nonce 八并发：一笔写入、七次 replay；异载荷 / 异 actor 冲突；同 nonce 异载荷并发一成功一冲突。
6. 同 owner 不同 BI 操作：一笔当前版本成功、一笔 409，显式刷新版本后正确提交；独立账务事务真实等待 owner 锁，无丢余额。
7. ledger / management audit / access audit 真实 PG trigger 故障：分别覆盖增减积分，整笔账户/批次/账本/operation/日志回滚；非积分资料失败也回滚。
8. 实际 route：匿名/普通用户/封禁管理员、CSRF、非法字段、404/409/402、有效请求、private no-store、重放、SQL 错误 uncertain 500 与原 nonce 重试。
9. 自身降权/封禁/重置口令、管理员禁封、最后有效管理员规则。

另运行原 `scripts/verify-bi-management.ts`，覆盖解封、旧会话仍失效、重置口令、正常升降权与 BI 财务投影；不是浏览器或真实 HTTP 服务验收。全项目 tsc 使用已核验 React/React DOM/@types 19.3.0、TypeScript 5.5.4，仅创建本任务 node_modules junction 只读复用，不改共享依赖。

## 5. 量化结果（fixture，不是生产容量）

原/改/回滚实际核验的每次 SQL 包括已初始化后的 config.current 读取、BEGIN/COMMIT；不包含 setup、探针或测试查询。测量载荷为 profile 编辑、ban=true、role=admin（升权）、reset-password；降权的有效管理员计数分支另由原生回归覆盖，不套用下表总 SQL：

| 场景 | 基线总 SQL / 调用方批次返回行 | 修改总 SQL / 调用方批次返回行 | 回滚总 SQL / 调用方批次返回行 |
|---|---:|---:|---:|
| profile / ban=true / role=admin / reset-password（各自） | 12 / 10000 | 11 / 0 | 12 / 10000 |
| +6 / -6 / -600（各自） | 20 / 10000 | 20 / 1 | 20 / 10000 |

- 四种非积分修改版批次 SQL 为 0；三个积分调整仍有 1 条调用方聚合。扣减调用底层前缀 SQL 仍 1 条。
- 所有场景 owner NOWAIT 都是 `55P03`，锁仍持有；尾批次基线/回滚 `55P03`，修改 `FREE`。这证明无关尾行锁释放，不代表所有批次无锁（实际扣减前缀仍写锁）。
- before/after 正常审计、资金及幂等不变量由断言验证；完整 SQL traces / 版本 / 源码 hash 见 JSON，而非仅凭工具 exit0。

## 6. 证据、回滚及交接

证据根：本 worktree ignored `output/capacity-bi-user-mutation/`。

- `MODIFIED_FILE`：修改源码副本，保留修改状态。
- `DIFF_FILE`：唯一业务文件差异。
- `VERIFICATION.txt`：精确 BASELINE / MODIFIED / ROLLBACK 命令、输入、字面 stdout/stderr、exit，以及原生回归/tsc/guard/资源停止结果。
- `ROLLBACK.sh`：可执行，只接受证据根内的独立副本；先验证目标和原件 hash，拒绝路径别名/符号链接及后来编辑，单文件临时写入后原子 rename；不恢复主源码、不回滚 DB。later-edit guard exit73、WRITES=0。

原源码 SHA256：`35b69f69b23a8b606896cb328ae5113ada78b0f61988756560f29d1aeeeb7fce`；修改 SHA256：`d36b129d7a64420ba2b3c657196caabffee314c754dc88d25cfaf354794d8c8a`。

实现过程中修正了 fixture 自身的 phone NULL 预期、重复 phone 碰撞、签名遗漏 now 参数和仅 cjs loader 未加载动态 alias 的错误；最终使用真实 schema 投影、独立 fixture phone 及完整 `--import tsx`。原生回归也独立重置本专用 PG schema，避免与自定义矩阵互相污染。上述是验证环境修正，不算业务修复或基线新增问题。

最终集中验收：BASELINE / MODIFIED / ROLLBACK 各 21/21、exit0；原生 BI_MANAGEMENT=PASS、exit0；匹配 React19 的全项目 tsc stdout/stderr 为空、exit0；git diff --check exit0。副本恢复原 hash 和原返回/尾锁行为，later-edit exit73 且原编辑字节不变，主源码与 MODIFIED_FILE 保持修改 hash。四产物已经打开并逐项核验。自有 PG 容器 label 核对后已停止，状态 exited、55497 端口关闭，未停止其他资源。

核心复跑入口（只连接上述已准备的专用 fixture，不自动启动服务）：

```powershell
node scripts/verify-capacity-bi-user-mutation.cjs --mode baseline --source output/capacity-bi-user-mutation/BASELINE_FILE.ts --report output/capacity-bi-user-mutation/baseline.json
node scripts/verify-capacity-bi-user-mutation.cjs --mode modified --source output/capacity-bi-user-mutation/MODIFIED_FILE --report output/capacity-bi-user-mutation/modified.json
node scripts/verify-capacity-bi-user-mutation.cjs --mode rollback --source output/capacity-bi-user-mutation/rollback-copies/restored.ts --report output/capacity-bi-user-mutation/rollback.json
node scripts/verify-capacity-bi-user-mutation.cjs --mode native
node scripts/verify-capacity-bi-user-mutation.cjs --mode types
```

未完成：父线程独立复核、分配编号、串行合并；生产容量、全局 BI 管理锁、重复余额聚合/expire、访问日志保留、事务故障后连接回收等继续保留原待办。不把局部通过计为完整容量达标或发布。最终 task-only commit 由交接回执提供；本分支不 push/merge main/建 PR。

## 6. 独立审查与父线程整合验收（2026-10-29）

独立审查在父 main `2f2c57e096c548657ee00244eb0e27b29a97d14e` 上普通合入固定提交，review 合并为 `18b450471e8fd24a022aa7098518343f5010e152`。结论为无新增可复现产品缺陷、无阻断整合项。父线程核对 review `MODIFIED_FILE`、固定 Git blob 与父业务文件逐字节一致；业务补丁未再修改。

独立 review 证据：`C:/Users/13357/.t3/worktrees/naumi/t3-7fdb0f25/output/review-bi-user-mutation-20261029/REVIEW.md`。review 自有 PG55517 已停止并移除。除三版各21组及原生BI/type回归外，三版各6组补充检查均exit0：零创建审计、SUM宽化、原有镜像溢出原子回滚、真实owner锁等待后的余额与合成reservation可见性、事务跨到期原语义，以及已记录成功trace的单backend/锁序断言。父已重开原日志及断言，不将review6组写成父重新执行或六项新增缺陷；第六组是trace再断言，预留12是fixture直接构造。

父线程独占 PostgreSQL `naumi-bi-mutation-parent-20261029 / 127.0.0.1:55523`，不复用原实现55497或review55517。测试副本只改源码root、模块解析、fixture端口与observer标识，原断言保留，差异记录在父证据目录。

- BASELINE / MODIFIED / 修改副本 / ROLLBACK：父实际执行各21/21，exit0。baseline/rollback的PASS指原语义及原容量缺口符合对照，不代表全批次锁不存在。
- 四类非积分动作：原/恢复仍12条SQL、调用方返回10000行、尾批次NOWAIT55P03；修改11条SQL、调用方批次SQL/返回行0、尾锁FREE。owner NOWAIT三版一直55P03。
- +6/-6/-600：原/恢复调用方返回10000行，修改SUM返回1行；保留20条总SQL、原审计金额、同Tx和既有FIFO前缀扣减。这里没有全局管理锁或重复SUM/expire优化。
- 父实际原生`verify-bi-management.ts`输出`BI_MANAGEMENT=PASS`、exit0；全项目TypeScript stdout/stderr为空、exit0。实际route函数、签名会话、SQL和事务通过，不是浏览器/生产端到端。
- 固定副本恢复原SHA256 `35b69f69b23a8b606896cb328ae5113ada78b0f61988756560f29d1aeeeb7fce`；原返回行数与尾锁行为恢复。后来编辑guard exit73、零写入；源码和MODIFIED_FILE保持修改SHA256 `d36b129d7a64420ba2b3c657196caabffee314c754dc88d25cfaf354794d8c8a`。
- 父自有容器已核验label后停止、状态exited，55523已关闭；未连接47或执行生产操作。

父四产物已重开：`output/capacity-audit-wave2-20261029/bi-mutation-parent/MODIFIED_FILE`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。完整command/input/stdout/stderr/exit、hash、trace及独立review证据索引保留。

全局管理advisory锁、重复SUM/expire、访问日志保留、其他连接回收及生产容量继续挂账。发布采集器另在独立复核；后续Agent客户端恢复轮询/卸载另切片，不扩大本管理补丁。45笔手术、在线索引和历史UNKNOWN状态保持。
