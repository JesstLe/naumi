"use client";
import {authHeader} from "../supabase";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";
import {ImagegenHttpError,readImagegenResponse} from "./http";
import {prepareReferenceImage} from "../browser-reference-image";
export {ImagegenHttpError} from "./http";
export type ImagegenBatchResult={id:string;status:string;totalCredits:number;chargedCredits:number;items:{key:string;state:string;name:string;prompt:string;attempts:number;result:ImagegenResult}[]};
export type ImagegenConfirmation={billingVersion:number;modelVersion:number;credits:number;confirmed:boolean};
export type ImagegenClientContext={projectContext?:string;workspace?:string};
const contextHeaders=(context?:ImagegenClientContext)=>({...context?.projectContext?{'x-naumi-project-context':context.projectContext}:{},...context?.workspace?{'x-naumi-workspace':context.workspace}:{}});
export async function imagegenFetch<T>(path:string,body?:unknown,context?:ImagegenClientContext):Promise<T>{
 const response=await fetch(path,{method:body===undefined?"GET":"POST",signal:AbortSignal.timeout(30_000),cache:"no-store",headers:{...await authHeader(),...contextHeaders(context),...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return readImagegenResponse<T>(response,"图像请求失败");
}
export const previewImagegen=(request:ImagegenRequest,context?:ImagegenClientContext)=>imagegenFetch<ImagegenPlan>("/api/imagegen/plan",request,context);
export async function startImagegen(request:ImagegenRequest,confirmation?:ImagegenConfirmation,context?:ImagegenClientContext):Promise<ImagegenResult|{id:string}>{return imagegenFetch("/api/imagegen",{...request,confirmation},context);}
export const pollImagegen=(id:string)=>imagegenFetch<ImagegenResult>(`/api/imagegen?operationId=${encodeURIComponent(id)}`);
export const pollImagegenBatch=(id:string)=>imagegenFetch<ImagegenBatchResult>(`/api/imagegen/batches/${encodeURIComponent(id)}`);
export const cancelImagegen=(id:string,batch:boolean)=>imagegenFetch(`/api/imagegen/${batch?`batches/${encodeURIComponent(id)}`:"cancel"}`,{action:"cancel",operationId:id});
export async function uploadImagegenInput(file:File,count=1,assertCurrent?:()=>void,context?:ImagegenClientContext,sourceArtworkId?:string){
 const prepared=await prepareReferenceImage(file,count);
 assertCurrent?.();const headers={...await authHeader(),...contextHeaders(context)};assertCurrent?.();
 const upload=async(value:File)=>{assertCurrent?.();const body=new FormData();body.set('image',value);const response=await fetch('/api/imagegen/inputs',{method:'POST',headers,body});return readImagegenResponse<{artworkId:string;url:string;width:number;height:number}>(response,'素材上传失败');};
 // Preserve an exact canvas source when one exists. A standalone optimized
 // reference has no retained original; the evidence reader must say so.
 assertCurrent?.();const result=await upload(prepared.file);
 return {...result,originalArtworkId:sourceArtworkId||(!prepared.optimized?result.artworkId:undefined),inputVariant:prepared.optimized||!!sourceArtworkId?'processed' as const:'original' as const,sourceWidth:prepared.sourceWidth,sourceHeight:prepared.sourceHeight};
}
