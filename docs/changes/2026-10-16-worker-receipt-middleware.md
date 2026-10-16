# Worker receipt GET：真实 Middleware 整合修复

## 候选与发现

真实整合候选 `9138b0ab316e768802db96f26214a3115bb56e9a` 的 App/后台/Agent/Next 112 项、Worker receipt 59 项、boot 15 项及完整 TypeScript 均通过，但进一步检查发现 **route 级测试遗漏真实 middleware**：Worker 只读 GET 回执虽然通过自身 worker 鉴权，却先在 middleware 被当作未登录视频用户返回 401，真实 runner 的 reconcile 无法到达 route。

实际 Next15 dev 使用逐字复制的业务 `src/middleware.ts` 与 `src/app/api/video/worker/tick/route.ts`，保留实际 feature gate、账号验证与 DB 模块；不是固定 actor middleware 或直接调用 route。9138 原 middleware 重现合法 worker GET401，原 POST 豁免不受影响。

## 修改

`src/middleware.ts` 新增 `workerReceiptRead`，仅同时满足下列条件时进入既有 timing-safe worker-secret 验证分支：

- 方法严格为 GET；路径严格为 `/api/video/worker/tick`。
- query `tickId` 为完整 UUID 格式。
- `x-video-worker-secret` 与服务端既有 Worker secret 精确匹配。

验证通过只跳过普通用户 feature gate，不跳过 receipt route 的完整 Worker boot/instance/commit/目标 Web 身份与 query/header UUID 一致性检查。缺或坏 secret、缺/坏 UUID、其他视频 GET 维持原用户鉴权。原 POST 白名单不增加、不扩大；不新增收费操作、schema 初始化或扫描逻辑。

## 集中验收

新增 `scripts/verify-worker-tick-middleware.ts`：仅允许明确开启隔离模式，且 DATABASE_URL 精确为本任务 127.0.0.1:55438/release_fixture。只运行本地专用 PG 和 Next fixture，受测 receipt 表在结束清除；不使用线上账号、密钥、供应商或业务库。

- BASELINE：真实 Next 的原 9138 middleware，6 项验证，合法 worker GET401，在 receipt route 前被拦截。
- MODIFIED：24 项通过。真实 Next middleware→原 receipt route，缺表 GET503 且没有创建 receipt 表；已完成原 UUID GET200；坏 secret401、其他 GET401、缺/坏 query401；query/header 不一致400、完整缺失 UUID404、错误目标409、缺受控头400。重复已完成 POST返回 duplicate，未扫描。
- 真实 `WorkerRuntime` 接受 synthetic tick 后响应丢失→UNKNOWN→重启→通过真实 HTTP GET/middleware/route 核对原完成回执→QUIESCENT，但仍 `paused=true`，保留原 worker boot；不通过 POST 重发或清空 UNKNOWN 伪造完成。
- 修复后集中复跑原 App37 + 后台30 + continuation17 + 边界18 + Next10 = **112 项**；Worker receipt **59 项**、boot **15 项**、完整 TypeScript 退出0。
- 复制回滚：另一份 middleware 副本实际恢复原 Git blob SHA256，并在真实 Next 恢复相同合法 worker GET401 行为；修改版业务文件保持新逻辑。

命令前置：`NAUMI_VERIFY_ISOLATED_DB=1`、`DATABASE_URL=postgresql://postgres:fixture-only-local@127.0.0.1:55438/release_fixture`。新增验证命令：

```powershell
node node_modules/tsx/dist/cli.mjs --conditions=react-server scripts/verify-worker-tick-middleware.ts
```

字面结果：

```text
WORKER_TICK_MIDDLEWARE=PASS CHECKS=24 ACTUAL_NEXT_MIDDLEWARE=YES ACTUAL_ROUTE=YES COMPLETED_GET=200 BAD_SECRET=401 OTHER_GET=401 GET_DDL=NONE DUPLICATE_POST=NO_SCAN REAL_SUPPLIER_CALLS=0
```

`GET_DDL=NONE` 只指此 receipt GET 不创建回执表，不把现有用户权限模块的通用 schema 行为写成新保证。

## 证据与发布状态

`E:/Workspace/naumi-release47-app-drain-20261016/output/integrated-regression-9138/` 保存逐项日志、命令、原 blob、SHA256 manifest 及四件：`MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。rollback 目标硬编码为证据目录内的 `rollback-copy.ts`，不修改共享源码或生产数据；恢复旧程序也不能删除既有回执或 UNKNOWN 状态。

专用 PG `naumi-release-app-drain-pg-20261016`：192MiB/1CPU，仅本任务启动并在结束停止。真实供应商调用0，未连接服务器、未部署或切流；root 需以此修复重新固定候选并构建。receipt 完成仅证明该扫描 tick，不证明 App 的 detached promise 或全部业务任务排空；既有 `acceptedTasks=null`、`agentSessions=null`、partial 覆盖保持。
