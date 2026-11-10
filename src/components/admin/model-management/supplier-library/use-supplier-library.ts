"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {SupplierMetadata,SupplierModelRecord} from "@/lib/supplier-models/types";
import {filterParams,libraryRequest} from "./client";
import {download} from "./presentation";
import type {Filter,Listing} from "./contracts";

/** Queries and curation writes only. This owner never publishes execution config. */
export function useSupplierLibrary(){
  const [filter,setFilter]=useState<Filter>({q:"",provider:"",family:"",brand:"",basis:"",state:"",page:1});
  const [listing,setListing]=useState<Listing|null>(null),[loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [edit,setEdit]=useState<SupplierModelRecord|null>(null),[opening,setOpening]=useState<string|null>(null),[exporting,setExporting]=useState(false);
  const scope=useRef({active:true,generation:0,read:0,detail:0}),filterRef=useRef(filter),syncing=useRef(false),exportGuard=useRef(false);
  const readAbort=useRef<AbortController|null>(null),detailAbort=useRef<AbortController|null>(null);
  const queryKey=filterParams(filter).toString();
  filterRef.current=filter;
  const load=useCallback(async()=>{
    readAbort.current?.abort();const abort=new AbortController();readAbort.current=abort;
    const owner=scope.current,generation=owner.generation,read=++owner.read;
    const current=()=>!abort.signal.aborted && owner.active && owner.generation===generation && owner.read===read;
    setLoading(true);
    try{
      const params=filterParams(filterRef.current);params.set("view","summary");
      const data=await libraryRequest<Listing>(params,undefined,"读取失败",abort.signal);
      if(current()){setListing(data);setError("");}
    }catch(error){if(current())setError(error instanceof Error?error.message:"读取失败");}
    finally{if(current())setLoading(false);}
  },[]);
  useEffect(()=>{
    const owner=scope.current;owner.active=true;owner.generation++;
    return()=>{owner.active=false;owner.generation++;owner.read++;owner.detail++;readAbort.current?.abort();detailAbort.current?.abort();};
  },[]);
  useEffect(()=>{
    scope.current.detail++;detailAbort.current?.abort();setOpening(null);
    void load();
    return()=>{readAbort.current?.abort();};
  },[queryKey,load]);
  const closeModel=()=>{scope.current.detail++;detailAbort.current?.abort();setOpening(null);setEdit(null);};
  const openModel=async(id:string)=>{
    detailAbort.current?.abort();const abort=new AbortController();detailAbort.current=abort;
    const owner=scope.current,generation=owner.generation,detail=++owner.detail;
    const current=()=>!abort.signal.aborted && owner.active && owner.generation===generation && owner.detail===detail;
    setOpening(id);setError("");
    try{
      const data=await libraryRequest<{model:SupplierModelRecord}>(new URLSearchParams({id}),undefined,"读取失败",abort.signal);
      if(current())setEdit(data.model);
    }catch(error){if(current())setError(error instanceof Error?error.message:"读取失败");}
    finally{if(current())setOpening(null);}
  };
  const exportPage=async()=>{
    if(exportGuard.current)return;exportGuard.current=true;
    const owner=scope.current,generation=owner.generation,requested=filterRef.current;
    setExporting(true);
    try{
      const data=await libraryRequest<{models:SupplierModelRecord[]}>(filterParams(requested),undefined,"导出失败");
      if(owner.active && owner.generation===generation)download("supplier-model-metadata.json",{schemaVersion:1,exportedAt:new Date().toISOString(),filter:requested,models:data.models});
    }catch(error){if(owner.active && owner.generation===generation)setError(error instanceof Error?error.message:"导出失败");}
    finally{exportGuard.current=false;if(owner.active && owner.generation===generation)setExporting(false);}
  };
  const change=(key:keyof Filter,value:string)=>setFilter(old=>({...old,[key]:value,page:1}));
  const sync=async(discover:boolean)=>{
    if(syncing.current)return;syncing.current=true;
    const owner=scope.current,generation=owner.generation;
    setBusy(true);setError("");setNotice("");
    try{
      const data=await libraryRequest<{configuredImported:number;directoryImported:number;statuses:{status:string}[]}>(undefined,{action:"sync",discover},"同步失败");
      if(!owner.active || owner.generation!==generation)return;
      const failed=data.statuses.filter(item=>!["ok","empty"].includes(item.status)).length;
      setNotice(`导入配置 ${data.configuredImported} 条、目录 ${data.directoryImported} 条${failed?`，${failed} 个来源同步失败`:""}`);
      await load();
    }catch(error){if(owner.active && owner.generation===generation)setError(error instanceof Error?error.message:"同步失败");}
    finally{syncing.current=false;if(owner.active && owner.generation===generation)setBusy(false);}
  };
  const save=async(model:SupplierModelRecord,metadata:SupplierMetadata,id:string)=>{
    const owner=scope.current,generation=owner.generation;
    const data=await libraryRequest<{revision:number}>(undefined,{action:"save",id,modelId:model.id,expectedRevision:model.revision,metadata},"保存失败");
    if(!owner.active || owner.generation!==generation)return;
    setEdit(null);setNotice(`已保存 v${data.revision}`);await load();
  };
  return {filter,setFilter,listing,loading,busy,error,notice,edit,opening,exporting,load,openModel,closeModel,exportPage,change,sync,save};
}
