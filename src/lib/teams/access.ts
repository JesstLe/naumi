import "server-only";
import { isSameOriginRequest } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail, adminPasswordState } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import {checkRateLimit,rateLimitFailureResponse} from "@/lib/rate-limit-http";
import { clientIp } from "@/lib/ip";
import { teamEntryAccess } from "./grants";
import { TeamError } from "./errors";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
export function teamJson(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: PRIVATE_HEADERS }); }
export async function teamAuthorize(request: Request, adminOnly = false) {
  const consoleAdmin = await requireAdmin(request);
  const email = await resolveUserEmail(request);
  if (!email && !consoleAdmin) return teamJson({ error: "请先登录" }, 401);
  if (!dbEnabled) return teamJson({ error: "数据库未配置" }, 503);
  const consoleVerified = consoleAdmin && (await adminPasswordState(request)).authenticated;
  const access = email ? await teamEntryAccess(email) : null;
  if (!consoleVerified && !access?.allowed) return teamJson({ error: "团队入口授权未生效、已到期或已关闭" }, 403);
  const admin = consoleVerified || !!access?.admin;
  if (!admin) {
    const { enterpriseManaged } = await import('@/lib/enterprise/server');
    if (await enterpriseManaged(email!)) return teamJson({ error: '请使用企业管理中心', code: 'ENTERPRISE_MANAGED' }, 403);
  }
  if (adminOnly && !admin) return teamJson({ error: "需要站点管理员" }, 403);
  const actor = { email: email || "local-admin", admin, consoleAdmin: consoleVerified };
  const rateLimitResult = await checkRateLimit(`team:${actor.email}:${clientIp(request)}`, 120, 60_000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({ error: "操作过于频繁" }, 429);
  return actor;
}
export function teamMutationOrigin(request: Request) { return isSameOriginRequest(request); }
export function teamFailure(error: unknown) {
  const unavailable = rateLimitFailureResponse(error);
  if (unavailable) return unavailable;
  return error instanceof TeamError ? teamJson({ error: error.message }, error.status) : teamJson({ error: "操作结果暂未确认，请刷新后使用同一请求重试", uncertain: true }, 500);
}
