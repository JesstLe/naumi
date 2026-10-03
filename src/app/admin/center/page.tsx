import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { BI_SECTIONS, type BiSection } from "@/lib/bi/contracts";
import { BiDashboard } from "@/components/admin/bi/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理中心 — Naumi", robots: { index: false, follow: false } };

export default async function AdminCenterPage({ searchParams }: { searchParams: { section?: string } }) {
  if (!await requireAdmin(new Request("http://internal/admin/center", { headers: headers() }))) notFound();
  const section = BI_SECTIONS.includes(searchParams.section as BiSection) ? searchParams.section as BiSection : "overview";
  return <BiDashboard initialSection={section} />;
}
