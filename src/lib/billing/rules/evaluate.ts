import type { BillingFacts, FeatureTariff, Rule, RuleCondition } from "../types";
export function matches(c: RuleCondition, f: BillingFacts): boolean {
    return (!c.quality || c.quality.includes(f.quality)) && (!c.resolution || c.resolution.includes(f.resolution)) &&
        (c.byok === undefined || c.byok === f.byok) && (!c.userGroup || c.userGroup.includes(f.userGroup)) &&
        (!c.providerId || c.providerId.includes(f.providerId || "")) && (!c.modelId || c.modelId.includes(f.modelId || "")) &&
        (c.minQuantity === undefined || f.quantity >= c.minQuantity) && (c.maxQuantity === undefined || f.quantity <= c.maxQuantity) &&
        (c.minPaidFen === undefined || f.paidFen >= c.minPaidFen);
}
export function conditionsOverlap(a: RuleCondition, b: RuleCondition): boolean {
    if (a.byok !== undefined && b.byok !== undefined && a.byok !== b.byok)
        return false;
    for (const key of ["quality", "resolution", "userGroup", "providerId", "modelId"] as const) {
        if (a[key] && b[key] && !a[key]!.some(value => b[key]!.includes(value)))
            return false;
    }
    return Math.max(a.minQuantity ?? 1, b.minQuantity ?? 1) <= Math.min(a.maxQuantity ?? 10000, b.maxQuantity ?? 10000);
}
export function mergeTariff(tariff: FeatureTariff, rule?: Rule): FeatureTariff {
    const next = structuredClone(tariff);
    if (rule?.pricing)
        next.pricing = structuredClone(rule.pricing);
    if (rule?.settlement)
        next.settlement = { ...next.settlement, ...rule.settlement };
    next.rules = [];
    return next;
}
