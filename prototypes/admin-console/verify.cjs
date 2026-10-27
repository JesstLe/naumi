/* Offline browser regression for the standalone prototype. No application API. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const argv = process.argv.slice(2);
const arg = (key, fallback) => { const i = argv.indexOf(key); return i < 0 ? fallback : argv[i + 1]; };
const root = path.resolve(arg('--root', __dirname));
const out = path.resolve(arg('--output', path.join(root, 'evidence')));
const mode = arg('--mode', 'modified');
const files = ['index.html', 'verify.cjs', 'README.md', 'LICENSE.icons.txt'];
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report = { mode, root, cases: [], network: [], pageErrors: [], hashes: {}, screenshots: [] };
fs.mkdirSync(out, { recursive: true });
let activePage;
const check = async (name, action) => {
  try { await action(); report.cases.push({ name, status: 'PASS' }); }
  catch (error) { report.cases.push({ name, status: 'FAIL', error: String(error.stack || error) }); if(activePage) await activePage.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())).catch(()=>{}); }
  fs.writeFileSync(path.join(out, 'PROGRESS.json'), JSON.stringify(report,null,2));
};
async function finish() {
  report.failed = report.cases.filter(x => x.status !== 'PASS').length;
  report.result = report.failed ? 'FAIL' : 'PASS';
  report.exit = report.failed ? 1 : 0;
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n');
  const line = `ADMIN_UI_PREVIEW=${report.result} MODE=${mode} CASES=${report.cases.length} FAILED=${report.failed} NETWORK=${report.network.length} PAGEERROR=${report.pageErrors.length} EXIT=${report.exit}`;
  fs.writeFileSync(path.join(out, 'stdout.txt'), line + '\n');
  console.log(line);
  for (const c of report.cases.filter(x => x.status === 'FAIL')) console.error(c.name + '\n' + c.error);
  process.exitCode = report.exit;
}
(async () => {
  if (mode === 'baseline' || mode === 'rollback') {
    await check('New prototype files are absent in the actual baseline/rollback directory', () => {
      for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), false, file);
    });
    return finish();
  }
  for (const f of files) report.hashes[f] = sha(path.join(root, f));
  const req = createRequire(path.join(path.resolve(arg('--deps-root', 'E:/Workspace/naumi')), 'package.json'));
  const { chromium } = req('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  activePage=page; page.setDefaultTimeout(6000);
  page.on('pageerror', e => report.pageErrors.push(String(e)));
  page.on('request', r => { if (/^https?:/i.test(r.url())) report.network.push({ url: r.url(), method: r.method() }); });
  await page.route(/^https?:/, r => r.abort());
  const url = pathToFileURL(path.join(root, 'index.html')).href;
  const shot = async name => { const p = path.join(out, name + '.png'); await page.screenshot({ path: p, fullPage: true }); report.screenshots.push({ name, path: p, sha256: sha(p) }); };
  const go = async p => { await page.locator(`.sidebar [data-page="${p}"]`).click(); const route={tasks:'tasks/unified',models:'models/manage',users:'users/list',billing:'billing/ledger',settings:'settings/site'}[p]; if(route) await page.locator(`.module-nav [data-route="${route}"]`).click(); if(p==='settings')await page.locator('[data-route="settings/site/brand"]').click(); };
  const close = async () => { await page.locator('#detail-dialog [aria-label="关闭详情"]').click(); };
  await page.goto(url);
  await page.locator('h1').waitFor();
  await check('Overview, brand and demo data render', async () => {
    assert.equal(await page.locator('h1').textContent(), '运营概览');
    assert.equal(await page.locator('.stat').count(), 4);
    assert.equal(await page.locator('[data-task-row]').count(), 5);
    assert.equal(await page.locator('.brand-mark').count(), 1);
    assert.equal(await page.locator('.demo-badge').textContent(), '演示数据');
    await shot('01-overview-desktop');
  });
  await check('Period changes statistics and chart, then restores', async () => {
    await page.locator('[data-period="week"]').click();
    assert.match(await page.locator('.stat-number').first().textContent(), /8,712/);
    assert.match(await page.locator('.chart svg').getAttribute('aria-label'), /七天/);
    await page.locator('[data-period="today"]').click();
  });
  await check('Task status, provider and live query combine', async () => {
    await go('tasks');
    await page.locator('[data-task-status="done"]').click();
    await page.locator('#task-provider').selectOption('APIB');
    await page.locator('#task-query').fill('极简客厅');
    const rows = await page.locator('[data-task-row]').allTextContents();
    assert.ok(rows.length > 0);
    assert.ok(rows.every(r => r.includes('已完成') && r.includes('APIB') && r.includes('极简客厅')));
  });
  await check('Empty results and reset recover the full task list', async () => {
    await page.locator('#task-query').fill('does-not-exist');
    assert.match(await page.locator('#task-results').textContent(), /没有匹配的任务/);
    await page.locator('.empty-state [data-action="clear-task-filters"]').click();
    assert.equal(await page.locator('[data-task-row]').count(), 8);
  });
  await check('Pagination and local density switch', async () => {
    const before = await page.locator('[data-task-row]').first().getAttribute('data-task-row');
    await page.locator('[data-task-page="2"]').first().click();
    assert.notEqual(await page.locator('[data-task-row]').first().getAttribute('data-task-row'), before);
    await page.locator('[data-action="density"]').click();
    assert.ok(await page.locator('#naumi-admin').evaluate(e => e.classList.contains('compact')));
    await page.locator('[data-action="density"]').click();
    await page.locator('[data-task-page="1"]').first().click();
    await shot('02-tasks-desktop');
  });
  await check('Task drawer shows output, frozen identity, timeline and billing', async () => {
    await page.locator('[data-task="demo-img-2801"]').click();
    const text = await page.locator('#detail-dialog').textContent();
    assert.ok(await page.locator('#detail-dialog').evaluate(e => e.open));
    for (const field of ['APIMart', 'GPT Image 1.5', '执行时间线', '已结算', '8 积分', '0 积分']) assert.ok(text.includes(field), field);
    assert.equal(await page.locator('#detail-dialog .dialog-content > .output-art svg').count(), 1);
    await shot('03-task-drawer-desktop');
  });
  await check('Native modal traps focus, Escape closes and restores trigger', async () => {
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => document.activeElement.closest('#detail-dialog') !== null));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail-dialog').evaluate(e => e.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.task), 'demo-img-2801');
  });
  await check('Queued and failed receipts do not pretend images or charges exist', async () => {
    await page.locator('[data-task="demo-img-2804"]').click();
    let t = await page.locator('#detail-dialog').textContent();
    assert.ok(t.includes('尚未提交供应商') && t.includes('6 积分') && t.includes('0 积分'));
    assert.equal(await page.locator('#detail-dialog .dialog-content > .output-art svg[role="img"]').count(), 0);
    await close();
    await page.locator('[data-task="demo-img-2805"]').click();
    t = await page.locator('#detail-dialog').textContent();
    assert.ok(t.includes('参数校验失败') && t.includes('0 积分'));
    await close();
  });
  await check('Model filters and local enabled state', async () => {
    await go('models');
    await page.locator('#model-status').selectOption('disabled');
    assert.equal(await page.locator('[data-toggle-model]').count(), 2);
    await page.locator('#model-status').selectOption('all');
    await page.locator('[data-toggle-model="m1"]').click();
    assert.equal(await page.locator('[data-toggle-model="m1"]').getAttribute('aria-checked'), 'false');
    await page.locator('[data-toggle-model="m1"]').click();
    await shot('04-models-desktop');
  });
  await check('Model draft persists price, name, ratio and quality in memory', async () => {
    await page.locator('[data-model="m1"]').click();
    await page.locator('#model-name').fill('Gemini 3 Pro · Studio');
    await page.locator('#model-price').fill('7');
    await page.locator('#ratio').selectOption('3:4');
    await page.locator('#quality').selectOption('高质量');
    await page.locator('button[form="model-form"]').click();
    assert.match(await page.locator('#model-results').textContent(), /Gemini 3 Pro · Studio/);
    await page.locator('[data-model="m1"]').click();
    assert.equal(await page.locator('#model-price').inputValue(), '7');
    assert.equal(await page.locator('#ratio').inputValue(), '3:4');
    assert.equal(await page.locator('#quality').inputValue(), '高质量');
    await close();
  });
  await check('Untrusted model names are rendered as text, not markup', async () => {
    await page.locator('[data-model="m1"]').click();
    await page.locator('#model-name').fill('<img src=x onerror=alert(1)>');
    await page.locator('button[form="model-form"]').click();
    assert.equal(await page.locator('#model-results img').count(), 0);
    assert.match(await page.locator('#model-results').textContent(), /<img src=x/);
    await page.locator('[data-model="m1"]').click();
    assert.equal(await page.locator('#detail-dialog img').count(), 0);
    await page.locator('#model-name').fill('Gemini 3 Pro Image');
    await page.locator('button[form="model-form"]').click();
  });
  await check('Supplier configuration and adding a disabled draft are functional', async () => {
    await page.locator('[data-model-tab="suppliers"]').click();
    assert.equal(await page.locator('.supplier-card').count(), 3);
    await page.locator('[data-provider="APIB"]').click();
    assert.equal(await page.locator('#provider-url').inputValue(), 'https://apib.example.test/v1');
    await close();
    await page.locator('[data-action="add-provider"]').click();
    await page.locator('#provider-name').fill('Local Studio');
    await page.locator('#provider-url').fill('https://local.example.test/v1');
    await page.locator('button[form="provider-form"]').click();
    assert.equal(await page.locator('.supplier-card').count(), 4);
    assert.match(await page.locator('.supplier-card').last().textContent(), /Local Studio.*已停用/s);
  });
  await check('User search, plan filter and detail drill-down', async () => {
    await go('users');
    await page.locator('#user-query').fill('user101');
    assert.equal(await page.locator('[data-user]').count(), 1);
    await page.locator('[data-user="demo-user-101"]').click();
    assert.match(await page.locator('#detail-dialog').textContent(), /300/);
    await page.locator('#detail-dialog [data-task]').first().click();
    assert.match(await page.locator('#dialog-title').textContent(), /任务详情/);
    await close();
    await page.locator('[data-action="clear-users"]').click();
    await page.locator('#user-plan').selectOption('团队版');
    assert.equal(await page.locator('[data-user]').count(), 6);
  });
  await check('Billing held/settled filter preserves distinct accounting states', async () => {
    await go('billing');
    await page.locator('#billing-kind').selectOption('held');
    const rows = await page.locator('#billing-results tbody tr').allTextContents();
    assert.ok(rows.length > 0 && rows.every(r => r.includes('预占中')));
  });
  await check('Notification unread counts and mark-all-read', async () => {
    await go('notices');
    assert.equal(await page.locator('.unread').count(), 3);
    await page.locator('[data-action="read-all"]').click();
    assert.equal(await page.locator('.unread').count(), 0);
    assert.equal(await page.locator('#bell-dot').isVisible(), false);
    await page.locator('[data-notice-filter="unread"]').click();
    assert.match(await page.locator('.notice-list').textContent(), /暂无未读通知/);
  });
  await check('Preview settings survive local navigation', async () => {
    await go('settings');
    await page.locator('#site-name').fill('Naumi Studio');
    await page.locator('#admin-email').fill('studio@example.test');
    await page.locator('#settings-form button[type="submit"]').click();
    await go('overview'); await go('settings');
    assert.equal(await page.locator('#site-name').inputValue(), 'Naumi Studio');
    assert.equal(await page.locator('#admin-email').inputValue(), 'studio@example.test');
  });
  await check('Global keyboard search locates a user', async () => {
    await page.keyboard.press('Control+k');
    await page.locator('#global-query').fill('user101');
    assert.equal(await page.locator('[data-search-user]').count(), 1);
    await page.locator('[data-search-user]').click();
    assert.match(await page.locator('#detail-dialog').textContent(), /user101@example.test/);
    await close();
  });
  await check('CSV export contains only the filtered demonstration records', async () => {
    await go('tasks');
    await page.locator('#task-query').fill('demo-img-2801');
    const downloadPromise = page.waitForEvent('download'); downloadPromise.catch(()=>{});
    await page.locator('[data-action="export-tasks"]').click();
    const download = await downloadPromise;
    const p = path.join(out, download.suggestedFilename());
    await download.saveAs(p);
    const csv = fs.readFileSync(p, 'utf8');
    assert.ok(csv.includes('demo-img-2801'));
    assert.ok(!csv.includes('demo-img-2802'));
  });
  await check('Reload resets all demo mutations without storage writes', async () => {
    await page.reload();
    await go('models');
    await page.locator('[data-model="m1"]').click();
    assert.equal(await page.locator('#model-price').inputValue(), '6');
    await close();
    await page.locator('[data-model-tab="suppliers"]').click();
    assert.equal(await page.locator('.supplier-card').count(), 3);
  });
  await check('All seven pages fit desktop and 728px inline preview', async () => {
    for (const width of [1440, 728]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const p of ['overview','tasks','models','users','billing','notices','settings']) {
        await go(p);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${p}`);
      }
    }
    await go('overview');
    await shot('05-overview-inline-728');
  });
  await check('390px mobile menu, all pages and tables avoid whole-page overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of ['overview','tasks','models','users','billing','notices','settings']) {
      await page.locator('.mobile-menu').click();
      await go(p);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `390 ${p}`);
      assert.equal(await page.locator('#naumi-admin').evaluate(e => e.classList.contains('menu-open')), false);
      if (p === 'overview') await shot('06-overview-mobile-390');
      if (p === 'tasks') await shot('07-tasks-mobile-390');
    }
  });
  await check('Mobile drawer fits and remains keyboard-closeable', async () => {
    await page.locator('.mobile-menu').click(); await go('tasks');
    await page.locator('[data-task="demo-img-2801"]').click();
    const r = await page.locator('#detail-dialog').boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= 390 && r.height <= 844);
    await shot('08-drawer-mobile-390');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail-dialog').evaluate(e => e.open), false);
  });
  await check('320px narrow layout and 1440px restored screenshot', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('.mobile-menu').click(); await go('overview');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload(); await go('overview');
    await shot('09-final-overview');
  });
  await check('Zero network, zero page errors, zero app persistence calls', () => {
    assert.deepEqual(report.network, []);
    assert.deepEqual(report.pageErrors, []);
    const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(!/\b(fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b/.test(source));
    assert.ok(source.includes("connect-src 'none'"));
  });
  await browser.close();
  await finish();
})().catch(error => { report.cases.push({name:'Harness setup or cleanup',status:'FAIL',error:String(error.stack||error)}); finish(); });
