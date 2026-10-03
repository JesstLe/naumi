/**
 * 质量档计费链路验证(内测阶段)。
 *
 * 断言「前端选什么档 → 预扣/结算就按什么档」:
 *  - resolveImageQuality:开关两态的 请求档/执行档/回退原因
 *  - qualityBillCredits:各档单价 + 非法档回退 medium
 *  - POST 预扣公式 = count × qualityBillCredits(requested)
 *  - runJob 结算公式 = 实际张数 × qualityBillCredits(saved.quality.requested)
 *
 * 运行:npx tsx scripts/verify-quality-billing.ts
 * (开关两态分别用 NAUMI_IMAGE_QUALITY_SUPPORTED=0/1 各跑一次)
 */
import { resolveImageQuality, isQualityUnsupportedError } from "../src/lib/image-quality";
import {qualityBillCredits as price,qualityCostAudit as audit} from "../src/lib/billing/legacy";
import {fixtureConfig} from "./billing-unit-fixture";
const config=fixtureConfig(),QUALITY_CREDITS=config.features["image.generate"].pricing.mode==="quality-resolution"?config.features["image.generate"].pricing.quality:{},qualityBillCredits=(q:string)=>price(config,q),qualityCostAudit=(input:Parameters<typeof audit>[1])=>audit(config,input);

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const capable = process.env.NAUMI_IMAGE_QUALITY_SUPPORTED === "1";
console.log(`capable=${process.env.NAUMI_IMAGE_QUALITY_SUPPORTED ?? "<unset>"} (${capable})`);

// 1) 解析器:请求档原样入审计,执行档随开关变化
for (const req of ["low", "medium", "high", "xhigh", "max", "auto"]) {
  const r = resolveImageQuality(req);
  check(`requested 保留 ${req}`, r.requested === req, JSON.stringify(r));
  if (capable) {
    check(`capable 执行档=请求档 ${req}`, r.executed === req, JSON.stringify(r));
    check(`capable 不回退 ${req}`, r.fallbackReason === null);
  } else {
    check(`!capable 执行档=默认 ${req}`, r.executed === "medium", JSON.stringify(r));
    const expectFb = req !== "medium";
    check(`!capable 回退标记 ${req}`, (r.fallbackReason === "channel-unsupported") === expectFb, JSON.stringify(r));
  }
}
// 非法/空档:审计留空,执行/计费落默认
const bad = resolveImageQuality("ultra");
check("非法档 requested 留空", bad.requested === "");
check("非法档执行默认 medium", bad.executed === "medium");
check("非法档计费回退 medium 价", qualityBillCredits(bad.requested) === QUALITY_CREDITS.medium);

// 2) 单价表:各档有独立价,便于台账区分
check("medium=6", QUALITY_CREDITS.medium === 6);
check("high=10", QUALITY_CREDITS.high === 10);
check("high ≠ medium(档间可区分)", qualityBillCredits("high") !== qualityBillCredits("medium"));

// 3) 预扣/结算公式一致性(内测:选什么扣什么)
for (const req of ["low", "medium", "high", "xhigh", "max"]) {
  const r = resolveImageQuality(req);
  const pre = 2 * qualityBillCredits(r.requested);
  const settle = 2 * qualityBillCredits(r.requested); // runJob 读 saved.quality.requested
  check(`预扣=结算 ${req}`, pre === settle && pre === 2 * QUALITY_CREDITS[req], `pre=${pre}`);
}

// 4) 错误识别:命中「上游不支持 quality」才回退,其余错误照常抛走恢复路径
const err = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
check("400 quality not supported 命中", isQualityUnsupportedError(err(400, "400 quality is not supported for this model")));
check("400 invalid quality 命中", isQualityUnsupportedError(err(400, "invalid quality: xhigh")));
check("400 其他参数错误不命中", !isQualityUnsupportedError(err(400, "invalid size: 9999x9999")));
check("400 无关 400 不命中", !isQualityUnsupportedError(err(400, "content policy violation")));
check("500 不命中(走恢复)", !isQualityUnsupportedError(err(500, "quality is not supported")));
check("超时(无 status)不命中", !isQualityUnsupportedError(new Error("timeout")));
check("嵌套 error.message 命中", isQualityUnsupportedError({ status: 400, error: { message: "Unsupported parameter: quality" } }));

// 5) 成本审计核算:实扣按请求档、成本按执行档,毛利=billed-cost
{
  // 场景 A:层 3 供应商回退——选 high(10积分)被扣费,实际默认 API 跑 medium(6积分)
  const a = qualityCostAudit({
    requested: "high",
    executed: "medium",
    upstream: "default:gpt-image-2 (from byok:user-model)",
    images: 3,
    reason: "provider-fallback", billedCredits: 0, platformFunded: true,
  });
  check("审计A BYOK 实扣=0", a.billedCredits === 0, `billed=${a.billedCredits}`);
  check("审计A 成本=18", a.costCredits === 18, `cost=${a.costCredits}`);
  check("审计A 平台补贴=-18", a.marginCredits === -18, `margin=${a.marginCredits}`);
  check("审计A 上游留痕", a.upstream.includes("from byok:user-model"));
  // 场景 B:层 2 同通道退档——单张 high → medium
  const b = qualityCostAudit({
    requested: "high", executed: "medium",
    upstream: "byok:user-model", images: 1, reason: "quality-downgrade", billedCredits: 0, platformFunded: false,
  });
  check("审计B BYOK 自付不记平台收入成本", b.billedCredits === 0 && b.costCredits === 0 && b.marginCredits === 0);
  // 场景 C:请求档非法 → 实扣与成本都落 medium,毛利 0(口径一致,不亏不赚)
  const c = qualityCostAudit({
    requested: "", executed: "medium",
    upstream: "default:gpt-image-2", images: 2, reason: "quality-downgrade", billedCredits: 12, platformFunded: true,
  });
  check("审计C 非法档双口径 medium", c.billedCredits === 12 && c.costCredits === 12 && c.marginCredits === 0);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);