"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type PlanKey } from "@/lib/mock-data";
import { BRAND } from "@/lib/brand";
import { supabaseEnabled } from "@/lib/auth-mode";
import { activateBrowserData, invalidateBrowserData, installBrowserDataObserver } from "@/lib/browser-data-cache";
import { activateBrowserImages, clearBrowserImages, configureBrowserImageCache } from "@/lib/browser-image-cache";
import { authHeader } from "@/lib/supabase";
import { activateFeatureCatalogIdentity } from "@/lib/model-config/feature-catalog-browser";

// ---------------------------------------------------------------------------
// Session + membership state.
//
// Identity (name/email) comes from Supabase Auth when configured, otherwise
// from the built-in mock sign-in/up. Plan / credits / invoices are persisted to
// Postgres when DATABASE_URL is set (detected via /api/config), and otherwise
// to localStorage keyed by email. The server, when present, is authoritative;
// localStorage is also kept as a warm cache so the UI never flashes.
// ---------------------------------------------------------------------------

export type Invoice = {
  id: string;
  date: string;
  plan: string;
  amount: number;
  status: "paid";
};

export type SessionUser = {
  name: string;
  email: string;
  plan: PlanKey;
  creditsTotal: number;
  creditsUsed: number;
  joinedAt: string;
  renewsAt: string;
  invoices: Invoice[];
  /** 累计充值 ≥ 999 元解锁「高阶」出图模式 */
  canHigh?: boolean;
};

type Identity = { name: string; email: string };

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  remaining: number;
  /** "server" when Postgres is live, "local" for the localStorage mock. */
  persistMode: "local" | "server";
  /** 原生多用户模式(Pro):启用邮箱+密码注册/登录 + 服务端会话 hydrate。 */
  multiUser: boolean;
  signUp: (name: string, email: string) => void;
  signIn: (email: string) => void;
  signOut: () => void;
  changePlan: (plan: PlanKey) => Promise<Invoice | null>;
  consumeCredits: (n: number) => boolean;
  /** Replace the session with an authoritative server copy. */
  applyServerUser: (user: SessionUser | null, establishSession?: boolean) => void;
  syncIdentity: (identity: Identity | null) => void;
  bindSignOut: (fn: (() => void) | null) => void;
};

const STORAGE_PREFIX = "naumi:user:";
const LAST_KEY = "naumi:last-email";

const AuthContext = createContext<AuthContextValue | null>(null);

const keyFor = (email: string) =>
  `${STORAGE_PREFIX}${email.toLowerCase()}`;

function nextMonthISO(): string {
  // 满一个月（滚动月，保留日期）。仅本地兜底用；权威到期日来自服务端。
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function makeUser(name: string, email: string): SessionUser {
  return {
    name: name || email.split("@")[0] || `${BRAND} 用户`,
    email,
    plan: "starter",
    creditsTotal: 0,
    creditsUsed: 0,
    joinedAt: new Date().toISOString(),
    renewsAt: nextMonthISO(),
    invoices: [],
  };
}

function loadUser(email: string): SessionUser | null {
  try {
    const raw = localStorage.getItem(keyFor(email));
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [persistMode, setPersistMode] = useState<"local" | "server">(
    "local"
  );
  const [multiUser, setMultiUser] = useState(false);
  const multiUserRef = useRef(false);
  const serverRef = useRef(false);
  const identityEpoch = useRef(0);
  const currentEmail = useRef<string | null>(null);
  const externalSignOut = useRef<(() => void) | null>(null);

  const persist = useCallback((next: SessionUser | null) => {
    activateFeatureCatalogIdentity(next?.email ?? null, next === null);
    currentEmail.current = next?.email.toLowerCase() || null;
    setUser(next);
    try {
      if (next) {
        localStorage.setItem(keyFor(next.email), JSON.stringify(next));
        localStorage.setItem(LAST_KEY, next.email);
      } else {
        localStorage.removeItem(LAST_KEY);
      }
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, []);

  const verifiedPersist = useCallback((next: SessionUser) => {
    activateBrowserImages(next.email);
    activateBrowserData(next.email);
    persist(next);
  }, [persist]);

  useEffect(() => {
    const clear = () => { identityEpoch.current++; clearBrowserImages(); persist(null); };
    window.addEventListener("naumi:cache-session-ended", clear);
    return () => window.removeEventListener("naumi:cache-session-ended", clear);
  }, [persist]);

  // Server helper: POST /api/account. Returns the user or null on any failure
  // (the caller then keeps the optimistic local copy).
  const serverPost = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/account", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data?.persisted && data.user) {
          return data as { user: SessionUser; invoice?: Invoice };
        }
      } catch {
        /* network/db error — fall back to local */
      }
      return null;
    },
    []
  );

  // Detect persistence mode, then hydrate the last session.
  useEffect(() => {
    installBrowserDataObserver();
    let cancelled = false;
    const bootstrapEpoch = identityEpoch.current;
    const current = () => !cancelled && bootstrapEpoch === identityEpoch.current;
    (async () => {
      let lastEmail: string | null = null;
      try {
        lastEmail = localStorage.getItem(LAST_KEY);
        if (lastEmail) {
          const cached = loadUser(lastEmail);
          if (cached && current()) { activateFeatureCatalogIdentity(cached.email); setUser(cached); }
        }
      } catch {
        /* ignore */
      }

      try {
        const cfg = await fetch("/api/config").then((r) => r.json());
        if(current() && typeof cfg?.db==='boolean')configureBrowserImageCache(cfg.db);
        if (current() && cfg?.db) {
          serverRef.current = true;
          setPersistMode("server");
        }
        // 原生多用户:身份来自服务端会话 cookie(权威),不用 localStorage lastEmail。
        if (current() && cfg?.multiUser) {
          multiUserRef.current = true;
          setMultiUser(true);
          try {
            const s = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.ok ? r.json() : { user: null });
            if (current()) {
              if (s?.user) verifiedPersist(s.user as SessionUser);
              else {
                // 会话无效 → 清掉可能残留的本地态
                activateBrowserData(null); activateBrowserImages(null);
                activateFeatureCatalogIdentity(null, true);
                setUser(null);
                try {
                  localStorage.removeItem(LAST_KEY);
                } catch {
                  /* ignore */
                }
              }
            }
          } catch {
            /* session unreachable — leave as-is */
          }
        } else if (current() && cfg?.db && cfg?.authMode === "mock") {
          // 开源版单用户:身份以本地管理员会话(服务端 nv_admin cookie)为权威,
          // 不依赖 localStorage —— 覆盖「只从 /admin 登录、主站 auth-context 未 signIn」
          // 的情况(否则主站 user=null,作品/历史全拉不出)。
          try {
            const s = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.ok ? r.json() : { user: null });
            if (current()) {
              if (s?.user) {
                verifiedPersist(s.user as SessionUser);
              } else if (lastEmail) {
                const res = await fetch(
                  `/api/account?email=${encodeURIComponent(lastEmail)}`,
                  { headers: await authHeader() }
                ).then((r) => r.ok ? r.json() : null);
                if (current() && res?.persisted && res.user) {
                  verifiedPersist(res.user as SessionUser);
                }
              }
            }
          } catch {
            /* session unreachable — leave as-is */
          }
        } else if (current() && cfg?.db && lastEmail) {
          const res = await fetch(
            `/api/account?email=${encodeURIComponent(lastEmail)}`,
            { headers: await authHeader() }
          ).then((r) => r.ok ? r.json() : null);
          if (current() && res?.persisted && res.user) {
            verifiedPersist(res.user as SessionUser);
          }
        }
      } catch {
        /* config unreachable — stay in local mode */
      }

      if (current()) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, verifiedPersist]);

  const startSession = useCallback(
    (name: string, email: string) => {
      const requestEpoch = ++identityEpoch.current;
      activateBrowserData(null); activateBrowserImages(null);
      activateFeatureCatalogIdentity(null, true);
      setReady(true);
      // Optimistic local session for instant UI.
      const existing = loadUser(email);
      persist(
        existing
          ? { ...existing, name: name || existing.name }
          : makeUser(name, email)
      );
      // Authoritative server copy when the DB is live.
      if (serverRef.current) {
        serverPost({ action: "sync", email, name }).then((r) => {
          if (r && requestEpoch === identityEpoch.current) verifiedPersist(r.user);
        });
      }
    },
    [persist, verifiedPersist, serverPost]
  );

  const signUp = useCallback(
    (name: string, email: string) => startSession(name, email),
    [startSession]
  );

  const signIn = useCallback(
    (email: string) => startSession("", email),
    [startSession]
  );

  const syncIdentity = useCallback(
    (identity: Identity | null) => {
      if (!identity || !identity.email) {
        identityEpoch.current++;
        activateBrowserData(null); activateBrowserImages(null);
        activateFeatureCatalogIdentity(null, true);
        setUser(null);
        currentEmail.current = null;
        try {
          localStorage.removeItem(LAST_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      startSession(identity.name, identity.email);
    },
    [startSession]
  );

  const signOut = useCallback(() => {
    activateFeatureCatalogIdentity(null, true);
    clearBrowserImages();
    identityEpoch.current++;
    invalidateBrowserData(undefined, true);
    activateBrowserData(null); activateBrowserImages(null);
    if (externalSignOut.current) externalSignOut.current();
    // 原生多用户:清服务端会话 cookie。
    if (multiUserRef.current) {
      fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    }
    // 单用户/本地管理员(无 Supabase):同时清后台会话(nv_admin)——
    // 否则「退出」后仍是隐形管理员,/deploy 更新卡等站长内容照样可见。
    if (!supabaseEnabled) {
      fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    }
    setUser(null);
    currentEmail.current = null;
    try {
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const bindSignOut = useCallback((fn: (() => void) | null) => {
    externalSignOut.current = fn;
  }, []);

  const renderedIdentityEpoch = identityEpoch.current;
  const applyServerUser = useCallback(
    (next: SessionUser | null, establishSession = false) => {
      if (!next) return;
      if (renderedIdentityEpoch !== identityEpoch.current) return;
      // Only the login form may establish a new identity. A late generation or
      // balance response after logout/switch must not resurrect the old account.
      if (!establishSession && next.email.toLowerCase() !== currentEmail.current) return;
      if (establishSession) { identityEpoch.current++; activateFeatureCatalogIdentity(next.email, true); setReady(true); }
      invalidateBrowserData(next.email);
      verifiedPersist(next);
    },
    [verifiedPersist, renderedIdentityEpoch]
  );

  const changePlan = useCallback(
    async (planKey: PlanKey): Promise<Invoice | null> => {
      if (!user) return null;

      if (serverRef.current) {
        const requestEpoch = identityEpoch.current;
        const r = await serverPost({
          action: "plan",
          email: user.email,
          plan: planKey,
        });
        if (r && requestEpoch === identityEpoch.current && currentEmail.current === r.user.email.toLowerCase()) {
          persist(r.user);
          return r.invoice ?? null;
        }
      }

      throw new Error("历史会员商品已停售，请使用当前积分充值商品");
    },
    [user, persist, serverPost]
  );

  const consumeCredits = useCallback(
    (n: number): boolean => {
      if (!user || renderedIdentityEpoch !== identityEpoch.current || currentEmail.current !== user.email.toLowerCase()) return false;
      if (user.creditsUsed + n > user.creditsTotal) return false;
      // In server mode the generate route reserves credits and returns the
      // authoritative user (applied via applyServerUser); this optimistic
      // update just keeps the UI snappy in the meantime.
      persist({ ...user, creditsUsed: user.creditsUsed + n });
      return true;
    },
    [user, persist, renderedIdentityEpoch]
  );

  const remaining = user ? user.creditsTotal - user.creditsUsed : 0;

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        remaining,
        persistMode,
        multiUser,
        signUp,
        signIn,
        signOut,
        changePlan,
        consumeCredits,
        applyServerUser,
        syncIdentity,
        bindSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
