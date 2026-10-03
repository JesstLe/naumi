import { z } from "zod";
import { publicFactsSchema } from "@/lib/billing/validation";
import { quoteForRequest } from "@/lib/billing/server";
import { billingErrorResponse } from "@/lib/billing/request";
import { billingJson, sameSiteBillingMutation } from "@/lib/billing/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function POST(request: Request) { if (!sameSiteBillingMutation(request))
    return billingJson({ error: "请求来源无效" }, 403); try {
    const q = await quoteForRequest(request, publicFactsSchema.parse(await request.json()));
    return billingJson({ version: q.configVersion, credits: q.requestedCredits, reserveCredits: q.reserveCredits, feature: q.facts.feature, quantity: q.facts.quantity });
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "报价参数无效" }, 400);
    return billingErrorResponse(e);
} }
