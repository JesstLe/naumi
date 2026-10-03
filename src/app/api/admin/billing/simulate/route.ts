import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { billingErrorResponse } from "@/lib/billing/request";
import { validateBillingConfig } from "@/lib/billing/rules/schema";
import { quote, settlementFor } from "@/lib/billing/quote";
import { estimateCost } from "@/lib/billing/costs";
import { factsSchema, resultSchema } from "@/lib/billing/validation";
export const runtime = "nodejs", dynamic = "force-dynamic";
const schema = z.object({ config: z.unknown(), facts: factsSchema, result: resultSchema }).strict();
export async function POST(request: Request) { const auth = await billingAuthorize(request, true); if (auth instanceof Response)
    return auth; try {
    const body = schema.parse(await request.json()), q = quote({ version: 1, config: validateBillingConfig(body.config) }, body.facts);
    return billingJson({ quote: q, settlement: settlementFor(q, body.result), cost: estimateCost(q, body.result) });
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "模拟参数无效" }, 400);
    return billingErrorResponse(e);
} }
