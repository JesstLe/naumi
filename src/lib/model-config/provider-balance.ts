import "server-only";
import { getPool } from "../db";
import { getSetting, setSetting } from "../db";
import { decryptAtRest } from "../settings";
import { modelEndpointFetch } from "./transport";
import type { ValidationOptions } from "./schema";

export type ProviderBalanceProbe = {
  status: "ok" | "unsupported" | "error";
  currency: string;
  remainBalance: number | null;
  usedBalance: number | null;
  detail: string | null;
  probedAt: string;
};

type CachedProbe = ProviderBalanceProbe & { probedAt: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 12_000;

// 余额端点按协议登记。仅返回上游公开的账户额度字段，绝不回传凭据。
const BALANCE_ENDPOINTS: Partial<Record<string, { path: string; currency: string }>> = {
  "apimart-images": { path: "/v1/user/balance", currency: "USD" },
};

export function providerBalanceSupported(protocol: string): boolean {
  return protocol in BALANCE_ENDPOINTS;
}

async function credentialFor(providerId: string): Promise<string | null> {
  try {
    const row = (await getPool().query("SELECT key_enc FROM app_model_credentials WHERE provider_id=$1 LIMIT 1", [providerId])).rows[0];
    return row ? decryptAtRest(row.key_enc) : null;
  } catch {
    return null;
  }
}

/** 主动探测一次余额。错误只保留 HTTP 状态与类别，不透传上游正文。 */
export async function probeProviderBalance(provider: {
  id: string; protocol: string; baseUrl: string;
}): Promise<ProviderBalanceProbe> {
  const endpoint = BALANCE_ENDPOINTS[provider.protocol];
  const now = new Date().toISOString();
  if (!endpoint) return { status: "unsupported", currency: "", remainBalance: null, usedBalance: null, detail: null, probedAt: now };
  const apiKey = await credentialFor(provider.id);
  if (!apiKey) return { status: "error", currency: endpoint.currency, remainBalance: null, usedBalance: null, detail: "未找到可用凭据", probedAt: now };
  const base = provider.baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  try {
    const transport = modelEndpointFetch(provider.baseUrl, {} as ValidationOptions, {
      providerId: provider.id, maxConcurrent: 1, timeoutMs: PROBE_TIMEOUT_MS, apiKey, costDisabled: true,
    });
    const response = await transport(`${base}${endpoint.path}`, { method: "GET", headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return { status: "error", currency: endpoint.currency, remainBalance: null, usedBalance: null, detail: `上游返回 HTTP ${response.status}`, probedAt: now };
    const data: unknown = await response.json();
    const remain = (data as { remain_balance?: unknown })?.remain_balance;
    const used = (data as { used_balance?: unknown })?.used_balance;
    if (typeof remain !== "number" || !Number.isFinite(remain)) {
      return { status: "error", currency: endpoint.currency, remainBalance: null, usedBalance: null, detail: "上游响应缺少余额字段", probedAt: now };
    }
    return { status: "ok", currency: endpoint.currency, remainBalance: remain, usedBalance: typeof used === "number" && Number.isFinite(used) ? used : null, detail: null, probedAt: now };
  } catch (error) {
    const kind = error instanceof Error && /timeout|abort/i.test(error.message) ? "探测超时" : "网络错误";
    return { status: "error", currency: endpoint.currency, remainBalance: null, usedBalance: null, detail: kind, probedAt: now };
  }
}

const cacheKey = (providerId: string) => `provider-balance:${providerId}`;

/** 读缓存；超过 TTL 或显式 refresh 时重新探测并写回。 */
export async function providerBalanceWithCache(
  provider: { id: string; protocol: string; baseUrl: string },
  refresh = false,
): Promise<CachedProbe> {
  let cached: CachedProbe | null = null;
  try {
    const raw = await getSetting(cacheKey(provider.id));
    if (raw) cached = JSON.parse(raw) as CachedProbe;
  } catch { cached = null; }
  const fresh = cached && Date.now() - Date.parse(cached.probedAt) < CACHE_TTL_MS;
  if (cached && fresh && !refresh) return cached;
  const probe = await probeProviderBalance(provider);
  try { await setSetting(cacheKey(provider.id), JSON.stringify(probe)); } catch { /* 缓存写失败不影响探测结果 */ }
  return probe;
}
