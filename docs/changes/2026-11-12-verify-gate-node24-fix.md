# Node 24 验证门禁修复（2026-11-12）

## 模块与职责

仅修复验证脚本的子进程启动与浏览器定位，不修改 `src/`、Worker 实现、依赖版本或业务断言。任务分支 `codex/verify-gate-node24-fix` 从刷新后的 `origin/main` **21b7edfd7b483b60904e1f35ce81208c606f478a** 建立。环境为 Windows、Node **v24.19.0**、npm **11.17.0**、tsx **4.23.15**，本 worktree 独立执行 `npm ci`。

## 调研结论与实现

### 1. model-health：tsx CLI 的参数边界

`server-only@0.0.1` 的 `react-server` 条件导出为空模块，默认导出主动抛错。原 spawn 把 `--conditions=react-server` 传给启动 tsx CLI 的外层 Node；tsx 创建实际执行 TypeScript 的进程时，这个外层 `execArgv` 条件未被保留。

同一条 `import 'server-only'` 的最小复现：

```bash
node --conditions=react-server node_modules/tsx/dist/cli.mjs output/server-only-node24-repro.ts
# exit 1: This module cannot be imported from a Client Component module.
node node_modules/tsx/dist/cli.mjs --conditions react-server output/server-only-node24-repro.ts
# exit 0: SERVER_ONLY=PASS
node --conditions=react-server --import tsx output/server-only-node24-repro.ts
# exit 0: SERVER_ONLY=PASS
```

修复 `scripts/verify-model-health.ts`：将条件参数移到 tsx CLI 路径之后，继续使用 `process.execPath` 和本地依赖，无 npx 下载、shell 转义或全局 `NODE_OPTIONS` 污染。保留 **4 个独立进程**、持久化共享 claim 与每日 12 次预算断言，未单进程化或削弱并发验收。这是当前环境实际复现，不声称其他 Node 版本已经验证或只有 Node 24 存在问题。

### 2. worker-handoff：Windows 强杀不是优雅 SIGTERM

基线单测本次 25/25 通过；失败精确落在 `verify-worker-handoff.mjs:57:82` 的 `held.destroyed === false`。Windows 的 `child.kill('SIGTERM')` 强制结束子进程，被保留的 HTTP 响应随之断开；`exitCode === null` 单独不足以证明子进程仍活着，因为被信号终止时它也可能为 null。此路径没有加载 `server-only`，与 model-health 不同源。

修复 `scripts/verify-worker-handoff.mjs`：

- Windows 启动真实 Worker 时启用它已有的 `NAUMI_WORKER_PARENT_START=1` 和 IPC 通道，等待带随机 id 的原生 `naumi-worker-gate-ack` 后再继续。
- Windows 用父 IPC disconnect 触发现成 `stop`/`shutdown`；POSIX 保留真实 `SIGTERM`，不修改 Worker 实现或新增测试专用业务接口。
- 保留在途响应不被中断、崩溃持久化 UNKNOWN、拒绝 resume、只读 reconcile、重启保持暂停和不重放的原断言。
- 增加 `signalCode === null`、正常 exit 0 及 `WORKER_TICK_DRAIN=COMPLETE` stdout 回执核验；超时附带实际退出状态与 Worker 输出。
- Windows IPC 场景以 `exit` 观察退出，单独等待 stdout 回执；诊断中曾出现 exitCode=0 且 COMPLETE 已输出而 `close` 事件未到，未将 `close` 用作进程退出判据。

单测额外重复 5 轮共 **125 项全通过**，没有为未复现的单测失败修改 runtime 或放宽断言。POSIX 分支本轮未在 Linux 实机运行。

### 3. UI 门禁：独立 fixture 与重复按钮定位

`verify:model-health` 不写 UI 的 `fixture.json`。真正的创建入口是 `scripts/model-health-ui-fixture.ts`，它建立独立 schema、Next dev 与本地供应商 HTTP fixture。先运行该入口，再执行 UI 门禁。

真实浏览器联测进一步复现：当前 main 新增通道容量面板后，全页有两个名为“刷新”的按钮，原测试在第 31 行发生 Playwright strict mode violation。仅修复 `scripts/verify-model-health-ui.mjs`，用包含“模型健康巡检”标题的 header 限定刷新按钮；保留全部 UI/预算/冲突/暂停/核查断言，并自行建立截图输出目录。没有修改页面、样式或业务代码。

第一次冷启动在并行类型检查/编译期间等待模型标题超时，记录在 `logs/ui-cold-start-failure.log`；随后的暖启动明确复现定位冲突，脚本修复后完整通过。未靠提高超时或忽略 pageerror 获得 PASS。

## 公共接口、依赖方向与状态归属

调用关系仍为验证脚本 → 原 Worker / 原 health repository / 原 HTTP 页面，生产 API 和运行协议均不变。数据库仅本机 `127.0.0.1:55479` 的 fixture 库，schema 按原 fixture 创建并删除；4 进程保留同一 schema。UI 两次模型调用都是本地 HTTP 模拟，外部供应商调用 0。未连接服务器、未占部署锁、未发布。

## 集中验收与证据层级

DB 命令统一使用：

```bash
export NAUMI_VERIFY_ISOLATED_DB=1
export DATABASE_URL='postgres://fixture:fixture-local-only@127.0.0.1:55479/fixture'
```

| 命令 | 本轮实测 |
| --- | --- |
| `npm run verify:worker-handoff` | exit 0；单测 25/25；`WORKER_HANDOFF_PROCESS=PASS`，`CALLS=2_FIXTURE`，`NO_ABORT_ON_DRAIN=YES`，`NO_REPLAY=YES` |
| `npm run verify:model-health` | exit 0；`PASS four independent Node processes share one running claim and persistent 12-call budget`；末尾 `MODEL_HEALTH_FIXTURE=PASS; EXTERNAL_SUPPLIER_CALLS=0` |
| `npx tsx --conditions react-server scripts/model-health-ui-fixture.ts` 然后 `npm run verify:model-health-ui` | UI exit 0；1440/390、Worker tick、冲突/暂停、reconcile 均 PASS；`PAGE_ERRORS=0`；本地模拟调用 2，外部调用 0 |
| `npx tsc --noEmit` | exit 0，0 错误 |
| `npm run verify:billing-pending-view` | exit 0，exposure / pending view / capacity detail / budget reset 四项 PASS |
| `node --test scripts/test-worker-runtime.mjs` 重复 5 次 | 5 轮 exit 0，共 125 项通过 |

UI fixture 已通过自身 `/stop` 入口停止；Next 自动改写的 `tsconfig.json` 已恢复，不作为任务修改提交。以上是本地真实子进程、HTTP、浏览器和隔离 PostgreSQL 证据，不等同 GitHub CI 或线上验收。

## 回滚与可复核材料

证据目录：`C:/Users/13357/.t3/scratch/2026-11-12-verify-gate-node24-fix/`（独立于待删除 worktree）。

- 修改副本 `MODIFIED_FILE.mjs`（修复后的 handoff 脚本）；完整三脚本副本在 `modified/scripts/`。
- 差异 `DIFF_FILE.patch`。
- 验证账本 `VERIFICATION.txt`，含 BASELINE/MODIFIED/ROLLBACK 命令、输入、字面输出和退出码；完整日志在 `logs/`。
- 可执行 `ROLLBACK.sh`，只接受带 `.naumi-verify-rollback-fixture` 标记且当前内容符合原始/修复 hash 的独立副本，不操作业务库或默认覆盖仓库。

原始字节保存在 `original/scripts/`，SHA-256 对照在 `hashes.json`。在另一份 `rollback-copy` 先放修复文件，再执行：

```bash
bash C:/Users/13357/.t3/scratch/2026-11-12-verify-gate-node24-fix/ROLLBACK.sh \
  C:/Users/13357/.t3/scratch/2026-11-12-verify-gate-node24-fix/rollback-copy
# exit 0: ROLLBACK_FILES=RESTORED ORIGINAL_BYTES=YES
```

恢复后 Worker 门禁重新 exit 1 并在 `:57:82` 报 `true !== false`，model-health 重新 exit 1 并在四进程步骤报原始 `server-only` 错误；三文件回滚 hash 全等于原始 hash，修改副本仍保留修复状态。未来需在原始副本重跑测试时，先独立 `npm ci`。

## 主线整合与下一步

验收完成后再次 fetch `origin/main`，在本任务 checkout 的 detached 集成点普通 merge 后推 `HEAD:main`，不切换/更新其他 checkout 的本地 main，不强推。提交与清理的实际 SHA、远端回读及本任务分支/worktree 删除结果由最终 `VERIFICATION.txt` 记录。

本轮是测试基础设施闭环，不触发服务器发布，功能迭代/成功发布计数不增加；生产 Worker 与 `src/` 保持不变。
