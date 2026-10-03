"use client";
import { useEffect, useState } from "react";
import { authHeader } from "@/lib/supabase";
export function VersionHistory({ version, onRestore }: {
    version: number;
    onRestore: (version: number) => Promise<void>;
}) {
    const [history, setHistory] = useState<{
        version: number;
        actor: string;
        reason: string;
        createdAt: string;
    }[]>([]), [error, setError] = useState("");
    useEffect(() => { let cancelled = false; authHeader().then(headers => fetch("/api/admin/billing/versions", { headers, cache: "no-store" })).then(async (r) => { if (!r.ok)
        throw new Error("无法读取版本历史"); return r.json(); }).then(data => { if (!cancelled)
        setHistory(data); }).catch(e => setError(e.message)); return () => { cancelled = true; }; }, [version]);
    return <section className="space-y-4"><h2 className="text-lg font-semibold">版本历史</h2><p className="text-sm text-muted-foreground">恢复会发布一个新版本。已创建任务继续使用原报价。</p>{error && <p role="alert">{error}</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-3">版本</th><th>发布时间</th><th>操作者与说明</th><th /></tr></thead><tbody>{history.map(row => <tr key={row.version} className="border-b"><td className="py-3 pr-4">{row.version}{row.version === version && "（当前）"}</td><td className="whitespace-nowrap pr-4">{new Date(row.createdAt).toLocaleString("zh-CN")}</td><td className="min-w-40 pr-3">{row.actor}<p className="text-muted-foreground">{row.reason}</p></td><td><button disabled={row.version === version} className="text-primary disabled:opacity-40" onClick={() => void onRestore(row.version)}>预览恢复</button></td></tr>)}</tbody></table></div></section>;
}
