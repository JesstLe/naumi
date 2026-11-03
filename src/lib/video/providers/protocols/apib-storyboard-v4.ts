import {STORYBOARD_VIDEO_FAMILIES} from "../../../model-config/video-family-storyboard";
import {normalizeVideoInput,VideoContractError} from "../../contract";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {buildAPIBDocumentedCreate} from "./apib-documented";
import {buildAPIBMultimodalCreate} from "./apib-multimodal-v3";
import {mappedReferencePrompt} from "./multimodal-v3-input";
import {buildAPIMartPoll,decodeAPIMartCreated,decodeAPIMartPoll} from "./apimart";

/** Only these exact contracts add structured shots. Empty/no shots uses the
 * original codec unchanged, including its role, audio and parameter boundaries. */
export function buildAPIBStoryboardCreate(context:VideoWireContext):VideoWireRequest {
  const entry=STORYBOARD_VIDEO_FAMILIES.find(item=>item.model===context.request.modelId);
  if(!entry)throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED","此视频型号未接入结构化分镜",["modelId"]);
  const base={...context,profile:entry.previousProfile,provider:{...context.provider,videoProfile:entry.previousProfile}};
  const create=entry.previousProfile==="apib-video-v3"?buildAPIBMultimodalCreate:buildAPIBDocumentedCreate;
  if(!context.request.shots?.length)return create(base);
  const normalized=normalizeVideoInput(context.request as unknown as Record<string,unknown>,entry.definition);
  // Validate all other fields with the immutable original contract. Removing
  // shots only at this boundary is intentional: this codec sends every shot below.
  const wire=create({...base,request:{...context.request,shots:undefined}});
  const images=normalized.references.filter(ref=>ref.kind==="image");
  return {...wire,body:{...(wire.body as Record<string,unknown>),multi_shot:true,shot_type:"customize",
    multi_prompt:normalized.shots!.map((shot,index)=>({index:index+1,
      prompt:entry.model==="kling-v3-omni"&&normalized.mode==="reference"?mappedReferencePrompt(shot.prompt,images,"kling"):shot.prompt,
      duration:shot.durationSeconds}))}};
}
export const apibStoryboardCodec:VideoWireCodec={create:buildAPIBStoryboardCreate,poll:buildAPIMartPoll,created:decodeAPIMartCreated,polled:decodeAPIMartPoll};
