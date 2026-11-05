import {createdResult,field,polled,rejectAdvanced,selectWireOptions,string,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {buildArkCreate} from "./ark";
import {buildMiniMaxCreate} from "./minimax";
import type {VideoWireProfile} from "../../capability-schema";
// IC 68b37db handler/tokendance.go + web/src/services/api/protocols/tokendance.ts (AGPL-3.0).
const routes={
  "tokendance-seedance":{prefix:"seedance:generations",create:"/ark/v3/generations/tasks",poll:"/ark/v3/generations/tasks/"},
  "tokendance-kling-text":{prefix:"kling:text2video",create:"/kling/v1/text2video",poll:"/kling/v1/text2video/"},
  "tokendance-kling-image":{prefix:"kling:image2video",create:"/kling/v1/image2video",poll:"/kling/v1/image2video/"},
  "tokendance-kling-motion":{prefix:"kling:motion-control",create:"/kling/v1/motion-control",poll:"/kling/v1/motion-control/"},
  "tokendance-kling-omni":{prefix:"kling:omni-video",create:"/kling/v1/omni-video",poll:"/kling/v1/omni-video/"},
  "tokendance-wan3":{prefix:"wan3:video-synthesis",create:"/alibaba/wan3/v1/video-synthesis",poll:"/alibaba/wan3/v1/tasks/"},
  "tokendance-happyhorse":{prefix:"happyhorse:video-synthesis",create:"/alibaba/happyhorse/v1/video-synthesis",poll:"/alibaba/happyhorse/v1/tasks/"},
  "tokendance-minimax":{prefix:"minimax:video_generation_v2",create:"/minimax/v2/video_generation",poll:"/minimax/v2/query/video_generation/"},
} as const;
export const TOKEN_DANCE_PROFILES=Object.keys(routes) as Array<keyof typeof routes>;
function route(profile:VideoWireProfile){const result=routes[profile as keyof typeof routes];if(!result)throw new Error("Unknown TokenDance wire profile");return result;}
export function buildTokenDanceCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,refs=wireReferences(context),path=route(context.profile).create;
  if(context.profile==="tokendance-seedance"){
    const wire=buildArkCreate(context),body=wire.body as Record<string,unknown>;
    return {...wire,path,body:{...body,...(refs.first||refs.last?{ratio:"adaptive"}:{})}};
  }
  if(context.profile==="tokendance-minimax")return {...buildMiniMaxCreate(context),path};
  const extra=selectWireOptions(context,{seed:"seed",characterOrientation:"character_orientation",character_orientation:"character_orientation",keepOriginalSound:"keep_original_sound"});
  if(context.profile.startsWith("tokendance-kling-")){
    const settings:Record<string,unknown>={resolution:input.resolution?.toLowerCase(),duration:input.durationSeconds,aspect_ratio:input.aspectRatio,
      ...(input.generateAudio!==undefined?{audio:input.generateAudio?"on":"off"}:{}),...extra};
    const body:Record<string,unknown>={model_name:input.modelId,settings};
    if(context.profile==="tokendance-kling-text"){
      if(input.references.length)unsupportedWire(context,"text2video不能带媒体输入");body.prompt=input.prompt;
    }else{
      const contents:Record<string,unknown>[]=[{type:"prompt",text:input.prompt}];
      if(context.profile==="tokendance-kling-motion"){
        const images=input.references.filter(ref=>ref.kind==="image");
        if(images.length!==1||refs.videos.length!==1||refs.audios.length)unsupportedWire(context,"motion-control需要一张图片和一个运动视频");
        settings.character_orientation=extra.character_orientation??"video";
        contents.push({type:"image",url:images[0].url},{type:"video",url:refs.videos[0]});
      }else{
        if(context.profile==="tokendance-kling-image"&&(refs.videos.length||refs.audios.length||input.references.length<1||input.references.length>2))unsupportedWire(context,"image2video接受1—2张图片");
        for(const [index,ref] of input.references.entries()){
          const type=context.profile==="tokendance-kling-image"?ref.role==="last_frame"?"last_frame":index===0?"first_frame":"last_frame":["first_frame","last_frame"].includes(ref.role)?ref.role:ref.kind;
          contents.push({type,url:ref.url});
        }
      }
      body.contents=contents;
    }
    if(input.negativePrompt)body.negative_prompt=input.negativePrompt;
    if(input.watermark!==undefined)unsupportedWire(context,"此Kling gateway协议未声明水印字段");
    return {path,method:"POST",encoding:"json",body};
  }
  const media=input.references.map(ref=>({type:["first_frame","last_frame"].includes(ref.role)?ref.role:`reference_${ref.kind}`,url:ref.url}));
  if(context.profile==="tokendance-wan3")return {path,method:"POST",encoding:"json",body:{model:input.modelId,input:{prompt:input.prompt,...(media.length?{media}:{})},parameters:{
    resolution:input.resolution?.toUpperCase(),ratio:input.aspectRatio,duration:input.durationSeconds,audio:input.generateAudio,watermark:input.watermark,...extra}}};
  if(refs.audios.length||refs.videos.length>1||refs.videos.length&&input.references.length!==1)unsupportedWire(context,"HappyHorse视频输入必须独立且不支持音频参考");
  const requestInput:Record<string,unknown>={prompt:input.prompt};
  if(refs.videos.length)requestInput.video_url=refs.videos[0];else if(media.length)requestInput.media=media;
  return {path,method:"POST",encoding:"json",body:{model:input.modelId,input:requestInput,parameters:{resolution:input.resolution?.toUpperCase(),duration:input.durationSeconds,watermark:input.watermark,
    ...(!refs.first&&!refs.last&&!refs.videos.length?{ratio:input.aspectRatio}:{}),...extra}}};
}
export function buildTokenDancePoll(context:VideoWireContext,id:string):VideoWireRequest{
  const selected=route(context.profile),parts=id.split("::");
  if(parts.length!==2||parts[0]!==selected.prefix||!parts[1])throw new Error("TokenDance任务协议与冻结profile不一致");
  return {path:selected.poll+encodeURIComponent(parts[1]),method:"GET",encoding:"none"};
}
export function decodeTokenDanceCreated(profile:VideoWireProfile,payload:unknown){
  const result=createdResult(payload,field(payload,"id")||field(payload,"task_id")||field(payload,"data.id")||field(payload,"data.0.id")||field(payload,"output.task_id")||field(payload,"task.id"),
    field(payload,"status")||field(payload,"data.status")||field(payload,"output.task_status")||field(payload,"task.status"));
  return {...result,upstreamTaskId:`${route(profile).prefix}::${result.upstreamTaskId}`};
}
export function decodeTokenDancePoll(payload:unknown){
  const raw=field(payload,"status")||field(payload,"state")||field(payload,"data.status")||field(payload,"data.0.status")||field(payload,"output.task_status")||field(payload,"task.status");
  const outputs=field(payload,"data.0.outputs"),video=Array.isArray(outputs)?outputs.find(item=>string(field(item,"type")).toLowerCase()==="video"):undefined;
  return polled(payload,{status:raw,url:field(payload,"content.video_url")||field(payload,"output.video_url")||field(payload,"task.content.url")||field(video,"url"),
    progress:field(payload,"progress")??field(payload,"data.0.progress"),error:field(payload,"error.message")||field(payload,"output.message")||field(payload,"task.error.message"),code:field(payload,"error.code")});
}
export function tokenDanceCodec(profile:VideoWireProfile):VideoWireCodec{return {create:buildTokenDanceCreate,poll:buildTokenDancePoll,created:payload=>decodeTokenDanceCreated(profile,payload),polled:decodeTokenDancePoll};}
