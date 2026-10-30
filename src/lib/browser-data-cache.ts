"use client";

import { authHeader } from "@/lib/supabase";
import { currentWorkspace, currentWorkspaceRevision } from "@/lib/saas/workspace-client";
import { BrowserCacheStorage } from "./browser-cache-storage";

// Explicit private metadata cache, NOT an HTTP/auth/payment cache.
const DB = "naumi-business-cache-v1";
const STORE = "snapshots";
const FRESH_MS = 30_000;
const STALE_MS = 300_000;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_RECORDS = 6;
type Snapshot = { id: string; account: string; revision: string; at: number; bytes: number; value: unknown };
export type AccountSnapshot<T> = { artworks: T[]; stats?: { today: number; total: number } };
const memory = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<unknown>>();
let active = "", epoch = 0, installed = false;
const storage = new BrowserCacheStorage(DB, 1, db => { db.createObjectStore(STORE, { keyPath: "id" }); });
let channel: BroadcastChannel | undefined;
const normalize = (email: string) => email.trim().toLowerCase();
const revKey = (email: string) => `naumi:cache-revision:${email}`;
function revision(email: string) { try { return localStorage.getItem(revKey(email)) || "0"; } catch { return String(epoch); } }
function valid(email: string, token: number, rev: string) { return active === email && epoch === token && revision(email) === rev; }
async function read(id: string): Promise<Snapshot | undefined> {
  if (memory.has(id)) return memory.get(id);
  return storage.run<Snapshot | undefined>(STORE, "readonly", undefined, (tx, result) => {
    const req = tx.objectStore(STORE).get(id); req.onsuccess = () => result(req.result);
  });
}
async function write(record: Snapshot, token: number) {
  if (!valid(record.account, token, record.revision) || record.bytes > MAX_BYTES / 2) return;
  memory.set(record.id, record);
  let bytes = 0;
  for (const [i, [key, row]] of [...memory].sort((a, b) => b[1].at - a[1].at || Number(b[0] === record.id) - Number(a[0] === record.id)).entries()) {
    bytes += row.bytes;
    if (bytes > MAX_BYTES || i >= MAX_RECORDS) memory.delete(key);
  }
  if (!valid(record.account, token, record.revision)) return;
  await storage.run<void>(STORE, "readwrite", undefined, tx => {
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        try {
          if (!valid(record.account, token, record.revision)) return;
          const rows = (req.result as Snapshot[]).filter(row => row.id !== record.id);
          rows.unshift(record); rows.sort((a, b) => b.at - a.at);
          let total = 0;
          rows.forEach((row, i) => { total += row.bytes; if (i >= MAX_RECORDS || total > MAX_BYTES || Date.now() - row.at > STALE_MS) store.delete(row.id); });
          store.put(record);
        } catch { tx.abort(); /* optional storage never fails the live read */ }
      };
  });
}
function clearMemory() { epoch++; memory.clear(); inflight.clear(); }
export function invalidateBrowserData(email = active, logout = false) {
  email = normalize(email); if (!email) return;
  const rev = `${logout ? "logout:" : ""}${Date.now()}-${Math.random()}`;
  try { localStorage.setItem(revKey(email), rev); } catch { /* memory epoch still guards */ }
  if (email === active) { clearMemory(); if (logout) active = ""; }
  channel?.postMessage({ account: email, logout });
  void storage.run<void>(STORE, "readwrite", undefined, tx => {
    const store = tx.objectStore(STORE), req = store.getAll();
    req.onsuccess = () => { for (const row of req.result as Snapshot[]) if (row.account === email && row.revision !== revision(email)) store.delete(row.id); };
  });
}
// Call only after a server-verified session, never from optimistic localStorage user state.
export function activateBrowserData(email: string | null) {
  const next = normalize(email || "");
  if (active === next && next) return;
  if (active) invalidateBrowserData(active, true);
  try {
    const previous = localStorage.getItem("naumi:cache-account");
    if (previous && previous !== next) invalidateBrowserData(previous, true);
    if (next) localStorage.setItem("naumi:cache-account", next);
    else localStorage.removeItem("naumi:cache-account");
  } catch { /* partition matching is still enforced on every read */ }
  active = next; clearMemory();
}
export function installBrowserDataObserver() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try { channel = new BroadcastChannel(DB); channel.onmessage = event => {
    if (event.data?.account === active) { clearMemory(); if (event.data.logout) { active = ""; window.dispatchEvent(new Event("naumi:cache-session-ended")); } }
  }; } catch { /* storage event fallback */ }
  window.addEventListener("storage", event => { if (event.key === revKey(active)) { clearMemory(); if (event.newValue?.startsWith("logout:")) { active = ""; window.dispatchEvent(new Event("naumi:cache-session-ended")); } } });
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const affectsData = url.origin === location.origin && url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)
      && !/^\/api\/(auth(?:\/|$)|admin(?:\/|$)|account$|billing(?:\/|$)|favorites$|agent\/session(?:\/|$)|media\/image-cache$|public-image-cache$)/.test(url.pathname);
    const account = active;
    // Invalidate before AND after mutation: reads during a long request cannot survive completion.
    if (affectsData) invalidateBrowserData(account);
    const response = await original(input, init);
    if (affectsData && response.ok) invalidateBrowserData(account);
    if (url.origin === location.origin && url.pathname === "/api/account" && [401, 403].includes(response.status)) invalidateBrowserData(account, true);
    return response;
  };
}

export type AccountReadContext = {
  partition: string;
  isCurrent: () => boolean;
  request: (url:string,init:RequestInit) => Promise<Response>;
};
export async function loadAccountSnapshot<T>(email: string, query = "", onStale?: (data: AccountSnapshot<T>) => void, context?: AccountReadContext): Promise<AccountSnapshot<T>> {
  const workspace=currentWorkspace(),workspaceRevision=currentWorkspaceRevision();
  const current=()=>context?context.isCurrent():workspace===currentWorkspace()&&workspaceRevision===currentWorkspaceRevision();
  const guard = () => { if(!current())throw new Error("Account snapshot superseded"); };
  guard();
  const account = normalize(email), id = `${account}|account:${query}|workspace:${context?.partition??workspace}`, token = epoch, rev = revision(account);
  const allowed = account === active && !!active;
  const cached = allowed ? await read(id) : undefined;
  guard();
  if (cached && valid(account, token, rev) && cached.revision === rev && Date.now() - cached.at < FRESH_MS) return cached.value as AccountSnapshot<T>;
  if (cached && valid(account, token, rev) && cached.revision === rev && Date.now() - cached.at < STALE_MS) onStale?.(cached.value as AccountSnapshot<T>);
  const flightKey = `${id}|${token}|${rev}`;
  if (allowed && inflight.has(flightKey)) { const value=await inflight.get(flightKey) as AccountSnapshot<T>;guard();return value; }
  const request = (async () => {
    const url = `/api/account?email=${encodeURIComponent(email)}${query ? `&${query}` : ""}`;
    let response:Response;
    if(context)response=await context.request(url,{cache:"no-store"});
    else{const headers=await authHeader();guard();response=await fetch(url,{cache:"no-store",headers});}
    if (!response.ok) { if ([401, 403].includes(response.status)) invalidateBrowserData(account, true); throw Object.assign(new Error(`Account load ${response.status}`),{status:response.status}); }
    const data = await response.json();
    guard();
    if(!Array.isArray(data.artworks) && data.persisted!==false)throw new Error("Account artwork response invalid");
    // Intentionally drop user, balance, invoices and all unrecognized account fields.
    const value: AccountSnapshot<T> = { artworks: Array.isArray(data.artworks) ? data.artworks : [] };
    if (query && data.stats) value.stats = { today: Number(data.stats.today) || 0, total: Number(data.stats.total) || 0 };
    const unsettled = value.artworks.some(row => ["pending", "processing", "generating", "running", "queued"].includes(String((row as { status?: string })?.status)));
    if (allowed && !unsettled && valid(account, token, rev) && current()) {
      const bytes = new Blob([JSON.stringify(value)]).size;
      void write({ id, account, revision: rev, at: Date.now(), bytes, value }, token);
    }
    // Never deliver a pre-mutation/account-switch response into a new render.
    if (allowed && !valid(account, token, rev)) throw new Error("Account snapshot superseded");
    guard();
    return value;
  })();
  if (allowed) inflight.set(flightKey, request);
  try { return await request; } finally { if (inflight.get(flightKey) === request) inflight.delete(flightKey); }
}
