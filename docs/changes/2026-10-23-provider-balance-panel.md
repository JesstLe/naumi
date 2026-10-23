# 供应商账户余额与额度面板修订（2026-10-23）

## 代码范围与来源

- 独立分支 `codex/saas-provider-balance-20261023`，基线 `de5d010b8d2543f171b1da66f4f020ca3dd342b9`。保留企业界面及平台 polish 的原工作树。
- 精确复用 `origin/codex/provider-health-20261021` 的独立提交 `d06ec139`（本分支 `0ca5200f`），仅其 6 个余额面板相关文件；没有合入整个旧分支。主实施整合需同时应用复用提交及本修订。
- 复用既有 `/admin/model-health` 下方 `ProviderOps`，不另建面板。旧提交中的余额猜测与成功率命名由本轮精确契约及独立“调用受理结果”区块替代；原模型健康模块继续负责其自身统计。
- 文件负责人为余额 server/contracts/access、`provider-ops` API/组件/CSS、隔离验证脚本及本记录；`model-health.tsx` 仅复用提交的一处组件挂载。未修改共享 shell、企业 API、后台三屏、模型配置写入器或数据库 schema。

## 已实现

1. 只读取 `app_model_config_state.active_version` 指向的不可变发布配置；按其 `provider.id + credentialRef` 双条件解引用加密凭据。不存在、跨供应商引用或解密失败均显示凭据不可用，不查旧凭据、不按 `provider_id LIMIT 1` 兜底。读取末尾复核发布版本，变化返回安全 `CONFIG_CHANGED/409`。
2. 账户标识由服务端 HMAC 对“已核验接口身份 + 实际密钥”生成。相同密钥与同一接口的通道合并，不同密钥、origin 或未核验路径不共享缓存。界面标为“凭据账户”，不冒充已取得供应商真实用户 ID；不同密钥即使属于同一供应商钱包也保守分开。响应不包含密钥、credentialRef、baseUrl 或上游原文。
3. 服务端按精确 origin 选择显式只读适配，不按 `apimart-images` 或供应商名称猜接口；不遍历或回退其他路径。GET 继承现有安全传输/DNS、代理与重定向拒绝，12 秒超时、32 KiB 响应上限；`costDisabled=true` 且不设置容量配额参数，不产生供应商收费执行、模型成功率或容量租约记录。
4. 成功缓存 5 分钟、错误缓存 30 秒，手动刷新最短间隔 15 秒；同进程同账户在途请求合并，最多 4 个账户并行。缓存键绑定账户及来源修订，持久缓存失败仍显式返回状态。跨进程缓存复用通过既有设置存储实现，不声称跨进程原子在途锁。
5. 未确认、unsupported、负数占位、无单位或失败均为 `null/未记录`，已知零可显示为零。失败只显示固定错误码/中文映射，不返回 `error.message`、上游错误体、URL 或 key。上次成功值与本次失败、时间和缓存状态分别展示，不当成当前余额。
6. API 沿用 `biAuthorize/requireAdmin` 二次验证与查询限流，fleet/login-only 模式拒绝；只允许 GET 和 `refresh=0/1`，任意凭据选择参数均拒绝。使用 private/no-store 响应。企业前端/API不引入此内部数据。
7. 界面分列“供应商余额”和“API Key额度”，显示发布版本、凭据账户、通道、累计已用、单位、读取时间/尝试时间、缓存有效期、刷新 loading/error/retry。精度使用最多 15 位有效数字，避免已知微小正值被格式化成零。

## 接口依据与限制

| 适配 | 精确 origin / 固定只读路径 | 来源与修订 | 语义 |
| --- | --- | --- | --- |
| APIB | `https://api.apib.ai` / `GET /v1/user/balance`，Bearer | [APIMart 官方 User Balance 文档](https://docs.apimart.ai/en/api-reference/account/user-balance)，`2026-10-23-apib-user-balance-v1`；APIB 与此文档的关联及目标接口由根线程已有只读私有回执核对 | 严格接受顶层 `success=true`、有限数值 `remain_balance/used_balance`。响应没有 currency/unit，显示“供应商返回余额，单位待确认”，不默认 USD、不推算总额；负数占位置未知。 |
| Geek | `https://www.geeknow.top` / `GET /api/usage/token/`，Bearer | [Geek 官方 Account Billing](https://docs.geeknow.ai/api-reference/account/billing)，`2026-10-23-geek-key-quota-v1` | 读取 `data.total_granted/total_used/total_available/unlimited_quota`。仅为 API Key额度；不限额不显示可用/总额度数值，账户资金余额未知。单位没有正式定义，保留未知。 |

本子任务只访问公开文档，没有连接生产或调用真实供应商接口。根线程已存在的真实只读回执与本地 fixture 证据分开；实际余额、密钥及账户私有回执不进仓库。Geek 专用 user-balance 路径已由根线程确认不支持，本实现不会试探该路径。未采用 subscription 的 `_usd` 字段或不限额大数推断货币，也不按累计已用计算本轮净消费。

## 集中验证证据

- 新建回环隔离 PostgreSQL 16 数据库 `provider_balance_fixture_v3`，`NAUMI_VERIFY_ISOLATED_DB=1`，执行 `scripts/verify-provider-balance.ts`；全部外部 GET 由注入 fixture transport 接管，真实供应商调用 **0**。脚本会拒绝非回环或名称不含 fixture 的数据库。
- `PROVIDER_BALANCE_FIXTURE_PASS`：当前发布 ref、旧 key 不使用、双条件凭据校验、同 key 合并/不同账户隔离、缓存/节流/并发去重、APIB 顶层/`success=false`/嵌套或字符串拒绝、负数/不限额/未知单位/已知零、错误不伪零、历史值区分、401/网络/超时/畸形响应脱敏均通过。
- API 使用真实现有管理员密码哈希签名与 `biAuthorize`：无身份、企业普通成员、仅 native admin 无二次验证均拒绝；管理员二次验证通过；fleet/login-only 拒绝；非法参数、POST 拒绝；private cache headers；发布版本变更 409 全部通过。
- 对比执行阶段、supplier calls、billing operations、ledger、provider leases、health observations/probes 的前后计数保持一致。账号 fixture 准备与读取阶段基线分开，未把 fixture 注册积分变化当成余额查询副作用。
- 整工作树原生 `tsc --noEmit` 只报基线 `platform-console.tsx` 缺少主实施尚未进入此基线的 `./trend-chart`；使用 Compiler API 仅对该缺失模块解析到主实施工作树、其余均为本分支，得到 `DEPENDENCY_AWARE_TYPESCRIPT_DIAGNOSTICS=0`。未复制或提交主实施组件。
- `git diff --check` 通过。此轮修改后集中一次完整 fixture 与类型验收，文案修订不另跑无关大套件。

复跑时使用全新隔离 fixture 数据库，运行 `node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-provider-balance.ts`；不要对线上数据库运行。

## 未完成及交接

- 本子任务未做真实供应商余额请求；根线程私有只读回执不能替代本候选实际部署后的权限/缓存/UI验收。
- 本子任务未启动额外 Web、未操作根浏览器标签、未做桌面/390 截图与 Next 完整构建；交由主实施整合后集中验证，不能据类型通过写成构建或浏览器通过。
- APIB/Geek 的正式货币单位、同一钱包多密钥真实账户 ID 尚无依据，持续显示未知/凭据账户；其他 origin 保持 unsupported。未自动告警、充值、停用通道或修改路由。
- 未 push main、未发布、未占服务器锁；120 及其他服务器均未连接。
- 本子模块功能迭代计数 **2**（余额修订、调用受理/熔断恢复），文档及复用提交不另计；父任务负责累计三模块后的远端 main 同步与统一整合，本分支未用远端内容覆盖其固定实施基线。

## 追加：恢复供应商调用受理与熔断（根审阅后）

初次余额安全修订删除了旧提交已有统计区块；根审阅要求恢复，现已在相同独立分支补回。新增 `provider-activity.ts` 与客户端安全 contracts，组件中单独按 provider 展示，不把 credential 账户组当成调用归属，也不丢弃旧分支的管理能力。

- 标题为“调用受理结果”，不叫成片成功率。`app_model_execution_stages` 一行是一个 attempt，finish 更新同一行；`response-received/stream-completed` 归已受理，`rejected-not-charged` 归拒绝，`failed-response/failed-output` 归失败，`submitted` 归处理中，其余状态（含 unknown 和未来未知枚举）归未知。每个 attempt 只计一次，不按更新次数、输出件数或余额请求次数计数。
- 时间按 `created_at`，一次捕获固定 `until`，查询 `[until-24h, until]`，1h 使用同一快照的闭区间。排除未来记录、窗口外记录及当前发布配置以外的 provider；各 provider 单列 1h/24h 六项计数，不向当前密钥分摊历史调用。
- 每次最多读取 50,000+1 行，仅选 `provider_id/state/created_at`。发现额外一行时全部窗口统计返回 `ROW_LIMIT`/未知，避免把截断值冒充完整统计。只读可重复读事务设置 5 秒 statement timeout，不创建审计表或索引、不改审计/余额/计费/健康记录；现有空表是已知零，缺表是 `NOT_RECORDED`，失败是固定 `ACTIVITY_UNAVAILABLE`。
- 当前通道状态复用执行器 `supplierChannelKey(providerId,baseUrl,wireModel)`，从当前发布 upstream 身份去重（模型别名不会多计），只查对应真实 `app_model_channel_health`，不把历史 endpoint 的熔断混进当前配置。单列配置通道、已记录熔断、恢复探测和未记录通道；无状态行不会推断健康，缺表/读取失败保持未知。配置中没有通道时显示无通道。
- 同区块显示发布 `maxConcurrent/timeoutMs` 及当前启用 public model 实际 `supplierRouting.mode`（优先/均衡）。发布通道配置缺失时策略/状态未知，不虚构可配置熔断阈值。接口只返回汇总、固定错误码和时间，不返回 URL、wire model、key、raw SQL 或上游错误。
- 余额和 activity 两个结果共用既有管理员鉴权与最终 active-version 复核；activity 的缺表或安全错误不会抹掉已知余额，健康状态失败也不会抹掉已知调用结果。

### 追加集中证据

全新 `provider_activity_fixture_v1` 真实隔离 PostgreSQL：`scripts/verify-provider-activity.ts` 输出 `PROVIDER_ACTIVITY_FIXTURE_PASS`。覆盖缺表未知、现有空表零、全部状态分类、1h/24h 精确边界、排除未来/窗外记录、finish 更新单 attempt、provider 分组、通道身份/别名去重、恢复探测与未观测、配置策略、50,001 行上限未知、固定异常/无内部字段、读取前后审计计数不变。transport 无外部调用，真实供应商调用 0。

同时在全新 `provider_balance_fixture_v4` 重新执行完整余额/真实鉴权 fixture，通过；证明新增统计读取没有改变旧 key 隔离、缓存、权限、错误安全或执行/账务/健康写入边界。依赖感知 Compiler API 再次 0 诊断；`git diff --check` 通过。正式整站构建和浏览器仍交主实施集中验证，未连接生产或发布。
