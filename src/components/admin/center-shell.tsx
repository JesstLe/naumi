"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, Building2, HeartPulse, ImageIcon, Layers, LogOut, Menu, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
import type { BiSection } from "@/lib/bi/contracts";
import styles from "./center-shell.module.css";

type Section = BiSection | "billing" | "pricing" | "settings" | "model-config" | "model-health" | "model-management" | "teams" | "team-access" | "feature-access" | "deployments" | "tenants" | "creations" | "supplier-balances";
type Entry = { id: Section; label: string; icon: typeof Users; href?: string };
const groups: { label: string; entries: Entry[] }[] = [
 {label:"",entries:[
 {id:"overview",label:"总览",icon:BarChart3,href:"/admin/center"},
 {id:"tenants",label:"租户管理",icon:Building2,href:"/admin/tenants"},
 {id:"users",label:"用户管理",icon:Users,href:"/admin/center?section=users"},
 {id:"creations",label:"创作记录",icon:ImageIcon,href:"/admin/creations"},
 {id:"billing",label:"套餐与账务",icon:Wallet,href:"/admin/billing"},
 {id:"model-management",label:"模型与供应商",icon:Layers,href:"/admin/model-management"},
 {id:"settings",label:"系统与审计",icon:ShieldCheck,href:"/admin?view=settings"}]},
 {label:"",entries:[{id:"deployments",label:"部署管理",icon:Building2,href:"/admin/deployments"}]}
];
const category=(section:Section):Section=>["operations","artworks","conversations","calls"].includes(section)?"creations":["teams","team-access"].includes(section)?"tenants":["model-config","model-health","models","supplier-balances"].includes(section)?"model-management":["orders","ledger","pricing"].includes(section)?"billing":["access","management"].includes(section)?"settings":section;
const legacyLinks:Partial<Record<Section,{label:string;href:string}[]>>={
 creations:[{label:"统一创作",href:"/admin/creations"},{label:"历史业务任务",href:"/admin/center?section=operations"},{label:"图片",href:"/admin/center?section=artworks"},{label:"对话",href:"/admin/center?section=conversations"},{label:"调用审计",href:"/admin/center?section=calls"}],
 tenants:[{label:"租户",href:"/admin/tenants"},{label:"既有团队",href:"/admin/teams"},{label:"入口授权",href:"/admin/team-access"}],
 users:[{label:"用户",href:"/admin/center?section=users"},{label:"功能权限",href:"/admin/feature-access"}],
 billing:[{label:"账务配置",href:"/admin/billing"},{label:"钱包与充值",href:"/admin/billing?section=wallet"},{label:"充值订单",href:"/admin/center?section=orders"},{label:"积分流水",href:"/admin/center?section=ledger"},{label:"价格表",href:"/admin/billing/price-table"},{label:"采购与对账",href:"/admin/billing/supplier-cost"},{label:"定价测算",href:"/admin/pricing"}],
 "model-management":[{label:"模型管理",href:"/admin/model-management"},{label:"供应商余额",href:"/admin/supplier-balances"},{label:"完整配置",href:"/admin/bi/models"},{label:"健康巡检",href:"/admin/model-health"},{label:"质量审计",href:"/admin/center?section=models"}],
 settings:[{label:"站点与接口",href:"/admin?view=settings"},{label:"管理日志",href:"/admin/center?section=management"},{label:"访问记录",href:"/admin/center?section=access"}]
};
/** Shared navigation only; each page and API retains its own administrator checks. */
export function AdminCenterShell({ active, children, onBiNavigate, light = false, deploymentsOnly = false }: {
  active: Section;
  children: React.ReactNode;
  onBiNavigate?: (section: BiSection) => void;
  light?: boolean;
  deploymentsOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fleetEnabled, setFleetEnabled] = useState(active === "deployments");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/admin/fleet/status", {cache:"no-store", signal:abort.signal}).then(async response => {
      if(response.ok) { const data=await response.json(); if(!abort.signal.aborted)setFleetEnabled(data.enabled===true); }
    }).catch(() => {});
    return () => abort.abort();
  }, []);
  const [logoutError, setLogoutError] = useState("");
  const pathname=usePathname();
  const search=useSearchParams();
  const currentLink=(href:string)=>{const [path,query]=href.split('?');if(path!==pathname)return false;const expected=new URLSearchParams(query);if(!expected.size)return !search.get('section')&&!search.get('view');return [...expected].every(([key,value])=>search.get(key)===value);};
  async function logout() {
    try {
      const response = await fetch("/api/admin/login", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error();
      window.location.replace("/admin");
    } catch { setLogoutError("退出失败，请重试"); }
  }
  return <div className={`${styles.shell} ${light ? styles.light : ""}`}>
    <header className={styles.mobileHeader}>
      <Link href={deploymentsOnly ? "/admin/deployments" : "/admin/center"} prefetch={false}>Naumi 管理中心</Link>
      <button type="button" aria-label={open ? "收起管理导航" : "展开管理导航"} aria-expanded={open} aria-controls="admin-center-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
    </header>
    <aside className={`${styles.sidebar} ${open ? styles.open : ""}`} id="admin-center-navigation">
      <Link className={styles.brand} href={deploymentsOnly ? "/admin/deployments" : "/admin/center"} prefetch={false}>Naumi <span>平台管理</span></Link>
      <p className={styles.private}>{deploymentsOnly ? "实例授权运维" : ""}</p>
      <nav aria-label="管理中心导航">
        {groups.filter(group => !deploymentsOnly || group.entries.some(entry => entry.id === "deployments")).map(group => <div className={styles.group} key={`${group.label}:${group.entries[0]?.id}`}>
          <p className={styles.groupLabel}>{group.label}</p>
          {group.entries.filter(entry => (!deploymentsOnly || entry.id === "deployments") && (entry.id !== "deployments" || fleetEnabled)).map(({ id, label, icon: Icon, href }) => <Link key={id} prefetch={false}
            href={href || `/admin/center?section=${id}`}
            aria-current={category(active) === id ? "page" : undefined}
            className={category(active) === id ? styles.active : ""}
            onClick={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              setOpen(false);
              if (!href && onBiNavigate) { event.preventDefault(); onBiNavigate(id as BiSection); }
            }}>
            <Icon size={17} />{label}
          </Link>)}
        </div>)}
      </nav>
      <Link className={styles.back} href="/" prefetch={false}><ArrowLeft size={16} />返回工作台</Link>
      {!deploymentsOnly && <button type="button" className={styles.logout} onClick={() => void logout()}><LogOut size={16} />退出管理中心</button>}
      {logoutError && <p className={styles.logout} role="alert">{logoutError}</p>}
    </aside>
    <div className={styles.content}><header className={styles.topbar}><span>平台　/　{groups.flatMap(g=>g.entries).find(e=>e.id===category(active))?.label||"管理"}</span><span>管理员</span></header>{!deploymentsOnly&&!/^\/admin\/tenants\//.test(pathname)&&legacyLinks[category(active)]&&<nav className={styles.subnav} aria-label="模块功能">{legacyLinks[category(active)]!.map(link=><Link key={link.href} href={link.href} prefetch={false} aria-current={currentLink(link.href)?'page':undefined}>{link.label}</Link>)}</nav>}{children}</div>
  </div>;
}
