# A15：共享滑动窗口限流完整切片

## 当前状态与基线

- 父分支/开工/`git fetch origin main` 后基线均为 `956b7238fa375e992e0ac594c47cdba5c9d95f50`。工具已准备的独立工作树：`C:/Users/13357/.t3/worktrees/naumi/t3-d97efdad`，分支 `t3/distributed-rate-limit-a15`，初始工作树干净。
- 已读 `AGENTS.md`、`docs/AGENT_COLLABORATION.md` 和容量台账顶部当前索引/GLM 映射。本切片只记录 A15，不修改父总台账、不新增总编号。
- 本地实现和隔离验证；固定 task-only commit 与最终 clean 状态见同目录证据 `output/a15/FINAL_COMMIT.txt`。父线程负责串行整合。没有本任务 push、共享 main 合并、PR、SSH、生产 DB、部署或付费供应商调用；45 笔手术/UNKNOWN 不做操作。
- 既有 `/api/auth/login` 的 `auth-login-limit.ts` 已有独立真实 PG 登录防护。本切片没有替换、叠加该规则；两文件及主池工厂、依赖清单逐字规范化哈希对照保持。

## 复现，不以源码推断代替结果

原 `src/lib/rate-limit.ts` Git blob SHA256：`0292a25f7df5be03488a59436b51b3489ff26f3df98d3b30fb9693fa84e9a902`。

基线命令（修改前执行，退出 0）：

```text
node scripts/verify-rate-limit-baseline.mjs
BASELINE TWO_PROCESSES admitted=10 original_limit=5 defect=REPRODUCED
BASELINE FIXED_CLOCK input=100000:long/1/600000,161001:short/1/60000,161001:long/1/600000 output=[true,true,true] defect=REPRODUCED
```

第一个反例为两个独立 Node PID 各访问同 key 5 次，合计 10 次，超过原单窗口 5 次。第二个反例固定 `Date.now`：100000ms 创建 600000ms 长窗，161001ms 的 60000ms 短窗触发 sweep，把长窗桶提前删除；相同时刻再次访问长窗错误放行。不是把两个模块对象当成两个实例，也不是只读源码宣布缺陷。

## 模块与职责

### 接口、依赖方向、状态/事务归属

```text
真实 route / authorization helper
  → rate-limit-http.checkRateLimit(key, limit, windowMs)
  → rate-limit.rateLimit(key, limit, windowMs): Promise<boolean>
  → rate-limit-store.consumePostgresRateLimit(existingPool, HMAC, limit, windowMs)
  → db/connection.getPool() 的既有普通池
```

- `true` 代表本次请求已占用一个命中，`false` 仅代表原业务配额耗尽；后端/配置错误抛出 `RateLimitUnavailableError`。HTTP 窄适配映射 `503 / code=RATE_LIMIT_UNAVAILABLE`、private/no-store、Retry-After:1，不伪装成 429。
- `rate-limit.ts` 负责后端选择、HMAC、无 DB 本地模式及短诊断；store 只访问自己的 `app_rate_limit_buckets` 和过期索引，不导入 `db.ts`、鉴权、账务、供应商或任务编排。
- 只依据现有部署能力采用 PostgreSQL：项目有成熟 `pg`、普通池和 `DATABASE_URL`；源码未见可复用 Redis 客户端/配置契约。没有新服务、额外连接池、新 npm 依赖或新业务限额。
- `DATABASE_URL` **未配置**时继续本地 Map；**已配置**时即使网络、DDL、池、锁、secret 或 SQL 失败也不回退 Map。多实例共享保证只属于正确配置同一 PG 数据库/schema 和同一 `SETTINGS_SECRET` 的新版实例。
- 原始 key 不入 PG、不入日志。持久 key 为 `HMAC-SHA256(SETTINGS_SECRET, "rate-limit:v1:" + originalKey)`；secret 复用现有校验。日志只输出 `[rate-limit] shared store unavailable`，进程级每 30 秒最多一次。
- 表保存 hash、命中时间数组、该存活 key 见过的最长窗口及过期时间；没有账户/IP/email 明文、业务内容或收费状态。schema 初始化只做本命名空间的增量 DDL，使用事务 advisory 锁；不调用全应用 schema 初始化。
- 本地 Map、PG schema 就绪、待 checkout 计数及 sweep 时间使用进程级 Symbol，覆盖同一进程的不同 Next bundle/HMR；PG 池沿用现有进程级池工厂。

### 滑窗及参数语义

1. 保留原 key 维度，不把 limit/window 拼进 key，也不把 key 改成只按 IP。同 key 的不同 limit 共享命中历史（例如 packaging 保存/生成的不同限额）。
2. 按请求的 `now - windowMs` 计算命中，**等于下边界仍计数**；不是固定时间槽、令牌桶或近似计数。
3. 只记录被准入的调用；重复准入调用各算一次，超额不追加命中、不延长窗口。限流不是业务幂等回执，不重试数据库准入，也不重放已受理或 UNKNOWN 的供应商/收费操作。
4. 清理按每个 bucket 的窗口，不再用本次短窗删除别人的长窗。对同一个存活 key，保留见过的最长窗口历史，短窗口按其子区间计数、不会抹掉长窗口命中。
5. 新增更长窗口不能重建此前已经按旧保留期清掉的历史；目前全部真实入口的 key/window 表达式保持原样。未来调整窗口须单独安排历史预热/过渡，不能借此次改动偷偷改变业务窗口。
6. PG 准入在同 key 行锁内串行化。`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` 在取得行锁后读取 PG 时钟，再计算、更新、提交；不是各 Node 本地时钟合并。锁内没有业务回调、供应商调用或跨请求连接持有。

### 后端故障、连接和清理

- checkout 最多等待 1000ms；由于 `pg.Pool` 没有单次取消接口，迟到连接只归还、不执行 SQL。每进程最多 64 个未解决 checkout 是基础设施排队上界，溢出/超时为 503，**不是新增每用户配额**。不修改共享池配置。
- 独立短事务设置 statement_timeout=1500ms、lock_timeout=1000ms；事务总期限 2500ms，包含 BEGIN/COMMIT/线缆不响应。失败销毁本次 client，服务端回滚未提交事务，不把 aborted/in-flight client 放回池。COMMIT 回执丢失可能保守消耗一次命中，但业务不开始、准入不自动重试。
- 初版每进程/既有池每分钟至多清理一批 64 个候选（已由下方2026-10-30父修替代）；先由 `(expires_at,key_hash)` 索引限定候选，再用单 SQL 内部 ctid 点取锁/删除和 `SKIP LOCKED`。ctid 不持久化、不跨请求使用；并发变化的候选留待下次。
- 初版“索引取 64 后按 key JOIN/IN 删除”在真实 `EXPLAIN ANALYZE` 中被优化为两次 Seq Scan，已修正为上述候选 + TID 访问。最终 10000 行样本 plan 没有 Seq Scan；前 64 个候选全锁住时删除 0，不为了凑够 64 向后扫全表。
- 没有流量时不启动常驻清理计时器，历史 hash 桶可能留至后续有界清理；这是保留，不是重新放行。负载/索引/积压仍应在后续实际站点验收中测量。

## 全调用链迁移

父 grep 的 83 条包括函数声明；基线 AST 是 **82 个实际调用点、65 个调用文件**。

| 调用组 | 实际调用点 |
|---|---:|
| enterprise/workflow | 37 |
| lib 公共 helper | 9 |
| auth / canvas | 各 5 |
| admin / comfyui | 各 4 |
| agent | 3 |
| image-skills / pro | 各 2 |
| competitors、ipcheck、license、packaging-strategy、prompt-assist、reference-workbench、replicate、supplier callback、title-gen、video、wechat | 各 1 |

- 78 点改为 `await checkRateLimit(...)`，先 `instanceof Response` 立即返回后端 503，再执行**原封不动的超额分支**。2 个复合条件保留原短路条件，不新增不相关动作的命中。
- 4 点保留 `await rateLimit(...)` 的抛错接口：后台 team-access guard、enterprise/workflow/source prepare、fleet authenticateRelease、fleet connectorExchange；公共 teamFailure/fleetFailure 先映射本限流错误为 503，再保留原错误处理。
- team-access 原来的超额返回 null、外层 403 业务语义保留，没有擅自改成 429。其它原超额状态/响应文案不变。
- shared helper 的实际反向调用链（本地、import、callback 引用）记录在 `output/a15/CALLER_INVENTORY.json`：例如 BI 多 route、team/enterprise 授权、image-cache 两入口、canvas Agent、fleet poll/ack/release、后台页面等，不只检索 `rateLimit(` 字面量。
- 82 是源码调用点，不是 82 个活跃 API 或生产流量计数；例如 `fleetAdmin` 在当前 src 没有调用者，仍一并迁移其兼容入口，避免将来使用时出现 Promise 放行。
- `src/app/api/agent/route.ts` 仅改 import 和 POST/PUT 的准入 await/503 分支，SSE 生命周期原样保留。`auth-login-limit.ts`、`/api/auth/login`、账务核心、上传内存实现、运行调度和父 workbench-client 未改。
- 跨切片整合提示：`src/app/api/supplier/apimart/[account]/callback/route.ts` 自身也是 82 点之一，仅有原限流 import/await/503 的必要窄 hunk；没有修改 account 校验、readBounded、enqueueCallback、202 回执或任何 apimart 适配/执行/恢复。父串行合并时保留并行供应商切片内容，不整文件覆盖。原生 reference-workbench route 也只迁移原 quote 限流，不动客户端或账务。

## 集中验证与证据层级

以下命令均在本工作树执行；完整输入、literal 输出、退出状态及四产物绝对路径收录 `output/a15/VERIFICATION.txt`。测试不读取 `.env`，child/npm/docker/rollback 环境按**大小写无关**白名单构造并保留 SYSTEMROOT。`npm ci --ignore-scripts --no-audit --no-fund` 仅安装本工作树依赖，未修改共享依赖。

| 命令 | 结果 / exit | 证据层级 |
|---|---|---|
| `node scripts/verify-rate-limit-baseline.mjs`（修改前） | 两进程 10 > 5；长短窗 `[true,true,true]`；0 | 原版实际进程 + 固定时钟 |
| `node scripts/verify-distributed-rate-limit.mjs` | PASS；0 | 两个真实 Node + 单独真实 PG；真实 route export + fixture 业务 I/O |
| `node scripts/verify-rate-limit-callers.mjs` | 82 awaited、78 immediate 503、4 typed-error 503；0 | 全 src AST / key-limit-window / 原超额分支 / 反向调用链 |
| `node scripts/verify-rate-limit-entry-gates.mjs` | 82 个实际 AST gate，246 个分支案例；0 | 所有准入 gate 的 deferred-await/准入/超额/后端故障 fixture |
| `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false` | 空输出；0 | 完整项目类型检查，4GiB 堆；不是 Next 运行验收 |
| `node scripts/verify-rate-limit-artifacts.mjs` | 全文件 hashguard、copyrollback、原行为恢复、源码保留修复；0 | 独立文件副本实际恢复与重跑原版反例 |

真实 PG 集中矩阵：

- 两进程共享 key：合计准入 5、拒绝 5，而非各放行 5；不同 key 各自 `[true,true,false]`。
- 200 次调用、2 进程、8 并发：总限额 37，准入 37、拒绝 163、基础设施错误 0。
- PG fixture schema 仅在测试库 shadow `clock_timestamp()`，生产源码无测试时钟分支；精确时刻 `1000000,1000900,1001000,1001001,1001900,1001901` 得到 `true,true,false,true,false,true`，验证滑窗、下边界包含及滚动释放。
- 长短窗口同存、同 key 不同 limit/window、重复调用、Node 重启后持久命中均通过。
- 真实行锁超时、占满原池并等待 checkout 超时、迟到连接归还、真实 TCP 黑洞、断连、恢复均验证；故障为 503，恢复后仍从 PG 判断，无 Map 放行。最终无借出连接或 idle-in-transaction。
- 真实 `/api/auth/forgot`、`/api/admin/login`、`/api/agent` POST/PUT、canvas workflow asset route 正常/原限额超额/真实 DB 锁故障分别为 200/429/503；Agent PUT 正常返回原 SSE final。拒绝后没有 mail/password/prompt/session/canvas fixture 业务副作用；agent/canvas 匿名 401、admin CSRF 403 保留。
- 此处认证/邮件/Agent 执行/画布业务 I/O 为隔离替身；执行的是实际 route 导出、Request/Response、实际限流与真实 PG，不声称真实用户登录、完整 Next 启动、真实模型质量或付费业务通过。
- 5000 过期 + 5000 未过期桶：清理 64，过期剩余 4936；索引/TID plan、锁住首 64 后删除 0、HMAC-only 存储、短日志无 key/IP/email/SQL/凭据通过。

测试中真实暴露并已修正的事项：首次完整 tsc 的 State 推断错误；首次 SSE fixture 把原 `final` 误写成 `done`；首次 cleanup plan 发现 Seq Scan。该 plan 断言失败时 fixture controller 的 finally 等待尚借出的 explain client，已按完整 PID 停止自有 controller，并核对完整容器 ID/label 后清理；harness 已补 finally 归还所有 controller 借用连接，后续完整运行通过。原失败日志保留，不将失败轮计为通过。

## 四产物、回滚与资源

四个真实文件（绝对路径前缀均为 `C:/Users/13357/.t3/worktrees/naumi/t3-d97efdad/`）：

1. `output/a15/MODIFIED_FILE.ts`：修复后 `src/lib/rate-limit.ts` 的逐字副本，主源码继续保持修复。
2. `output/a15/DIFF_FILE.patch`：整个 A15 task-only 切片的可读/可应用 diff，不只是单个 rate-limit 文件。
3. `output/a15/VERIFICATION.txt`：分支/字段、命令、输入、literal 输出、exit、恢复状态及最终 reopen 记录。
4. `output/a15/ROLLBACK.sh`：可执行 Git Bash 入口，调用旁边 `rollback.mjs` 和 `rollback-manifest.json`；仅接受带本包 marker 的独立副本，不回写活动工作树，不操作 DB/media。

回滚先预检**所有**目标 hash 和**所有**原始 payload hash，再开始写。最后一个目标被后续编辑、以及原始 payload 被损坏，两种故障均 exit 3、写入 0；保留后续编辑。正常副本恢复全部本任务旧文件、移除本任务新增文件，再重跑原版反例：合计 10/5 和长窗误清理均恢复。这是恢复原版行为的证据，不把恢复缺陷称修复成功。主工作树/`MODIFIED_FILE.ts` hash 仍是修复版本。

每轮最多一个独占本地 PG 容器：256MiB/1CPU，loopback 随机端口、tmpfs 数据、无宿主业务卷；容器 ID、镜像 ID、label、限额、停止移除及节点进程归零见 `RESOURCE_CREATED.json`、`RESOURCE_CLEANUP.json`、`RESOURCE_HISTORY.jsonl`。停止/移除都先核对完整 ID 和 label，不按名称模糊删除。所有本任务 PG 已清理；源码、验证证据与回滚副本保留供父整合。

## 部署前提、剩余项与下一步

- 本切片是本地代码和隔离证据，不是已合 main、已上线或 10 万活跃容量认证。父线程接续两份总台账的 A15 状态/编号，并串行整合固定 task-only commit。
- 新版蓝/绿实例必须指向同一站点的 PG database/schema，且 `SETTINGS_SECRET` 一致稳定；不同 DB/schema/secret 会形成不同状态域。检查既有池余量、建表/索引权限和真实请求延迟，不靠增加池或并发默认值代替验收。
- **旧版实例仍用自身 Map**。新旧混跑/旧槽回退期间没有全局原限额保证；新代码部署不可能让旧进程自动共享。由发布负责人按现行蓝绿/排空规则完成所有相关入口版本收敛，再等待既有最大窗口覆盖过渡，才可声称新版实例统一限流；不强杀在途任务、不重复执行付费请求。
- 无 DB 模式只保证一个 Node 进程（含该进程不同 bundle）；进程重启会丢本地额度，多实例无共享保证。它是原本可用的本地模式，不是生产共享后端故障的降级路径。
- 首次从旧 Map 切到 PG 无法导入所有旧内存命中；窗口扩大、secret 轮换也有历史/状态域过渡。按真实部署前提验收，不把新实例或回退旧镜像说成瞬间无缝承接旧额度。
- 尚未进行真实站点蓝绿、真实认证会话、完整 Next 多实例、业务峰值容量、生产 PG 执行计划/锁/连接池压力验证。47 HOLD 保留，45 笔外部报告完成待证、UNKNOWN/历史清理债保持父台账原状态。
- 未发现必须在本切片扩写的 auth/billing 事务缺口；此变更不更改受理状态、供应商重放、账务或 SSE 生命周期。后续性能/运营问题继续按独立事实与编号处理。


## 2026-10-30 父线程纠正与集中验收

父基线 `1ff8f39a0b2069b2f49e282efe1cbdfeb6e662de`，普通合入固定子提交 `652f4b07` 后修正独立审查P2。父只追加修改 `rate-limit-store.ts` 的回收调度及专属验证脚本，没有改原key/limit/window、82个准入gate、业务池配置或付费链路。

### 实现与事务边界
- `sweeping` 使用与既有state同一process级共享对象中的WeakSet，每pool至多一个回收占用者；一次准入至多一条64候选SQL，不在单请求循环扫积压。
- 删除满64的批次在COMMIT成功后保持due，让后续请求继续一批；未满才进入原60秒闲置冷却。没有流量不建常驻timer。
- 清理结果只有在COMMIT后发布；清理SQL或COMMIT失败，回收仍可重试，finally释放占用者。原异常/503与连接销毁协议保持。

### 本轮实际验证
- 原Map固定副本：两个真实Node进程准入10/原限额5；长短窗 `[true,true,true]`，exit0表示反例复现。
- 父新增真实PG持续到达矩阵：10步×200新key，1秒窗口，每步DB时钟+60001ms。原子候选最终1424桶/过期1224，exit1；父修改最终200桶/过期0，exit0。这里是本地固定到达fixture，不是生产吞吐或业务限额建议。
- 真实PG清理trigger报错、延迟constraint在COMMIT报错均整笔回滚，原进程下一次准入继续清理；并发46请求累计删除320，每批最大64、真实SQL区间重叠0，clients归还。
- 原完整真实PG/route矩阵同时重跑：两Node共享5/5、200请求37准入163拒绝、窗口边界、重启、锁超时、checkout、线缆黑洞/断连、auth/admin/agent/canvas 200/429/503、CSRF/401、SSE和业务无副作用均通过。普通连接握手黑洞及生产WAL/池压力仍是原集成待证范围，没有把它们写成实测通过。
- 82调用AST与参数/await核验通过，246 gate分支通过。全项目 `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false` exit0、stdout/stderr为空；同时覆盖本轮工作台组件修改，没有另跑第二遍全类型检查。
- 父只在隔离fixture测试A15；**线上仍为b79c8c39，本切片没有上线**。新旧Map/PG混跑不具备统一额度保证，发布时仍需整站同版收敛。

精确命令与记录：`output/capacity-audit-wave2-20261029/a15-parent-20261030/{NATIVE_COMMANDS.json,REGRESSION_COMMANDS.json,VERIFICATION.txt}`；75文件回滚、全量预检和原Map行为复验在 `output/a15/`，源快照ZIP与DIFF保持父修改。
父首次误用baseline脚本默认root跑到当前修改源码，长窗断言如实失败；改为固定原Git对象的独立副本后复跑，初始日志保留，未改变断言。自有两轮PG完整ID均清理，后续副本回滚及资源总核在证据中追加。
