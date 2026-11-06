"use client";
import {useEffect,useRef,useState} from "react";
import {clientIntentKey} from "./billing/client-intent";
import {readCanvasGenerationReceipt} from "./canvas/generation-receipt";
import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from "./saas/workspace-client";
import {authHeader} from "./supabase";
import {validToolImages} from "./tool-ui";
import {TOOL_RECEIPT_PREFIX} from "./tool-generation-receipt-keys";

type Tool = "fusion" | "variation";
type Receipt = {version:1;owner:string;workspace:string;tool:Tool;key:string;jobId:string;acceptedAt:number};
type Result = {images:import("@/app/api/generate-image/route").GeneratedImage[];user?:unknown;error?:string};
type Options = {tool:Tool;owner?:string;modelId?:string;draftKey:string;restoreDraftKey:string;canRestore:boolean;locale:string;onBusy:(busy:boolean)=>void;onError:(message:string|null)=>void;onResult:(result:Result)=>void;onReset:()=>void};
const memory = new Map<string,Receipt>();
const pointers = new Map<string,string>();
const latestMemory = new Map<string,string>();
const prefix = TOOL_RECEIPT_PREFIX;
const latestKey = (owner:string,workspace:string,tool:Tool) => prefix+"latest:"+JSON.stringify([owner,workspace,tool]);
function valid(value:unknown):value is Receipt {
  const r=value as Receipt;
  return !!r&&r.version===1&&typeof r.owner==="string"&&typeof r.workspace==="string"&&["fusion","variation"].includes(r.tool)&&
    typeof r.key==="string"&&r.key.startsWith(prefix+"input:")&&typeof r.jobId==="string"&&/^(?:job|imagegen)-[a-zA-Z0-9-]{1,160}$/.test(r.jobId)&&Number.isFinite(r.acceptedAt);
}
function load(key:string,owner:string,workspace:string,tool:Tool):Receipt|undefined {
  let jobId=pointers.get(key);
  try{jobId=localStorage.getItem(key)||jobId;}catch{}
  if(!jobId)return;
  const leaf=key+":job:"+jobId;
  let receipt=memory.get(leaf);
  try{const raw=localStorage.getItem(leaf);if(raw){const value:unknown=JSON.parse(raw);if(valid(value))receipt=value;}}catch{/* Memory retains this tab's accepted receipt. */}
  return receipt&&receipt.key===key&&receipt.owner===owner&&receipt.workspace===workspace&&receipt.tool===tool?receipt:undefined;
}
function save(receipt:Receipt){
  const leaf=receipt.key+":job:"+receipt.jobId;
  memory.set(leaf,receipt);pointers.set(receipt.key,receipt.jobId);
  const index=latestKey(receipt.owner,receipt.workspace,receipt.tool);latestMemory.set(index,receipt.key);
  try{localStorage.setItem(leaf,JSON.stringify(receipt));localStorage.setItem(receipt.key,receipt.jobId);localStorage.setItem(index,receipt.key);}catch{/* Private mode still retains the in-memory receipt. */}
}
function latest(owner:string,workspace:string,tool:Tool){
  const index=latestKey(owner,workspace,tool);let key=latestMemory.get(index);
  try{key=localStorage.getItem(index)||key;}catch{}
  return key?load(key,owner,workspace,tool):undefined;
}
function clear(receipt:Receipt){
  // Delete this immutable job leaf and the pointer only while it still names this
  // job. A concurrent tab may already point the same input to a newer accepted
  // job; never erase that pointer or its receipt.
  const leaf=receipt.key+":job:"+receipt.jobId;
  memory.delete(leaf);
  if(pointers.get(receipt.key)===receipt.jobId)pointers.delete(receipt.key);
  try{
    localStorage.removeItem(leaf);
    // The pointer only names this job's leaf; drop it unless another tab re-pointed it.
    if(localStorage.getItem(receipt.key)===receipt.jobId)localStorage.removeItem(receipt.key);
  }catch{}
}
const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,2500));

/** Accepted work has its own small receipt, independent of the billing POST
 * intent cache. Only original-job GETs run after acceptance or page restoration. */
export function useToolGenerationReceipt(options:Options){
  const current=useRef(options);current.current=options;
  const mounted=useRef(true),epoch=useRef(0),active=useRef<Promise<void>|null>(null);
  const [workspaceRevision,setWorkspaceRevision]=useState(currentWorkspaceRevision());
  useEffect(()=>{mounted.current=true;const changed=()=>{epoch.current++;active.current=null;current.current.onBusy(false);setWorkspaceRevision(currentWorkspaceRevision());};window.addEventListener(WORKSPACE_SELECTION,changed);return()=>{mounted.current=false;epoch.current++;window.removeEventListener(WORKSPACE_SELECTION,changed);};},[]);
  function capture(restoring=false){
    const owner=(current.current.owner||"").toLowerCase(),workspace=currentWorkspace(),revision=currentWorkspaceRevision(),draft=restoring?current.current.restoreDraftKey:current.current.draftKey,model=current.current.modelId,token=++epoch.current;
    const sameContext=()=>mounted.current&&epoch.current===token&&(current.current.owner||"").toLowerCase()===owner&&currentWorkspace()===workspace&&currentWorkspaceRevision()===revision;
    return {owner,workspace,revision,tool:current.current.tool,sameContext,
      valid:()=>sameContext()&&(restoring?current.current.canRestore&&current.current.restoreDraftKey===draft:current.current.draftKey===draft&&current.current.modelId===model)};
  }
  const message=(zh:string,en:string)=>current.current.locale==="en"?en:zh;
  async function poll(receipt:Receipt,guard:ReturnType<typeof capture>){
    const deadline=Date.now()+6*60_000;
    while(guard.valid()&&Date.now()<deadline){
      let read:Awaited<ReturnType<typeof readCanvasGenerationReceipt>>=null;
      try{
        const headers=new Headers(await authHeader());if(!guard.valid())return;
        headers.set("x-naumi-workspace",receipt.workspace);
        read=await readCanvasGenerationReceipt(receipt.jobId,headers);
      }catch{/* HTML, interrupted response bodies and transport failures retain acceptance. */}
      if(!guard.valid())return;
      if(read?.response.ok){
        const data=read.data;
        if(data.status==="done"&&validToolImages(data.images)){
          clear(receipt);current.current.onError(null);current.current.onResult(data as Result);return;
        }
        if(data.status==="error"){
          // Missing/unknown receipts are not proof that the accepted task failed.
          if(data.reviewRequired||data.operationStatus==="needs_attention"||data.code==="JOB_NOT_FOUND"||data.error==="任务不存在或已过期，请重试"){
            current.current.onError(message("原任务状态待核对，已保留任务编号；再次点击只查询原任务。","The original task is awaiting confirmation. Click again to check that task, not create another."));return;
          }
          clear(receipt);current.current.onError(typeof data.error==="string"?data.error:message("原任务已失败。","The original task failed."));return;
        }
      }
      await delay();
    }
    if(guard.valid())current.current.onError(message("原任务仍在处理或暂时读不到结果，已保留任务编号；再次点击只查询原任务，不会重新生成。","The original task is still processing or its receipt is temporarily unavailable. Click again to check it without generating again."));
  }
  function launch(action:(guard:ReturnType<typeof capture>)=>Promise<void>,restoring=false){
    if(active.current)return active.current;
    const guard=capture(restoring);current.current.onError(null);current.current.onBusy(true);
    const promise=action(guard).catch(error=>{if(guard.valid())current.current.onError(error instanceof Error?error.message:message("任务读取失败，请查询原任务。","Could not read the original task."));}).finally(()=>{
      if(active.current===promise)active.current=null;
      if(guard.sameContext())current.current.onBusy(false);
    });
    active.current=promise;return promise;
  }
  useEffect(()=>{
    epoch.current++;active.current=null;current.current.onBusy(false);current.current.onError(null);current.current.onReset();
    const owner=(options.owner||"").toLowerCase();if(!owner)return;
    if(new URLSearchParams(window.location.search).has("view"))return;
    const receipt=latest(owner,currentWorkspace(),options.tool);
    if(receipt&&current.current.canRestore)void launch(guard=>poll(receipt,guard),true);
    return()=>{epoch.current++;active.current=null;};
  },[options.owner,options.tool,workspaceRevision]);
  return {
    submit:(form:FormData,submit:(headers:Headers)=>Promise<Response>,beforeNew:()=>void)=>launch(async guard=>{
      if(!guard.owner)return;
      const headers=new Headers(await authHeader());if(!guard.valid())return;
      headers.set("x-naumi-workspace",guard.workspace);
      // These two endpoints submit composed image prompts, not a text-model task.
      headers.delete("x-naumi-text-model");
      const model=current.current.modelId;if(model)headers.set("x-naumi-feature-model",model);
      // Fingerprint actual form quality, not an unrelated stale global preference.
      const quality=form.get("quality");if(typeof quality==="string")headers.set("x-naumi-image-quality",quality);
      const digest=await clientIntentKey(guard.owner,`/api/generate-image#${guard.tool}:${guard.workspace}`,{method:"POST",headers,body:form});
      if(!guard.valid())return;
      const key=prefix+"input:"+digest.slice(digest.lastIndexOf(":")+1);
      const previous=load(key,guard.owner,guard.workspace,guard.tool);
      if(previous)return poll(previous,guard);
      beforeNew();if(!guard.valid())return;
      const response=await submit(headers);
      let body:any;try{body=await response.json();}catch{throw new Error(message("任务提交回执暂不可读，请保留当前输入查询，勿重复创建。","The submission receipt is unreadable. Keep the current input and check the original operation."));}
      if(!response.ok)throw new Error(body?.error||message("任务提交失败。","Submission failed."));
      const receipt:Receipt={version:1,owner:guard.owner,workspace:guard.workspace,tool:guard.tool,key,jobId:body?.jobId,acceptedAt:Date.now()};
      if(!valid(receipt))throw new Error(message("任务回执缺少编号，请核对原操作，不要重复创建。","The receipt has no task ID. Check the original operation before creating another."));
      // A scope switch after POST must not lose its original accepted identity.
      save(receipt);
      if(guard.valid())await poll(receipt,guard);
    }),
  };
}
