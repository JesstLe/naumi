"use client";
import { readBrowserImage } from '@/lib/browser-image-cache';
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Studio3dLaunch } from "@/components/studio3d/studio3d-launch";
import { FolderOpen, Layers, Plus, RefreshCw, X, Download, ArrowUpRight } from "lucide-react";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { Media } from "@/components/media";
import { createImageDownloadName } from "@/lib/download";
import { desktopProjects, type DesktopArtwork, type DesktopText } from "@/lib/desktop/projects";
const DEMOS = [
 {title:"陶瓷茶壶 · 商品精修",label:"商品精修",image:"/demos/workbench-v2/retouch-after.webp",href:"/desktop/retouch"},
 {title:"随行杯 · 场景创作",label:"AI 生图",image:"/demos/workbench-v2/image-after.webp",href:"/desktop/generate"},
 {title:"便携音箱 · 产品换色",label:"智能换色",image:"/demos/workbench-v2/recolor-after.webp",href:"/desktop/recolor"},
 {title:"咖啡机 · 上架套图",label:"一键套图",image:"/demos/workbench-v2/suite-coffee-main.webp",href:"/desktop/suite"},
];
export function DesktopHome(){
 const {user}=useAuth();
 const {can}=useFeatureAccess();
 const canWorks=can("works"),canCanvas=can("canvas"),canSuite=can("suite");
 const [tab,setTab]=useState("recent"),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [works,setWorks]=useState<DesktopArtwork[]>([]),[texts,setTexts]=useState<DesktopText[]>([]),[names,setNames]=useState<Record<string,string>>({});
 const [active,setActive]=useState<DesktopArtwork|null>(null),[downloadError,setDownloadError]=useState("");
 useEffect(()=>{
  const c=new AbortController();setWorks([]);setTexts([]);setNames({});setLoading(true);setError("");
  if(!user?.email){setLoading(false);return;}
  void(async()=>{try{
   const headers=await authHeader();
   const responses=await Promise.all(["/api/account",canCanvas?"/api/canvas/text-nodes":null,canCanvas?"/api/projects":null].map(url=>url?fetch(url,{headers,cache:"no-store",signal:c.signal}):Promise.resolve(Response.json({}))));
   if(responses.some(r=>!r.ok))throw Error("作品读取失败，请重试");
   const [account,canvas,projects]=await Promise.all(responses.map(r=>r.json()));
   if(c.signal.aborted)return;
   if(revision===0 && !(account.artworks || []).some((a:DesktopArtwork)=>a.image || a.videoUrl))setTab("demo");
   setWorks((canWorks || canCanvas ? account.artworks || [] : []).filter((a:DesktopArtwork)=>a.status!=="failed"));setTexts(canvas.nodes || []);setNames(projects.names || {});
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"作品读取失败，请重试");}finally{if(!c.signal.aborted)setLoading(false);}})();
  return()=>c.abort();
 },[user?.email,revision,canWorks,canCanvas]);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[]);
 useEffect(()=>{if(!active)return;const prev=document.body.style.overflow;document.body.style.overflow="hidden";const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setActive(null);};window.addEventListener("keydown",key);return()=>{document.body.style.overflow=prev;window.removeEventListener("keydown",key);};},[active]);
 async function downloadWork(work:DesktopArtwork){
  setDownloadError("");
  try{const url=work.videoUrl || work.image;const name=createImageDownloadName().replace(/\.png$/,work.videoUrl?".mp4":".png");let blob:Blob;if(!work.videoUrl)blob=await readBrowserImage(url);else{const response=await fetch(`/api/download?u=${encodeURIComponent(url)}&n=${encodeURIComponent(name)}`,{headers:await authHeader()});if(!response.ok)throw Error("download");blob=await response.blob();}const objectUrl=URL.createObjectURL(blob);const a=document.createElement("a");a.href=objectUrl;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);}catch{setDownloadError("下载失败，请重试");}
 }
 const projects=useMemo(()=>desktopProjects(works,texts,names),[works,texts,names]);
 const recent=useMemo(()=>[...works].filter(a=>a.image || a.videoUrl).sort((a,b)=>(b.createdAt || "").localeCompare(a.createdAt || "")).slice(0,12),[works]);
 const tabs=[{id:"recent",label:"最近作品"},{id:"canvas",label:"画布项目"},{id:"suite",label:"套图任务"},{id:"demo",label:"示例素材"}].filter(t=>t.id==="recent"?canWorks:t.id==="canvas"?canCanvas:t.id==="suite"?canCanvas&&canSuite:true);
 useEffect(()=>{if(!tabs.some(t=>t.id===tab))setTab(tabs[0]?.id || "demo");},[canWorks,canCanvas,canSuite,tab]);
 const visibleProjects=projects.filter(p=>tab==="suite" ? p.suite : !p.suite);
 return <section className="dt-home">
  <Studio3dLaunch desktop/>
  <div className="dt-heading"><div><h1>从这里，开始你的创作</h1><p>{user?.name || "Naumi"} 的工作空间</p></div>{can("agent") && <Link className="dt-button" href="/desktop/create"><Plus size={16}/>新建创作</Link>}</div>
  <div className="dt-tabs" role="tablist" aria-label="工作空间展示">{tabs.map((t,i)=><button key={t.id} id={`dt-tab-${t.id}`} role="tab" aria-selected={tab===t.id} aria-controls="dt-panel" tabIndex={tab===t.id?0:-1} onClick={()=>setTab(t.id)} onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?tabs.length-1:(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;setTab(tabs[next].id);document.getElementById(`dt-tab-${tabs[next].id}`)?.focus();}}>{t.label}</button>)}</div>
  <div id="dt-panel" role="tabpanel" aria-labelledby={`dt-tab-${tab}`}>
   {loading ? <div className="dt-card-grid" aria-label="加载作品">{[0,1,2,3].map(i=><div key={i} className="dt-skeleton"/>)}</div> : error ? <div className="dt-empty" role="alert"><p>{error}</p><button className="dt-button" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/>重试</button></div> : tab==="demo" ? <div className="dt-card-grid">{DEMOS.filter(d=>can(d.href.split("/").pop()!)).map(d=><Link className="dt-card" href={d.href} key={d.image}><div className="dt-media"><Media src={d.image} alt={d.title} overlay={false} ratio="h-full" imgClassName="object-contain" thumbWidth={480}/><span className="dt-badge">{d.label}</span></div><div className="dt-caption"><strong>{d.title}</strong><small>新版示例</small></div></Link>)}</div> : tab==="recent" ? recent.length ? <><div className="dt-card-grid">{recent.map(a=><button className="dt-card" key={a.id} onClick={()=>{setActive(a);setDownloadError("");}}><div className="dt-media"><Media src={a.image || a.videoUrl || ""} alt={a.title || "作品"} overlay={false} ratio="h-full" imgClassName="object-contain" thumbWidth={480}/><span className="dt-badge">{a.videoUrl?"视频":"作品"}</span></div><div className="dt-caption"><strong>{a.title || "未命名作品"}</strong><small>{a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : ""}</small></div></button>)}</div><Link className="dt-more" href="/desktop/works">全部素材<ArrowUpRight size={13}/></Link></> : <div className="dt-empty"><FolderOpen size={30}/><p>暂无作品</p><Link className="dt-button" href="/desktop/create">开始创作</Link><button className="dt-text-button" onClick={()=>setTab("demo")}>查看示例素材</button></div> : visibleProjects.length ? <div className="dt-card-grid">{visibleProjects.map(p=><Link className="dt-card" key={p.key} href={`/desktop/canvas?project=${encodeURIComponent(p.key)}`}><div className="dt-media">{p.cover ? <Media src={p.cover} alt={p.title} overlay={false} ratio="h-full" imgClassName="object-contain" thumbWidth={480}/> : <div className="dt-project-placeholder"><FolderOpen size={32}/></div>}<span className="dt-badge">{p.count} 个节点</span></div><div className="dt-caption"><strong>{p.title}</strong><small>{p.suite?"商品套图":"画布项目"}</small></div></Link>)}</div> : <div className="dt-empty"><Layers size={30}/><p>{tab==="suite"?"暂无套图任务":"暂无画布项目"}</p><Link className="dt-button" href={tab==="suite"?"/desktop/suite":"/desktop/canvas"}>新建{tab==="suite"?"套图":"画布"}</Link></div>}
  </div>
  {active && <div className="dt-lightbox" role="dialog" aria-modal="true" aria-label="作品预览" onClick={()=>setActive(null)}><div className="dt-lightbox-card" onClick={e=>e.stopPropagation()}><button className="dt-lightbox-close" aria-label="关闭预览" autoFocus onClick={()=>setActive(null)}><X size={20}/></button>{active.videoUrl ? <video src={active.videoUrl} controls/> : <Media src={active.image} alt={active.title || "作品预览"} overlay={false} ratio="dt-preview-image" imgClassName="object-contain"/>}<h2>{active.title || "未命名作品"}</h2>{active.prompt && <p className="dt-prompt">{active.prompt}</p>}<div className="dt-preview-actions"><button className="dt-button" onClick={()=>void downloadWork(active)}><Download size={14}/>下载</button><Link className="dt-button" href={`/desktop/canvas?node=${encodeURIComponent(active.id)}`}>送画布</Link><Link className="dt-button" href={`/desktop/generate?from=${encodeURIComponent(active.id)}`}>再创作</Link></div>{downloadError && <p role="alert">{downloadError}</p>}</div></div>}
 </section>;
}
