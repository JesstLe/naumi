import {Suspense} from 'react';
import {requireAdminPage} from '@/lib/admin-page';
import {PlatformConsole} from '@/components/saas/platform-console';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{tenantId:string}>}){const {tenantId}=await params;await requireAdminPage(`/admin/tenants/${tenantId}`);return <Suspense><PlatformConsole view="tenant" tenantId={tenantId}/></Suspense>;}
