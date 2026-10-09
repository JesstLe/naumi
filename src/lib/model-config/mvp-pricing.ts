import "server-only";
import {createHash} from "node:crypto";
import type {BillingFacts,ConfigSnapshot,Pricing} from "../billing/types";
import {quote} from "../billing/quote";
import {validateBillingConfig} from "../billing/rules/schema";
import {QUALITY_IDS,RESOLUTION_IDS,type FeatureId} from "../billing/rules/registry";
import {ModelConfigError,type ModelSnapshot} from "./types";
import {businessBillingSnapshot,freezeImagePresetQuote} from "./business-billing";
import {mvpCreditRule,MVP_CREDIT_PREFIX,type MvpCreditPricing} from "./credit-overrides";
import type {MvpRow} from "./mvp";
import {imageModelDisplayId} from "../image-model-routing";

export function modelCreditView(billing:ConfigSnapshot,models:ModelSnapshot,feature:FeatureId,modelId:string){
  const facts:BillingFacts={feature,modelId,quantity:1,quality:"medium",resolution:"1K",ratio:"1:1",metered:true,byok:false,paidFen:0,userGroup:"default"};
  const override=mvpCreditRule(billing,facts)?.pricing;
  try{
    const q=freezeImagePresetQuote(billing,models,facts,quote) || quote(businessBillingSnapshot(billing,models,facts),facts);
    return {feature,unit:q.tariff.unit,credits:q.requestedCredits,estimated:["usage","api-cost-plus","cost-plus"].includes(q.tariff.pricing.mode),override:override as MvpCreditPricing|undefined};
  }catch{return {feature,unit:billing.config.features[feature].unit,credits:null,estimated:true,override:override as MvpCreditPricing|undefined};}
}
export function mvpPriceViews(billing:ConfigSnapshot,models:ModelSnapshot,row:MvpRow){
  return row.features.map(f=>({...modelCreditView(billing,models,f.id as FeatureId,row.publicIds[0]),label:f.label}));
}
export function editMvpCredits(billing:ConfigSnapshot,models:ModelSnapshot,row:MvpRow,features:FeatureId[],pricing:MvpCreditPricing|null){
  if(!features.length || new Set(features).size!==features.length || features.some(f=>!row.features.some(x=>x.id===f)))throw new ModelConfigError("INVALID_PRICE_SCOPE","请选择已应用此模型的工具");
  if(pricing?.mode==="quality-resolution" && QUALITY_IDS.some(q=>RESOLUTION_IDS.some(r=>pricing.quality[q]+pricing.resolutionExtra[r]>2147483647)))throw new ModelConfigError("INVALID_PRICE","积分总价超出范围");
  const config=structuredClone(billing.config);
  const ids=models.config.publicModels.filter(m=>m.modality===row.modality && (row.modality==="image"?imageModelDisplayId(m.id)===row.id:m.id===row.id)).map(m=>m.id);
  const ruleId=MVP_CREDIT_PREFIX+createHash("sha256").update(row.modality+":"+row.id).digest("hex").slice(0,32);
  for(const feature of features){
    const tariff=config.features[feature];tariff.rules=tariff.rules.filter(r=>r.id!==ruleId);
    if(pricing){const priority=Math.max(0,...tariff.rules.map(r=>r.priority))+1;if(priority>2147483647)throw new ModelConfigError("INVALID_PRICE","规则优先级已达上限，请在完整计费中心核对");tariff.rules.push({id:ruleId,priority,when:{modelId:ids,byok:false},pricing:structuredClone(pricing),settlement:{qualityBasis:"requested",successBasis:"successful-units",failureBps:0,reserveBps:10000}});}
  }
  return validateBillingConfig(config);
}
