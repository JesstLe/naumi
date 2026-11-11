import {createdResult,field,mediaUrl,polled,rejectAdvanced,string,unsupportedWire} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {compileWorkflowInputs} from "./workflow-inputs";
import {TransientPollError} from "../../types";
// Manifest stores the inspected InputRules mapping without later silent clamping.
export function buildAutoDLCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const {manifest,body}=compileWorkflowInputs(context),id=manifest.workflowId||context.provider.workflowId||context.request.modelId;
  if(!id)unsupportedWire(context,"缺少AutoDL工作流ID");
  return {path:`/api/v1/comfyui/comfyui_workflow/${encodeURIComponent(id)}`,method:"POST",encoding:"json",body};
}
export function decodeAutoDLCreated(payload:unknown){
  if(string(field(payload,"code")).toLowerCase()!=="success")throw new Error("AutoDL创建结果未确认成功");
  return createdResult(payload,field(payload,"data.task_id"),field(payload,"data.status"));
}
export function buildAutoDLPoll(_context:VideoWireContext,id:string):VideoWireRequest{return {path:`/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(id)}`,method:"GET",encoding:"none"};}
export function decodeAutoDLPoll(payload:unknown){
  if(string(field(payload,"code")).toLowerCase()!=="success")throw new TransientPollError("AutoDL查询响应未确认成功");
  const list=field(payload,"data.results"),outputs=Array.isArray(list)?list.filter(item=>["video","audio","image"].includes(string(field(item,"type")))&&(!field(item,"output_type")||field(item,"output_type")==="output")).map(item=>({kind:string(field(item,"type")) as "video"|"audio"|"image",url:mediaUrl(field(item,"url"))})):[];
  if(outputs.some(item=>!item.url))throw new TransientPollError("AutoDL输出地址无效");
  const video=outputs.find(item=>item.kind==="video");
  return {...polled(payload,{status:field(payload,"data.status"),url:video?.url,error:field(payload,"data.message")}),
    ...(outputs.length?{resultAssets:outputs.map(item=>({...item,url:item.url!}))}:{})};
}
export const autoDLCodec:VideoWireCodec={create:buildAutoDLCreate,poll:buildAutoDLPoll,created:decodeAutoDLCreated,polled:decodeAutoDLPoll};
