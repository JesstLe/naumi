"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Check,Clapperboard,Download,ExternalLink,Loader2,RefreshCw,X} from "lucide-react";
import type {VideoInputChoice} from "@/lib/video/client-settings";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import {storyboardRunActive,type StoryboardRun} from "@/lib/video/storyboard-client";
import type {VideoPrivateFetch} from "./use-video-nodes";
import {StoryboardPlanEditor} from "./storyboard-plan-editor";
import {useStoryboardWorkflow} from "./use-storyboard-workflow";
import {WORKSPACE_SELECTION} from "@/lib/saas/workspace-client";

export function StoryboardPlanButton({disabled,onClick,english=false}:{disabled:boolean;onClick:()=>void;english?:boolean}){
  return <button type="button" onClick={onClick} disabled={disabled} className="canvas-ui-action flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40"><Clapperboard size={15}/>{english?"Plan shots":"拆分镜头"}</button>;
}
const statuses:Record<string,[string,string]>={pending:["待生成","Pending"],waiting:["等待镜头","Waiting for shots"],processing:["处理中","Processing"],queued:["排队中","Queued"],completed:["已完成","Completed"],blocked:["待处理","Blocked"],failed:["失败","Failed"],needs_confirmation:["待确认报价","Confirm quote"],needs_attention:["待核对","Needs checking"],cancelled:["已停止","Stopped"]};
export function StoryboardPanel({projectKey,scope,nodes,initialNodeIds,request,english=false,onClose,onEditNode,onChanged,choices,onOpenTimeline}:{projectKey:string;scope:string;nodes:CanvasVideoNode[];initialNodeIds:string[];request:VideoPrivateFetch;english?:boolean;onClose:()=>void;onEditNode:(id:string)=>void;choices?:VideoInputChoice[];onOpenTimeline?:(id:string)=>Promise<void>|void;onChanged?:(run:StoryboardRun)=>void}){
  const L=(zh:string,en:string)=>english?en:zh,dialog=useRef<HTMLDialogElement>(null);
  const [createdNodes,setCreatedNodes]=useState<CanvasVideoNode[]>([]);
  const current=useMemo(()=>[...nodes,...createdNodes.filter(node=>!nodes.some(item=>item.id===node.id))].filter(node=>node.projectKey===projectKey&&!node.deletedAt),[nodes,createdNodes,projectKey]);
  const flow=useStoryboardWorkflow({scope,projectKey,request,nodes:current,initialNodeIds,onChanged});
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{const close=()=>closeRef.current();window.addEventListener(WORKSPACE_SELECTION,close);return()=>window.removeEventListener(WORKSPACE_SELECTION,close);},[]);
  const locked=flow.busy||!!flow.pending,run=flow.run;
  const label=(status:string)=>statuses[status]?.[english?1:0]||status;
  const css="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  const output=run?.assembly?.outputs?.find(item=>!item.mimeType||item.mimeType.startsWith("video/"));
  const confirm=(node:StoryboardRun['nodes'][number])=>{const quote=node.quote;if(!quote?.version)return;const credits=quote.authorization?quote.authorizedCredits:quote.credits;if(credits==null)return;void flow.runAction("confirm",{nodeId:node.id,billingVersion:quote.version,billingCredits:credits});};
  return <dialog ref={dialog} aria-labelledby="storyboard-title" data-canvas-hotkeys-blocked="true" onCancel={event=>{event.preventDefault();onClose();}} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} className="canvas-ui-light m-auto w-[min(780px,calc(100vw-24px))] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/25">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h2 id="storyboard-title" className="flex items-center gap-2 text-sm font-semibold"><Clapperboard size={18}/>{L("分镜制作","Storyboard")}</h2><button type="button" className={css} aria-label={L("关闭分镜","Close storyboard")} onClick={onClose}><X size={16}/></button></header>
    <div className="max-h-[min(70vh,680px)] space-y-3 overflow-y-auto p-4">
      {flow.loading&&<p role="status" className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin"/>{L("读取制作记录","Loading productions")}</p>}
      {flow.runs.length>0&&<div className="flex flex-wrap items-center gap-2"><select aria-label={L("制作记录","Production history")} disabled={locked} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2 text-xs" value={run?.runId||""} onChange={event=>{if(event.target.value){void flow.select(event.target.value);}else flow.edit();}}><option value="">{L("当前镜头方案","Current shot plan")}</option>{flow.runs.map((item,index)=><option key={item.runId} value={item.runId}>{L("制作","Production")} {flow.runs.length-index} · {item.nodes.length} {L("镜头","shots")} · {item.progress}%</option>)}</select>{run&&!storyboardRunActive(run)&&<button className={css} disabled={locked} onClick={()=>{flow.edit();}}>{L("编辑新方案","Edit new plan")}</button>}</div>}
      {run?<>
        <ol className="space-y-2">{run.plan.nodes.map((planned,index)=>{const state=run.nodes.find(item=>item.id===planned.id);return <li key={planned.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><button className="min-w-0 truncate text-sm font-medium hover:underline" onClick={()=>onEditNode(planned.canvasNodeId||planned.id)}>{current.find(node=>node.id===(planned.canvasNodeId||planned.id))?.title||`${L("镜头","Shot")} ${index+1}`}</button><span className="shrink-0 text-xs text-slate-500">{label(state?.status||"pending")}</span></div>{state?.error&&<p role="alert" className="mt-2 text-xs text-red-600">{state.error}</p>}{state?.status==="needs_confirmation"&&<button className={`${css} mt-2`} disabled={locked} onClick={()=>confirm(state)}>{L("确认当前报价","Confirm current quote")}</button>}</li>;})}</ol>
        {run.assembly&&<section aria-label={L("成片","Final video")} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between text-sm font-medium"><span>{L("成片","Final video")}</span><span className="text-xs text-slate-500">{label(run.assembly.status)}</span></div>{run.assembly.error&&<p role="alert" className="text-xs text-red-600">{run.assembly.error}</p>}{output&&<><video src={output.url} controls preload="metadata" className="max-h-72 w-full rounded-lg bg-slate-900"/><a className={css} href={output.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{L("打开成片","Open final video")}</a><a className={`${css} ml-2`} href={output.url} download={output.name||"storyboard.mp4"}><Download size={14}/>{L("下载成片","Download final video")}</a></>}{!!run.assembly.jobId&&["failed","cancelled"].includes(run.assembly.status)&&<button className={css} disabled={locked} onClick={()=>void flow.runAction("retry-assembly",{expectedAttempt:run.assembly!.attempt})}><RefreshCw size={14}/>{L("仅重试合成","Retry assembly only")}</button>}</section>}
      </>:<StoryboardPlanEditor choices={choices} onOpenTimeline={onOpenTimeline} scope={scope} projectKey={projectKey} nodes={current} initialNodeIds={initialNodeIds} request={request} english={english} blocked={locked||flow.loading} onEditNode={onEditNode} onSubmit={flow.submit} onNodesCreated={created=>setCreatedNodes(old=>[...old.filter(node=>!created.some(item=>item.id===node.id)),...created])}/>}
      {flow.pending&&<div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{L("提交结果待核对，已保留原操作编号。","Submission pending verification. Original operation retained.")}</div>}
      {flow.error&&<p role="alert" className="text-xs text-red-600">{flow.error}</p>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      {run?<><span className="flex items-center gap-1.5 text-xs text-slate-500">{run.progress===100?<Check size={14}/>:<Clapperboard size={14}/>} {run.progress}%</span><div className="flex gap-2">{storyboardRunActive(run)&&<button className={css} disabled={locked} onClick={()=>void flow.runAction("cancel")}>{L("停止制作","Stop production")}</button>}<button className={css} disabled={locked} onClick={()=>void flow.recover()}><RefreshCw size={14}/>{L("核对并继续","Check and resume")}</button></div></>:flow.pending?<><span/><button className={css} disabled={flow.busy} onClick={()=>void flow.recover()}><RefreshCw size={14}/>{L("核对原任务","Check original task")}</button></>:null}
    </footer>
  </dialog>;
}
