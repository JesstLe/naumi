"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NaumiOrb } from "../naumi-orb/naumi-orb";
import { agentOrbState, clampOrb, orbBounds, orbFraction, orbPixels, orbPositionKey, readOrbPosition,
  type AgentOrbOutcome, type AgentOrbStep, type OrbPoint } from "@/lib/canvas/agent-orb";
import styles from "./canvas-agent-orb.module.css";

export function CanvasAgentOrb({ email, busy, outcome, steps, open, english, light = true, onActivate }: {
  email: string; busy: boolean; outcome: AgentOrbOutcome; steps: AgentOrbStep[];
  open: boolean; english: boolean; light?: boolean; onActivate: () => void;
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
  const state = agentOrbState(busy, outcome, steps);
  const status = english ? ({ idle: "Agent", thinking: "Thinking", searching: "Searching", working: "Working", done: "Done", error: "Failed", curious: "Agent", happy: "Agent" })[state]
    : ({ idle: "Agent", thinking: "思考中", searching: "检索中", working: "执行中", done: "已完成", error: "未完成", curious: "Agent", happy: "Agent" })[state];
  const label = !busy && outcome === "stopped" ? english ? "Stopped" : "已停止" : status;

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
    save(orbFraction(clampOrb({ x: pixel.x + direction[0] * distance, y: pixel.y + direction[1] * distance }, bounds), bounds));
  }
  return <div ref={layer} className={styles.layer}>
    <div data-testid="canvas-agent-orb" data-theme={light ? "light" : "dark"} data-canvas-hotkeys-blocked="true" data-agent-outcome={outcome} data-dragging={dragging}
      className={`${styles.floating} nopan nodrag nowheel`} style={{ left: pixel.x, top: pixel.y, visibility: size.width ? "visible" : "hidden" }}
      onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => { if (drag.current) finish(event, true); }}
      onDoubleClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onClickCapture={event => { if (!(event.target as Element).closest('[data-orb-retry="true"]') && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); if (!suppressClick.current) onActivate(); } }}
      onClick={event => event.stopPropagation()}>
      <NaumiOrb theme={light ? "naumi" : "pearl"} state={state} label="Naumi Agent" className={styles.ball} onActivate={onActivate} onKeyDown={keyboard}
        actionLabel={english ? `Agent: ${label}. Click to ${open ? "close" : "open"}; drag or use arrow keys to move.` : `Agent：${label}，点击${open ? "收起" : "打开"}，拖动或方向键移动`}
        expanded={open} controls="canvas-agent-panel" />
      <span role="status" aria-live="polite" className={styles.status} data-state={state}><i aria-hidden="true" />{label}</span>
    </div>
  </div>;
}
