"use client";
import {authHeader} from "../supabase";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";
export type ImagegenBatchResult={id:string;status:string;totalCredits:number;chargedCredits:number;items:{key:string;state:string;name:string;prompt:string;attempts:number;result:ImagegenResult}[]};
export type ImagegenConfirmation={billingVersion:number;modelVersion:number;credits:number;confirmed:boolean};
export class ImagegenHttpError extends Error {constructor(message:string,public status:number,public accepted?:boolean){super(message);}}
export async function imagegenFetch<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(path,{method:body===undefined?"GET":"POST",cache:"no-store",headers:{...await authHeader(),...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await response.json();
 if(!response.ok)throw new ImagegenHttpError(data.error||"图像请求失败",response.status,typeof data.accepted==="boolean"?data.accepted:undefined);return data;
}
export const previewImagegen=(request:ImagegenRequest)=>imagegenFetch<ImagegenPlan>("/api/imagegen/plan",request);
export async function startImagegen(request:ImagegenRequest,confirmation?:ImagegenConfirmation):Promise<ImagegenResult|{id:string}>{try{return await imagegenFetch("/api/imagegen",{...request,confirmation});}catch(error){if(error instanceof ImagegenHttpError&&error.accepted===false)throw error;try{return request.mode==="batch"?await pollImagegenBatch(request.operationId):await pollImagegen(request.operationId);}catch{/* Preserve the original receipt; never resubmit an uncertain POST. */}throw error;}}
export const pollImagegen=(id:string)=>imagegenFetch<ImagegenResult>(`/api/imagegen?operationId=${encodeURIComponent(id)}`);
export const pollImagegenBatch=(id:string)=>imagegenFetch<ImagegenBatchResult>(`/api/imagegen/batches/${encodeURIComponent(id)}`);
export const cancelImagegen=(id:string,batch:boolean)=>imagegenFetch(`/api/imagegen/${batch?`batches/${encodeURIComponent(id)}`:"cancel"}`,{action:"cancel",operationId:id});
export async function uploadImagegenInput(file:File){
 const body=new FormData();body.set("image",file);const response=await fetch("/api/imagegen/inputs",{method:"POST",headers:await authHeader(),body}),data=await response.json();if(!response.ok)throw new Error(data.error||"素材上传失败");return data as {artworkId:string;url:string;width:number;height:number};
}
