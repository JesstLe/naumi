import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import sharp from 'sharp';
import { getPool } from '../src/lib/db';
import { closeDatabasePools } from '../src/lib/db/connection';
import { signUserSession } from '../src/lib/native-auth';
import { ensureCollaborationSchema } from '../src/lib/collaboration/schema';
import { collaborationEventHub } from '../src/lib/collaboration/events';
import { ensureCanvasSharingSchema } from '../src/lib/canvas-sharing/schema';
import { insertSharedArtworkTx, insertSharedTextTx } from '../src/lib/canvas/sharing-repository';
import { writeStoredObject, deleteImageByUrl } from '../src/lib/storage';
import { registerMediaAsset } from '../src/lib/media-assets';
import * as bootstrap from '../src/app/api/collaboration/bootstrap/route';
import * as conversations from '../src/app/api/collaboration/conversations/route';
import * as messages from '../src/app/api/collaboration/conversations/[id]/messages/route';
import * as events from '../src/app/api/collaboration/events/route';
import * as shares from '../src/app/api/collaboration/shares/route';
import * as share from '../src/app/api/collaboration/shares/[id]/route';
import * as preview from '../src/app/api/collaboration/shares/[id]/preview/route';
import * as texts from '../src/app/api/canvas/text-nodes/route';
import * as projects from '../src/app/api/projects/route';
import * as media from '../src/app/media/[...path]/route';

const handlers: Array<[RegExp, Record<string, unknown>]> = [
  [/^\/api\/collaboration\/bootstrap$/, bootstrap], [/^\/api\/collaboration\/conversations$/, conversations],
  [/^\/api\/collaboration\/conversations\/([^/]+)\/messages$/, messages], [/^\/api\/collaboration\/events$/, events],
  [/^\/api\/collaboration\/shares$/, shares], [/^\/api\/collaboration\/shares\/([^/]+)$/, share],
  [/^\/api\/collaboration\/shares\/([^/]+)\/preview$/, preview], [/^\/api\/canvas\/text-nodes$/, texts],
  [/^\/api\/projects$/, projects],
];
const pool = getPool(), enterprise = randomUUID(), foreign = randomUUID();
const author = 'author@integration.invalid', recipient = 'recipient@integration.invalid', third = 'third@integration.invalid';
const boss = 'boss@integration.invalid', outside = 'outside@integration.invalid', projectKey = 'tree:integration-source';
const savedFetch = globalThis.fetch; let supplierCalls = 0, passed = 0, failed = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== '127.0.0.1') { supplierCalls++; throw Error('EXTERNAL_NETWORK_BLOCKED'); }
  return savedFetch(input, init);
}) as typeof fetch;
const server = createServer(async (req, res) => {
  const controller = new AbortController(); req.once('aborted', () => controller.abort()); res.once('close', () => controller.abort());
  try {
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
    // Model a trusted reverse proxy's normalized host; undici itself rewrites Host.
    if (headers.get('x-fixture-proxy') === '1') { headers.set('host', 'collab.example'); headers.set('x-forwarded-proto', 'https'); }
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}${req.url}`;
    const request = new Request(url, { method: req.method, headers, signal: controller.signal,
      ...(!['GET', 'HEAD'].includes(req.method!) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) } as RequestInit);
    let response: Response | undefined; const pathname = new URL(url).pathname;
    if (pathname.startsWith('/media/')) response = await media.GET(request, { params: Promise.resolve({ path: pathname.slice(7).split('/') }) });
    for (const [pattern, table] of handlers) {
      const match = pattern.exec(pathname); if (!match) continue;
      const fn = table[req.method!] as ((req: Request, ctx: unknown) => Promise<Response>) | undefined;
      response = fn ? await fn(request, { params: Promise.resolve({ id: match[1] }) }) : new Response(null, { status: 405 }); break;
    }
    response ||= new Response(null, { status: 404 });
    res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.flushHeaders();
    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader(); const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    try { for (;;) { const v = await reader.read(); if (v.done) break; if (!res.write(Buffer.from(v.value))) await once(res, 'drain', { signal: controller.signal }); } res.end(); }
    finally { controller.signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); } else res.destroy(); }
});
let origin = '';
const cookie = (actor: string) => `nv_user=${signUserSession(actor, Date.now())}`;
async function call(route: string, actor = author, data?: unknown, status = 200, extras: Record<string, string> = {}) {
  const response = await fetch(`${origin}${route}${route.includes('?') ? '&' : '?'}enterpriseId=${enterprise}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { cookie: cookie(actor), origin,
      ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...extras },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(30000),
  });
  const body = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(body)}`); return body as any;
}
async function test(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
async function main() {
  assert.equal(process.env.NAUMI_COLLAB_INTEGRATION, '1'); assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1');
  await ensureCollaborationSchema(); await ensureCanvasSharingSchema();
  for (const email of [boss, author, recipient, third, outside, 'otherboss@integration.invalid'])
    await pool.query("INSERT INTO app_users(email,name,renews_at,role) VALUES($1,$2,now()+interval '1 year','user')", [email, email.split('@')[0]]);
  for (const [id, owner] of [[enterprise, boss], [foreign, 'otherboss@integration.invalid']]) {
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Integration',$2,now()+interval '1 year')", [id, owner]);
    await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)', [id]);
    await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')", [owner]);
  }
  for (const email of [author, recipient, third]) await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')", [enterprise, email, boss]);
  await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,'otherboss@integration.invalid','permanent')", [foreign, outside]);
  await pool.query('INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2)', [author, projectKey]);
  await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'tenant',$3)", [author, projectKey, enterprise]);
  const png = await sharp({ create: { width: 14, height: 12, channels: 4, background: '#e7cfaf' } }).png().toBuffer();
  const key = 'integration/source.png'; await writeStoredObject(png, 'image/png', key); await registerMediaAsset(key, png, 'image/png', false, author, false);
  const tx = await pool.connect(); try {
    await tx.query('BEGIN'); await insertSharedArtworkTx(tx, author, 'integration-image', projectKey, { title: '图像', category: 'image', status: 'completed', prompt: 'PRIVATE_IMAGE_PROMPT',
      image_url: `/media/${key}`, parent_ids: [], parent_id: null, canvas_x: 10, canvas_y: 20, canvas_width: 320, canvas_height: 280, image_width: 14, image_height: 12 });
    await insertSharedTextTx(tx, author, 'integration-text', projectKey, { title: '提示词', prompt: 'PRIVATE_TEXT_PROMPT', content: 'approved editable content', status: 'completed',
      canvas_x: 400, canvas_y: 20, canvas_width: 300, canvas_height: 180, source_ids: ['integration-image'], target_ids: [], product_ids: [] });
    await tx.query('COMMIT');
  } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const baselineLedger = Number((await pool.query('SELECT count(*) n FROM app_ledger')).rows[0].n);
  const boot = await call('/api/collaboration/bootstrap', recipient);
  const streamAbort = new AbortController(); const updates: any[] = [];
  const stream = await fetch(`${origin}/api/collaboration/events?enterpriseId=${enterprise}&cursor=${encodeURIComponent(boot.cursor)}`, { headers: { cookie: cookie(recipient) }, signal: streamAbort.signal });
  assert.equal(stream.status, 200); const reader = stream.body!.getReader();
  const drain = (async () => { let pending = ''; const decoder = new TextDecoder(); try { for (;;) {
    const chunk = await reader.read(); if (chunk.done) break; pending += decoder.decode(chunk.value, { stream: true });
    let end: number; while ((end = pending.indexOf('\n\n')) >= 0) { const frame = pending.slice(0, end); pending = pending.slice(end + 2);
      if (frame.includes('event: update')) { const line = frame.split('\n').find(v => v.startsWith('data: ')); if (line) updates.push(JSON.parse(line.slice(6))); }
    }
  } } catch (e) { if (!streamAbort.signal.aborted) throw e; } finally { reader.releaseLock(); } })();
  try {
    const offered = (await call('/api/collaboration/shares', author, { action: 'offer', operationId: randomUUID(), requesterId: recipient, source: { projectKey, kind: 'workflow' } })).share;
    await test('real cookie + grant + source offer with no prompt leakage', async () => {
      assert.equal(offered.status, 'offered'); const before = await call(`/api/collaboration/shares/${offered.id}`, recipient);
      assert.ok(!JSON.stringify(before).includes('PRIVATE_')); assert.equal(before.share.resultProjectKey, null);
      await call(`/api/collaboration/shares/${offered.id}`, third, undefined, 404);
      await call(`/api/collaboration/shares/${offered.id}`, outside, undefined, 403);
    });
    const direct = (await call('/api/collaboration/conversations', author, { clientId: randomUUID(), kind: 'direct', memberIds: [recipient] })).conversation;
    await test('real share validator wired to actual messaging routes', async () => {
      const payload = { clientId: randomUUID(), body: '', shareId: offered.id };
      const sent = (await call(`/api/collaboration/conversations/${direct.id}/messages`, author, payload)).message;
      const replay = (await call(`/api/collaboration/conversations/${direct.id}/messages`, author, payload)).message; assert.equal(sent.id, replay.id);
      const wrong = (await call('/api/collaboration/conversations', author, { clientId: randomUUID(), kind: 'direct', memberIds: [third] })).conversation;
      await call(`/api/collaboration/conversations/${wrong.id}/messages`, author, { ...payload, clientId: randomUUID() }, 403);
      const group = (await call('/api/collaboration/conversations', author, { clientId: randomUUID(), kind: 'group', memberIds: [recipient], title: 'two-person group' })).conversation;
      await call(`/api/collaboration/conversations/${group.id}/messages`, author, { ...payload, clientId: randomUUID() }, 403);
    });
    const requested = (await call(`/api/collaboration/shares/${offered.id}`, recipient, { action: 'request', operationId: randomUUID(), expectedVersion: offered.version })).share;
    const approval = { action: 'approve', operationId: randomUUID(), expectedVersion: requested.version };
    const approved = (await call(`/api/collaboration/shares/${offered.id}`, author, approval)).share;
    const mine = (await call(`/api/collaboration/shares/${offered.id}`, recipient)).share;
    await test('approval creates one independently editable recipient project', async () => {
      assert.equal(approved.status, 'approved'); assert.equal(approved.resultProjectKey, null); assert.ok(mine.resultProjectKey);
      await call(`/api/collaboration/shares/${offered.id}`, author, approval);
      assert.equal((await pool.query('SELECT count(*)::int n FROM app_canvas_share_copies WHERE share_id=$1', [offered.id])).rows[0].n, 1);
      const projectList = await call('/api/projects', recipient); assert.ok(projectList.names[mine.resultProjectKey]);
      const node = (await call('/api/canvas/text-nodes', recipient)).nodes.find((n: any) => n.projectKey === mine.resultProjectKey); assert.ok(node);
      await call('/api/canvas/text-nodes', recipient, { ...node, content: 'recipient independently edited' });
      assert.equal((await pool.query('SELECT content FROM app_canvas_text_nodes WHERE email=$1 AND id=$2', [author, 'integration-text'])).rows[0].content, 'approved editable content');
    });
    await test('source deletion keeps private copied image readable only by recipient', async () => {
      const copied = (await pool.query('SELECT image_url FROM app_artworks WHERE email=$1 AND group_id=$2', [recipient, mine.resultProjectKey.slice(5)])).rows[0]; assert.ok(copied);
      assert.notEqual(copied.image_url, `/media/${key}`); await deleteImageByUrl(`/media/${key}`);
      const got = await fetch(`${origin}${copied.image_url}`, { headers: { cookie: cookie(recipient) } }); assert.equal(got.status, 200);
      assert.equal(createHash('sha256').update(Buffer.from(await got.arrayBuffer())).digest('hex'), createHash('sha256').update(png).digest('hex'));
      const forbidden = await fetch(`${origin}${copied.image_url}`, { headers: { cookie: cookie(third) } }); assert.ok([403, 404].includes(forbidden.status)); await forbidden.body?.cancel();
    });
    await test('sharing lifecycle publishes audience-bound durable and SSE invalidation', async () => {
      await collaborationEventHub.poll(); await new Promise(r => setTimeout(r, 120));
      const rows = (await pool.query("SELECT * FROM app_collab_events WHERE enterprise_id=$1 AND 'shares'=ANY(topics)", [enterprise])).rows;
      console.log(`SHARE_EVENTS durable=${rows.length} streamed=${updates.filter(e => e.topics.includes('shares')).length}`);
      assert.equal(rows.length, 3, 'offer/request/approve each commit one event; approval replay emits none');
      assert.ok(rows.every(r => [...r.audience].sort().join(',') === [author, recipient].sort().join(',')));
      assert.ok(updates.some(e => e.topics.includes('shares')), 'recipient must see status change without refreshing page');
    });
    await test('reverse-proxy origin accepted; cross-site still rejected', async () => {
      await call('/api/collaboration/shares', recipient, { action: 'request', operationId: randomUUID(), authorId: author }, 200,
        { 'x-fixture-proxy': '1', origin: 'https://collab.example' });
      await call('/api/collaboration/shares', recipient, { action: 'request', operationId: randomUUID(), authorId: author }, 403, { origin: 'https://foreign.invalid' });
    });
    await test('live entitlement and membership changes fence shared API', async () => {
      await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1", [recipient]);
      try { await call(`/api/collaboration/shares/${offered.id}`, recipient, undefined, 403); }
      finally { await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1", [recipient]); }
      await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1', [boss]);
      try { await call('/api/collaboration/shares', author, undefined, 403); }
      finally { await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1', [boss]); }
    });
    await test('failed event publication rolls back the share and operation together', async () => {
      const before = (await pool.query('SELECT count(*)::int n FROM app_canvas_shares')).rows[0].n;
      const operationId = randomUUID();
      await pool.query(`CREATE FUNCTION fixture_reject_share_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF 'shares'=ANY(NEW.topics) THEN RAISE EXCEPTION 'fixture event failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fixture_reject_share_event BEFORE INSERT ON app_collab_events FOR EACH ROW EXECUTE FUNCTION fixture_reject_share_event()`);
      try {
        await call('/api/collaboration/shares', recipient, { action: 'request', operationId, authorId: author }, 503);
        assert.equal((await pool.query('SELECT count(*)::int n FROM app_canvas_shares')).rows[0].n, before);
        assert.equal((await pool.query('SELECT count(*)::int n FROM app_canvas_share_operations WHERE operation_id=$1', [operationId])).rows[0].n, 0);
      } finally { await pool.query('DROP TRIGGER fixture_reject_share_event ON app_collab_events; DROP FUNCTION fixture_reject_share_event()'); }
      await call('/api/collaboration/shares', recipient, { action: 'request', operationId, authorId: author });
    });
    await test('revocation blocks new cards while preserving accepted independent copy', async () => {
      await call(`/api/collaboration/shares/${offered.id}`, author, { action: 'revoke', operationId: randomUUID(), expectedVersion: approved.version });
      assert.equal((await call(`/api/collaboration/shares/${offered.id}`, recipient)).share.resultProjectKey, mine.resultProjectKey);
      await call(`/api/collaboration/conversations/${direct.id}/messages`, author, { clientId: randomUUID(), body: '', shareId: offered.id }, 403);
      const deniedPreview = await fetch(`${origin}/api/collaboration/shares/${offered.id}/preview?enterpriseId=${enterprise}`, { headers: { cookie: cookie(recipient) } });
      assert.equal(deniedPreview.status, 404); await deniedPreview.body?.cancel();
    });
    await test('no generation or ledger mutation', async () => {
      assert.equal(Number((await pool.query('SELECT count(*) n FROM app_ledger')).rows[0].n), baselineLedger); assert.equal(supplierCalls, 0);
    });
  } finally { streamAbort.abort(); await drain; }
}
main().catch(e => { failed++; console.error(e); }).finally(async () => {
  collaborationEventHub.close(); server.closeAllConnections(); if (server.listening) await new Promise<void>(r => server.close(() => r()));
  await closeDatabasePools(); console.log(`COLLABORATION_INTEGRATION passed=${passed} failed=${failed} real_scope=1 real_sharing=1 real_routes=1 supplier_calls=${supplierCalls}`);
  process.exitCode = failed ? 1 : 0;
});
