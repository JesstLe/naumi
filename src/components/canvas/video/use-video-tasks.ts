"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {PublicVideoTaskView} from "@/lib/video/service";
import type {VideoPrivateFetch} from "./use-video-nodes";
export function useVideoTasks({email,projectKey,readOnly,request,onCompleted}:{email?:string;projectKey?:string|null;readOnly:boolean;request:VideoPrivateFetch;onCompleted:(task:PublicVideoTaskView,projectKey:string)=>Promise<void>}){
  const [tasks,setTasks]=useState<PublicVideoTaskView[]>([]),[error,setError]=useState("");
  const completed=useRef(new Set<string>()),onCompletedRef=useRef(onCompleted),epochRef=useRef(0);onCompletedRef.current=onCompleted;
  const contextRef=useRef("");contextRef.current=JSON.stringify([email,projectKey,readOnly]);
  const refresh=useCallback(async()=>{if(!email||!projectKey)return;const epoch=epochRef.current,context=JSON.stringify([email,projectKey,readOnly]);
    const response=await request(`/api/video/tasks?projectKey=${encodeURIComponent(projectKey)}&email=${encodeURIComponent(email)}&limit=500`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"视频任务恢复失败");
    if(epoch!==epochRef.current||contextRef.current!==context)return;const incoming=(Array.isArray(data.tasks)?data.tasks:[]) as PublicVideoTaskView[];setTasks(incoming);setError("");
    if(!readOnly)for(const task of incoming){if(epoch!==epochRef.current||contextRef.current!==context)return;if(task.status!=="completed"||completed.current.has(task.id))continue;await onCompletedRef.current(task,projectKey);if(epoch===epochRef.current&&contextRef.current===context)completed.current.add(task.id);}
  },[email,projectKey,readOnly,request]);
  useEffect(()=>{epochRef.current++;completed.current.clear();setTasks([]);setError("");if(!email||!projectKey)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;const run=async()=>{try{await refresh();}catch(cause){if(!stopped)setError(cause instanceof Error?cause.message:"视频任务恢复失败");}if(!stopped)timer=setTimeout(run,4000);};void run();return()=>{stopped=true;clearTimeout(timer);};
  },[email,projectKey,readOnly,refresh]);
  const cancel=useCallback(async(taskId:string)=>{if(!email||readOnly)throw new Error("无法停止此任务");const response=await request(`/api/video/tasks/${encodeURIComponent(taskId)}/cancel`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error||"停止请求失败");await refresh();return data;},[email,readOnly,request,refresh]);
  return {tasks,error,refresh,cancel};
}
