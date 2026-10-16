'use client';
import { forwardRef, useEffect, useRef, useState, useCallback, type ImgHTMLAttributes } from 'react';
import { type BrowserImageReadOptions, acquireCanvasImageByteSlot, acquireBrowserImage, imageCacheAccount, imageCacheSource, publicCachedImage } from '@/lib/browser-image-cache';

/** Preserve existing img UX and lazy visibility; managed bytes live in account-scoped IndexedDB. */
export const CachedImage=forwardRef<HTMLImageElement,ImgHTMLAttributes<HTMLImageElement>&{onCacheSettled?:()=>void;networkQueue?:BrowserImageReadOptions['networkQueue']}>(function CachedImage({src,loading,onError,onCacheSettled,networkQueue,...props},forwarded){
  const ref=useRef<HTMLImageElement|null>(null);
  const [visible,setVisible]=useState(loading!=='lazy');
  const [revision,setRevision]=useState(0),[resolved,setResolved]=useState<{source:string;url:string}|null>(null),[denied,setDenied]=useState('');
  const [nativeReady,setNativeReady]=useState('');
  const nativeRelease=useRef<(()=>void)|undefined>(undefined);
  const managed=typeof src==='string'?imageCacheSource(src):null;
  const attach=useCallback((node:HTMLImageElement|null)=>{ref.current=node;if(typeof forwarded==='function')forwarded(node);else if(forwarded)forwarded.current=node;},[forwarded]);
  useEffect(()=>{if(loading!=='lazy'){setVisible(true);return;}if(!ref.current)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    // Lazy admission is one-way for a mounted image: temporary hiding must not
    // tear down an already loaded URL. Unmount/src change still releases it.
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'180px'});observer.observe(ref.current);return()=>observer.disconnect();
  },[loading]);
  useEffect(()=>{const reset=()=>{setResolved(null);setRevision(n=>n+1);};window.addEventListener('naumi:image-cache-session',reset);return()=>window.removeEventListener('naumi:image-cache-session',reset);},[]);
  useEffect(()=>{const invalidate=(event:Event)=>{if((event as CustomEvent<{source:string}>).detail?.source===managed){setResolved(null);setRevision(n=>n+1);}};window.addEventListener('naumi:image-cache-invalidated',invalidate);return()=>window.removeEventListener('naumi:image-cache-invalidated',invalidate);},[managed]);
  useEffect(()=>{
    setNativeReady('');if(managed||networkQueue!=='canvas'||typeof src!=='string'||!visible)return;
    const controller=new AbortController();let release:(()=>void)|undefined;
    void acquireCanvasImageByteSlot(controller.signal).then(done=>{release=done;if(controller.signal.aborted)done();else{nativeRelease.current=done;setNativeReady(src);}}).catch(()=>{});
    return()=>{controller.abort();release?.();if(nativeRelease.current===release)nativeRelease.current=undefined;};
  },[src,managed,visible,networkQueue]);
  useEffect(()=>{
    setResolved(null);setDenied('');if(!managed||typeof src!=='string'||!visible||(!imageCacheAccount()&&!publicCachedImage(src)))return;
    const controller=new AbortController();let release:(()=>void)|undefined;
    void acquireBrowserImage(src,controller.signal,{networkQueue}).then(result=>{release=result.release;if(controller.signal.aborted)result.release();else{nativeRelease.current=result.networkComplete;setResolved({source:src,url:result.url});}}).catch(error=>{
      // Auth denial never falls back to an old browser HTTP-cache entry.
      if(!controller.signal.aborted&&(imageCacheAccount()||publicCachedImage(src)))setDenied(src);
    }).finally(()=>{if(!controller.signal.aborted)onCacheSettled?.();});return()=>{controller.abort();release?.();};
  },[src,managed,visible,revision,networkQueue]);
  return <img {...props} ref={attach} loading={loading} src={managed?(resolved&&resolved.source===src?resolved.url:denied===src?'data:image/png;base64,invalid':undefined):networkQueue==='canvas'?(nativeReady===src?src:undefined):src}
    data-browser-image-denied={denied===src?'true':undefined}
    data-browser-image-cache={managed?(resolved?.url.startsWith('blob:')?'local':'pending'):'native'} onLoad={event=>{nativeRelease.current?.();nativeRelease.current=undefined;props.onLoad?.(event);}} onError={event=>{nativeRelease.current?.();nativeRelease.current=undefined;if(denied===src){const image=event.currentTarget;onError?.(event);image.removeAttribute('src');}else onError?.(event);}}/>;
});
