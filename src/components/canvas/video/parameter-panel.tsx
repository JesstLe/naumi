"use client";

import { Check } from "lucide-react";
import type { ResolvedVideoCapability } from "@/lib/video/capability-schema";
import type { VideoNodeConfig } from "@/lib/video/client-settings";
import { videoParameterChoices } from "@/lib/video/parameter-options";
import { VideoDurationControl } from "@/components/video/duration-control";
import { useVideoI18n } from "./i18n";

export function VideoParameterPanel({ config, capability: cap, count, onConfig, onCount, disabled = false }: {
  config: VideoNodeConfig; capability: ResolvedVideoCapability; count: number;
  onConfig: (value: VideoNodeConfig) => void; onCount: (value: number) => void; disabled?: boolean;
}) {
  const V = useVideoI18n();
  const {aspectRatios:ratios,resolutions} = videoParameterChoices(cap,config.mode,config);
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
    {!!resolutions.length && <section aria-label={V("视频分辨率")} className="space-y-2">
      <h3 className="text-xs font-medium canvas-ui-muted">{V("清晰度")}</h3>
      <div className="flex flex-wrap gap-2">{resolutions.map(value => <button key={value} type="button" aria-pressed={config.resolution === value} className={`${option(config.resolution === value)} flex-1`} onClick={() => onConfig({ ...config, resolution: value })}>{value.toUpperCase()}</button>)}</div>
    </section>}
    <VideoDurationControl capability={cap} mode={config.mode} value={config.durationSeconds} onChange={durationSeconds => onConfig({ ...config, durationSeconds })} disabled={disabled} translate={V}/>
    {cap.audio && <section aria-label={V("生成声音")} className="space-y-2">
      <h3 className="text-xs font-medium canvas-ui-muted">{V("生成声音")}</h3>
      {cap.audio === "optional" ? <div className="grid grid-cols-3 gap-2">{([undefined, true, false] as const).map(value => <button key={String(value)} type="button" aria-pressed={config.generateAudio === value} className={option(config.generateAudio === value)} onClick={() => onConfig({ ...config, generateAudio: value })}>{V(value === undefined ? "模型默认" : value ? "开启" : "关闭开关")}</button>)}</div> : <span className="flex items-center gap-1.5 text-xs"><Check size={13}/>{V(cap.audio === "required" ? "必须开启" : "不生成")}</span>}
    </section>}
    <section aria-label={V("生成数量")} className="space-y-2"><h3 className="text-xs font-medium canvas-ui-muted">{V("生成数量")}</h3><div className="grid grid-cols-3 gap-2">{[1, 2, 4].map(value => <button key={value} type="button" aria-pressed={count === value} className={option(count === value)} onClick={() => onCount(value)}>{value} {V("个视频")}</button>)}</div></section>
  </fieldset>;
}
