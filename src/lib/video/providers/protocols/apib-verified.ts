import {VideoContractError} from "../../contract";
import {mediaUrl,rejectAdvanced,selectWireOptions} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {buildAPIMartPoll,decodeAPIMartCreated,decodeAPIMartPoll} from "./apimart";

// Separate profiles preserve the wire behavior of already frozen APIMart tasks.
// Field names match the isolated 2026-10-23 APIB video receipts and plans.
// Published capabilities, rather than sample values in the codec, limit specs.
export const APIB_VERIFIED_PROFILES=["apimart-apib-seedance","apimart-apib-kling","apimart-apib-wan","apimart-apib-h3"] as const;
type Profile=typeof APIB_VERIFIED_PROFILES[number];
type Rule={profile:Profile;uppercaseResolution?:boolean;klingMode?:boolean;defaultAudio?:boolean;input?:"image"|"reference_image"|"video"};
const RULES:Record<string,Rule>={
  "seedance-1-0-pro-fast":{profile:"apimart-apib-seedance"},
  "seedance-1-0-pro-quality":{profile:"apimart-apib-seedance"},
  "seedance-1-5-pro":{profile:"apimart-apib-seedance",defaultAudio:false},
  "seedance-2.0":{profile:"apimart-apib-seedance"},
  "seedance-2.0-fast":{profile:"apimart-apib-seedance"},
  "seedance-2.0-mini":{profile:"apimart-apib-seedance"},
  "seedance-2.5":{profile:"apimart-apib-seedance"},
  "kling-3.0-turbo":{profile:"apimart-apib-kling"},
  "kling-v2-6":{profile:"apimart-apib-kling",klingMode:true,defaultAudio:false},
  "kling-v3":{profile:"apimart-apib-kling",klingMode:true,defaultAudio:false},
  "kling-v3-omni":{profile:"apimart-apib-kling",klingMode:true,defaultAudio:false},
  "kling-v4":{profile:"apimart-apib-kling"},
  "kling-video-o1":{profile:"apimart-apib-kling",klingMode:true},
  "wan2.5-preview":{profile:"apimart-apib-wan",defaultAudio:true},
  "wan2.6":{profile:"apimart-apib-wan"},
  "wan2.6-i2v-flash":{profile:"apimart-apib-wan",defaultAudio:false,input:"image"},
  "wan2.7-r2v":{profile:"apimart-apib-wan",uppercaseResolution:true,input:"reference_image"},
  "wan2.7-videoedit":{profile:"apimart-apib-wan",uppercaseResolution:true,input:"video"},
  "wan3.0-video":{profile:"apimart-apib-wan",uppercaseResolution:true},
  "wan3.0-video-prime":{profile:"apimart-apib-wan",uppercaseResolution:true},
  "MiniMax-H3":{profile:"apimart-apib-h3",uppercaseResolution:true},
  "MiniMax-H3-Max":{profile:"apimart-apib-h3",uppercaseResolution:true},
};
function reject(context:VideoWireContext,message:string,field:string):never{
  throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED",`${context.profile}: ${message}`,[field]);
}
function inputUrl(context:VideoWireContext){
  const ref=context.request.references[0],url=mediaUrl(ref?.url);
  if(!url||ref.inlineData)reject(context,"参考素材需要已授权的HTTP或HTTPS下载地址","references");
  return url;
}
export function buildAPIBVerifiedCreate(context:VideoWireContext):VideoWireRequest{
  const input=context.request,rule=Object.prototype.hasOwnProperty.call(RULES,input.modelId)?RULES[input.modelId]:undefined;
  if(!rule||rule.profile!==context.profile)reject(context,"型号不属于此已核验视频分支","modelId");
  rejectAdvanced(context);selectWireOptions(context,{});
  if(input.negativePrompt!==undefined||input.watermark!==undefined||input.width!==undefined||input.height!==undefined||input.workflowManifest!==undefined)
    reject(context,"当前已核验组合未开放负面词、水印、精确尺寸或工作流参数","providerOptions");
  if(!Number.isInteger(input.durationSeconds)||input.durationSeconds<=0)reject(context,"此分支需要显式的正整数视频时长","durationSeconds");
  const resolution=input.resolution?.trim();
  if(!resolution)reject(context,"此分支需要已配置的视频分辨率","resolution");
  const adaptive=rule.input==="image"||rule.input==="video",ratio=input.aspectRatio;
  if(ratio!==undefined&&(adaptive?!["adaptive","16:9"].includes(ratio):!/^\d{1,3}:\d{1,3}$/.test(ratio)))reject(context,"比例没有适配到此协议分支","aspectRatio");
  if(input.generateAudio!==undefined&&rule.defaultAudio===undefined)reject(context,"此型号没有已映射的声音开关","generateAudio");
  const mode=input.mode??(rule.input==="video"?"video_edit":rule.input==="reference_image"?"reference":rule.input==="image"?"single_image":"text");
  const expectedMode=rule.input==="video"?"video_edit":rule.input==="reference_image"?"reference":rule.input==="image"?"single_image":"text";
  if(mode!==expectedMode)reject(context,"视频模式不属于已核验组合","mode");
  const body:Record<string,unknown>={model:input.modelId,prompt:input.prompt,duration:input.durationSeconds};
  if(rule.klingMode){
    const mode=resolution.toLowerCase()==="720p"?"std":resolution.toLowerCase()==="1080p"?"pro":
      resolution.toLowerCase()==="4k"&&["kling-v3","kling-v3-omni"].includes(input.modelId)?"4k":undefined;
    if(!mode)reject(context,"Kling分辨率没有对应的协议模式映射","resolution");
    if(input.modelId==="kling-v2-6"&&mode==="std"&&input.generateAudio===true)reject(context,"Kling2.6标准模式不支持有声视频","generateAudio");
    body.mode=mode;
  }else body.resolution=rule.uppercaseResolution?resolution.toUpperCase():resolution.toLowerCase();
  if(rule.defaultAudio!==undefined)body.audio=input.generateAudio??rule.defaultAudio;
  // 16:9 is the upstream default in the verified requests. Frame-conditioned
  // image/video branches inherit their source ratio and send no ratio field.
  if(!adaptive&&ratio&&ratio!=="16:9")body.aspect_ratio=ratio;
  if(!rule.input){if(input.references.length)reject(context,"此型号当前只开放已核验文生模式","references");}
  else{
    if(input.references.length!==1)reject(context,"此组合需要且只接受一个已核验类型的参考素材","references");
    const ref=input.references[0];
    if(rule.input==="video"){
      if(ref.kind!=="video"||!["source_video","reference"].includes(ref.role))reject(context,"视频编辑需要来源视频","references");
      body.video_urls=[inputUrl(context)];
    }else if(rule.input==="reference_image"){
      if(ref.kind!=="image"||ref.role!=="reference")reject(context,"R2V需要普通图片参考","references");
      body.image_with_roles=[{url:inputUrl(context),role:"reference_image"}];
    }else{
      if(ref.kind!=="image"||!["first_frame","reference"].includes(ref.role))reject(context,"图生视频需要单张首帧图片","references");
      body.image_urls=[inputUrl(context)];
    }
  }
  return {path:"/v1/videos/generations",method:"POST",encoding:"json",body};
}
export const apibVerifiedCodec:VideoWireCodec={create:buildAPIBVerifiedCreate,poll:buildAPIMartPoll,created:decodeAPIMartCreated,polled:decodeAPIMartPoll};
