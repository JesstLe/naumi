#!/usr/bin/env node
/** UI_FIXTURE. Run only by the parent after SOURCE STABLE.
 * node scripts/verify-canvas-quality-price-ui.cjs [--out-dir PATH] [--prepare-only] [--channel msedge]
 * Builds real ImageQualityControl + ImageQualitySelect into offline preview.html; no app server.
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const out = path.resolve(root, option('--out-dir', 'output/canvas-model-pricing-fix-20261024/quality-ui'));
const entry = path.join(root, 'scripts/fixtures/canvas-quality-price-preview.tsx');
const hooks = {
  '@/lib/billing/client': 'mockUseBilling as useBilling',
  '@/lib/image-quality-context': 'mockUseImageQuality as useImageQuality',
  '@/lib/model-config/feature-client': 'mockUseFeatureModels as useFeatureModels',
  'next/navigation': 'mockUsePathname as usePathname',
  '@/lib/i18n/locale-context': 'mockUseI18n as useI18n',
};
async function prepare() {
  fs.mkdirSync(out, { recursive: true });
  const result = await require('esbuild').build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, metafile: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, plugins: [{ name: 'UI_FIXTURE-hooks', setup(build) {
    build.onResolve({ filter: /^(?:@\/lib\/(?:billing\/client|image-quality-context|model-config\/feature-client|i18n\/locale-context)|next\/navigation)$/ }, args => ({ path: args.path, namespace: 'UI_FIXTURE' }));
    build.onResolve({ filter: /canvas-quality-price-preview\.tsx$/, namespace: 'UI_FIXTURE' }, () => ({ path: entry }));
    build.onLoad({ filter: /.*/, namespace: 'UI_FIXTURE' }, args => ({ contents: `export { ${hooks[args.path]} } from ${JSON.stringify(entry.replace(/\\/g, '/'))};`, loader: 'js', resolveDir: root }));
  } }] });
  const inputs = Object.keys(result.metafile.inputs);
  assert(inputs.some(input => input.replace(/\\/g, '/').endsWith('src/components/image-quality-control.tsx')));
  assert(inputs.some(input => input.replace(/\\/g, '/').endsWith('src/components/ui/image-quality-select.tsx')));
  // Compile the repository's real Tailwind/theme; no product stylesheet overrides.
  const tailwindConfig = require('tailwindcss/loadConfig')(path.join(root, 'tailwind.config.ts'));
  const css = await require('postcss')([require('tailwindcss')({ ...tailwindConfig, content: [entry, path.join(root, 'src/components/image-quality-control.tsx'), path.join(root, 'src/components/ui/image-quality-select.tsx')] })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI_FIXTURE 品质报价</title><style>${css.css}</style><style>body{margin:0;background:#f5f6f8;color:#252932;font-family:system-ui}main{max-width:820px;margin:48px auto;padding:24px}header,nav{display:flex;align-items:center;gap:20px;margin-bottom:24px}header span{font-size:12px;color:#69717d}nav label{font-size:13px}nav select{padding:6px;border:1px solid #dde1e8;border-radius:8px;background:white}section{padding:24px;background:white;border:1px solid #e4e7ec;border-radius:16px}nav{flex-wrap:wrap}</style></head><body class="light"><div id="root"></div><script>${script}</script></body></html>`;
  fs.writeFileSync(path.join(out, 'preview.html'), html);
  const sourceHashes = Object.fromEntries(['src/components/image-quality-control.tsx', 'src/components/ui/image-quality-select.tsx', 'scripts/fixtures/canvas-quality-price-preview.tsx', 'scripts/verify-canvas-quality-price-ui.cjs'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')]));
  fs.writeFileSync(path.join(out, 'prepared.json'), JSON.stringify({ tier: 'UI_FIXTURE', sourceHashes, inputs, preview: path.join(out, 'preview.html'), runtime: 'NOT_RUN' }, null, 2));
  console.log('PREVIEW=' + path.join(out, 'preview.html'));
  return sourceHashes;
}
async function verify(sourceHashes) {
  const { chromium, expect } = require('@playwright/test');
  const browser = await chromium.launch({ headless: true, ...(option('--channel', 'msedge') === 'chromium' ? {} : { channel: option('--channel', 'msedge') }) });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [], external = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { if (/^https?:/.test(route.request().url())) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
  const api = (action, value) => page.evaluate(({ action, value }) => window.qualityPriceFixture[action](value), { action, value });
  const select = page.getByTestId('image-quality-select'), total = page.getByTestId('image-quality-total');
  const stats = () => api('stats');
  async function reset(value = {}) { await api('reset', value); }
  async function stable(text) { await expect(select).toContainText(text); await expect(select).toBeEnabled(); }
  function pass(name) { checks.push(name); console.log('PASS ' + name); }
  try {
    await page.goto(pathToFileURL(path.join(out, 'preview.html')).href);
    await page.waitForFunction(() => !!window.qualityPriceFixture);
    await stable('11 积分/张');
    await select.click();
    await expect(page.getByTestId('image-quality-menu').getByRole('option')).toHaveCount(5);
    for (const text of ['低 · 0 积分/张', '中 · 7 积分/张', '高 · 11 积分/张', '超高 · 17 积分/张', '极致 · 23 积分/张']) await expect(page.getByRole('option', { name: text, exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(out, 'five-qualities.png') });
    await page.getByRole('option', { name: '低 · 0 积分/张', exact: true }).click(); await stable('0 积分/张');
    assert.equal((await stats()).networkQuotes, 5); pass('five real options; zero valid; StrictMode <=5 reads');
    await api('update', { model: 'modelB', quality: 'high' }); await stable('29 积分/张'); pass('selected model fallback changes exact unit');
    await reset({ model: 'modelB', modelId: 'modelA', quantity: 3 }); await stable('11 积分/张'); await expect(total).toHaveText('总计 29 积分');
    assert.equal((await stats()).networkQuotes, 6); pass('explicit model overrides fallback; independent non-linear total; <=5+1');
    await api('update', { quantity: 4 }); await expect(total).toHaveText('总计 38 积分'); assert.equal((await stats()).networkQuotes, 7);
    await api('update', { ratio: '16:9' }); await stable('14 积分/张'); await expect(total).toHaveText('总计 50 积分'); pass('quantity adds one read; ratio reprices unit and total');
    await reset({ hold: true, quantity: 2 }); await expect(select).toContainText('报价中'); await expect(select).toBeEnabled(); await expect(total).toContainText('报价中');
    await api('release'); await stable('11 积分/张'); pass('loading is real and non-blocking');
    await reset({ fail: true }); await expect(select).toContainText('报价暂不可用'); await expect(select).toBeEnabled();
    await api('update', { fail: false }); await page.getByRole('button', { name: '重试报价', exact: true }).click(); await stable('11 积分/张'); assert.equal((await stats()).paidCalls, 0); pass('error and manual quote-only retry');
    for (const mode of ['api-cost-plus', 'usage']) { await reset({ mode, quantity: 2 }); await stable('预估 11 积分/张'); await expect(total).toHaveText('总计 预估 20 积分'); assert(!await page.locator('body').innerText().then(text => /88888|99999|上限/.test(text))); }
    pass('both usage modes show estimates, never authorization/reserve ceilings');
    await reset({ hold: true, quantity: 2, offset: 9000 }); await expect(select).toContainText('报价中');
    await expect.poll(async () => (await stats()).pending).toBe(6);
    await api('update', { hold: false, offset: 0, model: 'modelB', ratio: '16:9', resolution: '2K', quality: 'max', quantity: 4 });
    await stable('57 积分/张'); await expect(total).toHaveText('总计 222 积分');
    await api('release'); await stable('57 积分/张'); await expect(total).toHaveText('总计 222 积分'); pass('late model/quality/resolution/ratio/count responses never flash back');
    await reset({ pathname: '/retouch', feature: 'tool.retouch', compact: false, quantity: 2 }); await stable('11 积分/张'); await expect(total).toHaveText('总计 20 积分');
    assert((await stats()).records.every(record => record.input.canvas === false && record.input.feature === 'tool.retouch')); pass('non-Canvas shared control passes feature with canvas=false');
    await reset({ disabled: true }); await expect(select).toBeDisabled(); pass('original disabled preserved');
    await reset({ quantity: 3 }); await stable('11 积分/张'); await expect(total).toHaveText('总计 29 积分');
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'compact-mobile.png') });
    assert.equal((await stats()).paidCalls, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    const report = { tier: 'UI_FIXTURE', status: 'PASS', checks, sourceHashes, pageErrors: errors, externalRequests: external, paidCalls: 0 };
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(`CANVAS_QUALITY_PRICE_UI=PASS CHECKS=${checks.length} PAID_CALLS=0 EXTERNAL_REQUESTS=0 UI_FIXTURE=1`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, checks, errors, external, sourceHashes }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
(async () => { const hashes = await prepare(); if (!args.includes('--prepare-only')) await verify(hashes); })().catch(error => { console.error(error); process.exitCode = 1; });
