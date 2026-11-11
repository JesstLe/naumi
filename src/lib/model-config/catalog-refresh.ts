"use client";
import { MODEL_CATALOG_REFRESH } from "./public-client";

const CHANNEL = "naumi:model-catalog-publication";
const STORAGE_KEY = "naumi:model-catalog-publication-pulse";
let installed = false;
let receiving = false;

/** Invalidate, never transfer catalog data, credentials or another actor's draft. */
export function installModelCatalogRefreshBridge() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let channel: BroadcastChannel | undefined;
  const receive = () => {
    receiving = true;
    try { window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH)); }
    finally { receiving = false; }
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener("message", event => { if (event.data?.type === "refresh") receive(); });
  } catch { /* Storage events and focus still invalidate on older browsers. */ }
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY && event.newValue) receive();
  });
  window.addEventListener(MODEL_CATALOG_REFRESH, () => {
    if (receiving) return;
    if (channel) {
      try { channel.postMessage({ type: "refresh" }); return; }
      catch { channel = undefined; }
    }
    try { window.localStorage.setItem(STORAGE_KEY, `${Date.now()}:${Math.random()}`); }
    catch { /* A blocked optional browser store must not block local refresh. */ }
  });
}

export function notifyModelCatalogRefresh() {
  if (typeof window === "undefined") return;
  installModelCatalogRefreshBridge();
  window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));
}

/** Shared refresh lifecycle, independent request/state ownership per consumer.
 * Publications refresh immediately; focus+visibility events coalesce for 60s. */
export function subscribeModelCatalogRefresh(refresh: () => void, minReturnIntervalMs = 60_000) {
  if (typeof window === "undefined") return () => {};
  installModelCatalogRefreshBridge();
  let observedAt = Date.now();
  const explicit = () => { observedAt = Date.now(); refresh(); };
  const returned = () => { if (Date.now() - observedAt >= minReturnIntervalMs) explicit(); };
  const visible = () => { if (document.visibilityState === "visible") returned(); };
  window.addEventListener(MODEL_CATALOG_REFRESH, explicit);
  window.addEventListener("focus", returned);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener(MODEL_CATALOG_REFRESH, explicit);
    window.removeEventListener("focus", returned);
    document.removeEventListener("visibilitychange", visible);
  };
}
