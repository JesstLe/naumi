"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { companionFace, createOrbCompanion, nextCompanionDeadline, reduceOrbCompanion, type OrbCue } from "./orb-companion";

/** Each canvas owns its controller. Scope changes discard stale async cues. */
export function useOrbCompanion(scope: string) {
  const currentScope = useRef(scope); currentScope.current = scope;
  const [model, dispatch] = useReducer((previous: ReturnType<typeof createOrbCompanion>, action: { scope: string; cue: OrbCue; now: number }) => {
    if (action.scope !== currentScope.current) return previous;
    if (previous.scope !== action.scope && action.cue.type !== "reset") return previous;
    if (previous.scope !== action.scope) return createOrbCompanion(action.scope, action.now);
    return reduceOrbCompanion(previous, action.cue, action.now);
  }, scope, key => createOrbCompanion(key, Date.now()));
  const emit = useCallback((cue: OrbCue) => dispatch({ scope, cue, now: Date.now() }), [scope]);
  useEffect(() => { if (model.scope !== scope) emit({ type: "reset" }); }, [scope, model.scope, emit]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (document.hidden || model.scope !== scope) return;
      const next = nextCompanionDeadline(model);
      if (next !== undefined) timer = setTimeout(() => emit({ type: "tick" }), Math.max(1, next - Date.now()));
    };
    const visibility = () => { if (!document.hidden) emit({ type: "tick" }); else clearTimeout(timer); };
    schedule(); document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [model, scope, emit]);
  useEffect(() => {
    // Real page activity only resets rest; never produces a task or provider call.
    let last = 0;
    const activity = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="canvas-agent-orb"]')) return;
      const now = Date.now(); if (now - last >= 2000) { last = now; emit({ type: "activity" }); }
    };
    window.addEventListener("pointerdown", activity, { passive: true }); window.addEventListener("keydown", activity);
    return () => { window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [emit]);
  return { model, face: model.scope === scope ? companionFace(model) : "idle" as const, emit };
}
