import { billingSnapshot, billingSwitches, resolveBillingFacts } from "@/lib/billing/server";
import { billingErrorResponse } from "@/lib/billing/request";
import { billingJson } from "@/lib/billing/access";
import { FEATURE_IDS, QUALITY_IDS, RESOLUTION_IDS } from "@/lib/billing/rules/registry";
import { quote } from "@/lib/billing/quote";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const snapshot = await billingSnapshot(), base = await resolveBillingFacts(request, { feature: "image.generate", quantity: 1 }, snapshot), effective = await billingSwitches();
        const features = Object.fromEntries(FEATURE_IDS.map(feature => [feature, { label: snapshot.config.features[feature].label, enabled: snapshot.config.features[feature].enabled, unit: snapshot.config.features[feature].unit, prices: Object.fromEntries(QUALITY_IDS.map(quality => [quality, Object.fromEntries(RESOLUTION_IDS.map(resolution => [resolution, quote(snapshot, { ...base, feature, quality, resolution, byok: false }).requestedCredits]))])) }]));
        const products = effective.commerce && effective.recharge ? Object.values(snapshot.config.products).filter(x => x.kind === "pack" && x.available).map(({ id, title, amountFen, baseCredits, bonusCredits, expiry }) => ({ id, title, amountFen, baseCredits,bonusCredits,credits: baseCredits + bonusCredits, expiry })) : [];
        return billingJson({mode:snapshot.version===0?"demo":"managed", version: snapshot.version, features, products, thresholds: snapshot.config.thresholds, effective });
    }
    catch (e) {
        return billingErrorResponse(e);
    }
}
