import type {ReferenceStore} from './reference-store';
import {sendWorksheetDownload} from './source-worksheet-download';
import {PreflightStore} from './preflight-store';
import {PublicationFiles,publicationFileQuery,publicationFileId} from './publication-files';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { id, WorkflowError, type Principal } from './contracts';
import type { WorkflowStore } from './store';
import type { SchedulingStore } from './scheduling-store';
import type { SourceIdentityStore,SourceAuthenticate } from './source-identity';
import type { PeopleStore } from './people-store';
import type {FormalImportStore} from './formal-import-store';
import type {NotificationStore} from './notification-store';
import type {RoutingStore} from './routing-store';
import type {PerformanceStore} from './performance-store';
import type { DeliveryStore } from './delivery-store';
import {FormValidationError} from './form-validation';
import type {MultipartStore} from './multipart-store';
import {PART_BYTES,MAX_MULTIPART_BYTES} from './multipart-contracts';
import {z} from 'zod';
// Adapter verifies short-lived BFF authentication (issuer, audience, expiry, signature),
// NOT x-user/x-enterprise headers or a caller-supplied permissions array.
export type Authenticate = (request: IncomingMessage) => Promise<Principal | null>;
export function createWorkflowPool(connectionString:string){return new Pool({connectionString,max:4});}
function json(res: ServerResponse, status: number, value: unknown) {
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function readUntilDisconnect<T>(req:IncomingMessage,res:ServerResponse,read:(signal:AbortSignal)=>Promise<T>){
  const controller=new AbortController(),abort=()=>controller.abort();
  req.once('aborted',abort);res.once('close',abort);
  try{if(req.aborted||res.destroyed)abort();controller.signal.throwIfAborted();return await read(controller.signal);}
  finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
}
async function body(req: IncomingMessage,limit=128*1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new WorkflowError(415, 'JSON_REQUIRED');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new WorkflowError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorkflowError(400, 'INVALID_JSON'); }
}
export function createWorkflowServer(store: WorkflowStore, authenticate: Authenticate, scheduling?: SchedulingStore, identity?:{store:SourceIdentityStore;authenticate:SourceAuthenticate},people?:PeopleStore,delivery?:DeliveryStore,performance?:PerformanceStore,routing?:RoutingStore,notifications?:NotificationStore,imports?:FormalImportStore,references?:ReferenceStore,uploads?:MultipartStore) {
  const publicationFiles=delivery?new PublicationFiles(store.publications,delivery):undefined;
  const preflights=delivery?new PreflightStore(store.publications,delivery):undefined;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://workflow.internal');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'alive', service: 'enterprise-workflow', stage: 'foundation' });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        try { await store.ready(); if (scheduling) await scheduling.ready(); if(performance)await performance.ready();if(routing)await routing.ready();if(notifications)await notifications.ready(); } catch { throw new WorkflowError(503, 'NOT_READY'); }
        return json(res, 200, { status: 'ready', schemaVersion: scheduling ? 2 : 1 });
      }
      if(identity&&req.method==='GET'&&url.pathname==='/v1/identity/workspaces'){
        const source=await identity.authenticate(req);if(!source)throw new WorkflowError(401,'AUTH_REQUIRED');
        return json(res,200,await identity.store.workspaces(source));
      }
      const principal = await authenticate(req);
      if (!principal) throw new WorkflowError(401, 'AUTH_REQUIRED');
      if (!id.safeParse(principal.enterpriseId).success || !principal.subject) throw new WorkflowError(401, 'INVALID_IDENTITY');
      if(url.pathname==='/v1/publication-preflight'){if(!preflights)throw new WorkflowError(503,'PREFLIGHT_NOT_CONFIGURED');if(req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>preflights.read(principal,Object.fromEntries(url.searchParams),signal)));if(req.method==='POST'){if(url.search)throw new WorkflowError(400,'INVALID_PREFLIGHT_QUERY');return json(res,200,await preflights.execute(principal,await body(req)));}throw new WorkflowError(405,'METHOD_NOT_ALLOWED');}
      if(url.pathname==='/v1/publication-files'){
        if(!publicationFiles)throw new WorkflowError(503,'PUBLICATION_FILES_NOT_CONFIGURED');
        const raw=Object.fromEntries(url.searchParams);
        if(req.method==='POST'){
          if(raw.action==='scan'){const q=z.strictObject({action:z.literal('scan'),publicationId:publicationFileId,id:publicationFileId}).parse(raw);z.strictObject({}).parse(await body(req));return json(res,200,await publicationFiles.rescan(principal,q.publicationId,q.id));}
          if(req.headers['content-type']!=='application/octet-stream')throw new WorkflowError(415,'BINARY_REQUIRED');if(Number(req.headers['content-length']||0)>16*1024*1024)throw new WorkflowError(413,'ASSET_TOO_LARGE');return json(res,200,await publicationFiles.upload(principal,raw,req));
        }
        if(req.method!=='GET')throw new WorkflowError(405,'METHOD_NOT_ALLOWED');const q=publicationFileQuery.parse(raw);
        if(q.action==='list')return json(res,200,await publicationFiles.list(principal,q.publicationId,q.page));
        if(q.action==='scan-history')return json(res,200,await publicationFiles.scanHistory(principal,q.publicationId,q.id,q.page));
        const controller=new AbortController();req.once('aborted',()=>controller.abort());res.once('close',()=>controller.abort());
        const {asset,stream}=q.action==='package'?await publicationFiles.package(principal,q.publicationId,q.expectedVersion,controller.signal):await publicationFiles.download(principal,q.publicationId,q.id);
        if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'Content-Type':q.action==='package'?'application/zip':'application/octet-stream','Content-Length':asset.bytes,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(req.method==='GET'&&url.pathname==='/v1/availability/members')return json(res,200,await store.availability.members(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/availability')return json(res,200,await store.availability.get(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/availability/history')return json(res,200,await store.availability.history(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='POST'&&url.pathname==='/v1/availability/preview')return json(res,200,await store.availability.preview(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/availability/save')return json(res,200,await store.availability.save(principal,await body(req)));
      if(url.pathname==='/v1/uploads'){
        if(!uploads)throw new WorkflowError(503,'MULTIPART_NOT_ENABLED');
        if(req.method==='GET'){
          const q=Object.fromEntries(url.searchParams);
          if(q.action==='status'){const c=z.strictObject({action:z.literal('status'),id}).parse(q);return json(res,200,await uploads.get(principal,c.id));}
          const c=z.strictObject({action:z.literal('list'),orderId:id,taskId:id,page:z.coerce.number().int().min(1).max(10000).optional()}).parse(q);const {action,...query}=c;return json(res,200,await uploads.list(principal,query));
        }
        if(req.method==='PUT'){
          const q=z.strictObject({id,part:z.coerce.number().int().min(0).max(127)}).parse(Object.fromEntries(url.searchParams));
          if(req.headers['content-type']!=='application/octet-stream')throw new WorkflowError(415,'BINARY_REQUIRED');
          if(Number(req.headers['content-length']||0)>PART_BYTES)throw new WorkflowError(413,'PART_SIZE_MISMATCH');
          return json(res,200,await uploads.put(principal,q.id,q.part,req));
        }
        if(req.method==='POST'){
          if(url.search)throw new WorkflowError(400,'INVALID_UPLOAD_QUERY');const c=await body(req);
          if(c?.operation==='create'){const {operation,...input}=c;return json(res,200,await uploads.create(principal,input));}
          const q=z.discriminatedUnion('operation',[z.strictObject({operation:z.literal('complete'),id,expectedVersion:z.number().int().positive()}),z.strictObject({operation:z.literal('cancel'),id}),z.strictObject({operation:z.literal('cleanup'),id})]).parse(c);
          return json(res,200,q.operation==='complete'?await uploads.complete(principal,q.id,q.expectedVersion):q.operation==='cancel'?await uploads.cancel(principal,q.id):await uploads.cleanup(principal,q.id));
        }
        throw new WorkflowError(405,'METHOD_NOT_ALLOWED');
      }
      if(references&&req.method==='GET'&&url.pathname==='/v1/references/library')return json(res,200,await references.library(principal,Object.fromEntries(url.searchParams)));
      if(references&&req.method==='GET'&&url.pathname==='/v1/references')return json(res,200,await references.list(principal,id.parse(url.searchParams.get('orderId'))));
      if(references&&req.method==='GET'&&url.pathname==='/v1/references/file'){
        const {asset,stream,mime,inline}=await references.file(principal,id.parse(url.searchParams.get('orderId')),url.searchParams.get('id')||'',url.searchParams.get('download')==='1');
        if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'Content-Type':mime,'Content-Length':asset.bytes,'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(imports&&url.pathname.startsWith('/v1/imports/worksheet')){
        const source=url.searchParams.get('source')||'',sheet=imports.worksheet;
        if(req.method==='GET'&&url.pathname==='/v1/imports/worksheet')return json(res,200,await sheet.read(principal,source));
        if(req.method==='GET'&&url.pathname==='/v1/imports/worksheet-audit')return json(res,200,await sheet.history(principal,source,Number(url.searchParams.get('before')||2147483647)));
        if(req.method==='POST'&&url.pathname==='/v1/imports/worksheet-command')return json(res,200,await sheet.execute(principal,source,await body(req)));
        if(req.method==='POST'&&url.pathname==='/v1/imports/worksheet-upload')return json(res,200,await sheet.upload(principal,source,await body(req,6*1024*1024)));
        if(req.method==='GET'&&url.pathname==='/v1/imports/worksheet-file'){await sendWorksheetDownload(req,res,url.searchParams.get('download')==='1',signal=>sheet.file(principal,source,url.searchParams.get('id')||'',signal));return;}
        throw new WorkflowError(405,'METHOD_NOT_ALLOWED');
      }
      if(imports&&req.method==='GET'&&url.pathname==='/v1/imports/context')return json(res,200,await imports.context(principal));
      if(imports&&req.method==='GET'&&url.pathname==='/v1/imports/rows')return json(res,200,await imports.rows(principal,url.searchParams.get('source')||''));
      if(imports&&req.method==='POST'&&url.pathname==='/v1/imports/resolve')return json(res,200,await imports.confirm(principal,url.searchParams.get('source')||'',await body(req)));
      if(imports&&req.method==='GET'&&url.pathname==='/v1/imports/asset'){
        const {asset,stream,mime,inline}=await imports.asset(principal,url.searchParams.get('source')||'',url.searchParams.get('id')||'',url.searchParams.get('download')==='1');
        if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'Content-Type':mime,'Content-Length':asset.bytes,'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(notifications&&url.pathname==='/v1/notifications'){await notifications.ready();if(req.method==='GET')return json(res,200,await notifications.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST')return json(res,200,await notifications.execute(principal,await body(req)));}
      if(routing&&url.pathname==='/v1/routing'){await routing.ready();if(req.method==='GET')return json(res,200,await routing.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST')return json(res,200,await routing.execute(principal,await body(req)));}
      if(routing&&req.method==='POST'&&url.pathname==='/v1/routing/resolve'){await routing.ready();return json(res,200,await routing.resolve(principal,await body(req)));}
      if(performance&&url.pathname==='/v1/performance-corrections'){if(req.method==='GET')return json(res,200,await performance.corrections.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST'){const c=await body(req);return json(res,200,c.operation==='preview'?await performance.corrections.preview(principal,c):await performance.corrections.execute(principal,c));}}
      if(performance&&url.pathname==='/v1/performance'){await performance.ready();if(req.method==='GET')return json(res,200,await performance.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST')return json(res,200,await performance.execute(principal,await body(req)));}
      if(url.pathname.startsWith('/v1/demand-files/')){
        const files=store.demandAssets;if(!files)throw new WorkflowError(503,'DEMAND_ASSETS_NOT_ENABLED');
        const path=url.pathname.slice('/v1/demand-files/'.length);
        if(path==='assets'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>files.list(principal,Object.fromEntries(url.searchParams),signal)));
        if(path==='scan-history'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>files.scanHistory(principal,id.parse(url.searchParams.get('id')),{page:url.searchParams.get('page')||'1'},signal)));
        if(path==='scan'&&req.method==='POST')return json(res,200,await files.rescan(principal,id.parse((await body(req)).assetId)));
        if(path==='upload'&&req.method==='POST'){if(req.headers['content-type']!=='application/octet-stream')throw new WorkflowError(415,'BINARY_REQUIRED');if(Number(req.headers['content-length']||0)>files.maxBytes)throw new WorkflowError(413,'ASSET_TOO_LARGE');return json(res,200,await files.upload(principal,Object.fromEntries(url.searchParams),req));}
        if(['download','preview'].includes(path)&&req.method==='GET'){const assetId=id.parse(url.searchParams.get('id'));const {asset,stream,mime}=await readUntilDisconnect(req,res,signal=>path==='preview'?files.preview(principal,assetId,signal):files.download(principal,assetId,signal));if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'Content-Type':mime,'Content-Length':asset.bytes,'Content-Disposition':(path==='preview'?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;}
      }
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/library')return json(res,200,await delivery.library(principal,Object.fromEntries(url.searchParams)));
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/preview'){const {asset,stream,mime}=await readUntilDisconnect(req,res,signal=>delivery.preview(principal,id.parse(url.searchParams.get('id')),signal));if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'Content-Type':mime,'Content-Length':asset.bytes,'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;}
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/assets')return json(res,200,{...await readUntilDisconnect(req,res,signal=>delivery.list(principal,Object.fromEntries(url.searchParams),signal)),multipart:{enabled:!!uploads,partBytes:PART_BYTES,maxBytes:MAX_MULTIPART_BYTES}});
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/scan-history')return json(res,200,await readUntilDisconnect(req,res,signal=>delivery.scanHistory(principal,id.parse(url.searchParams.get('id')),{page:url.searchParams.get('page')||'1'},signal)));
      if(delivery&&req.method==='POST'&&url.pathname==='/v1/delivery/scan'){const q=await body(req);return json(res,200,await delivery.rescan(principal,id.parse(q.assetId)));}
      if(delivery&&req.method==='POST'&&url.pathname==='/v1/delivery/upload'){
        if(req.headers['content-type']!=='application/octet-stream')throw new WorkflowError(415,'BINARY_REQUIRED');
        if(Number(req.headers['content-length']||0)>delivery.maxBytes)throw new WorkflowError(413,'ASSET_TOO_LARGE');
        return json(res,200,await delivery.upload(principal,Object.fromEntries(url.searchParams),req));
      }
      if(delivery&&req.method==='GET'&&url.pathname==='/v1/delivery/download'){
        const {asset,stream}=await readUntilDisconnect(req,res,signal=>delivery.download(principal,id.parse(url.searchParams.get('id')),signal));
        if(res.destroyed){stream.destroy();return;}
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':asset.bytes,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(people&&req.method==='GET'&&url.pathname==='/v1/people')return json(res,200,await people.list(principal,url.searchParams.get('source')||''));
      if(people&&req.method==='GET'&&url.pathname==='/v1/people/audit')return json(res,200,await people.audit(principal));
      if(people&&req.method==='POST'&&url.pathname==='/v1/people/roster-preview')return json(res,200,await people.rosterPreview(principal,await body(req)));
      if(people&&req.method==='POST'&&url.pathname==='/v1/people/roster-apply')return json(res,200,await people.rosterApply(principal,await body(req)));
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
      if(req.method==='GET'&&url.pathname==='/v1/dashboard')return json(res,200,await store.dashboard(principal,Object.fromEntries(url.searchParams)));
      if(url.pathname==='/v1/capacity'){if(req.method==='GET')return json(res,200,await store.capacity.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST'){const c=await body(req);const q=z.strictObject({operation:z.enum(['preview','save']),input:z.unknown()}).parse(c);return json(res,200,q.operation==='preview'?await store.capacity.preview(principal,q.input):await store.capacity.save(principal,q.input));}}
      if(url.pathname==='/v1/sla'){if(req.method==='GET')return json(res,200,await store.sla.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST'){const c=await body(req);const q=z.strictObject({operation:z.enum(['preview','save']),input:z.unknown()}).parse(c);return json(res,200,q.operation==='preview'?await store.sla.preview(principal,q.input):await store.sla.save(principal,q.input));}}
      if(url.pathname==='/v1/delivery-reviews'){if(req.method==='GET')return json(res,200,await store.reviews.read(principal,Object.fromEntries(url.searchParams)));if(req.method==='POST')return json(res,200,await store.reviews.execute(principal,await body(req)));}
      if(url.pathname==='/v1/publications'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>store.publications.read(principal,Object.fromEntries(url.searchParams),signal)));
      if(url.pathname==='/v1/publications'&&req.method==='POST'){const {operation,...c}=await body(req);if(operation!=='preview'&&operation!=='command')throw new WorkflowError(400,'INVALID_PUBLICATION_OPERATION');return json(res,200,operation==='preview'?await readUntilDisconnect(req,res,signal=>store.publications.preview(principal,c,signal)):await store.publications.execute(principal,c));}
      if(url.pathname==='/v1/guidelines'&&req.method==='GET')return json(res,200,await store.guidelines.read(principal,Object.fromEntries(url.searchParams)));
      if(url.pathname==='/v1/guidelines'&&req.method==='POST')return json(res,200,await store.guidelines.execute(principal,await body(req)));
      if(url.pathname==='/v1/projects'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>store.projects.read(principal,Object.fromEntries(url.searchParams),signal)));
      if(url.pathname==='/v1/projects'&&req.method==='POST'){const {operation,...c}=await body(req);if(operation!=='preview'&&operation!=='apply')throw new WorkflowError(400,'INVALID_PROJECT_OPERATION');return json(res,200,operation==='preview'?await readUntilDisconnect(req,res,signal=>store.projects.preview(principal,c,signal)):await store.projects.execute(principal,c));}
      if(url.pathname==='/v1/appeals'&&req.method==='GET')return json(res,200,await store.appeals.read(principal,Object.fromEntries(url.searchParams)));
      if(url.pathname==='/v1/appeals'&&req.method==='POST')return json(res,200,await store.appeals.execute(principal,await body(req)));
      if(url.pathname==='/v1/worklogs'&&req.method==='GET')return json(res,200,await store.worklogs.read(principal,Object.fromEntries(url.searchParams)));
      if(url.pathname==='/v1/worklogs'&&req.method==='POST')return json(res,200,await store.worklogs.execute(principal,await body(req)));
      if(url.pathname==='/v1/demand-batches'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>store.demandBatches.read(principal,Object.fromEntries(url.searchParams),signal)));
      if(url.pathname==='/v1/demand-batches/preview'&&req.method==='POST'){const input=await body(req,512*1024);return json(res,200,await readUntilDisconnect(req,res,signal=>store.demandBatches.preview(principal,input,signal)));}
      if(url.pathname==='/v1/demand-batches/apply'&&req.method==='POST')return json(res,200,await store.demandBatches.apply(principal,await body(req,512*1024)));
      if(url.pathname==='/v1/demand-forms'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>store.forms.read(principal,Object.fromEntries(url.searchParams),signal)));
      if(url.pathname==='/v1/demand-forms'&&req.method==='POST')return json(res,200,await store.forms.execute(principal,await body(req)));
      if(url.pathname==='/v1/catalog'&&req.method==='GET')return json(res,200,await readUntilDisconnect(req,res,signal=>store.catalog.read(principal,Object.fromEntries(url.searchParams),signal)));
      if(url.pathname==='/v1/catalog/preview'&&req.method==='POST'){const input=await body(req);return json(res,200,await readUntilDisconnect(req,res,signal=>store.catalog.preview(principal,input,signal)));}
      if(url.pathname==='/v1/catalog/apply'&&req.method==='POST')return json(res,200,await store.catalog.apply(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/plan-move/preview')return json(res,200,await store.movePreview(principal,await body(req)));
      if(req.method==='GET'&&url.pathname==='/v1/week')return json(res,200,await store.week(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/facts')return json(res,200,await store.facts(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/batch-receipts')return json(res,200,await store.batchReceipts(principal));
      if(req.method==='GET'&&url.pathname==='/v1/calendar')return json(res,200,await store.calendars.get(principal));
      if(req.method==='GET'&&url.pathname==='/v1/calendar/history')return json(res,200,await store.calendars.history(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='POST'&&url.pathname==='/v1/calendar/preview')return json(res,200,await store.calendars.preview(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/calendar/save')return json(res,200,await store.calendars.save(principal,await body(req)));
      if(req.method==='GET'&&url.pathname==='/v1/batches')return json(res,200,await store.listBatches(principal,Object.fromEntries(url.searchParams)));
      if(req.method==='GET'&&url.pathname==='/v1/batch')return json(res,200,await store.getBatch(principal,id.parse(url.searchParams.get('id'))));
      if(req.method==='POST'&&url.pathname==='/v1/batch-plan')return json(res,200,await store.planBatch(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/batch-run')return json(res,200,await store.runBatch(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/batch-close')return json(res,200,await store.closeBatch(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/pause-preview')return json(res,200,await store.previewPause(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/cancellation-preview')return json(res,200,await store.previewCancellation(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/change-preview')return json(res,200,await store.previewChange(principal,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/batch-preview')return json(res,200,await store.previewBatch(principal,await body(req)));
      const historyMatch=/^\/v1\/orders\/([^/]+)\/history$/.exec(url.pathname);
      if(req.method==='GET'&&historyMatch){const before=Number(url.searchParams.get('before'));if(!Number.isSafeInteger(before)||before<1)throw new WorkflowError(400,'INVALID_CURSOR');return json(res,200,await store.history(principal,id.parse(historyMatch[1]),before));}
      if(req.method==='GET'&&url.pathname==='/v1/handover-candidates')return json(res,200,await store.handoverCandidates(principal,Object.fromEntries(url.searchParams)));
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
      if(e instanceof FormValidationError)return json(res,e.status,{error:{code:e.code,fields:e.fields}});
      const known = e instanceof WorkflowError;
      if (!known && e && typeof e === 'object' && 'code' in e && ['55P03','57014','40P01','40001'].includes(String(e.code))) return json(res, 503, { error: { code: 'RETRY_LATER' } });
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
export { MultipartStore } from './multipart-store';

export {createSourceEvidenceVerifier} from './source-evidence';

export {PerformanceStore} from './performance-store';

export {RoutingStore} from './routing-store';

export {NotificationStore} from './notification-store';

export {FormalImportStore} from './formal-import-store';

export {ReferenceStore} from './reference-store';

export {DemandAssetStore} from './demand-asset-store';
