"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CreditUser = { email: string; creditsTotal: number; creditsUsed: number };
type Request = (input: string, init?: RequestInit) => Promise<Response>;
const normalize = (email: string) => email.trim().toLowerCase();

export function accountCredits(value: unknown, email: string): number | null {
  if (!value || typeof value !== "object") return null;
  const user = value as Partial<CreditUser>;
  if (typeof user.email !== "string" || normalize(user.email) !== normalize(email)) return null;
  if (typeof user.creditsTotal !== "number" || !Number.isFinite(user.creditsTotal)) return null;
  if (typeof user.creditsUsed !== "number" || !Number.isFinite(user.creditsUsed)) return null;
  return Math.max(0, user.creditsTotal - user.creditsUsed);
}

/** Balances never enter the artwork cache. Identity and request guards reject late responses. */
export function useCanvasCredits({ user, ready, targetEmail, request }: {
  user: CreditUser | null; ready: boolean; targetEmail: string | null; request: Request;
}) {
  const email = ready && user ? normalize(targetEmail || user.email) : "";
  const own = !!user && email === normalize(user.email);
  // Include the viewer as well as target: logout/login and admin target changes are separate contexts.
  const key = JSON.stringify([ready, user?.email, email, user?.creditsTotal, user?.creditsUsed]);
  const identity = useRef({ key, serial: 0 });
  if (identity.current.key !== key) identity.current = { key, serial: identity.current.serial + 1 };
  const [snapshot, setSnapshot] = useState<{ key: string; value: number } | null>(null);
  const refreshCredits = useCallback(async () => {
    if (!email || identity.current.key !== key) return;
    const context = identity.current;
    const serial = ++context.serial;
    try {
      const response = await request(`/api/account?email=${encodeURIComponent(email)}&view=user`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const value = accountCredits(data?.user, email);
      if (identity.current !== context || context.serial !== serial || value === null) return;
      setSnapshot({ key, value });
    } catch { /* Keep the last known balance; focus/online and completed mutations retry. */ }
  }, [email, key, request]);

  useEffect(() => {
    // The server-hydrated session already carries the owner's balance. A read-only target
    // must be independently authorized; never use the viewing administrator's credits.
    if (email && !own) void refreshCredits();
    const refresh = () => { void refreshCredits(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      identity.current.serial++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [email, own, refreshCredits]);

  const credits = !email ? null : snapshot?.key === key ? snapshot.value : own ? accountCredits(user, email) : null;
  return { credits, refreshCredits };
}
