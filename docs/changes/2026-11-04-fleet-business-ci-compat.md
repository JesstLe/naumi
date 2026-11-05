# Fleet 业务只读模块的既有后台与 BI CI 兼容

## 问题

PR #11 的正式 core annotation 首个失败是 `admin-shell` 的后台导航合同。本记录同时记录该导航合同修复与只读复查发现的 BI 后续确定失败，不把 BI loader 问题冒称正式 CI 的首个失败。

## 后台导航合同修复

正式 core annotation 的原始首失败为 `scripts/verify-admin-ui-integration.cjs:24`，实际链接为“作品数据”与 `/admin/center?section=artworks`，而旧覆盖快照仍要求旧标签。父模块保留 `prototypes/admin-console/coverage.json` 原始 25 项快照，新增独立的 `fleet-business-navigation.json` 声明两项标签迁移和一项“本站用户管理”链接，并绑定原始覆盖文件的 SHA256。

实际 Shell 测试现在双向、全量匹配 26 个当前标签和链接，同时逐一确认原 25 个目的地仍可达。用户数据与本站用户管理的 active 状态分开验证；新增本地管理链接执行了实际点击，作品数据保持原目的地。没有通过删掉旧覆盖项或只匹配当前子集来绕过失败。

父模块已实际运行，字面最终输出：

```text
ADMIN_UI_INTEGRATION=PASS CHECKS=19 PAGEERROR=0 EXTERNAL_REQUESTS=0 EXIT=0
```

该 19 项结果来自父模块的真实本地 Shell 浏览器回归；本子模块没有重复运行该组。

## BI loader 的后续确定失败

生产 `bi/usage-repository.ts` 已将原有积分消费分类表达式提取至纯只读 `billing/consumption-read.ts`；表达式与管理员扣减来源匹配规则没有改变。两个旧验证器使用自己的 TypeScript VM loader，不经过 Next/tsx 的路径解析，因此遗漏的新模块路径会在真正执行统计之前失败：

- `verify-admin-usage-pg.cjs`：原生 `require('@/lib/billing/consumption-read')` 产生 `MODULE_NOT_FOUND`，exit 1。
- `verify-admin-usage-skew.cjs`：严格 loader 先遇到未接入的 `@/platform/db/pool`，报 `Unexpected application import`，exit 2；同样还需处理 `./schema` 与新的真实消费 helper。

原始两文件和真实失败输出保存在 `output/fleet-business-data-20261104/bi-loader-fix/`，没有抹去失败后重写成成功。

## 改动

BI 修复只改两个验证器，不修改产品代码、消费 SQL 或测试预期的业务统计结果。

1. 两个 loader 对 `@/lib/billing/consumption-read` 增加精确允许项，调用各自既有 `load()` 读取真实生产 TS 模块，模块原始字节 SHA256 自动进入 `loaded/sourceModules` 清单。不 mock 消费分类规则。
2. skew 为新的平台 pool 与 schema 路径复用已有拒绝端口，继续禁止嵌套 checkout 和生产 schema 初始化；不会引入真实业务 bootstrap。
3. 两个验证器显式断言 checkout/schema 调用被拒绝；统计 reader 只接受 SELECT/WITH，并拒绝去除字符串字面量后的写入/DDL 关键字，包含 `WITH ... DELETE ...` 的负例。
4. PG 验证器补上与 skew 一致的应用 HTTP/fetch 拦截、零网络断言和已加载模块字节稳定检查；保留真实 PG socket、真实业务查询和原有统计/性能断言。

这些守卫约束验证器的数据读取端口，不将简单正则检查描述为通用 SQL 安全解析器。

## 集中验证

仅新建本机 PostgreSQL `usage_fixture`。每个验证器创建自己的随机 schema 并在 finally 中删除，没有重置或迁移中央/source fixture 库。

```text
NAUMI_VERIFY_ISOLATED_DB=1
DATABASE_URL=postgres://postgres:fleet_protocol_fixture@127.0.0.1:65298/usage_fixture
ADMIN_USAGE_FIXTURE_DATABASE_URL=<同上>
```

| 验证 | 字面最终输出 | exit |
| --- | --- | --- |
| PG 含 `--scale` | `ADMIN_USAGE_PG=PASS CHECKS=16 REAL_SQL=1 SUPPLIER_CALLS=0 EXIT=0` | 0 |
| 倾斜分布 | `ADMIN_USAGE_SKEW=PASS CHECKS=9 JSON_EACH_LOOPS=1600 PARENTS=1600 REAL_SQL=1 SUPPLIER_CALLS=0 EXTERNAL=0 EXIT=0` | 0 |

PG scale 沿用原有 20,000 jobs、20,000 artworks、12,000 ledger、40,000 model calls 的真实数据矩阵，实际记录 `SCALE_QUERY_MS=1507 EXECUTION_MS=398.265`；这只是本机隔离 fixture 的单次执行，不是生产容量证明。skew 保留同一账号 1,600 parents 的执行计划校验，`jsonb_each` 实际 loops=1,600。

完整命令、输入、字面 stdout/stderr、exit、原始/修改 hash 与两文件 diff 见同证据目录。四产物由父模块统一封装；本子任务没有运行全量 core，没有 SSH、push 或部署。

## 正式 CI 接线

父模块已将后台 Shell、既有 usage PG 和 skew 三组正式接入 `.github/workflows/fleet-business.yml`：

- 继续使用 Ubuntu / Node 24 / PostgreSQL 16，新增安装固定依赖的 Playwright Chromium。
- 单独创建 `usage_fixture`，与 protocol、central 103、source 47 的测试数据库分离。
- 路径触发覆盖两个 BI 验证器、Shell 验证器和独立导航迁移文件。
- 正式运行三组既有兼容测试并保留它们的 `RESULT.json`；原六视图协议、UI、HTTPS、双库中央 E2E 步骤继续保留。

这里只记录 CI 配置已经接线和本地真实测试已通过；远端新提交的 CI 状态由实际 GitHub 回执单独确认，不从本地结果推断。
