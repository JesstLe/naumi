'use client';
import { forwardRef, useEffect, useRef, useState, useCallback, type ImgHTMLAttributes } from 'react';
import { acquireBrowserImage, imageCacheAccount, imageCacheSource, publicCachedImage } from '@/lib/browser-image-cache';

/** Preserve existing img UX and lazy visibility; managed bytes live in account-scoped IndexedDB. */
export const CachedImage=forwardRef<HTMLImageElement,ImgHTMLAttributes<HTMLImageElement>&{onCacheSettled?:()=>void}>(function CachedImage({src,loading,onError,onCacheSettled,...props},forwarded){
  const ref=useRef<HTMLImageElement|null>(null);
  const [visible,setVisible]=useState(loading!=='lazy');
  const [revision,setRevision]=useState(0),[resolved,setResolved]=useState<{source:string;url:string}|null>(null),[denied,setDenied]=useState('');
  const managed=typeof src==='string'?imageCacheSource(src):null;
  const attach=useCallback((node:HTMLImageElement|null)=>{ref.current=node;if(typeof forwarded==='function')forwarded(node);else if(forwarded)forwarded.current=node;},[forwarded]);
  useEffect(()=>{if(loading!=='lazy'){setVisible(true);return;}if(!ref.current)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{rootMargin:'180px'});observer.observe(ref.current);return()=>observer.disconnect();
  },[loading]);
  useEffect(()=>{const reset=()=>{setResolved(null);setRevision(n=>n+1);};window.addEventListener('naumi:image-cache-session',reset);return()=>window.removeEventListener('naumi:image-cache-session',reset);},[]);
  useEffect(()=>{
    setResolved(null);setDenied('');if(!managed||typeof src!=='string'||!visible||(!imageCacheAccount()&&!publicCachedImage(src)))return;
    const controller=new AbortController();let release:(()=>void)|undefined;
    void acquireBrowserImage(src,controller.signal).then(result=>{release=result.release;if(controller.signal.aborted)result.release();else setResolved({source:src,url:result.url});}).catch(error=>{
      // Auth denial never falls back to an old browser HTTP-cache entry.
      if(!controller.signal.aborted&&(imageCacheAccount()||publicCachedImage(src)))setDenied(src);
    }).finally(()=>{if(!controller.signal.aborted)onCacheSettled?.();});return()=>{controller.abort();release?.();};
  },[src,managed,visible,revision]);
  return <img {...props} ref={attach} loading={loading} src={managed?(resolved&&resolved.source===src?resolved.url:denied===src?'data:image/png;base64,invalid':undefined):src}
    data-browser-image-denied={denied===src?'true':undefined}
    data-browser-image-cache={managed?(resolved?.url.startsWith('blob:')?'local':'pending'):'native'} onError={event=>{if(denied===src){const image=event.currentTarget;onError?.(event);image.removeAttribute('src');}else onError?.(event);}}/>;
});
