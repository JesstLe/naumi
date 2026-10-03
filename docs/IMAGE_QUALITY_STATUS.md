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

内测期按**请求质量档**计费，单价表在 `src/lib/mock-data.ts` 的 `QUALITY_BEANS`（调价只改这一张表）：

| 档位 | low | medium | high | xhigh | max | auto |
|------|-----|--------|------|-------|-----|------|
| 豆/张（测试价） | 4 | 6 | 10 | 14 | 18 | 6 |

- 公式：预扣 = `张数 × qualityBillBeans(请求档)`；结算 = `实际成功张数 × qualityBillBeans(请求档)`（读任务审计快照，恢复/重放口径不变）；失败全额退豆。
- 非法/空档按 medium 价计费（与提交前回退的执行档一致）。
- BYOK（用户自带接口）仍豁免站内计费。
- 这是**测试价目**，只为让台账能区分档位；正式上线前替换为定价表（模型 × 分辨率 × 质量，见同事 `codex/pricing-page` 分支的 `src/lib/pricing.ts` 定价稿）。
- 注意：内测期计费**不再乘分辨率**（分辨率仍控制出图放大与尺寸，不进公式）；接入真实定价时需把分辨率维度加回。

## 回退策略（三层，按顺序）

1. **提交前回退**（开关驱动）：`NAUMI_IMAGE_QUALITY_SUPPORTED` 未开启时，任何非默认档在提交上游前改写为默认档，上游永远收不到未支持的参数。
2. **同通道退默认档**（错误驱动）：上游返回 400 且报文同时提到 quality 与"不支持/非法"（`isQualityUnsupportedError`）时，`openaiImages` 内以默认档原通道重试一次，出图不受影响。非 400（超时/5xx）不命中，走网关恢复路径。
3. **BYOK 回退默认 API**（错误驱动）：BYOK（user-openai-images）上游连默认档也拒绝时，切换到站内默认 API（`getOpenAISettings` 的 key，即 tdh key）+ 默认模型 + 默认档重试一次，请求形态与老链路完全一致。new-api-flow（chat/completions）本来就不下发 quality 参数，无需回退。

三层回退都在 `paidOperation` 之内完成，用户侧账单不变（仍按请求档测试价目预扣/结算）；已提交但超时/结果不明的任务仍走网关恢复路径，不改参数、不换通道重发（避免重复付费）。

## 成本审计（内部毛利核算）

用户被扣费**始终按请求档保持不变**；每次回退真实触发后，向内部表 `app_image_cost_audit` 补记一条核算记录：

| 字段 | 含义 |
|------|------|
| `requested_quality` / `executed_quality` | 请求档（计费依据）/ 实际执行档 |
| `upstream` | 真实触发的上游，如 `byok:<model>`、`default:<model> (from byok:<model>)` |
| `images` | 张数 |
| `billed_beans` | 用户实扣豆 = 张数 × 请求档单价（与计费同一张 `QUALITY_BEANS` 表，口径必然一致） |
| `cost_beans` | 应扣成本豆 = 张数 × 执行档单价 |
| `margin_beans` | 毛利 = billed − cost |

- 层 2（同通道退档）**按张**记录（`reason=quality-downgrade`）；层 3（BYOK→默认 API）**按任务批量**记录（`reason=provider-fallback`）。层 3 的重试请求强制空档，不会再触发层 2，**不会重复计数**。
- 写入是 best-effort：任何失败只打 `[cost-audit]` 日志，绝不影响出图与计费主流程；无 PG 时自动跳过。
- 查询入口：`listImageCostAudit(limit)`（`src/lib/db.ts`），或直接 SQL 按天聚合做利润报表。
- 用户可见的 `app_ledger` 流水**完全没有变化**——这是纯内部表。

## 已知边界

- 回退识别基于错误报文文本匹配（400 + quality 关键词），上游若静默忽略 quality 参数（不报错），不会触发回退——出图成功但质量未提升，属可接受的测试态表现。
- 仅生图页接入；画布、套图、A+ 等入口仍按各自原有口径计费（套图/A+ 走 `imageOperationQuality` 环境默认档）。
- 单测以验证脚本形式存在（仓库无 jest/vitest 设施）。

## 验证命令

```powershell
npx tsc --noEmit
npx tsx scripts/verify-quality-billing.ts                 # 开关关闭态
NAUMI_IMAGE_QUALITY_SUPPORTED=1 npx tsx scripts/verify-quality-billing.ts  # 开关开启态
```

## 本次验证结果（2026-10-03）

- `npx tsc --noEmit`：通过。
- ESLint（改动文件）：通过，无警告。
- `verify-quality-billing.ts` 开关两态各 39 项断言：全部通过（请求档审计保留、执行档随开关回退/直传、回退标记、单价表、预扣=结算公式一致性、错误识别命中/不命中边界、成本审计核算三场景）。
- 审计写入依赖真实 PG，本地未做落库 E2E；联调时用 SQL 核对：`SELECT * FROM app_image_cost_audit ORDER BY created_at DESC LIMIT 20;`
- 完整任务 E2E（真实 PG + 上游）需联调环境执行；上线前需把任务审计字段与积分流水人工核对一次。

## 接线真实供应商后的操作清单

1. 上游原生接口确认接收 quality 字段并通过真实出图验收。
2. 环境设置 `NAUMI_IMAGE_QUALITY_SUPPORTED=1`。
3. 用 `QUALITY_BEANS` 测试价目跑一轮各档真实生成，核对审计 `requested/executed/fallbackReason` 与积分流水。
4. 定价负责人审核后，以正式定价表替换 `QUALITY_BEANS`（如需恢复分辨率维度，同步改三处计费点：POST 预扣、`runJob` 两处结算，以及前端 `costPerImage`）。
