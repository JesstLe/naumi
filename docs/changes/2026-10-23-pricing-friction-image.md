# 图片与通用 billing 客户端：最小删减

基线：`84fc45effa74b15785dfaaa39cd39598b19734ca`。本模块只改
`imagegen/{plan,batch,canvas-client,quotes}.ts`、`billing/client.tsx`，新增定向脚本和本文。
封版 P2 后续新增独占 `src/app/api/imagegen/plan/route.ts`；原 `OWNED_FIVE` 基线投影不变。

## 实现

- 单图/多步骤/批次 `confirmationRequired` 保留协议字段，统一返回 `false`；
  api-cost-plus 仍使用服务器 `authorizedCredits`，不删完整后台 BillingQuote。
- 图片和通用 billing 客户端删除 `window.confirm` 与通用 catalog 版本交叉拒绝；
  报价请求、原操作标识、scope guard 保留；画布明确未受理的一次同 operation 重试保留。
  通用客户端始终提交原服务端 quote，不因 TTL 预刷新或自动重 POST，旧服务器报价错误
  保留原 operation，用户显式重试仍使用原 quote；正常新请求的后台 quote 继续。
  未知/已受理结果不增加自动 POST；画布恢复仍只查询原回执。
- `frozenImagegenQuote` 不要求 `confirmed:true`，缺字段表示正常提交；
  显式 `confirmed:false` 仍取消尚未受理请求，既有 receipt-first 优先级不变。
- imagegen 维护 TTL 不再拒绝原 operation/fingerprint 绑定的报价。
  同意图重复预览返回原 quote ID、完整原计划、原价格，不使用 current 涨价重建；
  无 DB 的内存路径不因新预览清除尚未受理的旧意图。
- owner、scope、fingerprint、真实余额、服务端权限/素材访问、幂等账务机制保持。

## 集中验收

`scripts/verify-pricing-friction-image.ts` 提供 `--mode baseline|modified` 和可选
`--source-root`。只投影本模块五个源文件；其余依赖保持共享工作树当前状态。
实际执行画布客户端、BillingProvider hooks 回调和服务端函数，不以 grep 代替行为测试。
父提供的本轮隔离 PostgreSQL 使用随机 schema，所有连接在 finally 关闭，schema 删除；
HTTP 传输全阻断，供应商调用为零。

覆盖：高积分/多步骤/cost-plus 普通点击、跨 catalog、TTL 原价、缺确认/显式取消、
未知恢复无重提、明确未受理同 operation、scope/owner/fingerprint、重复 receipt、
正常足额单次结算与余额不足。具体命令、输出与退出码见本模块 `VERIFICATION.txt`。

首轮本模块集中结果：baseline 22 组 / 43 checks，modified 22 组 / 53 checks，
均 exit 0。HTTP 对照只投影独占五文件，父当前 handler 保持一致：维护 TTL 已过期且
缺 confirmed 的原意图从 409 → 200；显式 false 返回 400 / accepted=false / 零新父任务；
非 boolean 仍 400。generic 过期 12 积分 quote 直接保留 original ID / 12 积分，
额外 quote 请求 0；旧服务器返回过期错误也不自动 POST，显式重试保持同 operation。
真实 PG 完整原 quote 结算 6 积分，仅一笔 consume，剩余 14；15 积分请求明确余额不足，
预留债务 0。每轮 schema 与连接已清理。

既有 `node scripts/verify-imagegen-scope-receipt.cjs` 未修改，实跑 exit 1：21 passed / 1 failed；
唯一失败为第 132 行旧协议把 `confirmed:undefined` 当 malformed，而父已改为允许省略。
原始日志保留为 `image/scope-receipt.log`；新 harness 已覆盖缺字段/显式 false/非 boolean
及 receipt-first，不将旧脚本结果冒充全绿。父指出的 verifier 两处 TypeScript 类型
已改为 `unknown` catch 与 `FeatureId` 索引，未重复运行全项目 tsc。

## 边界与交接

### 封版 P2：原 quote 复用前移到 plan HTTP 入口

- 确认缺陷：仅在 `issueImagegenQuote` 复用旧 quote 仍偏晚，plan HTTP 入口此前会先调用
  current planner，模型随后隐藏/停用/移除可能误拦原意图。
- `plan/route.ts` 在来源、认证与请求 schema 校验后先 `latestImagegenQuote`；命中则通过
  `frozenImagegenQuote` 重查当前功能授权与素材归属，返回 `publicImagegenPlan`、原 quote ID
  和原 expiresAt。仅未命中才调用 current 单图/批次 planner，后续真实通道可用性不变。
- 沿用现有 helpers，无新框架。新增实际 plan HTTP handler case，覆盖 current 模型 disabled、
  hidden、planner poison 均不影响原 quote；当前 feature 撤销和 input access 拒绝仍阻断；
  新 operation 继续 current planner / current 价格。
- 当前 plan route 标记为 `CURRENT_PLAN_ROUTE_PARENT_DEPENDENCY`，不添加到 `OWNED_FIVE`；
  baseline 使用未过期 quote、既有 `confirmed:true` helper 兼容形态。父改的 VM `projected`
  变量保留。本次只运行 image modified 一次，不重跑 baseline/tsc/lint/benchmark/回滚；
  benchmark 与最终回滚由父统一执行。
- 本次单次 modified 实跑：`MODIFIED=PASS CASES=25 CHECKS=74`，exit 0；原 quote 的三个
  current 误拦场景均 200 / 原 ID / 原 6 积分，单图与批次 current planner 调用均为 0；
  feature/input 拒绝均 400，新 op 的 poison/hidden/正常 current 分别 400/409/200，
  正常新 op 使用 150 积分。PG cleanup 已通过，供应商与外部 HTTP 均 0。
  原始输出：`output/pricing-friction-removal-20261023/image/plan-route-p2/modified.log`。

- generic imageBillingQuote TTL、billing/request.ts、Agent、工作台、video 均由父/其他方负责。
- 父已单独修改 HTTP 最小 quote 引用协议，允许省略 `confirmed`，仍拒非 boolean；
  本脚本只读加载当前 HTTP handler，覆盖缺字段正常与 `false` 停止，不修改该文件。
- 没有全套测试、构建、外网、真实供应商、生产操作或 Git commit/push/fetch。
- 本地修改不等于合入或发布；模块证据保存在 `output/pricing-friction-removal-20261023/image/`。
