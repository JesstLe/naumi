"use client";
import {authHeader} from "../supabase";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";
import {ImagegenHttpError,readImagegenResponse} from "./http";
import {prepareReferenceImage} from "../browser-reference-image";
export {ImagegenHttpError} from "./http";
export type ImagegenBatchResult={id:string;status:string;totalCredits:number;chargedCredits:number;items:{key:string;state:string;name:string;prompt:string;attempts:number;result:ImagegenResult}[]};
export type ImagegenConfirmation={billingVersion:number;modelVersion:number;credits:number;confirmed:boolean;quoteId?:string};
export type ImagegenClientContext={projectContext?:string;workspace?:string;headers?:Record<string,string>;isCurrent?:()=>boolean};
/** Persist only scope selectors. Authentication and continuation tokens must
 * never enter a recovery receipt, even if a caller supplies all its headers. */
export function imagegenScopeHeaders(headers?:Record<string,string>){return Object.fromEntries(Object.entries(headers||{}).filter(([key,value])=>/^x-naumi-(workspace|project-context|scope|tenant(?:-id)?|creation-parent)$/i.test(key)&&typeof value==='string').map(([key,value])=>[key.toLowerCase(),value]));}
// Receipt callers must use their original context, never authHeader's current
// workspace. An old caller without captured scope belongs to personal.
const contextHeaders=(context?:ImagegenClientContext)=>{const headers=imagegenScopeHeaders(context?.headers);return {...headers,'x-naumi-workspace':context?.workspace||headers['x-naumi-workspace']||'personal',...context?.projectContext?{'x-naumi-project-context':context.projectContext}:{}};};
function assertCurrent(context?:ImagegenClientContext,accepted?:boolean){if(context?.isCurrent?.()===false)throw new ImagegenHttpError('画布账号、项目或工作空间已切换',0,accepted);}
const authContextHeaders=async(context?:ImagegenClientContext)=>{
 const headers=await authHeader();
 // Creation scope is supplied only by the captured context, never today's UI.
 for(const key of Object.keys(headers))if(/^x-naumi-(workspace|project-context|scope|tenant(?:-id)?|creation-parent|creation-context)$/i.test(key))delete headers[key];
 return {...headers,...contextHeaders(context)};
};
export async function imagegenFetch<T>(path:string,body?:unknown,context?:ImagegenClientContext):Promise<T>{
 assertCurrent(context,body===undefined?undefined:false);const headers={...await authContextHeaders(context),...(body===undefined?{}:{"content-type":"application/json"})};assertCurrent(context,body===undefined?undefined:false);
 const response=await fetch(path,{method:body===undefined?"GET":"POST",signal:AbortSignal.timeout(30_000),cache:"no-store",headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await readImagegenResponse<T>(response,"图像请求失败");assertCurrent(context);return result;
}
export const previewImagegen=(request:ImagegenRequest,context?:ImagegenClientContext)=>imagegenFetch<ImagegenPlan>("/api/imagegen/plan",request,context);
export async function startImagegen(request:ImagegenRequest,confirmation?:ImagegenConfirmation,context?:ImagegenClientContext):Promise<ImagegenResult|{id:string}>{return imagegenFetch("/api/imagegen",confirmation?.quoteId?{operationId:request.operationId,quoteId:confirmation.quoteId,confirmed:confirmation.confirmed}:{...request,confirmation},context);}
export const pollImagegen=(id:string,context?:ImagegenClientContext)=>imagegenFetch<ImagegenResult>(`/api/imagegen?operationId=${encodeURIComponent(id)}`,undefined,context);
export const pollImagegenBatch=(id:string,context?:ImagegenClientContext)=>imagegenFetch<ImagegenBatchResult>(`/api/imagegen/batches/${encodeURIComponent(id)}`,undefined,context);
export const cancelImagegen=(id:string,batch:boolean,context?:ImagegenClientContext)=>imagegenFetch(`/api/imagegen/${batch?`batches/${encodeURIComponent(id)}`:"cancel"}`,{action:"cancel",operationId:id},context);
export async function uploadImagegenInput(file:File,count=1,assertCurrent?:()=>void,context?:ImagegenClientContext,sourceArtworkId?:string){
 const prepared=await prepareReferenceImage(file,count);
 assertCurrent?.();const headers=await authContextHeaders(context);assertCurrent?.();
 const upload=async(value:File)=>{assertCurrent?.();const body=new FormData();body.set('image',value);const response=await fetch('/api/imagegen/inputs',{method:'POST',headers,body});return readImagegenResponse<{artworkId:string;url:string;width:number;height:number}>(response,'素材上传失败');};
 // Preserve an exact canvas source when one exists. A standalone optimized
 // reference has no retained original; the evidence reader must say so.
 assertCurrent?.();const result=await upload(prepared.file);
 return {...result,originalArtworkId:sourceArtworkId||(!prepared.optimized?result.artworkId:undefined),inputVariant:prepared.optimized||!!sourceArtworkId?'processed' as const:'original' as const,sourceWidth:prepared.sourceWidth,sourceHeight:prepared.sourceHeight};
}
