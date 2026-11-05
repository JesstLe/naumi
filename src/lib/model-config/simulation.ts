import {compileImageParameterPlan,imagePlanSelection,configuredImageCapabilities} from './image-parameter-plan';
import "server-only";
import {imageRequestAdmission} from "../imagegen/request-admission";
import type {ConfigSnapshot} from "../billing/types";
import {missingImagegenCapabilities,publishedImagegenCapabilities} from "../imagegen/capabilities";
import {publicUpstreamIds} from "./channel-policy";
import {modelCostRate,monetaryCost} from "./projection";
import {validateModelConfig,type ValidationOptions} from "./schema";
import {ModelConfigError,type ModelConfig,type ModelFacts,type ModelSnapshot} from "./types";
import {selectedImagePreset,presetPublicId,effectiveImageParameters} from "./image-preset";
import {policyQuality} from "./quality-policy";

export type RoutingSimulation = { eligible: { upstreamId: string; providerId: string; rank: number }[]; excluded: { upstreamId: string; codes: string[] }[]; modelVersion: number; billingVersion: number };

function rankFor(quality: string) { return ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 } as Record<string,number>)[quality] || 1; }

function matchesRule(when: ModelConfig["pools"][number]["rules"][number]["when"], f: ModelFacts) {
  return (!when.task || when.task.includes(f.task)) && (!when.quality || (when.quality as string[]).includes(f.quality)) && (!when.resolution || (when.resolution as string[]).includes(f.resolution)) && (["needsEdit", "needsText", "preserveIdentity", "nativeResolution"] as const).every(key => when[key] === undefined || when[key] === f[key]);
}

export function simulateModel(snapshot: ModelSnapshot, billing: ConfigSnapshot, publicModelId: string, facts: ModelFacts, options: ValidationOptions = {}): RoutingSimulation {
  facts = { ...facts, needsText: facts.needsText || facts.task === "layout" };
  if (!Number.isInteger(facts.quantity ?? 1) || (facts.quantity ?? 1) < 1 || (facts.quantity ?? 1) > 4) throw new ModelConfigError("INVALID_REQUEST", "模拟图片数量必须为 1 至 4");
  const config = validateModelConfig(snapshot.config, options);
  const preset = selectedImagePreset(config,undefined,publicModelId,"image.generate");
  if (preset) { const params=effectiveImageParameters(preset,{quality:facts.quality,resolution:facts.resolution,ratio:facts.ratio||"1:1"}); facts={...facts,...params.effective,nativeResolution:params.nativeResolution&&facts.resolution!=="1K"}; publicModelId=presetPublicId(preset,publicModelId); }
  const model = config.publicModels.find(m => m.id === publicModelId && m.enabled && m.modality === "image");
  if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "图片模型不可用", 400);
  const pool = model.target.type === "pool" ? config.pools.find(p => p.id === model.target.id)! : null;
  const ids = publicUpstreamIds(config,model);
  const rule = pool?.rules.filter(r => matchesRule(r.when, facts)).sort((a,b) => b.priority - a.priority)[0];
  const eligible: RoutingSimulation["eligible"] = [], excluded: RoutingSimulation["excluded"] = [];
  const costs = new Map<string, ReturnType<typeof monetaryCost>>();
  for (const id of ids) {
    const u = config.upstreamModels.find(u => u.id === id)!, p = config.providers.find(p => p.id === u.providerId)!, c = u.capabilities;
    const codes: string[] = [];
    if(facts.imagegenRequirements){
      if(facts.imagegenRequirements.conflicts.length)codes.push("IMAGEGEN_INTENT_CONFLICT");
      for(const key of missingImagegenCapabilities(facts.imagegenRequirements,options.imageParameterPlanVersion===0?publishedImagegenCapabilities(c):configuredImageCapabilities(u,publishedImagegenCapabilities(c))))codes.push(`IMAGEGEN_${key.toUpperCase()}_UNSUPPORTED`);
    }
    if (!u.enabled || !p.enabled) codes.push("DISABLED");
    if(model.supplierRouting&&!c[facts.needsEdit?"edit":"generate"])codes.push("OPERATION_UNSUPPORTED");
    if (pool?.rules.length && !rule) codes.push("RULE_UNMATCHED");
    let nativeQuality = facts.quality;
    if (u.parameterMap.qualityPolicy) {
      try { nativeQuality = policyQuality(u.parameterMap.qualityPolicy, facts.quality) || "medium"; }
      catch { codes.push("QUALITY_UNSUPPORTED"); }
    }
    // An explicitly named display tier is not a promise that the model has a
    // corresponding intrinsic quality rank. Explicit route requirements still apply.
    if(u.parameterMap.resolutionPolicy?.mode==="map"&&!u.parameterMap.resolutionPolicy.values[(facts.requestedResolution||facts.resolution) as "1K"|"2K"|"4K"])codes.push("RESOLUTION_MAPPING_MISSING");
    const rank = Math.max(u.parameterMap.qualityPolicy ? 1 : rankFor(nativeQuality), facts.task === "draft" ? 1 : 2, rule?.require.minQualityRank || 1);
    if ((options.imageParameterPlanVersion===0||!u.parameterMap.qualityPolicy) && c.verified && c.qualityRank < rank) codes.push("QUALITY_RANK");
    if (!u.parameterMap.qualityPolicy && c.verified && c.qualities.length && !c.qualities.includes(facts.quality as any)) codes.push("QUALITY_UNSUPPORTED");
    if ((facts.needsEdit || rule?.require.edit) && !c.edit) codes.push("EDIT_UNSUPPORTED");
    const supportsMask = preset ? preset.supportsMask : c.edit && (p.protocol === "openai-images" || p.protocol === "apimart-images" && u.parameterMap.apimartImages?.supportsMask === true);
    if (facts.needsMask && !supportsMask) codes.push("MASK_UNSUPPORTED");
    if (c.verified && (facts.preserveIdentity || rule?.require.preserveIdentity) && !c.preserveIdentity) codes.push("IDENTITY_UNSUPPORTED");
    if (c.verified && (facts.needsText || rule?.require.textAccuracy) && !c.textAccuracy) codes.push("TEXT_UNSUPPORTED");
    if ((rule?.require.nativeResolution || facts.nativeResolution&&(options.imageParameterPlanVersion===0||!u.parameterMap.resolutionPolicy)) && !c.nativeResolutions.includes(facts.resolution as any)) codes.push("NATIVE_RESOLUTION");
    const maxPixels = c.nativeResolutions.includes("4K") ? 4096 * 4096 : c.nativeResolutions.includes("2K") ? 2048 * 2048 : 1536 * 1024;
    const requestedPixels = facts.resolution === "4K" ? 3840 * 2160 : facts.resolution === "2K" ? 2048 * 2048 : 1024 * 1024;
    if (pool && (options.imageParameterPlanVersion===0||!u.parameterMap.resolutionPolicy) && requestedPixels > maxPixels) codes.push("PIXEL_LIMIT");
    if ((c.verified || model.supplierRouting && c.maxReferenceImages > 0) && facts.references > c.maxReferenceImages) codes.push("REFERENCE_LIMIT");
    if(options.imageParameterPlanVersion!==0&&(u.parameterMap.qualityPolicy||u.parameterMap.resolutionPolicy||u.parameterMap.apimartImages))try{compileImageParameterPlan(u,imagePlanSelection(facts),{publicModelId:model.id,protocol:p.protocol,modelVersion:snapshot.version,adapter:p.options?.imageAdapter});}catch(error){codes.push(error instanceof ModelConfigError?error.code:'IMAGE_MAPPING_INVALID');}
    if(options.imageParameterPlanVersion!==0&&u.parameterMap.apimartImages&&imageRequestAdmission(facts.ratio||"1:1",model.id,!!model.supplierRouting,u,p.options?.imageAdapter).includes("ADAPTER_RATIO_UNSUPPORTED"))codes.push("IMAGEGEN_RATIO_UNSUPPORTED");
    const money = monetaryCost(modelCostRate(billing, u, facts.quality, facts.resolution, facts.needsEdit ? "edit" : "generate"));
    costs.set(id, money ? { ...money, amountMicros: (BigInt(money.amountMicros) * BigInt(money.unit === "task" ? 1 : facts.quantity ?? 1)).toString() } : null);
    if (pool?.strategy === "lowest-cost" && !money) codes.push("COST_UNRECORDED");
    if (codes.length) excluded.push({ upstreamId: id, codes }); else eligible.push({ upstreamId: id, providerId: p.id, rank: c.qualityRank });
  }
  if (pool?.strategy === "lowest-cost") {
    const currencies = new Set(eligible.map(u => costs.get(u.upstreamId)!.currency));
    if (currencies.size > 1) { for (const u of eligible.splice(0)) excluded.push({ upstreamId: u.upstreamId, codes: ["COST_CURRENCY"] }); }
  }
  eligible.sort((a,b) => {
    if (pool?.strategy === "lowest-cost") { const x = BigInt(costs.get(a.upstreamId)!.amountMicros), y = BigInt(costs.get(b.upstreamId)!.amountMicros); if (x !== y) return x < y ? -1 : 1; }
    if (pool?.strategy === "latency") { const x = config.upstreamModels.find(u => u.id === a.upstreamId)!.capabilities.expectedLatencyMs, y = config.upstreamModels.find(u => u.id === b.upstreamId)!.capabilities.expectedLatencyMs; if (x !== y) return x - y; }
    if (!pool || pool.strategy === "priority") return ids.indexOf(a.upstreamId) - ids.indexOf(b.upstreamId);
    return a.upstreamId < b.upstreamId ? -1 : a.upstreamId > b.upstreamId ? 1 : 0;
  });
  return { eligible, excluded, modelVersion: snapshot.version, billingVersion: billing.version };
}
