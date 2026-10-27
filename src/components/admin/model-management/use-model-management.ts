"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {CatalogEntry} from "@/lib/model-config/catalog-store";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";
import {api} from "./client";
import {pendingKey,type State,type Operation} from "./contracts";
import {useProviderDirectory} from "./use-provider-directory";

/** Owns the active snapshot and original publication receipt, never form drafts. */
export function useModelManagement(){
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState<Operation|null>(null);
  const lifecycle=useRef({active:true,generation:0}),readSequence=useRef(0),mutationGuard=useRef(false);
  const updateCatalog=useCallback((catalog:CatalogEntry)=>{
    setState(old=>old?{...old,catalogs:[...old.catalogs.filter(item=>item.providerId!==catalog.providerId),catalog]}:old);
  },[]);
  const {refreshing,refreshProvider}=useProviderDirectory(lifecycle,updateCatalog,setError);
  const load=useCallback(async(discover=false)=>{
    const generation=lifecycle.current.generation,sequence=++readSequence.current;
    const current=()=>lifecycle.current.active && lifecycle.current.generation===generation && readSequence.current===sequence;
    if(!current())return null;
    setLoading(true);
    let loaded:State|null=null,discoverProviders:State["providers"]=[];
    try {
      const data:State=await api();
      if(!current())return null;
      setState(data);loaded=data;
      if(discover)discoverProviders=data.providers.filter(provider=>provider.enabled && provider.configured && (!data.catalogs.find(c=>c.providerId===provider.id)||data.catalogs.find(c=>c.providerId===provider.id)!.stale));
    } catch(error) {
      if(current())setError(error instanceof Error?error.message:"读取失败");
    } finally {if(current())setLoading(false);}
    // Discovery does not hold the active read open or suppress a post-publish read.
    void(async()=>{for(const provider of discoverProviders)if(current())await refreshProvider(provider.id,false);})();
    return loaded;
  },[refreshProvider]);
  useEffect(()=>{
    const scope=lifecycle.current;scope.active=true;scope.generation++;
    try{const saved=sessionStorage.getItem(pendingKey);if(saved)setPending(JSON.parse(saved));}catch{}
    void load(true);
    return()=>{scope.active=false;scope.generation++;};
  },[load]);
  const clearPending=()=>{setPending(null);try{sessionStorage.removeItem(pendingKey);}catch{}};
  async function publish(operation:Operation,{onDispatch,onSettled}:{onDispatch:()=>void;onSettled:()=>void}){
    if(mutationGuard.current || !lifecycle.current.active)return;
    const generation=lifecycle.current.generation;
    const current=()=>lifecycle.current.active && lifecycle.current.generation===generation;
    mutationGuard.current=true;setBusy(true);setError("");setNotice("");setPending(operation);
    onDispatch();
    try{sessionStorage.setItem(pendingKey,JSON.stringify(operation));}catch{}
    try {
      const result=await api(operation);
      if(!current())return;
      if(result.publication.phase!=="applied"){
        onSettled();setNotice("发布结果待核对。请点击“核对并继续”，系统会沿用同一操作，不重复创建发布。");return;
      }
      clearPending();onSettled();
      if(["pricing","parameters","video-parameters","resolutions","channels","order","scope","switch","rename"].includes(operation.action))window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));
      setNotice(operation.action === "video-parameters" ? "视频能力已生效。" : operation.action === "channels" ? "供应通道已生效，新任务使用新策略，已接受任务保留原配置。" : operation.action === "resolutions" ? "分辨率显示与供应通道映射已生效。新任务使用新配置，已接受任务保留原参数。" : operation.action === "order" ? "模型排序已生效，前端各工具按此顺序展示可用模型。" : operation.action === "parameters" ? "显示档位与上游映射已生效。新请求使用新参数，已接受的任务保留原映射。" : operation.action === "pricing" ? "积分售价已生效。前端报价与实际扣费使用同一配置，已开始的任务保留原报价。" : operation.action === "scope" ? "工具范围已生效。新请求使用新范围，已经开始的任务保留原配置。" : operation.action === "rename" ? "显示名称已更新，前端刷新模型列表后生效。" : operation.action === "switch" ? "实际模型已切换。新请求使用新配置，已经开始的任务保留原模型。" : operation.action === "connect" ? "上游已接入，正在自动发现模型 ID。" : "模型已添加到可切换列表。");
      const refreshed=await load(true);
      if(!current())return;
      if(operation.action==="imagegen-parameters"){window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));setNotice("图像高级能力与实际参数已发布，新任务使用新映射。");}
      return refreshed;
    } catch(error) {
      if(!current())return;
      const failure=error as Error & {code?:string;operationNotStaged?:boolean;publication?:{phase:string}};
      if(failure.operationNotStaged || failure.publication?.phase==="failed")clearPending();
      else onSettled();
      setError(failure.message||"操作失败，请重试");
      if(failure.code==="METADATA_CHANGED")await load(false);
    } finally {mutationGuard.current=false;if(current())setBusy(false);}
  }
  function operation(action:string,fields:Record<string,unknown>):Operation{
    return {...fields,action,id:browserRandomUUID(),expectedVersion:state!.version,...(action==="pricing"?{expectedBillingVersion:state!.billingVersion}:{})};
  }
  return {state,error,setError,notice,loading,busy,pending,refreshing,refreshProvider,load,publish,operation,locked:busy||!!pending};
}
