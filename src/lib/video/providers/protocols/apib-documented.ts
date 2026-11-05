import definitions from "../../../model-config/video-family-capabilities.json";
import {normalizeVideoInput,VideoContractError} from "../../contract";
import {mediaUrl,rejectAdvanced,selectWireOptions} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import type {VideoModelDefinition} from "../../capability-schema";
import {buildAPIMartPoll,decodeAPIMartCreated,decodeAPIMartPoll} from "./apimart";

/** New frozen profile; older smoke-only profiles retain their exact wire behavior. */
export function buildAPIBDocumentedCreate(context:VideoWireContext):VideoWireRequest {
  const input=context.request,spec=definitions.items.find(item=>item.providerId==="apib-video"&&item.model===input.modelId);
  const reject=(message:string):never=>{throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED",message);};
  if(!spec)reject("视频型号没有对应的公开参数契约");
  const normalized=normalizeVideoInput(input as unknown as Record<string,unknown>,spec!.definition as VideoModelDefinition);
  rejectAdvanced(context);selectWireOptions(context,{});
  if(input.negativePrompt!==undefined||input.watermark!==undefined||input.width!==undefined||input.height!==undefined||input.workflowManifest!==undefined)reject("此协议未映射附加参数");
  const mode=normalized.mode,frame=["single_image","frames_required","first_optional","last_optional"].includes(mode),refs=normalized.references;
  if(refs.some(ref=>ref.kind!=="image"))reject("此图片参考分支需要图片素材");
  const urls=refs.map(ref=>{const url=mediaUrl(ref.url);if(!url)reject("参考图片需要已授权的HTTP或HTTPS地址");return {url:url!,role:ref.role};});
  const first=urls.find(ref=>ref.role==="first_frame"),last=urls.find(ref=>ref.role==="last_frame");
  if(frame&&(urls.length>2||mode==="single_image"&&!first||mode==="frames_required"&&(!first||!last)))reject("首尾帧角色与视频模式不一致");
  const model=input.modelId,resolution=input.resolution!.trim(),klingMode=["kling-v2-6","kling-v3","kling-v3-omni","kling-video-o1"].includes(model);
  const body:Record<string,unknown>={model,prompt:input.prompt,duration:input.durationSeconds};
  if(klingMode){
    const wireMode=({"720p":"std","1080p":"pro","4k":"4k"} as Record<string,string>)[resolution.toLowerCase()];
    if(!wireMode)reject("分辨率没有对应的Kling模式");body.mode=wireMode;
  }else body.resolution=model.startsWith("wan3.")||model==="wan2.7-r2v"||model.startsWith("MiniMax-")?resolution.toUpperCase():resolution.toLowerCase();
  const defaults:Record<string,boolean>={"seedance-1-5-pro":false,"kling-v2-6":false,"kling-v3":false,"kling-v3-omni":false,"wan2.5-preview":true,"wan2.6-i2v-flash":false};
  if(Object.hasOwn(defaults,model))body.audio=input.generateAudio??defaults[model];
  else if(input.generateAudio!==undefined)reject("此型号未映射声音开关");
  if(model==="kling-v2-6"&&((body.mode==="std"||!!last)&&body.audio===true))reject("此首尾帧或清晰度组合不支持有声视频");
  const sizeField=model.startsWith("seedance-2.")||model==="wan2.5-preview"||model==="wan2.7-r2v"||model.startsWith("wan3.");
  if((!frame||model.startsWith("seedance-1-"))&&input.aspectRatio){
    const value=model==="kling-v4"&&input.aspectRatio==="adaptive"?"auto":input.aspectRatio;
    body[sizeField?"size":"aspect_ratio"]=value;
  }else if(frame&&(model.startsWith("seedance-2.")||model.startsWith("wan3.")))body.size="adaptive";
  if(urls.length){
    if(frame){
      if(model==="kling-3.0-turbo")body.first_frame_image=first!.url;
      else if(model.startsWith("MiniMax-")){if(first)body.first_frame_image=first.url;if(last)body.last_frame_image=last.url;}
      else if(model==="seedance-1-5-pro"||["kling-v2-6","kling-v3","kling-video-o1","kling-v4","wan2.5-preview","wan2.6","wan2.6-i2v-flash"].includes(model))body.image_urls=[first?.url,last?.url].filter(Boolean);
      else body.image_with_roles=urls.map(ref=>({url:ref.url,role:ref.role}));
    }else if(mode==="reference"){
      if(urls.some(ref=>!["reference","element"].includes(ref.role)))reject("参考模式与首尾帧不能混用");
      if(model==="kling-v4"||model==="wan2.7-r2v"||model.startsWith("wan3."))body.image_with_roles=urls.map(ref=>({url:ref.url,role:"reference_image"}));
      else body.image_urls=urls.map(ref=>ref.url);
    }
  }
  return {path:"/v1/videos/generations",method:"POST",encoding:"json",body};
}
export const apibDocumentedCodec:VideoWireCodec={create:buildAPIBDocumentedCreate,poll:buildAPIMartPoll,created:decodeAPIMartCreated,polled:decodeAPIMartPoll};
