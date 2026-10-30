"use client";

import { useSurfaceAppearance } from "@/components/ui/surface-appearance";
import {useCallback,useEffect,useRef,useState} from "react";
import {Check,History,Loader2,X} from "lucide-react";
import {CanvasActionPanel} from "./canvas-action-menu";
import {WORKSPACE_SELECTION} from "@/lib/saas/workspace-client";
import type {CanvasImageVersion,CanvasImageVersionList} from "@/lib/canvas/image-versions";

type Props={contextKey:string;revision:number;disabled:boolean;english?:boolean;
  load:()=>Promise<CanvasImageVersionList>;
  onSelect:(version:CanvasImageVersion,from:CanvasImageVersionList)=>Promise<void>};
/** Fetch only when opened; late reads never populate a different node/workspace. */
export function ImageVersionControl({contextKey,revision,disabled,english,load,onSelect}:Props){
  const appearance = useSurfaceAppearance() ?? "light";
  const L=(zh:string,en:string)=>english?en:zh;
  const anchor=useRef<HTMLButtonElement>(null),epoch=useRef(0);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [data,setData]=useState<CanvasImageVersionList|null>(null);
  const close=useCallback(()=>{epoch.current++;setOpen(false);setBusy(false);setData(null);setError("");},[]);
  useEffect(()=>{const ticket=epoch;close();return()=>{ticket.current++;};},[contextKey,revision,close]);
  useEffect(()=>{window.addEventListener(WORKSPACE_SELECTION,close);return()=>window.removeEventListener(WORKSPACE_SELECTION,close);},[close]);
  async function show(){
    if(disabled)return;const ticket=++epoch.current;setOpen(true);setBusy(true);setError("");
    try{const result=await load();if(ticket===epoch.current)setData(result);}
    catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:L("历史读取失败","History failed to load"));}
    finally{if(ticket===epoch.current)setBusy(false);}
  }
  async function select(version:CanvasImageVersion){
    if(busy||disabled||!data||version.id===data.currentVersionId)return;
    const ticket=epoch.current;setBusy(true);setError("");
    try{await onSelect(version,data);if(ticket===epoch.current)close();}
    catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:L("切换失败，请重试","Switch failed; retry"));}
    finally{if(ticket===epoch.current)setBusy(false);}
  }
  return <>
    <button ref={anchor} type="button" data-testid="image-version-control" aria-label={L("历史版本","Image history")} aria-expanded={open}
      disabled={disabled} onClick={()=>open?close():void show()} className="canvas-ui-control flex h-10 shrink-0 items-center gap-1.5 rounded-[11px] border px-2.5 text-xs font-medium disabled:opacity-40"><History size={15}/>{L("历史版本","History")}</button>
    {open&&<CanvasActionPanel anchorRef={anchor} label={L("图片历史版本","Image versions")} light={appearance === "light"} width={400} onClose={close}>
      <div className="mb-3 flex items-center justify-between text-sm font-semibold"><span>{L("历史版本","History")}</span><button type="button" aria-label={L("关闭历史版本","Close history")} className="canvas-ui-action rounded-lg p-2" onClick={close}><X size={16}/></button></div>
      {busy&&<p role="status" className="flex items-center gap-2 py-3 text-xs canvas-ui-muted"><Loader2 size={15} className="animate-spin"/>{L("处理中…","Loading…")}</p>}
      {error&&<p role="alert" className="mb-3 text-xs text-[var(--canvas-ui-danger,#b91c1c)]">{error}</p>}
      <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
        {data?.versions.map((version,index)=><button type="button" key={version.id} data-version-id={version.id} aria-pressed={version.id===data.currentVersionId}
          disabled={busy||disabled} onClick={()=>void select(version)} title={version.prompt}
          className={`overflow-hidden rounded-xl border bg-[var(--canvas-ui-panel-solid)] text-[var(--canvas-ui-text)] text-left disabled:opacity-60 ${version.id===data.currentVersionId?"border-[var(--canvas-ui-accent)] ring-1 ring-[var(--canvas-ui-accent)]":"border-[var(--canvas-ui-border)] hover:border-[var(--canvas-ui-border-strong)]"}`}>
          {/* Immutable version URLs are intentionally not routed through a stale node-thumbnail key. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={version.image} alt={version.id==="initial"?L("原图","Original"):L(`版本 ${data.versions.length-index}`,`Version ${data.versions.length-index}`)} className="h-28 w-full bg-[var(--canvas-ui-soft)] object-contain"/>
          <span className="flex items-center justify-between px-2.5 py-2 text-xs"><span>{version.id==="initial"?L("原图","Original"):L(`版本 ${data.versions.length-index}`,`Version ${data.versions.length-index}`)}</span>{version.id===data.currentVersionId&&<Check size={14} className="text-[var(--canvas-ui-text)]"/>}</span>
        </button>)}
      </div>
      {error&&!data&&<button type="button" onClick={()=>void show()} className="canvas-ui-action mt-2 rounded-lg px-3 py-2 text-xs">{L("重试","Retry")}</button>}
    </CanvasActionPanel>}
  </>;
}
