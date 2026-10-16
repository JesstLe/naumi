"use client";
import { useState } from "react";
import type { BiRow } from "@/lib/bi/contracts";
import styles from "./artwork-media.module.css";

function Picture({ src, label, detail, onOpen }: { src: string; label: string; detail: boolean; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false);
  const image = failed ? <span className={styles.unavailable}>图片暂不可读</span> :
    // Native image deliberately bypasses shared persistent image cache for private BI media.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />;
  return <figure className={styles.figure}>
    {detail ? <a className={styles.image} href={`${src}&full=1`} target="_blank" rel="noreferrer">{image}</a> :
      <button type="button" className={styles.image} onClick={onOpen} aria-label={`查看${label}`}>{image}</button>}
    <figcaption>{label}</figcaption>
  </figure>;
}
export function ArtworkMedia({ row, detail = false, onOpen }: { row: BiRow; detail?: boolean; onOpen?: () => void }) {
  const count = Math.max(0, Number(row.input_count) || 0), shown = detail ? count : Math.min(count, 2);
  const base = `/api/admin/bi/media?id=${encodeURIComponent(String(row.id))}`;
  const uploaded = row.operation_label === "上传图片";
  const resultLabel = uploaded ? "上传原图" : ["图生图", "文生图"].includes(String(row.generation_mode)) ? "生成图" : "作品图片";
  return <div className={`${styles.root} ${detail ? styles.detail : ""}`}>
    <div className={styles.pictures}>
      {Array.from({ length: shown }, (_, i) => <Picture key={`${row.id}-input-${i}`} src={`${base}&slot=input&index=${i}`}
        label={count > 1 ? `原图 ${i + 1}` : "原图"} detail={detail} onOpen={onOpen} />)}
      {count > shown && <button type="button" className={styles.more} onClick={onOpen}>+{count - shown} 张原图</button>}
      {row.has_image ? <Picture key={`${row.id}-result`} src={base} label={resultLabel} detail={detail} onOpen={onOpen} /> : <span>无结果图片</span>}
    </div>
    {!uploaded && <span className={styles.mode}>{String(row.generation_mode || "类型待核验")}
      {row.input_status === "原图未留存" || row.input_status === "部分原图缺失" ? ` · ${row.input_status}` : ""}</span>}
    {detail && <div className={styles.prompt}><strong>提示词 / 操作内容</strong><p>{String(row.prompt_display || row.prompt || "未保存提示词")}</p></div>}
  </div>;
}
