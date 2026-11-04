# Fleet 跨站业务只读协议

## 需求与边界

103 总后台需要查询 47 最新用户、积分消耗、余额、订单、原始账本与作品元数据。原 `users.list` 和企业绑定的 `creations.list` 不能为普通后台提供全站业务统计。本模块新增单独的 `business.query` 协议与只读 reader；中央 API、UI 和实际部署由对应模块记录。

- 两站继续使用独立业务库，不导库，不合并写回余额，不重放充值、扣费、退款或供应商任务。
- 47 业务查询在独立 `REPEATABLE READ READ ONLY` 事务中执行，`statement_timeout=8s`、`lock_timeout=1s`。查询不执行全 App bootstrap、DDL 或余额刷新。
- 查询结束后只向既有 `app_fleet_applied` 记录 Fleet 幂等回执。业务表和媒体字节不变。
- 47 的独立 connector 更新不等于更新 47 Web/Worker；部署不能由此文档推断。

## 合同与口径

`business-contracts.ts` 固定六视图：`overview / usage / users / orders / ledger / creations`。请求包含同一 `asOf`、7/30/90/365 天窗口、账号搜索、可选精确账号与分页；每站每页 30 行。时间窗口为 `[asOf - days, asOf)`，消费日序列按 `Asia/Shanghai` 分桶。快照包含 DB 事务的 `observedAt`。

积分消费要求同时满足 `kind=consume`、`delta<0`，并排除：

1. 旧账本 `reason=管理员调整积分`；
2. `app_billing_operations.feature=credits.adjust` 且 `email + ledger_id` 精确匹配的自定义管理员扣减。

共享 `billing/consumption-read.ts` 的只读分类谓词与常量，现有 BI 原有规则保持不变。退款和管理员扣减分别统计；赠送、过期和在途预占不是实际消费。必要来源表缺失时返回 `failed/UNAVAILABLE`，不伪造完整零消费。

余额使用当前未过期、`remaining>0` 批次本金减去 `app_users.credits_used`，不把可能过时的 `credits_total` 镜像当实时余额。`creditsUsed` 是预留积分，不是累计消费。当前存量与期间流量分别为：

| 当前存量 | 查询期间流量 |
| --- | --- |
| 用户数、未删除作品数、余额、本金、预占 | 消费、操作数、活跃消费账号、退款、管理员扣减、已支付订单数与金额 |

已删除账号的历史账本消费仍保留；其余额、本金和预占为 `null`。按该账号查询时保持已知消费与未知余额，不造零。订单金额使用人民币分，已支付汇总按 `paid_at`，订单列表按 `created_at`。

作品查询仅返回未软删除记录的 id、账号、标题、时间、项目键、状态与 `image/video/unknown` 类型。SQL 检查媒体字段的存在，不返回 URL、提示词或媒体字节。没有有效媒体字段时使用 `unknown`，不冒充图片。既有企业范围的 `creations.list/media` 权限不变。

结果严格校验并检查 UTF-8 JSON 大小，上限 42,000 字节，为 48KB ACK envelope 留余量；超限明确失败，不截断记录或总数冒充完整结果。

## 查询性能、幂等与权限

- `candidate_ledger`、管理员调整键与分类账本使用 MATERIALIZED CTE，避免逐条账本重复扫描操作来源。
- 查询不在持有外层 checkout 或 advisory lock 时再次借连接，`PGPOOL_MAX=1` 可运行。
- 相同 command 的第一份持久化回执获胜；lost ACK 和并发重复保持同一结果。不同 fingerprint 使用同一 id 明确冲突。
- 新 capability 为 `business`；委托账号同时拥有有效 `read + business` 且未被停用才可读取。普通 read grant 不泄漏新查询/结果。
- `fleetReadCommand` 最终 SELECT 在同一 SQL 内再次检查实例启用和授权状态，覆盖预检查后的撤权窗口。
- `business:1` 是可选心跳字段。旧 connector 不会收到 `business.query`，仍可处理兼容旧操作；只有明确广告支持的新 connector 才会领取新查询。应先部署新中央，再部署新 connector。

## 单 Web 版本来源

`FLEET_SINGLE_APP_ORIGIN` 优先于遗留三槽版本来源，只读取实际 Web `/api/version`，不猜测 connector 的 `SOURCE_COMMIT`。原三 origin 与三槽文件模式继续保留。

47 稳定入口可采用：

```text
FLEET_SINGLE_APP_ORIGIN=https://host.docker.internal:443
FLEET_SINGLE_APP_HOST=47.105.59.142
Docker ExtraHosts: host.docker.internal:host-gateway
```

传输目标仅允许固定本机 origin。可选 Host 仅选择本机 Nginx vhost，禁止协议、端口、路径、凭据、空白、控制字符和 metadata 捷径；所有请求禁止跟随重定向。47 HTTP 入口会跳转 HTTPS，因此实际使用 443，不跟随 308。显式 HTTPS Host 使用原生 `node:https`、默认信任根和 `rejectUnauthorized=true`，证书 identity 校验绑定该 Host，IP Host 按 IP SAN 校验且不发送 IP SNI；不关闭 TLS 验证，不扩大 URL allowlist。请求整体 5 秒超时、响应上限 2KB。异常来源/版本返回 `unknown`，不妨碍本站业务继续运行。

## 验证状态

集中真实 PG fixture：`verify-fleet-business-protocol.ts` 当前通过 **85 项断言**，覆盖消费分类、账号碰撞、退款/预占/过期区分、孤儿历史、六视图、分页、北京时间、SQL 参数化、metadata 无媒体 URL、只读前后六表与 schema fingerprint、pool max1、lost ACK、并发幂等、来源缺失、分权与撤权、旧/新 connector 调度、单 Web Host 路由及拒绝输入。

该脚本仅操作明确隔离的本机 `fleet_protocol_fixture` 数据库，使用公开 fixture 凭据。它不是生产容量证明，也不表示已部署或用户验收完成。已有 Fleet control/governance/local-status 回归与 copy-only rollback 的真实输出记录在 `output/fleet-business-data-20261104/protocol/`，最终以该目录 `VERIFICATION.txt` 为准。

## 文件

- `src/lib/fleet/business-contracts.ts`：请求/快照 strict schema 与字节上限。
- `src/lib/fleet/business-read-model.ts`：参数化查询、窗口、余额投影、只读事务。
- `src/lib/billing/consumption-read.ts`：共享消费分类；`bi/usage-repository.ts` 复用而不改变既有规则。
- `src/lib/fleet/contracts.ts`：操作、能力、心跳和回执扩展。
- `src/lib/fleet/connector.ts`：无 App bootstrap 的读取与 metadata 幂等。
- `src/lib/fleet/server.ts`：中央 scoped getter、权限和能力兼容调度。
- `src/lib/fleet/local-status.ts`：单 Web、稳定本机 vhost 版本探测。
- `scripts/verify-fleet-business-protocol.ts`：隔离真实 PG 合同验证。

尚待父模块完成：中央/UI 联调、正式集成封装、103/47 实际部署回执及用户现场验收；本模块未合 main。
