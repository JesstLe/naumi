"use client";
import { CachedImage } from "@/components/cached-image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppPathname } from "@/lib/app-router-pathname";
import { useAppSearchParams } from "@/lib/app-router-navigation";
import { ChevronRight, Folder, LayoutGrid, Layers, Menu, Network, Plus, LogOut, ArrowLeft, X, Users, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useBrand } from "@/lib/brand-context";
import { authHeader } from "@/lib/supabase";
import { DesktopTransport } from "./desktop-transport";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { desktopHref } from "@/lib/desktop/routes";
import {WorkspaceSelector} from '@/components/saas/workspace-selector';
import { desktopProjects, type DesktopProject } from "@/lib/desktop/projects";
import { CollaborationEntry } from "@/components/collaboration/collaboration-entry";
import { useCollaboration } from "@/components/collaboration/collaboration-provider";
const NAV = [ {href:"/desktop", label:"工作台", Icon:LayoutGrid}, {href:"/desktop/canvas",label:"无限画布",Icon:Network}, {href:"/desktop/suite",label:"一键套图",Icon:Layers}, {href:"/desktop/works",label:"我的素材",Icon:Folder} ];
export function DesktopShell({children}: {children:React.ReactNode}) {
  const path = useAppPathname() || "/desktop";
  const router = useRouter();
  const collaboration = useCollaboration();
  const { user, ready, remaining, signOut, persistMode } = useAuth();
  const { openAuth } = useAuthModal();
  const brand = useBrand();
  const {ready:accessReady,canPage,can}=useFeatureAccess();
  const [verifiedEmail,setVerifiedEmail]=useState<string | null | undefined>(undefined);
  const [mobile, setMobile] = useState(false);
  const [projects, setProjects] = useState<DesktopProject[]>([]);
  const activeProject = useAppSearchParams().get("project");
  const [accountOpen,setAccountOpen]=useState(false);
  const accountRef=useRef<HTMLDivElement>(null);
  useEffect(() => {setMobile(false);setAccountOpen(false);},[path]);
  useEffect(() => {
    const close=(e:PointerEvent)=>{if(!accountRef.current?.contains(e.target as Node))setAccountOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setMobile(false);setAccountOpen(false);}};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",key);};
  },[]);
  useEffect(() => {
    setProjects([]); if(!ready || !user?.email || !can("canvas")) return;
    const controller = new AbortController();
    void (async()=>{try{const headers=await authHeader();const responses=await Promise.all(["/api/account","/api/canvas/text-nodes","/api/projects"].map(url=>fetch(url,{cache:"no-store",headers,signal:controller.signal})));if(responses.every(r=>r.ok)){const [account,texts,projects]=await Promise.all(responses.map(r=>r.json()));if(!controller.signal.aborted)setProjects(desktopProjects(account.artworks || [],texts.nodes || [],projects.names || {}));}}catch{/* Home retains its explicit retryable data error. */}})();
    return()=>controller.abort();
  },[ready,user?.email,path,can]);
  // Capture before Next's Link handler, including links rendered in portals.
  // API/download/external links and modified-click new tabs are never rewritten.
  useEffect(() => {
    const capture=(event:MouseEvent)=>{
      if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor=event.target instanceof Element ? event.target.closest("a") : null;
      if(!anchor || anchor.hasAttribute("download") || anchor.target || anchor.hasAttribute("data-original-web"))return;
      const url=new URL(anchor.href,window.location.href);if(url.origin!==window.location.origin)return;
      const old=url.pathname+url.search+url.hash, next=desktopHref(old);
      if(old===next)return;event.preventDefault();event.stopPropagation();router.push(next);
    };
    document.addEventListener("click",capture,true);return()=>document.removeEventListener("click",capture,true);
  },[router]);
  useEffect(()=>{
    setVerifiedEmail(undefined);
    if(!ready)return;
    if(!user){setVerifiedEmail(null);return;}
    if(persistMode!=="server"){setVerifiedEmail(user.email);return;}
    const c=new AbortController();
    void(async()=>{try{const response=await fetch("/api/account",{cache:"no-store",headers:await authHeader(),signal:c.signal});const data=response.ok ? await response.json() : null;if(!c.signal.aborted)setVerifiedEmail(data?.user?.email===user.email?user.email:null);}catch{if(!c.signal.aborted)setVerifiedEmail(null);}})();
    return()=>c.abort();
  },[ready,user,persistMode]);
  const authenticated=!!user && verifiedEmail===user.email;
  const current=NAV.find(n=>n.href===path)?.label || (path==="/desktop/create" ? "新建创作" : path==="/desktop/account" ? "账户" : "创作工具");
  return <div className="dt-shell" data-desktop><DesktopTransport/>
    {mobile && <button className="dt-backdrop" aria-label="关闭导航" onClick={()=>setMobile(false)}/>}
    <aside className={`dt-sidebar ${mobile ? "is-open" : ""}`} aria-label="工作空间导航">
      <Link className="dt-brand" href="/desktop"><CachedImage src={brand.logo} alt=""/>{!brand.logoHasText && <b>{brand.name}</b>}<ChevronRight size={14}/></Link>
      <button className="dt-mobile-close" aria-label="关闭导航" onClick={()=>setMobile(false)}><X size={18}/></button>
      <nav className="dt-nav">{NAV.filter(n=>canPage(n.href)).map(({href,label,Icon})=><Link key={href} href={href} className={path===href ? "active" : ""} aria-current={path===href ? "page" : undefined}><Icon size={16}/>{label}</Link>)}</nav>
      {authenticated && <div className="dt-collaboration"><CollaborationEntry label/><button onClick={()=>collaboration.open({section:"members"})}><Users size={16}/>成员</button><button onClick={()=>collaboration.open({section:"requests"})}><Share2 size={16}/>申请</button></div>}
      <div className="dt-projects"><h2>最近项目</h2>{projects.slice(0,8).map(project=><Link key={project.key} href={`/desktop/canvas?project=${encodeURIComponent(project.key)}`} title={project.title} aria-current={path==="/desktop/canvas"&&activeProject===project.key?"page":undefined} className={path==="/desktop/canvas"&&activeProject===project.key?"active":""}><Folder size={13}/><span>{project.title}</span></Link>)}{!projects.length && <span className="dt-side-empty">暂无项目</span>}</div>
      <div className="dt-profile" ref={accountRef}>
        {accountOpen && <div className="dt-account-menu"><Link href="/desktop/account">账户与积分</Link><a href="/dashboard" data-original-web><ArrowLeft size={14}/>原版网页</a><button onClick={()=>{signOut();setAccountOpen(false);}}><LogOut size={14}/>退出登录</button></div>}
        <button className="dt-user" onClick={()=>user?setAccountOpen(!accountOpen):openAuth("sign-in")} aria-expanded={accountOpen}><span className="dt-avatar">{(user?.name || "N").slice(0,1).toUpperCase()}</span><span><b>{user?.name || brand.name}</b><small>{user ? `${remaining.toLocaleString()} 积分` : "登录账户"}</small></span></button>
      </div>
    </aside>
    <div className="dt-main"><header className="dt-topbar"><div className="dt-breadcrumb"><button className="dt-mobile-menu" onClick={()=>setMobile(true)} aria-label="打开导航"><Menu size={18}/></button><Link href="/desktop">工作空间</Link><span>/</span><b>{current}</b></div><WorkspaceSelector/>{can("agent") && <Link className="dt-top-create" href="/desktop/create"><Plus size={15}/><span>新建创作</span></Link>}</header>
      {(!ready || verifiedEmail===undefined) ? <div className="dt-gate" role="status">加载工作空间…</div> : !authenticated ? <div className="dt-gate"><LayoutGrid size={28}/><h1>登录工作空间</h1><button className="dt-button" onClick={()=>openAuth("sign-in")}>登录</button></div> : !accessReady ? <div className="dt-gate" role="status">加载权限…</div> : !canPage(path) ? <div className="dt-gate"><h1>此页面尚未授权</h1><Link className="dt-button" href="/desktop/account">返回账户</Link></div> : <div className={`dt-content ${path==="/desktop/canvas" ? "dt-canvas" : ""}`} key={user!.email}>{children}</div>}
    </div>
  </div>;
}
