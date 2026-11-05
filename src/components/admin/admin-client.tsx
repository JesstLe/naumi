"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { adminDestination } from "@/lib/admin-navigation";
import { useEffect } from "react";
import { useAdminEntry } from "./use-admin-entry";
import { Loader2, ShieldAlert, Lock } from "lucide-react";
import { AdminSettings } from "@/components/admin/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const settingsView = searchParams.get("view") === "settings";
  const destination = adminDestination(searchParams.get("next"));
  const entry=useAdminEntry();
  const {status,localAdmin,password:pw,busy:pwBusy,error:pwErr,setPassword:setPw,submitLocal}=entry;
  useEffect(() => {
    // Bearer-only Supabase sessions retain their original settings entry:
    // a browser page navigation cannot carry that Authorization header.
    if (status === "ok" && localAdmin && !settingsView) router.replace(destination);
  }, [status, localAdmin, settingsView, destination, router]);

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

  if (status === "unavailable") {
    return <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p role="status" className="text-sm text-muted-foreground">后台验证暂不可用</p>
      <Button variant="outline" onClick={entry.retry}>重新验证</Button>
    </div>;
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
