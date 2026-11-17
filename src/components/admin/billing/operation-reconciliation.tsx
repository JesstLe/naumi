"use client";
import { useEffect, useRef,useState,useCallback } from "react";
import { authHeader } from "@/lib/supabase";
import type { BillingQuote } from "@/lib/billing/types";
import { settlementFor } from "@/lib/billing/quote";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { Field, NumberField, Choice, control } from "./fields";
export function OperationReconciliation({active=true}:{active?:boolean}={}) {
    const [rows, setRows] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [success, setSuccess] = useState(0), [quality, setQuality] = useState("medium"), [reason, setReason] = useState(""), [proof, setProof] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [commandId, setCommandId] = useState<string | null>(null);
    const mounted=useRef(false),visible=useRef(false),submitting=useRef(false),listRequest=useRef<AbortController|null>(null);
    const detailRequest=useRef<{id:string;controller:AbortController}|null>(null);
    const request=useCallback(async(path:string,body?:unknown,signal?:AbortSignal)=>{
        const headers={"content-type":"application/json",...await authHeader()};signal?.throwIfAborted();
        const response=await fetch(path,{cache:"no-store",method:body?"POST":"GET",headers,signal,...(body?{body:JSON.stringify(body)}:{})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||"操作失败");return data;
    },[]);
    const load=useCallback(async(replace=false)=>{
        if(!visible.current||(listRequest.current&&!replace))return;
        listRequest.current?.abort();const controller=new AbortController();listRequest.current=controller;
        const current=()=>visible.current&&listRequest.current===controller&&!controller.signal.aborted;
        try{const value=await request('/api/admin/billing/operations',undefined,controller.signal);if(current())setRows(value);}
        catch(error){if(current())setError((error as Error).message);}
        finally{if(listRequest.current===controller)listRequest.current=null;}
    },[request]);
    useEffect(()=>{
        mounted.current=true;return()=>{mounted.current=false;};
    },[]);
    useEffect(()=>{
        if(!active)return;
        visible.current=true;void load();
        return()=>{visible.current=false;listRequest.current?.abort();listRequest.current=null;detailRequest.current?.controller.abort();detailRequest.current=null;};
    },[active,load]);
    const [splitQuality,setSplitQuality]=useState(false),[qualityCounts,setQualityCounts]=useState<Record<string,number>>({});
    const quote = selected?.quote as BillingQuote | undefined;
    const qualities=splitQuality?Object.entries(qualityCounts).flatMap(([q,n])=>Array.from({length:n},()=>q)):Array.from({length:success},()=>quality);
    const successes=qualities.length;
    const result = { state: successes > 0 ? "succeeded" as const : "failed" as const, items: quote ? Array.from({ length: quote.facts.quantity }, (_, i) => ({ id: `manual-${i}`, state: i < successes ? "succeeded" as const : "failed" as const, executedQuality: qualities[i]||quality })) : [] };
    let charge: number | null = null;
    try {
        if (quote)
            charge = settlementFor(quote, result).charge;
    }
    catch { }
    async function open(operationId:string){
        if(!visible.current||submitting.current||detailRequest.current?.id===operationId)return;
        detailRequest.current?.controller.abort();const controller=new AbortController(),task={id:operationId,controller};detailRequest.current=task;
        const current=()=>visible.current&&detailRequest.current===task&&!controller.signal.aborted;
        setSelected(null);setError("");setSplitQuality(false);setQualityCounts({});setSuccess(0);setReason("");setProof("");setCommandId(null);
        try{const value=await request(`/api/admin/billing/operations?id=${encodeURIComponent(operationId)}`,undefined,controller.signal);if(current())setSelected(value);}
        catch(error){if(current())setError((error as Error).message);}
        finally{if(detailRequest.current===task)detailRequest.current=null;}
    }
    async function settle() { if (!quote||!visible.current||submitting.current)
        return; submitting.current=true;setBusy(true); setError(""); const id = commandId ?? crypto.randomUUID(); setCommandId(id); try {
        const data = await request("/api/admin/billing/operations", { id, operationId: selected.id, reason, proof, result });
        if(!mounted.current)return;
        setMessage(`已核对，实际结算 ${data.charge} 积分。原任务产物继续沿原恢复链路处理。`);
        setSelected(null);
        setCommandId(null);
        await load(true);
    }
    catch (e) {
        if(mounted.current)setError((e as Error).message);
    }
    finally {
        submitting.current=false;if(mounted.current)setBusy(false);
    } }
    return <section className="space-y-4"><h2 className="text-lg font-semibold">待人工核对</h2><p className="text-sm text-muted-foreground">先核对供应商结果及已保存产物，再按原任务报价结算。这里不会再次调用供应商；核对记录保留操作者和依据。</p>{!rows.length && <p className="text-sm">没有待核对操作。</p>}{rows.map(row => <button key={row.id} disabled={busy} className="block w-full rounded-lg border p-3 text-left text-sm" onClick={()=>void open(row.id)}>{row.email} · {FEATURE_LABELS[row.feature as keyof typeof FEATURE_LABELS] || row.feature} · 保留 {row.reserved_credits} 积分<p className="break-all text-xs text-muted-foreground">{row.id}</p></button>)}{quote && <fieldset disabled={busy} className="min-w-0 space-y-4 rounded-xl border p-4"><p className="text-sm">报价版本 {quote.configVersion}，任务数量 {quote.facts.quantity}</p><NumberField label="已确认成功数量" value={success} max={quote.facts.quantity} onChange={n => { setSuccess(n); setCommandId(null); }}/><Choice label="已确认执行质量" value={quality} options={["low", "medium", "high", "xhigh", "max", "auto"].map(q => [q, q])} onChange={v => { setQuality(v); setCommandId(null); }}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={splitQuality} onChange={e=>{setSplitQuality(e.target.checked);setCommandId(null);}}/>按不同执行质量分别填报成功数量</label>{splitQuality&&<div className="grid gap-3 sm:grid-cols-2">{["low","medium","high","xhigh","max","auto"].map(q=><NumberField key={q} label={`${q} 成功数量`} value={qualityCounts[q]||0} max={quote.facts.quantity} onChange={n=>{setQualityCounts(c=>({...c,[q]:n}));setCommandId(null);}}/>)}</div>}<Field label="核对说明"><input className={control} value={reason} onChange={e => { setReason(e.target.value); setCommandId(null); }}/></Field><Field label="供应商结果或产物核对依据"><textarea className={control} value={proof} onChange={e => { setProof(e.target.value); setCommandId(null); }}/></Field><p className="text-sm font-medium">本次实际结算：{charge ?? "无效结果"} 积分，其余预占释放。</p><button disabled={busy || successes>quote.facts.quantity || charge === null || reason.trim().length < 3 || proof.trim().length < 3} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={() => void settle()}>确认账务核对</button></fieldset>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}<button className="text-sm text-primary" onClick={() => void load()}>刷新待核对列表</button></section>;
}
