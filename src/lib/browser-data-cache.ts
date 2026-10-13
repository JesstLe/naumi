"use client";

import { authHeader } from "@/lib/supabase";

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
let dbPromise: Promise<IDBDatabase | null> | undefined;
let channel: BroadcastChannel | undefined;
const normalize = (email: string) => email.trim().toLowerCase();
const revKey = (email: string) => `naumi:cache-revision:${email}`;
function revision(email: string) { try { return localStorage.getItem(revKey(email)) || "0"; } catch { return String(epoch); } }
function valid(email: string, token: number, rev: string) { return active === email && epoch === token && revision(email) === rev; }
function openDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) dbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(DB, 1);
      const timeout = setTimeout(() => resolve(null), 1500);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onerror = request.onblocked = () => { clearTimeout(timeout); resolve(null); };
      request.onsuccess = () => { clearTimeout(timeout); request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    } catch { resolve(null); }
  });
  return dbPromise;
}
async function read(id: string): Promise<Snapshot | undefined> {
  if (memory.has(id)) return memory.get(id);
  const db = await openDB();
  if (!db) return;
  return new Promise(resolve => {
    try { const tx = db.transaction(STORE), req = tx.objectStore(STORE).get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined); tx.onabort = () => resolve(undefined); } catch { resolve(undefined); }
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
  const db = await openDB();
  if (!db || !valid(record.account, token, record.revision)) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        try {
          if (!valid(record.account, token, record.revision)) return;
          const rows = (req.result as Snapshot[]).filter(row => row.id !== record.id);
          rows.unshift(record); rows.sort((a, b) => b.at - a.at);
          let total = 0;
          rows.forEach((row, i) => { total += row.bytes; if (i >= MAX_RECORDS || total > MAX_BYTES || Date.now() - row.at > STALE_MS) store.delete(row.id); });
          store.put(record);
        } catch { resolve(); /* quota/unavailable storage does not fail the live read */ }
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
function clearMemory() { epoch++; memory.clear(); inflight.clear(); }
export function invalidateBrowserData(email = active, logout = false) {
  email = normalize(email); if (!email) return;
  const rev = `${logout ? "logout:" : ""}${Date.now()}-${Math.random()}`;
  try { localStorage.setItem(revKey(email), rev); } catch { /* memory epoch still guards */ }
  if (email === active) { clearMemory(); if (logout) active = ""; }
  channel?.postMessage({ account: email, logout });
  void openDB().then(db => {
    if (!db) return;
    try { const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), req = store.getAll();
      req.onsuccess = () => { for (const row of req.result as Snapshot[]) if (row.account === email && row.revision !== revision(email)) store.delete(row.id); };
    } catch { /* storage unavailable */ }
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
      && !/^\/api\/(auth(?:\/|$)|admin(?:\/|$)|account$|billing(?:\/|$)|favorites$|agent\/session(?:\/|$)|media\/image-cache$)/.test(url.pathname);
    const account = active;
    // Invalidate before AND after mutation: reads during a long request cannot survive completion.
    if (affectsData) invalidateBrowserData(account);
    const response = await original(input, init);
    if (affectsData && response.ok) invalidateBrowserData(account);
    if (url.origin === location.origin && url.pathname === "/api/account" && [401, 403].includes(response.status)) invalidateBrowserData(account, true);
    return response;
  };
}

export async function loadAccountSnapshot<T>(email: string, query = "", onStale?: (data: AccountSnapshot<T>) => void): Promise<AccountSnapshot<T>> {
  const account = normalize(email), id = `${account}|account:${query}`, token = epoch, rev = revision(account);
  const allowed = account === active && !!active;
  const cached = allowed ? await read(id) : undefined;
  if (cached && valid(account, token, rev) && cached.revision === rev && Date.now() - cached.at < FRESH_MS) return cached.value as AccountSnapshot<T>;
  if (cached && valid(account, token, rev) && cached.revision === rev && Date.now() - cached.at < STALE_MS) onStale?.(cached.value as AccountSnapshot<T>);
  const flightKey = `${id}|${token}|${rev}`;
  if (allowed && inflight.has(flightKey)) return inflight.get(flightKey) as Promise<AccountSnapshot<T>>;
  const request = (async () => {
    const response = await fetch(`/api/account?email=${encodeURIComponent(email)}${query ? `&${query}` : ""}`, { cache: "no-store", headers: await authHeader() });
    if (!response.ok) { if ([401, 403].includes(response.status)) invalidateBrowserData(account, true); throw new Error(`Account load ${response.status}`); }
    const data = await response.json();
    // Intentionally drop user, balance, invoices and all unrecognized account fields.
    const value: AccountSnapshot<T> = { artworks: Array.isArray(data.artworks) ? data.artworks : [] };
    if (query && data.stats) value.stats = { today: Number(data.stats.today) || 0, total: Number(data.stats.total) || 0 };
    const unsettled = value.artworks.some(row => ["pending", "processing", "generating", "running", "queued"].includes(String((row as { status?: string })?.status)));
    if (allowed && !unsettled && valid(account, token, rev)) {
      const bytes = new Blob([JSON.stringify(value)]).size;
      await write({ id, account, revision: rev, at: Date.now(), bytes, value }, token);
    }
    // Never deliver a pre-mutation/account-switch response into a new render.
    if (allowed && !valid(account, token, rev)) throw new Error("Account snapshot superseded");
    return value;
  })();
  if (allowed) inflight.set(flightKey, request);
  try { return await request; } finally { if (inflight.get(flightKey) === request) inflight.delete(flightKey); }
}
