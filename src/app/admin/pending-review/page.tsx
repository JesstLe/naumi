import { AdminCenterShell } from "@/components/admin/center-shell";
import { PendingReviewConsole } from "@/components/admin/billing/pending-review";
import { requireAdminPage } from "@/lib/admin-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "待核查工作台 — Naumi", robots: { index: false, follow: false } };

export default async function PendingReviewPage() {
  await requireAdminPage("/admin/pending-review");
  return <AdminCenterShell active="pending-review"><PendingReviewConsole /></AdminCenterShell>;
}
