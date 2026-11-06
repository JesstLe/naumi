"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { usePathname } from "next/navigation";
import styles from "./site-version.module.css";
import { ReleaseNotes, releaseVersionLabel } from "./release-notes";
import { AnnouncementButton } from "./announcement-button";

// These literals belong to the loaded JavaScript bundle, never to a fresh SSR response.
const loadedVersion=process.env.NEXT_PUBLIC_BUILD_VERSION || "0";
export function versionLabel(value:string){
  return releaseVersionLabel(value);
}
export function SiteVersion({embedded=false}:{embedded?:boolean}={}){
  const path=usePathname()||"";
  if(!embedded&&(path==="/admin"||path.startsWith("/admin/")))return null;
  return <VersionControls path={path} embedded={embedded}/>;
}
function VersionControls({path,embedded}:{path:string;embedded:boolean}){
  const versionEndpoint=path === "/desktop" || path.startsWith("/desktop/") ? "/desktop/api/version" : "/api/version";
  const notesEndpoint=versionEndpoint.replace(/version$/, "release-notes");
  const {locale}=useI18n(),L=(zh:string,en:string)=>locale==="en"?en:zh;
  const [open,setOpen]=useState(false),[latest,setLatest]=useState<{version:string;commit?:string}|null>(null),[failed,setFailed]=useState(false),[checking,setChecking]=useState(false);
  const [view,setView]=useState<"version"|"notes">("version");
  const [announcementCheck,setAnnouncementCheck]=useState(0);
  const panel=useRef<HTMLDivElement>(null),button=useRef<HTMLDivElement>(null),opener=useRef<HTMLButtonElement>(null),inFlight=useRef(false),noticedVersion=useRef(loadedVersion);
  const check=useCallback(async()=>{
    if(inFlight.current)return;inFlight.current=true;setChecking(true);
    try{const r=await fetch(versionEndpoint,{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("Version unavailable");const data=await r.json();if(typeof data.version!=="string" || !/^\d{1,11}$/.test(data.version))throw Error("Invalid version");setLatest(data);
      // Notes are fixed per published version (the mount already fetched the loaded one):
      // the minute/focus check must not re-download ~30KB each time.
      if(noticedVersion.current!==data.version){noticedVersion.current=data.version;setAnnouncementCheck(value=>value+1);}setFailed(false);}
    catch{setFailed(true);}finally{setChecking(false);inFlight.current=false;}
  },[versionEndpoint]);
  useEffect(()=>{void check();const timer=setInterval(()=>{if(document.visibilityState==="visible")void check();},60000);const visible=()=>{if(document.visibilityState==="visible")void check();};document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);};},[check]);
  useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);opener.current?.focus();}};document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};},[open]);
  useEffect(()=>{if(open)panel.current?.querySelector<HTMLButtonElement>("header button")?.focus();},[open]);
  const different=loadedVersion!=="0" && !!latest && latest.version!=="0" && latest.version!==loadedVersion;
  const refresh=()=>{const url=new URL(window.location.href);url.searchParams.set("v",latest?.version || loadedVersion);window.location.replace(url.toString());};
  return <div className={`${styles.root} ${embedded?styles.embedded:""}`} data-testid="site-version" data-loaded-version={loadedVersion}>
    {open && <div ref={panel} className={styles.panel} role="dialog" aria-label={view==="notes" ? L("更新说明","What's new") : L("网站版本","Website version")}><header><b>{view==="notes" ? L("更新说明","What's new") : L("网站版本","Website version")}</b><button aria-label={L("关闭版本信息","Close version details")} onClick={()=>{setOpen(false);opener.current?.focus();}}><X size={16}/></button></header>
      <nav className={styles.tabs} aria-label={L("版本信息视图","Version information views")}><button aria-pressed={view==="notes"} onClick={()=>setView("notes")}>{L("更新记录","Updates")}</button><button aria-pressed={view==="version"} onClick={()=>setView("version")}>{L("版本信息","Version")}</button></nav>
      {view==="notes" ? <ReleaseNotes endpoint={notesEndpoint} version={loadedVersion} english={locale==="en"}/> : <>
      <dl><div><dt>{L("当前页面","Loaded page")}</dt><dd>v{versionLabel(loadedVersion)}</dd></div><div><dt>{L("最新版本","Latest version")}</dt><dd>{latest ? `v${versionLabel(latest.version)}` : "—"}</dd></div></dl>
      <p role="status">{failed ? L("暂时无法检查服务器版本，当前页面版本仍可查看。","Unable to check the server; the loaded version remains visible.") : different ? L("当前页面与服务器版本不同，请刷新加载已发布代码。","This page differs from the server. Refresh to load the published code.") : latest ? loadedVersion==="0" ? L("本地开发版本。","Local development version.") : L("当前页面已是服务器发布版本。","This page matches the published server version.") : L("正在读取服务器版本。","Checking the server version.")}</p>
      <footer><button disabled={checking} onClick={()=>void check()}><RefreshCw size={13}/>{L("检查版本","Check version")}</button>{different && <button className={styles.refresh} onClick={refresh}>{L("刷新到服务器版本","Refresh to server version")}</button>}</footer>{different && <small className={styles.note}>{L("刷新前请保存尚未提交的内容。","Save unfinished work before refreshing.")}</small>}
      </>}
    </div>}
    <div ref={button} className={styles.actions}>
    <button className={styles.badge} data-update={different} aria-label={L("查看网站版本","View website version")} aria-expanded={open && view==="version"} onClick={(event)=>{opener.current=event.currentTarget;setOpen(!(open && view==="version"));setView("version");if(!open)void check();}}>v{versionLabel(loadedVersion)}{different && <span>{L("可更新","Update")}</span>}</button>
    <AnnouncementButton endpoint={notesEndpoint} publishedVersion={latest?.version||loadedVersion} loadedVersion={loadedVersion} refreshKey={announcementCheck} english={locale==="en"} onOpen={()=>setOpen(false)} placement={embedded?"below":"above"}/>
    </div>
  </div>;
}
