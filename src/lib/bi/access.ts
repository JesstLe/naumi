import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";

export const BI_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
export function biJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: BI_PRIVATE_HEADERS });
}
export async function biAuthorize(
  request: Request,
): Promise<{ actor: string } | NextResponse> {
  if (!(await requireAdmin(request)))
    return biJson({ error: "页面不存在" }, 404);
  if (!dbEnabled)
    return biJson({ error: "未配置数据库，无法读取 BI 数据" }, 503);
  const actor = (await resolveUserEmail(request)) || "local-admin";
  if (!rateLimit(`bi:${actor}:${clientIp(request)}`, 240, 60_000))
    return biJson({ error: "查询过于频繁，请稍后重试" }, 429);
  return { actor };
}
export function sameSiteBiMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin),
      target = new URL(request.url);
    // Next can construct request.url with its internal listening hostname.
    // Host reflects the browser destination; Nginx preserves it and supplies
    // the external protocol. Do not accept an arbitrary forwarded host.
    const host = request.headers.get("host") || target.host;
    const protocol =
      request.headers.get("x-forwarded-proto") ||
      target.protocol.replace(":", "");
    return source.host === host && source.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
