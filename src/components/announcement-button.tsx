"use client";
import {useEffect,useRef,useState} from "react";
import {Bell,CheckCheck,RefreshCw,X} from "lucide-react";
import {useAuth} from "@/lib/auth-context";
import {validatePublicReleaseNotes,type PublicReleaseNote} from "@/lib/public-release-notes";
import {ReleaseHistory} from "./release-notes";
import styles from "./announcement-button.module.css";

const validVersion=(value:string)=>/^[1-9]\d{8,10}$/.test(value);
const watermark=(value:string|null)=>value&&validVersion(value)?value:"0";
type Notes={version:string;entries:PublicReleaseNote[];status:"loading"|"ready"|"error"};

/** Public announcements follow the live version, even when an old canvas stays open. */
export function AnnouncementButton({endpoint,publishedVersion,loadedVersion,refreshKey=0,english=false,onOpen}:{endpoint:string;publishedVersion:string;loadedVersion:string;refreshKey?:number;english?:boolean;onOpen?:()=>void}){
 const {user,ready}=useAuth(),L=(zh:string,en:string)=>english?en:zh;
 const storageKey=`naumi:announcements:read:${encodeURIComponent(user?.email.toLowerCase()||"guest")}`;
 const [read,setRead]=useState({key:"",version:"0"}),[open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const [notes,setNotes]=useState<Notes>({version:"",entries:[],status:"loading"});
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!ready)return;
  const load=()=>{let version="0";try{version=watermark(localStorage.getItem(storageKey));}catch{}setRead({key:storageKey,version});};
  load();const sync=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null)load();};
  window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);
 },[ready,storageKey]);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  if(!validVersion(publishedVersion)){setNotes({version:publishedVersion,entries:[],status:"ready"});return;}
  setNotes(previous=>previous.version===publishedVersion&&previous.status==="ready"?previous:{version:publishedVersion,entries:[],status:"loading"});
  const timer=setTimeout(()=>controller.abort(),10000);
  void fetch(`${endpoint}?version=${encodeURIComponent(publishedVersion)}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error("Unavailable");const body=await response.json();if(body.version!==publishedVersion)throw Error("Version mismatch");const entries=validatePublicReleaseNotes(body.entries);if(entries.some(n=>Number(n.version)>Number(publishedVersion)))throw Error("Unpublished note");return entries;})
   .then(entries=>{if(active)setNotes({version:publishedVersion,entries,status:"ready"});})
   .catch(()=>{if(active)setNotes({version:publishedVersion,entries:[],status:"error"});})
   .finally(()=>clearTimeout(timer));
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[endpoint,publishedVersion,retry,refreshKey]);
 useEffect(()=>{
  if(!open)return;close.current?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[open]);
 const current=notes.version===publishedVersion,entries=current?notes.entries:[],status=current?notes.status:"loading";
 const seen=read.key===storageKey?read.version:"0",unread=ready?entries.filter(n=>Number(n.version)>Number(seen)).length:0;
 const markRead=()=>{const newest=entries[0]?.version;if(!ready||status!=="ready"||!newest)return;let saved="0";try{saved=watermark(localStorage.getItem(storageKey));}catch{}const version=String(Math.max(Number(seen),Number(newest),Number(saved)));setRead({key:storageKey,version});try{localStorage.setItem(storageKey,version);}catch{}};
 return <div ref={root} className={styles.root}>
  <button ref={trigger} className={styles.trigger} data-unread={unread} aria-label={unread?L(`通知，${unread} 条未读公告`,`Notifications, ${unread} unread announcements`):L("通知","Notifications")} aria-expanded={open} aria-haspopup="dialog" onClick={()=>{if(!open)onOpen?.();setOpen(!open);}}><Bell size={16}/><span>{L("通知","Notifications")}</span>{unread>0&&<b className={styles.count}>{unread>99?"99+":unread}</b>}</button>
  {open&&<section role="dialog" aria-label={L("通知公告","Announcements")} className={styles.panel}>
   <header><div><strong>{L("通知公告","Announcements")}</strong>{unread>0&&<span>{L(`${unread} 条未读`,`${unread} unread`)}</span>}</div><button ref={close} aria-label={L("关闭通知","Close announcements")} onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18}/></button></header>
   {status==="loading"?<p role="status" className={styles.empty}>{L("正在读取公告…","Loading announcements…")}</p>:status==="error"?<div role="status" className={styles.empty}><p>{L("公告暂未加载成功","Announcements could not be loaded")}</p><button onClick={()=>setRetry(v=>v+1)}><RefreshCw size={14}/>{L("重试","Retry")}</button></div>:<>
    {unread>0&&<div className={styles.toolbar}><button onClick={markRead}><CheckCheck size={14}/>{L("全部已读","Mark all as read")}</button></div>}
    <div className={styles.content}><ReleaseHistory entries={entries} version={loadedVersion} english={english}/></div>
   </>}
  </section>}
 </div>;
}
