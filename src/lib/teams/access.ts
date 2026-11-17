import "server-only";
import { isSameOriginRequest } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail, adminPasswordState } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import { ReportReadBusy } from "@/platform/db/owned-read-client";
import {checkRateLimit,rateLimitFailureResponse} from "@/lib/rate-limit-http";
import {rateLimitUpTo} from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { teamEntryAccess } from "./grants";
import { TeamError } from "./errors";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
export function teamJson(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: PRIVATE_HEADERS }); }
async function resolveTeamActor(request: Request, adminOnly = false) {
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
  return { email: email || "local-admin", admin, consoleAdmin: consoleVerified };
}
function teamRateKey(request:Request,email:string){return `team:${email}:${clientIp(request)}`;}
export async function teamAuthorize(request: Request, adminOnly = false) {
  const actor=await resolveTeamActor(request,adminOnly);
  if(actor instanceof NextResponse)return actor;
  const rateLimitResult = await checkRateLimit(teamRateKey(request,actor.email), 120, 60_000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({ error: "操作过于频繁" }, 429);
  return actor;
}
export async function teamAuthorizePreviewBatch(request:Request,requested:number){
  const actor=await resolveTeamActor(request);
  if(actor instanceof NextResponse)return null;
  request.signal.throwIfAborted();
  const allowed=await rateLimitUpTo(teamRateKey(request,actor.email),120,60_000,requested);
  return {actor,allowed};
}
export function teamMutationOrigin(request: Request) { return isSameOriginRequest(request); }
export function teamFailure(error: unknown) {
  if (error instanceof ReportReadBusy) {
    const response = teamJson({ error: error.message }, 503);
    response.headers.set("Retry-After", "1");
    return response;
  }
  const unavailable = rateLimitFailureResponse(error);
  if (unavailable) return unavailable;
  return error instanceof TeamError ? teamJson({ error: error.message }, error.status) : teamJson({ error: "操作结果暂未确认，请刷新后使用同一请求重试", uncertain: true }, 500);
}
