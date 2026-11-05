import {createdResult,field,polled,rejectAdvanced,selectWireOptions} from "../wire-helpers";
import type {VideoWireCodec,VideoWireContext,VideoWireRequest} from "../wire-contracts";
// Behavior adapted from infinite-canvas 68b37db web/src/services/api/video.ts and protocols/ark.ts (AGPL-3.0).
export function buildArkCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const input=context.request;
  const content:Record<string,unknown>[]=[{type:"text",text:input.prompt}];
  for(const ref of input.references){const kind=ref.kind,role=ref.role==="first_frame"||ref.role==="last_frame"?ref.role:`reference_${kind}`;
    content.push({type:`${kind}_url`,[`${kind}_url`]:{url:ref.url},role});}
  return {path:"/contents/generations/tasks",method:"POST",encoding:"json",body:{model:input.modelId,content,duration:input.durationSeconds,
    ratio:input.aspectRatio,resolution:input.resolution,generate_audio:input.generateAudio,watermark:input.watermark,
    ...selectWireOptions(context,{seed:"seed",cameraFixed:"camera_fixed",camera_fixed:"camera_fixed",returnLastFrame:"return_last_frame",draft:"draft",serviceTier:"service_tier"})}};
}
export function decodeArkCreated(payload:unknown){return createdResult(payload,field(payload,"id"),field(payload,"status"));}
export function buildArkPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/contents/generations/tasks/${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeArkPoll(payload:unknown){return polled(payload,{status:field(payload,"status"),url:field(payload,"content.video_url"),progress:field(payload,"progress"),error:field(payload,"error.message"),code:field(payload,"error.code")});}
export const arkCodec:VideoWireCodec={create:buildArkCreate,poll:buildArkPoll,created:decodeArkCreated,polled:decodeArkPoll,
  cancel:(_context,id)=>({path:`/contents/generations/tasks/${encodeURIComponent(id)}`,method:"DELETE",encoding:"none"})};
