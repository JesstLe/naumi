"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, MoreHorizontal, Pencil, Pin, Trash2 } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import type { WorkbenchSessionSummary } from "@/lib/agent/workbench-contract";
import styles from "./workspace-shell.module.css";

export function SessionList({sessions,activeId,disabled,onLoad,onRename,onDelete,onPin}:{
  sessions:WorkbenchSessionSummary[];activeId?:string;disabled?:boolean;onLoad:(id:string)=>void;
  onRename:(id:string,title:string)=>Promise<boolean>;onDelete:(id:string)=>Promise<void>;onPin:(id:string,pinned:boolean)=>Promise<boolean>;
}) {
  const [menu,setMenu]=useState(""),[editing,setEditing]=useState<{id:string;title:string}|null>(null),[deleting,setDeleting]=useState(""),[pending,setPending]=useState(false);
  useEffect(()=>{if(!menu)return;const close=(event:MouseEvent)=>{if(!(event.target as Element)?.closest?.("[data-workspace-session]")){setMenu("");setDeleting("");}};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[menu]);
  const mutation = useRef(false);
  async function rename(){if(!editing||mutation.current)return;const {id,title}=editing;if(!title.trim()){setEditing(null);return;}mutation.current=true;setPending(true);try{if(await onRename(id,title))setEditing(null);}finally{mutation.current=false;setPending(false);}}
  return <div className={styles.sessionList} onKeyDown={event=>{if(event.key==="Escape"){setMenu("");setDeleting("");setEditing(null);}}}>{sessions.map(session=><div key={session.id} className={styles.session} data-workspace-session>
    {editing?.id===session.id?<form className={styles.rename} onSubmit={event=>{event.preventDefault();void rename();}}><input aria-label="会话名称" autoFocus value={editing.title} disabled={pending} onChange={event=>setEditing({id:session.id,title:event.target.value})} onBlur={()=>void rename()}/><button type="submit" aria-label="保存会话名称" disabled={pending} onMouseDown={event=>event.preventDefault()}><Check size={16}/></button></form>:<>
      <button type="button" className={styles.sessionMain} disabled={disabled} aria-current={activeId===session.id?"page":undefined} title={session.title||"新对话"} onClick={()=>onLoad(session.id)}>{session.lastImageUrl?<CachedImage src={session.lastImageUrl} alt=""/>:<MessageSquare size={16}/>}<span>{session.pinned&&<Pin size={12}/>}<span>{session.title||"新对话"}</span></span></button>
      <button type="button" className={styles.dots} aria-label={`${session.title||"新对话"} 会话操作`} aria-expanded={menu===session.id} aria-haspopup="menu" onClick={()=>{setMenu(menu===session.id?"":session.id);setDeleting("");}}><MoreHorizontal size={17}/></button>
      {menu===session.id&&<div className={styles.sessionMenu} role="menu">{deleting===session.id?<><p>删除这条会话记录？</p><button type="button" role="menuitem" className={styles.danger} disabled={pending} onClick={async()=>{setPending(true);try{await onDelete(session.id);setMenu("");}finally{setPending(false);}}}>删除</button><button type="button" role="menuitem" onClick={()=>setDeleting("")}>取消</button></>:<>
        <button type="button" role="menuitem" disabled={pending} onClick={async()=>{setPending(true);try{if(await onPin(session.id,!session.pinned))setMenu("");}finally{setPending(false);}}}><Pin size={15}/>{session.pinned?"取消置顶":"置顶"}</button>
        <button type="button" role="menuitem" onClick={()=>{setMenu("");setEditing({id:session.id,title:session.title});}}><Pencil size={15}/>重命名</button>
        <button type="button" role="menuitem" className={styles.danger} onClick={()=>setDeleting(session.id)}><Trash2 size={15}/>删除</button>
      </>}</div>}
    </>}
  </div>)}</div>;
}
