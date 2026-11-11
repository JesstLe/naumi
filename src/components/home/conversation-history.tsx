"use client";

import {useEffect,useRef,useState} from "react";
import {Check,Ellipsis,Loader2,MessageSquare,Pencil,Pin,PinOff,Trash2,X,AlertCircle,Square} from "lucide-react";
import {CachedImage} from "@/components/cached-image";
import type {WorkbenchSessionSummary} from "@/lib/agent/workbench-contract";
import styles from "./creation-workbench.module.css";

const statusNames = {empty:"暂无图片",reference:"参考图",ready:"图片已完成",generating:"图片生成中",failed:"图片生成失败",stopped:"图片生成已停止"};

export function ConversationHistory({sessions,activeId,loadingId,canNavigate,onLoad,onRename,onPin,onDelete}:{
  sessions:WorkbenchSessionSummary[];activeId:string;loadingId:string;canNavigate:boolean;
  onLoad:(id:string)=>void;onRename:(id:string,title:string)=>Promise<boolean>;onPin:(id:string,pinned:boolean)=>Promise<boolean>;onDelete:(id:string)=>Promise<void>;
}) {
  const [menu,setMenu]=useState(""),[editing,setEditing]=useState(""),[title,setTitle]=useState(""),[pending,setPending]=useState("");
  const root=useRef<HTMLDivElement>(null),editor=useRef<HTMLInputElement>(null);
  useEffect(()=>{const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu("");};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[]);
  useEffect(()=>{if(editing){editor.current?.focus();editor.current?.select();}},[editing]);
  useEffect(()=>{if(menu)root.current?.querySelector<HTMLButtonElement>('[role="menu"] button')?.focus();},[menu]);
  async function rename(id:string){if(pending||!title.trim())return;setPending(id);try{if(await onRename(id,title))setEditing("");}finally{setPending("");}}
  async function pin(session:WorkbenchSessionSummary){if(pending)return;setMenu("");setPending(session.id);try{await onPin(session.id,!session.pinnedAt);}finally{setPending("");}}
  async function remove(session:WorkbenchSessionSummary){if(pending)return;setMenu("");setPending(session.id);try{await onDelete(session.id);}finally{setPending("");}}
  return <div ref={root} className={styles.conversationHistory} onKeyDown={event=>{if(event.key==="Escape"){
    (event.target as HTMLElement).closest('[data-session-id]')?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
    setMenu("");setEditing("");
  }}}>
    {sessions.map(session=>{
      const preview=session.preview,status=preview?.status||"empty",working=pending===session.id;
      return <div key={session.id} data-session-id={session.id} className={`${styles.conversationRow} ${activeId===session.id?styles.conversationSelected:""}`}>
        {editing===session.id?<div className={styles.conversationEditor}><input ref={editor} aria-label="会话名称" value={title} maxLength={120} disabled={working} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();void rename(session.id);}}}/><button type="button" aria-label="保存会话名称" disabled={working||!title.trim()} onClick={()=>void rename(session.id)}><Check/></button><button type="button" aria-label="取消重命名" disabled={working} onClick={()=>setEditing("")}><X/></button></div>:<>
          <button type="button" className={styles.conversationLink} title={session.title} aria-current={activeId===session.id?"page":undefined} disabled={!canNavigate||!!loadingId} onClick={()=>onLoad(session.id)}>
            <span className={styles.conversationThumbnail} aria-label={statusNames[status]} data-image-status={status}>
              {preview?.image?<CachedImage key={preview.image} src={preview.image} alt="" loading="lazy"/>:<MessageSquare/>}
              {status==="generating"&&<span className={styles.thumbnailBadge}><Loader2 className="animate-spin"/></span>}
              {status==="failed"&&<span className={`${styles.thumbnailBadge} ${styles.thumbnailError}`}><AlertCircle/></span>}
              {status==="stopped"&&<span className={styles.thumbnailBadge}><Square/></span>}
              {status==="reference"&&<span className={styles.referenceBadge}>参考</span>}
            </span><span className={styles.conversationTitle}>{session.title||"新对话"}</span>{session.pinnedAt&&<Pin className={styles.pinnedIcon} aria-label="已置顶"/>}
          </button>
          <button type="button" className={styles.conversationMore} aria-label={`管理对话 ${session.title}`} aria-haspopup="menu" aria-expanded={menu===session.id} disabled={working} onClick={()=>setMenu(menu===session.id?"":session.id)}>{working?<Loader2 className="animate-spin"/>:<Ellipsis/>}</button>
          {menu===session.id&&<div className={styles.conversationMenu} role="menu" aria-label={`对话操作 ${session.title}`} onKeyDown={event=>{
            if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
            event.preventDefault();
            const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const index=items.indexOf(document.activeElement as HTMLButtonElement);
            items[event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length]?.focus();
          }}>
            <button type="button" role="menuitem" disabled={!canNavigate} onClick={()=>{setMenu("");setEditing(session.id);setTitle(session.title);}}><Pencil/>重命名</button>
            <button type="button" role="menuitem" onClick={()=>void pin(session)}>{session.pinnedAt?<PinOff/>:<Pin/>}{session.pinnedAt?"取消置顶":"置顶"}</button>
            <button type="button" role="menuitem" className={styles.deleteConversation} disabled={!canNavigate} onClick={()=>void remove(session)}><Trash2/>删除</button>
          </div>}
        </>}
      </div>;
    })}
  </div>;
}
