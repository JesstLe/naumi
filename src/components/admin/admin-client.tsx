"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { adminDestination } from "@/lib/admin-navigation";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { browserSupabase } from "@/lib/supabase";
import { AdminSettings } from "@/components/admin/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Dedicated /admin page. 两条鉴权通道:
//  ① 本地管理员(开源版/自托管无 Supabase):向导设的密码 → cookie 会话。
//  ② 官方云 Supabase:登录用户邮箱 == ADMIN_EMAIL。
// 优先看本地通道(有本地密码就走它);否则回落 Supabase。

// sessionStorage 缓存 Supabase 校验结果(5 分钟),避免每次刷新都跑一遍 getSession +
// 远程 auth.getUser。只控前端 UI gate;所有 admin 接口仍在服务端逐次 requireAdmin 校验。
const CACHE_KEY = "naumi:adminVerifiedV1";
const CACHE_TTL_MS = 5 * 60 * 1000;

type AdminCache = { email: string; ts: number };
function readCache(): AdminCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as AdminCache;
    if (Date.now() - c.ts > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}
function writeCache(email: string) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ email, ts: Date.now() }));
  } catch {
    /* quota / privacy mode — silently skip */
  }
}
function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function AdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const settingsView = searchParams.get("view") === "settings";
  const destination = adminDestination(searchParams.get("next"));
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const [status, setStatus] = useState<
    "loading" | "denied" | "ok" | "local-login"
  >("loading");
  // ok 时:是否走本地管理员通道(决定 AdminSettings 用 cookie 而非 Bearer)。
  const [localAdmin, setLocalAdmin] = useState(false);
  useEffect(() => {
    // Bearer-only Supabase sessions retain their original settings entry:
    // a browser page navigation cannot carry that Authorization header.
    if (status === "ok" && localAdmin && !settingsView) router.replace(destination);
  }, [status, localAdmin, settingsView, destination, router]);

  // 本地密码登录框状态
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── ① 本地管理员通道(开源版/自托管)──
      try {
        const r = await fetch("/api/admin/login", { cache: "no-store" });
        if (!r.ok) { setPwErr("后台验证暂不可用，请稍后重试"); setStatus("local-login"); return; }
        const d = (await r.json()) as {
          localAvailable?: boolean;
          localAuthed?: boolean;
          nativeAdmin?: boolean;
          passwordRequired?: boolean;
        };
        if (cancelled) return;
        // 本地密码会话 或 站长邮箱账号(role=admin)会话,都算已登录管理员。
        if (d.passwordRequired && !d.localAuthed) { setStatus("local-login"); return; }
        if (d.localAuthed || d.nativeAdmin) {
          setLocalAdmin(true);
          setStatus("ok");
          return;
        }
        if (d.localAvailable) {
          // 设了本地密码但未登录 → 显示密码框(不走 Supabase)。
          setStatus("local-login");
          return;
        }
      } catch {
        /* 忽略,回落 Supabase 通道 */
      }

      // ── ② 官方云 Supabase 通道 ──
      if (!ready) return;
      if (!user) {
        openAuth("sign-in");
        return;
      }
      const cached = readCache();
      if (cached && cached.email === user.email) setStatus("ok");
      try {
        const sb = browserSupabase();
        const { data } = await sb.auth.getSession();
        const tok = data.session?.access_token;
        if (!tok) {
          clearCache();
          openAuth("sign-in");
          return;
        }
        const res = await fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (cancelled) return;
        if (res.ok) {
          writeCache(user.email);
          setLocalAdmin(false);
          setStatus("ok");
        } else {
          clearCache();
          setStatus("denied");
        }
      } catch {
        if (!cancelled && !cached) setStatus("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, openAuth]);

  async function submitLocal() {
    if (pw.length < 1) return;
    setPwErr(null);
    setPwBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !d?.ok) {
        setPwErr(d?.error || "登录失败");
        setPwBusy(false);
        return;
      }
      setPw("");
      setLocalAdmin(true);
      setStatus("ok");
    } catch {
      setPwErr("网络错误,请重试");
      setPwBusy(false);
    }
  }

  if (status === "local-login") {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-c-border2 bg-c-card p-6 shadow-btn">
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl [background:var(--grad-acc)]">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-c-text">管理中心访问验证</h1>
            <p className="text-[13px] text-c-text3">
              请输入后台访问密码。已登录管理员也需要验证。
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitLocal();
            }}
            className="space-y-3"
          >
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="后台访问密码"
              disabled={pwBusy}
              error={!!pwErr}
            />
            {pwErr && (
              <p className="text-[12.5px] font-medium text-c-danger">{pwErr}</p>
            )}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={pwBusy || pw.length < 1}
            >
              {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {pwBusy ? "登录中…" : "登录"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        校验管理员权限…
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold">无权限访问</p>
        <p className="text-sm text-muted-foreground">
          此页面仅限管理员。如需访问请联系站点管理员。
        </p>
      </div>
    );
  }

  if (!settingsView && localAdmin) return <p className="p-8 text-sm text-muted-foreground">正在打开管理中心…</p>;

  return (
    <AdminCenterShell active="settings">
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">管理供应商接口、模型和站点设置。价格、成本与赠送规则在计费管理中调整。</p>
      </div>
      <AdminSettings localAdmin={localAdmin} />
    </div>
    </AdminCenterShell>
  );
}
