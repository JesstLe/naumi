"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Image as ImageIcon } from "lucide-react";
import { generationFailureBlocks, generationFailureMessage, generationFailureTitle, type GenerationFailure } from '@/lib/canvas/generation-failure';
import { useI18n } from "@/lib/i18n/locale-context";
import type { GenerationStage } from "@/lib/canvas/generation-feedback";
import { generationDisplayProgress, generationProgressHint } from "@/lib/canvas/generation-progress";
import styles from "./generation-placeholder.module.css";

export function GenerationPlaceholder({ stage = "generating", startedAt, count = 1, completed, kind = "image", failure, onCheck }: {
  stage?: GenerationStage;
  startedAt?: number;
  count?: number;
  completed?: number;
  kind?: "image" | "video";
  failure?: GenerationFailure;
  onCheck?: () => Promise<void>;
}) {
  const { locale } = useI18n();
  const english = locale === "en";
  const [mountedAt] = useState(() => Date.now());
  const start = startedAt ?? mountedAt;
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (failure) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [failure]);
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const candidate = generationDisplayProgress(stage, seconds, completed, count);
  const displayed = useRef({ start, percent: candidate });
  if (displayed.current.start !== start) displayed.current = { start, percent: candidate };
  else displayed.current.percent = Math.max(displayed.current.percent, candidate);
  const percent = displayed.current.percent;
  const labels = english ? ["Prepare", "Generate", "Save"] : ["准备", "生成", "保存"];
  const current = ["preparing", "generating", "saving"].indexOf(stage);
  const title = kind === "video"
    ? english ? ["Preparing video", "Generating video", "Saving video"] : ["准备生成", "视频生成中", "正在保存"]
    : english ? ["Preparing image", "Generating image", "Saving image"] : ["准备生成", "图片生成中", "正在保存"];
  const realCount = typeof completed === "number" && Number.isFinite(completed);
  if (failure) return <div data-testid="generation-failure" data-failure-kind={failure.kind}
    className={`${styles.root} ${styles.failure}`} role="status" aria-live="polite" aria-busy={checking}>
    <AlertTriangle className={styles.failureIcon} aria-hidden="true" />
    <strong className={styles.heading}>{generationFailureTitle(failure, english)}</strong>
    <p className={styles.failureMessage}>{generationFailureMessage(failure)}</p>
    <p className={styles.hint}>{generationFailureBlocks(failure)
      ? failure.jobId ? english ? 'Original task retained. Do not submit again.' : '原任务已保留，请勿重复生成。' : english ? 'Submission is unconfirmed. Do not submit again.' : '提交结果尚未确认，请勿重复生成。'
      : english ? 'Your prompt is kept. Adjust it and submit when ready.' : '提示词与参数已保留，可调整后再次点击生成。'}</p>
    {generationFailureBlocks(failure) && failure.jobId && onCheck && <button type="button" disabled={checking}
      className={`nodrag nopan ${styles.checkButton}`} onClick={event => {
        event.stopPropagation(); setChecking(true);
        void onCheck().finally(() => setChecking(false));
      }}>{checking ? english ? 'Checking…' : '正在检查…' : english ? 'Check original task' : '检查原任务'}</button>}
  </div>;
  return <div data-testid="generation-placeholder" data-stage={stage} aria-busy="true"
    data-progress={percent} className={styles.root}>
    <div className={styles.heading} role="status" aria-live="polite" aria-atomic="true">
      <ImageIcon className={styles.icon} aria-hidden="true" />
      <span>{title[current]}</span>
      {count > 1 && <span className={styles.count}>{realCount ? `${Math.max(0, Math.min(count, Math.floor(completed!)))}/${count}` : english ? `${count} images` : `${count} 张`}</span>}
    </div>
    <div className={styles.percent} aria-hidden="true">{percent}<span>%</span></div>
    <div className={styles.progress} role="progressbar" aria-label={english ? "Generation progress" : "生成进度"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% · ${title[current]}`}>
      <div className={styles.fill} style={{width:`${percent}%`}}><span className={styles.shimmer} /></div>
    </div>
    <div className={styles.hint}>{generationProgressHint(stage, seconds, english)}</div>
    <div className={styles.steps} aria-label={english ? "Generation steps" : "生成阶段"}>
      {labels.map((label, index) => <span key={label} aria-current={index === current ? "step" : undefined} data-active={index <= current}
        className={styles.step}>
        {index < current ? <Check className={styles.check} aria-hidden="true" /> : <span className={styles.dot} />}{label}
      </span>)}
    </div>
  </div>;
}
