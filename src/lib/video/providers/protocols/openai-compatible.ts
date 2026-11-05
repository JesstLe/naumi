import {createdResult,field,imageWireValue,polled,rejectAdvanced,selectWireOptions,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {mediaExtension} from "../../media-formats";
// IC 68b37db web/src/services/api/video.ts: distinct Grok2API, CogVideoX3 and Agnes wire forms.
function dimensions(context:VideoWireContext){
  const input=context.request;if(input.width&&input.height)return `${input.width}x${input.height}`;
  const vertical=input.aspectRatio==="9:16",square=input.aspectRatio==="1:1",resolution=(input.resolution||"").toLowerCase();
  if(square)return "1024x1024";
  if(resolution==="4k")return vertical?"2160x3840":"3840x2160";
  if(resolution==="2k")return vertical?"1080x2048":"2048x1080";
  if(resolution==="1080p")return vertical?"1080x1920":"1920x1080";
  return vertical?"720x1280":"1280x720";
}
export function buildOpenAICompatibleCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,refs=wireReferences(context),images=input.references.filter(ref=>ref.kind==="image").map(imageWireValue);
  if(context.profile==="grok2api"){
    if(refs.videos.length||refs.audios.length||refs.last)unsupportedWire(context,"Grok2API不支持首尾帧、视频或音频参考");
    return {path:"/v1/videos/generations",method:"POST",encoding:"json",body:{model:input.modelId,prompt:input.prompt,duration:input.durationSeconds,resolution:input.resolution,
      ...(input.aspectRatio&&input.aspectRatio!=="adaptive"?{aspect_ratio:input.aspectRatio}:{}),...(images.length===1?{image:{url:images[0]}}:images.length?{reference_images:images.map(url=>({url}))}:{}),...selectWireOptions(context,{})}};
  }
  if(context.profile==="cogvideox3"){
    if(refs.videos.length||refs.audios.length||images.length>2)unsupportedWire(context,"CogVideoX3最多两张图片，不支持视频或音频参考");
    return {path:"/v1/videos/generations",method:"POST",encoding:"json",body:{model:input.modelId,prompt:input.prompt,quality:input.resolution==="480p"?"speed":"quality",size:dimensions(context),
      duration:input.durationSeconds,with_audio:input.generateAudio,...(images.length?{image_url:images.length===1?images[0]:images}:{}),...selectWireOptions(context,{seed:"seed"})}};
  }
  if(context.profile==="agnes"){
    if(refs.videos.length||refs.audios.length||images.length>7)unsupportedWire(context,"Agnes帧数协议最多7张图片");
    const fps=input.durationSeconds>18?Math.max(1,Math.floor(440/input.durationSeconds)):24,target=Math.round(input.durationSeconds*fps)+1;
    const capped=Math.min(441,Math.max(9,target)),frames=capped-((capped-1)%8),[width,height]=dimensions(context).split("x").map(Number);
    return {path:"/v1/videos",method:"POST",encoding:"json",body:{model:input.modelId,prompt:input.prompt,num_frames:frames,frame_rate:fps,width,height,
      ...(images.length===1?{image:images[0]}:images.length?{extra_body:{image:images,mode:"keyframes"}}:{}),...selectWireOptions(context,{seed:"seed"})}};
  }
  if(context.profile==="agnes-v25"){
    if((refs.first||refs.last)&&(refs.images.length||refs.videos.length||refs.audios.length))unsupportedWire(context,"Agnes2.5首尾帧不能与混合参考同时使用");
    return {path:"/v1/videos",method:"POST",encoding:"json",body:{model:input.modelId,prompt:input.prompt,mode:refs.first||refs.last?"keyframe":input.references.length?"reference":"text",
      seconds:String(input.durationSeconds),size:(input.resolution||"").toUpperCase(),aspect_ratio:input.aspectRatio,first_frame:refs.first,last_frame:refs.last,
      ...(refs.images.length?{images:refs.images}:{}),...(refs.videos.length?{videos:refs.videos.map(url=>({url}))}:{}),...(refs.audios.length?{audios:refs.audios}:{}),...selectWireOptions(context,{seed:"seed"})}};
  }
  if(input.references.some(ref=>ref.kind!=="image")||images.length>1||refs.last)unsupportedWire(context,"OpenAI Videos仅支持一张输入图片");
  const body=new FormData();body.set("model",input.modelId);body.set("prompt",input.prompt);body.set("seconds",String(input.durationSeconds));body.set("size",dimensions(context));
  const image=input.references[0];if(image){if(!image.inlineData)unsupportedWire(context,"multipart图片须由服务端读取原始字节");
    const bytes=Uint8Array.from(Buffer.from(image.inlineData.data,"base64"));body.set("input_reference",new Blob([bytes],{type:image.inlineData.mimeType}),`reference.${mediaExtension(image.inlineData.mimeType)}`);}
  selectWireOptions(context,{});
  return {path:"/v1/videos",method:"POST",encoding:"multipart",body};
}
export function decodeOpenAICompatibleCreated(payload:unknown){return createdResult(payload,field(payload,"id")||field(payload,"task_id")||field(payload,"data.id"),field(payload,"status")||field(payload,"data.status"));}
export function buildOpenAICompatiblePoll(context:VideoWireContext,id:string):VideoWireRequest{
  const path=context.profile==="cogvideox3"?`/v1/async-result/${encodeURIComponent(id)}`:context.profile==="agnes"&&id.startsWith("video_")?`/agnesapi?video_id=${encodeURIComponent(id)}&model_name=${encodeURIComponent(context.request.modelId)}`:`/v1/videos/${encodeURIComponent(id)}`;
  return {path,method:"GET",encoding:"none"};
}
export function decodeOpenAICompatiblePoll(payload:unknown,contentEndpoint=false){
  return polled(payload,{status:field(payload,"status")||field(payload,"data.status"),url:field(payload,"video_url")||field(payload,"url")||field(payload,"data.video_url")||field(payload,"data.url"),
    progress:field(payload,"progress")||field(payload,"data.progress"),error:field(payload,"error.message"),code:field(payload,"error.code"),allowContentEndpoint:contentEndpoint});
}
export function openAICompatibleCodec(profile:VideoWireContext["profile"]):VideoWireCodec{
  return {create:buildOpenAICompatibleCreate,poll:buildOpenAICompatiblePoll,created:decodeOpenAICompatibleCreated,polled:payload=>decodeOpenAICompatiblePoll(payload,profile==="openai-videos"),
    ...(profile==="openai-videos"?{cancel:(_context:VideoWireContext,id:string):VideoWireRequest=>({path:`/v1/videos/${encodeURIComponent(id)}`,method:"DELETE",encoding:"none"})}:{})};
}
