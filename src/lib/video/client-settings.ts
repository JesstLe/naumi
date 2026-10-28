import type {CanvasVideoNode} from "../canvas/video-node-schema";
import type {VideoModelCapability} from "./capabilities";
import type {ResolvedVideoCapability,VideoMode} from "./capability-schema";
import type {OrderedInput} from "./references";
import type {VideoReference} from "./types";
import {normalizeVideoInput} from "./contract";
import {compileVideoPrompt} from "./prompt";
import {videoByocOverridesSchema} from "./byoc-settings";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {compileVideoCamera} from "./camera";
import {videoParameterScope} from "./parameter-options";
import {previewVisualInputs} from "../canvas/visual-references";

export type VideoNodeConfig=CanvasVideoNode["config"];
export type VideoCatalogModel=VideoModelCapability&{isDefault?:boolean};
export type VideoInputChoice={id:string;nodeId:string;kind:OrderedInput["kind"];title:string;value:string;thumbnail?:string;available:boolean;category?:"character"|"scene";referenceArtworkIds?:readonly string[]};
export function resolveVideoTextInputs(inputs:readonly OrderedInput[],choices:readonly VideoInputChoice[]):OrderedInput[]{
  return inputs.map(input=>{
    if(input.kind!=="text"||input.nodeId.startsWith("inline:"))return input;
    const sourceId=input.nodeId.replace(/^text:/,""),source=choices.find(choice=>choice.kind==="text"&&choice.nodeId.replace(/^text:/,"")===sourceId&&choice.available);
    return source&&source.value!==input.value?{...input,value:source.value}:input;
  });
}
export const VIDEO_MODE_LABELS:Record<VideoMode,string>={text:"文生视频",single_image:"单图生视频",frames_required:"首尾帧必填",first_optional:"首帧可选",last_optional:"尾帧可选",reference:"混合参考",video_edit:"编辑视频",extend:"续写视频",motion_control:"运动控制",lip_sync:"口型同步"};
export const VIDEO_ROLE_LABELS:Record<OrderedInput["role"],string>={context:"参考文字",author:"描述来源",first_frame:"首帧",last_frame:"尾帧",reference:"参考",element:"元素",source_video:"来源视频",source_audio:"来源音频"};
export const VIDEO_KIND_LABELS={text:"文字",image:"图片",video:"视频",audio:"音频"};
export function selectedVideoCatalogModel(models:VideoCatalogModel[],config:VideoNodeConfig){
  const exact=models.find(model=>model.modelId===config.modelId&&model.providerId===config.providerId);
  if(exact)return exact;
  // A public managed model has a stable ID; older nodes may omit its UI provider alias.
  const managed=models.filter(model=>model.providerId==="managed-video"&&model.modelId===config.modelId);
  return managed.length===1?managed[0]:undefined;
}
export function catalogCapability(model?:VideoCatalogModel):ResolvedVideoCapability{return model?.definition||{sources:{}};}
export function videoDurations(cap:ResolvedVideoCapability,mode?:VideoMode){return Array.from(new Set((videoParameterScope(cap,mode).durationResolutionMap||[]).flatMap(map=>map.durations)));}
export function videoResolutions(cap:ResolvedVideoCapability,duration?:number,mode?:VideoMode){return Array.from(new Set((videoParameterScope(cap,mode).durationResolutionMap||[]).filter(map=>duration!==undefined&&map.durations.includes(duration)).flatMap(map=>map.resolutions)));}
export function videoAspectRatios(cap:ResolvedVideoCapability,mode?:VideoMode,resolution?:string){return videoParameterScope(cap,mode,resolution).aspectRatios||[];}
/** Defaults apply only to an explicit new node; an existing selection is never replaced. */
export function videoNodeCreationDefaults(catalog:{models:readonly VideoCatalogModel[];loading:boolean;error:string}){
  if(catalog.loading||catalog.error)return undefined;
  const model=catalog.models.find(item=>item.isDefault)||catalog.models[0];
  if(!model?.modelId?.trim()||!model.providerId?.trim())return undefined;
  const cap=catalogCapability(model),config=reconcileVideoSettings({modelId:model.modelId,providerId:model.providerId,prompt:""},cap).config;
  const duration=config.durationSeconds;
  if(!config.mode||!config.resolution||!config.aspectRatio||duration===undefined||
    (duration===-1?cap.supportsAutoDuration!==true:!Number.isInteger(duration)||duration<=0||duration>3600))return undefined;
  return {model,config};
}
export function videoModeRoles(inputs:readonly OrderedInput[],mode?:VideoMode):OrderedInput[]{
  const count=inputs.filter(input=>input.kind==="image").length;let image=0;
  return inputs.map(input=>{
    if(input.kind==="text")return {...input};
    if(input.kind!=="image")return {...input};
    image++;
    const frames=mode&&["single_image","frames_required","first_optional","last_optional"].includes(mode);
    return {...input,role:frames?(mode==="first_optional"&&count===1?"last_frame":image===1?"first_frame":"last_frame"):["first_frame","last_frame"].includes(input.role)?"reference":input.role};
  });
}
/** Called only after an explicit model/duration change; the returned notices are shown before submission. */
export function reconcileVideoSettings(config:VideoNodeConfig,cap:ResolvedVideoCapability):{config:VideoNodeConfig;changes:string[]}{
  const next={...config,providerOptions:{...config.providerOptions}},changes:string[]=[];
  const modes=cap.modes||[];
  if(next.mode&&!modes.includes(next.mode)||!next.mode){const value=modes[0];if(next.mode!==value)changes.push("生成模式");next.mode=value;}
  const durations=videoDurations(cap,next.mode);
  if(next.durationSeconds===undefined||!durations.includes(next.durationSeconds)){
    const value=cap.defaultDurationSeconds!=null&&durations.includes(cap.defaultDurationSeconds)?cap.defaultDurationSeconds:durations[0];
    if(next.durationSeconds!==value)changes.push("时长");next.durationSeconds=value;
  }
  const resolutions=videoResolutions(cap,next.durationSeconds,next.mode);
  if(!next.resolution||!resolutions.includes(next.resolution)){
    const value=cap.defaultResolution&&resolutions.includes(cap.defaultResolution)?cap.defaultResolution:resolutions[0];
    if(next.resolution!==value)changes.push("分辨率");next.resolution=value;
  }
  const ratios=videoAspectRatios(cap,next.mode,next.resolution);
  if(next.aspectRatio&&!ratios.includes(next.aspectRatio)||!next.aspectRatio){const value=cap.defaultAspectRatio&&ratios.includes(cap.defaultAspectRatio)?cap.defaultAspectRatio:ratios[0];if(next.aspectRatio!==value)changes.push("画幅");next.aspectRatio=value;}
  for(const [field,allowed] of [["negativePrompt",cap.supportsNegativePrompt===true],["watermark",cap.supportsWatermark===true],["shots",cap.supportsMultiShot===true],["elements",cap.supportsElements===true],["camera",cap.supportsCamera===true],["width",cap.supportsExactSize===true],["height",cap.supportsExactSize===true]] as const){
    if(!allowed&&next[field]!==undefined){delete next[field];changes.push({negativePrompt:"负面提示词",watermark:"水印",shots:"分镜",elements:"元素",camera:"摄影设置",width:"宽度",height:"高度"}[field]);}
  }
  if(cap.audio==="required")next.generateAudio=true;
  else if(cap.audio==="disabled")next.generateAudio=false;
  else if(cap.audio==null)delete next.generateAudio;
  for(const key of Object.keys(next.providerOptions||{}))if(!cap.providerOptions?.[key]||cap.providerOptions[key].send==="omit"){delete next.providerOptions![key];changes.push(`参数 ${key}`);}
  return {config:next,changes};
}
export function inputReference(input:OrderedInput):VideoReference|null{
  if(input.kind==="text")return null;
  return {id:input.id,kind:input.kind,role:input.role as VideoReference["role"],artworkId:input.nodeId.replace(/^(image|video|audio):/,""),url:input.value};
}
export function validateVideoSettings(config:VideoNodeConfig,inputs:OrderedInput[],cap:ResolvedVideoCapability,choices:readonly VideoInputChoice[]=[]){
  try{
    const preview=previewVisualInputs(inputs,config.prompt||"",choices);
    if(config.comfyWorkflowId){
      videoByocOverridesSchema.parse(config.comfyOverrides||{});
      if(config.comfyInputs)videoWorkflowManifestSchema.shape.inputs.parse(config.comfyInputs);
      for(const fields of Object.values(config.comfyOverrides?.numerics||{}))for(const value of Object.values(fields))if(!Number.isInteger(value)||value<=0)throw new Error("工作流数值需为正整数");
      if(inputs.some(input=>choices.find(choice=>choice.nodeId===input.nodeId)?.available===false))throw new Error("前序素材尚未完成");
      compileVideoPrompt(preview.prompt,preview.inputs);return null;
    }
    if(!config.modelId)throw new Error("请选择视频模型");
    if(inputs.some(input=>{const choice=choices.find(item=>item.nodeId===input.nodeId);return choice&& !choice.available;}))throw new Error("前序素材尚未完成");
    if(config.camera&&cap.supportsCamera!==true)throw new Error("摄影设置能力未配置或已禁用");
    const references=preview.inputs.length?preview.inputs.flatMap(input=>{const ref=inputReference(input);return ref?[ref]:[];}):config.references||[];
    normalizeVideoInput({...config,prompt:preview.prompt,references,orderedInputs:preview.inputs.length?preview.inputs:undefined},cap);
    compileVideoPrompt(preview.prompt,preview.inputs,compileVideoCamera(config.camera));
    return null;
  }catch(error){return error instanceof Error?error.message:"视频参数无效";}
}
