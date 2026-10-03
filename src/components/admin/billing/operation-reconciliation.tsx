"use client";
import { useEffect, useState } from "react";
import { authHeader } from "@/lib/supabase";
import type { BillingQuote } from "@/lib/billing/types";
import { settlementFor } from "@/lib/billing/quote";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { Field, NumberField, Choice, control } from "./fields";
export function OperationReconciliation() {
    const [rows, setRows] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [success, setSuccess] = useState(0), [quality, setQuality] = useState("medium"), [reason, setReason] = useState(""), [proof, setProof] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [commandId, setCommandId] = useState<string | null>(null);
    const request = async (path: string, body?: unknown) => { const r = await fetch(path, { cache: "no-store", method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...await authHeader() }, ...(body ? { body: JSON.stringify(body) } : {}) }), data = await r.json(); if (!r.ok)
        throw new Error(data.error || "操作失败"); return data; };
    const load = async () => { try {
        setRows(await request("/api/admin/billing/operations"));
    }
    catch (e) {
        setError((e as Error).message);
    } };
    useEffect(() => { void load(); }, []);
    const quote = selected?.quote as BillingQuote | undefined;
    const result = { state: success > 0 ? "succeeded" as const : "failed" as const, items: quote ? Array.from({ length: quote.facts.quantity }, (_, i) => ({ id: `manual-${i}`, state: i < success ? "succeeded" as const : "failed" as const, executedQuality: quality })) : [] };
    let charge: number | null = null;
    try {
        if (quote)
            charge = settlementFor(quote, result).charge;
    }
    catch { }
    async function settle() { if (!quote)
        return; setBusy(true); setError(""); const id = commandId ?? crypto.randomUUID(); setCommandId(id); try {
        const data = await request("/api/admin/billing/operations", { id, operationId: selected.id, reason, proof, result });
        setMessage(`已核对，实际结算 ${data.charge} 积分。原任务产物继续沿原恢复链路处理。`);
        setSelected(null);
        setCommandId(null);
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="space-y-4"><h2 className="text-lg font-semibold">待人工核对</h2><p className="text-sm text-muted-foreground">先核对供应商结果及已保存产物，再按原任务报价结算。这里不会再次调用供应商；核对记录保留操作者和依据。</p>{!rows.length && <p className="text-sm">没有待核对操作。</p>}{rows.map(row => <button key={row.id} className="block w-full rounded-lg border p-3 text-left text-sm" onClick={async () => { try {
        setSelected(await request(`/api/admin/billing/operations?id=${encodeURIComponent(row.id)}`));
        setSuccess(0);
        setReason("");
        setProof("");
        setCommandId(null);
    }
    catch (e) {
        setError((e as Error).message);
    } }}>{row.email} · {FEATURE_LABELS[row.feature as keyof typeof FEATURE_LABELS] || row.feature} · 保留 {row.reserved_credits} 积分<p className="break-all text-xs text-muted-foreground">{row.id}</p></button>)}{quote && <div className="space-y-4 rounded-xl border p-4"><p className="text-sm">报价版本 {quote.configVersion}，任务数量 {quote.facts.quantity}</p><NumberField label="已确认成功数量" value={success} max={quote.facts.quantity} onChange={n => { setSuccess(n); setCommandId(null); }}/><Choice label="已确认执行质量" value={quality} options={["low", "medium", "high", "xhigh", "max", "auto"].map(q => [q, q])} onChange={v => { setQuality(v); setCommandId(null); }}/><Field label="核对说明"><input className={control} value={reason} onChange={e => { setReason(e.target.value); setCommandId(null); }}/></Field><Field label="供应商结果或产物核对依据"><textarea className={control} value={proof} onChange={e => { setProof(e.target.value); setCommandId(null); }}/></Field><p className="text-sm font-medium">本次实际结算：{charge ?? "无效结果"} 积分，其余预占释放。</p><button disabled={busy || charge === null || reason.trim().length < 3 || proof.trim().length < 3} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={() => void settle()}>确认账务核对</button></div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}<button className="text-sm text-primary" onClick={() => void load()}>刷新待核对列表</button></section>;
}
