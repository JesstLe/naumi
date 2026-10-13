import {createdResult,field,polled,rejectAdvanced,selectWireOptions,unsupportedWire,wireReferences,type VideoWireContext,type VideoWireRequest,type VideoWireCodec} from "../wire";
// Wire adaptation: IC 68b37db handler/apimart_video.go (AGPL-3.0). Reject overlimits instead of upstream source truncation.
export function buildAPIMartCreate(context:VideoWireContext):VideoWireRequest{
  const input=context.request,refs=wireReferences(context),profile=context.profile;
  const extra=selectWireOptions(context,{seed:"seed",mode:"mode",characterOrientation:"character_orientation",character_orientation:"character_orientation",keepOriginalSound:"keep_original_sound",smartShots:"multi_shot",cfgScale:"cfg_scale"});
  const images=input.references.filter(ref=>ref.kind==="image").map(ref=>ref.url!);
  const body:Record<string,unknown>={model:input.modelId,prompt:input.prompt,duration:input.durationSeconds,resolution:input.resolution,aspect_ratio:input.aspectRatio,
    ...(images.length?{image_urls:images}:{}),...(refs.videos.length?{video_urls:refs.videos}:{}),...(refs.audios.length?{audio_urls:refs.audios}:{}),...extra};
  if(profile==="apimart-motion-control"){
    rejectAdvanced(context);if(images.length!==1||refs.videos.length!==1||refs.audios.length)unsupportedWire(context,"运动控制需要一张图片和一个运动视频");
    body.character_orientation=extra.character_orientation??"image";body.mode=extra.mode??"std";
    body.image_url=images[0];body.video_url=refs.videos[0];delete body.image_urls;delete body.video_urls;
    delete body.duration;delete body.resolution;delete body.aspect_ratio;
  }else if(profile==="apimart-kling-omni"){
    if(refs.videos.length>1||images.length>7||refs.audios.length)unsupportedWire(context,"Omni最多7张图片、1个视频，不支持独立音频引用");
    if(input.shots?.length||input.elements?.length)unsupportedWire(context,"此API Mart Omni wire未声明结构化分镜或元素");
    body.mode=extra.mode??(input.resolution?.toLowerCase()==="1080p"?"pro":"std");delete body.resolution;
    delete body.video_urls;if(refs.videos.length)body.video_list=refs.videos.map(video_url=>({video_url,refer_type:"base",keep_original_sound:"no"}));
    if(input.generateAudio!==undefined&&!refs.videos.length)body.audio=input.generateAudio;
    if(refs.videos.length&&input.generateAudio===true)unsupportedWire(context,"视频参考分支不生成音频");
  }else if(profile==="apimart-kling"||profile==="apimart-kling-v26"){
    if(images.length>2||refs.videos.length||refs.audios.length)unsupportedWire(context,"Kling最多两张图片");
    body.mode=extra.mode??"std";delete body.resolution;
    if(input.generateAudio!==undefined)body[profile==="apimart-kling-v26"?"sound":"audio"]=input.generateAudio;
    if(profile==="apimart-kling-v26"){if(![5,10].includes(input.durationSeconds))unsupportedWire(context,"Kling2.6时长只能为5或10秒");rejectAdvanced(context);}
    if(input.shots?.length){body.multi_shot=true;body.shot_type="customize";body.multi_prompt=input.shots.map((shot,index)=>({index:index+1,prompt:shot.prompt,duration:shot.durationSeconds}));}
    else if(extra.multi_shot===true)body.shot_type="intelligence";
    if(input.elements?.length){if(input.elements.length>3||input.elements.some(element=>element.references.length>4||element.references.some(ref=>ref.kind!=="image")))unsupportedWire(context,"Kling最多3个元素，每个最多4张图片");
      body.element_list=input.elements.map(element=>({name:element.name,description:element.description,element_input_urls:element.references.map(ref=>ref.url)}));}
  }else{
    rejectAdvanced(context);if(refs.first)body.first_frame_url=refs.first;if(refs.last)body.last_frame_url=refs.last;
    if(input.generateAudio!==undefined)body.generate_audio=input.generateAudio;
  }
  if(input.watermark!==undefined)body.watermark=input.watermark;
  if(input.negativePrompt)body.negative_prompt=input.negativePrompt;
  return {path:"/v1/videos/generations",method:"POST",encoding:"json",body};
}
export function decodeAPIMartCreated(payload:unknown){return createdResult(payload,field(payload,"data.0.task_id")||field(payload,"data.0.id"),field(payload,"data.0.status"));}
export function buildAPIMartPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/v1/tasks/${encodeURIComponent(id)}?language=zh`,method:"GET",encoding:"none"};}
export function decodeAPIMartPoll(payload:unknown){return polled(payload,{status:field(payload,"data.status"),url:field(payload,"data.result.videos.0.url.0")||field(payload,"data.result.videos.0.url")||field(payload,"data.result.videos.0")||field(payload,"data.result.video_url"),
  progress:field(payload,"data.progress"),error:field(payload,"data.error.message"),code:field(payload,"data.error.code")});}
export const apimartCodec:VideoWireCodec={create:buildAPIMartCreate,poll:buildAPIMartPoll,created:decodeAPIMartCreated,polled:decodeAPIMartPoll};
