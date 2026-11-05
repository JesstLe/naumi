"use client";
import type {CanvasTextNode} from "@/lib/canvas/text-document-model";
import type {TextDocumentConflict} from "@/lib/canvas/text-document";
export function CanvasTextConflicts({conflicts,nodes,onResolve}:{conflicts:Record<string,TextDocumentConflict>;nodes:CanvasTextNode[];onResolve:(id:string,choice:"local"|"server")=>Promise<unknown>}){
 return <>{Object.values(conflicts).map(conflict=>{const local=nodes.find(node=>node.id===conflict.id);return <section key={conflict.id} role="alert" data-testid="canvas-text-conflict" className="max-w-lg rounded-lg border border-amber-400 bg-white p-4 text-sm text-slate-800 shadow-lg">
   <div className="font-semibold">{local?.title||"文字节点"} · {conflict.current?"另一页面已修改":"原节点已删除"}</div>
   <details className="mt-2"><summary className="cursor-pointer">查看两份内容</summary><div className="mt-2 grid grid-cols-2 gap-3"><div><span className="text-xs text-slate-500">本页</span><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{local?.content||""}</pre></div><div><span className="text-xs text-slate-500">服务器</span><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{conflict.current?.content||"已删除"}</pre></div></div></details>
   <div className="mt-3 flex gap-4"><button type="button" className="font-semibold underline" onClick={()=>void onResolve(conflict.id,"local")}>{conflict.current?"保留本页修改":"将本页内容另存为新节点"}</button><button type="button" className="font-semibold underline" onClick={()=>void onResolve(conflict.id,"server")}>{conflict.current?"使用服务器版本":"保留删除"}</button></div>
 </section>})}</>;
}
