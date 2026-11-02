import "server-only";
import { z } from "zod";
import { authorizeCollaborationRequest, collaborationFailure } from "../enterprise/collaboration-access";
import { CanvasShareError, fail } from "./domain";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const configured = process.env.NAUMI_ENTERPRISE_PUBLIC_ORIGIN;
  if (!configured) return request.headers.get("origin") === new URL(request.url).origin;
  try {
    const origin = new URL(configured);
    return !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/" &&
      ["http:", "https:"].includes(origin.protocol) && request.headers.get("origin") === origin.origin && request.headers.get("host") === origin.host;
  } catch { return false; }
}
export function shareResponse(body: unknown) { return Response.json(body, { headers }); }
export async function shareJson(request: Request) {
  const limit = 65536; if (Number(request.headers.get("content-length") || 0) > limit) fail("SHARE_BODY_TOO_LARGE", "请求超过大小限制", 413);
  if (!request.headers.get("content-type")?.includes("application/json")) fail("SHARE_CONTENT_TYPE", "请发送 JSON 请求", 400);
  const reader = request.body?.getReader(); if (!reader) fail("SHARE_BODY_REQUIRED", "请求内容为空", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > limit) fail("SHARE_BODY_TOO_LARGE", "请求超过大小限制", 413); chunks.push(next.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail("SHARE_JSON_INVALID", "JSON 格式无效", 400); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function shareRoute(request: Request, run: (email: string, enterpriseId: string) => Promise<Response>) {
  try {
    const auth = await authorizeCollaborationRequest(request); if (auth instanceof Response) { auth.headers.set("cache-control", "private, no-store"); return auth; }
    const url = new URL(request.url), enterpriseId = z.string().uuid().parse(url.searchParams.get("enterpriseId"));
    if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) fail("SHARE_ORIGIN", "请求来源不符", 403);
    return await run(auth.email, enterpriseId);
  } catch (error) {
    if (error instanceof CanvasShareError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "分享参数无效", code: "SHARE_INVALID_INPUT" }, { status: 400, headers });
    return collaborationFailure(error);
  }
}
