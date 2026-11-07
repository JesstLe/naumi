"use client";
import {useEffect} from 'react';
import {X,Loader2} from 'lucide-react';
import type {Artwork} from '@/lib/mock-data';
import {CachedImage} from '@/components/cached-image';
import {cdnThumb} from '@/lib/cdn';
import {cn} from '@/lib/utils';

type Props={items:readonly Artwork[];addingId:string|null;error:string|null;hasMore:boolean;light:boolean;locale:string;
 t:(key:string)=>string;onClose:()=>unknown;onMore:()=>void;onPick:(id:string)=>Promise<unknown>};
/** Presentation only; catalogue, pagination and copy admission belong to the
 * existing view owner, not this modal or another persistence endpoint. */
export function CanvasArtworkPicker({items,addingId,error,hasMore,light,locale,t,onClose,onMore,onPick}:Props){
 const busy=!!addingId;
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}};
  document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
 },[busy,onClose]);
 return (

        <div
          data-testid="canvas-history-picker"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={() => { onClose(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="canvas-history-picker-title"
            aria-busy={busy}
            className={cn(light ? "canvas-ui-light" : "canvas-ui-dark", "canvas-ui-surface-solid flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
              <span id="canvas-history-picker-title" className="text-sm font-semibold">
                {t("canvas.fromHistory")}
              </span>
              <button
                type="button"
                aria-label={t("canvas.close")}
                disabled={busy}
                onClick={() => onClose()}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {error && <p role="alert" className="canvas-ui-warning mx-4 mt-3 rounded-lg px-3 py-2 text-sm">{error}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {t("canvas.empty")}
                    </p>
              ) : (
                  <><div className="columns-3 gap-3 [column-fill:_balance] sm:columns-5">
                    {items.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        data-history-artwork-id={w.id}
                        disabled={busy}
                        onClick={() => void onPick(w.id)}
                        title={w.title}
                        className="canvas-ui-section group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:border-primary/50 disabled:cursor-wait disabled:opacity-60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={cdnThumb(w.image,512)}
                          alt={w.title}
                          loading="lazy"
                          className="block w-full"
                        />
                        {addingId === w.id && <span className="absolute inset-0 flex items-center justify-center bg-[var(--canvas-ui-mask)]"><Loader2 aria-label={locale === "en" ? "Adding artwork" : "正在添加"} className="h-5 w-5 animate-spin text-primary" /></span>}
                      </button>
                    ))}
                  </div>
                    {hasMore && <button type="button" disabled={busy} onClick={onMore} className="canvas-ui-control mx-auto mt-3 block rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{locale === "en" ? "Load more" : "加载更多"}</button>}
                  </>
              )}
            </div>
          </div>
        </div>
 );
}
