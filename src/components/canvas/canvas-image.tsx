'use client';
import { CachedImage } from "@/components/cached-image";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {useStore} from '@xyflow/react';
import {cdnUrl,cdnThumb} from '@/lib/cdn';
import {canvasMediaVariant,MediaLoadQueue} from '@/lib/canvas/media-loading';
import {observeCanvasImageSize,observeCanvasImageVisibility} from '@/lib/canvas/image-observers';

const queue=new MediaLoadQueue(6);
export function CanvasImage({source,forceOriginal,hasDimensions,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {
  source:string;forceOriginal:boolean;hasDimensions:boolean;
}) {
  const ref=useRef<HTMLImageElement>(null),release=useRef<(()=>void)|null>(null);
  const [visible,setVisible]=useState(false),[localWidth,setLocalWidth]=useState(0),[ready,setReady]=useState('');
  const pixelRatio=typeof window==='undefined'?1:window.devicePixelRatio;
  // Subscribe to a discrete quality band, not every continuous transform.
  // Downloads/model inputs still use the original source; selection still forces it.
  const variant=useStore(s=>forceOriginal||!hasDimensions?'original':canvasMediaVariant(localWidth*s.transform[2],pixelRatio));
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
  useEffect(()=>{
    setReady('');if(!canLoad)return;
    const finish=queue.enqueue(()=>setReady(url));release.current=finish;
    return()=>{finish();if(release.current===finish)release.current=null;};
  },[canLoad,url]);
  return <CachedImage crossOrigin="anonymous" {...props} ref={ref} src={visible&&ready===url?ready:undefined} decoding="async"
    onCacheSettled={()=>{release.current?.();release.current=null;}}
    data-media-variant={variant} data-media-visible={visible?'true':'false'}
    onLoad={event=>{release.current?.();release.current=null;props.onLoad?.(event);}}
    onError={event=>{release.current?.();release.current=null;props.onError?.(event);}} />;
}
