'use strict';
// Real Next/CanvasClient/React Flow. Business HTTP/media are explicit fixtures.
// Native input is sent through Playwright; synthetic events test cancellation
// separately and do not claim physical OS/Safari browser-chrome acceptance.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');
const { fixtureAccount, requireLoopback, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const base = process.env.CANVAS_ZOOM_URL, out = path.resolve(process.env.CANVAS_ZOOM_OUT);
const baseline = process.argv.includes('--baseline'), rootId = 'regeneration-root';
requireLoopback(base); fs.mkdirSync(out, { recursive: true });
const checks = [], samples = [], errors = [], external = [], forbidden = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const source = 'src/components/canvas/canvas-client.tsx';
const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
let browser, page;
(async () => {
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.addInitScript(() => {
      window.__zoomEvents = [];
      window.__zoomDocumentId = Math.random();
      window.addEventListener('wheel', event => {
        const target = event.target;
        setTimeout(() => window.__zoomEvents.push({ trusted: event.isTrusted, canceled: event.defaultPrevented,
          cancelable: event.cancelable, ctrl: event.ctrlKey, meta: event.metaKey,
          target: target?.closest?.('[data-testid]')?.getAttribute('data-testid') || target?.tagName }), 0);
      }, true);
    });
    page.on('pageerror', e => errors.push(e.message));
    const account = fixtureAccount();
    const bytes = await sharp({ create: { width: 768, height: 768, channels: 3, background: '#d5e3da' } })
      .composite([{ input: Buffer.from('<svg width="768" height="768"><rect x="230" y="180" width="308" height="440" rx="44" fill="#fdf8ed"/><rect x="260" y="125" width="248" height="90" rx="16" fill="#708d7d"/><circle cx="384" cy="370" r="90" fill="#c2b47d"/></svg>') }]).png().toBuffer();
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const art = { ...account.artworks[0], id: rootId, groupId: rootId, title: '产品.png', image: '/media/zoom-fixture.png',
      width: 768, height: 768, canvasWidth: 300, canvasHeight: 300, canvasX: 220, canvasY: 170,
      parentIds: [], ratio: '1:1', resolution: '1K', canvasImageRevision: 0, canvasImageVersionId: 'initial' };
    const common = commonFixture({ account, artworks: [art], state: {} });
    const json = (route, value) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    await context.route('**/*', async route => {
      const request = route.request(), u = new URL(request.url()), p = u.pathname;
      if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) { external.push(u.origin); return route.abort(); }
      if (p === '/media/zoom-fixture.png' || p === '/api/download') return route.fulfill({ status: 200, contentType: 'image/png', body: bytes });
      if (p === '/api/account') return json(route, { ...account, artworks: [art] });
      if (await common.handle(route)) return;
      if (p === '/api/media/image-cache') return json(route, { account: account.user.email, results: Object.fromEntries(request.postDataJSON().sources.map(source => [source, { source, account: account.user.email, version: hash, fetchUrl: source, bytes: bytes.length, contentType: 'image/png' }])) });
      if (/^\/api\/canvas\/(text|video|director|character|scene|audio|timeline)-nodes$/.test(p)) return json(route, { nodes: [], persisted: true });
      if (p === '/api/artworks/get') return json(route, { artworks: [art] });
      if (/^\/api\/(imagegen|generate-image|admin\/)/.test(p) || request.method() === 'POST' && /agent|assistant/.test(p)) { forbidden.push(p); return route.abort(); }
      if (p === '/api/canvas/assistant') return json(route, { sessions: [] });
      if (p.startsWith('/api/')) return json(route, { ok: true, persisted: true, items: [], messages: [] });
      return route.continue();
    });
    const node = page.locator(`.react-flow__node[data-id="${rootId}"]`);
    const agent = page.getByTestId('canvas-assistant-panel');
    const metrics = () => page.evaluate(() => {
      const flow = document.querySelector('.react-flow__viewport');
      const matrix = flow ? new DOMMatrixReadOnly(getComputedStyle(flow).transform) : null;
      const chrome = document.querySelector('[data-testid="canvas-project-chrome"]')?.getBoundingClientRect();
      return { flow: matrix && { x: matrix.e, y: matrix.f, zoom: matrix.a },
        page: { dpr: devicePixelRatio, width: innerWidth, height: innerHeight, visualScale: visualViewport?.scale },
        chrome: chrome && { width: chrome.width, height: chrome.height } };
    });
    async function settledViewport() {
      let previous = '', stable = 0;
      await expect.poll(async () => {
        const current = JSON.stringify((await metrics()).flow);
        stable = current === previous ? stable + 1 : 0; previous = current;
        return stable;
      }, { timeout: 10000, intervals: [60] }).toBeGreaterThanOrEqual(3);
    }
    async function wheel(target, modifier, label, point) {
      await settledViewport();
      const before = await metrics();
      await target.hover(point ? { position: point } : {});
      const n = await page.evaluate(() => window.__zoomEvents.length);
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.wheel(0, 80);
      if (modifier) await page.keyboard.up(modifier);
      await expect.poll(() => page.evaluate(() => window.__zoomEvents.length)).toBeGreaterThan(n);
      await page.waitForTimeout(230);
      const events = await page.evaluate(n => window.__zoomEvents.slice(n), n), after = await metrics();
      assert(events.some(e => e.trusted), label + ': real browser input required');
      samples.push({ label, kind: 'trusted-browser-wheel', before, after, events });
      return { before, after, events };
    }
    async function synthetic(target, label, cancel) {
      // Selecting a node can animate the existing focus viewport. Finish that
      // unrelated animation before measuring whether this wheel moves anything.
      await settledViewport();
      const before = await metrics();
      for (const key of ['ctrlKey', 'metaKey']) {
        const result = await target.evaluate((el, key) => { const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 20, [key]: true }); el.dispatchEvent(e); return e.defaultPrevented; }, key);
        assert.equal(result, cancel, label + ':' + key);
      }
      const after = await metrics();
      assert.deepEqual(after.flow, before.flow, label + ': overlay must not change canvas');
      samples.push({ label, kind: 'synthetic-cancellation-only', canceled: cancel, before, after });
      pass(label);
    }
    await page.goto(base + '/canvas?project=tree%3Aregeneration-root', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await node.waitFor({ timeout: 180000 });
    if (!await agent.isVisible()) await page.getByRole('button', { name: /Agent：/ }).click();
    await expect(agent).toBeVisible();
    const first = await wheel(agent.locator('header'), 'Control', 'Agent header Ctrl+wheel');
    assert(first.events.every(e => e.canceled === !baseline), 'Agent cancellation ownership');
    assert.deepEqual(first.after.flow, first.before.flow, 'Agent wheel cannot move canvas');
    if (!baseline) assert.deepEqual(first.after.page, first.before.page);
    pass(baseline ? 'BASELINE_AGENT_WHEEL_DEFAULT_ESCAPES_CANVAS_GUARD' : 'AGENT_TRUSTED_CTRL_WHEEL_CANCELS_BROWSER_DEFAULT_ONLY');
    await synthetic(agent.locator('textarea'), 'AGENT_EDITOR_CTRL_META', !baseline);

    // Main viewport still receives the wheel after capture cancellation.
    const pane = page.locator('.react-flow__pane');
    const canvas = await wheel(pane, 'Control', 'Canvas Ctrl+wheel', { x: 70, y: 200 });
    assert(canvas.events.every(e => e.canceled));
    assert.notEqual(canvas.after.flow.zoom, canvas.before.flow.zoom);
    assert.deepEqual(canvas.after.page, canvas.before.page);
    pass('REACT_FLOW_CTRL_WHEEL_STILL_ZOOMS_WITHOUT_PAGE_SCALE_CHANGE');
    await pane.click({ position: { x: 70, y: 200 } });
    const meta = await wheel(pane, 'Meta', 'Canvas Meta+wheel', { x: 70, y: 200 });
    assert(meta.events.every(e => e.canceled));
    assert.notEqual(meta.after.flow.zoom, meta.before.flow.zoom);
    assert.deepEqual(meta.after.page, meta.before.page);
    pass('REACT_FLOW_META_WHEEL_REMAINS_CANVAS_OWNED');
    const pan = await wheel(pane, null, 'Canvas ordinary scroll', { x: 70, y: 200 });
    assert.equal(pan.after.flow.zoom, pan.before.flow.zoom);
    assert.notDeepEqual(pan.after.flow, pan.before.flow);
    pass('ORDINARY_CANVAS_WHEEL_STILL_PANS');

    // Actual Agent textarea scroll; no fake scroll container or product replacement.
    await agent.locator('textarea').fill(Array.from({ length: 45 }, (_, i) => `未发送的本地滚动输入 ${i + 1}`).join('\n'));
    await agent.locator('textarea').evaluate(el => { el.scrollTop = 0; });
    const scroll = await wheel(agent.locator('textarea'), null, 'Agent ordinary scroll');
    assert(scroll.events.every(e => !e.canceled));
    assert(await agent.locator('textarea').evaluate(el => el.scrollTop > 0));
    assert.deepEqual(scroll.after.flow, scroll.before.flow);
    await agent.locator('textarea').fill('');
    pass('AGENT_ORDINARY_SCROLL_REMAINS_NATIVE');
    const keyboard = await agent.locator('textarea').evaluate(el => ['+', '-', '0'].map(key => {
      const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented;
    }));
    assert.deepEqual(keyboard, [false, false, false]);
    pass('AGENT_BROWSER_KEYBOARD_ZOOM_UNCHANGED');

    await agent.getByRole('button', { name: '收起助手', exact: true }).click();
    await node.click({ position: { x: 40, y: 45 } });
    const dock = page.getByTestId('image-node-dock'); await expect(dock).toBeVisible();
    await synthetic(dock.getByRole('textbox', { name: '节点提示词', exact: true }), 'NOWHEEL_NODE_EDITOR', true);
    await dock.getByRole('button', { name: /· 1K/ }).click();
    const portal = page.getByTestId('canvas-generation-parameters'); await expect(portal).toBeVisible();
    assert.equal(await portal.evaluate(el => !!el.closest('[data-testid="canvas-drop-zone"]')), false);
    await synthetic(portal, 'BODY_PORTAL_CTRL_META', !baseline);
    const portalInput = await wheel(portal, 'Control', 'Parameter portal Ctrl+wheel');
    assert(portalInput.events.every(e => e.canceled === !baseline));
    assert.deepEqual(portalInput.after.flow, portalInput.before.flow);
    pass(baseline ? 'BASELINE_PORTAL_DEFAULT_ESCAPES_DESPITE_STOP_PROPAGATION' : 'PORTAL_TRUSTED_WHEEL_CANCELED_BEFORE_STOP_PROPAGATION');
    await page.keyboard.press('Escape');
    await node.click({ button: 'right', position: { x: 40, y: 45 } });
    await page.getByText('属性设置', { exact: true }).click();
    const properties = page.getByTestId('node-properties-panel'); await expect(properties).toBeVisible();
    await synthetic(properties, 'SIBLING_PROPERTIES_CTRL_META', !baseline);
    await page.getByRole('button', { name: '收起属性', exact: true }).click();
    await page.getByTestId('canvas-project-chrome').locator('button').first().click();
    const projects = page.getByRole('button', { name: '全部项目', exact: true });
    await expect(projects).toBeVisible();
    await synthetic(projects, 'SIBLING_PROJECT_MENU_CTRL_META', !baseline);
    await page.screenshot({ path: path.join(out, baseline ? 'baseline-boundary.png' : 'modified-boundary.png') });
    await projects.click();
    await expect(page.locator('.react-flow')).toHaveCount(0);
    await synthetic(page.getByTestId('canvas-drop-zone'), 'PROJECT_LIST_MODIFIER_WHEEL_LIFECYCLE', baseline ? true : false);
    if (!baseline) {
      const documentId = await page.evaluate(() => window.__zoomDocumentId);
      await page.getByTestId('canvas-drop-zone').locator('button[title]').filter({ has: page.locator('img') }).first().click();
      await node.waitFor();
      assert.equal(await page.evaluate(() => window.__zoomDocumentId), documentId, 'project reentry must not reload the document');
      if (!await agent.isVisible()) await page.getByRole('button', { name: /Agent：/ }).click();
      await synthetic(agent.locator('textarea'), 'SAME_DOCUMENT_PROJECT_REENTRY_REBINDS_GUARD', true);
      await page.screenshot({ path: path.join(out, 'modified-canvas-agent.png') });
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(forbidden, []);
    const status = baseline ? 'REPRODUCED' : 'PASS', exit = baseline ? 1 : 0;
    const stdout = `CANVAS_ZOOM_OWNERSHIP=${status} CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=${exit}`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status, source, sourceHash, checks, samples, errors, external, forbidden,
      evidence: 'real Next + trusted Chromium input; synthetic cancellation separately labeled; no physical Safari or browser menu test', stdout, exit }, null, 2));
    console.log(stdout); process.exitCode = exit;
  } catch (error) {
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, checks, samples, errors, external, forbidden, sourceHash }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); }
})();
