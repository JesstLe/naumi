"use client";
import { CachedImage } from "@/components/cached-image";

import { useEffect, useRef, useState } from "react";
import { competitorClientId, type CompetitorRegion } from "@/lib/competitor-types";

type Point = { x: number; y: number };
export function RegionEditor({ image, width, height, regions, selected, onSelect, onAdd, disabled, zoom, draw }: {
  image: string; width: number; height: number; regions: CompetitorRegion[]; selected: string;
  onSelect: (id: string) => void; onAdd: (region: CompetitorRegion) => void;
  disabled: boolean; zoom: number; draw: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const [size, setSize] = useState({ width: 600, height: 550 });
  const [preview, setPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const ratio = width / height;
  const displayWidth = Math.max(64, Math.min(size.width - 40, (size.height - 40) * ratio)) * zoom;
  function point(e: React.PointerEvent<HTMLDivElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  }
  function rect(a: Point, b: Point) {
    return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) };
  }
  return <div className="cmp-stage" ref={container}>
    <div className="cmp-stage-inner">
      <div data-testid="region-surface" className="cmp-image-surface" style={{ width: displayWidth, height: displayWidth / ratio, cursor: draw ? "crosshair" : "default", touchAction: draw ? "none" : "auto" }}
        onPointerDown={e => {
          if (!draw || disabled || e.button !== 0) return;
          start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId);
          setPreview({ ...start.current, width: 0, height: 0 });
        }}
        onPointerMove={e => { if (start.current) setPreview(rect(start.current, point(e))); }}
        onPointerCancel={() => { start.current = null; setPreview(null); }}
        onPointerUp={e => {
          if (!start.current) return;
          const r = rect(start.current, point(e)); start.current = null; setPreview(null);
          if (r.width < .005 || r.height < .005 || disabled) return;
          onAdd({ ...r, id: competitorClientId(), label: `选区 ${regions.length + 1}`, kind: "component", instruction: "", color: "#2563eb", enabled: true });
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <CachedImage alt="竞品编辑图" src={image} draggable={false} />
        {regions.map((r, i) => <button key={r.id} type="button" aria-label={`选区 ${i+1} ${r.label}`} disabled={disabled || draw}
          onClick={() => onSelect(r.id)} className={`cmp-region ${selected === r.id ? "is-selected" : ""} ${r.enabled ? "" : "is-locked"}`}
          style={{ left: `${r.x*100}%`, top: `${r.y*100}%`, width: `${r.width*100}%`, height: `${r.height*100}%`, pointerEvents: draw ? "none" : "auto" }}>
          <span>{i+1} · {r.label}</span>
        </button>)}
        {preview && <div className="cmp-region cmp-region-preview" style={{ left: `${preview.x*100}%`, top: `${preview.y*100}%`, width: `${preview.width*100}%`, height: `${preview.height*100}%` }} />}
      </div>
    </div>
  </div>;
}
