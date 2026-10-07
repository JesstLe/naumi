import type { ModelSnapshot, ModelFacts } from "./types";
import type { ConfigSnapshot, BillingFacts } from "../billing/types";
import { businessRoutePlan, selectedBusinessOption, procurementCny } from "./business";
import { businessBillingSnapshot } from "./business-billing";
import { quote } from "../billing/quote";
import { cnyCredits, usageAmount } from "../billing/money";
export function businessPreview(models: ModelSnapshot, billing: ConfigSnapshot, facts: BillingFacts, routeFacts: ModelFacts) {
  const option = selectedBusinessOption(models.config, facts.feature, facts.modelId);
  const modelId = option?.modelId || facts.modelId || "", model = models.config.publicModels.find(m => m.id === modelId);
  const plan = businessRoutePlan(models.config, option, routeFacts);
  const upstreamId = plan?.initialId || (model?.target.type === "upstream" ? model.target.id : undefined);
  const upstream = models.config.upstreamModels.find(u => u.id === upstreamId);
  const q = quote(businessBillingSnapshot(billing, models, { ...facts, modelId }), { ...facts, modelId });
  const p = q.tariff.pricing;
  const price = p.mode === "cny-fixed" ? p.variants?.filter(v => (!v.quality || v.quality === facts.quality) && (!v.resolution || v.resolution === facts.resolution)).sort((a,b) => Number(!!b.quality)+Number(!!b.resolution)-Number(!!a.quality)-Number(!!a.resolution))[0]?.amountMicros ?? p.amountMicros : null;
  const cost = procurementCny(upstream?.procurement);
  // Text cost depends on actual tokens; routed requests may incur more than one stage.
  const knownCost = cost && cost.basis !== "tokens" && !option?.routing?.enabled ? cost.amountMicros || null : null;
  return { modelId, upstreamId, providerId: upstream?.providerId, matchedRuleId: plan?.matchedRuleId || null, defaultUsed: !plan?.matchedRuleId, credits: q.requestedCredits, reserveCredits: q.reserveCredits, mode: p.mode, priceCnyMicros: price, procurement: upstream?.procurement || null, expectedContributionCnyMicros: price !== null && knownCost !== null ? (BigInt(price)-BigInt(knownCost)).toString() : null, contributionStatus: knownCost === null || price === null ? "成本或用量未知，不能确认利润" : "预计单单位贡献，不含固定月费", route: option?.routing || null };
}
