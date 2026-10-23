"use client";

import { Check } from "lucide-react";
import type { ResolvedVideoCapability } from "@/lib/video/capability-schema";
import { videoDurations, videoResolutions, videoAspectRatios, type VideoNodeConfig } from "@/lib/video/client-settings";
import { useVideoI18n } from "./i18n";

export function VideoParameterPanel({ config, capability: cap, count, onConfig, onCount, disabled = false }: {
  config: VideoNodeConfig; capability: ResolvedVideoCapability; count: number;
  onConfig: (value: VideoNodeConfig) => void; onCount: (value: number) => void; disabled?: boolean;
}) {
  const V = useVideoI18n();
  const durations = videoDurations(cap, config.mode).filter(value => value > 0).sort((a, b) => a - b);
  const autoDuration = cap.supportsAutoDuration === true && videoDurations(cap, config.mode).includes(-1);
  const ratios = videoAspectRatios(cap, config.mode, config.resolution);
  const selectedDuration = durations.indexOf(config.durationSeconds ?? 0);
  const option = (selected: boolean) => `canvas-ui-control relative flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-[9px] border px-2 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? "border-[var(--canvas-ui-border-strong)] bg-[var(--canvas-ui-soft-hover)] text-[var(--canvas-ui-text)]" : "border-[var(--canvas-ui-border)] text-[var(--canvas-ui-muted)]"}`;
  return <fieldset disabled={disabled} className="space-y-4" data-testid="video-parameter-panel">
    {!!ratios.length && <section aria-label={V("视频画幅")} className="space-y-2">
      <h3 className="text-xs font-medium canvas-ui-muted">{V("比例")}</h3>
      <div className="grid grid-cols-5 gap-2">{ratios.map(value => {
        const [w, h] = value.split(":").map(Number), ratio = w > 0 && h > 0 ? w / h : 1;
        return <button key={value} type="button" aria-pressed={config.aspectRatio === value} className={`${option(config.aspectRatio === value)} flex-col !py-2.5`} onClick={() => onConfig({ ...config, aspectRatio: value })}>
          <span aria-hidden="true" className="mb-1 block rounded-[2px] border border-current" style={{ width: ratio >= 1 ? 18 : 18 * ratio, height: ratio >= 1 ? 18 / ratio : 18 }}/>
          {value === "adaptive" ? V("自动") : value}
        </button>;
      })}</div>
    </section>}
    {!!videoResolutions(cap, config.durationSeconds, config.mode).length && <section aria-label={V("视频分辨率")} className="space-y-2">
      <h3 className="text-xs font-medium canvas-ui-muted">{V("清晰度")}</h3>
      <div className="flex flex-wrap gap-2">{videoResolutions(cap, config.durationSeconds, config.mode).map(value => <button key={value} type="button" aria-pressed={config.resolution === value} className={`${option(config.resolution === value)} flex-1`} onClick={() => onConfig({ ...config, resolution: value })}>{value.toUpperCase()}</button>)}</div>
    </section>}
    {(durations.length > 0 || autoDuration) && <section className="space-y-2">
      <div className="flex items-center justify-between"><h3 className="text-xs font-medium canvas-ui-muted">{V("视频时长")}</h3>{autoDuration && <button type="button" aria-pressed={config.durationSeconds === -1} className={option(config.durationSeconds === -1)} onClick={() => onConfig({ ...config, durationSeconds: -1 })}>{V("自动")}</button>}</div>
      {durations.length > 0 && <div className="flex items-center gap-3">
        {/* Index steps keep sparse supplier sets (e.g. 5/10/15s) legal. */}
        <input type="range" aria-label={V("视频时长")} aria-valuetext={config.durationSeconds === -1 ? V("自动") : `${config.durationSeconds ?? "—"}s`} min={0} max={Math.max(0, durations.length - 1)} step={1} value={Math.max(0, selectedDuration)} disabled={disabled || durations.length === 1} onChange={event => onConfig({ ...config, durationSeconds: durations[Number(event.target.value)] })} className="min-w-0 flex-1 accent-[var(--canvas-ui-text)]"/>
        <select aria-label={V("选择视频秒数")} value={config.durationSeconds ?? ""} onChange={event => onConfig({ ...config, durationSeconds: Number(event.target.value) })} className="canvas-ui-input rounded-lg border border-[var(--canvas-ui-border)] px-2 py-1.5 text-xs">
          <option value="" disabled>—</option>{autoDuration && <option value={-1}>{V("自动")}</option>}{durations.map(value => <option key={value} value={value}>{value}s</option>)}
        </select>
      </div>}
    </section>}
    {cap.audio && <section aria-label={V("生成声音")} className="space-y-2">
      <h3 className="text-xs font-medium canvas-ui-muted">{V("生成声音")}</h3>
      {cap.audio === "optional" ? <div className="grid grid-cols-3 gap-2">{([undefined, true, false] as const).map(value => <button key={String(value)} type="button" aria-pressed={config.generateAudio === value} className={option(config.generateAudio === value)} onClick={() => onConfig({ ...config, generateAudio: value })}>{V(value === undefined ? "模型默认" : value ? "开启" : "关闭开关")}</button>)}</div> : <span className="flex items-center gap-1.5 text-xs"><Check size={13}/>{V(cap.audio === "required" ? "必须开启" : "不生成")}</span>}
    </section>}
    <section aria-label={V("生成数量")} className="space-y-2"><h3 className="text-xs font-medium canvas-ui-muted">{V("生成数量")}</h3><div className="grid grid-cols-3 gap-2">{[1, 2, 4].map(value => <button key={value} type="button" aria-pressed={count === value} className={option(count === value)} onClick={() => onCount(value)}>{value} {V("个视频")}</button>)}</div></section>
  </fieldset>;
}
