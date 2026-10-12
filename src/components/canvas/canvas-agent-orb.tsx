"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NaumiOrb } from "../naumi-orb/naumi-orb";
import { ORB_STATES, type OrbState } from "../naumi-orb/orb-model";
import type { OrbCue, OrbCompanion } from "../naumi-orb/orb-companion";
import { agentOrbState, clampOrb, orbBounds, orbFraction, orbPixels, orbPositionKey, readOrbPosition,
  type AgentOrbOutcome, type AgentOrbStep, type OrbPoint } from "@/lib/canvas/agent-orb";
import styles from "./canvas-agent-orb.module.css";

export function CanvasAgentOrb({ email, busy, outcome, steps, open, english, light = true, onActivate, companion, onCue }: {
  email: string; busy: boolean; outcome: AgentOrbOutcome; steps: AgentOrbStep[];
  open: boolean; english: boolean; light?: boolean; onActivate: () => void;
  companion?: { face: OrbState; model: OrbCompanion }; onCue?: (cue: OrbCue) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState<OrbPoint>({ x: 1, y: .18 });
  const current = useRef(position); current.current = position;
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; origin: OrbPoint; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const bounds = orbBounds(size.width, size.height);
  const pixel = orbPixels(position, bounds);
  const fallback = agentOrbState(busy, outcome, steps);
  // Status text describes the real task; expressive eyes never claim completion.
  const phase = companion?.model.attention || (busy ? companion?.model.phase || fallback : fallback);
  const state = !busy && outcome === "stopped" ? "stopped" : !busy && outcome === "error" && companion?.model.phase !== "error" && companion?.model.phase !== "restricted" ? "error" : companion?.face || fallback;
  const item = ORB_STATES.find(item => item.key === phase)!;
  const label = phase === "idle" ? "Agent" : english ? item.en : item.label;
  function activate() { onCue?.({ type: "activate" }); onActivate(); }

  useEffect(() => {
    try { setPosition(readOrbPosition(localStorage.getItem(orbPositionKey(email)))); }
    catch { setPosition(readOrbPosition(null)); }
  }, [email]);
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);

  function save(point: OrbPoint) {
    current.current = point; setPosition(point);
    try { localStorage.setItem(orbPositionKey(email), JSON.stringify(point)); } catch { /* Memory-only position remains usable. */ }
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if ((event.target as Element).closest('[data-orb-retry="true"]')) return;
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    suppressClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: pixel, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    if (!gesture.moved) onCue?.({ type: "drag" });
    gesture.moved = true; suppressClick.current = true; setDragging(true);
    event.preventDefault();
    const next = orbFraction({ x: gesture.origin.x + dx, y: gesture.origin.y + dy }, bounds);
    current.current = next; setPosition(next);
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    event.stopPropagation();
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (cancelled) { setPosition(orbFraction(gesture.origin, bounds)); suppressClick.current = true; }
    else if (gesture.moved) save(current.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
    if (!direction) return;
    event.preventDefault();
    const distance = event.shiftKey ? 40 : 12;
    onCue?.({ type: "drag" });
    save(orbFraction(clampOrb({ x: pixel.x + direction[0] * distance, y: pixel.y + direction[1] * distance }, bounds), bounds));
  }
  return <div ref={layer} className={styles.layer}>
    <div data-testid="canvas-agent-orb" data-theme={light ? "light" : "dark"} data-canvas-hotkeys-blocked="true" data-agent-outcome={outcome} data-dragging={dragging}
      className={`${styles.floating} nopan nodrag nowheel`} style={{ left: pixel.x, top: pixel.y, visibility: size.width ? "visible" : "hidden" }}
      onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => { if (drag.current) finish(event, true); }}
      onDoubleClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerEnter={() => onCue?.({ type: "hover" })} onFocus={() => onCue?.({ type: "hover" })}
      onClickCapture={event => { if (!(event.target as Element).closest('[data-orb-retry="true"]') && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); if (!suppressClick.current) activate(); } }}
      onClick={event => event.stopPropagation()}>
      <NaumiOrb theme={light ? "naumi" : "pearl"} state={state} label="Naumi Agent" className={styles.ball} onActivate={activate} onKeyDown={keyboard}
        actionLabel={english ? `Agent: ${label}. Click to ${open ? "close" : "open"}; drag or use arrow keys to move.` : `Agent：${label}，点击${open ? "收起" : "打开"}，拖动或方向键移动`}
        expanded={open} controls="canvas-agent-panel" />
      <span role="status" aria-live="polite" className={styles.status} data-state={phase}><i aria-hidden="true" />{label}</span>
    </div>
  </div>;
}
