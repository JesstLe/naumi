import {VideoContractError} from "../../contract";
import {createdResult,field,mediaUrl,polled,rejectAdvanced,selectWireOptions,type VideoWireContext,type VideoWireRequest,type VideoWireCodec} from "../wire";

// The nested output_config and images fields reproduce the successful Geek
// receipts. They intentionally do not replace any existing OpenAI profile.
export const GEEK_VERIFIED_PROFILES=["geek-kling","geek-wan3"] as const;
type Profile=typeof GEEK_VERIFIED_PROFILES[number];
const KLING_MODELS=new Set(["kling-1.6-720p","kling-2.0-720p","kling-2.1-720p","kling-2.5-720p","kling-2.6-mute-720p",
  "kling-3.0-720p-mute","kling-3.0-omni-720p-noref-mute","kling-3.0-omni-720p-ref-mute","kling-o1-720p"]);
function reject(context:VideoWireContext,message:string,field:string):never{
  throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED",`${context.profile}: ${message}`,[field]);
}
export function buildGeekVerifiedCreate(context:VideoWireContext):VideoWireRequest{
  const input=context.request,kling=context.profile==="geek-kling";
  if(kling?!KLING_MODELS.has(input.modelId):context.profile!=="geek-wan3"||input.modelId!=="wan3.0-video")reject(context,"型号不属于此已核验视频分支","modelId");
  rejectAdvanced(context);selectWireOptions(context,{});
  if(input.negativePrompt!==undefined||input.watermark!==undefined||input.width!==undefined||input.height!==undefined||input.workflowManifest!==undefined)
    reject(context,"当前已核验组合未开放负面词、水印、精确尺寸或工作流参数","providerOptions");
  if(!Number.isInteger(input.durationSeconds)||input.durationSeconds<=0)reject(context,"此分支需要显式的正整数视频时长","durationSeconds");
  const resolution=input.resolution?.trim().toUpperCase(),ratio=input.aspectRatio??"16:9";
  if(!resolution)reject(context,"此分支需要已配置的视频分辨率","resolution");
  if(!/^\d{1,3}:\d{1,3}$/.test(ratio))reject(context,"比例没有适配到此协议分支","aspectRatio");
  if(input.generateAudio!==undefined&&!kling)reject(context,"此型号没有已映射的声音开关","generateAudio");
  const referenceModel=input.modelId==="kling-3.0-omni-720p-ref-mute",expectedMode=referenceModel?"reference":"text";
  if(input.mode!==undefined&&input.mode!==expectedMode)reject(context,"视频模式不属于已核验组合","mode");
  const body:Record<string,unknown>=kling?{model:input.modelId,prompt:input.prompt,seconds:String(input.durationSeconds),metadata:{output_config:{resolution,aspect_ratio:ratio,audio_generation:input.generateAudio===true?"Enabled":"Disabled"}}}:
    {model:input.modelId,prompt:input.prompt,seconds:input.durationSeconds,size:resolution,aspect_ratio:ratio.replace(":","x")};
  if(referenceModel){
    if(input.references.length!==1||input.references[0].kind!=="image"||input.references[0].role!=="reference")reject(context,"此型号需要一张普通图片参考","references");
    const ref=input.references[0],url=mediaUrl(ref.url);
    if(!url||ref.inlineData)reject(context,"参考素材需要已授权的HTTP或HTTPS下载地址","references");
    body.images=[url];
  }else if(input.references.length)reject(context,"此型号当前只开放已核验文生模式","references");
  return {path:"/v1/videos",method:"POST",encoding:"json",body};
}
export function decodeGeekVerifiedCreated(payload:unknown){
  return createdResult(payload,field(payload,"id")||field(payload,"task_id")||field(payload,"data.id")||field(payload,"output.task_id"),
    field(payload,"status")||field(payload,"data.status")||field(payload,"output.task_status"));
}
export function buildGeekVerifiedPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/v1/videos/${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeGeekVerifiedPoll(profile:Profile,payload:unknown){
  if(profile==="geek-wan3")return polled(payload,{status:field(payload,"output.task_status")||field(payload,"status"),url:field(payload,"output.video_url")||field(payload,"video_url")||field(payload,"metadata.url"),
    progress:field(payload,"progress"),error:field(payload,"output.message")||field(payload,"error.message"),code:field(payload,"output.code")||field(payload,"error.code")});
  return polled(payload,{status:field(payload,"status")||field(payload,"data.status"),url:field(payload,"video_url")||field(payload,"data.video_url")||field(payload,"metadata.url"),
    progress:field(payload,"progress")??field(payload,"data.progress"),error:field(payload,"error.message")||field(payload,"data.error.message"),code:field(payload,"error.code")||field(payload,"data.error.code")});
}
export function geekVerifiedCodec(profile:Profile):VideoWireCodec{return {create:buildGeekVerifiedCreate,poll:buildGeekVerifiedPoll,created:decodeGeekVerifiedCreated,polled:payload=>decodeGeekVerifiedPoll(profile,payload)};}
