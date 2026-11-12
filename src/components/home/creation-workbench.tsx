"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { Bell,Check,ChevronDown,FolderClosed,Headset,Menu,MessageSquare,MessageSquarePlus,Moon,PanelLeftClose,PanelsTopLeft,MoreHorizontal,Pencil,Pin,Plus,Search,SlidersHorizontal,Sun,Trash2,Users,X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useBrand } from "@/lib/brand-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { useRecharge } from "@/lib/recharge-modal-context";
import { ACCOUNT_THEME_EVENT,AccountDockMenu,toggleAccountTheme,useTeamEntryAccess } from "@/components/account/account-dock-menu";
import { SurfaceAppearanceProvider } from "@/components/ui/surface-appearance";
import { WorkspaceSelector } from "@/components/saas/workspace-selector";
import { CachedImage } from "@/components/cached-image";
import { SiteFooter } from "@/components/site-footer";
import { useSiteProfile } from "@/lib/site-control/client";
import { OFFICIAL_IMAGE_SKILLS } from "@/lib/image-skills/catalog";
import { useCreationProjects } from "./use-creation-projects";
import type { CreationWorkbenchPort } from "./creation-contract";
import { CreationComposer } from "./creation-composer";
import { CreationDiscovery } from "./creation-discovery";
import { CreationMessage,CreationImageViewer } from "./creation-message";
import styles from "./creation-workbench.module.css";
import { creationNavigation as navigation, creationWorkspaces as workspaces } from "@/components/workspace/navigation";


function awayFromBottom(){const doc=document.scrollingElement;return doc?doc.scrollHeight-doc.scrollTop-doc.clientHeight:0;}

const skillIds=["product-white","product-scene","product-suite","product-retouch","product-color","campaign-poster","packaging"];

export function CreationWorkbench({port,children}:{port:CreationWorkbenchPort;children?:React.ReactNode}){
  const {user,ready,remaining,signOut}=useAuth(),{openAuth}=useAuthModal(),brand=useBrand(),{can,canPage}=useFeatureAccess(),{openRecharge}=useRecharge();
  const site=useSiteProfile();
  const team=useTeamEntryAccess(user),projects=useCreationProjects(user?.email||"",ready,can("canvas"));
  const [dark,setDark]=useState(false),[collapsed,setCollapsed]=useState(false),[mobile,setMobile]=useState(false),[account,setAccount]=useState(false),[banner,setBanner]=useState(true),[tab,setTab]=useState("generate"),[preview,setPreview]=useState(""),[search,setSearch]=useState(""),[searching,setSearching]=useState(false),[toBottom,setToBottom]=useState(false),[menu,setMenu]=useState(""),[renaming,setRenaming]=useState<{id:string;value:string}|null>(null),[confirmDelete,setConfirmDelete]=useState("");
  const bottom=useRef<HTMLDivElement>(null),stream=useRef<HTMLDivElement>(null),follow=useRef(true),accountRoot=useRef<HTMLDivElement>(null);
  useEffect(()=>{const sync=()=>setDark(document.documentElement.classList.contains("dark"));sync();window.addEventListener(ACCOUNT_THEME_EVENT,sync);window.addEventListener("storage",sync);return()=>{window.removeEventListener(ACCOUNT_THEME_EVENT,sync);window.removeEventListener("storage",sync);};},[]);
  useEffect(()=>{const close=(e:MouseEvent)=>{if(!accountRoot.current?.contains(e.target as Node))setAccount(false);};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[]);
  useEffect(()=>{setAccount(false);setPreview("");setSearch("");setSearching(false);},[user?.email]);
  useEffect(()=>{setMobile(false);setTab("generate");follow.current=true;setToBottom(false);},[port.sessionId,port.conversation]);
  useEffect(()=>{if(port.conversation&&follow.current)bottom.current?.scrollIntoView({block:"end"});},[port.messages,port.conversation]);
  useEffect(()=>{if(!port.conversation)return;const measure=()=>setToBottom(awayFromBottom()>80);measure();window.addEventListener("scroll",measure,{passive:true});return()=>window.removeEventListener("scroll",measure);},[port.conversation]);
  useEffect(()=>{if(port.conversation)setToBottom(awayFromBottom()>80);},[port.messages,port.conversation]);
  useEffect(()=>{if(!menu&&!renaming)return;const close=(e:MouseEvent)=>{const target=e.target as Element|null;if(!target?.closest?.("[data-session-menu]")){setMenu("");setConfirmDelete("");}};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[menu,renaming]);
  function commitRename(){if(!renaming)return;const value=renaming.value.trim();if(value)void port.renameSession(renaming.id,value);setRenaming(null);}
  const current=port.sessions.find(s=>s.id===port.sessionId),date=current?new Date(current.updatedAt):new Date();
  const title=Number.isNaN(date.getTime())?"对话":`${date.getMonth()+1}月${date.getDate()}日`;
  const skills=skillIds.flatMap(id=>{const skill=OFFICIAL_IMAGE_SKILLS.find(s=>s.id==="official:"+id);return skill?[skill]:[];});
  const recentSessions=port.sessions.filter(s=>!search.trim()||s.title.includes(search.trim())).slice(0,searching?20:6);
  const defaultBrand=brand.logo.startsWith("/brand/naumi/");
  function create(){if(!port.canNavigate)return;setTab("generate");port.create();setMobile(false);}
  function canvasTab(){if(port.conversation&&!port.canNavigate)return;port.create();setTab("canvas");}
  return <SurfaceAppearanceProvider value={dark?"dark":"light"}><div className={`${styles.root} ${dark?styles.dark:""} ${collapsed?styles.collapsed:""}`} data-creation-view={port.conversation?"chat":"home"} data-theme={dark?"dark":"light"} onKeyDown={e=>{if(e.key==="Escape"){setPreview("");setMobile(false);setAccount(false);}}}>
    {!port.conversation&&banner&&<div className={styles.announcement}>{canPage("/templates")&&<Link href="/templates"><span>模板中心</span>商品主图 · 场景图 · 服装上身 · A+ 详情页<ChevronDown/></Link>}<button type="button" aria-label="关闭顶部入口" onClick={()=>setBanner(false)}><X/></button></div>}
    <div className={styles.layout}>
      {mobile&&<button type="button" className={styles.sidebarShade} aria-label="关闭导航" onClick={()=>setMobile(false)}/>}
      <aside className={`${styles.sidebar} ${mobile?styles.mobileOpen:""}`} aria-label="创作导航">
        <div className={styles.brandRow}><Link href="/" onClick={e=>{e.preventDefault();create();}} className={styles.brand}><CachedImage src={defaultBrand?(dark?"/brand/naumi/horizontal-white.svg":"/brand/naumi/horizontal-black.svg"):brand.logo} alt={brand.name}/>{!defaultBrand&&!brand.logoHasText&&<span>{brand.name}</span>}</Link><button type="button" aria-label={collapsed?"展开导航":"收起导航"} onClick={()=>{if(window.innerWidth<=760)setMobile(false);else setCollapsed(!collapsed);}}><PanelLeftClose/></button></div>
        <nav className={styles.primaryNav}>{navigation.filter(n=>canPage(n.href)).map(n=>n.href==="/"?<button type="button" title={n.label} key={n.href} disabled={!port.canNavigate} aria-current={!port.conversation&&tab==="generate"?"page":undefined} onClick={create}><n.Icon/><span>{n.label}</span></button>:<Link title={n.label} href={n.href} key={n.href}><n.Icon/><span>{n.label}</span></Link>)}</nav>
        <nav className={styles.workspaceNav}>{workspaces.filter(n=>canPage(n.href)).map(n=><Link title={n.label} href={n.href} key={n.href}><n.Icon/><span>{n.label}</span></Link>)}</nav>
        {can("agent")&&<section className={styles.historySection}><div className={styles.historyHeading}><h2>对话</h2><button type="button" aria-label="新对话" disabled={!port.canNavigate} onClick={create}><Plus/></button></div>{!user?<button type="button" className={styles.historyEmpty} onClick={()=>openAuth("sign-in")}>登录后查看对话</button>:<>{recentSessions.map(s=><div className={styles.historyItem} data-session-menu key={s.id}>{renaming?.id===s.id?<form className={styles.historyRename} onSubmit={e=>{e.preventDefault();commitRename();}}><input autoFocus value={renaming.value} aria-label="会话名称" onChange={e=>setRenaming({id:s.id,value:e.target.value})} onKeyDown={e=>{if(e.key==="Escape")setRenaming(null);}} onBlur={commitRename}/><button type="submit" aria-label="确认重命名" onMouseDown={e=>e.preventDefault()}><Check/></button></form>:<>
          <button type="button" className={styles.historyMain} aria-current={port.sessionId===s.id?"page":undefined} disabled={!port.canNavigate||!!port.loadingId} title={s.title} onClick={()=>port.load(s.id)}>{s.lastImageUrl?<CachedImage src={s.lastImageUrl} alt=""/>:<span className={styles.conversationIcon}><MessageSquare/></span>}<span className={styles.historyTitle}>{s.pinned&&<Pin className={styles.historyPinIcon}/>}<span>{s.title||"新对话"}</span></span></button>
          <button type="button" className={styles.historyDots} aria-label={`${s.title||"新对话"} 会话操作`} aria-haspopup="menu" aria-expanded={menu===s.id} onClick={()=>{setMenu(menu===s.id?"":s.id);setConfirmDelete("");}}><MoreHorizontal/></button>
          {menu===s.id&&<div className={styles.historyMenu} role="menu">{confirmDelete===s.id?<><p>删除这条会话记录？</p><div className={styles.historyMenuRow}><button type="button" role="menuitem" className={styles.historyDanger} onClick={()=>{setMenu("");void port.deleteSession(s.id);}}>删除</button><button type="button" role="menuitem" onClick={()=>setConfirmDelete("")}>取消</button></div></>:<>
            <button type="button" role="menuitem" onClick={()=>{setMenu("");port.pinSession(s.id,!s.pinned);}}><Pin/>{s.pinned?"取消置顶":"置顶"}</button>
            <button type="button" role="menuitem" onClick={()=>{setMenu("");setRenaming({id:s.id,value:s.title||""});}}><Pencil/>重命名</button>
            <button type="button" role="menuitem" className={styles.historyDanger} onClick={()=>setConfirmDelete(s.id)}><Trash2/>删除</button>
          </>}</div>}
        </>}</div>)}{!port.sessions.length&&<span className={styles.historyEmpty}>{port.sessionsLoading?"正在读取":"暂无对话"}</span>}<button type="button" className={styles.historyMore} onClick={port.history}>更多</button></>}</section>}
        {can("canvas")&&<section className={styles.historySection}><div className={styles.historyHeading}><h2>画布</h2><Link href="/canvas" aria-label="打开画布"><Plus/></Link></div>{!user?<button type="button" className={styles.historyEmpty} onClick={()=>openAuth("sign-in")}>登录后查看画布</button>:<>{projects.projects.slice(0,4).map(p=><Link className={styles.historyItem} key={p.projectKey} title={p.name} href={`/canvas?project=${encodeURIComponent(p.projectKey)}`}>{p.cover?<CachedImage src={p.cover} alt=""/>:<span className={styles.conversationIcon}><PanelsTopLeft/></span>}<span>{p.name}</span></Link>)}{projects.error?<button type="button" className={styles.historyEmpty} onClick={projects.retry}>读取失败 · 重试</button>:!projects.projects.length&&<span className={styles.historyEmpty}>{projects.loading?"正在读取":"暂无画布"}</span>}</>}</section>}
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button type="button" className={styles.mobileMenu} aria-label="打开导航" onClick={()=>setMobile(true)}><Menu/></button>
          {port.conversation&&<div className={styles.chatTopTools}><button type="button" aria-label="搜索对话" onClick={()=>setSearching(!searching)}><Search/></button><button type="button" aria-label="管理对话历史" onClick={port.history}><SlidersHorizontal/></button>{canPage("/works")&&<Link href="/works" aria-label="我的作品"><FolderClosed/></Link>}</div>}
          <WorkspaceSelector/>
          {!port.conversation&&team&&<Link href="/team" className={styles.topLink}><Users/>我的团队</Link>}
          {user&&<Link href="/account?tab=credits" className={styles.topLink}>{remaining.toLocaleString()} 积分</Link>}
          <button type="button" className={styles.topIcon} aria-label={dark?"切换为浅色主题":"切换为深色主题"} aria-pressed={dark} onClick={()=>setDark(toggleAccountTheme())}>{dark?<Sun/>:<Moon/>}</button>
          <div ref={accountRoot} className={styles.accountRoot}><button type="button" className={styles.accountButton} aria-expanded={!!user&&account} onClick={()=>user?setAccount(!account):openAuth("sign-in")}><span>{user?"我的账户":"登录 / 注册"}</span><span className={styles.avatar}>{(user?.name||brand.name||"N").slice(0,1).toUpperCase()}</span></button>{user&&account&&<AccountDockMenu user={user} remaining={remaining} dark={dark} className="right-0 top-full mt-2" onClose={()=>setAccount(false)} onToggleTheme={()=>setDark(toggleAccountTheme())} onRedeem={()=>openRecharge("code")} onSignOut={signOut}/>}</div>
        </header>
        {searching&&<div className={styles.searchHistory}><input aria-label="搜索对话" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索对话"/>{recentSessions.map(s=><button type="button" disabled={!port.canNavigate} key={s.id} onClick={()=>{port.load(s.id);setSearching(false);}}>{s.title}</button>)}</div>}
        {port.conversation?<section className={styles.conversation} aria-label="Agent 对话"><h1 className={styles.chatDate}>{title}</h1><div ref={stream} className={styles.messageStream} aria-busy={port.busy} onWheel={()=>{follow.current=false;}}>{port.messages.map((m,i)=><CreationMessage key={i} message={m} previous={port.messages[i-1]} port={port} onPreview={setPreview}/>)}</div>{toBottom&&<div className={styles.toBottom}><button type="button" aria-label="滚动到底部" onClick={()=>{follow.current=true;bottom.current?.scrollIntoView({behavior:"smooth",block:"end"});}}>回到底部<ChevronDown/></button></div>}<div className={styles.chatComposer}><CreationComposer port={port}/></div><div ref={bottom}/></section>:<>
          <section className={styles.hero}><h1>你好，今天想要创作什么？</h1><div className={styles.tabs} role="tablist" aria-label="创作方式"><button type="button" role="tab" aria-selected={tab==="generate"} onClick={()=>setTab("generate")}>生成</button>{can("canvas")&&<button type="button" role="tab" aria-selected={tab==="canvas"} onClick={canvasTab}>画布</button>}</div>
            {tab==="generate"?<>{can("agent")?<CreationComposer port={port}/>:<div className={styles.empty}>{!ready?"正在加载":"Agent 功能尚未授权"}</div>}<div className={styles.skillRow}>{skills.map(skill=><button type="button" key={skill.id} aria-pressed={port.skill?.id===skill.id} disabled={!can("agent")} onClick={()=>{port.setSkill(skill);if(!port.text.trim())port.setText(`使用「${skill.name}」创作：`);}}>/{skill.name}</button>)}</div></>:<div className={styles.canvasCards}><Link href="/canvas" className={styles.newCanvas}><Plus/>新建画布</Link>{projects.projects.slice(0,2).map(p=><Link href={`/canvas?project=${encodeURIComponent(p.projectKey)}`} key={p.projectKey}>{p.cover?<CachedImage src={p.cover} alt=""/>:<PanelsTopLeft/>}<span>{p.name}</span></Link>)}</div>}
          </section><CreationDiscovery/>{site.mode==="platform"&&<SiteFooter/>}
        </>}
        {canPage("/contact")&&<Link href="/contact" className={styles.support} aria-label="帮助与反馈"><Headset/></Link>}
      </div>
    </div>
    {children}
    {preview&&<CreationImageViewer url={preview} onClose={()=>setPreview("")}/>}
  </div></SurfaceAppearanceProvider>;
}
