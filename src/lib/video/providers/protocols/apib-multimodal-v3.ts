import {type VideoWireContext,type VideoWireRequest,type VideoWireCodec} from "../wire";
import {buildAPIMartPoll,decodeAPIMartCreated,decodeAPIMartPoll} from "./apimart";
import {multimodalV3Input,ordinaryReferenceImages,rejectMultimodal,requireVisualReference,requireReferenceFormats,mediaMinDuration,validateDimensions,mappedReferencePrompt} from "./multimodal-v3-input";

/** Explicitly versioned supplier contracts, retrieved 2026-11-02. */
export function buildAPIBMultimodalCreate(context:VideoWireContext):VideoWireRequest {
  const {input,images,videos,audios,frames}=multimodalV3Input(context,"apib-video"),model=context.request.modelId;
  // Format contracts come from the exact channel documents, not model names.
  // Seedance 2.5's comparison table explicitly covers the 2.0 family as well.
  requireReferenceFormats(videos,{video:['video/mp4','video/quicktime']});
  if(model!=="kling-v3-omni")requireReferenceFormats(audios,{audio:['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave']});
  if(model==="seedance-2.5")requireReferenceFormats(images,{image:['image/jpeg','image/jpg','image/png','image/webp','image/bmp','image/tiff','image/gif','image/heic','image/heif']});
  if(model.startsWith("MiniMax-H3"))requireReferenceFormats(images,{image:['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']});
  const body:Record<string,unknown>={model,prompt:input.prompt,duration:input.durationSeconds};
  const first=images.find(ref=>ref.role==="first_frame"),last=images.find(ref=>ref.role==="last_frame");
  if(model==="kling-v3-omni") {
    const wireMode=({"720p":"std","1080p":"pro","4k":"4k"} as Record<string,string>)[input.resolution.toLowerCase()];
    if(!wireMode)rejectMultimodal("分辨率没有对应的 Kling 模式","resolution");body.mode=wireMode;
    if(videos.length){
      if(input.mode!=="reference"||images.length>1||images.some(ref=>ref.role!=="first_frame"))rejectMultimodal("Kling 特征视频参考只能搭配一张明确的首帧图片");
      mediaMinDuration(videos,3);validateDimensions(videos,720,2160);
      if(input.generateAudio===true)rejectMultimodal("Kling 视频参考与声音生成开关不兼容","generateAudio");
      body.video_list=videos.map(ref=>({video_url:ref.url,refer_type:"feature",keep_original_sound:"no"}));
      if(first)body.image_with_roles=[{url:first.url,role:"first_frame"}];
    }else{
      body.audio=input.generateAudio??false;
      if(frames)body.image_with_roles=images.map(ref=>({url:ref.url,role:ref.role}));
      else if(images.length){ordinaryReferenceImages(images);body.image_urls=images.map(ref=>ref.url);}
    }
    if(input.mode==="reference")body.prompt=mappedReferencePrompt(input.prompt,images,"kling");
    if(!frames&&input.aspectRatio)body.aspect_ratio=input.aspectRatio;
  }else{
    const seedance=model.startsWith("seedance-2."),extended=model==="seedance-2.5",wan=model.startsWith("wan3."),h3=model.startsWith("MiniMax-H3");
    body.resolution=seedance?input.resolution.toLowerCase():input.resolution.toUpperCase();
    if(input.generateAudio!==undefined)rejectMultimodal("此版本保留原声音配置，不新增声音字段","generateAudio");
    if(seedance){
      body.size=frames?"adaptive":input.aspectRatio;
      if(extended){
        mediaMinDuration([...videos,...audios],2);validateDimensions([...images,...videos],300,6000,0.4,2.5);
        for(const video of videos)if(video.width&&video.height&&(video.width*video.height<409600||video.width*video.height>8295044))rejectMultimodal("Seedance 2.5 参考视频像素数不符合通道要求");
      }else{
        requireVisualReference(images,videos,audios);
        const videoSeconds=videos.reduce((sum,ref)=>sum+ref.durationSeconds!,0);
        if(videos.length&&(videoSeconds<=1.8||videoSeconds>=15.2))rejectMultimodal("Seedance 2.0 参考视频总时长须大于 1.8 秒且小于 15.2 秒");
        for(const video of videos)if(video.width&&video.height&&(Math.min(video.width,video.height)<480||Math.min(video.width,video.height)>720))rejectMultimodal("Seedance 2.0 参考视频需为 480P 至 720P");
      }
      if(frames)body.image_with_roles=images.map(ref=>({url:ref.url,role:ref.role}));
      else if(images.length){ordinaryReferenceImages(images);body.image_urls=images.map(ref=>ref.url);}
      if(extended&&input.mode==="reference")body.omni_reference_task_type="reference";
    }else if(wan){
      body.size=frames?"adaptive":input.aspectRatio;
      mediaMinDuration([...videos,...audios],1);validateDimensions(images,240,8000,1/8,8);validateDimensions(videos,240,4096,1/8,8);
      if(videos.reduce((sum,ref)=>sum+ref.durationSeconds!,0)+input.durationSeconds>30)rejectMultimodal("Wan 3 参考视频与输出视频的总时长须在 30 秒内");
      if(input.mode==="reference")ordinaryReferenceImages(images);
      if(images.length)body.image_with_roles=images.map(ref=>({url:ref.url,role:frames?ref.role:"reference_image"}));
      if(input.mode==="reference")body.generation_type="reference";
    }else if(h3){
      mediaMinDuration([...videos,...audios],2);validateDimensions([...images,...videos],256,5760,0.4,2.5);requireVisualReference(images,videos,audios);
      if(frames){if(first)body.first_frame_image=first.url;if(last)body.last_frame_image=last.url;}
      else {if(input.aspectRatio)body.aspect_ratio=input.aspectRatio;if(images.length){ordinaryReferenceImages(images);body.image_urls=images.map(ref=>ref.url);}}
    }else rejectMultimodal("视频型号没有多模态字段映射","modelId");
    if(videos.length)body.video_urls=videos.map(ref=>ref.url);
    if(audios.length)body.audio_urls=audios.map(ref=>ref.url);
  }
  return {path:"/v1/videos/generations",method:"POST",encoding:"json",body};
}
export const apibMultimodalCodec:VideoWireCodec={create:buildAPIBMultimodalCreate,poll:buildAPIMartPoll,created:decodeAPIMartCreated,polled:decodeAPIMartPoll};
