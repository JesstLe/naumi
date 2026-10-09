"use client";
import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowRightToLine, Crop, ImagePlus, Loader2, Lock, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultNodeSettings, nodeTextStyle, type CanvasNodeSettings } from "@/lib/canvas/node-settings";

export function NodePropertiesPanel({ title, kind, settings, light, english, busy, readOnly, content,
  imageSize, displaySize, imageEditable = true, onSave, onCrop, onReplace, onClose }: {
  title: string; kind: "text" | "image"; settings: CanvasNodeSettings; light: boolean; english: boolean;
  busy: boolean; readOnly: boolean; imageEditable?: boolean; content?: string; imageSize?: {width:number;height:number}; displaySize: {width:number;height:number};
  onSave: (settings: CanvasNodeSettings) => Promise<boolean>; onCrop: () => void; onReplace: () => void; onClose: () => void;
}) {
  const L = (zh:string,en:string) => english ? en : zh;
  const [draft,setDraft]=useState(settings);
  const ref=useRef<HTMLElement>(null);
  const [overlay,setOverlay]=useState(false);
  useEffect(()=> {setDraft(settings);},[settings]);
  useEffect(()=> {
    const media=window.matchMedia("(max-width: 1023px)"),update=()=>setOverlay(media.matches);update();media.addEventListener("change",update);
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
    return ()=>{media.removeEventListener("change",update);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  const change = (value:Partial<CanvasNodeSettings["text"]>) => setDraft(p=>({...p,text:{...p.text,...value}}));
  const control="canvas-ui-control h-9 w-full rounded-[9px] border px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--canvas-ui-border-strong)]";
  return <>
    {overlay && <div className="absolute inset-0 z-30 bg-[var(--canvas-ui-mask)]" onPointerDown={()=>!busy && onClose()} />}
    <aside ref={ref} data-testid="node-properties-panel" data-canvas-hotkeys-blocked="true" aria-label={L("节点属性","Node properties")} role={overlay ? "dialog" : "complementary"} aria-modal={overlay || undefined}
      className={cn("canvas-ui-surface canvas-ui-surface-solid z-40 flex min-h-0 flex-col overflow-hidden rounded-[20px] border absolute bottom-2 right-2 top-2 w-[min(320px,calc(100%-1rem))] min-[1024px]:relative min-[1024px]:inset-auto min-[1024px]:my-2 min-[1024px]:mr-2 min-[1024px]:w-[320px] min-[1024px]:shrink-0",light?"canvas-ui-light":"canvas-ui-dark")}
      onKeyDown={e=>{
        if(e.key==="Escape"&&!e.nativeEvent.isComposing){e.stopPropagation();e.preventDefault();if(!busy)onClose();}
        if(overlay && e.key==="Tab"){
          const fields=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')).filter(el=>!el.closest('fieldset:disabled'));
          const first=fields[0],last=fields[fields.length-1];
          if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
          else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
        }
      }}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4"><div className="flex min-w-0 items-center gap-2"><SlidersHorizontal className="h-4 w-4 shrink-0" /><h2 className="truncate text-[13px] font-semibold">{L("属性","Properties")} · {title}</h2></div>
        <button type="button" aria-label={L("收起属性","Close properties")} disabled={busy} onClick={onClose} className="canvas-ui-action flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><ArrowRightToLine className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {settings.locked && <div className="canvas-ui-section mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"><Lock className="h-3.5 w-3.5" />{L("节点已锁定","Node locked")}</div>}
        {kind==="text" ? <>
          <fieldset disabled={busy || readOnly || settings.locked} className="space-y-4 disabled:opacity-50">
            <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-[12px]">{L("字号","Font size")}<select aria-label={L("字号","Font size")} value={draft.text.fontSize} onChange={e=>change({fontSize:Number(e.target.value)})} className={control}>{[12,14,16,18,20,24,28,32,40,48,60,72].map(v=><option key={v} value={v}>{v} px</option>)}</select></label>
              <label className="space-y-2 text-[12px]">{L("字重","Weight")}<select aria-label={L("字重","Weight")} value={draft.text.fontWeight} onChange={e=>change({fontWeight:e.target.value as CanvasNodeSettings["text"]["fontWeight"]})} className={control}><option value="400">{L("常规","Regular")}</option><option value="600">{L("中粗","Semibold")}</option><option value="700">{L("加粗","Bold")}</option></select></label></div>
            <div className="space-y-2"><span className="text-[12px]">{L("对齐","Alignment")}</span><div className="canvas-ui-section grid grid-cols-3 gap-1 rounded-[10px] p-1">{([['left',AlignLeft,'左对齐','Align left'],['center',AlignCenter,'居中','Align center'],['right',AlignRight,'右对齐','Align right']] as const).map(([value,Icon,zh,en])=><button key={value} type="button" aria-label={L(zh,en)} aria-pressed={draft.text.align===value} onClick={()=>change({align:value})} className={cn("canvas-ui-action flex h-8 items-center justify-center rounded-lg",draft.text.align===value && "canvas-ui-surface-solid shadow-sm")}><Icon className="h-4 w-4" /></button>)}</div></div>
            <label className="block space-y-2 text-[12px]">{L("行距","Line spacing")}<select aria-label={L("行距","Line spacing")} value={draft.text.lineHeight} onChange={e=>change({lineHeight:Number(e.target.value)})} className={control}>{[1.2,1.4,1.65,1.8,2,2.4].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
            <div className="space-y-2"><span className="text-[12px]">{L("文字颜色","Text color")}</span><div className="flex items-center gap-2"><button type="button" aria-pressed={draft.text.color===null} onClick={()=>change({color:null})} className="canvas-ui-control h-8 rounded-lg border px-2 text-[11px]">{L("自动","Auto")}</button>{['#20242c','#4b6470','#285c47','#b36a34'].map(color=><button key={color} type="button" aria-label={color} aria-pressed={draft.text.color===color} onClick={()=>change({color})} style={{background:color}} className={cn("h-6 w-6 rounded-full border-2 border-transparent ring-offset-2 ring-offset-[var(--canvas-ui-panel-solid)]",draft.text.color===color && "ring-2 ring-[var(--canvas-ui-border-strong)]")} />)}<input type="color" aria-label={L("自定义文字颜色","Custom text color")} value={draft.text.color || '#20242c'} onChange={e=>change({color:e.target.value})} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" /></div></div>
          </fieldset>
          <div data-testid="node-style-preview" className="mt-5 overflow-auto rounded-xl border border-[var(--canvas-ui-border)] p-3 max-h-[240px] whitespace-pre-wrap break-words" style={nodeTextStyle(draft)}>{content?.slice(0,500) || L("文字预览","Text preview")}</div>
        </> : imageEditable ? <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy || readOnly || settings.locked} className="canvas-ui-section flex h-16 flex-col items-center justify-center gap-2 rounded-xl text-[12px] disabled:opacity-40" onClick={onCrop}><Crop className="h-4 w-4" />{L("裁剪","Crop")}</button><button type="button" disabled={busy || readOnly || settings.locked} className="canvas-ui-section flex h-16 flex-col items-center justify-center gap-2 rounded-xl text-[12px] disabled:opacity-40" onClick={onReplace}><ImagePlus className="h-4 w-4" />{L("替换图片","Replace image")}</button></div> : null}
        <dl className="canvas-ui-muted mt-5 space-y-3 border-t border-[var(--canvas-ui-border)] pt-4 text-[11px]"><div className="flex justify-between gap-2"><dt>{L("画布显示尺寸","Canvas display size")}</dt><dd className="tabular-nums">{Math.round(displaySize.width)} × {Math.round(displaySize.height)}</dd></div>{kind==='image' && <div className="flex justify-between gap-2"><dt>{L("原图像素","Original pixels")}</dt><dd className="tabular-nums">{imageSize ? `${imageSize.width} × ${imageSize.height}` : '—'}</dd></div>}</dl>
      </div>
      {kind==='text' && <footer className="flex shrink-0 gap-2 border-t border-[var(--canvas-ui-border)] p-3"><button type="button" disabled={busy || readOnly || settings.locked} onClick={()=>setDraft({...draft,text:defaultNodeSettings().text})} className="canvas-ui-control h-9 rounded-[9px] border px-3 text-[12px] disabled:opacity-40">{L("重置样式","Reset style")}</button><button type="button" disabled={busy || readOnly || settings.locked || JSON.stringify(draft)===JSON.stringify(settings)} onClick={()=>void onSave(draft)} className="canvas-ui-primary flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] text-[12px] font-semibold disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{L("应用样式","Apply style")}</button></footer>}
    </aside>
  </>;
}
