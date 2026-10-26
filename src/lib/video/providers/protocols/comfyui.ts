import {createdResult,field,object,polled,rejectAdvanced,string,unsupportedWire} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {compileWorkflowInputs} from "./workflow-inputs";
import {TransientPollError} from "../../types";
export function buildComfyUICreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const {body}=compileWorkflowInputs(context);
  for(const node of Object.values(body)){if(typeof field(node,"class_type")!=="string"||!field(node,"inputs"))unsupportedWire(context,"需要API格式的ComfyUI节点图");}
  return {path:"/prompt",method:"POST",encoding:"json",body:{prompt:body,client_id:context.request.idempotencyKey}};
}
export function decodeComfyUICreated(payload:unknown){
  if(Object.keys(object(field(payload,"node_errors"))).length)throw new Error("ComfyUI节点校验错误，任务未确认接受");
  return createdResult(payload,field(payload,"prompt_id"));
}
export function buildComfyUIPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/history/${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
function outputKind(filename:string){const ext=filename.split(".").pop()?.toLowerCase();return ["mp4","webm","mov","mkv","ogv"].includes(ext||"")?"video" as const:["wav","mp3","aac","m4a","ogg","flac"].includes(ext||"")?"audio" as const:["png","jpg","jpeg","webp","gif","avif"].includes(ext||"")?"image" as const:undefined;}
export function decodeComfyUIPoll(payload:unknown,id?:string){
  if(!id)throw new TransientPollError("ComfyUI历史缺少冻结任务ID");
  if(!Object.keys(object(payload)).length)return polled(payload,{status:"processing"});
  const entry=object(object(payload)[id]),status=object(entry.status);
  if(!Object.keys(entry).length)throw new TransientPollError("ComfyUI历史与冻结任务ID不一致");
  if(status.status_str==="error")return polled(payload,{status:"failed",error:"ComfyUI工作流节点执行失败",code:"COMFY_NODE_ERROR"});
  if(status.completed!==true&&status.status_str!=="success")return polled(payload,{status:"processing"});
  const outputFiles:Array<{kind:"video"|"image"|"audio";filename:string;subfolder:string;type:string}>=[];
  for(const node of Object.values(object(entry.outputs)))for(const list of Object.values(object(node))){
    if(!Array.isArray(list))continue;
    for(const item of list){const filename=string(field(item,"filename")),kind=outputKind(filename);if(!filename||!kind)throw new TransientPollError("ComfyUI产物没有已声明的媒体类型");
      if(/[\\/\u0000]/.test(filename)||filename==="..")throw new TransientPollError("ComfyUI产物文件名无效");
      outputFiles.push({kind,filename,subfolder:string(field(item,"subfolder")),type:string(field(item,"type"))||"output"});}
  }
  if(!outputFiles.some(item=>item.kind==="video"))throw new TransientPollError("ComfyUI已完成但没有视频产物");
  return {...polled(payload,{status:"completed",allowContentEndpoint:true}),outputFiles};
}
export const comfyUICodec:VideoWireCodec={create:buildComfyUICreate,poll:buildComfyUIPoll,created:decodeComfyUICreated,polled:decodeComfyUIPoll};
