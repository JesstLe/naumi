"use client";
import {useEffect,useRef,useState} from 'react';
import {browserRandomUUID} from '@/lib/browser-crypto';
import {currentWorkspace} from '@/lib/saas/workspace-client';
import {selectedVideoCatalogModel,type VideoCatalogModel,type VideoNodeConfig} from '@/lib/video/client-settings';
import {videoUiValue} from '@/lib/video/ui-draft';
import {editStoryboardDuration,restructureVideoDrafts,storyboardDraftInputs} from '@/lib/video/storyboard-edit';
import {useVideoCompilePreview} from '@/lib/video/use-compile-preview';
import type {CanvasVideoNode,VideoNodeWrite} from '@/lib/canvas/video-node-schema';
import type {VideoPrivateFetch} from './use-video-nodes';
import {VideoContractFields} from './contract-fields';

/** Draft editing and durable save receipts, never model capability admission. */
export function StoryboardRestructure({nodes,planId,scope,request,onApplied,onClose,english=false}:{nodes:CanvasVideoNode[];planId:string;scope:string;request:VideoPrivateFetch;onApplied:(created:CanvasVideoNode[])=>Promise<void>;onClose:()=>void;english?:boolean}){
 const first=nodes[0],merge=nodes.length===2,L=(zh:string,en:string)=>english?en:zh,workspace=currentWorkspace();
 const cacheKey=`naumi:storyboard-restructure:v1:${JSON.stringify([scope,workspace,first.projectKey,planId,nodes.map(node=>node.id)])}`;
 const [initial]=useState(()=>{try{return {drafts:restructureVideoDrafts(nodes),error:''};}catch(error){return {drafts:[],error:error instanceof Error?error.message:'镜头草稿无效'};}});
 const [drafts,setDrafts]=useState(initial.drafts),[error,setError]=useState(initial.error),[busy,setBusy]=useState(false),[models,setModels]=useState<VideoCatalogModel[]>([]),[catalogError,setCatalogError]=useState(''),[reload,setReload]=useState(0);
 const submitting=useRef(false);
 const [pending,setPending]=useState<VideoNodeWrite[]|null>(()=>{try{return JSON.parse(localStorage.getItem(cacheKey)||'null');}catch{return null;}});
 useEffect(()=>{const controller=new AbortController();void request('/api/video/catalog',{cache:'no-store',signal:controller.signal}).then(async response=>{
  const body=await response.json();if(!response.ok)throw new Error(body.error||'视频模型读取失败');if(!controller.signal.aborted){setModels(body.models||[]);setCatalogError('');}
 }).catch(error=>{if(!controller.signal.aborted)setCatalogError(error instanceof Error?error.message:'视频模型读取失败');});return()=>controller.abort();},[request,reload]);
 async function submit(){if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{
  const writes=pending||drafts.map((config,index):VideoNodeWrite=>({id:`vnode-${browserRandomUUID()}`,projectKey:first.projectKey,expectedRevision:0,operationId:browserRandomUUID(),title:(merge?`${first.title} + ${nodes[1].title}`:`${first.title} ${index+1}`).slice(0,200),x:first.x+index*464,y:first.y+first.height+96,width:first.width,height:first.height,config,inputs:storyboardDraftInputs(first)}));
  localStorage.setItem(cacheKey,JSON.stringify(writes));setPending(writes);
  const created:CanvasVideoNode[]=[];
  for(const write of writes){const response=await request('/api/canvas/video-nodes',{method:'POST',headers:{'content-type':'application/json','x-naumi-workspace':workspace,'x-naumi-project-context':first.projectKey},body:JSON.stringify(write)}),body=await response.json();if(!response.ok)throw new Error(body.error||'镜头创建结果尚未核实');created.push(body.node);}
  await onApplied(created);localStorage.removeItem(cacheKey);onClose();
 }catch(error){setError(error instanceof Error?error.message:'镜头修改尚未核实');}finally{submitting.current=false;setBusy(false);}}
 const css='rounded-lg border border-slate-200 bg-white p-2 text-xs disabled:opacity-40';
 return <section aria-label={merge?L('合并镜头','Merge shots'):L('拆分镜头','Split shot')} className='space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3'>
  <div className='flex items-center justify-between text-sm font-medium'><span>{merge?L('合并相邻镜头','Merge adjacent shots'):L('拆成两个镜头','Split into two shots')}</span><button type='button' className={css} disabled={busy} onClick={onClose}>{L('关闭','Close')}</button></div>
  {drafts.map((config,index)=><StoryboardDraft key={index} config={config} index={index} first={first} scope={scope} request={request} model={selectedVideoCatalogModel(models,config)} disabled={busy||!!pending} english={english} onChange={value=>setDrafts(old=>old.map((config,i)=>i===index?value:config))}/>)}
  {error&&<p role='alert' className='text-xs text-red-600'>{error}</p>}
  {catalogError&&<p role='status' className='text-xs text-amber-600'>{catalogError}<button type='button' className={css} onClick={()=>setReload(value=>value+1)}>{L('重试','Retry')}</button></p>}
  <button type='button' className={css} disabled={busy||!pending&&!drafts.length} onClick={()=>void submit()}>{pending?L('核对并继续','Check and continue'):L('保存新镜头','Save new shots')}</button>
 </section>;
}
function StoryboardDraft({config,index,first,scope,request,model,disabled,english,onChange}:{config:VideoNodeConfig;index:number;first:CanvasVideoNode;scope:string;request:VideoPrivateFetch;model?:VideoCatalogModel;disabled:boolean;english:boolean;onChange:(value:VideoNodeConfig)=>void}){
 const inputs=storyboardDraftInputs(first),preview=useVideoCompilePreview({identity:scope,model,config,inputs,node:{id:first.id,revision:first.revision},request,enabled:!disabled});
 const duration=videoUiValue(config,'durationSeconds'),label=`${english?'New shot duration':'新镜头时长'} ${index+1}`;
 const css='rounded-lg border border-slate-200 bg-white p-2 text-xs disabled:opacity-40';
 return <div className='space-y-2'>
  <textarea rows={3} maxLength={16384} aria-label={`${english?'New shot prompt':'新镜头描述'} ${index+1}`} className={`${css} w-full`} value={config.prompt||''} disabled={disabled} onChange={event=>onChange({...config,prompt:event.target.value})}/>
  {model?.execution?<VideoContractFields config={config} inputs={inputs} contract={model.execution} only={['durationSeconds']} onChange={onChange} disabled={disabled}/>:<input aria-label={label} className={css} type='number' step='any' value={typeof duration==='number'?duration:''} disabled={disabled} onChange={event=>onChange(editStoryboardDuration(config,event.target.value===''?undefined:Number(event.target.value),model))}/>}
  {preview.error&&<p role='status' className='text-xs text-amber-600'>{preview.error}{preview.status==='unavailable'&&<button type='button' className={css} onClick={preview.retry}>{english?'Retry':'重试'}</button>}</p>}
 </div>;
}
