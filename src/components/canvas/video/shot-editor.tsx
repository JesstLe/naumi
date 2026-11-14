"use client";
import {useVideoI18n} from "./i18n";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type { VideoNodeConfig, VideoInputChoice } from "@/lib/video/client-settings";
import { VideoField, videoFieldClass, videoButtonClass } from "./form-controls";
export function ShotEditor({ shots = [], duration, maxShots, minShotDurationSeconds, shotDurationStep, maxShotPromptChars, choices, onChange, allowUnbounded = false }: {
    shots: NonNullable<VideoNodeConfig["shots"]>;
    duration?: number;
    allowUnbounded?: boolean;
    maxShots?: number | null;
    minShotDurationSeconds?:number|null;
    shotDurationStep?:number|null;
    maxShotPromptChars?:number|null;
    choices: VideoInputChoice[];
    onChange: (shots: NonNullable<VideoNodeConfig["shots"]>) => void;
}) {
    const V = useVideoI18n();
    const total = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    return <div className="space-y-3" data-testid="video-shot-editor">
    {shots.map((shot, index) => <div key={shot.id || index} className="space-y-2 rounded-lg border border-current/10 p-3"><div className="flex items-center justify-between text-xs"><span>{V("\u955C\u5934 ")}{index + 1}</span><button type="button" className={videoButtonClass} onClick={() => onChange(shots.filter((_, i) => i !== index))}>{V("\u79FB\u9664")}</button></div>
      <select aria-label={V(`镜头${index + 1}文字来源`)} value={shot.textNodeId || ""} className={videoFieldClass} onChange={event => { const choice = choices.find(item => item.nodeId === event.target.value); onChange(shots.map((item, i) => i === index ? { ...item, textNodeId: choice?.nodeId, prompt: choice?.value || item.prompt } : item)); }}><option value="">{V("\u76F4\u63A5\u7F16\u8F91\u63CF\u8FF0")}</option>{choices.filter(choice => choice.kind === "text").map(choice => <option key={choice.id} value={choice.nodeId}>{choice.title}</option>)}</select>
      <textarea aria-label={V(`镜头${index + 1}描述`)} rows={3} maxLength={maxShotPromptChars??undefined} className={videoFieldClass} value={shot.prompt} onChange={event => onChange(shots.map((item, i) => i === index ? { ...item, prompt: event.target.value, textNodeId: undefined } : item))}/>
      <VideoField label={V(`镜头${index + 1}时长`)}><input aria-label={V(`镜头${index + 1}时长`)} className={videoFieldClass} type="number" min={minShotDurationSeconds??0.001} max={duration&&duration>0?duration:3600} step={shotDurationStep??"any"} value={shot.durationSeconds} onChange={event => onChange(shots.map((item, i) => i === index ? { ...item, durationSeconds: Number(event.target.value) } : item))}/></VideoField>
      <div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={index === 0} onClick={() => { const next = [...shots]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>{V("\u4E0A\u79FB")}</button><button type="button" className={videoButtonClass} disabled={index === shots.length - 1} onClick={() => { const next = [...shots]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }}>{V("\u4E0B\u79FB")}</button></div>
    </div>)}
    <div className="flex items-center justify-between gap-3"><button type="button" className={videoButtonClass} disabled={maxShots == null ? !allowUnbounded : shots.length >= maxShots} onClick={() => {const min=minShotDurationSeconds??1,step=shotDurationStep??min,remaining=duration&&duration>total?duration-total:min;onChange([...shots, { id: browserRandomUUID(), prompt: "", durationSeconds: Math.max(min,Math.floor(remaining/step)*step) }]);}}>{V("\u6DFB\u52A0\u955C\u5934")}</button><span className={`text-xs ${duration !== total && shots.length ? "text-amber-500" : "opacity-60"}`} data-testid="video-shot-total">{V("\u5408\u8BA1 ")}{total} / {duration ?? "—"}{V(" \u79D2")}</span></div>
  </div>;
}
