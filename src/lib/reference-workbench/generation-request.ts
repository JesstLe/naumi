import {frameRatio} from "../imagegen/frame-ratio";
import type {ImagegenRequest} from "../imagegen/types";
import {stableId,WorkbenchError,type Asset,type Settings} from "./contract";

export type WorkbenchImageTask={key:string;prompt:string;settings:Settings;inputs:Asset[];geometry?:{width:number;height:number};source?:string};
/** Describe the workbench's frame intent; the shared image planner owns actual
 * channel/size mapping, including published automatic-frame policies. */
export function workbenchImageRequest(task:WorkbenchImageTask,id:string):ImagegenRequest {
 const mode=task.settings.ratio_mode;
 // Smart chat plans already carry their chosen composition ratio. A project
 // card, unlike a chat plan, carries the reference geometry explicitly.
 const explicit=task.settings.ratio!=="auto"&&(mode==="manual"||mode==="smart"&&!task.geometry&&!task.source);
 const source=explicit?undefined:mode==="product"?task.inputs[0]:task.source?task.inputs.find(a=>a.artworkId===task.source):task.inputs.at(-1);
 const geometry=explicit?undefined:mode==="product"||task.source?source:task.geometry||source;
 const target=explicit?task.settings.ratio:frameRatio(geometry)||(!task.inputs.length?task.settings.ratio||"auto":undefined);
 if(!explicit&&!target)throw new WorkbenchError("参考图片尺寸无效，请重新读取图片");
 return {version:1,augment:false,operationId:stableId(id,task.key),entry:"workbench",mode:task.source?"edit":"generate",prompt:task.prompt,modelId:task.settings.modelId,
  inputs:task.inputs.map((a,i)=>({artworkId:a.artworkId,role:task.source&&i===0?"edit-target":"reference"})),
  ...(!explicit&&source?{frameSourceId:source.artworkId,ratioMode:"automatic" as const}:{}),
  parameters:{quality:task.settings.quality as ImagegenRequest["parameters"]["quality"],resolution:task.settings.resolution.toUpperCase() as ImagegenRequest["parameters"]["resolution"],ratio:target||task.settings.ratio||"1:1"},output:{format:"png"},variants:1};
}
