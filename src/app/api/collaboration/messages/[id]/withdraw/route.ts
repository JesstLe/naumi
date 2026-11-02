import { collaborationRoute } from '@/lib/collaboration/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return collaborationRoute(request, 'withdraw', (await context.params).id);
}
