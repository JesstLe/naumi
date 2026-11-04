import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin-page";
import { UserUsage } from "@/components/admin/bi/user-usage";
import { FleetBusinessDashboard } from "@/components/admin/business-data/business-dashboard";
import { businessExplicitEntry, businessLocalDetail } from "@/components/admin/business-data/entry";

export const dynamic = "force-dynamic";
export const metadata = { title: "用户用量 — Naumi", robots: { index: false, follow: false } };

/** Require administrator access before reading filters, then render native usage unless an explicit Fleet entry has no local-detail override. */
export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin/usage");
  const params = await searchParams;
  if (process.env.FLEET_CONTROL_ENABLED === "1" && businessExplicitEntry(params) && !businessLocalDetail(params, true)) return <Suspense><FleetBusinessDashboard /></Suspense>;
  return <Suspense><UserUsage /></Suspense>;
}
