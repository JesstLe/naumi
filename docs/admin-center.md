# Naumi 管理中心

管理员从 `/admin` 登录后进入 `/admin/center`。管理中心将数据分析、用户操作、计费配置和系统设置放在同一套导航中，不需要单独部署。

未配置后台访问密码时，以上统一数据入口适用于现有本地管理员会话及原生邮箱管理员会话。只有浏览器 Bearer Token 的 Supabase 管理员继续使用原系统设置入口，避免被重定向到无法携带 Token 的服务端页面；本次不改变外部认证机制。

配置后台访问密码后，所有管理员（包括已经用邮箱登录的管理员）必须额外输入访问密码。所有管理页面和接口统一校验；子页面转到访问验证，验证后返回原页面。侧栏“退出管理中心”清除后台会话，普通邮箱登录仍保留。

密码只保存随机盐的 scrypt 哈希。后台会话通过 HttpOnly Cookie 保存，绑定当前密码哈希、有效期 7 天；设置或轮换密码立即使旧会话失效。登录限制每 IP 每 10 分钟最多 10 次尝试，拒绝跨站登录。密码及其哈希不能写进代码或文档，生产密码由受保护的运维操作配置。未配置密码的实例保留原权限行为；数据库验证失败时拒绝后台访问。

线上若使用 HTTP 地址，访问密码的传输仍依赖 HTTP，哈希存储不提供传输加密；对外管理入口应配合 HTTPS。HTTPS 登录会设置 Secure Cookie。

| 分区 | 内容 |
| --- | --- |
| 运营概览 | 用户、任务、积分消费和充值统计 |
| 用户管理 | 用户与企业、账户资料、权限、封禁、积分调整 |
| 计费管理 | 业务价格、供应商成本、规则、充值套餐、赠送、版本历史、人工核对；内部定价测算仅用于研究 |
| 业务记录 | 任务、图片、对话、模型调用 |
| 财务与审计 | 充值订单、积分流水、质量审计、用户管理日志、后台访问记录 |
| 系统设置 | 供应商接口、模型与站点配置 |

## 入口与兼容

- `/admin/center?section=users` 等链接可直接进入数据分区；刷新保持分区，浏览器前进、后退可切换分区。
- `/admin/bi` 保留为管理中心兼容入口，支持同样的 `section` 参数。
- `/admin/billing` 保留原计费页面地址，增加统一导航。
- `/admin/pricing` 为内部定价研究与测算页，增加统一导航，不会发布计费配置或创建订单。
- `/admin?view=settings` 进入系统设置；未登录时沿用管理员登录流程。
- 手机通过顶部“展开管理导航”按钮打开菜单，选择页面后收起。

## 修改位置

- 统一分组和菜单：`src/components/admin/center-shell.tsx`。
- 导航布局与移动端样式：`src/components/admin/center-shell.module.css`。
- 管理中心和旧 BI 页面入口：`src/app/admin/center/page.tsx`、`src/app/admin/bi/page.tsx`。
- 计费界面与引擎继续位于 `src/components/admin/billing/`、`src/lib/billing/`，详见 `docs/billing-maintenance.md`。
- 数据查询与用户管理继续位于 `src/lib/bi/`、`src/app/api/admin/bi/`。

本次整合只改变后台入口与页面导航。页面和接口继续独立校验管理员权限；计费冻结、发布版本、积分落账、供应商调用链路均沿用原实现。

## 验收

`npm run build`、`npx tsc --noEmit`、`npm run verify:billing-ui`（14 项）、`npm run verify:admin-access`、`npm run verify:private-bi`、`npm run verify:bi-management`、`npm run verify:pricing-access`。

浏览器验收覆盖统一入口、分区链接及刷新、旧链接、用户管理弹窗、系统设置、定价测算、手机菜单、普通用户与匿名访问拒绝，以及原有计费发布/冲突/重试。测试使用隔离数据库；页面截图中的版本与金额属于测试配置，不代表生产配置。
