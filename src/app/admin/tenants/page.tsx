import {Suspense} from 'react';
import {requireAdminPage} from '@/lib/admin-page';
import {PlatformConsole} from '@/components/saas/platform-console';
export const dynamic='force-dynamic';
export default async function Page(){await requireAdminPage('/admin/tenants');return <Suspense><PlatformConsole view="tenants"/></Suspense>;}
