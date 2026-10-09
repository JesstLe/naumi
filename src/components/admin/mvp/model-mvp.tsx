"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, CircleHelp, Database, ImageIcon, Loader2, Plus, RefreshCw, Search, Unplug, X } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type { MvpState, MvpRow } from "@/lib/model-config/mvp";
import type { CatalogEntry } from "@/lib/model-config/catalog-store";
import { encryptCredential } from "../model-config/provider-editor";
import styles from "./model-mvp.module.css";

type State = MvpState & { catalogs: CatalogEntry[] };
type Operation = Record<string, unknown> & { action: string; id: string; expectedVersion: number };
const endpoint = "/api/admin/mvp", pendingKey = "naumi:admin:mvp:pending";
const types: Record<string, string> = { image: "图片", text: "文字", video: "视频" };
const protocols = [
  ["openai-images", "OpenAI 图片", "https://api.example.com/v1"],
  ["new-api-flow", "New API 图片", "https://api.example.com/v1"],
  ["apimart-images", "APIMart 图片", "https://api.apimart.ai"],
  ["openai-chat", "OpenAI 文字", "https://api.example.com/v1"],
  ["openai-videos", "OpenAI 视频", "https://api.example.com/v1"],
];
async function api(body?: unknown) {
  const response = await fetch(endpoint, { method: body ? "POST" : "GET", cache: "no-store", headers: { ...await authHeader(), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || (data.publication?.phase === "failed" ? "发布失败，请在完整配置中心查看记录" : "读取失败，请重试")), { ...data });
  return data;
}
function Dialog({ title, children, onClose, locked = false }: { title: string; children: React.ReactNode; onClose: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="mvp-dialog-title" onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className={styles.dialogHeader}><h2 id="mvp-dialog-title">{title}</h2><button aria-label="关闭" disabled={locked} onClick={onClose}><X size={20} /></button></header>{children}
  </dialog>;
}
function useArray(initial: string[] = []) {
  const [items, setItems] = useState(initial);
  return [items, (value: string) => setItems(old => old.includes(value) ? old.filter(v => v !== value) : [...old, value])] as const;
}

export function ModelMvp() {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [pending, setPending] = useState<Operation | null>(null);
  const [tab, setTab] = useState("models"), [filter, setFilter] = useState("all"), [search, setSearch] = useState("");
  const [row, setRow] = useState<MvpRow | null>(null), [connect, setConnect] = useState(false);
  const [rename, setRename] = useState<MvpRow | null>(null);
  const [register, setRegister] = useState<{ providerId: string; model: string } | null>(null), [refreshing, setRefreshing] = useState<string[]>([]);
  const mounted = useRef(true), loadingGuard = useRef(false), mutationGuard = useRef(false);
  const directoryInFlight = useRef(new Set<string>());
  const refreshProvider = useCallback(async (providerId: string, force = true) => {
    if (directoryInFlight.current.has(providerId)) return;
    directoryInFlight.current.add(providerId);
    setRefreshing(old => [...old, providerId]);
    try {
      let catalog: CatalogEntry = await api({ action: "discover", providerId, force });
      // Another page/request may own the discovery lock. Wait for its cached
      // result instead of presenting its temporary empty response as final.
      for (let attempt = 0; catalog.refreshing && attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!mounted.current) return;
        catalog = await api({ action: "discover", providerId, force: false });
      }
      if (mounted.current) setState(old => old ? { ...old, catalogs: [...old.catalogs.filter(p => p.providerId !== providerId), catalog] } : old);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "目录查询失败"); }
    finally { directoryInFlight.current.delete(providerId); if (mounted.current) setRefreshing(old => old.filter(id => id !== providerId)); }
  }, []);
  const load = useCallback(async (discover = false) => {
    if (loadingGuard.current) return;
    loadingGuard.current = true; setLoading(true);
    let discoverProviders: State["providers"] = [];
    try {
      const data: State = await api();
      if (!mounted.current) return;
      setState(data);
      if (discover) discoverProviders = data.providers.filter(p => p.enabled && p.configured && (!data.catalogs.find(c => c.providerId === p.id) || data.catalogs.find(c => c.providerId === p.id)!.stale));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "读取失败"); }
    finally { loadingGuard.current = false; if (mounted.current) setLoading(false); }
    // Directory discovery can take much longer than the active configuration
    // read. It must not suppress the fresh read after a successful publication.
    void (async () => { for (const p of discoverProviders) if (mounted.current) await refreshProvider(p.id, false); })();
  }, [refreshProvider]);
  useEffect(() => {
    mounted.current = true;
    try { const saved = sessionStorage.getItem(pendingKey); if (saved) setPending(JSON.parse(saved)); } catch {}
    void load(true);
    return () => { mounted.current = false; };
  }, [load]);
  const clearPending = () => { setPending(null); try { sessionStorage.removeItem(pendingKey); } catch {} };
  async function run(operation: Operation) {
    if (mutationGuard.current) return;
    mutationGuard.current = true; setBusy(true); setError(""); setNotice(""); setPending(operation);
    setRow(null); setRename(null); setConnect(false); setRegister(null);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(operation)); } catch {}
    try {
      const result = await api(operation);
      if (result.publication.phase !== "applied") { setNotice("发布结果待核对。请点击“核对并继续”，系统会沿用同一操作，不重复创建发布。"); return; }
      clearPending(); setRow(null); setConnect(false); setRegister(null);
      setNotice(operation.action === "rename" ? "显示名称已更新，前端刷新模型列表后生效。" : operation.action === "switch" ? "实际模型已切换。新请求使用新配置，已经开始的任务保留原模型。" : operation.action === "connect" ? "上游已接入，正在自动发现模型 ID。" : "模型已添加到可切换列表。");
      await load(true);
    } catch (e) {
      const failure = e as Error & { operationNotStaged?: boolean; publication?: { phase: string } };
      if (failure.operationNotStaged || failure.publication?.phase === "failed") clearPending();
      setError(failure.message || "操作失败，请重试");
    } finally { setBusy(false); mutationGuard.current = false; }
  }
  function operation(action: string, fields: Record<string, unknown>): Operation {
    return { ...fields, action, id: browserRandomUUID(), expectedVersion: state!.version };
  }
  const rows = state?.rows.filter(r => (filter === "all" || r.modality === filter) && `${r.label} ${r.alias} ${r.routes.map(x => `${x.model} ${x.provider}`).join(" ")} ${r.features.map(f => f.label).join(" ")}`.toLowerCase().includes(search.toLowerCase())) || [];
  const locked = busy || !!pending;
  return <main className={styles.page}>
    <div className={styles.topline}><span className={styles.miniBrand}><span className={styles.brandMark}>N</span>Naumi <span>模型工作台</span></span><Link href="/admin/bi/models">完整配置中心 <ChevronRight size={14} /></Link></div>
    <header className={styles.hero}><div><h1>把模型连接，变简单。</h1><p>从用户看到的名字，到真正执行的模型。<br />在这里看清每条连接，也能直接更换它。</p></div><button className={styles.primary} onClick={() => { setTab("sources"); setConnect(true); }} disabled={!state || locked}><Plus size={17} />接入上游</button></header>
    <div className={styles.flow} aria-label="模型连接路径"><span><ImageIcon size={19} /><b>前端名称</b><small>用户看到的名称 / 别名</small></span><ArrowRight size={19} /><span><Database size={19} /><b>实际模型</b><small>请求中真正使用的模型 ID</small></span><ArrowRight size={19} /><span><Unplug size={19} /><b>上游来源</b><small>模型从哪个接口提供</small></span></div>
    <div className={styles.tabs}><div role="tablist" aria-label="MVP 模型管理"><button role="tab" id="models-tab" aria-selected={tab === "models"} aria-controls="models-panel" onClick={() => setTab("models")}>模型映射 <span>{state?.rows.length ?? "—"}</span></button><button role="tab" id="sources-tab" aria-selected={tab === "sources"} aria-controls="sources-panel" onClick={() => setTab("sources")}>上游来源 <span>{state?.providers.length ?? "—"}</span></button></div><span className={styles.version}>{state ? `生效版本 v${state.version}` : "正在读取生效配置"}<button aria-label="刷新生效配置" disabled={loading || locked} onClick={() => { setError(""); void load(true); }}><RefreshCw size={15} className={loading ? styles.spin : ""} /></button></span></div>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {pending && <div className={styles.pending}><span>有一项发布结果需要核对，已保留操作编号。</span><button className={styles.primary} disabled={busy} onClick={() => void run(pending)}>{busy && <Loader2 size={16} className={styles.spin} />}核对并继续</button></div>}
    {state && !state.managed && <div className={styles.error}>当前实例未启用统一模型配置，下面是注册表中的模型。用户侧仍使用旧配置；请先在完整配置中心完成接入。</div>}
    {!state && loading ? <div className={styles.empty}><Loader2 className={styles.spin} />正在读取前端模型与真实路由…</div> : !state ? <div className={styles.empty}><Unplug /><h2>模型配置暂时无法读取</h2><p>检查数据库和 Router 管理连接后重试。</p><button className={styles.secondary} onClick={() => void load(true)}>重新读取</button></div> : tab === "models" ? <section id="models-panel" role="tabpanel" aria-labelledby="models-tab">
      <div className={styles.toolbar}><div className={styles.filters} aria-label="模型类型">{[["all", "全部"], ["image", "图片"], ["text", "文字"], ["video", "视频"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label className={styles.search}><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称、模型 ID 或功能" aria-label="搜索模型" /></label></div>
      <div className={styles.mapping}><div className={styles.tableHead}><span>前端名称</span><span>实际调用模型 / 上游来源</span><span>操作</span></div>{rows.map(r => <article className={styles.modelRow} key={r.id}>
        <div className={styles.modelName}><span className={styles.modality}>{types[r.modality]}</span><h2>{r.label}</h2>{r.alias !== r.label && <p>配置别名：{r.alias}</p>}<div className={styles.featureTags}>{r.features.map(f => <span key={f.id}>{f.label}</span>)}</div></div>
        <div className={styles.routes}>{r.routes.map((route, index) => <div key={`${route.upstreamId}-${route.kind}`} className={styles.route}><span className={styles.routeDot} data-enabled={route.enabled} /><div><code>{route.model}</code><p>{route.provider}<span>{r.conditional || r.preset || r.publicIds.length > 1 ? route.kind : "已配置"}</span></p></div></div>)}{r.conditional && <p className={styles.ruleNote}>具体调用由条件或回退规则决定</p>}</div>
        <div className={styles.rowActions}><button className={styles.switchButton} disabled={locked || !state.managed} onClick={() => setRename(r)}>修改显示名称</button><button className={styles.switchButton} disabled={locked || !state.managed} onClick={() => setRow(r)}>更换模型 <ChevronRight size={15} /></button></div>
      </article>)}</div>
      {!rows.length && <div className={styles.empty}><Search /><h2>{state.rows.length ? "没有匹配的模型" : "前端暂无可见模型"}</h2><p>{state.rows.length ? "尝试其他名称、功能或类型。" : "这里只显示前端当前已启用、可展示的模型。"}</p></div>}
      <p className={styles.footerNote}><CircleHelp size={15} />同一前端模型用于多个功能时，更换会对这些功能一起生效。个人自带密钥的模型不在此管理。</p>
    </section> : <section id="sources-panel" role="tabpanel" aria-labelledby="sources-tab"><div className={styles.sourceIntro}><div><h2>让模型有来源。</h2><p>接入上游 URL 和凭据，自动读取模型目录。再将已确认能力的模型加入可切换列表。</p></div><button className={styles.secondary} disabled={locked} onClick={() => setConnect(true)}><Plus size={16} />新增来源</button></div><div className={styles.sources}>{state.providers.map(p => {
      const catalog = state.catalogs.find(c => c.providerId === p.id), refreshingNow = refreshing.includes(p.id);
      return <Source key={p.id} provider={p} catalog={catalog} refreshing={refreshingNow} locked={locked} candidates={state.candidates} onRefresh={() => void refreshProvider(p.id)} onRegister={model => setRegister({ providerId: p.id, model })} />;
    })}</div>{!state.providers.length && <div className={styles.empty}><Unplug /><h2>接入第一个上游来源</h2><p>输入接口地址与 API Key，系统会自动发现模型 ID。</p></div>}</section>}
    {row && state && <SwitchDialog row={row} state={state} locked={locked} busy={busy} onClose={() => setRow(null)} onSave={upstreamId => void run(operation("switch", { rowId: row.id, upstreamId }))} />}
    {rename && <RenameDialog row={rename} locked={locked} onClose={() => setRename(null)} onSave={label => void run(operation("rename", { rowId: rename.id, label }))} />}
    {connect && state && <ConnectDialog locked={locked} onClose={() => setConnect(false)} onSave={(fields, id) => run({ ...operation("connect", fields), id })} />}
    {register && state && <RegisterDialog model={register.model} protocol={state.providers.find(p => p.id === register.providerId)!.protocol} locked={locked} onClose={() => setRegister(null)} onSave={fields => void run(operation("register", { ...register, ...fields }))} />}
  </main>;
}

function Source({ provider: p, catalog, candidates, refreshing, locked, onRefresh, onRegister }: { provider: State["providers"][number]; catalog?: CatalogEntry; candidates: State["candidates"]; refreshing: boolean; locked: boolean; onRefresh: () => void; onRegister: (model: string) => void }) {
  const [search, setSearch] = useState(""), [expanded, setExpanded] = useState(false);
  const models = catalog?.models.filter(m => `${m.id} ${m.label}`.toLowerCase().includes(search.toLowerCase())) || [];
  const statuses: Record<string, string> = { ok: "目录已连接", empty: "目录为空", unsupported: "无标准目录接口", "no-credential": "缺少凭据", error: "目录不可用" };
  return <article className={styles.source}><header><span className={styles.sourceIcon}><Unplug size={20} /></span><div><h3>{p.name}<span className={styles.sourceState}>{!p.enabled ? "已停用" : refreshing ? "正在发现模型" : catalog?.cached || catalog?.fetchedAt ? statuses[catalog!.status] : "等待发现"}</span></h3><p>{p.baseUrl}</p></div><button className={styles.iconButton} aria-label={`刷新 ${p.name} 模型目录`} disabled={locked || refreshing} onClick={onRefresh}><RefreshCw size={17} className={refreshing ? styles.spin : ""} /></button></header><div className={styles.sourceMeta}><span>{p.protocol}</span><span>{p.configured ? "凭据已保存" : "未配置凭据"}</span><span>{catalog?.models.length || 0} 个目录模型</span></div>
    {catalog?.error && <p className={styles.catalogError}>{catalog.error}。{catalog.models.length > 0 && "以下保留上次目录，不代表当前可访问。"}</p>}
    {catalog?.truncated && <p className={styles.catalogError}>目录仅展示前 600 个模型，可能仍有未加载的模型。</p>}
    {catalog?.fetchedAt && <p className={styles.timestamp}>最近查询：{new Date(catalog.fetchedAt).toLocaleString("zh-CN")}{catalog.stale ? "（需要刷新）" : ""}</p>}
    <button className={styles.catalogToggle} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起模型目录" : "查看模型目录"}<ChevronRight size={16} /></button>
    {expanded && <div className={styles.catalog}><label className={styles.search}><Search size={15} /><input aria-label={`${p.name} 搜索模型 ID`} placeholder="搜索模型 ID" value={search} onChange={e => setSearch(e.target.value)} /></label><p className={styles.ruleNote}>目录可访问不等于能力已验证；只有已接入并确认能力的模型可以切换。</p><div className={styles.catalogList}>{models.map(m => { const configured = candidates.some(c => c.providerId === p.id && c.model === m.id); return <div key={m.id}><code>{m.id}</code>{configured ? <span className={styles.added}><Check size={13} />已接入</span> : <button disabled={locked || refreshing || catalog?.status !== "ok" || catalog.stale || !p.enabled} onClick={() => onRegister(m.id)}>添加模型 <Plus size={13} /></button>}</div>; })}</div>{!models.length && <p className={styles.ruleNote}>没有匹配模型。可刷新目录，或在完整配置中心检查接口协议。</p>}</div>}
  </article>;
}

function SwitchDialog({ row, state, locked, busy, onClose, onSave }: { row: MvpRow; state: State; locked: boolean; busy: boolean; onClose: () => void; onSave: (id: string) => void }) {
  const [selected, setSelected] = useState(""), [search, setSearch] = useState("");
  const candidates = state.candidates.filter(c => row.candidateIds.includes(c.id) && `${c.model} ${c.provider}`.toLowerCase().includes(search.toLowerCase()));
  return <Dialog title="更换实际模型" onClose={onClose} locked={locked}><div className={styles.dialogBody}><div className={styles.currentConnection}><span>前端名称<b>{row.label}</b></span><ArrowRight size={18} /><span>当前实际模型<b>{Array.from(new Set(row.routes.map(r => r.model))).join(" / ")}</b></span></div><p className={styles.ruleNote}>名称保持不变。影响：{row.features.map(f => f.label).join("、")}。{row.publicIds.length > 1 && "该家族的所有比例分支会一起切换。"}{row.conditional && "更换后将改为固定调用，原条件路由和失败回退会关闭。"}</p>
    {row.preset && <div className={styles.notice}>此模型使用专用能力与定价预设。更换到不同实际模型前，需要在<Link href="/admin/bi/models">完整配置中心</Link>核验新模型的参数和采购价格。</div>}
    <label className={styles.search}><Search size={16} /><input aria-label="搜索可切换模型" placeholder="搜索模型 ID 或上游来源" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <fieldset className={styles.candidateList} disabled={locked}><legend>选择兼容的实际模型</legend>{candidates.map(c => <label key={c.id} className={styles.candidate} data-selected={selected === c.id}><input type="radio" name="actual-model" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} /><span><code>{c.model}</code><small>{c.provider}{row.routes.some(r => r.upstreamId === c.id) ? " · 当前路径" : c.verified ? " · 能力已确认" : " · 已接入，能力未核验"}</small></span>{selected === c.id && <Check size={17} />}</label>)}</fieldset>
    {!candidates.length && <p className={styles.ruleNote}>暂无兼容模型。先在上游来源中添加模型并确认能力；当前已展示的输入和规格必须得到支持。</p>}
    <p className={styles.ruleNote}>兼容筛选使用现有能力记录；旧接入能力未核验时会明确标注。此处不会自动发送付费生成请求。</p>
  </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={!selected || locked} onClick={() => onSave(selected)}>{busy && <Loader2 size={16} className={styles.spin} />}切换并生效</button></footer></Dialog>;
}

function RenameDialog({ row, locked, onClose, onSave }: { row: MvpRow; locked: boolean; onClose: () => void; onSave: (label: string) => void }) {
  const [label, setLabel] = useState(row.label);
  return <Dialog title="修改前端显示名称" onClose={onClose} locked={locked}><form onSubmit={e => { e.preventDefault(); if (label.trim()) onSave(label.trim()); }}><div className={styles.dialogBody}><p className={styles.ruleNote}>此名称将用于前端模型选项。实际调用模型、模型 ID、价格和用途保持原配置。{row.publicIds.length > 1 && "该模型家族的所有比例分支会统一使用新名称。"}</p><label className={styles.field}>显示名称<input aria-label="显示名称" autoFocus required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} disabled={locked} /><small>{label.length} / 100</small></label><p className={styles.ruleNote}>影响：{row.features.map(f => f.label).join("、")}</p></div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={locked || !label.trim() || label.trim() === row.label}>保存并生效</button></footer></form></Dialog>;
}

function ConnectDialog({ locked, onClose, onSave }: { locked: boolean; onClose: () => void; onSave: (fields: Record<string, unknown>, id: string) => Promise<void> }) {
  const [name, setName] = useState(""), [baseUrl, setBaseUrl] = useState(""), [protocol, setProtocol] = useState("openai-images"), [key, setKey] = useState(""), [encrypting, setEncrypting] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setEncrypting(true); setError("");
    try {
      const id = browserRandomUUID(), secure = !!crypto.subtle;
      const credential = await api({ action: "credential", providerId: `mvp-${id}`, ...(secure ? { ciphertext: await encryptCredential(key) } : { keyPlain: key }) });
      setKey(""); await onSave({ name, baseUrl, protocol, credentialRef: credential.id }, id);
    } catch (e) { setError(e instanceof Error ? e.message : "凭据保存失败"); } finally { setEncrypting(false); }
  }
  return <Dialog title="接入上游来源" onClose={onClose} locked={locked || encrypting}><form onSubmit={submit}><fieldset className={styles.dialogBody} disabled={locked || encrypting}><p className={styles.ruleNote}>保存后自动查询该地址的模型目录。API Key 加密保存，仅在服务端使用。</p><label className={styles.field}>来源名称<input required maxLength={100} placeholder="例如：我们的图片供应商" value={name} onChange={e => setName(e.target.value)} /></label><label className={styles.field}>接口协议<select value={protocol} onChange={e => setProtocol(e.target.value)}>{protocols.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className={styles.field}>上游 URL<input type="url" required placeholder={protocols.find(p => p[0] === protocol)![2]} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /><small>{protocol === "apimart-images" ? "填写服务根地址，目录使用 /v1/models。" : "填写 API 基地址，通常包含 /v1；目录查询会追加 /models。"}</small></label><label className={styles.field}>API Key<input type="password" required autoComplete="new-password" placeholder="输入上游访问凭据" value={key} onChange={e => setKey(e.target.value)} /></label>{error && <p role="alert" className={styles.error}>{error}</p>}</fieldset><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked || encrypting} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={locked || encrypting}>{(locked || encrypting) && <Loader2 size={16} className={styles.spin} />}保存并发现模型</button></footer></form></Dialog>;
}

function RegisterDialog({ model, protocol, locked, onClose, onSave }: { model: string; protocol: string; locked: boolean; onClose: () => void; onSave: (fields: Record<string, unknown>) => void }) {
  const image = ["openai-images", "apimart-images", "new-api-flow"].includes(protocol), text = protocol === "openai-chat";
  const [edit, setEdit] = useState(false), [vision, setVision] = useState(false), [confirmed, setConfirmed] = useState(false), [references, setReferences] = useState(0);
  const [qualityRank, setQualityRank] = useState(2);
  const [qualities, toggleQuality] = useArray(), [resolutions, toggleResolution] = useArray();
  return <Dialog title="添加实际模型" onClose={onClose} locked={locked}><div className={styles.dialogBody}><div className={styles.actualModel}><code>{model}</code><span>来自上游模型目录</span></div><p className={styles.ruleNote}>目录仅提供模型 ID。请按供应商文档或已有测试结果确认能力，系统不会从名称猜测能力或成本。</p><fieldset className={styles.capabilities} disabled={locked}>{image && <><label><input type="checkbox" checked={edit} onChange={e => setEdit(e.target.checked)} />支持图片编辑 / 参考图输入</label><label className={styles.field}>可用于的质量档<select value={qualityRank} onChange={e => setQualityRank(Number(e.target.value))}>{[[1,"仅草稿"],[2,"标准"],[3,"高质量"],[4,"精细"],[5,"最高"]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><p>支持的质量参数（不支持可留空）</p><div>{["low", "medium", "high", "xhigh", "max", "auto"].map(q => <label key={q}><input type="checkbox" checked={qualities.includes(q)} onChange={() => toggleQuality(q)} />{q}</label>)}</div><p>已确认的原生尺寸</p><div>{["1K", "2K", "4K"].map(r => <label key={r}><input type="checkbox" checked={resolutions.includes(r)} onChange={() => toggleResolution(r)} />{r}</label>)}</div></>}{text && <label><input type="checkbox" checked={vision} onChange={e => setVision(e.target.checked)} />支持图片理解</label>}{(image || text) && <label className={styles.field}>最大参考图数量<input type="number" min={0} max={32} value={references} onChange={e => setReferences(Number(e.target.value))} /></label>}<label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已确认该模型支持{image ? "图片生成" : text ? "文字生成" : "视频生成"}及上述能力，并可使用当前协议调用。</label></fieldset><p className={styles.ruleNote}>添加不会改变前端名称或当前路由。需要蒙版、保留主体等高级能力时，请使用完整配置中心。</p></div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={locked || !confirmed} onClick={() => onSave({ confirmed: true, edit, vision, qualityRank, qualities, resolutions, maxReferenceImages: references })}>添加到可切换列表</button></footer></Dialog>;
}
