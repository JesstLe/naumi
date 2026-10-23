import presets from "./video-family-presets.json";
import type {ModelConfig,ModelProvider,UpstreamModel} from "./types";
import type {VideoModelDefinition,VideoWireProfile} from "../video/capability-schema";
import {ModelConfigError} from "./types";
import {documentedVideoFamily} from "./video-family-capabilities";

export const VERIFIED_VIDEO_FAMILIES=presets;
export const VERIFIED_VIDEO_PROFILES=["apimart-apib-seedance","apimart-apib-kling","apimart-apib-wan","apimart-apib-h3","geek-kling","geek-wan3"] as const;
export const DOCUMENTED_VIDEO_PROFILES=["apib-video-v2","geek-video-v2","geek-h3-v2"] as const;
// Supplier evidence remains valid, but this host cannot yet validate video
// reference inputs in an independent media worker. Preserve the declaration
// without making that special-purpose editing path available for submission.
export const VIDEO_FAMILY_ACTIVATION_EXCLUSIONS=[{providerId:"apib-video",model:"wan2.7-videoedit",publicId:"video-apib-wan2-7-videoedit",reason:"VIDEO_EDITING_REQUIRES_SEPARATE_ACCEPTANCE"}] as const;
export function videoFamilyActivationEnabled(item:{providerId:string;model:string}){
  return !VIDEO_FAMILY_ACTIVATION_EXCLUSIONS.some(excluded=>excluded.providerId===item.providerId&&excluded.model===item.model);
}
export const ACTIVE_VIDEO_FAMILY_ITEMS=presets.items.filter(videoFamilyActivationEnabled);
type Patch={entity:"providers"|"upstreamModels"|"publicModels";id:string;before:unknown|null;after:unknown};
type CredentialRefs={"geeknow-video":string;"geeknow-video-h3":string};
function fail(message:string):never{throw new ModelConfigError("VIDEO_FAMILY_PLAN_CONFLICT",message,409);}
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")}}`;return JSON.stringify(value);}
export function makeVideoFamilyPlan(source:ModelConfig,credentialRefs:CredentialRefs){
  const config=structuredClone(source),before=structuredClone(source);
  const apib=config.providers.find(p=>p.id==="apib-video"),geek=config.providers.find(p=>p.id==="geeknow-images");
  if(!apib?.credentialRef||apib.protocol!=="apimart"||new URL(apib.baseUrl).origin!=="https://api.apib.ai")fail("APIB视频来源与已核验账户不一致");
  if(!geek?.enabled||!geek.credentialRef||new URL(geek.baseUrl).origin!=="https://www.geeknow.top")fail("Geek凭据来源与已核验账户不一致");
  apib.enabled=true;
  const newProviders:ModelProvider[]=[
    {id:"geeknow-video",name:"Geek 视频",protocol:"openai-videos",baseUrl:geek.baseUrl,enabled:true,credentialRef:credentialRefs["geeknow-video"],timeoutMs:geek.timeoutMs,maxConcurrent:geek.maxConcurrent,options:{idempotencyStrategy:"none"}},
    {id:"geeknow-video-h3",name:"Geek H3 视频",protocol:"minimax",baseUrl:geek.baseUrl,enabled:true,credentialRef:credentialRefs["geeknow-video-h3"],timeoutMs:geek.timeoutMs,maxConcurrent:geek.maxConcurrent,options:{videoProfile:"minimax",createPath:"/v1/videos",pollPath:"/v1/videos/{id}",idempotencyStrategy:"header"}},
  ];
  for(const p of newProviders){
    if(!/^[0-9a-f-]{36}$/i.test(p.credentialRef||""))fail("新视频来源缺少自己所属的加密凭据");
    const existing=config.providers.find(v=>v.id===p.id);
    if(existing){if(canonical(existing)!==canonical(p))fail("视频来源已存在不同设置，不能覆盖管理员改动");}
    else config.providers.push(p);
  }
  if(!ACTIVE_VIDEO_FAMILY_ITEMS.some(item=>item.publicId===presets.defaultPublicModelId))fail("视频默认型号不在当前可启用范围内");
  const upstreamIds:string[]=[],excludedModels:Array<{publicModelId:string;upstreamId:string;model:string;reason:string}>=[];
  for(const item of presets.items){
    const enabled=videoFamilyActivationEnabled(item);
    let u=config.upstreamModels.find(u=>u.providerId===item.providerId&&u.model===item.model);
    const id=u?.id||`verified:${item.providerId}:${item.model}`;
    if(config.upstreamModels.some(other=>other.id===id&&other!==u))fail("视频上游编号冲突");
    const supported=documentedVideoFamily(item);
    const definition=structuredClone(supported?.definition||item.definition) as VideoModelDefinition;
    if(!u){u={id,providerId:item.providerId,model:item.model,label:item.label,modality:"video",enabled:true,parameterMap:{},capabilities:{verified:true,generate:true,edit:false,vision:false,transparent:false,preserveIdentity:false,textAccuracy:false,qualityRank:1,qualities:[],nativeResolutions:[],maxReferenceImages:0,expectedLatencyMs:0}};config.upstreamModels.push(u);}
    if(u.modality!=="video")fail("视频上游模态冲突");
    u.enabled=enabled;u.capabilities.verified=true;u.capabilities.generate=enabled;
    if(!enabled)u.capabilities.edit=false;
    u.capabilities.maxReferenceImages=definition.limits?.images||0;u.capabilities.video=definition;
    u.parameterMap.videoProfile=(supported?.profile||item.profile) as VideoWireProfile;
    if(enabled)upstreamIds.push(id);
    else excludedModels.push({publicModelId:item.publicId,upstreamId:id,model:item.model,reason:VIDEO_FAMILY_ACTIVATION_EXCLUSIONS.find(excluded=>excluded.providerId===item.providerId&&excluded.model===item.model)!.reason});
    const model=config.publicModels.find(m=>m.id===item.publicId);
    const next={id:item.publicId,label:item.label,modality:"video" as const,enabled,visible:enabled,target:{type:"upstream" as const,id},toolScope:{features:enabled?["video.generate" as const]:[],defaultFor:enabled&&item.publicId===presets.defaultPublicModelId?["video.generate" as const]:[]}};
    if(model){if(model.modality!=="video"||model.target.type!=="upstream"||model.target.id!==id)fail("公开视频模型编号已被其他目标占用");Object.assign(model,next);}
    else config.publicModels.push(next);
  }
  for(const m of config.publicModels)if(m.id!==presets.defaultPublicModelId&&m.modality==="video"&&m.toolScope?.defaultFor.includes("video.generate"))m.toolScope.defaultFor=m.toolScope.defaultFor.filter(f=>f!=="video.generate");
  config.bindings["video.generate"]=presets.defaultPublicModelId;
  const feature=config.business?.["video.generate"];
  if(feature){
    const prior=feature.options.find(o=>o.modelId===feature.defaultModelId&&o.pricing);
    if(!prior?.pricing)fail("现有视频功能缺少明确售价，不能替管理员猜价格");
    for(const item of presets.items){const existing=feature.options.find(o=>o.modelId===item.publicId);if(!videoFamilyActivationEnabled(item)){if(existing)existing.enabled=false;continue;}if(existing){if(!existing.pricing)fail("现有视频选项缺少售价");existing.enabled=true;}else feature.options.push({modelId:item.publicId,enabled:true,sort:Math.max(0,...feature.options.map(o=>o.sort))+1,unit:prior.unit,pricing:structuredClone(prior.pricing)});}
    feature.enabled=true;feature.defaultModelId=presets.defaultPublicModelId;
  }
  const patches:Patch[]=[];
  for(const entity of ["providers","upstreamModels","publicModels"] as const)for(const row of config[entity]){
    const old=before[entity].find(v=>v.id===row.id)||null;
    if(canonical(old)!==canonical(row))patches.push({entity,id:row.id,before:old,after:structuredClone(row)});
  }
  return {config,patches,defaultPublicModelId:presets.defaultPublicModelId,publicModelIds:ACTIVE_VIDEO_FAMILY_ITEMS.map(i=>i.publicId),upstreamIds,excludedModels,
    wireModels:[...new Set(ACTIVE_VIDEO_FAMILY_ITEMS.map(i=>i.model))],profiles:[...DOCUMENTED_VIDEO_PROFILES],
    bindingBefore:before.bindings["video.generate"],businessBefore:before.business?.["video.generate"]??null,businessAfter:feature??null};
}
export type VideoFamilyPlan=ReturnType<typeof makeVideoFamilyPlan>;
export function rollbackVideoFamilyPlan(current:ModelConfig,plan:VideoFamilyPlan){
  const config=structuredClone(current);
  for(const p of [...plan.patches].reverse()){
    const list=config[p.entity] as {id:string}[],index=list.findIndex(v=>v.id===p.id);
    if(index<0||canonical(list[index])!==canonical(p.after))fail("本轮视频配置已有后续修改，不能自动覆盖回退");
    if(p.before===null)list.splice(index,1);else list[index]=structuredClone(p.before) as {id:string};
  }
  if(config.bindings["video.generate"]!==plan.defaultPublicModelId)fail("视频默认用途已被修改，不能自动回退");
  config.bindings["video.generate"]=plan.bindingBefore;
  if(canonical(config.business?.["video.generate"]??null)!==canonical(plan.businessAfter))fail("视频售价或功能配置已被修改，不能自动回退");
  if(plan.businessBefore!==null){config.business??={};config.business["video.generate"]=structuredClone(plan.businessBefore);}
  else if(config.business)delete config.business["video.generate"];
  return config;
}
