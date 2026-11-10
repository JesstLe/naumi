'use strict';
// The complete Next route, CanvasClient and React Flow run unchanged. Only the
// loopback account/media/HTTP boundary is fixture-owned; no generation is sent.
// Run against an isolated source snapshot, not a production or shared dev server.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), sharp = require('sharp');
const { fixtureAccount, requireLoopback, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const baseline = args.includes('--baseline');
const base = process.env.CANVAS_COMPACT_DOCK_URL || 'http://127.0.0.1:15241';
const out = path.resolve(arg('--out', process.env.CANVAS_COMPACT_DOCK_OUT || `output/canvas-compact-dock-20261103/${baseline ? 'baseline' : 'modified'}`));
requireLoopback(base); fs.mkdirSync(out, { recursive: true });
const rootId = 'regeneration-root', referenceId = 'compact-reference';
const shortPrompt = '保持主体外形与原有构图不变，提升画面清晰度与材质细节，使用柔和自然光，背景简洁';
const longPrompt = Array.from({ length: 56 }, (_, i) => `第${String(i + 1).padStart(2, '0')}段：保持主体、背景、配色、材质、光影与构图不变，只增强清晰度；保留此段原文及标点。`).join('\n');
const checks = [], scenarios = [], errors = [], external = [], forbidden = [];
const sourceFiles = [
  'src/components/canvas/canvas-client.tsx', 'src/lib/canvas/dock-layout.ts',
  'src/components/canvas/composer-shell.tsx', 'src/components/canvas/composer-shell.module.css',
  'src/components/canvas/image-reference-composer.tsx', 'src/components/canvas/inline-reference-editor.tsx',
];
const sources = sourceFiles.map(file => {
  const bytes = fs.readFileSync(file);
  return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const priorReportPath = arg('--baseline-report', '');
const priorReport = priorReportPath ? JSON.parse(fs.readFileSync(path.resolve(priorReportPath), 'utf8')) : null;
const overlap = (a, b) => !a || !b ? 0 : Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const pass = name => { checks.push(name); console.log('PASS ' + name); };

async function scenario(browser, dimensions, referenceCount) {
  const name = `${dimensions.width}x${dimensions.height}-refs-${referenceCount}`;
  const folder = path.join(out, name); fs.mkdirSync(folder, { recursive: true });
  const desktop = dimensions.width >= 1000;
  const context = await browser.newContext({ viewport: dimensions, serviceWorkers: 'block', colorScheme: 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => localStorage.setItem('nv:canvas:bg', 'light'));
  page.on('pageerror', error => errors.push({ name, message: error.message }));
  const bytes = await sharp({ create: { width: 668, height: 1080, channels: 3, background: '#e6ebe7' } })
    .composite([{ input: Buffer.from('<svg width="668" height="1080"><rect x="213" y="260" width="242" height="560" rx="36" fill="#faf8f0"/><rect x="235" y="205" width="198" height="90" rx="18" fill="#819d8a"/><circle cx="334" cy="540" r="83" fill="#b9c7a5"/><path d="M286 665h96" stroke="#819d8a" stroke-width="14"/></svg>') }]).png().toBuffer();
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const account = fixtureAccount();
  // Two vertically aligned real image nodes leave a lateral expansion slot and
  // a separately clickable node for the expanded-state reset check.
  const art = { ...account.artworks[0], id: rootId, groupId: rootId,
    title: '产品原图.png — 紧凑创作栏标题与像素信息检查', prompt: '保留产品原图',
    image: '/media/compact-dock-product.png', width: 668, height: 1080,
    canvasWidth: 167, canvasHeight: 270, canvasX: dimensions.width * .4, canvasY: 180,
    parentIds: [referenceId], ratio: '9:16', resolution: '1K', canvasImageRevision: 0, canvasImageVersionId: 'initial' };
  const reference = { ...art, id: referenceId, title: '柔和光线参考.png', source: 'canvas-add',
    parentId: undefined, parentIds: [], image: '/media/compact-dock-reference.png', prompt: shortPrompt,
    canvasWidth: 110, canvasHeight: 178, canvasY: 520 };
  const artworks = [art, reference], fixtureState = {}, requests = [], fallbackReads = [], samples = [];
  const common = commonFixture({ account, artworks, state: fixtureState });
  const json = (route, value) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname, method = request.method();
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) {
      external.push({ name, method, url: request.url() }); return route.abort();
    }
    // Sentinels precede every fixture handler. Unknown mutations are also
    // aborted below, so an accidentally introduced generation route cannot run.
    if (/^\/api\/(imagegen|generate-image|cutout|upscale|prompt-assist|admin\/)/.test(p)
      || method !== 'GET' && /\/api\/.*(?:supplier|provider|agent|assistant)/.test(p)) {
      forbidden.push({ name, method, path: p, kind: 'generation-or-provider-sentinel' }); return route.abort();
    }
    if (p.startsWith('/media/compact-dock-') || p === '/api/download') return route.fulfill({ status: 200, contentType: 'image/png', body: bytes });
    if (p === '/api/account') return json(route, { ...account, artworks });
    if (await common.handle(route)) return;
    if (p === '/api/media/image-cache') return json(route, { account: account.user.email,
      results: Object.fromEntries(request.postDataJSON().sources.map(source => [source, {
        source, account: account.user.email, version: hash, fetchUrl: source, bytes: bytes.length, contentType: 'image/png',
      }])) });
    if (/^\/api\/canvas\/(text|video|director|character|scene|audio|timeline)-nodes$/.test(p) && method === 'GET') return json(route, { nodes: [], persisted: true });
    if (p === '/api/artworks/get') return json(route, { artworks });
    if (p === '/api/canvas/history' || p === '/api/artworks/position') {
      requests.push({ method, path: p, body: request.postData() ? request.postDataJSON() : null });
      return json(route, { ok: true, persisted: true });
    }
    if (p === '/api/canvas/assistant' && method === 'GET') return json(route, { sessions: [] });
    if (p.startsWith('/api/') && !['GET', 'HEAD'].includes(method)) {
      forbidden.push({ name, method, path: p, kind: 'unhandled-mutation-sentinel' }); return route.abort();
    }
    if (p.startsWith('/api/')) {
      fallbackReads.push({ method, path: p });
      return json(route, { ok: true, persisted: true, items: [], messages: [] });
    }
    return route.continue();
  });
  const node = id => page.locator(`.react-flow__node[data-id="${id || rootId}"]`);
  const dock = () => page.getByTestId('image-node-dock');
  const toolbar = () => page.getByTestId('image-node-toolbar');
  const editor = () => dock().getByRole('textbox', { name: '节点提示词', exact: true });
  const body = () => dock().locator('[data-composer-body]');
  const currentDocument = () => common.prompts.get(`tree:${rootId}|${rootId}`)?.document;
  async function settled() {
    let previous = '', stable = 0;
    await expect.poll(async () => {
      const current = await page.evaluate(() => {
        const d = document.querySelector('[data-testid="image-node-dock"]'), r = d?.getBoundingClientRect();
        return JSON.stringify({ box: r && [r.x, r.y, r.width, r.height], flow: document.querySelector('.react-flow__viewport')?.getAttribute('style') });
      });
      stable = current === previous ? stable + 1 : 0; previous = current; return stable;
    }, { timeout: 15000, intervals: [100] }).toBeGreaterThanOrEqual(4);
  }
  async function setZoomOne() {
    const view = page.getByTestId('canvas-view-toolbar');
    await view.getByRole('button', { name: /缩放.*%/ }).click();
    const input = view.locator('input[inputmode="decimal"]'); await input.fill('100'); await input.press('Enter');
    await expect(view.getByRole('button', { name: /缩放.*100%/ })).toBeVisible();
    await settled();
  }
  async function measure(label, selectedId = rootId) {
    await settled();
    const record = await page.evaluate(({ label, selectedId }) => {
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const d = document.querySelector('[data-testid="image-node-dock"]'), b = d?.querySelector('[data-composer-body]');
      const e = d?.querySelector('[role="textbox"]'), t = document.querySelector('[data-testid="image-node-toolbar"]');
      const n = document.querySelector(`.react-flow__node[data-id="${selectedId}"]`), submit = d?.querySelector('[data-testid="generation-submit-action"]');
      const s = box(submit), hit = s && document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
      const style = el => { if (!el) return null; const c = getComputedStyle(el); return { minHeight: c.minHeight, maxHeight: c.maxHeight, overflowX: c.overflowX, overflowY: c.overflowY }; };
      const ancestors=[];for(let parent=d?.parentElement;parent;parent=parent.parentElement){const c=getComputedStyle(parent);ancestors.push({tag:parent.tagName,id:parent.id,classes:String(parent.className).slice(0,180),rect:box(parent),position:c.position,width:c.width,minWidth:c.minWidth,maxWidth:c.maxWidth,marginLeft:c.marginLeft,paddingLeft:c.paddingLeft,transform:c.transform,scrollLeft:parent.scrollLeft});}
      return { label, selectedId, ancestors, density: d?.getAttribute('data-composer-density'), expanded: d?.getAttribute('data-composer-expanded'),
        dock: box(d), body: box(b), footer: box(d?.querySelector('[data-composer-footer]')), editor: box(e), editorStyle: style(e),
        dockStyle: style(d), bodyStyle: style(b), toolbar: box(t), node: box(n), title: box(n?.querySelector('.art-title')),
        pixel: box(n?.querySelector('[data-testid="image-pixel-size"]')), submit: s, submitHit: hit?.closest('button') === submit,
        submitDisabled: submit?.disabled, referenceCount: d?.querySelectorAll('[data-reference-number]').length,
        bodyScroll: b && { top: b.scrollTop, clientHeight: b.clientHeight, scrollHeight: b.scrollHeight },
        nestedVerticalScrollers: d ? Array.from(d.querySelectorAll('*')).filter(el => {
          const c = getComputedStyle(el); return /^(auto|scroll)$/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 1;
        }).map(el => ({ isBody: el === b, tag: el.tagName, role: el.getAttribute('role'), testId: el.getAttribute('data-testid') })) : [],
        shellScrollTop: d?.scrollTop, editorScrollTop: e?.scrollTop, pageScroll: { x: scrollX, y: scrollY },
        viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
        flowStyle: document.querySelector('.react-flow__viewport')?.getAttribute('style'), nodeStyle: n?.getAttribute('style') };
    }, { label, selectedId });
    record.titleDockOverlap = overlap(record.title, record.dock);
    record.titleToolbarOverlap = overlap(record.title, record.toolbar);
    record.pixelDockOverlap = overlap(record.pixel, record.dock);
    record.pixelToolbarOverlap = overlap(record.pixel, record.toolbar);
    record.imageDockOverlap = overlap(record.node, record.dock);
    samples.push(record);
    await page.screenshot({ path: path.join(folder, label + '.png') });
    return record;
  }
  function assertBounds(m) {
    assert(m.dock && m.submit, m.label + ': actual composer and Generate button exist');
    assert(m.dock.x >= -1 && m.dock.y >= -1 && m.dock.x + m.dock.width <= dimensions.width + 1 && m.dock.y + m.dock.height <= dimensions.height + 1, m.label + ': composer remains inside viewport');
    assert(m.viewport.scrollWidth <= dimensions.width + 1, m.label + ': no horizontal page overflow');
    assert(m.submit.x >= m.dock.x && m.submit.y >= m.dock.y && m.submit.x + m.submit.width <= m.dock.x + m.dock.width + 1 && m.submit.y + m.submit.height <= m.dock.y + m.dock.height + 1, m.label + ': Generate remains inside composer');
    assert.equal(m.submitHit, true, m.label + ': Generate center must hit the actual button');
  }
  function assertDesktopGeometry(m) {
    assertBounds(m);
    assert(m.title?.height > 0 && m.pixel?.width > 0, m.label + ': real node title and original pixel label exist');
    assert.equal(m.density, 'compact');
    assert(m.dock.width <= 620 + 1, m.label + ': image-only compact width limit');
    assert(m.toolbar.width <= 780 + 1, m.label + ': compact image toolbar width limit');
    for (const key of ['titleDockOverlap', 'titleToolbarOverlap', 'pixelDockOverlap', 'pixelToolbarOverlap']) assert.equal(m[key], 0, m.label + ': ' + key);
    assert.equal(m.imageDockOverlap, 0, m.label + ': desktop composer must not cover the selected image');
  }
  function unchangedCanvas(before, after, label) {
    assert.equal(after.nodeStyle, before.nodeStyle, label + ': node position and size stay unchanged');
    assert.equal(after.flowStyle, before.flowStyle, label + ': viewport pan and zoom stay unchanged');
  }
  try {
    await page.goto(base + '/canvas?project=tree%3Aregeneration-root', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await node().waitFor({ timeout: 180000 });
    const closeAssistant = page.getByRole('button', { name: '收起助手', exact: true });
    if (await closeAssistant.isVisible()) await closeAssistant.click();
    await node().click({ position: { x: 35, y: 45 } });
    await expect(dock()).toBeVisible(); await expect(editor()).toHaveAttribute('contenteditable', 'true');
    await setZoomOne();
    await expect(dock().locator('[data-reference-number]')).toHaveCount(2);
    if (!referenceCount) {
      // Exercise the product's real removal controls; never inject draft state.
      while (await dock().locator('[data-reference-number]').count()) await dock().getByRole('button', { name: /^移除图\d+$/ }).first().click();
    }
    await expect(dock().locator('[data-reference-number]')).toHaveCount(referenceCount);
    await editor().fill(shortPrompt);
    await expect.poll(() => currentDocument()?.prompt).toBe(shortPrompt);
    const normal = await measure('compact-default');
    if (desktop) {
      assert(Math.abs(normal.node.width - 167) <= 1 && Math.abs(normal.node.height - 270) <= 1, 'real narrow portrait image measures 167 by 270 at 100% zoom');
    }
    if (baseline) {
      if (desktop) {
        assert(Math.abs(normal.dock.width - 820) <= 1, 'baseline must actually reproduce the old 820px dock');
        assert.equal(parseFloat(normal.editorStyle.minHeight), 112, 'baseline must actually reproduce the old 112px editor minimum');
        assert.notEqual(normal.density, 'compact', 'baseline must use the original noncompact composer');
        pass(name + ':BASELINE_REAL_820_DOCK_112_EDITOR_REPRODUCED');
      } else pass(name + ':BASELINE_MOBILE_GEOMETRY_RECORDED');
    } else {
      assertBounds(normal);
      if (desktop) {
        assertDesktopGeometry(normal);
        assert.equal(parseFloat(normal.editorStyle.minHeight), 112, 'short prompt editor reserves a comfortable multi-line input');
        assert(normal.editor.height >= 112, 'the actual input must retain its minimum height');
        assert(normal.dock.height <= (referenceCount ? 336 : 296), 'content-sized dock includes the additional 56px of input space');
        assert(normal.dock.height <= 360 + 1, 'normal image dock height cap');
        if (priorReport) {
          assert.equal(priorReport.status, 'REPRODUCED', 'comparison uses a real reproduced baseline');
          const old = priorReport.scenarios.find(s => s.name === name)?.samples.find(s => s.label === 'compact-default');
          assert(old?.dock, name + ': matching baseline geometry exists');
          normal.baselineAreaRatio = normal.dock.width * normal.dock.height / (old.dock.width * old.dock.height);
          assert(normal.baselineAreaRatio <= .8, 'default dock occupies at least 20% less area than the observed baseline');
        }
        pass(name + ':COMPACT_SHORT_PROMPT_TITLE_PIXELS_IMAGE_AND_GENERATE');
      } else pass(name + ':MOBILE_PAGE_BOUNDS_AND_GENERATE_HIT');
      if (dimensions.width < 320) {
        const submit=dock().getByTestId('generation-submit-action');
        await editor().click();let reached=false;
        for(let step=0;step<24;step++){await page.keyboard.press('Tab');if(await submit.evaluate(el=>el===document.activeElement)){reached=true;break;}}
        assert(reached,'native keyboard Tab reaches Generate at the narrow viewport');
        await expect(submit).toBeFocused();
        // Playwright's native actionability/hit-target trial intentionally does
        // not dispatch paid generation; the existing POST sentinel stays zero.
        await submit.click({trial:true});
        const focused=await measure('narrow-keyboard-submit');assertBounds(focused);
        assert.equal(focused.ancestors.find(a=>a.classes.includes('canvas-stage'))?.scrollLeft,0,'canvas stage is not a native focus scroll container');
        pass(name + ':NATIVE_TAB_REACHES_SUBMIT_CLICK_ACTIONABLE_STAGE_SCROLL_ZERO');
      }

      if (desktop) {
        const rename = toolbar().locator('[data-action="rename"]');
        await expect(rename).toBeVisible();
        assert.equal((await rename.innerText()).trim(), '', 'rename is an accessible icon-only button');
        assert((await rename.getAttribute('aria-label'))?.length, 'rename icon keeps its accessible name');
        await toolbar().getByRole('button', { name: /更多/ }).click();
        const menu = page.getByTestId('canvas-node-action-menu'); await expect(menu).toBeVisible();
        for (const action of ['bg', 'angle', 'caption']) await expect(menu.locator(`[role="menuitem"][data-action="${action}"]`)).toBeVisible();
        await expect(menu.locator('[role="menuitem"][data-action="annotate"]')).toBeVisible();
        await expect(menu.locator('[role="menuitem"][data-action="replace"]')).toBeVisible();
        await page.screenshot({ path: path.join(folder, 'more-menu.png') });
        await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
        pass(name + ':MORE_MENU_RETAINS_BACKGROUND_ANGLE_CAPTION_MARK_REPLACE_WITHOUT_EXECUTION');

        const beforeExpand = await measure('before-expand');
        await dock().getByRole('button', { name: '展开输入区', exact: true }).click();
        await expect(dock()).toHaveAttribute('data-composer-expanded', 'true');
        const expanded = await measure('expanded');
        assertDesktopGeometry(expanded); unchangedCanvas(beforeExpand, expanded, 'expand');
        assert(expanded.dock.height >= 419 && expanded.dock.height <= 481, 'desktop expansion targets 420px and never exceeds 480px');
        assert(expanded.dock.height > normal.dock.height + 60, 'Expand provides a materially larger editor');
        assert(expanded.dock.x + expanded.dock.width <= expanded.node.x || expanded.dock.x >= expanded.node.x + expanded.node.width, 'wide desktop expansion prefers a lateral slot');
        await dock().getByRole('button', { name: '收起输入区', exact: true }).click();
        await expect(dock()).toHaveAttribute('data-composer-expanded', 'false');
        const collapsed = await measure('collapsed');
        assertDesktopGeometry(collapsed); unchangedCanvas(beforeExpand, collapsed, 'collapse');
        assert(Math.abs(collapsed.dock.height - normal.dock.height) <= 2, 'collapse restores content-sized height');
        assert.equal(await editor().textContent(), shortPrompt, 'expand/collapse preserves the 39-character prompt');
        pass(name + ':BOUNDED_SIDE_EXPANSION_COLLAPSE_PRESERVES_NODE_AND_VIEWPORT');

        if (referenceCount) {
          const role = dock().getByRole('combobox', { name: '图2用途', exact: true });
          await role.selectOption('style'); await expect(role).toHaveValue('style');
          await editor().fill(shortPrompt); await editor().press('Control+End'); await page.keyboard.type('@');
          const mentions = page.getByTestId('reference-mention-panel'); await expect(mentions).toBeVisible();
          await expect(mentions.getByRole('option')).toHaveCount(2);
          await mentions.getByRole('option').filter({ hasText: reference.title }).click();
          const chip = editor().locator(`[data-reference-key="node:${referenceId}"]`);
          await expect(chip).toHaveAttribute('data-inline-token', '【图2】');
          await expect(chip).toHaveAttribute('data-reference-missing', 'false');
          await expect.poll(() => currentDocument()?.prompt).toBe(shortPrompt + '【图2】');
          await expect.poll(() => currentDocument()?.bindings.find(b => b.key === 'node:' + referenceId)?.role).toBe('style');
          await expect(role).toHaveValue('style');
          await measure('reference-inserted');
          pass(name + ':AT_REFERENCE_INSERTION_PRESERVES_NUMBER_IDENTITY_AND_STYLE_ROLE');
        }

        await editor().fill(longPrompt);
        await expect.poll(() => currentDocument()?.prompt).toBe(longPrompt);
        assert.equal(await editor().textContent(), longPrompt, 'all long prompt characters and line breaks survive input');
        await body().evaluate(el => { el.scrollTop = 0; });
        const longBefore = await measure('long-prompt'); assertDesktopGeometry(longBefore);
        assert(longBefore.dock.height <= 361, 'long prompt stays within the ordinary 360px cap');
        assert(longBefore.bodyScroll.scrollHeight > longBefore.bodyScroll.clientHeight + 100, 'long prompt really overflows the body');
        assert.deepEqual(longBefore.nestedVerticalScrollers.map(s => s.isBody), [true], 'only composer body owns vertical scrolling');
        assert.equal(longBefore.editorStyle.overflowY, 'visible', 'inline editor does not introduce a nested scroll area');
        await body().hover(); await page.mouse.wheel(0, 260);
        await expect.poll(() => body().evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        const scrolled = await measure('long-prompt-scrolled'); assertDesktopGeometry(scrolled);
        unchangedCanvas(longBefore, scrolled, 'ordinary prompt scrolling');
        assert.equal(scrolled.shellScrollTop, 0); assert.equal(scrolled.editorScrollTop, 0);
        assert.deepEqual(scrolled.pageScroll, longBefore.pageScroll);
        assert.equal(await editor().textContent(), longPrompt);
        await dock().getByRole('button', { name: '展开输入区', exact: true }).click();
        const longExpanded = await measure('long-prompt-expanded'); assertDesktopGeometry(longExpanded);
        unchangedCanvas(scrolled, longExpanded, 'long prompt expansion');
        assert(longExpanded.dock.height >= 419 && longExpanded.dock.height <= 481);
        assert.equal(await editor().textContent(), longPrompt);
        await expect.poll(() => currentDocument()?.prompt).toBe(longPrompt);
        pass(name + ':LONG_PROMPT_EXACT_BODY_ONLY_NATIVE_SCROLL_AND_BOUNDED_EXPANSION');

        await node(referenceId).click({ position: { x: 35, y: 45 } });
        await expect(dock()).toHaveAttribute('data-composer-expanded', 'false');
        await expect(editor()).toHaveAttribute('contenteditable', 'true');
        await expect.poll(() => editor().textContent()).toBe(shortPrompt);
        const switched = await measure('node-switch-reset', referenceId); assertDesktopGeometry(switched);
        assert(switched.dock.height < longExpanded.dock.height, 'switching nodes resets expansion');
        assert.equal(currentDocument()?.prompt, longPrompt, 'switching nodes retains the original node draft');
        pass(name + ':NODE_SWITCH_RESETS_EXPANSION_AND_PRESERVES_PREVIOUS_DRAFT');
      }
    }
    const result = { status: baseline ? 'REPRODUCED' : 'PASS', name, referenceCount, viewport: dimensions, samples,
      requests, fallbackReads, promptRequests: fixtureState.promptRequests, source: 'complete actual Next + CanvasClient + React Flow; HTTP fixtures only' };
    scenarios.push(result); fs.writeFileSync(path.join(folder, 'RESULT.json'), JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'ERROR.json'), JSON.stringify({ error: error.stack, name, samples, requests, fallbackReads,
      promptRequests: fixtureState.promptRequests, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
    throw error;
  } finally { await context.close(); }
}

(async () => {
  let browser;
  try {
    assert.equal(Array.from(shortPrompt).length, 39);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const only = arg('--only', ''), viewport = arg('--viewport', '');
    assert(!viewport || /^\d{2,4}x\d{2,4}$/.test(viewport), 'Explicit viewport must be WIDTHxHEIGHT');
    const cases = viewport ? [viewport.split('x').map(Number)] : [[1440, 900], [1920, 948], [390, 844]];
    for (const [width, height] of cases) for (const references of [0, 2]) {
      if (!only || only === `${width}x${height}-refs-${references}`) await scenario(browser, { width, height }, references);
    }
    assert(scenarios.length, 'at least one actual browser scenario must execute');
    if (baseline) assert(checks.some(check => check.includes('BASELINE_REAL_820_DOCK_112_EDITOR_REPRODUCED')), 'baseline needs actual desktop regression evidence');
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(forbidden, []);
    const status = baseline ? 'REPRODUCED' : 'PASS', exit = baseline ? 1 : 0;
    const stdout = `CANVAS_COMPACT_DOCK_UI=${status} CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=${forbidden.length} PAGEERRORS=${errors.length} EXIT=${exit}`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status, checks, scenarios, errors, external, forbidden, sources,
      shortPrompt, shortPromptLength: Array.from(shortPrompt).length, longPrompt, baselineReport: priorReportPath || null,
      evidence: 'actual Next route and unchanged CanvasClient; native Chromium input; explicit local HTTP fixtures; no generation submitted', stdout, exit }, null, 2));
    console.log(stdout); process.exitCode = exit;
  } catch (error) {
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, checks, scenarios, errors, external, forbidden, sources, exit: 1 }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
