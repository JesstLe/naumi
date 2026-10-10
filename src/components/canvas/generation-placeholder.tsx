"use client";

import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { generationWaitingHint, type GenerationStage } from "@/lib/canvas/generation-feedback";
import styles from "./generation-placeholder.module.css";

export function GenerationPlaceholder({ stage = "generating", startedAt, count = 1, completed, kind = "image" }: {
  stage?: GenerationStage;
  startedAt?: number;
  count?: number;
  completed?: number;
  kind?: "image" | "video";
}) {
  const { locale } = useI18n();
  const english = locale === "en";
  const [mountedAt] = useState(() => Date.now());
  const start = startedAt ?? mountedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const labels = english ? ["Prepare", "Generate", "Save"] : ["准备", "生成", "保存"];
  const current = ["preparing", "generating", "saving"].indexOf(stage);
  const title = kind === "video"
    ? english ? ["Preparing video", "Generating video", "Video ready"] : ["准备生成", "视频生成中", "视频已生成"]
    : english ? ["Preparing image", "Generating image", "Image ready"] : ["准备生成", "图片生成中", "图片已生成"];
  const realCount = typeof completed === "number" && Number.isFinite(completed);
  return <div data-testid="generation-placeholder" data-stage={stage} aria-busy="true"
    className="relative flex h-full min-h-[180px] w-full flex-col items-center justify-center gap-3 overflow-hidden px-5 py-3 text-center">
    <div className={styles.sheen} aria-hidden="true" />
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#6381d5]/20 bg-[#6381d5]/10 text-[#5274c7]">
      <ImageIcon className="h-6 w-6" aria-hidden="true" />
      <Loader2 className={`absolute -bottom-1 -right-1 h-5 w-5 ${styles.spinner}`} aria-hidden="true" />
    </div>
    <div className="relative space-y-1.5" role="status" aria-live="polite" aria-atomic="true">
      <div className="canvas-ui-text text-sm font-semibold">{title[current]}</div>
      <div className="canvas-ui-muted text-xs">{generationWaitingHint(stage, seconds, english)}</div>
    </div>
    <div className="relative flex w-full max-w-[240px] items-center justify-between gap-2" aria-label={english ? "Generation steps" : "生成阶段"}>
      {labels.map((label, index) => <span key={label} aria-current={index === current ? "step" : undefined}
        className={`flex items-center gap-1.5 text-[11px] ${index <= current ? "text-[#5274c7]" : "canvas-ui-muted opacity-60"}`}>
        {index < current ? <Check className="h-3 w-3" aria-hidden="true" /> : <span className={`h-1.5 w-1.5 rounded-full ${index === current ? "bg-[#5274c7]" : "bg-current opacity-40"}`} />}{label}
      </span>)}
    </div>
    <div className="canvas-ui-muted relative flex items-center gap-3 text-[11px] tabular-nums">
      <span aria-hidden="true">{english ? `${seconds}s elapsed` : `已等待 ${seconds} 秒`}</span>
      {count > 1 && <span>{realCount ? `${Math.max(0, Math.min(count, completed!))}/${count}` : english ? `${count} images` : `${count} 张图片`}</span>}
    </div>
  </div>;
}
