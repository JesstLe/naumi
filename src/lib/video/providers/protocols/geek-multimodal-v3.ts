import {createdResult,field,polled} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {buildGeekVerifiedPoll,decodeGeekVerifiedCreated,decodeGeekVerifiedPoll} from "./geek-verified";
import {multimodalV3Input,ordinaryReferenceImages,rejectMultimodal,requireVisualReference,requireReferenceFormats,mediaMinDuration,validateDimensions,mappedReferencePrompt} from "./multimodal-v3-input";

function wanCreate(context:VideoWireContext):VideoWireRequest {
  const {input,images,videos,audios,frames}=multimodalV3Input(context,"geeknow-video");
  if(input.generateAudio!==undefined)rejectMultimodal("此版本保留原声音配置","generateAudio");
  const body:Record<string,unknown>={model:context.request.modelId,prompt:input.prompt,seconds:input.durationSeconds,size:input.resolution.toUpperCase()};
  if(!frames&&input.aspectRatio)body.aspect_ratio=input.aspectRatio==="adaptive"?"adaptive":input.aspectRatio.replace(":","x");
  if(input.mode==="single_image")body.image=images[0].url;
  else if(input.mode==="frames_required"){
    body.mode="first-last-frame";body.metadata={first_frame_url:images.find(ref=>ref.role==="first_frame")!.url,last_frame_url:images.find(ref=>ref.role==="last_frame")!.url};
  }else if(input.mode==="reference"){
    ordinaryReferenceImages(images);body.mode="all-reference";
    if(images.length)body.images=images.map(ref=>ref.url);
    if(videos.length||audios.length)body.metadata={...(videos.length?{reference_video_urls:videos.map(ref=>ref.url)}:{}),...(audios.length?{reference_audio_urls:audios.map(ref=>ref.url)}:{})};
  }
  return {path:"/v1/videos",method:"POST",encoding:"json",body};
}
function h3Create(context:VideoWireContext):VideoWireRequest {
  const {input,references,images,videos,audios,frames}=multimodalV3Input(context,"geeknow-video-h3");
  requireReferenceFormats(references,{video:['video/mp4','video/quicktime'],audio:['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/mp4','audio/x-m4a','audio/aac','audio/aacp','audio/adts']});
  if(input.generateAudio!==undefined)rejectMultimodal("H3 通道声音随模型，不发送独立开关","generateAudio");
  if(references.length>12)rejectMultimodal("H3 参考媒体合计最多 12 个");
  if(references.some(ref=>!ref.url.startsWith("https://")))rejectMultimodal("H3 参考媒体需要已授权的 HTTPS 地址");
  mediaMinDuration([...videos,...audios],2);validateDimensions([...images,...videos],256,5760,0.4,2.5);requireVisualReference(images,videos,audios);
  if(!frames)ordinaryReferenceImages(images);
  if(frames&&images.length===2&&images.every(ref=>ref.width&&ref.height)){
    const first=images[0].width!/images[0].height!,last=images[1].width!/images[1].height!;
    if(Math.abs(first/last-1)>0.02)rejectMultimodal("H3 首尾帧的宽高比差异须在 2% 内");
  }
  const prompt=frames?input.prompt:mappedReferencePrompt(input.prompt,references,"h3");
  if(Array.from(prompt).length>7000)rejectMultimodal("H3 描述与引用对应关系合计超过 7000 字，请精简后提交","prompt");
  const content:Record<string,unknown>[]=[{type:"text",text:prompt}];
  for(const ref of references)content.push({type:`${ref.kind}_url`,[`${ref.kind}_url`]:{url:ref.url},role:frames?ref.role:`reference_${ref.kind}`});
  return {path:"/v1/videos",method:"POST",encoding:"json",body:{model:context.request.modelId,content,resolution:input.resolution,duration:input.durationSeconds,ratio:input.aspectRatio}};
}
export const geekWanMultimodalCodec:VideoWireCodec={create:wanCreate,poll:buildGeekVerifiedPoll,created:decodeGeekVerifiedCreated,polled:payload=>decodeGeekVerifiedPoll("geek-wan3",payload)};
export const geekH3MultimodalCodec:VideoWireCodec={create:h3Create,poll:buildGeekVerifiedPoll,
  created:payload=>createdResult(payload,field(payload,"task.id")||field(payload,"id"),field(payload,"task.status")||field(payload,"status")),
  polled:payload=>polled(payload,{status:field(payload,"task.status")||field(payload,"status"),url:field(payload,"task.content.url")||field(payload,"video_url"),progress:field(payload,"progress"),error:field(payload,"task.error.message")||field(payload,"error.message"),code:field(payload,"task.error.code")||field(payload,"error.code")})};
