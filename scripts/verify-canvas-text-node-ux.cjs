#!/usr/bin/env node
'use strict';

/**
 * Actual Next/React CanvasClient driven by Chromium. All business HTTP APIs are
 * intercepted, with an in-memory persistence fixture and no real supplier/DB.
 * Start an isolated Next dev yourself; this script never starts a service.
 *
 * $env:CANVAS_TEXT_UX_URL='http://127.0.0.1:PORT'
 * $env:CANVAS_TEXT_UX_OUT='E:/absolute/evidence/modified-ui'
 * node scripts/verify-canvas-text-node-ux.cjs [--baseline] [--source-root ROOT]
 *
 * --baseline reproduces THIS change's old empty-node/editing behavior against
 * the old application's URL. Reproduced defects intentionally exit 1, not 0.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect: rawExpect } = require('@playwright/test');
const expect = rawExpect.configure({ timeout: 15000 });
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = (process.env.CANVAS_TEXT_UX_URL || 'http://127.0.0.1:15191').replace(/\/$/, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Fixture URL must be loopback');
const sourceRoot = path.resolve(arg('--source-root', process.env.CANVAS_TEXT_UX_SOURCE || path.join(__dirname, '..')));
const out = path.resolve(process.env.CANVAS_TEXT_UX_OUT || path.join(sourceRoot, 'output/canvas-text-node-ux', baseline ? 'baseline-ui' : 'modified-ui'));
fs.mkdirSync(out, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourcePaths = ['src/components/canvas/canvas-client.tsx', 'src/components/canvas/text-image-generation-dialog.tsx',
  'src/lib/canvas/text-image-inputs.ts', 'src/lib/canvas/text-edit-history.ts', 'src/app/api/canvas/text-generate/route.ts'];
const sourceHashes = Object.fromEntries(sourcePaths.filter(file => fs.existsSync(path.join(sourceRoot, file))).map(file => [file, hash(path.join(sourceRoot, file))]));
const LEVEL = 'full-next-react-canvas-client; browser HTTP boundary fixtures; in-memory persistence; no real DB or supplier';

async function main() {
  const browser = await chromium.launch({ channel: process.env.CANVAS_TEXT_UX_BROWSER || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const checks = [], errors = [], external = [], apiRequests = [], textWrites = [], textGenerations = [], imagePosts = [], history = [], screenshots = [];
  const now = new Date().toISOString(), account = 'text-node-ux@fixture.test';
  const rootId = 'text-ux-empty', otherId = 'text-ux-other', project = `tree:${rootId}`;
  const user = { email: account, name: '文字节点验收', plan: 'starter', creditsTotal: 9999, creditsUsed: 0,
    joinedAt: now, renewsAt: now, invoices: [], canHigh: true };
  const nodeRecord = (id, content, extra = {}) => ({ id, projectKey: project, title: id === rootId ? '空白文字' : '第二份文字',
    content, prompt: '', status: content ? 'completed' : 'idle', sourceIds: [], targetIds: [], productIds: [],
    canvasX: id === rootId ? 120 : 560, canvasY: 110, width: 350, height: 220, createdAt: now, updatedAt: now, ...extra });
  let texts = [nodeRecord(rootId, ''), nodeRecord(otherId, '另一份已保存正文', { prompt: '另一份写作要求' })];
  const generationIds = [];
  let settings = {}, textMode = 'fail', delayTextSave = false, releaseTextSave, failTextSave = false;
  let generated = '清晨的白鹭停在石桥边，柔和日光照亮水面。';
  const imageModel = { id: 'fixture-image', label: '图片模型', modality: 'image', supportsEdit: true, qualities: ['medium'],
    qualitySupported: true, nativeResolutions: ['1K'], generationParameters: { ratios: ['auto', '1:1', '3:4', '16:9'], resolutions: ['1K'] } };
  const textModel = { id: 'fixture-text', label: '文字模型', modality: 'text', supportsVision: true };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(body) });
  const snapshot = () => ({ sourceRoot, sourceHashes, scriptHash: hash(__filename), level: LEVEL, checks, errors, external,
    apiRequests, textWrites, textGenerations, imagePosts, history, texts, settings, screenshots,
    productionWrites: 0, realSupplierCalls: 0, realDatabaseWrites: 0 });
  const check = name => { checks.push(name); console.log(`CHECK=${name}`); };
  const screenshot = async name => { const file = path.join(out, name + '.png'); await page.screenshot({ path: file, fullPage: false }); screenshots.push(file); };
  const saved = id => texts.find(item => item.id === id);
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const dock = () => page.getByTestId('text-node-dock');
  const body = () => dock().getByRole('textbox', { name: '文字内容', exact: true });
  const cardBody = id => node(id).getByRole('textbox', { name: '文字内容', exact: true });
  const instruction = () => dock().getByRole('textbox', { name: 'AI 写作要求', exact: true });
  const tab = name => dock().getByRole('tab', { name, exact: true });
  const select = async id => {
    await node(id).getByTestId('text-node-title').click({ position: { x: 45, y: 15 } });
    await expect(dock()).toBeVisible();
  };
  const load = async id => {
    await page.goto(`${base}/canvas?node=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await node(id).waitFor({ timeout: 120000 });
    const hideAssistant = page.getByRole('button', { name: '收起助手', exact: true });
    if (await hideAssistant.isVisible()) await hideAssistant.click();
    // Canvas owns selection separately from ReactFlow's CSS class. A deep link
    // may already have opened the target dock, whose controls can cover its
    // title on mobile; only click if the dock still needs to be opened.
    if (!await dock().isVisible()) await select(id);
    await expect(dock()).toBeVisible();
    await expect(dock().locator('[data-composer-header]')).toContainText(saved(id).title);
  };
  const assertNoImagePurchase = () => assert.equal(imagePosts.length, 0, 'Editing/opening/cancelling must not submit image work');
  const assertNoModelPost = () => { assert.equal(textGenerations.length, 0); assertNoImagePurchase(); };
  const withinViewport = async locator => {
    const bounds = await locator.boundingBox(), viewport = page.viewportSize();
    assert.ok(bounds, 'Visible element has bounds');
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify({ bounds, viewport }));
  };
  await context.addInitScript(({ project }) => {
    localStorage.setItem('nv:canvas:last', project);
    localStorage.setItem('nv:canvas:bg', 'light');
    localStorage.setItem('naumi:locale', 'zh');
  }, { project });
  page.on('pageerror', error => errors.push(error.stack || error.message));

  // Nothing under /api reaches the application server. Unknown requests are
  // recorded so the report states the exact HTTP-boundary fixture coverage.
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !['blob:', 'data:'].includes(url.protocol)) {
      external.push({ origin: url.origin, path: p }); return route.abort();
    }
    if (!p.startsWith('/api/')) return route.continue();
    let payload = null;
    try { payload = req.postDataJSON(); } catch { /* multipart requests still get denied below */ }
    apiRequests.push({ method: req.method(), path: p, query: url.search, body: payload });
    if (p === '/api/config') return json(route, { db: true, authMode: 'mock', multiUser: true, commerceVisible: false,
      imageQualityCapable: true, creditsMetered: true, imageModels: [imageModel], defaultImageModelId: imageModel.id });
    if (p === '/api/auth/session') return json(route, { user });
    if (p === '/api/account') return json(route, { persisted: true, user, artworks: [] });
    if (p === '/api/feature-access') return json(route, { email: account, policy: { mode: 'default', allowed: [], version: 1 } });
    if (p === '/api/projects') return json(route, { names: { [project]: '文字工作区' } });
    if (p === '/api/canvas/workflow-import' && req.method() === 'GET') return json(route, { manifests: [] });
    if (p === '/api/canvas/text-nodes') {
      if (req.method() === 'POST') {
        textWrites.push(structuredClone(payload));
        if (delayTextSave && payload.id === rootId) await new Promise(resolve => { releaseTextSave = resolve; });
        if (failTextSave) return json(route, { error: 'fixture 文本保存失败' }, 500);
        for (const value of payload.nodes || [payload]) {
          const index = texts.findIndex(item => item.id === value.id);
          const written = { ...(index >= 0 ? texts[index] : {}), ...value };
          if (index >= 0) texts[index] = written; else texts.push(written);
        }
        return json(route, { persisted: true, node: saved(payload.id), nodes: texts });
      }
      return json(route, { persisted: true, nodes: texts });
    }
    if (p === '/api/canvas/node-settings') return json(route, { persisted: true, settings });
    if (p === '/api/canvas/history') {
      history.push(structuredClone(payload));
      for (const operation of payload.operations || []) {
        const current = saved(operation.id);
        if (operation.type === 'text-patch' && current) Object.assign(current, operation.fields);
        if (operation.type === 'position' && current) Object.assign(current, { canvasX: operation.x, canvasY: operation.y });
        if (operation.type === 'node-settings') settings[operation.id] = operation.settings;
        if (operation.type === 'text-delete') texts = texts.filter(item => item.id !== operation.id);
        if (operation.type === 'text-restore') texts = [...texts.filter(item => item.id !== operation.node.id), operation.node];
      }
      return json(route, { ok: true, persisted: true });
    }
    if (p === '/api/models') {
      const feature = url.searchParams.get('feature'), isText = ['canvas.text-generate', 'canvas.assistant', 'canvas.ocr'].includes(feature);
      const model = isText ? textModel : imageModel;
      return json(route, { managed: true, supported: true, available: true, feature, version: 1, models: [model], defaultModelId: model.id });
    }
    if (p === '/api/text-models') return json(route, { models: [textModel.id], defaultModel: textModel.id });
    if (p === '/api/billing/catalog') return json(route, { version: 1,
      features: Object.fromEntries(['image.generate', 'canvas.image', 'canvas.text-generate', 'canvas.assistant', 'canvas.ocr'].map(feature =>
        [feature, { label: feature, enabled: true, unit: 'image', prices: { medium: { '1K': 0 } } }])),
      products: [], thresholds: { highQualityPaidFen: 0, agentConfirmCredits: 100 }, effective: { metering: true, commerce: false, recharge: false } });
    if (p === '/api/billing/quote') return json(route, { ...payload, credits: 0, reserveCredits: 0, version: 1, modelVersion: 1, quote: { id: `text-ux-quote-${apiRequests.length}` } });
    if (p === '/api/canvas/text-generate') {
      textGenerations.push(structuredClone(payload));
      // This scenario exercises an identity-bound settled failure, not a bare
      // TEXT_OUTPUT_LIMIT (which can remain financially UNKNOWN on the server).
      const operationId = req.headers()['x-naumi-billing-operation-id'];generationIds.push(operationId);
      if(textMode==='partial')return json(route,{error:'回复尚未写完，已保留生成内容',code:'TEXT_OUTPUT_LIMIT',finishReason:'length',partialText:'第一段：清晨的白鹭停在石桥边。',terminal:true,status:'failed',operationId:`tool-${operationId}`,chargedCredits:0},422);
      return textMode === 'fail' ? json(route, { error: '文字回复未完整返回，请稍后重试', code: 'TEXT_OUTPUT_LIMIT',
        terminal: true, status: 'failed', operationId: `tool-${operationId}`, chargedCredits: 0 }, 502)
        : json(route, { text: generated, model: textModel.id });
    }
    if ((p.startsWith('/api/imagegen') || p === '/api/generate-image' || p === '/api/canvas/image-tasks' || p === '/api/video/generate') && req.method() === 'POST') {
      imagePosts.push({ path: p, body: payload });
      return json(route, { error: 'This editing acceptance must not submit generation', code: 'FIXTURE_UNEXPECTED_GENERATION' }, 409);
    }
    if (p === '/api/prompt-assist') return json(route, { error: 'No optimizer execution requested in this acceptance' }, 409);
    if (p === '/api/artworks/get') return json(route, { artworks: [] });
    return json(route, { items: [], tasks: [], names: {}, nodes: [], settings: {}, records: [], artworks: [], models: [], ok: true, persisted: true });
  });

  try {
    await load(rootId);

    if(args.includes('--completion-only')){
      await body().fill('原有正文必须保留。');await expect.poll(()=>saved(rootId).content).toBe('原有正文必须保留。');
      await tab('AI 写作').click();await instruction().fill('写两段完整的画面描述');textMode='partial';
      await instruction().press('Control+Enter');await expect.poll(()=>textGenerations.length).toBe(1);
      const partial=dock().getByRole('region',{name:'未完成的回复'});
      if(args.includes('--expect-old')){
        await expect(node(rootId).getByRole('alert')).toContainText('回复尚未写完');assert.equal(await partial.count(),0);
        await screenshot('baseline-missing-partial-preview');console.log('TEXT_COMPLETION_BASELINE=REPRODUCED PARTIAL_LOST=1 EXIT=1');process.exitCode=1;return;
      }
      await expect(partial).toContainText('第一段：');assert.equal(saved(rootId).content,'原有正文必须保留。');
      await tab('正文').click();await body().press('Control+Enter');assert.equal(textGenerations.length,1);check('CONTENT_SHORTCUT_SAVES_WITHOUT_CONTINUATION');await tab('AI 写作').click();
      await expect(dock().getByRole('button',{name:'继续写作',exact:true})).toBeEnabled();check('PARTIAL_VISIBLE_ORIGINAL_BODY_PRESERVED');await screenshot('partial-desktop');
      await page.setViewportSize({width:390,height:844});await withinViewport(partial);await withinViewport(dock().getByRole('button',{name:'继续写作',exact:true}));await expect(dock().getByRole('button',{name:'继续写作',exact:true})).toBeInViewport();assert.ok(await dock().getByRole('button',{name:'继续写作',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit)}),'Primary action must not be clipped by panel');await screenshot('partial-mobile');check('PARTIAL_MOBILE_LAYOUT');
      await page.setViewportSize({width:1440,height:1000});await load(rootId);await expect(partial).toContainText('第一段：');assert.equal(textGenerations.length,1);check('PARTIAL_REFRESH_NO_MODEL_SUBMISSION');
      await dock().getByRole('button',{name:'使用这段文字',exact:true}).click();await expect.poll(()=>saved(rootId).content).toBe('第一段：清晨的白鹭停在石桥边。');assert.equal(textGenerations.length,1);check('EXPLICIT_APPLY_ZERO_MODEL_POST');await screenshot('applied-partial');
      await tab('AI 写作').click();await instruction().fill('继续写成两段描述');await instruction().press('Control+Enter');await expect(partial).toBeVisible();assert.equal(textGenerations.length,2);
      const source=generationIds[1];textMode='success';generated='第一段：清晨的白鹭停在石桥边。\n第二段：远处青山倒映在水面。';
      await dock().getByRole('button',{name:'继续写作',exact:true}).click();await expect.poll(()=>saved(rootId).content).toBe(generated);assert.equal(textGenerations.length,3);assert.equal(textGenerations[2].continuationOf,source);assert.notEqual(generationIds[2],source);check('EXPLICIT_CONTINUATION_NEW_ID_LINKS_ORIGINAL');
      await screenshot('completed-continuation');
      await tab('AI 写作').click();await instruction().fill('另写一段');textMode='partial';await instruction().press('Control+Enter');await expect(partial).toBeVisible();
      const beforeDiscard=textGenerations.length,kept=saved(rootId).content;await dock().getByRole('button',{name:'放弃本次回复',exact:true}).click();await expect(partial).toBeHidden();assert.equal(textGenerations.length,beforeDiscard);assert.equal(saved(rootId).content,kept);check('DISCARD_PARTIAL_PRESERVES_BODY_NO_MODEL_CALL');
      textMode='success';await instruction().fill('修改后的新要求');await instruction().press('Control+Enter');await expect.poll(()=>textGenerations.length).toBe(beforeDiscard+1);assert.equal(textGenerations.at(-1).prompt,'修改后的新要求');assert.equal(textGenerations.at(-1).continuationOf,undefined);check('EDITED_NEW_INTENT_AFTER_EXPLICIT_DISCARD');
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assertNoImagePurchase();
      fs.writeFileSync(path.join(out,'COMPLETION.json'),JSON.stringify({...snapshot(),result:'PASS',generationIds},null,2));
      console.log(`CANVAS_TEXT_COMPLETION_UI=PASS CHECKS=${checks.length} FULL_REACT=YES API_FIXTURE=YES REAL_SUPPLIER_CALLS=0`);return;
    }
    if(args.includes('--layout-only')){
      await require('./verification/canvas-text-layout-browser.cjs')({page,rootId,node,dock,body,cardBody,tab,instruction,load,saved,check,screenshot,
        generated:value=>{generated=value;textMode='success';}});
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assertNoImagePurchase();
      fs.writeFileSync(path.join(out,'LAYOUT.json'),JSON.stringify({...snapshot(),result:'PASS'},null,2));
      console.log(`CANVAS_TEXT_LAYOUT=PASS CHECKS=${checks.length} FULL_REACT=YES REAL_SUPPLIER_CALLS=0`);return;
    }
    if (baseline) {
      assert.equal(await node(rootId).locator('textarea').count(), 0, 'Old empty text card must reproduce its non-editable state');
      assert.equal(await dock().getByRole('tab', { name: '正文', exact: true }).count(), 0);
      check('BASELINE_EMPTY_IDLE_NODE_HAS_NO_BODY_EDITOR');
      const mixedInput = dock().locator('textarea').first(), marker = '基线未保存的直接输入正文';
      await mixedInput.fill(marker);
      await screenshot('baseline-mixed-input');
      await select(otherId);
      await load(rootId);
      assert.equal(saved(rootId).content, '');
      assert.equal(textWrites.some(item => item.content === marker), false);
      assert.notEqual(await dock().locator('textarea').first().inputValue(), marker);
      assertNoModelPost();
      check('BASELINE_DOCK_TYPING_IS_NOT_SAVED_AS_BODY');
      await screenshot('baseline-empty-node-after-reload');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      fs.writeFileSync(path.join(out, 'BASELINE.json'), JSON.stringify({ ...snapshot(), result: 'REPRODUCED', exit: 1 }, null, 2));
      console.log(`CANVAS_TEXT_NODE_UX_BASELINE=REPRODUCED CHECKS=${checks.length} FULL_REACT=YES API_FIXTURES=YES REAL_SUPPLIER_CALLS=0 EXIT=1`);
      process.exitCode = 1; return;
    }

    await expect(cardBody(rootId)).toBeEditable();
    await expect(tab('正文')).toHaveAttribute('aria-selected', 'true');
    await expect(body()).toHaveValue('');
    const initial = '一只白鹭站在雨后的石桥上，水面泛起涟漪。';
    await body().fill(initial);
    await expect.poll(() => saved(rootId).content).toBe(initial);
    assert.equal(saved(rootId).status, 'completed');
    await expect(cardBody(rootId)).toHaveValue(initial);
    assertNoModelPost(); check('EMPTY_NODE_DIRECT_BODY_AUTOSAVE_WITHOUT_MODEL');
    await screenshot('direct-text-desktop');
    await load(rootId);
    await expect(body()).toHaveValue(initial);
    await expect(cardBody(rootId)).toHaveValue(initial);
    assertNoModelPost(); check('DIRECT_BODY_SURVIVES_FULL_RELOAD');

    const writingInstruction = '润色成一句简洁的画面描述，保留白鹭与石桥。';
    await tab('AI 写作').click();
    await instruction().fill(writingInstruction);
    await tab('正文').click();
    await expect(body()).toHaveValue(initial);
    await tab('AI 写作').click();
    await expect(instruction()).toHaveValue(writingInstruction);
    await tab('正文').click();
    const extended = initial + '\n远处是一片低矮的青山。';
    await dock().getByRole('button', { name: '展开文字编辑窗口', exact: true }).click();
    await body().fill(extended);
    await expect.poll(() => saved(rootId).content).toBe(extended);
    await expect(dock().getByRole('button', { name: '收起文字编辑窗口', exact: true })).toBeVisible();
    await tab('AI 写作').click();
    await expect(instruction()).toHaveValue(writingInstruction);
    await tab('正文').click();
    await expect(body()).toHaveValue(extended);
    await screenshot('expanded-body');
    await dock().getByRole('button', { name: '收起文字编辑窗口', exact: true }).click();
    assertNoModelPost(); check('BODY_INSTRUCTION_AND_EXPANDED_STATE_STAY_SEPARATE');

    await select(otherId);
    await expect(body()).toHaveValue('另一份已保存正文');
    await select(rootId);
    await expect(body()).toHaveValue(extended);
    await tab('AI 写作').click();
    await expect(instruction()).toHaveValue(writingInstruction);
    await tab('正文').click();
    check('NODE_SWITCH_PRESERVES_OWN_BODY_AND_WRITING_INSTRUCTION');

    await body().fill('');
    await tab('AI 写作').click(); // A real blur, not a synthetic save call.
    await expect.poll(() => saved(rootId).content).toBe('');
    await expect(instruction()).toHaveValue(writingInstruction);
    await load(rootId);
    await expect(body()).toHaveValue('');
    await expect(cardBody(rootId)).toHaveValue('');
    await dock().getByRole('button', { name: '生成图片', exact: true }).click();
    const dialog = page.getByTestId('text-image-generation-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '生成图片', exact: true })).toBeDisabled();
    assert.equal(await dialog.innerText().then(value => value.includes(writingInstruction)), false);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assertNoModelPost(); check('CLEARED_BODY_IS_EMPTY_NOT_OLD_INSTRUCTION_OR_PROMPT');

    const immediateBody = '蓝色玻璃花瓶放在浅色木桌上，窗边自然光。';
    await body().fill(immediateBody);
    await dock().getByRole('button', { name: '生成图片', exact: true }).click();
    await expect(dialog).toBeVisible();
    const preview = dialog.getByRole('textbox', { name: '图片提示词预览', exact: true });
    await expect(preview).toHaveValue(immediateBody);
    await expect(preview).toHaveAttribute('readonly', '');
    await expect(dialog.getByRole('button', { name: '生成图片', exact: true })).toBeEnabled();
    assert.equal(await dialog.innerText().then(value => value.includes(writingInstruction)), false);
    await screenshot('text-image-preview');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect.poll(() => saved(rootId).content).toBe(immediateBody);
    assertNoModelPost(); check('IMMEDIATE_IMAGE_PREVIEW_FREEZES_LATEST_BODY_CANCEL_POSTS_ZERO');

    await tab('AI 写作').click();
    await instruction().fill(writingInstruction);
    await instruction().press('Control+Enter');
    await expect.poll(() => textGenerations.length).toBe(1);
    assert.equal(textGenerations[0].prompt, writingInstruction);
    assert.equal(textGenerations[0].content, immediateBody);
    assert.deepEqual(textGenerations[0].sourceIds, []);
    await expect(node(rootId).getByRole('alert')).toContainText('文字回复未完整返回');
    await expect(cardBody(rootId)).toHaveValue(immediateBody);
    await expect(cardBody(rootId)).toBeEditable();
    await tab('正文').click();
    const afterFailure = immediateBody + '\n背景保持干净。';
    await body().fill(afterFailure);
    await expect.poll(() => saved(rootId).content).toBe(afterFailure);
    check('AI_FAILURE_RETAINS_EDITABLE_BODY_AND_SEPARATE_REQUEST_FIELDS');

    textMode = 'success';
    await tab('AI 写作').click();
    await instruction().fill(writingInstruction);
    await instruction().press('Control+Enter');
    await expect.poll(() => textGenerations.length).toBe(2);
    assert.equal(textGenerations[1].prompt, writingInstruction);
    assert.equal(textGenerations[1].content, afterFailure);
    await expect(tab('正文')).toHaveAttribute('aria-selected', 'true');
    await expect(body()).toHaveValue(generated);
    await expect.poll(() => saved(rootId).content).toBe(generated);
    await expect(node(rootId).getByRole('alert')).toHaveCount(0);
    assertNoImagePurchase(); check('AI_SUCCESS_SAVES_TEXT_RETURNS_BODY_AND_CLEARS_FAILURE');
    await screenshot('ai-writing-result');

    // Ctrl+Enter keeps focus on the reused textarea across the write -> body
    // mode switch. Its next edit must start a fresh undo baseline, not reuse
    // the AI instruction that previously occupied the focused control.
    await expect(body()).toBeFocused();
    await body().press('Control+End');
    const keyboardSuffix = '远山映在平静水面。';
    await body().pressSequentially(keyboardSuffix);
    await expect(body()).toHaveValue(generated + keyboardSuffix);
    await node(rootId).getByTestId('text-node-title').click({ position: { x: 45, y: 15 } });
    await expect.poll(() => saved(rootId).content).toBe(generated + keyboardSuffix);
    await page.keyboard.press('Control+z');
    await expect.poll(() => saved(rootId).content).toBe(generated);
    await expect(cardBody(rootId)).toHaveValue(generated);
    check('CTRL_ENTER_RESULT_NEXT_KEYBOARD_EDIT_HAS_OWN_UNDO_BASELINE');

    // Use actual canvas-level undo again, not native textarea undo.
    await node(rootId).getByTestId('text-node-title').click({ position: { x: 45, y: 15 } });
    await page.keyboard.press('Control+z');
    await expect.poll(() => saved(rootId).content).toBe(afterFailure);
    await expect(cardBody(rootId)).toHaveValue(afterFailure);
    assert.ok(history.some(entry => entry.operations?.some(operation => operation.type === 'text-patch')));
    check('AI_RESULT_UNDO_RESTORES_PRIOR_BODY_THROUGH_HISTORY');

    await select(rootId);
    const pendingText = afterFailure + '\n保存响应尚未返回。';
    delayTextSave = true;
    await body().fill(pendingText);
    await expect.poll(() => typeof releaseTextSave).toBe('function');
    assert.notEqual(saved(rootId).content, pendingText, 'HTTP boundary has not acknowledged the draft yet');
    const beforeUnload = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      const dispatched = window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, dispatched };
    });
    assert.equal(beforeUnload.defaultPrevented, true);
    assert.equal(beforeUnload.dispatched, false);
    delayTextSave = false; releaseTextSave(); releaseTextSave = undefined;
    await expect.poll(() => saved(rootId).content).toBe(pendingText);
    await body().fill(afterFailure);
    await node(rootId).getByTestId('text-node-title').click({ position: { x: 45, y: 15 } });
    await expect.poll(() => saved(rootId).content).toBe(afterFailure);
    assertNoImagePurchase();
    check('PENDING_TEXT_HTTP_SAVE_PROTECTS_BEFOREUNLOAD_UNTIL_ACK');

    await select(rootId);
    await page.getByTestId('text-node-toolbar').getByRole('button', { name: '更多节点操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '锁定节点', exact: true }).click();
    await expect.poll(() => settings[rootId]?.locked).toBe(true);
    await expect(cardBody(rootId)).not.toBeEditable();
    await expect(dock()).toHaveCount(0);
    const modelCount = textGenerations.length;
    await page.getByTestId('text-node-toolbar').getByRole('button', { name: '更多节点操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '解锁节点', exact: true }).click();
    await expect.poll(() => settings[rootId]?.locked).toBe(false);
    await select(rootId); await expect(body()).toBeEditable();
    assert.equal(textGenerations.length, modelCount); assertNoImagePurchase();
    check('NODE_LOCK_PREVENTS_BODY_EDIT_AND_UNLOCK_RESTORES_EDITOR');

    // Drag the title, not the textarea (which correctly owns pointer/selection).
    const beforeMove = { x: saved(rootId).canvasX, y: saved(rootId).canvasY };
    const titleBounds = await node(rootId).getByTestId('text-node-title').boundingBox();
    await page.mouse.move(titleBounds.x + 80, titleBounds.y + 14); await page.mouse.down();
    await page.mouse.move(titleBounds.x + 130, titleBounds.y + 44, { steps: 6 }); await page.mouse.up();
    await expect.poll(() => saved(rootId).canvasX !== beforeMove.x || saved(rootId).canvasY !== beforeMove.y).toBe(true);
    assert.equal(saved(rootId).content, afterFailure);
    check('TEXT_NODE_MOVE_PERSISTS_POSITION_WITHOUT_CHANGING_BODY');

    // The creation action itself must produce an editable empty card; a seeded
    // fixture alone would not prove the public Add-node entry point.
    await page.getByTestId('canvas-add-node-button').click();
    await page.getByTestId('canvas-create-menu').locator('[data-action="text"]').click();
    await expect.poll(() => texts.length).toBe(3);
    const createdId = texts.find(item => item.id !== rootId && item.id !== otherId).id;
    await expect(cardBody(createdId)).toBeEditable();
    await expect(body()).toHaveValue('');
    await body().fill('通过新增入口手写的独立文字');
    await expect.poll(() => saved(createdId).content).toBe('通过新增入口手写的独立文字');
    assert.equal(textGenerations.length, 2); assertNoImagePurchase();
    check('PUBLIC_ADD_TEXT_NODE_IS_EDITABLE_AND_SAVES_WITHOUT_GENERATION');

    await page.setViewportSize({ width: 390, height: 844 });
    await load(rootId); await expect(body()).toHaveValue(afterFailure);
    await withinViewport(dock());
    await expect(body()).toBeEditable();
    await screenshot('mobile-body-390');
    await tab('AI 写作').click();
    await expect(instruction()).toBeVisible(); await withinViewport(dock());
    await screenshot('mobile-writing-390');
    await tab('正文').click();
    await dock().getByRole('button', { name: '生成图片', exact: true }).click();
    await expect(dialog).toBeVisible(); await withinViewport(dialog);
    await expect(preview).toHaveValue(afterFailure);
    await screenshot('mobile-image-preview-390');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(textGenerations.length, 2); assertNoImagePurchase();
    check('MOBILE_BODY_WRITING_AND_PREVIEW_FIT_390_VIEWPORT');

    // A separate graph fixture for save barriers: B already references A.
    // This is NOT a claim that the fixture tested connection creation itself.
    await page.setViewportSize({ width: 1440, height: 1000 });
    texts = texts.filter(item => item.id !== createdId);
    Object.assign(saved(rootId), { canvasX: 120, canvasY: 110 });
    saved(otherId).sourceIds = [rootId];
    await load(rootId);
    delayTextSave = true;
    const upstreamDraft = afterFailure + '\n上游待保存的最新补充。';
    await body().fill(upstreamDraft);
    await expect.poll(() => typeof releaseTextSave).toBe('function');
    await select(otherId);
    await tab('AI 写作').click();
    await instruction().fill('根据上游正文写一句标题');
    await instruction().press('Control+Enter');
    // The observable boundary remains held longer than the autosave debounce.
    await page.waitForTimeout(800);
    assert.equal(textGenerations.length, 2, 'No model POST before the upstream save ACK');
    delayTextSave = false; releaseTextSave(); releaseTextSave = undefined;
    await expect.poll(() => textGenerations.length).toBe(3);
    assert.equal(saved(rootId).content, upstreamDraft);
    assert.deepEqual(textGenerations[2].sourceIds, [rootId]);
    await expect.poll(() => saved(otherId).content).toBe(generated);
    check('AI_GENERATION_WAITS_FOR_REFERENCED_TEXT_SAVE_ACK');

    await select(rootId);
    const generationsBeforeSaveFailure = textGenerations.length;
    failTextSave = true;
    await body().fill(upstreamDraft + '\n这次保存将失败。');
    const failedWriteCount = textWrites.length;
    await tab('AI 写作').click();
    await instruction().fill('保存成功之后才能改写');
    await instruction().press('Control+Enter');
    await expect.poll(() => textWrites.length).toBeGreaterThan(failedWriteCount);
    await page.waitForTimeout(800);
    assert.equal(textGenerations.length, generationsBeforeSaveFailure, 'Failed draft save must not begin a model call');
    assertNoImagePurchase();
    failTextSave = false;
    check('FAILED_BODY_SAVE_BLOCKS_MODEL_SUBMISSION');

    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(out, 'MODIFIED.json'), JSON.stringify({ ...snapshot(), result: 'PASS', exit: 0 }, null, 2));
    console.log(`CANVAS_TEXT_NODE_UX=PASS CHECKS=${checks.length} FULL_REACT=YES API_FIXTURES=YES REAL_SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0`);
  } catch (error) {
    await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ ...snapshot(), result: 'FAIL', error: error.stack,
      bodyText: await page.locator('body').innerText().catch(() => ''), exit: 1 }, null, 2));
    throw error;
  } finally { delayTextSave = false; releaseTextSave?.(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
