"use client";
import {useRef,useState} from "react";
import {ArrowUp,Loader2,RotateCcw} from "lucide-react";
import type {GenerationFailure} from "@/lib/canvas/generation-failure";
export function GenerationSubmitAction({generating,failure,onGenerate,english=false,actionLabel,ariaLabel,allowBackground=false}:{generating:boolean;failure?:GenerationFailure;onGenerate:(onSubmitted:()=>void)=>unknown;english?:boolean;actionLabel?:string;ariaLabel?:string;allowBackground?:boolean}){
  const busyRef=useRef<symbol|null>(null),[busy,setBusy]=useState(false);
  const running=generating||busy,label=failure?(english?"Retry":"重试"):(actionLabel||(english?"Generate":"生成"));
  return <button type="button" data-testid="generation-submit-action" data-state={running?"generating":"ready"}
    style={actionLabel||failure?{width:"auto",minWidth:88,paddingInline:12,whiteSpace:"nowrap"}:undefined}
    disabled={running} aria-label={failure?label:ariaLabel||label} title={failure?label:ariaLabel||label} aria-busy={running}
    className="canvas-ui-primary flex h-10 flex-none items-center justify-center gap-1.5 rounded-[11px] px-3 text-[12px] font-semibold disabled:opacity-50"
    onClick={()=>{
      if(running||busyRef.current)return;
      const submission=Symbol('canvas-submission');busyRef.current=submission;setBusy(true);
      // A valid durable receipt releases the composer, not the running job.
      // An older run's callback/finally must never unlock a newer submission.
      const release=()=>{if(busyRef.current===submission){busyRef.current=null;setBusy(false);}};
      void Promise.resolve().then(()=>onGenerate(()=>{if(allowBackground)release();})).catch(()=>{}).finally(release);
    }}>
    {running?<Loader2 className="h-4 w-4 shrink-0 animate-spin"/>:failure?<><RotateCcw className="h-4 w-4 shrink-0"/>{label}</>:<><ArrowUp className="h-4 w-4 shrink-0"/>{actionLabel&&label}</>}
  </button>;
}
