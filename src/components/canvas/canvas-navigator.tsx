"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Focus, ImageIcon, Layers3, LockKeyhole, Search, Shapes, Type, Video, X, CircleDashed } from "lucide-react";
import { canvasOutlineCounts, filterCanvasOutline, type CanvasOutlineEntry, type CanvasOutlineKind } from "@/lib/canvas/navigator";
import styles from "./canvas-navigator.module.css";

const categories: Array<{ id: CanvasOutlineKind | "all"; zh: string; en: string }> = [
  { id: "all", zh: "全部", en: "All" }, { id: "image", zh: "图片", en: "Images" },
  { id: "text", zh: "文本", en: "Text" }, { id: "video", zh: "视频", en: "Video" },
  { id: "pending", zh: "待创作", en: "Drafts" }, { id: "group", zh: "分组", en: "Groups" },
];
const icons = { image: ImageIcon, text: Type, video: Video, pending: CircleDashed, group: Shapes };

export function CanvasNavigator({ entries, selectedIds, onLocate, onSelect, onClose, onFit, onFitSelection, english = false }: {
  entries: readonly CanvasOutlineEntry[];
  selectedIds: readonly string[];
  onLocate: (id: string) => void;
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  onFit: () => void;
  onFitSelection: () => void;
  english?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CanvasOutlineKind | "all">("all");
  const input = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => canvasOutlineCounts(entries), [entries]);
  const matches = useMemo(() => filterCanvasOutline(entries, query, kind), [entries, query, kind]);
  const selected = new Set(selectedIds);
  const L = (zh: string, en: string) => english ? en : zh;
  useEffect(() => { input.current?.focus(); }, []);
  return <section className={styles.panel} role="region" aria-label={L("画布大纲", "Canvas outline")} data-testid="canvas-navigator" data-canvas-hotkeys-blocked="true"
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <header className={styles.header}><span><Layers3 size={16}/>{L("画布大纲", "Canvas outline")}<b>{entries.length}</b></span>
      <button type="button" aria-label={L("关闭画布大纲", "Close canvas outline")} onClick={onClose}><X size={16}/></button></header>
    <div className={styles.search}><Search size={15}/><input ref={input} aria-label={L("搜索画布节点", "Search canvas nodes")} placeholder={L("搜索名称、提示词或内容", "Search name, prompt or text")}
      value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && matches[0]) { event.preventDefault(); onLocate(matches[0].id); } }}/>
      {query && <button type="button" aria-label={L("清除搜索", "Clear search")} onClick={() => { setQuery(""); input.current?.focus(); }}><X size={13}/></button>}</div>
    <div className={styles.tabs} role="group" aria-label={L("节点类型", "Node type")}>{categories.map(category => <button type="button" key={category.id}
      aria-pressed={kind === category.id} onClick={() => setKind(category.id)}>{english ? category.en : category.zh}<span>{counts[category.id]}</span></button>)}</div>
    <div className={styles.summary}><span aria-live="polite">{L(`${matches.length} 个节点`, `${matches.length} nodes`)}</span>
      {matches.length > 1 && matches.some(entry => entry.kind !== "group" && entry.kind !== "pending") && <button type="button" onClick={() => onSelect(matches.filter(entry => entry.kind !== "group" && entry.kind !== "pending").map(entry => entry.id))}>{L("选择结果", "Select results")}</button>}</div>
    <div className={styles.results}>{matches.map(entry => { const Icon = icons[entry.kind]; return <button type="button" key={entry.id} data-outline-id={entry.id}
      className={styles.entry} aria-label={L(`定位 ${entry.title}`, `Locate ${entry.title}`)} aria-pressed={selected.has(entry.id)} title={entry.detail || entry.title}
      onClick={event => event.shiftKey && entry.kind !== "group" && entry.kind !== "pending" ? onSelect(selected.has(entry.id) ? selectedIds.filter(id => id !== entry.id) : [...selectedIds, entry.id]) : onLocate(entry.id)}>
      <span className={styles.icon} data-kind={entry.kind}><Icon size={17}/></span><span className={styles.identity}><strong>{entry.title}</strong><small>{entry.detail || categories.find(category => category.id === entry.kind)?.[english ? "en" : "zh"]}</small></span>
      {entry.state === "running" && <i className={styles.running} aria-label={L("进行中", "Running")}/>}
      {entry.state === "failed" && <i className={styles.failed} aria-label={L("需检查", "Needs attention")}/>}
      {entry.locked && <LockKeyhole size={12} aria-label={L("已锁定", "Locked")}/>}{selected.has(entry.id) && <Check size={13}/>}</button>; })}
      {!matches.length && <div className={styles.empty}><Search size={24}/><strong>{query ? L("没有匹配的节点", "No matching nodes") : L("画布里还没有节点", "No nodes yet")}</strong>
        {query && <button type="button" onClick={() => { setQuery(""); setKind("all"); }}>{L("清除筛选", "Clear filters")}</button>}</div>}</div>
    <footer className={styles.footer}><button type="button" onClick={onFit}><Shapes size={14}/>{L("适配画布", "Fit canvas")}</button>
      <button type="button" onClick={onFitSelection} disabled={!selectedIds.length}><Focus size={14}/>{L("适配选中", "Fit selection")}</button></footer>
  </section>;
}
