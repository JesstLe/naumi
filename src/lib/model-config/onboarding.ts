import 'server-only';
import {isDeepStrictEqual} from 'node:util';
import {QUALITY_IDS,RESOLUTION_IDS,type FeatureId} from '../billing/rules/registry';
import type {ConfigSnapshot,Pricing} from '../billing/types';
import {ModelConfigError,type ModelSnapshot,type ModelConfig,type UpstreamModel} from './types';
import type {OnboardingInput,OnboardingEntry} from './onboarding-contract';
import {imageModelDisplayId} from '../image-model-routing';
import {FEATURE_BINDINGS,featureDefaultModel,upstreamSupportsFeature} from './feature-model-policy';
import {modelCreditView} from './management-pricing';
import {compileImageParameterPlan} from './image-parameter-plan';
import {publicModelCatalog} from './public-catalog';

const fail=(code:string,message:string):never=>{throw new ModelConfigError(code,message,422);};
function copiedPrice(billing:ConfigSnapshot,snapshot:ModelSnapshot,sourceId:string,feature:FeatureId,u:UpstreamModel):Extract<Pricing,{mode:'matrix'}>{
 const source=snapshot.config.publicModels.find(m=>m.id===sourceId);
 if(!source?.enabled||!source.visible||source.modality!==u.modality||!publicModelCatalog(snapshot,u.modality,feature,true).models.some(m=>m.id===sourceId))fail('PRICE_SOURCE_UNAVAILABLE','请选择已生效的同类模型作为售价来源');
 const prices=Object.fromEntries(QUALITY_IDS.map(q=>[q,Object.fromEntries(RESOLUTION_IDS.map(r=>[r,null]))])) as Extract<Pricing,{mode:'matrix'}>['prices'];
 for(const quality of u.capabilities.qualities.length?u.capabilities.qualities:['medium'])for(const resolution of u.capabilities.nativeResolutions.length?u.capabilities.nativeResolutions:['1K']){
  const v=modelCreditView(billing,snapshot,feature,sourceId,quality,resolution);
  if(v.credits===null||v.estimated||!Number.isSafeInteger(v.credits))fail('PRICE_SOURCE_UNAVAILABLE',`来源模型在${feature}的${quality}/${resolution}没有确定的积分售价`);
  prices[quality as keyof typeof prices][resolution as keyof typeof prices.low]=v.credits;
 }
 return {mode:'matrix',prices};
}

/** One additive publication: public identity, executable source, parameters and price.
 * Never updates an old source, old price, purpose binding, or feature default. */
export function planModelOnboarding(snapshot:ModelSnapshot,billing:ConfigSnapshot,input:OnboardingInput){
 const config=structuredClone(snapshot.config),changes:{publicId:string;upstreamId:string;wireModel:string;features:FeatureId[];priceSource:string;enabled:boolean}[]=[];
 for(const {source} of input.entries)if('upstream'in source&&!config.providers.some(p=>p.id===source.upstream.providerId))
  throw new ModelConfigError('PROVIDER_UNAVAILABLE','供应商不存在',404);
 const ids=new Set<string>();
 for(const entry of input.entries){
  if(ids.has(entry.publicId)||config.publicModels.some(m=>m.id===entry.publicId||m.previousIds?.includes(entry.publicId)))fail('PUBLIC_ID_CONFLICT','公开模型ID已被使用或保留为历史兼容ID');
  ids.add(entry.publicId);
  let upstream:UpstreamModel;
  if('upstreamId'in entry.source){
   const id=entry.source.upstreamId;const found=config.upstreamModels.find(u=>u.id===id);if(!found)fail('MODEL_UNAVAILABLE','实际模型不存在');upstream=found!;
  }else{
   const incoming=structuredClone(entry.source.upstream);
   const provider=config.providers.find(p=>p.id===incoming.providerId);
   if(!provider?.enabled||!provider.credentialRef)fail('PROVIDER_UNAVAILABLE','请先接入供应商并保存凭据');
   if(incoming.parameterMap.apimartImages&&provider?.protocol!=='apimart-images')fail('PROTOCOL_MISMATCH','实际模型的参数契约与供应商协议不一致');
   const old=config.upstreamModels.find(u=>u.id===incoming.id);
   if(old){
    // Existing definitions are never silently rewritten by a template.
    const expected=structuredClone(incoming);expected.enabled=old.enabled;expected.capabilities.verified=old.capabilities.verified;
    if(!isDeepStrictEqual(old,expected))fail('UPSTREAM_COLLISION','已有实际模型配置不同，请选择已有模型或使用新的上游标识');
    upstream=old;
   }else{
    // Explicit administrator definitions do not depend on a live discovery cache.
    // Provider identity, protocol, parameters and prices are still validated.
    incoming.enabled=input.enabled;
    incoming.capabilities.verified=input.capabilityConfirmed;
    config.upstreamModels.push(incoming);upstream=incoming;
   }
  }
  if(upstream.modality==='image'&&imageModelDisplayId(entry.publicId)!==entry.publicId)fail('INVALID_PUBLIC_ID','新图片家族ID不能使用历史比例分支后缀');
  if(input.enabled&&(!upstream.enabled||!upstream.capabilities.generate))fail('MODEL_NOT_READY','请先启用上游及生成用途；已有上游不会被新增流程自动改写');
  if(new Set(entry.features).size!==entry.features.length)fail('INVALID_TOOL_SCOPE','适用功能不能重复');
  for(const feature of entry.features){const binding=FEATURE_BINDINGS[feature];if(!binding||!upstreamSupportsFeature(upstream.capabilities,binding,feature))fail('MODEL_INCOMPATIBLE','实际模型不支持所选用途');if(config.business?.[feature]?.enabled===false)fail('FEATURE_DISABLED','所选功能已停用，不会因新增模型自动启用');}
  if(upstream.modality==='image'&&upstream.parameterMap.apimartImages){
   for(const quality of upstream.capabilities.qualities)for(const resolution of upstream.capabilities.nativeResolutions)compileImageParameterPlan(upstream,{quality,resolution,ratio:upstream.parameterMap.apimartImages.ratios[0]},{publicModelId:entry.publicId,protocol:'apimart-images',modelVersion:snapshot.version+1});
  }
  config.publicModels.push({id:entry.publicId,label:entry.label,modality:upstream.modality,enabled:input.enabled,visible:true,target:{type:'upstream',id:upstream.id},toolScope:{features:entry.features,defaultFor:[]},...(upstream.modality==='image'?{displayResolutions:upstream.capabilities.nativeResolutions as ('1K'|'2K'|'4K')[]}:{})});
  config.business||={};
  for(const feature of entry.features){
   const pricing=entry.price.mode==='copy'?copiedPrice(billing,snapshot,entry.price.sourceModelId,feature,upstream):entry.price.mode==='per-feature'?entry.price.prices[feature]:structuredClone(entry.price);
   if(!pricing)fail('PRICE_REQUIRED','请为每一个所选功能设置完整售价');
   if(pricing?.mode==='matrix')for(const quality of upstream.capabilities.qualities.length?upstream.capabilities.qualities:['medium'])for(const resolution of upstream.capabilities.nativeResolutions.length?upstream.capabilities.nativeResolutions:['1K']){
    if(pricing.prices[quality as keyof typeof pricing.prices]?.[resolution as keyof typeof pricing.prices.low]===null||pricing.prices[quality as keyof typeof pricing.prices]?.[resolution as keyof typeof pricing.prices.low]===undefined)fail('PRICE_REQUIRED',`缺少${feature}的${quality}/${resolution}售价`);
   }
   let f=config.business[feature];
   if(!f){
    const previousDefault=publicModelCatalog(snapshot,upstream.modality,feature,true).defaultModelId||featureDefaultModel(snapshot.config,feature,FEATURE_BINDINGS[feature]);
    if(!previousDefault)fail('FEATURE_CONFIG_REQUIRED','该功能没有既有默认模型，请先配置默认用途');
    f=config.business[feature]={enabled:true,defaultModelId:previousDefault!,inheritExisting:true,options:[]};
   }
   f!.options.push({modelId:entry.publicId,enabled:input.enabled,sort:Math.max(-1,...f!.options.map(o=>o.sort))+1,unit:upstream.modality==='image'?'image':'task',pricing,
    ...(upstream.modality==='image'?{parameters:{qualities:upstream.capabilities.qualities,resolutions:upstream.capabilities.nativeResolutions,ratios:upstream.parameterMap.apimartImages?.ratios}}:{})});
  }
  changes.push({publicId:entry.publicId,upstreamId:upstream.id,wireModel:upstream.model,features:entry.features,priceSource:entry.price.mode==='copy'?entry.price.sourceModelId:'明确积分',enabled:input.enabled});
 }
 return {config,changes};
}

export function onboardingView(config:ModelConfig){return {upstreams:config.upstreamModels.map(u=>structuredClone(u)),incomplete:config.publicModels.filter(m=>!m.enabled||!m.visible).map(m=>({id:m.id,label:m.label,reason:!m.enabled?'未启用':'前端隐藏'}))};}
export function onboardingDraftEntries(config:ModelConfig,base:ModelConfig):OnboardingEntry[]{
 return config.publicModels.filter(m=>!base.publicModels.some(old=>old.id===m.id)).flatMap(m=>{
  if(m.target.type!=='upstream')return [];const u=config.upstreamModels.find(u=>u.id===m.target.id);if(!u)return [];
  const features=Object.entries(config.business||{}).filter(([,f])=>f?.options.some(o=>o.modelId===m.id)).map(([id])=>id as FeatureId).sort();
  const prices=Object.fromEntries(features.flatMap(feature=>{const price=config.business?.[feature]?.options.find(o=>o.modelId===m.id)?.pricing;return price&&['matrix','fixed'].includes(price.mode)?[[feature,price]]:[];}));
  if(Object.keys(prices).length!==features.length)return [];
  return [{publicId:m.id,label:m.label,source:base.upstreamModels.some(old=>old.id===u.id)?{upstreamId:u.id}:{upstream:structuredClone(u)},features,price:{mode:'per-feature',prices} as OnboardingEntry['price']}];
 });
}
