import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { clientIp } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { isSameOriginRequest } from "@/lib/request-origin";

export type AdminMutationActor = { actor: string };

/**
 * Entry gate for platform-admin write routes: admin identity, same-origin
 * browser request and a per-actor rate limit. It only answers "may this
 * request mutate"; business rules stay in the module that owns the data.
 */
export async function authorizeAdminMutation(request: Request, scope: string, limit = 60): Promise<AdminMutationActor | NextResponse> {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const actor = (await resolveUserEmail(request)) || "local-admin";
  const allowed = await checkRateLimit(`admin-mutation:${scope}:${actor}:${clientIp(request)}`, limit, 60_000);
  if (allowed instanceof Response) return allowed;
  if (!allowed) return NextResponse.json({ error: "操作过于频繁，请稍后重试" }, { status: 429 });
  return { actor };
}
