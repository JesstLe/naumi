/** localStorage writes that survive a full quota by first releasing space that
 * is safe to lose. Receipts, drafts and preferences are never released; a write
 * that still does not fit throws exactly as before, so fail-closed callers stay
 * fail-closed. No React or app imports: the workbench bridge bundles this file. */
import { boundedWorkbenchPrompts, WORKBENCH_PROMPTS_BUDGET, WORKBENCH_PROMPTS_KEY } from "../reference-workbench/local-prompts";

// Rebuildable caches large enough to matter. Small cache bookkeeping keys are
// left alone here; recovery.ts clears them together with their databases.
const DISPOSABLE_KEYS = new Set(["naumi:templatesCacheV1"]);

export function isQuotaError(error: unknown) {
  const value = error as { name?: unknown; code?: unknown } | null;
  return !!value && (value.name === "QuotaExceededError" || value.name === "NS_ERROR_DOM_QUOTA_REACHED" || value.code === 22 || value.code === 1014);
}

function storageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key !== null) keys.push(key); }
  return keys;
}

export const isWorkbenchPromptsKey = (key: string) => key === WORKBENCH_PROMPTS_KEY || key.endsWith(":" + WORKBENCH_PROMPTS_KEY);

/** Shrinks every workbench prompt object above `budget`. Returns characters released. */
export function trimWorkbenchPromptStores(storage: Storage = localStorage, budget = WORKBENCH_PROMPTS_BUDGET) {
  let released = 0;
  for (const key of storageKeys(storage)) {
    if (!isWorkbenchPromptsKey(key)) continue;
    const raw = storage.getItem(key);
    if (raw === null || raw.length <= budget) continue;
    const next = boundedWorkbenchPrompts(raw, budget);
    storage.setItem(key, next);
    released += raw.length - next.length;
  }
  return released;
}

/** Called after a QuotaExceededError. Returns whether anything was released. */
export function freeLocalStorageSpace(storage: Storage = localStorage) {
  let released = 0;
  try {
    for (const key of storageKeys(storage)) if (DISPOSABLE_KEYS.has(key)) { released += (storage.getItem(key) || "").length; storage.removeItem(key); }
    released += trimWorkbenchPromptStores(storage, Math.floor(WORKBENCH_PROMPTS_BUDGET / 3));
  } catch { /* storage unavailable: nothing to release */ }
  return released > 0;
}

export function setLocalItem(key: string, value: string, storage: Storage = localStorage) {
  try { storage.setItem(key, value); }
  catch (error) {
    if (!isQuotaError(error) || !freeLocalStorageSpace(storage)) throw error;
    storage.setItem(key, value);
  }
}

/** Drop-in for call sites that take a Storage-like object (task receipts). */
export const resilientLocalStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => setLocalItem(key, value),
  removeItem: key => localStorage.removeItem(key),
};
