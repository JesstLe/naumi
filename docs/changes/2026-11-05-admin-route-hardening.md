# P0 后台敏感接口加固（2026-11-05）

依据：[管理后台架构评估](../design/admin-architecture-review-20261105.md) 第 2 节 S2—S4。基线 main `97cb93c9`。

用户决定：两站管理员密码暂不修改；本轮不改变登录方式。

## 本次实现

- **统一同源校验**：新增 `src/lib/request-origin.ts`。原先 BI、计费、团队三处各自实现的逐字相同的同源判断，改为调用这一个函数，行为不变。
- **后台写操作入口守卫**：新增 `src/lib/admin-mutation.ts` 的 `authorizeAdminMutation(request, scope, limit)`，依次检查平台管理员身份、浏览器同源、按"操作人 + IP + 范围"限流（默认每分钟 60 次）。
  - 只决定"这个请求能不能写"，业务规则仍由数据所属模块负责。
  - 接入的接口：users、artworks、owner-account（每分钟 10 次）、prompts、templates PATCH、templates/cache、templates/sync、tryon、brand-logo、smtp-test（每分钟 10 次）。
- **账号安全规则**：新增 `src/lib/accounts/change-policy.ts`。旧用户管理接口和作品页的封禁入口在写入前统一执行以下规则，规则内容与 BI 用户管理一致：
  - 不能在后台修改自己的账号（封禁、改角色、删除、重置密码）；
  - 有效管理员必须先降权，才能封禁或删除；
  - 不能撤销最后一个有效管理员。
- **管理日志**：新增 `src/lib/bi/management-log.ts`，写入现有的 `app_bi_management_log` 表，在"系统与审计 → 管理日志"中可以查看。
  - 记录的操作：旧用户接口的全部写操作、作品删除与封禁、站长账号设置。
  - 日志只记录事实，不记录密码，备注只记长度。
  - 旧仓储函数不在同一个事务内，所以日志在写入成功之后追加；追加失败只写服务端日志，不把已经完成的修改改报为失败。
- **站长账号改绑**：配置了后台访问密码时，必须重新输入当前后台密码（错误码 `ADMIN_REAUTH_REQUIRED`）。GET 接口返回 `reauthRequired`，设置面板在需要时显示确认密码输入框。
- 管理日志新增中文操作名：删除账户、修改备注、封禁/解除封禁 IP、站长账号设置、删除作品。

## 公共接口、依赖与数据归属

- 依赖方向：路由 → `admin-mutation`（入口守卫）→ `admin-auth` / `rate-limit-http` / `request-origin`。账号规则归 accounts 模块；日志表归 bi 模块。没有新增数据库表或迁移。
- 兼容性：
  - 不带 Origin 的服务端调用继续放行，这与原有行为一致；
  - 同源浏览器请求不受影响；
  - 跨站请求返回 403；
  - 超过频率返回 429。

## 验证（本机隔离 PostgreSQL 16，127.0.0.1:55439；零外网、零供应商调用）

- 新增 `npm run verify:admin-route-hardening` → `ADMIN_ROUTE_HARDENING=PASS`，覆盖：
  - 同源规则；
  - 账号规则的纯函数用例；
  - 旧用户接口的跨站、匿名、自我保护、管理员降权顺序、最后管理员保护；
  - 日志顺序及不含密码和备注原文；
  - 作品页封禁共用同一规则；
  - 其余 7 个接口的跨站与匿名拒绝；
  - smtp-test 第 11 次请求返回 429；
  - 站长改绑的缺少密码、密码错误、跨站、匿名、正确五种情况及日志。
- 回归通过：`verify-admin-access`、`verify-bi-management`、`verify-billing-api`、`verify-team-subaccounts`、`verify-single-product`、`verify-admin-settings-refactor`；`verify-team-access-lifecycle` 在新建的空库上通过（在已初始化过的库上会报"表已存在"，属于脚本对库状态的要求）。
- `tsc --noEmit` 和改动文件的 eslint 均通过。
- 与本次无关的既有失败：
  - `verify-rate-limit-callers.mjs` 断言 `src/app/api/comfyui/run/route.ts` 的 429 响应体（该文件未改动，main 上同样失败）；
  - `verify-rate-limit-entry-gates.mjs` 依赖不进 Git 的 `output/a15/CALLER_INVENTORY.json`。
- 证据层级：本机隔离数据库的路由级验证；**未构建镜像，未发布到任何服务器**。

## 交接

```text
模块与职责：后台写操作入口守卫（admin-mutation）、账号安全规则（accounts/change-policy）、管理日志追加（bi/management-log）。
公共接口、依赖方向、数据/状态/事务归属：authorizeAdminMutation / assertAccountChangeAllowed / appendManagementLog(AfterChange)；路由→守卫→鉴权/限流；账号规则归 accounts，日志表归 bi；无 schema 变更。
本次实现与迁移状态：P0 中的 10 个接口已接入；其余后台接口在 P2 统一包装时迁移。旧用户接口的规则检查与写入不在同一事务，存在极小的并发窗口，BI 用户管理是事务内的版本。
验证命令、结果及证据层级：见上；本机隔离库路由级通过，未发布。
未完成项与下一步：P2 把全部后台接口迁到统一包装，并让审计与写入同事务；下一步做 P1-a。
```
