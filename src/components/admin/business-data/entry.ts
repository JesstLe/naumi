import type { AdminSection } from "../navigation";
import type { BusinessView } from "./types";

type Parameters = Record<string, string | string[] | undefined>;
export type BusinessEntry = "usage" | "overview" | "users" | "orders" | "ledger" | "artworks";
const entryViews: Record<BusinessEntry, BusinessView> = { usage: "usage", overview: "usage", users: "users", orders: "orders", ledger: "ledger", artworks: "creations" };
const localFilters = ["from", "to", "tenantId", "sort", "size"];
const localBiFilters = ["q", "accountType", "status", "period", "id", "source"];

/** Map only recognized entry names to their business view; return null for native-only or unknown center sections. */
export function businessEntryView(section: string): BusinessView | null {
  return Object.hasOwn(entryViews, section) ? entryViews[section as BusinessEntry] : null;
}

/** Bare legacy entries stay native; Fleet requires an explicit section or scope. */
export function businessExplicitEntry(params: Parameters, center = false) {
  const section = typeof params.section === "string" ? params.section : "";
  return Object.hasOwn(params, "site") || Object.hasOwn(params, "view")
    || Boolean(businessEntryView(section) && (!center || section !== "usage"));
}

/** Native BI deep links keep their complete owner, including local mutations. */
export function businessLocalDetail(params: Parameters, center = false) {
  return params.detail === "local" || [...localFilters, ...(center ? localBiFilters : [])].some(key => Object.hasOwn(params, key))
    || center && Object.hasOwn(params, "email") && !Object.hasOwn(params, "view") && !Object.hasOwn(params, "site");
}

/** Derive navigation ownership, title and the explicit local-detail return link from the current business view and originating admin entry. */
export function businessPresentation(view: BusinessView, entry: BusinessEntry) {
  const overview = view === "usage" && entry === "overview";
  const active: AdminSection = overview ? "overview" : view === "creations" ? "creations" : view;
  const title = overview ? "运营概览" : { usage: "用户用量", users: "用户管理", orders: "充值订单", ledger: "积分流水", creations: "作品数据" }[view];
  const section = overview ? "overview" : view === "creations" ? "artworks" : view;
  const localHref = section === "usage" ? "/admin/usage?detail=local" : `/admin/center?section=${section}&detail=local`;
  return { active, title, localHref, localLabel: view === "users" ? "本站用户管理" : "103 详细分析" };
}
