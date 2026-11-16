"use client";
import {useEffect,useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import type {StoryboardPlan,StoryboardTake} from "@/lib/storyboard/plan";
import {assistedFindingRange,reviewFramesSchema,assistedReviewRequestSchema,type AssistedReviewReport} from "@/lib/storyboard/assisted-review";
import type {PublicMediaJob} from "@/lib/video/media-job-schema";
import type {VideoPrivateFetch} from "./use-video-nodes";

type Pending={frames:ReturnType<typeof reviewFramesSchema.parse>;jobId?:string;review?:ReturnType<typeof assistedReviewRequestSchema.parse>;model?:string};
export function StoryboardAssistedReview({scope,projectKey,planId,nodeId,take,duration,disabled,request,onSave,onChange,onSeek,english=false}:{scope?:string;projectKey:string;planId:string;nodeId:string;take:StoryboardTake;duration:number|null;disabled:boolean;request:VideoPrivateFetch;onSave:()=>Promise<StoryboardPlan>;onChange:(take:StoryboardTake)=>void;onSeek:(start:number,end?:number)=>void;english?:boolean}){
  const L=(zh:string,en:string)=>english?en:zh,workspace=currentWorkspace(),key=JSON.stringify(["storyboard-assisted-v1",scope,workspace,projectKey,planId,nodeId,take.taskId,take.artworkId]);
  const [pending,setPending]=useState<Pending|null>(null),[job,setJob]=useState<PublicMediaJob|null>(null),[reports,setReports]=useState<AssistedReviewReport[]>([]),[charges,setCharges]=useState<Record<string,number>>({}),[times,setTimes]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const life=useRef(true),latest=useRef(take),changeRef=useRef(onChange),requestRef=useRef(request);latest.current=take;changeRef.current=onChange;requestRef.current=request;
  const headers={"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey};
  useEffect(()=>{life.current=true;try{const stored=JSON.parse(localStorage.getItem(key)||"null");if(stored){reviewFramesSchema.parse(stored.frames);if(stored.review)assistedReviewRequestSchema.parse(stored.review);setPending(stored);}}catch{setError(english?"Recovery record unreadable; no new operation created":"检查恢复记录不可读，未创建新操作");}return()=>{life.current=false;};},[key,english]);
  const save=(value:Pending|null)=>{try{if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);}catch{throw new Error(L("检查操作尚未保存，未提交","Operation was not saved; nothing submitted"));}if(life.current)setPending(value);};
  const readJob=async(id:string)=>{const response=await requestRef.current(`/api/video/media-jobs/${encodeURIComponent(id)}`,{headers,cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"抽帧任务读取失败");if(life.current)setJob(body.job);return body.job as PublicMediaJob;};
  const jobRef=useRef(readJob);jobRef.current=readJob;
  useEffect(()=>{if(!pending?.jobId)return;let active=true,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const value=await jobRef.current(pending.jobId!);if(active&&["queued","processing"].includes(value.status))timer=setTimeout(poll,2500);}catch(cause){if(active)setError(cause instanceof Error?cause.message:"抽帧读取失败");}};void poll();return()=>{active=false;clearTimeout(timer);};},[pending?.jobId]);
  const refs=JSON.stringify(take.assistedReviews||[]);
  useEffect(()=>{const controller=new AbortController();void(async()=>{try{const loaded=[];for(const ref of JSON.parse(refs) as NonNullable<StoryboardTake["assistedReviews"]>){const query=new URLSearchParams({target:JSON.stringify(ref.source),operationId:ref.operationId}),response=await requestRef.current(`/api/canvas/storyboards/review?${query}`,{headers:{"x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},signal:controller.signal,cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"辅助检查回执读取失败");loaded.push(body.review);if(!controller.signal.aborted&&Number.isFinite(body.chargedCredits))setCharges(old=>({...old,[ref.operationId]:body.chargedCredits}));}if(!controller.signal.aborted)setReports(loaded);}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"辅助检查读取失败");}})();return()=>controller.abort();},[refs,projectKey,workspace]);
  const act=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError("");try{await fn();}catch(cause){if(life.current)setError(cause instanceof Error?cause.message:"辅助检查尚未核实");}finally{if(life.current)setBusy(false);}};
  const extract=()=>act(async()=>{
    let retained=pending;
    if(!retained){if(!duration||!Number.isFinite(duration))throw new Error("原片时长尚未读取");const plan=await onSave(),samples=times.trim()?times.split(/[,，\s]+/).filter(Boolean).map(Number):[0,Number((duration/2).toFixed(3)),Number(Math.max(0,duration-.1).toFixed(3))].filter((value,index,all)=>index===0||value>all[index-1]);
      retained={frames:reviewFramesSchema.parse({projectKey,planId:plan.id,revision:plan.revision,nodeId,taskId:take.taskId,artworkId:take.artworkId,operationId:browserRandomUUID(),samples})};save(retained);}
    const response=await requestRef.current("/api/canvas/storyboards/review-frames",{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(retained.frames)}),body=await response.json();if(!response.ok)throw new Error(body.error||"抽帧尚未核实，请沿原操作核对");
    save({...retained,jobId:body.job.id});if(life.current)setJob(body.job);
  });
  const inspect=()=>act(async()=>{
    if(!pending?.jobId||job?.status!=="completed")throw new Error("请先取得已完成抽帧");
    const retained={...pending,review:pending.review||assistedReviewRequestSchema.parse({...pending.frames,operationId:browserRandomUUID(),frameJobId:pending.jobId})};save(retained);
    const response=await requestRef.current("/api/canvas/storyboards/review",{method:"POST",headers:{...headers,"content-type":"application/json",...(retained.model?{"x-naumi-feature-model":retained.model}:{})},body:JSON.stringify(retained.review)}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"检查结果尚未核实，请保留原操作");if(!life.current)return;
    const report=body.review as AssistedReviewReport;setReports(old=>[...old.filter(value=>value.operationId!==report.operationId),report]);
    const ref={operationId:report.operationId,source:report.source};changeRef.current({...latest.current,assistedReviews:[...(latest.current.assistedReviews||[]).filter(value=>value.operationId!==ref.operationId),ref]});
  });
  const css="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:opacity-40",locked=disabled||busy;
  return <details className="border-t border-slate-200 pt-2"><summary className="text-xs font-medium">{L("辅助审片","Assisted review")}</summary><div className="mt-2 space-y-2">
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
    <input aria-label={L("审片抽帧秒数","Review sample seconds")} className={`${css} w-full`} placeholder="0, 1.2, 3.8" value={pending?.frames.samples.join(", ")??times} disabled={locked||!!pending} onChange={event=>setTimes(event.target.value)}/>
    <div className="flex flex-wrap gap-2"><button type="button" className={css} disabled={locked||!!pending?.jobId} onClick={()=>void extract()}>{pending?L("核对抽帧","Recover frames"):L("抽取审片帧","Extract review frames")}</button>
      {pending?.jobId&&<button type="button" className={css} disabled={locked} onClick={()=>void act(async()=>{await readJob(pending.jobId!);})}>{L("刷新抽帧","Refresh frames")}</button>}
      <button type="button" className={css} disabled={locked||job?.status!=="completed"} onClick={()=>void inspect()}>{pending?.review?L("核对检查结果","Recover review"):L("开始辅助检查","Run assisted review")}</button>
      {(reports.some(report=>report.operationId===pending?.review?.operationId)||job&&["failed","cancelled"].includes(job.status))&&<button type="button" className={css} disabled={locked} onClick={()=>{save(null);setJob(null);}}>{L("新建检查","New review")}</button>}
    </div>
    {job&&<p role="status" className="text-xs">{({queued:L("正在准备抽帧","Preparing frame extraction"),processing:L("抽帧中","Extracting frames"),completed:L("抽帧完成","Frames ready"),failed:L("抽帧失败","Frame extraction failed"),cancelled:L("已取消","Cancelled")})[job.status]} · {job.cost} {L("积分","credits")}</p>}
    {reports.map(report=><article key={report.operationId} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2"><p className="text-xs font-medium">{report.result.summary}</p>{charges[report.operationId]!==undefined&&<p className="text-xs">{L("检查已结算","Review settled")} · {charges[report.operationId]} {L("积分","credits")}</p>}<p className="text-xs text-slate-500">{L("仅抽样静帧 · 未检查声音","Sampled frames only · Audio not checked")}</p>
      <div className="flex flex-wrap gap-2">{report.frames.map(frame=><button key={frame.index} type="button" className="w-24 overflow-hidden rounded border border-slate-200 text-xs" onClick={()=>onSeek(frame.timestamp)}><img src={frame.url} alt={`${L("审片帧","Review frame")} ${frame.timestamp}s`} className="aspect-video w-full object-cover"/>{frame.timestamp}s</button>)}</div>
      {report.result.findings.map((finding,index)=>{const range=assistedFindingRange(report,index);return <div key={index} className="space-y-1 border-t border-slate-100 pt-2 text-xs"><button type="button" className="font-semibold text-blue-700" onClick={()=>onSeek(range.start,range.end)}>{range.start}{range.end===undefined?"":`–${range.end}`}s</button><p>{finding.observation}</p><p className="text-slate-500">{finding.uncertainty}</p><p>{finding.suggestion}</p><button type="button" className={css} disabled={locked||(take.annotations?.length||0)>=100} onClick={()=>onChange({...take,annotations:[...(take.annotations||[]),{id:browserRandomUUID(),...range,issue:finding.issue,note:`${finding.observation}\n${finding.uncertainty}\n${finding.suggestion}`} ]})}>{L("记为人工批注","Add to manual review")}</button></div>;})}
      <ul className="text-xs text-slate-500">{report.result.limitations.map((value,index)=><li key={index}>{value}</li>)}</ul>
    </article>)}
  </div></details>;
}
