# 生图质量档能力状态

更新时间：2026-10-03

## 目标

质量档（low/medium/high/xhigh/max + auto）功能已全链路埋入生图页：前端可选、请求上行、审计留痕、上游不支持时自动回退默认档，**不影响线上用户出图**。当前处于内测阶段：积分无限，重点是跑通「选什么档 → 审计记录什么 → 按什么档扣费」的完整链路。

## 能力开关

```env
# =1 表示当前接线的上游会真实处理 quality 字段（原生接口适配完成）
# 未设置/其他值（当前默认）：任何非默认档在提交上游前回退默认档执行
NAUMI_IMAGE_QUALITY_SUPPORTED=1

# 默认档/回退档（缺省 medium）
OPENAI_IMAGE_QUALITY=medium
```

## 执行链路

1. **前端**：生图页质量选择器（`generate-client.tsx`）。开关关闭时非标准档置灰并提示「按标准档出图与计费」，选择仍随请求上行；开关开启后五档可选。
2. **能力暴露**：`/api/config` 返回 `imageQualityCapable`。
3. **入口解析**（`generate-image/route.ts` POST）：`resolveImageQuality(p.quality)` 固化了执行档——`p.quality` 直接改写为实际执行档（保证任务恢复/重放确定性），原始请求档与回退原因写入任务快照审计。
4. **上游执行**（`openaiImages`）：按固化后的执行档透传 `quality`。开关关闭时恒为默认档，上游永远收不到未支持的参数。
5. **审计**：任务快照与 GET 完成响应均携带 `quality: { requested, executed, fallbackReason }`；网关 `paidOperation` 操作对象同步携带执行档。

开关关闭时的回退只发生在**提交前**。已提交但超时/结果不明的任务走网关恢复路径，不改参数、不换通道重发（避免重复付费）。

## 计费（内测阶段）

内测期按**请求质量档**计费，单价表在 `src/lib/mock-data.ts` 的 `QUALITY_CREDITS`（调价只改这一张表）：

| 档位 | low | medium | high | xhigh | max | auto |
|------|-----|--------|------|-------|-----|------|
| 积分/张（测试价） | 4 | 6 | 10 | 14 | 18 | 6 |

- 公式：预扣 = `张数 × qualityBillCredits(请求档)`；结算 = `实际成功张数 × qualityBillCredits(请求档)`（读任务审计快照，恢复/重放口径不变）；失败全额退积分。
- 非法/空档按 medium 价计费（与提交前回退的执行档一致）。
- BYOK（用户自带接口）仍豁免站内计费。
- 这是**测试价目**，只为让台账能区分档位；正式上线前替换为定价表（模型 × 分辨率 × 质量，见同事 `codex/pricing-page` 分支的 `src/lib/pricing.ts` 定价稿）。
- 注意：内测期计费**不再乘分辨率**（分辨率仍控制出图放大与尺寸，不进公式）；接入真实定价时需把分辨率维度加回。

## 回退策略（三层，按顺序）

1. **提交前回退**（开关驱动）：`NAUMI_IMAGE_QUALITY_SUPPORTED` 未开启时，任何非默认档在提交上游前改写为默认档，上游永远收不到未支持的参数。
2. **同通道退默认档**（错误驱动）：上游返回 400 且报文同时提到 quality 与"不支持/非法"（`isQualityUnsupportedError`）时，`openaiImages` 内以默认档原通道重试一次，出图不受影响。非 400（超时/5xx）不命中，走网关恢复路径。
3. **BYOK 回退默认 API**（错误驱动）：BYOK（user-openai-images）上游连默认档也拒绝时，切换到站内默认 API（`getOpenAISettings` 的 key，即 tdh key）+ 默认模型 + 默认档重试一次，请求形态与老链路完全一致。new-api-flow（chat/completions）本来就不下发 quality 参数，无需回退。

三层回退都在 `paidOperation` 之内完成，用户侧账单不变（仍按请求档测试价目预扣/结算）；已提交但超时/结果不明的任务仍走网关恢复路径，不改参数、不换通道重发（避免重复付费）。

## 成本审计（内部测试核对）

所有成功图片在结算后逐张写入 `app_image_cost_audit`，失败图片不记收入或成本。每张图使用稳定的任务 ID 和图片 ID 做幂等写入；执行档位、实际通道与回退原因保存在任务结果中，恢复时不因环境开关变化而重新计算。

| 字段 | 含义 |
|------|------|
| `requested_quality` / `executed_quality` | 请求档 / 实际执行档 |
| `upstream` | 实际成功出图的通道 |
| `billed_credits` | 从已结算 `app_ledger` 读取的实际扣分，按成功图片分摊 |
| `cost_credits` | 平台承担的执行档测试积分成本估算；用户自己的 BYOK 通道为 0 |
| `margin_credits` | 测试积分差额 = 实扣 − 估算成本 |
| `reason` | `generated`、`quality-downgrade` 或 `provider-fallback` |

BYOK 同通道退档仍实扣 0；BYOK 回退到平台通道仍实扣 0，但记录平台承担的估算成本与负差额。关闭计费的任务也以实际流水的 0 为准。普通部分成功任务只结算成功张数，并释放整个预扣占位。

这些数值是内测积分估算，**不能直接作为供应商人民币成本或财务毛利**。查询入口为 `listImageCostAudit(limit)`。写入失败只记录日志，不阻断出图。旧 `*_beans` 列自动原地改名为 `*_credits`，保留已有记录；余额、充值、整数流水制度不做迁移。

完成响应提供实际 `executedQualities`；批次档位不一致时 `executed=mixed`。内部供应商和成本明细不向生成页响应公开。

## 已知边界

- 回退识别基于错误报文文本匹配（400 + quality 关键词），上游若静默忽略 quality 参数（不报错），不会触发回退——出图成功但质量未提升，属可接受的测试态表现。
- 仅生图页接入；画布、套图、A+ 等入口仍按各自原有口径计费（套图/A+ 走 `imageOperationQuality` 环境默认档）。
- 单测以验证脚本形式存在（仓库无 jest/vitest 设施）。

## 验证

```sh
npx tsc --noEmit
npx tsx scripts/verify-quality-billing.ts
NAUMI_IMAGE_QUALITY_SUPPORTED=1 npx tsx scripts/verify-quality-billing.ts
NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://fixture:password@127.0.0.1:5432/fixture npm run verify:credit-billing
NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://fixture:password@127.0.0.1:5432/fixture npm run verify:image-gateway
```

计费回归使用真实 PostgreSQL 和本机模拟上游，覆盖成功、部分成功、全失败退款、同通道退档、混合档位、BYOK 两种回退、关闭计费、已结算任务恢复与旧审计列升级，不调用付费供应商。CI 同样运行此回归。网关回归验证不明结果保持挂起、原参数恢复和独立入口结算。

`src/lib/pricing.ts` 与 `/plans` 保留同事的待审核方案，统一为积分名称，醒目标明参考方案。小数报价尚未接入整数余额和流水；内测实际扣分仍以生成前提示与使用记录为准。

## 接线真实供应商后的操作清单

1. 上游原生接口确认接收 quality 字段并通过真实出图验收。
2. 环境设置 `NAUMI_IMAGE_QUALITY_SUPPORTED=1`。
3. 用 `QUALITY_CREDITS` 测试价目跑一轮各档真实生成，核对审计 `requested/executed/fallbackReason` 与积分流水。
4. 定价负责人审核后，以正式定价表替换 `QUALITY_CREDITS`（如需恢复分辨率维度，同步改三处计费点：POST 预扣、`runJob` 结算，以及前端 `costPerImage`）。
