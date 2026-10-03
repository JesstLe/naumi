import "server-only";
import { createHash } from "node:crypto";
import type { ConfigSnapshot, CostRate } from "../billing/types";
import { canonicalConfig } from "./repository";
import { validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelSnapshot, type UpstreamModel } from "./types";

export type MoneyPrice = { resolution: string; quality: string; mode: string; currency: "CNY" | "USD"; amountMicros: string; unit?: "image" | "item" | "task" };
export type RouterRoute = { id: string; provider: string; upstream_model: string; enabled: boolean; healthy: boolean; estimated_cost_microusd: number; expected_latency_ms: number; quality_rank: number; max_pixels: number; text_accuracy: boolean; native_4k: boolean; supports_edit: boolean; max_concurrent: number; max_reference_images?: number; preserves_identity?: boolean; estimate_source?: string; upstream_version?: string; quality_map?: Record<string,string>; native_resolutions?: string[]; supported_qualities?: string[]; money_prices?: MoneyPrice[] };
export type RouterPayload = { digest: string; modelVersion: number; billingVersion: number; config: { routes: RouterRoute[]; providers: { id: string; protocol: string; baseUrl: string; credentialRef: string; timeoutMs: number; maxConcurrent: number }[]; aliases: { id: string; candidates: string[]; strategy: string; rules?: unknown[] }[] } };
export type RouterProjection = { digest: string; modelVersion: number; billingVersion: number; payload: RouterPayload };
export function modelCostRate(billing: ConfigSnapshot, model: UpstreamModel, quality: string, resolution: string, mode: string): CostRate | undefined {
  if (!model.costRef) return undefined;
  const rates = billing.config.costs, key = model.costRef;
  return rates[`${key}:${quality}:${resolution}:${mode}`] || rates[`${key}:${quality}:${resolution}`] || rates[`${key}:${mode}`] || rates[key];
}
export function monetaryCost(rate?: CostRate): { currency: "CNY" | "USD"; amountMicros: string; unit: CostRate["unit"] } | null {
  if (!rate || rate.currency === "credits") return null;
  if (!/^[0-9]{1,18}$/.test(rate.amountMicros)) throw new ModelConfigError("INVALID_COST", "货币成本格式无效");
  let amount = BigInt(rate.amountMicros), currency = rate.currency;
  if (currency === "USD" && rate.cnyPerUnitMicros) {
    if (!/^[0-9]{1,18}$/.test(rate.cnyPerUnitMicros) || BigInt(rate.cnyPerUnitMicros) < BigInt(1)) throw new ModelConfigError("INVALID_COST", "货币成本折算率无效");
    const micro = BigInt(1000000); amount = (amount * BigInt(rate.cnyPerUnitMicros) + micro - BigInt(1)) / micro; currency = "CNY";
  }
  if (amount < BigInt(1) || amount > BigInt(1000000000000)) throw new ModelConfigError("INVALID_COST", "货币成本超出有效范围");
  return { currency, amountMicros: amount.toString(), unit: rate.unit };
}
export function compileRouterProjection(snapshot: ModelSnapshot, billing: ConfigSnapshot, options: ValidationOptions = {}): RouterProjection {
  const config = validateModelConfig(snapshot.config, options);
  const upstreams = new Map(config.upstreamModels.map(u => [u.id,u]));
  const providers = new Map(config.providers.map(p => [p.id,p]));
  const selected = new Set<string>(); const aliases: RouterPayload["config"]["aliases"] = [];
  for (const model of config.publicModels.filter(m => m.enabled && m.modality === "image")) {
    if (model.target.type === "upstream") {
      const upstream = upstreams.get(model.target.id)!;
      if (!["apimart-images", "fal-images"].includes(providers.get(upstream.providerId)!.protocol)) continue;
      if (upstream.enabled && providers.get(upstream.providerId)!.enabled) { selected.add(upstream.id); aliases.push({ id: model.id, candidates: [upstream.id], strategy: "priority" }); }
      continue;
    }
    const pool = config.pools.find(p => p.id === model.target.id)!;
    const candidates = pool.candidates.filter(id => { const u = upstreams.get(id)!; return u.enabled && providers.get(u.providerId)!.enabled; });
    for (const id of candidates) {
      const u = upstreams.get(id)!;
      if (!["openai-images", "apimart-images", "fal-images"].includes(providers.get(u.providerId)!.protocol)) throw new ModelConfigError("UNSUPPORTED_POOL_PROTOCOL", "该协议目前只支持直连，不能加入图片混合路由", 400, [`pools.${pool.id}`]);
      selected.add(id);
    }
    aliases.push({ id: model.id, candidates, strategy: pool.strategy, ...(pool.rules.length ? { rules: pool.rules.map(r => ({ id: r.id, priority: r.priority, when: r.when, require: Object.fromEntries(Object.entries(r.require).filter(([, v]) => v !== false && v !== undefined)) })) } : {}) });
  }
  const routes: RouterRoute[] = [];
  for (const id of Array.from(selected)) {
    const u = upstreams.get(id)!, p = providers.get(u.providerId)!, c = u.capabilities;
    const prices: MoneyPrice[] = [];
    for (const size of ["1K", "2K", "4K"]) for (const quality of c.qualities.length ? c.qualities : ["low", "medium", "high", "xhigh", "max", "auto"]) for (const mode of c.edit ? ["generate", "edit"] : ["generate"]) {
      const amount = monetaryCost(modelCostRate(billing, u, quality, size, mode));
      if (amount) prices.push({ resolution: size, quality, mode, ...amount });
    }
    routes.push({ id: u.id, provider: p.id, upstream_model: u.model, enabled: true, healthy: true, estimated_cost_microusd: 0, expected_latency_ms: c.expectedLatencyMs, quality_rank: c.qualityRank, max_pixels: c.nativeResolutions.includes("4K") ? 4096 * 4096 : c.nativeResolutions.includes("2K") ? 2048 * 2048 : 1536 * 1024, text_accuracy: c.textAccuracy, native_4k: c.nativeResolutions.includes("4K"), supports_edit: c.edit, max_concurrent: p.maxConcurrent,
      ...(c.maxReferenceImages ? { max_reference_images: c.maxReferenceImages } : {}), ...(c.preserveIdentity ? { preserves_identity: true } : {}), ...(c.qualities.length ? { supported_qualities: c.qualities } : {}), ...(c.nativeResolutions.length ? { native_resolutions: c.nativeResolutions } : {}), ...(u.parameterMap.version ? { upstream_version: u.parameterMap.version } : {}), ...(u.parameterMap.quality && Object.keys(u.parameterMap.quality).length ? { quality_map: u.parameterMap.quality } : {}), ...(prices.length ? { money_prices: prices, estimate_source: "billing_reference" } : { estimate_source: "unrecorded" }) });
  }
  for (const alias of aliases.filter(a => a.strategy === "lowest-cost")) {
    let currency = "";
    for (const id of alias.candidates) {
      const route = routes.find(r => r.id === id)!;
      if (!route.money_prices?.length) throw new ModelConfigError("INVALID_COST", "最低成本策略需要每个候选有可比较的货币成本", 400, [`upstreamModels.${id}.costRef`]);
      const caps = upstreams.get(id)!.capabilities;
      for (const size of ["1K", "2K", "4K"]) {
        const pixels = size === "4K" ? 3840 * 2160 : size === "2K" ? 2048 * 2048 : 1024 * 1024;
        if (pixels > route.max_pixels) continue;
        for (const quality of caps.qualities.length ? caps.qualities : ["low", "medium", "high", "xhigh", "max", "auto"]) for (const mode of caps.edit ? ["generate", "edit"] : ["generate"]) {
          if (!route.money_prices.some(price => price.resolution === size && price.quality === quality && price.mode === mode)) throw new ModelConfigError("INVALID_COST", "最低成本策略的质量、尺寸或操作成本缺项", 400, [`upstreamModels.${id}.costRef`]);
        }
      }
      for (const price of route.money_prices) { if (currency && currency !== price.currency) throw new ModelConfigError("INVALID_COST", "最低成本策略需要同一货币成本基准与明确折算率", 400, [`upstreamModels.${id}.costRef`]); currency = price.currency; }
    }
  }
  const ids = new Set(routes.map(r => r.provider));
  const payloadConfig: RouterPayload["config"] = { routes, aliases, providers: config.providers.filter(p => ids.has(p.id)).map(p => ({ id: p.id, protocol: p.protocol, baseUrl: p.baseUrl, credentialRef: p.credentialRef!, timeoutMs: p.timeoutMs, maxConcurrent: p.maxConcurrent })) };
  const payloadBase = { modelVersion: snapshot.version, billingVersion: billing.version, config: payloadConfig };
  const digest = createHash("sha256").update(canonicalConfig(payloadBase)).digest("hex");
  return { digest, modelVersion: snapshot.version, billingVersion: billing.version, payload: { ...payloadBase, digest } };
}
