"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ImageIcon, Play, Search, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { CREATION_CASES, filterCreationCases, type CreationCase } from "@/lib/creation-cases/catalog";
import { CreationCaseDetail } from "./creation-case-detail";
import styles from "./creation-cases.module.css";

export function CreationCaseGallery({ kind, home = false }: { kind: "all" | CreationCase["kind"]; home?: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CreationCase | null>(null);
  const categories = useMemo(() => Array.from(new Set(CREATION_CASES.filter(item => kind === "all" || item.kind === kind).map(item => item.category))), [kind]);
  const items = filterCreationCases(kind, category, query);
  const shown = home && !expanded ? items.slice(0, 12) : items;

  return <div data-testid="creation-case-gallery">
    <div className={styles.filters}>
      <div className={styles.categories} aria-label="案例分类">
        {["", ...categories].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value || "全部"}</button>)}
      </div>
      <div className={styles.search}><Search size={16} /><input aria-label="搜索公开案例" type="search" placeholder="搜索案例" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="清空案例搜索" onClick={() => setQuery("")}><X size={14} /></button>}
      </div>
    </div>
    <div className={styles.grid} aria-label="公开创作案例">
      {shown.map(item => <article key={item.id} className={styles.card} data-case-id={item.id} data-case-kind={item.kind}>
        <button type="button" className={styles.media} onClick={() => setSelected(item)} aria-label={`${item.kind === "video" ? "播放" : "查看"} ${item.title}`} style={{ aspectRatio: `${item.width} / ${item.height}` }}>
          <CachedImage src={item.poster} width={item.width} height={item.height} alt={item.title} loading="lazy" decoding="async" />
          {item.kind === "video" ? <><span className={styles.play}><Play size={21} fill="currentColor" /></span><span className={styles.duration}>{item.duration?.toFixed(1)}s</span></> : <span className={styles.imageBadge}><ImageIcon size={14} /></span>}
          <span className={styles.openHint}><ArrowUpRight size={18} /></span>
        </button>
        <button type="button" className={styles.caption} onClick={() => setSelected(item)}><h3>{item.title}</h3><ArrowUpRight size={16} /></button>
      </article>)}
    </div>
    {!items.length && <div className={styles.empty} role="status"><Search size={24} /><p>没有匹配的案例</p><button type="button" onClick={() => { setQuery(""); setCategory(""); }}>清除筛选</button></div>}
    {shown.length < items.length && <button type="button" className={styles.more} onClick={() => setExpanded(true)}>查看全部 {items.length} 个案例</button>}
    {selected && <CreationCaseDetail key={selected.id} item={selected} onClose={() => setSelected(null)} />}
  </div>;
}
