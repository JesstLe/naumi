import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-page';
import { AdminCenterShell } from '@/components/admin/center-shell';
import { FleetManager } from '@/components/admin/fleet-manager';
export const dynamic='force-dynamic';
export default async function DeploymentsPage() {
  if(process.env.FLEET_CONTROL_ENABLED!=='1')notFound();
  await requireAdminPage('/admin/deployments');
  return <AdminCenterShell active='deployments' light><FleetManager/></AdminCenterShell>;
}
