'use client';
import { CachedImage } from "@/components/cached-image";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {useStore} from '@xyflow/react';
import {cdnUrl,cdnThumb} from '@/lib/cdn';
import {canvasMediaVariant,MediaLoadQueue} from '@/lib/canvas/media-loading';

const queue=new MediaLoadQueue(6);
export function CanvasImage({source,forceOriginal,hasDimensions,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {
  source:string;forceOriginal:boolean;hasDimensions:boolean;
}) {
  const ref=useRef<HTMLImageElement>(null),release=useRef<(()=>void)|null>(null);
  const [visible,setVisible]=useState(false),[screenWidth,setScreenWidth]=useState(0),[ready,setReady]=useState('');
  const zoom=useStore(s=>s.transform[2]);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{
      root:element.closest('.react-flow'),rootMargin:'180px',threshold:0,
    });observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const measure=()=>{const bounds=element.getBoundingClientRect();setScreenWidth(Math.max(bounds.width,bounds.height));};
    const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();
  },[zoom,props.width,props.height]);
  const variant=forceOriginal||!hasDimensions?'original':canvasMediaVariant(screenWidth,typeof window==='undefined'?1:window.devicePixelRatio);
  const url=variant==='original'?cdnUrl(source):cdnThumb(source,variant==='thumbnail'?512:1600);
  const canLoad=visible&&!!source&&screenWidth>0;
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
