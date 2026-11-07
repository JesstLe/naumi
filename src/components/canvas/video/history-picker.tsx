"use client";
import {useVideoI18n} from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, RefreshCw, Send, Trash2, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import type { VideoAssetView } from "@/lib/video/assets";
import type { PublicQuote } from "@/lib/billing/client";
import type { VideoPrivateFetch } from "./use-video-nodes";
import { VideoPlayer, mediaDownloadHref, mediaDownloadName, type VideoPlayerAction } from "./player";
import { useVideoHistory, VideoRetryPriceChanged, type VideoTaskDetail, type CanvasVideoSend } from "./use-video-history";
import { videoButtonClass, videoFieldClass } from "./form-controls";
import { isTopVideoDialog } from "./dialog-stack";
type Props = {
    email?: string;
    projectKey?: string | null;
    node?: CanvasVideoNode;
    initialTaskId?: string;
    projects: {
        key: string;
        name: string;
    }[];
    assets: VideoAssetView[];
    canLoadMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
    request: VideoPrivateFetch;
    light: boolean;
    readOnly?: boolean;
    onClose: () => void;
    onSelectResult?: (artworkId: string | null, expectedRevision: number) => Promise<void>;
    onReuseSettings?: (snapshot: VideoTaskDetail["snapshot"]) => Promise<void>;
    onSent?: (result: CanvasVideoSend) => Promise<void>;
    onRetried?: (result: {
        taskId: string;
        cost: number;
    }) => Promise<void>;
    onProcess?: (artworkId: string, action: VideoPlayerAction, projectKey?: string | null) => void;
};
const status: Record<string, string> = { queued: "排队中", processing: "生成中", needs_attention: "待核查", completed: "已完成", failed: "失败", cancelled: "已停止" };
const sources: Record<string, string> = { canvas: "画布", workbench: "工作台", agent: "Agent", workflow: "工作流" };
function price(value: PublicQuote | null) { return value ? value.mode === "api-cost-plus" ? value.authorizedCredits ?? value.reserveCredits : value.credits : 0; }
export function VideoHistoryPicker({ email, projectKey, node, initialTaskId, projects, assets, canLoadMoreAssets = false, onLoadMoreAssets, request, light, readOnly = false, onClose, onSelectResult, onReuseSettings, onSent, onRetried, onProcess }: Props) {
    const V = useVideoI18n();
    const [onlyProject, setOnlyProject] = useState(!!projectKey), [source, setSource] = useState(""), [selectedId, setSelectedId] = useState(initialTaskId || node?.lastTaskId || ""), [detail, setDetail] = useState<VideoTaskDetail | null>(null), [quote, setQuote] = useState<PublicQuote | null>(null), [quoteReady, setQuoteReady] = useState(false), [quoteError, setQuoteError] = useState(""), [quoteAttempt, setQuoteAttempt] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(""), [assetId, setAssetId] = useState(""), [target, setTarget] = useState(projectKey || ""), [notice, setNotice] = useState(""), [tab, setTab] = useState<"tasks" | "assets">("tasks");
    const store = useVideoHistory({ email, projectKey: onlyProject ? projectKey : undefined, source: source || undefined, readOnly, request }), root = useRef<HTMLDivElement>(null), close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null, items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary') || []).filter(item => item.offsetParent !== null);
        items()[0]?.focus();
        const keyboard = (event: KeyboardEvent) => { if (!isTopVideoDialog(root.current))
            return; if (event.key === "Escape") {
            event.stopPropagation();
            close.current();
        }
        else if (event.key === "Tab") {
            const list = items(), first = list[0], last = list[list.length - 1];
            if (first && event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (first && !event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        } };
        document.addEventListener("keydown", keyboard, true);
        return () => { document.removeEventListener("keydown", keyboard, true); previous?.focus(); };
    }, []);
    useEffect(() => { if (!selectedId && store.tasks.length)
        setSelectedId(store.tasks[0].id); }, [selectedId, store.tasks]);
    const liveTask = store.tasks.find(task => task.id === selectedId);
    useEffect(() => { let stopped = false; setDetail(null); setAssetId(""); setError(""); if (!selectedId)
        return; void store.detail(selectedId).then(value => { if (!stopped) {
        setDetail(value);
        setAssetId(value.task.artworkId);
    } }).catch(cause => { if (!stopped)
        setError(cause instanceof Error ? cause.message : "详情读取失败"); }); return () => { stopped = true; }; }, [selectedId, store.detail, liveTask?.status]);
    useEffect(() => { let stopped = false; setQuote(null); setQuoteReady(false); setQuoteError(""); if (!detail || readOnly || !['failed', 'cancelled'].includes(detail.task.status))
        return; void store.quote(detail).then(value => { if (!stopped) {
        setQuote(value);
        setQuoteReady(true);
    } }).catch(cause => { if (!stopped)
        setQuoteError(cause instanceof Error ? cause.message : "报价失败"); }); return () => { stopped = true; }; }, [detail, readOnly, store.quote, quoteAttempt]);
    const task = liveTask && detail ? { ...detail.task, ...liveTask } : detail?.task, output = task?.resultAssets.find(asset => asset.artworkId === assetId) || task?.resultAssets.find(asset => asset.artworkId === task.artworkId), videoAssets = assets.filter(asset => asset.kind === "video");
    async function act(kind: string, run: () => Promise<void>) { if (busy || readOnly)
        return; setBusy(kind); setError(""); setNotice(""); try {
        await run();
    }
    catch (cause) {
        if (cause instanceof VideoRetryPriceChanged) {
            setQuote(cause.quote);
            setQuoteReady(true);
            setNotice("价格已更新，请重新确认重试");
        }
        else
            setError(cause instanceof Error ? cause.message : "操作失败");
    }
    finally {
        setBusy("");
    } }
    if (typeof document === "undefined")
        return null;
    const view = <div ref={root} role="dialog" aria-modal="true" aria-label={V("视频历史")} data-testid="video-history-picker" data-canvas-hotkeys-blocked="true" className={`fixed inset-0 z-[100] flex items-center justify-center p-3 ${light ? "canvas-ui-light text-slate-800" : "canvas-ui-dark text-slate-100"}`} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button type="button" aria-label={V("关闭视频历史")} className="absolute inset-0 bg-black/60" onClick={onClose}/><div className={`relative flex max-h-[94dvh] w-full max-w-6xl flex-col rounded-2xl border border-current/15 shadow-2xl ${light ? "bg-white" : "bg-[#141c27]"}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-current/10 px-4 py-3"><h2 className="mr-auto text-sm font-semibold">{V("\u89C6\u9891\u5386\u53F2")}</h2><button type="button" className={videoButtonClass} aria-pressed={tab === "tasks"} onClick={() => setTab("tasks")}>{V("\u4EFB\u52A1")}</button><button type="button" className={videoButtonClass} aria-pressed={tab === "assets"} onClick={() => setTab("assets")}>{V("\u5DF2\u62E5\u6709\u89C6\u9891")}</button><button type="button" aria-label={V("关闭")} className={videoButtonClass} onClick={onClose}><X size={16}/></button></header>
      <div className="min-h-0 overflow-y-auto">{tab === "tasks" ? <div className="grid min-h-0 gap-4 p-4 md:grid-cols-[260px_minmax(0,1fr)]"><div className="space-y-2">
        <div className="flex items-center gap-2">{projectKey && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyProject} onChange={event => setOnlyProject(event.target.checked)}/>{V("\u5F53\u524D\u9879\u76EE")}</label>}<button type="button" aria-label={V("刷新视频历史")} className={`${videoButtonClass} ml-auto`} onClick={() => void act("refresh", () => store.refresh())}><RefreshCw size={13}/></button></div>
        <select aria-label={V("任务来源筛选")} className={videoFieldClass} value={source} onChange={event => setSource(event.target.value)}><option value="">{V("\u5168\u90E8\u5165\u53E3")}</option>{Object.entries(sources).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>{store.error && <p role="status" className="text-xs text-amber-500">{store.error}</p>}
        <div className="max-h-[56dvh] space-y-1.5 overflow-y-auto">{store.tasks.map(item => <button type="button" key={item.id} data-testid="video-history-item" data-task-id={item.id} aria-pressed={item.id === selectedId} className={`block w-full rounded-lg border p-2 text-left text-xs ${item.id === selectedId ? "border-teal-500 bg-teal-500/10" : "border-current/10 hover:bg-current/5"}`} onClick={() => setSelectedId(item.id)}><span className="block truncate">{item.prompt || item.model}</span><span className="mt-1 flex gap-2 text-[10px] opacity-60"><span>{V(status[item.status])}</span><span>{item.cost}{V(" \u79EF\u5206")}</span><time className="ml-auto">{new Date(item.createdAt).toLocaleDateString()}</time></span></button>)}</div>{store.nextCursor && <button type="button" className={videoButtonClass} disabled={!!busy} onClick={() => void act("more", store.loadMore)}>{V("\u52A0\u8F7D\u66F4\u591A\u4EFB\u52A1")}</button>}
      </div><div className="min-w-0 space-y-3">{!detail && selectedId ? <Loader2 size={18} className="animate-spin"/> : task && detail ? <>
        {output?.kind === "image" ? <div className="flex h-72 items-center justify-center rounded-lg bg-current/5"><CachedImage src={output.url} alt={output.name} className="max-h-full max-w-full object-contain"/></div> : output || task.videoUrl ? <div className="h-72"><VideoPlayer key={output?.artworkId || task.id} url={output?.url || task.videoUrl} title={task.model} kind={output?.kind === "audio" ? "audio" : "video"} downloadName={output?.name} onProcess={onProcess && output?.kind !== "audio" ? action => onProcess(output?.artworkId || task.artworkId, action, task.projectKey || null) : undefined} canProcess={!readOnly && !busy}/></div> : null}
        <div className="flex flex-wrap items-center gap-2 text-xs"><span>{V(status[task.status])}</span>{task.progress > 0 && task.progress < 100 && ['queued', 'processing'].includes(task.status) && <span>{task.progress}%</span>}<span>{sources[task.source] || task.source}</span><span>{task.model}</span><span>{task.cost}{V(" \u79EF\u5206")}</span>{task.cancellationRequestedAt && <span>{V("\u5DF2\u8BF7\u6C42\u505C\u6B62")}{task.supplierCancellationSupported === false ? V("（上游不支持取消）") : ""}</span>}</div>
        {task.error && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-xs text-red-500">{task.errorCode && `${task.errorCode} · `}{task.error}</p>}
        {task.resultAssets.length > 0 && <div className="space-y-1.5">{task.resultAssets.map(asset => <div key={asset.artworkId} className="flex min-w-0 items-center gap-2 text-xs"><button type="button" className={`${videoButtonClass} min-w-0 flex-1 truncate text-left`} aria-pressed={assetId === asset.artworkId} onClick={() => setAssetId(asset.artworkId)}>{asset.name} · {asset.kind}</button><a aria-label={V(`下载 ${asset.name}`)} className={videoButtonClass} href={mediaDownloadHref(asset.url, asset.name)} download><Download size={12}/></a>{asset.kind === "video" && node && onSelectResult && <button type="button" className={videoButtonClass} disabled={readOnly || !!busy} onClick={() => void act("result", async () => { await onSelectResult(asset.artworkId, node.revision); setNotice("已选择视频结果"); })}>{V("\u4F7F\u7528\u89C6\u9891\u7ED3\u679C")}</button>}</div>)}</div>}
        <details><summary className="cursor-pointer text-xs">{V("\u539F\u4EFB\u52A1\u53C2\u6570")}</summary><div className="mt-2 space-y-2 text-xs"><p className="opacity-60">{V("\u6A21\u578B\u914D\u7F6E ")}{detail.snapshot.modelVersion ?? V("未知")}{V(" \u00B7 \u8BA1\u8D39\u914D\u7F6E ")}{detail.snapshot.billingVersion ?? V("未知")}{detail.snapshot.byoc ? V(" · 自备算力") : ""}</p><pre data-testid="video-history-original-prompt" className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-current/5 p-2">{detail.snapshot.originalPrompt}</pre><details><summary className="cursor-pointer opacity-70">{V("\u7F16\u8BD1\u63CF\u8FF0")}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-current/5 p-2">{detail.snapshot.compiledPrompt}</pre></details><pre data-testid="video-history-parameters" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-current/5 p-2 text-[10px]">{JSON.stringify({ config: detail.snapshot.config, inputs: detail.snapshot.inputs }, null, 2)}</pre>{detail.snapshot.unavailableFields.length > 0 && <p className="text-amber-500">{V("\u65E0\u6CD5\u6062\u590D\uFF1A")}{detail.snapshot.unavailableFields.join("、")}</p>}</div></details>
        <div className="flex flex-wrap items-center gap-2">{onReuseSettings && <button type="button" className={videoButtonClass} disabled={readOnly || !!busy || !!detail.snapshot.unavailableFields.length} onClick={() => void act("reuse", async () => { await onReuseSettings(detail.snapshot); setNotice("原任务参数已加载"); })}>{V("\u590D\u7528\u539F\u53C2\u6570")}</button>}{['queued', 'processing', 'needs_attention'].includes(task.status) && <button type="button" className={videoButtonClass} disabled={readOnly || !!busy || !!task.cancellationRequestedAt} onClick={() => void act("cancel", async () => { await store.cancel(task.id); setNotice("停止请求已提交"); })}>{V("\u505C\u6B62")}</button>}
          {['failed', 'cancelled'].includes(task.status) && <><button type="button" className={videoButtonClass} disabled={readOnly || !!busy || !quoteReady || store.tasks.some(item => item.retryOf === task.id && ['queued', 'processing', 'needs_attention'].includes(item.status))} onClick={() => void act("retry", async () => { const result = await store.retry(detail, quote); await onRetried?.(result); setSelectedId(result.taskId); setNotice(`已创建重试任务 · ${result.cost} 积分`); })}>{V("\u6309\u539F\u4EFB\u52A1\u91CD\u8BD5 \u00B7 ")}{quoteReady ? V(`${quote?.mode === "api-cost-plus" ? "上限 " : ""}${price(quote)} 积分`) : V("报价中…")}</button>{quoteError && <button type="button" className={videoButtonClass} onClick={() => setQuoteAttempt(value => value + 1)}>{V("\u91CD\u65B0\u62A5\u4EF7")}</button>}</>}
          {task.status === "completed" && <><select aria-label={V("发送视频目标项目")} value={target} className={`${videoFieldClass} max-w-52`} onChange={event => setTarget(event.target.value)}><option value="">{V("\u539F\u7ED3\u679C\u9879\u76EE")}</option>{projects.map(project => <option key={project.key} value={project.key}>{project.name}</option>)}</select><button type="button" className={videoButtonClass} disabled={readOnly || !!busy} onClick={() => void act("send", async () => { const result = await store.send(task.id, target || undefined); await onSent?.(result); setNotice(result.replayed ? "已发送至此项目" : "全部产物已发送至画布"); })}><Send size={12} className="mr-1 inline"/>{V("\u53D1\u9001\u5230\u753B\u5E03")}</button></>}
          {['completed', 'failed', 'cancelled'].includes(task.status) && <button type="button" aria-label={V("删除此任务历史")} className={`${videoButtonClass} ml-auto`} disabled={readOnly || !!busy} onClick={() => void act("delete", async () => { await store.remove(task.id); setSelectedId(""); setDetail(null); setNotice("任务历史已删除，作品与媒体保留"); })}><Trash2 size={13}/></button>}
        </div>{quoteError && <p role="status" className="text-xs text-amber-500">{quoteError}</p>}
      </> : null}</div></div> : <div className="space-y-3 p-4">{videoAssets.map(asset => <div key={asset.artworkId} className="flex flex-wrap items-center gap-2 rounded-lg border border-current/10 p-3 text-xs"><span className="min-w-0 flex-1 truncate">{asset.title}</span>{asset.probe && <span className="opacity-60">{asset.probe.durationSeconds.toFixed(2)}s · {asset.probe.width}×{asset.probe.height}</span>}<a className={videoButtonClass} aria-label={V(`下载 ${asset.title}`)} href={mediaDownloadHref(asset.url, mediaDownloadName(asset.url, asset.title))} download><Download size={12}/></a>{node && onSelectResult && <button type="button" className={videoButtonClass} disabled={readOnly || !!busy} onClick={() => void act("asset-result", async () => { await onSelectResult(asset.artworkId, node.revision); setNotice("已选择视频结果"); })}>{V("\u4F7F\u7528\u89C6\u9891\u7ED3\u679C")}</button>}</div>)}{canLoadMoreAssets && onLoadMoreAssets && <button type="button" className={videoButtonClass} disabled={!!busy} onClick={() => void act("assets-more", onLoadMoreAssets)}>{V("\u52A0\u8F7D\u66F4\u591A\u7D20\u6750")}</button>}</div>}</div>
      <footer className="flex shrink-0 items-center gap-2 border-t border-current/10 px-4 py-3 text-xs">{busy && <Loader2 size={12} className="animate-spin"/>}{error && <p role="alert" className="text-red-500">{error}</p>}{notice && <p role="status" className="text-teal-500">{notice}</p>}{node && onSelectResult && <button type="button" className={`${videoButtonClass} ml-auto`} disabled={readOnly || !!busy || !node.displayResultId} onClick={() => void act("latest", async () => { await onSelectResult(null, node.revision); setNotice("已恢复显示最新任务结果"); })}>{V("\u4F7F\u7528\u6700\u65B0\u4EFB\u52A1\u7ED3\u679C")}</button>}</footer>
    </div></div>;
    return createPortal(view, document.body);
}
