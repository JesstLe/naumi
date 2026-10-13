"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, ShieldCheck } from "lucide-react";
import { ACCESS_FEATURES, ALL_FEATURE_IDS, type AccessPolicy } from "@/lib/feature-access/catalog";
type UserRow = { email: string; name: string; role: string; banned: boolean; policy: AccessPolicy };
const groups = [...new Set(ACCESS_FEATURES.map(feature => feature.group))];
const button = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export function FeatureAccessManager() {
  const [users, setUsers] = useState<UserRow[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1);
  const [search, setSearch] = useState(""), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null), [mode, setMode] = useState<AccessPolicy["mode"]>("default"), [allowed, setAllowed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const operation = useRef<string | null>(null), lock = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/feature-access?q=${encodeURIComponent(search)}&page=${page}`, { cache: "no-store", signal: abort.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "加载失败");
        if (!abort.signal.aborted) { setUsers(data.users); setTotal(data.total); }
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "加载失败"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [search, page, refresh]);
  function edit() { operation.current = null; setSaved(false); setError(""); }
  function select(user: UserRow) { if (busy) return; edit(); setSelected(user); setMode(user.policy.mode); setAllowed(user.policy.allowed); }
  function toggle(id: string) { edit(); setAllowed(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  async function save() {
    if (!selected || lock.current) return; lock.current = true; setBusy(true); setError(""); setSaved(false);
    operation.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/feature-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: operation.current, email: selected.email, mode, allowed: mode === "default" ? [] : allowed, expectedVersion: selected.policy.version }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "保存未确认，请重试");
      const next = { ...selected, policy: data.policy as AccessPolicy };
      setSelected(next); setUsers(current => current.map(user => user.email === next.email ? next : user));
      setAllowed(next.policy.allowed); operation.current = null; setSaved(true);
      window.dispatchEvent(new Event("naumi:feature-access-changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "保存未确认，请重试"); }
    finally { setBusy(false); lock.current = false; }
  }
  return <div className="mx-auto max-w-6xl space-y-6 p-5 text-slate-800 sm:p-8">
    <header className="flex items-center gap-3"><span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><ShieldCheck size={24} /></span><h1 className="text-2xl font-semibold tracking-tight">用户功能权限</h1></header>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}<button className={button} disabled={busy} onClick={() => {setSelected(null);setError("");setRefresh(value => value + 1);}}>刷新权限</button></div>}
    <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative border-b border-slate-100 p-4"><Search size={16} className="absolute left-7 top-7 text-slate-400" /><input aria-label="搜索用户" value={search} disabled={busy} onChange={event => {setSearch(event.target.value);setPage(1);}} placeholder="搜索姓名或邮箱" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div>
        <div className="max-h-[560px] overflow-y-auto p-2" aria-busy={loading}>{loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-slate-400" /></div> : !users.length ? <p className="p-8 text-center text-sm text-slate-500">未找到用户</p> : users.map(user => <button key={user.email} disabled={busy} onClick={() => select(user)} aria-pressed={selected?.email === user.email} className={`mb-1 w-full rounded-xl p-3 text-left transition-colors ${selected?.email === user.email ? "bg-indigo-50 ring-1 ring-inset ring-indigo-100" : "hover:bg-slate-50"}`}><span className="block truncate text-sm font-medium">{user.name || user.email}</span><span className="mt-1 block truncate text-xs text-slate-500">{user.email}</span><span className="mt-2 block text-xs text-slate-500">{user.policy.mode === "default" ? "默认权限" : `${user.policy.allowed.length} 项功能`}{user.banned ? " · 已封禁" : ""}</span></button>)}</div>
        <div className="flex items-center justify-between border-t p-3 text-xs text-slate-500"><span>共 {total} 人</span><div className="flex items-center gap-2"><button aria-label="上一页" className="rounded-lg border p-1.5 disabled:opacity-30" disabled={busy || loading || page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>{page}<button aria-label="下一页" className="rounded-lg border p-1.5 disabled:opacity-30" disabled={busy || loading || page * 30 >= total} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div>
      </aside>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">{!selected ? <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">选择用户配置权限</div> : <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.name || selected.email}</h2><p className="mt-1 text-sm text-slate-500">{selected.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{mode === "default" ? ALL_FEATURE_IDS.length : allowed.length} / {ALL_FEATURE_IDS.length} 项</span></div>
        <fieldset disabled={busy} className="space-y-5">
          <div className="flex flex-wrap gap-2">{(["default", "custom"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => {edit();setMode(value);}} className={`${button} ${mode === value ? "!border-indigo-200 !bg-indigo-50 !text-indigo-700" : ""}`}>{value === "default" ? "默认全部开放" : "自定义权限"}</button>)}</div>
          {mode === "custom" && <div className="flex gap-4 text-sm"><button type="button" onClick={() => {edit();setAllowed([...ALL_FEATURE_IDS]);}} className="font-medium text-indigo-600">全选</button><button type="button" onClick={() => {edit();setAllowed([]);}} className="text-slate-500">清空</button></div>}
          {groups.map(group => <fieldset key={group} disabled={mode === "default" || busy} className="rounded-xl border border-slate-100 p-4"><legend className="px-1 text-xs font-semibold text-slate-500">{group}</legend><div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{ACCESS_FEATURES.filter(feature => feature.group === group).map(feature => <label key={feature.id} className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" checked={mode === "default" || allowed.includes(feature.id)} onChange={() => toggle(feature.id)} className="h-4 w-4 rounded border-slate-300 accent-indigo-600" /><span>{feature.label}</span></label>)}</div></fieldset>)}
        </fieldset>
        <footer className="mt-6 flex items-center justify-between gap-3 border-t pt-5"><span role="status" className="flex items-center gap-1 text-sm text-emerald-600">{saved && <><Check size={16} />已保存</>}</span><button className={`${button} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-700`} disabled={busy} onClick={() => void save()}>{busy && <Loader2 size={16} className="animate-spin" />}保存权限</button></footer>
      </>}</section>
    </div>
  </div>;
}
