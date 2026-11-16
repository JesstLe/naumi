"use client";
import {useVideoI18n} from "./i18n";
import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X,ArrowUp,Square,Loader2,Sparkles,Check,Save } from "lucide-react";
import {CanvasComposerShell} from "../composer-shell";
import {videoBatchQuote} from "@/lib/video/canvas-batch-client";
import {VideoCompactComposer} from "./compact-composer";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import type { OrderedInput } from "@/lib/video/references";
import {selectedVideoCatalogModel, resolveVideoTextInputs, validateVideoSettings, type VideoCatalogModel, type VideoNodeConfig, type VideoInputChoice } from "@/lib/video/client-settings";
import { useBilling, type PublicQuote } from "@/lib/billing/client";
import { VideoSettingsFields } from "./settings-fields";
import { VideoField, videoFieldClass, videoButtonClass, assertVideoFieldsValid } from "./form-controls";
import { isTopVideoDialog } from "./dialog-stack";
import {type PublicVideoTaskView} from "@/lib/video/queries";
import {useVideoCompilePreview} from '@/lib/video/use-compile-preview';
import {videoComposerDrafts,videoComposerDraftKey,type VideoComposerDraft as CachedComposer} from '@/lib/video/composer-drafts';
import type {VideoNodeDraft} from "@/lib/video/canvas-draft";
import {videoPriceEstimate,videoQuoteSelection,videoKnownPrice,videoPriceSelectionKey,VIDEO_ESTIMATED_CREDITS_PER_SECOND} from '@/lib/video/price-estimate';
export type {VideoNodeDraft} from "@/lib/video/canvas-draft";
export function VideoSettingsDialog({ node, models, choices, light, email, readOnly = false, onClose, onSave, onGenerate, onImport, onLoadMoreAssets, canLoadMoreAssets = false, catalogLoading=false, catalogError="", onRetryCatalog, presentation="dialog", dockStyle, dockRef, expanded, onToggleExpand, advanced=false, onCloseAdvanced, draftScope, task, onCancel, generationBlocked=false, onOptimize, onStoryboard }: {
    node: CanvasVideoNode;
    models: VideoCatalogModel[];
    choices: VideoInputChoice[];
    light: boolean;
    email?: string;
    readOnly?: boolean;
    onClose: () => void;
    onSave: (draft: VideoNodeDraft) => Promise<void | {revision:number}>;
    onGenerate: (draft: VideoNodeDraft, quote: PublicQuote | null, onPersisted: (revision: number) => void, count: number) => Promise<void>;
    onOptimize: (prompt:string,signal:AbortSignal)=>Promise<string>;
    onStoryboard?:()=>void;
    onImport?: (files: File[]) => Promise<VideoInputChoice[]>;
    onLoadMoreAssets?: () => Promise<void>;
    canLoadMoreAssets?: boolean;
    catalogLoading?: boolean;
    catalogError?: string;
    onRetryCatalog?: () => Promise<void>;
    presentation?: "dialog" | "dock";
    dockStyle?: CSSProperties;
    dockRef?: RefObject<HTMLDivElement|null>;
    expanded?: boolean;
    onToggleExpand?: () => void;
    advanced?: boolean;
    onCloseAdvanced?: () => void;
    draftScope?: string;
    task?: PublicVideoTaskView;
    onCancel?: () => void;
    generationBlocked?: boolean;
}) {
    const V = useVideoI18n();
    const draftKey = presentation==='dock'&&!readOnly?videoComposerDraftKey(draftScope,email,node.projectKey,node.id):null;
    const [initialDraft] = useState(() => videoComposerDrafts.read(draftKey));
    const [title, setTitle] = useState(initialDraft?.title ?? node.title), [config, setConfig] = useState<VideoNodeConfig>(() => structuredClone(initialDraft?.config ?? node.config)), [inputs, setInputs] = useState<OrderedInput[]>(() => structuredClone(initialDraft?.inputs ?? node.inputs));
    const count = config.batchCount ?? 1;
    const setCount = (value:number) => setConfig(current=>({...current,batchCount:value as 1|2|4}));
    const revision = useRef(initialDraft?.revision ?? node.revision), [busy, setBusy] = useState(false), [importing, setImporting] = useState(false), [error, setError] = useState("");
    const dialogRef = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
    const baseline=useRef(initialDraft?.baseline ?? JSON.stringify({title:node.title,config:node.config,inputs:node.inputs}));
    const dock=presentation==="dock",[saved,setSaved]=useState(false),[inlineAdvanced,setInlineAdvanced]=useState(false);
    const active=generationBlocked||!!task&&!['completed','failed','cancelled'].includes(task.status);
    const submitting=useRef(false);
    const latestLocal = useRef<CachedComposer>({title,config,inputs,revision:revision.current,baseline:baseline.current});
    latestLocal.current = {title,config,inputs,revision:revision.current,baseline:baseline.current};
    const restoredKey=useRef(draftKey),restoring=useRef(false);
    useEffect(()=>{
      if(!draftKey)return;
      // A node first mounted locked/loading must not erase a writable recovery
      // record when permissions/settings become ready later in the same view.
      if(restoredKey.current!==draftKey){
        restoredKey.current=draftKey;const cached=videoComposerDrafts.read(draftKey);
        if(cached&&JSON.stringify({title,config,inputs})===baseline.current){setTitle(cached.title);setConfig(cached.config);setInputs(cached.inputs);revision.current=cached.revision;baseline.current=cached.baseline;latestLocal.current=cached;restoring.current=true;return;}
      }
      videoComposerDrafts.write(draftKey,latestLocal.current);
    },[draftKey,title,config,inputs,node.revision]);
    useEffect(()=>{
      if(!draftKey)return;
      const persist=()=>videoComposerDrafts.write(draftKey,latestLocal.current);
      window.addEventListener('pagehide',persist);
      return()=>{window.removeEventListener('pagehide',persist);persist();};
    },[draftKey]);
    // Position-only revisions may be rebased, but not another editor's config.
    useEffect(()=>{
      if(restoring.current){restoring.current=false;return;}
      const incoming=JSON.stringify({title:node.title,config:node.config,inputs:node.inputs});
      const local=JSON.stringify({title,config,inputs});
      const pristine=local===baseline.current;
      if(pristine){setTitle(node.title);setConfig(structuredClone(node.config));setInputs(structuredClone(node.inputs));revision.current=node.revision;baseline.current=incoming;}
      else if(incoming===baseline.current||incoming===local){revision.current=node.revision;baseline.current=incoming;}
      latestLocal.current={title:pristine?node.title:title,config:pristine?node.config:config,inputs:pristine?node.inputs:inputs,revision:revision.current,baseline:baseline.current};
      videoComposerDrafts.write(draftKey,latestLocal.current);
    },[dock,draftKey,node.revision,node.title,node.config,node.inputs]); // Local edits intentionally do not trigger this effect.
    closeRef.current = onClose;
    const model=selectedVideoCatalogModel(models,config);
    const resolvedInputs = resolveVideoTextInputs(inputs,choices);
    const compilePreview=useVideoCompilePreview({email,model,config,inputs:resolvedInputs,node:{id:node.id,revision:node.revision},enabled:!readOnly&&!active});
    const billing=useBilling(),[knownPrice,setKnownPrice]=useState<{key:string;quote:PublicQuote}|null>(null);
    const priceKey=JSON.stringify([email,draftScope,node.projectKey,billing.catalog?.version,videoPriceSelectionKey(config,model?.execution),resolvedInputs]);
    const knownQuote=knownPrice?.key===priceKey?knownPrice.quote:undefined,knownCredits=videoKnownPrice(knownQuote,count);
    const estimatedCredits=videoPriceEstimate(config,resolvedInputs,model?.execution,count,compilePreview.value?.billingFacts);
    const priceText=config.comfyWorkflowId?'0':knownCredits!==undefined?V(`${knownQuote?.mode==='api-cost-plus'?'上限 ':''}${knownCredits} 积分`):estimatedCredits===undefined?V(`约 ${VIDEO_ESTIMATED_CREDITS_PER_SECOND} 积分/秒`):V(`约 ${estimatedCredits} 积分`);
    const compileReady=!model?.execution||compilePreview.status==='ready';
    const invalid = validateVideoSettings(config, resolvedInputs, {sources:{}}, choices,model?.execution)||compilePreview.error;
    useEffect(() => {
        if(dock)return;
        const previous = document.activeElement as HTMLElement | null;
        const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary') || []).filter(element => element.offsetParent !== null);
        focusables()[0]?.focus();
        const keyboard = (event: KeyboardEvent) => {
            if (!isTopVideoDialog(dialogRef.current))
                return;
            if (event.key === "Escape" && document.activeElement instanceof HTMLElement &&
                dialogRef.current?.contains(document.activeElement) &&
                document.activeElement.matches('[role="combobox"][aria-expanded="true"]')) return;
            if (event.key === "Escape") {
                event.stopPropagation();
                closeRef.current();
            }
            if (event.key === "Tab") {
                const items = focusables(), first = items[0], last = items[items.length - 1];
                if (!first)
                    return;
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", keyboard, true);
        return () => { document.removeEventListener("keydown", keyboard, true); previous?.focus(); };
    }, [dock]);
    async function submit(generate: boolean) { if (readOnly || busy || importing || submitting.current || generate&&(active||!!invalid||catalogLoading||!!catalogError&&!config.comfyWorkflowId))
        return; submitting.current=true;setBusy(true); setError(""); try {
        if(generate)assertVideoFieldsValid(dock?dockRef?.current||null:dialogRef.current);
        const draft = { title, config, inputs: resolvedInputs, expectedRevision: revision.current };
        if (generate) {
            if(!config.comfyWorkflowId&&!compileReady)throw new Error(compilePreview.error||'请等待输入检查');
            const quote=config.comfyWorkflowId?null:await billing.quote(videoQuoteSelection(config,compilePreview.value?.billingFacts,true));
            if(quote)setKnownPrice({key:priceKey,quote});
            await onGenerate(draft, videoBatchQuote(quote,count), savedRevision => { revision.current = savedRevision; }, count);
        }
        else {
            const saved=await onSave(draft);if(saved)revision.current=saved.revision;
        }
        baseline.current=JSON.stringify({title,config,inputs:resolvedInputs});
        latestLocal.current={title,config,inputs:resolvedInputs,revision:revision.current,baseline:baseline.current};videoComposerDrafts.write(draftKey,latestLocal.current);
        if(dock)setSaved(true);else onClose();
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "视频节点保存失败");
    }
    finally {
        submitting.current=false;
        setBusy(false);
    } }
    async function openStoryboard(){
        if(!onStoryboard||readOnly||busy||importing||submitting.current)return;
        submitting.current=true;setBusy(true);setError("");
        try{const saved=await onSave({title,config,inputs:resolvedInputs,expectedRevision:revision.current});if(saved)revision.current=saved.revision;baseline.current=JSON.stringify({title,config,inputs:resolvedInputs});latestLocal.current={title,config,inputs:resolvedInputs,revision:revision.current,baseline:baseline.current};videoComposerDrafts.write(draftKey,latestLocal.current);setSaved(true);onStoryboard();}
        catch(cause){setError(cause instanceof Error?cause.message:"镜头保存失败");}
        finally{submitting.current=false;setBusy(false);}
    }
    const dockActions=(<>
          <span role="status" className="min-w-0 truncate text-xs canvas-ui-muted">{active?V(generationBlocked||task?.status==='needs_attention'?"等待核查":"生成中"):saved?V("已保存"):''}{active&&task&&task.progress>0?` · ${task.progress}%`:''}</span>

            <button type="button" title={V("保存设置")} aria-label={V("保存设置")} className={`${videoButtonClass} h-8 w-8 shrink-0 p-0`} disabled={readOnly||busy||importing} onClick={()=>void submit(false)}>{busy?<Loader2 size={14} className="animate-spin"/>:saved?<Check size={14}/>:<Save size={14}/>}</button>
            {!active&&!readOnly&&<span className="flex items-center gap-1 text-xs font-semibold canvas-ui-muted" data-testid="video-composer-price"><Sparkles size={13}/>{priceText}</span>}
            {active?<button type="button" aria-label={V(task?.cancellationRequestedAt?"正在停止":"停止")} title={V(task?.cancellationRequestedAt?"正在停止":"停止")} className="canvas-ui-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40" disabled={readOnly||busy||generationBlocked||!!task?.cancellationRequestedAt||!onCancel||['needs_attention','creation_unknown'].includes(task?.status||'')} onClick={onCancel}><Square size={13} fill="currentColor"/></button>:<button type="button" aria-label={V("生成视频")} title={V("生成视频")} className="canvas-ui-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40" disabled={readOnly||busy||importing||catalogLoading||!!invalid||!config.comfyWorkflowId&&!compileReady} onClick={()=>void submit(true)}>{busy?<Loader2 size={17} className="animate-spin"/>:<ArrowUp size={19}/>}</button>}
        </>);
    const dockFeedback=((error||task?.error||invalid)&&<p role={error?"alert":"status"} className="mb-2 break-words text-xs text-amber-600">{V(error||task?.error||invalid||"")}{compilePreview.status==='unavailable'&&<button type='button' className={videoButtonClass} onClick={compilePreview.retry}>{V('重试')}</button>}</p>);
    if(dock)return <CanvasComposerShell ref={dockRef} style={dockStyle} expanded={expanded} onToggleExpand={onToggleExpand} kind="video" compact heading={node.title||V('视频生成')} onDismiss={onClose} closeLabel={V('关闭创作栏')} expandLabel={V('展开输入区')} collapseLabel={V('收起输入区')} data-testid="video-node-dock" role="region" aria-label={V('视频节点设置')} onKeyDown={event=>event.stopPropagation()}>
      <VideoCompactComposer count={count} onCount={value=>{setSaved(false);setCount(value);}} onOptimize={onOptimize} config={config} inputs={resolvedInputs} models={models} choices={choices} nodeId={node.id} light={light} blocked={readOnly||busy||importing}
        onConfig={value=>{setSaved(false);setConfig(value);}} onInputs={value=>{setSaved(false);setInputs(value);setConfig(current=>({...current,references:[]}));}} onImport={onImport} onImportBusyChange={setImporting}
        onStoryboard={onStoryboard?()=>void openStoryboard():undefined} onAdvanced={()=>setInlineAdvanced(true)} advancedOpen={advanced||inlineAdvanced} onCloseAdvanced={()=>{setInlineAdvanced(false);onCloseAdvanced?.();}}
        advancedContent={<VideoSettingsFields hideComposerFields config={config} inputs={resolvedInputs} models={models} choices={choices} nodeId={node.id} email={email} readOnly={readOnly} busy={busy} onConfig={value=>{setSaved(false);setConfig(value);}} onInputs={value=>{setSaved(false);setInputs(value);}} onImport={onImport} onImportBusyChange={setImporting} onLoadMoreAssets={onLoadMoreAssets} canLoadMoreAssets={canLoadMoreAssets}/>}
        actions={dockActions} feedback={<>{catalogError&&<p role="alert" className="mb-2 text-xs text-red-500">{V(catalogError)}{onRetryCatalog&&<button type="button" className={videoButtonClass} onClick={()=>void onRetryCatalog()}>{V('重试视频模型')}</button>}</p>}{dockFeedback}</>}/>
    </CanvasComposerShell>;
    if (typeof document === "undefined")
        return null;
    return createPortal(<div ref={dialogRef} className={`fixed inset-0 z-[100] flex items-center justify-center p-3 ${light ? "canvas-ui-light text-slate-800" : "canvas-ui-dark text-slate-100"}`} data-canvas-hotkeys-blocked="true" aria-modal="true" role="dialog" aria-label={V("视频节点设置")} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button type="button" aria-label={V("关闭视频节点设置")} className="absolute inset-0 bg-black/50" onClick={onClose}/>
    <div className={`relative flex max-h-[calc(100dvh-24px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${light ? "border-slate-200 bg-white" : "border-white/10 bg-[#171d25]"}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-current/10 px-4 py-3"><h2 className="text-sm font-semibold">{V("\u89C6\u9891\u8282\u70B9")}</h2><button type="button" className={videoButtonClass} aria-label={V("关闭")} onClick={onClose}><X size={16}/></button></header>
      <div data-testid="video-settings-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {!config.comfyWorkflowId&&(catalogLoading||catalogError)&&<div className="mb-3 flex items-center gap-3 text-xs"><span role={catalogError?"alert":"status"}>{V(catalogLoading?"视频模型加载中…":catalogError)}</span>{catalogError&&onRetryCatalog&&<button type="button" className={videoButtonClass} disabled={catalogLoading} onClick={()=>void onRetryCatalog()}>{V("重试视频模型")}</button>}</div>}
        <fieldset disabled={readOnly || busy || importing} className="min-w-0">
        <VideoField label={V("节点名称")}><input aria-label={V("视频节点名称")} value={title} onChange={event => setTitle(event.target.value)} className={videoFieldClass}/></VideoField>
        <VideoSettingsFields config={config} inputs={resolvedInputs} models={models} choices={choices} nodeId={node.id} email={email} readOnly={readOnly} busy={busy} onConfig={setConfig} onInputs={setInputs} onImport={onImport} onImportBusyChange={setImporting} onLoadMoreAssets={onLoadMoreAssets} canLoadMoreAssets={canLoadMoreAssets}/>

      </fieldset></div>
      <footer className="shrink-0 space-y-2 border-t border-current/10 px-4 py-3">{(error || invalid) && <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-red-500" : "text-amber-500"}`}>{V(error || invalid || "")}{compilePreview.status==='unavailable'&&<button type="button" className={videoButtonClass} onClick={compilePreview.retry}>{V("重试")}</button>}</p>}<div className="flex justify-end gap-2"><button type="button" className={videoButtonClass} disabled={readOnly || busy || importing} onClick={() => void submit(false)}>{busy ? V("保存中…") : V("保存设置")}</button><button type="button" className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-40" disabled={readOnly || busy || importing || active || catalogLoading || !!invalid || !config.comfyWorkflowId && !compileReady} onClick={() => void submit(true)}>{V("\u751F\u6210\u89C6\u9891 \u00B7 ")}{readOnly ? V("只读") : config.comfyWorkflowId ? V("0 积分") : priceText}</button></div></footer>
    </div>
  </div>, document.body);
}
