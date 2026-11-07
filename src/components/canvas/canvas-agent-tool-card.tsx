"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, CircleHelp, Clock3, Loader2, Wrench, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { cdnThumb } from "@/lib/cdn";
import type { AgentOrbStep } from "@/lib/canvas/agent-orb";
import { toolDuration } from "@/lib/canvas/agent-progress";
import { cn } from "@/lib/utils";

type Image = { id: string; image: string; title: string };
const fields: Record<string, [string, string]> = {
  color: ["目标颜色", "Color"], strength: ["强度", "Strength"], count: ["数量", "Count"],
  ratio: ["比例", "Ratio"], resolution: ["分辨率", "Resolution"], quality: ["质量", "Quality"],
  width: ["宽度", "Width"], height: ["高度", "Height"], duration: ["时长", "Duration"],
  fps: ["帧率", "Frame rate"], output_format: ["格式", "Format"], background: ["背景", "Background"],
};
const values: Record<string, string> = { low: "低", medium: "标准", high: "高", xhigh: "超高", max: "最高", transparent: "透明", opaque: "不透明" };

/** One invocation, not a retry action. Result buttons only preview already delivered media. */
export function CanvasAgentToolCard({ step, busy, english = false, sources, results, onPreview, compact = false, onInspect }: {
  step: AgentOrbStep; busy: boolean; english?: boolean; sources: Image[]; results: Image[];
  onPreview: (image: Image) => void; compact?: boolean; onInspect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const detailsId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (open) card.current?.scrollIntoView({ block: "nearest" }); }, [open]);
  const ticking = busy && step.status === "running" && !step.attention && !step.endedAt && !!step.startedAt;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  const unconfirmed = step.status === "running" && !busy && !step.attention;
  const Icon = step.attention || unconfirmed ? CircleHelp : step.status === "running" ? Loader2 : step.status === "error" ? X : Check;
  const status = step.attention === "waiting" ? english ? "Awaiting confirmation" : "等待确认" : step.attention === "restricted" ? english ? "Not executed" : "未执行" : unconfirmed ? english ? "Check history" : "待核对" : step.status === "running" ? english ? "Running" : "执行中" : step.status === "error" ? english ? "Failed" : "失败" : english ? "Done" : "已完成";
  const duration = toolDuration(step, busy, now);
  const elapsed = duration === undefined ? undefined : duration < 1000 ? "<1s" : `${(duration / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  const source = sources.find(image => image.id === step.details?.targetId);
  const output = results.filter(image => step.resultIds?.includes(image.id));
  return <section ref={card} data-tool-status={step.attention || (unconfirmed ? "unconfirmed" : step.status)} data-testid="canvas-agent-tool-card" className="overflow-hidden rounded-xl border border-[var(--canvas-ui-border)] text-[12px]">
    <button type="button" aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => { if (!open) onInspect?.(); setOpen(value => !value); }} className="canvas-ui-action flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]">
      <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", busy && step.status === "running" && !step.attention && "motion-safe:animate-spin", step.status === "done" && !step.attention && "text-emerald-600")} />
      <span className="min-w-0 flex-1 break-words font-medium">{step.label}</span>
      {compact && elapsed && <span className="canvas-ui-muted shrink-0 text-[10px] tabular-nums" data-testid="tool-duration">{elapsed}</span>}
      <span className="canvas-ui-muted shrink-0 text-[10px]">{status}</span>
      <ChevronRight aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
    </button>
    {step.summary && (!compact || open || step.status !== "done" || step.attention) && <p className="canvas-ui-muted break-words px-3 pb-2 text-[11px] leading-5" role={step.attention ? "status" : undefined}>{step.summary}</p>}
    {(!compact || open) && <div className="canvas-ui-muted flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-[10px] tabular-nums">
      {elapsed && <span className="inline-flex items-center gap-1" data-testid="tool-duration" title={english ? "Call duration, including checks and result attachment" : "本次调用用时，含校验与结果挂载"}><Clock3 className="h-3 w-3" aria-hidden="true" />{elapsed}</span>}
      {!!step.resultIds?.length && <span>{english ? `${step.resultIds.length} result(s)` : `${step.resultIds.length} 个结果`}</span>}
      {!!step.details?.inputCount && <span>{english ? `${step.details.inputCount} input image(s)` : `${step.details.inputCount} 张输入图`}</span>}
    </div>}
    {open && <div id={detailsId} className="canvas-ui-section space-y-3 border-t px-3 py-3" data-testid="tool-details">
      <div className="canvas-ui-muted flex min-w-0 items-start gap-1.5 text-[10px]"><Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /><span className="break-all">{step.tool || (english ? "Tool" : "工具")}</span></div>
      {step.startedAt && <div className="canvas-ui-muted text-[10px]">{english ? "Started " : "开始于 "}<time dateTime={new Date(step.startedAt).toISOString()}>{new Date(step.startedAt).toLocaleTimeString(english ? "en-GB" : "zh-CN", { hour12: false })}</time></div>}
      {source && <button type="button" onClick={() => onPreview(source)} className="canvas-ui-action flex w-full items-center gap-2 rounded-lg text-left"><CachedImage src={cdnThumb(source.image,128)} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-[var(--canvas-ui-border)] object-contain" /><span className="min-w-0 break-words text-[11px]">{source.title}</span></button>}
      {!!step.details?.parameters.length && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px]">{step.details.parameters.map(parameter => <div key={parameter.name} className="contents"><dt className="canvas-ui-muted">{fields[parameter.name]?.[english ? 1 : 0] || parameter.name}</dt><dd className="flex min-w-0 items-center justify-end gap-1.5 break-all text-right">{parameter.name === "color" && /^#[\da-f]{6}$/i.test(parameter.value) && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: parameter.value }} />}{!english && values[parameter.value] || parameter.value}</dd></div>)}</dl>}
      {output.map(image => <button key={image.id} type="button" onClick={() => onPreview(image)} className="canvas-ui-action flex w-full items-center gap-2 rounded-lg text-left" aria-label={`${english ? "View result" : "查看结果"}：${image.title}`}><CachedImage src={cdnThumb(image.image,128)} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-[var(--canvas-ui-border)] object-contain" /><span className="min-w-0 break-words text-[11px]">{image.title}<span className="canvas-ui-muted block text-[10px]">{english ? "View result" : "查看结果"}</span></span></button>)}
      {!step.details?.parameters.length && !source && !output.length && <p className="canvas-ui-muted text-[11px]">{english ? "No additional details recorded." : "暂无更多调用详情"}</p>}
    </div>}
  </section>;
}
