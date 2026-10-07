import type { Procurement } from "./business-schema";
import { procurementCny } from "./business";
import { usageAmount } from "../billing/money";

/** Prices are frozen estimates, not a supplier invoice. Missing dimensions remain unknown. */
export function stageCost(procurement: Procurement | undefined, state: string, raw?: unknown) {
  if (state === "rejected-not-charged") return { amount: "0", status: "confirmed-not-charged" };
  const p = procurementCny(procurement);
  if (!p || !["response-received", "stream-completed"].includes(state)) return { amount: null, status: "unknown" };
  if (p.basis !== "tokens") return { amount: p.amountMicros ?? null, status: p.amountMicros === undefined ? "unknown" : "price-estimate" };
  if (!raw || typeof raw !== "object") return { amount: null, status: "usage-missing" };
  const u = raw as Record<string, any>, details = u.prompt_tokens_details || u.input_tokens_details || {};
  const inputTokens = u.prompt_tokens ?? u.input_tokens, outputTokens = u.completion_tokens ?? u.output_tokens;
  if (p.cachedInputMicrosPerMillion !== undefined && details.cached_tokens === undefined || p.imageInputMicrosPerMillion !== undefined && details.image_tokens === undefined) return { amount: null, status: "usage-dimensions-missing" };
  try {
    const amount = usageAmount({ inputMicrosPerMillion:p.inputMicrosPerMillion!, outputMicrosPerMillion:p.outputMicrosPerMillion!, cachedInputMicrosPerMillion:p.cachedInputMicrosPerMillion, imageInputMicrosPerMillion:p.imageInputMicrosPerMillion }, { inputTokens, outputTokens, cachedInputTokens:details.cached_tokens, imageInputTokens:details.image_tokens });
    return { amount: amount?.toString() ?? null, status: amount === null ? "usage-missing" : "usage-calculated" };
  } catch { return { amount: null, status: "usage-invalid" }; }
}
