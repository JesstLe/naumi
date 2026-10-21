"use client";

import { useRef, useState } from "react";
import { ArrowUp, CircleHelp, Loader2 } from "lucide-react";
import { generationFailureBlocks, type GenerationFailure } from "@/lib/canvas/generation-failure";

/** Reload checks the original receipt. A separately confirmed action starts
 * a new task without replacing or replaying that original receipt. */
export function GenerationSubmitAction({ generating, failure, onGenerate, onCheck, english = false, allowIndependent = false }: {
  generating: boolean;
  failure?: GenerationFailure;
  onGenerate: () => unknown;
  onCheck?: () => Promise<void>;
  english?: boolean;
  allowIndependent?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const launchingRef = useRef(false);
  const retained = generationFailureBlocks(failure);
  const running = generating && (!failure || allowIndependent);
  const label = retained
    ? checking ? english ? "Checking…" : "正在检查…"
      : onCheck ? english ? "Reload result" : "重新加载"
        : english ? "Status unconfirmed" : "任务待确认"
    : english ? "Generate" : "生成";
  const checkButton = <button type="button" data-testid="generation-submit-action"
    data-state={retained ? "review" : running ? "generating" : "ready"}
    aria-label={label} title={label} aria-busy={running || checking}
    disabled={running || checking || retained && !onCheck}
    style={retained ? { width: "auto", minWidth: 108, padding: "0 12px", whiteSpace: "nowrap" } : undefined}
    className={`canvas-ui-primary flex h-10 flex-none items-center justify-center gap-1.5 rounded-[11px] text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${retained ? "px-3" : "w-10"}`}
    onClick={() => {
      if (running || checkingRef.current) return;
      if (!retained) { void onGenerate(); return; }
      if (!onCheck) return;
      checkingRef.current = true; setChecking(true);
      void Promise.resolve().then(onCheck).catch(() => {
        // Receipt handlers keep their own error state. Never submit on failure.
      }).finally(() => { checkingRef.current = false; setChecking(false); });
    }}>
    {retained ? <><CircleHelp className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span></>
      : running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
  </button>;
  if (!retained || !allowIndependent) return checkButton;
  return <div className="flex items-center gap-2" data-testid="generation-independent-actions">
    {checkButton}
    <button type="button" disabled={running || checking} aria-label={english ? "Generate new image" : "重新生成"}
      className="canvas-ui-primary flex h-10 items-center gap-1.5 rounded-[11px] px-3 text-[12px] font-semibold disabled:opacity-50"
      onClick={() => {
        if (running || checkingRef.current || launchingRef.current) return;
        if (!window.confirm(english ? "Start a separate generation? The original task stays available and may still complete. The new task is charged separately." : "重新生成会创建独立任务并单独计费；原任务仍会保留，完成后也可取回。继续吗？")) return;
        launchingRef.current=true;
        void Promise.resolve().then(onGenerate).catch(()=>{}).finally(()=>{launchingRef.current=false;});
      }}><ArrowUp className="h-4 w-4" aria-hidden="true" />{english ? "Generate new image" : "重新生成"}</button>
  </div>;
}
