// Real local Next CanvasClient + existing isolated API fixture. No production.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), sharp = require('sharp');
const base = process.env.CANVAS_IMAGE_FIXTURE_URL || 'http://127.0.0.1:15861';
const out = path.resolve(process.env.CANVAS_IMAGE_EVIDENCE || 'output/canvas-image-navigation');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const bytes = await sharp({ create: { width: 320, height: 260, channels: 3, background: '#429ba3' } }).png().toBuffer();
  const version = crypto.createHash('sha256').update(bytes).digest('hex');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], external = [], checks = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) { external.push(u.origin); return route.abort(); }
    if (u.pathname === '/api/media/image-cache') {
      const sources = route.request().postDataJSON().sources, account = 'placement-fixture@example.test'; requests.push({ type: 'manifest', sources });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ account, results: Object.fromEntries(sources.map(source => [source, { source, account, version, fetchUrl: source, bytes: bytes.length, contentType: 'image/png' }])) }) });
    }
    if (u.pathname.startsWith('/media/ui-image-fixture')) { requests.push({ type: 'image', url: u.pathname + u.search }); return route.fulfill({ contentType: 'image/png', body: bytes }); }
    if (u.pathname === '/api/account' || u.pathname === '/api/artworks' || u.pathname === '/api/artworks/get') {
      const response = await route.fetch(), data = await response.json();
      function replace(v) { if (!v || typeof v !== 'object') return; if (typeof v.image === 'string' && v.image.includes('/demos/')) v.image = '/media/ui-image-fixture.png'; for (const c of Object.values(v)) replace(c); }
      replace(data); return route.fulfill({ response, json: data });
    }
    return route.continue();
  });
  try {
    await page.goto(base + '/canvas', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.locator('[data-id="placement-root"]').waitFor({ timeout: 120000 });
    await page.getByTestId('canvas-project-chrome').locator('button').first().click();
    await page.getByRole('button', { name: '全部项目', exact: true }).first().click();
    const surface = page.getByTestId('canvas-project-browser'); await surface.waitFor({ state: 'visible' });
    const card = surface.locator('button[title]').filter({ has: page.locator('img') }).first(), cover = card.locator('img');
    await cover.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=canvas-project-browser] img')].some(i => i.naturalWidth > 0 && i.complete));
    assert.ok(requests.some(r => r.type === 'manifest' && r.sources.some(s => s.endsWith('?variant=thumbnail'))));
    const src = await cover.getAttribute('src'); assert.ok(src.startsWith('blob:')); checks.push('REAL_PROJECT_CARD_USES_AUTHORIZED_THUMBNAIL');
    await cover.evaluate(image => window.savedProjectCover = image);
    await page.screenshot({ path: path.join(out, 'all-projects.png') });
    await card.click(); await page.locator('[data-id="placement-root"]').waitFor();
    assert.equal(await surface.getAttribute('hidden'), '');
    assert.equal(await cover.getAttribute('src'), src); checks.push('REAL_OPEN_PROJECT_RETAINS_HIDDEN_COVER');
    const manifestBefore = requests.filter(r => r.type === 'manifest').length, imagesBefore = requests.filter(r => r.type === 'image').length;
    await page.getByTestId('canvas-project-chrome').locator('button').first().click();
    await page.getByRole('button', { name: '全部项目', exact: true }).first().click(); await surface.waitFor({ state: 'visible' });
    assert.equal(await cover.evaluate(image => image === window.savedProjectCover), true);
    assert.equal(await cover.getAttribute('src'), src);
    assert.equal(await cover.evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.waitForTimeout(150);
    assert.equal(requests.filter(r => r.type === 'manifest').length, manifestBefore);
    assert.equal(requests.filter(r => r.type === 'image').length, imagesBefore); checks.push('REAL_RETURN_NO_REMOUNT_NO_MEDIA_REQUEST');
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth); assert.equal(overflow, false);
    await page.screenshot({ path: path.join(out, 'all-projects-mobile.png') }); checks.push('MOBILE_PROJECT_BROWSER_NO_HORIZONTAL_OVERFLOW');
    const state = await (await fetch(base + '/__fixture/state')).json();
    assert.equal(state.paidCalls, 0); assert.equal(state.generations.length, 0); assert.equal(state.submissions.length, 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); checks.push('NO_PAGE_ERRORS_NO_SUPPLIER_CALLS');
    fs.writeFileSync(path.join(out, 'UI_RESULT.json'), JSON.stringify({ checks, errors, external, requests, productionWrites: 0, supplierCalls: 0 }, null, 2));
    console.log(`CANVAS_IMAGE_NAVIGATION=PASS CHECKS=${checks.length} REAL_NEXT=1 API_FIXTURE=1 RETURN_REMOUNTS=0 RETURN_IMAGE_REQUESTS=0 PAGEERRORS=0 SUPPLIER_CALLS=0`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, errors, external, requests, url: page.url() }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
