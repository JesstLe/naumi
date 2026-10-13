import "server-only";
import {currentModelExecution} from "../../model-config/context";
import {modelEndpointFetch} from "../../model-config/transport";
import {supplierCostFetch} from "../../supplier-cost/collect";
import {readBounded} from "../../supplier-cost/io";
import {readLimitedVideoResponse} from "../result-download";
import {PermanentVideoCreateError,TransientPollError,type VideoGenerationRequest,type VideoProviderAdapter,type VideoTaskSnapshot} from "../types";
import type {VideoProviderRuntimeConfig} from "./config";
import {buildVideoCreate,buildVideoPoll,buildVideoCancel,decodeVideoCreated,decodeVideoPolled,field,string,type VideoWireContext,type VideoWireRequest} from "./wire";

export function videoWireEndpoint(config:Pick<VideoProviderRuntimeConfig,"baseUrl">,path:string){
  const base=config.baseUrl.replace(/\/+$/,"");
  const version=path.match(/^\/(?:api\/)?v\d+(?:beta)?(?=\/)/)?.[0];
  return base+(version&&base.endsWith(version)?path.slice(version.length):path);
}
export function createWireVideoAdapter(config:VideoProviderRuntimeConfig):VideoProviderAdapter{
  if(!config.videoProfile)throw new Error("A frozen video profile is required");
  const profile=config.videoProfile,scope=currentModelExecution("video");
  const transport=modelEndpointFetch(config.baseUrl,{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)},scope?{...scope.connection,costDisabled:true}:undefined);
  const submit=supplierCostFetch(transport,scope?{...scope.connection,costScope:scope,phase:"video-generation"}:{providerId:config.id,baseUrl:config.baseUrl,apiKey:config.apiKey,wireModel:config.defaultModel,protocol:config.protocol,phase:"video-generation"});
  const context=(request:VideoGenerationRequest):VideoWireContext=>({provider:config,profile,request});
  const restored=(task:VideoTaskSnapshot):VideoWireContext=>context({source:"workbench",providerId:config.id,modelId:task.modelId,prompt:task.prompt,durationSeconds:Number(task.parameters.durationSeconds||4),
    references:task.references,idempotencyKey:task.id,resolution:String(task.parameters.resolution||"")});
  const send=async(wire:VideoWireRequest,creating=false,key?:string)=>{
    const headers:Record<string,string>=profile==="gemini"?{"x-goog-api-key":config.apiKey}:{authorization:config.rawAuthorization?config.apiKey:`Bearer ${config.apiKey}`};
    let body:BodyInit|undefined;
    if(wire.encoding==="json"){headers["content-type"]="application/json";const value={...(wire.body as Record<string,unknown>)};
      if(creating&&config.idempotencyStrategy==="body"){if(!config.idempotencyBodyField)throw new Error("幂等body字段未配置");value[config.idempotencyBodyField]=key;}body=JSON.stringify(value);
    }else if(wire.encoding==="multipart"){
      body=wire.body as FormData;
      if(creating&&config.idempotencyStrategy==="body"){if(!config.idempotencyBodyField)throw new Error("幂等body字段未配置");(body as FormData).set(config.idempotencyBodyField,key!);}
    }
    if(creating&&config.idempotencyStrategy==="header")headers["Idempotency-Key"]=key!;
    let response:Response;
    try{response=await (creating?submit:transport)(videoWireEndpoint(config,wire.path),{method:wire.method,headers,body,cache:"no-store",signal:AbortSignal.timeout(creating?config.timeoutMs??120000:30000)});}
    catch(error){if(creating)throw error;throw new TransientPollError("视频状态查询暂时不可用",error);}
    if(wire.method==="DELETE"&&response.ok){await response.body?.cancel();return {};}
    let payload:unknown;try{payload=JSON.parse(await readBounded(response,512*1024));}catch{if(creating)throw new Error("视频创建响应无法核对");throw new TransientPollError("视频状态响应不是有效JSON");}
    if(!response.ok){const text=(string(field(payload,"error.message"))||string(field(payload,"message"))||`视频接口HTTP ${response.status}`).split(config.apiKey).join("[redacted]");
      if(creating&&response.status>=400&&response.status<500&&response.status!==429)throw new PermanentVideoCreateError(text,response.status);
      throw new TransientPollError(text);
    }
    return payload;
  };
  const adapter:VideoProviderAdapter={id:config.id,
    async create(input){const value=await send(buildVideoCreate(context(input)),true,input.idempotencyKey);return decodeVideoCreated(profile,value);},
    async poll(task){return decodeVideoPolled(profile,await send(buildVideoPoll(restored(task),task.upstreamTaskId)));},
    async fetchResult(task,result){
      const target=result.resultUrl||videoWireEndpoint(config,config.contentPath?.replaceAll("{id}",encodeURIComponent(task.upstreamTaskId))||`/v1/videos/${encodeURIComponent(task.upstreamTaskId)}/content`);
      const sameOrigin=new URL(target).origin===new URL(config.baseUrl).origin;
      // Credentials only go to the configured origin; redirects are rejected by the pinned transport.
      const download=modelEndpointFetch(target,{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)});
      const headers=sameOrigin&&(profile==="gemini"||!result.resultUrl)?profile==="gemini"?{"x-goog-api-key":config.apiKey}:{authorization:config.rawAuthorization?config.apiKey:`Bearer ${config.apiKey}`} : {};
      const response=await download(target,{headers,signal:AbortSignal.timeout(180000)});
      const value=await readLimitedVideoResponse(response);return {bytes:value.bytes,mimeType:value.mimeType};
    }};
  if(profile==="ark"||profile==="openai-videos")adapter.cancel=async task=>{const wire=buildVideoCancel(restored(task),task.upstreamTaskId);if(!wire)throw new Error("该协议不支持取消");await send(wire);};
  return adapter;
}
