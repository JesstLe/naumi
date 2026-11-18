"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSearchParams } from "@/lib/app-router-navigation";
import Link from "next/link";
import type { BillingConfig, ConfigSnapshot, FeatureId } from "@/lib/billing/types";
import { FEATURE_IDS } from "@/lib/billing/rules/registry";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { authHeader } from "@/lib/supabase";
import { Choice, Field, NumberField, YuanField, ExpiryEditor, control } from "./fields";
import { BusinessPrices } from "./business-prices";
import { CostEditor } from "./cost-editor";
import { RuleEditor } from "./rule-editor";
import { QuoteSimulator } from "./quote-simulator";
import { OperationReconciliation } from "./operation-reconciliation";
import { VersionHistory } from "./version-history";
import { configChanges, describeChange, mergeConfigDraft } from "@/lib/billing/config-diff";
import { replaceAdminQuery } from "../query-navigation";
import { resolveLegacyBillingTab, type BillingTab } from "./legacy-tabs";
function changes(before: BillingConfig, after: BillingConfig) { const result: string[] = []; for (const id of FEATURE_IDS) {
    for (const [key, label] of [["pricing", "价格"], ["settlement", "结算策略"], ["rules", "条件规则"], ["enabled", "功能开关"]] as const)
        if (JSON.stringify(before.features[id][key]) !== JSON.stringify(after.features[id][key]))
            result.push(`${FEATURE_LABELS[id]}：${label}已修改`);
} for (const [key, label] of [["products", "商品价格、积分或有效期"], ["costs", "供应商估计成本"], ["credits", "积分发放与到期规则"], ["switches", "计费与购买开关"], ["thresholds", "确认及付费门槛"]] as const)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
        result.push(`${label}已修改`); return result; }
export function BillingManager({initialTab="prices"}:{initialTab?:BillingTab}={}) {
    const query = useAppSearchParams();
    const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null), [draft, setDraft] = useState<BillingConfig | null>(null), [reason, setReason] = useState(""), [error, setError] = useState<string | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [restoreTarget, setRestoreTarget] = useState<number | null>(null), [effective, setEffective] = useState<any>(null), [publication, setPublication] = useState<string | null>(null);
    const selectedFeature = query.get("feature") as FeatureId | null;
    const tab = resolveLegacyBillingTab(query.get("tab"), query.get("section")) ?? initialTab;
    const feature = selectedFeature && FEATURE_IDS.includes(selectedFeature) ? selectedFeature : "image.generate";
    const showOperations = tab === "operations", hasSnapshot = !!snapshot;
    const [operationsVisited, setOperationsVisited] = useState(showOperations);
    useEffect(() => { if (showOperations) setOperationsVisited(true); }, [showOperations]);
    function setTab(next: BillingTab) { if(next!=="history") cancelRestore(); replaceAdminQuery({ tab: next }); }
    function setFeature(next: FeatureId) { replaceAdminQuery({ feature: next }); }
    const [selectedCost, setSelectedCost] = useState<string>("");
    const [latestSnapshot, setLatestSnapshot] = useState<ConfigSnapshot | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null), [readingSnapshot, setReadingSnapshot] = useState(false);
    const snapshotRead = useRef<AbortController | null>(null);
    const restoreRead = useRef<{version:number;controller:AbortController} | null>(null);
    const [readingRestore,setReadingRestore]=useState<number | null>(null);
    const publicationInFlight=useRef(false);
    function cancelRestore(){
        restoreRead.current?.controller.abort();
        restoreRead.current=null;
        setReadingRestore(null);
    }
    const request = useCallback(async (url: string, body?: unknown, signal?: AbortSignal) => {
        const headers = { "content-type": "application/json", ...await authHeader() }; signal?.throwIfAborted();
        const r = await fetch(url, { cache: "no-store", method: body ? "POST" : "GET", headers, signal, ...(body ? { body: JSON.stringify(body) } : {}) }), data = await r.json();
        if (!r.ok) throw new Error(data.error || "操作失败"); return data;
    }, []);
    const readSnapshot = useCallback(async (baseVersion?: number) => {
        if (snapshotRead.current) return;
        const controller = new AbortController(); snapshotRead.current = controller;
        const current = () => snapshotRead.current === controller && !controller.signal.aborted;
        setReadingSnapshot(true);
        if (baseVersion === undefined) setLoadError(null); else setError(null);
        try {
            const data = await request("/api/admin/billing", undefined, controller.signal);
            if (!current()) return;
            if (baseVersion === undefined) {
                setSnapshot(data.snapshot);
                setDraft(structuredClone(data.snapshot.config));
                setEffective(data.effective);
            } else {
                setLatestSnapshot(data.snapshot);
                setMessage(`服务器当前版本 ${data.snapshot.version}。草稿以版本 ${baseVersion} 为基准。`);
            }
        } catch (e) {
            if (current()) (baseVersion === undefined ? setLoadError : setError)(e instanceof Error ? e.message : "读取失败");
        } finally {
            if (current()) { snapshotRead.current = null; setReadingSnapshot(false); }
        }
    }, [request]);
    useEffect(() => {
        if (showOperations) { setReadingSnapshot(false); return; }
        if (!hasSnapshot) void readSnapshot();
        return () => { snapshotRead.current?.abort(); snapshotRead.current = null; };
    }, [showOperations, hasSnapshot, readSnapshot]);
    useEffect(()=>{
        setReadingRestore(null);
        return()=>{restoreRead.current?.controller.abort();restoreRead.current=null;};
    },[tab,snapshot?.version]);
    const edit = (action: (value: BillingConfig) => void) => { if (!draft || publicationInFlight.current)
        return; cancelRestore(); const next = structuredClone(draft); action(next); setDraft(next); setPreview(false); setPublication(null); setRestoreTarget(null); setMessage(""); };
    async function publish() { if (!draft || !snapshot || !reason.trim() || publicationInFlight.current || restoreRead.current || snapshotRead.current)
        return; const id = publication ?? crypto.randomUUID(); publicationInFlight.current=true; setBusy(true); setError(null); setPublication(id); try {
        const result = await request(restoreTarget ? "/api/admin/billing/versions" : "/api/admin/billing", restoreTarget ? { id, expectedVersion: snapshot.version, targetVersion: restoreTarget, reason } : { id, expectedVersion: snapshot.version, config: draft, reason });
        setSnapshot(result);
        setDraft(structuredClone(result.config));
        setLatestSnapshot(null);
        setPreview(false);
        setRestoreTarget(null);
        setPublication(null);
        setMessage(`已发布版本 ${result.version}，新任务开始使用该配置。`);
        setReason("");
    }
    catch (e) {
        setError(`${e instanceof Error ? e.message : "发布失败"}。草稿已保留；可查看当前版本后重新核对。`);
    }
    finally {
        publicationInFlight.current=false;
        setBusy(false);
    } }
    async function restore(version: number) {
        if(publicationInFlight.current||restoreRead.current?.version===version)return;
        const controller=new AbortController(),task={version,controller};
        restoreRead.current?.controller.abort();restoreRead.current=task;
        const current=()=>restoreRead.current===task&&!controller.signal.aborted;
        setReadingRestore(version);setError(null);setMessage("");
        try {
        const data = await request(`/api/admin/billing/versions?version=${version}`,undefined,controller.signal);
        if(!current())return;
        if(data.version!==version)throw new Error("历史版本不匹配");
        setDraft(data.config);
        setRestoreTarget(version);
        setReason(`恢复版本 ${version}`);
        setPreview(true);
        setPublication(null);
        setMessage("已载入历史配置预览，确认改动后发布。");
    }
    catch (e) {
        if(current())setError(e instanceof Error ? e.message : "读取历史失败");
    } finally {
        if(current()){restoreRead.current=null;setReadingRestore(null);}
    } }
    function rebaseDraft(){
        if(!snapshot||!draft||!latestSnapshot||publicationInFlight.current||snapshotRead.current)return;
        cancelRestore();
        const merged=restoreTarget===null?mergeConfigDraft(snapshot.config,draft,latestSnapshot.config):null;
        setSnapshot(latestSnapshot);
        if(merged)setDraft(merged.config);
        setLatestSnapshot(null);setPublication(null);setPreview(true);setError(null);
        setMessage(merged
            ? merged.conflicts.length
                ? `已合并，以下字段同时被修改，保留你的草稿值，请核对：${merged.conflicts.join('；')}`
                : "已采用当前版本，保留你的修改及其他管理员的新配置，请核对后发布。"
            : "已更新当前版本。恢复仍使用所选历史配置，请核对后发布。");
    }
    const diff = draft && snapshot && !showOperations ? changes(snapshot.config, draft) : [];
    return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-6"><header className="flex flex-col justify-between gap-4 sm:flex-row"><div><h1 className="text-2xl font-semibold">计费管理</h1>{!showOperations && snapshot && <p className="mt-2 text-sm text-muted-foreground">当前版本 {snapshot.version}。选择业务操作，调整积分价格或供应商成本，核对后发布。已有任务和订单保留原规则。</p>}</div>{!showOperations && snapshot && <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm">{effective?.metering ? "积分计费开启" : "积分计费关闭"}{effective?.environmentCommerce === false && <p className="mt-1 text-xs text-muted-foreground">服务器购买总开关关闭</p>}</div>}</header>
 <nav className="flex flex-wrap gap-2" aria-label="计费管理分区">{([["prices", "业务收费"], ["costs", "供应商成本"], ["rules", "特殊定价规则"], ["products", "充值套餐"], ["credits", "赠送与总开关"], ["history", "版本历史"], ["operations", "人工核对"]] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} className={`rounded-lg px-4 py-2 text-sm ${tab === id ? 'bg-primary text-primary-foreground' : 'border bg-card'}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
 {(operationsVisited || showOperations) && <div hidden={!showOperations}><div className="rounded-2xl border bg-card p-4 sm:p-6"><OperationReconciliation active={showOperations} /></div></div>}
 {!showOperations && (draft && snapshot ? <><div className="rounded-2xl border bg-card p-4 sm:p-6">{(tab === "rules") && <div className="mb-6 max-w-sm"><Choice label="选择功能" value={feature} options={FEATURE_IDS.map(id => [id, FEATURE_LABELS[id]])} onChange={v => setFeature(v as FeatureId)}/></div>}
 {tab === "prices" && <BusinessPrices config={draft} feature={feature} onSelect={setFeature} onChange={value => edit(c => { c.features[feature] = value; })} onCost={() => { setSelectedCost(feature); setTab("costs"); }}/>}
 {tab === "rules" && <RuleEditor tariff={draft.features[feature]} costKeys={Object.keys(draft.costs)} onChange={t => edit(c => { c.features[feature] = t; })}/>}
 {tab === "costs" && <CostEditor requestedKey={selectedCost} costs={draft.costs} onChange={v => edit(c => { c.costs = v; })}/>}
 {tab === "products" && <div className="space-y-5"><p className="text-sm text-muted-foreground">付款按订单创建时的金额与积分到账。历史订阅和授权商品保持停售。</p>{Object.values(draft.products).map(p => <details key={p.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{p.title} · ¥{(p.amountFen / 100).toFixed(2)} · {p.baseCredits + p.bonusCredits} 积分{!p.available && " · 停售"}</summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label={`${p.id} · 名称`}><input className={control} value={p.title} onChange={e => edit(c => { c.products[p.id].title = e.target.value; })}/></Field><YuanField label={`${p.id} · 售价（元）`} value={p.amountFen} onChange={n => edit(c => { c.products[p.id].amountFen = n; })}/><NumberField label={`${p.id} · 基础积分`} value={p.baseCredits} onChange={n => edit(c => { c.products[p.id].baseCredits = n; })}/><NumberField label={`${p.id} · 赠送积分`} value={p.bonusCredits} onChange={n => edit(c => { c.products[p.id].bonusCredits = n; })}/><ExpiryEditor label={`${p.id} · 有效期`} value={p.expiry} onChange={v => edit(c => { c.products[p.id].expiry = v; })}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.available} disabled={p.kind !== "pack"} onChange={e => edit(c => { c.products[p.id].available = e.target.checked; })}/>开放购买{p.kind !== "pack" && "（历史商品禁止开启）"}</label></div></details>)}</div>}
 {tab === "credits" && <div className="grid gap-5 sm:grid-cols-2"><Link className="text-sm text-primary underline sm:col-span-2" href={`/admin?view=settings&tab=account-credits${query.get("email") ? `&email=${encodeURIComponent(query.get("email")!)}` : ""}`}>账号积分调整</Link><NumberField label="注册赠送积分" value={draft.credits.signup.amount} onChange={n => edit(c => { c.credits.signup.amount = n; })}/><ExpiryEditor label="注册赠送有效期" value={draft.credits.signup.expiry} onChange={v => edit(c => { c.credits.signup.expiry = v; })}/>{([['purchase', '购买默认有效期'], ['redeem', '新兑换码积分有效期'], ['admin', '管理员赠送默认有效期']] as const).map(([key, label]) => <ExpiryEditor key={key} label={label} value={draft.credits[key]} onChange={v => edit(c => { c.credits[key] = v; })}/>)}<Choice label="扣款批次顺序" value={draft.credits.debitOrder} options={[["expires-first", "先到期先扣"], ["created-first", "先到账先扣"]]} onChange={v => edit(c => { c.credits.debitOrder = v as typeof c.credits.debitOrder; })}/><NumberField label="旧任务预占等待时间（分钟）" value={draft.credits.staleReservationMinutes} min={1} max={525600} onChange={n => edit(c => { c.credits.staleReservationMinutes = n; })}/><Choice label="积分计费模式" value={draft.switches.metering} options={[["legacy-auto", "沿用原运行模式"], ["on", "开启计费"], ["off", "关闭计费"]]} onChange={v => edit(c => { c.switches.metering = v as typeof c.switches.metering; })}/><p className="text-sm text-muted-foreground">历史高质量门槛保留为兼容字段，当前未启用准入限制；按累计付款区分价格请使用条件规则。</p><NumberField label="Agent 大额确认门槛（积分）" value={draft.thresholds.agentConfirmCredits} onChange={n => edit(c => { c.thresholds.agentConfirmCredits = n; })}/>{([['commerce', '开放商品购买'], ['recharge', '开放在线充值']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.switches[key]} onChange={e => edit(c => { c.switches[key] = e.target.checked; })}/>{label}</label>)}</div>}
 {tab === "history" && <VersionHistory version={snapshot.version} previewing={readingRestore} publishing={busy} onRestore={restore}/>}
 </div><details className="rounded-2xl border bg-card p-4 sm:p-6"><summary className="cursor-pointer font-medium">详细报价试算（特殊条件与失败场景）</summary><div className="mt-5"><QuoteSimulator key={feature} config={draft} initialFeature={feature}/></div></details>
 <section className="rounded-2xl border bg-card p-4 sm:p-6"><Field label="发布说明"><input className={control} value={reason} disabled={busy} onChange={e => { if(publicationInFlight.current)return;cancelRestore();setReason(e.target.value);setPublication(null); }} placeholder="填写调整原因，保留在版本历史"/></Field><div className="mt-4 flex flex-wrap gap-3"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setPreview(true)}>查看改动</button><button disabled={busy || readingSnapshot || readingRestore!==null || !preview || (!diff.length && !restoreTarget) || !reason.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={() => void publish()}>发布配置</button><button disabled={busy || readingSnapshot} className="rounded-lg border px-4 py-2 text-sm" onClick={() => void readSnapshot(snapshot.version)}>查看当前版本</button>{latestSnapshot && latestSnapshot.version !== snapshot.version && <button disabled={busy || readingSnapshot} className="rounded-lg border px-4 py-2 text-sm" onClick={rebaseDraft}>以当前版本合并草稿</button>}</div>{preview && <div className="mt-4 space-y-2 text-sm"><h2 className="font-semibold">待发布改动</h2>{diff.length ? diff.map(line => <p key={line}>{line}</p>) : <p>没有改动。</p>}<div className="space-y-1 break-words">{configChanges(snapshot.config, draft).map(change => <p key={change.path.join("/")}>{describeChange(change)}</p>)}</div><p className="text-muted-foreground">新版本仅应用于随后创建的任务和订单。</p></div>}{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}{message && <p role="status" className="mt-4 text-sm">{message}</p>}</section></> : <div className="rounded-2xl border bg-card p-4 sm:p-6"><p role="status">{loadError || "正在读取计费配置…"}</p>{loadError && <button disabled={readingSnapshot} onClick={() => void readSnapshot()}>重新读取</button>}</div>)}</div>;
}
