"use client";

import type { CSSProperties } from "react";
import type { VideoMode, VideoModelDefinition } from "@/lib/video/capability-schema";
import { videoDurationOptions } from "@/lib/video/parameter-options";
import styles from "./duration-control.module.css";

const identity = (text: string) => text;

/** Shared presentation; callers retain ownership of drafts and dependent specs.
 * Undefined (Agent decides) and -1 (provider auto-duration) remain distinct. */
export function VideoDurationControl({ capability, mode, value, onChange, onSmart, disabled = false, translate = identity }: {
  capability: VideoModelDefinition;
  mode?: VideoMode;
  value?: number;
  onChange: (seconds: number) => void;
  onSmart?: () => void;
  disabled?: boolean;
  translate?: (text: string) => string;
}) {
  const { seconds, automatic } = videoDurationOptions(capability, mode);
  const selected = seconds.indexOf(value ?? 0);
  const index = Math.max(0, selected);
  const text = value === undefined ? translate(onSmart ? "智能" : "未设置") : value === -1 ? translate("自动") : `${value}s`;
  const invalid = value !== undefined && (value === -1 ? !automatic || !!onSmart : selected < 0);
  const choose = (position: number) => {
    const next = seconds[position];
    if (!disabled && next !== undefined && next !== value) onChange(next);
  };
  return <fieldset disabled={disabled} className={styles.control} data-testid="video-duration-control">
    <div className={styles.heading}>
      <span>{translate("视频时长")}</span>
      <div className={styles.selection}>
        {onSmart ? <button type="button" aria-pressed={value === undefined} onClick={onSmart}>{translate("智能")}</button>
          : automatic && <button type="button" aria-pressed={value === -1} onClick={() => onChange(-1)}>{translate("自动")}</button>}
        <output aria-label={translate("视频时长")} aria-invalid={invalid || undefined}>{text}</output>
      </div>
    </div>
    {seconds.length > 1 ? <>
      <input type="range" aria-label={translate("视频时长")} aria-valuemin={seconds[0]} aria-valuemax={seconds[seconds.length - 1]}
        aria-valuenow={selected >= 0 ? value : seconds[0]} aria-valuetext={text} aria-invalid={invalid || undefined}
        min={0} max={seconds.length - 1} step={1} value={index} disabled={disabled}
        style={{ "--duration-progress": `${index / (seconds.length - 1) * 100}%` } as CSSProperties}
        onChange={event => choose(Number(event.currentTarget.value))}
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => { if (selected < 0) choose(Number(event.currentTarget.value)); }}
        onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
            event.stopPropagation();
            if (selected < 0 && ["Home", "ArrowLeft", "ArrowDown"].includes(event.key)) { event.preventDefault(); choose(0); }
          }
        }} />
      <div className={styles.bounds} aria-hidden="true"><span>{seconds[0]}s</span><span>{seconds[seconds.length - 1]}s</span></div>
    </> : seconds.length === 1 ? <button type="button" className={styles.fixed} aria-pressed={value === seconds[0]} onClick={() => choose(0)}>{seconds[0]}s</button> : null}
  </fieldset>;
}
