"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowRightToLine, ArrowUp, Check, CircleHelp, Copy, Frame, History, Image as ImageIcon, Infinity as InfinityIcon, LayoutTemplate, Loader2, MessageSquarePlus, Palette, Plus, RefreshCw, ScanLine, SlidersHorizontal, ThumbsDown, ThumbsUp, Type, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentActivityLabel, agentElapsedLabel } from "@/lib/canvas/agent-activity";
import type { AgentOrbStep } from "@/lib/canvas/agent-orb";
import type { OrbAttention } from "../naumi-orb/orb-companion";

export type CanvasAssistantTurn = { id: string; role: "user" | "assistant"; content: string; artifacts?: {id:string;image:string;title:string}[] };
export type CanvasAssistantTask = { id: string; label: string; prompt: string };
export type CanvasAssistantLabels = {
  title: string; newChat: string; history: string; close: string; back: string;
  morning: string; afternoon: string; evening: string; question: string; changeTasks: string;
  placeholder: string; send: string; references: string; closeReferences: string; currentImage: string; upstreamImage: string;
  thinking: string; copy: string; copied: string; emptyHistory: string; currentChat: string;
  agent: string; mode: string; retry: string; scrollToBottom: string;
};
export type SavedConversation = { id: string; title: string; turns: CanvasAssistantTurn[]; updatedAt?:string };

/** Presentation-only sidebar: the parent owns SSE, context, model routing and billing. */
export function CanvasAssistantPanel({ light, anchorTitle, contextImages, turns, input, busy, error,
  costLabel, labels, tasks, onInputChange, onSend, onNewChat, onRestoreChat, onClose, onPreview,
  onCopy, onFeedback, feedbackLabels = { positive: "有帮助", negative: "需要改进" }, renderContent, modelControl, steps = [], onStop, onClearReference, historyLoader, historyScopeKey = "", onRenameHistory, onDeleteHistory, open = true, focusInput = true, contextReady = true, english = false, responding = false, attention,
}: {
  open?: boolean;
  focusInput?: boolean;
  contextReady?: boolean;
  english?: boolean;
  responding?: boolean;
  attention?: OrbAttention;
  light: boolean;
  anchorTitle: string;
  contextImages: { id: string; title: string; image: string }[];
  turns: CanvasAssistantTurn[];
  input: string;
  busy: boolean;
  error: string | null;
  costLabel: string;
  modelControl?: ReactNode;
  steps?: AgentOrbStep[];
  onStop?: () => void;
  onClearReference?: () => void;
  historyLoader?: () => Promise<SavedConversation[]>;
  historyScopeKey?: string;
  onRenameHistory?: (id:string,title:string) => Promise<void>;
  onDeleteHistory?: (id:string) => Promise<void>;
  labels: CanvasAssistantLabels;
  tasks: CanvasAssistantTask[];
  onInputChange: (value: string) => void;
  onSend: () => void;
  onNewChat: () => void;
  onRestoreChat: (turns: CanvasAssistantTurn[], id?:string) => void;
  onClose: () => void;
  onPreview: (image: { image: string; title: string }) => void;
  onCopy: (content: string) => Promise<boolean>;
  onFeedback?: (positive: boolean) => void;
  feedbackLabels?: { positive: string; negative: string };
  renderContent: (content: string) => ReactNode;
}) {
  const composer = useRef<HTMLTextAreaElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const keepAtBottom = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const referenceArea = useRef<HTMLDivElement>(null);
  const referenceTrigger = useRef<HTMLButtonElement>(null);
  const [taskPage, setTaskPage] = useState(0);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [saved, setSaved] = useState<SavedConversation[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
  const [editingHistory,setEditingHistory]=useState<string|null>(null),[historyTitle,setHistoryTitle]=useState(""),[deletingHistory,setDeletingHistory]=useState<string|null>(null),[historyMutating,setHistoryMutating]=useState(false);
  async function mutateHistory(id:string,remove=false){
    if(historyMutating||busy||(!remove&&!historyTitle.trim()))return;
    setHistoryMutating(true);setHistoryError("");
    try{if(remove){await onDeleteHistory?.(id);setSaved(items=>items.filter(item=>item.id!==id));setDeletingHistory(null);}
    else{const title=historyTitle.trim();await onRenameHistory?.(id,title);setSaved(items=>items.map(item=>item.id===id?{...item,title}:item));setEditingHistory(null);}}
    catch(error){setHistoryError(error instanceof Error?error.message:"历史操作失败");}
    finally{setHistoryMutating(false);}
  }
  const loader=useRef(historyLoader);loader.current=historyLoader;
  useEffect(()=>{if(!historyOpen||!loader.current)return;let active=true;setHistoryLoading(true);setHistoryError("");void loader.current().then(items=>{if(active)setSaved(items);}).catch(()=>{if(active)setHistoryError("历史记录读取失败，请重新打开重试");}).finally(()=>{if(active)setHistoryLoading(false);});return()=>{active=false;};},[historyOpen,historyScopeKey]);
  const [copied, setCopied] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [hour] = useState(() => new Date().getHours());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const activityLabel = agentActivityLabel(busy, "running", steps, english, responding, attention);
  const greeting = hour < 12 ? labels.morning : hour < 18 ? labels.afternoon : labels.evening;
  const visibleTasks = tasks.slice((taskPage % Math.max(1, Math.ceil(tasks.length / 4))) * 4, (taskPage % Math.max(1, Math.ceil(tasks.length / 4))) * 4 + 4);
  const iconButton = "canvas-ui-action flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35";
  const taskIcons = { main: Frame, detail: LayoutTemplate, scene: ImageIcon, retouch: SlidersHorizontal, background: Palette, copyLayout: Type, review: ScanLine, prompt: MessageSquarePlus };

  useEffect(() => {
    if (!referencesOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !referenceArea.current?.contains(event.target)) setReferencesOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [referencesOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setOverlay(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !focusInput) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    composer.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, focusInput]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    const host = field.closest("aside");
    const resize = () => {
      const maxHeight = Math.max(64, Math.min(144, (host?.clientHeight ?? window.innerHeight) - 260));
      field.style.height = "0px";
      field.style.height = `${Math.min(maxHeight, Math.max(64, field.scrollHeight))}px`;
      field.style.overflowY = field.scrollHeight > maxHeight ? "auto" : "hidden";
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (host) observer.observe(host);
    return () => observer.disconnect();
  }, [input, historyOpen, open]);
  useEffect(() => {
    if (keepAtBottom.current && scrollArea.current) {
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
      setShowScrollToBottom(false);
    }
  }, [turns, busy, steps, historyOpen]);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function rememberCurrent() {
    if (historyLoader) return;
    if (!turns.some(turn => turn.content.trim())) return;
    const snapshot = turns.map(turn => ({ ...turn }));
    const title = turns.find(turn => turn.role === "user")?.content.trim().slice(0, 42) || anchorTitle;
    setSaved(current => current.some(item => JSON.stringify(item.turns) === JSON.stringify(snapshot)) ? current : [
      { id: `${Date.now()}-${current.length}`, title, turns: snapshot }, ...current,
    ].slice(0, 20));
  }
  function newChat() {
    if (busy) return;
    rememberCurrent();
    onNewChat();
    keepAtBottom.current = true;
    setHistoryOpen(false);
    setReferencesOpen(false);
    composer.current?.focus({ preventScroll: true });
  }

  if (!open) return null;
  return <>
  {overlay && <div data-testid="canvas-assistant-backdrop" aria-hidden="true" className="absolute inset-0 z-30 bg-[var(--canvas-ui-mask)]" onPointerDown={onClose} />}
  <aside id="canvas-agent-panel" data-testid="canvas-assistant-panel" aria-label={labels.title} role={overlay ? "dialog" : "complementary"} aria-modal={overlay || undefined} data-canvas-hotkeys-blocked={overlay ? "true" : "false"} data-canvas-hotkeys-scope="assistant"
    className={cn("canvas-ui-surface canvas-ui-surface-solid canvas-ui-side-panel z-40 flex min-h-0 flex-col overflow-hidden rounded-[24px] border shadow-[0_4px_24px_rgba(15,23,42,0.05)]",
      "absolute bottom-2 right-2 top-2 w-[min(360px,calc(100%-1rem))] !rounded-[24px] min-[1024px]:relative min-[1024px]:inset-auto min-[1024px]:my-2 min-[1024px]:mr-2 min-[1024px]:w-[360px] min-[1024px]:shrink-0",
      light ? "canvas-ui-light" : "canvas-ui-dark")}
    onKeyDown={event => {
      if (overlay && event.key === "Tab") {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      if (referencesOpen) { setReferencesOpen(false); referenceTrigger.current?.focus({ preventScroll: true }); }
      else if (historyOpen) { setHistoryOpen(false); composer.current?.focus({ preventScroll: true }); }
      else onClose();
    }}>
    <header className="flex h-14 shrink-0 items-center justify-between px-4">
      <div className="flex min-w-0 items-center gap-2.5"><span className="canvas-ui-section flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"><InfinityIcon className="h-4 w-4" aria-hidden="true" /></span><h2 className="text-[13px] font-semibold">{labels.title}</h2></div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={labels.newChat} title={labels.newChat} disabled={busy || (!turns.length && !input.trim())} className={iconButton} onClick={newChat}>
          <MessageSquarePlus className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button type="button" aria-label={historyOpen ? labels.back : labels.history} title={historyOpen ? labels.back : labels.history} aria-pressed={historyOpen} disabled={busy}
          className={iconButton} onClick={() => setHistoryOpen(open => !open)}>
          <History className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button type="button" aria-label={labels.close} title={labels.close} className={iconButton} onClick={onClose}>
          <ArrowRightToLine className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={scrollArea} data-testid="canvas-assistant-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--canvas-ui-border)_transparent]"
      onScroll={event => { const el = event.currentTarget; keepAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setShowScrollToBottom(!keepAtBottom.current); }}>
      {historyOpen ? <section className="space-y-2 p-4" aria-label={labels.history}>
        {historyLoading && <p role="status" className="text-[12px]">正在读取历史对话…</p>}
        {historyError && <p role="alert" className="text-[12px]">{historyError}</p>}
        {turns.length > 0 && <button type="button" className="canvas-ui-control flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-[13px]"
          onClick={() => { setHistoryOpen(false); composer.current?.focus({ preventScroll: true }); }}>
          <MessageSquarePlus className="h-4 w-4 shrink-0" />{labels.currentChat}
        </button>}
        {!saved.length && !historyLoading && !historyError && <p className="canvas-ui-muted py-10 text-center text-[13px]">{labels.emptyHistory}</p>}
        {saved.map(item => <div key={item.id} className="rounded-xl border border-[var(--canvas-ui-border)]"><button type="button" data-testid="canvas-assistant-history-item" disabled={busy}
          className="canvas-ui-action flex w-full items-start gap-2 rounded-xl border border-[var(--canvas-ui-border)] px-3 py-3 text-left text-[13px]"
          onClick={() => { rememberCurrent(); onRestoreChat(item.turns.map(turn => ({ ...turn })), historyLoader ? item.id : undefined); keepAtBottom.current = true; setHistoryOpen(false); composer.current?.focus({ preventScroll: true }); }}>
          <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{item.title}</span>
        </button>{(onRenameHistory||onDeleteHistory)&&<div className="px-3 pb-2 text-[11px]">
          {editingHistory===item.id?<form className="flex items-center gap-2 pt-2" onSubmit={event=>{event.preventDefault();void mutateHistory(item.id);}}>
            <input autoFocus aria-label="会话名称" value={historyTitle} maxLength={120} disabled={historyMutating} onChange={event=>setHistoryTitle(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setEditingHistory(null);}}} className="canvas-ui-control min-w-0 flex-1 rounded-lg border px-2 py-1.5" />
            <button type="submit" disabled={historyMutating||!historyTitle.trim()} className={iconButton}>保存</button><button type="button" disabled={historyMutating} onClick={()=>setEditingHistory(null)} className={iconButton}>取消</button>
          </form>:deletingHistory===item.id?<div className="flex items-center justify-end gap-3 pt-2" role="group" aria-label="确认删除会话"><span className="mr-auto">删除此会话？</span><button type="button" disabled={historyMutating} onClick={()=>void mutateHistory(item.id,true)} className="text-red-600">确认删除</button><button type="button" disabled={historyMutating} onClick={()=>setDeletingHistory(null)}>取消</button></div>:<div className="flex justify-end gap-3 pt-1">
            {onRenameHistory&&<button type="button" disabled={busy||historyMutating} onClick={()=>{setEditingHistory(item.id);setHistoryTitle(item.title);setDeletingHistory(null);}}>改名</button>}
            {onDeleteHistory&&<button type="button" disabled={busy||historyMutating} onClick={()=>{setDeletingHistory(item.id);setEditingHistory(null);}}>删除</button>}
          </div>}
        </div>}</div>)}
      </section> : <div className={cn("flex min-h-full flex-col", !turns.length && !busy ? "justify-center px-6 py-8 max-[480px]:px-5" : "gap-5 px-5 py-5")}>
        {!turns.length && !busy && <section data-testid="canvas-assistant-welcome">
          <h3 className="text-[22px] font-semibold leading-[1.45] tracking-tight">{greeting}<br /><span className="canvas-ui-muted text-[18px] font-normal">{labels.question}</span></h3>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {visibleTasks.map(task => { const TaskIcon = taskIcons[task.id as keyof typeof taskIcons] || ImageIcon; const selected = input === task.prompt; return <button key={task.id} type="button" data-testid="canvas-assistant-task" disabled={busy} aria-pressed={selected}
              className={cn("group flex min-h-[94px] w-full flex-col justify-between gap-3 rounded-[14px] border p-3 text-left text-[12px] leading-5 transition-colors hover:bg-[var(--canvas-ui-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-border-strong)] disabled:opacity-40", selected ? "border-[var(--canvas-ui-border-strong)] bg-[var(--canvas-ui-soft)]" : "border-[var(--canvas-ui-border)]")}
              onClick={() => { onInputChange(task.prompt); composer.current?.focus({ preventScroll: true }); }}>
              <span className="flex w-full items-center justify-between"><span className="canvas-ui-section flex h-7 w-7 items-center justify-center rounded-lg"><TaskIcon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /></span>{selected ? <Check className="h-3.5 w-3.5 canvas-ui-muted" aria-hidden="true" /> : <ArrowRight className="h-3.5 w-3.5 canvas-ui-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />}</span><span className="canvas-ui-text font-medium">{task.label}</span>
            </button>; })}
          </div>
          {tasks.length > 4 && <button type="button" className="canvas-ui-action mt-5 flex items-center gap-2 rounded-lg px-1 py-1.5 text-[12px]"
            onClick={() => setTaskPage(page => page + 1)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{labels.changeTasks}</button>}
        </section>}
        {turns.map(turn => turn.role === "user" ? <div key={turn.id} className="flex justify-end">
          <div className="canvas-ui-message max-w-[90%] whitespace-pre-wrap break-words rounded-[16px] rounded-br-[5px] px-3.5 py-2.5 text-[13px] leading-6">{turn.content}</div>
        </div> : <article key={turn.id} className="min-w-0 text-[13px] leading-6">
          <div className="min-w-0 break-words canvas-ui-text">{renderContent(turn.content)}</div>
          {!!turn.artifacts?.length && <div className="mt-3 grid grid-cols-2 gap-2" data-testid="canvas-assistant-results">{turn.artifacts.map(art => <button type="button" key={art.id} onClick={() => onPreview(art)} className="overflow-hidden rounded-xl border border-[var(--canvas-ui-border)] text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art.image} alt={art.title} className="aspect-square w-full object-contain" /><span className="block truncate px-2 py-1 text-[11px]">{art.title}</span>
          </button>)}</div>}
          {turn.content.trim() && !busy && <div className="mt-1 flex items-center gap-1"><button type="button" aria-label={copied === turn.id ? labels.copied : labels.copy} title={copied === turn.id ? labels.copied : labels.copy}
            className={cn(iconButton, "mt-1")} onClick={() => { void onCopy(turn.content).then(ok => { if (ok) setCopied(turn.id); }); }}>
            {copied === turn.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>{onFeedback && [true, false].map(positive => <button type="button" key={String(positive)} className={cn(iconButton, feedback[turn.id] === positive && "bg-[var(--canvas-ui-border)]")}
            aria-label={positive ? feedbackLabels.positive : feedbackLabels.negative} title={positive ? feedbackLabels.positive : feedbackLabels.negative} aria-pressed={feedback[turn.id] === positive}
            onClick={() => { if (feedback[turn.id] === positive) return; setFeedback(current => ({ ...current, [turn.id]: positive })); onFeedback(positive); }}>
            {positive ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
          </button>)}</div>}
        </article>)}
        {!!steps.length && <div data-testid="canvas-assistant-progress" className="space-y-2 rounded-xl border border-[var(--canvas-ui-border)] p-3 text-[12px]">{steps.map(step => {
          // A disconnected/stopped client cannot claim the supplier's task is still running or cancelled.
          const unconfirmed = step.status === "running" && !busy;
          const Icon = unconfirmed ? CircleHelp : step.status === "running" ? Loader2 : step.status === "error" ? X : Check;
          const statusLabel = unconfirmed ? english ? "Check history" : "待核对" : step.status === "running" ? english ? "Running" : "执行中" : step.status === "error" ? english ? "Failed" : "失败" : english ? "Done" : "已完成";
          return <div key={step.id} data-tool-status={unconfirmed ? "unconfirmed" : step.status} className="flex items-start gap-2">
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", busy && step.status === "running" && "animate-spin")} />
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><span>{step.label}</span><span className="canvas-ui-muted shrink-0 text-[10px]">{statusLabel}</span></div>
              {step.summary && <p className="canvas-ui-muted mt-0.5 break-words text-[11px]">{step.summary}</p>}
            </div>
          </div>;
        })}</div>}
        {busy && <div data-testid="canvas-assistant-activity" className="canvas-ui-muted flex flex-wrap items-center justify-between gap-2 text-[12px]"><span role="status" aria-live="polite" className="flex items-center gap-2">{attention ? <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}{activityLabel}</span><span data-testid="canvas-assistant-elapsed" className="text-[11px] tabular-nums">{agentElapsedLabel(elapsed, english)}</span></div>}
        {!busy && attention && <div role="status" data-testid="canvas-assistant-attention" className="canvas-ui-muted flex items-center gap-2 text-[12px]"><CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />{activityLabel}</div>}
      </div>}
    </div>
    {showScrollToBottom && !historyOpen && <button type="button" data-testid="canvas-assistant-scroll-bottom" aria-label={labels.scrollToBottom} title={labels.scrollToBottom}
      className="canvas-ui-surface canvas-ui-surface-solid absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--canvas-ui-border-strong)]"
      onClick={() => { if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight; keepAtBottom.current = true; setShowScrollToBottom(false); }}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>}
    </div>

    <footer className="shrink-0 px-3 pb-3 pt-2">
      {error && <div role="alert" className="mb-2 rounded-xl border border-[#f0c8c3] bg-[#fff5f3] px-3 py-2 text-[12px] text-[#b44f43]">
        {error}
        <button type="button" disabled={busy || !input.trim()} className="ml-2 font-semibold underline disabled:opacity-40" onClick={onSend}>{labels.retry}</button>
      </div>}
      <div ref={referenceArea} data-testid="canvas-assistant-composer" className="relative rounded-[20px] border border-[var(--canvas-ui-border)] p-3 shadow-[0_2px_12px_rgba(15,23,42,0.02)] transition-[border-color,box-shadow] focus-within:border-[var(--canvas-ui-border-strong)] focus-within:shadow-[0_0_0_3px_var(--canvas-ui-soft)]">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <span className="canvas-ui-muted inline-flex items-center gap-1.5 px-0.5 text-[11px] font-medium"><ImageIcon className="h-3 w-3" aria-hidden="true" />{labels.mode}</span>
          {contextImages.length > 0 && <button type="button" title={anchorTitle} aria-label={labels.references} aria-expanded={referencesOpen}
            className="canvas-ui-action flex min-w-0 max-w-[160px] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px]" onClick={() => setReferencesOpen(open => !open)}>
            <span className="flex shrink-0 -space-x-2" aria-hidden="true">{contextImages.slice(0, 2).map(image => <span key={image.id} className="canvas-ui-surface-solid h-5 w-5 overflow-hidden rounded border border-[var(--canvas-ui-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.image} alt="" className="h-full w-full object-cover" /></span>)}</span><span className="truncate">{anchorTitle}</span><span className="canvas-ui-section shrink-0 rounded px-1 text-[10px] tabular-nums">{contextImages.length}</span>
          </button>}
        </div>
        {referencesOpen && <div data-testid="canvas-assistant-references" className="canvas-ui-surface canvas-ui-surface-solid absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-[16px] border p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-[12px] font-semibold"><span>{labels.references}</span>{onClearReference && <button type="button" disabled={busy} className={iconButton} onClick={()=>{onClearReference();setReferencesOpen(false);}} aria-label="移除图片参考" title="移除图片参考"><X className="h-3.5 w-3.5" /></button>}<button type="button" aria-label={labels.closeReferences} className={iconButton} onClick={() => setReferencesOpen(false)}><X className="h-3.5 w-3.5" /></button></div>
          <div className="flex gap-2 overflow-x-auto">
            {contextImages.map((image, index) => <button key={image.id} type="button" onClick={() => onPreview(image)} title={`${index === 0 ? labels.currentImage : labels.upstreamImage}: ${image.title}`}
              className={cn("h-12 w-12 shrink-0 overflow-hidden rounded-lg border", index === 0 ? "border-[#16849a]" : "border-[var(--canvas-ui-border)]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.image} alt={image.title || (index === 0 ? labels.currentImage : labels.upstreamImage)} className="h-full w-full object-cover" />
            </button>)}
          </div>
        </div>}
        <textarea ref={composer} data-testid="canvas-assistant-input" aria-label={labels.placeholder} rows={2} value={input} disabled={busy}
          placeholder={labels.placeholder} onChange={event => onInputChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); event.stopPropagation(); if (!busy && input.trim()) onSend();
            }
          }}
          className="canvas-ui-text block min-h-[64px] max-h-36 w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-6 outline-none placeholder:text-[var(--canvas-ui-muted)] disabled:opacity-60" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button ref={referenceTrigger} type="button" disabled={!contextImages.length} aria-label={labels.references} title={labels.references} aria-expanded={referencesOpen} className={cn(iconButton, "canvas-ui-control rounded-full")} onClick={() => setReferencesOpen(open => !open)}><Plus className="h-4 w-4" aria-hidden="true" /></button>
            {modelControl ? <div className="min-w-0 flex-1" data-testid="canvas-assistant-model">{modelControl}</div> : <span className="canvas-ui-muted inline-flex items-center gap-1.5 text-[12px] font-semibold"><InfinityIcon className="h-4 w-4" aria-hidden="true" />{labels.agent}</span>}
          </div>
          <button type="button" aria-label={busy && onStop ? "停止任务" : labels.send} title={busy && onStop ? "停止任务" : labels.send} disabled={busy ? !onStop : !input.trim()} onClick={busy && onStop ? onStop : onSend}
            className="canvas-ui-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-85 disabled:opacity-35">
            {busy ? <span className="h-3 w-3 rounded-sm bg-current" aria-hidden="true" /> : <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p className="canvas-ui-muted mt-2 text-center text-[10px] leading-4">{costLabel}</p>
    </footer>
  </aside>
  </>;
}
