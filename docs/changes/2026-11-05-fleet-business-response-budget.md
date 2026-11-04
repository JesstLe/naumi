# 跨站后台查询：中央完整响应的字节预算

## 问题与职责

PR #11 的 `b26a84e8` 复审 `5771998877` 新增一条 diff 外 Major：单站有效快照最多 42,000 bytes，但中央可以返回 200 个 remote 加 1 个 local。`all` 的 JSON 总量没有上限，会被真实客户端的 2 MiB 流读取保护整页拒收。该问题已在有限 I/O fixture 中加载真实中央公开用例与客户端复现：201 个合法站点产生 8,498,579 bytes，客户端报 `查询结果过大，请筛选站点或账号`。这不是生产流量或容量测量。

新增 `src/lib/fleet/business-response.ts` 仅拥有**中央展示响应**的预算与装配规则；它不拥有数据库、排队、签名、源快照、钱包或 receipt。`business-central.ts` 在完成现有鉴权、registry fencing、query matching 与源读取后调用此纯函数。客户端与中央通过 `business-central-contracts.ts` 共享原有 `2 * 1024 * 1024` 上限，没有放宽客户端保护。

## 实现与不变量

1. 预算按完整 JSON 的 UTF-8 字节计算，包含签名 requestId、query、完整 sites、所有 source 元数据、JSON 标点、转义和 complete 字段。完整响应的 `true` 比 `false` 少一字节，恰好达到上限的完整结果不会误裁。
2. 先为所有源保留终态 fallback，再按稳定来源顺序接纳完整成功快照；只进行线性数量的单源序列化，不反复序列化整个大集合。
3. 超额成功 source 映射为 `unavailable`，带 `汇总结果达到大小上限，请选择该站点查看`，保留 id/name/kind/commandId，不携带 data。站点和来源均不静默消失，健康站点保留完整数据，单站筛选可重新取得未被改动的完整原快照。
4. pending/offline/failed/unknown 保持原样；pending 仍驱动原轮询。没有 pending 时 unavailable 是本次响应的终态，不无限等待、不自动重试。
5. 输入、缓存和持久 receipt 不原地修改。unavailable 不写入 command.state 或 connector ACK；本轮未改 dispatch、源业务查询、mutation、幂等收据或账务合同。
6. 超限即 `complete=false`，现有全局合计和完整趋势继续保持未完整，不把缺失站点当零。真实客户端会剥除非成功状态夹带的旧 data；后续轮询也会清掉先前成功但本轮已 unavailable 的旧数据。
7. 若连 metadata-only fallback 都超限，中央返回短明确的 503，而不是超限成功响应。其大目录压力输入仅为防御性分支测试，不代表当前注册查询超过 200 remote，也不代表已验证该容量。

UI 沿用浅色布局。状态标签、警示筛选、表格、趋势不完整状态和终态颜色均接入 `unavailable`；既有站点下拉保留被限制站点，完整本站管理入口不变。没有增加营销文案或修改业务操作。

## 集中验证与边界

- 新正式入口：`node scripts/verify-fleet-business-response-budget.mjs`。真实 central/HMAC/query schema/snapshot matching/response assembly/client stream/model；仅替换明确的 registry/receipt/read-model I/O，PG/HTTP listener/网络为 0。原始 baseline 使用 Git blob，不改工作树；副本回滚测试则读取实际恢复字节。
- 201 source 修改版：2,088,645 bytes，48 个成功 source、153 个明确 unavailable，完整目录保留，真实客户端接受；单站原快照仍完整返回。中文、emoji/转义边界、完整 envelope 恰好 2 MiB 与 +1 byte、混合状态、非变异和 metadata-only 503 均包含在矩阵中。具体逐项结果与源 SHA256 以 `output/fleet-business-response-budget-20261105/` 的最终记录为准。
- 真实 client/selectors/navigation 集中回归：75 项通过；真实 ReactDOM hook 与有限 fetch：20 项通过，包含终态无多余 GET、pending 正常完成和后续响应剥离旧数据。
- 全库 TypeScript `--noEmit --incremental false` exit 0。原 PostgreSQL fixture 拆库修复的真实 PG/HTTP 101 项、原失败日志与独立回滚证据见同日 `fleet-business-pg-teardown` 文档，不以有限 I/O 单测冒充 PG 验收。
- `fleet-business.yml` 同时接入本预算入口与原完整 protocol 的物理断开故障注入；没有跳过旧断言、提高阈值或重跑付费任务。

## 交接与未完成项

最终四产物统一封装本轮全部明确路径，记录原 hash、命令、输入、字面输出和退出状态；独立副本恢复原字节后应重新出现原 57P01 与聚合超限反例，后续编辑必须触发零写拒绝。新提交的 CI 与 CodeRabbit 覆盖须按最新 SHA 核验。

当前未合 main、未将本修复发布到 103/47、未完成生产独立 SQL 核对或用户验收。继续保留旧业务查询与控制命令共享 FIFO 的 Medium reliability 关注；UI/token 过期不是持久 command 撤销，该关注未被本字节预算修复解决。后续按独立 hardening 与发布门禁处理，不把绿色检查等同于上线或整条重构收尾。
