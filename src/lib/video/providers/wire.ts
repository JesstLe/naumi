import {VideoContractError} from "../contract";
import {TransientPollError,type VideoGenerationRequest,type VideoProviderCreateResult,type VideoProviderPollResult,type VideoTaskStatus} from "../types";
import type {VideoProviderRuntimeConfig} from "./config";
import type {VideoWireProfile} from "../capability-schema";

export type VideoWireContext={provider:VideoProviderRuntimeConfig;profile:VideoWireProfile;request:VideoGenerationRequest};
export type VideoWireRequest={path:string;method:"POST"|"GET"|"DELETE";body?:unknown;encoding:"json"|"multipart"|"none"};
export type VideoWireCodec={create:(context:VideoWireContext)=>VideoWireRequest;poll:(context:VideoWireContext,id:string)=>VideoWireRequest;
  created:(payload:unknown)=>VideoProviderCreateResult;polled:(payload:unknown)=>VideoProviderPollResult;cancel?:(context:VideoWireContext,id:string)=>VideoWireRequest};
const codecs=new Map<VideoWireProfile,VideoWireCodec>();
export function registerVideoWireProfile(profile:VideoWireProfile,codec:VideoWireCodec){
  if(codecs.has(profile))throw new Error(`Duplicate video wire profile ${profile}`);codecs.set(profile,codec);
}
function codec(profile:VideoWireProfile){const value=codecs.get(profile);if(!value)throw new VideoContractError("VIDEO_PROFILE_UNAVAILABLE",`视频协议${profile}尚未配置`,["videoProfile"]);return value;}
export function buildVideoCreate(context:VideoWireContext):VideoWireRequest{
  const wire=codec(context.profile).create(context);
  return {...wire,path:context.provider.createPath||wire.path};
}
export function buildVideoPoll(context:VideoWireContext,id:string):VideoWireRequest{
  const wire=codec(context.profile).poll(context,id);
  return {...wire,path:context.provider.pollPath?.replaceAll("{id}",encodeURIComponent(id))||wire.path};
}
export function buildVideoCancel(context:VideoWireContext,id:string):VideoWireRequest|null{return codec(context.profile).cancel?.(context,id)||null;}
export function decodeVideoCreated(profile:VideoWireProfile,payload:unknown){return codec(profile).created(payload);}
export function decodeVideoPolled(profile:VideoWireProfile,payload:unknown){return codec(profile).polled(payload);}

export function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function field(value:unknown,path:string):unknown{return path.split(".").reduce<unknown>((current,key)=>Array.isArray(current)?current[Number(key)]:object(current)[key],value);}
export function string(value:unknown){return typeof value==="string"?value.trim():"";}
export function requiredTaskId(value:unknown){const id=string(value);if(!id||id.length>1000||/[\u0000-\u001f]/.test(id))throw new Error("视频创建响应缺少有效任务ID，提交结果待核对");return id;}
export function mediaUrl(value:unknown):string|undefined{
  const raw=string(value);if(!raw)return undefined;
  try{const url=new URL(raw);if(!["https:","http:"].includes(url.protocol)||url.username||url.password||raw.length>16384)return undefined;return url.href;}catch{return undefined;}
}
export function wireStatus(raw:unknown):VideoTaskStatus{
  const value=string(raw).toLowerCase();
  if(["success","succeeded","completed","complete","done"].includes(value))return "completed";
  if(["failed","failure","error","expired"].includes(value))return "failed";
  if(["cancelled","canceled"].includes(value))return "cancelled";
  if(["queued","queuing","waiting","pending","submitted"].includes(value))return "queued";
  if(["running","processing","in_progress","inprogress","starting","generating"].includes(value))return "processing";
  throw new TransientPollError("视频轮询响应状态未知，保留任务等待重试");
}
export function polled(payload:unknown,input:{status:unknown;url?:unknown;progress?:unknown;error?:unknown;code?:unknown;allowContentEndpoint?:boolean}):VideoProviderPollResult{
  const status=wireStatus(input.status),resultUrl=mediaUrl(input.url);
  if(status==="completed"&&!resultUrl&&!input.allowContentEndpoint)throw new TransientPollError("视频完成响应缺少真实结果地址");
  const progress=Number(input.progress);
  return {status,progress:status==="completed"?100:Number.isFinite(progress)?Math.max(0,Math.min(99,progress)):0,resultUrl,
    errorMessage:string(input.error)||undefined,errorCode:input.code===undefined?undefined:String(input.code),rawResponse:sanitizeWirePayload(payload)};
}
export function jsonObjectString(value:unknown){
  if(typeof value!=="string")return object(value);
  try{return object(JSON.parse(value));}catch{throw new TransientPollError("视频轮询结果不是合法JSON");}
}
export function sanitizeWirePayload(value:unknown,depth=0):unknown{
  if(depth>10)return "[depth-limit]";
  if(Array.isArray(value))return value.slice(0,256).map(item=>sanitizeWirePayload(item,depth+1));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/api.?key|authorization|token|secret|password|credential|signature/i.test(key)?"[redacted]":sanitizeWirePayload(item,depth+1)]));
  if(typeof value==="string"){
    if(/^https?:\/\//.test(value)){try{const url=new URL(value);url.username="";url.password="";url.search="";url.hash="";return url.href;}catch{return "[invalid-url]";}}
    if(/^[\[{]/.test(value.trim())){try{return sanitizeWirePayload(JSON.parse(value),depth+1);}catch{}}
    return value.length>4000?value.slice(0,4000)+"[truncated]":value;
  }return value;
}
export function wireReferences(context:VideoWireContext){
  const refs=context.request.references;
  return {images:refs.filter(ref=>ref.kind==="image"&&!["first_frame","last_frame"].includes(ref.role)).map(ref=>ref.url!),
    videos:refs.filter(ref=>ref.kind==="video").map(ref=>ref.url!),audios:refs.filter(ref=>ref.kind==="audio").map(ref=>ref.url!),
    first:refs.find(ref=>ref.role==="first_frame")?.url,last:refs.find(ref=>ref.role==="last_frame")?.url};
}
/** Profiles opt in to typed field names. Options cannot replace model, prompt, references, task IDs or authentication. */
export function selectWireOptions(context:VideoWireContext,mapping:Record<string,string>):Record<string,unknown>{
  const result:Record<string,unknown>={};
  for(const [key,value] of Object.entries(context.request.providerOptions||{})){
    const target=mapping[key];if(!target)throw new VideoContractError("VIDEO_OPTION_UNMAPPED",`当前协议未映射参数${key}`,["providerOptions"]);
    if(["model","prompt","input","content","authorization","apiKey","api_key","taskId","task_id"].includes(target))throw new Error("Invalid reserved video option mapping");
    result[target]=value;
  }return result;
}
