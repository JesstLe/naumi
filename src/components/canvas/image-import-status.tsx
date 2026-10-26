"use client";
import {Loader2,ScanSearch,X} from "lucide-react";
import {bytesLabel} from "@/lib/client-image-upload";
import type {CanvasImageImportBatch} from "@/lib/canvas/image-imports";

/** Progress and saved-result actions render the import owner's receipt state. */
export function CanvasImageImportStatus({batches:imageImports,owner,active,locale,t,onDismiss,onSynchronize,onLocate}:{
  batches:CanvasImageImportBatch[];owner:string;active:{members:{id:string}[]}|null;locale:string;t:(key:string)=>string;
  onDismiss:(id:number)=>void;onSynchronize:(id:number)=>void;onLocate:(id:string)=>void;
}){return <>
          {imageImports.some(batch => batch.owner === owner.toLowerCase()) && (
            <div className="absolute right-3 top-[108px] z-40 max-h-[40%] w-80 max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:top-16" data-testid="canvas-import-status" aria-live="polite">
              {imageImports.filter(batch => batch.owner === owner.toLowerCase()).map(batch => (
                <div key={batch.id} className="border-b border-slate-100 p-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {!batch.finished && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span className="flex-1">{batch.phase === "sync" ? (locale === "en" ? "Syncing canvas" : "等待画布同步") : batch.finished ? t("canvas.importDone") : t("canvas.importBusy")} {batch.done} / {batch.total} · {t("canvas.importSuccess")} {batch.success}{batch.errors.length ? ` · ${t("canvas.importErrors")} ${batch.errors.length}` : ""}</span>
                    {batch.finished && <button type="button" aria-label={t("canvas.importDismiss")} className="p-1 hover:bg-slate-100" onClick={() => onDismiss(batch.id)}><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  {!batch.finished && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${batch.phase === "optimizing" ? 8 : Math.min(100, batch.uploadBytes ? batch.uploadedBytes / batch.uploadBytes * 100 : 0)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                        <span>{batch.phase === "optimizing" ? t("canvas.importOptimizing") : `${Math.round(batch.uploadBytes ? batch.uploadedBytes / batch.uploadBytes * 100 : 0)}%`}</span>
                        <span>{batch.uploadBytes < batch.originalBytes ? `${bytesLabel(batch.originalBytes)} → ${bytesLabel(batch.uploadBytes)}` : bytesLabel(batch.uploadBytes)}</span>
                      </div>
                    </div>
                  )}
                  {batch.finished && batch.phase === "sync" && batch.owner === owner.toLowerCase() && <button type="button" data-testid="canvas-import-resync" className="mt-2 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50" onClick={() => onSynchronize(batch.id)}>{locale === "en" ? "Sync saved images" : "同步图片"}</button>}
                  {batch.finished && batch.nodeIds?.some(id => active?.members.some(member => member.id === id)) && (
                    <button type="button" data-testid="canvas-import-locate" className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                      onClick={() => {
                        const id=batch.nodeIds?.find(id=>active?.members.some(member=>member.id===id));
                        if(id)onLocate(id);
                      }}>
                      <ScanSearch className="h-3.5 w-3.5" />{locale === "en" ? "View image" : "查看图片"}
                    </button>
                  )}
                  {batch.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-red-600">
                      {batch.errors.map((error, index) => <li key={index} className="break-words">{error.name}：{error.message}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
</>;}
