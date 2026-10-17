import { requireAdminPage } from '@/lib/admin-page';
import { AdminCenterShell } from '@/components/admin/center-shell';
import { EnterpriseWorkbench } from '@/components/enterprise-workbench/workbench';
export const dynamic='force-dynamic';
export default async function Page(){
  await requireAdminPage('/admin/enterprise-workbench');
  return <AdminCenterShell active='enterprise-workbench' light><EnterpriseWorkbench/></AdminCenterShell>;
}
