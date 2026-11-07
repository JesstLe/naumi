"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {clientIntentKey} from "@/lib/billing/client-intent";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {VideoAssetView} from "@/lib/video/assets";
import type {VideoInputChoice} from "@/lib/video/client-settings";
import type {VideoPrivateFetch} from "./use-video-nodes";
import {setLocalItem} from "@/lib/browser-storage/local";
import {cdnThumb} from "@/lib/cdn";
type Cursor={createdAt:string;id:string};
export class VideoAssetImportError extends Error{constructor(message:string,public choices:VideoInputChoice[]){super(message);}}
export function videoAssetChoice(asset:VideoAssetView):VideoInputChoice{return {id:asset.artworkId,nodeId:asset.artworkId,kind:asset.kind,title:asset.title,value:asset.url,thumbnail:asset.kind==="image"?cdnThumb(asset.url,128):undefined,available:true};}
export function useVideoAssets({email,request,readOnly=false}:{email?:string;request:VideoPrivateFetch;readOnly?:boolean}){
  const [assets,setAssets]=useState<VideoAssetView[]>([]),[error,setError]=useState(""),[nextCursor,setNextCursor]=useState<Cursor|null>(null),assetsRef=useRef(assets),identity=useRef({email,readOnly,revision:0});
  if(identity.current.email!==email||identity.current.readOnly!==readOnly)identity.current={email,readOnly,revision:identity.current.revision+1};const revision=identity.current.revision;
  const current=useCallback((expected:number)=>identity.current.revision===expected,[]);
  const merge=useCallback((incoming:VideoAssetView[],expected:number)=>{if(!current(expected))return;const next=new Map(assetsRef.current.map(asset=>[asset.artworkId,asset]));for(const asset of incoming)next.set(asset.artworkId,asset);assetsRef.current=[...next.values()];setAssets(assetsRef.current);},[current]);
  const refresh=useCallback(async(cursor?:Cursor)=>{if(!email)return;const params=new URLSearchParams({limit:"30",email});if(cursor)params.set("cursor",JSON.stringify(cursor));const response=await request(`/api/video/assets?${params}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"素材历史加载失败");merge(data.assets||[],revision);if(current(revision)){setNextCursor(data.nextCursor||null);setError("");}},[email,readOnly,request,current,merge,revision]);
  useEffect(()=>{assetsRef.current=[];setAssets([]);setError("");setNextCursor(null);if(!email)return;void refresh().catch(cause=>{if(current(revision))setError(cause instanceof Error?cause.message:"素材历史加载失败");});},[email,readOnly,revision,refresh,current]);
  const upload=useCallback(async(files:File[],projectKey?:string):Promise<VideoInputChoice[]>=>{if(!email||readOnly)throw new Error("无法上传素材");if(files.length>128)throw new Error("一次最多选择128个素材");if(files.some(file=>!file.name.trim()||file.name.trim().length>200))throw new Error("素材文件名需为1至200字");const actor=email,expected=revision,result:VideoInputChoice[]=[],receipts:{key:string;operationId:string}[]=[];
    try{for(const file of files){if(!current(expected))throw new Error("账号已切换");const form=new FormData();form.append("file",file);if(projectKey)form.append("projectKey",projectKey);const key=(await clientIntentKey(actor,"/video/asset-import",{body:form})).replace("naumi:billing-intent:","naumi:video-asset-intent:");if(!current(expected))throw new Error("账号已切换");
      const saved=localStorage.getItem(key),operationId=saved&&/^[0-9a-f-]{36}$/.test(saved)?saved:browserRandomUUID();setLocalItem(key,operationId);form.delete("projectKey");form.append("operationId",operationId);
      const uploaded=await request("/api/video/references",{method:"POST",body:form}),reference=await uploaded.json();if(!uploaded.ok){if(uploaded.status>=400&&uploaded.status<500&&uploaded.status!==409&&localStorage.getItem(key)===operationId)localStorage.removeItem(key);throw new Error(reference.error||"素材上传尚未核实，请重试");}
      if(!current(expected))throw new Error("素材已上传，返回原账号继续登记");
      const registered=await request("/api/video/assets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId,storageKey:reference.reference.storageKey,title:file.name,projectKey})}),data=await registered.json();if(!registered.ok)throw new Error(data.error||"素材登记尚未核实，请重试");
      if(!current(expected))throw new Error("素材已登记，返回原账号查看");merge([data.asset],expected);receipts.push({key,operationId});result.push(videoAssetChoice(data.asset));
    }}catch(cause){throw new VideoAssetImportError(cause instanceof Error?cause.message:"素材导入失败",current(expected)?result:[]);}
    for(const receipt of receipts)if(localStorage.getItem(receipt.key)===receipt.operationId)localStorage.removeItem(receipt.key);return result;
  },[email,readOnly,revision,request,merge,current]);
  return {assets,choices:assets.map(videoAssetChoice),error,refresh,upload,nextCursor,loadMore:()=>nextCursor?refresh(nextCursor):Promise.resolve()};
}
