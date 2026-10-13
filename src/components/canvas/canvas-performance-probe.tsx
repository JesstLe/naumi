"use client";
import { Profiler, useEffect, useRef, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { createPortal } from 'react-dom';

/** Opt-in diagnostics, compiled off in ordinary builds. No account data or URLs
 * are emitted. Both baseline and candidate use this exact same probe. */
const enabled = process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE === '1';
type Reading = { readyMs: number; nodes: number; commits: number; renderMs: number; longTasks: number; longTaskMs: number;
  label: string; frames: number; elapsedMs: number; frameP95Ms: number; gestureRenderMs: number; gestureCommits: number; jsBytes: number; imagesMs: number; loadedImages: number };
let reading: Reading = { readyMs: 0, nodes: 0, commits: 0, renderMs: 0, longTasks: 0, longTaskMs: 0,
  label: 'idle', frames: 0, elapsedMs: 0, frameP95Ms: 0, gestureRenderMs: 0, gestureCommits: 0, jsBytes: 0, imagesMs: 0, loadedImages: 0 };
function publish() {
  document.querySelector<HTMLOutputElement>('[data-testid="canvas-perf-reading"]')?.replaceChildren(JSON.stringify(reading));
}
export function CanvasPerformanceHarness({ children }: { children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <Profiler id="canvas-root" onRender={(_, phase, actualDuration) => {
    if (phase === 'mount') reading = { ...reading, readyMs: 0, commits: 0, renderMs: 0 };
    reading.commits++; reading.renderMs += actualDuration;
    if (reading.label === 'running') { reading.gestureCommits++; reading.gestureRenderMs += actualDuration; }
    publish();
  }}>{children}</Profiler>;
}
export function CanvasPerformanceProbe() {
  const flow = useReactFlow(), busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) { reading.longTasks++; reading.longTaskMs += entry.duration; }
      publish();
    });
    try { observer.observe({ type: 'longtask', buffered: true }); } catch { /* browser support varies */ }
    let cancelled = false, raf = 0;
    const ready = () => {
      if (cancelled) return;
      const nodes = flow.getNodes();
      if (nodes.length && document.querySelector('.react-flow__node')) {
        if (!reading.readyMs) reading.readyMs = performance.now();
        reading.nodes = nodes.length;
        reading.jsBytes = performance.getEntriesByType('resource').filter(e => e.name.includes('/_next/') && e.name.includes('.js'))
          .reduce((sum, e) => sum + (e as PerformanceResourceTiming).encodedBodySize, 0);
        const images = [...document.querySelectorAll<HTMLImageElement>('.react-flow__node img[data-media-visible="true"]')];
        reading.loadedImages = images.filter(i => i.complete && i.naturalWidth > 0).length;
        if (images.length && reading.loadedImages === images.length && !reading.imagesMs) reading.imagesMs = performance.now();
        publish();
      }
      raf = requestAnimationFrame(ready);
    };
    raf = requestAnimationFrame(ready);
    return () => { cancelled = true; cancelAnimationFrame(raf); observer.disconnect(); };
  }, [flow]);
  if (!enabled) return null;
  async function measure(kind: 'zoom' | 'pan') {
    if (busy.current) return;
    busy.current = true;
    const start = flow.getViewport(), times: number[] = [];
    reading = { ...reading, label: 'running', frames: 0, elapsedMs: 0, gestureRenderMs: 0, gestureCommits: 0 };
    publish();
    const began = performance.now(); let previous = began;
    for (let frame = 0; frame < 60; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => {
        const now = performance.now(); times.push(now - previous); previous = now;
        const wave = Math.sin(frame / 60 * Math.PI * 2);
        void flow.setViewport(kind === 'zoom' ? { ...start, zoom: start.zoom * (1 + wave * .15) }
          : { ...start, x: start.x + wave * 160, y: start.y + wave * 80 });
        resolve();
      }));
    }
    await flow.setViewport(start);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    times.sort((a, b) => a - b);
    reading = { ...reading, label: kind + '-complete', frames: times.length, elapsedMs: performance.now() - began,
      frameP95Ms: times[Math.min(times.length - 1, Math.floor(times.length * .95))] };
    publish(); busy.current = false;
  }
  if (typeof document === "undefined") return null;
  return createPortal(<div style={{ position: "fixed", bottom: 8, left: 8, zIndex: 100000 }}>
    <div className="rounded-xl border bg-white p-3 text-xs text-slate-900">
      <button data-testid="canvas-perf-reset" onClick={() => { reading = { ...reading, label: 'running', gestureRenderMs: 0, gestureCommits: 0 }; publish(); }}>记录真实操作</button>
      <button data-testid="canvas-perf-zoom" onClick={() => void measure('zoom')}>测缩放</button>
      <button data-testid="canvas-perf-pan" onClick={() => void measure('pan')}>测平移</button>
      <output data-testid="canvas-perf-reading" className="block max-w-[360px] break-all">{JSON.stringify(reading)}</output>
    </div>
  </div>, document.body);
}
