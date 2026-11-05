import type {PublicQuote} from "../billing/client";
import type {CanvasVideoNode} from "../canvas/video-node-schema";
import type {VideoNodeDraft} from "./canvas-draft";
import {generateCanvasVideoBatch,hasCanvasVideoBatch} from "./canvas-batch-client";
import {readVideoReceipt,prepareVideoReceipt,saveVideoReceipt,clearVideoReceipt} from "./canvas-receipts";

type Scope={assertCurrent:()=>void;isCurrent:()=>boolean};
type Ports={
  storage:Pick<Storage,"getItem"|"setItem"|"removeItem">;
  request:(url:string,init?:RequestInit)=>Promise<Response>;
  submit:Parameters<typeof generateCanvasVideoBatch>[0]["submit"];
  node:(id:string)=>CanvasVideoNode|undefined;
  save:(id:string,draft:VideoNodeDraft)=>Promise<CanvasVideoNode>;
  refreshNodes:()=>Promise<unknown>;refreshTasks:()=>Promise<unknown>;refreshCredits:()=>Promise<unknown>;
};
const content=(node:Pick<CanvasVideoNode,"title"|"config"|"inputs">)=>JSON.stringify({title:node.title,config:node.config,inputs:node.inputs});
async function json(response:Response){
  try{return await response.json();}catch{throw new Error("视频提交尚未核实，请查看原任务");}
}

/** Canvas video intent composition only. The node document owns save/undo;
 * existing receipts, batch client, billing and durable tasks keep their state.
 * A later explicit retry first reads the original operation. This function
 * never schedules an automatic POST retry or invents a new recovery identity. */
export async function generateCanvasVideo(input:{email:string;nodeId:string;draft:VideoNodeDraft;quote:PublicQuote|null;count?:number;onPersisted?:(revision:number)=>void},scope:Scope,ports:Ports):Promise<void>{
  scope.assertCurrent();
  const {email,nodeId:id,draft,quote,count=1,onPersisted}=input,{storage,request,node,save}=ports;
  const submit:Ports["submit"]=(url,init,quote,onIdentity)=>{
    scope.assertCurrent();
    return ports.submit(url,init,quote,id=>{scope.assertCurrent();onIdentity(id);});
  };
  let previous=readVideoReceipt(storage,email,id);
  if(previous){
    const response=await request(previous.taskId?`/api/video/tasks?id=${encodeURIComponent(previous.taskId)}`:`/api/video/tasks?idempotencyKey=${encodeURIComponent(previous.idempotencyKey)}`),data=await json(response);
    scope.assertCurrent();
    if(response.ok&&data.task){
      if(!["completed","failed","cancelled"].includes(data.task.status)){
        await ports.refreshNodes();scope.assertCurrent();await ports.refreshTasks();
        throw new Error("上次视频任务仍在执行，设置尚未提交");
      }
      clearVideoReceipt(storage,email,id,previous.idempotencyKey);previous=null;
    }else if(response.status!==404)throw new Error(data.error||"上次视频提交尚未核实");
    else if(previous.expectedRevision!==draft.expectedRevision)throw new Error("上次提交尚未核实，节点已更新，请先查看任务历史");
    else {const current=node(id);if(!current||content(current)!==content(draft))throw new Error("上次提交尚未核实，请先恢复原设置或查看任务历史");}
  }
  if(count>1||hasCanvasVideoBatch(storage,email,id)){
    if(previous)throw new Error("上次单个视频提交尚未核实，请先查看任务历史");
    try{
      const run=await generateCanvasVideoBatch({email,nodeId:id,draft,count,quote,storage,request,submit,
        save:()=>save(id,draft),onPersisted:revision=>onPersisted?.(revision),assertCurrent:scope.assertCurrent});
      const failures=run.nodes.filter(node=>["blocked","needs_confirmation","needs_attention","cancelled"].includes(node.status));
      if(failures.length)throw new Error(`批次已保留，${failures.length}/${run.nodes.length} 个任务需要处理：${failures[0].error||"请查看视频历史"}`);
    }finally{if(scope.isCurrent())await Promise.allSettled([ports.refreshNodes(),ports.refreshTasks(),ports.refreshCredits()]);}
    return;
  }
  scope.assertCurrent();
  const saved=previous&&previous.expectedRevision===draft.expectedRevision?node(id):await save(id,draft);
  scope.assertCurrent();if(!saved)throw new Error("视频节点不存在");
  if(!previous)onPersisted?.(saved.revision);
  let receipt=prepareVideoReceipt(storage,email,saved);
  const init={method:"POST",headers:{"content-type":"application/json","x-naumi-canvas":"1","x-naumi-billing-operation-id":receipt.idempotencyKey},body:JSON.stringify({expectedRevision:receipt.expectedRevision,idempotencyKey:receipt.idempotencyKey})};
  const url=`/api/canvas/video-nodes/${encodeURIComponent(id)}/generate`;
  const response=saved.config.comfyWorkflowId?await request(url,init):await submit(url,init,quote,actualId=>{receipt={...receipt,idempotencyKey:actualId};saveVideoReceipt(storage,email,receipt);});
  const data=await json(response);
  if(!response.ok){
    if(response.status<500&&!["OPERATION_PENDING","OPERATION_CONFLICT"].includes(data?.code))clearVideoReceipt(storage,email,id,receipt.idempotencyKey);
    throw new Error(data?.error||"视频提交失败，请核查任务后重试");
  }
  if(typeof data?.taskId!=="string"||!data.taskId.trim())throw new Error("视频提交尚未核实，请查看原任务");
  // Persist an accepted receipt even after navigation; never update another
  // view, and never discard the original task because its panel unmounted.
  saveVideoReceipt(storage,email,{...receipt,taskId:data.taskId});
  scope.assertCurrent();await ports.refreshNodes();scope.assertCurrent();await ports.refreshTasks();scope.assertCurrent();await ports.refreshCredits();
}
