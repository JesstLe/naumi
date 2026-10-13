"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { usePathname } from "next/navigation";
import styles from "./site-version.module.css";

// These literals belong to the loaded JavaScript bundle, never to a fresh SSR response.
const loadedVersion=process.env.NEXT_PUBLIC_BUILD_VERSION || "0";
const loadedCommit=process.env.NEXT_PUBLIC_SOURCE_COMMIT || "";
export function versionLabel(value:string){
  if(!/^[1-9]\d{8,10}$/.test(value))return "dev";
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(Number(value)*1000));
  const p=(type:string)=>parts.find(p=>p.type===type)?.value || "";
  return `${p("year")}.${p("month")}.${p("day")}-${p("hour")}${p("minute")}${p("second")}`;
}
export function SiteVersion(){
  const path=usePathname() || "",versionEndpoint=path === "/desktop" || path.startsWith("/desktop/") ? "/desktop/api/version" : "/api/version";
  const {locale}=useI18n(),L=(zh:string,en:string)=>locale==="en"?en:zh;
  const [open,setOpen]=useState(false),[latest,setLatest]=useState<{version:string;commit?:string}|null>(null),[failed,setFailed]=useState(false),[checking,setChecking]=useState(false);
  const panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),inFlight=useRef(false);
  const check=useCallback(async()=>{
    if(inFlight.current)return;inFlight.current=true;setChecking(true);
    try{const r=await fetch(versionEndpoint,{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("Version unavailable");const data=await r.json();if(typeof data.version!=="string" || !/^\d{1,11}$/.test(data.version))throw Error("Invalid version");setLatest(data);setFailed(false);}
    catch{setFailed(true);}finally{setChecking(false);inFlight.current=false;}
  },[versionEndpoint]);
  useEffect(()=>{void check();const timer=setInterval(()=>{if(document.visibilityState==="visible")void check();},60000);const visible=()=>{if(document.visibilityState==="visible")void check();};document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);};},[check]);
  useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);button.current?.focus();}};document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};},[open]);
  const different=loadedVersion!=="0" && !!latest && latest.version!=="0" && latest.version!==loadedVersion;
  const refresh=()=>{const url=new URL(window.location.href);url.searchParams.set("v",latest?.version || loadedVersion);window.location.replace(url.toString());};
  return <div className={styles.root} data-testid="site-version" data-loaded-version={loadedVersion}>
    {open && <div ref={panel} className={styles.panel} role="dialog" aria-label={L("网站版本","Website version")}><header><b>{L("网站版本","Website version")}</b><button aria-label={L("关闭版本信息","Close version details")} onClick={()=>setOpen(false)}><X size={16}/></button></header>
      <dl><div><dt>{L("当前页面","Loaded page")}</dt><dd>v{versionLabel(loadedVersion)}<small>{loadedVersion}{loadedCommit && ` / ${loadedCommit.slice(0,7)}`}</small></dd></div><div><dt>{L("服务器版本","Server version")}</dt><dd>{latest ? `v${versionLabel(latest.version)}` : "—"}{latest?.commit && <small>{latest.commit.slice(0,7)}</small>}</dd></div></dl>
      <p role="status">{failed ? L("暂时无法检查服务器版本，当前页面版本仍可查看。","Unable to check the server; the loaded version remains visible.") : different ? L("当前页面与服务器版本不同，请刷新加载已发布代码。","This page differs from the server. Refresh to load the published code.") : latest ? loadedVersion==="0" ? L("本地开发版本。","Local development version.") : L("当前页面已是服务器发布版本。","This page matches the published server version.") : L("正在读取服务器版本。","Checking the server version.")}</p>
      <footer><button disabled={checking} onClick={()=>void check()}><RefreshCw size={13}/>{L("检查版本","Check version")}</button>{different && <button className={styles.refresh} onClick={refresh}>{L("刷新到服务器版本","Refresh to server version")}</button>}</footer>{different && <small className={styles.note}>{L("刷新前请保存尚未提交的内容。","Save unfinished work before refreshing.")}</small>}
    </div>}
    <button ref={button} className={styles.badge} data-update={different} aria-label={L("查看网站版本","View website version")} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void check();}}>v{versionLabel(loadedVersion)}{different && <span>{L("可更新","Update")}</span>}</button>
  </div>;
}
