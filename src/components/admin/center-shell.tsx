"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, Building2, ImageIcon, Layers, LogOut, Menu, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
import type { BiSection } from "@/lib/bi/contracts";
import styles from "./center-shell.module.css";

type Section = BiSection | "billing" | "pricing" | "settings" | "model-config" | "model-management" | "teams" | "team-access";
type Entry = { id: Section; label: string; icon: typeof Users; href?: string };
const groups: { label: string; entries: Entry[] }[] = [
  { label: "运营概览", entries: [{ id: "overview", label: "数据概览", icon: BarChart3 }] },
  { label: "用户管理", entries: [{ id: "users", label: "用户与企业", icon: Users }, { id: "teams", label: "团队与子账号", icon: Building2, href: "/admin/teams" }, { id: "team-access", label: "团队入口授权", icon: ShieldCheck, href: "/admin/team-access" }] },
  { label: "计费管理", entries: [
    { id: "billing", label: "模型价格表", icon: Wallet, href: "/admin/billing/price-table" },
    { id: "pricing", label: "内部定价测算", icon: BarChart3, href: "/admin/pricing" },
  ] },
  { label: "业务记录", entries: [
    { id: "operations", label: "业务任务", icon: Layers },
    { id: "artworks", label: "图片与操作内容", icon: ImageIcon },
    { id: "conversations", label: "对话与操作内容", icon: Layers },
    { id: "calls", label: "模型调用记录", icon: Activity },
  ] },
  { label: "财务与审计", entries: [
    { id: "orders", label: "充值订单", icon: Building2 },
    { id: "ledger", label: "积分流水", icon: Wallet },
    { id: "models", label: "模型与质量审计", icon: Activity },
    { id: "management", label: "用户管理日志", icon: ShieldCheck },
    { id: "access", label: "后台访问记录", icon: ShieldCheck },
  ] },
  { label: "系统设置", entries: [
    { id: "model-config", label: "模型配置中心", icon: Layers, href: "/admin/bi/models" },
    { id: "settings", label: "接口与站点设置", icon: Settings, href: "/admin?view=settings" },
  ] },
];

/** Shared navigation only; each page and API retains its own administrator checks. */
export function AdminCenterShell({ active, children, onBiNavigate }: {
  active: Section;
  children: React.ReactNode;
  onBiNavigate?: (section: BiSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const router = useRouter();
  async function logout() {
    try {
      const response = await fetch("/api/admin/login", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error();
      router.replace("/admin");
      router.refresh();
    } catch { setLogoutError("退出失败，请重试"); }
  }
  return <div className={styles.shell}>
    <header className={styles.mobileHeader}>
      <Link href="/admin/center" prefetch={false}>Naumi 管理中心</Link>
      <button type="button" aria-label={open ? "收起管理导航" : "展开管理导航"} aria-expanded={open} aria-controls="admin-center-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
    </header>
    <aside className={`${styles.sidebar} ${open ? styles.open : ""}`} id="admin-center-navigation">
      <Link className={styles.brand} href="/admin/center" prefetch={false}>Naumi <span>管理中心</span></Link>
      <p className={styles.private}><ShieldCheck size={15} />仅管理员可见</p>
      <nav aria-label="管理中心导航">
        <div className={styles.modelManagementEntry}><Link href="/admin/model-management" prefetch={false} aria-current={active === "model-management" ? "page" : undefined} className={active === "model-management" ? styles.modelManagementActive : ""} onClick={() => setOpen(false)}><Layers size={18} /><span>模型管理 <small>模型与积分</small></span><span className={styles.modelManagementBadge}>新</span></Link></div>
        {groups.map(group => <div className={styles.group} key={group.label}>
          <p className={styles.groupLabel}>{group.label}</p>
          {group.entries.map(({ id, label, icon: Icon, href }) => <Link key={id} prefetch={false}
            href={href || `/admin/center?section=${id}`}
            aria-current={active === id ? "page" : undefined}
            className={active === id ? styles.active : ""}
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
      <button type="button" className={styles.logout} onClick={() => void logout()}><LogOut size={16} />退出管理中心</button>
      {logoutError && <p className={styles.logout} role="alert">{logoutError}</p>}
    </aside>
    <div className={styles.content}>{children}</div>
  </div>;
}
