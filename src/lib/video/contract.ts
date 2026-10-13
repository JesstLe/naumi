import { z } from "zod";
import { VIDEO_MODES, videoDefinitionSchema, videoLimitsSchema, type VideoModelDefinition, type ResolvedVideoCapability, type CapabilitySource, type VideoMode } from "./capability-schema";
import { videoReferenceSchema, orderedInputSchema, orderedMediaReferences } from "./references";
import type { VideoReference } from "./types";
export { numberVideoInputs } from "./references";
export type { VideoMode,VideoModelDefinition,ResolvedVideoCapability } from "./capability-schema";

export class VideoContractError extends Error {
  readonly status=422;
  constructor(public code:string,message:string,public fields:string[]=[]){super(message);this.name="VideoContractError";}
}
export function resolveVideoCapability(input:{manual?:VideoModelDefinition;vendor?:VideoModelDefinition;adapter?:VideoModelDefinition}):ResolvedVideoCapability {
  const definitions=[input.manual,input.vendor,input.adapter].map(v=>v===undefined?undefined:videoDefinitionSchema.parse(v));
  const labels:CapabilitySource[]=["admin","vendor","adapter"],sources:Record<string,CapabilitySource>={},out:Record<string,unknown>={};
  for(const key of Object.keys(videoDefinitionSchema.shape)){
    if(key==="limits")continue;
    const index=definitions.findIndex(def=>def?.[key as keyof VideoModelDefinition]!==undefined);
    out[key]=index<0?null:definitions[index]![key as keyof VideoModelDefinition];sources[key]=index<0?"unknown":labels[index];
  }
  const limitOut:Record<string,number|null>={};
  for(const key of Object.keys(videoLimitsSchema.shape)){
    let selected=-1,value:number|null=null;
    for(let i=0;i<definitions.length;i++){
      const limits=definitions[i]?.limits;
      if(limits===null){selected=i;break;}
      const item=limits?.[key as keyof NonNullable<VideoModelDefinition["limits"]>];
      if(item!==undefined){selected=i;value=item;break;}
    }
    limitOut[key]=value;sources[`limits.${key}`]=selected<0?"unknown":labels[selected];
  }
  out.limits=limitOut;return {...out,sources} as ResolvedVideoCapability;
}

const shotSchema=z.strictObject({id:z.string().max(160).optional(),textNodeId:z.string().max(160).optional(),prompt:z.string().trim().min(1).max(16384),durationSeconds:z.number().finite().positive().max(3600)});
const elementSchema=z.strictObject({id:z.string().max(160).optional(),name:z.string().trim().min(1).max(100),description:z.string().max(2000).optional(),references:z.array(videoReferenceSchema).min(1).max(128)});
const inputSchema=z.strictObject({
  prompt:z.string().trim().max(16384,{message:"视频描述超过16384字限制"}),
  mode:z.enum(VIDEO_MODES).optional(),negativePrompt:z.string().max(8192).optional(),
  durationSeconds:z.number().finite().refine(v=>v===-1||Number.isInteger(v)&&v>0&&v<=3600,"视频时长无效"),
  aspectRatio:z.string().max(20).optional(),resolution:z.string().max(100),width:z.number().int().min(1).max(16384).optional(),height:z.number().int().min(1).max(16384).optional(),
  generateAudio:z.boolean().optional(),watermark:z.boolean().optional(),references:z.array(videoReferenceSchema).max(128,{message:"参考素材总数超过128"}),
  providerOptions:z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/),z.json()).optional(),
  orderedInputs:z.array(orderedInputSchema).max(256).optional(),shots:z.array(shotSchema).max(100).optional(),elements:z.array(elementSchema).max(100).optional(),
});
export type NormalizedVideoInput=Omit<z.infer<typeof inputSchema>,"mode">&{mode:VideoMode;omittedProviderOptions:string[]};
const aliases:Record<string,VideoMode>={image:"single_image",singleImage:"single_image",frames:"frames_required",startEndRequired:"frames_required",startFrameOptional:"first_optional",endFrameOptional:"last_optional"};
function reject(code:string,message:string,field?:string):never{throw new VideoContractError(code,message,field?[field]:[]);}
function inferredMode(refs:readonly VideoReference[]):VideoMode {
  if(!refs.length)return "text";
  if(refs.some(ref=>ref.role==="last_frame"))return refs.some(ref=>ref.role==="first_frame")?"frames_required":"first_optional";
  if(refs.length===1&&refs[0].kind==="image"&&refs[0].role==="first_frame")return "single_image";
  return "reference";
}
export function normalizeVideoInput(raw:Record<string,unknown>,cap:ResolvedVideoCapability|VideoModelDefinition):NormalizedVideoInput {
  const maps=cap.durationResolutionMap||[];
  const duration=raw.durationSeconds??raw.seconds??cap.defaultDurationSeconds??maps[0]?.durations[0];
  const durationSeconds=typeof duration==="string"&&duration.trim()?Number(duration):duration;
  const available=maps.filter(map=>map.durations.includes(durationSeconds as number));
  const size=typeof raw.size==="string"?raw.size:undefined;
  const parsed=inputSchema.safeParse({prompt:raw.prompt??"",mode:typeof raw.mode==="string"?(aliases[raw.mode]||raw.mode):raw.mode,
    negativePrompt:raw.negativePrompt,durationSeconds,aspectRatio:raw.aspectRatio??(size?.includes(":")?size:cap.defaultAspectRatio??cap.aspectRatios?.[0]),
    resolution:raw.resolution??(size&&!size.includes(":")?size:cap.defaultResolution??available[0]?.resolutions[0]),
    width:raw.width,height:raw.height,generateAudio:raw.generateAudio,watermark:raw.watermark,references:raw.references??[],
    providerOptions:raw.providerOptions,orderedInputs:raw.orderedInputs,shots:raw.shots,elements:raw.elements});
  if(!parsed.success){const issue=parsed.error.issues[0];reject("INVALID_VIDEO_INPUT",issue?.message||"视频输入无效",issue?.path.join("."));}
  const input=parsed.data;
  const mode=input.mode||inferredMode(input.references);
  if(!cap.modes?.includes(mode))reject("UNKNOWN_VIDEO_CAPABILITY","当前模型的此视频模式能力未配置或不支持","mode");
  if((cap.requiresPrompt!==false)&&!input.prompt)reject("VIDEO_PROMPT_REQUIRED","请填写完整视频描述","prompt");
  if(input.prompt.length>(cap.maxPromptChars??16384))reject("VIDEO_PROMPT_TOO_LONG","视频描述超过模型限制，未截断或提交","prompt");
  if(input.negativePrompt!==undefined&&cap.supportsNegativePrompt!==true)reject("NEGATIVE_PROMPT_UNSUPPORTED","当前模型不支持负面提示词","negativePrompt");
  if((input.negativePrompt?.length||0)>(cap.maxNegativePromptChars??8192))reject("NEGATIVE_PROMPT_TOO_LONG","负面提示词超过模型限制","negativePrompt");
  if(input.durationSeconds===-1&&cap.supportsAutoDuration!==true)reject("AUTO_DURATION_UNSUPPORTED","当前模型没有已声明的自动时长能力","durationSeconds");
  if(!available.length)reject("UNSUPPORTED_DURATION","视频时长不在已配置的合法组合内","durationSeconds");
  if(!available.some(map=>map.resolutions.includes(input.resolution)))reject("UNSUPPORTED_RESOLUTION","视频分辨率与当前时长不匹配","resolution");
  if(input.aspectRatio!==undefined&&!cap.aspectRatios?.includes(input.aspectRatio))reject("UNSUPPORTED_ASPECT_RATIO","画幅不在已配置的视频比例内","aspectRatio");
  if(input.width!==undefined||input.height!==undefined){if(!input.width||!input.height||cap.supportsExactSize!==true)reject("EXACT_SIZE_UNSUPPORTED","当前模型没有已声明的精确宽高能力","width");}
  if(input.generateAudio!==undefined){
    if(!cap.audio)reject("UNKNOWN_AUDIO_CAPABILITY","当前模型声音能力未配置","generateAudio");
    if(cap.audio==="required"&&!input.generateAudio||cap.audio==="disabled"&&input.generateAudio)reject("AUDIO_SETTING_UNSUPPORTED","声音设置不符合当前模型能力","generateAudio");
  }
  if(input.watermark!==undefined&&cap.supportsWatermark!==true)reject("WATERMARK_UNSUPPORTED","当前模型不支持水印参数","watermark");
  const refs=(input.orderedInputs?orderedMediaReferences(input.orderedInputs,input.references):input.references).map(ref=>({...ref}));
  const seen=new Set<string>();for(const ref of refs){if(seen.has(ref.id))reject("DUPLICATE_REFERENCE","参考素材身份重复","references");seen.add(ref.id);}
  const imageIndices=refs.map((ref,index)=>ref.kind==="image"?index:-1).filter(index=>index>=0);
  const imageCount=imageIndices.length,videoCount=refs.filter(ref=>ref.kind==="video").length,audioCount=refs.filter(ref=>ref.kind==="audio").length;
  if(mode==="text"&&refs.length)reject("MODE_INPUT_MISMATCH","文生视频不能带媒体参考","references");
  if(mode==="single_image"&&(imageCount!==1||videoCount||audioCount))reject("MODE_INPUT_MISMATCH","单图模式需要且只接受一张图片","references");
  if(["frames_required","first_optional","last_optional"].includes(mode)){
    if(videoCount||audioCount||imageCount<1||imageCount>2||mode==="frames_required"&&imageCount!==2)reject("FRAME_INPUT_MISMATCH","首尾模式的参考数量或类型不符合要求","references");
    for(const [order,index] of imageIndices.entries()){
      const role=mode==="first_optional"&&imageCount===1?"last_frame":order===0?"first_frame":"last_frame";
      if(refs[index].role!=="reference"&&refs[index].role!==role)reject("FRAME_ROLE_MISMATCH","首尾帧角色与所选模式不一致","references");
      refs[index].role=role;
    }
  }
  if(mode==="single_image"&&refs[0].role==="reference")refs[0].role="first_frame";
  if(mode==="reference"&&!refs.length)reject("REFERENCE_REQUIRED","混合参考模式至少需要一个媒体素材","references");
  if(["video_edit","extend"].includes(mode)&&!videoCount)reject("VIDEO_REFERENCE_REQUIRED","视频编辑或续写需要真实来源视频","references");
  if(mode==="motion_control"&&(!imageCount||!videoCount))reject("MOTION_INPUT_REQUIRED","运动控制需要图片与真实运动视频","references");
  if(mode==="lip_sync"&&(!(imageCount||videoCount)||(!audioCount&&!input.prompt)))reject("LIP_SYNC_INPUT_REQUIRED","口型同步需要视觉来源和音频或文字","references");
  for(const [role,supported] of [["first_frame",cap.supportsFirstFrame],["last_frame",cap.supportsLastFrame]] as const){
    if(supported===false&&refs.some(ref=>ref.role===role))reject("FRAME_UNSUPPORTED","当前模型禁用了该首尾帧角色","references");
    if(refs.filter(ref=>ref.role===role).length>1)reject("DUPLICATE_FRAME","首尾帧角色重复","references");
  }
  if(input.elements?.length){
    if(cap.supportsElements!==true||cap.maxElements==null||input.elements.length>cap.maxElements)reject("ELEMENTS_UNSUPPORTED","元素参考能力或数量限制未满足","elements");
    for(const element of input.elements){if(cap.maxElementReferences==null||element.references.length>cap.maxElementReferences)reject("ELEMENT_REFERENCES_EXCEEDED","元素参考超过已配置数量","elements");}
  }
  const allRefs=[...refs,...(input.elements||[]).flatMap(element=>element.references)];
  for(const [kind,key] of [["image","images"],["video","videos"],["audio","audios"]] as const){
    const items=allRefs.filter(ref=>ref.kind===kind),count=new Set(items.map(ref=>ref.id)).size,limit=cap.limits?.[key];
    if(count&&(limit==null||count>limit))reject("REFERENCE_LIMIT_EXCEEDED",`${kind}参考素材数量超过或缺少已配置上限`,"references");
    const byteLimit=cap.limits?.[`${kind}MaxBytes`],durationLimit=cap.limits?.[`${kind}MaxDurationSeconds`];
    if(items.some(ref=>ref.bytes!==undefined&&byteLimit!=null&&ref.bytes>byteLimit))reject("REFERENCE_BYTES_EXCEEDED","参考素材超过模型大小限制","references");
    if(items.some(ref=>ref.durationSeconds!==undefined&&durationLimit!=null&&ref.durationSeconds>durationLimit))reject("REFERENCE_DURATION_EXCEEDED","参考素材超过模型时长限制","references");
    if(kind!=="image"){
      const sum=items.reduce((n,ref)=>n+(ref.durationSeconds||0),0),max=cap.limits?.[kind==="video"?"totalVideoDurationSeconds":"totalAudioDurationSeconds"];
      if(max!=null&&sum>max)reject("REFERENCE_TOTAL_DURATION_EXCEEDED","参考素材总时长超过模型限制","references");
    }
  }
  if(input.shots?.length){
    if(cap.supportsMultiShot!==true||cap.maxShots==null||input.shots.length>cap.maxShots)reject("SHOTS_UNSUPPORTED","分镜能力或数量限制未满足","shots");
    if(input.durationSeconds<0||Math.abs(input.shots.reduce((n,shot)=>n+shot.durationSeconds,0)-input.durationSeconds)>0.001)reject("SHOT_DURATION_MISMATCH","分镜时长之和必须等于本次视频时长","shots");
  }
  const providerOptions:Record<string,unknown>={},omittedProviderOptions:string[]=[];
  for(const key of Object.keys(input.providerOptions||{}))if(!cap.providerOptions?.[key])reject("UNKNOWN_PROVIDER_OPTION",`模型未声明参数${key}`,"providerOptions");
  for(const [key,option] of Object.entries(cap.providerOptions||{})){
    const supplied=Object.prototype.hasOwnProperty.call(input.providerOptions||{},key);
    if(option.send==="omit"){if(supplied)omittedProviderOptions.push(key);continue;}
    const value=supplied?input.providerOptions![key]:option.defaultValue;
    if(value===undefined||value===null&&!supplied)continue;
    const valid=option.type==="boolean"?typeof value==="boolean":option.type==="integer"?Number.isInteger(value):option.type==="number"?typeof value==="number"&&Number.isFinite(value):option.type==="string"?typeof value==="string":option.values?.includes(value as never);
    if(!valid||typeof value==="number"&&(option.minimum!==undefined&&value<option.minimum||option.maximum!==undefined&&value>option.maximum))reject("INVALID_PROVIDER_OPTION",`参数${key}类型或范围不合法`,"providerOptions");
    providerOptions[key]=value;
  }
  return {...input,mode,references:refs,providerOptions,omittedProviderOptions};
}
