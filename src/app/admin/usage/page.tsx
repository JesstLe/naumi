import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin-page";
import { UserUsage } from "@/components/admin/bi/user-usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "用户用量 — Naumi", robots: { index: false, follow: false } };

export default async function AdminUsagePage() {
  await requireAdminPage("/admin/usage");
  return <Suspense><UserUsage /></Suspense>;
}
