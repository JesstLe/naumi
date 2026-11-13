"use client";
import {forwardRef,type CSSProperties} from "react";
import {ArrowUp,Film,Scissors,Volume2} from "lucide-react";
import {CanvasComposerShell,CanvasComposerFooter} from "../composer-shell";
import {useI18n} from "@/lib/i18n/locale-context";
import type {VideoPlayerAction} from "./player";

/** Media results keep type-correct actions; audio opens the native audio editor. */
export const VideoResultDock=forwardRef<HTMLDivElement,{
 style:CSSProperties;title?:string;prompt:string;readOnly:boolean;canGenerate:boolean;
 expanded?:boolean;onToggleExpand?:()=>void;onDismiss:()=>void;
 kind?:"video"|"audio";onEditAudio?:()=>void;
 onProcess:(action:VideoPlayerAction)=>void;onContinue:()=>void;
}>(function VideoResultDock({style,title,prompt,readOnly,canGenerate,expanded,onToggleExpand,onDismiss,onProcess,onContinue,kind="video",onEditAudio},ref){
 const{locale}=useI18n(),L=(zh:string,en:string)=>locale==='en'?en:zh;
 const action="canvas-ui-action flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2 text-xs font-semibold disabled:opacity-40";
 return <CanvasComposerShell ref={ref} style={style} data-testid="video-result-dock" kind={kind} compact
  heading={title||L(kind==="audio"?"音频结果":"视频结果",kind==="audio"?"Audio result":"Video result")}
  expanded={expanded} onToggleExpand={onToggleExpand} onDismiss={onDismiss} closeLabel={L("关闭创作栏","Close composer")}
  expandLabel={L("展开输入区","Expand composer")} collapseLabel={L("收起输入区","Collapse composer")} onKeyDown={event=>event.stopPropagation()}>
  <div data-composer-body="true"><p className="min-h-[112px] whitespace-pre-wrap break-words text-sm leading-relaxed">{prompt}</p></div>
  <CanvasComposerFooter controls={<>
    {kind==="audio"?<button type="button" className={action} disabled={readOnly||!onEditAudio} onClick={onEditAudio}><Scissors size={15}/>{L("编辑音频","Edit audio")}</button>:<>
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'frame',timestamp:'first'})}><Film size={15}/>{L("提取画面","Extract frame")}</button>
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'trim'})}><Scissors size={15}/>{L("裁剪视频","Trim video")}</button>
    <button type="button" className={action} disabled={readOnly} onClick={()=>onProcess({action:'extract_audio'})}><Volume2 size={15}/>{L("提取音频","Extract audio")}</button>
    </>}
  </>} actions={kind==="video"&&canGenerate&&<button type="button" aria-label={L("继续创作","Continue creating")} title={L("继续创作","Continue creating")}
    disabled={readOnly} onClick={onContinue}><ArrowUp size={19}/></button>}/>
 </CanvasComposerShell>;
});
