"use client";
import { useEffect,useState } from "react";
import { authHeader } from "@/lib/supabase";
import { currentWorkspace, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
export type CreationProject={projectKey:string;name:string;cover:string;updatedAt:string};

export function useCreationProjects(account:string,ready:boolean,allowed:boolean){
  const [workspace,setWorkspace]=useState(currentWorkspace),[attempt,setAttempt]=useState(0);
  const key=JSON.stringify([account,workspace,ready,allowed]);
  const [result,setResult]=useState<{key:string;projects:CreationProject[];error:string;loading:boolean}>({key:"",projects:[],error:"",loading:false});
  useEffect(()=>{const sync=()=>setWorkspace(currentWorkspace());window.addEventListener(WORKSPACE_SELECTION,sync);return()=>window.removeEventListener(WORKSPACE_SELECTION,sync);},[]);
  useEffect(()=>{
    if(!account||!ready||!allowed)return;
    const controller=new AbortController();setResult({key,projects:[],error:"",loading:true});
    void authHeader().then(headers=>{if(controller.signal.aborted)return;return fetch("/api/canvas/projects",{headers,signal:controller.signal,cache:"no-store"});}).then(async response=>{if(!response)return;if(!response.ok)throw Error("画布列表读取失败");const data=await response.json();if(!controller.signal.aborted)setResult({key,projects:data.projects||[],error:"",loading:false});}).catch(()=>{if(!controller.signal.aborted)setResult({key,projects:[],error:"画布列表读取失败",loading:false});});
    return()=>controller.abort();
  },[key,attempt,account,ready,allowed]);
  return {...(result.key===key?result:{projects:[],error:"",loading:!!account&&ready&&allowed}),retry:()=>setAttempt(n=>n+1)};
}
