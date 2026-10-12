import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { TeamError } from "./server";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
export function teamJson(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: PRIVATE_HEADERS }); }
export async function teamAuthorize(request: Request, adminOnly = false) {
  const admin = await requireAdmin(request);
  const email = await resolveUserEmail(request);
  if (adminOnly && !admin) return teamJson({ error: "需要站点管理员" }, 403);
  if (!email && !admin) return teamJson({ error: "请先登录" }, 401);
  if (!dbEnabled) return teamJson({ error: "数据库未配置" }, 503);
  const actor = { email: email || "local-admin", admin };
  if (!rateLimit(`team:${actor.email}:${clientIp(request)}`, 120, 60_000)) return teamJson({ error: "操作过于频繁" }, 429);
  return actor;
}
export function teamMutationOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin), url = new URL(request.url);
    return source.host === (request.headers.get("host") || url.host) && source.protocol === `${request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")}:`;
  } catch { return false; }
}
export function teamFailure(error: unknown) {
  return error instanceof TeamError ? teamJson({ error: error.message }, error.status) : teamJson({ error: "操作结果暂未确认，请刷新后使用同一请求重试", uncertain: true }, 500);
}
