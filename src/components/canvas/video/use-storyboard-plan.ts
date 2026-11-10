"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import {newStoryboardDocument,storyboardDocumentSignature,storyboardDocumentSchema,storyboardWriteSchema,type StoryboardDocument,type StoryboardPlan,type StoryboardWrite} from "@/lib/storyboard/plan";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import type {VideoPrivateFetch} from "./use-video-nodes";

type Draft={id:string;revision:number;document:StoryboardDocument;pending?:StoryboardWrite};
export function useStoryboardPlan({scope,projectKey,nodes,initialNodeIds,request}:{scope:string;projectKey:string;nodes:CanvasVideoNode[];initialNodeIds:string[];request:VideoPrivateFetch}){
  const workspace=currentWorkspace(),key=`naumi:storyboard-plan:v1:${JSON.stringify([scope,workspace,projectKey])}`;
  const [plans,setPlans]=useState<StoryboardPlan[]>([]),[draft,setDraft]=useState<Draft|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const current=useRef<Draft|null>(null),saved=useRef(""),alive=useRef(false),operation=useRef<Promise<StoryboardPlan>|null>(null);
  const ports=useRef({request,nodes,initialNodeIds});ports.current={request,nodes,initialNodeIds};
  const cache=useCallback((value:Draft)=>{localStorage.setItem(key,JSON.stringify(value));},[key]);
  const update=useCallback((document:StoryboardDocument)=>{const old=current.current;if(!old)return;const next={...old,document};cache(next);current.current=next;setDraft(next);setError("");},[cache]);
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();setLoading(true);setError("");
    void(async()=>{try{
      const response=await ports.current.request(`/api/canvas/storyboards?projectKey=${encodeURIComponent(projectKey)}`,{cache:"no-store",signal:controller.signal,headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey}}),body=await response.json();
      if(!response.ok)throw new Error(body.error||"方案读取失败");if(controller.signal.aborted)return;
      const loaded=body.plans as StoryboardPlan[];setPlans(loaded);
      let restored:Draft|null=null;try{const raw=JSON.parse(localStorage.getItem(key)||"null");if(raw?.id&&Number.isSafeInteger(raw.revision)&&raw.revision>=0)restored={id:raw.id,revision:raw.revision,document:storyboardDocumentSchema.parse(raw.document),...(raw.pending?{pending:storyboardWriteSchema.parse(raw.pending)}:{})};}catch{}
      const relevant=(plan:{document:StoryboardDocument})=>!ports.current.initialNodeIds.length||ports.current.initialNodeIds.some(id=>plan.document.shots.some(shot=>shot.nodeId===id));
      // A pending write must be resolved even if opened from a different shot.
      if(restored&&!restored.pending&&!relevant(restored))restored=null;
      const server=restored?loaded.find(plan=>plan.id===restored!.id):loaded.find(relevant);
      const same=server&&restored&&storyboardDocumentSignature(server.document)===storyboardDocumentSignature(restored.document);
      const value:Draft=restored&&(!server||restored.pending||!same)?restored:server?{id:server.id,revision:server.revision,document:server.document}:{id:browserRandomUUID(),revision:0,document:newStoryboardDocument(ports.current.nodes,ports.current.initialNodeIds)};
      saved.current=server?storyboardDocumentSignature(server.document):"";current.current=value;cache(value);setDraft(value);
      if(server&&restored&&!same&&!restored.pending&&server.revision!==restored.revision)setError("方案已在另一处修改，本地草稿已保留。请载入最新方案后继续。");
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"方案读取失败");}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>{alive.current=false;controller.abort();};
  },[key,projectKey,workspace,cache]);
  const save=useCallback(():Promise<StoryboardPlan>=>{
    if(operation.current)return operation.current;
    const value=current.current;if(!value)return Promise.reject(new Error("方案尚未读取"));
    const parsed=storyboardWriteSchema.safeParse(value.pending||{id:value.id,projectKey,expectedRevision:value.revision,operationId:browserRandomUUID(),document:value.document});
    if(!parsed.success){const message="请填写方案名称，并使用完整、不重复的镜号";setError(message);return Promise.reject(new Error(message));}
    const write=parsed.data;
    const pending={...value,pending:write};cache(pending);current.current=pending;setDraft(pending);setBusy(true);setError("");
    const work=(async()=>{try{
      const response=await ports.current.request("/api/canvas/storyboards",{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},body:JSON.stringify(write)}),body=await response.json();
      if(!response.ok){
        // Only these explicit validation/CAS rejections are known not to have committed.
        if([401,403,409,422].includes(response.status)){const rejected={...current.current!,pending:undefined};cache(rejected);current.current=rejected;if(alive.current)setDraft(rejected);}
        throw new Error(body.error||"方案保存结果尚未核实");
      }
      const plan=body.plan as StoryboardPlan;
      const next={id:plan.id,revision:plan.revision,document:current.current?.document||plan.document};saved.current=storyboardDocumentSignature(plan.document);cache(next);current.current=next;
      if(alive.current){setDraft(next);setPlans(old=>[plan,...old.filter(item=>item.id!==plan.id)]);}return plan;
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:"方案保存结果尚未核实");throw cause;}finally{operation.current=null;if(alive.current)setBusy(false);}})();operation.current=work;return work;
  },[cache,projectKey,workspace]);
  const dirty=!!draft&&storyboardDocumentSignature(draft.document)!==saved.current;
  useEffect(()=>{if(loading||busy||error||!dirty||draft?.pending)return;const timer=setTimeout(()=>void(async()=>{try{await save();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:"请检查方案名称与镜号");}})(),800);return()=>clearTimeout(timer);},[loading,busy,error,dirty,draft,save]);
  const select=useCallback((plan:StoryboardPlan)=>{if(operation.current||current.current?.pending)return;const next={id:plan.id,revision:plan.revision,document:plan.document};saved.current=storyboardDocumentSignature(plan.document);current.current=next;cache(next);setDraft(next);setError("");},[cache]);
  const copy=useCallback(()=>{const value=current.current;if(!value||operation.current||value.pending)return;const next={id:browserRandomUUID(),revision:0,document:{...structuredClone(value.document),title:`${value.document.title} 副本`}};saved.current="";current.current=next;cache(next);setDraft(next);setError("");},[cache]);
  const reload=useCallback(async()=>{
    if(operation.current||current.current?.pending)return;
    const response=await ports.current.request(`/api/canvas/storyboards?projectKey=${encodeURIComponent(projectKey)}`,{cache:"no-store",headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey}}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"方案读取失败");if(!alive.current)return;
    const loaded=body.plans as StoryboardPlan[];setPlans(loaded);const plan=loaded.find(plan=>plan.id===current.current?.id);if(plan)select(plan);
  },[projectKey,workspace,select]);
  return {plans,draft,loading,busy,error,dirty,update,save,select,copy,reload};
}
