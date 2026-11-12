"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authHeader } from "@/lib/supabase";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import type { PendingOverview, PendingItem } from "@/lib/billing/pending-contracts";

const SOURCE_LABELS: Record<PendingItem["source"], string> = {
    "billing-operation": "账务操作",
    "image-job": "图片任务",
    "canvas-task": "画布任务",
    "video-task": "视频任务",
};
const OPERATION_STATES: Record<string, string> = { hold: "已保留", manual: "待人工核对" };

function duration(seconds: number) {
    if (seconds < 60) return `${seconds} 秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`;
    return `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小时`;
}
function ageClass(seconds: number) {
    if (seconds >= 86400) return "text-destructive";
    if (seconds >= 21600) return "text-amber-600";
    return "text-muted-foreground";
}
function age(item: PendingItem) {
    return Math.max(0, Math.floor((Date.now() - new Date(item.updatedAt || item.createdAt).getTime()) / 1000));
}
function kindLabel(item: PendingItem) {
    return item.source === "billing-operation"
        ? FEATURE_LABELS[item.kind as keyof typeof FEATURE_LABELS] || item.kind || "—"
        : item.kind || "—";
}
function needsReconcile(item: PendingItem) {
    return item.source === "billing-operation" || item.operationState === "hold" || item.operationState === "manual";
}

export function PendingReviewConsole() {
    const [data, setData] = useState<PendingOverview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
    const timer = useRef<number | null>(null);
    const load = useCallback(async () => {
        setBusy(true);
        try {
            const response = await fetch("/api/admin/billing/pending", { cache: "no-store", headers: await authHeader() });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "读取失败");
            setData(payload);
            setError("");
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }, []);
    useEffect(() => {
        void load();
        timer.current = window.setInterval(() => void load(), 60_000);
        return () => { if (timer.current) window.clearInterval(timer.current); };
    }, [load]);
    const summary = data?.summary;
    return <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
                <h2 className="text-lg font-semibold">待核查工作台</h2>
                <p className="text-sm text-muted-foreground">汇总账务保留/人工操作与四类待核查任务，按滞留时间排序；账务核对在「人工核对」页完成，供应商不会被再次调用。</p>
            </div>
            <button className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40" disabled={busy} onClick={() => void load()}>{busy ? "刷新中…" : "刷新"}</button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {summary && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(SOURCE_LABELS) as PendingItem["source"][]).map(source => {
                const entry = summary[source], seconds = entry.oldestAt ? Math.floor((Date.now() - new Date(entry.oldestAt).getTime()) / 1000) : 0;
                return <div key={source} className="rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">{SOURCE_LABELS[source]}</p>
                    <p className="text-2xl font-semibold">{entry.count}</p>
                    <p className={`text-xs ${entry.oldestAt ? ageClass(seconds) : "text-muted-foreground"}`}>{entry.oldestAt ? `最早滞留 ${duration(seconds)}` : "无滞留"}</p>
                </div>;
            })}
            <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">合计</p>
                <p className="text-2xl font-semibold">{summary.total}</p>
                <p className="text-xs text-muted-foreground">数据截至 {new Date(data!.generatedAt).toLocaleString("zh-CN", { hour12: false })}</p>
            </div>
        </div>}
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr><th className="p-2">滞留</th><th className="p-2">来源</th><th className="p-2">用户</th><th className="p-2">类型</th><th className="p-2">状态</th><th className="p-2">预占积分</th><th className="p-2">错误</th><th className="p-2">编号</th><th className="p-2">操作</th></tr>
                </thead>
                <tbody>
                    {data?.items.map(item => (
                        <tr key={`${item.source}:${item.id}`} className="border-t align-top">
                            <td className={`whitespace-nowrap p-2 ${ageClass(age(item))}`}>{duration(age(item))}</td>
                            <td className="whitespace-nowrap p-2">{SOURCE_LABELS[item.source]}</td>
                            <td className="break-all p-2">{item.email}</td>
                            <td className="p-2">{kindLabel(item)}</td>
                            <td className="whitespace-nowrap p-2">{item.source === "billing-operation" ? OPERATION_STATES[item.state] || item.state : item.operationState ? `任务滞留 · 账务${OPERATION_STATES[item.operationState] || item.operationState}` : "任务滞留"}</td>
                            <td className="whitespace-nowrap p-2">{item.reservedCredits || "—"}</td>
                            <td className="max-w-72 break-all p-2 text-xs text-muted-foreground">{[item.errorCode, item.error].filter(Boolean).join(" · ") || "—"}</td>
                            <td className="break-all p-2 font-mono text-xs text-muted-foreground">{item.id}</td>
                            <td className="whitespace-nowrap p-2">{needsReconcile(item) && <Link className="text-primary underline" href="/admin/billing?tab=operations">核对账务</Link>}</td>
                        </tr>
                    ))}
                    {data && !data.items.length && <tr><td className="p-4 text-center text-muted-foreground" colSpan={9}>没有待核查项。</td></tr>}
                </tbody>
            </table>
        </div>
        {data && data.items.length >= 200 && <p className="text-xs text-muted-foreground">仅显示最旧的 200 条；处理完当前条目后会显示其余项。</p>}
    </section>;
}
