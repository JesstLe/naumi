"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {type PublicVideoTaskView} from "@/lib/video/queries";
import type {VideoPrivateFetch} from "./use-video-nodes";
import {reuseVideoTaskSnapshots} from '@/lib/video/polling-state';
import {visibleTimeout} from "@/lib/visible-timeout";
export function useVideoTasks({email,projectKey,readOnly,request,onCompleted}:{email?:string;projectKey?:string|null;readOnly:boolean;request:VideoPrivateFetch;onCompleted:(task:PublicVideoTaskView,projectKey:string)=>Promise<void>}){
  const [tasks,setTasks]=useState<PublicVideoTaskView[]>([]),[error,setError]=useState("");
  const completed=useRef(new Set<string>()),onCompletedRef=useRef(onCompleted),epochRef=useRef(0);onCompletedRef.current=onCompleted;
  const contextRef=useRef("");contextRef.current=JSON.stringify([email,projectKey,readOnly]);
  // Fast only while this project has queued/processing work; a submit-triggered refresh wakes the loop.
  const activeRef=useRef(false),wakeRef=useRef<(()=>void)|null>(null);
  const refresh=useCallback(async()=>{if(!email||!projectKey)return;const epoch=epochRef.current,context=JSON.stringify([email,projectKey,readOnly]);
    const response=await request(`/api/video/tasks?projectKey=${encodeURIComponent(projectKey)}&email=${encodeURIComponent(email)}&limit=500`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"视频任务恢复失败");
    if(epoch!==epochRef.current||contextRef.current!==context)return;const incoming=(Array.isArray(data.tasks)?data.tasks:[]) as PublicVideoTaskView[];setTasks(previous=>reuseVideoTaskSnapshots(previous,incoming));setError("");
    const wasActive=activeRef.current;activeRef.current=incoming.some(task=>task.status==="queued"||task.status==="processing");if(activeRef.current&&!wasActive)wakeRef.current?.();
    if(!readOnly)for(const task of incoming){if(epoch!==epochRef.current||contextRef.current!==context)return;if(task.status!=="completed"||completed.current.has(task.id))continue;await onCompletedRef.current(task,projectKey);if(epoch===epochRef.current&&contextRef.current===context)completed.current.add(task.id);}
  },[email,projectKey,readOnly,request]);
  useEffect(()=>{epochRef.current++;completed.current.clear();setTasks([]);setError("");if(!email||!projectKey)return;
    let stopped=false,cancel:(()=>void)|undefined;activeRef.current=false;
    const schedule=(delay:number)=>{cancel?.();if(!stopped)cancel=visibleTimeout(run,delay);};
    const run=async()=>{cancel=undefined;try{await refresh();}catch(cause){if(!stopped)setError(cause instanceof Error?cause.message:"视频任务恢复失败");}if(!stopped&&!cancel)schedule(activeRef.current?4000:30000);};
    wakeRef.current=()=>schedule(4000);void run();return()=>{stopped=true;wakeRef.current=null;cancel?.();};
  },[email,projectKey,readOnly,refresh]);
  const cancel=useCallback(async(taskId:string)=>{if(!email||readOnly)throw new Error("无法停止此任务");const response=await request(`/api/video/tasks/${encodeURIComponent(taskId)}/cancel`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error||"停止请求失败");await refresh();return data;},[email,readOnly,request,refresh]);
  return {tasks,error,refresh,cancel};
}
