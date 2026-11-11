"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, ExternalLink, X } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { CachedImage } from "@/components/cached-image";
import { creationCaseHref, type CreationCase } from "@/lib/creation-cases/catalog";
import styles from "./creation-cases.module.css";

export function CreationCaseDetail({ item, onClose }: { item: CreationCase; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [mediaError, setMediaError] = useState(false);
  const { canPage } = useFeatureAccess();
  const canCreate = canPage(item.kind === "video" ? "/video" : "/generate");

  useEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    el?.showModal();
    document.body.style.overflow = "hidden";
    const pause = () => { if (document.visibilityState !== "visible") video.current?.pause(); };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      el?.close();
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  async function copy() {
    try { setCopyState(await copyText(item.prompt) ? "copied" : "failed"); }
    catch { setCopyState("failed"); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`case-title-${item.id}`} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.detail}>
      <button type="button" className={styles.close} aria-label="关闭案例" onClick={onClose} autoFocus><X size={20} /></button>
      <div className={styles.preview}>
        {item.kind === "video" ? <video ref={video} controls playsInline preload="metadata" poster={item.poster} src={item.video}
          aria-label={item.title} onError={() => setMediaError(true)} />
          // Local, versioned editorial assets; not account-owned media.
          : <CachedImage src={item.poster} width={item.width} height={item.height} alt={item.title} onError={() => setMediaError(true)} />}
        {mediaError && <p role="alert" className={styles.mediaError}>素材加载失败，请关闭后重试，或查看下方公开来源。</p>}
      </div>
      <div className={styles.detailBody}>
        <span className={styles.eyebrow}>{item.kind === "video" ? "短视频" : "图片"} / {item.category}</span>
        <h2 id={`case-title-${item.id}`}>{item.title}</h2>
        <div className={styles.promptHeading}><h3>创作提示词</h3><button type="button" onClick={() => void copy()} aria-label="复制创作提示词">
          {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}<span>{copyState === "copied" ? "已复制" : "复制"}</span>
        </button></div>
        <p className={styles.prompt}>{item.prompt}</p>
        {copyState === "failed" && <p role="status" className={styles.error}>复制失败，请选中提示词手动复制。</p>}
        <ol className={styles.steps}>{item.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {canCreate && <Link href={creationCaseHref(item)} className={styles.create} onClick={onClose}>使用此案例<ArrowUpRight size={17} /></Link>}
        <footer className={styles.source}>
          <a href={item.source.url} target="_blank" rel="noopener noreferrer">{item.source.title}<ExternalLink size={12} /></a>
          <p>{item.source.author}{item.source.promptAuthor && ` · 原提示词 ${item.source.promptAuthor}`}</p>
          <a href={item.source.licenseUrl} target="_blank" rel="noopener noreferrer">{item.source.license}</a>
          <p>{item.adaptation}</p>
        </footer>
      </div>
    </div>
  </dialog>;
}
