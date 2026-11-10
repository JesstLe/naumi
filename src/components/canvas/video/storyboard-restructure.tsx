"use client";
import {useCallback,useEffect,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import {selectedVideoCatalogModel,catalogCapability,videoDurations,reconcileVideoSettings,type VideoCatalogModel} from "@/lib/video/client-settings";
import type {CanvasVideoNode,VideoNodeWrite} from "@/lib/canvas/video-node-schema";
import type {VideoPrivateFetch} from "./use-video-nodes";

/** New nodes preserve original footage and plans; durable create receipts recover partial writes. */
export function StoryboardRestructure({nodes,planId,scope,request,onApplied,onClose,english=false}:{nodes:CanvasVideoNode[];planId:string;scope:string;request:VideoPrivateFetch;onApplied:(created:CanvasVideoNode[])=>Promise<void>;onClose:()=>void;english?:boolean}){
  const merge=nodes.length===2,first=nodes[0],L=useCallback((zh:string,en:string)=>english?en:zh,[english]);
  const workspace=currentWorkspace(),cacheKey=`naumi:storyboard-restructure:v1:${JSON.stringify([scope,workspace,first.projectKey,planId,nodes.map(node=>node.id)])}`;
  const [prompts,setPrompts]=useState(merge?[nodes.map(node=>node.config.prompt||"").join("\n\n")]:[first.config.prompt||"",""]),[seconds,setSeconds]=useState<number[]>(merge?[nodes.reduce((sum,node)=>sum+(node.config.durationSeconds||0),0)]:[first.config.durationSeconds||0,first.config.durationSeconds||0]);
  const [durations,setDurations]=useState<number[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),[pending,setPending]=useState<VideoNodeWrite[]|null>(()=>{try{return JSON.parse(localStorage.getItem(cacheKey)||"null");}catch{return null;}});
  const [capability,setCapability]=useState<ReturnType<typeof catalogCapability>|null>(null);
  useEffect(()=>{const controller=new AbortController();void(async()=>{try{
    if(first.config.comfyWorkflowId)throw new Error(L("自备工作流请在节点编辑器拆镜","Edit workflow shots in the node editor"));
    if(merge&&nodes.some(node=>node.config.modelId!==first.config.modelId||node.config.providerId!==first.config.providerId||JSON.stringify(node.inputs.filter(input=>input.kind!=="text"||input.role!=="author"))!==JSON.stringify(first.inputs.filter(input=>input.kind!=="text"||input.role!=="author"))))throw new Error(L("合镜前请统一两个镜头的模型与参考素材","Match the model and references before merging"));
    if(nodes.some(node=>node.config.shots?.length))throw new Error(L("原生多镜头请在节点内编辑","Edit native multi-shot videos in their node"));
    const response=await request("/api/video/catalog",{cache:"no-store",signal:controller.signal}),body=await response.json();if(!response.ok)throw new Error(body.error||"视频能力读取失败");
    const model=selectedVideoCatalogModel(body.models as VideoCatalogModel[],first.config);if(!model)throw new Error(L("原模型当前不可用","Original model is unavailable"));
    if(!controller.signal.aborted){const cap=catalogCapability(model);setCapability(cap);setDurations(videoDurations(cap,first.config.mode).filter(value=>value>0));setReady(true);}
  }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"能力读取失败");}})();return()=>controller.abort();},[first,nodes,request,L,merge]);
  const submit=async()=>{if(busy)return;setBusy(true);setError("");try{
    const writes=pending||prompts.map((prompt,index)=>{const id=`vnode-${browserRandomUUID()}`;return {id,projectKey:first.projectKey,expectedRevision:0,operationId:browserRandomUUID(),title:(merge?`${first.title} + ${nodes[1].title}`:`${first.title} ${index+1}`).slice(0,200),x:first.x+index*464,y:first.y+first.height+96,width:first.width,height:first.height,config:reconcileVideoSettings({...first.config,prompt,durationSeconds:seconds[index]},capability!).config,inputs:first.inputs.filter(input=>input.kind!=="text"||input.role!=="author")};});
    localStorage.setItem(cacheKey,JSON.stringify(writes));setPending(writes);
    const created:CanvasVideoNode[]=[];
    for(const write of writes){const response=await request("/api/canvas/video-nodes",{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":first.projectKey},body:JSON.stringify(write)}),body=await response.json();if(!response.ok)throw new Error(body.error||"镜头创建结果尚未核实");created.push(body.node);}
    await onApplied(created);localStorage.removeItem(cacheKey);onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:"镜头修改尚未核实");}finally{setBusy(false);}};
  const css="rounded-lg border border-slate-200 bg-white p-2 text-xs disabled:opacity-40";
  return <section aria-label={merge?L("合并镜头","Merge shots"):L("拆分镜头","Split shot")} className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
    <div className="flex items-center justify-between text-sm font-medium"><span>{merge?L("合并相邻镜头","Merge adjacent shots"):L("拆成两个镜头","Split into two shots")}</span><button type="button" className={css} disabled={busy} onClick={onClose}>{L("关闭","Close")}</button></div>
    <p className="text-xs text-slate-500">{L("创建新镜头，保留原镜头和已有结果","Create new shots; preserve the originals and their takes")}</p>
    {prompts.map((prompt,index)=><div className="space-y-2" key={index}><textarea rows={3} maxLength={16384} aria-label={`${L("新镜头描述","New shot prompt")} ${index+1}`} className={`${css} w-full`} value={prompt} disabled={busy||!!pending} onChange={event=>setPrompts(old=>old.map((value,i)=>i===index?event.target.value:value))}/><select aria-label={`${L("新镜头时长","New shot duration")} ${index+1}`} className={css} value={durations.includes(seconds[index])?seconds[index]:""} disabled={busy||!!pending} onChange={event=>setSeconds(old=>old.map((value,i)=>i===index?Number(event.target.value):value))}><option value="">{L("选择时长","Choose duration")}</option>{durations.map(value=><option key={value} value={value}>{value}s</option>)}</select></div>)}
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
    {capability&&<p className="text-xs text-slate-500">{seconds.map((durationSeconds,index)=>{const result=reconcileVideoSettings({...first.config,durationSeconds},capability);return `${index+1}: ${result.config.resolution||"—"} · ${result.config.aspectRatio||"—"}${result.changes.filter(field=>field!=="时长").length?` · ${L("调整","Adjusted")}: ${result.changes.filter(field=>field!=="时长").join("、")}`:""}`;}).join(" / ")}</p>}
    <button type="button" className={css} disabled={busy||!pending&&(!ready||prompts.some(prompt=>!prompt.trim())||seconds.some(value=>!durations.includes(value)))} onClick={()=>void submit()}>{pending?L("核对并继续","Check and continue"):L("保存新镜头","Save new shots")}</button>
  </section>;
}
