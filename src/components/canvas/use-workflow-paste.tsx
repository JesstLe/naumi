"use client";
import {useRef,useSyncExternalStore} from "react";
import {Loader2,RotateCcw,X} from "lucide-react";
import {createCanvasWorkflowImports} from "@/lib/canvas/workflow-imports";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import type {WorkflowImportResult} from "@/lib/canvas/workflow-import-contract";

/** React owns presentation only. Original operation/scope/stream/recovery are
 * retained by the per-editor import owner, not a later render's callback ref. */
export function useWorkflowPaste({scope,writable,viewCurrent,onCommitted}:{scope:CanvasDocumentScope;writable:()=>boolean;viewCurrent?:()=>boolean;onCommitted:(result:WorkflowImportResult,scope:CanvasDocumentScope,present:boolean)=>void}){
  const owner=useRef<ReturnType<typeof createCanvasWorkflowImports>|null>(null);
  if(!owner.current)owner.current=createCanvasWorkflowImports();
  const imports=owner.current.bind(scope,{writable,viewCurrent,commit:onCommitted});
  const progress=useSyncExternalStore(imports.subscribe,imports.getSnapshot,()=>null);
  const status=progress&&!progress.hidden&&<div data-testid="workflow-import-status" role={progress.error?"alert":"status"} className="absolute left-1/2 top-28 z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
    {!progress.error&&<Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500"/>}
    <span className="min-w-0">{progress.error||(progress.total?`正在同步素材 ${progress.done}/${progress.total}`:"正在读取工作流")}</span>
    {progress.error&&<button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-100" onClick={()=>void imports.retry()}><RotateCcw className="h-4 w-4"/>重试</button>}
    <button type="button" className="shrink-0 rounded-lg p-1.5 hover:bg-slate-100" aria-label={progress.error?"关闭导入提示":"取消导入"} onClick={imports.dismiss}><X className="h-4 w-4"/></button>
  </div>;
  return {paste:imports.paste,status};
}
