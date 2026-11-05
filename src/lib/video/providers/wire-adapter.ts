import "server-only";
import {currentModelExecution} from "../../model-config/context";
import {modelEndpointFetch} from "../../model-config/transport";
import {supplierCostFetch} from "../../supplier-cost/collect";
import {readBounded} from "../../supplier-cost/io";
import {downloadVideoResultAsset} from "./result-fetch";
import {PermanentVideoCreateError,TransientPollError,UnsupportedVideoCancellationError,type VideoGenerationRequest,type VideoProviderAdapter,type VideoTaskSnapshot} from "../types";
import type {VideoProviderRuntimeConfig} from "./config";
import {buildVideoCreate,buildVideoPoll,buildVideoCancel,decodeVideoCreated,decodeVideoPolled} from "./wire";
import {field,string} from "./wire-helpers";
import type {VideoWireContext,VideoWireRequest} from "./wire-contracts";
import {videoWireEndpoint} from "./wire-endpoint";
export {videoWireEndpoint} from "./wire-endpoint";
import {uploadWorkflowReferences} from "./workflow-upload";
import {currentPrivateVideoContext} from "./private-context";


export function createWireVideoAdapter(config:VideoProviderRuntimeConfig):VideoProviderAdapter{
  if(!config.videoProfile)throw new Error("A frozen video profile is required");
  const profile=config.videoProfile,scope=currentModelExecution("video");
  const trustedOrigins=(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean);
  if(currentPrivateVideoContext()?.config.id===config.id&&(process.env.USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK==="true"||process.env.NODE_ENV!=="production"))trustedOrigins.push(new URL(config.baseUrl).origin);
  const transport=modelEndpointFetch(config.baseUrl,{trustedOrigins},scope?{...scope.connection,costDisabled:true}:undefined);
  const submit=currentPrivateVideoContext()?.config.id===config.id?transport:supplierCostFetch(transport,scope?{...scope.connection,costScope:scope,phase:"video-generation"}:{providerId:config.id,baseUrl:config.baseUrl,apiKey:config.apiKey,wireModel:config.defaultModel,protocol:config.protocol,phase:"video-generation"});
  const context=(request:VideoGenerationRequest):VideoWireContext=>({provider:config,profile,request});
  const restored=(task:VideoTaskSnapshot):VideoWireContext=>context({source:"workbench",providerId:config.id,modelId:task.modelId,prompt:task.prompt,durationSeconds:Number(task.parameters.durationSeconds||4),
    references:task.references,idempotencyKey:task.id,resolution:String(task.parameters.resolution||"")});
  const send=async(wire:VideoWireRequest,creating=false,key?:string)=>{
    const headers:Record<string,string>=profile==="gemini"?{"x-goog-api-key":config.apiKey}:{authorization:config.rawAuthorization||profile==="autodl"?config.apiKey:`Bearer ${config.apiKey}`};
    if(!config.apiKey)delete headers.authorization;
    if(profile.startsWith("tokendance-")){
      const appUrl=new URL(config.appUrl||process.env.NAUMI_PUBLIC_ORIGIN||"https://github.com/JesstLe/naumi");
      appUrl.username="";appUrl.password="";appUrl.search="";appUrl.hash="";headers["X-App-URL"]=appUrl.href;
    }
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
    if(wire.method==="DELETE"&&[405,501].includes(response.status)){await response.body?.cancel();throw new UnsupportedVideoCancellationError();}
    const maxJson=!creating&&profile.startsWith("tfrouter-")?Math.ceil(200*1024*1024*4/3)+2*1024*1024:512*1024;
    let payload:unknown;try{payload=JSON.parse(await readBounded(response,maxJson));}catch{if(creating)throw new Error("视频创建响应无法核对");throw new TransientPollError("视频状态响应不是有效JSON或超过限额");}
    if(!response.ok){const message=string(field(payload,"error.message"))||string(field(payload,"message"))||`视频接口HTTP ${response.status}`,text=config.apiKey?message.split(config.apiKey).join("[redacted]"):message;
      if(creating&&response.status>=400&&response.status<500&&response.status!==429)throw new PermanentVideoCreateError(text,response.status);
      throw new TransientPollError(text);
    }
    return payload;
  };
  const adapter:VideoProviderAdapter={id:config.id,
    async create(input){const prepared=await uploadWorkflowReferences(context(input),transport);const value=await send(buildVideoCreate(context(prepared)),true,input.idempotencyKey);return decodeVideoCreated(profile,value);},
    async poll(task){
      const decoded=decodeVideoPolled(profile,await send(buildVideoPoll(restored(task),task.upstreamTaskId)),task.upstreamTaskId);
      if(!decoded.outputFiles)return decoded;
      const resultAssets=decoded.outputFiles.map(file=>({kind:file.kind,url:videoWireEndpoint(config,"/view?"+new URLSearchParams({filename:file.filename,subfolder:file.subfolder,type:file.type}).toString())}));
      return {...decoded,resultAssets,resultUrl:resultAssets.find(asset=>asset.kind==="video")?.url};
    },
    async fetchResultAsset(_task,asset){return downloadVideoResultAsset(config,asset);},
    async fetchResult(task,result){
      if(result.inlineResult){
        const source=result.inlineResult;
        if(!/^video\//.test(source.mimeType)||!/^[A-Za-z0-9+/]+={0,2}$/.test(source.base64)||source.base64.length>Math.ceil(200*1024*1024*4/3))throw new Error("内联视频结果无效或超限");
        return {bytes:Uint8Array.from(Buffer.from(source.base64,"base64")),mimeType:source.mimeType};
      }
      const target=result.resultUrl||videoWireEndpoint(config,config.contentPath?.replaceAll("{id}",encodeURIComponent(task.upstreamTaskId))||`/v1/videos/${encodeURIComponent(task.upstreamTaskId)}/content`);
      return downloadVideoResultAsset(config,{kind:"video",url:target});
    }};
  if(profile==="ark"||profile==="openai-videos")adapter.cancel=async task=>{const wire=buildVideoCancel(restored(task),task.upstreamTaskId);if(!wire)throw new Error("该协议不支持取消");await send(wire);};
  return adapter;
}
