'use client';
import { CachedImage } from "@/components/cached-image";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {useStore} from '@xyflow/react';
import {cdnUrl,cdnThumb} from '@/lib/cdn';
import {canvasMediaVariant,type CanvasMediaVariant} from '@/lib/canvas/media-loading';
import {useI18n} from '@/lib/i18n/locale-context';
import {observeCanvasImageSize,observeCanvasImageVisibility} from '@/lib/canvas/image-observers';
import {registerCanvasImageResidency,type CanvasImageResidencyLease} from '@/lib/canvas/image-residency';

export function CanvasImage({source,forceOriginal,hasDimensions,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {
  source:string;forceOriginal:boolean;hasDimensions:boolean;
}) {
  const {locale}=useI18n();
  const ref=useRef<HTMLImageElement>(null);
  const [settled,setSettled]=useState('');
  const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{setFailed(false);setRetry(0);},[source]);
  const [visibility,setVisibility]=useState({key:'',visible:false}),[localWidth,setLocalWidth]=useState(0);
  const [loaded,setLoaded]=useState<{source:string;variant:CanvasMediaVariant}|null>(null);
  // Remembered quality is separate from an actually retained display frame.
  const [residentKey,setResidentKey]=useState('');
  const frameKey=`${source}:${retry}`;
  const visible=visibility.key===frameKey&&visibility.visible;
  const residency=useRef<{key:string;lease:CanvasImageResidencyLease}|null>(null);
  const pixelRatio=typeof window==='undefined'?1:window.devicePixelRatio;
  // Subscribe to a discrete quality band, not every continuous transform.
  // Inspecting/zooming to 100% must show source pixels on *all visible* nodes,
  // not only the selected one. Offscreen images remain lazy and queue-limited.
  const requested=useStore(s=>forceOriginal||!hasDimensions||s.transform[2]>=1?'original':canvasMediaVariant(localWidth*s.transform[2],pixelRatio));
  const rank={thumbnail:0,preview:1,original:2};
  // Do not replace already-decoded sharper pixels with a lower-quality request
  // when zooming out or selecting another node. Source changes never reuse it.
  const variant=loaded?.source===source&&(!visible||rank[loaded.variant]>rank[requested])?loaded.variant:requested;
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    let active=true;
    const key=`${source}:${retry}`;
    const lease=registerCanvasImageResidency(element,()=>{
      if(!active||residency.current?.lease!==lease)return;
      setResidentKey(current=>current===key?'':current);setSettled('');setFailed(false);
    });
    residency.current={key,lease};
    // A new source must await its own observer event, not inherit prior visibility.
    setVisibility({key,visible:false});setResidentKey('');setSettled('');
    const stop=observeCanvasImageVisibility(element,value=>{
      if(!active)return;lease.setVisible(value);setVisibility({key,visible:value});
    });
    const reset=()=>{lease.clearFrame();setResidentKey('');setSettled('');};
    window.addEventListener('naumi:image-cache-session',reset);
    return()=>{active=false;stop();window.removeEventListener('naumi:image-cache-session',reset);lease.dispose();if(residency.current?.lease===lease)residency.current=null;};
  },[retry,source]);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    return observeCanvasImageSize(element,(width,height)=>setLocalWidth(Math.max(width,height)));
  },[retry,source]);
  const url=variant==='original'?cdnUrl(source):cdnThumb(source,variant==='thumbnail'?512:1600);
  // A bounded grace keeps quick pans smooth; old offscreen display leases may
  // be released without deleting byte caches or changing the remembered quality.
  const hasFrame=residentKey===frameKey;
  const canLoad=!!source&&(hasFrame||(visible&&localWidth>0));
  useEffect(()=>{setFailed(false);},[url]);
  const loadKey=`${url}:${retry}`;
  useEffect(()=>{
    // A slow quality upgrade must not cover an already usable frame in white.
    if(!canLoad||hasFrame||settled===loadKey)return;
    const timer=window.setTimeout(()=>setFailed(true),20000);
    return()=>window.clearTimeout(timer);
  },[canLoad,hasFrame,loadKey,settled]);
  // All visible nodes authorize in bounded metadata batches; only cache misses
  // enter the six-slot byte queue. Cached pixels need no network slot.
  return <><CachedImage key={`${source}:${retry}`} imageIdentity={source} networkQueue="canvas" crossOrigin="anonymous" {...props} ref={ref} src={canLoad?url:undefined} decoding="async"
    data-media-variant={variant} data-media-visible={visible?'true':'false'}
    onLoad={event=>{if(residency.current?.key!==frameKey)return;setSettled(loadKey);setFailed(false);setResidentKey(frameKey);setLoaded(current=>current?.source===source&&current.variant===variant?current:{source,variant});residency.current.lease.setFrame(event.currentTarget.naturalWidth,event.currentTarget.naturalHeight);props.onLoad?.(event);}}
    onError={event=>{if(residency.current?.key!==frameKey)return;residency.current.lease.clearFrame();setResidentKey('');setFailed(true);props.onError?.(event);}} />
    {failed && <div className="nodrag nopan absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 text-slate-600" role="status">
      <span className="text-xs">{locale==='en'?'Image not loaded':'图片暂未加载'}</span>
      <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
        onClick={event=>{event.stopPropagation();setFailed(false);setRetry(n=>n+1);}}>{locale==='en'?'Reload image':'重新加载'}</button>
    </div>}
  </>;
}
