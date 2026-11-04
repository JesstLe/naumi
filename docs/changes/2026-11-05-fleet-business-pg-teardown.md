# Fleet business CI：等待物理连接退出后拆除隔离库

## 职责与基线

- PR #11，分支 `codex/fleet-business-data-103-20261104`，基线 `b26a84e8ea22a7429e2dba9c7379738f8ea196a7`。
- 本轮只维护测试进程自有的 PostgreSQL fixture 生命周期；生产查询、dispatch、receipt、ACK、账务和业务数据规则均不修改。
- 实际失败：Actions run `41866398381` / job `126701570520` 的队列兼容 16 项已通过，清理阶段随后出现 `error: terminating connection due to administrator command`，SQLSTATE `57P01`，进程 exit 1。原始日志保留在 `output/fleet-business-pg-teardown-20261105/CI_FAILED.stdout.txt`。

## 调研与修复

`pg-pool` 从内部连接列表移除 client 并可完成 `Pool.end()`，但底层 client 的物理 `end` 事件可能稍后才发生。旧脚本立即 `DROP DATABASE ... WITH (FORCE)`，会在这段间隔终止仍在退出的 idle client，并触发未处理的 pool error。该失败不是业务只读或 mutation 幂等断言失败。

`verify-fleet-business-queue-compat.ts` 在 source pool 的公开 `connect` 事件中登记每条连接的 `end` Promise。清理顺序现在是关闭 HTTP 服务、结束 source pool、等待所有物理连接结束、再次核对随机 fixture 库名、执行非强制 `DROP DATABASE`。环境变量恢复放在独立 `finally`。如果仍有其他连接，普通 DROP 失败，不用 FORCE 终止它们。

测试专用 `scripts/fixtures/fleet-business-delay-pg-close.cjs` 仅接受 loopback `127.0.0.1:65298/fleet_protocol_fixture` 且 `NAUMI_VERIFY_ISOLATED_DB=1`。它仅将当前进程的随机 `fleet_receipt_compat_<32 hex>` client 物理退出延迟 200ms，使原竞态确定可见；没有注入则令成功进程失败。该延迟是故障注入，不是产品等待或测试同步条件。CI 在原完整 protocol 命令加载它，仍执行原 101 项断言。

## 集中验证与证据层级

- 未修改的原脚本 + 同一物理断开延迟：完整队列兼容 16 项通过，随后 `57P01`，exit 1；本地确定性重现与实际 CI 一致。
- 修改版 + 断开延迟：`FLEET_BUSINESS_PROTOCOL=PASS assertions=101`，物理退出 1 条、强制断开 0，exit 0。
- 修改版正常时序：完整 101 项通过，exit 0；原缺表/列失败 ACK、后续 ban、lost ACK 和控制历史隔离矩阵全部保留。
- 四产物、逐文件原始/修改 SHA256、独立副本回滚、恢复后同一故障注入复现、后续编辑零写拒绝和复开结果统一记录在 `output/fleet-business-pg-teardown-20261105/final/VERIFICATION.txt`；最终提交另写 `FINAL_SEAL.json`。

上述均为本地隔离 PostgreSQL / HTTP 验证。新提交的 CI、CodeRabbit 覆盖、103 中央发布、47 最小 connector 更新、线上独立 SQL 核对和用户验收分别等待实际结果，不由本地通过代替。不合 main，不将本修复描述为已经发布。

## 审查残留：查询队列与控制操作

CodeRabbit 已完成的旧轮审查覆盖 `d883a363`；本轮通知的 `Review finished` 不是 `b26a84e8` 的通过回执。已修五项评论与协作状态门禁不重复修改。

另有 Medium reliability 架构关注仍保留：90 秒 UI 等待与 180 秒 token 有效期不撤销持久 command；`server.ts` 的全队列 FIFO 仍可为旧业务查询重新签发五分钟租约。断线前或心跳宽限期内积压的不同读查询可能增加后续控制等待。持续离线超过心跳门槛不会继续新增查询，不能描述成无条件无限入队。现有缺 receipt 结构、lost ACK 与 generic history 测试不等于控制优先或查询过期验收，亦无该风险的生产发生频率、实际控制时延或 SLO 违约证据。

本 CI 修复不改变产品调度合同，也不把这个关注标为已解决。控制优先可作为独立发布前 hardening，保留 mutation FIFO、租约、晚 ACK 和收据幂等，并以旧读积压/活跃读租约/后续控制/读晚 ACK/活跃 mutation/撤权矩阵集中验收；不因 UI 超时伪造 failed、删除收据或推断 mutation 未执行。
