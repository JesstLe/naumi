"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Headset, Menu, PanelLeftClose, PanelLeftOpen, Plus, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useBrand } from "@/lib/brand-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { useRecharge } from "@/lib/recharge-modal-context";
import { lockBodyScroll } from "@/lib/utils";
import { AccountDockMenu, useTeamEntryAccess } from "@/components/account/account-dock-menu";
import { CachedImage } from "@/components/cached-image";
import { WorkspaceSelector } from "@/components/saas/workspace-selector";
import { useCreationProjects } from "@/components/home/use-creation-projects";
import { creationNavigation, creationWorkspaces } from "./navigation";
import { workspaceActiveSection } from "./route-policy";
import { useSessionCatalog } from "./use-session-catalog";
import { SessionList } from "./session-list";
import styles from "./workspace-shell.module.css";

export function WorkspaceShell({children,immersive=false}:{children:ReactNode;immersive?:boolean}) {
  const path=usePathname()||"/",router=useRouter(),brand=useBrand();
  const {user,ready,remaining,signOut}=useAuth(),{openAuth}=useAuthModal(),{openRecharge}=useRecharge(),{can,canPage}=useFeatureAccess();
  const team=useTeamEntryAccess(user),catalog=useSessionCatalog(),projects=useCreationProjects(user?.email||"",ready,can("canvas"));
  const [collapsed,setCollapsed]=useState(false),[mobile,setMobile]=useState(false),[account,setAccount]=useState(false);
  const accountRoot=useRef<HTMLDivElement>(null),mobileTrigger=useRef<HTMLButtonElement>(null),sidebar=useRef<HTMLElement>(null);
  const active=workspaceActiveSection(path);
  const href=(target:string)=>{if(!catalog.workspace||catalog.workspace==="personal")return target;const [base,query=""]=target.split("?");const params=new URLSearchParams(query);params.set("workspace",catalog.workspace);return `${base}?${params}`;};
  useEffect(()=>{setMobile(false);setAccount(false);},[path,user?.email]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!accountRoot.current?.contains(event.target as Node))setAccount(false);};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[]);
  useEffect(()=>{
    if(!mobile)return;
    const unlock=lockBodyScroll();
    const prior=document.activeElement as HTMLElement|null;
    sidebar.current?.querySelector<HTMLElement>("a,button")?.focus();
    const trap=(event:KeyboardEvent)=>{if(event.key==="Escape"){setMobile(false);return;}if(event.key!=="Tab")return;const items=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)')||[]).filter(item=>item.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    document.addEventListener("keydown",trap);
    return()=>{document.removeEventListener("keydown",trap);unlock();prior?.focus();};
  },[mobile]);
  const defaultBrand=brand.logo.startsWith("/brand/naumi/");
  return <div className={`${styles.shell} ${collapsed?styles.collapsed:""}`} data-workspace-shell={immersive?"immersive":"page"} onKeyDown={event=>{if(event.key==="Escape")setAccount(false);}}>
    <a className={styles.skip} href="#workspace-content">跳转到内容</a>
    {mobile&&<button type="button" className={styles.shade} aria-label="关闭导航" onClick={()=>setMobile(false)}/>}
    <aside ref={sidebar} id="workspace-navigation" className={`${styles.sidebar} ${mobile?styles.mobileOpen:""}`} aria-label="创作导航" role={mobile?"dialog":undefined} aria-modal={mobile||undefined}>
      <div className={styles.brandRow}><Link href="/" className={styles.brand} aria-label={`${brand.name} 首页`}><CachedImage src={defaultBrand?"/brand/naumi/horizontal-black.svg":brand.logo} alt={brand.name}/>{!defaultBrand&&!brand.logoHasText&&<span>{brand.name}</span>}</Link><button type="button" className={styles.collapseButton} aria-label={collapsed?"展开导航":"收起导航"} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button><button type="button" className={styles.mobileClose} aria-label="关闭导航" onClick={()=>setMobile(false)}><X/></button></div>
      {[creationNavigation,creationWorkspaces].map((group,index)=><nav key={index} className={index?styles.workspaces:styles.primary} aria-label={index?"工作台":"主要导航"}>{group.filter(item=>canPage(item.href)).map(item=><Link key={item.href} href={href(item.href)} title={item.label} aria-current={active===item.href?"page":undefined}><item.Icon/><span>{item.label}</span></Link>)}</nav>)}
      {catalog.allowed&&<section className={styles.history} aria-label="最近对话"><div className={styles.historyHeading}><h2>对话</h2><Link href={href("/agent")} aria-label="新对话"><Plus size={16}/></Link></div>{!user?<button className={styles.empty} onClick={()=>openAuth("sign-in")}>登录后查看对话</button>:<>
        <SessionList key={catalog.key} sessions={catalog.sessions.slice(0,6)} onLoad={id=>router.push(href(`/agent?session=${encodeURIComponent(id)}`))} onRename={catalog.rename} onDelete={catalog.remove} onPin={catalog.pin}/>
        {catalog.error?<div role="alert"><p className={styles.empty}>{catalog.error}</p><button className={styles.empty} onClick={catalog.retry} aria-label="重试读取对话">重试</button></div>:!catalog.sessions.length&&<p className={styles.empty}>{catalog.loading?"正在读取":"暂无对话"}</p>}
        <Link href={href("/agent?history=1")} className={styles.more}>更多</Link>
      </>}</section>}
      {can("canvas")&&<section className={styles.history} aria-label="最近画布"><div className={styles.historyHeading}><h2>画布</h2><Link href="/canvas" aria-label="打开画布"><Plus size={16}/></Link></div>{projects.projects.slice(0,4).map(project=><Link className={styles.project} key={project.projectKey} href={`/canvas?project=${encodeURIComponent(project.projectKey)}`} title={project.name}>{project.cover?<CachedImage src={project.cover} alt=""/>:<span className={styles.projectPlaceholder}/>}<span>{project.name}</span></Link>)}{projects.error?<button className={styles.empty} onClick={projects.retry}>读取失败 · 重试</button>:!projects.projects.length&&<p className={styles.empty}>{!user?"登录后查看画布":projects.loading?"正在读取":"暂无画布"}</p>}</section>}
      {canPage("/contact")&&<Link href="/contact" className={styles.support} title="帮助与反馈"><Headset/><span>帮助与反馈</span></Link>}
    </aside>
    <div className={styles.main}>
      <header className={styles.topbar}>
        <button ref={mobileTrigger} type="button" className={styles.mobileMenu} aria-label="打开导航" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={()=>setMobile(true)}><Menu/></button>
        <div className={styles.accountControls}>
          <WorkspaceSelector/>
          {team&&<Link href="/team" className={styles.topLink}><Users size={16}/>我的团队</Link>}
          {user&&<Link href="/account?tab=credits" className={styles.topLink}>{remaining.toLocaleString()} 积分</Link>}
          <div ref={accountRoot} className={styles.accountRoot}><button type="button" className={styles.accountButton} aria-expanded={!!user&&account} aria-haspopup={user?"menu":undefined} onClick={()=>user?setAccount(!account):openAuth("sign-in")}><span>{user?"我的账户":"登录 / 注册"}</span><span className={styles.avatar}>{(user?.name||brand.name||"N").slice(0,1).toUpperCase()}</span></button>{user&&account&&<AccountDockMenu user={user} remaining={remaining} dark={false} showThemeToggle={false} className="right-0 top-full mt-2" onClose={()=>setAccount(false)} onToggleTheme={()=>{}} onRedeem={()=>openRecharge("code")} onSignOut={signOut}/>}</div>
        </div>
      </header>
      <div id="workspace-content" className="workspace-content" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
