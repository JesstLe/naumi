"use client";
import {ensureFeatureModelSelection} from "../model-config/feature-client";
import {authHeader} from "@/lib/supabase";
import {currentWorkspace,currentWorkspaceRevision} from "@/lib/saas/workspace-client";
import type {CanvasPromptTool} from "./prompt-optimization";

/** Video retains its authenticated request adapter and original response/error
 * contract. It does not select a new text model or submit a generation task. */
export async function optimizeCanvasVideoPrompt(request:typeof fetch,prompt:string,signal:AbortSignal):Promise<string>{
  const response=await request("/api/prompt-assist",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({idea:prompt,mode:"optimize",tool:"canvas-video"}),signal,
  });
  const text=await response.text();
  let data;
  try{data=text?JSON.parse(text):{};}
  catch{throw new Error(!response.ok?`服务暂时不可用(${response.status}),请刷新页面后重试`:"服务返回异常,请重试");}
  if(!response.ok||typeof data?.prompt!=="string")throw new Error(data?.error||"提示词优化失败，原文已保留");
  return data.prompt;
}

/** The browser transport captures its workspace before awaiting authentication.
 * The optimizer owns node/draft revision and cancellation; no task is submitted. */
export async function optimizeCanvasPrompt(tool:CanvasPromptTool,prompt:string,signal:AbortSignal):Promise<string>{
  const workspace=currentWorkspace(),revision=currentWorkspaceRevision();
  const modelId=await ensureFeatureModelSelection("canvas.text-generate");
  const auth=await authHeader();
  signal.throwIfAborted();
  if(currentWorkspaceRevision()!==revision)throw new Error("工作空间已切换，请重新优化");
  const response=await fetch("/api/prompt-assist",{
    method:"POST",headers:{...auth,...(modelId?{"x-naumi-feature-model":modelId}:{}),"content-type":"application/json","x-naumi-workspace":workspace},
    body:JSON.stringify({idea:prompt,mode:"optimize",tool}),signal,
  });
  const data=await response.json().catch(()=>null);
  signal.throwIfAborted();
  if(currentWorkspaceRevision()!==revision)throw new Error("工作空间已切换，请重新优化");
  if(!response.ok||typeof data?.prompt!=="string")throw new Error(data?.error||"提示词优化失败，原文已保留");
  return data.prompt;
}
