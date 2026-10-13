"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import type {OrderedInput} from "@/lib/video/references";
import {catalogCapability,videoModeRoles,validateVideoSettings,type VideoCatalogModel,type VideoNodeConfig,type VideoInputChoice} from "@/lib/video/client-settings";
import {compileVideoPrompt} from "@/lib/video/prompt";
import {compileVideoCamera} from "@/lib/video/camera";
import {useBillingEstimate,type PublicQuote} from "@/lib/billing/client";
import {VideoSettingsPanel} from "./settings-panel";
import {ReferenceList} from "./reference-list";
import {ShotEditor} from "./shot-editor";
import {ElementEditor} from "./element-editor";
import {CameraSettings} from "./camera-settings";
import {VideoSourceAttribution} from "./source-attribution";
import {VideoField,VideoSection,videoFieldClass,videoButtonClass} from "./form-controls";

export type VideoNodeDraft={title:string;config:VideoNodeConfig;inputs:OrderedInput[];expectedRevision:number};
export function VideoSettingsDialog({node,models,choices,light,readOnly=false,onClose,onSave,onGenerate}:{node:CanvasVideoNode;models:VideoCatalogModel[];choices:VideoInputChoice[];light:boolean;readOnly?:boolean;onClose:()=>void;onSave:(draft:VideoNodeDraft)=>Promise<void>;onGenerate:(draft:VideoNodeDraft,quote:PublicQuote)=>Promise<void>}){
  const [title,setTitle]=useState(node.title),[config,setConfig]=useState<VideoNodeConfig>(()=>structuredClone(node.config)),[inputs,setInputs]=useState<OrderedInput[]>(()=>structuredClone(node.inputs));
  const revision=useRef(node.revision),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const dialogRef=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  const cap=catalogCapability(models.find(model=>model.modelId===config.modelId&&model.providerId===config.providerId));
  const estimate=useBillingEstimate({feature:"video.generate",quantity:1,canvas:true,modelId:config.modelId,providerId:config.providerId,resolution:config.resolution});
  const invalid=validateVideoSettings(config,inputs,cap,choices);
  const preview=(()=>{try{return compileVideoPrompt(config.prompt||"",inputs,compileVideoCamera(config.camera)).prompt;}catch(cause){return cause instanceof Error?cause.message:"引用无效";}})();
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary')||[]).filter(element=>element.offsetParent!==null);
    focusables()[0]?.focus();const keyboard=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.stopPropagation();closeRef.current();}
      if(event.key==="Tab"){const items=focusables(),first=items[0],last=items[items.length-1];if(!first)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };document.addEventListener("keydown",keyboard,true);return()=>{document.removeEventListener("keydown",keyboard,true);previous?.focus();};
  },[]);
  function changeConfig(next:VideoNodeConfig){if(next.mode!==config.mode)setInputs(current=>videoModeRoles(current,next.mode));setConfig(next);setError("");}
  function changeInputs(next:OrderedInput[]){setInputs(videoModeRoles(next,config.mode));setError("");}
  async function submit(generate:boolean){if(readOnly||busy)return;setBusy(true);setError("");try{const draft={title,config,inputs,expectedRevision:revision.current};if(generate){if(!estimate.quote)throw new Error(estimate.error||"请等待报价");await onGenerate(draft,estimate.quote);}else await onSave(draft);onClose();}catch(cause){setError(cause instanceof Error?cause.message:"视频节点保存失败");}finally{setBusy(false);}}
  if(typeof document==="undefined")return null;
  return createPortal(<div ref={dialogRef} className={`fixed inset-0 z-[100] flex items-center justify-center p-3 ${light?"text-slate-800":"text-slate-100"}`} data-canvas-hotkeys-blocked="true" aria-modal="true" role="dialog" aria-label="视频节点设置" onPointerDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <button type="button" aria-label="关闭视频节点设置" className="absolute inset-0 bg-black/50" onClick={onClose}/>
    <div className={`relative flex max-h-[calc(100dvh-24px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${light?"border-slate-200 bg-white":"border-white/10 bg-[#171d25]"}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-current/10 px-4 py-3"><h2 className="text-sm font-semibold">视频节点</h2><button type="button" className={videoButtonClass} aria-label="关闭" onClick={onClose}><X size={16}/></button></header>
      <fieldset disabled={readOnly||busy} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><div className="space-y-4">
          <VideoField label="节点名称"><input aria-label="视频节点名称" value={title} onChange={event=>setTitle(event.target.value)} className={videoFieldClass}/></VideoField>
          <VideoSettingsPanel config={config} models={models} onChange={changeConfig} onNotice={setNotice}/>
          {notice&&<p role="status" className="text-xs text-amber-500">{notice}</p>}
          <VideoField label="视频描述"><textarea aria-label="视频描述" rows={6} className={videoFieldClass} value={config.prompt||""} onChange={event=>changeConfig({...config,prompt:event.target.value})}/></VideoField>
          <details className="text-xs"><summary className="cursor-pointer opacity-70">编译预览</summary><pre data-testid="video-compiled-prompt" className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-current/5 p-3 font-sans text-[11px]">{preview}</pre></details>
        </div><div className="space-y-4"><VideoSection title="引用素材"><ReferenceList inputs={inputs} choices={choices.filter(choice=>choice.nodeId!==node.id)} onChange={changeInputs}/></VideoSection>
          {cap.supportsMultiShot===true&&<VideoSection title="分镜"><ShotEditor shots={config.shots||[]} duration={config.durationSeconds} maxShots={cap.maxShots} choices={choices} onChange={shots=>changeConfig({...config,shots:shots.length?shots:undefined})}/></VideoSection>}
          {cap.supportsElements===true&&<VideoSection title="元素"><ElementEditor elements={config.elements||[]} choices={choices.filter(choice=>choice.nodeId!==node.id)} maxElements={cap.maxElements} maxReferences={cap.maxElementReferences} onChange={elements=>changeConfig({...config,elements:elements.length?elements:undefined})}/></VideoSection>}
          {cap.supportsCamera===true&&<VideoSection title="摄影"><CameraSettings camera={config.camera} onChange={camera=>changeConfig({...config,camera})}/></VideoSection>}
        </div></div>
      </fieldset>
      <footer className="shrink-0 space-y-2 border-t border-current/10 px-4 py-3">{(error||invalid||estimate.error)&&<p role={error?"alert":"status"} className={`text-xs ${error?"text-red-500":"text-amber-500"}`}>{error||invalid||estimate.error}</p>}<div className="flex flex-wrap items-center justify-between gap-3"><VideoSourceAttribution/><div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={readOnly||busy} onClick={()=>void submit(false)}>{busy?"保存中…":"保存设置"}</button><button type="button" className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-40" disabled={readOnly||busy||!!invalid||!estimate.quote} onClick={()=>void submit(true)}>生成视频 · {estimate.quote?`${estimate.quote.mode==="api-cost-plus"?"上限 ":""}${estimate.quote.mode==="api-cost-plus"?estimate.quote.authorizedCredits??estimate.quote.reserveCredits:estimate.cost} 积分`:"报价中…"}</button></div></div></footer>
    </div>
  </div>,document.body);
}
