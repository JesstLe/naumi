import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { getBillingRuntime } from "@/lib/billing/server";
import { billingErrorResponse } from "@/lib/billing/request";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) { const auth = await billingAuthorize(request); if (auth instanceof Response)
    return auth; try {
    const config = (await getBillingRuntime()).config, version = new URL(request.url).searchParams.get("version");
    return billingJson(version ? await config.byVersion(Number(version)) : await config.history(50));
}
catch (e) {
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
