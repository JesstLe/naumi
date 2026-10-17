import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { id, WorkflowError, type Principal } from './contracts';
import type { WorkflowStore } from './store';
import type { SchedulingStore } from './scheduling-store';
import type { SourceIdentityStore,SourceAuthenticate } from './source-identity';
import type { PeopleStore } from './people-store';
import type {PerformanceStore} from './performance-store';
import type { DeliveryStore } from './delivery-store';
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
export function createWorkflowServer(store: WorkflowStore, authenticate: Authenticate, scheduling?: SchedulingStore, identity?:{store:SourceIdentityStore;authenticate:SourceAuthenticate},people?:PeopleStore,delivery?:DeliveryStore,performance?:PerformanceStore) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://workflow.internal');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'alive', service: 'enterprise-workflow', stage: 'foundation' });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        try { await store.ready(); if (scheduling) await scheduling.ready(); if(performance)await performance.ready(); } catch { throw new WorkflowError(503, 'NOT_READY'); }
        return json(res, 200, { status: 'ready', schemaVersion: scheduling ? 2 : 1 });
      }
      if(identity&&req.method==='GET'&&url.pathname==='/v1/identity/workspaces'){
        const source=await identity.authenticate(req);if(!source)throw new WorkflowError(401,'AUTH_REQUIRED');
        return json(res,200,await identity.store.workspaces(source));
      }
      const principal = await authenticate(req);
      if (!principal) throw new WorkflowError(401, 'AUTH_REQUIRED');
      if (!id.safeParse(principal.enterpriseId).success || !principal.subject) throw new WorkflowError(401, 'INVALID_IDENTITY');
      if(performance&&url.pathname==='/v1/performance'){await performance.ready();if(req.method==='GET')return json(res,200,await performance.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST')return json(res,200,await performance.execute(principal,await body(req)));}
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/assets')return json(res,200,await delivery.list(principal,Object.fromEntries(url.searchParams)));
      if(delivery&&req.method==='POST'&&url.pathname==='/v1/delivery/upload'){
        if(req.headers['content-type']!=='application/octet-stream')throw new WorkflowError(415,'BINARY_REQUIRED');
        if(Number(req.headers['content-length']||0)>delivery.maxBytes)throw new WorkflowError(413,'ASSET_TOO_LARGE');
        return json(res,200,await delivery.upload(principal,Object.fromEntries(url.searchParams),req));
      }
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/download'){
        const {asset,stream}=await delivery.download(principal,id.parse(url.searchParams.get('id')));
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':asset.bytes,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(people&&req.method==='GET'&&url.pathname==='/v1/people')return json(res,200,await people.list(principal,url.searchParams.get('source')||''));
      if(people&&req.method==='GET'&&url.pathname==='/v1/people/audit')return json(res,200,await people.audit(principal));
      if(people&&req.method==='POST'&&url.pathname==='/v1/people/profile')return json(res,200,await people.profile(principal,await body(req)));
      if(people&&req.method==='POST'&&url.pathname==='/v1/people/preview')return json(res,200,await people.preview(principal,await body(req)));
      if(people&&req.method==='POST'&&url.pathname==='/v1/people/apply')return json(res,200,await people.apply(principal,await body(req)));
      if (scheduling && req.method === 'POST' && url.pathname === '/v1/scheduling/commands') return json(res, 200, await scheduling.execute(principal, await body(req)));
      const scheduleMatch = /^\/v1\/teams\/([^/]+)\/scheduling(?:\/(audit)|\/personal\/([a-z][a-z0-9_]{0,63}))?$/.exec(url.pathname);
      if (scheduling && req.method === 'GET' && scheduleMatch) {
        const teamId = scheduleMatch[1];
        if (!id.safeParse(teamId).success) throw new WorkflowError(400, 'INVALID_TEAM_ID');
        if (scheduleMatch[2]) return json(res, 200, await scheduling.audit(principal, teamId));
        if (scheduleMatch[3]) return json(res, 200, await scheduling.personal(principal, teamId, scheduleMatch[3]));
        return json(res, 200, await scheduling.get(principal, teamId));
      }
      if(req.method==='GET'&&url.pathname==='/v1/week')return json(res,200,await store.week(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/facts')return json(res,200,await store.facts(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/batch-receipts')return json(res,200,await store.batchReceipts(principal));
      if(req.method==='POST'&&url.pathname==='/v1/batch-preview')return json(res,200,await store.previewBatch(principal,await body(req)));
      const historyMatch=/^\/v1\/orders\/([^/]+)\/history$/.exec(url.pathname);
      if(req.method==='GET'&&historyMatch){const before=Number(url.searchParams.get('before'));if(!Number.isSafeInteger(before)||before<1)throw new WorkflowError(400,'INVALID_CURSOR');return json(res,200,await store.history(principal,id.parse(historyMatch[1]),before));}
      if(req.method==='GET'&&url.pathname==='/v1/tasks')return json(res,200,await store.tasks(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/assignees')return json(res,200,await store.assignees(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/orders')return json(res,200,await store.list(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='POST'&&url.pathname==='/v1/intake')return json(res,200,await store.promote(principal,await body(req)));
      const detailMatch=/^\/v1\/orders\/([^/]+)\/detail$/.exec(url.pathname);
      if(req.method==='GET'&&detailMatch)return json(res,200,await store.detail(principal,id.parse(detailMatch[1])));
      if (req.method === 'POST' && url.pathname === '/v1/commands') return json(res, 200, await store.execute(principal, await body(req),typeof req.headers['x-workflow-source-evidence']==='string'?req.headers['x-workflow-source-evidence']:''));
      const match = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && match) {
        if (!id.safeParse(match[1]).success) throw new WorkflowError(400, 'INVALID_ORDER_ID');
        return json(res, 200, { order: await store.get(principal, match[1]) });
      }
      throw new WorkflowError(404, 'NOT_FOUND');
    } catch (e) {
      const known = e instanceof WorkflowError;
      if (!known && e && typeof e === 'object' && 'code' in e && ['55P03','57014','40P01'].includes(String(e.code))) return json(res, 503, { error: { code: 'RETRY_LATER' } });
      json(res, known ? e.status : e instanceof ZodError?400:500, { error: { code: known ? e.code : e instanceof ZodError?'INVALID_INPUT':'INTERNAL_ERROR' } });
    }
  });
  server.requestTimeout = delivery ? 120000 : 15000; server.headersTimeout = 10000;
  return server;
}
export { WorkflowStore } from './store';
export type { ResolveActor, ValidateAssets } from './store';
export { SchedulingStore } from './scheduling-store';
export { createBffAuthenticator, resolveDatabaseActor } from './identity';
export { SourceIdentityStore,createSourceVerifier,createMappedAuthenticator } from './source-identity';
export { PeopleStore } from './people-store';

export { DeliveryStore } from './delivery-store';

export {createSourceEvidenceVerifier} from './source-evidence';

export {PerformanceStore} from './performance-store';
