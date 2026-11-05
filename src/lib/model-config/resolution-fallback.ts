import type { ModelConfig, ModelFacts, ModelSnapshot, UpstreamModel } from "./types";
import type { ConfigSnapshot } from "../billing/types";
import type { ValidationOptions } from "./schema";
import { publicUpstreamIds } from "./channel-policy";
import { businessRoutePlan, selectedBusinessOption } from "./business";
import { selectedImagePreset } from "./image-preset";
import {simulateModel} from "@/lib/model-config/simulation";
import { imageRequestAdmission } from "../imagegen/request-admission";
import { exactRatioPixels } from "../imagegen/request-size";
import {acceptsAPIMartRatio} from "./apimart-image-policy";
import {conventionalContract} from "./parameter-contract";

export const IMAGE_RESOLUTION_TIERS = ["1K", "2K", "4K"] as const;
export type ImageResolutionTier = typeof IMAGE_RESOLUTION_TIERS[number];
export type ResolutionChoice = { requested: string; effective: string; supported: string[]; changed: boolean };
export type ResolutionContext = { snapshot: ModelSnapshot; billing: ConfigSnapshot; facts: ModelFacts; options?: ValidationOptions };

/** Published mappings, not model names or supplier-discovery guesses. A legacy
 * size map may omit 1K (the normal API size), so retain its native tier list. */
export function upstreamResolutionTiers(upstream: UpstreamModel, ratio?: string): string[] {
  const map = upstream.parameterMap;
  // Conventional: every display tier is sendable (empty cells keep the protocol default).
  let tiers = conventionalContract(map) || map.resolutionPolicy?.mode === "omit" ? [...IMAGE_RESOLUTION_TIERS] : map.resolutionPolicy?.mode === "map"
    ? Object.keys(map.resolutionPolicy.values).filter(k => !!map.resolutionPolicy!.values[k as ImageResolutionTier])
    : Array.from(new Set([...upstream.capabilities.nativeResolutions, ...Object.keys(map.resolution || {})]));
  if (map.apimartImages && ratio && ratio !== "auto") {
    if (!acceptsAPIMartRatio(map.apimartImages,ratio)) {
      // A follow-reference ratio outside the named list still rides the
      // gpt-image exact-size contract as native 16-grid pixels (apib probed
      // 2026-10-27), so the declared tiers stay available for it.
      if (!exactRatioPixels(ratio, upstream.model)) return [];
    } else if (map.apimartImages.outputDimensions) {
      tiers = tiers.filter(t => {const wire=map.resolutionPolicy?.mode==="map"?map.resolutionPolicy.values[t as ImageResolutionTier]:undefined;const actual=wire&&/^[124]k$/i.test(wire)?wire.toUpperCase():t;return !!map.apimartImages!.outputDimensions![`${actual}:${ratio}`] || !!map.resolutionPolicy;});
    }
  }
  return IMAGE_RESOLUTION_TIERS.filter(t => tiers.includes(t));
}

export function resolutionFacts(facts: ModelFacts, tier: string): ModelFacts {
  return {...facts, resolution:tier, requestedResolution:tier,
    ...(facts.imagegenRequirements ? {imagegenRequirements:{...facts.imagegenRequirements,requirements:facts.imagegenRequirements.requirements.map(r=>r.name==="resolution"?{...r,value:tier}:r)}} : {})};
}

/** Missing legacy tier metadata is not an explicit refusal or a native-resolution
 * promise. Keep its existing execution path; declared contracts remain strict. */
export function upstreamAcceptsResolution(upstream: UpstreamModel, tier: string, ratio?: string): boolean {
  const map = upstream.parameterMap;
  const declared = conventionalContract(map) || map.resolutionPolicy?.mode === "map" || upstream.capabilities.nativeResolutions.length > 0
    || Object.keys(map.resolution || {}).length > 0 || !!map.apimartImages;
  return !declared || upstreamResolutionTiers(upstream, ratio).includes(tier);
}

/** Delivery decision BEFORE reservation/freeze; billing retains the selected tier.
 * Exact pixels and accepted task
 * recovery opt out at their entry points. No supplier call or paid retry. */
export function resolveImageResolution(config: ModelConfig, modelId: string | undefined, requested: string, feature?: string, ratio?: string, context?: ResolutionContext): ResolutionChoice {
  const unchanged: ResolutionChoice = { requested, effective: requested, supported: [], changed: false };
  const model = config.publicModels.find(m => m.id === modelId && m.enabled && m.modality === "image");
  if (!model || !(IMAGE_RESOLUTION_TIERS as readonly string[]).includes(requested)) return unchanged;
  const preset = selectedImagePreset(config, feature, model.id);
  const option = selectedBusinessOption(config, feature, model.id);
  const ids = publicUpstreamIds(config, model);
  let supported = IMAGE_RESOLUTION_TIERS.filter(tier => {
    if (preset && (!preset.resolutions.includes(tier) || ratio && ratio!=="auto" && !preset.outputDimensions?.[`${tier}:${ratio}`])) return false;
    const facts = context ? resolutionFacts(context.facts,tier) : undefined;
    const stage = businessRoutePlan(config,option,facts);
    const candidates = stage ? stage.targets : ids;
    const simulated = context ? new Set(simulateModel(context.snapshot,context.billing,model.id,facts!,context.options).eligible.map(u=>u.upstreamId)) : undefined;
    const supportedIds = candidates.filter(id => {
      const u=config.upstreamModels.find(u=>u.id===id), provider=config.providers.find(p=>p.id===u?.providerId);
      if (!u?.enabled || !provider?.enabled || !preset && !(upstreamResolutionTiers(u,ratio).includes(tier)
        || tier === requested && upstreamAcceptsResolution(u,tier,ratio))) return false;
      if (ratio && imageRequestAdmission(ratio,model.id,!!model.supplierRouting,u,provider.options?.imageAdapter).length) return false;
      if (stage && context) {
        const alternative=structuredClone(context.snapshot);
        const selected=alternative.config.publicModels.find(m=>m.id===model.id)!;
        selected.target={type:"upstream",id}; delete selected.supplierRouting;
        return simulateModel(alternative,context.billing,model.id,facts!,context.options).eligible.some(c=>c.upstreamId===id);
      }
      return !simulated || simulated.has(id);
    });
    // External/staged routers cannot silently remove a mandatory fallback target.
    if (stage || model.target.type==="pool"&&!model.supplierRouting) return candidates.length>0 && supportedIds.length===candidates.length;
    return supportedIds.length>0;
  });
  const limits = model.displayResolutions || option?.parameters?.resolutions;
  if (limits?.length) supported = supported.filter(t => limits.includes(t));
  if (!supported.length) return unchanged; // Preserve the normal precise rejection.
  const effective = supported.includes(requested as ImageResolutionTier) ? requested : supported[supported.length - 1];
  return { requested, effective, supported, changed: effective !== requested };
}

export function resolutionFallbackMessage(choice: ResolutionChoice) {
  return choice.changed ? `本次由${choice.requested}自动调整为${choice.effective}，按实际档位生成，积分按所选档位报价保持不变。` : "";
}
