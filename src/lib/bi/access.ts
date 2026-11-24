import "server-only";
import {ReportAccountHidden} from "../accounts/report-visibility";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import { ReportReadBusy } from "@/platform/db/owned-read-client";
import { clientIp } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { isSameOriginRequest } from "@/lib/request-origin";

export const BI_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
export function biJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: BI_PRIVATE_HEADERS });
}
export function biReadFailure(error: unknown, signal: AbortSignal, fallback: string) {
  if(error instanceof ReportAccountHidden)return biJson({error:error.message},404);
  if (signal.aborted) return biJson({ error: "查询已取消" }, 499);
  if (error instanceof ReportReadBusy) {
    const response = biJson({ error: error.message }, 503);
    response.headers.set("Retry-After", "1");
    return response;
  }
  return biJson({ error: fallback }, 500);
}
export async function biAuthorize(
  request: Request,
): Promise<{ actor: string } | NextResponse> {
  if (!(await requireAdmin(request)))
    return biJson({ error: "页面不存在" }, 404);
  if (!dbEnabled)
    return biJson({ error: "未配置数据库，无法读取 BI 数据" }, 503);
  const actor = (await resolveUserEmail(request)) || "local-admin";
  const rateLimitResult = await checkRateLimit(`bi:${actor}:${clientIp(request)}`, 240, 60_000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return biJson({ error: "查询过于频繁，请稍后重试" }, 429);
  return { actor };
}
export function sameSiteBiMutation(request: Request) {
  return isSameOriginRequest(request);
}
