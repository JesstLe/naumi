import { collaborationRoute } from '@/lib/collaboration/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return collaborationRoute(request, 'conversation', (await context.params).id);
}
