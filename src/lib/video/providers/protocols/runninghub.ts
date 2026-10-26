import {createdResult,field,mediaUrl,polled,rejectAdvanced,string,unsupportedWire} from "../wire-helpers";
import type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "../wire-contracts";
import {compileWorkflowInputs} from "./workflow-inputs";
import {TransientPollError} from "../../types";
export function buildRunningHubCreate(context:VideoWireContext):VideoWireRequest{
  rejectAdvanced(context);const {manifest,body}=compileWorkflowInputs(context),id=manifest.workflowId||context.provider.workflowId||context.request.modelId;
  if(!id)unsupportedWire(context,"缺少RunningHub工作流ID");
  const nodeInfoList=Object.entries(body).flatMap(([nodeId,node])=>{
    if(!node||typeof node!=="object"||Array.isArray(node))unsupportedWire(context,"RunningHub节点映射无效");
    const value=node as Record<string,unknown>,inputs=value.inputs&&typeof value.inputs==="object"&&!Array.isArray(value.inputs)?value.inputs as Record<string,unknown>:value;
    return Object.entries(inputs).map(([fieldName,fieldValue])=>({nodeId,fieldName,fieldValue}));
  });
  return {path:"/task/openapi/create",method:"POST",encoding:"json",body:{apiKey:context.provider.apiKey,workflowId:id,nodeInfoList}};
}
export function decodeRunningHubCreated(payload:unknown){
  if(Number(field(payload,"code"))!==0)throw new Error("RunningHub任务创建未确认成功");
  return createdResult(payload,field(payload,"data.taskId"));
}
export function buildRunningHubPoll(context:VideoWireContext,id:string):VideoWireRequest{return {path:"/task/openapi/outputs",method:"POST",encoding:"json",body:{apiKey:context.provider.apiKey,taskId:id}};}
export function decodeRunningHubPoll(payload:unknown){
  const code=Number(field(payload,"code"));
  if([804,813].includes(code))return polled(payload,{status:"processing"});
  if([805,806].includes(code))return polled(payload,{status:"failed",error:field(payload,"msg"),code});
  if(code!==0)throw new TransientPollError("RunningHub状态未知或暂时不可用");
  const list=field(payload,"data");
  if(!Array.isArray(list))throw new TransientPollError("RunningHub输出不是数组");
  if(!list.length)return polled(payload,{status:"processing"});
  const outputs=list.map(item=>{const type=string(field(item,"fileType")).toLowerCase(),kind=["mp4","webm","mov","mkv"].includes(type)?"video" as const:["mp3","wav","aac","m4a","ogg"].includes(type)?"audio" as const:["png","jpg","jpeg","webp","gif"].includes(type)?"image" as const:undefined;return {kind,url:mediaUrl(field(item,"fileUrl"))};});
  if(outputs.some(item=>!item.kind||!item.url))throw new TransientPollError("RunningHub返回未识别的产物");
  return {...polled(payload,{status:"completed",url:outputs.find(item=>item.kind==="video")?.url}),resultAssets:outputs.map(item=>({kind:item.kind!,url:item.url!}))};
}
export const runningHubCodec:VideoWireCodec={create:buildRunningHubCreate,poll:buildRunningHubPoll,created:decodeRunningHubCreated,polled:decodeRunningHubPoll};
