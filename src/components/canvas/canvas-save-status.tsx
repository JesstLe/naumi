"use client";
import React,{useEffect,useRef,useState,type ReactNode} from "react";
import {projectSaveItems,saveItemFailed,type CanvasSaveItem} from "@/lib/canvas/save-status";
const labels={pending:"待保存",saving:"保存中",failed:"保存未完成",conflict:"需要选择版本",unavailable:"原节点已失效",sync:"已保存，显示待刷新"};
const reason=(item:CanvasSaveItem)=>item.state==="unavailable"?"草稿已保留":item.state==="conflict"?"存在其他修改":item.state==="failed"?"草稿已保留，请重试":null;
/** Read-only status surface; every action delegates to the existing owner. */
export function CanvasSaveStatus({items,project,names,onRetry,onLocate,onCopy,onDiscard,children}:{
  items:CanvasSaveItem[];project:string|null;names:Record<string,string>;
  onRetry:(item:CanvasSaveItem)=>Promise<unknown>;onLocate:(item:CanvasSaveItem)=>void;
  onCopy:(item:CanvasSaveItem)=>Promise<unknown>;onDiscard:(item:CanvasSaveItem)=>Promise<unknown>;children?:ReactNode;
}){
 const root=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};window.addEventListener('pointerdown',close);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',escape);};},[open]);
 useEffect(()=>{if(!items.length){setOpen(false);setError("");}},[items.length]);
 const current=projectSaveItems(items,project),other=items.filter(item=>!current.includes(item)),failures=current.filter(saveItemFailed);
 if(!items.length)return null;
 const identity=(item:CanvasSaveItem)=>JSON.stringify([item.kind,item.projectKey,item.id]);
 const run=async(item:CanvasSaveItem,action:()=>Promise<unknown>)=>{setBusy(identity(item));setError("");try{await action();}catch{setError("操作未完成，草稿已保留");}finally{setBusy(null);}};
 const rows=(values:CanvasSaveItem[])=>values.map(item=><li key={identity(item)} className="border-t border-slate-100 py-3" data-testid="canvas-save-item" data-state={item.state}>
   <div className="flex items-start justify-between gap-3"><button type="button" onClick={()=>onLocate(item)} className="min-w-0 truncate text-left font-medium text-slate-800">{item.title}</button><span className="shrink-0 text-xs text-slate-500">{labels[item.state]}</span></div>
   {other.includes(item)&&<div className="mt-1 truncate text-xs text-slate-500">{names[item.projectKey]||"其他画布"}</div>}
   {reason(item)&&<div className="mt-1 text-xs text-slate-500">{reason(item)}</div>}
   <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
     <button type="button" onClick={()=>onLocate(item)}>定位</button>
     {item.state!=="sync"&&<button type="button" disabled={!!busy} onClick={()=>void run(item,()=>onCopy(item))}>复制草稿</button>}
     {item.state!=="saving"&&item.state!=="unavailable"&&item.state!=="conflict"&&<button type="button" disabled={!!busy} onClick={()=>void run(item,()=>onRetry(item))}>{busy===identity(item)?"处理中…":item.state==="sync"?"刷新显示":item.state==="pending"?"保存":"重试"}</button>}
     {item.canDiscard&&<button type="button" disabled={!!busy} onClick={()=>{if(window.confirm("放弃此节点的本机草稿？此操作不会删除服务器内容。"))void run(item,()=>onDiscard(item));}}>{item.state==="conflict"?"使用已保存":"放弃草稿"}</button>}
   </div>
 </li>);
 return <div ref={root} className={`fixed right-4 top-3 max-w-[calc(100vw-11rem)] text-sm md:left-4 md:right-auto md:top-20 md:max-w-[calc(100vw-2rem)] ${open?"z-[60]":"z-20"}`} data-testid="canvas-save-status">
   <button type="button" aria-expanded={open} aria-controls="canvas-save-details" onClick={()=>setOpen(!open)} className={`flex max-w-full items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm ${failures.length?"border-amber-200 text-amber-800":"border-slate-200 text-slate-500"}`}>
    <span role={failures.length?"alert":"status"}>{failures.length?`有 ${failures.length} 项需要处理`:current.some(item=>item.state==="saving")?"正在保存…":current.length?"等待保存…":"当前画布已保存"}</span>
    {other.length>0&&<span className="border-l border-slate-200 pl-2 text-xs text-slate-500">其他画布 {other.length}</span>}
    <span aria-hidden="true">{open?"⌃":"⌄"}</span>
   </button>
   {open&&<section id="canvas-save-details" aria-label="保存状态" className="absolute right-0 mt-2 max-h-[60vh] md:left-0 md:right-auto w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
     <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-800">保存状态</h2><button type="button" aria-label="关闭保存状态" onClick={()=>setOpen(false)} className="px-1 text-slate-500">×</button></div>
     {error&&<div role="alert" className="mt-2 text-xs text-amber-700">{error}</div>}
     <ul className="mt-2">{rows(current)}</ul>{children}
     {other.length>0&&<><h3 className="mt-3 text-xs font-medium text-slate-500">其他画布草稿</h3><ul>{rows(other)}</ul></>}
   </section>}
 </div>;
}
