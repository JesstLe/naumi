"use client";

import { pruneToolGenerationReceipts } from "@/lib/tool-generation-receipt-keys";
import { trimWorkbenchPromptStores } from "./local";

/** Bounded once-per-load upkeep for keys that older versions let grow without
 * limit. Removes only orphaned pointers and over-budget workbench prompt
 * history; never receipts that still name a live job, drafts or preferences. */
export function runBrowserStorageHygiene(storage: Storage = localStorage) {
  const result = { trimmedChars: 0, orphanReceipts: 0 };
  try { result.trimmedChars = trimWorkbenchPromptStores(storage); } catch { /* optional upkeep */ }
  try { result.orphanReceipts = pruneToolGenerationReceipts(storage); } catch { /* optional upkeep */ }
  return result;
}

let scheduled = false;
export function scheduleBrowserStorageHygiene() {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const run = () => { runBrowserStorageHygiene(); };
  // Called through window: a detached requestIdleCallback throws Illegal invocation.
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 10_000 });
  else setTimeout(run, 3_000);
}
