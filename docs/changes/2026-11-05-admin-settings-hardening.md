# 系统设置写接口加固（2026-11-05）

基线：`1c0781b727d9fff63a3d3d9fa674df529ea7f8cc`。分支：`codex/admin-settings-hardening-20261105`。本任务按明确边界仅提交，不 push、不合并、不发布。开工已读根目录规则、协作文档、[评估 S1–S5/A3](../design/admin-architecture-review-20261105.md) 和 [P0 加固记录](2026-11-05-admin-route-hardening.md)，并 fetch origin/main（当时 `b2e7ad025a7c2123c101f63850d37df73973302a`）；没有整合后续主线。

## 调研与实现

- POST 首先调用 `authorizeAdminMutation(request, "settings", 30)`，复用管理员、同源和操作人/IP/范围每分钟 30 次守卫。GET 原鉴权和响应不变；其他路由未改。
- `settings/mutation-schema.ts` 统一严格校验原有请求字段，拒绝未知字段、错误类型、非有限数值及非法 SMTP 端口；保留空字符串清除/跳过、显式 false、注册赠送积分截断与夹取等原规则。未按猜测新增 URL、邮箱或密钥格式限制。
- 模型管理锁先于旧模型字段内容校验，保留 409、`MODEL_CONFIG_MANAGED` 和 managementPath。初次回归发现 cutoutBackend 先返回 400，已修正并复测通过。
- 校验全部 RSA 密文（包括被优先级覆盖的输入），请求内缓存明文；解密仅读取已有私钥，不通过 ensureKeypair 写入新密钥。保留 RSA-OAEP SHA256 的分块传输能力。
- 设置 setter 增加可选显式 write 参数，默认仍为原仓储写入。本路由传入请求内的写入计划收集器，复用原规范化与 AES 加密规则。完整校验、解密和加密成功后才执行数据库写入，不使用隐式全局事务状态。
- 成功后追加一条 `settings-update` 日志，actor 来自入口守卫，subject 为 `settings:system`，changes 仅包含已接受请求的排序字段名。任何字段值（包括口令、API Key、私钥、微信 Token、密文）均不进入日志。后台补中文操作名。写入异常统一返回“保存失败”，防止数据库异常包含敏感值。

## 事务边界

普通设置全部在 `setSettingsAtomically` 的一个连接、一个 BEGIN/COMMIT 内落入 app_settings；任一 SQL 失败 ROLLBACK。初始化 schema 在事务外，事务内不另借连接。

`signupBonus/payEnabled/creditsMetering` 属于计费模块，通过一次 `updateBillingCompatibility` 修改同一份配置、发布一个版本，保留既有计费校验和 CAS。该入口自行管理发布事务，不能传入普通设置的事务连接，因此在普通设置提交后发布。**400 永远在两段写入前返回；数据库或计费运行时/CAS 故障仍可能使普通设置已提交而计费发布失败，返回 500。此实现不宣称跨模块原子提交。** 不通过直接写计费表、回滚覆盖并发变更或重放付费业务绕过模块归属。

审计按要求使用 `appendManagementLogAfterChange`，在两段写入成功之后追加；追加失败沿用现有服务端记录机制，不回滚已完成修改。若计费发布失败，已提交的普通设置不会获得本次成功审计，后续如需跨模块故障审计，应由单独切片实现。

## 验证

先执行 `npm ci --no-audit --no-fund`：exit 0，`added 729 packages in 22s`。所有数据库验证使用自建的 `naumi_settings_f4d84335*` 隔离库，PostgreSQL `127.0.0.1:55439` / fixture；没有使用或删除他人数据库。测试设置密钥来自任务提供的 fixture 值，不是生产密钥。

环境：`NAUMI_VERIFY_ISOLATED_DB=1`、`DATABASE_URL=postgres://fixture@127.0.0.1:55439/<本任务库>`、`SETTINGS_SECRET=<任务提供的 fixture 值>`。

| 命令 | 最终结果原文 |
| --- | --- |
| `npx tsx --conditions react-server scripts/verify-admin-settings-hardening.ts` | `ADMIN_SETTINGS_HARDENING=PASS ORIGIN=PASS ANONYMOUS=PASS RATE_LIMIT=PASS INVALID_ZERO_WRITES=PASS TX_ROLLBACK=PASS MULTI_FIELD=PASS BILLING_SINGLE_PUBLICATION=PASS AUDIT_NAMES_ONLY=PASS` |
| `npx tsx --conditions react-server scripts/verify-admin-access.ts` | `ADMIN_ACCESS=PASS: password gate, native-admin and legacy-cookie rejection, private/HttpOnly session, cross-site rejection, rotation, expiry, logout, protected APIs and safe return URLs` |
| `npx tsx --conditions react-server scripts/verify-admin-route-hardening.ts` | `ADMIN_ROUTE_HARDENING=PASS: shared origin gate, account self/admin/last-admin rules on users+artworks, management-log records without secrets, cross-site/anonymous rejection on 7 content routes, smtp-test rate limit, owner rebind re-auth` |
| `npx tsx --conditions react-server scripts/verify-model-admin.ts` | `PASS actual admin/user/enterprise/forged/expired permissions, same-site mutations, bounded strict inputs, concurrent drafts, private RSA credentials and replay`；`MODEL_ADMIN_LEGACY_LOCK=PASS PUBLISHED_MANAGED_WITHOUT_CONNECTION=409 CODE=MODEL_CONFIG_MANAGED SETTING_WRITES=0` |
| `npx tsx --conditions react-server scripts/verify-single-product.ts` | `SINGLE_PRODUCT_RESULT=PASS: no edition/license required; roles, admin access and setup lock preserved` |
| `node scripts/verify-admin-settings-refactor.mjs` | `ADMIN_SETTINGS=PASS MODE=MODIFIED CHECKS=57 SNAPSHOTS=15 REACT=ACTUAL WEBCRYPTO=ACTUAL RSA4096=DECRYPTED LONG_UTF8=EXACT HTTP_FALLBACK=RETAINED CROSS_PANEL_DRAFT=RETAINED OLD_SESSION_CONTINUATION=NO_POST SUPPLIER=0`；`ADMIN_SETTINGS_CLEANUP=PASS BROWSER_CLOSED=1 LOOPBACK_CLOSED=1` |
| `npx tsc --noEmit -p .` | exit 0，无输出 |
| `npx eslint src/app/api/admin/settings/route.ts src/lib/settings.ts src/lib/settings/repository.ts src/lib/settings/mutation-schema.ts src/components/admin/bi/dashboard.tsx scripts/verify-admin-settings-hardening.ts` | exit 0，无输出 |

新增验证覆盖匿名/跨站、限流、错误字段/密文整表零写入（含 RSA 不初始化）、前序 SQL 成功后后序 SQL 失败的事务回滚、合法多字段和 AES 存储、计费三字段只增一个版本、日志字段名及 actor 且不含明文或密文。浏览器 57 项为真实 React/WebCrypto + loopback fixture API 的兼容性验证；不是部署后真实后台验收。完整日志保留于本 worktree 的 `output/settings-hardening/`（不提交）。

## 交接

```text
模块与职责：系统设置 POST 的入口校验、写入准备、事务提交与成功审计；GET 行为保持。
公共接口、依赖方向、数据/状态/事务归属：route → admin-mutation / settings schema与setter → settings repository；计费通过 updateBillingCompatibility 发布；BI 负责日志。普通设置一个事务，计费独立版本事务，无全局状态或反向依赖。
本次实现与迁移状态：settings POST 已接入共享守卫；setter 兼容原调用方并支持显式计划收集；其他路由未迁移。基线与分支见文首。
验证命令、结果及证据层级：见上表；本机隔离库路由验证、真实浏览器 fixture 验证、TypeScript 与 eslint；无供应商调用、无服务器连接、无发布。
未完成项与下一步：跨普通设置与计费发布的全局原子性、部分运行时失败的审计，以及 P2 其他路由迁移不在本切片内。后续由主任务整合本提交，按独立发布决定执行。测试库与日志保留供复核。
```
