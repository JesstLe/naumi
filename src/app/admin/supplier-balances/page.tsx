import { requireAdminPage } from '@/lib/admin-page';
import { AdminCenterShell } from '@/components/admin/center-shell';
import { SupplierBalancePage } from '@/components/admin/model-health/supplier-balance-page';
export const dynamic = 'force-dynamic';
export const metadata = { title: '供应商余额 — Naumi', robots: { index: false, follow: false } };
export default async function SupplierBalancesPage() {
  await requireAdminPage('/admin/supplier-balances');
  return <AdminCenterShell active='supplier-balances' light><SupplierBalancePage /></AdminCenterShell>;
}
