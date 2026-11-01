import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { billingErrorResponse } from "@/lib/billing/request";
import {getBillingRuntime} from "@/lib/billing/runtime";
import { getPool } from "@/platform/db/pool";
import {reconcileTaskBilling} from "@/lib/application/billing-task-recovery";
import { resultSchema } from "@/lib/billing/validation";
import {exposeAbandonedBillingOperations} from "@/lib/billing/synchronous-operation";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) { const auth = await billingAuthorize(request); if (auth instanceof Response)
    return auth; try {
    await (await getBillingRuntime()).config.current();
    await exposeAbandonedBillingOperations();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
        const row = (await getPool().query("SELECT id,email,feature,state,quote FROM app_billing_operations WHERE id=$1 AND state IN ('hold','manual')", [id])).rows[0];
        return billingJson(row ?? { error: "操作不存在" }, row ? 200 : 404);
    }
    return billingJson((await getPool().query("SELECT id,email,feature,state,reserved_credits,created_at,quote->'facts' AS facts,quote->>'configVersion' AS version FROM app_billing_operations WHERE state IN ('hold','manual') ORDER BY created_at ASC LIMIT 100")).rows);
}
catch (e) {
    return billingErrorResponse(e);
} }
const command = z.object({ id: z.uuid(), operationId: z.string().min(1).max(200), reason: z.string().trim().min(3).max(500), proof: z.string().trim().min(3).max(2000), result: resultSchema.refine(r => r.state !== "unknown" && !r.items.some(i => i.state === "unknown"), "请先确认结果后核对账务") }).strict();
export async function POST(request: Request) { const auth = await billingAuthorize(request, true); if (auth instanceof Response)
    return auth; try {
    const input=command.parse(await request.json());
    const result=await reconcileTaskBilling({...input,actor:auth.actor});
    return billingJson(result);
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "核对参数无效" }, 400);
    return billingErrorResponse(e);
} }
