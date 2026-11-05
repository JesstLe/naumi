import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import { sameSiteBillingMutation } from "@/lib/billing/access";
import {accessJson} from "@/lib/feature-access/server";
import {FeatureAccessError,featureAccessUsers,saveFeaturePolicy,validatePolicyCommand} from "@/lib/feature-access/repository";
import {checkRateLimit} from "@/lib/rate-limit-http";
export const runtime = "nodejs", dynamic = "force-dynamic";
async function guard(request: Request) {
  if (!await requireAdmin(request)) return accessJson({ error: "需要管理员身份" }, 403);
  if (!dbEnabled) return accessJson({ error: "未配置数据库" }, 503);
  return null;
}
function failure(error: unknown) { return error instanceof FeatureAccessError ? accessJson({ error: error.message }, error.status) : accessJson({ error: "权限操作未确认，请刷新后重试" }, 503); }
export async function GET(request: Request) {
  try {
    const blocked = await guard(request); if (blocked) return blocked;
    const url = new URL(request.url), page = Number(url.searchParams.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return accessJson({ error: "分页参数无效" }, 400);
    return accessJson({ ...await featureAccessUsers(url.searchParams.get("q") || "", page), page });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const blocked = await guard(request); if (blocked) return blocked;
    if (!sameSiteBillingMutation(request)) return accessJson({ error: "请求来源无效" }, 403);
    const actor = await resolveUserEmail(request) || "local-admin";
    const rateLimitResult = await checkRateLimit(`feature-access:${actor}`, 60, 60000);
    if (rateLimitResult instanceof Response) return rateLimitResult;
    if (!rateLimitResult) return accessJson({ error: "操作频繁，请稍后重试" }, 429);
    const reader = request.body?.getReader(); if (!reader) return accessJson({ error: "请求体无效" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 16384) { await reader.cancel(); return accessJson({ error: "请求体过大" }, 413); } chunks.push(part.value); }
    let command: unknown;
    try { command = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return accessJson({ error: "请求体无效" }, 400); }
    validatePolicyCommand(command);
    return accessJson({ policy: await saveFeaturePolicy(actor, command) });
  } catch (error) { return failure(error); }
}
