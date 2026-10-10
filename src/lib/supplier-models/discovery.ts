import "server-only";
import type {SupplierSpecificationCatalog} from "./specifications";
import { createHash } from "node:crypto";
import { modelEndpointFetch } from "../model-config/transport";
import { validateModelEndpoint } from "../model-config/schema";
import { readBounded } from "../supplier-cost/io";
import { decimalMicros } from "../supplier-cost/money";
import { unknownSupplierMetadata, type SupplierMetadata, type SupplierPrice } from "./types";
import type { ModelProvider } from "../model-config/types";

// Source data is evidence, never credentials or executable configuration.
export function cleanSource(value: any): any {
  if (typeof value === "string") return value.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]").replace(/Bearer\s+\S+/gi, "[redacted]");
  if (Array.isArray(value)) return value.map(cleanSource);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(api_?key|authorization|password|secret|credential(_?ref)?|access_?token|token)$/i.test(k)).map(([k, v]) => [k, cleanSource(v)]));
  return value;
}
export const sourceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type PublicSupplierDirectory = { url: string; fetchedAt: string; hash: string; body: any;specifications?:SupplierSpecificationCatalog };
export async function discoverPublicSupplierDirectory(provider: ModelProvider, trustedOrigins: readonly string[], fetcher?: typeof fetch): Promise<PublicSupplierDirectory | null> {
  if (!["openai-images", "new-api-flow", "openai-chat", "openai-videos"].includes(provider.protocol)) return null;
  try {
    const endpoint = validateModelEndpoint(provider.baseUrl, { trustedOrigins });
    const url = new URL("/api/pricing", endpoint).toString();
    const response = await (fetcher || modelEndpointFetch(endpoint, { trustedOrigins }))(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const body = cleanSource(JSON.parse(await readBounded(response)));
    if (body.success !== true || !Array.isArray(body.data) || body.data.length > 10000) return null;
    let specifications:SupplierSpecificationCatalog|undefined;
    // This is a documented export endpoint of this supplier, not a guessed convention for every host.
    if(new URL(endpoint).hostname==="newapi.prompt-hubs.com"||new URL(endpoint).hostname==="console.prompt-hubs.com"){
      try{
        const docsUrl="https://console.prompt-hubs.com/docs/catalog.json";
        const docsResponse=await (fetcher||modelEndpointFetch(docsUrl,{trustedOrigins}))(docsUrl,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
        if(docsResponse.ok){const docs=cleanSource(JSON.parse(await readBounded(docsResponse)));if(docs.success===true&&Array.isArray(docs.models)&&docs.models.length<=10000){const stable={version:docs.version,capability_version:docs.capability_version,models:docs.models};specifications={url:docsUrl,fetchedAt:new Date().toISOString(),hash:sourceHash(stable),body:stable};}}else await docsResponse.body?.cancel();
      }catch{/* A temporary missing spec export leaves recorded defaults and manual data intact. */}
    }
    return { url, fetchedAt: new Date().toISOString(), hash: sourceHash(body), body,...(specifications?{specifications}:{}) };
  } catch { return null; }
}
const priceId = (model: string, variant: string) => {
  const h = sourceHash([model, variant]).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
};
// Only explicit currency/unit/amount data becomes a structured price. Ratios stay raw.
export function documentedMetadata(row: any, source: PublicSupplierDirectory): SupplierMetadata {
  const metadata = unknownSupplierMetadata();
  const tags = typeof row.tags === "string" ? row.tags.split(",").map((s: string) => s.trim()) : [];
  metadata.family = String(row.family || row.model_family || row.model_name).slice(0, 120);
  metadata.brand = String(row.brand || row.vendor || (typeof row.icon === "string" ? row.icon.replace(/\.Color$/, "") : "")).slice(0, 120);
  metadata.modality = tags.includes("image") ? "image" : tags.includes("video") ? "video" : tags.includes("audio") ? "audio" : tags.includes("embedding") ? "embedding" : tags.includes("text") || tags.includes("chat") ? "text" : "unknown";
  metadata.notes = String(row.description || "").slice(0, 1000);
  metadata.capabilitySource = "供应商公开目录声明（未逐项实测）";
  metadata.capabilityUrl = source.url;
  metadata.checkedAt = source.fetchedAt.slice(0, 10);
  metadata.capabilityState = "documented";
  // Explicit machine-readable lists only; prose and tags remain evidence, not capability proof.
  for (const key of ["qualities", "resolutions", "ratios"] as const) if (Array.isArray(row[key]) && row[key].length <= 50 && row[key].every((v: any) => typeof v === "string" && v.length <= 100)) metadata.capabilities[key] = row[key];
  const prices: SupplierPrice[] = [];
  const add = (value: any, variant: string, group: string, label = "") => {
    if (!value || !["CNY", "USD"].includes(value.currency)) return;
    const basis = value.unit === "1M_tokens" ? "token" : ["request", "image", "second", "frame"].includes(value.unit) ? value.unit : null;
    if (!basis) return;
    const amount = (v: any) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? decimalMicros(String(v)) : null;
    const p: SupplierPrice = { id: priceId(row.model_name, variant), quality: "", resolution: /^(1k|2k|4k)$/i.test(label) ? label.toUpperCase() : "", basis, currency: value.currency, amountMicros: basis === "token" ? null : amount(value.request), inputMicrosPerMillion: basis === "token" ? amount(value.input) : null, outputMicrosPerMillion: basis === "token" ? amount(value.output) : null, cachedInputMicrosPerMillion: basis === "token" ? amount(value.cache) : null, imageInputMicrosPerMillion: basis === "token" ? amount(value.image_input) : null, source: `供应商公开报价 · ${group || "目录默认"}${label ? " · " + label : ""}`.slice(0, 1000), sourceUrl: source.url, checkedAt: metadata.checkedAt, status: "documented" };
    if (basis === "token" ? p.inputMicrosPerMillion === null || p.outputMicrosPerMillion === null : p.amountMicros === null) return;
    prices.push(p);
  };
  const quote = (p: any, group: string) => {
    add(p, group + ":default", group);
    if (Array.isArray(p?.tiers)) p.tiers.forEach((t: any, i: number) => add({ ...p, ...t }, `${group}:tier:${i}`, group, String(t.label || "")));
  };
  quote(row.price, "");
  if (row.group_prices && typeof row.group_prices === "object") Object.entries(row.group_prices).forEach(([group, p]) => quote(p, group));
  metadata.prices = prices.slice(0, 50);
  return metadata;
}
