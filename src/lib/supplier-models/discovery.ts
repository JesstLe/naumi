import "server-only";
import type {SupplierSpecificationCatalog} from "./specifications";
import { createHash } from "node:crypto";
import { modelEndpointFetch } from "../model-config/transport";
import { validateModelEndpoint } from "../model-config/schema";
import { readBounded } from "../supplier-cost/io";
import { decimalMicros } from "../supplier-cost/money";
import { unknownSupplierMetadata, type SupplierMetadata, type SupplierPrice } from "./types";
import type { ModelProvider } from "../model-config/types";
import {videoDefinitionSchema,type VideoModelDefinition} from "../video/capability-schema";
import {documentedVideoParameters} from './video-parameters';

/** Only explicit supplier declarations are translated; names and independent size lists are not evidence of combinations. */
export function documentedVideoDefinition(raw:any):VideoModelDefinition|undefined{
  if(!raw||typeof raw!=="object")return undefined;
  const direct=raw.videoDefinition||raw.capabilities?.video||raw.parameterMetadata?.video;
  const parameterContract=documentedVideoParameters(raw);
  if(direct){const parsed=videoDefinitionSchema.safeParse({...direct,...(parameterContract?{parameterContract}:{})});return parsed.success?parsed.data:undefined;}
  const source=raw.video_capabilities||raw;
  if(!Array.isArray(source.mode)&&!Array.isArray(source.durationResolutionMap))return parameterContract?{parameterContract}:undefined;
  const aliases:Record<string,string>={text:"text",singleImage:"single_image",startEndRequired:"frames_required",startFrameOptional:"first_optional",endFrameOptional:"last_optional"};
  const modes:string[]=[],limits:Record<string,number>={};
  for(const mode of source.mode||[]){
    if(typeof mode==="string"&&aliases[mode])modes.push(aliases[mode]);
    else if(Array.isArray(mode)){
      modes.push("reference");for(const count of mode){const match=typeof count==="string"&&count.match(/^(image|video|audio)Reference:(\d+)$/);if(match)limits[`${match[1]}s`]=Number(match[2]);}
    }
  }
  const definition={...(parameterContract?{parameterContract}:{}),...(modes.length?{modes:[...new Set(modes)]}:{}),...(Object.keys(limits).length?{limits}:{}),
    ...(Array.isArray(source.durationResolutionMap)?{durationResolutionMap:source.durationResolutionMap.map((m:any)=>({durations:m.durations||m.duration,resolutions:m.resolutions||m.resolution}))}:{}),
    ...(source.audio!==undefined?{audio:source.audio===true?"required":source.audio===false?"disabled":source.audio}:{}),
    ...(Array.isArray(source.aspectRatios)?{aspectRatios:source.aspectRatios}:{})};
  const parsed=videoDefinitionSchema.safeParse(definition);return parsed.success?parsed.data:undefined;
}

/** Keep the successful decoder and its actual source URL inseparable. */
export function selectDocumentedVideoDefinition(candidates:Array<{raw:unknown;sourceUrl:string}>){
  for(const candidate of candidates){const definition=documentedVideoDefinition(candidate.raw);if(definition&&Object.keys(definition).length)return {definition,sourceUrl:candidate.sourceUrl};}
}

// Source data is evidence, never credentials or executable configuration.
export function cleanSource(value: any): any {
  if (typeof value === "string") return value.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]").replace(/Bearer\s+\S+/gi, "[redacted]");
  if (Array.isArray(value)) return value.map(cleanSource);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(api_?key|authorization|password|secret|credential(_?ref)?|access_?token|token)$/i.test(k)).map(([k, v]) => [k, cleanSource(v)]));
  return value;
}
export const sourceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Explicit native catalog fields only; directory membership is not a live test.
 * Used to initialize new records. Refreshes retain separately sourced raw data,
 * and cannot replace administrator capabilities, prices or execution mappings. */
export function reverseHubCatalogMetadata(row: any, url: string, observedAt: string): SupplierMetadata | undefined {
  if (row?.provider !== "jimeng" || row.evidence !== "catalog") return undefined;
  const image = row.image_capabilities, video = row.video_capabilities;
  const caps = image || video;
  if (!caps || caps.source !== "native_catalog" || !Array.isArray(row.operations)) return undefined;
  const metadata = unknownSupplierMetadata();
  metadata.family = image ? "即梦图片" : "即梦视频"; metadata.brand = "即梦";
  metadata.modality = image ? "image" : "video";
  metadata.capabilityState = "documented"; metadata.capabilitySource = "Reverse Hub 原生执行器模型目录（未逐项实测）";
  metadata.capabilityUrl = url; metadata.checkedAt = observedAt.slice(0, 10);
  metadata.capabilities.generate = row.operations.includes(image ? "image.generate" : "video.generate");
  metadata.capabilities.edit = row.operations.includes("image.edit");
  for (const name of ["resolutions", "ratios"] as const) if (Array.isArray(caps[name]) && caps[name].length <= 50 && caps[name].every((v: any) => typeof v === "string" && v.length <= 100)) metadata.capabilities[name] = caps[name];
  if (Number.isInteger(caps.max_reference_images) && caps.max_reference_images >= 0 && caps.max_reference_images <= 32) metadata.capabilities.maxReferences = caps.max_reference_images;
  metadata.parameterMetadata.nativeCatalog = { defaultResolution: caps.default_resolution || null, ...(video ? { durations: video.durations || null, defaultDuration: video.default_duration || null } : {}) };
  metadata.notes = "目录声明与实测证据分开保存；未提供采购报价，成本未知。";
  return metadata;
}
export type PublicSupplierDirectory = { url: string; fetchedAt: string; hash: string; body: any;specifications?:SupplierSpecificationCatalog };
export async function discoverPublicSupplierDirectory(provider: ModelProvider, trustedOrigins: readonly string[], fetcher?: typeof fetch,signal?:AbortSignal): Promise<PublicSupplierDirectory | null> {
  signal?.throwIfAborted();
  const deadline=()=>{
    signal?.throwIfAborted();
    const timeout=AbortSignal.timeout(8000);
    return signal?AbortSignal.any([signal,timeout]):timeout;
  };
  if (!provider.options?.parameterCatalogPath&&!["openai-images", "new-api-flow", "openai-chat", "openai-videos"].includes(provider.protocol)) return null;
  try {
    const endpoint = validateModelEndpoint(provider.baseUrl, { trustedOrigins });
    const url = new URL("/api/pricing", endpoint).toString();
    let body:any=null;
    try{
      const response = await (fetcher || modelEndpointFetch(endpoint, { trustedOrigins }))(url, { cache: "no-store", redirect: "error", signal: deadline() });
      if(response.ok){const parsed=cleanSource(JSON.parse(await readBounded(response)));if(parsed.success===true&&Array.isArray(parsed.data)&&parsed.data.length<=10000)body=parsed;}
      else await response.body?.cancel();
    }catch{signal?.throwIfAborted();/* Missing pricing does not prevent parameter discovery. */}
    let specifications:SupplierSpecificationCatalog|undefined;
    // Explicit same-origin catalog location, reusable across providers. Never
    // follow arbitrary links or send a provider key to a documentation host.
    if(provider.options?.parameterCatalogPath){
      const docsUrl=new URL(provider.options.parameterCatalogPath,endpoint).toString();
      try{
        const docsResponse=await (fetcher||modelEndpointFetch(endpoint,{trustedOrigins}))(docsUrl,{cache:'no-store',redirect:'error',signal:deadline()});
        if(docsResponse.ok){const docs=cleanSource(JSON.parse(await readBounded(docsResponse)));if(Array.isArray(docs.models)&&docs.models.length<=10000)specifications={url:docsUrl,fetchedAt:new Date().toISOString(),hash:sourceHash(docs),body:docs};}
        else await docsResponse.body?.cancel();
      }catch{signal?.throwIfAborted();/* Preserve previous sources on unavailable refresh. */}
    }
    // This is a documented export endpoint of this supplier, not a guessed convention for every host.
    if(!specifications&&(new URL(endpoint).hostname==="newapi.prompt-hubs.com"||new URL(endpoint).hostname==="console.prompt-hubs.com")){
      try{
        const docsUrl="https://console.prompt-hubs.com/docs/catalog.json";
        const docsResponse=await (fetcher||modelEndpointFetch(docsUrl,{trustedOrigins}))(docsUrl,{cache:"no-store",redirect:"error",signal:deadline()});
        if(docsResponse.ok){const docs=cleanSource(JSON.parse(await readBounded(docsResponse)));if(docs.success===true&&Array.isArray(docs.models)&&docs.models.length<=10000){const stable={version:docs.version,capability_version:docs.capability_version,models:docs.models};specifications={url:docsUrl,fetchedAt:new Date().toISOString(),hash:sourceHash(stable),body:stable};}}else await docsResponse.body?.cancel();
      }catch{signal?.throwIfAborted();/* Keep recorded defaults and manual data. */}
    }
    if(!body&&!specifications)return null;
    body ||= {success:false,data:[]};
    return { url, fetchedAt: new Date().toISOString(), hash: sourceHash(body), body,...(specifications?{specifications}:{}) };
  } catch { signal?.throwIfAborted();return null; }
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
