"use client";
import {useEffect,useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import {storyboardForkSchema,type StoryboardFork,type StoryboardForkResult} from "@/lib/storyboard/fork";
import type {VideoPrivateFetch} from "./use-video-nodes";

/** Persist the complete operation before sending. Scope switches never replay another scope's intent. */
export function useStoryboardFork(scope:string,projectKey:string,request:VideoPrivateFetch){
  const workspace=currentWorkspace(),key=`naumi:storyboard-fork:v1:${JSON.stringify([scope,workspace,projectKey])}`;
  const [pending,setPending]=useState<StoryboardFork|null>(null),current=useRef<StoryboardFork|null>(null),identity=useRef(key);identity.current=key;
  useEffect(()=>{identity.current=key;let value:StoryboardFork|null=null;try{const parsed=storyboardForkSchema.safeParse(JSON.parse(localStorage.getItem(key)||"null"));if(parsed.success&&parsed.data.projectKey===projectKey)value=parsed.data;}catch{}current.current=value;setPending(value);return()=>{if(identity.current===key)identity.current="";};},[key,projectKey]);
  async function submit(prepare:()=>Promise<Omit<StoryboardFork,"operationId"|"projectKey">>):Promise<StoryboardForkResult>{
    const captured=key,body=current.current||storyboardForkSchema.parse({...await prepare(),projectKey,operationId:browserRandomUUID()});
    if(identity.current!==captured)throw new Error("项目已切换，未提交独立版本");
    localStorage.setItem(captured,JSON.stringify(body));current.current=body;setPending(body);
    const response=await request("/api/canvas/storyboards/fork",{method:"POST",headers:{"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},body:JSON.stringify(body)}),value=await response.json();
    if(identity.current!==captured)throw new Error("项目已切换，原分叉操作保留待核对");
    if(!response.ok){if([409,422].includes(response.status)){localStorage.removeItem(captured);current.current=null;setPending(null);}throw new Error(value.error||"独立版本结果尚未核实，请沿用原操作核对");}
    localStorage.removeItem(captured);current.current=null;setPending(null);return value;
  }
  return {pending,submit};
}
