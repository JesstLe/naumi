"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Server, X } from "lucide-react";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { useAuth } from "@/lib/auth-context";
import { businessFilter, businessNavigation, businessViews, combinedTotals, hasNextSourcePage, localTime } from "./model";
import { BusinessMetrics } from "./metrics";
import { BusinessTrend } from "./trend";
import { BusinessTable, statusLabels } from "./business-table";
import { useBusinessData } from "./use-business-data";
import { businessPresentation, type BusinessEntry } from "./entry";
import type { BusinessFilter, BusinessView } from "./types";
import styles from "./business-data.module.css";

/** Render URL-scoped business data and source-level states for the selected admin entry.
 * Delegate polling to the hook and keep filtering, account drill-down and pagination in the URL.
 */
export function FleetBusinessDashboard({ initialView = "usage", entry = "usage" }: { initialView?: BusinessView; entry?: BusinessEntry }) {
  const params = useSearchParams();
  const parameterText = params.toString(), { user, ready } = useAuth();
  const filter = useMemo(() => businessFilter(new URLSearchParams(parameterText), initialView), [parameterText, initialView]);
  const presentation = businessPresentation(filter.view, entry);
  const [draftSearch, setDraftSearch] = useState(filter.search), [revision, setRevision] = useState(0);
  useEffect(() => { setDraftSearch(filter.search); }, [filter.search]);
  const identity = ready ? user?.email || "native-administrator" : "auth-pending";
  const { data, busy, error } = useBusinessData(filter, identity, ready, revision);
  const totals = useMemo(() => combinedTotals(data), [data]);
  const returned = data?.sources.filter(source => source.status === "succeeded").length || 0;
  const sourceCount = data?.sources.length || 0;
  const unavailable = data?.sources.filter(source => ["failed", "offline", "unknown", "unavailable"].includes(source.status)) || [];

  /** Merge a filter change into the latest browser URL synchronously so successive events retain earlier changes and explicit Fleet ownership. */
  function navigate(patch: Partial<BusinessFilter>) {
    const search = businessNavigation(new URLSearchParams(window.location.search), patch, initialView);
    // Next's native History integration updates useSearchParams. The URL write is
    // synchronous, so a second filter event merges the first before React renders.
    window.history.replaceState(null, "", window.location.pathname + (search.size ? "?" + search.toString() : ""));
  }
  /** Submit the bounded search draft as a fresh first-page query and clear any account-specific drill-down. */
  function search(event: FormEvent) { event.preventDefault(); navigate({ search: draftSearch.trim().slice(0, 100), email: undefined, page: 1 }); }
  /** Open a source-qualified account view, clearing free-text search and resetting pagination without merging identities across sites. */
  function drill(site: string, email: string, view: BusinessView) { setDraftSearch(""); navigate({ site, email, view, search: "", page: 1 }); }
  const selectedSite = data?.sites.find(site => site.id === filter.site);

  return <AdminCenterShell active={presentation.active}><main className={styles.main} aria-label="跨站业务数据" aria-busy={busy} data-fleet-business="true">
    <header className={styles.header}>
      <div className={styles.title}><h1>{presentation.title}</h1>{data && <span className={styles.updated}>截至 {localTime(data.query.asOf)}</span>}</div>
      <div className={styles.headerActions}>
        <Link href={presentation.localHref} prefetch={false} className={styles.textLink}>{presentation.localLabel}<ArrowUpRight size={14}/></Link>
        <button className={styles.button} disabled={busy} type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={busy ? styles.spin : ""}/>刷新</button>
      </div>
    </header>

    <div className={styles.toolbar}>
      <label className={styles.siteSelect}><Server size={15}/><select aria-label="数据站点" value={filter.site} onChange={event => navigate({ site: event.target.value, page: 1, email: undefined })}>
        <option value="all">全部站点</option>
        <option value="local">103 平台</option>
        {data?.sites.filter(site => site.id !== "local").map(site => <option key={site.id} value={site.id} disabled={!site.enabled}>{site.name}{site.enabled ? "" : "（已停用）"}</option>)}
        {filter.site !== "all" && filter.site !== "local" && !selectedSite && <option value={filter.site}>所选站点</option>}
      </select><ChevronDown size={13}/></label>
      <div className={styles.periods} aria-label="统计时段">{([7, 30, 90, 365] as const).map(days => <button type="button" key={days} aria-pressed={filter.days === days} onClick={() => navigate({ days, page: 1 })}>{days === 365 ? "近一年" : `近 ${days} 天`}</button>)}</div>
      <form className={styles.search} onSubmit={search}><Search size={15}/><input type="search" aria-label="搜索业务数据" placeholder="搜索账号、名称" value={draftSearch} onChange={event => setDraftSearch(event.target.value)}/><button type="submit">查询</button></form>
    </div>

    <div className={styles.sourceStrip} aria-label="数据来源">
      {data?.sources.map(source => <div key={source.id} className={styles.sourcePill} data-status={source.status}>
        <i/><strong>{source.name}</strong><span>{statusLabels[source.status]}</span>{source.status === "succeeded" && source.data && <time dateTime={source.data.observedAt}>{localTime(source.data.observedAt)}</time>}
      </div>)}
      {!data && <span className={styles.preparing}>{busy && <Loader2 size={13} className={styles.spin}/>} {busy ? "正在读取站点" : "未读取到站点数据"}</span>}
      {data && !data.complete && <span className={styles.coverage} role="status">{returned} / {sourceCount} 个站点已返回</span>}
    </div>

    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setRevision(value => value + 1)}>重试</button></div>}
    {unavailable.length > 0 && <div className={styles.warning} role="status">{unavailable.map(source => `${source.name}：${source.error || statusLabels[source.status]}`).join("；")}</div>}

    {filter.email && <div className={styles.accountFilter}><button type="button" onClick={() => navigate({ email: undefined, page: 1 })}><ArrowLeft size={14}/>全部账号</button><strong>{filter.email}</strong>{selectedSite && <span>{selectedSite.name}</span>}<button type="button" aria-label="清除账户筛选" onClick={() => navigate({ email: undefined, page: 1 })}><X size={15}/></button></div>}

    <BusinessMetrics totals={totals} view={filter.view}/>
    {filter.view === "usage" && <BusinessTrend data={data}/>}

    <nav className={styles.tabs} aria-label="业务数据分类">{businessViews.map(view => <button type="button" key={view.id} aria-current={view.id === filter.view ? "page" : undefined} onClick={() => navigate({ view: view.id, page: 1 })}>{view.label}</button>)}</nav>
    <BusinessTable response={data} view={filter.view} drill={drill} busy={busy}/>
    <footer className={styles.pagination}><span>{sourceCount > 1 ? "各站" : ""}第 {filter.page} 页{data && ` · 每站 ${data.sources.find(source => source.data)?.data?.pageSize || 30} 条`}</span><div><button className={styles.button} type="button" disabled={busy || filter.page <= 1} onClick={() => navigate({ page: filter.page - 1 })}><ChevronLeft size={14}/>上一页</button><button className={styles.button} type="button" disabled={busy || !hasNextSourcePage(data)} onClick={() => navigate({ page: filter.page + 1 })}>下一页<ChevronRight size={14}/></button></div></footer>
    {busy && data && <div className={styles.polling} role="status"><Loader2 size={13} className={styles.spin}/>等待站点回执</div>}
  </main></AdminCenterShell>;
}
