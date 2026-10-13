"use client";
import {useState} from "react";
import type {OrderedInput} from "@/lib/video/references";
import {catalogCapability,videoModeRoles,inputReference,type VideoCatalogModel,type VideoNodeConfig,type VideoInputChoice} from "@/lib/video/client-settings";
import {compileVideoPrompt} from "@/lib/video/prompt";
import {compileVideoCamera} from "@/lib/video/camera";
import {VideoSettingsPanel} from "./settings-panel";
import {ReferenceList} from "./reference-list";
import {ShotEditor} from "./shot-editor";
import {ElementEditor} from "./element-editor";
import {CameraSettings} from "./camera-settings";
import {VideoField,VideoSection,videoFieldClass,videoButtonClass} from "./form-controls";
import {VideoAssetImportError} from "./use-video-assets";

export function VideoSettingsFields({config,inputs,models,choices,nodeId,readOnly=false,busy=false,onConfig,onInputs,onImport,onImportBusyChange,onLoadMoreAssets,canLoadMoreAssets=false}:{config:VideoNodeConfig;inputs:OrderedInput[];models:VideoCatalogModel[];choices:VideoInputChoice[];nodeId?:string;readOnly?:boolean;busy?:boolean;onConfig:(value:VideoNodeConfig)=>void;onInputs:(value:OrderedInput[])=>void;onImport?:(files:File[])=>Promise<VideoInputChoice[]>;onImportBusyChange?:(busy:boolean)=>void;onLoadMoreAssets?:()=>Promise<void>;canLoadMoreAssets?:boolean}){
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[uploading,setUploading]=useState(false);
  const cap=catalogCapability(models.find(model=>model.modelId===config.modelId&&model.providerId===config.providerId));
  const preview=(()=>{try{return compileVideoPrompt(config.prompt||"",inputs,compileVideoCamera(config.camera)).prompt;}catch(cause){return cause instanceof Error?cause.message:"引用无效";}})();
  function references(next:OrderedInput[]){return next.flatMap(input=>{const ref=inputReference(input);if(!ref)return [];const old=config.references?.find(item=>item.id===ref.id);return [{...old,...ref}];});}
  function changeConfig(next:VideoNodeConfig){if(next.mode!==config.mode){const ordered=videoModeRoles(inputs,next.mode);onInputs(ordered);next={...next,references:references(ordered)};}onConfig(next);setError("");}
  function changeInputs(next:OrderedInput[]){const ordered=videoModeRoles(next,config.mode);onInputs(ordered);onConfig({...config,references:references(ordered)});setError("");}
  function appendImports(uploaded:VideoInputChoice[]){changeInputs(videoModeRoles([...inputs,...uploaded.filter(choice=>!inputs.some(input=>input.nodeId===choice.nodeId)).map(choice=>({id:`ref-${choice.id}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==="video"?"source_video" as const:choice.kind==="audio"?"source_audio" as const:"reference" as const,value:choice.value}))],config.mode));}
  async function importFiles(files:File[]){if(!onImport||busy||uploading||readOnly||!files.length)return;setUploading(true);onImportBusyChange?.(true);setError("");try{appendImports(await onImport(files));}catch(cause){if(cause instanceof VideoAssetImportError)appendImports(cause.choices);setError(cause instanceof Error?cause.message:"素材导入失败");}finally{setUploading(false);onImportBusyChange?.(false);}}
  return <fieldset disabled={busy||uploading||readOnly} className="min-w-0 space-y-3">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><div className="space-y-4">
          <VideoSettingsPanel config={config} models={models} onChange={changeConfig} onNotice={setNotice}/>
          {notice&&<p role="status" className="text-xs text-amber-500">{notice}</p>}
          <VideoField label="视频描述"><textarea aria-label="视频描述" rows={6} className={videoFieldClass} value={config.prompt||""} onChange={event=>changeConfig({...config,prompt:event.target.value})}/></VideoField>
          <details className="text-xs"><summary className="cursor-pointer opacity-70">编译预览</summary><pre data-testid="video-compiled-prompt" className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-current/5 p-3 font-sans text-[11px]">{preview}</pre></details>
        </div><div className="space-y-4"><VideoSection title="引用素材">{onImport&&<label className={`${videoButtonClass} inline-flex cursor-pointer`}><span>上传图片 / 视频 / 音频</span><input aria-label="上传视频参考素材" type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm" className="sr-only" disabled={busy||readOnly} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value="";void importFiles(files);}}/></label>}{canLoadMoreAssets&&onLoadMoreAssets&&<button type="button" className={videoButtonClass} disabled={busy||readOnly} onClick={()=>void onLoadMoreAssets().catch(cause=>setError(cause instanceof Error?cause.message:"素材历史加载失败"))}>加载更多历史素材</button>}<ReferenceList inputs={inputs} choices={choices.filter(choice=>choice.nodeId!==nodeId)} onChange={changeInputs}/></VideoSection>
          {cap.supportsMultiShot===true&&<VideoSection title="分镜"><ShotEditor shots={config.shots||[]} duration={config.durationSeconds} maxShots={cap.maxShots} choices={choices} onChange={shots=>changeConfig({...config,shots:shots.length?shots:undefined})}/></VideoSection>}
          {cap.supportsElements===true&&<VideoSection title="元素"><ElementEditor elements={config.elements||[]} choices={choices.filter(choice=>choice.nodeId!==nodeId)} maxElements={cap.maxElements} maxReferences={cap.maxElementReferences} onChange={elements=>changeConfig({...config,elements:elements.length?elements:undefined})}/></VideoSection>}
          {cap.supportsCamera===true&&<VideoSection title="摄影"><CameraSettings camera={config.camera} onChange={camera=>changeConfig({...config,camera})}/></VideoSection>}
        </div></div>
{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
</fieldset>;
}
