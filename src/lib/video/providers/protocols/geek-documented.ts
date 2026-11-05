import definitions from "../../../model-config/video-family-capabilities.json";
import {normalizeVideoInput,VideoContractError} from "../../contract";
import {field,mediaUrl,rejectAdvanced,selectWireOptions} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import type {VideoModelDefinition} from "../../capability-schema";
import {buildGeekVerifiedPoll,decodeGeekVerifiedCreated,decodeGeekVerifiedPoll} from "./geek-verified";

/** Documented JSON entry, separate from legacy frozen Geek smoke profiles. */
export function buildGeekDocumentedCreate(context:VideoWireContext):VideoWireRequest {
  const input=context.request,spec=definitions.items.find(item=>item.providerId==="geeknow-video"&&item.model===input.modelId);
  const reject=(message:string):never=>{throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED",message);};
  if(!spec)reject("视频型号没有对应的公开参数契约");
  const normalized=normalizeVideoInput(input as unknown as Record<string,unknown>,spec!.definition as VideoModelDefinition);
  rejectAdvanced(context);selectWireOptions(context,{});
  if(input.negativePrompt!==undefined||input.watermark!==undefined||input.width!==undefined||input.height!==undefined||input.workflowManifest!==undefined)reject("此协议未映射附加参数");
  const mode=normalized.mode,frames=["single_image","frames_required","first_optional","last_optional"].includes(mode),wan=input.modelId==="wan3.0-video";
  if(normalized.references.some(ref=>ref.kind!=="image"))reject("此图片参考分支需要图片素材");
  const images=normalized.references.map(ref=>{const url=mediaUrl(ref.url);if(!url)reject("参考图片需要已授权的HTTP或HTTPS地址");return {url:url!,role:ref.role};});
  const first=images.find(ref=>ref.role==="first_frame"),last=images.find(ref=>ref.role==="last_frame"),ratio=frames?undefined:input.aspectRatio;
  const body:Record<string,unknown>={model:input.modelId,prompt:input.prompt,seconds:wan?input.durationSeconds:String(input.durationSeconds)};
  if(wan){
    body.size=input.resolution!.toUpperCase();if(ratio)body.aspect_ratio=ratio==="adaptive"?"adaptive":ratio.replace(":","x");
    if(mode==="single_image")body.image=first!.url;
    else if(mode==="frames_required"){body.mode="first-last-frame";body.metadata={first_frame_url:first!.url,last_frame_url:last!.url};}
    else if(mode==="reference"){body.mode="all-reference";body.images=images.map(ref=>ref.url);}
    if(input.generateAudio!==undefined)reject("此型号未映射声音开关");
  }else{
    const output:Record<string,unknown>={resolution:input.resolution!.toUpperCase(),audio_generation:input.generateAudio===true?"Enabled":"Disabled"};
    if(ratio)output.aspect_ratio=ratio;body.metadata={output_config:output};
    if(mode==="single_image")body.image=first!.url;
    else if(mode==="reference")body.images=images.map(ref=>ref.url);
  }
  return {path:"/v1/videos",method:"POST",encoding:"json",body};
}
export const geekDocumentedCodec:VideoWireCodec={create:buildGeekDocumentedCreate,poll:buildGeekVerifiedPoll,created:decodeGeekVerifiedCreated,polled:payload=>decodeGeekVerifiedPoll(field(payload,"output.task_status")?"geek-wan3":"geek-kling",payload)};
