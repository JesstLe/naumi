"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeader } from "@/lib/supabase";
import { BILLING_HISTORY_CURSOR_HEADER, type BillingVersionSummary } from "@/lib/billing/version-history-contract";

export function VersionHistory({ version, previewing, publishing, onRestore }: {
    version: number;
    previewing: number | null;
    publishing: boolean;
    onRestore: (version: number) => Promise<void>;
}) {
    const [history, setHistory] = useState<BillingVersionSummary[]>([]);
    const [next, setNext] = useState<number | null>(null), [loading, setLoading] = useState(true);
    const [error, setError] = useState<{message:string;before?:number} | null>(null);
    const inFlight = useRef<AbortController | null>(null);
    const load = useCallback(async (before?: number) => {
        if(inFlight.current)return;
        const controller=new AbortController();inFlight.current=controller;
        const current=()=>inFlight.current===controller&&!controller.signal.aborted;
        setLoading(true);setError(null);
        try{
            const headers=await authHeader();controller.signal.throwIfAborted();
            const response=await fetch(`/api/admin/billing/versions${before===undefined?"":`?before=${before}`}`,{headers,cache:"no-store",signal:controller.signal});
            if(!response.ok)throw new Error("无法读取版本历史");
            const rows:BillingVersionSummary[]=await response.json(),cursor=Number(response.headers.get(BILLING_HISTORY_CURSOR_HEADER));
            if(!current())return;
            setHistory(previous=>before===undefined?rows:[...previous,...rows.filter(row=>row.version<before)]);
            setNext(Number.isSafeInteger(cursor)&&cursor>0&&cursor===rows.at(-1)?.version&&(before===undefined||cursor<before)?cursor:null);
        }catch(e){
            if(current())setError({message:e instanceof Error?e.message:"无法读取版本历史",before});
        }finally{
            if(current()){inFlight.current=null;setLoading(false);}
        }
    },[]);
    useEffect(()=>{
        setHistory([]);setNext(null);void load();
        return()=>{inFlight.current?.abort();inFlight.current=null;};
    },[version,load]);
    return <section className="space-y-4">
        <h2 className="text-lg font-semibold">版本历史</h2>
        <p className="text-sm text-muted-foreground">恢复会发布一个新版本。已创建任务继续使用原报价。</p>
        {history.length>0&&<div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="py-3">版本</th><th>发布时间</th><th>操作者与说明</th><th /></tr></thead>
            <tbody>{history.map(row=><tr key={row.version} className="border-b">
                <td className="py-3 pr-4">{row.version}{row.version===version&&"（当前）"}</td>
                <td className="whitespace-nowrap pr-4">{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                <td className="min-w-40 pr-3">{row.actor}<p className="text-muted-foreground">{row.reason}</p></td>
                <td><button disabled={row.version===version||publishing||previewing===row.version} className="text-primary disabled:opacity-40" onClick={()=>void onRestore(row.version)}>{previewing===row.version?"正在读取…":"预览恢复"}</button></td>
            </tr>)}</tbody>
        </table></div>}
        {loading&&!history.length&&<p role="status" className="text-sm">正在读取版本历史…</p>}
        {!loading&&!history.length&&!error&&<p className="text-sm">没有版本记录。</p>}
        {error&&<div><p role="alert">{error.message}</p><button className="text-sm text-primary" onClick={()=>void load(error.before)}>重试读取历史</button></div>}
        {!error&&next!==null&&<button disabled={loading} className="text-sm text-primary disabled:opacity-40" onClick={()=>void load(next)}>加载更早版本</button>}
    </section>;
}
