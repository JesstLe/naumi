"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { allows, pageFeature, DEFAULT_POLICY, type AccessPolicy } from "./catalog";

const Context = createContext<{ ready: boolean; can: (id: string) => boolean; canPage: (href: string) => boolean }>({ ready: false, can: () => false, canPage: () => false });
export function FeatureAccessProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady, persistMode } = useAuth();
  const email = user?.email.toLowerCase() || "";
  const [snapshot, setSnapshot] = useState<{ email: string; policy: AccessPolicy } | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true, revision = 0;
    setSnapshot(null); setFailed("");
    if (!authReady || !email || persistMode === "local") return;
    const refresh = async () => {
      const serial = ++revision;
      try {
        const response = await fetch("/api/feature-access", { cache: "no-store", headers: await authHeader() });
        const data = await response.json();
        if (!response.ok || data.email?.toLowerCase() !== email || !data.policy) throw new Error();
        if (live && serial === revision) { setSnapshot({ email, policy: data.policy }); setFailed(""); }
      } catch { if (live && serial === revision) { setSnapshot(null); setFailed(email); } }
    };
    // Routes enforce the policy; this copy only shapes the UI. Refresh while someone
    // is looking (focus/visible at most every 10s, otherwise each minute), not from hidden tabs.
    let last = Date.now();
    void refresh();
    const changed = () => { last = Date.now(); void refresh(); };
    const focus = () => { if (document.visibilityState === "visible" && Date.now() - last >= 10_000) changed(); };
    const timer = setInterval(() => { if (document.visibilityState === "visible") changed(); }, 60_000);
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus); window.addEventListener("naumi:feature-access-changed", changed);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("naumi:feature-access-changed", changed); };
  }, [email, authReady, persistMode]);
  const publicMode = authReady && (!email || persistMode === "local");
  const policy = publicMode ? DEFAULT_POLICY : snapshot?.email === email ? snapshot.policy : null;
  const ready = !!policy || (!!email && failed === email);
  const can = useCallback((id: string) => !!policy && allows(policy, id), [policy]);
  const canPage = useCallback((href: string) => { const id = pageFeature(href); return !id || can(id); }, [can]);
  return <Context.Provider value={{ ready, can, canPage }}>{children}</Context.Provider>;
}
export function useFeatureAccess() { return useContext(Context); }
export function FeatureVisible({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { can } = useFeatureAccess(); return can(feature) ? <>{children}</> : null;
}
