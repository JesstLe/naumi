import type { AdminSection } from "../navigation";
import type { BusinessView } from "./types";

type Parameters = Record<string, string | string[] | undefined>;
export type BusinessEntry = "usage" | "overview" | "users" | "orders" | "ledger" | "artworks";
const entryViews: Record<BusinessEntry, BusinessView> = { usage: "usage", overview: "usage", users: "users", orders: "orders", ledger: "ledger", artworks: "creations" };
const localFilters = ["from", "to", "tenantId", "sort", "size"];
const localBiFilters = ["q", "accountType", "status", "period", "id", "source"];

export function businessEntryView(section: string): BusinessView | null {
  return Object.hasOwn(entryViews, section) ? entryViews[section as BusinessEntry] : null;
}

/** Native BI deep links keep their complete owner, including local mutations. */
export function businessLocalDetail(params: Parameters, center = false) {
  return params.detail === "local" || [...localFilters, ...(center ? localBiFilters : [])].some(key => Object.hasOwn(params, key))
    || center && Object.hasOwn(params, "email") && !Object.hasOwn(params, "view") && !Object.hasOwn(params, "site");
}

export function businessPresentation(view: BusinessView, entry: BusinessEntry) {
  const overview = view === "usage" && entry === "overview";
  const active: AdminSection = overview ? "overview" : view === "creations" ? "creations" : view;
  const title = overview ? "运营概览" : { usage: "用户用量", users: "用户管理", orders: "充值订单", ledger: "积分流水", creations: "作品数据" }[view];
  const section = overview ? "overview" : view === "creations" ? "artworks" : view;
  const localHref = section === "usage" ? "/admin/usage?detail=local" : `/admin/center?section=${section}&detail=local`;
  return { active, title, localHref, localLabel: view === "users" ? "本站用户管理" : "103 详细分析" };
}
