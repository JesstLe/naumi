import {z} from "zod";
import type {StoryboardDocument} from "./plan";

export const continuityBindingSchema=z.strictObject({
  identity:z.string().min(1).max(160),kind:z.enum(["character","scene"]),nodeId:z.string().min(1).max(80),variantId:z.string().min(1).max(40),
  revision:z.number().int().positive(),title:z.string().min(1).max(200),text:z.string().max(16384),artworkIds:z.array(z.string().min(1).max(160)).max(128),
});
export type ContinuityBinding=z.infer<typeof continuityBindingSchema>;
const stateSchema=z.strictObject({subject:z.string().trim().min(1).max(100),attribute:z.string().trim().min(1).max(100),value:z.string().trim().min(1).max(500)});
export const continuitySchema=z.strictObject({
  transition:z.enum(["cut","match","independent"]).default("cut"),
  bindings:z.array(continuityBindingSchema).max(64).default([]),before:z.array(stateSchema).max(100).default([]),after:z.array(stateSchema).max(100).default([]),
}).superRefine((value,ctx)=>{
  if(new Set(value.bindings.map(binding=>binding.identity)).size!==value.bindings.length)ctx.addIssue({code:"custom",message:"连续性引用重复"});
  for(const key of ["before","after"] as const)if(new Set(value[key].map(state=>`${state.subject}\0${state.attribute}`)).size!==value[key].length)ctx.addIssue({code:"custom",message:"同一主体属性不能同时填写多个状态"});
});
export const shotCutSchema=z.strictObject({inPoint:z.number().finite().min(0).max(3600).default(0),duration:z.number().finite().positive().max(3600).optional()});
export const storyboardAudioSchema=z.strictObject({id:z.string().min(1).max(80),artworkId:z.string().min(1).max(160),position:z.number().finite().min(0).max(36000),inPoint:z.number().finite().min(0).max(3600),duration:z.number().finite().positive().max(3600),gain:z.number().finite().min(0).max(4).default(1)});
export type ContinuityIssue={nodeId:string;kind:"changed"|"missing"|"state"|"dependency";message:string;relatedNodeId?:string};

export function inspectContinuity(document:StoryboardDocument,catalog:readonly ContinuityBinding[],dependencies:Record<string,string[]>={}):ContinuityIssue[]{
  const issues:ContinuityIssue[]=[],states=new Map<string,{value:string;nodeId:string}>();let scene="",previous:string|undefined;
  for(const shot of document.shots){const continuity=shot.continuity,currentScene=shot.scene||continuity?.bindings.find(binding=>binding.kind==="scene")?.identity||"";
    if(continuity?.transition==="independent"||scene&&currentScene&&scene!==currentScene)states.clear();scene=currentScene||scene;
    for(const binding of continuity?.bindings||[]){const latest=catalog.find(item=>item.identity===binding.identity);
      if(!latest)issues.push({nodeId:shot.nodeId,kind:"missing",message:`${binding.title} 已移除；当前方案保留原设定`});
      else if(latest.revision!==binding.revision)issues.push({nodeId:shot.nodeId,kind:"changed",message:`${binding.title} 已更新；本镜仍使用已选版本`});
    }
    if(continuity?.transition==="match"&&previous&&!dependencies[shot.nodeId]?.includes(previous))issues.push({nodeId:shot.nodeId,kind:"dependency",relatedNodeId:previous,message:"同机位衔接尚未引用前一镜的实际结果"});
    for(const state of continuity?.before||[]){const key=`${state.subject}\0${state.attribute}`,prior=states.get(key);if(prior&&prior.value!==state.value)issues.push({nodeId:shot.nodeId,kind:"state",relatedNodeId:prior.nodeId,message:`${state.subject} · ${state.attribute}：前镜为“${prior.value}”，本镜为“${state.value}”`});states.set(key,{value:state.value,nodeId:shot.nodeId});}
    for(const state of continuity?.after||[])states.set(`${state.subject}\0${state.attribute}`,{value:state.value,nodeId:shot.nodeId});previous=shot.nodeId;
  }
  return issues;
}
export function continuityPrompt(value:z.infer<typeof continuitySchema>|undefined){
  if(!value)return "";
  const describe=(states:typeof value.before)=>states.map(state=>`${state.subject} · ${state.attribute}：${state.value}`).join("；");
  return [value.transition==="match"?"镜头衔接：同机位连续动作":value.transition==="independent"?"镜头衔接：独立段落":"镜头衔接：硬切，保持已指定主体状态",value.before.length?`开始状态：${describe(value.before)}`:"",value.after.length?`结束状态：${describe(value.after)}`:""].filter(Boolean).join("\n");
}
