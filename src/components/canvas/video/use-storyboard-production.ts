"use client";
import {useEffect,useRef,useState} from "react";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {StoryboardPlan} from "@/lib/storyboard/plan";
import type {StoryboardSelection} from "@/lib/video/storyboard-client";
import type {ProductionInspection,RoughcutLink} from "@/lib/storyboard/production";
import type {VideoPrivateFetch} from "./use-video-nodes";

type RoughcutRequest={projectKey:string;planId:string;revision:number;operationId:string;mode:"create"|"update";nodeIds:string[];timelineId?:string;timelineRevision?:number};
export function useStoryboardProduction({scope,projectKey,request,onOpenTimeline}:{scope:string;projectKey:string;request:VideoPrivateFetch;onOpenTimeline?:(id:string)=>Promise<void>|void}){
  const workspace=currentWorkspace(),key=`naumi:storyboard-production:v1:${JSON.stringify([scope,workspace,projectKey])}`;
  const [inspection,setInspection]=useState<{planId:string;revision:number;selection:string;data:ProductionInspection}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState<RoughcutRequest|null>(()=>{try{const value=JSON.parse(localStorage.getItem(key)||"null");return value?.projectKey===projectKey&&typeof value.operationId==="string"?value:null;}catch{return null;}});
  const alive=useRef(true),lock=useRef(false),ports=useRef({request,onOpenTimeline});ports.current={request,onOpenTimeline};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[key]);
  const post=async(path:string,body:unknown)=>{const response=await ports.current.request(path,{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||"操作结果尚未核实"),{status:response.status});return data;};
  const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await action();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:"操作结果尚未核实");}finally{lock.current=false;if(alive.current)setBusy(false);}};
  const inspect=(plan:StoryboardPlan,selection:StoryboardSelection[])=>run(async()=>{
    const data=await post("/api/canvas/storyboards/inspect",{projectKey,planId:plan.id,revision:plan.revision,nodes:selection.map(node=>({id:node.id,reuseCompleted:node.reuseCompleted}))});
    if(alive.current)setInspection({planId:plan.id,revision:plan.revision,selection:JSON.stringify(selection),data});
  });
  const complete=async(body:RoughcutRequest)=>{
    try{const data=await post("/api/canvas/storyboards/roughcut",body);localStorage.removeItem(key);if(alive.current){setPending(null);await ports.current.onOpenTimeline?.(data.node.id);}}
    catch(cause){if([400,409,422].includes((cause as {status?:number}).status||0)){localStorage.removeItem(key);if(alive.current)setPending(null);}throw cause;}
  };
  const roughcut=(plan:StoryboardPlan,nodeIds:string[],target?:RoughcutLink)=>run(async()=>{
    if(pending)throw new Error("请先核对原粗剪操作");
    const body:RoughcutRequest={projectKey,planId:plan.id,revision:plan.revision,operationId:browserRandomUUID(),mode:target?"update":"create",nodeIds,...(target?{timelineId:target.timelineId,timelineRevision:target.revision}:{})};
    localStorage.setItem(key,JSON.stringify(body));setPending(body);await complete(body);
  });
  const recover=()=>run(async()=>{if(pending)await complete(pending);});
  return {inspection,busy,error,pending,inspect,roughcut,recover};
}
