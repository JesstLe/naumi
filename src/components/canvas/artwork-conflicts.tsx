"use client";
import type {ArtworkDocumentConflict} from "@/lib/canvas/artwork-document";
import {compileCanvasHistory} from "@/lib/canvas/history-model";
import {artworkFields} from "@/lib/canvas/artwork-write";
const labels:Record<string,string>={title:"名称",canvasX:"横坐标",canvasY:"纵坐标",canvasWidth:"显示宽度",canvasHeight:"显示高度",marked:"标记",canvasGroupId:"分组",visible:"显示"};
function proposed(c:ArtworkDocumentConflict){const fields:Record<string,unknown>={};for(const op of compileCanvasHistory(c.action,c.undo,()=>undefined)){if(!("id" in op)||op.id!==c.id)continue;if(op.type==="rename")fields.title=op.title;if(op.type==="position"||op.type==="size"){fields.canvasX=op.x;fields.canvasY=op.y;}if(op.type==="size"||op.type==="art-dimensions"){fields.canvasWidth=op.width;fields.canvasHeight=op.height;}if(op.type==="mark")fields.marked=op.marked;if(op.type==="group")fields.canvasGroupId=op.value;if(op.type==="visibility")fields.visible=op.visible;}return fields;}
const display=(v:unknown)=>v===null||v===undefined?"自动":typeof v==="boolean"?(v?"是":"否"):String(v);
export function CanvasArtworkConflicts({conflicts,onResolve}:{conflicts:Record<string,ArtworkDocumentConflict>;onResolve:(id:string,choice:"local"|"server")=>Promise<unknown>}){
 return <>{Object.values(conflicts).map(c=>{const local=proposed(c),server=c.current?artworkFields(c.current.node,c.current.visible):null;return <section key={c.id} role="alert" data-testid="canvas-artwork-conflict" className="max-w-lg rounded-lg border border-amber-400 bg-white p-4 text-sm text-slate-800 shadow-lg">
 <div className="font-semibold">{c.current?.node.title||"图片节点"} · {c.current?.visible?"另一页面已修改":"原节点已删除"}</div>
 <details className="mt-2"><summary className="cursor-pointer">查看两份修改</summary><table className="mt-2 w-full text-left"><thead><tr><th>参数</th><th>本页</th><th>服务器</th></tr></thead><tbody>{Object.entries(local).map(([key,value])=><tr key={key}><td>{labels[key]||key}</td><td className="max-w-40 break-words">{display(value)}</td><td className="max-w-40 break-words">{server?display(server[key as keyof typeof server]):"已删除"}</td></tr>)}</tbody></table></details>
 <div className="mt-3 flex gap-4">{c.current?.visible&&<button type="button" className="font-semibold underline" onClick={()=>void onResolve(c.id,"local")}>保留本页修改</button>}<button type="button" className="font-semibold underline" onClick={()=>void onResolve(c.id,"server")}>{c.current?.visible?"使用服务器版本":"保留删除"}</button></div>
 </section>})}</>;
}
