"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {PublicMediaJob,MediaJobRequest} from "@/lib/video/media-job-schema";
import {mediaIntent,readMediaReceipt,writeMediaReceipt,clearMediaReceipt,clearTerminalMediaReceipts,type MediaJobIntent} from "@/lib/video/media-client-intent";
import type {VideoPrivateFetch} from "./use-video-nodes";
export class MediaQuoteRequired extends Error{constructor(public quote:NonNullable<MediaJobRequest["billingConfirmation"]>){super("请确认本次媒体处理积分");}}
type Cursor={createdAt:string;id:string};
type Options={email?:string;projectKey?:string|null;source?:MediaJobRequest["source"];readOnly:boolean;request:VideoPrivateFetch;onCompleted:(job:PublicMediaJob)=>Promise<void>};
const pending=(job:PublicMediaJob)=>job.status==="queued"||job.status==="processing";
async function body(response:Response){try{return await response.json();}catch{throw new Error("媒体服务响应暂不可用，操作编号已保留");}}
export function useMediaJobs({email,projectKey,source,readOnly,request,onCompleted}:Options){
  const [jobs,setJobs]=useState<PublicMediaJob[]>([]),[error,setError]=useState(""),[nextCursor,setNextCursor]=useState<Cursor|null>(null);
  const jobsRef=useRef(jobs),contextRef=useRef(""),completed=useRef(new Set<string>()),completionRef=useRef(onCompleted),busy=useRef(new Map<string,Promise<PublicMediaJob>>()),paginationInitialized=useRef(false);completionRef.current=onCompleted;
  const identity=JSON.stringify([email,projectKey,source,readOnly]),identityRef=useRef({value:identity,revision:0});if(identityRef.current.value!==identity)identityRef.current={value:identity,revision:identityRef.current.revision+1};
  const context=JSON.stringify([identity,identityRef.current.revision]);contextRef.current=context;
  const merge=useCallback(async(incoming:PublicMediaJob[],expected:string)=>{if(contextRef.current!==expected)return;
    const next=new Map(jobsRef.current.map(job=>[job.id,job]));for(const job of incoming){const old=next.get(job.id);if(!old||old.updatedAt<=job.updatedAt&&(pending(old)||!pending(job)))next.set(job.id,job);}jobsRef.current=[...next.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));setJobs(jobsRef.current);
    for(const job of incoming){if(contextRef.current!==expected)return;if(job.status==="completed"&&!completed.current.has(job.id)){await completionRef.current(job);if(contextRef.current===expected)completed.current.add(job.id);}if(contextRef.current===expected&&!pending(job)&&email){try{clearTerminalMediaReceipts(localStorage,email,job.operationId);}catch{/* A retained receipt can be recovered by operationId on the next explicit retry. */}}}
  },[email]);
  const refresh=useCallback(async(cursor?:Cursor)=>{if(!email||readOnly)return;const params=new URLSearchParams({limit:"30"});if(projectKey)params.set("projectKey",projectKey);if(source)params.set("source",source);if(cursor)params.set("cursor",JSON.stringify(cursor));
    const response=await request(`/api/video/media-jobs?${params}`,{cache:"no-store"}),data=await body(response);if(!response.ok)throw new Error(data.error||"媒体任务恢复失败");if(contextRef.current!==context)return;await merge(data.jobs||[],context);if(contextRef.current===context){if(cursor||!paginationInitialized.current){setNextCursor(data.nextCursor||null);paginationInitialized.current=true;}setError("");}
  },[email,projectKey,source,readOnly,request,context,merge]);
  useEffect(()=>{jobsRef.current=[];setJobs([]);setError("");setNextCursor(null);paginationInitialized.current=false;completed.current.clear();busy.current.clear();if(!email||readOnly)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>,round=0;const run=async()=>{try{if(round++%5===0)await refresh();if(stopped||contextRef.current!==context)return;
      // Get performs durable Worker recovery/publication; its elapsed media seconds are real, not a percentage estimate.
      for(const job of jobsRef.current.filter(pending)){const response=await request(`/api/video/media-jobs/${encodeURIComponent(job.id)}`,{cache:"no-store"}),data=await body(response);if(!response.ok)throw new Error(data.error||"媒体任务暂不可用，等待恢复");if(stopped||contextRef.current!==context)return;await merge([data.job],context);}if(!stopped&&contextRef.current===context)setError("");
    }catch(cause){if(!stopped&&contextRef.current===context)setError(cause instanceof Error?cause.message:"媒体任务恢复失败");}if(!stopped)timer=setTimeout(run,jobsRef.current.some(pending)?2500:10000);};void run();return()=>{stopped=true;clearTimeout(timer);};
  },[email,readOnly,context,refresh,request,merge]);
  const submit=useCallback(async(raw:MediaJobIntent,confirmation?:MediaJobRequest["billingConfirmation"]):Promise<PublicMediaJob>=>{if(!email||readOnly)throw new Error("无法处理此媒体");const actor=email,{intent,fingerprint}=await mediaIntent(raw);if(contextRef.current!==context)throw new Error("账号或项目已切换");
    const active=busy.current.get(fingerprint);if(active)return active;
    const run=async()=>{let receipt=readMediaReceipt(localStorage,actor,fingerprint);if(receipt){const response=await request(`/api/video/media-jobs?operationId=${encodeURIComponent(receipt.operationId)}`,{cache:"no-store"}),data=await body(response);if(!response.ok)throw new Error(data.error||"上次提交尚未核实，请稍后重试");if(contextRef.current!==context)throw new Error("账号或项目已切换");const recovered=(data.jobs||[])[0] as PublicMediaJob|undefined;
      if(recovered){writeMediaReceipt(localStorage,actor,{...receipt,jobId:recovered.id});await merge([recovered],context);if(!pending(recovered))clearMediaReceipt(localStorage,actor,receipt);return recovered;}}
      receipt=receipt||{fingerprint,operationId:browserRandomUUID()};writeMediaReceipt(localStorage,actor,receipt);
      const response=await request("/api/video/media-jobs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...intent,operationId:receipt.operationId,billingConfirmation:confirmation})}),data=await body(response);
      if(!response.ok){if(response.status===409&&data.code==="PRICE_CHANGED"&&data.quote)throw new MediaQuoteRequired(data.quote);if(response.status>=400&&response.status<500&&response.status!==409)clearMediaReceipt(localStorage,actor,receipt);throw new Error(data.error||"媒体处理提交尚未核实，操作编号已保留");}
      const job=data.job as PublicMediaJob;writeMediaReceipt(localStorage,actor,{...receipt,jobId:job.id});if(contextRef.current!==context)throw new Error("任务已提交，返回原项目查看进度");await merge([job],context);if(!pending(job))clearMediaReceipt(localStorage,actor,receipt);return job;
    };const promise=run();busy.current.set(fingerprint,promise);try{return await promise;}finally{if(busy.current.get(fingerprint)===promise)busy.current.delete(fingerprint);}
  },[email,readOnly,request,context,merge]);
  const cancel=useCallback(async(id:string)=>{if(!email||readOnly)throw new Error("无法停止此任务");const response=await request(`/api/video/media-jobs/${encodeURIComponent(id)}`,{method:"DELETE"}),data=await body(response);if(!response.ok)throw new Error(data.error||"停止请求失败");await merge([data.job],context);},[email,readOnly,request,merge,context]);
  const estimate=useCallback(async(action:MediaJobRequest["action"])=>{if(!email||readOnly)throw new Error("无法读取媒体处理报价");const response=await request(`/api/video/media-jobs/quote?action=${encodeURIComponent(action)}`,{cache:"no-store"}),data=await body(response);if(!response.ok)throw new Error(data.error||"媒体处理报价失败");if(contextRef.current!==context)throw new Error("账号或项目已切换");return data.quote as NonNullable<MediaJobRequest["billingConfirmation"]>;},[email,readOnly,request,context]);
  return {jobs,error,refresh,submit,cancel,estimate,nextCursor,loadMore:()=>nextCursor?refresh(nextCursor):Promise.resolve()};
}
