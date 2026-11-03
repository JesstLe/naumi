'use strict';
// Actual Next/CanvasClient/ReactFlow in a non-Git source snapshot. Auth, account,
// document and media responses are explicit loopback fixtures, not live proof.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict'), net = require('node:net');
const { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');
const { fixtureAccount, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', process.cwd()));
const out = path.resolve(arg('--out', 'output/canvas-read-resilience-20261103/ui'));
const baseline = args.includes('--baseline'), port = Number(arg('--port', '15343'));
const base = `http://127.0.0.1:${port}`, source = path.join(out, 'source');
const checks = [], scenarios = [], hashes = [];
let server, stream, browser;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function snapshot() {
  assert(!fs.existsSync(source), 'Use a fresh output directory for each real UI run');
  fs.mkdirSync(source, { recursive: true });
  const tracked = cp.execFileSync('git', ['ls-files', '--deduplicate', '-z'], { cwd: process.cwd() }).toString().split('\0').filter(Boolean);
  const files = [...new Set([...tracked, 'src/lib/browser-read-deadline.ts'])];
  for (const rel of files) {
    const from = path.join(root, rel); if (path.basename(rel).startsWith('.env') || !fs.existsSync(from)) continue;
    const bytes = fs.readFileSync(from), to = path.join(source, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, bytes);
    hashes.push({ path: rel, sha256: sha(bytes) });
  }
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(source, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify({ root, snapshot: source, hashes }, null, 2));
}
async function start() {
  const available = await new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
  assert(available, 'Test port already in use; do not share or stop another owner');
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|PROGRAMFILES.*|PROCESSOR.*|NUMBER_OF_PROCESSORS)$/i.test(key)) env[key] = value;
  Object.assign(env, { NODE_OPTIONS: '--max-old-space-size=4096', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_CANVAS_PERF_PROBE: '0',
    SETTINGS_SECRET: 'canvas-startup-local-fixture-no-production-secret', DATABASE_URL: '', NAUMI_VIDEO_WORKER: '0',
    NAUMI_MULTI_USER: '0', NAUMI_RELEASE_RUNTIME: '0', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
  stream = fs.openSync(path.join(out, 'NEXT.log'), 'wx');
  server = cp.spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: source, env, windowsHide: true, stdio: ['ignore', stream, stream] });
  fs.writeFileSync(path.join(out, 'SERVER.json'), JSON.stringify({ pid: server.pid, port, source }));
  const deadline = Date.now() + 180000; let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try { const r = await fetch(base + '/api/version', { signal: AbortSignal.timeout(4000) }); if (r.ok) { ready = true; break; } } catch {}
    await wait(400);
  }
  assert(ready, 'Owned Next server did not start');
  const html = await (await fetch(base + '/canvas', { signal: AbortSignal.timeout(180000) })).text();
  const assets = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')))];
  for (const asset of assets) { const r = await fetch(new URL(asset, base), { signal: AbortSignal.timeout(60000) }); assert.equal(r.status, 200); await r.arrayBuffer(); }
  fs.writeFileSync(path.join(out, 'PREWARM.json'), JSON.stringify({ htmlBytes: Buffer.byteLength(html), scriptAssets: assets.length }));
}

async function scenario(name, fault, viewport) {
  const folder = path.join(out, name); fs.mkdirSync(folder, { recursive: true });
  const account = fixtureAccount(), owner = account.user.email, rootId = 'startup-root', project = 'tree:startup-root';
  const art = { ...account.artworks[0], id: rootId, title: '已保存的商品图片', groupId: rootId, parentId: undefined, parentIds: [],
    image: '/media/startup-fixture.png', width: 512, height: 512, canvasWidth: 240, canvasHeight: 240, canvasX: 100, canvasY: 140 };
  const textNode = { id: 'text-startup-preserved', projectKey: project, title: '已保存的文字', prompt: '保留原内容', content: '启动恢复后仍然保留的文字内容',
    status: 'completed', canvasX: 420, canvasY: 140, width: 280, height: 160, sourceIds: [], targetIds: [], productIds: [], createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
  const textKey = `naumi:canvas-text-nodes:${owner}`, textRaw = JSON.stringify([textNode]);
  const operationId = '00000000-0000-4000-8000-000000000731';
  const pendingKey = 'naumi:imagegen-pending:v1:' + JSON.stringify([owner, 'personal', project, 'node:' + rootId]);
  const pendingRaw = JSON.stringify({ version: 1, owner, workspace: 'personal', project, actionKey: 'node:' + rootId, operationId,
    request: { operationId, entry: 'canvas', inputs: [], publicModelId: 'gpt-image-2', variants: 1 }, authorizedCredits: 6,
    confirmationRequired: false, accepted: 'unknown', context: { workspace: 'personal', projectContext: project } });
  const state = { name, calls: [], errors: [], forbidden: [], external: [], promptRequests: [], documentWrites: [] };
  const common = commonFixture({ account, artworks: [art], state });
  const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#cbdde9' } }).png().toBuffer();
  const context = await browser.newContext({ viewport }), page = await context.newPage();
  page.setDefaultTimeout(15000); page.on('pageerror', error => state.errors.push(error.message));
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname, method = request.method();
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) { state.external.push(url.origin); return route.abort(); }
    if (p.startsWith('/api/')) state.calls.push({ path: p, method });
    if (p === '/media/startup-fixture.png' || p === '/api/download') return route.fulfill({ contentType: 'image/png', body: bytes });
    if (p === '/api/account') return json(route, { ...account, artworks: [art] });
    if (p === '/api/projects') return json(route, { names: { [project]: '恢复验收画布' } });
    if (p === '/api/canvas/text-nodes' && method === 'GET') return json(route, { persisted: true, nodes: [textNode] });
    if (p === '/api/canvas/text-nodes') {
      const body = request.postDataJSON(); state.documentWrites.push({ method, body });
      // Existing successful-load auto-height persistence is not a regression.
      // It may resize this known node, never save an empty or replacement document.
      if (method !== 'POST' || body.id !== textNode.id || body.content !== textNode.content || body.projectKey !== project) {
        state.forbidden.push({ path: p, method, kind: 'unexpected-document-write', body });
      }
      return json(route, { ok: true, persisted: true });
    }
    if (await common.handle(route)) return;
    if (/^\/api\/canvas\/(video|director|character|scene|audio|timeline)-nodes$/.test(p)) return json(route, { persisted: true, nodes: [] });
    if (p === '/api/media/image-cache') return json(route, { account: owner, results: Object.fromEntries(request.postDataJSON().sources.map(source => [source, { source, account: owner, version: sha(bytes), fetchUrl: '/media/startup-fixture.png', bytes: bytes.length, contentType: 'image/png' }])) });
    if (p === '/api/artworks/get') return json(route, { artworks: [art] });
    if (/^\/api\/(imagegen|generate-image|admin\/)/.test(p)) { state.forbidden.push({ path: p, method }); return route.abort(); }
    if (p.startsWith('/api/')) return json(route, { ok: true, persisted: true, items: [], enterprises: [], notifications: [], unread: 0 });
    return route.continue();
  });
  await context.addInitScript(({ fault, textKey, textRaw, pendingKey, pendingRaw }) => {
    localStorage.setItem(textKey, textRaw); sessionStorage.setItem(pendingKey, pendingRaw);
    window.__startupReadFixture = { active: !!fault, fault, hits: [], aborted: 0, taskRaw: pendingRaw };
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => nativeTimeout(fn, ms === 30000 ? 900 : ms === 35000 ? 1200 : ms, ...rest);
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      const state = window.__startupReadFixture, method = (init?.method || 'GET').toUpperCase();
      if (state.active && state.fault && method === 'GET' && url.pathname === state.fault.path) {
        state.hits.push({ path: url.pathname, mode: state.fault.mode });
        init?.signal?.addEventListener('abort', () => state.aborted++, { once: true });
        if (state.fault.mode === 'headers') return new Promise(() => {}); // Deliberately ignores AbortSignal.
        if (state.fault.mode === 'body') return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"partial":')); } }), { headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ error: 'fixture read failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, init);
    };
  }, { fault, textKey, textRaw, pendingKey, pendingRaw });
  try {
    await page.goto(base + '/canvas?project=' + encodeURIComponent(project), { waitUntil: 'domcontentloaded', timeout: 180000 });
    const node = page.locator(`.react-flow__node[data-id="${rootId}"]`), text = page.locator(`.react-flow__node[data-id="${textNode.id}"]`);
    if (fault) {
      await page.waitForFunction(() => window.__startupReadFixture.hits.length > 0);
      if (baseline) {
        await wait(1700); assert.equal(await page.getByRole('button', { name: '重新加载', exact: true }).count(), 0);
        checks.push(name + ':BASELINE_NO_RECOVERY');
      } else {
        await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
        const persisted = await page.evaluate(({ textKey, pendingKey }) => ({ text: localStorage.getItem(textKey), task: sessionStorage.getItem(pendingKey), fault: window.__startupReadFixture }), { textKey, pendingKey });
        assert.equal(persisted.text, textRaw, 'Failed init must not overwrite saved local text with []');
        assert.equal(persisted.task, pendingRaw, 'Original UNKNOWN receipt must stay byte-exact');
        assert.equal(state.documentWrites.length, 0, 'Failed initialization must not persist an empty document');
        assert.equal(await node.count(), 0, 'Failed init must not pretend to be loaded');
        await page.screenshot({ path: path.join(folder, 'read-error.png') });
        await page.evaluate(() => { window.__startupReadFixture.active = false; });
        await page.getByRole('button', { name: '重新加载', exact: true }).click();
        checks.push(name + ':BOUNDED_ERROR_PRESERVES_DRAFT_AND_RECEIPT');
      }
    }
    if (!baseline || !fault) {
      await node.waitFor({ timeout: 45000 }); await text.waitFor({ timeout: 45000 });
      await expect(text).toContainText(textNode.content);
      await expect.poll(async () => page.evaluate(id => !!document.querySelector(`.react-flow__node[data-id="${id}"] img`)?.naturalWidth, rootId)).toBe(true);
      assert.equal(await page.getByRole('button', { name: '重新加载', exact: true }).count(), 0);
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), pendingKey), pendingRaw);
      const persisted = JSON.parse(await page.evaluate(key => localStorage.getItem(key), textKey));
      assert.equal(persisted[0].id, textNode.id); assert.equal(persisted[0].content, textNode.content);
      await page.screenshot({ path: path.join(folder, 'recovered.png') });
      checks.push(name + ':ACTUAL_IMAGE_AND_TEXT_RECOVERED');
    }
    assert.deepEqual(state.errors, []); assert.deepEqual(state.external, []); assert.deepEqual(state.forbidden, []);
    state.fault = await page.evaluate(() => window.__startupReadFixture);
    scenarios.push(state); fs.writeFileSync(path.join(folder, 'RESULT.json'), JSON.stringify({ status: baseline ? 'REPRODUCED' : 'PASS', ...state }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'ERROR.json'), JSON.stringify({ error: error.stack, ...state, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
    throw error;
  } finally { await context.close(); }
}

(async () => {
  let error;
  try {
    snapshot(); await start(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    const desktop = { width: 1440, height: 900 }, mobile = { width: 390, height: 844 };
    const cases = baseline ? [['account-header', { path: '/api/account', mode: 'headers' }, desktop]] : [
      ['normal-desktop', null, desktop], ['account-header', { path: '/api/account', mode: 'headers' }, desktop],
      ['account-body', { path: '/api/account', mode: 'body' }, desktop], ['projects-header', { path: '/api/projects', mode: 'headers' }, desktop],
      ['text-body', { path: '/api/canvas/text-nodes', mode: 'body' }, desktop], ['text-failure-mobile', { path: '/api/canvas/text-nodes', mode: 'status' }, mobile],
    ];
    for (const entry of cases) await scenario(...entry);
  } catch (e) { error = e.stack; console.error(error); }
  finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === 'win32') cp.spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true }); else server.kill('SIGTERM');
      await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('close', resolve); setTimeout(resolve, 10000); } });
    }
    if (stream !== undefined) fs.closeSync(stream);
    let closed = false; try { await fetch(base + '/api/version', { signal: AbortSignal.timeout(1000) }); } catch { closed = true; }
    const status = !error && closed && checks.length ? baseline ? 'REPRODUCED' : 'PASS' : 'FAIL';
    const exit = status === 'PASS' ? 0 : 1, stdout = `CANVAS_STARTUP_UI=${status} CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 SERVER_CLOSED=${Number(closed)} EXIT=${exit}`;
    fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status, stdout, exit, checks, scenarios, error, source, sourceHashes: hashes, serverClosed: closed }, null, 2));
    console.log(stdout); process.exitCode = exit;
  }
})();
