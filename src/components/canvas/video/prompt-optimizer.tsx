"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, WandSparkles, X } from "lucide-react";
import { CanvasActionPanel } from "../canvas-action-menu";
import { useVideoI18n } from "./i18n";
import { videoButtonClass, videoFieldClass } from "./form-controls";

export function VideoPromptOptimizer({ prompt, disabled, light, onOptimize, onApply }: {
  prompt: string; disabled: boolean; light: boolean;
  onOptimize: (prompt: string, signal: AbortSignal) => Promise<string>; onApply: (value: string) => void;
}) {
  const V = useVideoI18n(), anchor = useRef<HTMLButtonElement>(null), request = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [source, setSource] = useState(""), [result, setResult] = useState("");
  useEffect(() => () => request.current?.abort(), []);
  function close() { request.current?.abort(); request.current = null; setOpen(false); setBusy(false); }
  async function optimize() {
    if (disabled || busy || !prompt.trim()) return;
    const controller = new AbortController(); request.current = controller;
    setSource(prompt); setResult(""); setError(""); setOpen(true); setBusy(true);
    try { const value = await onOptimize(prompt, controller.signal); if (!controller.signal.aborted) setResult(value); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : V("提示词优化失败")); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  const changed = source !== prompt;
  return <>
    <button ref={anchor} type="button" aria-label={V("提示词优化")} title={V("提示词优化")} aria-expanded={open} disabled={disabled || busy || !prompt.trim()} onClick={() => void optimize()} className="canvas-ui-control flex h-8 w-8 items-center justify-center rounded-[9px] border disabled:opacity-40"><WandSparkles size={15}/></button>
    {open && <CanvasActionPanel anchorRef={anchor} label={V("提示词优化")} width={480} light={light} onClose={close}>
      <div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{V("提示词优化")}</span><button type="button" aria-label={V("关闭")} className={videoButtonClass} onClick={close}><X size={14}/></button></div>
      {busy ? <p role="status" className="flex items-center gap-2 py-6 text-xs canvas-ui-muted"><Loader2 size={15} className="animate-spin"/>{V("正在优化提示词…")}</p> : <>
        {error && <p role="alert" className="mb-3 text-xs text-amber-600">{V(error)}</p>}
        {result && <><label className="mb-1 block text-xs canvas-ui-muted" htmlFor="video-optimized-prompt">{V("优化预览")}</label><textarea id="video-optimized-prompt" aria-label={V("优化预览")} className={`${videoFieldClass} max-h-72 resize-y`} value={result} readOnly rows={8}/></>}
        {changed && <p role="status" className="mt-2 text-xs text-amber-600">{V("原提示词已修改，请重新优化")}</p>}
        <div className="mt-3 flex justify-end gap-2"><button type="button" className={videoButtonClass} disabled={disabled} onClick={() => void optimize()}>{V("重新优化")}</button><button type="button" className="canvas-ui-primary rounded-lg px-3 py-2 text-xs disabled:opacity-40" disabled={disabled || changed || !result} onClick={() => { onApply(result); close(); }}>{V("应用提示词")}</button></div>
      </>}
    </CanvasActionPanel>}
  </>;
}
