"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  CreditCard,
  LogOut,
  Sparkles,
  Users,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { useManagementEntry } from "@/components/account/use-management-entry";
import { displayEmail } from "@/lib/account-identity";

function fmt(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    s
  );
}

export function UserMenu() {
  const { user, remaining, signOut } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: entry } = useManagementEntry(user);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;
  const initial = user.name.trim().charAt(0).toUpperCase() || "N";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm transition-colors hover:bg-secondary"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="hidden font-medium sm:block">{user.name}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card card-shadow">
          <div className="border-b border-border p-4">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            {displayEmail(user.email) && (
              <p className="truncate text-xs text-muted-foreground">
                {displayEmail(user.email)}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t("nav.credits")}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmt(t("menu.remaining"), { n: remaining })}
              </span>
            </div>
          </div>
          <nav className="p-1.5">
            <MenuLink
              href="/dashboard"
              icon={<LayoutGrid className="h-4 w-4" />}
              label={t("menu.myWorks")}
              onNavigate={() => setOpen(false)}
            />
            <MenuLink
              href="/account"
              icon={<CreditCard className="h-4 w-4" />}
              label={t("menu.account")}
              onNavigate={() => setOpen(false)}
            />
            <MenuLink
              href="/account/security"
              icon={<Lock className="h-4 w-4" />}
              label={t("menu.security")}
              onNavigate={() => setOpen(false)}
            />
            {entry?.allowed && <MenuLink
              href={entry.href}
              icon={<Users className="h-4 w-4" />}
              label={entry.enterprise ? (locale === "en" ? "Enterprise" : "企业管理") : (locale === "en" ? "Team management" : "团队管理")}
              onNavigate={() => setOpen(false)}
            />}
            <button
              onClick={() => {
                setOpen(false);
                signOut();
                router.push("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {t("menu.signOut")}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
