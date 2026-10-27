"use client";
import {useCallback,useRef,useState,type RefObject} from "react";
import type {CatalogEntry} from "@/lib/model-config/catalog-store";
import {api} from "./client";

export type ManagementLifecycle = {active:boolean;generation:number};

/** Read-only discovery; it never stages a model publication. */
export function useProviderDirectory(
  lifecycle:RefObject<ManagementLifecycle>,
  onCatalog:(catalog:CatalogEntry)=>void,
  onError:(message:string)=>void,
) {
  const [refreshing,setRefreshing]=useState<string[]>([]);
  const requests=useRef(new Map<string,{generation:number}>());
  const refreshProvider=useCallback(async(providerId:string,force=true)=>{
    const generation=lifecycle.current.generation;
    const current=()=>lifecycle.current.active && lifecycle.current.generation===generation;
    if(!current() || requests.current.get(providerId)?.generation===generation) return;
    const owner={generation};requests.current.set(providerId,owner);
    setRefreshing(old=>[...old.filter(id=>id!==providerId),providerId]);
    try {
      let catalog:CatalogEntry=await api({action:"discover",providerId,force});
      // Another page may own discovery. Read its cached result, never restage it.
      for(let attempt=0;catalog.refreshing && attempt<30;attempt++){
        if(!current())return;
        await new Promise(resolve=>setTimeout(resolve,1000));
        if(!current())return;
        catalog=await api({action:"discover",providerId,force:false});
      }
      if(current())onCatalog(catalog);
    } catch(error) {
      if(current())onError(error instanceof Error?error.message:"目录查询失败");
    } finally {
      if(requests.current.get(providerId)===owner)requests.current.delete(providerId);
      if(current())setRefreshing(old=>old.filter(id=>id!==providerId));
    }
  },[lifecycle,onCatalog,onError]);
  return {refreshing,refreshProvider};
}
