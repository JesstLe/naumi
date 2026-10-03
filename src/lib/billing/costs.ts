import type { BillingQuote, BillingResult, CostEstimate, CostRate, Pricing } from "./types";
import { BillingError } from "./types";
const MICRO = BigInt(1000000), BPS = BigInt(10000);
export function costPlusCredits(p: Extract<Pricing, {
    mode: "cost-plus";
}>, rate: CostRate): number {
    let amount = BigInt(rate.amountMicros), den = MICRO * BPS;
    if (rate.currency !== "credits") {
        if (rate.currency === "USD") {
            if (!rate.cnyPerUnitMicros)
                throw new BillingError("INVALID_CONFIG", "缺少成本折算率", 400);
            amount *= BigInt(rate.cnyPerUnitMicros);
            den *= MICRO;
        }
        amount *= BigInt(p.creditsPerCnyMicros);
        den *= MICRO;
    }
    amount *= BigInt(p.factorBps);
    const n = p.rounding === "ceil" ? (amount + den - BigInt(1)) / den : p.rounding === "nearest" ? (amount + den / BigInt(2)) / den : amount / den;
    const bounded = n < BigInt(p.minimum) ? BigInt(p.minimum) : n > BigInt(p.maximum) ? BigInt(p.maximum) : n;
    return Number(bounded);
}
export function costRateFor(q: BillingQuote, quality: string): CostRate | undefined {
    const { providerId = "*", modelId = "*", resolution } = q.facts;
    return (providerId !== "*" && q.costRates[`${providerId}:${modelId}:${quality}:${resolution}`]) ||
        (providerId !== "*" && q.costRates[`${providerId}:*:${quality}:${resolution}`]) ||
        (modelId !== "*" && q.costRates[`*:${modelId}:${quality}:${resolution}`]) || q.costRates[q.facts.feature] || q.costRates[`*:*:${quality}:${resolution}`];
}
export function estimateCost(q: BillingQuote, r: BillingResult): CostEstimate | null {
    if (r.state === "unknown" || r.items.some(x => x.state === "unknown"))
        return null;
    const items = r.items.filter(x => x.state === "succeeded" && x.platformFunded !== false);
    if (!items.length)
        return null;
    let currency: CostEstimate["currency"] | undefined, total = BigInt(0);
    const sources = new Set<string>(), tasks = new Set<CostRate>();
    for (const item of items) {
        const rate = costRateFor(q, item.executedQuality || q.facts.quality);
        if (!rate || currency && currency !== rate.currency)
            return null;
        currency = rate.currency;
        sources.add(rate.source);
        if (rate.unit === "task" && tasks.has(rate))
            continue;
        if (rate.unit === "task")
            tasks.add(rate);
        total += BigInt(rate.amountMicros);
    }
    return { currency: currency!, amountMicros: total.toString(), source: Array.from(sources).join(","), actual: false };
}
