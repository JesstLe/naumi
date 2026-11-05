import {createdResult,field,jsonObjectString,polled,rejectAdvanced,selectWireOptions,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
// Wire adaptation: IC 68b37db handler/kie_video.go and web/src/services/api/video.ts (AGPL-3.0).
const options={seed:"seed",mode:"mode",characterOrientation:"character_orientation",character_orientation:"character_orientation",keepOriginalSound:"keep_original_sound",smartShots:"prefer_multi_shots",cfgScale:"cfg_scale",returnLastFrame:"return_last_frame"};
export function buildKIECreate(context:VideoWireContext):VideoWireRequest{
  const input=context.request,refs=wireReferences(context),profile=context.profile,extra=selectWireOptions(context,options);
  const images=input.references.filter(ref=>ref.kind==="image").map(ref=>ref.url!),omni=profile.startsWith("kie-kling-omni-");
  const values:Record<string,unknown>={prompt:input.prompt,duration:String(input.durationSeconds),aspect_ratio:input.aspectRatio,resolution:input.resolution,
    ...(images.length?{image_urls:images}:{}),...(refs.videos.length?{video_urls:refs.videos}:{}),...(refs.audios.length?{audio_urls:refs.audios}:{}),...extra};
  if(profile==="kie-motion-control"){
    rejectAdvanced(context);
    if(images.length!==1||refs.videos.length!==1||refs.audios.length)unsupportedWire(context,"运动控制必须是一张图片和一个运动视频");
    delete values.duration;delete values.aspect_ratio;values.mode=extra.mode??input.resolution;
    values.character_orientation=extra.character_orientation??"image";
  }else if(omni){
    values.duration=input.durationSeconds;
    if(refs.audios.length)unsupportedWire(context,"Omni音频引用须放入元素");
    if(refs.videos.length>1||images.length>(profile==="kie-kling-omni-transform"?4:profile==="kie-kling-omni-image"?2:profile==="kie-kling-omni-text"?0:30))unsupportedWire(context,"Omni引用数量不符合该分支");
    if(profile==="kie-kling-omni-text"&&input.references.length||profile==="kie-kling-omni-image"&&(!images.length||refs.videos.length))unsupportedWire(context,"Omni所选分支与媒体类型不符");
    if(profile==="kie-kling-omni-transform"&&(!refs.videos.length||input.shots?.length||input.elements?.length))unsupportedWire(context,"transformation需要来源视频且不支持结构化分镜或元素");
    if(profile==="kie-kling-omni-reference"&&!input.references.length&&!input.elements?.length)unsupportedWire(context,"Omni reference需要素材或元素");
    delete values.mode;
    if(input.negativePrompt)unsupportedWire(context,"Omni没有负面提示词字段");
    if(input.generateAudio!==undefined)values.audio=input.generateAudio;
    if(input.shots?.length){if(input.shots.length>6)unsupportedWire(context,"Omni最多6个自定义分镜");
      values.customize_multi_shots=true;values.multi_prompt=input.shots.map(shot=>({prompt:shot.prompt,duration:shot.durationSeconds}));
      if(profile!=="kie-kling-omni-reference")values.prefer_multi_shots=false;
    }else if(extra.prefer_multi_shots!==undefined){
      if(profile==="kie-kling-omni-reference"||profile==="kie-kling-omni-transform")unsupportedWire(context,"该Omni分支不支持智能分镜");
      values.customize_multi_shots=false;
    }
    if(profile==="kie-kling-omni-image"&&images.length>1)values.aspect_ratio="auto";
    if(profile==="kie-kling-omni-reference"&&refs.videos.length){
      if(input.generateAudio===true)unsupportedWire(context,"Omni视频参考分支不生成音频");values.aspect_ratio="auto";values.audio=false;
      if(!images.length&&!input.elements?.length){if(input.shots?.length)unsupportedWire(context,"仅视频参考不支持指定分镜");delete values.duration;}
    }
    if(profile==="kie-kling-omni-transform"&&!images.length){values.aspect_ratio="auto";delete values.duration;}
  }else if(profile==="kie-kling"||profile==="kie-kling-v26"){
    if(refs.videos.length||refs.audios.length||images.length>2)unsupportedWire(context,"Kling视频模式最多两张图片");
    values.mode=extra.mode??"std";delete values.resolution;
    if(input.generateAudio!==undefined)values.sound=input.generateAudio;
    if(profile==="kie-kling-v26"){if(![5,10].includes(input.durationSeconds))unsupportedWire(context,"Kling2.6时长只能为5或10秒");rejectAdvanced(context);if(input.negativePrompt)values.negative_prompt=input.negativePrompt;}
    else{
      if(input.negativePrompt)unsupportedWire(context,"Kling3.0没有负面提示词字段");
      if(input.shots?.length){values.multi_shots=true;values.multi_prompt=input.shots.map(shot=>({prompt:shot.prompt,duration:shot.durationSeconds}));}
      if(extra.prefer_multi_shots!==undefined)unsupportedWire(context,"Kling3.0不支持智能分镜字段");
    }
  }else{
    rejectAdvanced(context);if(refs.first)values.first_frame_url=refs.first;if(refs.last)values.last_frame_url=refs.last;
    if(input.generateAudio!==undefined)values.generate_audio=input.generateAudio;
    if(input.negativePrompt)values.negative_prompt=input.negativePrompt;
  }
  if(input.watermark!==undefined)values.watermark=input.watermark;
  if(input.elements?.length){values[omni?"elements":"kling_elements"]=input.elements.map(element=>({name:element.name,description:element.description,
    ...(element.references.some(ref=>ref.kind!=="audio")?{element_input_urls:element.references.filter(ref=>ref.kind!=="audio").map(ref=>ref.url)}:{}),
    ...(element.references.some(ref=>ref.kind==="audio")?{element_input_audio_urls:element.references.filter(ref=>ref.kind==="audio").map(ref=>ref.url)}:{})}));}
  return {path:"/api/v1/jobs/createTask",method:"POST",encoding:"json",body:{model:input.modelId,input:values}};
}
export function decodeKIECreated(payload:unknown){
  if(field(payload,"code")!==undefined&&![0,200].includes(Number(field(payload,"code"))))throw new Error("KIE创建未确认成功，结果待核对");
  return createdResult(payload,field(payload,"data.taskId"));
}
export function buildKIEPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeKIEPoll(payload:unknown){
  const raw=field(payload,"data.resultJson"),result=jsonObjectString(raw===""?undefined:raw);
  return polled(payload,{status:field(payload,"data.state")||field(payload,"data.status"),url:field(result,"resultUrls.0")||field(result,"resultWaterMarkUrls.0"),
    progress:field(payload,"data.progress"),error:field(payload,"data.failMsg"),code:field(payload,"data.failCode")});
}
export const kieCodec:VideoWireCodec={create:buildKIECreate,poll:buildKIEPoll,created:decodeKIECreated,polled:decodeKIEPoll};
