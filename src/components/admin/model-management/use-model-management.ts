"use client";
import {useEffect,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";
import {createModelManagementSession} from "@/lib/model-config/management-session";
import {api} from "./client";
import {pendingKey,type State,type Operation} from "./contracts";

/** React projects the session's decisions and binds browser ports; form drafts
 * remain in their existing editors, not in a second configuration store. */
export function useModelManagement(){
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState<Operation|null>(null);
  const [refreshing,setRefreshing]=useState<string[]>([]);
  const [session]=useState(()=>createModelManagementSession({
    read:request=>api(undefined,request),publish:(operation,request)=>api(operation,request),
    discover:(providerId,force,request)=>api({action:"discover",providerId,force},request),
    storage:{read:()=>sessionStorage.getItem(pendingKey),write:value=>sessionStorage.setItem(pendingKey,value),remove:()=>sessionStorage.removeItem(pendingKey)},
    uuid:browserRandomUUID,refreshCatalog:()=>window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH)),
    setState,setError,setNotice,setLoading,setBusy,setPending,setRefreshing,
  }));
  useEffect(()=>session.mount(),[session]);
  return {state,error,setError,notice,loading,busy,pending,refreshing,
    refreshProvider:session.refreshProvider,load:session.load,publish:session.publish,
    operation:(action:string,fields:Record<string,unknown>)=>session.operation(action,fields,state!),locked:busy||!!pending};
}
