"use client";
import { useLayoutEffect } from "react";
/** Mounted only by /desktop. Restore the original transport on every unmount.
 * Isolates old and new API implementations without a shared cookie or referrer router.
 * Can be replaced with an injected shell transport when the native shell is added.
 */
export function DesktopTransport(){
 useLayoutEffect(()=>{
  if(process.env.NEXT_PUBLIC_DESKTOP_DEPLOYMENT!=="1")return;
  const original=window.fetch;
  const scoped:typeof fetch=(input,init)=>{
   const url=new URL(input instanceof Request ? input.url : String(input),window.location.href);
   const desktop=location.pathname==="/desktop" || location.pathname.startsWith("/desktop/");
   // Collaboration has one root lifetime and one authenticated API across both
   // shells; do not change an in-flight chat/upload's endpoint on navigation.
   if(desktop && url.origin===location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/collaboration/")){
    url.pathname="/desktop"+url.pathname;
    return original.call(window,input instanceof Request?new Request(url,input):url,init);
   }
   return original.call(window,input,init);
  };
  window.fetch=scoped;
  return()=>{if(window.fetch===scoped)window.fetch=original;};
 },[]);
 return null;
}
