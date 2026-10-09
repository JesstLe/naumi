import { z } from "zod";
import { publicFactsSchema } from "@/lib/billing/validation";
import { quoteForRequest } from "@/lib/billing/server";
import { billingErrorResponse } from "@/lib/billing/request";
import { billingJson, sameSiteBillingMutation } from "@/lib/billing/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function POST(request: Request) { if (!sameSiteBillingMutation(request))
    return billingJson({ error: "请求来源无效" }, 403); try {
    const q = await quoteForRequest(request, publicFactsSchema.parse(await request.json()));
    return billingJson({ version: q.configVersion, modelVersion: q.modelVersion, modelId: q.facts.modelId, mode: q.tariff.pricing.mode, authorization: ["usage","api-cost-plus"].includes(q.tariff.pricing.mode), credits: q.requestedCredits, authorizedCredits:q.authorizedCredits, reserveCredits: q.reserveCredits, costStatus:q.tariff.pricing.mode==="api-cost-plus"?"estimated":undefined, requestedParameters:q.requestedParameters,effectiveParameters:q.effectiveParameters, feature: q.facts.feature, quantity: q.facts.quantity });
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "报价参数无效" }, 400);
    return billingErrorResponse(e);
} }
