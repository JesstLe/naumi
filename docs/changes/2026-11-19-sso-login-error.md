# 企业协作登录失败页修复

## 模块与职责

中央 OIDC interaction 的错误响应与浅色错误页；不是 Desktop 安装或本地 backend 修复。
开工基线 `4095bceee1aea3007aa20fa5c85cbe200b3a0c9a`，独立分支 `codex/sso-login-error-20261119`。

## 调研结论

- 用户在中央账号密码提交后看到无编码声明的中文错误。
- 47 真实数据库在 `BEGIN READ ONLY` / `ROLLBACK` 中核验：所报账号存在原生账户，但没有中央 subject，组织记录为 0、产品授权为空。没有读取密码散列、令牌或其他人员记录。
- 原路由无 subject 时 `.status(403).send("账号尚未分配产品权限")`；其他异常也统一写成权限失效。Next Pages API 的字符串 send 不会自动补充 Content-Type，中文裸响应缺少 UTF-8，服务异常又被误报为授权失败。
- 名册和线上授权是不同证据；不根据邮箱中的 admin 字样自动授予企业权限。

## 公共接口、依赖方向、状态归属

- `login-error.ts` 提供纯函数 `loginErrorResponse(code, configuredRedirectUri)` / `loginReturnUrl()`，只生成固定文案、状态码和响应头，不访问账户、Cookie 或数据库。
- interaction route 调用既有 native auth、subject 查询和 `oidcAccount()`。原组织、产品授权、consent 账号一致性和成功 interactionFinished 保持；无新增授权或迁移。
- 返回地址只从完成 UID / 已登记 client 校验后的配置 callback 推导 `/login`。不接受请求 query 的返回地址，不复用旧 interaction，不自动重试认证。

## 本次实现与迁移状态

- 中文错误统一 `text/html; charset=utf-8` 和 HTML meta charset，响应 no-store/no-referrer/nosniff/CSP。
- 缺产品授权 403、账号变化 409、过期 interaction 400、服务故障 503 分开处理，不输出原异常、邮箱或敏感配置。
- 简洁浅色响应式页面和可键盘操作的“返回登录页”；无前端脚本和外部资源。
- 非 GET 405、未登录跳原生登录、login 与 consent 成功路径保持。

## 验证命令、结果及证据层级

```sh
node scripts/verify-identity-login-errors.mjs output/sso-login-error-20261119/BASELINE_FILE.ts
# 原 route: passed=7 failed=11 cases=18 auth_writes=0; exit 1
node scripts/verify-identity-login-errors.mjs
# 修改 route: passed=18 failed=0 cases=18 auth_writes=0; exit 0
node scripts/verify-identity-login-error-ui.mjs
# 隔离真实 Next Pages API + Chromium: 19 checks; 360/760/1280; exit 0
node scripts/verify-identity-pages-boundary.mjs
# server-only 服务端/客户端边界保留; exit 0
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext src/lib/enterprise/identity/login-error.ts
# 纯呈现模块类型检查; exit 0
```

测试使用隔离替身账户，不发真实登录或模型请求。UI 验证使用真实 Next `apiResolver` 发 HTTP 响应、Chromium 校验 UTF-8、窄屏无溢出、键盘返回和零外部资源；它不是生产真人完整 SSO 验收。测试源码通过 TypeScript 编译后运行，OIDC / PG 用显式替身；没有声称全仓构建通过。

## 证据与回滚

交付根目录 `E:/Workspace/naumi-sso-login-error-evidence-20261119/` 包含 `MODIFIED_FILE.tar.gz`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。原 route SHA256 `58a557a76cacc13af32a1583b154490655c7c8f24eca1d3580f6cd26f2848497` 已保存。
回滚只允许显式标记的独立副本，逐文件 CAS 后恢复原 route、移除本任务新增文件。测试应重新出现同 11 个基线缺口，不回灌数据库或账号。

## 未完成项与下一步

- 本切片为源码修复和隔离验收；尚未中央生产蓝绿发布，当前线上错误页仍旧。
- 用户随后明确指定「天地合」及「企业管理员」。已将其匹配到正式企业「天地合大健康」，使用一次性操作员事务补充这一个既有账号的 active membership、subject、administrator 组织身份及 design-ops/admin 产品授权；不改负责人，不授予业务 owner。
- 现有 `mutateIdentity` 要求目标已经是企业成员，现有 create 入口拒绝覆盖既有账号；因此本次不伪造登录或修改原生角色，采用明确用户批准的一账号运维事务。复用原 organization schema、产品角色校验和 hierarchy 校验，持原管理 advisory lock，检查企业、负责人准入、账号、唯一归属、席位及 CAS；同事务记录中央 receipt/outbox 与 enterprise audit。先只读准备，再在影子 temp 表完整执行并回滚，最后真实 apply+readback。操作 UUID `b362576b-8d5a-465d-927a-fd1e117f1b58`、outbox sequence 204，保留幂等读回入口。该运维 adapter 不注册为产品 API，不作为普通用户绕过登录或自动赋权机制。
- 用户密码、原生 role/management_version、全部原生账号、其他成员/组织/产品授权及负责人在事务内摘要逐项保持。未重放批准名册，未创建业务目标或任务。
- 真人从账号密码提交到企业工作台的完整 SSO 验收仍待正式产品授权和错误页部署，不能把机器投影 / ACK 或隔离测试当作本人登录成功。
- Desktop 安装、3080、202 人名册和模型配置未修改；协作消费端使用既有定时同步消费新授权，不手写消费身份或会话。
