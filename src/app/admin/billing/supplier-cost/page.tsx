import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { SupplierCostManager } from "@/components/admin/billing/supplier-cost-manager";
import { BillingNavigation } from "@/components/admin/billing/navigation";
export const dynamic="force-dynamic";
export const metadata={title:"调用成本与供应商对账 — Naumi",robots:{index:false,follow:false}};
export default async function SupplierCostPage(){await requireAdminPage('/admin/billing/supplier-cost');return <AdminCenterShell active="billing"><BillingNavigation active="cost"/><SupplierCostManager/></AdminCenterShell>}
