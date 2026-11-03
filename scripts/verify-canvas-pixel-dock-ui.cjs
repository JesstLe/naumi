// Actual Next/CanvasClient/React Flow geometry. Account/media are isolated HTTP
// fixtures; no generation endpoint, database or supplier is used.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), sharp = require('sharp');
const { fixtureAccount, requireLoopback, commonFixture } = require('./canvas-mapping-ui-fixture.cjs');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const baseline = args.includes('--baseline'), base = process.env.CANVAS_PIXEL_DOCK_URL || 'http://127.0.0.1:15241';
const out = path.resolve(arg('--out', process.env.CANVAS_PIXEL_DOCK_OUT || `output/canvas-pixel-dock-20261102/${baseline ? 'baseline' : 'modified'}`));
requireLoopback(base);
fs.mkdirSync(out, { recursive: true });
const rootId = 'regeneration-root', checks = [], scenarios = [], errors = [], external = [], forbidden = [];
const files = ['src/components/canvas/canvas-client.tsx', 'src/lib/canvas/dock-layout.ts', 'src/lib/canvas/dock-placement.ts', 'src/components/canvas/image-pixel-size.tsx'];
const sources = files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
const overlap = (a, b) => !a || !b ? 0 : Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(browser, account, dimensions, shape = 'landscape') {
  const name = dimensions.width + 'x' + dimensions.height + '-' + shape, folder = path.join(out, name); fs.mkdirSync(folder, { recursive: true });
  const context = await browser.newContext({ viewport: dimensions }), page = await context.newPage();
  const intrinsic = shape === 'portrait' ? [941, 1672] : [1792, 1008];
  const width = dimensions.width < 500 ? 150 : shape === 'portrait' ? 160 : 320, height = width * intrinsic[1] / intrinsic[0];
  const bytes = await sharp({ create: { width: intrinsic[0], height: intrinsic[1], channels: 3, background: '#e1e6e8' } })
    .composite([{ input: Buffer.from(`<svg width="${intrinsic[0]}" height="${intrinsic[1]}"><rect x="${intrinsic[0] * .35}" y="${intrinsic[1] * .22}" width="${intrinsic[0] * .3}" height="${intrinsic[1] * .6}" rx="25" fill="#faf8f0"/><circle cx="${intrinsic[0] * .5}" cy="${intrinsic[1] * .47}" r="${Math.min(...intrinsic) * .12}" fill="#a7becf"/></svg>`) }]).png().toBuffer();
  const image = '/media/pixel-dock-' + name + '.png', hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const art = { ...account.artworks[0], id: rootId, title: '3D 导演台-frame.png — 很长的图片名称用于验证标题和尺寸独立展示', groupId: rootId, parentId: undefined, parentIds: [],
    image, width: intrinsic[0], height: intrinsic[1], canvasWidth: width, canvasHeight: height, canvasX: dimensions.width * .4, canvasY: 350,
    ratio: shape === 'portrait' ? '9:16' : '16:9', resolution: '1K', canvasImageRevision: 0, canvasImageVersionId: 'initial' };
  const samples = [], requests = [], fixtureState = {};
  const common = commonFixture({ account, artworks: [art], state: fixtureState });
  const json = (route, value) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  page.on('pageerror', error => errors.push({ name, message: error.message }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
    if (p.startsWith('/media/pixel-dock-') || p === '/api/download') return route.fulfill({ status: 200, contentType: 'image/png', body: bytes });
    if (p === '/api/account') return json(route, { ...account, artworks: [art] });
    if (await common.handle(route)) return;
    if (p === '/api/media/image-cache') return json(route, { account: account.user.email, results: Object.fromEntries(request.postDataJSON().sources.map(source => [source, { source, account: account.user.email, version: hash, fetchUrl: source, bytes: bytes.length, contentType: 'image/png' }])) });
    if (p === '/api/canvas/text-nodes' || /^\/api\/canvas\/(video|director|character|scene|audio|timeline)-nodes$/.test(p)) return json(route, { nodes: [], persisted: true });
    if (p === '/api/artworks/get') return json(route, { artworks: [art] });
    if (p === '/api/canvas/history') { requests.push({ method: request.method(), path: p, body: request.postDataJSON() }); return json(route, { ok: true, persisted: true }); }
    if (p === '/api/artworks/position') { requests.push({ method: request.method(), path: p, body: request.postDataJSON() }); return json(route, { ok: true }); }
    if (/^\/api\/(imagegen|generate-image|admin\/)/.test(p)) { forbidden.push({ method: request.method(), path: p }); return route.abort(); }
    return route.continue();
  });
  const node = () => page.locator(`.react-flow__node[data-id="${rootId}"]`), pixel = () => node().getByTestId('image-pixel-size');
  const toolbar = () => page.getByTestId('image-node-toolbar');
  async function measure(label) {
    await pause(350);
    const record = await page.evaluate(({ rootId, label }) => {
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const n = document.querySelector(`.react-flow__node[data-id="${rootId}"]`), p = n?.querySelector('[data-testid="image-pixel-size"]');
      const composer = document.querySelector('[data-testid="image-reference-composer"]');
      let dock = composer;
      while (dock?.parentElement && !dock.hasAttribute('data-composer-shell') && !dock.hasAttribute('data-composer-kind')) dock = dock.parentElement;
      if (dock === document.body || dock === document.documentElement || !dock?.parentElement) dock = composer?.closest('section') || composer?.parentElement?.parentElement;
      const submit = dock?.querySelector('[data-testid="generation-submit-action"]'), sb = box(submit);
      const submitHit = sb && document.elementFromPoint(sb.x + sb.width / 2, sb.y + sb.height / 2)?.closest('button') === submit;
      return { label, pixelText: p?.textContent, pixel: box(p), title: box(n?.querySelector('.art-title')), node: box(n), toolbar: box(document.querySelector('[data-testid="image-node-toolbar"]')), dock: box(dock), submit: sb, submitHit, viewport: { width: innerWidth, height: innerHeight }, flowTransform: document.querySelector('.react-flow__viewport')?.getAttribute('style') };
    }, { rootId, label });
    record.pixelToolbarOverlap = overlap(record.pixel, record.toolbar); record.titleToolbarOverlap = overlap(record.title, record.toolbar); record.pixelDockOverlap = overlap(record.pixel, record.dock);
    assert.equal(record.pixelText?.trim(), intrinsic.join(' × ')); samples.push(record);
    await page.screenshot({ path: path.join(folder, label + '.png') });
    if (baseline) {
      assert.ok(record.pixelToolbarOverlap > 0, 'actual baseline screenshot reproduces covered original pixels');
      checks.push('BASELINE_REAL_PIXEL_LABEL_OVERLAPS_IMAGE_TOOLBAR');
    } else {
      assert.equal(record.pixelToolbarOverlap, 0, label + ': toolbar covers original pixel label');
      assert.equal(record.titleToolbarOverlap, 0, label + ': toolbar covers image title row');
      assert.equal(record.pixelDockOverlap, 0, label + ': composer covers original pixel label');
      assert.ok(record.submit && record.dock && record.submit.y >= record.dock.y && record.submit.y + record.submit.height <= record.dock.y + record.dock.height + 1,
        label + ': composer shrink clips the Generate action');
      assert.equal(record.submitHit, true, label + ': Generate action is covered by another element');
      checks.push(name + ':' + label + ':NO_PIXEL_OR_TITLE_OVERLAP');
    }
    return record;
  }
  async function setZoom(zoom) {
    const view = page.getByTestId('canvas-view-toolbar');
    const button = view.getByRole('button', { name: /缩放.*%/ }); await button.click();
    const input = view.locator('input[inputmode="decimal"]'); await input.fill(String(zoom * 100)); await input.press('Enter');
    await expect(view.getByRole('button', { name: new RegExp('缩放.*' + zoom * 100 + '%') })).toBeVisible();
    await pause(400);
  }
  try {
    await page.goto(base + '/canvas?project=tree%3Aregeneration-root', { waitUntil: 'domcontentloaded', timeout: 180000 }); await node().waitFor({ timeout: 180000 });
    await node().click({ position: { x: 35, y: 45 } }); await toolbar().waitFor(); await pixel().waitFor();
    if (await page.getByRole('button', { name: '收起助手', exact: true }).count()) await page.getByRole('button', { name: '收起助手', exact: true }).click();
    await expect(page.getByTestId('image-reference-composer')).toBeVisible();
    if (!baseline) await page.getByRole('textbox', { name: '节点提示词', exact: true }).fill('在保持主体、背景、配色、材质、光影与构图不变的前提下，仅提升清晰度与画质，输出一张干净的高质量版本；不要替换背景，不要改变背景颜色或整体色调。');
    await setZoom(1); const collapsed = await measure('zoom-100');
    if (!baseline && dimensions.width === 1440 && dimensions.height === 900) {
      const dock = page.getByTestId('image-node-dock');
      const beforeNode = await node().getAttribute('style'), beforeViewport = await page.locator('.react-flow__viewport').getAttribute('style');
      await dock.getByRole('button', { name: '展开输入区', exact: true }).click();
      await expect.poll(async () => (await dock.boundingBox()).height).toBeGreaterThan(collapsed.dock.height + 80);
      await measure('expanded-title-protected');
      assert.equal(await node().getAttribute('style'), beforeNode, 'expansion never moves the selected node');
      assert.equal(await page.locator('.react-flow__viewport').getAttribute('style'), beforeViewport, 'expansion never moves or zooms the canvas');
      await dock.getByRole('button', { name: '收起输入区', exact: true }).click();
      await expect.poll(async () => (await dock.boundingBox()).height).toBeLessThanOrEqual(collapsed.dock.height + 2);
    }
    if (!baseline) {
      for (const zoom of [.5, 2]) { await setZoom(zoom); await measure('zoom-' + zoom * 100); }
      await setZoom(1);
      const beforeDrag = await node().boundingBox();
      const point = await page.evaluate(rootId => {
        const node = document.querySelector(`.react-flow__node[data-id="${rootId}"]`), r = node.getBoundingClientRect();
        for (const dy of [4, 6, 7, 8, 12, 20, 35, 65]) for (const fraction of [.4, .55, .7, .2]) {
          const x = r.x + r.width * fraction, y = r.y + dy, hit = document.elementFromPoint(x, y);
          if (hit?.closest('.react-flow__node') === node && !hit.closest('button,input,textarea,.nodrag,.react-flow__handle,.react-flow__resize-control')) return { x, y, hit: hit.tagName };
        }
        return null;
      }, rootId);
      assert.ok(point, 'a real unobstructed image target is available for dragging');
      await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + (dimensions.width > 600 ? 70 : 15), point.y + 25, { steps: 14 }); await page.mouse.up();
      await expect.poll(async () => { const b = await node().boundingBox(); return Math.abs(b.x - beforeDrag.x) + Math.abs(b.y - beforeDrag.y); }).toBeGreaterThan(2);
      await measure('after-node-drag');
    }
    scenarios.push({ name, samples, requests, intrinsic, source: 'real Next ReactFlow geometry' });
    fs.writeFileSync(path.join(folder, 'RESULT.json'), JSON.stringify({ status: baseline ? 'REPRODUCED' : 'PASS', name, samples, requests }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'ERROR.json'), JSON.stringify({ error: error.stack, name, samples, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
    throw error;
  } finally { await context.close(); }
}

(async () => {
  let browser;
  try {
    const account = fixtureAccount(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    const cases = baseline ? [[1438, 659, 'landscape']] : [[1438, 659, 'landscape'], [1440, 900, 'landscape'], [390, 844, 'landscape'], [1440, 900, 'portrait']];
    const only = arg('--only', '');
    for (const [width, height, shape] of cases) if (!only || only === `${width}x${height}-${shape}`) await scenario(browser, account, { width, height }, shape);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(forbidden, []);
    const exit = baseline ? 1 : 0, stdout = `CANVAS_PIXEL_DOCK_UI=${baseline ? 'REPRODUCED' : 'PASS'} CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=${exit}`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: baseline ? 'REPRODUCED' : 'PASS', checks, scenarios, errors, external, forbidden, sources, stdout, exit }, null, 2));
    console.log(stdout); process.exitCode = exit;
  } catch (error) {
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, checks, scenarios, errors, external, forbidden, sources, exit: 1 }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
