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
    const onFocus=()=>{void refresh();};window.addEventListener('focus',onFocus);const timer=setInterval(onFocus,60000);
    return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[value]);
  return <SiteContext.Provider value={current}>{children}</SiteContext.Provider>;
}
export const useSiteProfile = () => useContext(SiteContext);
