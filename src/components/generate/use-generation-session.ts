"use client";
import {useEffect,useRef} from "react";
import {authHeader} from "@/lib/supabase";
import {createGenerationSession,type GenerationDraft,type GenerationRead,type GenerationSessionContext} from "@/lib/imagegen/generation-session";
import {useImageJobResume} from "../use-image-job-resume";

type Context=Omit<GenerationSessionContext,"read"|"submit"|"remember">;
type Input={account:string|undefined;context:Context;submit:(url:string,init:RequestInit,beforeSend?:()=>void)=>Promise<Response>;changedAccount:()=>void};

/** Keep the receipt deadline through body consumption. Detaching only aborts
 * this GET; it never claims cancellation of a backend paid operation. */
async function read(jobId:string,signal:AbortSignal):Promise<GenerationRead|null>{
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal.aborted)controller.abort();else signal.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(abort,30_000);
  try{
    const headers=await authHeader();if(signal.aborted)return null;
    const response=await fetch(`/api/generate-image?job=${encodeURIComponent(jobId)}`,{cache:"no-store",headers,signal:controller.signal});
    const text=await response.text();
    return {ok:response.ok,status:response.status,data:text?JSON.parse(text):{}};
  }catch{return null;}
  finally{clearTimeout(timer);signal.removeEventListener("abort",abort);}
}
async function submit(input:GenerationDraft,account:string,beforeSend:()=>void,send:Input["submit"]):Promise<GenerationRead>{
  const body=new FormData();
  for(const [key,value] of Object.entries({prompt:input.prompt,userPrompt:input.prompt,category:input.category,ratio:input.ratio,
    resolution:input.resolution,quality:input.quality,style:input.style,count:String(input.count),email:account}))body.append(key,value);
  if(input.model)body.append("model",input.model);
  if(input.parentId)body.append("parentId",input.parentId);
  else if(input.template){body.append("templateId",input.template.id);body.append("templateImage",input.template.image);body.append("templatePrompt",input.template.prompt);}
  input.files.forEach(file=>body.append("image",file));
  const headers=await authHeader();beforeSend();
  const response=await send("/api/generate-image",{method:"POST",headers,body},beforeSend);
  return {ok:response.ok,status:response.status,data:await response.json()};
}

/** React only binds the current account, existing recovery cache, billing
 * transport and view setters. The session owns asynchronous decisions. */
export function useGenerationSession(input:Input){
  const latest=useRef(input);latest.current=input;
  const owner=useRef<ReturnType<typeof createGenerationSession>|null>(null);
  if(!owner.current)owner.current=createGenerationSession(()=>latest.current.account);
  const previous=useRef(input.account);
  useEffect(()=>{
    const release=owner.current!.bindAccount(input.account);
    if(previous.current!==input.account){previous.current=input.account;latest.current.changedAccount();}
    return release;
  },[input.account]);
  const context=useRef<GenerationSessionContext|null>(null);
  const remember=useImageJobResume("generate-image",input.account,id=>{if(context.current)void owner.current!.resume(id,context.current);});
  context.current={...input.context,read,remember,submit:(draft,account,guard)=>submit(draft,account,guard,input.submit)};
  return {generate:(draft:GenerationDraft)=>owner.current!.generate(draft,context.current!)};
}
