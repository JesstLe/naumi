# Node 运行时与普通业务 PG Client 生命周期

## 本轮边界与基线

- 工具提供的独立 worktree：`t3-dc2b25e9`，分支 `t3/runtime-client-lifecycle-audit`，基线 `3b6a5279b4364590954751e8f5b5c9d566010806`；fetch 后 `origin/main` 同值。
- 本轮只修改 `src/lib/db/connection.ts` 的普通业务池、`src/lib/reference-workbench/repository.ts` 的既有事务封装，以及本轮验证脚本/本文。`db.ts`、billing、image-job-repository、durable-image-jobs、storagecodec、canvas、共享 main 和总台账均未改动。编号由父线程统一分配。
- 本地源码/fixture 工作，不发布、不 SSH、不操作生产实例或业务库、不调用供应商。47 运行版本仅继承任务给定状态，本轮未读取或变更。45 笔手术、在线索引继续由原任务挂账。
- X3 tick 与父 heartbeat 的 listener/连接修复已在基线，不作为本轮新发现。

## 模块与职责

- `db/connection.ts` 拥有进程级 pool 的创建、配置冻结、模块重载复用和排空关闭；公开 `getPool()` API 与原生 `Pool/PoolClient` 的 Promise/callback 行为保持。业务事务、SQL、重试和提交结果不属于连接层。
- `reference-workbench/repository.ts::transaction` 拥有工作台单个事务的 BEGIN、advisory xact lock、callback、COMMIT/ROLLBACK 与 release；公开 callback 仍收到同一个 `PoolClient`，跨模块传入事务不拆连接/事务。
- 依赖保持仓储 → 连接基础设施 → pg；不引入通用事务框架、不更改池默认值或连接预算。

## 已复现的因果链

### 普通业务连接未处理 error 导致进程退出

真实本地 PostgreSQL 16 + Node v24.19.0 + pg 8.20.0。测试只通过本轮 admin 连接终止当前子进程刚借出的 backend；子进程没有 `uncaughtException` handler，也没有测试注入的 Client/Pool error listener。

pg-pool 在 checkout 时移除自身的 idle error listener。基线普通业务池既没有新连接的 error handler，也没有 pool 的 idle error handler。因此：借出后无查询期间、空闲回池后、排空关闭期间、执行中 query backend 断开这四种情况，原生 Node 子进程均 exit 1，stderr 含 `Unhandled 'error' event`。正常业务失败、正常并发/回收则通过；这不是容量数字不够或 V8 heap 不够。

修改在物理连接 `connect` 事件绑定一次永久 error listener，涵盖借出、迟到借出、归还和关闭的事件间隙；Pool error 也有 listener。一个局部 `WeakSet<Client>` 为同一坏连接的重复 error 去重，只输出固定短日志。没有提前 release、没有重试 SQL/付费任务、没有改变 query rejection；pg 自己在 finally release 时淘汰 non-queryable client。

### 工作台 ROLLBACK 异常覆盖原异常

先仅修连接 handler，再跑原仓储作为中间对照：真实事务中终止自己的 backend，原 SQL 错误 `57P01` 被 ROLLBACK 的 `Connection terminated unexpectedly` 覆盖，`preserved=false`。这是独立于 Node 崩溃的真实回滚边界问题。

仓储改为尽力 ROLLBACK；回滚失败记录固定短日志、标记 `discard`，finally `release(true)`，随后仍抛同一个原异常对象。正常回滚 `release(false)` 复用原健康 backend。修改对照已观察到 `original=57P01 preserved=true`，坏连接数归零、下一连接可查询。

## 辅助审计：内存、日志、heap

- 新 handler 不保留 error、query 参数或 snapshot，不 stringify Client；WeakSet 不强持有连接，100 次 checkout/callback 和 25 次模块重载检查 listener 数不增长。
- 固定 fixture 的原业务 Error 携带 1 MiB snapshot 标记，修改版 stdout/stderr 检查不存在该标记、连接 URL 或 fixture 密码标记；不是生产日志全量脱敏证明。
- `scripts/runtime-memory.cjs` 仍为显式 opt-in 的 libvips 限额；`Dockerfile` 使用 Node 24。发布控制器现有 reviewed memory profile 区分 V8 heap 与 native reserve。这里只读源代码，不读取当前容器配置，不调整 heap/图像品质，也不把 PG 断连崩溃误判为 OOM。

## 验证状态

- 首次完整真实 PG 基线 7 组已跑：5 个故障子进程 exit 1，2 个正常子进程 exit 0；控制器正确识别预期失败，exit 0。原始证据保留。
- connection-only 中间对照 7 组已跑：子进程全 exit 0，原仓储的 `preserved=false` 已确认。
- 两源码修改后 9 组真实 PG/子进程初验已跑：4 类断连、仓储回滚失败、正常成功/业务异常/SQL 异常、共享事务隔离、100 次 callback 复用、并发/重载/迟到归还/关闭；均 exit 0。
- 首次 harness 错误保留：清洁环境中 Docker context 路径缺失，改为显式本机 named pipe；PG readiness 初版误用初始化临时 Unix socket，改为 TCP readiness；baseline 预期补入真实复现的仓储崩溃。它们不记为产品缺陷。
- 类型验证初轮修正本轮 `Client` → `PoolClient` 标注；全项目基线副本首次漏复制 services/定价 JSON，补齐同一 worktree 的跟踪文件后再对照。最终原版与修改版均 exit 2，**36 项诊断逐字相同**：共享只读 node_modules 缺 `three`/相关类型且 React 类型与项目版本不齐；本轮不改共享依赖。连接模块独立 strict tsc exit 0。没有称全项目类型绿。

## 最终固定验证与四产物

2026-10-29 本轮重新实测（不是继承历史 PASS）：

| 验证 | BASELINE | MODIFIED | ROLLBACK 副本 |
| --- | --- | --- | --- |
| 借出/空闲/关闭中/执行中 backend 断开 | 4 个子进程 exit 1，unhandled error | 4 个 exit 0，原查询仍失败、坏连接被剔除/可继续查询 | 恢复 4 个 exit 1 |
| 工作台回滚失败 | 原版子进程 exit 1；connection-only 对照 exit 0、原异常被覆盖 | exit 0；`original=57P01 preserved=true`、`discard=true` | 恢复原版 exit 1 |
| 成功/业务异常/SQL 错误、共享事务、callback 复用、并发/重载/归还/关闭 | 4 组 exit 0 | 4 组 exit 0 | 4 组 exit 0 |
| 控制器 | `SUITE=PASS cases=9`，exit 0（预期失败复现成立） | `SUITE=PASS cases=9`，exit 0 | `SUITE=PASS cases=9`，exit 0（原行为恢复） |

- 20 个并发事务，25 次模块重载，100 次 callback 借出/回收；健康 backend 复用、error listener 不增长、回滚后 PostgreSQL state=idle、pool waitingCount=0、全部归还、关闭后下一代可建连。
- 新增日志只有 `[database] connection lost` 与 `[reference-workbench] transaction rollback failed`；连接级日志按坏物理连接去重。修改版每个子进程 stderr 小于 512 bytes，未出现 fixture 密码标记/URL/1 MiB snapshot 标记。RSS/heap/external 为每个子进程启动采样，记录在 JSON，不是峰值/容量结论。
- 本轮 `node --test scripts/test-runtime-memory.cjs`：4/4，exit 0（本地 Node/libvips）；`node --test scripts/test-worker-runtime.mjs`：25/25，exit 0（既有 Worker 单元回归，不计为新修复）。
- 每轮 fixture 都使用随机独占 localhost 端口、唯一 `io.naumi.runtime-clients` label；结束验证自己的 label 后移除自己的容器。固定三轮 label 分别为 `runtime-clients-992b592b`、`runtime-clients-923507e5`、`runtime-clients-000957ee`，均记录 `FIXTURE_REMOVED=1`。最终矩阵及回滚轮同步移除自有匿名数据卷，前期失败运行保留原证据。
- Windows 子进程白名单大小写无关保留 SYSTEMROOT；不读取 dotenv、生产 DATABASE_URL 或凭据。依赖经本 worktree `node_modules` junction **只读复用**，不安装/写入父树依赖。Docker 明确使用本机 named pipe，不继承远端 context。

产物目录：`C:/Users/13357/.t3/worktrees/naumi/t3-dc2b25e9/output/capacity-runtime-clients/`

1. `MODIFIED_FILE.zip`：两份修改源码及 hash manifest；解压读取后与修复源码逐字节 SHA-256 对上。
2. `DIFF_FILE.patch`：这两份源码的原版 → 修改版差异。
3. `VERIFICATION.txt`：分支/基线、改动字段、四路径、原/改 hash、各阶段完整 command/cwd/input/stdout/stderr/exit 及证据层级。
4. executable `ROLLBACK.sh`：仅接受同产物目录下带 marker 的 `rollback-copy`/`guard-copy`。先验证所有目标修改 hash 和原件 hash，全部成功才写。普通源目录被拒绝，exit 73、`WRITES=0`。

仅副本回滚：2/2 原 hash 恢复，9 组原行为恢复；guard-copy 第二个文件加入 later edit，exit 73、两文件 hash 不变、`WRITES=0`；真实修复源码 2/2 修改 hash 保持。所有四产物已重开检查。`ROLLBACK.sh` 在 Git Bash `test -x` 返回 0，真实执行返回 0。

原/改 SHA-256：

| 文件 | 原 hash | 修改 hash |
| --- | --- | --- |
| `src/lib/db/connection.ts` | `9440e8f536fb009080557ca245a9b88eec5eea0b5353563225ff4d19d2ccb71f` | `6674fe4757a6b4b334ca88ac4bfca4dbf2eb8ee72ed28a16c04b6c5ec24c9652` |
| `src/lib/reference-workbench/repository.ts` | `7f5a284ab497a53a228252501d869b7d179e19c662c3e48e03d4feeef99fda33` | `c6ab10a152b576a1cc35065282a712b4d00ffac68ea7db504dd7b561cd50faba` |

可重复主命令（在本 worktree 下；每个命令自建自清理真实 PG）：

```powershell
node scripts/verify-capacity-runtime-clients.cjs --source output/capacity-runtime-clients/baseline --expect baseline --output output/capacity-runtime-clients/new-baseline
node scripts/verify-capacity-runtime-clients.cjs --source . --expect modified --output output/capacity-runtime-clients/new-modified
& D:/DEV/Git/bin/bash.exe output/capacity-runtime-clients/ROLLBACK.sh --copy-root output/capacity-runtime-clients/rollback-copy
node scripts/verify-capacity-runtime-clients.cjs --source output/capacity-runtime-clients/rollback-copy --expect baseline --output output/capacity-runtime-clients/new-rollback
```

注意当前 `rollback-copy` 已恢复，重复 APPLY 会因非修改 hash 而 guard；精确已执行绝对参数、literal 输出与 exit 以 `VERIFICATION.txt` 为准。

## 未完成项与接口建议

- `db.ts` / billing 及其他模块自己的 `catch { await ROLLBACK; throw original; }` 由各所有者另行验证；本轮不批量改写、不把静态相似代码算作新 bug。可复用的接口约定是：保留原异常，ROLLBACK 失败销毁该借出连接，不吞 error、不重试未知提交。
- `closeDatabasePools()` 仍要求调用者先排空请求；本轮验证关闭围栏、已借出连接可结束、归还后完成关闭，没有把 drain 改为强杀活动事务。调用者已放弃且永不消费/归还的 Promise 不通过全局超时框架补救。
- 本轮真实边界为本机 PostgreSQL/Node 子进程与实际仓储函数，仓储 `ensureSchema` 被替换为 no-op 后运行真实工作台 DDL；不是全应用数据库 bootstrap、HTTP、浏览器、生产负载/容量或线上验收。
