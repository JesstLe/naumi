import { requireAdminPage } from "@/lib/admin-page";
import { BI_SECTIONS, type BiSection } from "@/lib/bi/contracts";
import { BiDashboard } from "@/components/admin/bi/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理中心 — Naumi", robots: { index: false, follow: false } };

export default async function AdminCenterPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const query = await searchParams;
  const section = BI_SECTIONS.includes(query.section as BiSection) ? query.section as BiSection : "overview";
  await requireAdminPage(`/admin/center?section=${section}`);
  return <BiDashboard initialSection={section} />;
}
