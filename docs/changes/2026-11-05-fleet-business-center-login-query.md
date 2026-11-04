# 管理中心登录返回查询参数保持

## 模块与调研结论

- PR #11 审查 `4473970603` 指出 `87d9502e` 的显式管理中心入口只把 `section` 传给 `requireAdminPage`。未登录访问 `section=users&detail=local` 时，实际登录重定向丢失 `detail`，登录后变成 Fleet 用户视图；`tenantId`、`q`、站点、视图及重复值也会丢失。
- 职责属于 `src/app/admin/center/page.tsx` 的登录返回目标组装。既有 `requireAdminPage` 负责鉴权和重定向，`adminDestination` 负责内部路径限制，业务入口 helper 负责本地/Fleet 归属；无需改变这些公共契约。
- 本次基线：`87d9502e2e1cc3601b3d6923beb6f5605728b920`，分支 `codex/fleet-business-data-103-20261104`。开工已刷新 `origin/main=ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`，未把整条重构线合 main。

## 实现与迁移状态

- 显式合法 `section` 或存在 `site` / `view` 时，以 `URLSearchParams.append` 编码全部原查询键值，不使用参数白名单，不折叠数组值；保留同一键的重复顺序、空字符串，跳过 `undefined`。
- 返回路径固定为 `/admin/center`。没有显式分区或 scope 时仍传裸 `/admin/center`，不制造 `section=overview`，也不把裸本地入口升级成 Fleet。
- 页面分区、本地详情优先级、全局认证规则、返回路径 allowlist 和 usage 页均未修改。此切片不迁移、复制、写入或合并业务数据及钱包账务。
- 原始字节和 SHA-256 在首次写入前存于 `output/fleet-business-center-return-20261105/original/` 与 `ORIGINAL_HASHES.json`；修改文件限定页面、既有验证 runner、本记录三个路径。

## 验证与证据层级

执行目录：`E:/Workspace/naumi-fleet-business-data-103-20261104`。

```powershell
node scripts/verify-fleet-business-usage-entry.mjs --baseline=87d9502e2e1cc3601b3d6923beb6f5605728b920 --output-dir=output/fleet-business-center-return-20261105/tests/baseline
node scripts/verify-fleet-business-usage-entry.mjs --output-dir=output/fleet-business-center-return-20261105/tests/modified
node node_modules/eslint/bin/eslint.js src/app/admin/center/page.tsx
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
```

- 扩展既有 runner，实际执行两份 async Next 页、入口/导航/BI 模块以及真实 `requireAdminPage`、`adminDestination`；只在认证决策、Next headers/navigation 和显示组件边界使用有限替代。
- 12 组登录案例独立核对 caller 目标、实际内部 Request、`/admin?next=`、解码后的全部键值及 `getAll` 顺序，再把返回参数送回实际页面，检查本地/Fleet owner 与分区。覆盖本地详情、原生筛选、重复筛选/scope、空值、缺省值、未知参数、中文及特殊字符、native-only 分区、裸入口和未配置认证；保留既有导航与拒绝认证用例。
- 基线已复现：`assertions=376 failures=60`，exit 1；包含 `detail=local` / `tenantId` / `q` 丢失后的真实页面归属改变。修改后、lint、类型检查及副本回滚的确切结果记录在本轮 `final/VERIFICATION.txt`，完成后补记于下节。
- 这是实际模块执行加有限 I/O 的本地证据，不是 Next HTTP、真实 cookie 登录、数据库、浏览器、GitHub CI 或线上验收。

## 完成记录与未完成项

- 本轮修改后集中验证：`assertions=376 failures=0`、exit 0；页面 focused ESLint、全库 TypeScript、`git diff --check` 均 exit 0。副本回滚原始字节校验、恢复后 `376/60`、later-edit 零写拒绝以及缺源无 fallback 的完整执行回执统一保存在 `final/VERIFICATION.txt`。
- 四份交付产物位于 `output/fleet-business-center-return-20261105/final/`：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。回滚仅针对指定独立 rehearsal 副本，先校验全部修改文件和必要未变依赖；任一 later edit 拒绝且零写，实际工作树保留修复。
- 该提交的 CI/review 需按新 SHA 独立核对。父提交三项 Actions 的失败为账单/支出门禁（job 未启动、steps=0），不是已执行测试的失败；不改账单、阈值或反复重试。
- docstring 覆盖告警及共享命令队列的生产闭包仍独立跟进；本轮不将其标为完成。公共 `business.query` admission 硬性关闭，`PREPARATION ONLY / HOLD` 不变；无合 main、103/47 发布、SSH、生产 SQL、permit 发行或任务重放。
