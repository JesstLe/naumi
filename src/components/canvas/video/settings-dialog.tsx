"use client";
import {useVideoI18n} from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import type { OrderedInput } from "@/lib/video/references";
import { catalogCapability, selectedVideoCatalogModel, validateVideoSettings, type VideoCatalogModel, type VideoNodeConfig, type VideoInputChoice } from "@/lib/video/client-settings";
import { useBillingEstimate, type PublicQuote } from "@/lib/billing/client";
import { VideoSettingsFields } from "./settings-fields";
import { VideoSourceAttribution } from "./source-attribution";
import { VideoField, videoFieldClass, videoButtonClass, assertVideoFieldsValid } from "./form-controls";
import { isTopVideoDialog } from "./dialog-stack";
export type VideoNodeDraft = {
    title: string;
    config: VideoNodeConfig;
    inputs: OrderedInput[];
    expectedRevision: number;
};
export function VideoSettingsDialog({ node, models, choices, light, email, readOnly = false, onClose, onSave, onGenerate, onImport, onLoadMoreAssets, canLoadMoreAssets = false, catalogLoading=false, catalogError="", onRetryCatalog }: {
    node: CanvasVideoNode;
    models: VideoCatalogModel[];
    choices: VideoInputChoice[];
    light: boolean;
    email?: string;
    readOnly?: boolean;
    onClose: () => void;
    onSave: (draft: VideoNodeDraft) => Promise<void>;
    onGenerate: (draft: VideoNodeDraft, quote: PublicQuote | null) => Promise<void>;
    onImport?: (files: File[]) => Promise<VideoInputChoice[]>;
    onLoadMoreAssets?: () => Promise<void>;
    canLoadMoreAssets?: boolean;
    catalogLoading?: boolean;
    catalogError?: string;
    onRetryCatalog?: () => Promise<void>;
}) {
    const V = useVideoI18n();
    const [title, setTitle] = useState(node.title), [config, setConfig] = useState<VideoNodeConfig>(() => structuredClone(node.config)), [inputs, setInputs] = useState<OrderedInput[]>(() => structuredClone(node.inputs));
    const revision = useRef(node.revision), [busy, setBusy] = useState(false), [importing, setImporting] = useState(false), [error, setError] = useState("");
    const dialogRef = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
    closeRef.current = onClose;
    const cap = catalogCapability(selectedVideoCatalogModel(models,config));
    const estimate = useBillingEstimate({ feature: "video.generate", quantity: 1, canvas: true, modelId: config.modelId, providerId: config.providerId, resolution: config.resolution }, !readOnly && !config.comfyWorkflowId);
    const invalid = validateVideoSettings(config, inputs, cap, choices);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary') || []).filter(element => element.offsetParent !== null);
        focusables()[0]?.focus();
        const keyboard = (event: KeyboardEvent) => {
            if (!isTopVideoDialog(dialogRef.current))
                return;
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
    }, []);
    async function submit(generate: boolean) { if (readOnly || busy || importing)
        return; setBusy(true); setError(""); try {
        assertVideoFieldsValid(dialogRef.current);
        const draft = { title, config, inputs, expectedRevision: revision.current };
        if (generate) {
            if (!config.comfyWorkflowId && !estimate.quote)
                throw new Error(estimate.error || "请等待报价");
            await onGenerate(draft, config.comfyWorkflowId ? null : estimate.quote);
        }
        else
            await onSave(draft);
        onClose();
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "视频节点保存失败");
    }
    finally {
        setBusy(false);
    } }
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
        <VideoSettingsFields config={config} inputs={inputs} models={models} choices={choices} nodeId={node.id} email={email} readOnly={readOnly} busy={busy} onConfig={setConfig} onInputs={setInputs} onImport={onImport} onImportBusyChange={setImporting} onLoadMoreAssets={onLoadMoreAssets} canLoadMoreAssets={canLoadMoreAssets}/>

      </fieldset></div>
      <footer className="shrink-0 space-y-2 border-t border-current/10 px-4 py-3">{(error || invalid || !config.comfyWorkflowId && estimate.error) && <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-red-500" : "text-amber-500"}`}>{V(error || invalid || estimate.error||"")}</p>}<div className="flex flex-wrap items-center justify-between gap-3"><VideoSourceAttribution /><div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={readOnly || busy || importing} onClick={() => void submit(false)}>{busy ? V("保存中…") : V("保存设置")}</button><button type="button" className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-40" disabled={readOnly || busy || importing || !!invalid || !config.comfyWorkflowId && !estimate.quote} onClick={() => void submit(true)}>{V("\u751F\u6210\u89C6\u9891 \u00B7 ")}{readOnly ? V("只读") : config.comfyWorkflowId ? V("0 积分") : estimate.quote ? V(`${estimate.quote.mode === "api-cost-plus" ? "上限 " : ""}${estimate.quote.mode === "api-cost-plus" ? estimate.quote.authorizedCredits ?? estimate.quote.reserveCredits : estimate.cost} 积分`) : V("报价中…")}</button></div></div></footer>
    </div>
  </div>, document.body);
}
