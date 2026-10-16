"use client";
import {forwardRef,type CSSProperties} from "react";
import {Film,Scissors,Volume2,Video} from "lucide-react";
import {useI18n} from "@/lib/i18n/locale-context";
import type {VideoPlayerAction} from "./player";

/** Imported/generated video artworks are not images and must not show image tools. */
export const VideoResultDock=forwardRef<HTMLDivElement,{
 style:CSSProperties;prompt:string;readOnly:boolean;canGenerate:boolean;
 onProcess:(action:VideoPlayerAction)=>void;onContinue:()=>void;
}>(function VideoResultDock({style,prompt,readOnly,canGenerate,onProcess,onContinue},ref){
 const{locale}=useI18n(),L=(zh:string,en:string)=>locale==='en'?en:zh;
 const action="canvas-ui-action flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium disabled:opacity-40";
 return <div ref={ref} style={style} data-testid="video-result-dock" className="canvas-ui-surface canvas-dock-entry absolute z-10 flex max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[18px] border shadow-lg">
  {prompt&&<p className="min-h-0 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed">{prompt}</p>}
  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-current/10 px-3 py-2"><div className="flex flex-wrap gap-1">
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'frame',timestamp:'first'})}><Film size={15}/>{L("提取画面","Extract frame")}</button>
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'trim'})}><Scissors size={15}/>{L("裁剪视频","Trim video")}</button>
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'extract_audio'})}><Volume2 size={15}/>{L("提取音频","Extract audio")}</button>
  </div>{canGenerate&&<button type="button" className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={readOnly} onClick={onContinue}><Video size={15}/>{L("继续创作","Continue creating")}</button>}</div>
 </div>;
});
