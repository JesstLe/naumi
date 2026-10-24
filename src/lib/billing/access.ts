import "server-only";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
export function billingJson(data: unknown, status = 200) { return Response.json(data, { status, headers: PRIVATE_HEADERS }); }
export function sameSiteBillingMutation(request: Request) {
    if (request.headers.get("sec-fetch-site") === "cross-site")
        return false;
    const origin = request.headers.get("origin");
    if (!origin)
        return true;
    try {
        const source = new URL(origin), target = new URL(request.url);
        return source.host === (request.headers.get("host") || target.host) && source.protocol === `${request.headers.get("x-forwarded-proto") || target.protocol.replace(":", "")}:`;
    }
    catch {
        return false;
    }
}
export async function billingAuthorize(request: Request, mutation = false) {
    if (!await requireAdmin(request))
        return billingJson({ error: "页面不存在" }, 404);
    if (mutation && !sameSiteBillingMutation(request))
        return billingJson({ error: "请求来源无效" }, 403);
    if (!dbEnabled)
        return billingJson({ error: "未配置数据库，计费管理暂不可用" }, 503);
    return { actor: await resolveUserEmail(request) || "local-admin" };
}
