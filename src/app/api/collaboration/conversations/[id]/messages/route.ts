import { collaborationRoute } from '@/lib/collaboration/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return collaborationRoute(request, 'messages', (await context.params).id);
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return collaborationRoute(request, 'messages', (await context.params).id);
}
