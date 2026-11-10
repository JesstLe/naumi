"use client";
import {authHeader} from "@/lib/supabase";
import {endpoint,type Filter} from "./contracts";

export function filterParams(filter:Filter){
  return new URLSearchParams(Object.entries(filter).map(([key,value])=>[key,String(value)]));
}

export async function libraryRequest<T>(params?:URLSearchParams,body?:unknown,fallback="读取失败",signal?:AbortSignal):Promise<T>{
  const response=await fetch(endpoint+(params?"?"+params:""),{
    method:body?"POST":"GET",cache:"no-store",signal,
    headers:{...await authHeader(),...(body?{"content-type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(data?.error||fallback),{status:response.status});
  if(data===null)throw new Error(fallback);
  return data;
}
