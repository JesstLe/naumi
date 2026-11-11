"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {subscribeModelCatalogRefresh} from "@/lib/model-config/catalog-refresh";
import {useFeatureCatalogScope} from "@/lib/model-config/feature-client";
import type {VideoCatalogModel} from "@/lib/video/client-settings";
import type {VideoPrivateFetch} from "./use-video-nodes";

export function useVideoCatalog({email,ready,request}:{email?:string;ready:boolean;request:VideoPrivateFetch}){
  const scope=useFeatureCatalogScope();
  const identity=useRef({email,ready,scope,revision:0}),attempt=useRef(0),controller=useRef<AbortController|null>(null);
  if(identity.current.email!==email||identity.current.ready!==ready||identity.current.scope!==scope)identity.current={email,ready,scope,revision:identity.current.revision+1};
  const revision=identity.current.revision;
  const [state,setState]=useState<{revision:number;models:VideoCatalogModel[];loading:boolean;error:string}>({revision,models:[],loading:ready&&!!email,error:""});
  const refresh=useCallback(async()=>{
    if(!ready||!email)return;
    const expected=revision,ticket=++attempt.current,abort=new AbortController();controller.current?.abort();controller.current=abort;
    const current=()=>identity.current.revision===expected&&attempt.current===ticket&&!abort.signal.aborted;
    setState(previous=>({revision:expected,models:previous.revision===expected?previous.models:[],loading:true,error:""}));
    try{
      const response=await request("/api/video/catalog",{cache:"no-store",signal:abort.signal}),data=await response.json();
      if(!response.ok||!Array.isArray(data.models))throw new Error("Video catalog unavailable");
      if(current())setState({revision:expected,models:data.models,loading:false,error:""});
    }catch{if(current())setState(previous=>({revision:expected,models:previous.revision===expected?previous.models:[],loading:false,error:"视频模型加载失败"}));}
  },[email,ready,revision,request]);
  useEffect(()=>{
    if(!ready||!email){setState({revision,models:[],loading:false,error:""});return;}
    void refresh();const unsubscribe=subscribeModelCatalogRefresh(()=>{void refresh();});
    return()=>{controller.current?.abort();unsubscribe();};
  },[email,ready,revision,refresh]);
  const visible=state.revision===revision&&ready&&email?state:{models:[],loading:ready&&!!email,error:""};
  return {...visible,refresh};
}
