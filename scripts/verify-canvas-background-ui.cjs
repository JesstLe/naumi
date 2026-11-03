// Full local Next/React Flow. HTTP/media/quote/settlement are declared fixtures;
// this never calls a supplier or a production database and never requests cancel.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const sharp = require('sharp'), crypto = require('node:crypto');
const { fixtureAccount, requireLoopback, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const base = process.env.CANVAS_BACKGROUND_URL || 'http://127.0.0.1:15241';
const out = path.resolve(process.env.CANVAS_BACKGROUND_OUT || 'output/canvas-background-generation-20261102/ui-r1');
requireLoopback(base);
fs.mkdirSync(out, { recursive: true });
const rootId = 'regeneration-root', clone = value => JSON.parse(JSON.stringify(value));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const checks = [], scenarios = [], sources = ['src/components/canvas/canvas-client.tsx', 'src/components/canvas/generation-submit-action.tsx',
  'src/components/canvas/use-image-node-draft.ts', 'src/components/canvas/use-image-reference-draft.ts', 'src/lib/canvas/background-generation.ts',
  'src/lib/canvas/image-reference-drafts.ts'].map(relative => ({ path: relative, sha256: crypto.createHash('sha256').update(fs.readFileSync(relative)).digest('hex') }));

async function createScenario(browser, name, account) {
  const folder = path.join(out, name); fs.mkdirSync(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1740, height: 1100 } }), page = await context.newPage();
  const state = { name, plans: [], planScopes: [], posts: [], gets: [], positions: [], history: [], errors: [], external: [], unexpected: [], completed: [], screenshots: [] };
  const imageMap = new Map(), quotes = new Map(), jobs = new Map(), versions = new Map();
  const colors = ['#dde9f0', '#a8c7e7', '#a7d0b8', '#e6c99d', '#d2b3db'];
  for (let i = 0; i < colors.length; i++) {
    const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: colors[i] } })
      .composite([{ input: Buffer.from(`<svg width="512" height="512"><rect x="130" y="105" width="252" height="312" rx="32" fill="#fff9ed"/><rect x="166" y="73" width="180" height="57" rx="13" fill="#5d746d"/><circle cx="256" cy="252" r="66" fill="${colors[(i + 1) % colors.length]}"/><path d="M189 348h134" stroke="#85958a" stroke-width="15"/></svg>`) }]).png().toBuffer();
    imageMap.set(`/media/background-${name}-${i}.png`, bytes);
  }
  const originalImage = `/media/background-${name}-0.png`;
  const user = { ...account.user, creditsUsed: 0 };
  const root = { ...account.artworks[0], id: rootId, title: '原始商品图片', groupId: rootId, parentId: undefined, parentIds: [],
    image: originalImage, prompt: '初始产品图片', width: 512, height: 512, ratio: '1:1', resolution: '1K',
    canvasWidth: 320, canvasHeight: 320, canvasX: 160, canvasY: 140, canvasImageRevision: 0, canvasImageVersionId: 'initial' };
  const arts = [root];
  const common = commonFixture({ account: { ...account, user }, artworks: arts, state });
  const version = art => ({ id: art.canvasImageVersionId || art.id, image: art.image, prompt: art.prompt, width: art.width, height: art.height,
    ratio: art.ratio, resolution: art.resolution, style: null, createdAt: new Date().toISOString() });
  versions.set(rootId, [{ ...version(root), id: 'initial' }]);
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  const pixels = source => imageMap.get(new URL(source, base).pathname) || imageMap.get(originalImage);
  page.on('pageerror', error => state.errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['blob:', 'data:'].includes(url.protocol)) { state.external.push(url.origin); return route.abort(); }
    if (p.startsWith('/media/background-')) return route.fulfill({ contentType: 'image/png', body: pixels(p) });
    if (p === '/api/download') return route.fulfill({ contentType: 'image/png', body: pixels(url.searchParams.get('u')) });
    if (p === '/api/media/image-cache') {
      const input = request.postDataJSON().sources;
      return json(route, { account: user.email, results: Object.fromEntries(input.map(source => { const bytes = pixels(source); return [source,
        { source, account: user.email, version: crypto.createHash('sha256').update(bytes).digest('hex'), fetchUrl: source, bytes: bytes.length, contentType: 'image/png' }]; })) });
    }
    if (p === '/api/account') return json(route, { ...account, user, artworks: arts });
    if (await common.handle(route)) return;
    if (p === '/api/canvas/text-nodes' || /^\/api\/canvas\/(video|director|character|scene|audio|timeline)-nodes$/.test(p)) return json(route, { nodes: [], persisted: true });
    if (p === '/api/billing/catalog') return json(route, { version: 1, features: Object.fromEntries(['image.generate', 'canvas.image', 'canvas.expand', 'canvas.text-generate', 'canvas.assistant', 'tool.cutout']
      .map(f => [f, { label: f, enabled: true, unit: 'image', prices: { medium: { '1K': 6 } } }])), products: [], thresholds: { highQualityPaidFen: 0, agentConfirmCredits: 100 }, effective: { metering: true, commerce: false, recharge: false } });
    if (p === '/api/billing/quote') { const body = request.postDataJSON(); return json(route, { ...body, credits: 6 * (body.n || body.quantity || 1), reserveCredits: 6 * (body.n || body.quantity || 1), version: 1 }); }
    if (p === '/api/imagegen/inputs') return json(route, { artworkId: 'asset-background-' + name + '-' + state.plans.length, url: originalImage, width: 512, height: 512 });
    if (p === '/api/imagegen/plan') {
      const input = request.postDataJSON(), id = uuid(state.plans.length + 1), credits = 6 * (input.variants || 1);
      state.plans.push(clone(input));
      if (state.rejectPlanNext) { state.rejectPlanNext = false; return json(route, { error: 'fixture explicitly rejects this plan', code: 'IMAGEGEN_NO_CHANNEL', accepted: false }, 409); }
      quotes.set(id, { request: clone(input), credits });
      state.planScopes.push({ operationId: input.operationId, project: request.headers()['x-naumi-project-context'] || null });
      return json(route, { request: input, intent: { operation: input.inputs.length ? 'edit' : 'generate', background: null },
        steps: [{ key: 'generate', operation: input.inputs.length ? 'edit' : 'generate', credits }], warnings: [], confirmationRequired: false,
        totalCredits: credits, billingVersion: 1, modelVersion: 1, quote: { id } });
    }
    if (p === '/api/imagegen' && request.method() === 'POST') {
      const body = request.postDataJSON(), saved = quotes.get(body.quoteId);
      assert.ok(saved, 'submitted the exact frozen quote'); assert.equal(body.operationId, saved.request.operationId);
      state.posts.push(clone(body));
      if (!jobs.has(body.operationId)) jobs.set(body.operationId, { request: clone(saved.request), status: 'pending', images: [], authorizedCredits: saved.credits, chargedCredits: 0 });
      if (state.loseAckNext) { state.loseAckNext = false; return route.abort('connectionfailed'); }
      return json(route, { operationId: body.operationId, jobId: 'imagegen-' + body.operationId, status: 'pending' });
    }
    if (p === '/api/imagegen' && request.method() === 'GET') {
      const id = url.searchParams.get('operationId'), job = jobs.get(id); state.gets.push({ api: 'imagegen', id });
      if (!job) return json(route, { error: 'fixture unknown task' }, 404);
      return json(route, { operationId: id, jobId: 'imagegen-' + id, status: job.status === 'done' ? 'succeeded' : 'pending', stage: job.status === 'done' ? 'done' : 'generating',
        artifacts: job.images.map(i => ({ artworkId: i.id, url: i.url, width: i.width, height: i.height })), canvasAttachment: job.attachment, chargedCredits: job.chargedCredits, billingStatus: 'confirmed' });
    }
    if (p === '/api/generate-image' && request.method() === 'GET') {
      const id = (url.searchParams.get('job') || '').replace(/^imagegen-/, ''), job = jobs.get(id); state.gets.push({ api: 'legacy-receipt', id });
      if (!job) return json(route, { error: 'fixture unknown task' }, 404);
      return json(route, { status: job.status, operationStatus: job.status === 'done' ? 'succeeded' : 'pending', canvasAttachment: job.attachment, images: job.images, user, creditsUsed: job.chargedCredits });
    }
    if (/cancel|refund/.test(p)) { state.unexpected.push(p); return json(route, { error: 'No cancellation or refund is part of background editing' }, 500); }
    if (p === '/api/artworks/position') {
      const body = request.postDataJSON(); state.positions.push(body); const art = arts.find(a => a.id === body.id);
      if (art && !(body.mode === 'initialize' && art.canvasX != null && art.canvasY != null)) Object.assign(art, { canvasX: body.x, canvasY: body.y });
      return json(route, { ok: true });
    }
    if (p === '/api/artworks/get') return json(route, { artworks: arts.filter(a => (url.searchParams.get('ids') || '').split(',').includes(a.id)) });
    if (p === '/api/canvas/history') { state.history.push(request.postDataJSON()); return json(route, { ok: true, persisted: true }); }
    if (p === '/api/canvas/image-versions') {
      const art = arts.find(a => a.id === url.searchParams.get('nodeId'));
      return json(route, { image: art.image, currentVersionId: art.canvasImageVersionId, revision: art.canvasImageRevision, versions: versions.get(art.id) || [version(art)] });
    }
    return route.continue();
  });
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const editor = () => page.getByRole('textbox', { name: '节点提示词', exact: true });
  const button = () => page.getByTestId('generation-submit-action');
  async function screenshot(label) { const file = path.join(folder, label + '.png'); await page.screenshot({ path: file }); state.screenshots.push(file); }
  async function open() {
    await page.goto(base + '/canvas?project=tree%3Aregeneration-root', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await node(rootId).waitFor({ timeout: 180000 }); await node(rootId).click({ position: { x: 65, y: 65 } });
    await expect(editor()).toBeVisible(); await expect(button()).toBeEnabled();
  }
  async function submit(prompt) {
    const count = state.posts.length; await editor().fill(prompt);
    // Editing a live draft never submits by itself.
    await expect(editor()).toHaveText(prompt); assert.equal(state.posts.length, count);
    await button().click(); await expect.poll(() => state.posts.length, { timeout: 45000 }).toBe(count + 1);
    await expect(button()).toBeEnabled({ timeout: 45000 }); return state.posts[count].operationId;
  }
  function complete(id) {
    const job = jobs.get(id); assert.ok(job); if (job.status === 'done') return job;
    const index = [...jobs.keys()].indexOf(id), target = job.request.canvasTarget && arts.find(a => a.id === job.request.canvasTarget.nodeId);
    const count = job.request.variants || 1, ids = [];
    for (let i = 0; i < count; i++) {
      const artId = `background-${name}-${index + 1}-${i + 1}`, image = `/media/background-${name}-${(index % 4) + 1}.png`;
      const output = { ...root, id: artId, title: `任务 ${index + 1} 图片 ${i + 1}`, prompt: job.request.prompt, image,
        source: target ? 'canvas-node-version' : 'generate', parentId: target?.id || job.request.sourceNodeId || undefined,
        groupId: target?.groupId || (job.request.sourceNodeId ? rootId : artId), parentIds: [], canvasX: null, canvasY: null,
        canvasImageRevision: 0, canvasImageVersionId: 'initial', createdAt: new Date().toISOString() };
      arts.push(output); ids.push(artId);
      if (target) versions.get(target.id).unshift({ ...version(output), id: artId });
    }
    if (target) {
      const previousImage = target.image, previousVersionId = target.canvasImageVersionId;
      const applied = target.canvasImageRevision === job.request.canvasTarget.expectedRevision && target.image === job.request.canvasTarget.expectedImage;
      if (applied) { const output = arts.find(a => a.id === ids[0]); Object.assign(target, { image: output.image, prompt: output.prompt, canvasImageRevision: target.canvasImageRevision + 1, canvasImageVersionId: output.id }); }
      job.attachment = { nodeId: target.id, applied, previousVersionId, previousImage, versionId: ids[0], revision: target.canvasImageRevision, ...(!applied ? { reason: 'changed' } : {}) };
    }
    job.images = ids.map(id => { const art = arts.find(a => a.id === id); return { id, url: art.image, width: art.width, height: art.height }; });
    job.status = 'done'; job.chargedCredits = job.authorizedCredits; user.creditsUsed += job.chargedCredits;
    state.completed.push({ id, attachment: clone(job.attachment || null), images: clone(job.images), chargedCredits: job.chargedCredits });
    return job;
  }
  async function awaitCleared(id) {
    await expect.poll(() => page.evaluate(id => Object.keys(sessionStorage).filter(k => k.startsWith('naumi:imagegen-pending:')).some(k => JSON.parse(sessionStorage.getItem(k)).operationId === id), id), { timeout: 45000 }).toBe(false);
  }
  async function finish() {
    assert.deepEqual(state.errors, []); assert.deepEqual(state.external, []); assert.deepEqual(state.unexpected, []);
    state.artworks = clone(arts); state.jobs = Object.fromEntries([...jobs].map(([id, job]) => [id, clone(job)])); state.versions = Object.fromEntries(versions);
    fs.writeFileSync(path.join(folder, 'RESULT.json'), JSON.stringify({ status: 'PASS', ...state, supplierCalls: 0, evidence: 'Full Next/React Flow with isolated HTTP/media/quote fixtures; no real wallet or supplier' }, null, 2));
    scenarios.push(state); await context.close();
  }
  async function failed(error) {
    await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(folder, 'ERROR.json'), JSON.stringify({ error: error.stack, ...state, body: await page.locator('body').innerText().catch(() => ''), jobs: Object.fromEntries(jobs) }, null, 2));
    await context.close();
  }
  return { page, context, state, root, arts, jobs, versions, node, editor, button, open, submit, complete, awaitCleared, screenshot, finish, failed };
}

async function existingOrder(browser, account, order) {
  const s = await createScenario(browser, 'existing-' + order.join('-'), account);
  try {
    await s.open(); const A = await s.submit('任务 A：蓝色背景，保留瓶身');
    const aSnapshot = JSON.stringify(s.jobs.get(A).request);
    const B = await s.submit('任务 B：绿色背景，保留瓶身');
    assert.notEqual(A, B); assert.equal(JSON.stringify(s.jobs.get(A).request), aSnapshot);
    assert.equal(s.state.posts.length, 2); assert.equal(s.state.plans.length, 2);
    await s.editor().fill('正在修改的第三版草稿，尚未点击生成'); assert.equal(s.state.posts.length, 2);
    await s.screenshot('two-accepted-editable');
    const ids = { A, B }, first = s.complete(ids[order[0]]); await s.awaitCleared(ids[order[0]]);
    await expect(s.editor()).toHaveText('正在修改的第三版草稿，尚未点击生成');
    const displayed = s.root.image, revision = s.root.canvasImageRevision;
    const second = s.complete(ids[order[1]]); await s.awaitCleared(ids[order[1]]);
    assert.equal(first.attachment.applied, true); assert.equal(second.attachment.applied, false);
    assert.equal(s.root.image, displayed); assert.equal(s.root.canvasImageRevision, revision);
    await expect(s.editor()).toHaveText('正在修改的第三版草稿，尚未点击生成'); await expect(s.button()).toBeEnabled();
    await s.page.getByTestId('image-version-control').click();
    await expect(s.page.locator('[data-version-id]')).toHaveCount(3);
    assert.equal(s.state.posts.length, 2); assert.equal([...s.jobs.values()].reduce((n, job) => n + job.chargedCredits, 0), 12);
    await s.screenshot('both-results-history-draft-retained');
    checks.push(`EXISTING_${order.join('_THEN_')}_TWO_IDS_EDIT_NO_POST_BOTH_HISTORY_CAS_NO_LATE_OVERWRITE`);
    await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}

async function pendingFork(browser, account) {
  const s = await createScenario(browser, 'pending-fork', account);
  try {
    await s.open(); await s.page.locator('[data-tool="image-node"]').click();
    const pendingNodes = s.page.locator('.react-flow__node[data-id^="pend-"]'); await expect(pendingNodes).toHaveCount(1);
    const oldId = await pendingNodes.first().getAttribute('data-id');
    const A = await s.submit('空白节点 A：蓝色陶瓷杯');
    const B = await s.submit('空白节点 B：绿色陶瓷杯');
    await expect(pendingNodes).toHaveCount(2);
    const ids = await pendingNodes.evaluateAll(nodes => nodes.map(n => n.dataset.id));
    const newId = ids.find(id => id !== oldId); assert.ok(newId); assert.notEqual(A, B);
    await s.editor().fill('空白节点完成前新编辑的草稿 C'); assert.equal(s.state.posts.length, 2);
    await s.screenshot('two-owned-placeholders');
    const a = s.complete(A); await s.awaitCleared(A);
    await expect(s.node(oldId)).toHaveCount(0); await expect(s.node(newId)).toHaveCount(1);
    await expect(s.editor()).toHaveText('空白节点完成前新编辑的草稿 C');
    assert.equal(s.jobs.get(B).status, 'pending');
    const b = s.complete(B); await s.awaitCleared(B);
    await expect(s.node(newId)).toHaveCount(0); await expect(s.node(a.images[0].id)).toHaveCount(1); await expect(s.node(b.images[0].id)).toHaveCount(1);
    await expect(s.editor()).toHaveText('空白节点完成前新编辑的草稿 C'); await expect(s.button()).toBeEnabled();
    assert.equal(s.state.posts.length, 2); assert.notEqual(s.arts.find(art => art.id === a.images[0].id).canvasX, s.arts.find(art => art.id === b.images[0].id).canvasX);
    await s.screenshot('completed-draft-follows-new-result');
    checks.push('PENDING_SECOND_CLICK_FORKS_OWNED_PLACEHOLDER_OLD_FINISH_KEEPS_NEW_DRAFT_RESULT_INHERITS_LIVE_EDIT');
    await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}

async function refreshReceipts(browser, account) {
  const s = await createScenario(browser, 'refresh-two', account);
  try {
    await s.open(); const A = await s.submit('刷新验收 A 原提示词'), B = await s.submit('刷新验收 B 新提示词');
    await s.editor().fill('刷新后仍保留的下一次草稿');
    await s.page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await s.node(rootId).waitFor({ timeout: 60000 });
    await s.node(rootId).click({ position: { x: 65, y: 65 } }); await expect(s.editor()).toHaveText('刷新后仍保留的下一次草稿');
    // The existing composer overlaps the bottom-left recovery surface. Follow
    // the real user action of dismissing it, never force a covered button.
    await s.page.getByRole('button', { name: '关闭创作栏', exact: true }).click();
    await s.page.getByRole('button', { name: '待恢复任务 2', exact: true }).click();
    s.complete(B); await s.page.getByRole('button', { name: '检查原任务 ' + B, exact: true }).click(); await s.awaitCleared(B);
    s.complete(A); await s.page.getByRole('button', { name: '检查原任务 ' + A, exact: true }).click(); await s.awaitCleared(A);
    assert.equal(s.state.posts.length, 2); assert.equal(s.state.plans.length, 2);
    assert.ok(s.state.gets.some(item => item.api === 'imagegen' && item.id === A)); assert.ok(s.state.gets.some(item => item.api === 'imagegen' && item.id === B));
    await s.node(rootId).click({ position: { x: 65, y: 65 } });
    await expect(s.editor()).toHaveText('刷新后仍保留的下一次草稿');
    await s.page.getByTestId('image-version-control').click(); await expect(s.page.locator('[data-version-id]')).toHaveCount(3);
    await s.screenshot('recovered-both-without-resubmission');
    checks.push('REFRESH_TWO_RECEIPTS_ORIGINAL_ID_GET_ONLY_NO_NEW_PLAN_POST_DRAFT_AND_BOTH_VERSIONS_RETAINED');
    await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}

async function newCanvasDraft(browser, account) {
  const s = await createScenario(browser, 'new-canvas', account);
  try {
    await s.open();
    await s.page.getByTestId('canvas-project-chrome').getByRole('button').first().click();
    await s.page.getByRole('button', { name: '创建新项目', exact: true }).click();
    await expect(s.node(rootId)).toHaveCount(0);
    await s.page.locator('[data-tool="image-node"]').click();
    const pending = s.page.locator('.react-flow__node[data-id^="pend-"]'); await expect(pending).toHaveCount(1);
    const pendingId = await pending.getAttribute('data-id');
    const A = await s.submit('空画布首次生成的冻结提示词');
    assert.equal(s.state.planScopes[0].project, null); assert.equal(s.jobs.get(A).request.sourceNodeId, undefined);
    assert.equal(s.jobs.get(A).request.canvasTarget, undefined);
    const livePrompt = '新项目形成后仍需保留的最新草稿'; await s.editor().fill(livePrompt);
    await s.screenshot('empty-workspace-submitted-editable');
    const result = s.complete(A), resultId = result.images[0].id;
    await s.awaitCleared(A); await expect(s.node(pendingId)).toHaveCount(0); await expect(s.node(resultId)).toHaveCount(1);
    await expect(s.editor()).toHaveText(livePrompt, { timeout: 15000 }); await expect(s.button()).toBeEnabled();
    await expect.poll(() => s.node(resultId).locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0), { timeout: 15000 }).toBe(true);
    assert.equal(s.arts.find(art => art.id === resultId).groupId, resultId);
    const savedDrafts = await s.page.evaluate(resultId => Object.entries(sessionStorage).filter(([key]) => key.startsWith('naumi:canvas-image-draft:v1:') && key.includes(resultId)), resultId);
    const target = savedDrafts.find(([key]) => key.includes('tree:' + resultId));
    assert.ok(target, 'draft transferred from null project scope into the actual result project');
    assert.equal(JSON.parse(target[1]).prompt, livePrompt); assert.equal(s.state.posts.length, 1);
    s.state.newProjectDraft = { resultId, project: 'tree:' + resultId, prompt: JSON.parse(target[1]).prompt };
    await s.screenshot('new-project-result-keeps-live-draft');
    checks.push('NEW_EMPTY_CANVAS_NULL_SCOPE_COMPLETION_MOVES_LIVE_DRAFT_TO_ACTUAL_RESULT_PROJECT');
    await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}

async function rejectedThenNew(browser, account) {
  const s = await createScenario(browser, 'rejected-then-new', account);
  try {
    await s.open(); s.state.rejectPlanNext = true;
    await s.editor().fill('A 的计划明确拒绝'); await s.button().click();
    await expect.poll(() => s.state.plans.length).toBe(1);
    await expect(s.node(rootId).getByRole('alert')).toHaveText('重新生成未完成');
    assert.equal(s.state.posts.length, 0); await expect(s.button()).toBeEnabled();
    const B = await s.submit('B 是当前新生成'); s.complete(B); await s.awaitCleared(B);
    await expect(s.node(rootId).getByRole('alert')).toHaveCount(0);
    await expect(s.page.getByTestId('generation-check-original')).toHaveCount(0);
    assert.equal(s.state.posts.length, 1); await s.screenshot('new-success-clears-old-visible-failure');
    checks.push('EXPLICITLY_UNACCEPTED_A_THEN_NEW_B_SUCCESS_NO_STALE_NODE_FAILURE'); await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}
async function unknownThenNew(browser, account) {
  const s = await createScenario(browser, 'unknown-then-new', account);
  try {
    await s.open(); s.state.loseAckNext = true;
    await s.editor().fill('A 已受理但响应丢失'); await s.button().click();
    await expect.poll(() => s.state.posts.length).toBe(1); const A = s.state.posts[0].operationId;
    await expect(s.page.getByTestId('generation-check-original')).toBeVisible();
    await expect(s.button()).toBeEnabled();
    const B = await s.submit('B 使用独立新任务'); assert.notEqual(A, B);
    s.complete(B); await s.awaitCleared(B);
    await expect(s.node(rootId).getByRole('alert')).toHaveCount(0);
    const recover = s.page.getByTestId('generation-check-original'); await expect(recover).toBeVisible();
    const pendingBefore = await s.page.evaluate(id => Object.keys(sessionStorage).some(key => key.startsWith('naumi:imagegen-pending:') && JSON.parse(sessionStorage.getItem(key)).operationId === id), A);
    assert.equal(pendingBefore, true, 'unknown A retains its own receipt after B succeeds');
    const beforePosts = s.state.posts.length, beforePlans = s.state.plans.length;
    s.complete(A); await recover.click(); await s.awaitCleared(A);
    await expect(s.page.getByTestId('generation-check-original')).toHaveCount(0);
    assert.equal(s.state.posts.length, beforePosts); assert.equal(s.state.plans.length, beforePlans);
    assert(s.state.gets.some(get => get.api === 'imagegen' && get.id === A));
    await s.screenshot('old-unknown-check-is-reachable-get-only');
    checks.push('UNKNOWN_A_RETAINED_AFTER_B_SUCCESS_VISIBLE_ORIGINAL_CHECK_REUSES_ID_NO_POST'); await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}
async function multipleUnknownNarrow(browser,account) {
 const s=await createScenario(browser,'multiple-unknown-narrow',account);
 try {
  await s.page.setViewportSize({width:390,height:844});await s.open();const ids=[];
  for(let i=0;i<3;i++){s.state.loseAckNext=true;ids.push(await s.submit('独立未决任务 '+(i+1)));}
  const menu=s.page.getByTestId('generation-original-task-menu');await expect(menu).toBeVisible();await expect(s.button()).toBeEnabled();
  const box=await s.button().boundingBox(),shell=await s.page.locator('[data-composer-kind="image"]').boundingBox();
  assert(box&&shell&&box.x>=shell.x&&box.x+box.width<=shell.x+shell.width+.5&&box.y+box.height<=shell.y+shell.height+.5,'main submit remains inside shell');
  assert(await s.button().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'main submit remains hit-testable');
  const before=s.state.posts.length;for(const id of ids)s.complete(id);
  await menu.getByRole('combobox').click();const list=s.page.getByRole('listbox');await expect(list).toBeVisible();
  const rows=list.getByRole('option');await expect(rows).toHaveCount(4);await rows.nth(3).click();await s.awaitCleared(ids[2]);
  await menu.getByRole('combobox').click();await s.page.getByRole('listbox').getByRole('option').nth(1).click();await s.awaitCleared(ids[0]);
  await s.page.getByTestId('generation-check-original').click();await s.awaitCleared(ids[1]);
  assert.equal(s.state.posts.length,before);await expect(menu).toHaveCount(0);await expect(s.button()).toBeEnabled();
  await s.screenshot('three-unknown-menu-and-generate-visible-390');checks.push('THREE_UNKNOWN_NARROW_ONE_BOUNDED_MENU_ALL_ORIGINAL_IDS_CHECKABLE_NO_POST');await s.finish();
 }catch(error){await s.failed(error);throw error;}
}

async function remountDuringSave(browser, account) {
  const s = await createScenario(browser, 'remount-during-save', account);
  try {
    s.arts.push({ ...s.root, id: 'second-fixture-node', title: '另一节点', canvasX: 650, canvasY: 140 });
    await s.open();
    let release; const gate = { entered: false, promise: new Promise(done => { release = done; }) }; s.state.promptSaveGate = gate;
    await s.editor().fill('慢保存期间仅一次提交'); await s.button().click();
    await expect.poll(() => gate.entered).toBe(true); assert.equal(s.state.posts.length, 0);
    await s.node('second-fixture-node').click({ position: { x: 65, y: 65 } });
    await s.node(rootId).click({ position: { x: 65, y: 65 } }); await expect(s.button()).toBeDisabled();
    const box = await s.button().boundingBox(); await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(s.state.posts.length, 0); release();
    await expect.poll(() => s.state.posts.length, { timeout: 45000 }).toBe(1); await expect(s.button()).toBeEnabled();
    const A = s.state.posts[0].operationId, B = await s.submit('提交回执后允许新 ID'); assert.notEqual(A, B);
    assert.equal(s.state.posts.length, 2); s.complete(B); s.complete(A); await s.awaitCleared(A); await s.awaitCleared(B);
    await s.screenshot('remounted-submit-lock-keeps-one-before-ack');
    checks.push('SLOW_PROMPT_SAVE_NODE_REMOUNT_KEEPS_SUBMIT_LOCK_ACK_ALLOWS_NEW_ID'); await s.finish();
  } catch (error) { await s.failed(error); throw error; }
}

(async () => {
  const account = fixtureAccount();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (process.argv.includes('--multi-unknown-only')) {
      await multipleUnknownNarrow(browser,account);
    } else if (process.argv.includes('--recovery-only')) {
      await rejectedThenNew(browser, account); await unknownThenNew(browser, account); await remountDuringSave(browser, account); await multipleUnknownNarrow(browser,account);
    } else if (process.argv.includes('--only=new-canvas')) {
      await newCanvasDraft(browser, account);
    } else {
      if (!process.argv.includes('--refresh-only')) {
        await existingOrder(browser, account, ['B', 'A']);
        await existingOrder(browser, account, ['A', 'B']);
        await pendingFork(browser, account);
        await newCanvasDraft(browser, account);
      }
      await refreshReceipts(browser, account);
      await rejectedThenNew(browser, account); await unknownThenNew(browser, account); await remountDuringSave(browser, account); await multipleUnknownNarrow(browser,account);
    }
    checks.push('NO_PAGEERROR_CANCEL_REFUND_OR_EXTERNAL_SUPPLIER_NETWORK');
    const stdout = `CANVAS_BACKGROUND_UI=PASS CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: 'PASS', checks, sources, scenarios: scenarios.map(s => ({ name: s.name, posts: s.posts.length, plans: s.plans.length, screenshots: s.screenshots })), stdout,
      evidence: 'Real browser Next/React Flow; HTTP/media/quotes/CAS/settlement are fixtures, not production or real wallet acceptance', exit: 0 }, null, 2));
    console.log(stdout);
  } catch (error) {
    const stdout = `CANVAS_BACKGROUND_UI=FAIL CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 EXIT=1`;
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ status: 'FAIL', checks, sources, error: error.stack, stdout, exit: 1 }, null, 2));
    console.error(stdout); console.error(error); process.exitCode = 1;
  } finally { await browser.close(); }
})();
