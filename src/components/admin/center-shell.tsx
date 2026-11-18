"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import { useAppPathname, useAppSearchParams } from '@/lib/app-router-navigation';
import {ArrowLeft,LogOut,Menu,X} from 'lucide-react';
import type {BiSection} from '@/lib/bi/contracts';
import {SiteVersion} from '@/components/site-version';
import {scheduleVisibleRefresh} from '@/lib/visible-refresh';
import {adminCategory,adminEntries,adminLinkActive,adminModuleLinks,type AdminSection} from './navigation';
import {AdminPageSearch} from './page-search';
import styles from './center-shell.module.css';
import theme from './theme.module.css';
/** Presentation only. Each page and API retains its existing administrator checks. */
type ShellProps={active:AdminSection;children:React.ReactNode;onBiNavigate?:(section:BiSection)=>void;light?:boolean;deploymentsOnly?:boolean;embedded?:boolean;moduleNavigation?:boolean};
export function AdminCenterShell({embedded=false,...props}:ShellProps){return embedded?<>{props.children}</>:<AdminShell {...props}/>;}
function AdminShell({active,children,deploymentsOnly=false,moduleNavigation=true}:ShellProps){
 const [fleetEnabled,setFleetEnabled]=useState(active==='deployments'),[logoutError,setLogoutError]=useState(''),[pendingTotal,setPendingTotal]=useState(0);
 const mobile=useRef<HTMLDialogElement>(null),menu=useRef<HTMLButtonElement>(null);
 const pathname=useAppPathname()||'',search=useAppSearchParams(),category=adminCategory(active);
 useEffect(()=>{const abort=new AbortController();void fetch('/api/admin/fleet/status',{cache:'no-store',signal:abort.signal}).then(async response=>{if(response.ok){const data=await response.json();if(!abort.signal.aborted)setFleetEnabled(data.enabled===true);}}).catch(()=>{});return()=>abort.abort();},[]);
 // Billing backlog badge: passive read-only summary (no exposure write); a
 // failed poll simply keeps the previous count instead of surfacing errors.
 const refreshPendingBadge=!deploymentsOnly&&active!=='pending-review';
 useEffect(()=>{
   if(!refreshPendingBadge)return;
   const abort=new AbortController();
   const stop=scheduleVisibleRefresh(async()=>{
     const response=await fetch('/api/admin/billing/pending?view=summary',{cache:'no-store',signal:abort.signal});
     if(!response.ok||abort.signal.aborted)return;
     const data=await response.json();
     if(!abort.signal.aborted&&typeof data.total==='number')setPendingTotal(data.total);
   },60_000,true);
   return()=>{abort.abort();stop();};
 },[refreshPendingBadge]);
 useEffect(()=>{mobile.current?.close();},[pathname,search]);
 useEffect(()=>{const media=window.matchMedia('(min-width: 801px)');const close=()=>{if(media.matches)mobile.current?.close();};media.addEventListener('change',close);return()=>media.removeEventListener('change',close);},[]);
 async function logout(){try{const response=await fetch('/api/admin/login',{method:'DELETE',cache:'no-store'});if(!response.ok)throw Error();window.location.replace('/admin');}catch{setLogoutError('退出失败，请重试');}}
 const home=deploymentsOnly?'/admin/deployments':'/admin/center';
 const links=adminEntries.filter(entry=>(!deploymentsOnly||entry.id==='deployments')&&(entry.id!=='deployments'||fleetEnabled));
 const navigation=(isMobile=false)=><><div className={styles.brandRow}><Link className={styles.brand} href={home} prefetch={false} onClick={()=>mobile.current?.close()}><img src="/brand/naumi/symbol-black.svg" width={30} height={30} alt=""/><span>Naumi</span></Link>{isMobile&&<button aria-label="收起管理导航" className={styles.iconButton} onClick={()=>mobile.current?.close()}><X size={20}/></button>}</div>
 <nav className={styles.navigation} aria-label="管理中心导航">{links.map(({id,label,icon:Icon,href})=><Link key={id} href={href} prefetch={false} aria-current={category===id?'page':undefined} className={category===id?styles.active:undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;mobile.current?.close();}}><Icon size={18}/><span>{label}</span>{id==='billing'&&pendingTotal>0&&<span className={styles.navBadge} title={`待核查积压 ${pendingTotal}`}>{pendingTotal>99?'99+':pendingTotal}</span>}</Link>)}</nav>
 <div className={styles.sidebarFooter}><Link href="/" prefetch={false}><ArrowLeft size={16}/>返回工作台</Link>{!deploymentsOnly&&<button type="button" onClick={()=>void logout()}><LogOut size={16}/>退出管理中心</button>}{logoutError&&<p role="alert">{logoutError}</p>}</div></>;
 const tabs=moduleNavigation&&!deploymentsOnly&&!pathname.startsWith('/admin/tenants/')?adminModuleLinks[category]:undefined;
 return <div className={`${theme.theme} ${styles.shell}`} data-admin-ui="integrated"><aside className={styles.sidebar}>{navigation()}</aside>
 <dialog ref={mobile} id="admin-mobile-navigation" className={styles.mobileNavigation} aria-label="管理中心导航" onClick={e=>{if(e.target===e.currentTarget)mobile.current?.close();}} onClose={()=>menu.current?.focus()}>{navigation(true)}</dialog>
 <div className={styles.content}><header className={styles.topbar}><div className={styles.heading}><button ref={menu} type="button" className={styles.menuButton} aria-label="展开管理导航" aria-haspopup="dialog" aria-controls="admin-mobile-navigation" onClick={()=>mobile.current?.showModal()}><Menu size={21}/></button><span>{adminEntries.find(entry=>entry.id===category)?.label||'后台管理'}</span></div><div className={styles.topbarActions}><AdminPageSearch deploymentsOnly={deploymentsOnly} fleetEnabled={fleetEnabled}/><SiteVersion embedded/></div></header>
 {tabs&&<nav className={styles.subnav} aria-label="模块功能">{tabs.map(link=><Link key={link.href} href={link.href} prefetch={false} aria-current={adminLinkActive(link.href,pathname,new URLSearchParams(search.toString()))?'page':undefined}>{link.label}</Link>)}</nav>}<div className={styles.body}>{children}</div></div></div>;
}
