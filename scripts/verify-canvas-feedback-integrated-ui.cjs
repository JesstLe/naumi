// Complete Next CanvasClient + real browser. Auth/API/media are isolated loopback
// fixtures; no real supplier requests or production database changes.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), sharp = require('sharp');
const base = process.env.CANVAS_FEEDBACK_UI_URL || 'http://127.0.0.1:15181';
const out = path.resolve(process.env.CANVAS_FEEDBACK_UI_OUT || 'E:/Workspace/naumi/output/canvas-feedback-20261030/integrated-ui');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1800, height: 1200 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const checks = [], errors = [], external = [], requests = [], groups = [], history = [], optimizations = [], textGenerations = [], textWrites = [];
  const rootId = 'regeneration-root', otherId = 'reference-neighbor', textId = 'text-feedback';
  const account = process.env.CANVAS_FEEDBACK_ACCOUNT||'regeneration-ui@example.test';
  const originalPrompt = '保留瓶身和标签，使用浅色自然光。';
  const optimizedPrompt = '保留瓶身轮廓与标签文字，浅色背景搭配柔和自然光，呈现清晰细节。';
  const writePrompt = '为这款营养品写一句简洁文案';
  const written = '每日一份轻盈营养，陪伴自在生活。';
  const now = new Date().toISOString();
  const pixels = await sharp({ create: { width: 768, height: 1024, channels: 3, background: '#e4ede7' } }).composite([{ input: Buffer.from('<svg width="768" height="1024"><rect x="245" y="295" width="278" height="470" rx="50" fill="#fffdf4"/><rect x="275" y="222" width="218" height="100" rx="14" fill="#6e9180"/><rect x="246" y="450" width="276" height="210" fill="#d1dfd3"/><circle cx="384" cy="550" r="69" fill="#567d68"/><text x="384" y="574" font-size="68" text-anchor="middle" fill="white">N</text><path d="M285 701H483" stroke="#a5b9aa" stroke-width="8"/></svg>') }]).png().toBuffer();
  const version = crypto.createHash('sha256').update(pixels).digest('hex');
  fs.writeFileSync(path.join(out, 'fixture-product.png'), pixels);
  let arts, user, textFail = true, ocrCatalogRelease, ocrCatalogStarted = false, ocrCatalogDone = false;
  let texts = [{ id: textId, projectKey: 'tree:' + rootId, title: '品牌文案', prompt: writePrompt, content: '给每一天，恰到好处的营养。', status: 'completed', sourceIds: [], targetIds: [], productIds: [], canvasX: 950, canvasY: 160, width: 330, height: 230, createdAt: now, updatedAt: now }];
  const model = { id: 'gpt-image-2', label: '图片模型', modality: 'image', supportsEdit: true, qualities: ['medium'], nativeResolutions: ['1K'], generationParameters: { ratios: ['auto', '1:1', '3:4', '16:9'], resolutions: ['1K'] }, qualitySupported: true };
  const textModel = { id: 'published-text', label: '文字模型', modality: 'text', supportsVision: true };
  page.on('pageerror', e => errors.push(e.message));
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['blob:', 'data:'].includes(u.protocol)) { external.push(u.origin); return route.abort(); }
    if (p === '/api/account') {
      const response = await route.fetch(), data = await response.json(); user = data.user;
      arts ||= [{ ...data.artworks[0], id: rootId, groupId:rootId, title: '营养品原图', prompt: originalPrompt, image: '/media/feedback-original.png', width: 768, height: 1024, canvasWidth: 264, canvasHeight: 352, canvasX: 100, canvasY: 150, parentId: undefined, parentIds: [], canvasGroupId: null },
        { ...data.artworks[0], id: otherId, groupId:rootId, title: '参考构图', prompt: originalPrompt, image: '/media/feedback-reference.png', width: 768, height: 1024, canvasWidth: 264, canvasHeight: 352, canvasX: 510, canvasY: 150, parentId: rootId, parentIds: [rootId], source: 'generate', canvasGroupId: null }];
      return json(route, { ...data, artworks: arts });
    }
    if (p === '/api/canvas/text-nodes') {
      if (req.method() === 'POST') { const body = req.postDataJSON(); textWrites.push(body); const list = body.nodes || [body]; for (const item of list) { const at = texts.findIndex(n => n.id === item.id); if (at >= 0) texts[at] = { ...texts[at], ...item }; else texts.push(item); } return json(route, { node: texts.find(n => n.id === body.id), nodes: texts, persisted: true }); }
      return json(route, { nodes: texts, persisted: true });
    }
    if (['/api/canvas/video-nodes', '/api/canvas/director-nodes', '/api/canvas/character-nodes', '/api/canvas/scene-nodes', '/api/canvas/audio-nodes', '/api/canvas/timeline-nodes'].includes(p)) return json(route, { nodes: [], persisted: true });
    if (p === '/api/models') {
      const feature = u.searchParams.get('feature'), text = ['canvas.ocr', 'canvas.text-generate', 'canvas.assistant'].includes(feature);
      if (feature === 'canvas.ocr') { ocrCatalogStarted = true; await new Promise(resolve => { ocrCatalogRelease = resolve; }); ocrCatalogDone = true; }
      return json(route, { managed: true, supported: true, available: true, feature, version: 152, models: [text ? textModel : model], defaultModelId: text ? textModel.id : model.id });
    }
    if (p === '/api/billing/catalog') { const response = await route.fetch(), data = await response.json(); for (const feature of ['canvas.ocr', 'canvas.text-edit', 'canvas.text-generate']) data.features[feature] = { label: feature, enabled: true, unit: 'image', prices: { medium: { '1K': 0 } } }; return json(route, data); }
    if (p === '/api/billing/quote') {
      const body = req.postDataJSON(); requests.push({ path: p, body, model: req.headers()['x-naumi-feature-model'], ocrCatalogDone });
      if (body.feature === 'canvas.ocr') { assert.equal(ocrCatalogDone, true); assert.equal(body.modelId, textModel.id); }
      return json(route, { ...body, modelId: body.modelId || textModel.id, credits: 0, reserveCredits: 0, version: 1, modelVersion: 152, quote: { id: 'fixture-q-' + requests.length } });
    }
    if (p === '/api/canvas/text-generate') {
      const body = req.postDataJSON(); textGenerations.push(body);
      return textFail ? json(route, { error: '文字回复未完整返回，请稍后重试', code: 'TEXT_OUTPUT_LIMIT' }, 502) : json(route, { text: written, model: textModel.id });
    }
    if (p === '/api/prompt-assist') { const body = req.postDataJSON(); optimizations.push({ body, model: req.headers()['x-naumi-feature-model'] }); return json(route, { prompt: body.tool === 'canvas-text' ? '写一句突出轻盈营养、简洁自然的品牌文案。' : optimizedPrompt }); }
    if (p === '/api/canvas/ocr') { requests.push({ path: p, model: req.headers()['x-naumi-feature-model'], ocrCatalogDone }); assert.equal(ocrCatalogDone, true); assert.equal(req.headers()['x-naumi-feature-model'], textModel.id); return json(route, { engine: 'fixture-vision', image: { width: 768, height: 1024 }, segments: [{ id: 'ocr-line', text: 'N', confidence: .99, box: { x: 352, y: 504, width: 68, height: 80 } }] }); }
    if (p === '/api/media/image-cache') { const sources = req.postDataJSON().sources; return json(route, { account, results: Object.fromEntries(sources.map(source => [source, { source, account, version, fetchUrl: source, bytes: pixels.length, contentType: 'image/png' }])) }); }
    if (p.startsWith('/media/feedback-')) return route.fulfill({ contentType: 'image/png', body: pixels });
    if (p === '/api/download' && u.searchParams.get('u')?.includes('/media/feedback-')) return route.fulfill({ contentType: 'image/png', body: pixels });
    if (p === '/api/artworks/get') return json(route, { artworks: arts.filter(a => (u.searchParams.get('ids') || '').split(',').includes(a.id)) });
    if (p === '/api/canvas/groups') { const body = req.postDataJSON(); const assignments = body.assignments || body.ids.map(id => ({ id, canvasGroupId: body.action === 'group' ? 'feedback-persistent-group' : null })); groups.push({ body, assignments }); for (const item of assignments) Object.assign(arts.find(a => a.id === item.id), item); return json(route, { ok: true, persisted: true, assignments }); }
    if (p === '/api/canvas/history') { const body = req.postDataJSON(); history.push(body); const assignments=[];for (const op of body.operations || []) { const a = arts.find(a => a.id === op.id); if (a && op.type === 'position') { a.canvasX = op.x; a.canvasY = op.y; }if(a&&op.type==='group'){a.canvasGroupId=op.value;assignments.push({id:a.id,canvasGroupId:op.value});} }if(assignments.length)groups.push({body,assignments});return json(route, { ok: true, persisted: true }); }
    if (p === '/api/artworks/position') { const body = req.postDataJSON(); Object.assign(arts.find(a => a.id === body.id), { canvasX: body.x, canvasY: body.y }); return json(route, { ok: true }); }
    return route.continue();
  });
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const select = async id => { await node(id).click({ position: { x: 100, y: 80 } }); };
  const empty = async () => { await page.locator('.react-flow__pane').click({ position: { x: 1400, y: 850 } }); };
  const check = name => { checks.push(name); console.log('CHECK=' + name); };
  try {
    await context.addInitScript(project=>localStorage.setItem('nv:canvas:last',project),'tree:'+rootId);
    await page.goto(base + '/canvas', { waitUntil: 'domcontentloaded', timeout: 180000 }); await node(rootId).waitFor({ timeout: 120000 }); await node(textId).waitFor();
    await select(rootId); const submit = page.getByTestId('generation-submit-action'); await expect(submit).toBeVisible(); assert.equal((await submit.innerText()).trim(), ''); await expect(submit).toHaveAttribute('aria-label', '生成'); check('IMAGE_PRIMARY_IS_ARROW_NOT_REGENERATE_LABEL');
    const imageDock = page.getByTestId('image-node-dock');
    const imagePrompt = imageDock.locator('textarea').first();
    await page.getByTestId('canvas-prompt-optimize').click(); await expect(page.getByRole('textbox', { name: '优化预览', exact: true })).toHaveValue(optimizedPrompt); await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await imagePrompt.inputValue(), originalPrompt); check('IMAGE_OPTIMIZE_CANCEL_PRESERVES_SOURCE');
    await page.getByTestId('canvas-prompt-optimize').click(); await page.getByRole('button', { name: '应用', exact: true }).click(); await expect(imagePrompt).toHaveValue(optimizedPrompt); check('IMAGE_OPTIMIZE_PREVIEW_APPLY_REACHES_DRAFT');
    assert.equal(optimizations[0].model, textModel.id);
    await select(textId); const dock = page.getByTestId('text-node-dock'); await expect(dock).toBeVisible(); await expect(page.getByRole('button', { name: '文字创作', exact: true })).toBeVisible(); assert.equal(await dock.getByRole('button', { name: '智能帮写', exact: true }).count(), 0); assert.equal(await page.getByRole('button', { name: '商品文案', exact: true }).count(), 0);
    await page.getByRole('button', { name: '更多节点操作', exact: true }).click(); await expect(page.getByRole('menuitem', { name: '商品文案', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); check('TEXT_WRITING_PRIMARY_PRODUCT_COPY_IN_MORE_ONLY');
    const textPrompt = dock.locator('textarea').first(); await textPrompt.fill(writePrompt); await dock.getByTestId('canvas-prompt-optimize').click(); await expect(page.getByRole('textbox', { name: '优化预览', exact: true })).toHaveValue('写一句突出轻盈营养、简洁自然的品牌文案。'); await page.getByRole('button', { name: '应用', exact: true }).click(); await expect(textPrompt).toHaveValue('写一句突出轻盈营养、简洁自然的品牌文案。'); check('TEXT_OPTIMIZER_PREVIEW_APPLY_REACHES_WRITING_DRAFT');
    await textPrompt.press('Control+Enter'); await expect(node(textId).getByRole('alert')).toContainText('文字回复未完整返回，请稍后重试'); assert.ok(!await node(textId).innerText().then(s => s.includes('选择原图反推'))); check('ORDINARY_TEXT_FAILURE_PERSISTS_EXACT_REASON_NOT_REVERSE_PROMPT');
    assert.equal(textWrites.at(-1).error, '文字回复未完整返回，请稍后重试'); textFail = false; await textPrompt.press('Control+Enter'); await expect(node(textId)).toContainText(written); await expect(node(textId).getByRole('alert')).toHaveCount(0); assert.equal(textWrites.at(-1).error, ''); check('TEXT_RETRY_SAVES_BODY_AND_CLEARS_OLD_ERROR');
    await page.screenshot({ path: path.join(out, 'text-writing.png') });
    await select(rootId); await page.getByRole('button', { name: '编辑图中文字', exact: true }).click();
    await expect.poll(() => ocrCatalogStarted).toBe(true); assert.equal(requests.filter(r => r.path === '/api/canvas/ocr' || r.body?.feature === 'canvas.ocr').length, 0); check('FIRST_OCR_WAITS_FOR_CATALOG_BEFORE_QUOTE');
    ocrCatalogRelease(); await expect(page.getByRole('textbox', { name: '修改文字 1', exact: true })).toHaveValue('N'); check('FIRST_OCR_QUOTE_AND_POST_USE_SAME_PUBLISHED_MODEL'); await page.waitForFunction(() => {const i=document.querySelector('img[alt="OCR 整图预览"]');return i?.complete&&i.naturalWidth>0;}); check('OCR_REFERENCE_PREVIEW_DECODED'); await page.screenshot({ path: path.join(out, 'ocr-first-open.png') });
    // Reload only reads the persisted local fixtures; this also checks saved text.
    await page.reload({ waitUntil: 'domcontentloaded' }); await node(rootId).waitFor(); await expect(node(textId)).toContainText(written);
    await select(rootId); await node(otherId).click({ position: { x: 100, y: 80 }, modifiers: ['Shift'] });
    const bar = page.getByTestId('image-batch-bar'); await expect(bar).toBeVisible(); await bar.getByRole('button', { name: '成组', exact: true }).click();
    const frame = page.getByTestId('canvas-group-frame'); await expect(frame).toBeVisible(); assert.equal(groups[0].assignments.length, 2); check('FULL_CANVAS_GROUP_API_AND_NATIVE_LAYER');
    await empty(); await expect(frame).toBeVisible(); await expect(frame).not.toHaveAttribute('data-selected', 'true'); check('GROUP_LAYER_PERSISTS_AFTER_DESELECTION');
    await page.screenshot({ path: path.join(out, 'group-persistent-full-canvas.png') });
    const before = await Promise.all([rootId, otherId].map(id => node(id).evaluate(el => ({ id: el.dataset.id, transform: el.style.transform }))));
    const box = await node(rootId).boundingBox(); await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 140, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => history.length).toBeGreaterThan(0); const after = await Promise.all([rootId, otherId].map(id => node(id).evaluate(el => ({ id: el.dataset.id, transform: el.style.transform })))); assert.ok(before.every((n, i) => n.transform !== after[i].transform)); const positions=history.at(-1).operations.filter(op=>op.type==='position'); assert.equal(positions.length,2); assert.ok(Math.abs((positions[1].x-positions[0].x)-410)<0.001); assert.equal(positions[1].y,positions[0].y); check('UNSELECTED_GROUP_MEMBER_FIRST_DRAG_MOVES_BOTH_WITH_SAME_DELTA');
    await page.getByRole('button', { name: '选择分组（2 张图片）', exact: true }).click(); await page.screenshot({ path: path.join(out, 'group-selected-full-canvas.png') });
    await page.reload({waitUntil:'domcontentloaded'});await node(rootId).waitFor();await expect(frame).toBeVisible();await expect(node(otherId)).toBeVisible();check('GROUP_PERSISTED_API_ID_REAPPEARS_AFTER_RELOAD');await page.getByRole('button',{name:'选择分组（2 张图片）',exact:true}).click();
    await page.getByTestId('image-batch-bar').getByRole('button', { name: '解组', exact: true }).click(); await expect(frame).toHaveCount(0); assert.equal(groups.at(-1).assignments.every(a => a.canvasGroupId === null), true); check('UNGROUP_REMOVES_ONLY_LAYER_PRESERVES_IMAGES_AND_EDGE');
    await expect(node(rootId)).toBeVisible(); await expect(node(otherId)).toBeVisible(); assert.ok(await page.locator('.react-flow__edge').count() > 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.equal(textGenerations.length, 2);
    const sourceHashes=Object.fromEntries(['src/components/canvas/canvas-client.tsx','src/components/canvas/group-layer.tsx','src/lib/canvas/group-layer.ts','src/lib/model-config/feature-client.ts','scripts/verify-canvas-feedback-integrated-ui.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    const result = { sourceHashes, checks, errors, external, requests, groups, history, optimizations, textGenerations, textWrites, productionWrites: 0, supplierCalls: 0, level: 'full-next-canvas-client-with-loopback-api-fixtures' };
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(result, null, 2)); console.log(`CANVAS_FEEDBACK_INTEGRATED_UI=PASS CHECKS=${checks.length} FULL_NEXT=YES SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0`);
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, checks, errors, external, requests, groups, history, optimizations, textWrites, text: await page.locator('body').innerText().catch(() => '') }, null, 2)); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
