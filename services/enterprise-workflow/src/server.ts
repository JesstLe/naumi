import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { id, WorkflowError, type Principal } from './contracts';
import type { WorkflowStore } from './store';
import type { SchedulingStore } from './scheduling-store';
import type { SourceIdentityStore,SourceAuthenticate } from './source-identity';
// Adapter verifies short-lived BFF authentication (issuer, audience, expiry, signature),
// NOT x-user/x-enterprise headers or a caller-supplied permissions array.
export type Authenticate = (request: IncomingMessage) => Promise<Principal | null>;
export function createWorkflowPool(connectionString:string){return new Pool({connectionString,max:4});}
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
export function createWorkflowServer(store: WorkflowStore, authenticate: Authenticate, scheduling?: SchedulingStore, identity?:{store:SourceIdentityStore;authenticate:SourceAuthenticate}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://workflow.internal');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'alive', service: 'enterprise-workflow', stage: 'foundation' });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        try { await store.ready(); if (scheduling) await scheduling.ready(); } catch { throw new WorkflowError(503, 'NOT_READY'); }
        return json(res, 200, { status: 'ready', schemaVersion: scheduling ? 2 : 1 });
      }
      if(identity&&req.method==='GET'&&url.pathname==='/v1/identity/workspaces'){
        const source=await identity.authenticate(req);if(!source)throw new WorkflowError(401,'AUTH_REQUIRED');
        return json(res,200,await identity.store.workspaces(source));
      }
      const principal = await authenticate(req);
      if (!principal) throw new WorkflowError(401, 'AUTH_REQUIRED');
      if (!id.safeParse(principal.enterpriseId).success || !principal.subject) throw new WorkflowError(401, 'INVALID_IDENTITY');
      if (scheduling && req.method === 'POST' && url.pathname === '/v1/scheduling/commands') return json(res, 200, await scheduling.execute(principal, await body(req)));
      const scheduleMatch = /^\/v1\/teams\/([^/]+)\/scheduling(?:\/(audit)|\/personal\/([a-z][a-z0-9_]{0,63}))?$/.exec(url.pathname);
      if (scheduling && req.method === 'GET' && scheduleMatch) {
        const teamId = scheduleMatch[1];
        if (!id.safeParse(teamId).success) throw new WorkflowError(400, 'INVALID_TEAM_ID');
        if (scheduleMatch[2]) return json(res, 200, await scheduling.audit(principal, teamId));
        if (scheduleMatch[3]) return json(res, 200, await scheduling.personal(principal, teamId, scheduleMatch[3]));
        return json(res, 200, await scheduling.get(principal, teamId));
      }
      if (req.method === 'POST' && url.pathname === '/v1/commands') return json(res, 200, await store.execute(principal, await body(req)));
      const match = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && match) {
        if (!id.safeParse(match[1]).success) throw new WorkflowError(400, 'INVALID_ORDER_ID');
        return json(res, 200, { order: await store.get(principal, match[1]) });
      }
      throw new WorkflowError(404, 'NOT_FOUND');
    } catch (e) {
      const known = e instanceof WorkflowError;
      if (!known && e && typeof e === 'object' && 'code' in e && ['55P03','57014','40P01'].includes(String(e.code))) return json(res, 503, { error: { code: 'RETRY_LATER' } });
      json(res, known ? e.status : 500, { error: { code: known ? e.code : 'INTERNAL_ERROR' } });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
export { WorkflowStore } from './store';
export type { ResolveActor, ValidateAssets } from './store';
export { SchedulingStore } from './scheduling-store';
export { createBffAuthenticator, resolveDatabaseActor } from './identity';
export { SourceIdentityStore,createSourceVerifier,createMappedAuthenticator } from './source-identity';
