"use client";
import { useManagementEntry } from "./use-management-entry";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Gem,
  Gift,
  LogOut,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-context";
import { supabaseEnabled } from "@/lib/auth-mode";
import { displayEmail } from "@/lib/account-identity";
import { useI18n } from "@/lib/i18n/locale-context";
import { browserSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const ACCOUNT_THEME_EVENT = "naumi:theme-change";

export function currentThemeIsDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function toggleAccountTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(ACCOUNT_THEME_EVENT, { detail: { dark } }));
  return dark;
}

export function useAccountAdminStatus(user: SessionUser | null) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem("naumi:adminVerifiedV1");
      if (raw) {
        const cached = JSON.parse(raw) as { email: string; ts: number };
        if (cached.email === user.email && Date.now() - cached.ts <= 5 * 60 * 1000) {
          setIsAdmin(true);
        }
      }
    } catch {
      /* ignore stale cache */
    }

    let cancelled = false;
    void (async () => {
      try {
        let token: string | undefined;
        if (supabaseEnabled) {
          try {
            const { data } = await browserSupabase().auth.getSession();
            token = data.session?.access_token;
          } catch {
            /* cookie auth can still be probed */
          }
        }
        const response = await fetch("/api/admin/settings", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        setIsAdmin(response.ok);
        try {
          if (response.ok) {
            sessionStorage.setItem(
              "naumi:adminVerifiedV1",
              JSON.stringify({ email: user.email, ts: Date.now() })
            );
          } else {
            sessionStorage.removeItem("naumi:adminVerifiedV1");
          }
        } catch {
          /* ignore cache failures */
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}

/** Legacy consumers use the same canonical discovery as account settings. */
export function useTeamEntryAccess(user: SessionUser | null) {
  const { data } = useManagementEntry(user);
  return !!data?.allowed && data.href === '/team';
}

export function AccountDockMenu({
  user,
  remaining,
  dark,
  className,
  onClose,
  onToggleTheme,
  onRedeem,
  onSignOut,
}: {
  user: SessionUser;
  remaining: number;
  dark: boolean;
  isAdmin: boolean;
  className?: string;
  onClose: () => void;
  onToggleTheme: () => void;
  onRedeem: () => void;
  onSignOut: () => void;
}) {
  const { t, locale } = useI18n();
  const L = (zh: string, en: string) => (locale === "en" ? en : zh);
  const initial = user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase() || "U";
  const { data: entry } = useManagementEntry(user);

  return (
    <div
      data-testid="account-dock"
      role="menu"
      aria-label={t("nav.account")}
      className={cn(
        dark ? "account-dock-theme-dark" : "account-dock-theme-light",
        "absolute z-[80] w-[230px] rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[var(--shadow-pop)]",
        className
      )}
    >
      <div className="mb-1 flex items-center gap-2.5 border-b border-border px-2.5 pb-2.5 pt-1.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white [background:var(--grad-acc)]">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {displayEmail(user.email) || user.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            💎 {remaining} {t("nav.credits")}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleTheme}
        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-secondary"
      >
        <span className="flex items-center gap-2">
          {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {t("nav.theme")}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {dark ? t("nav.themeDark") : t("nav.themeLight")}
        </span>
      </button>
      <Link
        href="/account?tab=credits"
        onClick={onClose}
        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-secondary"
      >
        <span className="flex items-center gap-2">
          <Gem className="h-4 w-4" />
          {t("nav.credits")}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
      <button
          type="button"
          onClick={() => {
            onClose();
            onRedeem();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-secondary"
        >
          <Gift className="h-4 w-4" />
          {L("兑换码", "Redeem code")}
        </button>
      <Link
        href="/account/security"
        onClick={onClose}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-secondary"
      >
        <Settings className="h-4 w-4" />
        {t("menu.security")}
      </Link>
      {entry?.allowed && <Link
        data-testid="account-management-entry"
        role="menuitem"
        href={entry.href}
        onClick={onClose}
        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-secondary"
      >
        <span className="flex items-center gap-2"><Users className="h-4 w-4" />{entry?.enterprise ? L("企业管理", "Enterprise") : L("团队入口", "Team access")}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => {
          onClose();
          onSignOut();
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-[#E5484D] hover:bg-secondary"
      >
        <LogOut className="h-4 w-4" />
        {t("nav.signOut")}
      </button>
    </div>
  );
}
