import "server-only";
import { dbEnabled } from "@/platform/db/pool";
import { supabaseEnabled } from "@/lib/auth-mode";
import { activeNativeAccountEmail } from "@/lib/native-auth";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { observeReleaseRequest } from "@/lib/release-runtime/http";
import { ReleaseRuntimeError } from "@/lib/release-runtime/identity";
import { withCreationRequest } from "@/lib/saas/creation-context";
import { TeamError } from "@/lib/teams/errors";
import { FeatureAccessError } from "@/lib/feature-access/repository";
import { GatewayError } from "./errors";
import { authenticateAgentToken } from "./tokens";
import type { GatewayCaller } from "./executor";

// HTTP adapter shared by every /api/agent-gateway/v1 route: bearer-token identity, live account
// state, rate limit, release request accounting and the caller's creation (workspace) scope.

export const GATEWAY_HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const REQUESTS_PER_MINUTE = 120;
const MAX_JSON_BYTES = 256 * 1024;

export function gatewayJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: GATEWAY_HEADERS });
}

export function gatewayFailure(error: unknown): Response {
  if (error instanceof GatewayError) return gatewayJson({ error: error.toJSON() }, error.status);
  if (error instanceof FeatureAccessError) return gatewayJson({ error: { code: "FEATURE_DENIED", message: error.message, submitted: false } }, 403);
  if (error instanceof TeamError) return gatewayJson({ error: { code: error.status === 403 ? "FEATURE_DENIED" : "ARGUMENT_INVALID", message: error.message, submitted: false } }, error.status);
  if (error instanceof ReleaseRuntimeError) return gatewayJson({ error: { code: "UNAVAILABLE", message: "站点暂时不接受新任务（可能正在切换版本），本次未提交，请稍后重试", submitted: false } }, 503);
  console.error("[agent-gateway] unexpected failure", error instanceof Error ? error.message : error);
  return gatewayJson({ error: { code: "INTERNAL", message: "服务暂时不可用", submitted: "unknown" } }, 500);
}

/** The origin the remote caller used, so returned media URLs work from outside the container. */
function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase() || url.protocol.slice(0, -1);
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host).split(",")[0].trim();
  return ["http", "https"].includes(proto) && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) ? `${proto}://${host}` : url.origin;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new GatewayError("ARGUMENT_INVALID", "请求体必须是 JSON 对象", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_JSON_BYTES) throw new GatewayError("ARGUMENT_INVALID", "请求体过大", 413);
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new GatewayError("ARGUMENT_INVALID", "请求体必须是 JSON 对象", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new GatewayError("ARGUMENT_INVALID", "请求体必须是 JSON 对象", 400);
  return body as Record<string, unknown>;
}

export async function authenticateGatewayRequest(request: Request): Promise<GatewayCaller> {
  if (!dbEnabled) throw new GatewayError("SITE_DISABLED", "本站未启用数据库，Agent 接口不可用", 503);
  if (supabaseEnabled) throw new GatewayError("SITE_DISABLED", "本站账号模式暂不支持 Agent 令牌", 503);
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) throw new GatewayError("UNAUTHORIZED", "缺少 Authorization: Bearer <令牌>", 401);
  const token = await authenticateAgentToken(match[1]);
  // Bans, account expiry and admin credential resets made after the token was issued revoke it.
  if (!(await activeNativeAccountEmail(token.email, new Date(token.createdAt).getTime()))) throw new GatewayError("TOKEN_REVOKED", "账号已停用、到期或登录凭证已被重置，令牌已失效", 401);
  const limited = await checkRateLimit(`agent-gateway:${token.id}`, REQUESTS_PER_MINUTE, 60_000);
  if (limited instanceof Response) throw new GatewayError("UNAVAILABLE", "限流服务暂不可用，请稍后重试", 503);
  if (!limited) throw new GatewayError("RATE_LIMITED", `请求过于频繁（每个令牌每分钟最多 ${REQUESTS_PER_MINUTE} 次）`, 429);
  const url = new URL(request.url), origin = publicOrigin(request);
  const internalOrigin = (process.env.INTERNAL_APP_ORIGIN || "").replace(/\/+$/, "") || url.origin;
  return { token, email: token.email, origin, origins: [...new Set([origin, url.origin, internalOrigin])], internalOrigin };
}

/**
 * Runs a gateway handler. With `creation`, the handler runs inside the caller's creation scope
 * (personal, or the enterprise selected by `x-naumi-workspace` / the dedicated site), exactly like
 * a signed-in browser request.
 */
export function gatewayRoute(request: Request, run: (caller: GatewayCaller) => Promise<Response>, options: { creation?: boolean } = {}): Promise<Response> {
  return observeReleaseRequest(request, async () => {
    try {
      const caller = await authenticateGatewayRequest(request);
      if (!options.creation) return await run(caller);
      const workspace = request.headers.get("x-naumi-workspace");
      const scope = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", ...(workspace ? { "x-naumi-workspace": workspace } : {}) }, body: "{}" });
      return await withCreationRequest(scope, caller.email, () => run(caller));
    } catch (error) { return gatewayFailure(error); }
  });
}

/** Newline-delimited JSON stream with heartbeats; the producer keeps running if the client leaves. */
export function ndjsonStream(produce: (send: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null, open = true;
  const send = (event: unknown) => { if (!open || !controller) return; try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { open = false; } };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      const heartbeat = setInterval(() => send({ type: "heartbeat", at: new Date().toISOString() }), 15_000);
      heartbeat.unref?.();
      produce(send).catch(error => {
        const failure = error instanceof GatewayError ? error.toJSON() : { code: "INTERNAL", message: "服务暂时不可用", submitted: "unknown" };
        if (!(error instanceof GatewayError)) console.error("[agent-gateway] stream failure", error instanceof Error ? error.message : error);
        send({ type: "error", error: failure });
      }).finally(() => { clearInterval(heartbeat); if (open) { open = false; try { c.close(); } catch { /* client gone */ } } });
    },
    cancel() { open = false; },
  });
  return new Response(stream, { headers: { ...GATEWAY_HEADERS, "content-type": "application/x-ndjson; charset=utf-8", "x-accel-buffering": "no" } });
}
