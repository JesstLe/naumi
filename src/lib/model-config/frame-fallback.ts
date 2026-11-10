import {parameterModelIdentity} from "./public-identity";
import type {ModelConfig,ModelFacts} from './types';
import {publicUpstreamIds} from './channel-policy';
import {selectedBusinessOption} from './business';
import {selectedImagePreset} from './image-preset';
import {resolveImageResolution,resolutionFacts,type ResolutionContext} from './resolution-fallback';
import {simulateModel} from './simulation';
import {imageRequestAdmission} from '../imagegen/request-admission';
import {REVERSE_HUB_IMAGE_RATIOS} from '../imagegen/ratio-support';

export type ImageFrameChoice={target:string;effective:string;source:'reference'|'explicit';method:'nearest'|'provider-auto'};
const number=(ratio:string)=>{const [w,h]=ratio.split(':').map(Number);return w>0&&h>0?w/h:NaN;};
/** Match the original Reverse Hub metric: symmetric relative aspect distance,
 * not a pixel-exact gate and not an image transform. Stable tie order. */
export function nearestImageRatios(target:string,ratios:readonly string[]):string[]{
 const aspect=number(target);if(!Number.isFinite(aspect))return [];
 return [...new Set(ratios)].filter(r=>Number.isFinite(number(r))).sort((a,b)=>Math.abs(Math.log(number(a)/aspect))-Math.abs(Math.log(number(b)/aspect)));
}
/** New plans only. Supplier enums choose wire values, never override user intent
 * or authorize another paid attempt. Capabilities/quality/auth still apply. */
export function resolveImageFrame(config:ModelConfig,modelId:string,target:string,feature:string,context:ResolutionContext):{effective:string;method?:ImageFrameChoice['method']} {
 const unchanged={effective:target},model=config.publicModels.find(m=>m.id===modelId);
 if(!model||model.target.type!=='upstream'||selectedImagePreset(config,feature,modelId))return unchanged;
 const allowed=selectedBusinessOption(config,feature,modelId)?.parameters?.ratios;
 const ids=publicUpstreamIds(config,model),sources=config.upstreamModels.filter(u=>ids.includes(u.id)&&u.enabled&&config.providers.some(p=>p.id===u.providerId&&p.enabled));
 const declared=sources.flatMap(u=>{const p=config.providers.find(p=>p.id===u.providerId)!;return u.parameterMap.apimartImages?.ratios||p.options?.imageRatios||(p.options?.imageAdapter==='reverse-hub'?[...REVERSE_HUB_IMAGE_RATIOS]:[]);});
 if(!declared.length&&!sources.some(u=>u.parameterMap.apimartImages?.automaticRatio?.enabled))return unchanged;
 const accepts=(ratio:string)=>{
  if(allowed?.length&&!allowed.includes(ratio))return false;
  const facts:ModelFacts={...context.facts,ratio,imagegenRequirements:context.facts.imagegenRequirements?{...context.facts.imagegenRequirements,requirements:context.facts.imagegenRequirements.requirements.map(r=>r.name==='ratio'?{...r,value:ratio}:r)}:undefined};
  const resolution=resolveImageResolution(config,modelId,facts.requestedResolution||facts.resolution,feature,ratio,{...context,facts});
  return simulateModel(context.snapshot,context.billing,modelId,resolution.changed?resolutionFacts(facts,resolution.effective):facts,context.options).eligible.some(c=>{
   const u=sources.find(u=>u.id===c.upstreamId);if(!u)return false;
   const p=config.providers.find(p=>p.id===u.providerId)!;
   if(ratio==='auto'&&!u.parameterMap.apimartImages?.automaticRatio?.enabled)return false;
   return !imageRequestAdmission(ratio,parameterModelIdentity(config,modelId),!!model.supplierRouting,u,p.options?.imageAdapter).length;
  });
 };
 if(accepts(target))return unchanged;
 for(const ratio of nearestImageRatios(target,allowed?.length?declared.filter(r=>allowed.includes(r)):declared))if(accepts(ratio))return{effective:ratio,method:'nearest'};
 if(accepts('auto'))return{effective:'auto',method:'provider-auto'};
 return unchanged; // No compatible edit/quality/etc. Preserve its real error.
}
