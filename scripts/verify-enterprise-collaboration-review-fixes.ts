// Regression probes preserved from the independent fixed-commit review.
const expectFixed = process.env.COLLAB_EXPECT_FIXED === '1';
import { collaborationScope, changeConversationTx, sendMessageTx } from '../src/lib/collaboration/service';
import { emitCollaborationEventTx } from '../src/lib/collaboration/events';
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

async function review() {
assert.equal(process.env.NAUMI_VERIFY_COLLABORATION,"1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
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
    const origin = await startHttp();
    const cookie = (actor: string) => `nv_user=${signUserSession(actor, Date.now())}`;
    async function call(path: string, actor: string | null = a, method = 'GET', data?: unknown, expected = 200, base = origin, extra: Record<string,string> = {}) {
      const sep = path.includes('?') ? '&' : '?'; const url = `${base}/api/collaboration/${path}${sep}enterpriseId=${e}`;
      const response = await fetch(url, { method, headers: { ...(actor ? { cookie: cookie(actor) } : {}), ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...extra },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
      const value = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`); return value as any;
    }
    const boot = await call('bootstrap', a); assert.equal(boot.members.length,5); assert.ok(boot.members.every((m: any) => !('phone' in m) && !('note' in m)));
    assert.equal(boot.limits.chunkBytes,65536); assert.equal(boot.actorId,a);

    // Healthy route controls; the author's full 20-case suite is deliberately not replayed.
    const directory=await call('members',b);
    assert.equal(directory.items.length,5);
    const group=(await call('conversations',a,'POST',{clientId:'review-group',kind:'group',memberIds:[b],title:'review'})).conversation.id;
    const original=(await call(`conversations/${group}/messages`,a,'POST',{clientId:'original',body:'before removal secret'})).message;
    await call(`conversations/${group}/messages`,c,'GET',undefined,404);
    const conflict=await call(`conversations/${group}/messages`,a,'POST',{clientId:'original',body:'DIFFERENT'},409);
    console.log('CONTROL directory_without_view_records=200 nonparticipant_messages=404 different_payload=409');

    function deferred<T=void>() { let resolve!: (value:T|PromiseLike<T>)=>void; const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
    async function waitBlocked() {
      for(let i=0;i<100;i++) {
        const rows=(await pool.query("SELECT pid,wait_event_type,query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%app_collab_conversations%' AND query NOT LIKE '%pg_stat_activity%'")).rows;
        if(rows.length) return rows;
        await wait(20);
      }
      throw Error('Expected real PG conversation lock wait');
    }
    // Execute the actual group-change use case and keep its COMMIT pending while HTTP begins.
    const changed=deferred(), release=deferred();
    const removal=collaborationScope(a,e,async(tx,scope)=>{
      await changeConversationTx(tx,scope,group,{removeMemberIds:[b]});
      await sendMessageTx(tx,scope,group,{clientId:'post-removal-secret',body:'SECRET_CREATED_AFTER_MEMBER_REMOVAL'},async()=>{throw Error('unexpected share');});
      changed.resolve();await release.promise;
    });
    await changed.promise;
    const racingRead=fetch(`${origin}/api/collaboration/conversations/${group}/messages?enterpriseId=${e}`,{headers:{cookie:cookie(b)},signal:AbortSignal.timeout(20000)}).then(async r=>({status:r.status,body:await r.json()}));
    let blocked:any[]=[];
    try {blocked=await waitBlocked();} finally {release.resolve();}
    await removal;
    const leaked=await racingRead;
    const fresh=await call(`conversations/${group}/messages`,b,'GET',undefined,404);
    const membership=(await pool.query('SELECT left_seq FROM app_collab_members WHERE conversation_id=$1 AND actor_id=$2',[group,b])).rows[0];
    assert.equal(leaked.status,expectFixed?404:200);assert.equal(!!leaked.body.items?.some((m:any)=>m.body==='SECRET_CREATED_AFTER_MEMBER_REMOVAL'),!expectFixed);
    console.log('PROBE_MEMBER_READ '+JSON.stringify({wait:blocked.map(r=>r.wait_event_type),left_seq:membership.left_seq,status:leaked.status,body:leaked.body,fresh_status:404}));

    // Repeat with a sender waiting for the same membership removal.
    await call(`conversations/${group}`,a,'PATCH',{addMemberIds:[b]});
    const changed2=deferred(), release2=deferred();
    const removal2=collaborationScope(a,e,async(tx,scope)=>{await changeConversationTx(tx,scope,group,{removeMemberIds:[b]});changed2.resolve();await release2.promise;});
    await changed2.promise;
    const racingSend=fetch(`${origin}/api/collaboration/conversations/${group}/messages?enterpriseId=${e}`,{method:'POST',headers:{cookie:cookie(b),'content-type':'application/json'},body:JSON.stringify({clientId:'removed-race-send',body:'sent after removal'}),signal:AbortSignal.timeout(20000)}).then(async r=>({status:r.status,body:await r.json()}));
    try{await waitBlocked();}finally{release2.resolve();}await removal2;
    const written=await racingSend;
    assert.equal(written.status,expectFixed?404:200);assert.equal((await pool.query("SELECT count(*)::int n FROM app_collab_messages WHERE client_id='removed-race-send'")).rows[0].n,expectFixed?0:1);
    console.log('PROBE_MEMBER_SEND '+JSON.stringify({...written,committed_rows:(await pool.query("SELECT count(*)::int n FROM app_collab_messages WHERE client_id='removed-race-send'")).rows[0].n}));
    await call(`conversations/${group}`,a,'PATCH',{addMemberIds:[b]});

    // A query already using a newer cursor is awaiting its real PostgreSQL result.
    // A second subscriber then joins from an older, still-retained cursor.
    const hub=new CollaborationEventHub();(hub as any).lastMaintenance=Date.now();
    const headBefore=BigInt((await pool.query('SELECT seq FROM app_collab_event_heads WHERE enterprise_id=$1',[e])).rows[0].seq);
    const cardConversation=randomUUID(), latestConversation=randomUUID();
    await collaborationScope(a,e,tx=>emitCollaborationEventTx(tx,e,['shares'],[b],cardConversation));
    const missedSeq=headBefore+BigInt(1);
    await collaborationScope(a,e,tx=>emitCollaborationEventTx(tx,e,['messages'],[b],latestConversation));
    const queryEntered=deferred(), releaseQuery=deferred();
    const realQuery=pool.query.bind(pool); let queryAfter:any=null;
    (pool as any).query=async function(sql:any,...args:any[]) {
      if(typeof sql==='string' && sql.includes('SELECT q.enterprise_id,h.seq AS high')) {
        queryAfter=args[0][1];const result=await (realQuery as any)(sql,...args);queryEntered.resolve();await releaseQuery.promise;return result;
      }
      return (realQuery as any)(sql,...args);
    };
    const eventsOld:any[]=[],eventsNew:any[]=[];let detach1=()=>{},detach2=()=>{};
    try {
      detach1=hub.subscribe({enterprise:e,actor:a,seq:missedSeq,enqueue:x=>eventsNew.push(x),close:()=>detach1()});
      const polling=hub.poll();await queryEntered.promise;
      detach2=hub.subscribe({enterprise:e,actor:b,seq:headBefore,enqueue:x=>eventsOld.push(x),close:()=>detach2()});
      releaseQuery.resolve();await polling;
      pool.query=realQuery;await hub.poll();
      assert.equal(eventsOld.length,expectFixed?2:1);assert.equal(eventsOld.some(x=>x.conversationId===cardConversation),expectFixed);assert.ok(eventsOld.some(x=>x.conversationId===latestConversation));assert.equal(eventsOld.some(x=>x.type==='reset'),false);
      console.log('PROBE_SSE_LATE_SUBSCRIBE '+JSON.stringify({query_after:queryAfter,old_cursor:String(headBefore),missed_seq:String(missedSeq),missing_card_conversation:cardConversation,delivered:eventsOld,reset:eventsOld.some(x=>x.type==='reset'),card_delivered:eventsOld.some(x=>x.conversationId===cardConversation)}));
    } finally {releaseQuery.resolve();pool.query=realQuery;detach1();detach2();hub.close();}

    // Upload all chunks, then make only the second real local object absent before complete.
    const u=(await call('uploads',a,'POST',{clientId:'review-missing-part',conversationId:group,name:'missing.bin',bytes:65540,mime:'application/octet-stream'})).upload;
    for(const [part,bytes] of [[0,Buffer.alloc(65536,65)],[1,Buffer.from('TAIL')]] as const) {
      const r=await fetch(`${origin}/api/collaboration/uploads/${u.id}?enterpriseId=${e}&part=${part}`,{method:'PUT',headers:{cookie:cookie(a)},body:bytes});assert.equal(r.status,200);await r.json();
    }
    const key=(await pool.query('SELECT object_key FROM app_collab_parts WHERE upload_id=$1 AND part=1',[u.id])).rows[0].object_key;
    await collaborationStorage().backend('local').delete(key);
    assert.equal(await collaborationStorage().backend('local').exists(key),false);
    const completeResponse=await fetch(`${origin}/api/collaboration/uploads/${u.id}/complete?enterpriseId=${e}`,{method:'POST',headers:{cookie:cookie(a)}});
    const completeBody=await completeResponse.json();
    if(expectFixed){
      assert.equal(completeResponse.status,409);
      assert.equal((await pool.query('SELECT status FROM app_collab_uploads WHERE id=$1',[u.id])).rows[0].status,'uploading');
      await call(`conversations/${group}/messages`,a,'POST',{clientId:'publish-missing',body:'missing file',attachmentIds:[u.id]},403);
      assert.deepEqual((await call(`uploads/${u.id}`)).upload.uploadedParts,[0]);
      const restored=await fetch(`${origin}/api/collaboration/uploads/${u.id}?enterpriseId=${e}&part=1`,{method:'PUT',headers:{cookie:cookie(a)},body:Buffer.from('TAIL')});assert.equal(restored.status,200);await restored.json();
      const completed=await call(`uploads/${u.id}/complete`,a,'POST');
      await call(`conversations/${group}/messages`,a,'POST',{clientId:'publish-repaired',body:'repaired file',attachmentIds:[u.id]});
      const received=await fetch(`${origin}${completed.attachment.downloadUrl}`,{headers:{cookie:cookie(b)}});assert.equal(received.status,200);
      assert.equal(digest(Buffer.from(await received.arrayBuffer())),digest(Buffer.concat([Buffer.alloc(65536,65),Buffer.from('TAIL')])));
      console.log('PROBE_MISSING_PART '+JSON.stringify({missing_part:1,complete_status:409,send_status:403,state:'uploading',resumed:true,download_hash:'PASS'}));
    }else{
      const sendMissing=await call(`conversations/${group}/messages`,a,'POST',{clientId:'publish-missing',body:'missing file',attachmentIds:[u.id]});
      const download=await fetch(`${origin}${completeBody.attachment.downloadUrl}`,{headers:{cookie:cookie(b)},signal:AbortSignal.timeout(5000)});
      let bodyResult='RESOLVED';try{await download.arrayBuffer();}catch(error){bodyResult=(error as Error).message;}
      assert.equal(completeResponse.status,200);assert.equal(bodyResult,'terminated');
      console.log('PROBE_MISSING_PART '+JSON.stringify({missing_part:1,complete_status:200,send_status:200,download_status:download.status,body_result:bodyResult}));
    }

    // Withdrawal retry/tombstone control (including replay of the original send payload).
    const withdrawn=await call(`messages/${original.id}/withdraw`,a,'POST');
    const again=await call(`messages/${original.id}/withdraw`,a,'POST');
    assert.equal(again.message.withdrawnAt,withdrawn.message.withdrawnAt);
    const replay=await call(`conversations/${group}/messages`,a,'POST',{clientId:'original',body:'before removal secret'});
    assert.equal(replay.message.body,'');
    console.log('CONTROL withdraw_retry=200 same_tombstone=true original_send_replay_body_empty=true');
    console.log(expectFixed?'COLLABORATION_REVIEW_FIXES=PASS repaired_findings=3 healthy_controls=5 suppliers=0':'COLLABORATION_REVIEW_BASELINE=REPRODUCED findings=3 healthy_controls=5 suppliers=0');

} finally { for(const child of children)await stopChild(child);await stopServers(); }
}
review().catch(error=>{console.error(error);process.exitCode=1;});
