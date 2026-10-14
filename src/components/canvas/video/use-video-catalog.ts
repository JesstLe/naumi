"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";
import type {VideoCatalogModel} from "@/lib/video/client-settings";
import type {VideoPrivateFetch} from "./use-video-nodes";

export function useVideoCatalog({email,ready,request}:{email?:string;ready:boolean;request:VideoPrivateFetch}){
  const identity=useRef({email,ready,revision:0}),attempt=useRef(0),controller=useRef<AbortController|null>(null);
  if(identity.current.email!==email||identity.current.ready!==ready)identity.current={email,ready,revision:identity.current.revision+1};
  const revision=identity.current.revision;
  const [state,setState]=useState<{revision:number;models:VideoCatalogModel[];loading:boolean;error:string}>({revision,models:[],loading:ready&&!!email,error:""});
  const refresh=useCallback(async()=>{
    if(!ready||!email)return;
    const expected=revision,ticket=++attempt.current,abort=new AbortController();controller.current?.abort();controller.current=abort;
    const current=()=>identity.current.revision===expected&&attempt.current===ticket&&!abort.signal.aborted;
    setState({revision:expected,models:[],loading:true,error:""});
    try{
      const response=await request("/api/video/catalog",{cache:"no-store",signal:abort.signal}),data=await response.json();
      if(!response.ok||!Array.isArray(data.models))throw new Error("Video catalog unavailable");
      if(current())setState({revision:expected,models:data.models,loading:false,error:""});
    }catch{if(current())setState({revision:expected,models:[],loading:false,error:"视频模型加载失败"});}
  },[email,ready,revision,request]);
  useEffect(()=>{
    if(!ready||!email){setState({revision,models:[],loading:false,error:""});return;}
    void refresh();const reload=()=>{void refresh();};window.addEventListener(MODEL_CATALOG_REFRESH,reload);
    return()=>{controller.current?.abort();window.removeEventListener(MODEL_CATALOG_REFRESH,reload);};
  },[email,ready,revision,refresh]);
  const visible=state.revision===revision&&ready&&email?state:{models:[],loading:ready&&!!email,error:""};
  return {...visible,refresh};
}
