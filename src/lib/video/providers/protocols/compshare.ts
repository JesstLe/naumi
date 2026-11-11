import {createdResult,field,imageWireValue,mediaUrl,polled,rejectAdvanced,selectWireOptions,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {buildMiniMaxCreate,decodeMiniMaxPoll} from "./minimax";
import {TransientPollError} from "../../types";
export const COMPSHARE_PROFILES=["compshare-h3","compshare-hailuo","compshare-vidu","compshare-vidu-extend","compshare-vidu-lip-sync","compshare-wan","compshare-seedance"] as const;
export function buildCompshareCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,profile=context.profile,refs=wireReferences(context);
  if(profile==="compshare-h3"){
    // H3 has a different credential/endpoint and top-level parameters from ModelVerse tasks.
    const withoutOptions={...context,request:{...input,providerOptions:{}}},wire=buildMiniMaxCreate(withoutOptions);
    const extra=selectWireOptions(context,{useContextIR:"use_context_ir",use_context_ir:"use_context_ir",skillId:"skill_id",skill_id:"skill_id",muteAudio:"mute_audio",mute_audio:"mute_audio"});
    if(input.generateAudio!==undefined&&extra.mute_audio!==undefined&&extra.mute_audio!==!input.generateAudio)unsupportedWire(context,"声音开关与mute_audio参数冲突");
    const body=wire.body as Record<string,unknown>;
    delete body.watermark;
    return {...wire,path:"/minimax/v2/video_generation",body:{...body,resolution:input.resolution?.toUpperCase(),
      ...(input.generateAudio!==undefined?{mute_audio:!input.generateAudio}:{}),...(input.watermark!==undefined?{aigc_watermark:input.watermark}:{}),...extra}};
  }
  const skeletonInput:Record<string,unknown>={prompt:input.prompt},parameters:Record<string,unknown>={duration:input.durationSeconds};
  const extra=selectWireOptions(context,{seed:"seed",text:"text",size:"size",voiceId:"voice_id",voice_id:"voice_id",audioSpeed:"audio_speed",audio_speed:"audio_speed"});
  const first=input.references.find(ref=>ref.role==="first_frame"),last=input.references.find(ref=>ref.role==="last_frame");
  if(profile==="compshare-seedance"){
    const content:Record<string,unknown>[]=[{type:"text",text:input.prompt}];
    for(const ref of input.references)content.push({type:`${ref.kind}_url`,[`${ref.kind}_url`]:{url:ref.url},role:["first_frame","last_frame"].includes(ref.role)?ref.role:`reference_${ref.kind}`});
    delete skeletonInput.prompt;skeletonInput.content=content;parameters.resolution=input.resolution?.toLowerCase();parameters.ratio=input.aspectRatio;
    if(input.generateAudio!==undefined)parameters.generate_audio=input.generateAudio;if(input.watermark!==undefined)parameters.watermark=input.watermark;
  }else if(profile==="compshare-hailuo"){
    const images=input.references.filter(ref=>ref.kind==="image");
    if(refs.videos.length||refs.audios.length||images.length>1||last)unsupportedWire(context,"Hailuo只接受一张首帧图片");
    if(input.mode!=="text"){
      const ref=first||images[0];if(!ref||!ref.inlineData)unsupportedWire(context,"Hailuo首帧须为服务端读取的原始图片字节");skeletonInput.first_frame_image=imageWireValue(ref);
    }
    parameters.resolution=input.resolution?.toUpperCase();if(input.watermark!==undefined)parameters.aigc_watermark=input.watermark;
  }else if(profile==="compshare-wan"){
    if(refs.videos.length||refs.audios.length>1||refs.images.length>0)unsupportedWire(context,"此Wan协议接受首尾帧及最多一段音频");
    if(input.mode!=="text"){
      if(!first)unsupportedWire(context,"Wan图生模式需要首帧");skeletonInput.first_frame_url=first.url;if(last)skeletonInput.last_frame_url=last.url;
    }
    if(refs.audios[0])skeletonInput.audio_url=refs.audios[0];
    if(input.mode==="text"){
      const explicit=typeof extra.size==="string"?extra.size:"",fallback=input.resolution?.toUpperCase()==="1080P"?"1920x1080":input.resolution?.toUpperCase()==="480P"?"832x480":"1280x720";
      const selected=explicit||fallback;if(!/^\d{1,5}x\d{1,5}$/.test(selected))unsupportedWire(context,"Wan尺寸格式无效");
      parameters.size=input.aspectRatio==="9:16"?selected.split("x").reverse().join("x"):selected;
    }
    parameters.resolution=input.resolution?.toUpperCase();delete extra.size;
  }else{
    parameters.resolution=input.resolution?.toLowerCase();
    if(profile==="compshare-vidu-extend"){
      if(refs.videos.length!==1||refs.audios.length||refs.images.length||first)unsupportedWire(context,"Vidu续写需要一个视频，可附尾帧");
      skeletonInput.video_url=refs.videos[0];if(last)skeletonInput.last_frame_url=last.url;parameters.vidu_type="extend";
    }else if(profile==="compshare-vidu-lip-sync"){
      if(refs.videos.length!==1||refs.audios.length>1||input.references.some(ref=>ref.kind==="image"))unsupportedWire(context,"Vidu口型同步需要一个视频和至多一段音频");
      const text=typeof extra.text==="string"?extra.text:input.prompt;
      if(!refs.audios.length&&!text)unsupportedWire(context,"口型同步需要音频或朗读文字");
      skeletonInput.video_url=refs.videos[0];if(refs.audios.length)skeletonInput.audio_url=refs.audios[0];else skeletonInput.text=text;
      delete extra.text;parameters.vidu_type="lip-sync";
    }else{
      if(refs.videos.length||refs.audios.length)unsupportedWire(context,"此Vidu生成分支不接受视频或音频");
      if(input.mode==="reference"){
        if(refs.images.length<1||refs.images.length>7||first||last)unsupportedWire(context,"Vidu参考模式需要1—7张普通图片");skeletonInput.images=refs.images;parameters.vidu_type="reference2video";parameters.aspect_ratio=input.aspectRatio;
      }else if(input.mode==="frames_required"){
        if(!first||!last)unsupportedWire(context,"Vidu首尾帧需要两张图片");skeletonInput.first_frame_url=first.url;skeletonInput.last_frame_url=last.url;parameters.vidu_type="start-end2video";
      }else if(input.mode==="text"){parameters.vidu_type="text2video";parameters.aspect_ratio=input.aspectRatio;}
      else{if(!first||last||input.references.length!==1)unsupportedWire(context,"Vidu图生模式需要且只接受首帧");skeletonInput.first_frame_url=first.url;parameters.vidu_type="img2video";}
    }
  }
  // Options with no documented destination for this branch are rejected rather than silently discarded.
  if(extra.text!==undefined||extra.voice_id!==undefined||extra.audio_speed!==undefined)unsupportedWire(context,"此分支没有映射该音频参数");
  Object.assign(parameters,extra);
  return {path:"/v1/tasks/submit",method:"POST",encoding:"json",body:{model:input.modelId,input:skeletonInput,parameters}};
}
export function decodeCompshareCreated(profile:VideoWireContext["profile"],payload:unknown){return createdResult(payload,profile==="compshare-h3"?field(payload,"task_id"):field(payload,"output.task_id"));}
export function buildCompsharePoll(context:VideoWireContext,id:string):VideoWireRequest{return {path:context.profile==="compshare-h3"?`/minimax/v2/query/video_generation/${encodeURIComponent(id)}`:`/v1/tasks/status?task_id=${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeCompsharePoll(profile:VideoWireContext["profile"],payload:unknown){
  if(profile==="compshare-h3")return decodeMiniMaxPoll(payload);
  const raw=field(payload,"output.task_status"),urls=field(payload,"output.urls");
  const values=Array.isArray(urls)?urls.map(mediaUrl):[];
  if(Array.isArray(urls)&&values.some(url=>!url))throw new TransientPollError("ModelVerse输出含无效媒体地址");
  const normalized=polled(payload,{status:raw,url:values[0],error:field(payload,"output.error_message")});
  return {...normalized,...(values.length?{resultAssets:values.map(url=>({kind:"video" as const,url:url!}))}:{})};
}
export function compshareCodec(profile:VideoWireContext["profile"]):VideoWireCodec{return {create:buildCompshareCreate,poll:buildCompsharePoll,created:payload=>decodeCompshareCreated(profile,payload),polled:payload=>decodeCompsharePoll(profile,payload)};}
