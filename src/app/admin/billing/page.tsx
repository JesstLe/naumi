import { requireAdminPage } from "@/lib/admin-page";
import { BillingManager } from "@/components/admin/billing/billing-manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage() { await requireAdminPage("/admin/billing"); return <AdminCenterShell active="billing"><BillingManager /></AdminCenterShell>; }
