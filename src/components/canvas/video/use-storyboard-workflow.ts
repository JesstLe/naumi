"use client";
import type {StoryboardContext} from "@/lib/storyboard/review";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {storyboardIntent,storyboardRunActive,type StoryboardIntent,type StoryboardRun,type StoryboardSelection} from "@/lib/video/storyboard-client";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import type {VideoPrivateFetch} from "./use-video-nodes";

import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from "@/lib/saas/workspace-client";
const subscribeWorkspace=(changed:()=>void)=>{window.addEventListener(WORKSPACE_SELECTION,changed);return()=>window.removeEventListener(WORKSPACE_SELECTION,changed);};
type Saved={runId?:string;pending?:StoryboardIntent};
export function useStoryboardWorkflow({scope,projectKey,request,nodes,initialNodeIds,onChanged}:{scope:string;projectKey:string;request:VideoPrivateFetch;nodes:readonly CanvasVideoNode[];initialNodeIds:readonly string[];onChanged?:(run:StoryboardRun)=>void}){
  const [runs,setRuns]=useState<StoryboardRun[]>([]),[run,setRun]=useState<StoryboardRun|null>(null),[pending,setPending]=useState<StoryboardIntent|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const workspaceRevision=useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,()=>0),workspace=currentWorkspace();
  const key=`naumi:storyboard:v1:${JSON.stringify([scope,projectKey,workspace])}`;
  const state=useRef<{active:boolean;key:string;runId?:string;pending?:StoryboardIntent;mutating:boolean}>({active:false,key,mutating:false});
  const signatures=useRef(new Map<string,string>());
  const latest=useRef({request,nodes,initialNodeIds,onChanged});latest.current={request,nodes,initialNodeIds,onChanged};
  const persist=useCallback(()=>{const s=state.current;try{sessionStorage.setItem(s.key,JSON.stringify({runId:s.runId,pending:s.pending}));}catch{}},[]);
  const apply=useCallback((value:StoryboardRun)=>{
    const s=state.current;if(!s.active||s.key!==key||value.projectKey!==projectKey)return;
    s.runId=value.runId;if(s.pending?.id===value.runId){s.pending=undefined;setPending(null);}setRun(value);setRuns(old=>[value,...old.filter(item=>item.runId!==value.runId)]);persist();const signature=JSON.stringify({nodes:value.nodes.map(node=>[node.id,node.status,node.taskId]),assembly:value.assembly});if(signatures.current.get(value.runId)!==signature){signatures.current.set(value.runId,signature);latest.current.onChanged?.(value);}
  },[key,projectKey,persist]);
  const read=useCallback(async(id:string,signal?:AbortSignal)=>{
    const owner=state.current;const response=await latest.current.request(`/api/video/workflows/${encodeURIComponent(id)}`,{cache:"no-store",signal,headers:{"x-naumi-workspace":workspace}});
    const body=await response.json();if(!response.ok)throw new Error(body.error||"制作记录读取失败");
    if(owner.active&&state.current===owner&&!signal?.aborted)apply(body.run);return body.run as StoryboardRun;
  },[apply,workspace]);
  useEffect(()=>{
    const life={active:true,key,mutating:false,runId:undefined as string|undefined,pending:undefined as StoryboardIntent|undefined};state.current=life;
    const controller=new AbortController();
    setRun(null);setPending(null);setRuns([]);setLoading(true);setError("");
    try{const saved=JSON.parse(sessionStorage.getItem(key)||"{}") as Saved;
      if(saved.pending?.projectKey===projectKey&&typeof saved.pending.id==='string'&&Array.isArray(saved.pending.nodes)){life.pending=saved.pending;life.runId=saved.pending.id;setPending(saved.pending);}
      else if(typeof saved.runId==='string')life.runId=saved.runId;
    }catch{}
    void(async()=>{try{
      const response=await latest.current.request(`/api/video/workflows?projectKey=${encodeURIComponent(projectKey)}`,{cache:"no-store",signal:controller.signal,headers:{"x-naumi-workspace":workspace}}),body=await response.json();
      if(!response.ok)throw new Error(body.error||"制作记录读取失败");if(!life.active)return;
      const owned=(body.runs||[]).filter((item:StoryboardRun)=>item.projectKey===projectKey) as StoryboardRun[];setRuns(owned);
      if(life.runId&&!life.pending){const existing=owned.find(item=>item.runId===life.runId);if(existing&&!latest.current.initialNodeIds.every(id=>existing.plan.nodes.some(node=>(node.canvasNodeId||node.id)===id))){life.runId=undefined;persist();}}
      if(life.runId)await read(life.runId,controller.signal);
    }catch(cause){if(life.active&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:"制作记录读取失败");}
      finally{if(life.active)setLoading(false);}})();
    return()=>{life.active=false;controller.abort();};
  },[key,projectKey,read,workspace,workspaceRevision,persist]);
  // A submission made after mount has its own bounded, non-overlapping reader.
  const activeRunId=run&&storyboardRunActive(run)?run.runId:null;
  useEffect(()=>{
    if(!activeRunId)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const value=await read(activeRunId,controller.signal);if(!controller.signal.aborted){setError("");if(storyboardRunActive(value))timer=setTimeout(()=>void poll(),4000);}}
      catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:"制作记录读取失败");timer=setTimeout(()=>void poll(),10000);}}};
    timer=setTimeout(()=>void poll(),4000);return()=>{controller.abort();clearTimeout(timer);};
  },[activeRunId,read]);
  const mutate=useCallback(async(action:()=>Promise<void>)=>{
    const life=state.current;if(!life.active||life.key!==key||life.mutating)return;
    life.mutating=true;setBusy(true);setError("");
    try{await action();}catch(cause){if(life.active&&state.current===life)setError(cause instanceof Error?cause.message:"操作结果尚未核实，请核对原制作记录");}
    finally{life.mutating=false;if(life.active&&state.current===life)setBusy(false);}
  },[key]);
  const submit=useCallback((selection:readonly StoryboardSelection[],assemble:boolean,storyboard?:StoryboardContext)=>mutate(async()=>{
    const life=state.current;if(life.pending)throw new Error("已有制作请求待核对，请沿用原操作");
    const intent=storyboardIntent(browserRandomUUID(),projectKey,latest.current.nodes,selection,assemble,storyboard);life.pending=intent;life.runId=intent.id;setPending(intent);persist();
    const response=await latest.current.request("/api/canvas/video-workflows",{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace},body:JSON.stringify(intent)}),body=await response.json();
    // A status alone is not proof of nonacceptance: scheduling can persist a run
    // before continuation reports an error. Keep the same id and exact intent.
    if(!response.ok){if(body.operationNotStaged===true&&life.active&&state.current===life){life.pending=undefined;life.runId=undefined;setPending(null);persist();}throw new Error(body.error||"制作请求结果尚未核实");}
    if(life.active&&state.current===life)await read(intent.id);
  }),[projectKey,mutate,persist,read,workspace]);
  const recover=useCallback(()=>mutate(async()=>{
    const life=state.current;if(life.pending){const intent=life.pending;const response=await latest.current.request("/api/canvas/video-workflows",{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace},body:JSON.stringify(intent)}),body=await response.json();if(!response.ok)throw new Error(body.error||"原制作请求结果尚未核实");if(life.active&&state.current===life)await read(intent.id);}
    else if(life.runId){const response=await latest.current.request(`/api/video/workflows/${encodeURIComponent(life.runId)}`,{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace},body:JSON.stringify({action:"resume"})}),body=await response.json();if(!response.ok)throw new Error(body.error||"恢复失败");if(life.active&&state.current===life)apply(body.run);}
  }),[mutate,read,apply,workspace]);
  const runAction=useCallback((action:"cancel"|"retry-assembly"|"confirm",fields:Record<string,unknown>={})=>mutate(async()=>{
    const life=state.current,id=life.runId;if(!id)return;const response=await latest.current.request(`/api/video/workflows/${encodeURIComponent(id)}`,{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace},body:JSON.stringify({action,...fields})}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"制作操作失败");if(life.active&&state.current===life)apply(body.run);
  }),[mutate,apply,workspace]);
  const select=useCallback((id:string)=>mutate(async()=>{if(state.current.pending)throw new Error("请先核对原制作请求");await read(id);}),[mutate,read]);
  const edit=useCallback(()=>{const life=state.current;if(life.pending||life.mutating)return;life.runId=undefined;setRun(null);setError("");persist();},[persist]);
  return {runs,run,pending,busy,loading,error,submit,recover,runAction,select,edit};
}
