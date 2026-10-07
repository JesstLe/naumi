import "server-only";
import { modelEndpointFetch } from "./transport";
import { validateModelEndpoint } from "./schema";
import type { createCredentialStore } from "./credentials";
import type { ModelProvider } from "./types";
import { readBounded } from "../supplier-cost/io";

export type ProviderCatalogModel = { id: string; label: string; ownedBy?: string };
export type ProviderCatalogResult = {
  providerId: string;
  name: string;
  protocol: string;
  status: "ok" | "empty" | "unsupported" | "no-credential" | "error";
  models: ProviderCatalogModel[];
  fetchedAt: string;
  error?: string;
  truncated?: boolean;
};

const catalogProtocols = new Set(["openai-images", "new-api-flow", "openai-chat", "apimart-images", "apimart", "openai-videos"]);
const identifier = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);

function catalogUrl(baseUrl: string, protocol: string) {
  const base = new URL(baseUrl);
  const path = base.pathname.replace(/\/+$/, "");
  base.pathname = ["apimart-images", "apimart"].includes(protocol) ? `${path.replace(/\/v1$/, "")}/v1/models` : `${path}/models`;
  return base.toString();
}

function parseModels(body: any): { models: ProviderCatalogModel[]; truncated: boolean } {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : null;
  if (!rows) throw new Error("catalog-invalid-schema");
  if(rows.length>10000)throw new Error("catalog-too-many-models");
  const seen = new Set<string>();
  const models = rows.map((row: any) => {
    const id = typeof row === "string" ? row : row?.id;
    const ownedBy = typeof row?.owned_by === "string" ? row.owned_by.slice(0, 100) : undefined;
    if (!identifier(id) || seen.has(id)) return null;
    seen.add(id);
    return { id, label: typeof row?.name === "string" && row.name.trim() ? row.name.trim().slice(0, 160) : id, ...(ownedBy ? { ownedBy } : {}) };
  }).filter(Boolean) as ProviderCatalogModel[];
  return { models: models.slice(0,600), truncated: models.length>600 || !!body.has_more || !!body.next_page };
}

export async function discoverProviderCatalog(
  provider: ModelProvider,
  credentials: ReturnType<typeof createCredentialStore>,
  trustedOrigins: readonly string[],
  fetcher?: typeof fetch,
): Promise<ProviderCatalogResult> {
  const fetchedAt = new Date().toISOString();
  const base = { providerId: provider.id, name: provider.name, protocol: provider.protocol, fetchedAt } as const;
  if (!catalogProtocols.has(provider.protocol)) return { ...base, status: "unsupported", models: [], error: "该协议未声明标准模型目录接口" };
  if (!provider.credentialRef) return { ...base, status: "no-credential", models: [], error: "尚未配置供应商凭据" };
  try {
    const key = await credentials.read(provider.credentialRef, provider.id);
    const endpoint = validateModelEndpoint(provider.baseUrl, { trustedOrigins });
    const transport = fetcher || modelEndpointFetch(endpoint, { trustedOrigins });
    const response = await transport(catalogUrl(endpoint,provider.protocol), { headers: { authorization: `Bearer ${key}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok) {await response.body?.cancel();return { ...base, status: "error", models: [], error: `供应商目录请求失败（HTTP ${response.status}）` };}
    const text = await readBounded(response);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return { ...base, status: "error", models: [], error: "供应商目录不是有效 JSON" }; }
    const {models,truncated} = parseModels(body);
    return { ...base, status: models.length ? "ok" : "empty", models, truncated };
  } catch (error) {
    const code = error instanceof Error && /^supplier-query-http-\d+$/.test(error.message) ? error.message : "目录暂时不可用";
    return { ...base, status: "error", models: [], error: code };
  }
}
