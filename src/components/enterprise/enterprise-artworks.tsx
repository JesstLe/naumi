"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search, X } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { readBrowserImage } from "@/lib/browser-image-cache";
import { CachedImage } from "@/components/cached-image";
import type { BiResponse, BiRow } from "@/lib/bi/contracts";
import { ARTWORK_COLUMNS, ARTWORK_DETAIL_LABELS, artworkDetailEntries, artworkDetailValue, artworkValue } from "@/lib/bi/artwork-view";
import type { EnterpriseSnapshot } from "@/lib/enterprise/contracts";
import styles from "@/components/admin/bi/dashboard.module.css";
import local from "./enterprise-artworks.module.css";

type Filter = { from: string; to: string; email: string; q: string; accountType: string; status: string;period:''|'all' };
const initialFilter = (email: string,allDates=false): Filter => {
  const to = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const query=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search);
  const fromQuery=query.get('from')||'',toQuery=query.get('to')||'';
  const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const explicitDates=valid(fromQuery)&&valid(toQuery)&&fromQuery<=toQuery&&Date.parse(toQuery)-Date.parse(fromQuery)<=365*86400000;
  return { from:explicitDates?fromQuery:allDates?'':new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400_000).toISOString().slice(0, 10), to:explicitDates?toQuery:allDates?'':to, email, q: "", accountType: "", status: "",period:explicitDates?'':allDates?'all':'' };
};
async function getRecords(url: string, signal: AbortSignal): Promise<BiResponse> {
  const response = await fetch(url, { cache: "no-store", headers: await authHeader(), signal });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "作品读取失败"); return data;
}
/** Private image cache still re-authorizes each read. No direct source/signed URLs. */
function RecordImage({ src, alt, full = false }: { src: string; alt: string; full?: boolean }) {
  const [image, setImage] = useState<{ source: string; url: string } | null>(null), [failed, setFailed] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let url = ""; setImage(null); setFailed("");
    void readBrowserImage(src, controller.signal).then(blob => { if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setImage({ source: src, url }); } }, () => { if (!controller.signal.aborted) setFailed(src); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [src]);
  return image?.source === src ? <CachedImage src={image.url} alt={alt} className={full ? styles.preview : undefined} /> : <span className={styles.muted}>{failed === src ? "图片暂不可读取" : "加载中…"}</span>;
}
export function EnterpriseArtworks({ snapshot, initialEmail = "",dedicated=false }: { snapshot: EnterpriseSnapshot; initialEmail?: string;dedicated?:boolean }) {
  const enterpriseId = snapshot.enterprise.id;
  // Membership/role changes invalidate the displayed records and open detail immediately.
  const scopeKey = JSON.stringify([enterpriseId, snapshot.actor, snapshot.enterprise.authorized_until, snapshot.members.map(m => [m.email, m.supervisor_email, m.role_id, m.version]), snapshot.roles]);
  return <ArtworkScope key={scopeKey} snapshot={snapshot} initialEmail={initialEmail} dedicated={dedicated}/>;
}
function ArtworkScope({ snapshot, initialEmail,dedicated }: { snapshot: EnterpriseSnapshot; initialEmail: string;dedicated:boolean }) {
  const enterpriseId = snapshot.enterprise.id;
  const [draft, setDraft] = useState(() => initialFilter(initialEmail,dedicated)), [filter, setFilter] = useState(() => initialFilter(initialEmail,dedicated));
  const [page, setPage] = useState(1), [reload, setReload] = useState(0), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [data, setData] = useState<{ key: string; body: BiResponse } | null>(null), [selected, setSelected] = useState<BiRow | null>(null), [exporting, setExporting] = useState(false);
  const close = useRef<HTMLButtonElement>(null), alive = useRef(true), detailRequest = useRef<AbortController | null>(null), exportRequest = useRef<AbortController | null>(null);
  const key = JSON.stringify([filter, page, reload]);
  const result = data?.key === key ? data.body : null;
  const params = new URLSearchParams({ enterpriseId, ...filter, page: String(page) });
  const media = (row: BiRow, full = false) => `/api/enterprise/media?${new URLSearchParams({ enterpriseId, email: String(row.email), id: String(row.id), ...(full ? { full: "1" } : {}) })}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailRequest.current?.abort(); exportRequest.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError(""); setSelected(null); detailRequest.current?.abort(); exportRequest.current?.abort(); setExporting(false);
    const query = new URLSearchParams({ enterpriseId, ...filter, page: String(page) });
    void getRecords(`/api/enterprise/artworks?${query}`, controller.signal).then(body => { if (!controller.signal.aborted) setData({ key, body }); }, e => { if (!controller.signal.aborted) { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [enterpriseId, filter, page, reload, key]);
  useEffect(() => {
    if (!selected) return; const previous = document.activeElement as HTMLElement | null; close.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [selected]);
  async function exportPage() {
    if (exporting || busy || !result?.rows.length) return;
    const controller = new AbortController(); exportRequest.current = controller; setExporting(true); setError(""); let url = "";
    try {
      // Re-check the live hierarchy before export, rather than exporting a stale UI snapshot.
      const response = await fetch(`/api/enterprise/artworks?${params}&format=csv`, { cache: "no-store", headers: await authHeader(), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error || "导出失败");
      const blob = await response.blob(); if (controller.signal.aborted || !alive.current) return;
      url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `enterprise-artworks-${filter.from}-${filter.to}-page${page}.csv`; a.click();
    } catch (e) { if (!controller.signal.aborted && alive.current) { setData(null); setSelected(null); setError(e instanceof Error ? e.message : "导出失败"); } }
    finally { if (url) URL.revokeObjectURL(url); if (!controller.signal.aborted && alive.current) setExporting(false); }
  }
  async function openSource(row: BiRow) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    try {
      const query = new URLSearchParams({ enterpriseId, id: String(row.source_artwork_id), email: String(row.email), status: "all" });
      const source = await getRecords(`/api/enterprise/artworks?${query}`, controller.signal);
      if (!controller.signal.aborted && alive.current) { if (!source.rows[0]) throw new Error("源作品已清理或不存在"); setSelected(source.rows[0]); }
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(e instanceof Error ? e.message : "读取源作品失败"); }
  }
  const closeDetail = () => { detailRequest.current?.abort(); setSelected(null); };
  return <section className={`${styles.shell} ${local.root}`} data-testid="enterprise-artworks">
    <div className={local.content}>
      <header className={styles.header}><h1>图片与操作内容</h1><button className={styles.button} disabled={busy} onClick={() => setReload(n => n + 1)}><RefreshCw size={15} />刷新</button></header>
      <form className={styles.filters} onSubmit={e => { e.preventDefault(); setFilter({ ...draft }); setPage(1); }}>
        <label>开始日期<input aria-label="开始日期" type="date" required={draft.period!=='all'} value={draft.from} onChange={e => setDraft({ ...draft, from:e.target.value,period:'' })} /></label>
        <label>结束日期<input aria-label="结束日期" type="date" required={draft.period!=='all'} value={draft.to} onChange={e => setDraft({ ...draft, to:e.target.value,period:'' })} /></label>
        <button type="button" className={styles.button} aria-pressed={draft.period==='all'} onClick={()=>{const next={...draft,period:'all' as const,from:'',to:''};setDraft(next);setFilter(next);setPage(1);}}>全部日期</button>
        <label>成员<select aria-label="选择成员" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })}><option value="">全部成员</option>{snapshot.members.map(m => <option key={m.email} value={m.email}>{m.name || m.email}</option>)}</select></label>
        {!dedicated&&<label>账户类型<select aria-label="账户类型" value={draft.accountType} onChange={e => setDraft({ ...draft, accountType: e.target.value })}><option value="">全部类型</option><option value="personal">个人</option><option value="enterprise">企业</option><option value="unknown">未登记</option></select></label>}
        <label className={styles.search}>搜索成员<input aria-label="搜索账户" placeholder={dedicated?'姓名、账号':'姓名、邮箱、企业名称'} value={draft.q} maxLength={100} onChange={e => setDraft({ ...draft, q: e.target.value })} /></label>
        <label>记录筛选<select aria-label="记录筛选" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">正常作品</option><option value="deleted">回收站</option><option value="all">全部记录</option></select></label>
        <button className={`${styles.primary} ${local.query}`} disabled={busy}><Search size={15} />查询</button>
      </form>
      <div className={styles.scope}><span>统计日期：{filter.from} 至 {filter.to} · 北京时间</span>{result && <span>更新于 {artworkValue(result.generatedAt, true)}</span>}</div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {busy ? <div className={styles.empty} role="status">加载中…</div> : result && <>
        <div className={styles.tableTop}><span>共 <strong>{result.total.toLocaleString("zh-CN")}</strong> 条 · 本页 {result.rows.length} 条</span><button className={styles.button} disabled={exporting || !result.rows.length} onClick={() => void exportPage()}><Download size={15} />{exporting ? "导出中…" : "导出本页 CSV"}</button></div>
        <div className={styles.tableWrap}><table><thead><tr><th>图片</th>{ARTWORK_COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}<th>详情</th></tr></thead><tbody>{result.rows.map(row => <tr key={String(row.id)}><td>{row.has_image ? <button className={`${styles.thumb} ${local.thumbnail}`} aria-label={`查看 ${row.title || "图片"}`} onClick={() => setSelected(row)}><RecordImage src={media(row)} alt={String(row.title || "作品")} /></button> : <span className={styles.muted}>无图片</span>}</td>{ARTWORK_COLUMNS.map(c => <td key={c.key}><span tabIndex={0} title={`${c.label}：${artworkValue(row[c.key], c.key === "created_at")}`} className={c.key === "prompt_display" || c.key === "title" ? styles.truncated : undefined}>{artworkValue(row[c.key], c.key === "created_at")}</span></td>)}<td><button className={styles.textButton} onClick={() => setSelected(row)}>查看详情</button></td></tr>)}</tbody></table>{!result.rows.length && <div className={styles.empty}>暂无记录</div>}</div>
        <div className={styles.pagination}><button aria-label="上一页" className={styles.button} disabled={page <= 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={15} />上一页</button><span>{page} / {Math.max(1, Math.ceil(result.total / result.size))}</span><button aria-label="下一页" className={styles.button} disabled={page * result.size >= result.total} onClick={() => setPage(n => n + 1)}>下一页<ChevronRight size={15} /></button></div>
      </>}
    </div>
    {selected && <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) closeDetail(); }}><section className={styles.drawer} role="dialog" aria-modal="true" aria-label="作品详情" onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); closeDetail(); }
      if (e.key === "Tab") { const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex='0']")), first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}><div className={styles.drawerHead}><h2>{String(selected.title || "记录详情")}</h2><button ref={close} aria-label="关闭详情" className={styles.iconButton} onClick={closeDetail}><X size={20} /></button></div>
      {selected.has_image && <RecordImage src={media(selected, true)} alt={String(selected.title || "作品预览")} full />}
      {selected.source_artwork_id && <button className={styles.textButton} onClick={() => void openSource(selected)}>查看复制源作品</button>}
      <dl className={styles.details}>{artworkDetailEntries(selected).map(([field, value]) => <div key={field}><dt>{ARTWORK_DETAIL_LABELS[field] || field}</dt><dd>{artworkDetailValue(field, value)}</dd></div>)}</dl>
    </section></div>}
  </section>;
}
