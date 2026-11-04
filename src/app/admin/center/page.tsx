import {AdminCenterShell} from "@/components/admin/center-shell";
import {Suspense} from "react";
import {PlatformConsole} from "@/components/saas/platform-console";
import { requireAdminPage } from "@/lib/admin-page";
import { BI_SECTIONS, type BiSection } from "@/lib/bi/contracts";
import { BiDashboard } from "@/components/admin/bi/dashboard";
import { FleetBusinessDashboard } from "@/components/admin/business-data/business-dashboard";
import { businessEntryView, businessExplicitEntry, businessLocalDetail, type BusinessEntry } from "@/components/admin/business-data/entry";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理中心 — Naumi", robots: { index: false, follow: false } };

/** Authenticate the requested center URL before choosing its native or explicit Fleet owner.
 * Preserve every explicit query value in the login return target; bare entries stay native.
 */
export default async function AdminCenterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const explicitSection = BI_SECTIONS.includes(query.section as BiSection);
  const section = explicitSection ? query.section as BiSection : "overview";
  const explicitScope = Object.hasOwn(query, "site") || Object.hasOwn(query, "view");
  const returnQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) returnQuery.append(key, item);
    }
  }
  await requireAdminPage(explicitSection || explicitScope ? `/admin/center?${returnQuery}` : "/admin/center");
  const initialView = businessEntryView(section);
  if (process.env.FLEET_CONTROL_ENABLED === "1" && initialView && businessExplicitEntry(query, true) && !businessLocalDetail(query, true)) {
    return <Suspense><FleetBusinessDashboard initialView={initialView} entry={section as BusinessEntry}/></Suspense>;
  }
  // The SaaS summary cards stay on top; the full operations overview
  // (consumption / revenue / artwork metrics, date-filtered trend and drill-down)
  // renders below so the pre-redesign data panels remain on the landing page.
  return section === "overview" ? (
    <AdminCenterShell active="overview">
      <Suspense><PlatformConsole embedded /></Suspense>
      <Suspense><BiDashboard initialSection="overview" embedded /></Suspense>
    </AdminCenterShell>
  ) : (
    <BiDashboard initialSection={section} />
  );
}
