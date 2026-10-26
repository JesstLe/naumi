import {createdResult,field,polled,rejectAdvanced,selectWireOptions,unsupportedWire,wireReferences} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
// IC MiniMax-H3/METASO protocol, not the unrelated Hailuo v1 API. Frozen profiles keep that distinction.
export function buildMiniMaxCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request,refs=wireReferences(context);
  if((refs.first||refs.last)&&(refs.images.length||refs.videos.length||refs.audios.length))unsupportedWire(context,"首尾帧不能与混合参考同时使用");
  if(refs.audios.length&&!refs.images.length&&!refs.videos.length)unsupportedWire(context,"参考音频须有图片或视频");
  const content:Record<string,unknown>[]=[{type:"text",text:input.prompt}];
  for(const ref of input.references){const role=["first_frame","last_frame"].includes(ref.role)?ref.role:`reference_${ref.kind}`;
    content.push({type:`${ref.kind}_url`,[`${ref.kind}_url`]:{url:ref.url},role});}
  return {path:"/v2/video_generation",method:"POST",encoding:"json",body:{model:input.modelId,content,resolution:input.resolution,duration:input.durationSeconds,
    ratio:refs.first||refs.last?"adaptive":input.aspectRatio,...selectWireOptions(context,{seed:"seed"})}};
}
export function decodeMiniMaxCreated(payload:unknown){return createdResult(payload,field(payload,"task.id")||field(payload,"id"),field(payload,"task.status")||field(payload,"status"));}
export function buildMiniMaxPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/v2/query/video_generation/${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeMiniMaxPoll(payload:unknown){return polled(payload,{status:field(payload,"task.status"),url:field(payload,"task.content.url"),error:field(payload,"task.error.message"),code:field(payload,"task.error.code")});}
export const minimaxCodec:VideoWireCodec={create:buildMiniMaxCreate,poll:buildMiniMaxPoll,created:decodeMiniMaxCreated,polled:decodeMiniMaxPoll};
