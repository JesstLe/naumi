"use client";

import type { FrameChoice, FrameInput, FrameSize } from "@/lib/imagegen/frame-choice";
import { frameRatio } from "@/lib/imagegen/frame-choice";
import styles from "./imagegen-frame-choice.module.css";

export function ImagegenFrameChoice({ inputs, choice, sourceId, sizes, frame, disabled, onSource }: {
  inputs: FrameInput[]; choice: string; sourceId: string; sizes: Record<string, FrameSize>; frame: FrameChoice;
  disabled: boolean; onSource: (id: string) => void;
}) {
  const sources = inputs.filter(input => input.role !== "mask");
  if (!sources.length || choice !== "source") return null;
  return <fieldset className={styles.box} disabled={disabled}>
    <legend>生成画幅</legend>
    <div className={styles.options}>{sources.map((input, index) => {
      const size = sizes[input.artworkId] || (input.width && input.height ? { width: input.width, height: input.height } : undefined);
      const selected = sourceId ? sourceId === input.artworkId : frame.source?.artworkId === input.artworkId;
      return <label key={`${input.artworkId}:${index}`} className={styles.option} data-selected={selected}>
        <input type="radio" name="imagegen-frame-source" aria-label={`沿用素材${index + 1}的画幅`} checked={selected} onChange={() => onSource(input.artworkId)} />
        <span className={styles.shape} style={{ aspectRatio: size ? `${size.width}/${size.height}` : "1" }} />
        <span className={styles.identity}><b>{input.label || `素材 ${index + 1}`}</b><small>{size ? `${size.width} × ${size.height}` : "读取尺寸中"}</small></span>
        <strong>{frameRatio(size) || "—"}</strong>
      </label>;
    })}</div>
    <p className={styles.note} role={frame.error ? "alert" : undefined}>{frame.error || (frame.ratio ? `生成画幅 ${frame.ratio}${!sourceId && frame.source?.role === "reference" ? " · 默认沿用参考图比例" : ""}` : "请选择画幅基准")}</p>
  </fieldset>;
}
