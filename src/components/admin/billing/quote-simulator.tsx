"use client";
import { microsToDecimal } from "@/lib/billing/decimal";
import { useState } from "react";
import type { BillingConfig, FeatureId } from "@/lib/billing/types";
import { FEATURE_IDS, QUALITY_IDS, RESOLUTION_IDS } from "@/lib/billing/rules/registry";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { Choice, Field, NumberField, control } from "./fields";
import { authHeader } from "@/lib/supabase";
export function QuoteSimulator({ config, initialFeature }: {
    config: BillingConfig;
    initialFeature: FeatureId;
}) {
    const [feature, setFeature] = useState<FeatureId>(initialFeature), [quantity, setQuantity] = useState(1), [quality, setQuality] = useState("medium"), [resolution, setResolution] = useState("1K"), [success, setSuccess] = useState(1), [state, setState] = useState("succeeded"), [byok, setByok] = useState(false), [metered, setMetered] = useState(true), [paidFen, setPaidFen] = useState(0), [providerId, setProvider] = useState(""), [modelId, setModel] = useState(""), [userGroup, setGroup] = useState("default"), [executed, setExecuted] = useState("medium"), [result, setResult] = useState<any>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
    async function simulate() { setBusy(true); setError(null); try {
        const res = await fetch("/api/admin/billing/simulate", { method: "POST", headers: { "content-type": "application/json", ...await authHeader() }, body: JSON.stringify({ config, facts: { feature, quantity, quality, resolution, byok, metered, paidFen, userGroup, ...(providerId ? { providerId } : {}), ...(modelId ? { modelId } : {}) }, result: { state, items: Array.from({ length: quantity }, (_, i) => ({ id: `simulation-${i}`, state: state === "unknown" ? "unknown" : i < success && state !== "failed" ? "succeeded" : "failed", executedQuality: executed })) } }) }), data = await res.json();
        if (!res.ok)
            throw new Error(data.error);
        setResult(data);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "模拟失败");
    }
    finally {
        setBusy(false);
    } }
    return <section className="space-y-4"><h2 className="text-lg font-semibold">报价模拟</h2><p className="text-sm text-muted-foreground">使用当前草稿试算，不生成任务、不扣积分。</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Choice label="模拟功能" value={feature} options={FEATURE_IDS.map(id => [id, FEATURE_LABELS[id]])} onChange={v => setFeature(v as FeatureId)}/><NumberField label="模拟数量" value={quantity} min={1} max={10000} onChange={n => { setQuantity(n); setSuccess(n); }}/><Choice label="请求质量" value={quality} options={QUALITY_IDS.map(q => [q, q])} onChange={setQuality}/><Choice label="模拟分辨率" value={resolution} options={RESOLUTION_IDS.map(r => [r, r])} onChange={setResolution}/><Choice label="结果状态" value={state} options={[["succeeded", "已完成"], ["failed", "失败"], ["unknown", "未知"]]} onChange={setState}/><NumberField label="成功数量" value={success} max={quantity} onChange={setSuccess}/><Choice label="执行质量" value={executed} options={QUALITY_IDS.map(q => [q, q])} onChange={setExecuted}/><NumberField label="用户累计付款（分）" value={paidFen} onChange={setPaidFen}/>{[["供应商", providerId, setProvider], ["模型", modelId, setModel], ["用户分组", userGroup, setGroup]].map(([label, value, setter]) => <Field key={String(label)} label={String(label)}><input className={control} value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)}/></Field>)}</div><div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={metered} onChange={e => setMetered(e.target.checked)}/> 计费开启</label><label><input type="checkbox" checked={byok} onChange={e => setByok(e.target.checked)}/> 用户自带接口</label></div><button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" disabled={busy || quantity < 1 || quantity > 10000 || success > quantity} onClick={() => void simulate()}>模拟报价</button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{result && <div className="rounded-xl bg-muted p-4 text-sm"><p>结算金额：<strong data-testid="simulation-charge">{result.settlement.charge} 积分</strong></p><p>预占 {result.quote.reserveCredits} 积分；{result.settlement.state === "settle" ? "可结算" : result.settlement.state === "hold" ? "保留预占" : "需人工核对"}</p><p>命中规则：{result.quote.matchedRuleId || "默认价格"}</p><p>估计成本：{result.cost ? `${microsToDecimal(result.cost.amountMicros)} ${result.cost.currency}（估计）` : "未记录"}</p></div>}</section>;
}
