"use client";
import { useEffect,useRef } from "react";
import { useSearchParams } from "next/navigation";
import { readBrowserImage } from "@/lib/browser-image-cache";
import { agentMediaUrl } from "@/lib/agent/media-policy";
import { currentWorkspace,currentWorkspaceRevision } from "@/lib/saas/workspace-client";
import { toolImageError } from "@/lib/tool-ui";

/** Explicit image deep link -> the tool's existing picker. No processing or
 * automatic generation. A late read cannot overwrite manual selection or cross
 * account/workspace identity. */
export function useToolReference({account,empty,busy,onFile,onError}:{account:string|undefined;empty:boolean;busy:boolean;onFile:(file:File)=>void;onError:(message:string)=>void}){
  const params=useSearchParams(),source=params.get("src")||"";
  const current=useRef({account,empty,busy,onFile,onError});current.current={account,empty,busy,onFile,onError};
  const consumed=useRef("");
  useEffect(()=>{
    const key=JSON.stringify([account,source]);
    if(!account||!source||!empty||busy||consumed.current===key||!agentMediaUrl(source))return;
    const abort=new AbortController(),workspace=currentWorkspace(),revision=currentWorkspaceRevision();
    const valid=()=>!abort.signal.aborted&&current.current.account===account&&current.current.empty&&!current.current.busy&&workspace===currentWorkspace()&&revision===currentWorkspaceRevision();
    void readBrowserImage(source,abort.signal).then(blob=>{
      if(!valid())return;
      const extension=blob.type==="image/webp"?"webp":blob.type==="image/jpeg"?"jpg":"png";
      const file=new File([blob],`naumi-reference.${extension}`,{type:blob.type});
      if(toolImageError(file))throw Error("参考图需为12MB以内的PNG / JPG / WebP图片");
      consumed.current=key;current.current.onFile(file);
    }).catch(error=>{if(valid())current.current.onError(error instanceof Error?error.message:"参考图读取失败，请重试");});
    return()=>abort.abort();
  },[account,source,empty,busy]);
}
