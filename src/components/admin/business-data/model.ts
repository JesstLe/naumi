import type { BusinessFilter, BusinessResponse, BusinessSource, BusinessTotals, BusinessView, Sourced } from "./types";
import { businessExplicitEntry } from "./entry";

export const businessViews: { id: BusinessView; label: string }[] = [
  { id: "usage", label: "积分消耗" },
  { id: "users", label: "用户" },
  { id: "orders", label: "订单" },
  { id: "ledger", label: "账务" },
  { id: "creations", label: "作品" },
];
export const viewNames = Object.fromEntries(businessViews.map(view => [view.id, view.label])) as Record<BusinessView, string>;
const periods = [7, 30, 90, 365] as const;

/** Parse URL selectors into bounded site, view, period, search and page values while retaining an optional account email. */
export function businessFilter(params: URLSearchParams, initialView: BusinessView = "usage"): BusinessFilter {
  const view = params.get("view"), days = Number(params.get("days") || 30), page = Number(params.get("page") || 1);
  const site = params.get("site") || "all";
  return {
    site: site === "all" || site === "local" || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(site) ? site : "all",
    view: businessViews.some(item => item.id === view) ? view as BusinessView : initialView,
    days: periods.includes(days as typeof periods[number]) ? days as typeof periods[number] : 30,
    search: (params.get("search") || "").slice(0, 100),
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
    ...(params.get("email") ? { email: params.get("email")! } : {}),
  };
}

/** Merge against the latest URL; account links retain their explicit fleet scope on reload. */
export function businessNavigation(params: URLSearchParams, patch: Partial<BusinessFilter>, initialView: BusinessView = "usage") {
  const next = { ...businessFilter(params, initialView), ...patch }, search = new URLSearchParams(params);
  search.delete("detail");
  const scoped = Boolean(next.email);
  for (const key of ["site", "view", "days", "search", "page", "email"] as const) {
    const value = next[key];
    const defaultScope = key === "site" && value === "all" || key === "view" && value === initialView;
    if (!value || !scoped && defaultScope || key === "days" && value === 30 || key === "page" && value === 1) search.delete(key);
    else search.set(key, String(value));
  }
  // Default Fleet filters must not collapse into a bare native entry on reload.
  if (!businessExplicitEntry({ section: search.get("section") ?? undefined }, true) && !search.has("site") && !search.has("view")) search.set("view", initialView);
  return search;
}

/** Create an unambiguous display key from the source ID and email so equal emails on different sites remain distinct accounts. */
export function accountIdentity(sourceId: string, email: string) {
  return JSON.stringify([sourceId, email]);
}

/** A partial response is not a complete global total; zero remains a real value only. */
export function combinedTotals(response: BusinessResponse | null): BusinessTotals | null {
  if (!response?.complete || !response.sources.length || response.sources.some(source => source.status !== "succeeded" || !source.data)) return null;
  const keys = ["credits", "operations", "activeUsers", "users", "artworks", "paidOrders", "paidAmount", "refundCredits", "administrativeDebits"] as const;
  const result: BusinessTotals = { credits: 0, operations: 0, activeUsers: 0, balance: 0, users: 0, artworks: 0, paidOrders: 0, paidAmount: 0, refundCredits: 0, administrativeDebits: 0 };
  for (const source of response.sources) for (const key of keys) {
    const value = source.data!.totals[key];
    if (!Number.isFinite(value)) return null;
    result[key] += value;
    if (!Number.isFinite(result[key]) || Math.abs(result[key]) > Number.MAX_SAFE_INTEGER) return null;
  }
  let balance: number | null = 0;
  for (const source of response.sources) {
    const value = source.data!.totals.balance;
    if (value === null) { balance = null; break; }
    if (!Number.isFinite(value)) return null;
    balance += value;
    if (!Number.isFinite(balance) || Math.abs(balance) > Number.MAX_SAFE_INTEGER) return null;
  }
  result.balance = balance;
  return result;
}

/** Report whether any successfully returned source still has rows beyond its own current page; pending sources alone do not enable next-page navigation. */
export function hasNextSourcePage(response: BusinessResponse | null) {
  return Boolean(response?.sources.some(source => source.status === "succeeded" && source.data && source.data.total > source.data.page * source.data.pageSize));
}

/** Return rows only from a successful source snapshot and attach source identity without mutating the cached rows. */
export function sourceRows<K extends "users" | "orders" | "ledger" | "creations">(source: BusinessSource, key: K): Sourced<NonNullable<BusinessSource["data"]>[K][number]>[] {
  if (source.status !== "succeeded" || !source.data) return [];
  return source.data[key].map(row => ({ ...row, sourceId: source.id, sourceName: source.name }));
}

export const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
/** Format a finite numeric value with the shared locale formatter, preserving zero and rendering absent or non-finite values as unknown. */
export function number(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : numberFormat.format(value);
}
/** Format finite amounts stored in minor currency units as CNY; absent or non-finite amounts remain unknown. */
export function money(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value / 100);
}
/** Format a valid timestamp in Asia/Shanghai; absent or invalid dates remain unknown. */
export function localTime(raw: string | null | undefined) {
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : "—";
}
