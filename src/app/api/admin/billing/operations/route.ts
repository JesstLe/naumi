import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { billingErrorResponse } from "@/lib/billing/request";
import { getPool } from "@/platform/db/pool";
import {reconcileTaskBilling} from "@/lib/application/billing-task-recovery";
import { resultSchema } from "@/lib/billing/validation";
import {readBillingReviewOperation,readBillingReviewOperations} from '@/lib/billing/review-read';
import {withBillingAdminRead} from '@/lib/billing/admin-read';
import {reportOperationVisibleSql} from '@/lib/accounts/creation-policy';
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) { const auth = await billingAuthorize(request); if (auth instanceof Response)
    return auth; try {
    const id = new URL(request.url).searchParams.get("id");
    return await withBillingAdminRead(getPool(),request.signal,async tx=>{
        if(!id)return billingJson(await readBillingReviewOperations(tx));
        const row=await readBillingReviewOperation(tx,id);
        return billingJson(row??{error:'操作不存在'},row?200:404);
    });
}
catch (e) {
    if(request.signal.aborted)return billingJson({error:'查询已取消'},499);
    return billingErrorResponse(e);
} }
const command = z.object({ id: z.uuid(), operationId: z.string().min(1).max(200), reason: z.string().trim().min(3).max(500), proof: z.string().trim().min(3).max(2000), result: resultSchema.refine(r => r.state !== "unknown" && !r.items.some(i => i.state === "unknown"), "请先确认结果后核对账务") }).strict();
export async function POST(request: Request) { const auth = await billingAuthorize(request, true); if (auth instanceof Response)
    return auth; try {
    const input=command.parse(await request.json());
    if(!(await getPool().query(`SELECT ${reportOperationVisibleSql('$1')} AS visible`,[input.operationId])).rows[0].visible)return billingJson({error:'操作不存在'},404);
    const result=await reconcileTaskBilling({...input,actor:auth.actor});
    return billingJson(result);
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "核对参数无效" }, 400);
    return billingErrorResponse(e);
} }
