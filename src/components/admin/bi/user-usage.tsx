"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Download, ImageIcon, Loader2, RefreshCw, Search, Users, Wallet, X } from "lucide-react";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { biCsvCell } from "@/lib/bi/contracts";
import type { UsageMetrics, UsageResponse, UsageSort, UsageUser } from "@/lib/bi/usage-contracts";
import styles from "./user-usage.module.css";

type Filter = { from: string; to: string; email: string; tenantId: string; q: string; sort: UsageSort; page: number };
type Props = { embedded?: boolean; enterpriseId?: string };
const dayMs = 86400_000;
const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const sortOptions: { value: UsageSort; label: string }[] = [
  { value: "delivered", label: "按生成作品" },
  { value: "consumed", label: "按消费积分" },
  { value: "tasks", label: "按任务数量" },
  { value: "activeDays", label: "按活跃天数" },
  { value: "modelCalls", label: "按模型调用" },
];

function number(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "未记录" : numberFormat.format(value);
}
function recentDates(days: number) {
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return { from: new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * dayMs).toISOString().slice(0, 10), to: today };
}
function localTime(raw: string | null | undefined) {
  if (!raw) return "未记录";
  const value = new Date(raw);
  return Number.isFinite(value.getTime()) ? dateFormat.format(value) : "未记录";
}
function queryParameters(filter: Filter, enterpriseId?: string) {
  return new URLSearchParams({
    from: filter.from, to: filter.to, email: filter.email, q: filter.q,
    ...(enterpriseId ? { enterpriseId } : { tenantId: filter.tenantId }),
    sort: filter.sort, page: String(filter.page), size: "30",
  });
}
function csvFilename(filter: Filter) {
  return `用户用量_${filter.from}_${filter.to}.csv`;
}
function csvForUsers(rows: UsageUser[]) {
  const columns: [string, (row: UsageUser) => unknown][] = [
    ["花名", r => r.name], ["账号", r => r.email], ["企业", r => r.company],
    ["业务任务", r => r.tasks], ["生成作品", r => r.delivered], ["上传作品", r => r.uploads], ["导入复制", r => r.imports], ["保存作品", r => r.storedArtworks], ["已删除作品", r => r.deletedArtworks],
    ["未归因作品", r => r.unattributedArtworks], ["消费积分", r => r.consumed], ["退回积分", r => r.refunded], ["净消耗积分", r => r.netCredits], ["管理员扣减积分", r => r.administrativeDebits],
    ["活跃天数", r => r.activeDays], ["每活跃日产出", r => r.deliveriesPerActiveDay], ["积分每生成作品", r => r.creditsPerDelivered],
    ["模型调用", r => r.modelCalls], ["输入Tokens", r => r.inputTokens], ["输出Tokens", r => r.outputTokens], ["完整Token记录数", r => r.tokenSamples],
    ["最近活动", r => r.lastActivityAt],
  ];
  return "\uFEFF" + [columns.map(([label]) => biCsvCell(label)).join(","), ...rows.map(row => columns.map(([, value]) => biCsvCell(value(row) ?? "未记录")).join(","))].join("\r\n");
}

/** System usage/output evidence only: does not infer employee performance or working hours. */
export function UserUsage({ embedded = false, enterpriseId }: Props) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [defaults] = useState(() => recentDates(30));
  const prefix = embedded ? "usage" : "";
  const key = (name: string) => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
  const parameterText = params.toString();
  const filter = useMemo<Filter>(() => {
    const current = new URLSearchParams(parameterText), read = (name: string) => current.get(prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name) || "";
    const sort = read("sort"), page = Number(read("page") || "1");
    return {
      from: read("from") || defaults.from, to: read("to") || defaults.to,
      email: read("email"), q: read("q"), tenantId: enterpriseId || read("tenantId"),
      sort: sortOptions.some(option => option.value === sort) ? sort as UsageSort : "delivered",
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    };
  }, [parameterText, prefix, defaults, enterpriseId]);
  const [draft, setDraft] = useState(filter), [data, setData] = useState<UsageResponse | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false), [exported, setExported] = useState(0), [exportError, setExportError] = useState("");
  const exportAbort = useRef<AbortController | null>(null);
  const endpoint = enterpriseId ? "/api/enterprise/usage" : "/api/admin/bi/usage";
  const apiQuery = queryParameters(filter, enterpriseId).toString();
  useEffect(() => { setDraft(filter); }, [filter]);
  useEffect(() => {
    const controller = new AbortController();
    exportAbort.current?.abort(); setExportError(""); setExporting(false); setExported(0);
    setBusy(true); setError(""); setData(null);
    void fetch(`${endpoint}?${apiQuery}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "用量数据读取失败，请重试");
      if (!Array.isArray(body.users) || !Array.isArray(body.daily) || !body.summary || !body.coverage) throw new Error("用量数据格式异常，请重试");
      if (!controller.signal.aborted) setData(body as UsageResponse);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "用量数据读取失败，请重试"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); exportAbort.current?.abort(); };
  }, [endpoint, apiQuery, reload]);

  function navigate(next: Partial<Filter>) {
    const updated = { ...filter, ...next }, search = new URLSearchParams(parameterText);
    for (const name of ["from", "to", "email", "tenantId", "q", "sort", "page"] as const) {
      if (enterpriseId && name === "tenantId") { search.delete(key(name)); continue; }
      const value = String(updated[name]);
      if (!value || name === "page" && value === "1") search.delete(key(name)); else search.set(key(name), value);
    }
    router.replace(`${pathname}?${search}`, { scroll: false });
  }
  function apply(event: FormEvent) { event.preventDefault(); navigate({ ...draft, email: draft.q !== filter.q || draft.tenantId !== filter.tenantId ? "" : draft.email, page: 1 }); }
  function preset(days: number) { navigate({ ...recentDates(days), page: 1 }); }
  function selectUser(user: UsageUser) { navigate({ email: user.email, q: "", page: 1 }); }
  function drill(section: "operations" | "artworks" | "ledger", email: string) {
    if (enterpriseId) return `/admin?${new URLSearchParams({ view: "records", recordView: section === "operations" ? "tasks" : section === "artworks" ? "artworks" : "ledger", user: email, from: filter.from, to: filter.to })}`;
    return `/admin/center?${new URLSearchParams({ section, email, from: filter.from, to: filter.to })}`;
  }
  async function exportUsers() {
    if (!data || exporting) return;
    const controller = new AbortController(); exportAbort.current = controller;
    setExporting(true); setExported(0); setExportError("");
    try {
      const rows: UsageUser[] = [], seen = new Set<string>(); let total: number | undefined;
      for (let page = 1; ; page++) {
        const query = queryParameters({ ...filter, page }, enterpriseId); query.set("size", "100");
        const response = await fetch(`${endpoint}?${query}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "导出失败，请重试");
        const result = body as UsageResponse;
        if (!Array.isArray(result.users) || !Number.isSafeInteger(result.total)) throw new Error("导出数据格式异常");
        if (result.total > 10000) throw new Error("当前筛选超过 10,000 个账号，请缩小范围后导出");
        if (total !== undefined && result.total !== total) throw new Error("账号列表在导出期间发生变化，请重新导出");
        total = result.total;
        for (const row of result.users) { if (seen.has(row.email)) throw new Error("用户排序在导出期间发生变化，请重新导出"); seen.add(row.email); rows.push(row); }
        if (controller.signal.aborted) return;
        setExported(rows.length);
        if (rows.length >= total) break;
        if (!result.users.length) throw new Error("导出未读取完整，请重新导出");
      }
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([csvForUsers(rows)], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a");
      anchor.href = url; anchor.download = csvFilename(filter); document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { if (!controller.signal.aborted) setExportError(reason instanceof Error ? reason.message : "导出失败，请重试"); }
    finally { if (exportAbort.current === controller) { setExporting(false); exportAbort.current = null; } }
  }

  const selected = filter.email ? data?.users.find(user => user.email === filter.email) : undefined;
  const unavailable = data?.coverage.sources.filter(source => !source.available) || [];
  const Root = embedded ? "section" : "main";
  const content = <Root className={styles.main} data-admin-usage="true" aria-label="用户用量统计" aria-busy={busy}>
    <header className={styles.header}>
      <div className={styles.titleBlock}><h1>{filter.email ? "用户用量明细" : "用户用量"}</h1>{data && <span className={styles.updated}>更新于 {localTime(data.generatedAt)}</span>}</div>
      <div className={styles.headerActions}>
        <button className={styles.button} type="button" disabled={busy || !data || exporting || !data.total} onClick={() => void exportUsers()}><Download size={16}/>{exporting ? `导出中 ${exported}` : "导出用量"}</button>
        <button className={styles.button} type="button" disabled={busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} className={busy ? styles.spin : ""}/>刷新</button>
      </div>
    </header>

    <form className={styles.filters} onSubmit={apply} aria-label="用量筛选">
      <div className={styles.dateFields}><label>开始日期<input type="date" value={draft.from} max={draft.to} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} required/></label><span className={styles.dateSeparator}>—</span><label>结束日期<input type="date" value={draft.to} min={draft.from} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} required/></label></div>
      {!enterpriseId && <label className={styles.companyField}>企业<select value={draft.tenantId} onChange={event => setDraft(value => ({ ...value, tenantId: event.target.value }))}><option value="">全部企业与个人</option>{data?.tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>}
      <label className={styles.searchField}>用户<div className={styles.searchInput}><Search size={16}/><input type="search" placeholder="搜索花名、账号" value={draft.q} onChange={event => setDraft(value => ({ ...value, q: event.target.value }))}/></div></label>
      <button className={styles.primary} type="submit" disabled={busy}>查询</button>
      <div className={styles.presets} aria-label="快捷日期">{[{ days: 7, label: "近 7 天" }, { days: 30, label: "近 30 天" }, { days: 90, label: "近 90 天" }].map(item => <button type="button" key={item.days} onClick={() => preset(item.days)} disabled={busy}>{item.label}</button>)}</div>
    </form>

    {filter.email && <div className={styles.selectedUser}><button className={styles.back} type="button" onClick={() => navigate({ email: "", page: 1 })}><ArrowLeft size={15}/>全部用户</button><span className={styles.avatar}>{(selected?.name || filter.email).slice(0, 1)}</span><strong>{selected?.name || filter.email}</strong>{selected?.name && <span>{filter.email}</span>}{selected?.company && <span className={styles.companyPill}>{selected.company}</span>}<button type="button" className={styles.clear} aria-label="清除用户筛选" onClick={() => navigate({ email: "", page: 1 })}><X size={16}/></button></div>}
    {exportError && <div role="alert" className={styles.error}>{exportError}</div>}
    {error ? <div className={styles.errorState} role="alert"><BarChart3 size={29}/><h2>用量数据暂未载入</h2><p>{error}</p><button className={styles.button} onClick={() => setReload(value => value + 1)}>重新加载</button></div>
      : busy ? <div className={styles.loading} role="status"><Loader2 className={styles.spin} size={24}/><span>正在读取用量数据</span></div>
      : data && <>
        {unavailable.length > 0 && <div role="status" className={styles.coverageAlert}>部分历史来源暂不可用：{unavailable.map(source => source.label).join("、")}</div>}
        <Metrics metrics={data.summary} singleUser={Boolean(filter.email)}/>
        <div className={styles.visualRow}>
          <Trend daily={data.daily}/>
          <section className={styles.breakdown} aria-label="用量构成"><div className={styles.panelTitle}><h2>用量构成</h2><Wallet size={17}/></div>
            <dl className={styles.creditBreakdown}><div><dt>实际消费</dt><dd>{number(data.summary.consumed)}<small>积分</small></dd></div><div><dt>退回积分</dt><dd className={styles.positive}>−{number(data.summary.refunded)}</dd></div><div className={styles.net}><dt>净消耗</dt><dd>{number(data.summary.netCredits)}<small>积分</small></dd></div><div><dt>另计：管理扣减</dt><dd>{number(data.summary.administrativeDebits)}<small>积分</small></dd></div></dl>
            <div className={styles.outputBreakdown}><div><span>上传作品</span><strong>{number(data.summary.uploads)}</strong></div><div><span>导入 / 复制</span><strong>{number(data.summary.imports)}</strong></div><div><span>未归因作品</span><strong>{number(data.summary.unattributedArtworks)}</strong></div><div><span>已删除作品</span><strong>{number(data.summary.deletedArtworks)}</strong></div><div><span>积分 / 生成作品</span><strong>{number(data.summary.creditsPerDelivered)}</strong></div><div><span>模型调用</span><strong>{number(data.summary.modelCalls)}</strong></div></div>
            <div className={styles.tokens}><div><span>输入 Tokens</span><strong>{number(data.summary.inputTokens)}</strong></div><div><span>输出 Tokens</span><strong>{number(data.summary.outputTokens)}</strong></div><span className={styles.tokenCoverage}>完整 Token 记录 {number(data.summary.tokenSamples)} / {number(data.summary.modelCalls)} 次</span></div>
          </section>
        </div>

        <section className={styles.tablePanel} aria-label="用户用量排行"><div className={styles.tableHeader}><div><h2>{filter.email ? "用户明细" : "用户用量排行"}</h2><span>{number(data.total)} 个账号</span></div><label className={styles.sortLabel}>排序<select value={filter.sort} onChange={event => navigate({ sort: event.target.value as UsageSort, page: 1 })}>{sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
          {data.users.length ? <div className={styles.tableScroll}><table><thead><tr><th>用户</th><th>企业</th><th>业务任务</th><th>生成作品</th><th>消费积分</th><th>活跃天数</th><th>活跃日产出</th><th>最近活动</th><th>明细</th></tr></thead><tbody>{data.users.map((user, index) => <tr key={user.email}><td><button className={styles.userButton} type="button" onClick={() => selectUser(user)} aria-label={`查看 ${user.name || user.email} 的用量`}><span className={styles.rank}>{(data.page - 1) * data.size + index + 1}</span><span className={styles.tableAvatar}>{(user.name || user.email).slice(0, 1)}</span><span><strong>{user.name || user.email}</strong><small>{user.email}</small></span></button></td><td>{user.company || "未归属企业"}</td><td className={styles.numeric}>{number(user.tasks)}</td><td className={`${styles.numeric} ${styles.emphasis}`}>{number(user.delivered)}</td><td className={styles.numeric}>{number(user.consumed)}</td><td className={styles.numeric}>{number(user.activeDays)}</td><td className={styles.numeric}>{number(user.deliveriesPerActiveDay)}</td><td className={styles.lastActivity}>{localTime(user.lastActivityAt)}</td><td><div className={styles.rowLinks}><Link prefetch={false} href={drill("operations", user.email)}>任务<ArrowUpRight size={12}/></Link><Link prefetch={false} href={drill("artworks", user.email)}>作品<ArrowUpRight size={12}/></Link>{!enterpriseId && <Link prefetch={false} href={drill("ledger", user.email)}>流水<ArrowUpRight size={12}/></Link>}</div></td></tr>)}</tbody></table></div> : <div className={styles.empty}><Users size={28}/><h3>没有匹配的用户记录</h3><button className={styles.button} type="button" onClick={() => navigate({ q: "", email: "", tenantId: enterpriseId || "", page: 1 })}>清除用户筛选</button></div>}
          <footer className={styles.pagination}><span>第 {data.page} / {Math.max(1, Math.ceil(data.total / data.size))} 页</span><div><button type="button" className={styles.button} disabled={data.page <= 1} onClick={() => navigate({ page: data.page - 1 })}><ChevronLeft size={15}/>上一页</button><button type="button" className={styles.button} disabled={data.page * data.size >= data.total} onClick={() => navigate({ page: data.page + 1 })}>下一页<ChevronRight size={15}/></button></div></footer>
        </section>

        <details className={styles.definitions}><summary>数据口径与历史覆盖<span>{data.coverage.historyFrom ? `本期首条记录 ${data.coverage.historyFrom.slice(0, 10)}` : "本期暂无记录"}</span></summary><div className={styles.definitionContent}><dl>{(enterpriseId || filter.tenantId) && <div><dt>企业统计范围</dt><dd>当前可见成员的历史账号用量；不把当前企业归属当作历史任务提交时的企业归属。</dd></div>}{data.definitions.map(definition => <div key={definition.key}><dt>{definition.label}</dt><dd>{definition.formula}</dd></div>)}</dl><div className={styles.sources}><h3>数据来源</h3>{data.coverage.sources.map(source => <div key={source.key}><span>{source.label}</span><strong>{source.available ? `${number(source.records)} 条` : "未接入"}</strong></div>)}</div>{data.coverage.notes.length > 0 && <ul>{data.coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}</div></details>
      </>}
  </Root>;
  return embedded ? content : <AdminCenterShell active="usage">{content}</AdminCenterShell>;
}

function Metrics({ metrics, singleUser }: { metrics: UsageMetrics; singleUser: boolean }) {
  const perUser = metrics.activeUsers > 0 ? metrics.delivered / metrics.activeUsers : null;
  const items = [
    { title: singleUser ? "活跃天数" : "活跃用户", value: singleUser ? metrics.activeDays : metrics.activeUsers, unit: singleUser ? "天" : "人", icon: Users, color: "violet" },
    { title: "业务任务", value: metrics.tasks, unit: "次", icon: BarChart3, color: "blue" },
    { title: "生成作品", value: metrics.delivered, unit: "份", icon: ImageIcon, color: "green" },
    { title: "实际消费", value: metrics.consumed, unit: "积分", icon: Wallet, color: "amber" },
    { title: "每活跃人日产出", value: metrics.deliveriesPerActiveDay, unit: "份", icon: CalendarDays, color: "violet" },
    { title: "活跃用户人均产出", value: perUser, unit: "份", icon: ImageIcon, color: "blue" },
  ];
  return <section className={styles.metrics} aria-label="用量概览">{items.map(({ title, value, unit, icon: Icon, color }) => <article className={styles.metric} key={title}><div><span>{title}</span><span className={`${styles.metricIcon} ${styles[color]}`}><Icon size={17}/></span></div><strong>{number(value)}{value !== null && <small>{unit}</small>}</strong></article>)}</section>;
}

function Trend({ daily }: { daily: UsageResponse["daily"] }) {
  const [mode, setMode] = useState<"output" | "credits" | "active">("output");
  const chart = useRef<SVGSVGElement>(null), [chartWidth, setChartWidth] = useState(720);
  useEffect(() => {
    if (!chart.current) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect.width || 0);
      if (width > 0) setChartWidth(width);
    });
    observer.observe(chart.current);
    return () => observer.disconnect();
  }, []);
  const titleId = useId();
  const metrics = mode === "output" ? [{ key: "delivered" as const, label: "生成作品", color: "#6c59d9" }, { key: "tasks" as const, label: "业务任务", color: "#49a88f" }] : mode === "credits" ? [{ key: "consumed" as const, label: "消费积分", color: "#6c59d9" }, { key: "refunded" as const, label: "退回积分", color: "#49a88f" }] : [{ key: "activeUsers" as const, label: "活跃用户", color: "#6c59d9" }];
  const maximum = Math.max(1, ...daily.flatMap(day => metrics.map(metric => day[metric.key])));
  const chartMax = Math.max(1, Math.ceil(maximum / 4) * 4), width = chartWidth, height = 220, left = 40, right = 12, top = 20, bottom = 32;
  const x = (index: number) => left + index / Math.max(1, daily.length - 1) * (width - left - right);
  const y = (value: number) => height - bottom - value / chartMax * (height - top - bottom);
  const labelIndexes = Array.from(new Set([0, Math.floor((daily.length - 1) / 3), Math.floor((daily.length - 1) * 2 / 3), daily.length - 1])).filter(index => index >= 0);
  return <section className={styles.trend} aria-label="用量趋势"><div className={styles.panelTitle}><h2>每日趋势</h2><div className={styles.segmented} aria-label="趋势指标">{([{ key: "output", label: "产出" }, { key: "credits", label: "积分" }, { key: "active", label: "活跃" }] as const).map(option => <button key={option.key} type="button" aria-pressed={mode === option.key} onClick={() => setMode(option.key)}>{option.label}</button>)}</div></div><div className={styles.legend}>{metrics.map(metric => <span key={metric.key}><i style={{ background: metric.color }}/>{metric.label}</span>)}</div>
    {daily.length ? <svg ref={chart} className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}><title id={titleId}>{metrics.map(metric => metric.label).join("、")}每日趋势，详细数值可展开下方每日数据</title>{[0, 1, 2, 3, 4].map(step => <g key={step}><line x1={left} x2={width - right} y1={y(chartMax * step / 4)} y2={y(chartMax * step / 4)} stroke="#e9ebf1" strokeDasharray="3 5"/><text x={left - 10} y={y(chartMax * step / 4) + 4} textAnchor="end">{number(chartMax * step / 4)}</text></g>)}{metrics.map(metric => <g key={metric.key}>{daily.length > 1 && <polyline points={daily.map((day, index) => `${x(index)},${y(day[metric.key])}`).join(" ")} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>}{daily.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day[metric.key])} r={daily.length > 40 ? 1.6 : 3.2} fill={metric.color}><title>{day.date} {metric.label}：{number(day[metric.key])}</title></circle>)}</g>)}{labelIndexes.map(index => <text key={index} x={x(index)} y={height - 7} textAnchor={index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}>{daily[index]?.date.slice(5).replace("-", "/")}</text>)}</svg> : <div className={styles.chartEmpty}>当前日期范围暂无趋势记录</div>}
    <details className={styles.dailyDetails}><summary>每日数据</summary><div className={styles.dailyScroll}><table><thead><tr><th>日期</th><th>任务</th><th>生成作品</th><th>上传</th><th>消费</th><th>退回</th><th>活跃用户</th></tr></thead><tbody>{daily.map(day => <tr key={day.date}><td>{day.date}</td><td>{number(day.tasks)}</td><td>{number(day.delivered)}</td><td>{number(day.uploads)}</td><td>{number(day.consumed)}</td><td>{number(day.refunded)}</td><td>{number(day.activeUsers)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
