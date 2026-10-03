"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { BillingConfig, ConfigSnapshot, FeatureId } from "@/lib/billing/types";
import { FEATURE_IDS } from "@/lib/billing/rules/registry";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { authHeader } from "@/lib/supabase";
import { Choice, Field, NumberField, ExpiryEditor, control } from "./fields";
import { PricingEditor, SettlementEditor } from "./price-editor";
import { CostEditor } from "./cost-editor";
import { RuleEditor } from "./rule-editor";
import { QuoteSimulator } from "./quote-simulator";
import { OperationReconciliation } from "./operation-reconciliation";
import { VersionHistory } from "./version-history";
import { configChanges, describeChange, mergeConfigDraft } from "@/lib/billing/config-diff";
type Tab = "prices" | "costs" | "rules" | "products" | "credits" | "history" | "operations";
function changes(before: BillingConfig, after: BillingConfig) { const result: string[] = []; for (const id of FEATURE_IDS) {
    for (const [key, label] of [["pricing", "价格"], ["settlement", "结算策略"], ["rules", "条件规则"], ["enabled", "功能开关"]] as const)
        if (JSON.stringify(before.features[id][key]) !== JSON.stringify(after.features[id][key]))
            result.push(`${FEATURE_LABELS[id]}：${label}已修改`);
} for (const [key, label] of [["products", "商品价格、积分或有效期"], ["costs", "供应商估计成本"], ["credits", "积分发放与到期规则"], ["switches", "计费与购买开关"], ["thresholds", "确认及付费门槛"]] as const)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
        result.push(`${label}已修改`); return result; }
export function BillingManager() {
    const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null), [draft, setDraft] = useState<BillingConfig | null>(null), [tab, setTab] = useState<Tab>("prices"), [feature, setFeature] = useState<FeatureId>("image.generate"), [reason, setReason] = useState(""), [error, setError] = useState<string | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [restoreTarget, setRestoreTarget] = useState<number | null>(null), [effective, setEffective] = useState<any>(null), [publication, setPublication] = useState<string | null>(null);
    const [latestSnapshot, setLatestSnapshot] = useState<ConfigSnapshot | null>(null);
    const request = useCallback(async (url: string, body?: unknown) => { const r = await fetch(url, { cache: "no-store", method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...await authHeader() }, ...(body ? { body: JSON.stringify(body) } : {}) }), data = await r.json(); if (!r.ok)
        throw new Error(data.error || "操作失败"); return data; }, []);
    const load = useCallback(async () => { setBusy(true); try {
        const data = await request("/api/admin/billing");
        setSnapshot(data.snapshot);
        setDraft(structuredClone(data.snapshot.config));
        setEffective(data.effective);
        setError(null);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "读取失败");
    }
    finally {
        setBusy(false);
    } }, [request]);
    useEffect(() => { void load(); }, [load]);
    const edit = (action: (value: BillingConfig) => void) => { if (!draft)
        return; const next = structuredClone(draft); action(next); setDraft(next); setPreview(false); setPublication(null); setRestoreTarget(null); setMessage(""); };
    async function publish() { if (!draft || !snapshot || !reason.trim())
        return; setBusy(true); setError(null); const id = publication ?? crypto.randomUUID(); setPublication(id); try {
        const result = await request(restoreTarget ? "/api/admin/billing/versions" : "/api/admin/billing", restoreTarget ? { id, expectedVersion: snapshot.version, targetVersion: restoreTarget, reason } : { id, expectedVersion: snapshot.version, config: draft, reason });
        setSnapshot(result);
        setDraft(structuredClone(result.config));
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
        setBusy(false);
    } }
    async function restore(version: number) { try {
        const data = await request(`/api/admin/billing/versions?version=${version}`);
        setDraft(data.config);
        setRestoreTarget(version);
        setReason(`恢复版本 ${version}`);
        setPreview(true);
        setPublication(null);
        setMessage("已载入历史配置预览，确认改动后发布。");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "读取历史失败");
    } }
    if (!draft || !snapshot)
        return <div className="mx-auto max-w-6xl p-6"><p role="status">{error || "正在读取计费配置…"}</p>{error && <button onClick={() => void load()}>重新读取</button>}</div>;
    const tariff = draft.features[feature], diff = changes(snapshot.config, draft), costKeys = Object.keys(draft.costs);
    return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-6"><header className="flex flex-col justify-between gap-4 sm:flex-row"><div><Link href="/admin" className="text-sm text-primary">返回管理后台</Link><h1 className="mt-3 text-2xl font-semibold">计费管理</h1><p className="mt-2 text-sm text-muted-foreground">当前版本 {snapshot.version}。修改影响新任务，已有任务和订单沿用创建时规则。</p></div><div className="self-start rounded-lg bg-muted px-3 py-2 text-sm">{effective?.metering ? "积分计费开启" : "积分计费关闭"}{effective?.environmentCommerce === false && <p className="mt-1 text-xs text-muted-foreground">服务器购买总开关关闭</p>}</div></header>
 <nav className="flex flex-wrap gap-2" aria-label="计费管理分区">{([["prices", "功能价格"], ["costs", "供应商成本"], ["rules", "条件规则"], ["products", "商品与充值"], ["credits", "积分与开关"], ["history", "版本历史"], ["operations", "人工核对"]] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} className={`rounded-lg px-4 py-2 text-sm ${tab === id ? 'bg-primary text-primary-foreground' : 'border bg-card'}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
 <div className="rounded-2xl border bg-card p-4 sm:p-6">{(tab === "prices" || tab === "rules") && <div className="mb-6 max-w-sm"><Choice label="选择功能" value={feature} options={FEATURE_IDS.map(id => [id, FEATURE_LABELS[id]])} onChange={v => setFeature(v as FeatureId)}/></div>}
 {tab === "prices" && <div className="space-y-6"><label className="flex gap-2 text-sm"><input type="checkbox" checked={tariff.enabled} onChange={e => edit(c => { c.features[feature].enabled = e.target.checked; })}/>本功能参与积分计费</label><PricingEditor label={FEATURE_LABELS[feature]} value={tariff.pricing} costKeys={costKeys} onChange={p => edit(c => { c.features[feature].pricing = p; })}/><div className="border-t pt-6"><h2 className="mb-4 text-lg font-semibold">结算策略</h2><SettlementEditor value={tariff.settlement} onChange={p => edit(c => { c.features[feature].settlement = p; })}/></div></div>}
 {tab === "rules" && <RuleEditor tariff={tariff} costKeys={costKeys} onChange={t => edit(c => { c.features[feature] = t; })}/>}
 {tab === "costs" && <CostEditor costs={draft.costs} onChange={v => edit(c => { c.costs = v; })}/>}
 {tab === "products" && <div className="space-y-5"><p className="text-sm text-muted-foreground">付款按订单创建时的金额与积分到账。历史订阅和授权商品保持停售。</p>{Object.values(draft.products).map(p => <details key={p.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{p.title} · ¥{(p.amountFen / 100).toFixed(2)} · {p.baseCredits + p.bonusCredits} 积分{!p.available && " · 停售"}</summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label={`${p.id} · 名称`}><input className={control} value={p.title} onChange={e => edit(c => { c.products[p.id].title = e.target.value; })}/></Field><NumberField label={`${p.id} · 售价（分）`} value={p.amountFen} onChange={n => edit(c => { c.products[p.id].amountFen = n; })}/><NumberField label={`${p.id} · 基础积分`} value={p.baseCredits} onChange={n => edit(c => { c.products[p.id].baseCredits = n; })}/><NumberField label={`${p.id} · 赠送积分`} value={p.bonusCredits} onChange={n => edit(c => { c.products[p.id].bonusCredits = n; })}/><ExpiryEditor label={`${p.id} · 有效期`} value={p.expiry} onChange={v => edit(c => { c.products[p.id].expiry = v; })}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.available} disabled={p.kind !== "pack"} onChange={e => edit(c => { c.products[p.id].available = e.target.checked; })}/>开放购买{p.kind !== "pack" && "（历史商品禁止开启）"}</label></div></details>)}</div>}
 {tab === "credits" && <div className="grid gap-5 sm:grid-cols-2"><NumberField label="注册赠送积分" value={draft.credits.signup.amount} onChange={n => edit(c => { c.credits.signup.amount = n; })}/><ExpiryEditor label="注册赠送有效期" value={draft.credits.signup.expiry} onChange={v => edit(c => { c.credits.signup.expiry = v; })}/>{([['purchase', '购买默认有效期'], ['redeem', '新兑换码积分有效期'], ['admin', '管理员赠送默认有效期']] as const).map(([key, label]) => <ExpiryEditor key={key} label={label} value={draft.credits[key]} onChange={v => edit(c => { c.credits[key] = v; })}/>)}<Choice label="扣款批次顺序" value={draft.credits.debitOrder} options={[["expires-first", "先到期先扣"], ["created-first", "先到账先扣"]]} onChange={v => edit(c => { c.credits.debitOrder = v as typeof c.credits.debitOrder; })}/><NumberField label="旧任务预占等待时间（分钟）" value={draft.credits.staleReservationMinutes} min={1} max={525600} onChange={n => edit(c => { c.credits.staleReservationMinutes = n; })}/><Choice label="积分计费模式" value={draft.switches.metering} options={[["legacy-auto", "沿用原运行模式"], ["on", "开启计费"], ["off", "关闭计费"]]} onChange={v => edit(c => { c.switches.metering = v as typeof c.switches.metering; })}/><p className="text-sm text-muted-foreground">历史高质量门槛保留为兼容字段，当前未启用准入限制；按累计付款区分价格请使用条件规则。</p><NumberField label="Agent 大额确认门槛（积分）" value={draft.thresholds.agentConfirmCredits} onChange={n => edit(c => { c.thresholds.agentConfirmCredits = n; })}/>{([['commerce', '开放商品购买'], ['recharge', '开放在线充值']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.switches[key]} onChange={e => edit(c => { c.switches[key] = e.target.checked; })}/>{label}</label>)}</div>}
 {tab === "operations" && <OperationReconciliation />}
 {tab === "history" && <VersionHistory version={snapshot.version} onRestore={restore}/>}
 </div><div className="rounded-2xl border bg-card p-4 sm:p-6"><QuoteSimulator config={draft} initialFeature={feature}/></div>
 <section className="rounded-2xl border bg-card p-4 sm:p-6"><Field label="发布说明"><input className={control} value={reason} onChange={e => { setReason(e.target.value); setPublication(null); }} placeholder="填写调整原因，保留在版本历史"/></Field><div className="mt-4 flex flex-wrap gap-3"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setPreview(true)}>查看改动</button><button disabled={busy || !preview || (!diff.length && !restoreTarget) || !reason.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={() => void publish()}>发布配置</button><button disabled={busy} className="rounded-lg border px-4 py-2 text-sm" onClick={async () => { try {
        const latest = await request("/api/admin/billing");
        setLatestSnapshot(latest.snapshot);
        setMessage(`服务器当前版本 ${latest.snapshot.version}。草稿以版本 ${snapshot.version} 为基准。`);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "读取失败");
    } }}>查看当前版本</button>{latestSnapshot && latestSnapshot.version !== snapshot.version && <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => { const merged = mergeConfigDraft(snapshot.config, draft, latestSnapshot.config); setSnapshot(latestSnapshot); setDraft(merged.config); setLatestSnapshot(null); setPublication(null); setPreview(true); setError(null); setMessage(merged.conflicts.length ? `已合并，以下字段同时被修改，保留你的草稿值，请核对：${merged.conflicts.join('；')}` : "已采用当前版本，保留你的修改及其他管理员的新配置，请核对后发布。"); }}>以当前版本合并草稿</button>}</div>{preview && <div className="mt-4 space-y-2 text-sm"><h2 className="font-semibold">待发布改动</h2>{diff.length ? diff.map(line => <p key={line}>{line}</p>) : <p>没有改动。</p>}<div className="space-y-1 break-words">{configChanges(snapshot.config, draft).map(change => <p key={change.path.join("/")}>{describeChange(change)}</p>)}</div><p className="text-muted-foreground">新版本仅应用于随后创建的任务和订单。</p></div>}{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}{message && <p role="status" className="mt-4 text-sm">{message}</p>}</section></div>;
}
