"use client";
import {useEffect,useRef,useState} from "react";
import {useAuth} from "@/lib/auth-context";
import {useAuthModal} from "@/lib/auth-modal-context";
import {browserSupabase} from "@/lib/supabase";

type Status="loading"|"denied"|"ok"|"local-login"|"unavailable";
type Owner={email:string|null;ready:boolean};
type Access={owner:Owner;status:Status;localAdmin:boolean};
type Password={owner:Owner;value:string;busy:boolean;error:string|null};
const CACHE_KEY="naumi:adminVerifiedV1",CACHE_TTL_MS=5*60*1000;
function readCache(email:string){
  try{const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY)||"null");return cached?.email===email&&Number.isFinite(cached.ts)&&Date.now()-cached.ts<=CACHE_TTL_MS;}
  catch{return false;}
}
function cache(email:string|null){
  try{if(email)sessionStorage.setItem(CACHE_KEY,JSON.stringify({email,ts:Date.now()}));else sessionStorage.removeItem(CACHE_KEY);}
  catch{/* Optional UI cache, never API authorization. */}
}

/** One administrator entry session, not an authorization service. All protected
 * APIs keep their server checks. Read continuations belong to this account and
 * mount; an accepted password POST is not aborted or automatically replayed. */
export function useAdminEntry(){
  const {user,ready}=useAuth(),{openAuth}=useAuthModal(),email=user?.email||null;
  const owner=useRef<Owner>({email,ready}),serial=useRef(0),mounted=useRef(true);
  if(owner.current.email!==email||owner.current.ready!==ready){owner.current={email,ready};serial.current++;}
  const identity=owner.current;
  const [access,setAccess]=useState<Access>({owner:identity,status:"loading",localAdmin:false});
  const [password,setPassword]=useState<Password>({owner:identity,value:"",busy:false,error:null});
  const [retryKey,setRetryKey]=useState(0),pending=useRef<Owner|null>(null);
  const view=access.owner===identity?access:{owner:identity,status:"loading" as const,localAdmin:false};
  const form=password.owner===identity?password:{owner:identity,value:"",busy:false,error:null};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;serial.current++;};},[]);
  useEffect(()=>{
    const attempt=++serial.current,abort=new AbortController();
    const current=()=>owner.current===identity&&serial.current===attempt;
    const show=(status:Status,localAdmin=false)=>{if(current())setAccess({owner:identity,status,localAdmin});};
    show("loading");
    void(async()=>{
      try{
        const response=await fetch("/api/admin/login",{cache:"no-store",signal:abort.signal});
        if(!current())return;
        if(!response.ok){show("unavailable");return;}
        const local=await response.json() as {passwordRequired?:boolean;localAvailable?:boolean;localAuthed?:boolean;nativeAdmin?:boolean};
        if(!current())return;
        if(local.passwordRequired&&!local.localAuthed){show("local-login");return;}
        if(local.localAuthed||local.nativeAdmin){show("ok",true);return;}
        if(local.localAvailable){show("local-login");return;}
      }catch{show("unavailable");return;}
      if(!current()||!identity.ready)return;
      if(!identity.email){openAuth("sign-in");return;}
      if(readCache(identity.email))show("ok");
      try{
        const {data}=await browserSupabase().auth.getSession();
        if(!current())return;
        const token=data.session?.access_token;
        if(!token){cache(null);show("loading");openAuth("sign-in");return;}
        const response=await fetch("/api/admin/settings",{headers:{Authorization:`Bearer ${token}`},signal:abort.signal});
        if(!current())return;
        if(response.ok){cache(identity.email);show("ok");}
        else{cache(null);show([401,403,404].includes(response.status)?"denied":"unavailable");}
      }catch{show("unavailable");}
    })();
    return()=>{serial.current++;abort.abort();};
  },[identity,user,openAuth,retryKey]);

  async function submitLocal(){
    if(!form.value||view.status!=="local-login"||pending.current===identity)return;
    const current=()=>owner.current===identity&&mounted.current;
    pending.current=identity;setPassword({...form,busy:true,error:null});
    try{
      const response=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:form.value})});
      const result=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;
      if(!current())return;
      if(!response.ok||!result?.ok){setPassword({...form,busy:false,error:result?.error||"登录失败"});return;}
      setPassword({owner:identity,value:"",busy:false,error:null});setAccess({owner:identity,status:"ok",localAdmin:true});
    }catch{if(current())setPassword({...form,busy:false,error:"网络错误,请重试"});}
    finally{if(pending.current===identity)pending.current=null;}
  }
  return{status:view.status,localAdmin:view.localAdmin,password:form.value,busy:form.busy,error:form.error,
    setPassword:(value:string)=>setPassword({...form,value}),submitLocal,
    retry:()=>{serial.current++;setAccess({owner:identity,status:"loading",localAdmin:false});setRetryKey(value=>value+1);},
  };
}
