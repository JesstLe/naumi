"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {Download,History,Loader2,RefreshCw} from "lucide-react";
import {CachedImage} from "@/components/cached-image";
import {useAuth} from "@/lib/auth-context";
import {useAuthModal} from "@/lib/auth-modal-context";
import {authHeader} from "@/lib/supabase";
import {useBilling,type PublicQuote} from "@/lib/billing/client";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";
import {validateVideoSettings,type VideoCatalogModel,type VideoNodeConfig,type VideoInputChoice} from "@/lib/video/client-settings";
import {videoHistoryDraft} from "@/lib/video/client-history";
import type {OrderedInput} from "@/lib/video/references";
import {VideoSettingsFields} from "../canvas/video/settings-fields";
import {VideoHistoryPicker} from "../canvas/video/history-picker";
import {VideoPlayer,mediaDownloadHref,type VideoPlayerAction} from "../canvas/video/player";
import {MediaActionsDialog,type MediaInputChoice} from "../canvas/video/media-actions";
import {useVideoAssets} from "../canvas/video/use-video-assets";
import {useVideoHistory,type VideoTaskDetail} from "../canvas/video/use-video-history";
import {useVideoGeneration,VideoGenerationPriceChanged} from "../canvas/video/use-video-generation";
import {useMediaJobs} from "../canvas/video/use-media-jobs";
import type {VideoPrivateFetch} from "../canvas/video/use-video-nodes";
import {videoButtonClass,videoFieldClass,assertVideoFieldsValid} from "../canvas/video/form-controls";
import {useVideoCompilePreview} from '@/lib/video/use-compile-preview';
import {videoPriceEstimate,videoQuoteSelection,videoKnownPrice,videoPriceSelectionKey,VIDEO_ESTIMATED_CREDITS_PER_SECOND} from '@/lib/video/price-estimate';
import {videoUiCreationDefaults} from '@/lib/video/ui-draft';
import {selectedVideoCatalogModel} from '@/lib/video/client-settings';

export function VideoStudioClient(){
  const {user,ready}=useAuth(),{openAuth}=useAuthModal(),identity=useRef({email:user?.email,revision:0});
  if(identity.current.email!==user?.email)identity.current={email:user?.email,revision:identity.current.revision+1};
  const revision=identity.current.revision;
  const request=useCallback<VideoPrivateFetch>(async(input,init={})=>{const headers=new Headers(await authHeader());new Headers(init.headers).forEach((value,key)=>headers.set(key,value));if(identity.current.revision!==revision)throw new Error("账号已切换");return fetch(input,{...init,headers});},[revision]);
  if(!ready)return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin"/></div>;
  if(!user)return <div className="flex min-h-80 items-center justify-center"><button type="button" className={videoButtonClass} onClick={()=>openAuth("sign-in")}>登录</button></div>;
  return <VideoStudioSession key={`${user.email}:${revision}`} email={user.email} request={request}/>;
}
const status={queued:"排队中",processing:"生成中",needs_attention:"待核查",completed:"已完成",failed:"失败",cancelled:"已停止"};
function VideoStudioSession({email,request}:{email:string;request:VideoPrivateFetch}){
  const [models,setModels]=useState<VideoCatalogModel[]>([]),[config,setConfig]=useState<VideoNodeConfig>({prompt:""}),[inputs,setInputs]=useState<OrderedInput[]>([]),[extraChoices,setExtraChoices]=useState<VideoInputChoice[]>([]),[catalogError,setCatalogError]=useState(""),[activeId,setActiveId]=useState(""),[detail,setDetail]=useState<VideoTaskDetail|null>(null),[outputId,setOutputId]=useState(""),[historyOpen,setHistoryOpen]=useState(false),[busy,setBusy]=useState(false),[importing,setImporting]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[count,setCount]=useState(1),[projects,setProjects]=useState<{key:string;name:string}[]>([]),[media,setMedia]=useState<{id:string;initial:VideoPlayerAction;projectKey?:string}|null>(null);
  const model=selectedVideoCatalogModel(models,config),compilePreview=useVideoCompilePreview({email,model,config,inputs,request,enabled:!busy});
  const formRoot=useRef<HTMLElement>(null),configured=useRef(false),catalogAttempt=useRef(0),billing=useBilling();
  const [knownPrice,setKnownPrice]=useState<{key:string;quote:PublicQuote}|null>(null),priceKey=JSON.stringify([email,billing.catalog?.version,videoPriceSelectionKey(config,model?.execution),inputs]);
  const knownQuote=knownPrice?.key===priceKey?knownPrice.quote:undefined,knownCredits=videoKnownPrice(knownQuote,count);
  const estimatedCredits=videoPriceEstimate(config,inputs,model?.execution,count,compilePreview.value?.billingFacts);
  const estimateText=knownCredits!==undefined?`${knownQuote?.mode==='api-cost-plus'?'上限 ':''}${knownCredits} 积分`:estimatedCredits===undefined?`约 ${VIDEO_ESTIMATED_CREDITS_PER_SECOND} 积分/秒`:`约 ${estimatedCredits} 积分`;
  const compileReady=!model?.execution||compilePreview.status==='ready';
  const assets=useVideoAssets({email,request}),history=useVideoHistory({email,request,onCompleted:async()=>{await assets.refresh();}}),generation=useVideoGeneration({email,request});
  const jobs=useMediaJobs({email,source:"workbench",readOnly:false,request,onCompleted:async()=>{await assets.refresh();}});
  const loadCatalog=useCallback(async()=>{const attempt=++catalogAttempt.current;try{const response=await request("/api/video/catalog",{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"视频模型读取失败");if(attempt!==catalogAttempt.current)return;const next=(data.models||[]) as VideoCatalogModel[];setModels(next);setCatalogError("");if(!configured.current&&next.length){const model=next.find(item=>item.isDefault)||next[0];setConfig(current=>({...videoUiCreationDefaults(model),...current,modelId:model.modelId,providerId:model.providerId}));configured.current=true;}}catch(cause){if(attempt===catalogAttempt.current)setCatalogError(cause instanceof Error?cause.message:"视频模型读取失败");}},[request]);
  useEffect(()=>{void loadCatalog();const changed=()=>void loadCatalog(),visible=()=>{if(document.visibilityState==="visible")void loadCatalog();};window.addEventListener(MODEL_CATALOG_REFRESH,changed);document.addEventListener("visibilitychange",visible);return()=>{catalogAttempt.current++;window.removeEventListener(MODEL_CATALOG_REFRESH,changed);document.removeEventListener("visibilitychange",visible);};},[loadCatalog]);
  useEffect(()=>{let stopped=false;void request("/api/video/projects",{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"项目读取失败");if(!stopped)setProjects(data.projects||[]);}).catch(cause=>{if(!stopped)setError(cause instanceof Error?cause.message:"项目读取失败");});return()=>{stopped=true;};},[request]);
  useEffect(()=>{if(!activeId&&history.tasks.length)setActiveId(history.tasks[0].id);},[activeId,history.tasks]);
  const live=history.tasks.find(task=>task.id===activeId);
  useEffect(()=>{let stopped=false;setDetail(null);setOutputId("");if(activeId)void history.detail(activeId).then(value=>{if(!stopped){setDetail(value);setOutputId(value.task.artworkId);}}).catch(cause=>{if(!stopped)setError(cause instanceof Error?cause.message:"任务详情读取失败");});return()=>{stopped=true;};},[activeId,history.detail,live?.status]);
  const task=detail?{...detail.task,...live}:live,output=task?.resultAssets.find(asset=>asset.artworkId===outputId)||task?.resultAssets.find(asset=>asset.artworkId===task.artworkId);
  const choices=useMemo(()=>Array.from(new Map([...extraChoices,...assets.choices].map(choice=>[choice.nodeId,choice])).values()),[extraChoices,assets.choices]);

  const mediaChoices:MediaInputChoice[]=choices.filter(choice=>choice.kind!=="text"&&choice.available).map(choice=>({id:choice.nodeId,title:choice.title,kind:choice.kind as MediaInputChoice["kind"],url:choice.value}));
  for(const asset of task?.resultAssets||[])if(!mediaChoices.some(choice=>choice.id===asset.artworkId))mediaChoices.push({id:asset.artworkId,title:asset.name,kind:asset.kind,url:asset.url,downloadName:asset.name});
  const invalid=validateVideoSettings(config,inputs,{sources:{}},choices,model?.execution)||compilePreview.error;
  async function submit(){if(busy||importing)return;setBusy(true);setError("");setNotice("");try{assertVideoFieldsValid(formRoot.current);if(invalid)throw new Error(invalid);if(!config.comfyWorkflowId&&!compileReady)throw new Error(compilePreview.error||'请等待输入检查');const quote=config.comfyWorkflowId?null:await billing.quote(videoQuoteSelection(config,compilePreview.value?.billingFacts));if(quote)setKnownPrice({key:priceKey,quote});const result=await generation.submit(config,inputs,count,quote);setActiveId(result[0].taskId);setNotice(`已创建 ${result.length} 个任务 · ${result.reduce((total,item)=>total+item.cost,0)} 积分`);await history.refresh();}catch(cause){if(cause instanceof VideoGenerationPriceChanged)await billing.refresh();setError(cause instanceof Error?cause.message:"视频创建失败");await history.refresh().catch(()=>{});}finally{setBusy(false);}}
  function process(id:string,initial:VideoPlayerAction,projectKey?:string|null){setMedia({id,initial,projectKey:(projectKey!==undefined?projectKey:task?.projectKey)||undefined});}
  return <main ref={formRoot} className="mx-auto min-h-screen w-full max-w-[1600px] space-y-4 p-3 text-slate-800 dark:text-slate-100 md:p-6" data-testid="video-workbench">
    <header data-page-header className="flex flex-wrap items-center gap-3"><h1 className="mr-auto text-lg font-semibold">视频工作台</h1><Link href="/canvas" className={videoButtonClass}>画布</Link><button type="button" className={videoButtonClass} disabled={busy||importing} onClick={()=>setHistoryOpen(true)}><History size={14} className="mr-1 inline"/>完整历史</button></header>
    <div className="workspace-video-grid grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)_240px]">
      <section className="min-w-0 space-y-4 rounded-2xl border border-current/10 p-4"><VideoSettingsFields config={config} inputs={inputs} models={models} choices={choices} busy={busy} onConfig={setConfig} onInputs={setInputs} onImport={files=>assets.upload(files)} onImportBusyChange={setImporting} onLoadMoreAssets={assets.loadMore} canLoadMoreAssets={!!assets.nextCursor}/>
        {catalogError&&<div className="flex items-center gap-2 text-xs text-red-500"><span role="alert">{catalogError}</span><button type="button" className={videoButtonClass} onClick={()=>void loadCatalog()}>重新加载模型</button></div>}
        <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs">任务数量<input aria-label="视频任务数量" className={`${videoFieldClass} w-16`} type="number" min={1} max={8} value={count} disabled={busy||importing} onChange={event=>setCount(Number(event.target.value))}/></label><button type="button" className="ml-auto rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={busy||importing||!!invalid||!config.comfyWorkflowId&&!compileReady} onClick={()=>void submit()}>{busy?"提交中…":`生成视频 · ${estimateText}`}</button></div>
        {(error||invalid||assets.error)&&<p role={error?"alert":"status"} className={`text-xs ${error?"text-red-500":"text-amber-500"}`}>{error||invalid||assets.error}{compilePreview.status==='unavailable'&&<button type='button' className={videoButtonClass} onClick={compilePreview.retry}>重试</button>}</p>}{notice&&<p role="status" className="text-xs text-teal-500">{notice}</p>}
      </section>
      <section className="min-w-0 space-y-3 rounded-2xl border border-current/10 p-4">{output?.kind==="image"?<CachedImage src={output.url} alt={output.name} className="max-h-96 w-full object-contain"/>:output||task?.videoUrl?<div className="h-[min(52dvh,420px)]"><VideoPlayer key={output?.artworkId||task?.id} url={output?.url||task!.videoUrl} kind={output?.kind==="audio"?"audio":"video"} title={task?.model} downloadName={output?.name} onProcess={output?.kind!=="audio"?action=>process(output?.artworkId||task!.artworkId,action):undefined} canProcess={!busy}/></div>:<div className="flex h-64 items-center justify-center text-xs opacity-50">{task?"等待任务结果":"选择任务查看结果"}</div>}
        {task&&<><p className="text-xs">{status[task.status]}{['queued','processing'].includes(task.status)&&task.progress>0&&task.progress<100?` · ${task.progress}%`:""} · {task.cost} 积分</p>{task.error&&<p role="alert" className="text-xs text-red-500">{task.error}</p>}{task.resultAssets.map(asset=><div key={asset.artworkId} className="flex min-w-0 gap-2"><button type="button" className={`${videoButtonClass} min-w-0 flex-1 truncate text-left`} onClick={()=>setOutputId(asset.artworkId)}>{asset.name}</button><a className={videoButtonClass} aria-label={`下载 ${asset.name}`} href={mediaDownloadHref(asset.url,asset.name)} download><Download size={13}/></a></div>)}<button type="button" className={videoButtonClass} disabled={busy||importing} onClick={()=>setHistoryOpen(true)}>参数 / 停止 / 重试 / 发送</button></>}
        <button type="button" className={videoButtonClass} disabled={!mediaChoices.length} onClick={()=>process(mediaChoices[0].id,{action:"ffmpeg"})}>媒体处理</button>
      </section>
      <aside className="min-w-0 space-y-2 rounded-2xl border border-current/10 p-3"><div className="flex items-center gap-2 text-xs"><span className="mr-auto">任务</span><button type="button" aria-label="刷新视频任务" className={videoButtonClass} onClick={()=>void history.refresh().catch(cause=>setError(cause.message))}><RefreshCw size={12}/></button></div>{history.error&&<p role="status" className="text-xs text-amber-500">{history.error}</p>}<div className="max-h-[72dvh] space-y-2 overflow-auto">{history.tasks.map(item=><button type="button" key={item.id} data-task-id={item.id} aria-pressed={activeId===item.id} className={`block w-full rounded-lg border p-2 text-left text-xs ${activeId===item.id?"border-teal-500 bg-teal-500/10":"border-current/10"}`} onClick={()=>setActiveId(item.id)}><span className="block truncate">{item.prompt||item.model}</span><span className="mt-1 block text-[10px] opacity-60">{status[item.status]} · {item.cost} 积分</span></button>)}</div>{history.nextCursor&&<button type="button" className={videoButtonClass} onClick={()=>void history.loadMore().catch(cause=>setError(cause.message))}>加载更多</button>}</aside>
    </div>
    {historyOpen&&<VideoHistoryPicker email={email} initialTaskId={activeId} projects={projects} assets={assets.assets} canLoadMoreAssets={!!assets.nextCursor} onLoadMoreAssets={assets.loadMore} request={request} light onClose={()=>setHistoryOpen(false)} onReuseSettings={async snapshot=>{const draft=videoHistoryDraft(snapshot);configured.current=true;setConfig(draft.config);setInputs(draft.inputs);setExtraChoices(draft.choices);setHistoryOpen(false);}} onRetried={async result=>{setActiveId(result.taskId);await history.refresh();}} onSent={async()=>{await assets.refresh();const response=await request("/api/video/projects",{cache:"no-store"}),data=await response.json();if(response.ok)setProjects(data.projects||[]);}} onProcess={process}/>}
    {media&&<MediaActionsDialog key={media.id} initial={media.initial} sourceId={media.id} projectKey={media.projectKey} source="workbench" choices={mediaChoices} light jobs={jobs.jobs} historyError={jobs.error} canLoadMore={!!jobs.nextCursor} onLoadMore={jobs.loadMore} onQuote={jobs.estimate} onSubmit={jobs.submit} onCancel={jobs.cancel} onClose={()=>setMedia(null)}/>}
  </main>;
}
