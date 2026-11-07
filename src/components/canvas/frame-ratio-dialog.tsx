"use client";

import { useSurfaceAppearance, surfaceAppearanceClass } from "@/components/ui/surface-appearance";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Check,X} from "lucide-react";
import {CachedImage} from "../cached-image";
import {cdnThumb} from "@/lib/cdn";
import type {CanvasFrameChoice} from "@/lib/imagegen/canvas-client";

type ChoiceRequest={id:number;scope:string;choices:CanvasFrameChoice[];resolve:(id:string|null)=>void};

/** Parallel node requests queue their own choice; account/project changes
 * cancel preparation rather than continuing a request in the new canvas. */
export function useCanvasFrameChoice(scope:string|null) {
  const queue=useRef<ChoiceRequest[]>([]),sequence=useRef(0),liveScope=useRef(scope);
  liveScope.current=scope;
  const [pending,setPending]=useState<ChoiceRequest|null>(null);
  useEffect(()=>{setPending(null);return()=>{for(const item of queue.current)item.resolve(null);queue.current=[];};},[scope]);
  const chooseFrame=useCallback((choices:CanvasFrameChoice[])=>new Promise<string|null>(resolve=>{
    if(!scope||liveScope.current!==scope){resolve(null);return;}
    const item={id:++sequence.current,scope,choices,resolve};queue.current.push(item);
    if(queue.current.length===1)setPending(item);
  }),[scope]);
  const choose=useCallback((requestId:number,id:string|null)=>{
    const item=queue.current[0];if(!item||item.id!==requestId)return;
    queue.current.shift();item.resolve(item.scope===liveScope.current?id:null);setPending(queue.current[0]||null);
  },[]);
  return {pending:pending?.scope===scope?pending:null,chooseFrame,choose};
}

export function FrameRatioDialog({choices,onChoose,english=false}:{choices:CanvasFrameChoice[];onChoose:(id:string|null)=>void;english?:boolean}) {
  const appearance = useSurfaceAppearance() ?? "light";
  const ref=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  if(typeof document==="undefined")return null;
  return createPortal(<dialog ref={ref} aria-modal="true" aria-labelledby="canvas-frame-title" aria-describedby="canvas-frame-description" data-canvas-hotkeys-blocked="true" data-testid="canvas-frame-choice"
    className={`${surfaceAppearanceClass(appearance)} canvas-ui-surface-solid m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-lg overflow-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-[var(--canvas-ui-mask)]`}
    onCancel={event=>{event.preventDefault();onChoose(null);}} onKeyDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
    <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
      <h2 id="canvas-frame-title" className="text-base font-semibold">{english?"Choose output aspect ratio":"选择生成画幅"}</h2>
      <button type="button" aria-label={english?"Close":"关闭画幅选择"} onClick={()=>onChoose(null)} className="rounded-lg p-1.5 canvas-ui-action focus-visible:outline-[var(--canvas-ui-accent)]"><X className="h-4 w-4"/></button>
    </header>
    <p id="canvas-frame-description" className="px-5 text-sm canvas-ui-muted">{english?"References have different aspect ratios. Which frame should the result follow?":"参考图比例不同，这次跟随哪张图的画幅？"}</p>
    <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
      {choices.map((choice,index)=><button type="button" key={choice.artworkId} aria-pressed={selected===choice.artworkId} onClick={()=>setSelected(choice.artworkId)}
        className={`relative min-w-0 rounded-xl border-2 p-2 text-left transition-colors focus-visible:outline-[var(--canvas-ui-accent)] ${selected===choice.artworkId?"border-[var(--canvas-ui-accent)] bg-[var(--canvas-ui-accent-soft)]":"border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-panel-solid)] hover:border-[var(--canvas-ui-border-strong)]"}`}>
        <CachedImage src={cdnThumb(choice.url,512)} alt={english?`Reference ${index+1}`:choice.label} className="h-28 w-full rounded-lg bg-[var(--canvas-ui-soft)] object-contain"/>
        <div className="mt-2 truncate text-xs font-medium">{english?`Reference ${index+1}`:choice.label}</div>
        <div className="mt-0.5 text-xs canvas-ui-muted">{choice.ratio}</div>
        {selected===choice.artworkId&&<span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--canvas-ui-text)] p-0.5 text-[var(--canvas-ui-panel-solid)]"><Check className="h-3 w-3"/></span>}
      </button>)}
    </div>
    <footer className="flex justify-end gap-2 border-t border-[var(--canvas-ui-border)] px-5 py-4">
      <button type="button" onClick={()=>onChoose(null)} className="canvas-ui-control rounded-lg border px-4 py-2 text-sm">{english?"Cancel":"取消"}</button>
      <button type="button" disabled={!selected} onClick={()=>selected&&onChoose(selected)} className="canvas-ui-primary rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{english?"Continue":"继续生成"}</button>
    </footer>
  </dialog>,document.body);
}
