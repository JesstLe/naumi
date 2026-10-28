"use client";
import {useRef,useState} from "react";
import {ArrowUp,Loader2,RotateCcw} from "lucide-react";
import type {GenerationFailure} from "@/lib/canvas/generation-failure";
export function GenerationSubmitAction({generating,failure,onGenerate,english=false,actionLabel}:{generating:boolean;failure?:GenerationFailure;onGenerate:()=>unknown;english?:boolean;actionLabel?:string}){
  const busyRef=useRef(false),[busy,setBusy]=useState(false);
  const running=generating||busy,label=failure?(english?"Retry":"重试"):(actionLabel||(english?"Generate":"生成"));
  return <button type="button" data-testid="generation-submit-action" data-state={running?"generating":"ready"}
    style={actionLabel||failure?{width:"auto",minWidth:88,paddingInline:12,whiteSpace:"nowrap"}:undefined}
    disabled={running} aria-label={label} title={label} aria-busy={running}
    className="canvas-ui-primary flex h-10 flex-none items-center justify-center gap-1.5 rounded-[11px] px-3 text-[12px] font-semibold disabled:opacity-50"
    onClick={()=>{if(running||busyRef.current)return;busyRef.current=true;setBusy(true);void Promise.resolve().then(onGenerate).catch(()=>{}).finally(()=>{busyRef.current=false;setBusy(false);});}}>
    {running?<Loader2 className="h-4 w-4 shrink-0 animate-spin"/>:failure?<><RotateCcw className="h-4 w-4 shrink-0"/>{label}</>:<><ArrowUp className="h-4 w-4 shrink-0"/>{actionLabel&&label}</>}
  </button>;
}
