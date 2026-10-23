import { tenantUsageRoute } from '@/lib/saas/tenant-usage-http';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => tenantUsageRoute(request);
