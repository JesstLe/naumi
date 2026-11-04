import type { FleetBusinessQuery, FleetBusinessSnapshot } from "@/lib/fleet/business-contracts";
import type { BusinessSite as CentralBusinessSite, BusinessSource as CentralBusinessSource, FleetBusinessResponse } from "@/lib/fleet/business-central-contracts";

export type BusinessView = Exclude<FleetBusinessQuery["view"], "overview">;
export type BusinessFilter = {
  site: string;
  view: BusinessView;
  days: 7 | 30 | 90 | 365;
  search: string;
  page: number;
  email?: string;
};
export type BusinessSite = CentralBusinessSite;
export type BusinessSource = CentralBusinessSource;
export type BusinessResponse = FleetBusinessResponse;
export type BusinessSnapshot = FleetBusinessSnapshot;
export type BusinessTotals = FleetBusinessSnapshot["totals"];
export type Sourced<T> = T & { sourceId: string; sourceName: string };
