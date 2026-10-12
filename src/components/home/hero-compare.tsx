"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cdnThumb, onImgError } from "@/lib/cdn";

/**
 * 落地页 hero「随手拍 → AI 成片」对比:两图叠放,中间分隔条可拖动(clip-path 擦除);
 * 持续自动来回擦演示,拖动时暂停、松手平滑回归。演示素材为方图,容器保持同比例以完整展示。
 */
export function HeroCompare({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pos = useRef(58);
  const updateSplit = (value: number) => {
    pos.current = value;
    ref.current?.style.setProperty("--hero-split", `${value}%`);
  };

  // 持续自动来回擦,循环演示原图↔成片对比;拖动时暂停,松手后平滑回归自动。
  useEffect(() => {
    // 尊重「减少动态效果」:停在 52%,不自动播放。
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      updateSplit(52);
      return;
    }
    let raf = 0;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    if (ref.current) observer.observe(ref.current);
    const start = performance.now();
    const loop = (now: number) => {
      const e = (now - start) / 1000;
      const target = 50 + Math.sin(e * 0.8) * 26; // ~24%–76%,约 8s 一个来回
      if (visible && !document.hidden && !dragging.current) {
        updateSplit(pos.current + (target - pos.current) * 0.06);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  const fromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    updateSplit(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      style={{ "--hero-split": "58%" } as CSSProperties}
      className="group relative aspect-square w-full cursor-ew-resize select-none overflow-hidden rounded-[18px] border border-border bg-white shadow-2xl"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fromX(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && fromX(e.clientX)}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => { dragging.current = false; }}
      onLostPointerCapture={() => { dragging.current = false; }}
    >
      {/* AI 成片(底,全幅) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cdnThumb(after, 1080)}
        decoding="async"
        onError={event => onImgError(event, after)}
        alt={afterLabel}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {/* 随手拍原图(上,clip 到分隔条左侧) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cdnThumb(before, 1080)}
        decoding="async"
        onError={event => onImgError(event, before)}
        alt={beforeLabel}
        draggable={false}
        style={{ clipPath: "inset(0 calc(100% - var(--hero-split)) 0 0)" }}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {/* 标签 */}
      <span className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="absolute right-3 top-3 rounded-md px-2 py-1 text-xs font-semibold text-white [background:var(--grad-acc)]">
        {afterLabel}
      </span>
      {/* 分隔条 + 手柄 */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.15)]"
        style={{ left: "var(--hero-split)" }}
      >
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#16181D] shadow-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </span>
      </div>
    </div>
  );
}
