import {TransientPollError} from "../../types";
import {createdResult,field,mediaUrl,object,polled,rejectAdvanced,selectWireOptions,unsupportedWire} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
// Behavior adapted from infinite-canvas 68b37db web/src/services/api/video.ts and lib/gemini.ts (AGPL-3.0).
export const GEMINI_WIRE_OPTIONS={seed:"seed",personGeneration:"personGeneration",numberOfVideos:"numberOfVideos",sampleCount:"sampleCount",enhancePrompt:"enhancePrompt"} as const;
export function buildGeminiCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,refs=input.references;
  if(refs.some(ref=>ref.kind!=="image"))unsupportedWire(context,"当前Veo协议仅支持图片参考");
  const first=refs.find(ref=>ref.role==="first_frame"),last=refs.find(ref=>ref.role==="last_frame"),images=refs.filter(ref=>!["first_frame","last_frame"].includes(ref.role));
  if(last&&!first||images.length&&(first||last)||images.length>3)unsupportedWire(context,"首尾帧和普通图片不能混用，普通图片最多3张");
  const inline=(ref:typeof refs[number])=>{if(!ref.inlineData)unsupportedWire(context,"图片须由服务端读取原始字节");return {inlineData:{data:ref.inlineData.data,mimeType:ref.inlineData.mimeType}};};
  const instance={prompt:input.prompt,...(first?{image:inline(first)}:{}),...(last?{lastFrame:inline(last)}:{}),...(images.length?{referenceImages:images.map(ref=>({image:inline(ref),referenceType:"asset"}))}:{})};
  return {path:`/v1beta/models/${encodeURIComponent(input.modelId)}:predictLongRunning`,method:"POST",encoding:"json",body:{instances:[instance],parameters:{
    aspectRatio:input.aspectRatio,durationSeconds:input.durationSeconds,resolution:input.resolution,negativePrompt:input.negativePrompt,
    ...selectWireOptions(context,GEMINI_WIRE_OPTIONS)}}};
}
export function decodeGeminiCreated(payload:unknown){return createdResult(payload,field(payload,"name"));}
export function buildGeminiPoll(_context:VideoWireContext,id:string):VideoWireRequest{
  if(!/^models\/[^/]+\/operations\/[^/]+$/.test(id)&&!/^operations\/[^/]+$/.test(id))throw new TransientPollError("Gemini operation名称无效");
  return {path:`/v1beta/${id.split("/").map(encodeURIComponent).join("/")}`,method:"GET",encoding:"none"};
}
export function decodeGeminiPoll(payload:unknown){
  const done=field(payload,"done"),error=object(field(payload,"error"));
  if(done===false)return polled(payload,{status:"processing"});
  if(done!==true)throw new TransientPollError("Gemini operation缺少done状态");
  if(Object.keys(error).length)return polled(payload,{status:"failed",error:error.message,code:error.code});
  const samples=field(payload,"response.generateVideoResponse.generatedSamples")??field(payload,"response.generatedVideos");
  if(!Array.isArray(samples))throw new TransientPollError("Gemini完成响应缺少视频结果数组");
  const urls=samples.map(sample=>mediaUrl(field(sample,"video.uri")));
  if(urls.some(url=>!url))throw new TransientPollError("Gemini输出含无效媒体地址，保留任务等待核查");
  const result=polled(payload,{status:"completed",url:urls[0]});
  // Keep the primary in resultUrl so pre-upgrade manifests retain sourceIndex -1.
  return {...result,resultAssetsExcludePrimary:true,resultAssets:urls.slice(1).map(url=>({kind:"video" as const,url:url!}))};
}
export const geminiCodec:VideoWireCodec={create:buildGeminiCreate,poll:buildGeminiPoll,created:decodeGeminiCreated,polled:decodeGeminiPoll};
