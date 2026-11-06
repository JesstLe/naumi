# 同步工具操作的终态一致性、补传吞吐与 47 遗留收尾（2026-11-06）

用户要求“全部清理干净，不留尾巴；你觉得该怎么办就怎么办”。r4 后的只读复查又发现三类遗留，本切片先修根因，再用系统自己的模块收尾存量。

## 调研结论（47 只读证据）

- **63 笔 `hold/manual` 计费**：60 笔是 0 积分报价（文字生成 44 + 1、画布助手 14、OCR 1；tariff 已禁用，授权与预留均为 0）。供应商已应答但处理器返回非 2xx，或流式回复中断，都按“结果未知”进入 `hold`。这类报价任何结果都不可能扣费，`hold` 没有可核对的内容，只会让企业分析和创作记录永远显示“未知/待核查”。另 3 笔付费（复刻 10、IP 检测 1、抠图 1）均无结果、无作品。
- **创作记录停在 `queued/needs_review`**：`withSynchronousOperation` 的若干出口（预占前被拒、转人工核对、结算抛错、未知待查）直接 `return`，不写创作终态；返回 `jobId` 的后台工具（3D 包装 / 3D 服装 / 服装上身）先写 `queued`，后台完成后从不回写，甚至会把已推进的任务改回 `queued`。
- **10-23 的 25 条图片记录**：任务行、计费行均不存在，作品出处（`creation_provenance.ref`）与流水中也没有任何指向它们的记录——无产出、未扣费。
- **1 个 imagegen 任务**：顶层 `status=error`，但结果快照停在 `running`；列表按结果快照优先，显示“运行中”。全站同类组合仅此 1 条（顶层 error + 结果 failed 的 1,178 条显示不变）。
- **补传积压约 5,100 条**：NAS 健康（主路径 200、约 20ms），瓶颈是每轮固定只补 2 条（每 15 秒一轮，实测 90 秒 12 条），低于当日写入速度；积压同时阻塞本地副本回收。

## 实现

- `billing/quote.ts`：新增 `isChargelessQuote`（非用量/API 成本计价，且授权与预留均为 0）；`settlementFor` 对这类报价的“未知”结果直接按 0 结清。付费报价、用量与 API 成本计价保持原有核对。
- `billing/service.ts`：新增 `closeChargelessUnknownTx`，旧代码留下的 0 积分 `hold/manual` 走同一结算路径按 0 关闭；付费或其他状态一律拒绝。
- `billing/synchronous-operation.ts`：所有出口都写创作终态——预占前被拒→`failed`；转人工核对 / 结算异常 / 未知待查→`needs_review`；只有计费确实仍在 `hold/manual` 时才写 `needs_review`，否则写 `failed`。返回 `jobId` 时不再写 `queued`，由后台任务自己收尾；新增 `finishSynchronousCreation` / `failSynchronousBackground`（后者按供应商是否明确拒绝决定“失败释放”或“保留核对”），3D 包装 / 3D 服装 / 服装上身已接入。流式中断同样区分。
- `saas/creations.ts`：结果快照仍为权威；仅当结果快照停在进行中、而任务顶层已失败时，以顶层失败为准。
- `media-assets/mirror-recovery.ts`：单轮在 12 秒预算内连续小批认领（每批 4 条、单轮上限 64 条），仍是单通道、逐条 SHA 校验与重试租约；预算用完时未处理的行不会被认领挂起。
- `scripts/ops/close-stale-terminal-states.ts`：在 Web 容器内运行。PLAN 按证据分类；APPLY 先重新推导并校验同一计划摘要，再依次：0 积分挂起按 0 结清 → 3 笔付费经 `reconcileTx` 按失败结算（不扣费、释放预留，留存核对记录）→ 用计费后的真实状态再推导一次创作计划（必须与 PLAN 一致）→ 逐条 CAS 写创作终态（`completeCreationTx`，事件 `maint47:terminal:20261106`）。不调用供应商，不改媒体，不重放任务。

## 验证（本地真实 PG + 处理器代码）

- 新增 `scripts/verify-sync-terminal-consistency.ts`：16 项 PASS——0 积分未知结清且创作为失败；付费未知保留核对与预留；预占前被拒写失败；后台任务先完成不被改回排队；后台失败按拒绝释放；流式中断分免费/付费；旧 hold/manual 只关闭 0 积分行；列表对顶层失败 + 进行中快照显示失败。
- `verify-media-mirror-eviction` 增加默认单轮清空 10 条积压，44 项 PASS；`verify-p0-nas-delivery`、`verify-imagegen-remote-put` PASS。
- 计费/创作相关：`billing-review/rules/coverage/wallet/task-ownership`、`canvas-text-failure-pg`、`saas-creation-writers`、`tool-image-operation-apib`、`canvas-task-boundaries-pg`、`identity-creation-boundaries-pg`、`admin-failure-evidence`、`supplier-scan-imported-history` PASS。
- 主线基线上同样失败、与本切片无关：`canvas-text-tasks-pg`、`saas-creations`（日期窗口断言）、`commercial-admin-owners-pg`（缺 `app_account_team_members`）、`creations-query-performance`（基线引用过旧）。
- `tsc --noEmit` 与相关文件 eslint 通过。
- 47 只读 PLAN（r4 容器，`NODE_OPTIONS=` 跳过 HTTP 观测预加载）：60 笔 0 积分结清；3 笔付费（共释放 12 积分预留）；创作 135 条→失败、6 条→成功（已结算且有交付）；保留 5 条：2 条 A+ 等待用户自己确认文案，3 条智能体回合因“视觉检查未完成”按设计标记待核查。

## r5 发布与存量收尾（`release47-main-20261106-r5`，COMPLETE）

- 固定版本：commit `5872a41b`，BUILD_VERSION `1793974025`，镜像 `sha256:6e6ac0be…`；三把锁全程持有，结束已释放。备份 `pg_dump` 1,388,254,702 字节，已复核可读，未恢复。
- 切流后 r4 Web 仍挂着 nginx 旧 worker 的 1 条长连接（2 个未跟踪 HTTP 请求；无受理任务、Agent 运行、会话或未完成活动），首次排空超时。处理：先恢复新 Worker，等待该连接自行结束（未强制断开），随后重复排空证明全部通过，r4 以 `restart=no` 停止。
- 在 r5 Web 内执行清理（PLAN 摘要 `c6548a88…`，与此前只读 PLAN 完全一致）：60 笔零积分挂起按 0 结清；3 笔付费按失败核销，留存 3 条核对记录，0 扣费，释放预留 12 积分，`app_gen_reservations` 清零；创作记录 135 条→失败、6 条→成功；保留 5 条（2 条 A+ 等待用户自己确认，3 条智能体视觉检查未完成标记）。
- 补传通道：90 秒内补传 242 条（旧逻辑上限 12 条），积压随后持续下降（14:25 4,608 → 14:30 3,895）。
- 最终核对：挂起/预占计费 0；UNKNOWN 活动 0；未知 Worker 轮次 0；r5 后无 5xx；仅剩运行中的补传活动。保留轮次：删去 1102-r2，保持最近 5 轮；磁盘 67%。

## 模块交接

```text
模块与职责：计费（报价规则、结算、关闭零积分未知）；同步工具操作（创作终态）；创作读取（实时状态）；媒体补传通道。
公共接口、依赖方向、数据/状态/事务归属：isChargelessQuote / closeChargelessUnknownTx 归计费模块；finishSynchronousCreation / failSynchronousBackground 归同步操作，路由只调用；创作写入仍经 completeCreationTx；运维工具只调用上述模块接口，不直接改表。
本次实现与迁移状态：已合入 main（`5872a41b`）并经 r5 上线 47；存量已收尾。
验证命令、结果及证据层级：本地真实 PG 回归 + 47 r5 线上验收（见上）。
未完成项与下一步：补传积压预计半小时内清空，本地副本按 12 小时保留期后逐步回收；保留的 5 条按设计不改。
```
