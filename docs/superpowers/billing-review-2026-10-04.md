# 计费模块最终审查与验收

范围：现有应用内统一计费配置、报价、钱包、结算、商品与赠送；保持原图像与 Flow 供应商链路，不切换 Router，不调用真实付费供应商。

独立审查覆盖 e75846c..3482383。7 项发现均按用户实际影响评定为 Important，进入同一修复轮；没有 Critical 或待办 Minor。以下测试先复现故障，再验证修复；新增 review 回归加入完整计费套件。

| 发现 | 修复与验证 |
|---|---|
| 未带价格版本的旧客户端可以绕过新价格确认 | 仅原计费方式完全兼容或免费请求接受省略确认；改价/规则后返回 PRICE_CHANGED，真实工具路由验证未调用供应商 |
| 同步工具结算失败丢失产物或遗留无法核对的预占 | 先保存成功响应；结算异常转人工核对，显式重试不执行供应商；后台暴露过期请求与未知任务 |
| 按整个请求/任务计费忽略实际执行质量 | 按成功结果中最高实际单价结算，缺质量拒绝；后台支持逐质量成功数量 |
| 画布在资金过期且重试预算耗尽时放弃已有结果 | 保存结果转人工核对；补足资金并核对后从 checkpoint 恢复，不重新生图 |
| 视频/画布重试更换业务与计费编号，并重复上传 | 语义意图保留原编号并写回 JSON；视频批次保存编号、上传回执与完成槽位；真实页面截断响应后验证编号/参数一致 |
| 未配置数据库的演示页面无法取报价 | 明确 demo 免费配置，禁用收款；配置了数据库但读取失败仍返回 503 |
| 后台缺少计费单位编辑 | 增加按图片/项目/整个任务选择，模拟和发布差异展示同步验证 |

本地 PostgreSQL 16 与真实业务路由 fixture、模拟供应商覆盖事务回滚、并发、重复回调、冻价、失效报价、未知结果和人工核对。浏览器验收覆盖后台发布/冲突/恢复、隐私、单位切换、普通生图及视频/画布重试。最终本地验收：17/17 计费套件、8/8 生产构建浏览器验收、TypeScript 检查与生产构建通过。另验证同一钱包的旧预占/流水与新报价结算并发，余额 89、预占 0、消费流水恰好 2 条；线上结果见发布记录。

生产检查采用只读设置检查、数据库隔离副本与离线固定镜像；线上验证不发起付费生图。旧应用可读取新增 schema，不代表它理解已调整的价格或新任务。回滚必须保持维护状态与 worker 停止；只有当前配置仍等于启动配置且无新在途账务时，才可审核开放旧版本。

CI 另外复现同一无数据库演示问题在管理员内部报价页的路径：签名登录后返回500，修复后200；pricing-access 本地 RED→GREEN，仍在同一修复轮内。最终复测串行p95 8.29ms、并发10 p95 24.54ms，错误0。

## 实施中的判断及判断错误的代价

- Ruling: Work in existing codex/billing-module-design checkout — approved plan explicitly preserves this branch/workspace; no extra worktree consent needed. Cost if wrong: concurrent edits need careful file-specific staging.
- Ruling: Config initialization receives the locked transaction client and reads legacy settings directly — avoids recursive new-config reads and connection pool exhaustion; cost if wrong: first startup unavailable, caught by concurrent initialization test.
- Task 2: complete (8dab03a..HEAD; dynamic quotes RED missing -> GREEN; fractional BYOK and whole-request failure overcharge RED -> GREEN; feature cost priority RED -> GREEN; verify:billing-rules PASS; tsc PASS; baseline PASS). Ruling: reserveBps >=10000, permits extra reservation up to100000, rejects unprotected spending; preserves affordability. Cost if wrong: excess hold, simulator/quote discloses amount.
- Task 4 ruling: Legacy db wrappers migrate alongside their domain callers in Tasks 6–9; no partially switched runtime before assembly. Frozen quote includes debit order; legacy quotes retain expires-first. Added rollback injection after debit and grant/actor/admin-held-balance checks.
- Task 7 ruling: Common synchronous request adapter uses AsyncLocalStorage (existing BI pattern) to carry the authenticated feature, quote, content fingerprint and operation through legacy helper signatures and background tools. Prices remain explicit named feature keys at route boundary; no supplier routing change. Content fingerprint normalizes multipart boundaries; retained result JSON is limited to 256 KiB, absent result returns reconciliation state. Costs: O(input bytes) fingerprint, same as existing upload reading; measure in Task 12. Failed zero-charge release after expired funding RED -> GREEN. Legacy orphan release now independent of current metering; new billing holds protected from sweeper.
- Task 8 ruling: Video/canvas fingerprint freezes user parameters independently of mutable provider/recovery state. New tasks settle using stored metering and quote in the original domain transaction; legacy tasks keep compatibility. Full FIFO deduction now fails atomically when expired funding is insufficient. Test evidence: billing-async-tasks, video-postgres, canvas-image-postgres, video-reliability, video-memory, global-image-quality, credit-billing, tsc and diff-check PASS; staged video media survives settlement failure and holds survive sweeping.
- Task 10: UI four tests, desktop/mobile checks, Agent, reconciliation, public fact alignment, private-bi, single-product, tsc/diff PASS. Pricing-access PASS against local listener; standalone start on unbuilt dev output exits before cleanup listener, fix harness and rerun built mode under Task 12. Ruling: dynamic Canvas/GenChat exact quote dialog, public provider facts derived from execution defaults; new redeem estimate config key preserves previous estimate. Task 12 must verify uncertain browser retry identity across domain creation.
- Task 11: frozen costs use operation settlement_result and committed ledger, currency/unknown nullable, audit enrichment never retries suppliers. Actual blocked image route audit preserves old cost version across cost-only edit; cost-audit/private-bi/BI-management/credit-billing/tsc PASS. Ruling: legacy credit test now snapshots and restores config/settings, preventing other acceptance fixtures from changing its baseline.
- Task 12: Ruling: retained highQualityPaidFen as an inactive legacy compatibility field; removed misleading edit control. Current access is unchanged; conditional paid-total tariffs cover differentiated prices. Cost if wrong: operators need an explicit new access requirement.
- Task 12: Ruling: demo users without an authoritative database show zero rather than a hardcoded grant; charged production remains fail-closed. Cost if wrong: demo credit display changes.
- Task 12: Ruling: compare original versus final whole-route fixture (4.37s/3558 SQL -> 4.98s/4827 SQL); separate warm quote+reserve+settle benchmark p95 6.76ms/22.41ms serial/concurrency10, one new config read and zero settlement reads. A missing original per-request benchmark cannot substantiate a per-request latency delta. Cost if wrong: deployment latency needs observation.
- Final: Ruling: production backup/version/old-image rollback was not judged — Task13 uses real read-only preflight, protected full media offhost backup and isolated production schema copy, live deployment pending — cost if wrong: irrecoverable deployment.
- Final: Ruling: supplier charges/undocumented behavior was not judged — no paid probes authorized, frozen costs explicitly estimates — cost if wrong: requires supplier invoice reconciliation.
- Final: Ruling: supplier route/model availability was not judged — preserve original routing, verify actual configuration hosts before/after release — cost if wrong: changed provider or service.
- Final: Ruling: preexisting cutout/upscale URL fetch security was not judged — no new regression established; broader SSRF audit remains separate — cost if wrong: original network-fetch risk remains.
- Final: Ruling: historical Pro license concurrency was not judged — no new regression established and historical products stay unavailable — cost if wrong: re-enabling licenses needs separate acceptance.
- Final: Ruling: final whole-regression performance varies (4.98–7.87s vs original4.37s); report latest7.87s/4825SQL honestly, not only faster sample; isolated warm pipeline p95 8.29/24.54ms and zero errors — cost if wrong: production latency still needs observation.

未处理 Minor：无。
