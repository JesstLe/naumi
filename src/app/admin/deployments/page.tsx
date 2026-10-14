import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { fleetOperator } from '@/lib/fleet/server';
import { AdminCenterShell } from '@/components/admin/center-shell';
import { FleetManager } from '@/components/admin/fleet-manager';
export const dynamic='force-dynamic';
export default async function DeploymentsPage() {
  if(process.env.FLEET_CONTROL_ENABLED!=='1')notFound();
  const actor=await fleetOperator(new Request('http://internal/admin/deployments',{headers:await headers()}));
  if(actor instanceof Response){if(actor.status===401)redirect('/admin?next=/admin/deployments');notFound();}
  return <AdminCenterShell active='deployments' light deploymentsOnly={!actor.root}><FleetManager/></AdminCenterShell>;
}
