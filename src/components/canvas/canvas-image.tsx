'use client';
import { CachedImage } from "@/components/cached-image";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {useStore} from '@xyflow/react';
import {cdnUrl,cdnThumb} from '@/lib/cdn';
import {canvasMediaVariant,type CanvasMediaVariant} from '@/lib/canvas/media-loading';
import {observeCanvasImageSize,observeCanvasImageVisibility} from '@/lib/canvas/image-observers';

export function CanvasImage({source,forceOriginal,hasDimensions,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {
  source:string;forceOriginal:boolean;hasDimensions:boolean;
}) {
  const ref=useRef<HTMLImageElement>(null);
  const [visible,setVisible]=useState(false),[localWidth,setLocalWidth]=useState(0);
  const [loaded,setLoaded]=useState<{source:string;variant:CanvasMediaVariant}|null>(null);
  const pixelRatio=typeof window==='undefined'?1:window.devicePixelRatio;
  // Subscribe to a discrete quality band, not every continuous transform.
  // Inspecting/zooming to 100% must show source pixels on *all visible* nodes,
  // not only the selected one. Offscreen images remain lazy and queue-limited.
  const requested=useStore(s=>forceOriginal||!hasDimensions||s.transform[2]>=1?'original':canvasMediaVariant(localWidth*s.transform[2],pixelRatio));
  const rank={thumbnail:0,preview:1,original:2};
  // Do not replace already-decoded sharper pixels with a lower-quality request
  // when zooming out or selecting another node. Source changes never reuse it.
  const variant=loaded?.source===source&&rank[loaded.variant]>rank[requested]?loaded.variant:requested;
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    return observeCanvasImageVisibility(element,setVisible);
  },[]);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    return observeCanvasImageSize(element,(width,height)=>setLocalWidth(Math.max(width,height)));
  },[]);
  const url=variant==='original'?cdnUrl(source):cdnThumb(source,variant==='thumbnail'?512:1600);
  const canLoad=visible&&!!source&&localWidth>0;
  // All visible nodes authorize in bounded metadata batches; only cache misses
  // enter the six-slot byte queue. Cached pixels need no network slot.
  return <CachedImage networkQueue="canvas" crossOrigin="anonymous" {...props} ref={ref} src={canLoad?url:undefined} decoding="async"
    data-media-variant={variant} data-media-visible={visible?'true':'false'}
    onLoad={event=>{setLoaded(current=>current?.source===source&&current.variant===variant?current:{source,variant});props.onLoad?.(event);}}
    onError={props.onError} />;
}
