import 'server-only';
import { authorizeCollaborationRequest, collaborationFailure } from '@/lib/enterprise/collaboration-access';
import { teamJson } from '@/lib/teams/access';
import { TeamError } from '@/lib/teams/server';
import { bootstrap, collaborationScope, conversationsTx, createConversationTx, changeConversationTx, forwardMessagesTx,
  membersTx, messagesTx, presenceTx, readMessageTx, sendMessageTx, withdrawMessageTx, type ShareValidator } from './service';
import { collaborationEventStream, eventCursorTx } from './events';
import { beginUploadTx, cancelUploadTx, completeUpload, downloadAttachment, getUploadTx, maybeCleanupUploads, putUploadPart } from './uploads';
import { readBoundedBody } from './private-storage';

// Assembly boundary only. The sharing module owns this port and all consent rules.
// Lazy import avoids loading a mutually independent module on ordinary chat requests.
const shareValidator: ShareValidator = async (...args) => {
  const { validateShareForMessageTx } = await import('@/lib/canvas-sharing/service');
  return validateShareForMessageTx(...args);
};
export type CollaborationAction = 'bootstrap' | 'members' | 'conversations' | 'conversation' | 'messages' | 'read' | 'withdraw' | 'forward' | 'presence' | 'events' | 'uploads' | 'upload' | 'complete' | 'attachment';
export async function collaborationRoute(request: Request, action: CollaborationAction, resourceId = ''): Promise<Response> {
  try {
    const actor = await authorizeCollaborationRequest(request);
    if (actor instanceof Response) return actor;
    const url = new URL(request.url), enterprise = url.searchParams.get('enterpriseId') || '';
    if (action === 'bootstrap') return teamJson(await bootstrap(actor.email, enterprise));
    if (!enterprise) throw new TeamError('请选择企业', 400);
    const run = <T>(fn: Parameters<typeof collaborationScope<T>>[2]) => collaborationScope(actor.email, enterprise, fn);
    const json = async () => JSON.parse((await readBoundedBody(request, 128 * 1024)).toString('utf8')) as unknown;
    if (action === 'events') {
      const snapshot = await run(async (tx, scope) => ({ scope, cursor: await eventCursorTx(tx, scope) }));
      return collaborationEventStream(request, snapshot.scope, snapshot.cursor);
    }
    if (action === 'attachment') return await downloadAttachment(actor.email, enterprise, resourceId, request);
    if (action === 'upload' && request.method === 'PUT') return teamJson({ upload: await putUploadPart(actor.email, enterprise, resourceId, url.searchParams.get('part'), request) });
    if (action === 'complete') return teamJson({ attachment: await completeUpload(actor.email, enterprise, resourceId) });
    if (action === 'members') return teamJson(await run((tx, scope) => membersTx(tx, scope, url.searchParams.get('q') || '', url.searchParams.get('cursor'))));
    if (action === 'conversations' && request.method === 'GET') return teamJson(await run((tx, scope) => conversationsTx(tx, scope, url.searchParams.get('cursor'))));
    if (action === 'messages' && request.method === 'GET') return teamJson(await run((tx, scope) => messagesTx(tx, scope, resourceId, url.searchParams)));
    if (action === 'upload' && request.method === 'GET') return teamJson({ upload: await run((tx, scope) => getUploadTx(tx, scope, resourceId)) });
    if (action === 'upload' && request.method === 'DELETE') return teamJson(await run((tx, scope) => cancelUploadTx(tx, scope, resourceId)));
    if (action === 'withdraw') return teamJson({ message: await run((tx, scope) => withdrawMessageTx(tx, scope, resourceId)) });
    const input = await json();
    if (action === 'conversations') return teamJson({ conversation: await run((tx, scope) => createConversationTx(tx, scope, input)) });
    if (action === 'conversation') return teamJson({ conversation: await run((tx, scope) => changeConversationTx(tx, scope, resourceId, input)) });
    if (action === 'messages') return teamJson({ message: await run((tx, scope) => sendMessageTx(tx, scope, resourceId, input, shareValidator)) });
    if (action === 'read') return teamJson(await run((tx, scope) => readMessageTx(tx, scope, resourceId, input)));
    if (action === 'forward') return teamJson({ messages: await run((tx, scope) => forwardMessagesTx(tx, scope, input, shareValidator)) });
    if (action === 'presence') return teamJson(await run((tx, scope) => presenceTx(tx, scope, input)));
    if (action === 'uploads') {
      await maybeCleanupUploads(); return teamJson({ upload: await run((tx, scope) => beginUploadTx(tx, scope, input)) });
    }
    throw new TeamError('接口不存在', 404);
  } catch (error) { return collaborationFailure(error); }
}
