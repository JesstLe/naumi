import { collaborationRoute } from '@/lib/collaboration/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return collaborationRoute(request, 'members'); }
