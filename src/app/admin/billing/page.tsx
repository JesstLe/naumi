import { BillingNavigation } from "@/components/admin/billing/navigation";
import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { requireAdminPage } from "@/lib/admin-page";
import { BillingManager } from "@/components/admin/billing/billing-manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ section?: string }> }) {
  await requireAdminPage("/admin/billing");
  const query = await searchParams;
  const legacy = query?.section === "wallet";
  return <AdminCenterShell active="billing"><BillingNavigation active={legacy ? "wallet" : "config"} />{legacy ? <BillingManager initialTab="products" /> : <ModelConfigurationManager billingMode />}</AdminCenterShell>;
}
