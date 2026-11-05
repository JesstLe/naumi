#!/usr/bin/env node
'use strict';
/**
 * Full Next + unchanged CanvasClient + real Chromium input. Only HTTP/media,
 * quote/receipt and persistence boundaries are fixtures. This script never
 * starts a server and blocks every non-loopback request and unhandled mutation.
 *
 * node scripts/verify-canvas-text-prompt-reuse-ui.cjs --base http://127.0.0.1:PORT --out ABS
 * Add --baseline to reproduce ca00's missing explicit polish/linked input and
 * history-to-draft overwrite; the expected reproduced result exits 1.
 */
const { chromium, expect: rawExpect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const sharp = require('sharp');
const { fixtureAccount, requireLoopback, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const expect = rawExpect.configure({ timeout: 20000 });
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = arg('--base', process.env.CANVAS_TEXT_PROMPT_REUSE_URL || 'http://127.0.0.1:15251').replace(/\/$/, '');
const out = path.resolve(arg('--out', process.env.CANVAS_TEXT_PROMPT_REUSE_OUT || 'output/canvas-text-prompt-reuse-ui'));
const sourceRoot = path.resolve(arg('--source-root', process.cwd())), baseline = args.includes('--baseline');
requireLoopback(base); fs.mkdirSync(out, { recursive: true });
const clone = value => JSON.parse(JSON.stringify(value)), hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourcePaths = ['src/components/canvas/canvas-client.tsx', 'src/components/canvas/linked-text-input.tsx',
  'src/lib/canvas/linked-image-text.ts', 'src/lib/canvas/text-generation-input.ts', 'src/app/api/canvas/text-generate/route.ts'];
const sources = sourcePaths.map(relative => ({ path: relative, sha256: fs.existsSync(path.join(sourceRoot, relative)) ? hash(path.join(sourceRoot, relative)) : null }));
const rootId = 'regeneration-root', textId = 'text-reuse-main', nearId = 'text-reuse-near', project = 'tree:' + rootId;
const firstBody = '青色玻璃瓶置于浅木桌上，保留瓶身商标。', nearBody = '附近未连线的红色汽车，不得混入。';
const oldInstruction = '历史写作要求：改成七言诗，不用于正文润色或图片输入。';
const polished = '浅木桌上的青色玻璃瓶映着柔和日光，瓶身商标清晰保留。';
const checks = [], scenarios = [];
const check = name => { checks.push(name); console.log('CHECK=' + name); };
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function createScenario(browser, name, { emptyText = false } = {}) {
  const folder = path.join(out, name); fs.mkdirSync(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1740, height: 1100 }, locale: 'zh-CN', serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  const account = fixtureAccount(), now = new Date().toISOString();
  account.user = { ...account.user, email: name + '@prompt-reuse.fixture.test', name: '正文与提示词验收', creditsUsed: 0 };
  const root = { ...account.artworks[0], id: rootId, groupId: rootId, title: '原始上传图', prompt: '',
    source: 'upload', image: '/media/reuse-original.png', parentId: undefined, parentIds: [],
    width: 512, height: 512, canvasWidth: 300, canvasHeight: 300, canvasX: 570, canvasY: 110,
    canvasImageRevision: 0, canvasImageVersionId: 'initial', ratio: '1:1', resolution: '1K' };
  const arts = [root], original = clone(root), quotes = new Map(), jobs = new Map();
  const texts = [
    { id: textId, title: '画面正文', content: emptyText ? '' : firstBody, prompt: oldInstruction, status: emptyText ? 'idle' : 'completed',
      projectKey: project, sourceIds: [], targetIds: [rootId], productIds: [], canvasX: 130, canvasY: 110, width: 330, height: 220, createdAt: now, updatedAt: now },
    { id: nearId, title: '附近未连接', content: nearBody, prompt: '', status: 'completed', projectKey: project,
      sourceIds: [], targetIds: [], productIds: [], canvasX: 570, canvasY: 500, width: 330, height: 220, createdAt: now, updatedAt: now },
  ];
  const versions = [{ id: 'initial', image: original.image, prompt: '', width: 512, height: 512, ratio: '1:1', resolution: '1K', createdAt: now },
    { id: 'historical-version', image: '/media/reuse-historical.png', prompt: '不可覆盖草稿的历史提示词', width: 512, height: 512, ratio: '1:1', resolution: '1K', createdAt: now }];
  const state = { name, requests: [], textWrites: [], textGenerations: [], plans: [], posts: [], gets: [], history: [], completed: [],
    errors: [], external: [], forbidden: [], fallbackReads: [], screenshots: [], mediaRequests: [], mediaFrames: [], textMode: 'success', failTextSave: false, holdTextSave: false };
  const common = commonFixture({ account, artworks: arts, state });
  let releaseSave;
  const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#e3eee8' } })
    .composite([{ input: Buffer.from('<svg width="512" height="512"><rect x="160" y="105" width="192" height="300" rx="28" fill="#5f9c9b"/><rect x="190" y="72" width="132" height="65" rx="12" fill="#c5a77a"/><rect x="184" y="226" width="144" height="100" rx="8" fill="#fff9ed"/></svg>') }]).png().toBuffer();
  const pngHash = crypto.createHash('sha256').update(png).digest('hex');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(body) });
  const saved = id => texts.find(n => n.id === id);
  page.on('pageerror', error => state.errors.push(error.stack || error.message));
  await context.addInitScript(({ project }) => { localStorage.setItem('nv:canvas:last', project); localStorage.setItem('nv:canvas:bg', 'light'); localStorage.setItem('naumi:locale', 'zh'); }, { project });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url()), p = u.pathname, method = request.method();
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['blob:', 'data:'].includes(u.protocol)) { state.external.push({ origin: u.origin, path: p }); return route.abort(); }
    if (p.startsWith('/media/reuse-') || p === '/api/download') {
      state.mediaRequests.push({ url: request.url(), bytes: png.length, sha256: pngHash, contentType: 'image/png' });
      return route.fulfill({ contentType: 'image/png', body: png });
    }
    if (!p.startsWith('/api/')) return route.continue();
    let payload = null; try { payload = request.postDataJSON(); } catch { /* multipart sentinels remain below */ }
    state.requests.push({ method, path: p, query: u.search, body: payload });
    if (p === '/api/media/image-cache') return json(route, { account: account.user.email, results: Object.fromEntries(payload.sources.map(source => [source,
      { source, account: account.user.email, version: pngHash, fetchUrl: source, bytes: png.length, contentType: 'image/png' }])) });
    if (p === '/api/account') return json(route, { ...account, artworks: arts });
    if (p === '/api/models' && ['canvas.text-generate', 'canvas.assistant', 'canvas.ocr'].includes(u.searchParams.get('feature'))) return json(route,
      { managed: true, supported: true, available: true, version: 1, feature: u.searchParams.get('feature'), models: [{ id: 'fixture-text', label: '文字模型', modality: 'text', supportsVision: true }], defaultModelId: 'fixture-text' });
    if (p === '/api/text-models') return json(route, { models: ['fixture-text'], defaultModel: 'fixture-text' });
    if (p === '/api/canvas/text-nodes') {
      if (method === 'POST') {
        state.textWrites.push(clone(payload));
        if (state.holdTextSave && (payload.id === textId || payload.nodes?.some(n => n.id === textId))) await new Promise(resolve => { releaseSave = resolve; });
        if (state.failTextSave) return json(route, { error: 'fixture 正文保存失败' }, 500);
        for (const value of payload.nodes || [payload]) { const existing = saved(value.id); if (existing) Object.assign(existing, value); else texts.push(clone(value)); }
        return json(route, { persisted: true, node: saved(payload.id), nodes: texts });
      }
      return json(route, { persisted: true, nodes: texts });
    }
    if (p === '/api/canvas/text-generate') {
      state.textGenerations.push(clone(payload));
      if (state.textMode === 'failure') return json(route, { error: 'fixture 润色结果未完整返回', code: 'TEXT_OUTPUT_LIMIT' }, 502);
      return json(route, { text: polished, model: 'fixture-text' });
    }
    if (await common.handle(route)) return;
    if (/^\/api\/canvas\/(video|director|character|scene|audio|timeline)-nodes$/.test(p)) return json(route, { persisted: true, nodes: [] });
    if (p === '/api/imagegen/inputs') return json(route, { artworkId: 'fixture-input-' + state.plans.length, url: original.image, width: 512, height: 512 });
    if (p === '/api/imagegen/plan') {
      assert.equal(method, 'POST'); const id = uuid(state.plans.length + 1), credits = 6 * (payload.variants || 1);
      state.plans.push(clone(payload)); quotes.set(id, { request: clone(payload), credits });
      return json(route, { request: payload, intent: { operation: payload.inputs.length ? 'edit' : 'generate', background: null },
        steps: [{ key: 'generate', operation: payload.inputs.length ? 'edit' : 'generate', credits }], warnings: [], confirmationRequired: false,
        totalCredits: credits, billingVersion: 1, modelVersion: 1, quote: { id } });
    }
    if (p === '/api/imagegen' && method === 'POST') {
      const quote = quotes.get(payload.quoteId); assert(quote, 'image submission uses its exact frozen quote'); assert.equal(payload.operationId, quote.request.operationId);
      state.posts.push(clone(payload)); if (!jobs.has(payload.operationId)) jobs.set(payload.operationId, { request: clone(quote.request), status: 'pending', images: [], chargedCredits: 0, credits: quote.credits });
      return json(route, { operationId: payload.operationId, jobId: 'imagegen-' + payload.operationId, status: 'pending' });
    }
    if (p === '/api/imagegen' && method === 'GET') {
      const id = u.searchParams.get('operationId'), job = jobs.get(id); state.gets.push({ path: p, id });
      if (!job) return json(route, { error: 'fixture task not found' }, 404);
      return json(route, { operationId: id, jobId: 'imagegen-' + id, status: job.status === 'done' ? 'succeeded' : 'pending', stage: job.status === 'done' ? 'done' : 'generating',
        artifacts: job.images.map(image => ({ artworkId: image.id, url: image.url, width: image.width, height: image.height })),
        canvasAttachment: job.attachment, chargedCredits: job.chargedCredits, billingStatus: 'confirmed' });
    }
    if (p === '/api/generate-image' && method === 'GET') {
      const id = (u.searchParams.get('job') || '').replace(/^imagegen-/, ''), job = jobs.get(id); state.gets.push({ path: p, id });
      if (!job) return json(route, { error: 'fixture task not found' }, 404);
      return json(route, { status: job.status, operationStatus: job.status === 'done' ? 'succeeded' : 'pending', images: job.images, canvasAttachment: job.attachment,
        creditsUsed: job.chargedCredits, user: account.user });
    }
    if (p === '/api/artworks/get') return json(route, { artworks: arts.filter(art => (u.searchParams.get('ids') || '').split(',').includes(art.id)) });
    if (p === '/api/artworks/position') {
      const art = arts.find(art => art.id === payload.id); if (art && !(payload.mode === 'initialize' && art.canvasX != null && art.canvasY != null)) Object.assign(art, { canvasX: payload.x, canvasY: payload.y });
      return json(route, { ok: true });
    }
    if (p === '/api/canvas/image-versions') return json(route, { image: root.image, currentVersionId: root.canvasImageVersionId, revision: root.canvasImageRevision, versions });
    if (p === '/api/canvas/history') {
      state.history.push(clone(payload));
      for (const op of payload.operations || []) {
        if (op.type === 'text-patch') Object.assign(saved(op.id), op.fields);
        else if (op.type === 'text-restore') { const old = saved(op.node.id); if (old) Object.assign(old, op.node); else texts.push(clone(op.node)); }
        else if (op.type === 'text-delete') { const i = texts.findIndex(n => n.id === op.id); if (i >= 0) texts.splice(i, 1); }
        else if (op.type === 'image-version') {
          assert.equal(op.id, rootId); assert.equal(op.expectedImage, root.image); assert.equal(op.expectedRevision, root.canvasImageRevision);
          const version = versions.find(v => v.id === op.versionId); assert(version, 'selected version exists');
          Object.assign(root, { image: version.image, prompt: version.prompt, canvasImageVersionId: version.id, canvasImageRevision: root.canvasImageRevision + 1 });
        } else if (op.type === 'position' && saved(op.id)) Object.assign(saved(op.id), { canvasX: op.x, canvasY: op.y });
      }
      // The refactored history route returns canonical same-transaction receipts.
      // Mirror saveCanvasHistory rather than leaving the real document owner stale.
      const artworkIds = [...new Set((payload.operations || []).filter(op => op.type === 'image-version').map(op => op.id))];
      return json(route, { ok: true, persisted: true, artworkIds, artworkNodes: artworkIds.map(id => ({visible:true,node:clone(arts.find(art=>art.id===id))})) });
    }
    if (!['GET', 'HEAD'].includes(method)) { state.forbidden.push({ method, path: p, payload }); return json(route, { error: 'unhandled mutation sentinel', code: 'FIXTURE_UNHANDLED_MUTATION' }, 409); }
    state.fallbackReads.push({ method, path: p });
    return json(route, { ok: true, persisted: true, items: [], messages: [], tasks: [], workflows: [], records: [], nodes: [], settings: {} });
  });
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const textDock = () => page.getByTestId('text-node-dock'), imageDock = () => page.getByTestId('image-node-dock');
  const body = () => textDock().getByRole('textbox', { name: '文字内容', exact: true });
  const cardBody = () => node(textId).getByRole('textbox', { name: '文字内容', exact: true });
  const editor = () => page.getByRole('textbox', { name: '节点提示词', exact: true }), generate = () => page.getByTestId('generation-submit-action');
  async function screenshot(label, awaitDecoded = true) {
    // Task receipt completion precedes CachedImage authorization/decode. Wait
    // for the actual visible <img> frames, not merely for a fixture task flag.
    const frames = () => page.locator('.react-flow__node img, [data-testid="image-node-dock"] img, [data-testid="pending-node-dock"] img').evaluateAll(images => images
      .filter(image => { const r = image.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; })
      .map(image => ({ src: image.currentSrc || image.getAttribute('src'), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        denied: image.getAttribute('data-browser-image-denied'), variant: image.getAttribute('data-media-variant'), nodeId: image.closest('.react-flow__node')?.getAttribute('data-id') || null })));
    if (awaitDecoded) await expect.poll(async () => (await frames()).every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.denied !== 'true'),
      { timeout: 30000, message: label + ': every viewport-visible node/composer image must really decode' }).toBe(true);
    state.mediaFrames.push({ label, images: await frames() });
    const file = path.join(folder, label + '.png'); await page.screenshot({ path: file }); state.screenshots.push(file);
  }
  async function open(selected = rootId) {
    await page.goto(base + '/canvas?project=' + encodeURIComponent(project), { waitUntil: 'domcontentloaded', timeout: 180000 });
    await node(rootId).waitFor({ timeout: 120000 }); await node(textId).waitFor({ timeout: 120000 });
    const closeAssistant = page.getByRole('button', { name: '收起助手', exact: true }); if (await closeAssistant.isVisible()) await closeAssistant.click();
    await select(selected);
  }
  async function select(id) {
    if (id.startsWith('text-')) { await node(id).getByTestId('text-node-title').click({ position: { x: 50, y: 14 } }); await expect(textDock()).toBeVisible(); }
    else { await node(id).click({ position: { x: 65, y: 65 } }); await expect(editor()).toBeVisible(); }
  }
  async function submit(prompt) { const before = state.posts.length; if (prompt !== undefined) await editor().fill(prompt); await generate().click(); await expect.poll(() => state.posts.length, { timeout: 45000 }).toBe(before + 1); await expect(generate()).toBeEnabled(); return state.posts[before].operationId; }
  function complete(id) {
    const job = jobs.get(id); assert(job); if (job.status === 'done') return job;
    const index = [...jobs.keys()].indexOf(id) + 1, target = job.request.canvasTarget && arts.find(art => art.id === job.request.canvasTarget.nodeId);
    const art = { ...original, id: 'reuse-result-' + index, title: '生成结果 ' + index, prompt: job.request.prompt,
      source: target ? 'canvas-node-version' : 'generate', image: '/media/reuse-result-' + index + '.png', parentId: target?.id || job.request.sourceNodeId || undefined,
      groupId: target?.groupId || rootId, canvasX: null, canvasY: null, canvasImageVersionId: 'initial', canvasImageRevision: 0 };
    arts.push(art);
    if (target) {
      const previousImage = target.image, previousVersionId = target.canvasImageVersionId;
      const applied = target.canvasImageRevision === job.request.canvasTarget.expectedRevision && target.image === job.request.canvasTarget.expectedImage;
      versions.unshift({ id: art.id, image: art.image, prompt: art.prompt, width: 512, height: 512, ratio: '1:1', resolution: '1K', createdAt: new Date().toISOString() });
      if (applied) Object.assign(target, { image: art.image, prompt: art.prompt, canvasImageVersionId: art.id, canvasImageRevision: target.canvasImageRevision + 1 });
      job.attachment = { nodeId: target.id, applied, previousVersionId, previousImage, versionId: art.id, revision: target.canvasImageRevision, ...(!applied ? { reason: 'changed' } : {}) };
    }
    job.images = [{ id: art.id, url: art.image, width: 512, height: 512 }]; job.status = 'done'; job.chargedCredits = job.credits;
    state.completed.push({ id, prompt: art.prompt, imageId: art.id, attachment: clone(job.attachment || null) }); return job;
  }
  async function awaitCleared(id) { await expect.poll(() => page.evaluate(id => Object.keys(sessionStorage).filter(k => k.startsWith('naumi:imagegen-pending:')).some(k => JSON.parse(sessionStorage.getItem(k)).operationId === id), id), { timeout: 45000 }).toBe(false); }
  async function selectVersion(id) { await page.getByTestId('image-version-control').click(); await page.locator(`[data-version-id="${id}"]`).click(); await expect.poll(() => root.canvasImageVersionId).toBe(id); await expect(page.getByRole('button', { name: '关闭历史版本', exact: true })).toHaveCount(0); }
  const document = () => common.prompts.get(project + '|' + rootId)?.document;
  const report = () => ({ ...state, texts: clone(texts), artworks: clone(arts), versions: clone(versions), jobs: Object.fromEntries(jobs), promptDocuments: Object.fromEntries(common.prompts), realSupplierCalls: 0, productionActions: 0 });
  async function finish() { assert.deepEqual(state.errors, []); assert.deepEqual(state.external, []); assert.deepEqual(state.forbidden, []); const result = report(); scenarios.push(result); fs.writeFileSync(path.join(folder, 'RESULT.json'), JSON.stringify(result, null, 2)); await context.close(); }
  async function fail(error) { await screenshot('failure', false).catch(() => {}); fs.writeFileSync(path.join(folder, 'ERROR.json'), JSON.stringify({ error: error.stack, ...report(), body: await page.locator('body').innerText().catch(() => '') }, null, 2)); state.holdTextSave = false; releaseSave?.(); await context.close(); }
  return { page, context, state, texts, saved, root, arts, versions, jobs, document, node, textDock, imageDock, body, cardBody, editor, generate,
    open, select, submit, complete, awaitCleared, selectVersion, screenshot, finish, fail, releaseSave: () => { state.holdTextSave = false; releaseSave?.(); releaseSave = undefined; }, saveHeld: () => typeof releaseSave === 'function' };
}

async function notebook(browser) {
  const s = await createScenario(browser, 'notebook', { emptyText: true });
  try {
    await s.open(textId);
    if (baseline) {
      assert.equal(await s.textDock().getByRole('button', { name: '润色文字', exact: true }).count(), 0);
      check('BASELINE_BODY_HAS_NO_EXPLICIT_POLISH_ARROW'); await s.screenshot('baseline-no-polish-arrow'); await s.finish(); return;
    }
    // Use the actual Add entry rather than claiming a seeded node proves creation.
    await s.page.getByTestId('canvas-add-node-button').click();
    await s.page.getByTestId('canvas-create-menu').locator('[data-action="text"]').click();
    await expect.poll(() => s.texts.length).toBe(3);
    const createdId = s.texts.find(n => ![textId, nearId].includes(n.id)).id;
    await expect(s.body()).toHaveValue(''); await s.body().fill(firstBody);
    await expect.poll(() => s.saved(createdId).content).toBe(firstBody);
    assert.equal(s.state.textGenerations.length, 0); assert.equal(s.state.posts.length, 0);
    check('NEW_TEXT_NODE_TYPING_AUTOSAVES_WITH_ZERO_MODEL_REQUESTS');
    await s.select(textId); await s.body().fill(firstBody); await s.body().press('Control+Enter');
    await expect.poll(() => s.saved(textId).content).toBe(firstBody);
    assert.equal(s.state.textGenerations.length, 0); check('BODY_CTRL_ENTER_SAVES_ONLY');
    await s.screenshot('notebook-auto-saved');
    s.state.textMode = 'failure';
    await s.textDock().getByRole('button', { name: '润色文字', exact: true }).click();
    await expect.poll(() => s.state.textGenerations.length).toBe(1);
    const request = s.state.textGenerations[0]; assert.equal(request.content, firstBody);
    assert(request.prompt.trim()); assert.notEqual(request.prompt, oldInstruction); assert.deepEqual(request.sourceIds, []);
    await expect(s.node(textId).getByRole('alert')).toContainText('润色结果未完整返回'); await expect(s.body()).toHaveValue(firstBody);
    assert.equal(s.saved(textId).prompt, oldInstruction, 'default polish does not replace the reusable custom writing instruction');
    check('EXPLICIT_BODY_POLISH_USES_CURRENT_BODY_NOT_OLD_INSTRUCTION_FAILURE_KEEPS_TEXT');
    s.state.textMode = 'success'; await s.textDock().getByRole('button', { name: '继续原任务', exact: true }).click();
    await expect.poll(() => s.state.textGenerations.length).toBe(2); assert.deepEqual(s.state.textGenerations[1],request,'retry keeps the original frozen text request'); await expect.poll(() => s.saved(textId).content).toBe(polished);
    await expect(s.body()).toHaveValue(polished); await s.screenshot('explicit-polish-result');
    await s.node(textId).getByTestId('text-node-title').click({ position: { x: 45, y: 14 } }); await s.page.keyboard.press('Control+z');
    await expect.poll(() => s.saved(textId).content).toBe(firstBody); await expect(s.body()).toHaveValue(firstBody);
    check('POLISH_SUCCESS_PERSISTS_AND_CANVAS_UNDO_RESTORES_PRIOR_BODY');
    await s.body().fill(''); await s.textDock().getByRole('tab', { name: 'AI 写作', exact: true }).click();
    await expect.poll(() => s.saved(textId).content).toBe('');
    await s.textDock().getByRole('tab', { name: '正文', exact: true }).click();
    await expect(s.textDock().getByRole('button', { name: '润色文字', exact: true })).toBeDisabled();
    assert.equal(s.state.textGenerations.length, 2); await expect(s.body()).toHaveValue('');
    check('EMPTY_BODY_DISABLED_NO_OLD_INSTRUCTION_FALLBACK');
    await s.finish();
  } catch (error) { await s.fail(error); throw error; }
}

async function existingImage(browser) {
  const s = await createScenario(browser, 'existing-image');
  try {
    await s.open(); await s.editor().fill('源图持续使用的草稿 P2'); await expect.poll(() => s.document()?.prompt).toBe('源图持续使用的草稿 P2');
    if (baseline) {
      assert.equal(await s.imageDock().getByTestId('linked-text-input').count(), 0); check('BASELINE_CONNECTED_BODY_NOT_VISIBLE_IN_IMAGE_COMPOSER');
      await s.selectVersion('historical-version'); await expect(s.editor()).toHaveText('不可覆盖草稿的历史提示词');
      await s.selectVersion('initial'); await expect(s.editor()).toHaveText('');
      await expect.poll(() => s.document()?.prompt).toBe('');
      assert.equal(s.root.prompt, ''); check('BASELINE_ORIGINAL_VERSION_OVERWRITES_REUSABLE_DRAFT_WITH_EMPTY_PROMPT');
      const id = await s.submit('图片自己的补充 P1'); assert.equal(s.jobs.get(id).request.prompt, '图片自己的补充 P1');
      assert.equal(s.jobs.get(id).request.prompt.includes(firstBody), false); check('BASELINE_IMAGE_GENERATION_OMITS_ACTUALLY_CONNECTED_BODY');
      s.complete(id); await s.awaitCleared(id); await s.screenshot('baseline-linked-text-omitted'); await s.finish(); return;
    }
    const linked = s.imageDock().getByTestId('linked-text-input'); await expect(linked).toBeVisible(); await linked.locator('summary').click();
    await expect(linked).toContainText(firstBody); await expect(linked).not.toContainText(nearBody); await expect(linked).not.toContainText(oldInstruction);
    check('IMAGE_COMPOSER_SHOWS_DIRECT_LINKED_BODY_NOT_NEIGHBOUR_OR_WRITING_INSTRUCTION');
    await s.editor().fill('图片自己的补充 P1');
    const latestBody = firstBody + '\n背景改成米白色。'; s.state.holdTextSave = true;
    await s.cardBody().fill(latestBody); await s.generate().click();
    await expect.poll(s.saveHeld).toBe(true); await s.page.waitForTimeout(300);
    assert.equal(s.state.posts.length, 0); assert.equal(s.state.plans.length, 0); assert.notEqual(s.saved(textId).content, latestBody);
    s.releaseSave(); await expect.poll(() => s.state.posts.length, { timeout: 45000 }).toBe(1);
    const firstId = s.state.posts[0].operationId, firstPrompt = latestBody + '\n\n图片自己的补充 P1';
    assert.equal(s.jobs.get(firstId).request.prompt, firstPrompt); assert.equal(s.state.plans.length, 1);
    assert.equal(s.state.requests.some(r => r.path === '/api/generate-image' && r.method === 'POST'), false, 'merged input retains the frozen imagegen path');
    await expect(linked).toContainText(latestBody); check('IMAGE_SUBMISSION_WAITS_FOR_TEXT_SAVE_ACK_THEN_FREEZES_VISIBLE_LATEST_BODY_PLUS_DRAFT');
    await s.editor().fill('源图持续使用的草稿 P2'); await expect.poll(() => s.document()?.prompt).toBe('源图持续使用的草稿 P2');
    assert.equal(s.state.posts.length, 1); s.complete(firstId); await s.awaitCleared(firstId);
    await expect(s.editor()).toHaveText('源图持续使用的草稿 P2'); assert.equal(s.arts.find(a => a.id === 'reuse-result-1').prompt, firstPrompt);
    check('RESULT_FREEZES_P1_WHILE_SOURCE_KEEPS_NEW_EDIT_P2_NO_IMPLICIT_SUBMIT');
    await s.screenshot('linked-body-result-and-reusable-draft'); await s.open();
    await expect(s.editor()).toHaveText('源图持续使用的草稿 P2'); check('SOURCE_DRAFT_SURVIVES_FULL_PAGE_RELOAD');
    await s.selectVersion('initial'); await expect(s.editor()).toHaveText('源图持续使用的草稿 P2'); assert.equal(s.root.prompt, '');
    await expect(s.page.locator('[data-tool="undo"]')).toBeEnabled();
    await s.node(rootId).click({ position: { x: 65, y: 65 } }); await s.page.keyboard.press('Control+z');
    await expect.poll(() => s.root.canvasImageVersionId).toBe('reuse-result-1'); await expect(s.editor()).toHaveText('源图持续使用的草稿 P2');
    // A boundary fixture updates root before the real response/mergeWorks
    // completes. The product's enabled Redo control proves both the async
    // history operation and redoStack update have reached the UI.
    await expect(s.page.locator('[data-tool="redo"]')).toBeEnabled();
    const beforeRedo = s.state.history.length;
    await s.page.keyboard.press('Control+Shift+z');
    await expect.poll(() => s.state.history.length).toBe(beforeRedo + 1);
    await expect.poll(() => s.root.canvasImageVersionId).toBe('initial');
    await expect(s.page.locator('[data-tool="undo"]')).toBeEnabled();
    await expect(s.editor()).toHaveText('源图持续使用的草稿 P2'); await expect.poll(() => s.document()?.prompt).toBe('源图持续使用的草稿 P2');
    check('ORIGINAL_VERSION_SELECTION_UNDO_REDO_NEVER_OVERWRITES_SOURCE_DRAFT_OR_UPLOAD_PROVENANCE');
    const secondId = await s.submit(); assert.notEqual(secondId, firstId);
    assert.equal(s.jobs.get(secondId).request.prompt, latestBody + '\n\n源图持续使用的草稿 P2');
    assert.equal(s.arts.find(a => a.id === 'reuse-result-1').prompt, firstPrompt);
    s.complete(secondId); await s.awaitCleared(secondId); check('REPEATED_GENERATION_FREEZES_P2_WITHOUT_CHANGING_FIRST_RESULT_P1');
    await s.editor().fill(''); await expect.poll(() => s.document()?.prompt).toBe(''); await s.open(); await expect(s.editor()).toHaveText('');
    check('EXPLICIT_EMPTY_SOURCE_DRAFT_SURVIVES_RELOAD_WITHOUT_HISTORY_REVIVAL');
    await s.cardBody().fill(''); await expect.poll(() => s.saved(textId).content).toBe(''); await s.editor().fill('只有新的图片补充');
    const thirdId = await s.submit(); assert.equal(s.jobs.get(thirdId).request.prompt, '只有新的图片补充');
    s.complete(thirdId); await s.awaitCleared(thirdId); check('CLEARED_LINKED_BODY_IS_NOT_REPLACED_BY_OLD_INSTRUCTION_OR_OLD_BODY');
    // An acknowledged failed body save must block before even a new quote is created.
    s.state.failTextSave = true; await s.cardBody().fill('本次正文保存失败，不得提交');
    const postsBefore = s.state.posts.length, plansBefore = s.state.plans.length, writesBefore = s.state.textWrites.length;
    await s.generate().click(); await expect.poll(() => s.state.textWrites.length).toBeGreaterThan(writesBefore);
    await s.page.waitForTimeout(500); assert.equal(s.state.posts.length, postsBefore); assert.equal(s.state.plans.length, plansBefore);
    check('FAILED_LINKED_BODY_SAVE_BLOCKS_IMAGE_QUOTE_AND_SUBMIT');
    s.state.failTextSave = false; await s.cardBody().fill('最终可保存正文'); await expect.poll(() => s.saved(textId).content).toBe('最终可保存正文');
    await s.screenshot('source-original-draft-retained'); await s.finish();
  } catch (error) { await s.fail(error); throw error; }
}

async function pendingImage(browser) {
  const s = await createScenario(browser, 'pending-image');
  try {
    await s.open(textId);
    const handle = s.node(textId).locator('.react-flow__handle[data-handleid="out"]'); await handle.hover();
    const bounds = await handle.boundingBox(), canvas = await s.page.locator('.react-flow').boundingBox(); assert(bounds && canvas);
    // Drop into empty canvas below both seeded rows; the real onConnectEnd menu
    // creates a pending node with its sourceId. No injected React/store mutation.
    const x = Math.min(canvas.x + canvas.width - 240, bounds.x + 440), y = Math.min(canvas.y + canvas.height - 240, canvas.y + 760);
    await s.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await s.page.mouse.down();
    await s.page.mouse.move(x, y, { steps: 16 }); await s.page.mouse.up();
    const menu = s.page.locator('.menu-pop').filter({ has: s.page.getByRole('button', { name: '图形生成', exact: true }) });
    await menu.getByRole('button', { name: '图形生成', exact: true }).click();
    const pending = s.page.locator('.react-flow__node[data-id^="pend-"]'); await expect(pending).toHaveCount(1);
    const pendingId = await pending.getAttribute('data-id'); assert(pendingId);
    const dock = s.page.getByTestId('pending-node-dock'); await expect(dock).toBeVisible();
    await expect(s.editor()).toHaveText(''); const linked = dock.getByTestId('linked-text-input'); await expect(linked).toBeVisible();
    await linked.locator('summary').click(); await expect(linked).toContainText(firstBody); await expect(linked).not.toContainText(nearBody);
    assert.equal(s.state.posts.length, 0); assert.equal(s.state.textGenerations.length, 0);
    check('REAL_TEXT_HANDLE_SPAWN_CREATES_LINKED_PENDING_WITH_EMPTY_EDITABLE_DRAFT_NO_MODEL_CALL');
    const nextBody = '实时改写后的青色玻璃瓶正文，不保留旧副本。'; await s.cardBody().fill(nextBody);
    await expect.poll(() => s.saved(textId).content).toBe(nextBody); await expect(linked).toContainText(nextBody); await expect(linked).not.toContainText(firstBody);
    await s.editor().fill('图片补充：竖版构图'); const id = await s.submit();
    assert.equal(s.jobs.get(id).request.prompt, nextBody + '\n\n图片补充：竖版构图');
    assert.equal(s.state.requests.some(r => r.path === '/api/generate-image' && r.method === 'POST'), false);
    check('PENDING_SUBMISSION_MERGES_LIVE_LINKED_BODY_AND_OWN_SUPPLEMENT_WITHOUT_STATIC_DUPLICATE');
    await s.editor().fill('下一轮草稿'); s.complete(id); await s.awaitCleared(id);
    await expect(s.node(pendingId)).toHaveCount(0); await expect(s.editor()).toHaveText('下一轮草稿');
    await expect.poll(() => s.saved(textId).targetIds.includes('reuse-result-1')).toBe(true);
    assert.equal(s.saved(textId).content, nextBody); assert(s.saved(textId).targetIds.includes(rootId));
    check('PENDING_COMPLETION_MIGRATES_LIVE_DRAFT_AND_MERGES_RESULT_LINK_WITHOUT_REVERTING_BODY');
    await s.screenshot('pending-completed-linked-text-and-draft'); await s.finish();
  } catch (error) { await s.fail(error); throw error; }
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.CANVAS_TEXT_PROMPT_REUSE_BROWSER || 'msedge', headless: true });
    await notebook(browser); await existingImage(browser); if (!baseline) await pendingImage(browser);
    const status = baseline ? 'REPRODUCED' : 'PASS', exit = baseline ? 1 : 0;
    const stdout = `CANVAS_TEXT_PROMPT_REUSE_UI=${status} CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 PRODUCTION_WRITES=0 EXIT=${exit}`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status, baseline, checks, scenarios, sources, scriptHash: hash(__filename), sourceRoot,
      evidence: 'actual Next CanvasClient and native browser input; declared HTTP persistence, image bytes and supplier receipt fixtures; no production or real model calls', stdout, exit }, null, 2));
    console.log(stdout); process.exitCode = exit;
  } catch (error) {
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ status: 'FAIL', error: error.stack, checks, scenarios, sources, sourceRoot, scriptHash: hash(__filename), exit: 1 }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
