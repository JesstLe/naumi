# Fleet：业务读派发时效与用量旧入口

## 复审、基线与职责

PR #11 的 review `5772969483` 覆盖 `9fd8e28a14d476807630498c1746411a853ec3bd`，新增两项：inline `4471077017` 要求过期业务读退出派发候选；diff 外 Minor 要求保留裸 `/admin/usage?email=...` 的本站用户用量入口。两项均先用原产品字节复现，原八个文件的 SHA256 保存在 `output/fleet-business-expiry-entry-20261105/BASELINE_SOURCE.json`。

业务读时效由 `business-contracts.ts` 的 `FLEET_BUSINESS_QUERY_MAX_AGE_MS=90_000` 统一拥有。中央用例负责 pending/UNKNOWN 展示，Fleet server 负责候选选择和原租约/ACK；页面只负责在原本站 owner 与跨站 owner 间选择。该切片不迁移业务数据、不改变账务、mutation、签名、权限或部署。

## 派发时效

- SELECT 保留原 instance、queued/leased、connector business capability 和控制优先/FIFO 条件；只为 `business.query` 增加按**已存 `operation.asOf`**计算的 90 秒截止。
- 截止 instant 由当前中央进程时间减共享常量得到，以 `$3::timestamptz` 绑定，SQL 本体是固定字面量，没有把 asOf、站点或账号拼进 SQL。
- 不使用 created_at 代替业务读时刻：新入队但 asOf 过期的读被排除，created_at 很旧但 asOf 新鲜的读仍可派发。非业务控制不增加时效限制。
- 恰好达到 90 秒时，中央 pending 转 UNKNOWN，与派发截止一致；未收到结果不伪造 failed、空数据或零余额。
- 过滤不写 command.state、result、lease_id、operation 或 fingerprint。业务读即使 lease 已过期，也不重新派发；原 matching late ACK 仍进入未改动的 ACK 分支，结果冲突与错 lease 继续拒绝。
- request token 仍为 180 秒，租约仍为五分钟。此改动不是 durable cancellation，不删除旧行/收据，也不声称完成 retention/cleanup 所有权。

## 旧用量深链

`src/app/admin/usage/page.tsx` 调用 `businessLocalDetail(params, true)`，保留裸 email（包括 Next 重复参数数组形态）交给原 `UserUsage`。带明确 site 或 view 的跨站链接仍选择 `FleetBusinessDashboard`，`detail=local` 和既有本站过滤继续有效。原 `requireAdminPage('/admin/usage')` 及先鉴权再读取参数的顺序不变，两个组件本身不修改。

## 正式回归与实际结果

### 真实 PG/HTTP

既有 protocol → queue compatibility → control-priority 矩阵新增 20 项业务时效检查，继续进入原 CI 步骤：

- 过期 queued 读退出候选，后续新鲜读正常执行，原旧行逐字段不变，重复 poll 不重新派发它。
- created_at 与 asOf 的正反对照；旧控制仍可实际 ban，无新 age cutoff。
- 一条 age 60 秒的有效读经真实 connector 执行并真实丢失 ACK；随后只将 fixture 中央进程的 `Date.now` 推进 45 秒，源 operation、fingerprint、已落源收据不变。原 lease 仍有效时新鲜读可先派发；再只在自有 fixture 中推进 leased_until 后，旧读仍不 redispatch。错 lease 409、原晚 ACK 200、重复 ACK 幂等。
- 虚拟时钟在 `finally` 恢复，不等待真实五分钟，不改生产时间，不在时钟推进期间执行供应商或积分变更。
- 实际中央 start/poll 在 89,999 / 90,000 / 90,001ms 的 pending / UNKNOWN / UNKNOWN 边界；排队行与源用户字段不因展示超时而变化；无效 asOf 被既有 schema 拒绝。
- 原控制优先 23 项与原缺表/列、lost ACK、history、旧 connector capability 检查全部保留。只有需要真正派发的正向 fixture 改为当前 asOf；历史数据窗口、直接 reader/receipt 回放与成功历史 payload 继续使用原冻结数据，不将过期反例悄悄改新。

原 9fd 产品 + 同一新增 harness：旧控制 23/23 通过，新时效 20 项中 **9 项失败**，exit 1。修改版新时效 **20/20**、控制 **23/23**、完整 protocol **144/144**，exit 0；付费调用 0、积分调整 apply 0。该层是真实隔离双 PG、原生 loopback HTTP 和独立 connector 子进程。

### 实际页面入口与其余集中回归

新 `scripts/verify-fleet-business-usage-entry.mjs` bundle 实际 async Next page 和实际 entry helper，只替换 auth/component I/O 边界；它不是完整浏览器、Next HTTP 或真实身份服务验收。50 项覆盖裸 email、重复 email、显式 site/view、本站过滤、默认入口、fleet 关闭、URL 非变异与鉴权先行。

原 9fd 页面：两种裸 email 形态错误选择 fleet，50 项中 **2 项失败**、exit 1；修改版 **50/50**、exit 0。该入口已加入 `fleet-business.yml`，并上传默认 modified result JSON。

其余集中结果：原 UI contract **75 项通过**；聚合预算 **73 项通过**（真实 central/client 加有限 I/O，不标为 PG/HTTP）；全库 `tsc --noEmit --incremental false` 无输出、exit 0。

## 产物、恢复与待完成项

本切片十文件统一封装到 `output/fleet-business-expiry-entry-20261105/final/`：修改 ZIP、完整 diff、命令/输入/字面输出验证记录、可执行 copy-only rollback。回滚恢复八个原文件、移除两个新增文件；新的测试 harness 独立放入 evaluation 目录，加载实际恢复后的产品字节，重现旧时效九项失败和旧页面两项失败。后续编辑必须在首写前零写拒绝；工作树和 ZIP 留新实现。最终 SHA/CI/复审状态以 `FINAL_SEAL.json` 为准。

本轮只 fetch 远端 main，不把本分支合入 main。当前未发布到 103/47、未进行生产数据核对或用户验收。9fd 的复审结果不代表新提交已通过；新提交仍需实际 CI 与最新 SHA 复审。原 ast-grep 的 SQL injection 提示不靠关闭工具处理：查询保持固定字面量和参数绑定，非法 asOf 的拒绝路径纳入测试。
