"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {browserSupabase} from "@/lib/supabase";
import {encryptKey} from "./credentials";
import type {SettingsView} from "./contracts";

type SettingsMessage={ok:boolean;text:string}|null;
type SettingsAccess={token:string;view:SettingsView;localAdmin:boolean;epoch:number};
type Payload=Record<string,unknown>|((actor:string)=>Promise<Record<string,unknown>>);

/** Shared configuration session and transport, not a second form store.
 * Panels own drafts; this view contains only the server's safe reply. */
export function useSettingsSession(localAdmin:boolean){
 const [access,setAccess]=useState<SettingsAccess|null>(null);
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState<SettingsMessage>(null);
 const serial=useRef(0),owner=useRef(localAdmin);
 owner.current=localAdmin;
 const invalidateAccess=useCallback(()=>{serial.current++;},[]);

 useEffect(()=>{
  const epoch=++serial.current,abort=new AbortController();
  setAccess(null);setMsg(null);setBusy(false);
  void(async()=>{
   try{
    let token:string|null=null;
    if(!localAdmin){
     const {data}=await browserSupabase().auth.getSession();
     token=data.session?.access_token??null;
     if(!token)return;
    }
    const response=await fetch("/api/admin/settings",{
     headers:token?{Authorization:`Bearer ${token}`}:{},signal:abort.signal,
    });
    if(!response.ok)return;
    const view=await response.json() as SettingsView;
    if(!abort.signal.aborted&&serial.current===epoch&&owner.current===localAdmin){
     setAccess({token:token??"local",view,localAdmin,epoch});
    }
   }catch{/* Denied/unavailable settings stay hidden; no retry submission. */}
  })();
  return()=>{abort.abort();invalidateAccess();};
 },[localAdmin,invalidateAccess]);

 // Accepted writes are never aborted or replayed. Only their UI continuation
 // belongs to this session. Prepared-but-not-submitted payloads use current().
 const mutation=useCallback(async<T,>(
  job:(actor:string,current:()=>boolean)=>Promise<T>,
  apply:(data:T)=>void|Promise<void>,
  okText?:string,
  onError?:(error:Error)=>void,
 )=>{
  if(!access||access.localAdmin!==owner.current||serial.current!==access.epoch)return;
  const identity=access.epoch;
  const current=()=>serial.current===identity&&owner.current===access.localAdmin;
  setBusy(true);setMsg(null);
  try{
   const data=await job(access.token,current);
   if(!current())return;
   await apply(data);
   if(okText&&current())setMsg({ok:true,text:okText});
  }catch(error){
   if(!current())return;
   const fault=error instanceof Error?error:new Error("操作失败");
   if(onError)onError(fault);else setMsg({ok:false,text:fault.message});
  }finally{if(current())setBusy(false);}
 },[access]);

 const postSettings=useCallback(async(payload:Payload,okText:string,clear?:()=>void)=>{
  await mutation(async(actor,current)=>{
   const body=typeof payload==="function"?await payload(actor):payload;
   if(!current())throw Error("原管理会话已结束");
   const response=await fetch("/api/admin/settings",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${actor}`},
    body:JSON.stringify(body),
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"保存失败");
   return data as SettingsView;
  },view=>{
   // GET adds mode metadata that the existing POST response does not contain.
   setAccess(current=>current?{...current,view:{...current.view,...view}}:null);
   clear?.();
  },okText);
 },[mutation]);

 const saveEncrypted=useCallback(async(fieldName:string,plain:string,okText:string,clear:()=>void)=>{
  if(!plain.trim()){setMsg({ok:false,text:"请输入内容"});return;}
  await postSettings(async actor=>({[fieldName]:await encryptKey(plain.trim(),actor)}),okText,clear);
 },[postSettings]);

 if(!access||access.localAdmin!==localAdmin)return null;
 return {token:access.token,view:access.view,epoch:access.epoch,busy,msg,setMsg,postSettings,saveEncrypted,mutation};
}
export type SettingsSession=NonNullable<ReturnType<typeof useSettingsSession>>;
