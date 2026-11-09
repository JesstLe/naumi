'use client';
import { CachedImage } from "@/components/cached-image";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {cdnUrl} from '@/lib/cdn';
import {useI18n} from '@/lib/i18n/locale-context';
import {observeCanvasImageVisibility} from '@/lib/canvas/image-observers';

export function CanvasImage({source,forceOriginal:_forceOriginal,hasDimensions:_hasDimensions,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {
  source:string;forceOriginal:boolean;hasDimensions:boolean;
}) {
  const {locale}=useI18n();
  const ref=useRef<HTMLImageElement>(null);
  const [settled,setSettled]=useState('');
  const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{setFailed(false);setRetry(0);},[source]);
  const [visible,setVisible]=useState(false);
  const [loaded,setLoaded]=useState<{source:string}|null>(null);
  // Restore bed33916 (before b988fb6f): canvas zoom changes geometry, never
  // source quality. Keep the legacy flags only for existing node callers.
  const url=cdnUrl(source);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    return observeCanvasImageVisibility(element,setVisible);
  },[retry,source]);
  // Keep decoded pixels while panning out and back. Unseen/offscreen requests
  // are still cancelled; retaining a loaded image does not eagerly load peers.
  const hasFrame=loaded?.source===source;
  const canLoad=!!source&&(hasFrame||visible);
  useEffect(()=>{setFailed(false);},[url]);
  const loadKey=`${url}:${retry}`;
  useEffect(()=>{
    // A slow first request must not cover an already usable frame in white.
    if(!canLoad||hasFrame||settled===loadKey)return;
    const timer=window.setTimeout(()=>setFailed(true),20000);
    return()=>window.clearTimeout(timer);
  },[canLoad,hasFrame,loadKey,settled]);
  // All visible nodes authorize in bounded metadata batches; only cache misses
  // enter the six-slot byte queue. Cached pixels need no network slot.
  return <><CachedImage key={`${source}:${retry}`} imageIdentity={source} networkQueue="canvas" crossOrigin="anonymous" {...props} ref={ref} src={canLoad?url:undefined} decoding="async"
    data-media-variant="original" data-media-visible={visible?'true':'false'}
    onLoad={event=>{setSettled(loadKey);setFailed(false);setLoaded(current=>current?.source===source?current:{source});props.onLoad?.(event);}}
    onError={event=>{setFailed(true);props.onError?.(event);}} />
    {failed && <div className="nodrag nopan absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 text-slate-600" role="status">
      <span className="text-xs">{locale==='en'?'Image not loaded':'图片暂未加载'}</span>
      <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
        onClick={event=>{event.stopPropagation();setFailed(false);setRetry(n=>n+1);}}>{locale==='en'?'Reload image':'重新加载'}</button>
    </div>}
  </>;
}
