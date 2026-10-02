"use client";
import { useEffect, useRef } from "react";
import { authHeader } from "@/lib/supabase";

/** Restores the tab's last job, or the newest unfinished job after a new visit. */
export function useImageJobResume(kind: "generate-image" | "suite" | "aplus", email: string | undefined, resume: (id: string) => void) {
  const callback=useRef(resume);
  callback.current=resume;
  useEffect(()=> {
    if (!email) return;
    let cancelled=false;
    void (async()=> {
      let saved: string|null=null;
      try { saved=sessionStorage.getItem(`naumi:job:${kind}:${email}`); } catch { /* optional browser cache */ }
      const response=await fetch(`/api/${kind}?active=1`,{cache:"no-store",headers:await authHeader()});
      if (!response.ok) return;
      const data=await response.json();
      const id=data.jobs?.find((job:{id:string})=>job.id===saved)?.id || data.jobs?.[0]?.id || saved;
      if (id && !cancelled) callback.current(id);
    })().catch(()=>{});
    return ()=> { cancelled=true; };
  },[kind,email]);
  return (id: string|null)=> {
    if (!email) return;
    try {
      const key=`naumi:job:${kind}:${email}`;
      if (id) sessionStorage.setItem(key,id); else sessionStorage.removeItem(key);
    } catch { /* database remains the source of truth */ }
  };
}
