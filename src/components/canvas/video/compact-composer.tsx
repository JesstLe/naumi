"use client";
import {useRef,useState,type ReactNode} from "react";
import {Plus,X,ChevronDown,AtSign,Upload,Film,Music2,Type,SlidersHorizontal,Volume2,VolumeX,RectangleHorizontal,Clock3} from "lucide-react";
import {CachedImage} from "@/components/cached-image";
import {CanvasComposerFooter} from "../composer-shell";
import {SelectMenu} from "@/components/ui/select-menu";
import {CanvasModelSelect} from "../model-select";
import {CanvasActionPanel} from "../canvas-action-menu";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {catalogCapability,selectedVideoCatalogModel,reconcileVideoSettings,videoModeRoles,videoDurations,VIDEO_MODE_LABELS,type VideoNodeConfig,type VideoCatalogModel,type VideoInputChoice} from "@/lib/video/client-settings";
import {numberVideoInputs,type OrderedInput} from "@/lib/video/references";
import {VideoAssetImportError} from "./use-video-assets";
import {useVideoI18n} from "./i18n";
import {VideoParameterPanel} from "./parameter-panel";
import {VideoPromptOptimizer} from "./prompt-optimizer";
import {videoButtonClass} from "./form-controls";

/** Reference-first composer; capabilities remain backed by the published catalog. */
export function VideoCompactComposer({config,inputs,models,choices,nodeId,light,blocked,onConfig,onInputs,onImport,onImportBusyChange,onAdvanced,actions,feedback,advancedOpen=false,onCloseAdvanced,advancedContent,count,onCount,onOptimize}:{
 config:VideoNodeConfig;inputs:OrderedInput[];models:VideoCatalogModel[];choices:VideoInputChoice[];nodeId:string;light:boolean;blocked:boolean;
 onConfig:(value:VideoNodeConfig)=>void;onInputs:(value:OrderedInput[])=>void;onImport?:(files:File[])=>Promise<VideoInputChoice[]>;onImportBusyChange:(value:boolean)=>void;onAdvanced:()=>void;
 count:number;onCount:(value:number)=>void;onOptimize:(prompt:string,signal:AbortSignal)=>Promise<string>;
 actions:ReactNode;feedback:ReactNode;advancedOpen?:boolean;onCloseAdvanced?:()=>void;advancedContent?:ReactNode;
}){
 const V=useVideoI18n(),[picker,setPicker]=useState<'add'|'mention'|null>(null),[parameters,setParameters]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const addRef=useRef<HTMLButtonElement>(null),mentionRef=useRef<HTMLButtonElement>(null),parameterRef=useRef<HTMLButtonElement>(null),advancedRef=useRef<HTMLButtonElement>(null),textarea=useRef<HTMLTextAreaElement>(null),file=useRef<HTMLInputElement>(null);
 const importing=useRef(false),model=selectedVideoCatalogModel(models,config),cap=catalogCapability(model);
 const numbered=numberVideoInputs(inputs).all;
 function reconcile(next:VideoNodeConfig){const result=reconcileVideoSettings(next,catalogCapability(selectedVideoCatalogModel(models,next)));if(result.config.mode!==config.mode)onInputs(videoModeRoles(inputs,result.config.mode));onConfig(result.config);setNotice(result.changes.length?`${V('已调整')}：${result.changes.map(V).join('、')}`:'');}
 function add(choice:VideoInputChoice,mention=false){
  if(blocked||!choice.available)return;
  let next=inputs;if(!next.some(input=>input.nodeId===choice.nodeId))next=videoModeRoles([...next,{id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==='text'?'context':choice.kind==='video'?'source_video':choice.kind==='audio'?'source_audio':'reference',value:choice.value}],config.mode);
  onInputs(next);
  if(mention){const index=next.findIndex(input=>input.nodeId===choice.nodeId)+1;onConfig({...config,prompt:`${config.prompt||''}${config.prompt?' ':''}{{ref ${index}}}`,references:[]});}
  setPicker(null);textarea.current?.focus({preventScroll:true});
 }
 async function upload(files:File[]){if(blocked||importing.current||!onImport||!files.length)return;importing.current=true;onImportBusyChange(true);setError('');
  const append=(items:VideoInputChoice[])=>{const next=[...inputs];for(const choice of items)if(!next.some(input=>input.nodeId===choice.nodeId))next.push({id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==='text'?'context':choice.kind==='video'?'source_video':choice.kind==='audio'?'source_audio':'reference',value:choice.value});onInputs(videoModeRoles(next,config.mode));};
  try{append(await onImport(files));setPicker(null);}catch(cause){if(cause instanceof VideoAssetImportError)append(cause.choices);setError(cause instanceof Error?cause.message:V('素材导入失败'));}finally{importing.current=false;onImportBusyChange(false);}
 }
 const chip='canvas-ui-control flex h-8 max-w-full items-center gap-1 rounded-[9px] border px-2 text-xs font-semibold disabled:opacity-40';
 return <div data-testid="video-compact-composer" className="flex min-h-0 flex-col overflow-hidden">
  <div data-composer-body="true">
  {numbered.length>0&&<div className="mb-2 flex items-start gap-2">
   <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" data-testid="video-reference-strip">
    {numbered.map(input=>{const choice=choices.find(c=>c.nodeId===input.nodeId),thumbnail=choice?.thumbnail||(input.kind==='image'?input.value:undefined);return <div key={input.id} data-testid="video-compact-reference" className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)]" title={`${choice?.title||input.nodeId} · ref ${input.index}`}>
      {thumbnail?<CachedImage src={thumbnail} alt={choice?.title||V('图片')} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center canvas-ui-muted">{input.kind==='video'?<Film size={20}/>:input.kind==='audio'?<Music2 size={20}/>:<Type size={20}/>}</div>}
      <span className="pointer-events-none absolute bottom-0 left-0 rounded-tr bg-black/55 px-1 text-[9px] text-white">{input.index}</span>
      {!blocked&&<button type="button" aria-label={V(`移除引用${input.index}`)} onClick={()=>onInputs(videoModeRoles(inputs.filter(item=>item.id!==input.id),config.mode))} className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/65 text-white opacity-0 focus:opacity-100 group-hover:opacity-100"><X size={12}/></button>}
    </div>;})}

   </div>

  </div>}
  <div className="flex items-start gap-2">    <button ref={addRef} type="button" aria-label={V('添加引用')} title={V('添加引用')} disabled={blocked} onClick={()=>setPicker('add')} className="canvas-ui-action flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] disabled:opacity-40"><Plus size={15}/></button>
  <textarea ref={textarea} data-testid="video-composer-prompt" aria-label={V('视频描述')} value={config.prompt||''} readOnly={blocked} rows={4} placeholder={V('描述你想生成的视频…')} className="canvas-ui-text block w-full resize-none border-0 bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-[var(--canvas-ui-muted)]"  onChange={event=>onConfig({...config,prompt:event.target.value})}/>
  </div>
  {feedback}
  </div>
  <CanvasComposerFooter controls={<>
   <CanvasModelSelect label={V('视频模型')} value={model?`${model.providerId}/${model.modelId}`:''}
    placeholder={config.comfyWorkflowId?V('自备视频工作流'):V('未选择模型')} disabled={blocked||!!config.comfyWorkflowId}
    options={models.map(m=>({value:`${m.providerId}/${m.modelId}`,modelId:m.modelId,label:m.label}))}
    onChange={value=>{const chosen=models.find(m=>`${m.providerId}/${m.modelId}`===value);if(chosen)reconcile({...config,workflowTaskId:undefined,providerId:chosen.providerId,modelId:chosen.modelId});}} />
   <SelectMenu label={V('视频生成模式')} size="sm" className={chip} popoverClassName="canvas-ui-light" disabled={blocked||!!config.comfyWorkflowId} value={config.mode||''} onChange={value=>{const mode=value as VideoNodeConfig['mode'];onInputs(videoModeRoles(inputs,mode));reconcile({...config,mode,references:[]});}} options={(cap.modes||[]).map(mode=>({value:mode,label:V(mode==='reference'?(cap.limits?.videos||cap.limits?.audios?'全能参考':'图片参考'):mode==='single_image'?'图生视频':mode==='frames_required'?'首尾帧':VIDEO_MODE_LABELS[mode])}))}/>
   <SelectMenu label={V('视频时长')} size="sm" className={chip} popoverClassName="canvas-ui-light" disabled={blocked||!!config.comfyWorkflowId} value={String(config.durationSeconds??'')} onChange={value=>reconcile({...config,durationSeconds:Number(value)})} options={videoDurations(cap, config.mode).map(value=>({value:String(value),label:<span className="flex items-center gap-1.5"><Clock3 size={13}/>{value===-1?V('自动'):V(`${value} 秒`)}</span>}))}/>
   <button ref={parameterRef} type="button" className={chip} aria-label={V('视频生成参数')} aria-expanded={parameters} disabled={blocked} onClick={()=>setParameters(true)}><RectangleHorizontal size={13}/><span className="truncate">{[config.aspectRatio==='adaptive'?V('自动'):config.aspectRatio,config.resolution?.toUpperCase(),config.durationSeconds===-1?V('自动'):config.durationSeconds?`${config.durationSeconds}s`:undefined,`${count} ${V('个视频')}`].filter(Boolean).join(' · ')}</span>{cap.audio&&<span title={V(config.generateAudio===undefined&&cap.audio==='optional'?'声音跟随模型':config.generateAudio===true||cap.audio==='required'?'开启':'关闭声音')}>{config.generateAudio===false||cap.audio==='disabled'?<VolumeX size={13}/>:<Volume2 size={13}/>}</span>}<ChevronDown size={12}/></button>
   <VideoPromptOptimizer prompt={config.prompt||''} disabled={blocked} light={light} onOptimize={onOptimize} onApply={prompt=>onConfig({...config,prompt})}/>
   <button ref={mentionRef} type="button" className={chip} aria-label={V('引用素材')} title={V('引用素材')} disabled={blocked} onClick={()=>setPicker('mention')}><AtSign size={15}/></button>
   <button ref={advancedRef} type="button" className={chip} aria-expanded={advancedOpen} aria-label={V('更多视频参数')} title={V('更多视频参数')} onClick={onAdvanced}><SlidersHorizontal size={15}/></button>
  </>} actions={actions}/>
  {(error||notice)&&<p role={error?'alert':'status'} className="px-4 py-2 text-xs text-amber-600">{error||notice}</p>}
  <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/webm" className="sr-only" aria-label={V('上传视频参考素材')} disabled={blocked} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';void upload(files);}}/>
  {picker&&<CanvasActionPanel anchorRef={picker==='add'?addRef:mentionRef} label={V(picker==='add'?'添加引用':'引用素材')} light={light} width={320} onClose={()=>setPicker(null)}>
    {onImport&&picker==='add'&&<button type="button" className={`${videoButtonClass} mb-2 flex w-full items-center gap-2`} disabled={blocked} onClick={()=>file.current?.click()}><Upload size={15}/>{V('上传图片 / 视频 / 音频')}</button>}
    <div className="max-h-64 space-y-1 overflow-y-auto">{choices.filter(choice=>choice.nodeId!==nodeId&&(picker==='mention'||!inputs.some(i=>i.nodeId===choice.nodeId))).map(choice=><button type="button" key={choice.id} className="canvas-ui-action flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs disabled:opacity-40" disabled={blocked||!choice.available} onClick={()=>add(choice,picker==='mention')}>
      {choice.thumbnail?<CachedImage src={choice.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover"/>:<Film size={16} className="shrink-0"/>}<span className="truncate">{choice.title}</span></button>)}</div>
  </CanvasActionPanel>}
  {advancedOpen&&<CanvasActionPanel anchorRef={advancedRef} label={V('更多视频参数')} light width={640} onClose={()=>onCloseAdvanced?.()}><div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{V('更多视频参数')}</span><button type="button" aria-label={V('关闭设置')} className="canvas-ui-action rounded-md p-1" onClick={onCloseAdvanced}><X size={14}/></button></div>{advancedContent}</CanvasActionPanel>}
  {parameters&&<CanvasActionPanel anchorRef={parameterRef} label={V('视频生成参数')} light={light} width={348} onClose={()=>setParameters(false)}><div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{V('视频生成参数')}</span><button type="button" aria-label={V('关闭')} className="canvas-ui-action rounded-md p-1" onClick={()=>setParameters(false)}><X size={14}/></button></div>
    <VideoParameterPanel config={config} capability={config.comfyWorkflowId?{sources:{}}:cap} count={count} onConfig={reconcile} onCount={onCount} disabled={blocked}/>
  </CanvasActionPanel>}
 </div>;
}
