import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import JSZip from 'jszip';
import { getPool } from '../src/lib/db';
import { closeDatabasePools } from '../src/lib/db/connection';
import { ensureCollaborationSchema } from '../src/lib/collaboration/schema';
import { signUserSession } from '../src/lib/native-auth';
import { collaborationEventHub, CollaborationEventHub } from '../src/lib/collaboration/events';
import { cleanupCollaborationUploads } from '../src/lib/collaboration/uploads';
import { collaborationStorage } from '../src/lib/collaboration/private-storage';
import { withCollaborationScope } from '../src/lib/enterprise/collaboration-access';
import { encodeCursor } from '../src/lib/collaboration/validation';
import { signSession } from '../src/lib/admin-auth';
import { storageConfiguration } from '../src/lib/object-storage/config';
import { createObjectStorage } from '../src/lib/object-storage/adapter';
import * as bootstrap from '../src/app/api/collaboration/bootstrap/route';
import * as members from '../src/app/api/collaboration/members/route';
import * as conversations from '../src/app/api/collaboration/conversations/route';
import * as conversation from '../src/app/api/collaboration/conversations/[id]/route';
import * as messages from '../src/app/api/collaboration/conversations/[id]/messages/route';
import * as read from '../src/app/api/collaboration/conversations/[id]/read/route';
import * as withdraw from '../src/app/api/collaboration/messages/[id]/withdraw/route';
import * as forward from '../src/app/api/collaboration/forward/route';
import * as presence from '../src/app/api/collaboration/presence/route';
import * as events from '../src/app/api/collaboration/events/route';
import * as uploads from '../src/app/api/collaboration/uploads/route';
import * as upload from '../src/app/api/collaboration/uploads/[id]/route';
import * as complete from '../src/app/api/collaboration/uploads/[id]/complete/route';
import * as attachment from '../src/app/api/collaboration/attachments/[id]/route';
import { GET as publicMedia } from '../src/app/media/[...path]/route';

const routes: Array<[RegExp, object]> = [
  [/^bootstrap$/, bootstrap], [/^members$/, members], [/^conversations$/, conversations], [/^conversations\/([^/]+)$/, conversation],
  [/^conversations\/([^/]+)\/messages$/, messages], [/^conversations\/([^/]+)\/read$/, read], [/^messages\/([^/]+)\/withdraw$/, withdraw],
  [/^forward$/, forward], [/^presence$/, presence], [/^events$/, events], [/^uploads$/, uploads], [/^uploads\/([^/]+)$/, upload],
  [/^uploads\/([^/]+)\/complete$/, complete], [/^attachments\/([^/]+)$/, attachment],
];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== '127.0.0.1') throw Error(`TEST_NETWORK_FENCE:${url.hostname}`);
  return originalFetch(input, init);
}) as typeof fetch;
let checks = 0, servers: Server[] = [], children: ChildProcess[] = [];
const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function startHttp() {
  const server = createServer(async (req, res) => {
    const abort = new AbortController(); req.once('aborted', () => abort.abort()); res.once('close', () => abort.abort());
    try {
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}${req.url}`;
      if (req.url === '/__fixture_stats') {
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ streams: collaborationEventHub.size,
          clients: getPool().totalCount, idle: getPool().idleCount, waiting: getPool().waitingCount })); return;
      }
      const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(url, { method: req.method, headers, signal: abort.signal,
        ...(!['GET','HEAD'].includes(req.method!) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) } as RequestInit);
      let response: Response | undefined;
      const pathname = new URL(url).pathname;
      if (pathname.startsWith('/media/')) response = await publicMedia(request, { params: Promise.resolve({ path: pathname.slice(7).split('/') }) });
      else for (const [pattern, handlers] of routes) {
        const match = pattern.exec(pathname.replace(/^\/api\/collaboration\//, ''));
        if (match) { const handler = (handlers as Record<string, Function>)[req.method!];
          response = handler ? await handler(request, { params: Promise.resolve({ id: match[1] }) }) : new Response(null, { status: 405 }); break; }
      }
      response ||= new Response(null, { status: 404 });
      if (req.headers['x-fixture-drop-ack'] === '1' && response.status === 200) { await response.body?.cancel(); res.destroy(); return; }
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v)); res.flushHeaders();
      if (!response.body) { res.end(); return; }
      const reader = response.body.getReader(); const cancel = () => { void reader.cancel().catch(() => {}); }; abort.signal.addEventListener('abort', cancel, { once: true });
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; if (!res.write(Buffer.from(chunk.value))) await once(res, 'drain', { signal: abort.signal }); }
        res.end();
      } finally { abort.signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (error) { if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); } else res.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function startChild() {
  const child = spawn(process.execPath, ['--conditions=react-server', __filename, '--instance'], { env: process.env, windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] });
  children.push(child); child.stderr!.on('data', b => process.stderr.write(b));
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Instance startup timeout')), 30000);
    child.once('message', (message: { origin: string }) => { clearTimeout(timer); resolve(message.origin); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Instance early exit ${code}`)); });
  });
  return { child, origin };
}
async function stopChild(child: ChildProcess) { if (child.exitCode !== null) return; const exited = once(child, 'exit'); child.send('stop'); await exited; }
async function stopServers() { collaborationEventHub.close(); for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } await closeDatabasePools(); }

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_COLLABORATION, '1'); assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1');
  if (process.argv.includes('--instance')) {
    await ensureCollaborationSchema(); const origin = await startHttp(); process.send!({ origin });
    process.once('message', async () => { await stopServers(); process.disconnect!(); }); return;
  }
  try {
    await ensureCollaborationSchema();
    const pool = getPool(), e = randomUUID(), foreign = randomUUID(), role = randomUUID();
    const a = 'a@fixture.invalid', b = 'b@fixture.invalid', c = 'c@fixture.invalid', d = 'd@fixture.invalid', owner = 'owner@fixture.invalid', x = 'x@fixture.invalid', outsider = 'admin@fixture.invalid';
    for (const email of [a,b,c,d,owner,x,outsider,'owner2@fixture.invalid','personal@fixture.invalid'])
      await pool.query(`INSERT INTO app_users(email,name,renews_at,role) VALUES($1,$2,now()+interval '1 year',$3)`, [email, email.split('@')[0], email === outsider ? 'admin' : 'user']);
    for (const [enterprise, boss] of [[e, owner], [foreign, 'owner2@fixture.invalid']]) {
      await pool.query(`INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'fixture enterprise',$2,now()+interval '1 year')`, [enterprise,boss]);
      await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)', [enterprise]);
      await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')", [boss]);
    }
    await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'设计师',10,false,false)", [e,role]);
    for (const email of [a,b,c,d]) await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')", [e,email,owner,role]);
    await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,'owner2@fixture.invalid','permanent')", [foreign,x]);
    await pool.query('CREATE TABLE fixture_share_port(id uuid PRIMARY KEY,enterprise_id uuid,author_id text,requester_id text)');
    const origin = await startHttp(); let second = await startChild();
    const cookie = (actor: string) => `nv_user=${signUserSession(actor, Date.now())}`;
    async function call(path: string, actor: string | null = a, method = 'GET', data?: unknown, expected = 200, base = origin, extra: Record<string,string> = {}) {
      const sep = path.includes('?') ? '&' : '?'; const url = `${base}/api/collaboration/${path}${sep}enterpriseId=${e}`;
      const response = await fetch(url, { method, headers: { ...(actor ? { cookie: cookie(actor) } : {}), ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...extra },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
      const value = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`); return value as any;
    }
    const boot = await call('bootstrap', a); assert.equal(boot.members.length,5); assert.ok(boot.members.every((m: any) => !('phone' in m) && !('note' in m)));
    assert.equal(boot.limits.chunkBytes,65536); assert.equal(boot.actorId,a);
    const emptyResponse = await fetch(`${origin}/api/collaboration/bootstrap`, { headers: { cookie: cookie('personal@fixture.invalid') } }); assert.deepEqual((await emptyResponse.json()).enterprises,[]);
    await call('members', null, 'GET', undefined,401); await call('members', outsider,'GET',undefined,403); await call('members',x,'GET',undefined,403);
    const platformOnly=await fetch(`${origin}/api/collaboration/members?enterpriseId=${e}`,{headers:{cookie:`nv_admin=${signSession(Date.now())}`}});assert.equal(platformOnly.status,401);await platformOnly.body?.cancel();
    await call('conversations', a,'POST',{clientId:'bad-origin',kind:'direct',memberIds:[b]},403,origin,{origin:'https://foreign.invalid'});
    await call('conversations', a,'POST',{clientId:'forged',kind:'direct',memberIds:[x]},403);
    pass('directory ordinary employee without view_records; empty personal bootstrap; cross-enterprise/admin/origin/forged identity denied');

    for (const [sql,undo] of [
      ["UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1", "UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1"],
      ["UPDATE app_enterprise_members SET membership_expires_at=now()-interval '1 minute' WHERE email=$1", "UPDATE app_enterprise_members SET membership_expires_at=NULL WHERE email=$1"],
    ]) { await pool.query(sql,[b]); await call('members',b,'GET',undefined,403); await pool.query(undo,[b]); }
    await pool.query('UPDATE app_users SET banned=true WHERE email=$1',[b]); await call('members',b,'GET',undefined,401); await pool.query('UPDATE app_users SET banned=false WHERE email=$1',[b]);
    await pool.query("UPDATE app_users SET account_expires_at=now()-interval '1 second' WHERE email=$1",[b]); await call('members',b,'GET',undefined,401); await pool.query('UPDATE app_users SET account_expires_at=NULL WHERE email=$1',[b]);
    await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]); await call('members',a,'GET',undefined,403); await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[owner]);
    await pool.query("INSERT INTO app_tenant_entitlements(tenant_id,feature_policy,updated_by) VALUES($1,'{\"team\":false}','fixture')",[e]); await call('members',a,'GET',undefined,403); await pool.query('DELETE FROM app_tenant_entitlements WHERE tenant_id=$1',[e]);
    await pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[]')",[b]);await call('members',b,'GET',undefined,403);await pool.query('DELETE FROM app_feature_access WHERE email=$1',[b]);
    pass('membership suspension/expiry, account ban/expiry, owner grant, tenant entitlement enforced live');

    const [da,db] = await Promise.all([call('conversations',a,'POST',{clientId:'direct-a',kind:'direct',memberIds:[b]}),call('conversations',b,'POST',{clientId:'direct-b',kind:'direct',memberIds:[a]},200,second.origin)]);
    const direct = da.conversation.id; assert.equal(db.conversation.id,direct);
    const sent = await Promise.all(Array.from({length:6},(_,i)=>call(`conversations/${direct}/messages`,a,'POST',{clientId:'fixed-id',body:'durable message'},200,i%2?second.origin:origin)));
    assert.equal(new Set(sent.map(r=>r.message.id)).size,1);
    await call(`conversations/${direct}/messages`,a,'POST',{clientId:'fixed-id',body:'different'},409);
    const other = await call(`conversations/${direct}/messages`,b,'POST',{clientId:'fixed-id',body:'second sender'},200,second.origin); assert.notEqual(other.message.id,sent[0].message.id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_collab_messages WHERE conversation_id=$1',[direct])).rows[0].n,2);
    await stopChild(second.child); second = await startChild();
    assert.equal((await call(`conversations/${direct}/messages`,b,'GET',undefined,200,second.origin)).items.length,2);
    assert.equal((await call(`conversations/${direct}/messages`,a,'POST',{clientId:'fixed-id',body:'durable message'},200,second.origin)).message.id,sent[0].message.id);
    pass('two-process direct dedupe; six concurrent same-client sends; sender scoping; payload conflict; durable restart retry');

    const lostId='lost-http-ack';
    await assert.rejects(fetch(`${origin}/api/collaboration/conversations/${direct}/messages?enterpriseId=${e}`,{method:'POST',headers:{cookie:cookie(a),'content-type':'application/json','x-fixture-drop-ack':'1'},body:JSON.stringify({clientId:lostId,body:'ACK unknown is durable'})}));
    const recovered=(await call(`conversations/${direct}/messages`,a,'POST',{clientId:lostId,body:'ACK unknown is durable'},200,second.origin)).message;
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_collab_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_id=$3',[direct,a,lostId])).rows[0].n,1);assert.ok(recovered.id);
    pass('real HTTP response loss after commit; retry identical clientId recovers one durable message');

    const state = await call('conversations',b); assert.equal(state.items.find((r:any)=>r.id===direct).unread,2);
    await call(`conversations/${direct}/read`,b,'POST',{messageId:other.message.id}); await call(`conversations/${direct}/read`,b,'POST',{messageId:sent[0].message.id});
    assert.equal((await call('conversations',b)).items.find((r:any)=>r.id===direct).lastReadMessageId,other.message.id);
    await call(`conversations/${direct}`,a,'PATCH',{pinned:true,muted:true}); assert.equal((await call('conversations',a)).items.find((r:any)=>r.id===direct).muted,true);
    await call(`conversations/${direct}/messages`,a,'POST',{clientId:'reply',body:'**你好** <script>not executed by server</script>',replyTo:other.message.id,mentionIds:[b]});
    await call(`conversations/${direct}/messages`,a,'POST',{clientId:'bad-mention',body:'hello',mentionIds:[c]},403);
    pass('monotone read cursor, unread, pinned/muted, reply and current-participant mentions');

    const group = (await call('conversations',a,'POST',{clientId:'group',kind:'group',memberIds:[b],title:'协作群'})).conversation.id;
    assert.equal((await call('conversations',a,'POST',{clientId:'group',kind:'group',memberIds:[b],title:'协作群'})).conversation.id,group);
    const beforeJoin = (await call(`conversations/${group}/messages`,a,'POST',{clientId:'before',body:'secret before join'})).message;
    await call(`conversations/${group}`,b,'PATCH',{addMemberIds:[c]},403);
    await call(`conversations/${group}`,a,'PATCH',{addMemberIds:[c]}); assert.equal((await call(`conversations/${group}/messages`,c)).items.length,0);
    await call(`conversations/${group}/messages`,c,'POST',{clientId:'guess-reply',body:'guess',replyTo:beforeJoin.id},404);
    const during = (await call(`conversations/${group}/messages`,b,'POST',{clientId:'during',body:'visible during membership'})).message;
    assert.equal((await call(`conversations/${group}/messages`,c)).items[0].id,during.id);
    await call(`conversations/${group}`,c,'PATCH',{leave:true}); await call(`conversations/${group}/messages`,c,'GET',undefined,404);
    await call(`conversations/${group}`,a,'PATCH',{addMemberIds:[c]}); assert.equal((await call(`conversations/${group}/messages`,c)).items.length,0);
    await call(`conversations/${group}/messages`,a,'POST',{clientId:'after-rejoin',body:'reply hides old reference',replyTo:beforeJoin.id});
    assert.equal((await call(`conversations/${group}/messages`,c)).items[0].replyTo,null);
    pass('group owner controls; join/leave/rejoin history interval; old reply reference redaction');

    for(let n=0;n<53;n++)await call(`conversations/${direct}/messages`,a,'POST',{clientId:`page-${n}`,body:`searchable needle ${n}`});
    const p1=await call(`conversations/${direct}/messages?q=needle`,b),p2=await call(`conversations/${direct}/messages?q=needle&cursor=${encodeURIComponent(p1.nextCursor)}`,b);
    assert.equal(p1.items.length,50);assert.equal(p2.items.length,3);assert.equal(new Set([...p1.items,...p2.items].map((m:any)=>m.id)).size,53);
    await call(`conversations/${direct}/messages?q=other&cursor=${encodeURIComponent(p1.nextCursor)}`,b,'GET',undefined,400);
    pass('stable opaque cursor search pages 50+3; query-bound cursor rejection');

    await call('presence',a,'POST',{sessionId:'tab-one',state:'online'}); await call('presence',a,'POST',{sessionId:'tab-two',state:'away'});
    const stateOf=async()=> (await call('members',b)).items.find((m:any)=>m.id===a).presence;
    assert.equal(await stateOf(),'online');await call('presence',a,'POST',{sessionId:'tab-one',state:'offline'});assert.equal(await stateOf(),'away');
    await pool.query("UPDATE app_collab_presence SET expires_at=now()-interval '1 second' WHERE actor_id=$1",[a]);assert.equal(await stateOf(),'offline');
    pass('presence multi-tab merge and TTL expiry');

    async function openEvents(base:string, cursor:string) {
      const abort=new AbortController(); const response=await fetch(`${base}/api/collaboration/events?enterpriseId=${e}&cursor=${encodeURIComponent(cursor)}`,{headers:{cookie:cookie(b)},signal:abort.signal});assert.equal(response.status,200);
      const reader=response.body!.getReader();let content='';
      return {abort,reader,async next(predicate:(data:any)=>boolean){const until=Date.now()+7000;while(Date.now()<until){const result=await Promise.race([reader.read(),wait(7000).then(()=>{throw Error('SSE timeout')})]);if(result.done)throw Error('SSE ended');content+=new TextDecoder().decode(result.value);let pos;while((pos=content.indexOf('\n\n'))>=0){const block=content.slice(0,pos);content=content.slice(pos+2);const line=block.split('\n').find(l=>l.startsWith('data: '));if(line){const data=JSON.parse(line.slice(6));if(predicate(data))return data;}}}throw Error('SSE missing update');},async close(){abort.abort();await reader.cancel().catch(()=>{});reader.releaseLock();}};
    }
    const eventBoot=await call('bootstrap',b);const stream1=await openEvents(origin,eventBoot.cursor),stream2=await openEvents(second.origin,eventBoot.cursor);
    await call(`conversations/${direct}/messages`,a,'POST',{clientId:'cross-instance-event',body:'shared event'});
    const [event1,event2]=await Promise.all([stream1.next(d=>d.conversationId===direct),stream2.next(d=>d.conversationId===direct)]);assert.equal(event1.id,event2.id);
    const stats=await (await fetch(`${origin}/__fixture_stats`)).json();assert.equal(stats.waiting,0);assert.ok(stats.clients<=5);
    await stream1.close();await stream2.close();await wait(100);
    assert.equal((await (await fetch(`${origin}/__fixture_stats`)).json()).streams,0);assert.equal((await (await fetch(`${second.origin}/__fixture_stats`)).json()).streams,0);
    await call(`conversations/${direct}/messages`,a,'POST',{clientId:'offline-event',body:'offline durable message'});
    const catchup=await openEvents(second.origin,event1.id);assert.equal((await catchup.next(d=>d.conversationId===direct)).type,'invalidate');await catchup.close();
    const resetStream=await openEvents(origin,encodeCursor(`events:${e}:${b}`,'999999999'));assert.equal((await resetStream.next(d=>d.type==='reset')).type,'reset');await resetStream.close();
    const head=(await pool.query('SELECT seq FROM app_collab_event_heads WHERE enterprise_id=$1',[e])).rows[0].seq;
    const isolatedHub=new CollaborationEventHub();let closedByLease=false;let detach=()=>{};
    await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1",[b]);
    detach=isolatedHub.subscribe({enterprise:e,actor:b,seq:BigInt(head),enqueue:()=>{},close:()=>{closedByLease=true;detach();}});await isolatedHub.poll();
    assert.equal(closedByLease,true);assert.equal(isolatedHub.size,0);isolatedHub.close();await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1",[b]);
    pass('authenticated HTTP SSE two processes; offline cursor catchup; cancellation removes subscriptions; no held per-user PG client');

    const zip=await new JSZip().file('工作文件.bin',randomBytes(150000)).generateAsync({type:'nodebuffer',compression:'STORE'});
    const begin=await call('uploads',a,'POST',{clientId:'zip',conversationId:direct,name:'设计稿.zip',bytes:zip.length,mime:'application/zip'});const up=begin.upload;
    assert.equal((await call('uploads',a,'POST',{clientId:'zip',conversationId:direct,name:'设计稿.zip',bytes:zip.length,mime:'application/zip'})).upload.id,up.id);
    async function part(uploadId:string,index:number,bytes:Uint8Array,expected=200){const response=await fetch(`${origin}/api/collaboration/uploads/${uploadId}?enterpriseId=${e}&part=${index}`,{method:'PUT',headers:{cookie:cookie(a)},body:bytes as BodyInit});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;}
    await part(up.id,0,zip.subarray(0,65536));await part(up.id,0,zip.subarray(0,65536));await part(up.id,0,Buffer.alloc(65536),409);
    await part(up.id,1,zip.subarray(65536,65550),400);await call(`uploads/${up.id}/complete`,a,'POST',undefined,409);
    await stopChild(second.child);second=await startChild();assert.deepEqual((await call(`uploads/${up.id}`,a,'GET',undefined,200,second.origin)).upload.uploadedParts,[0]);
    for(let index=1;index<Math.ceil(zip.length/65536);index++)await part(up.id,index,zip.subarray(index*65536,(index+1)*65536));
    const zipAttachment=(await call(`uploads/${up.id}/complete`,a,'POST')).attachment;assert.equal(zipAttachment.mime,'application/octet-stream');assert.equal(zipAttachment.previewUrl,undefined);
    assert.equal((await call(`uploads/${up.id}/complete`,a,'POST')).attachment.id,up.id);
    await call(`attachments/${up.id}`,b,'GET',undefined,404);
    const zipMessage=(await call(`conversations/${direct}/messages`,a,'POST',{clientId:'zip-message',body:'附件',attachmentIds:[up.id]})).message;
    const download=await fetch(`${origin}${zipAttachment.downloadUrl}`,{headers:{cookie:cookie(b)}});assert.equal(download.status,200);assert.equal(digest(new Uint8Array(await download.arrayBuffer())),digest(zip));
    assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.ok(download.headers.get('content-disposition')!.startsWith('attachment;'));
    const ranged=await fetch(`${origin}${zipAttachment.downloadUrl}`,{headers:{cookie:cookie(b),range:'bytes=65000-66000'}});assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),zip.subarray(65000,66001));
    const invalid=await fetch(`${origin}${zipAttachment.downloadUrl}`,{headers:{cookie:cookie(b),range:'bytes=0-1,3-4'}});assert.equal(invalid.status,416);await invalid.body?.cancel();
    assert.equal((await call(`conversations/${direct}/messages?kind=files`,b)).items[0].id,zipMessage.id);
    await call(`uploads/${up.id}`,a,'DELETE',undefined,409);
    pass('ZIP byte-exact hash; resumable bounded chunks; duplicate/conflict/incomplete; complete idempotency; private download/Range/files list');

    const ac=(await call('conversations',a,'POST',{clientId:'ac',kind:'direct',memberIds:[c]})).conversation.id;
    await call(`conversations/${ac}/messages`,a,'POST',{clientId:'raw-ref',body:'forged',attachmentIds:[up.id]},403);
    const forwards=await call('forward',a,'POST',{clientId:'forward-zip',messageIds:[zipMessage.id],conversationIds:[ac]});
    assert.equal((await call('forward',a,'POST',{clientId:'forward-zip',messageIds:[zipMessage.id],conversationIds:[ac]})).messages[0].id,forwards.messages[0].id);
    await call(`messages/${zipMessage.id}/withdraw`,b,'POST',undefined,403);await call(`messages/${zipMessage.id}/withdraw`,a,'POST');
    await call(`attachments/${up.id}`,b,'GET',undefined,404);
    const forwardedDownload=await fetch(`${origin}${zipAttachment.downloadUrl}`,{headers:{cookie:cookie(c)}});assert.equal(digest(new Uint8Array(await forwardedDownload.arrayBuffer())),digest(zip));
    await call('forward',b,'POST',{clientId:'withdrawn-forward',messageIds:[zipMessage.id],conversationIds:[group]},409);
    await call(`messages/${forwards.messages[0].id}/withdraw`,a,'POST');await call(`attachments/${up.id}`,c,'GET',undefined,404);await call(`attachments/${up.id}`,a,'GET',undefined,404);
    const tombstone=(await call(`conversations/${direct}/messages?q=`,a)).items.find((m:any)=>m.id===zipMessage.id);assert.equal(tombstone.body,'');assert.deepEqual(tombstone.attachments,[]);
    pass('forward explicit new attachment grant; forged direct reference rejected; independent withdrawal grants and owner access revocation');

    for(const name of ['../escape.zip','C:\\escape.rar','x.html:evil','evil\r\nname','CON.zip','x/7z'])await call('uploads',a,'POST',{clientId:randomUUID(),conversationId:direct,name,bytes:4,mime:'text/plain'},400);
    async function tinyFile(name:string,bytes:Buffer,mime:string,conversationId=direct){const value=(await call('uploads',a,'POST',{clientId:randomUUID(),conversationId,name,bytes:bytes.length,mime})).upload;if(bytes.length)await part(value.id,0,bytes);return (await call(`uploads/${value.id}/complete`,a,'POST')).attachment;}
    const html=await tinyFile('payload.html',Buffer.from('<script>alert(1)</script>'),'image/png'),svg=await tinyFile('payload.svg',Buffer.from('<svg onload="alert(1)"/>'),'image/png');
    for(const file of [html,svg]){assert.equal(file.previewUrl,undefined);const response=await fetch(`${origin}${file.downloadUrl}&preview=1`,{headers:{cookie:cookie(a)}});assert.ok(response.headers.get('content-disposition')!.startsWith('attachment;'));assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.ok(response.headers.get('content-security-policy')!.includes('sandbox'));await response.body?.cancel();}
    const rar=await tinyFile('同名.rar',Buffer.from('Rar!fixture'),'application/x-rar-compressed'),rar2=await tinyFile('同名.rar',Buffer.from('Rar!different'),'application/x-rar-compressed'),seven=await tinyFile('工作.7z',Buffer.from('7zfixture'),'application/x-7z-compressed');assert.notEqual(rar.id,rar2.id);assert.ok(seven.id);
    const partRow=(await pool.query('SELECT object_key FROM app_collab_parts WHERE upload_id=$1',[up.id])).rows[0];
    const bypass=await fetch(`${origin}/media/${partRow.object_key}`);assert.equal(bypass.status,404);await bypass.body?.cancel();
    pass('ZIP/RAR/7z/work files opaque; same-name isolation; traversal/ADS/device/control rejection; forged HTML/SVG forced download; public media bypass denied');

    const groupFile=await tinyFile('入群前.zip',Buffer.from('group-before'),'application/zip',group);
    const groupFileMessage=(await call(`conversations/${group}/messages`,a,'POST',{clientId:'group-file-before',body:'history-bound attachment',attachmentIds:[groupFile.id]})).message;
    await call(`conversations/${group}`,a,'PATCH',{addMemberIds:[d]});await call(`attachments/${groupFile.id}`,d,'GET',undefined,404);
    assert.equal((await call(`conversations/${group}/messages?kind=files`,d)).items.length,0);
    await call('forward',b,'POST',{clientId:'explicit-history-forward',messageIds:[groupFileMessage.id],conversationIds:[group]});
    const historyForward=await fetch(`${origin}${groupFile.downloadUrl}`,{headers:{cookie:cookie(d)}});assert.equal(await historyForward.text(),'group-before');
    await call(`conversations/${group}`,d,'PATCH',{leave:true});await call(`attachments/${groupFile.id}`,d,'GET',undefined,404);
    pass('attachment grant obeys join sequence; explicit authorized history forward creates new grant; leave revokes it');

    const pending=(await call('uploads',a,'POST',{clientId:'cancel',conversationId:direct,name:'cancel.7z',bytes:4,mime:'text/plain'})).upload;await part(pending.id,0,Buffer.from('1234'));
    const key=(await pool.query('SELECT object_key FROM app_collab_parts WHERE upload_id=$1',[pending.id])).rows[0].object_key;
    await call(`uploads/${pending.id}`,a,'DELETE');await part(pending.id,0,Buffer.from('1234'),409);await call(`uploads/${pending.id}`,a,'GET',undefined,410);
    await pool.query("UPDATE app_collab_uploads SET expires_at=now()-interval '1 second' WHERE id=$1",[pending.id]);const cleaned=await cleanupCollaborationUploads();assert.equal(cleaned.deletedParts,1);
    assert.equal(await collaborationStorage().backend('local').exists(key),false);
    assert.equal(await collaborationStorage().backend('local').exists(partRow.object_key),true);
    pass('cancel tombstone, write-after-cancel rejection, bounded cleanup deletes only owned cancelled bytes; published files retained');

    const expired=(await call('uploads',a,'POST',{clientId:'expire',conversationId:direct,name:'unfinished.bin',bytes:4,mime:'text/plain'})).upload;await part(expired.id,0,Buffer.from('dead'));
    await pool.query("UPDATE app_collab_uploads SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await call(`uploads/${expired.id}`,a,'GET',undefined,410);
    const firstSweep=await cleanupCollaborationUploads();assert.equal(firstSweep.deletedParts,0);await pool.query("UPDATE app_collab_uploads SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);assert.equal((await cleanupCollaborationUploads()).deletedParts,1);
    const zero=await tinyFile('empty.txt',Buffer.alloc(0),'text/plain');const zeroResponse=await fetch(`${origin}${zero.downloadUrl}`,{headers:{cookie:cookie(a)}});assert.equal((await zeroResponse.arrayBuffer()).byteLength,0);
    const png=await tinyFile('pixel.png',Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex'),'text/plain');assert.ok(png.previewUrl);
    const pngResponse=await fetch(`${origin}${png.previewUrl}`,{headers:{cookie:cookie(a)}});assert.equal(pngResponse.headers.get('content-type'),'image/png');assert.ok(pngResponse.headers.get('content-disposition')!.startsWith('inline;'));await pngResponse.body?.cancel();
    await call('uploads',a,'POST',{clientId:'limit',conversationId:direct,name:'huge.bin',bytes:10485761,mime:'text/plain'},413);
    pass('expired incomplete upload two-phase cleanup; zero byte file; sniffed raster preview; configured file limit');

    const objects=new Map<string,Buffer>();let signedCalls=0;
    const objectServer=createServer(async(req,res)=>{
      if(!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256')){res.statusCode=403;res.end();return;}signedCalls++;
      const key=req.url!.split('?')[0];
      if(req.method==='PUT'){const chunks:Buffer[]=[];let count=0;for await(const chunk of req){count+=chunk.length;assert.ok(count<=65536);chunks.push(chunk);}objects.set(key,Buffer.concat(chunks));res.end();return;}
      if(req.method==='DELETE'){objects.delete(key);res.statusCode=204;res.end();return;}
      const object=objects.get(key);if(!object){res.statusCode=404;res.end();return;}
      if(req.method==='HEAD'){res.setHeader('content-length',object.length);res.end();return;}
      const m=/^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range||''));
      const start=m?Number(m[1]):0,end=m?Math.min(Number(m[2]),object.length-1):object.length-1;
      res.statusCode=m?206:200;res.setHeader('content-length',end-start+1);if(m)res.setHeader('content-range',`bytes ${start}-${end}/${object.length}`);res.end(object.subarray(start,end+1));
    });
    await new Promise<void>(r=>objectServer.listen(0,'127.0.0.1',r));servers.push(objectServer);
    const objectOrigin=`http://127.0.0.1:${(objectServer.address() as {port:number}).port}`;
    const savedEnv={...process.env};
    try{
      Object.assign(process.env,{STORAGE_DRIVER:'s3',MEDIA_PRIVATE:'1',S3_ENDPOINT:objectOrigin,S3_ACCESS_KEY_ID:'fixture-key',S3_SECRET_ACCESS_KEY:'fixture-secret',S3_BUCKET:'private-fixture',S3_PUBLIC_BASE_URL:'',MEDIA_REMOTE_ACCESS:'proxy'});
      assert.equal(collaborationStorage().selected,'managed');
      const remote=await tinyFile('remote.zip',Buffer.from('private-s3-bytes'),'application/zip');
      assert.equal((await pool.query('SELECT backend FROM app_collab_uploads WHERE id=$1',[remote.id])).rows[0].backend,'managed');
      const remoteResponse=await fetch(`${origin}${remote.downloadUrl}`,{headers:{cookie:cookie(a)}});assert.equal(await remoteResponse.text(),'private-s3-bytes');
      await call(`uploads/${remote.id}`,a,'DELETE');await pool.query("UPDATE app_collab_uploads SET expires_at=now()-interval '1 second' WHERE id=$1",[remote.id]);assert.equal((await cleanupCollaborationUploads()).deletedParts,1);assert.equal(objects.size,0);
      process.env.MEDIA_PRIVATE='0';assert.equal(collaborationStorage().selected,'local');process.env.MEDIA_PRIVATE='1';process.env.S3_PUBLIC_BASE_URL='https://public.invalid';assert.equal(collaborationStorage().selected,'local');
      const r2config=storageConfiguration({STORAGE_DRIVER:'r2',R2_ACCOUNT_ID:'fixture',R2_BUCKET:'fixture-r2',R2_ACCESS_KEY_ID:'fixture-key',R2_SECRET_ACCESS_KEY:'fixture-secret',MEDIA_PRIVATE:'1'});
      assert.equal(r2config.driver,'r2');const r2=createObjectStorage({...r2config,endpoint:objectOrigin});const r2key=`image-job-results/collaboration/${randomUUID()}/part`;
      await r2.put(r2key,Buffer.from('private-r2'),'application/octet-stream','private, no-store');const r2read=await r2.get(r2key,'bytes=1-5');assert.equal(await r2read.text(),'rivat');await r2.delete(r2key);assert.equal(objects.size,0);assert.ok(signedCalls>=7);
    }finally{for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);}
    pass('S3 private route roundtrip/delete via signed loopback object simulator; R2 adapter Range; public-config local fallback (not live cloud acceptance)');

    const share=randomUUID();await pool.query('INSERT INTO fixture_share_port VALUES($1,$2,$3,$4)',[share,e,a,b]);
    const shared=(await call(`conversations/${direct}/messages`,a,'POST',{clientId:'share',body:'',shareId:share})).message;
    await call('forward',a,'POST',{clientId:'share-group',messageIds:[shared.id],conversationIds:[group]},403);await call(`conversations/${ac}/messages`,a,'POST',{clientId:'share-other',body:'',shareId:share},403);
    pass('EXTERNAL_PORT_FIXTURE shared card direct consent; group/third-party forwarding rejected (real sharing integration pending)');

    for(let n=0;n<102;n++){const email=`paged-${String(n).padStart(3,'0')}@fixture.invalid`;await pool.query("INSERT INTO app_users(email,name,renews_at) VALUES($1,'分页成员',now()+interval '1 year')",[email]);await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[e,email,owner]);}
    const directory1=await call('members?q=分页',a),directory2=await call(`members?q=分页&cursor=${encodeURIComponent(directory1.nextCursor)}`,a);assert.equal(directory1.items.length,100);assert.equal(directory2.items.length,2);
    for(let n=0;n<51;n++)await call('conversations',a,'POST',{clientId:`conversation-page-${n}`,kind:'group',memberIds:[b]});
    const conversations1=await call('conversations',a),conversations2=await call(`conversations?cursor=${encodeURIComponent(conversations1.nextCursor)}`,a);
    assert.equal(conversations1.items.length,50);assert.ok(conversations2.items.length>0);assert.equal(new Set([...conversations1.items,...conversations2.items].map((x:any)=>x.id)).size,conversations1.items.length+conversations2.items.length);
    pass('directory 100+2 and conversations 50+remainder bounded stable-key pagination');

    const blocker=await pool.connect();let revocationFinished=false;
    await blocker.query('BEGIN');await blocker.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1",[b]);
    const racing=call(`conversations/${direct}/messages`,b,'POST',{clientId:'revocation-race',body:'must not commit'},403).then(()=>{revocationFinished=true;});
    await wait(80);assert.equal(revocationFinished,false);await blocker.query('COMMIT');blocker.release();await racing;
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_collab_messages WHERE client_id='revocation-race'")).rows[0].n,0);
    await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1",[b]);
    const borrowed=[];for(let i=0;i<4;i++)borrowed.push(await pool.connect());
    try{await call(`conversations/${direct}/messages`,a,'POST',{clientId:'single-free-slot',body:'no nested checkout'});}finally{for(const client of borrowed)client.release();}
    const pools=(process as any)[Symbol.for('naumi.database.pools.v1')];assert.equal(pools.tick,undefined);
    pass('concurrent revocation waits then rejects send without write; one free business slot completes send; tick pool never allocated');

    const stats1=await (await fetch(`${origin}/__fixture_stats`)).json();await wait(100);assert.equal(stats1.waiting,0);assert.equal(collaborationEventHub.size,0);
    const scopeFailure=new Error('original callback failure');await assert.rejects(withCollaborationScope(a,e,async()=>{throw scopeFailure;}),error=>error===scopeFailure);
    const connect=pool.connect.bind(pool);let discarded=false;
    (pool as any).connect=async()=>{const tx=await connect();const query=tx.query.bind(tx),release=tx.release.bind(tx);(tx as any).query=(sql:unknown,...args:unknown[])=>sql==='ROLLBACK'?Promise.reject(Error('injected rollback wire loss')):(query as any)(sql,...args);tx.release=(destroy?:boolean|Error)=>{discarded=destroy===true;release(destroy);};return tx;};
    try{await assert.rejects(withCollaborationScope(a,e,async()=>{throw scopeFailure;}),error=>error===scopeFailure);assert.equal(discarded,true);}finally{pool.connect=connect;}
    await wait(100);assert.equal(pool.totalCount,pool.idleCount);assert.equal(pool.waitingCount,0);
    const spare=new CollaborationEventHub();assert.equal(spare.size,0);spare.close();
    pass('error identity preserved; all borrowed business clients returned; zero residual SSE subscription; no tick/private pool');
    console.log(`COLLABORATION_RESULT cases=${checks} passed=${checks} failed=0 tier=LOCAL_PG_ACTUAL_ROUTES_HTTP suppliers=0`);
  } finally { for(const child of children)await stopChild(child);await stopServers(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
