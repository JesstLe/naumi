import { authenticatedEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/platform/db/pool";
import { supabaseEnabled } from "@/lib/auth-mode";
import { createAgentToken, listAgentTokens, parseTokenInput, revokeAgentToken } from "@/lib/agent-gateway/tokens";
import { gatewayFailure, gatewayJson, readJsonBody } from "@/lib/agent-gateway/http";
import { GatewayError } from "@/lib/agent-gateway/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token management for the signed-in browser session only. A personal API token is never
// accepted here, so a token cannot mint or revoke tokens.

async function owner(request: Request, mutation: boolean): Promise<string> {
  if (!dbEnabled) throw new GatewayError("SITE_DISABLED", "本站未启用数据库", 503);
  if (supabaseEnabled) throw new GatewayError("SITE_DISABLED", "本站账号模式暂不支持 Agent 令牌", 503);
  if (mutation) {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new GatewayError("UNAUTHORIZED", "请求来源无效", 403);
    const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (origin && host) { let same = false; try { same = new URL(origin).host === host.split(",")[0].trim(); } catch { /* invalid origin */ } if (!same) throw new GatewayError("UNAUTHORIZED", "请求来源无效", 403); }
  }
  const email = await authenticatedEmail(request);
  if (!email) throw new GatewayError("UNAUTHORIZED", "请先登录", 401);
  return email;
}

export async function GET(request: Request) {
  try { return gatewayJson({ tokens: await listAgentTokens(await owner(request, false)) }); }
  catch (error) { return gatewayFailure(error); }
}

export async function POST(request: Request) {
  try {
    const email = await owner(request, true);
    const created = await createAgentToken(email, parseTokenInput(await readJsonBody(request)));
    return gatewayJson({ token: created.token, secret: created.secret }, 201);
  } catch (error) { return gatewayFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    const email = await owner(request, true);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!(await revokeAgentToken(email, id))) throw new GatewayError("OPERATION_NOT_FOUND", "令牌不存在或已吊销", 404);
    return gatewayJson({ ok: true });
  } catch (error) { return gatewayFailure(error); }
}
