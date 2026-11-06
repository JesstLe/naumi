"use client";

/** Page-level recovery for browser storage. Only rebuildable copies of server
 * data are removed here. Drafts, billing intents, task receipts, preferences,
 * 3D projects and workbench templates are user state and are never touched. */
const DISPOSABLE_DATABASES = ["naumi-image-bytes-v1", "naumi-business-cache-v1"];
const DISPOSABLE_KEYS = new Set(["naumi:templatesCacheV1", "naumi:cache-account", "naumi-image-bytes-v1:account", "naumi-image-bytes-v1:logout"]);
// Revision markers only invalidate the business cache deleted below. Session
// copies (naumi:user:*) are the account itself in DB-less mode, so they are
// shape-checked on read instead of being cleared here.
const DISPOSABLE_PREFIXES = ["naumi:cache-revision:"];
const RELOAD_GUARD = "naumi:recovery:stale-asset-reload";
const RELOAD_WINDOW_MS = 60_000;

export function isDisposableStorageKey(key: string) {
  return DISPOSABLE_KEYS.has(key) || DISPOSABLE_PREFIXES.some(prefix => key.startsWith(prefix));
}

function deleteDatabase(name: string, deadlineMs: number) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, deadlineMs);
    const done = () => { clearTimeout(timer); resolve(); };
    try {
      // A blocked delete stays queued and completes once other tabs close their
      // connection (BrowserCacheStorage closes on versionchange); never wait on it.
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = done;
    } catch { done(); }
  });
}

export async function clearDisposableBrowserCaches(deadlineMs = 2000) {
  const removed: string[] = [];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && isDisposableStorageKey(key)) { localStorage.removeItem(key); removed.push(key); }
    }
  } catch { /* storage disabled: nothing persisted to clear */ }
  if (typeof indexedDB !== "undefined") await Promise.all(DISPOSABLE_DATABASES.map(name => deleteDatabase(name, deadlineMs)));
  return { keys: removed.length, databases: DISPOSABLE_DATABASES.length };
}

/** A tab opened before a release can request a chunk the server no longer has. */
export function isStaleAssetError(error: unknown) {
  const value = error as { name?: unknown; message?: unknown } | null;
  if (!value || typeof value !== "object") return false;
  return value.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String(value.message ?? ""));
}

/** One automatic reload per minute for stale assets; anything else waits for the user. */
export function reloadOnceForStaleAssets(error: unknown) {
  if (!isStaleAssetError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD)) || 0;
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

export async function clearCachesAndReload() {
  await clearDisposableBrowserCaches();
  window.location.reload();
}
