import type {OrbState,OrbAttention,OrbCue} from "@/lib/canvas/orb-contract";
import {orbToolFace} from "@/lib/canvas/agent-orb";
export {orbToolFace};

/** Presentation only. No messages, provider calls, timers or global session state. */
export type {OrbAttention,OrbCue} from "@/lib/canvas/orb-contract";
export interface OrbCompanion {
  scope: string; now: number; lastActivity: number; startedAt: number;
  phase: OrbState; busy: boolean; attention?: OrbAttention;
  reaction?: { face: OrbState; until: number }; bootAt: number;
  terminalAt: number; failureCode?: string; toolFailures: number; artifactCount: number;
  positiveAt?: number; negativeCount: number; cooldownUntil: number;
}
export const ORB_TIMING = { boot: 650, wake: 900, reaction: 1600, cooldown: 2400, terminal: 2500,
  daydream: 45_000, drowsy: 180_000, sleep: 300_000, longTask: 60_000, tired: 2400 } as const;

export function createOrbCompanion(scope: string, now: number): OrbCompanion {
  return { scope, now, lastActivity: now, startedAt: now, phase: "idle", busy: false,
    bootAt: now, terminalAt: 0, toolFailures: 0, artifactCount: 0, negativeCount: 0, cooldownUntil: 0 };
}

function react(model: OrbCompanion, face: OrbState, now: number, duration: number = ORB_TIMING.reaction): OrbCompanion {
  return { ...model, reaction: { face, until: now + duration }, cooldownUntil: now + ORB_TIMING.cooldown };
}
export function reduceOrbCompanion(previous: OrbCompanion, cue: OrbCue, now: number): OrbCompanion {
  const model = { ...previous, now };
  if (cue.type === "reset") return { ...createOrbCompanion(model.scope, now), bootAt: now - 2000 };
  if (cue.type === "tick") return model;
  if (cue.type === "submit") return react({ ...model, busy: true, phase: "connecting", attention: undefined,
    lastActivity: now, startedAt: now, bootAt: now - 2000, terminalAt: 0, failureCode: undefined, toolFailures: 0, artifactCount: 0 }, "receiving", now, 650);
  if (model.phase === "stopped" && cue.type !== "restore") return model;
  if (cue.type === "stop") return { ...model, busy: false, phase: "stopped", reaction: undefined, attention: undefined, terminalAt: now };
  if (cue.type === "failure") return { ...model, busy: false, phase: cue.code === "AUTH" || cue.code === "CREDITS" ? "restricted" : "error",
    failureCode: cue.code, reaction: undefined, terminalAt: now, attention: undefined };
  if (cue.type === "restore") {
    const phase = cue.running ? cue.phase || "thinking" : cue.outcome === "done" ? "idle" : cue.outcome === "error" ? "error" : cue.outcome === "stopped" ? "stopped" : "idle";
    const attention = cue.outcome === "error" || cue.outcome === "stopped" ? undefined : cue.attention;
    const restored = { ...model, phase: attention || phase, busy: cue.running, attention,
      failureCode: undefined, positiveAt: undefined, negativeCount: 0, artifactCount: 0,
      terminalAt: now - ORB_TIMING.terminal, startedAt: model.busy && cue.running ? model.startedAt : now, lastActivity: now, bootAt: now - 2000 };
    return cue.recall === false ? restored : react(restored, "remembering", now);
  }
  if (cue.type === "attention") return { ...model, attention: cue.kind, phase: cue.kind, reaction: undefined };
  if (cue.type === "attention-resolved") return { ...model, attention: undefined, phase: model.busy ? cue.tool ? orbToolFace(cue.tool) : "thinking" : "idle" };
  if (cue.type === "done") return { ...model, busy: false, phase: model.attention || "done", terminalAt: now, lastActivity: now, reaction: undefined };
  if (cue.type === "connected") return model.busy ? { ...model, phase: "thinking" } : model;
  if (cue.type === "delta") return model.busy && !model.attention ? { ...model, phase: "replying" } : model;
  if (cue.type === "tool-start") return model.attention ? { ...model, busy: true } : { ...model, busy: true, phase: orbToolFace(cue.tool) };
  if (cue.type === "tool-end") {
    if (model.attention) return model;
    if (cue.error) return react({ ...model, phase: "thinking", toolFailures: model.toolFailures + 1 }, model.toolFailures >= 2 ? "frustrated" : model.toolFailures ? "resigned" : "flustered", now);
    return { ...model, phase: "thinking" };
  }
  if (cue.type === "artifacts") return cue.count >= 2 && !model.attention ? react({ ...model, artifactCount: cue.count }, "surprised", now) : { ...model, artifactCount: cue.count };

  const before = companionFace(model, now);
  // Merely crossing a sleeping orb must not consume its click/drag wake gesture.
  if (cue.type === "hover" && (before === "sleeping" || before === "drowsy")) return model;
  model.lastActivity = now;
  // Interactions do not obscure execution, confirmation, stop or fresh errors.
  if (model.busy || model.attention || model.phase === "stopped" || model.phase === "restricted" || (model.phase === "error" && now - model.terminalAt < ORB_TIMING.terminal)) return model;
  if (["sleeping", "drowsy"].includes(before)) return react(model, cue.type === "drag" ? "jolted" : "waking", now, ORB_TIMING.wake);
  if (cue.type === "activity") return model;
  if (now < model.cooldownUntil && cue.type !== "feedback" && cue.type !== "copied") return model;
  if (cue.type === "feedback") {
    if (cue.positive) return react({ ...model, positiveAt: now, negativeCount: 0 }, model.positiveAt !== undefined && now - model.positiveAt < 30_000 ? "shy" : "happy", now);
    return react({ ...model, negativeCount: model.negativeCount + 1 }, "puzzled", now);
  }
  if (cue.type === "copied") return react(model, "content", now);
  if (cue.type === "draft") return cue.text.trim() ? react(model, /^[?？\s]+$/.test(cue.text) ? "puzzled" : "focused", now) : model;
  if (cue.type === "hover" || cue.type === "activate" || cue.type === "drag") return react(model, "curious", now);
  return model;
}

export function companionFace(model: OrbCompanion, now: number = model.now): OrbState {
  if (model.phase === "stopped") return "stopped";
  if (model.attention || model.phase === "restricted") return model.attention || "restricted";
  if (model.phase === "error") {
    if (now - model.terminalAt < ORB_TIMING.terminal) return "error";
    if (model.reaction && now < model.reaction.until) return model.reaction.face;
    return model.failureCode === "VALIDATION" ? "confused" : "sad";
  }
  if (model.reaction && now < model.reaction.until) return model.reaction.face;
  if (model.busy) {
    const elapsed = now - model.startedAt;
    if (elapsed >= ORB_TIMING.longTask && elapsed < ORB_TIMING.longTask + ORB_TIMING.tired) return "tired";
    return model.phase;
  }
  if (model.phase === "done" && now - model.terminalAt < ORB_TIMING.terminal) return "done";
  if (model.phase === "done" && model.artifactCount >= 2 && now - model.terminalAt < ORB_TIMING.terminal + ORB_TIMING.reaction) return "surprised";
  if (now - model.bootAt < ORB_TIMING.boot) return "booting";
  if (now - model.bootAt < ORB_TIMING.boot + ORB_TIMING.wake) return "waking";
  const idle = now - model.lastActivity;
  if (idle >= ORB_TIMING.sleep) return "sleeping";
  if (idle >= ORB_TIMING.drowsy) return "drowsy";
  if (idle >= ORB_TIMING.daydream) return "daydreaming";
  return "idle";
}

/** Deadline scheduling, not per-frame or second-by-second React polling. */
export function nextCompanionDeadline(model: OrbCompanion): number | undefined {
  if (model.phase === "stopped" || model.attention || model.phase === "restricted") return undefined;
  const deadlines = [model.reaction?.until];
  if (model.phase === "error") deadlines.push(model.terminalAt + ORB_TIMING.terminal);
  else if (model.busy) deadlines.push(model.startedAt + ORB_TIMING.longTask, model.startedAt + ORB_TIMING.longTask + ORB_TIMING.tired);
  else deadlines.push(model.bootAt + ORB_TIMING.boot, model.bootAt + ORB_TIMING.boot + ORB_TIMING.wake,
    model.terminalAt + ORB_TIMING.terminal, model.phase === "done" && model.artifactCount >= 2 ? model.terminalAt + ORB_TIMING.terminal + ORB_TIMING.reaction : undefined,
    ...[ORB_TIMING.daydream, ORB_TIMING.drowsy, ORB_TIMING.sleep].map(delay => model.lastActivity + delay));
  return deadlines.filter((value): value is number => value !== undefined && value > model.now).sort((a, b) => a - b)[0];
}
