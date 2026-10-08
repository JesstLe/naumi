import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { BillingNavigation } from "@/components/admin/billing/navigation";
import { Image25PriceTable } from "@/components/admin/billing/image25-price-table";
export const dynamic = "force-dynamic";
export const metadata = { title: "APIMart 模型价格表 — Naumi", robots: { index: false, follow: false } };
export default async function PriceTablePage() {
  await requireAdminPage("/admin/billing/price-table");
  return <AdminCenterShell active="billing"><BillingNavigation active="prices" /><Image25PriceTable /></AdminCenterShell>;
}
