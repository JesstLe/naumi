import "server-only";
import {createHash} from "node:crypto";
import type {BillingFacts,ConfigSnapshot} from "../billing/types";
import {quote} from "../billing/quote";
import {validateBillingConfig} from "../billing/rules/schema";
import {QUALITY_IDS,RESOLUTION_IDS,type FeatureId} from "../billing/rules/registry";
import {ModelConfigError,type ModelSnapshot} from "./types";
import {businessBillingSnapshot,freezeImagePresetQuote} from "./business-billing";
import {mvpCreditRule,MVP_CREDIT_PREFIX,type MvpCreditPricing} from "./credit-overrides";
import type {MvpRow,MvpCreditGrid} from "./mvp";
import {publicModelCatalog} from "./runtime";
import {selectedImagePreset,effectiveImageParameters} from "./image-preset";
import {imageModelDisplayId} from "../image-model-routing";

export function modelCreditView(billing:ConfigSnapshot,models:ModelSnapshot,feature:FeatureId,modelId:string,quality="medium",resolution="1K"){
  const facts:BillingFacts={feature,modelId,quantity:1,quality,resolution,ratio:"1:1",metered:true,byok:false,paidFen:0,userGroup:"default"};
  const override=mvpCreditRule(billing,facts)?.pricing;
  try{
    const q=freezeImagePresetQuote(billing,models,facts,quote) || quote(businessBillingSnapshot(billing,models,facts),facts);
    return {feature,unit:q.tariff.unit,credits:q.requestedCredits,estimated:["usage","api-cost-plus","cost-plus"].includes(q.tariff.pricing.mode),override:override as MvpCreditPricing|undefined};
  }catch{return {feature,unit:billing.config.features[feature].unit,credits:null,estimated:true,override:override as MvpCreditPricing|undefined};}
}
export function mvpPriceViews(billing:ConfigSnapshot,models:ModelSnapshot,row:MvpRow){
  return row.features.map(f=>({...modelCreditView(billing,models,f.id as FeatureId,row.publicIds[0]),label:f.label}));
}
export function modelCreditGrid(billing:ConfigSnapshot,models:ModelSnapshot,row:MvpRow,feature:FeatureId):MvpCreditGrid{
  const model=publicModelCatalog(models,row.modality,feature,true).models.find(m=>row.publicIds.includes(m.id));
  if(!model)throw new ModelConfigError("MODEL_UNAVAILABLE","此工具没有可报价模型",400);
  const qualities=model.qualities?.length ? model.qualities : ["medium"],resolutions=model.nativeResolutions?.length ? model.nativeResolutions : ["1K"];
  const preset=selectedImagePreset(models.config,feature,model.id);
  return QUALITY_IDS.flatMap(quality=>RESOLUTION_IDS.map(resolution=>{
    const available=row.modality!=="image"?quality==="medium"&&resolution==="1K":qualities.includes(quality as never)&&resolutions.includes(resolution as never);
    const effectiveQuality=preset?effectiveImageParameters(preset,{quality,resolution,ratio:"1:1"}).effective.quality:quality;
    const view=available?modelCreditView(billing,models,feature,model.id,quality,resolution):null;
    return {quality,resolution,available,effectiveQuality,credits:view?.credits ?? null,estimated:view?.estimated ?? false};
  }));
}
export function editMvpCredits(billing:ConfigSnapshot,models:ModelSnapshot,row:MvpRow,features:FeatureId[],pricing:MvpCreditPricing|null){
  if(!features.length || new Set(features).size!==features.length || features.some(f=>!row.features.some(x=>x.id===f)))throw new ModelConfigError("INVALID_PRICE_SCOPE","请选择已应用此模型的工具");
  if(pricing?.mode==="quality-resolution" && QUALITY_IDS.some(q=>RESOLUTION_IDS.some(r=>pricing.quality[q]+pricing.resolutionExtra[r]>2147483647)))throw new ModelConfigError("INVALID_PRICE","积分总价超出范围");
  if(pricing?.mode==="matrix"){
    const allowed=new Set<string>();
    for(const feature of features)for(const cell of modelCreditGrid(billing,models,row,feature).filter(c=>c.available)){
      allowed.add(cell.effectiveQuality+":"+cell.resolution);
      if(pricing.prices[cell.effectiveQuality]?.[cell.resolution]===null || pricing.prices[cell.effectiveQuality]?.[cell.resolution]===undefined)throw new ModelConfigError("INVALID_PRICE","请填写全部可用规格的积分，或仅选择适用工具");
    }
    if(QUALITY_IDS.some(q=>RESOLUTION_IDS.some(r=>pricing.prices[q][r]!==null && !allowed.has(q+":"+r))))throw new ModelConfigError("INVALID_PRICE","不支持的规格不能设置积分");
  }
  const config=structuredClone(billing.config);
  const ids=models.config.publicModels.filter(m=>m.modality===row.modality && (row.modality==="image"?imageModelDisplayId(m.id)===row.id:m.id===row.id)).map(m=>m.id);
  const ruleId=MVP_CREDIT_PREFIX+createHash("sha256").update(row.modality+":"+row.id).digest("hex").slice(0,32);
  for(const feature of features){
    const tariff=config.features[feature];tariff.rules=tariff.rules.filter(r=>r.id!==ruleId);
    if(pricing){const priority=Math.max(0,...tariff.rules.map(r=>r.priority))+1;if(priority>2147483647)throw new ModelConfigError("INVALID_PRICE","规则优先级已达上限，请在完整计费中心核对");tariff.rules.push({id:ruleId,priority,when:{modelId:ids,byok:false},pricing:structuredClone(pricing),settlement:{qualityBasis:"requested",successBasis:"successful-units",failureBps:0,reserveBps:10000}});}
  }
  return validateBillingConfig(config);
}
