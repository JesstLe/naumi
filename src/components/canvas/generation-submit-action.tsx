"use client";

import { useRef, useState } from "react";
import { ArrowUp, CircleHelp, Loader2 } from "lucide-react";
import { generationFailureBlocks, type GenerationFailure } from "@/lib/canvas/generation-failure";

/** A duplicate-submission hold is not a running animation. Only the original
 * receipt may be checked; this button never turns a review into a new POST. */
export function GenerationSubmitAction({ generating, failure, onGenerate, onCheck, english = false }: {
  generating: boolean;
  failure?: GenerationFailure;
  onGenerate: () => unknown;
  onCheck?: () => Promise<void>;
  english?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const retained = generationFailureBlocks(failure);
  const running = generating && !failure;
  const label = retained
    ? checking ? english ? "Checking…" : "正在检查…"
      : onCheck ? english ? "Check original task" : "检查原任务"
        : english ? "Status unconfirmed" : "任务待确认"
    : english ? "Generate" : "生成";
  return <button type="button" data-testid="generation-submit-action"
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
}
