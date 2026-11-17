import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import {getBillingRuntime} from "@/lib/billing/runtime";
import { billingErrorResponse } from "@/lib/billing/request";
import {getPool} from "@/platform/db/pool";
import {withBillingAdminRead} from "@/lib/billing/admin-read";
import {readBillingVersionHistory} from "@/lib/billing/catalog";
import {readFrozenBillingSnapshot} from "@/lib/billing/frozen-config";
import {BILLING_HISTORY_CURSOR_HEADER,BILLING_HISTORY_PAGE_SIZE} from "@/lib/billing/version-history-contract";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) { const auth = await billingAuthorize(request); if (auth instanceof Response)
    return auth; try {
    const params=new URL(request.url).searchParams, rawVersion=params.get("version"), rawBefore=params.get("before");
    const version=rawVersion?Number(rawVersion):undefined, before=rawBefore===null?undefined:Number(rawBefore);
    if(version!==undefined && (!Number.isSafeInteger(version)||version<1))
        return billingJson({error:"配置版本无效",code:"INVALID_CONFIG"},400);
    if(rawBefore!==null && (!/^[1-9][0-9]*$/.test(rawBefore)||!Number.isSafeInteger(before)||version!==undefined))
        return billingJson({error:"历史版本游标无效",code:"INVALID_CONFIG"},400);
    if(version!==undefined)
        return billingJson(await withBillingAdminRead(getPool(),request.signal,tx=>readFrozenBillingSnapshot(version,tx)));
    const rows=await withBillingAdminRead(getPool(),request.signal,tx=>readBillingVersionHistory(tx,BILLING_HISTORY_PAGE_SIZE+1,before));
    const visible=rows.slice(0,BILLING_HISTORY_PAGE_SIZE),response=billingJson(visible);
    if(rows.length>visible.length)response.headers.set(BILLING_HISTORY_CURSOR_HEADER,String(visible.at(-1)!.version));
    return response;
}
catch (e) {
    if(request.signal.aborted)return billingJson({error:"查询已取消"},499);
    return billingErrorResponse(e);
} }
const restore = z.object({ id: z.uuid(), expectedVersion: z.number().int().positive(), targetVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).strict();
export async function POST(request: Request) { const auth = await billingAuthorize(request, true); if (auth instanceof Response)
    return auth; try {
    return billingJson(await (await getBillingRuntime()).config.restore({ ...restore.parse(await request.json()), actor: auth.actor }));
}
catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
        return billingJson({ error: "恢复参数无效" }, 400);
    return billingErrorResponse(e);
} }
