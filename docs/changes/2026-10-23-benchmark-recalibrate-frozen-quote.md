# benchmark 定标更新：frozen-quote 按服务端合同定价新契约（2026-10-23）

## 背景

`905c8c63` 起定价摩擦移除（e1ee8442 等）改变了报价语义：维护性 TTL 过期不再拒绝同输入提交，`assertQuotedVersion` 成为兼容空入口。frozen-quote 场景断言仍停留在旧的 409/IMAGE_QUOTE_EXPIRED 世界，modified 全红。

## 变更（scripts/verify-imagegen-frozen-quote-pg.ts）

- 三笔过期合同提交（legacy 新 operation、imagegen 单张、batch）整体挪到 fallback 计数断言之后执行，原断言链与计数（wires/ledger）零改动——避免异步受理任务污染既有计数。
- 新增"过期合同行为"验证段：过期同输入提交受理 200、交付 done、按冻结价 12 结算（而非当前价 14）。
- `assertQuotedVersion` 断言由 throws 改 doesNotThrow（函数已被重做为 no-op 兼容入口）。

## 结果

- 15 场景 14 EXPECTED；rate 场景仍 ERROR——guard projection 的 stub 体系需按新 plan 流程重建（latestImagegenQuote/frozenImagegenQuote/publicImagegenQuote 等 export 进入限流 guard 执行面，逐层放行不收敛，留待基准维护者重建），本轮如实保留红。
- 复跑命令：隔离 PG（fixture 凭据、非 5432 端口）+ `NAUMI_VERIFY_ISOLATED_DB=1 node scripts/verify-imagegen-history-benchmark.cjs --phase compare --suite history`。
- 零生产修改、零外部供应商调用、员工精确重放保持 0。
