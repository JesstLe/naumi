import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getPool, setProjectName } from '../src/lib/db';
import { closeDatabasePools } from '../src/lib/db/connection';
import { hashPassword } from '../src/lib/pw';
import { authenticatedEmail } from '../src/lib/request-auth';
import { ensureCollaborationSchema } from '../src/lib/collaboration/schema';
import { ensureCanvasSharingSchema } from '../src/lib/canvas-sharing/schema';
import { collaborationEventHub } from '../src/lib/collaboration/events';
import { collaborationScope, createConversationTx, sendMessageTx } from '../src/lib/collaboration/service';
import { insertSharedArtworkTx, insertSharedTextTx } from '../src/lib/canvas/sharing-repository';
import { writeStoredObject } from '../src/lib/storage';
import { registerMediaAsset } from '../src/lib/media-assets';
import { routes } from './verify-enterprise-collaboration-e2e.routes';

const out = process.env.E2E_OUT!, pool = getPool(), enterprise = randomUUID();
const author = 'author@e2e.invalid', recipient = 'recipient@e2e.invalid', third = 'third@e2e.invalid', boss = 'boss@e2e.invalid';
const password = 'synthetic-local-only-password', projectKey = 'tree:e2e-source', otherProject = 'tree:e2e-other';
const calls: any[] = [], errors: string[] = [], aborts: string[] = [];
const generations: Array<{ actor: string; prompt: string; aborted: boolean; released: boolean }> = [];
const releases = new Map<string, () => void>();
const savedFetch = globalThis.fetch; let supplierCalls = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); if (u.hostname !== '127.0.0.1') { supplierCalls++; throw Error('EXTERNAL_NETWORK_BLOCKED'); } return savedFetch(input, init); }) as typeof fetch;
const sockets = new Set<any>(); let info: any, closed = false;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const server = createServer(async (req, res) => {
  const controller = new AbortController(); req.once('aborted', () => controller.abort()); res.once('close', () => controller.abort());
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}${req.url}`, u = new URL(url);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
    const request = new Request(url, { method: req.method, headers, signal: controller.signal, ...(!['GET', 'HEAD'].includes(req.method!) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) } as RequestInit);
    // Desktop aliases dispatch to the same fixed actual native route modules.
    const p = u.pathname.replace(/^\/desktop\/api\//, '/api/');
    const record = { method: req.method, path: p, query: u.search, status: 0 }; calls.push(record);
    let response: Response | undefined;
    if (p === '/__fixture') response = json(info);
    if (p === '/__fixture/checks') response = json({ calls, errors, aborts, supplierCalls, generations, ledger: (await pool.query('SELECT count(*)::int n FROM app_ledger')).rows[0].n,
      copies: (await pool.query('SELECT count(*)::int n FROM app_canvas_share_copies')).rows[0].n,
      texts: (await pool.query('SELECT email,id,project_key,content FROM app_canvas_text_nodes ORDER BY email,id')).rows,
      uploads: (await pool.query('SELECT id,name,status,mime FROM app_collab_uploads')).rows,
      parts: (await pool.query('SELECT upload_id,part,ready FROM app_collab_parts ORDER BY upload_id,part')).rows,
      presence: (await pool.query('SELECT actor_id,session_id,state,expires_at FROM app_collab_presence')).rows });
    if (p === '/__fixture/stop') response = json({ ok: true });
    if (p === '/__fixture/generation-release' && req.method === 'POST') { const { prompt } = await request.json(); releases.get(prompt)?.(); response = json({ ok: true }); }
    // Unrelated supplier/config ports only. Auth/session and native data are real.
    if (p === '/api/config') response = json({ db: true, storage: true, authMode: 'mock', multiUser: true, creditsMetered: false, imageModels: [], imageModelBindings: {}, defaultImageModel: '', modelVersion: 1 });
    if (p === '/api/models') { const text = u.searchParams.get('feature') === 'canvas.text-generate'; response = json({ managed: true, version: 1, models: text ? [{ id: 'local-text', label: '本地测试文字', modality: 'text', supportsEdit: false }] : [], defaultModelId: text ? 'local-text' : '', available: text, supported: true, feature: u.searchParams.get('feature') }); }
    if (p === '/api/text-models') response = json({ models: [], defaultModel: '' });
    if (p === '/api/video/catalog') response = json({ models: [], enabled: false });
    if (p === '/api/billing/catalog') response = json({ version: 1, features: { 'image.generate': { label: 'image', prices: {}, enabled: false } }, products: [], effective: { metering: false, commerce: false, recharge: false }, thresholds: {} });
    if (p === '/api/billing/quote' && req.method === 'POST') { const actor = await authenticatedEmail(request); response = actor ? json({ ...(await request.json()), credits: 0, reserveCredits: 0, version: 1, modelVersion: 1, quote: { id: randomUUID(), expiresAt: new Date(Date.now() + 60000).toISOString() } }) : json({ error: 'login' }, 401); }
    if (p === '/api/canvas/text-generate' && req.method === 'POST') {
      const actor = await authenticatedEmail(request); if (!actor) response = json({ error: 'login' }, 401);
      else { const body = await request.json(), g = { actor, prompt: body.prompt, aborted: false, released: false }; generations.push(g);
        const abort = () => { if (!g.released) g.aborted = true; }; controller.signal.addEventListener('abort', abort, { once: true });
        await new Promise<void>(resolve => { releases.set(body.prompt, resolve); }); releases.delete(body.prompt); g.released = true; controller.signal.removeEventListener('abort', abort);
        response = json({ text: `本地测试生成：${body.prompt}`, model: 'local-text' });
      }
    }
    if (p === '/api/comfyui/workflows') response = json({ workflows: [] });
    if (p === '/api/image-skills') response = json({ skills: [] });
    if (p === '/api/version') response = json({ version: 'local-e2e' });
    if (!response) for (const [pattern, mod, keys] of routes) { const match = pattern.exec(p); if (!match) continue; const params = Object.fromEntries(keys.map((k, n) => [k, k === 'path' ? match[n + 1].split('/') : decodeURIComponent(match[n + 1])])); const fn = mod[req.method!]; response = fn ? await fn(request, { params: Promise.resolve(params) }) : new Response(null, { status: 405 }); break; }
    if (!response && ['/app.js', '/app.css', '/globals.css'].includes(p)) response = new Response(await readFile(path.join(out, p.slice(1))), { headers: { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/css' } });
    if (!response && ['/brand/naumi/app-dark.svg', '/brand/naumi/symbol-black.svg'].includes(p)) response = new Response(await readFile(path.join(process.cwd(), 'public', p.slice(1))), { headers: { 'content-type': 'image/svg+xml' } });
    if (!response && ['/canvas', '/desktop', '/desktop/canvas', '/'].includes(p)) response = new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Naumi · isolated actual modules</title><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (!response) response = json({ error: `UNMAPPED_TEST_PORT ${p}` }, 404);
    record.status = response.status; res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.flushHeaders();
    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader(), cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    try { for (;;) { const v = await reader.read(); if (v.done) break; if (!res.write(Buffer.from(v.value))) await once(res, 'drain', { signal: controller.signal }); } res.end(); }
    finally { controller.signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (e) { if (controller.signal.aborted) aborts.push(req.url!); else { errors.push(String(e)); console.error('HTTP', req.url, e); } if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); } else res.destroy(); }
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1');
  await ensureCollaborationSchema(); await ensureCanvasSharingSchema();
  for (const [email, name] of [[boss, '负责人'], [author, '林夏'], [recipient, '陈舟'], [third, '周岚']]) await pool.query("INSERT INTO app_users(email,name,password_hash,renews_at,role) VALUES($1,$2,$3,now()+interval '1 year','user')", [email, name, hashPassword(password)]);
  await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'协作浏览器验收',$2,now()+interval '1 year')", [enterprise, boss]);
  await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)', [enterprise]);
  await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')", [boss]);
  for (const actor of [author, recipient, third]) await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')", [enterprise, actor, boss]);
  const png = await sharp({ create: { width: 480, height: 520, channels: 3, background: '#e4ede7' } }).composite([{ input: Buffer.from('<svg width="480" height="520"><rect x="155" y="120" width="170" height="300" rx="28" fill="#fffdf4"/><rect x="173" y="76" width="134" height="65" rx="9" fill="#6e9180"/><rect x="155" y="225" width="170" height="130" fill="#d1dfd3"/><text x="240" y="307" text-anchor="middle" font-size="58" fill="#567d68">N</text></svg>') }]).png().toBuffer();
  await writeStoredObject(png, 'image/png', 'e2e/source.png'); await registerMediaAsset('e2e/source.png', png, 'image/png', false, author, false); await writeFile(path.join(out, 'paste.png'), png);
  for (const key of [projectKey, otherProject]) { await pool.query('INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2)', [author, key]); await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'tenant',$3)", [author, key, enterprise]); await setProjectName(author, key, key === projectKey ? '春日产品方案' : '第二个项目'); }
  const tx = await pool.connect(); try {
    await tx.query('BEGIN');
    await insertSharedArtworkTx(tx, author, 'e2e-source', projectKey, { title: '产品视觉', category: 'image', status: 'completed', prompt: 'PRIVATE_SOURCE_PROMPT', image_url: '/media/e2e/source.png', parent_ids: [], parent_id: null, canvas_x: 100, canvas_y: 140, canvas_width: 260, canvas_height: 282, image_width: 480, image_height: 520 });
    for (const [id, key] of [['text-e2e', projectKey], ['text-other', otherProject]]) await insertSharedTextTx(tx, author, id, key, { title: '品牌文案', prompt: 'PRIVATE_TEXT_PROMPT', content: '原作者的独立文案', status: 'completed', canvas_x: 490, canvas_y: 140, canvas_width: 330, canvas_height: 220, source_ids: key === projectKey ? ['e2e-source'] : [], target_ids: [], product_ids: [] });
    await tx.query('COMMIT');
  } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  const groups: any[] = [];
  for (let n = 0; n < 56; n++) groups.push(await collaborationScope(author, enterprise, (tx, scope) => createConversationTx(tx, scope, { clientId: randomUUID(), kind: 'group', memberIds: [recipient], title: `分页会话 ${n + 1}` })));
  groups.sort((a, b) => b.id.localeCompare(a.id)); const last = groups.at(-1);
  await collaborationScope(author, enterprise, (tx, scope) => sendMessageTx(tx, scope, last.id, { clientId: randomUUID(), body: '最后页初始未读' }, async () => { throw Error('share not seeded'); }));
  info = { enterprise, author, recipient, third, password, projectKey, otherProject, lastId: last.id, lastTitle: last.title, firstId: groups[0].id };
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.send?.({ type: 'ready', origin: `http://127.0.0.1:${(server.address() as any).port}`, info });
}
async function close() {
  if (closed) return; closed = true;
  for (const release of releases.values()) release(); releases.clear();
  for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve()));
  await writeFile(path.join(out, 'server-evidence.json'), JSON.stringify({ calls, errors, aborts, supplierCalls, subscriptions: collaborationEventHub.size }, null, 2));
  await closeDatabasePools(); console.log(`SERVER_CLEANUP=PASS sockets=${sockets.size} supplier_calls=${supplierCalls}`); process.disconnect?.();
}
process.on('message', m => { if ((m as any)?.type === 'close') void close().catch(e => { console.error(e); process.exitCode = 1; process.disconnect?.(); }); });
main().catch(async e => { console.error(e); await closeDatabasePools(); process.exitCode = 1; process.disconnect?.(); });
