import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { id, WorkflowError, type Principal } from './contracts';
import type { WorkflowStore } from './store';
// Adapter verifies short-lived BFF authentication (issuer, audience, expiry, signature),
// NOT x-user/x-enterprise headers or a caller-supplied permissions array.
export type Authenticate = (request: IncomingMessage) => Promise<Principal | null>;
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new WorkflowError(415, 'JSON_REQUIRED');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) throw new WorkflowError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorkflowError(400, 'INVALID_JSON'); }
}
export function createWorkflowServer(store: WorkflowStore, authenticate: Authenticate) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://workflow.internal');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'alive', service: 'enterprise-workflow', stage: 'foundation' });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        try { await store.ready(); } catch { throw new WorkflowError(503, 'NOT_READY'); }
        return json(res, 200, { status: 'ready', schemaVersion: 1 });
      }
      const principal = await authenticate(req);
      if (!principal) throw new WorkflowError(401, 'AUTH_REQUIRED');
      if (!id.safeParse(principal.enterpriseId).success || !principal.subject) throw new WorkflowError(401, 'INVALID_IDENTITY');
      if (req.method === 'POST' && url.pathname === '/v1/commands') return json(res, 200, await store.execute(principal, await body(req)));
      const match = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && match) {
        if (!id.safeParse(match[1]).success) throw new WorkflowError(400, 'INVALID_ORDER_ID');
        return json(res, 200, { order: await store.get(principal, match[1]) });
      }
      throw new WorkflowError(404, 'NOT_FOUND');
    } catch (e) {
      const known = e instanceof WorkflowError;
      json(res, known ? e.status : 500, { error: { code: known ? e.code : 'INTERNAL_ERROR' } });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
export { WorkflowStore } from './store';
export type { ResolveActor, ValidateAssets } from './store';
