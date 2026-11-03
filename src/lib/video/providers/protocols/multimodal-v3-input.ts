import definitions from "../../../model-config/video-family-multimodal.json";
import type {VideoModelDefinition} from "../../capability-schema";
import {normalizeVideoInput,VideoContractError} from "../../contract";
import type {VideoReference} from "../../types";
import {mediaUrl,rejectAdvanced,selectWireOptions} from "../wire-helpers";
import type {VideoWireContext} from "../wire-contracts";

export function rejectMultimodal(message:string,field="references"):never {
  throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED",message,[field]);
}

/** Both pre-reservation validation and execution use server-authorized metadata.
 * No clipping, truncating, role guessing or silent dropping of media happens here. */
export function multimodalV3Input(context:VideoWireContext,providerId:string) {
  const spec=definitions.items.find(item=>item.providerId===providerId&&item.model===context.request.modelId&&item.profile===context.profile);
  if(!spec)rejectMultimodal("视频型号没有对应的多模态协议契约","modelId");
  rejectAdvanced(context);selectWireOptions(context,{});
  const raw=context.request;
  if(raw.workflowManifest!==undefined)rejectMultimodal("此视频协议不接收工作流参数","workflowManifest");
  if(raw.references.some(ref=>ref.inlineData||ref.submissionName))rejectMultimodal("此视频协议需要已授权的媒体地址");
  const input=normalizeVideoInput(raw as unknown as Record<string,unknown>,spec!.definition as VideoModelDefinition);
  const references=input.references.map(ref=>{
    const url=mediaUrl(ref.url);if(!url)rejectMultimodal("参考素材需要已授权的 HTTP 或 HTTPS 地址");
    if(ref.kind!=="image"&&!(typeof ref.durationSeconds==="number"&&Number.isFinite(ref.durationSeconds)&&ref.durationSeconds>0))
      rejectMultimodal("参考视频或音频的实际时长尚未核实");
    return {...ref,url:url!};
  });
  const images=references.filter(ref=>ref.kind==="image"),videos=references.filter(ref=>ref.kind==="video"),audios=references.filter(ref=>ref.kind==="audio");
  const frames=["single_image","frames_required","first_optional","last_optional"].includes(input.mode);
  if(frames&&images.some(ref=>!["first_frame","last_frame"].includes(ref.role)))rejectMultimodal("首尾帧模式需要明确的帧角色");
  if(input.mode==="single_image"&&images[0]?.role!=="first_frame")rejectMultimodal("图生视频需要一张明确的首帧图片");
  // source_video/source_audio are stored node reference roles; the explicit
  // operation is still reference, not a request to overwrite or extend a video.
  if(videos.some(ref=>!["reference","source_video"].includes(ref.role))||audios.some(ref=>!["reference","source_audio"].includes(ref.role)))
    rejectMultimodal("视频或音频用途未映射到此参考模式");
  return {input,references,images,videos,audios,frames};
}

export function ordinaryReferenceImages(images:VideoReference[]) {
  if(images.some(ref=>ref.role!=="reference"))rejectMultimodal("图片参考与首尾帧或结构化元素不能混用");
}
export function mediaMinDuration(refs:VideoReference[],seconds:number) {
  if(refs.some(ref=>ref.durationSeconds!<seconds))rejectMultimodal(`参考媒体每段至少需要 ${seconds} 秒`);
}
export function requireVisualReference(images:VideoReference[],videos:VideoReference[],audios:VideoReference[]) {
  if(audios.length&&!images.length&&!videos.length)rejectMultimodal("此模型的参考音频需要同时提供图片或视频");
}
export function requireReferenceFormats(refs:VideoReference[],allowed:Partial<Record<VideoReference['kind'],readonly string[]>>) {
  for(const ref of refs){
    const formats=allowed[ref.kind];
    if(formats&&!formats.includes((ref.mimeType||'').split(';')[0].trim().toLowerCase()))
      rejectMultimodal(`此视频通道未开放该${{image:'图片',video:'视频',audio:'音频'}[ref.kind]}格式，请使用支持的素材格式`);
  }
}
export function validateDimensions(refs:VideoReference[],min:number,max:number,minRatio?:number,maxRatio?:number) {
  for(const ref of refs)if(ref.width&&ref.height){
    const ratio=ref.width/ref.height;
    if(Math.min(ref.width,ref.height)<min||Math.max(ref.width,ref.height)>max||minRatio!==undefined&&ratio<minRatio||maxRatio!==undefined&&ratio>maxRatio)
      rejectMultimodal("参考素材尺寸或比例不符合该视频通道要求");
  }
}

/** The stored prompt keeps its exact text. Earlier compilation deliberately
 * uses human labels, so replacing occurrences here would corrupt literal text.
 * Append only mappings for actual transported inputs, in their real kind order. */
export function mappedReferencePrompt(prompt:string,refs:VideoReference[],profile:"h3"|"kling") {
  const counts={image:0,video:0,audio:0},labels={image:"图片",video:"视频",audio:"音频"};
  const native={image:"Picture",video:"Video",audio:"Audio"};
  const mappings=refs.flatMap(ref=>{
    const index=++counts[ref.kind];
    if(profile==="kling")return ref.kind==="image"?[`${labels.image}${index} = <<<image_${index}>>>`]:[];
    return [`${labels[ref.kind]}${index} = <${native[ref.kind]} ${index}>`];
  });
  if(!mappings.length)return prompt;
  return `${prompt}\n\n引用素材对应关系（仅说明本次输入，不改写正文）：\n${mappings.join("\n")}`;
}
