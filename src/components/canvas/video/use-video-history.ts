"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {type PublicVideoTaskView} from "@/lib/video/queries";
import type {PublicVideoTaskSnapshot} from "@/lib/video/task-snapshot";
import type {PublicQuote} from "@/lib/billing/client";
import type {VideoPrivateFetch} from "./use-video-nodes";
export type VideoTaskDetail={task:PublicVideoTaskView;snapshot:PublicVideoTaskSnapshot};
export type CanvasVideoSend={artworkId:string;artworkIds?:string[];inputArtworkIds?:string[];nodeId:string;projectKey:string;reused:boolean;replayed?:boolean};
export class VideoRetryPriceChanged extends Error{constructor(public quote:PublicQuote){super("价格已更新，请重新确认重试");}}
type Cursor={createdAt:string;id:string};
const active=(task:PublicVideoTaskView)=>task.status==="queued"||task.status==="processing";
const terminal=(task:PublicVideoTaskView)=>["completed","failed","cancelled"].includes(task.status);
async function json(response:Response){try{return await response.json();}catch{throw new Error("视频服务响应尚未核实，请稍后重试");}}
export function useVideoHistory({email,projectKey,source,nodeId,readOnly=false,request,onCompleted}:{email?:string;projectKey?:string|null;source?:string;nodeId?:string;readOnly?:boolean;request:VideoPrivateFetch;onCompleted?:(task:PublicVideoTaskView)=>Promise<void>}){
  const [tasks,setTasks]=useState<PublicVideoTaskView[]>([]),[error,setError]=useState(""),[nextCursor,setNextCursor]=useState<Cursor|null>(null);
  const tasksRef=useRef(tasks),completed=useRef(new Set<string>()),onCompleteRef=useRef(onCompleted),paginationInitialized=useRef(false),busy=useRef(new Map<string,Promise<{taskId:string;cost:number}>>());onCompleteRef.current=onCompleted;
  const identity=JSON.stringify([email,projectKey,source,nodeId,readOnly]),stamp=useRef({identity,revision:0});if(stamp.current.identity!==identity)stamp.current={identity,revision:stamp.current.revision+1};const context=JSON.stringify(stamp.current),contextRef=useRef(context);contextRef.current=context;
  const merge=useCallback(async(incoming:PublicVideoTaskView[],expected:string)=>{if(contextRef.current!==expected)return;const next=new Map(tasksRef.current.map(task=>[task.id,task]));
    for(const task of incoming){const old=next.get(task.id);if(!old||(!old.updatedAt||!task.updatedAt||old.updatedAt<=task.updatedAt)&&(!terminal(old)||terminal(task)))next.set(task.id,task);}
    tasksRef.current=[...next.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));setTasks(tasksRef.current);
    if(!readOnly)for(const task of incoming){if(contextRef.current!==expected)return;if(task.status==="completed"&&!completed.current.has(task.id)){await onCompleteRef.current?.(task);if(contextRef.current===expected)completed.current.add(task.id);}}
  },[readOnly]);
  const refresh=useCallback(async(cursor?:Cursor)=>{if(!email)return;const params=new URLSearchParams({limit:"30",email});if(projectKey)params.set("projectKey",projectKey);if(source)params.set("source",source);if(nodeId)params.set("nodeId",nodeId);if(cursor)params.set("cursor",JSON.stringify(cursor));
    const response=await request(`/api/video/tasks?${params}`,{cache:"no-store"}),data=await json(response);if(!response.ok)throw new Error(data.error||"视频历史恢复失败");if(contextRef.current!==context)return;await merge(data.tasks||[],context);if(contextRef.current===context){if(cursor||!paginationInitialized.current){setNextCursor(data.nextCursor||null);paginationInitialized.current=true;}setError("");}
  },[email,projectKey,source,nodeId,readOnly,request,context,merge]);
  useEffect(()=>{tasksRef.current=[];setTasks([]);setError("");setNextCursor(null);completed.current.clear();busy.current.clear();paginationInitialized.current=false;if(!email)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>,round=0;const run=async()=>{try{if(round++%4===0)await refresh();if(stopped||contextRef.current!==context)return;
      if(!readOnly)for(const task of tasksRef.current.filter(active)){const response=await request(`/api/video/tasks?id=${encodeURIComponent(task.id)}`,{cache:"no-store"}),data=await json(response);if(!response.ok)throw new Error(data.error||"视频任务暂不可用，等待恢复");if(stopped||contextRef.current!==context)return;await merge([data.task],context);}if(!stopped&&contextRef.current===context)setError("");
    }catch(cause){if(!stopped&&contextRef.current===context)setError(cause instanceof Error?cause.message:"视频历史恢复失败");}if(!stopped)timer=setTimeout(run,tasksRef.current.some(active)?4000:12000);};void run();return()=>{stopped=true;clearTimeout(timer);};
  },[email,readOnly,context,refresh,request,merge]);
  const detail=useCallback(async(id:string):Promise<VideoTaskDetail>=>{if(!email)throw new Error("请先登录");const response=await request(`/api/video/tasks/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,{cache:"no-store"}),data=await json(response);if(!response.ok)throw new Error(data.error||"任务详情读取失败");if(contextRef.current!==context)throw new Error("账号或项目已切换");await merge([data.task],context);return data;},[email,request,context,merge]);
  const quote=useCallback(async(value:VideoTaskDetail):Promise<PublicQuote|null>=>{if(value.snapshot.byoc)return null;const config=value.snapshot.config,response=await request("/api/billing/quote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({feature:"video.generate",quantity:1,modelId:config.modelId||value.task.model,providerId:config.providerId,resolution:config.resolution,quality:"medium"})}),data=await json(response);if(!response.ok)throw new Error(data.error||"重试报价失败");if(contextRef.current!==context)throw new Error("账号或项目已切换");return data as PublicQuote;},[request,context]);
  const retry=useCallback(async(value:VideoTaskDetail,confirmed:PublicQuote|null)=>{if(!email||readOnly||!['failed','cancelled'].includes(value.task.status))throw new Error("此任务暂不可重试");if(!value.snapshot.byoc&&!confirmed)throw new Error("请先确认重试报价");
    const actor=email,key=`naumi:video-retry:v1:${actor.toLowerCase()}:${value.task.id}`,running=busy.current.get(key);if(running)return running;
    const run=async()=>{const saved=localStorage.getItem(key),operationId=saved&&/^[0-9a-f-]{36}$/.test(saved)?saved:browserRandomUUID();localStorage.setItem(key,operationId);
      const lookup=await request(`/api/video/tasks?idempotencyKey=${encodeURIComponent(operationId)}`,{cache:"no-store"}),known=await json(lookup);if(contextRef.current!==context)throw new Error("账号或项目已切换");
      if(lookup.ok&&known.task){if(known.task.retryOf!==value.task.id)throw new Error("操作编号已用于其他任务");await merge([known.task],context);if(localStorage.getItem(key)===operationId)localStorage.removeItem(key);return {taskId:String(known.task.id),cost:Number(known.task.cost)};}
      if(lookup.status!==404)throw new Error(known.error||"上次重试尚未核实，操作编号已保留");
      const response=await request(`/api/video/tasks/${encodeURIComponent(value.task.id)}/retry`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:operationId,...(confirmed?{billingVersion:confirmed.version,billingCredits:confirmed.mode==="api-cost-plus"?confirmed.authorizedCredits??confirmed.reserveCredits:confirmed.credits}:{})})}),data=await json(response);
      if(!response.ok){if(response.status===409&&data.code==="PRICE_CHANGED"){const current=await quote(value);if(current)throw new VideoRetryPriceChanged(current);}if(response.status>=400&&response.status<500&&response.status!==409&&localStorage.getItem(key)===operationId)localStorage.removeItem(key);throw new Error(data.error||"重试尚未核实，操作编号已保留");}
      if(typeof data.taskId!=="string"||!data.taskId||!Number.isFinite(Number(data.cost)))throw new Error("创建响应尚未核实，操作编号已保留");
      if(localStorage.getItem(key)===operationId)localStorage.removeItem(key);if(contextRef.current!==context)throw new Error("任务已创建，返回原账号或项目查看");await refresh();return {taskId:data.taskId,cost:Number(data.cost)};
    };const promise=run();busy.current.set(key,promise);try{return await promise;}finally{if(busy.current.get(key)===promise)busy.current.delete(key);}
  },[email,readOnly,request,context,merge,quote,refresh]);
  const cancel=useCallback(async(id:string)=>{if(!email||readOnly)throw new Error("无法停止任务");const response=await request(`/api/video/tasks/${encodeURIComponent(id)}/cancel`,{method:"POST"}),data=await json(response);if(!response.ok)throw new Error(data.error||"停止请求失败");await refresh();return data;},[email,readOnly,request,refresh]);
  const remove=useCallback(async(id:string)=>{if(!email||readOnly)throw new Error("无法删除任务");const response=await request(`/api/video/tasks/${encodeURIComponent(id)}`,{method:"DELETE"}),data=await json(response);if(!response.ok)throw new Error(data.error||"删除失败");if(contextRef.current===context){tasksRef.current=tasksRef.current.filter(task=>task.id!==id);setTasks(tasksRef.current);}},[email,readOnly,request,context]);
  const send=useCallback(async(id:string,target?:string):Promise<CanvasVideoSend>=>{if(!email||readOnly)throw new Error("无法发送任务结果");const response=await request(`/api/video/tasks/${encodeURIComponent(id)}/send-to-canvas`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectKey:target})}),data=await json(response);if(!response.ok)throw new Error(data.error||"发送失败");if(contextRef.current!==context)throw new Error("发送已完成，返回目标项目查看");return data;},[email,readOnly,request,context]);
  return {tasks,error,refresh,merge,detail,quote,retry,cancel,remove,send,nextCursor,loadMore:()=>nextCursor?refresh(nextCursor):Promise.resolve()};
}
