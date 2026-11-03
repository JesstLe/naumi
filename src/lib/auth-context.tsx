"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { type PlanKey } from "@/lib/mock-data";
import { BRAND } from "@/lib/brand";
import { supabaseEnabled } from "@/lib/auth-mode";
import { activateBrowserData, invalidateBrowserData, installBrowserDataObserver } from "@/lib/browser-data-cache";
import { activateBrowserImages, clearBrowserImages, configureBrowserImageCache } from "@/lib/browser-image-cache";
import { authHeader } from "@/lib/supabase";
import { AuthBootstrapReadError, bootstrapConfig, bootstrapSessionUser, readAuthBootstrapJson } from "./auth-bootstrap";

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
  const pathname = usePathname() || "";
  // These entry points use their own authoritative admin cookie/setup checks.
  // Broken model/config discovery must not prevent an operator repairing it.
  const independentAccess = pathname === "/setup" || pathname === "/admin" || pathname.startsWith("/admin/");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<"loading" | "ready" | "error">("loading");
  const bootstrapStateRef = useRef(bootstrapState);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const retryBootstrap = useCallback(() => {
    bootstrapStateRef.current = "loading";
    setBootstrapState("loading");
    setReady(false);
    setBootstrapAttempt(value => value + 1);
  }, []);
  const refreshPendingIdentity = useCallback(() => {
    // A bridge/login identity change supersedes the pending READ, not a POST.
    if (bootstrapStateRef.current !== "ready") retryBootstrap();
  }, [retryBootstrap]);
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
    const clear = () => { identityEpoch.current++; clearBrowserImages(); persist(null); refreshPendingIdentity(); };
    window.addEventListener("naumi:cache-session-ended", clear);
    return () => window.removeEventListener("naumi:cache-session-ended", clear);
  }, [persist, refreshPendingIdentity]);

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

  // Keep descendants (including SessionBridge and editor drafts) mounted while
  // discovering the mode. Only a successful read can complete this bootstrap.
  useEffect(() => {
    installBrowserDataObserver();
    const controller = new AbortController();
    const bootstrapEpoch = identityEpoch.current;
    const current = () => !controller.signal.aborted && bootstrapEpoch === identityEpoch.current;
    bootstrapStateRef.current = "loading";
    setBootstrapState("loading");
    setReady(false);
    void (async () => {
      let lastEmail: string | null = null;
      try { lastEmail = localStorage.getItem(LAST_KEY); } catch { /* Optional warm identity. */ }
      try {
        const cfg = bootstrapConfig(await readAuthBootstrapJson("/api/config", { signal: controller.signal }));
        if (!current()) return;
        configureBrowserImageCache(cfg.db);
        serverRef.current = cfg.db;
        setPersistMode(cfg.db ? "server" : "local");
        multiUserRef.current = cfg.multiUser;
        setMultiUser(cfg.multiUser);
        const clearAnonymous = () => {
          if (!current()) return;
          activateBrowserData(null); activateBrowserImages(null); persist(null);
        };
        const readAccount = async (explicitAnonymousSession = false) => {
          try {
            const data = await readAuthBootstrapJson(`/api/account?email=${encodeURIComponent(lastEmail!)}`, {
              signal: controller.signal, headers: authHeader,
            });
            if (!data || typeof data !== "object" || (data as { persisted?: unknown }).persisted !== true) {
              throw new Error("账号资料读取失败");
            }
            const account = bootstrapSessionUser(data);
            if (!account) throw new Error("账号资料读取失败");
            if (String(account.email).toLowerCase() !== lastEmail!.toLowerCase()) throw new Error("账号资料读取失败");
            if (current()) verifiedPersist(account as SessionUser);
          } catch (error) {
            // Keep the legacy mock account lookup, but an already-confirmed
            // anonymous session plus its denied old cache is not an outage.
            if (explicitAnonymousSession && error instanceof AuthBootstrapReadError && [401, 403].includes(error.status)) clearAnonymous();
            else throw error;
          }
        };
        if (cfg.multiUser || cfg.db && cfg.authMode === "mock") {
          const session = bootstrapSessionUser(await readAuthBootstrapJson("/api/auth/session", { signal: controller.signal }));
          if (!current()) return;
          if (session) verifiedPersist(session as SessionUser);
          else if (!cfg.multiUser && lastEmail) await readAccount(true);
          else {
            // This is an explicit HTTP 200 {user:null}, never a failed read.
            clearAnonymous();
          }
        } else if (cfg.db && lastEmail) {
          await readAccount();
        } else if (!cfg.db && lastEmail) {
          const cached = loadUser(lastEmail);
          if (cached && current()) persist(cached);
        }
        if (!current()) return;
        bootstrapStateRef.current = "ready";
        setBootstrapState("ready");
        setReady(true);
      } catch {
        if (!current()) return;
        // Retain stored identity/cache/drafts. Unknown mode is not local mode;
        // service failure is not logout. Retry only these bootstrap GETs.
        bootstrapStateRef.current = "error";
        setBootstrapState("error");
        setReady(false);
      }
    })();
    return () => controller.abort();
  }, [bootstrapAttempt, persist, verifiedPersist]);

  const startSession = useCallback(
    (name: string, email: string) => {
      const requestEpoch = ++identityEpoch.current;
      activateBrowserData(null); activateBrowserImages(null);
      setReady(true);
      // Optimistic local session for instant UI.
      const existing = loadUser(email);
      persist(
        existing
          ? { ...existing, name: name || existing.name }
          : makeUser(name, email)
      );
      refreshPendingIdentity();
      // Authoritative server copy when the DB is live.
      if (serverRef.current) {
        serverPost({ action: "sync", email, name }).then((r) => {
          if (r && requestEpoch === identityEpoch.current) verifiedPersist(r.user);
        });
      }
    },
    [persist, verifiedPersist, serverPost, refreshPendingIdentity]
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
        setUser(null);
        currentEmail.current = null;
        refreshPendingIdentity();
        try {
          localStorage.removeItem(LAST_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      startSession(identity.name, identity.email);
    },
    [startSession, refreshPendingIdentity]
  );

  const signOut = useCallback(() => {
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
    refreshPendingIdentity();
    try {
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* ignore */
    }
  }, [refreshPendingIdentity]);

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
      if (establishSession) { identityEpoch.current++; setReady(true); refreshPendingIdentity(); }
      invalidateBrowserData(next.email);
      verifiedPersist(next);
    },
    [verifiedPersist, renderedIdentityEpoch, refreshPendingIdentity]
  );

  const changePlan = useCallback(
    async (planKey: PlanKey): Promise<Invoice | null> => {
      if (!user || bootstrapStateRef.current !== "ready") return null;

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
      if (bootstrapStateRef.current !== "ready" || !user || renderedIdentityEpoch !== identityEpoch.current || currentEmail.current !== user.email.toLowerCase()) return false;
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
  const bootstrapReady = ready && bootstrapState === "ready";
  const blockBootstrapInteraction = !bootstrapReady && !independentAccess;
  const blockPendingInteraction = (event: React.SyntheticEvent) => {
    // React events from dialogs portaled outside this inert DOM wrapper also
    // pass through here. Keep drafts mounted without permitting mock actions.
    if (blockBootstrapInteraction) { event.preventDefault(); event.stopPropagation(); }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready: bootstrapReady,
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
      <div style={{ display: "contents" }} inert={blockBootstrapInteraction || undefined}
        onClickCapture={blockPendingInteraction} onPointerDownCapture={blockPendingInteraction}
        onKeyDownCapture={blockPendingInteraction} onSubmitCapture={blockPendingInteraction}>
        {children}
      </div>
      {blockBootstrapInteraction && (
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-white/90 p-6">
          <div role={bootstrapState === "error" ? "alert" : "status"} className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-8 py-6 text-slate-900 shadow-sm">
            <span>{bootstrapState === "error" ? "账号连接中断" : "正在连接账号…"}</span>
            {bootstrapState === "error" && <button type="button" autoFocus onClick={retryBootstrap} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900">重新连接</button>}
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
