"use client";
import {useEffect,useRef,useState} from "react";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import {reviewStoryboardTake,type StoryboardShot} from "@/lib/storyboard/plan";
import type {PublicVideoTaskView} from "@/lib/video/queries";
import type {PublicVideoTaskSnapshot} from "@/lib/video/task-snapshot";
import type {VideoPrivateFetch} from "./use-video-nodes";

type Candidate={id:string;task:PublicVideoTaskView;url:string};
type Cursor={createdAt:string;id:string};
export function StoryboardTakes({shot,projectKey,request,disabled,onChange,english=false}:{shot:StoryboardShot;projectKey:string;request:VideoPrivateFetch;disabled:boolean;onChange:(shot:StoryboardShot)=>void;english?:boolean}){
  const L=(zh:string,en:string)=>english?en:zh;
  const [tasks,setTasks]=useState<PublicVideoTaskView[]>([]),[cursor,setCursor]=useState<Cursor|null>(null),[left,setLeft]=useState(""),[right,setRight]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false),[snapshots,setSnapshots]=useState<Record<string,PublicVideoTaskSnapshot>>({}),[reload,setReload]=useState(0);
  const requestRef=useRef(request);requestRef.current=request;
  const workspace=currentWorkspace(),identity=JSON.stringify([projectKey,shot.nodeId,workspace]),life=useRef("");life.current=identity;
  const query=async(next?:Cursor,signal?:AbortSignal)=>{
    const params=new URLSearchParams({projectKey,nodeId:shot.nodeId,limit:"30"});if(next)params.set("cursor",JSON.stringify(next));
    setLoading(true);try{const response=await requestRef.current(`/api/video/tasks?${params}`,{cache:"no-store",signal,headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey}}),body=await response.json();if(!response.ok)throw new Error(body.error||"候选读取失败");if(signal?.aborted||life.current!==identity)return;
      const loaded:PublicVideoTaskView[]=[...body.tasks];
      // The new node has no fake lastTaskId. Fetch only exact takes retained by the saved fork, not future source-node tasks.
      const missing=next?[]:[...new Set(shot.takes.map(take=>take.taskId))].filter(id=>!loaded.some(task=>task.id===id));
      for(let index=0;index<missing.length;index+=4)await Promise.all(missing.slice(index,index+4).map(async id=>{const r=await requestRef.current(`/api/video/tasks/${encodeURIComponent(id)}`,{cache:"no-store",signal,headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey}});if(r.ok){const value=await r.json();if(value.task?.projectKey===projectKey)loaded.push(value.task);}}));
      if(signal?.aborted||life.current!==identity)return;
      setTasks(old=>next?[...new Map([...old,...loaded].map(task=>[task.id,task])).values()]:loaded);setCursor(body.nextCursor||null);setError("");
    }catch(cause){if(!signal?.aborted&&life.current===identity)setError(cause instanceof Error?cause.message:"候选读取失败");}finally{if(!signal?.aborted&&life.current===identity)setLoading(false);}
  };
  const queryRef=useRef(query);queryRef.current=query;
  useEffect(()=>{const controller=new AbortController();life.current=identity;setTasks([]);setLeft("");setRight("");setSnapshots({});void queryRef.current(undefined,controller.signal);return()=>{controller.abort();life.current="";};},[identity,reload]);
  const candidates:Candidate[]=tasks.filter(task=>task.status==="completed").flatMap(task=>{
    const inherited=task.sourceId!==shot.nodeId,allowed=(id:string)=>!inherited||shot.takes.some(take=>take.taskId===task.id&&take.artworkId===id);
    const outputs=task.resultAssets.filter(asset=>(asset.kind==="video"||asset.mimeType?.startsWith("video/"))&&allowed(asset.artworkId));
    return outputs.length?outputs.map(asset=>({id:asset.artworkId,task,url:asset.url})):task.artworkId&&task.videoUrl&&allowed(task.artworkId)?[{id:task.artworkId,task,url:task.videoUrl}]:[];
  });
  const selected=candidates.find(value=>value.id===left)||candidates.find(value=>value.id===shot.adoptedArtworkId)||candidates[0],comparison=candidates.find(value=>value.id===right);
  const taskIds=[selected?.task.id,comparison?.task.id].filter(Boolean).join("|");
  useEffect(()=>{const controller=new AbortController();for(const id of taskIds.split("|").filter(Boolean))void(async()=>{try{
    const response=await requestRef.current(`/api/video/tasks/${encodeURIComponent(id)}`,{cache:"no-store",signal:controller.signal,headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey}}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"原任务参数读取失败");if(!controller.signal.aborted)setSnapshots(old=>({...old,[id]:body.snapshot}));
  }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"参数读取失败");}})();return()=>controller.abort();},[taskIds,workspace,projectKey]);
  const css="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:opacity-40";
  const review=selected&&shot.takes.find(take=>take.artworkId===selected.id);
  const change=(status:"pending"|"changes"|"approved",note=review?.note||"",adopt=false)=>{if(selected)onChange(reviewStoryboardTake(shot,{artworkId:selected.id,taskId:selected.task.id,status,note},adopt));};
  const diff=selected&&comparison&&snapshots[selected.task.id]&&snapshots[comparison.task.id]?([
    [L("描述","Prompt"),snapshots[selected.task.id].originalPrompt,snapshots[comparison.task.id].originalPrompt],
    [L("参考素材","References"),snapshots[selected.task.id].inputs,snapshots[comparison.task.id].inputs],
    [L("生成参数","Settings"),snapshots[selected.task.id].config,snapshots[comparison.task.id].config],
  ] as const).filter(([,a,b])=>JSON.stringify(a)!==JSON.stringify(b)).map(([label])=>label):null;
  return <section aria-label={L("镜头选片","Shot takes")} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
    <div className="flex items-center justify-between"><span className="text-xs font-medium">{L("候选版本","Takes")}</span><button type="button" className={css} disabled={loading} onClick={()=>setReload(value=>value+1)}>{L("刷新","Refresh")}</button></div>
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
    {!candidates.length&&<p className="text-xs text-slate-500">{loading?L("读取候选","Loading takes"):L("还没有已完成的候选","No completed takes yet")}</p>}
    {!!candidates.length&&<><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(["left","right"] as const).map(side=>{const candidate=side==="left"?selected:comparison;return <div key={side} className="min-w-0 space-y-2">
      <select className={`${css} w-full`} aria-label={side==="left"?L("预览版本","Preview take"):L("对比版本","Compare take")} value={candidate?.id||""} onChange={event=>(side==="left"?setLeft:setRight)(event.target.value)}>
        {side==="right"&&<option value="">{L("选择对比版本","Choose comparison")}</option>}{candidates.map((take,index)=><option key={take.id} value={take.id}>{L("版本","Take")} {candidates.length-index} · {new Date(take.task.createdAt).toLocaleString()} {shot.adoptedArtworkId===take.id?L("· 已采用","· Adopted"):""}</option>)}
      </select>{candidate&&<><video key={candidate.id} src={candidate.url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-slate-900"/><p className="text-xs text-slate-500">{candidate.task.model} · {candidate.task.seconds||"—"}s</p><details className="text-xs"><summary>{L("本版描述","Take prompt")}</summary><p className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{snapshots[candidate.task.id]?.originalPrompt||candidate.task.prompt}</p></details></>}
    </div>;})}</div>
    {diff&&<p className="text-xs text-slate-600">{diff.length?`${L("差异","Changed")}: ${diff.join(" · ")}`:L("描述与参数相同，生成结果不同","Same settings; different result")}</p>}
    {selected&&<div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="text-xs">{review?.status==="approved"?L("已采用","Adopted"):review?.status==="changes"?L("需修改","Needs changes"):L("待审","To review")}</span><button type="button" className={css} disabled={disabled||shot.adoptedArtworkId===selected.id} onClick={()=>change("approved",review?.note||"",true)}>{L("采用此版","Adopt take")}</button><button type="button" className={css} disabled={disabled} onClick={()=>change("changes")}>{L("需修改","Needs changes")}</button><button type="button" className={css} disabled={disabled} onClick={()=>change("pending")}>{L("待审","To review")}</button></div><textarea className={`${css} w-full`} rows={2} maxLength={4000} aria-label={L("审片意见","Review notes")} placeholder={L("记录本版修改意见","Notes for this take")} value={review?.note||""} disabled={disabled} onChange={event=>change(review?.status||"pending",event.target.value)}/></div>}
    </>}
    {cursor&&<button type="button" className={css} disabled={loading} onClick={()=>void query(cursor)}>{L("更早版本","Earlier takes")}</button>}
  </section>;
}
