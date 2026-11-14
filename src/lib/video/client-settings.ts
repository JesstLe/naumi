import type {CanvasVideoNode} from "../canvas/video-node-schema";
import type {VideoModelCapability} from "./capabilities";
import type {ResolvedVideoCapability,VideoMode} from "./capability-schema";
import type {OrderedInput} from "./references";
import type {VideoReference} from "./types";
import {compileVideoPrompt} from "./prompt";
import {videoByocOverridesSchema} from "./byoc-settings";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {compileVideoCamera} from "./camera";
import {previewCanvasInputs} from "../canvas/input-preview";
import type {VideoUiContract} from './ui-contract';
import {videoUiCreationDefaults,videoUiDraft} from './ui-draft';

export type VideoNodeConfig=CanvasVideoNode["config"];
export type VideoCatalogModel=VideoModelCapability&{isDefault?:boolean};
import type {VideoInputChoice} from "./input-choice";
export type {VideoInputChoice} from "./input-choice";
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
/** Defaults apply only to an explicit new node; an existing selection is never replaced. */
export function videoNodeCreationDefaults(catalog:{models:readonly VideoCatalogModel[];loading:boolean;error:string}){
  if(catalog.loading||catalog.error)return undefined;
  const model=catalog.models.find(item=>item.isDefault)||catalog.models[0];
  if(!model?.modelId?.trim()||!model.providerId?.trim())return undefined;
  return {model,config:videoUiCreationDefaults(model)};
}
export function inputReference(input:OrderedInput):VideoReference|null{
  if(input.kind==="text")return null;
  return {id:input.id,kind:input.kind,role:input.role as VideoReference["role"],artworkId:input.nodeId.replace(/^(image|video|audio):/,""),url:input.value};
}
export function validateVideoSettings(config:VideoNodeConfig,inputs:OrderedInput[],_cap:ResolvedVideoCapability,choices:readonly VideoInputChoice[]=[],_execution?:VideoUiContract){
  try{
    const preview=previewCanvasInputs(inputs,config.prompt||"",choices);
    if(config.comfyWorkflowId){
      videoByocOverridesSchema.parse(config.comfyOverrides||{});
      if(config.comfyInputs)videoWorkflowManifestSchema.shape.inputs.parse(config.comfyInputs);
      for(const fields of Object.values(config.comfyOverrides?.numerics||{}))for(const value of Object.values(fields))if(!Number.isInteger(value)||value<=0)throw new Error("工作流数值需为正整数");
      if(inputs.some(input=>choices.find(choice=>choice.nodeId===input.nodeId)?.available===false))throw new Error("前序素材尚未完成");
      compileVideoPrompt(preview.prompt,preview.inputs);return null;
    }
    if(!config.modelId)throw new Error("请选择视频模型");
    if(inputs.some(input=>{const choice=choices.find(item=>item.nodeId===input.nodeId);return choice&& !choice.available;}))throw new Error("前序素材尚未完成");
    // Client checks structure/dependency availability only. The shared server
    // preview owns all binding/intent/parameter/protocol decisions, including
    // an accurately reported missing mapping. Never inspect descriptive limits.
    videoUiDraft(config,preview.inputs);
    compileVideoPrompt(preview.prompt,preview.inputs,compileVideoCamera(config.camera));
    return null;
  }catch(error){return error instanceof Error?error.message:"视频参数无效";}
}
