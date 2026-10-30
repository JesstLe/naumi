"use client";

import { useSurfaceAppearance } from "@/components/ui/surface-appearance";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, WandSparkles, X } from "lucide-react";
import { CanvasActionPanel } from "./canvas-action-menu";
import { CANVAS_PROMPT_LIMIT } from "@/lib/canvas/prompt-optimization";
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";

type Props = {
  prompt: string; contextKey: string | null; disabled: boolean; english?: boolean;
  onOptimize: (prompt: string, signal: AbortSignal) => Promise<string>;
  onApply: (prompt: string) => void;
};

/** Each result belongs to the exact node, workspace, and source revision. */
export function CanvasPromptOptimizer({ prompt, contextKey, disabled, english, onOptimize, onApply }: Props) {
  const appearance = useSurfaceAppearance() ?? "light";
  const L = (zh: string, en: string) => english ? en : zh;
  const anchor = useRef<HTMLButtonElement>(null), request = useRef<AbortController | null>(null);
  const inputId = useId(), mounted = useRef(true);
  const revision = useRef({ prompt, contextKey, value: 0 });
  if (revision.current.prompt !== prompt || revision.current.contextKey !== contextKey) {
    revision.current = { prompt, contextKey, value: revision.current.value + 1 };
  }
  const [attempt, setAttempt] = useState<{ revision: number; workspaceRevision: number; contextKey: string | null } | null>(null);
  const [busy, setBusy] = useState(false), [result, setResult] = useState(""), [error, setError] = useState("");
  const current = useRef({ disabled, onApply }); current.current = { disabled, onApply };
  function close() { request.current?.abort(); request.current = null; setAttempt(null); setBusy(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { close(); }, [contextKey]);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => {
    const changed = () => close();
    window.addEventListener(WORKSPACE_SELECTION, changed);
    return () => window.removeEventListener(WORKSPACE_SELECTION, changed);
  }, []);

  async function optimize() {
    if (disabled || request.current || !contextKey || !prompt.trim()) return;
    const controller = new AbortController(); request.current = controller;
    const captured = { revision: revision.current.value, workspaceRevision: currentWorkspaceRevision(), contextKey };
    setAttempt(captured); setBusy(true); setResult(""); setError("");
    try {
      const value = await onOptimize(prompt, controller.signal);
      if (!value.trim() || value.length > CANVAS_PROMPT_LIMIT) throw new Error(L("优化结果不完整，原文已保留", "Incomplete result; original retained"));
      if (mounted.current && request.current === controller && !controller.signal.aborted && revision.current.value === captured.revision && currentWorkspaceRevision() === captured.workspaceRevision) setResult(value);
    } catch (cause) {
      if (mounted.current && request.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : L("提示词优化失败", "Prompt optimization failed"));
    } finally { if (mounted.current && request.current === controller) { request.current = null; setBusy(false); } }
  }
  const stale = !!attempt && (attempt.revision !== revision.current.value || attempt.workspaceRevision !== currentWorkspaceRevision());
  const valid = !!attempt && !stale && !disabled && !busy && !!result.trim() && result.length <= CANVAS_PROMPT_LIMIT;
  const action = "canvas-ui-action rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40";
  return <>
    <button ref={anchor} type="button" data-testid="canvas-prompt-optimize" title={L("优化提示词", "Optimize prompt")} aria-label={L("优化提示词", "Optimize prompt")} aria-expanded={!!attempt}
      disabled={disabled || busy || !contextKey || !prompt.trim()} onClick={() => void optimize()}
      className="canvas-ui-control flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border px-2.5 text-xs font-medium disabled:opacity-40"><WandSparkles size={15} aria-hidden="true"/><span>{L("优化提示词", "Optimize prompt")}</span></button>
    {attempt && attempt.contextKey === contextKey && !disabled && <CanvasActionPanel anchorRef={anchor} label={L("提示词优化", "Optimize prompt")} width={480} light={appearance === "light"} onClose={close}>
      <div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{L("提示词优化", "Optimize prompt")}</span><button type="button" aria-label={L("关闭", "Close")} className={action} onClick={close}><X size={14}/></button></div>
      {busy ? <p role="status" className="flex items-center gap-2 py-6 text-xs canvas-ui-muted"><Loader2 size={15} className="animate-spin"/>{L("正在优化…", "Optimizing…")}</p> : <>
        {error && <p role="alert" className="mb-3 text-xs text-[var(--canvas-ui-danger,#b91c1c)]">{error}</p>}
        {!!result && <textarea id={inputId} aria-label={L("优化预览", "Optimized prompt")} value={result} maxLength={CANVAS_PROMPT_LIMIT} onChange={event => setResult(event.target.value)} rows={8}
          className="canvas-ui-input max-h-72 w-full min-w-0 resize-y rounded-lg border border-current/15 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-500"/>}
      </>}
      {stale && <p role="status" className="mt-2 text-xs text-[var(--canvas-ui-danger,#b91c1c)]">{L("原文已变更，请重新优化", "Source changed; optimize again")}</p>}
      <div className="mt-3 flex justify-end gap-2"><button type="button" className={action} onClick={close}>{L("取消", "Cancel")}</button><button type="button" className={action} disabled={busy || !prompt.trim()} onClick={() => void optimize()}>{L("重新优化", "Try again")}</button>
        <button type="button" disabled={!valid} className="canvas-ui-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" onClick={() => {
          if (!valid || current.current.disabled || revision.current.value !== attempt.revision || currentWorkspaceRevision() !== attempt.workspaceRevision) return;
          current.current.onApply(result); close();
        }}>{L("应用", "Apply")}</button></div>
    </CanvasActionPanel>}
  </>;
}
