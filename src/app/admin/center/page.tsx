import {AdminCenterShell} from "@/components/admin/center-shell";
import {Suspense} from "react";
import {PlatformConsole} from "@/components/saas/platform-console";
import { requireAdminPage } from "@/lib/admin-page";
import { BI_SECTIONS, type BiSection } from "@/lib/bi/contracts";
import { BiDashboard } from "@/components/admin/bi/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理中心 — Naumi", robots: { index: false, follow: false } };

export default async function AdminCenterPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const query = await searchParams;
  const section = BI_SECTIONS.includes(query.section as BiSection) ? query.section as BiSection : "overview";
  await requireAdminPage(`/admin/center?section=${section}`);
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
