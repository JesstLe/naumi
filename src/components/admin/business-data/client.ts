import { fleetBusinessSnapshotSchema, fleetBusinessQuerySchema } from "@/lib/fleet/business-contracts";
import { FLEET_BUSINESS_RESPONSE_MAX_BYTES } from "@/lib/fleet/business-central-contracts";
import type { BusinessResponse } from "./types";

export class BusinessReadError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "BusinessReadError"; }
}

/** Validate the query envelope, unique source/site identities and successful snapshot scope before exposing data to the UI.
 * Discard data attached to non-success states and reject contradictory completeness claims.
 */
function parseResponse(input: unknown): BusinessResponse {
  if (!input || typeof input !== "object") throw new BusinessReadError("站点数据格式异常");
  const body = input as BusinessResponse;
  const query = fleetBusinessQuerySchema.parse(body.query);
  if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 16_000 || !Array.isArray(body.sites) || !Array.isArray(body.sources) || typeof body.complete !== "boolean") throw new BusinessReadError("站点数据格式异常");
  const siteIds = new Set<string>(), sourceIds = new Set<string>();
  for (const site of body.sites) {
    if (!site || typeof site.id !== "string" || !site.id || siteIds.has(site.id) || typeof site.name !== "string" || !["local", "main", "enterprise"].includes(site.kind) || typeof site.enabled !== "boolean" || !(site.lastSeen === null || typeof site.lastSeen === "string")) throw new BusinessReadError("站点列表格式异常");
    siteIds.add(site.id);
  }
  const sources = body.sources.map(source => {
    if (!source || typeof source.id !== "string" || sourceIds.has(source.id) || !siteIds.has(source.id) || typeof source.name !== "string" || !["local", "main", "enterprise"].includes(source.kind) || !["pending", "succeeded", "failed", "offline", "unknown", "unavailable"].includes(source.status) || source.error !== undefined && typeof source.error !== "string") throw new BusinessReadError("站点回执格式异常");
    sourceIds.add(source.id);
    if (source.status !== "succeeded") return { ...source, data: undefined };
    const data = fleetBusinessSnapshotSchema.parse(source.data);
    if (data.view !== query.view || data.asOf !== query.asOf || data.page !== query.page) throw new BusinessReadError("站点回执与当前查询不一致");
    return { ...source, data };
  });
  if (!sources.length || body.complete && sources.some(source => source.status !== "succeeded")) throw new BusinessReadError("站点查询尚未完整返回");
  return { ...body, query, sources };
}

/** Native administrator cookies only. Every request and body read share one bound. */
export async function readBusinessResponse(url: string, signal: AbortSignal, input?: unknown): Promise<BusinessResponse> {
  /** Relay cancellation from the caller to the request/body controller using the caller's original abort reason. */
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new BusinessReadError("读取超时，请重试")), 20_000);
  try {
    const response = await fetch(url, {
      method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(input ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : {}),
    });
    if ([401, 403, 404].includes(response.status)) throw new BusinessReadError(response.status === 401 ? "登录已失效，请重新登录" : "当前账号没有跨站数据访问权限", response.status);
    const reader = response.body?.getReader();
    if (!reader) throw new BusinessReadError(response.ok ? "站点数据响应为空" : "站点数据读取失败", response.ok ? undefined : response.status);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength; if (bytes > FLEET_BUSINESS_RESPONSE_MAX_BYTES) throw new BusinessReadError("查询结果过大，请筛选站点或账号");
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const data = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(data)); }
    catch { throw new BusinessReadError(response.ok ? "站点数据格式异常，请重试" : "站点数据读取失败", response.ok ? undefined : response.status); }
    if (!response.ok) {
      const message = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      throw new BusinessReadError(typeof message === "string" ? message : "站点数据读取失败", response.status);
    }
    try { return parseResponse(body); }
    catch (error) { if (error instanceof BusinessReadError) throw error; throw new BusinessReadError("站点数据格式异常，请重试"); }
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new BusinessReadError("读取超时，请重试");
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); controller.abort();
  }
}
