import type { BillingQuote, BillingResult } from "./types";
import { BillingError } from "./types";
import { rounded } from "./money";
import type { Procurement } from "../model-config/business-schema";

export type ApiCostPricing = { mode: "api-cost-plus"; factorBps: number; estimateCnyMicros: string; authorizationCnyMicros: string; creditsPerCnyMicros: string; rounding: "ceil" | "floor" | "nearest" };
const MICRO = BigInt(1000000), BPS = BigInt(10000);
export function apiCostCredits(costNumerator: bigint, costDenominator: bigint, p: ApiCostPricing) {
  const value = rounded(costNumerator * BigInt(p.factorBps) * BigInt(p.creditsPerCnyMicros), costDenominator * BPS * MICRO * MICRO, p.rounding);
  if (value < BigInt(0) || value > BigInt(2147483647)) throw new BillingError("INVALID_RESULT", "成本结算积分超出范围", 400);
  return Number(value);
}
/** Rational micro-CNY: usage, FX and markup are rounded only at the credit boundary. */
export function procurementCost(p: Procurement, usage?: BillingResult["usage"], quantity = 1, rateMicros?: string): { numerator: bigint; denominator: bigint } | null {
  if (p.confirmed !== true) return null;
  let numerator: bigint, denominator = BigInt(1);
  if (p.basis !== "tokens") {
    if (p.amountMicros === undefined) return null;
    numerator = BigInt(p.amountMicros) * BigInt(p.basis === "image" ? quantity : 1);
  } else {
    if (!usage || p.inputMicrosPerMillion === undefined || p.outputMicrosPerMillion === undefined) return null;
    const { inputTokens: i, outputTokens: o, cachedInputTokens: c = 0, imageInputTokens: m = 0 } = usage;
    if ([i,o,c,m].some(v => !Number.isSafeInteger(v) || v < 0) || c + m > i || m && p.imageInputMicrosPerMillion === undefined) return null;
    numerator = BigInt(i-c-m)*BigInt(p.inputMicrosPerMillion) + BigInt(c)*BigInt(p.cachedInputMicrosPerMillion ?? p.inputMicrosPerMillion) + BigInt(m)*BigInt(p.imageInputMicrosPerMillion || "0") + BigInt(o)*BigInt(p.outputMicrosPerMillion);
    denominator = MICRO;
  }
  if (p.currency === "USD") { if (!rateMicros) return null; numerator *= BigInt(rateMicros); denominator *= MICRO; }
  return { numerator, denominator };
}
export function apiCostSettlement(q: BillingQuote, r: BillingResult) {
  const p = q.tariff.pricing;
  if (p.mode !== "api-cost-plus") throw new BillingError("INVALID_RESULT", "成本结算模式不匹配", 400);
  if (!r.items.some(i => i.state === "succeeded")) return { state: "settle" as const, charge: 0, release: q.reserveCredits };
  const cost = r.apiCost;
  if (!cost || cost.status === "pending" || cost.numerator === undefined || cost.denominator === undefined) return { state: "manual" as const, charge: 0, release: 0 };
  if (!/^\d{1,60}$/.test(cost.numerator) || !/^[1-9]\d{0,30}$/.test(cost.denominator)) throw new BillingError("INVALID_RESULT", "实际 API 成本格式无效", 400);
  const n = BigInt(cost.numerator), d = BigInt(cost.denominator);
  if (n * BigInt(p.factorBps) > BigInt(p.authorizationCnyMicros) * d * BPS) return { state: "manual" as const, charge: 0, release: 0 };
  const charge = apiCostCredits(n,d,p);
  if (charge > q.authorizedCredits) return { state: "manual" as const, charge: 0, release: 0 };
  return { state: "settle" as const, charge, release: q.reserveCredits-charge };
}
