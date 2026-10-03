import { BillingError, type BillingFacts, type BillingQuote, type BillingResult, type ConfigSnapshot, type FeatureTariff, type Settlement } from "./types";
import { isFeatureId, QUALITY_IDS, RESOLUTION_IDS } from "./rules/registry";
import { matches, mergeTariff } from "./rules/evaluate";
import { costPlusCredits } from "./costs";
const MAX = 2147483647;
function safe(n: number) { if (!Number.isSafeInteger(n) || n < 0 || n > MAX)
    throw new BillingError("INVALID_RESULT", "积分金额超出范围", 400); return n; }
function unitPrice(t: FeatureTariff, f: BillingFacts, costs: BillingQuote["costRates"]): number {
    const p = t.pricing;
    if (p.mode === "fixed")
        return safe(p.credits);
    if (p.mode === "quality-resolution")
        return safe((p.quality[f.quality] ?? p.quality.medium) + (p.resolutionExtra[f.resolution] ?? p.resolutionExtra["1K"]));
    if (p.mode === "tiers")
        return safe(p.prices[String(f[p.dimension])] ?? p.prices.default);
    const rate = costs[p.costKey];
    if (!rate)
        throw new BillingError("INVALID_CONFIG", "缺少成本配置", 400);
    return safe(costPlusCredits(p, rate));
}
function rawAmount(t: FeatureTariff, f: BillingFacts, costs: BillingQuote["costRates"]) {
    if (!t.enabled || !f.metered)
        return 0;
    return safe(unitPrice(t, f, costs) * (t.unit === "task" ? 1 : f.quantity));
}
function amount(t: FeatureTariff, f: BillingFacts, costs: BillingQuote["costRates"]) { return safe(Math.ceil(rawAmount(t, f, costs) * (f.byok ? t.settlement.byokBps : 10000) / 10000)); }
export function quote(snapshot: ConfigSnapshot, input: BillingFacts): BillingQuote {
    if (!isFeatureId(input.feature) || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10000 || !Number.isSafeInteger(input.paidFen) || input.paidFen < 0)
        throw new BillingError("INVALID_RESULT", "报价参数无效", 400);
    const f = { ...input, quality: (QUALITY_IDS as readonly string[]).includes(input.quality) ? input.quality : "medium", resolution: input.feature==="video.generate"&&input.resolution&&input.resolution.length<=20?input.resolution:(RESOLUTION_IDS as readonly string[]).includes(input.resolution) ? input.resolution : "1K" };
    const base = snapshot.config.features[f.feature];
    if (!base)
        throw new BillingError("INVALID_CONFIG", "未配置该功能价格", 400);
    const matched = base.rules.find(r => matches(r.when, f)), tariff = mergeTariff(base, matched);
    const keys=new Set<string>([f.feature]);
    for(const quality of QUALITY_IDS){for(const [provider,model] of [[f.providerId||"*",f.modelId||"*"],[f.fallbackProviderId||"*",f.fallbackModelId||"*"]])for(const key of [`${provider}:${model}:${quality}:${f.resolution}`,`${provider}:*:${quality}:${f.resolution}`,`*:${model}:${quality}:${f.resolution}`,`*:*:${quality}:${f.resolution}`])keys.add(key);}
    if(tariff.pricing.mode==="cost-plus")keys.add(tariff.pricing.costKey);
    const costRates=Object.fromEntries(Array.from(keys).filter(key=>snapshot.config.costs[key]).map(key=>[key,structuredClone(snapshot.config.costs[key])]));
    const requestedCredits = amount(tariff, f, costRates);
    let authorizedCredits = requestedCredits;
    if (tariff.settlement.qualityBasis === "executed")
        for (const quality of QUALITY_IDS)
            authorizedCredits = Math.max(authorizedCredits, amount(tariff, { ...f, quality }, costRates));
    return { schemaVersion: 1, engineVersion: 1, configVersion: snapshot.version, facts: f, tariff, costRates, requestedCredits, authorizedCredits, reserveCredits: safe(Math.ceil(authorizedCredits * tariff.settlement.reserveBps / 10000)), matchedRuleId: matched?.id ?? null, debitOrder:snapshot.config.credits.debitOrder,staleReservationMinutes:snapshot.config.credits.staleReservationMinutes };
}
export function settlementFor(q: BillingQuote, r: BillingResult): Settlement {
    const ids = new Set(r.items.map(x => x.id));
    if (ids.size !== r.items.length || r.items.length > q.facts.quantity || r.items.some(x => !x.id || !["succeeded", "failed", "unknown"].includes(x.state)) || !["succeeded", "failed", "unknown"].includes(r.state))
        throw new BillingError("INVALID_RESULT", "任务结果无效", 400);
    if (r.state === "unknown" || r.items.some(x => x.state === "unknown"))
        return { state: q.tariff.settlement.unknown, charge: 0, release: 0 };
    const succeeded = r.items.filter(x => x.state === "succeeded");
    const executedPrices = () => succeeded.map(item => {
        if (!item.executedQuality || !(QUALITY_IDS as readonly string[]).includes(item.executedQuality))
            throw new BillingError("INVALID_RESULT", "缺少有效执行质量", 400);
        return unitPrice(q.tariff, { ...q.facts, quality: item.executedQuality }, q.costRates);
    });
    if (r.state === "failed" && succeeded.length)
        throw new BillingError("INVALID_RESULT", "任务结果状态不一致", 400);
    let charge = 0;
    if (q.tariff.settlement.successBasis === "whole-request" && succeeded.length) {
        charge = q.tariff.settlement.qualityBasis === "executed" && q.tariff.enabled && q.facts.metered
            ? Math.max(...executedPrices()) * (q.tariff.unit === "task" ? 1 : q.facts.quantity)
            : rawAmount(q.tariff, q.facts, q.costRates);
    }
    else if (succeeded.length) {
        if (q.tariff.unit === "task")
            charge = q.tariff.settlement.qualityBasis === "executed" && q.tariff.enabled && q.facts.metered
                ? Math.max(...executedPrices()) : rawAmount(q.tariff, q.facts, q.costRates);
        else
            for (const item of succeeded) {
                const quality = q.tariff.settlement.qualityBasis === "executed" ? item.executedQuality : q.facts.quality;
                if (!quality || !(QUALITY_IDS as readonly string[]).includes(quality))
                    throw new BillingError("INVALID_RESULT", "缺少有效执行质量", 400);
                if (q.tariff.enabled && q.facts.metered)
                    charge += unitPrice(q.tariff, { ...q.facts, quality }, q.costRates);
            }
    }
    const failed = q.facts.quantity - succeeded.length;
    if (failed && q.tariff.settlement.failureBps && !(succeeded.length && q.tariff.settlement.successBasis === "whole-request")) {
        const failedQuote = q.tariff.enabled && q.facts.metered ? unitPrice(q.tariff, q.facts, q.costRates) * (q.tariff.unit === "task" ? 1 : failed) : 0;
        if (q.tariff.unit !== "task" || !succeeded.length)
            charge += Math.ceil(failedQuote * q.tariff.settlement.failureBps / 10000);
    }
    charge = safe(Math.ceil(charge * (q.facts.byok ? q.tariff.settlement.byokBps : 10000) / 10000));
    if (charge > q.authorizedCredits)
        throw new BillingError("AUTHORIZATION_EXCEEDED", "结算不能超过授权积分", 409);
    return { state: "settle", charge, release: q.reserveCredits - charge };
}
