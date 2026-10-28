import {compileImageParameterPlan,imagePlanSelection} from './image-parameter-plan';
import {publicUpstreamIds} from './channel-policy';
import {resolveImageResolution} from "./resolution-fallback";
import {assertDisplayResolution} from "./resolution-options";
import "server-only";
import { currentExecutionBundle, currentModelExecution } from "./context";
import {readManagedModelSnapshot} from "./snapshot-reader";
import { selectedBusinessOption } from "./business";
import { ModelConfigError, type ModelSnapshot } from "./types";
import type { BillingFacts, BillingQuote, ConfigSnapshot } from "../billing/types";
import { selectedImagePreset, effectiveImageParameters } from "./image-preset";
import { procurementCost, apiCostCredits } from "../billing/api-cost";
import { rounded } from "../billing/money";
import {managedModelCreditRule,applyCreditOverride} from "./credit-overrides";
import {policyQuality} from "./quality-policy";

export function freezeImagePresetQuote(snapshot: ConfigSnapshot, models: ModelSnapshot, facts: BillingFacts, create: (s:ConfigSnapshot,f:BillingFacts)=>BillingQuote): BillingQuote | null {
  assertDisplayResolution(models.config.publicModels.find(m=>m.id===facts.modelId),facts.resolution);
  const preset = facts.byok ? undefined : selectedImagePreset(models.config,facts.feature,facts.modelId);
  if (!preset) return null;
  if (models.config.business?.[facts.feature]?.enabled === false) throw new ModelConfigError("FEATURE_DISABLED","该功能已停用",409);
  const parameters = effectiveImageParameters(preset,{quality:facts.quality,resolution:facts.resolution,ratio:facts.ratio||currentModelExecution("image")?.frozen.requestedParameters?.ratio||"1:1"});
  const v = preset.prices.find(v=>v.quality===parameters.effective.quality&&v.resolution===parameters.effective.resolution);
  if(managedModelCreditRule(snapshot,facts)){
    const adjusted={...facts,quality:parameters.effective.quality,resolution:parameters.effective.resolution};
    const config=structuredClone(snapshot.config);config.features[facts.feature].unit="image";
    const q=create(applyCreditOverride(snapshot,{version:snapshot.version,config},adjusted),adjusted);
    return {...q,modelVersion:models.version,legacyCompatible:false,imagePreset:structuredClone(preset),requestedParameters:parameters.requested,effectiveParameters:parameters.effective,procurement:structuredClone(v?.procurement),costRates:{}};
  }
  const cost = v && procurementCost(v.procurement,v.estimatedUsage,1,preset.fx?.rateMicros);
  if (!v || !cost) throw new ModelConfigError("INVALID_CONFIG","完整输入输出成本未知，请先维护有效规格的估算",400);
  // Token estimate is per output; actual total task receipts remain authoritative.
  const config = structuredClone(snapshot.config), tariff = config.features[facts.feature];
  const p = {mode:"api-cost-plus" as const,factorBps:preset.factorBps,estimateCnyMicros:rounded(cost.numerator,cost.denominator,"ceil").toString(),authorizationCnyMicros:(BigInt(preset.authorizationCnyMicros)*BigInt(facts.quantity)).toString(),creditsPerCnyMicros:preset.creditsPerCnyMicros,rounding:preset.rounding};
  const estimated = apiCostCredits(cost.numerator*BigInt(facts.quantity),cost.denominator,p);
  if (cost.numerator * BigInt(preset.factorBps) > BigInt(preset.authorizationCnyMicros)*cost.denominator*BigInt(10000)) throw new ModelConfigError("INVALID_CONFIG","预计售价超过授权上限，请管理员核对预设",400);
  tariff.enabled=true; tariff.unit="image"; tariff.rules=[]; tariff.pricing=p;
  tariff.settlement={...tariff.settlement,qualityBasis:"requested",successBasis:"successful-units",failureBps:0,reserveBps:10000};
  const q=create({version:snapshot.version,config},{...facts,quality:parameters.effective.quality});
  q.requestedCredits=facts.metered?estimated:0;
  return {...q,refundExpiry:structuredClone(snapshot.config.credits.admin),modelVersion:models.version,legacyCompatible:false,imagePreset:structuredClone(preset),requestedParameters:parameters.requested,effectiveParameters:parameters.effective,procurement:structuredClone(v.procurement),costRates:{}};
}

function originalBusinessBillingSnapshot(snapshot: ConfigSnapshot, models: ModelSnapshot, facts: BillingFacts): ConfigSnapshot {
  assertDisplayResolution(models.config.publicModels.find(m=>m.id===facts.modelId),facts.resolution);
  const preset = selectedImagePreset(models.config, facts.feature, facts.modelId);
  if (preset) {
    const config = structuredClone(snapshot.config), tariff = config.features[facts.feature], params = effectiveImageParameters(preset, { quality:facts.quality, resolution:facts.resolution, ratio:facts.ratio || "1:1" });
    const item = preset.prices.find(v => v.quality === params.effective.quality && v.resolution === params.effective.resolution) || preset.prices[0];
    if (!item) throw new ModelConfigError("INVALID_CONFIG", "默认 APIMart 预设缺少可报价成本");
    const cost = procurementCost(item.procurement,item.estimatedUsage,1,preset.fx?.rateMicros);
    if(!cost) throw new ModelConfigError("INVALID_CONFIG", "完整输入输出成本未知");
    const estimate = rounded(cost.numerator,cost.denominator,"ceil").toString();
    tariff.enabled = true; tariff.unit = "image"; tariff.rules = [];
    tariff.pricing = { mode:"api-cost-plus", factorBps:preset.factorBps, estimateCnyMicros:estimate, authorizationCnyMicros:preset.authorizationCnyMicros, creditsPerCnyMicros:preset.creditsPerCnyMicros, rounding:preset.rounding };
    tariff.settlement = { ...tariff.settlement, qualityBasis:"requested", successBasis:"successful-units", failureBps:0, reserveBps:10000 };
    return {version:snapshot.version,config};
  }
  const option = selectedBusinessOption(models.config, facts.feature, facts.modelId);
  if (!option?.pricing) return snapshot;
  const config = structuredClone(snapshot.config), tariff = config.features[facts.feature];
  // Feature-model terms are authoritative; legacy feature rules must not override them.
  tariff.enabled = true; tariff.pricing = structuredClone(option.pricing); tariff.unit = option.unit; tariff.rules = [];
  tariff.settlement = { ...tariff.settlement, qualityBasis: "requested", successBasis: "successful-units", failureBps: 0, reserveBps: 10000 };
  return { version: snapshot.version, config };
}
export function businessBillingSnapshot(snapshot:ConfigSnapshot,models:ModelSnapshot,facts:BillingFacts){
  return applyCreditOverride(snapshot,originalBusinessBillingSnapshot(snapshot,models,facts),facts);
}
export async function freezeBusinessQuote(request: Request, snapshot: ConfigSnapshot, facts: BillingFacts, create: (s: ConfigSnapshot, f: BillingFacts) => BillingQuote, options:{allowResolutionFallback?:boolean;effectiveResolution?:string;deferImageFrame?:boolean}={}) {
  return freezeBusinessQuoteForModel(snapshot,facts.byok?null:await readManagedModelSnapshot(),facts,create,{...options,accepted:request.headers.has("x-naumi-accepted-model-context")});
}
/** Pure pricing against the same selected model snapshot used to prepare facts. */
export function freezeBusinessQuoteForModel(snapshot:ConfigSnapshot,models:ModelSnapshot|null,facts:BillingFacts,create:(s:ConfigSnapshot,f:BillingFacts)=>BillingQuote,options:{allowResolutionFallback?:boolean;effectiveResolution?:string;deferImageFrame?:boolean;accepted?:boolean}={}){
  if(facts.byok||!models)return create(snapshot,facts);
  const scope = currentModelExecution("image");
  const originalFacts = facts;
  // Display has no reference pixels. Frozen/accepted execution never uses this path.
  const deferredFrame=options.deferImageFrame===true&&facts.ratio==="auto"&&!scope&&!currentExecutionBundle()&&!options.accepted;
  // Existing frozen scopes (including old Worker/Agent children) are authoritative.
  // New scopes retain the user's selection separately, with actual tier in facts.
  const choice = deferredFrame ? {requested:facts.resolution,effective:facts.resolution,changed:false} : options.effectiveResolution ? {requested:facts.resolution,effective:options.effectiveResolution,changed:options.effectiveResolution!==facts.resolution} : scope && scope.frozen.publicModelId===facts.modelId && scope.frozen.requestedParameters && scope.frozen.facts
    ? {requested:scope.frozen.requestedParameters?.resolution||facts.resolution,effective:scope.frozen.facts.requestedResolution||scope.frozen.facts.resolution,changed:false}
    : scope || currentExecutionBundle() || options.allowResolutionFallback===false || options.accepted
      ? {requested:facts.resolution,effective:facts.resolution,changed:false}
      : resolveImageResolution(models.config,facts.modelId,facts.resolution,facts.feature,facts.ratio);
  // A planner supplies both its original facts and explicit effective tier.
  // An unrelated enclosing image scope must not rewrite that selected price.
  // Legacy/frozen callers without this explicit contract retain old precedence.
  const originalResolution=options.effectiveResolution ? originalFacts.resolution : (scope?.frozen.publicModelId===facts.modelId?scope?.frozen.requestedParameters?.resolution:undefined)||originalFacts.resolution;
  const adjusted=originalResolution!==choice.effective;
  // User pricing policy: keep the selected/front-end tier and its quote. Only
  // delivery parameters fall back; do not silently reprice the accepted choice.
  facts={...facts,resolution:originalResolution};
  assertDisplayResolution(models.config.publicModels.find(m=>m.id===facts.modelId),choice.effective);
  const pricedModels=adjusted?structuredClone(models):models;
  if(adjusted){const m=pricedModels.config.publicModels.find(m=>m.id===facts.modelId);if(m)delete m.displayResolutions;}
  const presetQuote=freezeImagePresetQuote(snapshot,pricedModels,facts,create);
  if (presetQuote) {
    if (adjusted) { presetQuote.requestedParameters = {...presetQuote.requestedParameters!,resolution:originalResolution}; presetQuote.effectiveParameters = {...presetQuote.effectiveParameters!,resolution:choice.effective}; presetQuote.legacyCompatible=false; }
    return presetQuote;
  }
  const q = create(businessBillingSnapshot(snapshot, pricedModels, facts), facts);
  q.modelVersion = models.version;
  if(managedModelCreditRule(snapshot,facts)) q.legacyCompatible=false;
  if (models.config.business?.[facts.feature]) q.legacyCompatible = false;
  const model = models.config.publicModels.find(m => m.id === facts.modelId);
  const upstream = models.config.upstreamModels.find(u => u.id === (scope?.frozen.target.type === "upstream" && scope.frozen.publicModelId === facts.modelId ? scope.frozen.target.id : model?.target.id));
  if (!model?.supplierRouting && upstream?.parameterMap.qualityPolicy) {
    const wire = policyQuality(upstream.parameterMap.qualityPolicy, facts.quality);
    q.requestedParameters = {quality:facts.quality,resolution:facts.resolution,ratio:facts.ratio||"1:1"};
    q.effectiveParameters = {...q.requestedParameters,quality:wire||"auto"};
  }
  // A route can pay several suppliers. Never label the initial-model cost as
  // this operation's total; execution stages remain the authoritative estimate.
  if (!model?.supplierRouting && !q.procurement && !selectedBusinessOption(models.config,facts.feature,facts.modelId)?.routing?.enabled && upstream?.procurement) q.procurement = structuredClone(upstream.procurement);
  else if (models.config.business?.[facts.feature]) q.costRates = {};
  if (adjusted) {
    q.requestedParameters = {quality:originalFacts.quality,resolution:originalResolution,ratio:originalFacts.ratio||"1:1"};
    q.effectiveParameters = {...(q.effectiveParameters||q.requestedParameters),resolution:choice.effective};
    q.legacyCompatible = false;
  }
  // Freeze administrator mappings alongside the unchanged customer tariff.
  // Saved quotes return before this function, so historical quotes are not upgraded.
  if(!deferredFrame&&model?.modality==='image'&&model.target.type==='upstream'&&(!scope||scope.frozen.imageParameterPlanVersion===1)){
    q.imageParameterPlanVersion=1;q.imageParameterPlans={};
    for(const id of publicUpstreamIds(models.config,model)){
      const u=models.config.upstreamModels.find(u=>u.id===id),p=models.config.providers.find(p=>p.id===u?.providerId);
      if(!u?.enabled||!p?.enabled)continue;
      try{q.imageParameterPlans[id]=compileImageParameterPlan(u,imagePlanSelection({...facts,resolution:choice.effective}),{publicModelId:model.id,protocol:p.protocol,modelVersion:models.version,adapter:p.options?.imageAdapter});}
      catch(error){if(!model.supplierRouting)throw error;}
    }
    if(!Object.keys(q.imageParameterPlans).length)throw new ModelConfigError('IMAGE_MAPPING_INVALID','没有完整的图片参数映射',422);
  }
  return q;
}
