import { BillingError, type BillingResult, type Pricing } from "./types";
const MICRO = BigInt(1000000);
export function rounded(n: bigint, den: bigint, mode: "ceil" | "floor" | "nearest") {
  return mode === "ceil" ? (n + den - BigInt(1)) / den : mode === "nearest" ? (n + den / BigInt(2)) / den : n / den;
}
export function cnyCredits(amountMicros: string | bigint, p: { creditsPerCnyMicros: string; rounding: "ceil" | "floor" | "nearest" }) {
  const n = rounded(BigInt(amountMicros) * BigInt(p.creditsPerCnyMicros), MICRO * MICRO, p.rounding);
  if (n < BigInt(0) || n > BigInt(2147483647)) throw new BillingError("INVALID_RESULT", "积分金额超出范围", 400);
  return Number(n);
}
export function usageAmount(p: Pick<Extract<Pricing, { mode: "usage" }>, "inputMicrosPerMillion" | "outputMicrosPerMillion" | "cachedInputMicrosPerMillion" | "imageInputMicrosPerMillion">, usage?: BillingResult["usage"]): bigint | null {
  if (!usage) return null;
  const { inputTokens: input, outputTokens: output, cachedInputTokens: cached = 0, imageInputTokens: image = 0 } = usage;
  if ([input, output, cached, image].some(n => !Number.isSafeInteger(n) || n < 0) || cached + image > input) throw new BillingError("INVALID_RESULT", "实际用量回执无效", 400);
  if (image && p.imageInputMicrosPerMillion === undefined) return null;
  const n = BigInt(input - cached - image) * BigInt(p.inputMicrosPerMillion) + BigInt(cached) * BigInt(p.cachedInputMicrosPerMillion ?? p.inputMicrosPerMillion) + BigInt(image) * BigInt(p.imageInputMicrosPerMillion ?? "0") + BigInt(output) * BigInt(p.outputMicrosPerMillion);
  return rounded(n, MICRO, "ceil");
}
