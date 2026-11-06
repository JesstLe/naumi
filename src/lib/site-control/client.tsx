'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { SiteProfile } from './contracts';

const SiteContext = createContext<SiteProfile>({ mode: 'platform' });
export function SiteProfileProvider({ value, children }: { value: SiteProfile; children: React.ReactNode }) {
  const [current,setCurrent]=useState(value);
  useEffect(()=>{setCurrent(value);},[value]);
  useEffect(()=>{
    if(value.mode!=='enterprise')return;
    const enterpriseId=value.policy.enterpriseId;
    const controller=new AbortController();let active=true;
    async function refresh(){try{const response=await fetch('/api/site-profile',{cache:'no-store',signal:controller.signal});if(!response.ok)return;const next=await response.json() as SiteProfile;if(active&&next.mode==='enterprise'&&next.policy.enterpriseId===enterpriseId)setCurrent(next);}catch{/* Keep the last confirmed local policy when offline. */}}
    // Visible pages only; focus/visibility refreshes at most every 10s.
    let last=Date.now();const run=()=>{last=Date.now();void refresh();};
    const onFocus=()=>{if(document.visibilityState==='visible'&&Date.now()-last>=10_000)run();};
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);const timer=setInterval(()=>{if(document.visibilityState==='visible')run();},60000);
    return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[value]);
  return <SiteContext.Provider value={current}>{children}</SiteContext.Provider>;
}
export const useSiteProfile = () => useContext(SiteContext);
