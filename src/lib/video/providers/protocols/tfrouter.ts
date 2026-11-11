import {TransientPollError} from "../../types";
import {createdResult,field,polled,rejectAdvanced,selectWireOptions,string,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
export const TF_ROUTER_PROFILES=["tfrouter-generic","tfrouter-kling","tfrouter-kling-omni","tfrouter-grok"] as const;
export function buildTFRouterCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,refs=wireReferences(context),profile=context.profile;
  const options=selectWireOptions(context,{seed:"seed",mode:"mode",negativePrompt:"negative_prompt"});
  let metadata:Record<string,unknown>;
  if(profile==="tfrouter-kling"||profile==="tfrouter-kling-omni"){
    if(refs.audios.length)unsupportedWire(context,"此Kling路由不接受独立音频参考");
    metadata={aspect_ratio:input.aspectRatio,...(input.generateAudio!==undefined?{sound:input.generateAudio?"on":"off"}:{}),video_list:refs.videos.map(video_url=>({video_url})),image_list:[],...options};
    if(profile==="tfrouter-kling-omni")metadata.image_list=input.references.filter(ref=>ref.kind==="image").map(ref=>({image_url:ref.url,...(ref.role==="first_frame"?{type:"first_frame"}:ref.role==="last_frame"?{type:"end_frame"}:{})}));
    else{
      const images=input.references.filter(ref=>ref.kind==="image");if(images.length>2)unsupportedWire(context,"Kling首尾帧最多两张图片");
      if(refs.first)metadata.image=refs.first;else if(!refs.last&&images[0])metadata.image=images[0].url;
      if(refs.last)metadata.image_tail=refs.last;
    }
  }else if(profile==="tfrouter-grok"){
    if(input.references.length)unsupportedWire(context,"此TF Grok元数据未声明媒体输入字段");
    metadata={aspectRatio:input.aspectRatio,...options};
  }else{
    const references=input.references.map(ref=>({role:["first_frame","last_frame"].includes(ref.role)?ref.role:`reference_${ref.kind}`,type:`${ref.kind}_url`,[`${ref.kind}_url`]:{url:ref.url}}));
    metadata={...(input.generateAudio!==undefined?{generate_audio:input.generateAudio}:{}),ratio:input.aspectRatio,references,resolution:input.resolution,...options};
  }
  if(input.watermark!==undefined)metadata.watermark=input.watermark;
  if(input.negativePrompt)metadata.negative_prompt=input.negativePrompt;
  return {path:"/v1/video/generateVideo",method:"POST",encoding:"json",body:{model:input.modelId,prompt:input.prompt,duration:input.durationSeconds,resolution:input.resolution,metadata}};
}
export function decodeTFRouterCreated(payload:unknown){return createdResult(payload,field(payload,"data"));}
export function buildTFRouterPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:"/v1/video/getVideoStatus",method:"POST",encoding:"json",body:{taskICode:id}};}
export function decodeTFRouterPoll(payload:unknown){
  const status=field(payload,"status")??field(payload,"data.status"),result=field(payload,"data.data"),data=string(result);
  if(/^data:video\/[^;]+;base64,/.test(data)){
    const match=/^data:(video\/[^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(data);if(!match)throw new TransientPollError("TF-router视频base64结果无效");
    const normalized=polled(payload,{status,allowContentEndpoint:true,error:field(payload,"data.failReason")});
    return {...normalized,inlineResult:{mimeType:match[1],base64:match[2].replace(/\s/g,"")}};
  }
  return polled(payload,{status,url:data,error:field(payload,"data.failReason")});
}
export const tfRouterCodec:VideoWireCodec={create:buildTFRouterCreate,poll:buildTFRouterPoll,created:decodeTFRouterCreated,polled:decodeTFRouterPoll};
