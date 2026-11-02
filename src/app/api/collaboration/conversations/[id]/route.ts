import { collaborationRoute } from '@/lib/collaboration/http';
import { authorizeCollaborationRequest, collaborationFailure } from '@/lib/enterprise/collaboration-access';
import { collaborationScope, conversationSnapshotTx } from '@/lib/collaboration/service';
import { teamJson } from '@/lib/teams/access';
import { TeamError } from '@/lib/teams/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeCollaborationRequest(request); if (actor instanceof Response) return actor;
    const enterprise = new URL(request.url).searchParams.get('enterpriseId');
    if (!enterprise) throw new TeamError('请选择企业', 400);
    const { id } = await context.params;
    return teamJson(await collaborationScope(actor.email, enterprise, (tx, scope) => conversationSnapshotTx(tx, scope, id)));
  } catch (error) { return collaborationFailure(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return collaborationRoute(request, 'conversation', (await context.params).id);
}
