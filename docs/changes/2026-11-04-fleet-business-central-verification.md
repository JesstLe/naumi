# 中央业务数据：双库与实际 HTTP 验证

## 已实现的验证

`scripts/verify-fleet-business-central.ts` 使用两个独立的本地 PostgreSQL 数据库，调用真正的总后台业务 route、fleet poll/ACK route 与独立进程中的 `connectorTick()`。本验证没有替换 reader、签名、鉴权或 ACK 实现。

- 103 本地结算消费 7，47 站消费 42，合计 49。
- 同一邮箱在两个站点分别保有 93、195 的可用余额。余额取有效正数积分批次减占用，不取过时的 `credits_total`，没有迁移或合并钱包。
- 47 的历史管理员扣减 100、自定义管理员扣减 200 不计为消费；退款 5 单列。
- 六种业务视图均经过真正的中央排队、HTTP poll、源库只读事务、签名验证、持久回执、HTTP ACK 与中央 GET。
- 匿名、普通账号、跨站 POST、Origin 不符、非法参数、请求签名篡改、跨账号、失去 root context、过期请求均验证拒绝。
- 老连接器缺少 `business:1` 时不排队；实际新 heartbeat 开启派发。
- 同一 30 秒查询窗口复用 command ID；显式刷新产生新 `asOf` 与 command ID。
- HMAC 查询标识在全新中央 Node 进程中仍能恢复查询，没有依赖中央进程内的请求映射。
- 超时、站点停用、心跳过期、回执 `asOf` 不匹配均不生成零值成功快照；站点注册列表变化使旧标识失效。
- 从测量开始到结束，两库的六张业务表内容哈希不变；源库及中央列目录哈希不变。允许写入的内容只有 fleet 回执/队列/审计以及限流元数据。

## 运行命令与结果

PowerShell（仓库根目录）：

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB = '1'
$env:DATABASE_URL = 'postgresql://postgres:fleet_protocol_fixture@127.0.0.1:65298/fleet_central_103_20261104'
node --import tsx --conditions react-server scripts/verify-fleet-business-central.ts
```

2026-11-04 的实际结果，exit 0：

```text
FLEET_BUSINESS_CENTRAL=PASS assertions=54 REAL_PG=2 HTTP_POLL_ACK=1 LOCAL=7 REMOTE=42 TOTAL=49 BUSINESS_WRITES=0 SOURCE_DDL=0 PAID_CALLS=0
```

可重开的证据：

- `output/fleet-business-data-20261104/central-integration/RESULT.json`：54 条断言、两库基准哈希、HTTP 次数。
- `output/fleet-business-data-20261104/central-integration/RESPONSE.json`：实际 admin API 返回的两站消费与用户余额。

测试只允许主机 `127.0.0.1`、端口 `65298`，而且显式要求 `NAUMI_VERIFY_ISOLATED_DB=1`。脚本会重置且仅重置数据库 `fleet_central_103_20261104`、`fleet_source_47_20261104` 的 public schema。它不会触碰协议测试拥有的 `fleet_protocol_fixture` 库。测试结束保留 fixtures，关闭 Node 的 HTTP server 和数据库连接，不删除 PostgreSQL 实例。

## 浏览器复用

测试在用户私有 task-evidence 目录写入：

- `fixture.env`：实际 Next 进程需要的显式 fixture 环境。
- `native-admin-cookie.txt`：本地 root 管理员的原生签名 cookie，不放入 Git。
- `fixture.json`：中央和源库、测试 instance、actor、cookie 路径，供本地进程使用。

`scripts/verify-fleet-business-worker.ts` 从 stdin 读参数。`mode='tick'` 要求源数据库并运行一次实际 poll/ACK；`mode='poll'` 要求中央数据库并从签名 query ID 恢复查询。任何新的浏览器查询仍需要源 connector tick；已完成的回执不会被测试撤销。这里的本地证据不代表 47/103 线上连接器已升级或已部署。

## 一次测试接线修正

初次 fixture 给中央 artwork 种入空 `group_id`。全新中央进程正常应用启动时，既有 `ensureSchema()` 将其回填为 artwork 自身 ID，导致业务表哈希断言发现变化。fixture 已按启动后的正常数据形态种入稳定 `group_id`；没有绕开 business reader 的只读哈希断言，没有修改产品实现。
