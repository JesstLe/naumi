import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import {getBillingRuntime, billingSwitchesFor} from "@/lib/billing/runtime";
import { billingErrorResponse } from "@/lib/billing/request";
import {getPool} from "@/platform/db/pool";
import {withBillingAdminRead} from "@/lib/billing/admin-read";
import {readPublishedBillingConfig} from "@/lib/billing/catalog";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) { const auth = await billingAuthorize(request); if (auth instanceof Response)
    return auth; try {
    return billingJson(await withBillingAdminRead(getPool(),request.signal,async tx=>{
        const snapshot=await readPublishedBillingConfig(tx);
        return {snapshot,effective:await billingSwitchesFor(snapshot,tx)};
    }));
}
catch (e) {
    if(request.signal.aborted)return billingJson({error:'查询已取消'},499);
    return billingErrorResponse(e);
} }
const publish = z.object({ id: z.uuid(), expectedVersion: z.number().int().positive(), config: z.unknown(), reason: z.string().trim().min(1).max(500) }).strict();
export async function POST(request: Request) { const auth = await billingAuthorize(request, true); if (auth instanceof Response)
    return auth; try {
    const body = publish.parse(await request.json());
    return billingJson(await (await getBillingRuntime()).config.publish({ ...body, config: body.config as never, actor: auth.actor }));
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "发布参数无效" }, 400);
    return billingErrorResponse(e);
} }
