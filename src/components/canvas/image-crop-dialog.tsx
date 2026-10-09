"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crop, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasCrop } from "@/lib/canvas/node-settings";

export function ImageCropDialog({image,title,light,english,busy,onApply,onClose}: {
  image:string;title:string;light:boolean;english:boolean;busy:boolean;onApply:(crop:CanvasCrop)=>Promise<void>;onClose:()=>void;
}) {
  const L=(zh:string,en:string)=>english?en:zh;
  const [crop,setCrop]=useState<CanvasCrop>({x:0,y:0,width:1,height:1});
  const [loaded,setLoaded]=useState(false),[error,setError]=useState(false);
  const imageRef=useRef<HTMLImageElement>(null),panel=useRef<HTMLDivElement>(null);
  const drag=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
    return ()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  const point=(x:number,y:number)=>{const r=imageRef.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(x-r.left)/r.width)),y:Math.max(0,Math.min(1,(y-r.top)/r.height))};};
  const setPercent=(key:keyof CanvasCrop,value:number)=>setCrop(p=>{const next={...p,[key]:value/100};if(key==='x')next.width=Math.min(next.width,1-next.x);if(key==='y')next.height=Math.min(next.height,1-next.y);if(key==='width')next.width=Math.min(next.width,1-next.x);if(key==='height')next.height=Math.min(next.height,1-next.y);return next;});
  return createPortal(<div data-testid="image-crop-dialog" data-canvas-hotkeys-blocked="true" className={cn("fixed inset-0 z-[250] flex items-center justify-center bg-[var(--canvas-ui-mask)] p-3",light?'canvas-ui-light':'canvas-ui-dark')} onPointerDown={()=>!busy && onClose()}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={L("裁剪图片","Crop image")} className="canvas-ui-surface canvas-ui-surface-solid relative flex max-h-[calc(100dvh-24px)] w-[640px] max-w-full flex-col overflow-hidden rounded-[20px] border shadow-xl" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();}
      if(e.key==='Tab'){const f=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1]?.focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0]?.focus();}}
    }}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4"><h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold"><Crop className="h-4 w-4 shrink-0" /><span className="truncate">{L("裁剪","Crop")} · {title}</span></h2><button type="button" disabled={busy} aria-label={L("关闭裁剪","Close crop")} className="canvas-ui-action flex h-8 w-8 items-center justify-center rounded-lg" onClick={onClose}><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 overflow-auto px-4 pb-4">
        <div className="canvas-ui-section flex min-h-[100px] justify-center overflow-hidden rounded-xl p-3"><div className="relative inline-block max-w-full touch-none select-none" onPointerDown={e=>{if(!loaded || busy)return;drag.current=point(e.clientX,e.clientY);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;const p=point(e.clientX,e.clientY),start=drag.current,x=Math.min(0.99,p.x,start.x),y=Math.min(0.99,p.y,start.y);setCrop({x,y,width:Math.min(1-x,Math.max(0.01,Math.abs(p.x-start.x))),height:Math.min(1-y,Math.max(0.01,Math.abs(p.y-start.y)))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} src={image} alt={title} draggable={false} onLoad={()=>setLoaded(true)} onError={()=>setError(true)} className="block max-h-[42dvh] max-w-full object-contain" />
          {loaded && <div aria-hidden="true" className="pointer-events-none absolute overflow-hidden border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.38)]" style={{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}}><span className="absolute left-1/3 top-0 h-full border-l border-white/40" /><span className="absolute left-2/3 top-0 h-full border-l border-white/40" /><span className="absolute left-0 top-1/3 w-full border-t border-white/40" /><span className="absolute left-0 top-2/3 w-full border-t border-white/40" /></div>}
        </div></div>
        {error && <p role="alert" className="mt-2 text-[12px] text-red-600">{L("图片加载失败","Image failed to load")}</p>}
        <p className="canvas-ui-muted mt-3 text-[11px]">{L("拖动选择区域；保存为新版本，原图保留。","Drag to select. Save a new version; keep the original.")}</p>
        <fieldset disabled={busy || !loaded} className="mt-3 grid grid-cols-4 gap-2">{([['x','左','Left'],['y','上','Top'],['width','宽','Width'],['height','高','Height']] as const).map(([key,zh,en])=><label key={key} className="space-y-1 text-[11px]">{L(zh,en)} %<input aria-label={L(zh,en)+' %'} type="number" min={key==='x'||key==='y'?0:1} max={key==='x'||key==='y'?99:100} step="1" value={Math.round(crop[key]*100)} onChange={e=>setPercent(key,Math.max(key==='x'||key==='y'?0:1,Math.min(key==='x'||key==='y'?99:100,Number(e.target.value))))} className="canvas-ui-control h-8 w-full rounded-lg border px-2 text-[12px]" /></label>)}</fieldset>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--canvas-ui-border)] p-3"><button type="button" disabled={busy} className="canvas-ui-control h-9 rounded-lg border px-3 text-[12px]" onClick={()=>setCrop({x:0,y:0,width:1,height:1})}>{L("重置","Reset")}</button><button type="button" disabled={busy||!loaded||error} className="canvas-ui-primary flex h-9 items-center gap-2 rounded-lg px-4 text-[12px] font-semibold disabled:opacity-40" onClick={()=>void onApply(crop)}>{busy&&<Loader2 className="h-3.5 w-3.5 animate-spin" />}{L("保存裁剪版本","Save cropped version")}</button></footer>
    </div>
  </div>,document.body);
}
