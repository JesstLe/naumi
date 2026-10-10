"use client";
import {imageModelDisplayId} from "@/lib/image-model-routing";
import {type ChannelPolicy,CHANNEL_PROTOCOLS} from "@/lib/model-config/channel-policy";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ArrowDown, Check, ChevronRight, CircleHelp, Database, ImageIcon, Loader2, Plus, RefreshCw, Search, Unplug, X } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type { ModelManagementState, ManagedModelRow } from "@/lib/model-config/management";
import type { CatalogEntry } from "@/lib/model-config/catalog-store";
import { encryptCredential } from "../model-config/provider-editor";
import styles from "./model-management.module.css";
import type {ManagedModelCreditPricing} from "@/lib/model-config/credit-overrides";
import {DISPLAY_QUALITY_IDS,DEFAULT_QUALITY_LABELS} from "@/lib/model-config/quality-policy";
import {RESOLUTION_FIELDS,RATIO_FIELDS,type ResolutionParameters} from "@/lib/model-config/resolution-policy";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";

type State = ModelManagementState & { catalogs: CatalogEntry[] };
type Operation = Record<string, unknown> & { action: string; id: string; expectedVersion: number };
// Keep the stored pending key so pre-rename ambiguous operations can be reconciled.
const endpoint = "/api/admin/model-management", pendingKey = "naumi:admin:mvp:pending";
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
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="model-management-dialog-title" onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className={styles.dialogHeader}><h2 id="model-management-dialog-title">{title}</h2><button aria-label="关闭" disabled={locked} onClick={onClose}><X size={20} /></button></header>{children}
  </dialog>;
}
function useArray(initial: string[] = []) {
  const [items, setItems] = useState(initial);
  return [items, (value: string) => setItems(old => old.includes(value) ? old.filter(v => v !== value) : [...old, value])] as const;
}

export function ModelManagement() {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [pending, setPending] = useState<Operation | null>(null);
  const [tab, setTab] = useState("models"), [filter, setFilter] = useState("all"), [search, setSearch] = useState("");
  const [row, setRow] = useState<ManagedModelRow | null>(null), [connect, setConnect] = useState(false);
  const [switchProvider, setSwitchProvider] = useState("");
  const [rename, setRename] = useState<ManagedModelRow | null>(null);
  const [sorting,setSorting]=useState(false);
  const [scope,setScope]=useState<ManagedModelRow|null>(null);
  const [channelRow,setChannelRow]=useState<ManagedModelRow|null>(null);
  const [channelDraft,setChannelDraft]=useState<ChannelPolicy|null>(null);
  const [resolutionRow,setResolutionRow]=useState<ManagedModelRow|null>(null);
  const [parameters,setParameters]=useState<ManagedModelRow|null>(null);
  const [price,setPrice]=useState<ManagedModelRow|null>(null);
  const [register, setRegister] = useState<{ providerId: string; model: string; returnRowId?: string; returnChannelRowId?:string } | null>(null), [refreshing, setRefreshing] = useState<string[]>([]);
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
    let loaded: State | null = null;
    try {
      const data: State = await api();
      if (!mounted.current) return;
      setState(data);
      loaded = data;
      if (discover) discoverProviders = data.providers.filter(p => p.enabled && p.configured && (!data.catalogs.find(c => c.providerId === p.id) || data.catalogs.find(c => c.providerId === p.id)!.stale));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "读取失败"); }
    finally { loadingGuard.current = false; if (mounted.current) setLoading(false); }
    // Directory discovery can take much longer than the active configuration
    // read. It must not suppress the fresh read after a successful publication.
    void (async () => { for (const p of discoverProviders) if (mounted.current) await refreshProvider(p.id, false); })();
    return loaded;
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
    const returnRowId = operation.action === "register" ? register?.returnRowId : undefined;
    const returnChannelRowId = operation.action === "register" ? register?.returnChannelRowId : undefined;
    mutationGuard.current = true; setBusy(true); setError(""); setNotice(""); setPending(operation);
    setRow(null); setRename(null); setConnect(false); setRegister(null);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(operation)); } catch {}
    try {
      const result = await api(operation);
      if (result.publication.phase !== "applied") { setScope(null);setPrice(null);setParameters(null);setResolutionRow(null);setChannelRow(null);setSorting(false); setNotice("发布结果待核对。请点击“核对并继续”，系统会沿用同一操作，不重复创建发布。"); return; }
      clearPending(); setRow(null); setScope(null);setPrice(null);setParameters(null);setResolutionRow(null);setChannelRow(null);setSorting(false); setConnect(false); setRegister(null);
      if(["pricing","parameters","resolutions","channels","order","scope","switch","rename"].includes(operation.action))window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));
      setNotice(operation.action === "channels" ? "供应通道已生效，新任务使用新策略，已接受任务保留原配置。" : operation.action === "resolutions" ? "分辨率显示与供应通道映射已生效。新任务使用新配置，已接受任务保留原参数。" : operation.action === "order" ? "模型排序已生效，前端各工具按此顺序展示可用模型。" : operation.action === "parameters" ? "显示档位与上游映射已生效。新请求使用新参数，已接受的任务保留原映射。" : operation.action === "pricing" ? "积分售价已生效。前端报价与实际扣费使用同一配置，已开始的任务保留原报价。" : operation.action === "scope" ? "工具范围已生效。新请求使用新范围，已经开始的任务保留原配置。" : operation.action === "rename" ? "显示名称已更新，前端刷新模型列表后生效。" : operation.action === "switch" ? "实际模型已切换。新请求使用新配置，已经开始的任务保留原模型。" : operation.action === "connect" ? "上游已接入，正在自动发现模型 ID。" : "模型已添加到可切换列表。");
      const refreshed = await load(true);
      if(returnRowId && refreshed) setRow(refreshed.rows.find(r=>r.id===returnRowId) || null);
      if(returnChannelRowId && refreshed) setChannelRow(refreshed.rows.find(r=>r.id===returnChannelRowId) || null);
    } catch (e) {
      const failure = e as Error & { code?:string; operationNotStaged?: boolean; publication?: { phase: string } };
      if (failure.operationNotStaged || failure.publication?.phase === "failed") clearPending();
      else {setScope(null);setPrice(null);setParameters(null);setResolutionRow(null);setChannelRow(null);setSorting(false);}
      setError(failure.message || "操作失败，请重试");
      if(failure.code==="METADATA_CHANGED")await load(false);
    } finally { setBusy(false); mutationGuard.current = false; }
  }
  function operation(action: string, fields: Record<string, unknown>): Operation {
    return { ...fields, action, id: browserRandomUUID(), expectedVersion: state!.version,...(action==="pricing"?{expectedBillingVersion:state!.billingVersion}:{}) };
  }
  const rows = state?.rows.filter(r => (filter === "all" || r.modality === filter) && `${r.label} ${r.alias} ${r.routes.map(x => `${x.model} ${x.provider}`).join(" ")} ${r.features.map(f => f.label).join(" ")}`.toLowerCase().includes(search.toLowerCase())) || [];
  const locked = busy || !!pending;
  return <main className={styles.page}>
    <div className={styles.topline}><span className={styles.miniBrand}><span className={styles.brandMark}>N</span>Naumi <span>模型工作台</span></span><div className={styles.libraryLinks}><Link href="/admin/model-management/library">元数据与成本库 <Database size={14}/></Link><Link href="/admin/bi/models">完整配置中心 <ChevronRight size={14} /></Link></div></div>
    <header className={styles.hero}><div><h1>把模型连接，变简单。</h1><p>从用户看到的名字，到真正执行的模型。<br />在这里看清每条连接，也能直接更换它。</p></div><button className={styles.primary} onClick={() => { setTab("sources"); setConnect(true); }} disabled={!state || locked}><Plus size={17} />接入上游</button></header>
    <div className={styles.flow} aria-label="模型连接路径"><span><ImageIcon size={19} /><b>前端名称</b><small>用户看到的名称 / 别名</small></span><ArrowRight size={19} /><span><Database size={19} /><b>实际模型</b><small>请求中真正使用的模型 ID</small></span><ArrowRight size={19} /><span><Unplug size={19} /><b>上游来源</b><small>模型从哪个接口提供</small></span></div>
    <div className={styles.tabs}><div role="tablist" aria-label="模型管理"><button role="tab" id="models-tab" aria-selected={tab === "models"} aria-controls="models-panel" onClick={() => setTab("models")}>模型映射 <span>{state?.rows.length ?? "—"}</span></button><button role="tab" id="sources-tab" aria-selected={tab === "sources"} aria-controls="sources-panel" onClick={() => setTab("sources")}>上游来源 <span>{state?.providers.length ?? "—"}</span></button></div><span className={styles.version}>{state ? `模型配置 v${state.version}` : "正在读取生效配置"}<button aria-label="刷新生效配置" disabled={loading || locked} onClick={() => { setError(""); void load(true); }}><RefreshCw size={15} className={loading ? styles.spin : ""} /></button></span></div>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {pending && <div className={styles.pending}><span>有一项发布结果需要核对，已保留操作编号。</span><button className={styles.primary} disabled={busy} onClick={() => void run(pending)}>{busy && <Loader2 size={16} className={styles.spin} />}核对并继续</button></div>}
    {state && !state.managed && <div className={styles.error}>当前实例未启用统一模型配置，下面是注册表中的模型。用户侧仍使用旧配置；请先在完整配置中心完成接入。</div>}
    {!state && loading ? <div className={styles.empty}><Loader2 className={styles.spin} />正在读取前端模型与真实路由…</div> : !state ? <div className={styles.empty}><Unplug /><h2>模型配置暂时无法读取</h2><p>检查数据库和 Router 管理连接后重试。</p><button className={styles.secondary} onClick={() => void load(true)}>重新读取</button></div> : tab === "models" ? <section id="models-panel" role="tabpanel" aria-labelledby="models-tab">
      <div className={styles.toolbar}><div className={styles.filters} aria-label="模型类型">{[["all", "全部"], ["image", "图片"], ["text", "文字"], ["video", "视频"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><button className={styles.secondary} disabled={locked} onClick={()=>setSorting(true)}>调整排序</button><label className={styles.search}><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称、模型 ID 或功能" aria-label="搜索模型" /></label></div>
      <div className={styles.mapping}><div className={styles.tableHead}><span>前端名称</span><span>实际调用模型 / 上游来源</span><span>操作</span></div>{rows.map(r => <article className={styles.modelRow} key={r.id} data-testid={`managed-model-${r.id}`}>
        <div className={styles.modelName}><span className={styles.modality}>{types[r.modality]}</span><h2>{r.label}</h2>{r.publicIds.length > 1 && <p>模型家族 · {r.publicIds.length} 个比例分支，统一管理</p>}<div className={styles.scopeSummary}><span>应用工具 {r.features.length} 项</span><button disabled={locked || !state.managed} onClick={()=>setScope(r)}>编辑范围</button></div><div className={styles.featureTags}>{r.features.map(f => <span key={f.id}>{f.label}</span>)}</div>{!r.features.length && <p>尚未应用到工具，可随时重新选择范围。</p>}</div>
        <div className={styles.routes}>{r.routes.map((route, index) => <div key={`${route.upstreamId}-${route.kind}`} className={styles.route}><span className={styles.routeDot} data-enabled={route.enabled} /><div><code>{route.model}</code><p>{route.provider}<span>{r.supplierRouting || r.conditional || r.preset || r.publicIds.length > 1 ? route.kind : "已配置"}</span></p></div></div>)}{r.conditional && <p className={styles.ruleNote}>具体调用由条件或回退规则决定</p>}</div>
        <div className={styles.rowActions}><button className={styles.switchButton} disabled={locked || !state.managed} onClick={() => setRename(r)}>修改显示名称</button>{r.modality === "image" && <button className={styles.switchButton} disabled={locked || r.preset || !r.qualityConfig?.routes.every(v=>v.editable)} title={r.preset || !r.qualityConfig?.routes.every(v=>v.editable)?"此路径由外部路由或成本预设管理参数":"配置显示档位与实际传参"} onClick={()=>{setError("");setParameters(r);}}>参数设置</button>}{r.modality === "image" && <button className={styles.switchButton} disabled={locked || !state.managed} onClick={()=>{setError("");setResolutionRow(r);}}>分辨率设置</button>}{r.channelsEditable && <button className={styles.switchButton} disabled={locked || !state.managed} onClick={()=>{setError("");setChannelDraft(null);setChannelRow(r);}}>供应通道{r.supplierRouting?` · ${r.supplierRouting.channels.filter(c=>c.enabled).length}`:""}</button>}<button className={styles.switchButton} disabled={locked || !state.managed || !r.features.length} onClick={() => {setError("");setPrice(r);}}>设置积分</button><button className={styles.switchButton} disabled={locked || !state.managed} onClick={() => {setSwitchProvider(r.routes[0]?.providerId||"");setRow(r);}}>{r.modality==="image"?"更换模型":"更换通道 / 模型"} <ChevronRight size={15} /></button><small className={styles.priceCaption}>{r.pricing?.[0]?.credits!==null && r.pricing?.[0] ? `${r.pricing[0].estimated?"预估":"参考"} ${r.pricing[0].credits} 积分/${r.pricing[0].unit==="image"?"张":r.pricing[0].unit==="item"?"项":"次"}` : "按工具配置售价"}</small></div>
      </article>)}</div>
      {!rows.length && <div className={styles.empty}><Search /><h2>{state.rows.length ? "没有匹配的模型" : "前端暂无可见模型"}</h2><p>{state.rows.length ? "尝试其他名称、功能或类型。" : "这里只显示前端当前已启用、可展示的模型。"}</p></div>}
      <p className={styles.footerNote}><CircleHelp size={15} />同一前端模型用于多个功能时，更换会对这些功能一起生效。模型来源与积分价格由管理后台统一配置。</p>
    </section> : <section id="sources-panel" role="tabpanel" aria-labelledby="sources-tab"><div className={styles.sourceIntro}><div><h2>让模型有来源。</h2><p>接入上游 URL 和凭据，自动读取模型目录。再将已确认能力的模型加入可切换列表。</p></div><button className={styles.secondary} disabled={locked} onClick={() => setConnect(true)}><Plus size={16} />新增来源</button></div><div className={styles.sources}>{state.providers.map(p => {
      const catalog = state.catalogs.find(c => c.providerId === p.id), refreshingNow = refreshing.includes(p.id);
      return <Source key={p.id} provider={p} catalog={catalog} refreshing={refreshingNow} locked={locked} candidates={state.candidates} onRefresh={() => void refreshProvider(p.id)} onRegister={model => setRegister({ providerId: p.id, model })} />;
    })}</div>{!state.providers.length && <div className={styles.empty}><Unplug /><h2>接入第一个上游来源</h2><p>输入接口地址与 API Key，系统会自动发现模型 ID。</p></div>}</section>}
    {row && state && <SwitchDialog row={state.rows.find(r=>r.id===row.id) || row} state={state} initialProvider={switchProvider} refreshing={refreshing} locked={locked} busy={busy} onRefresh={providerId=>void refreshProvider(providerId)} onRegister={(providerId,model)=>{setSwitchProvider(providerId);setRegister({providerId,model,returnRowId:row.id});setRow(null);}} onClose={() => setRow(null)} onSave={upstreamId => void run(operation("switch", { rowId: row.id, upstreamId }))} />}
    {rename && <RenameDialog row={rename} locked={locked} onClose={() => setRename(null)} onSave={label => void run(operation("rename", { rowId: rename.id, label }))} />}
    {channelRow && state && <ChannelsDialog row={state.rows.find(r=>r.id===channelRow.id)||channelRow} state={state} initial={channelDraft} refreshing={refreshing} locked={locked} error={error} onRefresh={id=>void refreshProvider(id)} onRegister={(providerId,model,draft)=>{setChannelDraft(draft);setRegister({providerId,model,returnChannelRowId:channelRow.id});setChannelRow(null);}} onClose={()=>setChannelRow(null)} onSave={policy=>void run(operation("channels",{rowId:channelRow.id,policy}))}/>}
    {resolutionRow && <ResolutionsDialog row={resolutionRow} locked={locked} error={error} onClose={()=>setResolutionRow(null)} onSave={(resolutions,parameters)=>void run(operation("resolutions",{rowId:resolutionRow.id,resolutions,...(parameters!==undefined?{parameters}:{})}))}/>}
    {parameters && <ParametersDialog row={state?.rows.find(r=>r.id===parameters.id) || parameters} locked={locked} error={error} onClose={()=>setParameters(null)} onSave={value=>void run(operation("parameters",{rowId:parameters.id,parameters:value}))}/>}
    {sorting && state && <OrderDialog rows={state.rows} locked={locked} error={error} onClose={()=>setSorting(false)} onSave={rowIds=>void run(operation("order",{rowIds}))} />}
    {scope && <ScopeDialog row={scope} locked={locked} error={error} onClose={()=>setScope(null)} onSave={(features,canvas)=>void run(operation("scope",{rowId:scope.id,features,...(canvas!==undefined?{canvas}:{})}))}/>}
    {price && <PriceDialog row={price} locked={locked} error={error} onClose={()=>setPrice(null)} onSave={(features,pricing)=>void run(operation("pricing",{rowId:price.id,features,pricing}))}/>}
    {connect && state && <ConnectDialog locked={locked} onClose={() => setConnect(false)} onSave={(fields, id) => run({ ...operation("connect", fields), id })} />}
    {register && state && <RegisterDialog model={register.model} protocol={state.providers.find(p => p.id === register.providerId)!.protocol} locked={locked} onClose={() => {if(register.returnRowId)setRow(state.rows.find(r=>r.id===register.returnRowId) || null);if(register.returnChannelRowId)setChannelRow(state.rows.find(r=>r.id===register.returnChannelRowId) || null);setRegister(null);}} onSave={fields => void run(operation("register", {providerId:register.providerId,model:register.model,...fields}))} />}
  </main>;
}

const priceQualities=["low","medium","high","xhigh","max","auto"],priceResolutions=["1K","2K","4K","5K"];
const priceQualityNames:Record<string,string>={low:"低",medium:"标准",high:"高",xhigh:"超高",max:"最高",auto:"自动"};
function PriceDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(features:string[],pricing:ManagedModelCreditPricing|null)=>void}){
  const views=row.pricing || [],first=views[0];
  const [selected,setSelected]=useState<string[]>(first?[first.feature]:[]),[active,setActive]=useState(first?.feature || ""),[mode,setMode]=useState(row.modality==="image"?"matrix":"fixed");
  const [amount,setAmount]=useState(first?.credits ?? NaN),[bulk,setBulk]=useState(first?.credits ?? NaN);
  type Draft={cells:import("@/lib/model-config/management").ManagedModelCreditGrid;prices:Record<string,Record<string,number|null>>};
  const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState("");
  useEffect(()=>{
    if(!active || drafts[active])return;let cancelled=false;setLoading(true);setLoadError("");
    void(async()=>{try{
      const res=await fetch(`${endpoint}?rowId=${encodeURIComponent(row.id)}&feature=${encodeURIComponent(active)}`,{cache:"no-store",headers:await authHeader()}),data=await res.json();
      if(!res.ok)throw Error(data.error || "价格表读取失败");if(cancelled)return;
      const cells=data.grid as Draft["cells"],prices=Object.fromEntries(priceQualities.map(q=>[q,Object.fromEntries(priceResolutions.map(r=>[r,null]))])) as Draft["prices"];
      for(const cell of cells)if(cell.available && cell.effectiveQuality===cell.quality)prices[cell.quality][cell.resolution]=cell.credits ?? NaN;
      setDrafts(old=>({...old,[active]:{cells,prices}}));
    }catch(e){if(!cancelled)setLoadError(e instanceof Error?e.message:"读取失败");}finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true;};
  },[active,drafts,row.id]);
  const draft=drafts[active],validNumber=(n:unknown)=>typeof n==="number" && Number.isInteger(n)&&n>=0&&n<=2147483647;
  const valid=mode==="fixed"?validNumber(amount):!!draft && draft.cells.filter(c=>c.available).every(c=>validNumber(draft.prices[c.effectiveQuality]?.[c.resolution]));
  const editCell=(q:string,r:string,n:number)=>setDrafts(old=>({...old,[active]:{...old[active],prices:{...old[active].prices,[q]:{...old[active].prices[q],[r]:n}}}}));
  const fillAll=()=>{if(!draft || !validNumber(bulk))return;const prices=structuredClone(draft.prices);for(const c of draft.cells)if(c.available)prices[c.effectiveQuality][c.resolution]=bulk;setDrafts(old=>({...old,[active]:{...draft,prices}}));};
  const numberField=(label:string,value:number,set:(n:number)=>void)=><label className={styles.field}>{label}<input aria-label={label} type="number" min={0} max={2147483647} step={1} disabled={locked} value={Number.isNaN(value)?"":value} onChange={e=>set(e.target.value===""?NaN:Number(e.target.value))}/></label>;
  return <Dialog title="设置模型积分" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid && selected.length)onSave(selected,mode==="fixed"?{mode:"fixed",credits:amount}:{mode:"matrix",prices:draft.prices});}}><div className={styles.dialogBody}>
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}<div className={styles.scopeHeading}><b>{row.label}</b><span>{row.publicIds.length>1?"模型家族价格表":"模型价格表"}</span></div>
    <p className={styles.ruleNote}>每格是所选质量与分辨率的单价，按工具原单位（张/项/次）计费。比例沿用同一档价格，按张计费时再乘以张数。已开始的任务保留原报价。</p>
    <label className={styles.field}>查看工具价格<select aria-label="查看工具价格" value={active} disabled={locked} onChange={e=>{setActive(e.target.value);setSelected(old=>old.includes(e.target.value)?old:[...old,e.target.value]);}}>{views.map(v=><option key={v.feature} value={v.feature}>{v.label}</option>)}</select><small>切换查看各工具的当前售价；逐格修改后，可应用到下面勾选的多个工具。</small></label>
    <div className={styles.scopeControls}><b>本次更新 {selected.length} 个工具</b><button type="button" disabled={locked} onClick={()=>setSelected(views.map(v=>v.feature))}>全选应用工具</button><button type="button" disabled={locked} onClick={()=>setSelected([])}>清空</button></div>
    <div className={`${styles.scopeGrid} ${styles.priceTools}`}>{views.map(v=><label className={styles.scopeOption} data-selected={selected.includes(v.feature)} key={v.feature}><input type="checkbox" aria-label={v.label} disabled={locked} checked={selected.includes(v.feature)} onChange={()=>setSelected(old=>old.includes(v.feature)?old.filter(x=>x!==v.feature):[...old,v.feature])}/><span><b>{v.label}</b><small>{v.estimated?"预估":"参考"} {v.credits ?? "待核对"} 积分/{v.unit==="image"?"张":v.unit==="item"?"项":"次"}{v.override?" · 已自定义":""}</small></span></label>)}</div>
    <label className={styles.field}>积分计价方式<select aria-label="积分计价方式" value={mode} disabled={locked} onChange={e=>setMode(e.target.value)}>{row.modality==="image" && <option value="matrix">质量 × 分辨率价格表</option>}<option value="fixed">所有可用规格统一积分</option></select></label>
    {mode==="fixed"?numberField("每单位消耗积分",amount,setAmount):<div className={styles.bulkPrice}>{numberField("批量填充积分",bulk,setBulk)}<button type="button" className={styles.secondary} disabled={locked || !draft || !validNumber(bulk)} onClick={fillAll}>填入所有可用规格</button></div>}
    {loading?<p role="status" className={styles.ruleNote}>正在读取当前价格表…</p>:draft && <div className={styles.priceTableScroll}><table className={styles.priceTable} aria-label="模型积分价格表"><caption>{views.find(v=>v.feature===active)?.label} · 每{views.find(v=>v.feature===active)?.unit==="image"?"张":views.find(v=>v.feature===active)?.unit==="item"?"项":"次"}消耗积分</caption><thead><tr><th scope="col">质量 / 分辨率</th>{priceResolutions.map(r=><th scope="col" key={r}>{r}</th>)}</tr></thead><tbody>{priceQualities.map(q=><tr key={q}><th scope="row">{priceQualityNames[q]}</th>{priceResolutions.map(r=>{const cell=draft.cells.find(c=>c.quality===q&&c.resolution===r)!,value=mode==="fixed"?amount:draft.prices[cell.effectiveQuality]?.[r];return <td key={r} data-unavailable={!cell.available}>{!cell.available?<span title="本系统当前能力配置未开放此规格">未开放</span>:cell.effectiveQuality!==q?<span title={`按${priceQualityNames[cell.effectiveQuality]}质量计价`}>{validNumber(value)?value:"待设置"}<small>按{priceQualityNames[cell.effectiveQuality]}</small></span>:<input aria-label={`${priceQualityNames[q]} · ${r} 积分`} type="number" min={0} max={2147483647} step={1} disabled={locked || mode==="fixed"} value={typeof value==="number"&&!Number.isNaN(value)?value:""} onChange={e=>editCell(q,r,e.target.value===""?NaN:Number(e.target.value))}/>}</td>;})}</tr>)}</tbody></table></div>}
    <p className={styles.scopeNote}>提交按钮按当前规格和数量显示实际报价。规格来自本系统的能力配置，并非自动逐项实测；未开放组合不能定价。发生质量映射时按实际执行档位计价。0 积分表示免费。采购成本和模型路由保留原配置。</p>
    </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !selected.length || !views.some(v=>selected.includes(v.feature)&&v.override)} onClick={()=>onSave(selected,null)}>恢复原计价</button><button type="submit" className={styles.primary} disabled={locked || loading || !selected.length || !valid}>保存积分并生效</button></footer></form></Dialog>;
}

function OrderDialog({rows,locked,error,onClose,onSave}:{rows:ManagedModelRow[];locked:boolean;error:string;onClose:()=>void;onSave:(ids:string[])=>void}){
  const [ids,setIds]=useState(()=>rows.map(row=>row.id));
  const move=(index:number,delta:number)=>setIds(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});
  const changed=ids.some((id,i)=>id!==rows[i].id);
  return <Dialog title="调整模型排序" locked={locked} onClose={onClose}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.ruleNote}>上移、下移调整前端展示顺序。各工具只显示其已开放模型，沿用此顺序；同一家族的比例分支一起移动。默认模型和积分价格保持原配置。</p>
    <ol className={styles.orderList}>{ids.map((id,i)=>{const row=rows.find(r=>r.id===id)!;return <li key={id} data-testid={`model-order-${id}`}><span className={styles.orderNumber}>{i+1}</span><span className={styles.orderName}><b>{row.label}</b><small>{types[row.modality]} · {row.id}</small></span><button aria-label={`上移 ${row.label}`} disabled={locked || i===0} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button><button aria-label={`下移 ${row.label}`} disabled={locked || i===ids.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button></li>;})}</ol>
  </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.secondary} disabled={locked} onClick={()=>setIds(rows.map(row=>row.id))}>恢复当前顺序</button><button className={styles.primary} disabled={locked || !changed} onClick={()=>onSave(ids)}>保存排序并生效</button></footer></Dialog>;
}

function ScopeDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(features:string[],canvas?:boolean)=>void}){
  const [selected,setSelected]=useState(()=>row.features.map(f=>f.id));
  const [search,setSearch]=useState("");
  const [canvas,setCanvas]=useState<boolean|undefined>(row.canvasUnified?true:undefined);
  const canvasOptions=row.scopeOptions.filter(o=>o.id.startsWith("canvas.")),canvasIds=canvasOptions.filter(o=>o.available).map(o=>o.id);
  const canvasChecked=Boolean(canvas || canvasIds.length&&canvasIds.every(id=>selected.includes(id)));
  const canvasPartial=!canvasChecked&&canvasIds.some(id=>selected.includes(id));
  const setCanvasScope=(value:boolean)=>{setCanvas(value);setSelected(old=>[...old.filter(id=>!id.startsWith("canvas.")),...(value?canvasIds:[])]);};
  const available=row.scopeOptions.filter(o=>o.available),shown=row.scopeOptions.filter(o=>o.label.includes(search.trim()));
  const toggle=(ids:string[])=>setSelected(old=>ids.every(id=>old.includes(id)) ? old.filter(id=>!ids.includes(id)) : [...new Set([...old,...ids])]);
  const effectiveCanvas=canvas===undefined&&canvasChecked?true:canvas;
  const changed=effectiveCanvas!==(row.canvasUnified?true:undefined) || selected.length!==row.features.length || selected.some(id=>!row.features.some(f=>f.id===id));
  const groups=[{id:"image",label:"生图与内容",test:(id:string)=>id.startsWith("image.") || id.startsWith("competitor.") || id.startsWith("video.")},{id:"tool",label:"编辑工具",test:(id:string)=>id.startsWith("tool.")}];
  return <Dialog title="选择应用工具" locked={locked} onClose={onClose}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.scopeHeading}><b>{row.label}</b><span>已选 {selected.length} / {available.length} 项</span></div>
    <p className={styles.ruleNote}>{row.publicIds.length>1 ? "整个模型家族统一应用，包含所有比例分支。" : "勾选此模型可应用的工具。"}勾选“画布”一次，自动覆盖能力符合的画布模块。图片与文字模型分别选择，不会互相替代。</p>
    <div className={styles.scopeControls}><button className={styles.secondary} disabled={locked} onClick={()=>{setSelected(available.map(o=>o.id));if(canvasIds.length)setCanvas(true);}}>全选可用工具</button><button disabled={locked} onClick={()=>{setSelected([]);setCanvas(false);}}>清空选择</button><button disabled={locked} onClick={()=>{setSelected(row.features.map(f=>f.id));setCanvas(row.canvasUnified?true:undefined);}}>恢复当前范围</button></div>
    <label className={styles.search}><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="查找工具" aria-label="查找应用工具" /></label>
    <div className={styles.scopeGroups}>{groups.map(group=>{const options=shown.filter(o=>group.test(o.id)),ids=options.filter(o=>o.available).map(o=>o.id);if(!options.length)return null;return <fieldset key={group.id} disabled={locked}><legend><b>{group.label}</b><button disabled={locked || !ids.length} onClick={()=>toggle(ids)}>{ids.length && ids.every(id=>selected.includes(id)) ? "取消本组" : "选择本组"}</button></legend><div className={styles.scopeGrid}>{options.map(o=><label key={o.id} className={styles.scopeOption} data-selected={selected.includes(o.id)} data-disabled={!o.available}><input type="checkbox" aria-label={o.label} disabled={!o.available || locked} checked={selected.includes(o.id)} onChange={()=>toggle([o.id])}/><span><b>{o.label}</b>{o.adminDefault && o.available && <small>设为工具默认</small>}{o.reason && <small>{o.reason}</small>}</span></label>)}</div></fieldset>;})}</div>
    {canvasOptions.length>0 && <fieldset disabled={locked} className={styles.parameterRoute}><legend>画布系统</legend><label className={styles.scopeOption}><input type="checkbox" aria-label="画布" checked={canvasChecked} ref={input=>{if(input)input.indeterminate=canvasPartial;}} disabled={locked || !canvasIds.length} onChange={e=>setCanvasScope(e.target.checked)}/><span><b>应用到画布</b><small>统一开放符合能力的{row.modality==="image"?"图片生成／编辑":"文字／图片理解"}模块</small>{canvasPartial && <small>旧配置仅开放部分模块，勾选后统一管理</small>}</span></label><details><summary>查看具体模块（{canvasIds.length} 类用途可用）</summary><ul className={styles.canvasModules}>{canvasOptions.map(o=><li key={o.id}><b>{o.id==="canvas.image"?"生图、换背景、换视角、文案图、Agent 出图":o.label}</b><span>{o.available?(selected.includes(o.id)?"已开放":"可开放"):o.reason}</span></li>)}{row.modality==="image" && <li><b>A+ 内容图</b><span>随画布图片池，保留 A+ 原售价与生成能力校验</span></li>}</ul></details></fieldset>}
    {!shown.length && <p className={styles.ruleNote}>没有匹配的工具。</p>}
    <p className={styles.scopeNote}>移出范围后，用户不能再在该工具选择此模型。默认模型会使用现有可用替代项；没有替代项时将提示先配置。供应商路由和售价保持原配置。</p>
    </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={locked || !changed} onClick={()=>onSave(selected,effectiveCanvas)}>保存范围并生效</button></footer></Dialog>;
}

function ParametersDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(value:{choices:{id:string;label:string}[];routes:NonNullable<ManagedModelRow["qualityConfig"]>["routes"]}|null)=>void}){
  const initial=row.qualityConfig!;
  const [choices,setChoices]=useState(initial.choices),[routes,setRoutes]=useState(initial.routes);
  useEffect(()=>setRoutes(old=>old.map(route=>({...route,metadataDefaults:initial.routes.find(r=>r.upstreamId===route.upstreamId)?.metadataDefaults || null}))),[initial.routes]);
  const patchRoute=(index:number,patch:Partial<typeof routes[number]>)=>setRoutes(old=>old.map((route,i)=>i===index?{...route,...patch}:route));
  const valid=choices.length>0 && choices.every(c=>c.label.trim()) && routes.every(r=>r.mode!=="map" || choices.every(c=>r.values[c.id]?.trim()));
  const payload=()=>({choices,routes:routes.map(({upstreamId,mode,values,evidence,metadataRef})=>({upstreamId,mode,values,evidence,metadataRef})) as typeof routes});
  return <Dialog title="模型参数设置" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave(payload());}}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.scopeHeading}><b>{row.label}</b><span>显示档位 → 实际传参</span></div>
    <p className={styles.ruleNote}>前端名称是平台展示档位，不等于供应商原生质量。关闭档位会同时从前端和可定价规格中移除；选择“不发送”时，上游使用自己的默认处理。积分售价继续在“设置积分”维护。</p>
    <div className={styles.scopeControls}><b>前端显示</b><button type="button" disabled={locked} onClick={()=>setChoices(DISPLAY_QUALITY_IDS.map(id=>({id,label:choices.find(c=>c.id===id)?.label || DEFAULT_QUALITY_LABELS[id]})))}>启用五档</button></div>
    <div className={styles.parameterChoices}>{DISPLAY_QUALITY_IDS.map(id=>{const choice=choices.find(c=>c.id===id);return <label key={id} className={styles.parameterChoice}><input type="checkbox" aria-label={`启用${DEFAULT_QUALITY_LABELS[id]}档`} disabled={locked} checked={!!choice} onChange={e=>setChoices(old=>e.target.checked?DISPLAY_QUALITY_IDS.filter(q=>q===id||old.some(c=>c.id===q)).map(q=>old.find(c=>c.id===q)||{id:q,label:DEFAULT_QUALITY_LABELS[q]}):old.filter(c=>c.id!==id))}/><span><b>{DEFAULT_QUALITY_LABELS[id]}</b><small>{id}</small></span><input aria-label={`${id}显示名称`} disabled={locked || !choice} maxLength={30} value={choice?.label || ""} placeholder={DEFAULT_QUALITY_LABELS[id]} onChange={e=>setChoices(old=>old.map(c=>c.id===id?{...c,label:e.target.value}:c))}/></label>;})}</div>
    {routes.map((route,index)=><fieldset key={route.upstreamId} disabled={locked} className={styles.parameterRoute}><legend>{route.provider} · <code>{route.model}</code></legend>
      <div className={styles.parameterDefaults}><b>元数据默认值</b><p>{route.metadataDefaults ? `${route.metadataDefaults.source} · 修订 v${route.metadataDefaults.revision} · ${({unknown:"待核实",configured:"执行配置记录",documented:"文档声明",verified:"已验证资料"} as Record<string,string>)[route.metadataDefaults.state] || route.metadataDefaults.state}` : "此供应商和实际模型尚未关联元数据记录"}</p><p>{route.metadataDefaults?.reason || "请先补充元数据库，或手动配置；未知参数默认不发送。"}</p><button type="button" className={styles.secondary} disabled={locked || !route.metadataDefaults?.available} onClick={()=>{const d=route.metadataDefaults!;patchRoute(index,{mode:d.mode,values:{...d.values},metadataRef:{id:d.id,revision:d.revision},evidence:{status:["documented","verified"].includes(d.state)?"documented":"unverified",source:`元数据库 ${d.id} v${d.revision}：${d.source}`.slice(0,1000),checkedAt:d.checkedAt}});}}>使用元数据默认映射</button></div>
      <label className={styles.field}>质量参数处理<select aria-label={`参数处理 ${route.upstreamId}`} value={route.mode} onChange={e=>patchRoute(index,{mode:e.target.value as typeof route.mode})}><option value="map">逐档映射到上游值</option><option value="passthrough">原样发送档位 ID</option><option value="omit">不发送 quality 参数</option></select></label>
      <div className={styles.priceTableScroll}><table className={styles.priceTable} aria-label={`质量映射 ${route.upstreamId}`}><thead><tr><th>前端显示</th><th>实际发送的 quality</th></tr></thead><tbody>{choices.map(choice=><tr key={choice.id}><th>{choice.label}<small className={styles.parameterId}>{choice.id}</small></th><td>{route.mode==="omit"?<code>不发送</code>:<><input aria-label={`${choice.id}上游值 ${route.upstreamId}`} required maxLength={100} list={`quality-native-${index}`} value={route.mode==="passthrough"?choice.id:route.values[choice.id] || ""} placeholder={route.metadataDefaults?.values[choice.id] || "选择或输入实际参数"} onChange={e=>patchRoute(index,{evidence:{status:"unverified",source:route.metadataDefaults?`手动覆盖，参考元数据库 ${route.metadataDefaults.id} v${route.metadataDefaults.revision}`:"手动覆盖",checkedAt:""},mode:"map",values:{...Object.fromEntries(choices.map(c=>[c.id,route.mode==="passthrough"?c.id:route.values[c.id] || ""])),[choice.id]:e.target.value}})}/><small className={styles.parameterId}>元数据默认：{route.metadataDefaults?.mode==="omit"?"不发送":route.metadataDefaults?.values[choice.id] || "待维护"}</small></>}</td></tr>)}</tbody></table></div>
      <datalist id={`quality-native-${index}`}>{route.metadataDefaults?.nativeValues.map(value=><option key={value} value={value}/>)}</datalist>
      <div className={styles.parameterEvidence}><label className={styles.field}>核对状态<select aria-label={`核对状态 ${route.upstreamId}`} value={route.evidence.status} onChange={e=>patchRoute(index,{evidence:{...route.evidence,status:e.target.value as typeof route.evidence.status}})}><option value="unverified">尚未验证</option><option value="documented">供应商文档声明</option><option value="accepted">接口接受（效果未验证）</option><option value="rejected">实测被拒绝</option></select></label><label className={styles.field}>核对日期<input type="date" aria-label={`核对日期 ${route.upstreamId}`} value={route.evidence.checkedAt.slice(0,10)} onChange={e=>patchRoute(index,{evidence:{...route.evidence,checkedAt:e.target.value}})}/></label><label className={styles.field}>核对依据<input aria-label={`核对依据 ${route.upstreamId}`} value={route.evidence.source} maxLength={1000} placeholder="文档链接或测试记录；请求成功不等于参数生效" onChange={e=>patchRoute(index,{evidence:{...route.evidence,source:e.target.value}})}/></label></div>
    </fieldset>)}
    <p className={styles.scopeNote}>同一家族的比例分支分别映射，展示档位统一。映射绑定实际模型来源；切换上游后会采用新来源的配置。共享该实际模型的其他入口也会继承配置。保存不自动测试供应商，不调整积分价格；已接受任务按原版本执行。</p>
  </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !routes.some(r=>r.configured)} onClick={()=>onSave(null)}>恢复原参数</button><button type="submit" className={styles.primary} disabled={locked || !valid}>保存参数并生效</button></footer></form></Dialog>;
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

function SwitchDialog({ row, state, initialProvider, refreshing, locked, busy, onRefresh, onRegister, onClose, onSave }: { row: ManagedModelRow; state: State; initialProvider:string; refreshing:string[]; locked: boolean; busy: boolean; onRefresh:(providerId:string)=>void; onRegister:(providerId:string,model:string)=>void; onClose: () => void; onSave: (id: string) => void }) {
  const [selected, setSelected] = useState(""), [search, setSearch] = useState("");
  const protocol=row.modality==="text"?"openai-chat":row.modality==="video"?"openai-videos":null;
  const providers=state.providers.filter(p=>p.enabled&&p.configured&&(!protocol||p.protocol===protocol)&& (protocol||state.candidates.some(c=>c.providerId===p.id&&row.candidateIds.includes(c.id))));
  const [providerId,setProviderId]=useState(()=>providers.some(p=>p.id===initialProvider)?initialProvider:row.routes[0]?.providerId||"");
  const candidates = state.candidates.filter(c => row.candidateIds.includes(c.id) && (!providerId||c.providerId===providerId) && `${c.model} ${c.provider}`.toLowerCase().includes(search.toLowerCase()));
  const catalog=state.catalogs.find(c=>c.providerId===providerId),refreshingNow=refreshing.includes(providerId),provider=providers.find(p=>p.id===providerId);
  const registered=state.candidates.filter(c=>c.providerId===providerId);
  const discovered=protocol?(catalog?.models||[]).filter(m=>!registered.some(c=>c.model===m.id)&&`${m.id} ${m.label}`.toLowerCase().includes(search.toLowerCase())):[];
  const incompatible=registered.filter(c=>!row.candidateIds.includes(c.id)&&`${c.model} ${c.label}`.toLowerCase().includes(search.toLowerCase()));
  return <Dialog title={row.modality==="text"?"更换文字通道与模型":"更换实际模型"} onClose={onClose} locked={locked}><div className={styles.dialogBody}><div className={styles.currentConnection}><span>前端名称<b>{row.label}</b></span><ArrowRight size={18} /><span>当前实际模型<b>{Array.from(new Set(row.routes.map(r => r.model))).join(" / ")}</b><small>{Array.from(new Set(row.routes.map(r=>r.provider))).join(" / ")}</small></span></div><p className={styles.ruleNote}>名称保持不变。影响：{row.features.map(f => f.label).join("、")}。{row.publicIds.length > 1 && "该家族的所有比例分支会一起切换。"}{(row.conditional || row.supplierRouting) && "更换后将改为固定调用，原条件路由和失败回退会关闭。"}</p>
    {row.preset && <div className={styles.notice}>此模型使用专用能力与定价预设。更换到不同实际模型前，需要在<Link href="/admin/bi/models">完整配置中心</Link>核验新模型的参数和采购价格。</div>}
    <label className={styles.field}>供应通道<select aria-label="选择供应通道" value={providerId} disabled={locked} onChange={e=>{setProviderId(e.target.value);setSelected("");setSearch("");}}><option value="">全部可用通道</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{provider&&<small>{provider.baseUrl}</small>}</label>
    <label className={styles.search}><Search size={16} /><input aria-label="搜索可切换模型" placeholder="搜索模型 ID 或上游来源" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <fieldset className={styles.candidateList} disabled={locked}><legend>选择兼容的实际模型</legend>{candidates.map(c => <label key={c.id} className={styles.candidate} data-selected={selected === c.id}><input type="radio" name="actual-model" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} /><span><code>{c.model}</code><small>{c.provider}{row.routes.some(r => r.upstreamId === c.id) ? " · 当前路径" : c.verified ? " · 能力已确认" : " · 已接入，能力未核验"}</small></span>{selected === c.id && <Check size={17} />}</label>)}</fieldset>
    {!candidates.length && <p className={styles.ruleNote}>此通道暂无已接入且兼容的模型。可从下面的目录添加并确认能力，或选择其他通道。{row.modality==="text"&&row.features.some(f=>["canvas.assistant","canvas.ocr"].includes(f.id))&&"当前用途包含图片理解，需要支持文字及图片输入。"}</p>}
    {!!incompatible.length&&<p className={styles.ruleNote}>此通道另有 {incompatible.length} 个已接入模型不满足当前用途的能力要求，请在完整配置中心核对能力。</p>}
    {protocol&&provider&&<section aria-label="通道模型目录"><div className={styles.scopeHeading}><b>从此通道添加实际模型</b><button type="button" className={styles.secondary} disabled={locked||refreshingNow} onClick={()=>onRefresh(providerId)}>{refreshingNow?<Loader2 size={14} className={styles.spin}/>:<RefreshCw size={14}/>}刷新目录</button></div><p className={styles.ruleNote}>目录仅表示供应商提供该 ID，确认能力后才会进入可切换列表。{catalog?.stale&&"目录已过期，请刷新后添加。"}{catalog?.status==="error"&&catalog.error}</p><div className={styles.catalogList}>{discovered.slice(0,30).map(m=><div key={m.id}><code>{m.id}</code><button type="button" disabled={locked||refreshingNow||catalog?.stale||catalog?.status!=="ok"} onClick={()=>onRegister(providerId,m.id)}>添加并确认能力 <Plus size={13}/></button></div>)}</div>{discovered.length>30&&<p className={styles.ruleNote}>共 {discovered.length} 个待接入模型，输入模型 ID 可缩小范围。</p>}{!discovered.length&&<p className={styles.ruleNote}>没有匹配的待接入模型，可刷新目录或调整搜索。</p>}</section>}
    <p className={styles.ruleNote}>兼容筛选使用现有能力记录；旧接入能力未核验时会明确标注。此处不会自动发送付费生成请求。</p>
  </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={!selected || locked} onClick={() => onSave(selected)}>{busy && <Loader2 size={16} className={styles.spin} />}切换并生效</button></footer></Dialog>;
}

function RenameDialog({ row, locked, onClose, onSave }: { row: ManagedModelRow; locked: boolean; onClose: () => void; onSave: (label: string) => void }) {
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

function ResolutionsDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(resolutions:string[]|null,parameters?:ResolutionParameters|null)=>void}) {
  const [selected,setSelected]=useState(row.displayResolutions || ["1K","2K","4K"]);
  const [routes,setRoutes]=useState(()=>row.resolutionConfig?.routes.map(r=>({...r,values:{...r.values}})) || []);
  const update=(id:string,patch:Partial<typeof routes[number]>)=>setRoutes(old=>old.map(r=>r.upstreamId===id?{...r,...patch}:r));
  const valid=selected.length>0&&routes.every(r=>r.mode!=="map"||r.fieldKnown&&selected.every(id=>r.values[id]?.trim()));
  const parameters=():ResolutionParameters=>({routes:routes.map(r=>({upstreamId:r.upstreamId,mode:r.mode,field:r.field,ratioField:r.ratioField||null,values:r.values,metadataRef:r.metadataRef}))});
  return <Dialog title="分辨率显示与实际参数" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave(selected,routes.length&&!row.preset?parameters():undefined);}}><div className={styles.dialogBody}>
    <div className={styles.scopeHeading}><b>{row.label}</b><span>按模型家族统一显示，各供应通道独立传参</span></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.ruleNote}>前端档位决定用户可选的输出分辨率；实际发送值决定上游如何生成。系统自动匹配对应供应商的接口规格，只需选择实际档位。映射到较低规格时，输出仍沿用现有放大流程。</p>
    <div className={styles.scopeControls}><b>前端显示分辨率</b><button type="button" disabled={locked} onClick={()=>setSelected(["1K","2K","4K"])}>全选</button></div>
    <div className={styles.parameterChoices}>{["1K","2K","4K"].map(id=><label key={id} className={styles.parameterChoice}><input type="checkbox" aria-label={`显示 ${id}`} disabled={locked} checked={selected.includes(id)} onChange={e=>setSelected(old=>e.target.checked?[...old,id]:old.filter(v=>v!==id))}/><b>{id}</b></label>)}</div>
    {routes.map((route,index)=><fieldset key={route.upstreamId} className={`${styles.capabilities} ${styles.parameterRoute}`} disabled={locked||!route.editable}><legend>{route.provider} · {route.model}{row.routes.filter(r=>r.upstreamId===route.upstreamId).every(r=>!r.enabled)?" · 停用通道":""}</legend>
      <p className={styles.ruleNote}>已记录支持规格：{route.nativeValues.length?route.nativeValues.join("、"):"未知 / 待维护"}{route.metadataDefaults?.source?` · ${route.metadataDefaults.source} · 元数据 v${route.metadataDefaults.revision}`:""}</p>
      <p className={styles.ruleNote}>{route.metadataDefaults?.reason || "尚无对应元数据，继续原传参；可手动维护映射。"}{!route.editable?" 此路径由原适配器管理。":""}</p>
      <label className={styles.field}>分辨率参数处理<select aria-label={`${route.provider} ${route.model} 分辨率参数处理`} value={route.mode} onChange={e=>update(route.upstreamId,{mode:e.target.value as typeof route.mode,metadataRef:null})}><option value="legacy">沿用原传参</option><option value="map">按显示档位映射实际值</option><option value="omit">不发送分辨率参数</option></select></label>
      {route.mode==="map"&&<>
        <div className={styles.parameterDefaults}><b>{route.configured?"使用已保存的通道规格":route.fieldKnown?"传参方式已自动匹配":"这条通道的接口规格尚待确认"}</b><p>{route.fieldKnown?"无需选择接口字段，下面选择该显示档位实际使用的规格。":"元数据库还没有可靠的接口定义。可先沿用原调用；有供应商资料时在高级设置维护。系统不会默认把 size 当作分辨率。"}</p></div>
        <table className={`${styles.priceTable} ${styles.resolutionTable}`}><thead><tr><th>前端显示</th><th>实际使用的上游规格</th></tr></thead><tbody>{selected.map(id=>{
          const d=route.metadataDefaults;const sourceValues=d?.field===route.field?[...Object.values(d.values),...d.nativeValues.filter(v=>route.field!=="size"||/^(auto|\d+x\d+)$/.test(v))]:[];
          const options=[...new Set([...sourceValues,...Object.values(route.values)].filter(Boolean))];
          return <tr key={id}><th>{id}</th><td><select aria-label={`${route.provider} ${route.model} ${id} 实际分辨率`} disabled={!route.fieldKnown||!options.length} value={route.values[id]||""} onChange={e=>update(route.upstreamId,{values:{...route.values,[id]:e.target.value},metadataRef:null})}><option value="">{options.length?"选择实际规格":"暂无已确认规格"}</option>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></td></tr>;
        })}</tbody></table>
        <details className={styles.parameterAdvanced}><summary>高级设置 · 手动配置接口参数</summary><p className={styles.ruleNote}>常规使用由系统自动确定。仅在供应商定义特殊参数或需自定义映射时修改；修改后按手动配置执行。</p>
          <label className={styles.field}>实际参数名<select aria-label={`${route.provider} ${route.model} 分辨率参数名`} value={route.fieldKnown?route.field:""} onChange={e=>{if(e.target.value)update(route.upstreamId,{field:e.target.value as typeof route.field,ratioField:undefined,fieldKnown:true,metadataRef:null});}}><option value="" disabled>按供应商文档选择参数</option>{RESOLUTION_FIELDS.filter(f=>route.protocol!=="openai-images"||!f.includes(".")).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          <label className={styles.field}>比例参数<select aria-label={`${route.provider} ${route.model} 比例参数名`} value={route.ratioField||""} onChange={e=>update(route.upstreamId,{ratioField:e.target.value as typeof route.ratioField||undefined,metadataRef:null})}><option value="">沿用适配器处理</option>{RATIO_FIELDS.filter(f=>f!==route.field&&(route.protocol!=="openai-images"||!f.includes("."))).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          {selected.map(id=><label key={id} className={styles.field}>{id} 自定义实际值<input aria-label={`${route.provider} ${route.model} ${id} 自定义分辨率`} value={route.values[id]||""} placeholder="按实际接口定义填写" maxLength={100} onChange={e=>update(route.upstreamId,{values:{...route.values,[id]:e.target.value},metadataRef:null})}/></label>)}
        </details>
      </>}

      {route.mode==="omit"&&<p className={styles.ruleNote}>此通道使用供应商默认生成规格，输出再按现有流程处理。</p>}
      {route.editable&&route.metadataDefaults?.available&&<button type="button" className={styles.secondary} onClick={()=>{const d=route.metadataDefaults!;update(route.upstreamId,{mode:d.mode,field:d.field,ratioField:d.ratioField,fieldKnown:true,values:{...d.values},metadataRef:{id:d.id,revision:d.revision}});}}>使用元数据默认映射</button>}
    </fieldset>)}
    <p className={styles.scopeNote}>至少选择一档，所有比例分支同步。新增档位的积分在“设置积分”中维护。这里只管理显示和执行映射；元数据库中的能力声明由供应商资料独立维护。</p>
  </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !row.displayResolutions} onClick={()=>onSave(null)}>恢复默认显示</button><button type="submit" className={styles.primary} disabled={locked || !valid}>保存分辨率并生效</button></footer></form></Dialog>;
}

function ChannelsDialog({row,state,initial,refreshing,locked,error,onRefresh,onRegister,onClose,onSave}:{row:ManagedModelRow;state:State;initial:ChannelPolicy|null;refreshing:string[];locked:boolean;error:string;onRefresh:(id:string)=>void;onRegister:(providerId:string,model:string,draft:ChannelPolicy)=>void;onClose:()=>void;onSave:(policy:ChannelPolicy|null)=>void}){
 const [mode,setMode]=useState<ChannelPolicy["mode"]>(initial?.mode||row.supplierRouting?.mode||"balanced");
 const [channels,setChannels]=useState<ChannelPolicy["channels"]>(()=>initial?.channels||row.supplierRouting?.channels||row.routes.slice(0,1).map(r=>({upstreamId:r.upstreamId,enabled:true,priority:1,weight:1})));
 const candidateGroups=new Set<string>();const candidates=state.candidates.filter(c=>c.modality===row.modality&&CHANNEL_PROTOCOLS.includes(state.providers.find(p=>p.id===c.providerId)?.protocol||"")&&(row.modality!=="text"||row.candidateIds.includes(c.id))).filter(c=>{const key=c.providerId+":"+(row.modality==="image"?imageModelDisplayId(c.model):c.model);if(channels.some(ch=>ch.upstreamId===c.id)){candidateGroups.add(key);return true;}if(candidateGroups.has(key))return false;candidateGroups.add(key);return true;}),available=candidates.filter(c=>!channels.some(ch=>ch.upstreamId===c.id));
 const [adding,setAdding]=useState("");const update=(id:string,patch:Partial<ChannelPolicy["channels"][number]>)=>setChannels(old=>old.map(c=>c.upstreamId===id?{...c,...patch}:c));
 const valid=channels.some(c=>c.enabled)&&channels.every(c=>Number.isInteger(c.priority)&&c.priority>=1&&c.priority<=100&&Number.isInteger(c.weight)&&c.weight>=1&&c.weight<=1000);
 return <Dialog title="供应通道与分流" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave({mode,channels});}}><div className={styles.dialogBody}>
 <h3>{row.label}</h3><p className={styles.ruleNote}>用户仍选择一个模型，平台从下列通道中选择符合本次参数的供应商。积分售价与工具范围沿用当前配置。</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
 <label className={styles.field}>调度方式<select aria-label="调度方式" value={mode} disabled={locked} onChange={e=>setMode(e.target.value as typeof mode)}><option value="balanced">同级分流：优先级分组，组内按权重分配</option><option value="priority">主备优先：按优先级和列表顺序调用</option></select></label>
 <p className={styles.ruleNote}>优先级数字越小越优先；同级权重 7 和 3 约对应 70% 与 30%。满载时自动选择有余量的通道，全部繁忙时保留输入。</p>
 {channels.map(c=>{const candidate=candidates.find(v=>v.id===c.upstreamId),provider=state.providers.find(p=>p.id===candidate?.providerId),capacity=provider&&state.providerCapacity?.[provider.id];return <fieldset key={c.upstreamId} disabled={locked} className={styles.parameterRoute} data-testid={"supplier-channel-"+c.upstreamId}><legend>{candidate?.provider||"已登记通道"} · <code>{candidate?.model||c.upstreamId}</code></legend><label><input type="checkbox" aria-label={"启用通道 "+c.upstreamId} checked={c.enabled} onChange={e=>update(c.upstreamId,{enabled:e.target.checked})}/>启用</label><div className={styles.parameterChoices}><label className={styles.field}>优先级<input aria-label={"通道优先级 "+c.upstreamId} type="number" min={1} max={100} value={c.priority} onChange={e=>update(c.upstreamId,{priority:Number(e.target.value)})}/></label><label className={styles.field}>分流权重<input aria-label={"通道权重 "+c.upstreamId} type="number" min={1} max={1000} disabled={mode==="priority"} value={c.weight} onChange={e=>update(c.upstreamId,{weight:Number(e.target.value)})}/></label></div><p className={styles.ruleNote}>并发 {capacity?.inFlight||0} / {capacity?.maxConcurrent||provider?.maxConcurrent||1} · {({available:"最近调用成功",cooldown:"暂停，等待恢复",recovering:"恢复探测中",failed:"最近调用失败",unobserved:"尚未调用"} as Record<string,string>)[state.channelHealth?.[c.upstreamId]?.state||"unobserved"]} · {candidate?.verified?"能力已登记":"参数能力未全面核对"}</p><button type="button" className={styles.secondary} onClick={()=>setChannels(old=>old.filter(v=>v.upstreamId!==c.upstreamId))}>移除通道</button></fieldset>})}
 <label className={styles.field}>添加供应通道<select aria-label="添加供应通道" value={adding} disabled={locked||channels.length>=20} onChange={e=>setAdding(e.target.value)}><option value="">选择已接入的实际模型</option>{available.map(c=><option key={c.id} value={c.id}>{c.provider} · {c.model}</option>)}</select></label><button type="button" className={styles.secondary} disabled={locked||!adding||channels.length>=20} onClick={()=>{setChannels(old=>[...old,{upstreamId:adding,enabled:true,priority:1,weight:1}]);setAdding("");}}>添加通道</button>
 <ChannelDirectory row={row} state={state} refreshing={refreshing} locked={locked||channels.length>=20} onRefresh={onRefresh} onRegister={(providerId,model)=>onRegister(providerId,model,{mode,channels})}/>
 <p className={styles.ruleNote}>{row.modality==="text"?"通道报错、超时、返回空结果，或流式输出开始前失败时，自动尝试其他可用通道；已输出文字后中断不会拼接其他模型回答。":"通道报错、超时或未返回有效图片时，同一任务自动尝试其他可用通道。"}每条通道最多尝试一次，成功后只结算一次积分；全部失败才结束任务。连续失败的通道会暂停并尝试恢复。</p>
 </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked||!row.supplierRouting} onClick={()=>onSave(null)}>恢复单通道</button><button className={styles.primary} disabled={locked||!valid}>保存通道并生效</button></footer></form></Dialog>;
}

function ChannelDirectory({row,state,refreshing,locked,onRefresh,onRegister}:{row:ManagedModelRow;state:State;refreshing:string[];locked:boolean;onRefresh:(id:string)=>void;onRegister:(providerId:string,model:string)=>void}){
 const providers=state.providers.filter(p=>p.enabled&&p.configured&&CHANNEL_PROTOCOLS.includes(p.protocol)&&(row.modality==="text"?p.protocol==="openai-chat":p.protocol!=="openai-chat"));
 const [providerId,setProviderId]=useState(""),[query,setQuery]=useState("");
 const catalog=state.catalogs.find(c=>c.providerId===providerId),refreshingNow=refreshing.includes(providerId);
 const matches=(catalog?.models||[]).filter(m=>m.id.toLowerCase().includes(query.toLowerCase())),missing=matches.filter(m=>!state.candidates.some(c=>c.providerId===providerId&&c.model===m.id));
 return <section aria-label="新增通道来源"><h3>从已接入上游新增通道</h3><p className={styles.ruleNote}>先选择上游，再添加并确认实际模型；返回后从“添加供应通道”中选入本模型。{row.modality==="text"&&row.features.some(f=>["canvas.assistant","canvas.ocr"].includes(f.id))&&"当前用途需要图片理解能力。"}</p><label className={styles.field}>已接入上游<select aria-label="新增通道的上游来源" value={providerId} disabled={locked} onChange={e=>{setProviderId(e.target.value);setQuery("");}}><option value="">选择上游来源</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{providerId&&<><button type="button" className={styles.secondary} disabled={locked||refreshingNow} onClick={()=>onRefresh(providerId)}>{refreshingNow?<Loader2 size={14} className={styles.spin}/>:<RefreshCw size={14}/>}刷新此上游目录</button><label className={styles.search}><Search size={14}/><input aria-label="搜索新增通道模型" placeholder="搜索实际模型 ID" value={query} onChange={e=>setQuery(e.target.value)}/></label><p className={styles.ruleNote}>{catalog?.stale?"目录已过期，请刷新后添加。":catalog?.status==="error"?catalog.error:"目录仅代表模型 ID 可访问，不代表全部能力已验证。"}</p><div className={styles.catalogList}>{missing.slice(0,30).map(m=><div key={m.id}><code>{m.id}</code><button type="button" disabled={locked||refreshingNow||catalog?.stale||catalog?.status!=="ok"} onClick={()=>onRegister(providerId,m.id)}>添加并确认能力 <Plus size={13}/></button></div>)}</div>{!missing.length&&<p className={styles.ruleNote}>{matches.length?"匹配模型已接入，兼容的模型可从上方“添加供应通道”选入；不满足用途能力的模型需先核对能力。":"暂无匹配模型，请刷新目录或调整搜索。"}</p>}{missing.length>30&&<p className={styles.ruleNote}>共 {missing.length} 个待接入模型，请搜索缩小范围。</p>}</>}</section>;
}
