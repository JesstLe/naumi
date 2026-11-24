import type {ModelConfig,ModelProvider,UpstreamModel} from "./types";
import {ModelConfigError} from "./types";
import {FEATURE_BINDINGS} from "./feature-model-policy";
/** Build a draft only. Historical capabilities/maps stay unchanged; credentials
 * must be newly referenced for this provider identity by the native secret store. */
export function preparePrivateImageChannel(current:ModelConfig,source:{provider:ModelProvider;upstream:UpstreamModel},ids:{providerId:string;upstreamId:string;modelId:string;credentialRef:string}){
  if(source.upstream.providerId!==source.provider.id||source.upstream.modality!=="image"||!source.upstream.capabilities.generate)throw new ModelConfigError("INVALID_CONFIG","历史生图来源不匹配");
  if(current.providers.some(p=>p.id===ids.providerId)||current.upstreamModels.some(u=>u.id===ids.upstreamId)||current.publicModels.some(m=>m.id===ids.modelId))throw new ModelConfigError("CONFIG_CONFLICT","专属通道标识已存在，需核对原操作",409);
  const config=structuredClone(current);
  config.providers.push({...structuredClone(source.provider),id:ids.providerId,name:"专属图片通道",enabled:true,credentialRef:ids.credentialRef});
  config.upstreamModels.push({...structuredClone(source.upstream),id:ids.upstreamId,providerId:ids.providerId,enabled:true});
  config.publicModels.push({id:ids.modelId,label:"GPT 生图",modality:"image",enabled:true,visible:false,target:{type:"upstream",id:ids.upstreamId},toolScope:{features:["image.generate","canvas.image"],defaultFor:[]}});
  for(const [feature,setting] of Object.entries(config.business||{}))if(setting?.enabled&&["image.generate","canvas.image"].includes(feature)&&FEATURE_BINDINGS[feature as keyof typeof FEATURE_BINDINGS]?.startsWith("image.")){
    setting.options.push({modelId:ids.modelId,enabled:true,sort:100000,unit:"image"});
  }
  return {config,grant:{modelId:ids.modelId,upstreamId:ids.upstreamId}};
}
