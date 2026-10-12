import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { chromium, webkit, expect as rawExpect } from '@playwright/test';

// Isolated UI audit. All browser API requests use in-memory fixtures; no provider execution.
const out = path.resolve(process.env.WIN_MAC_EVIDENCE || 'output/canvas-win-mac-audit-20261012/browser');
const dist = process.env.WIN_MAC_DIST || '.next-win-mac-audit';
const expect = rawExpect.configure({ timeout: 12000 });
const profiles = [
  { id: 'win-chrome', engine: chromium, channel: 'chrome', platform: 'windows', dpr: 1 },
  { id: 'win-edge-125', engine: chromium, channel: 'msedge', platform: 'windows', dpr: 1.25 },
  { id: 'mac-chrome-sim', engine: chromium, channel: 'chrome', platform: 'mac', dpr: 2 },
  { id: 'mac-webkit-sim', engine: webkit, platform: 'mac', dpr: 2 },
].filter(p => !process.env.WIN_MAC_PROFILES || process.env.WIN_MAC_PROFILES.split(',').includes(p.id));
await mkdir(out, { recursive: true });
const results = [], errors = [], logs = [];
let app, browser, page;
const source = await readFile('src/components/canvas/canvas-client.tsx');
const summary = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceSha256: createHash('sha256').update(source).digest('hex'), nativeMac: false, productionDatabase: false, providerCalls: 0, results, errors };
async function check(profile, id, test) {
  if (id.startsWith('comfy-dialog-') && !process.env.WIN_MAC_DIALOGS && !process.env.WIN_MAC_CHECKS) return;
  if (id === 'orb-dock-control-hit-targets' && !process.env.WIN_MAC_CHECKS) return;
  if (process.env.WIN_MAC_CHECKS && !process.env.WIN_MAC_CHECKS.split(',').includes(id)) return;
  try {
    const detail = await test();
    results.push({ profile, id, status: 'PASS', detail: detail ?? null });
    console.log(`PASS ${profile} ${id}`);
  } catch (error) {
    results.push({ profile, id, status: 'FAIL', message: error.message });
    console.log(`FAIL ${profile} ${id}: ${error.message.split('\n')[0]}`);
    await page?.screenshot({ path: path.join(out, `${profile}-${id}-failure.png`) }).catch(() => {});
  }
}
try {
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    env: { ...process.env, NEXT_DIST_DIR: dist, DATABASE_URL: '', NAUMI_MULTI_USER: '0', NAUMI_VIDEO_WORKER: '0', NEXT_TELEMETRY_DISABLED: '1', SETTINGS_SECRET: randomUUID(), VIDEO_WORKER_SECRET: randomUUID(), NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', c => logs.push(c.toString())); app.stderr.on('data', c => logs.push(c.toString()));
  let ready = false;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  assert.ok(ready, 'Isolated production build starts');
  for (const profile of profiles) {
    browser = await profile.engine.launch({ ...(profile.channel ? { channel: profile.channel } : {}), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: profile.dpr, reducedMotion: 'reduce', ...(profile.platform === 'mac' ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' } : {}) });
    context.setDefaultTimeout(12000);
    await context.addCookies([{ name: 'naumi_locale', value: 'zh', url: base }]);
    await context.addInitScript(({ platform }) => {
      Object.defineProperty(navigator, 'platform', { get: () => platform === 'mac' ? 'MacIntel' : 'Win32' });
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
      localStorage.setItem('theme', 'light'); localStorage.setItem('nv:canvas:last', 'tree:audit-root');
      // Deliberately no nv:canvas:bg: verify the new-user default separately.
    }, profile);
    const now = new Date().toISOString(), email = `${profile.id}@audit.local.test`;
    const user = { name: 'Desktop audit', email, plan: 'starter', creditsTotal: 99999, creditsUsed: 0, joinedAt: now, renewsAt: now, invoices: [], canHigh: true };
    const root = { id: 'audit-root', title: '产品图片', category: 'main', prompt: 'fixture', createdAt: now, status: 'completed', image: base + '/demos/suite-demo/suppl-src.png', gradient: '', origin: 'canvas', source: 'canvas-add', groupId: 'audit-root', width: 1024, height: 1024, canvasWidth: 260, canvasHeight: 260, canvasX: 100, canvasY: 120, ratio: '1:1', resolution: '1K' };
    let arts = [root, { ...root, id: 'audit-second', title: '第二图片', parentId: root.id, canvasX: 540 }, { ...root, id: 'audit-video', title: '视频节点', parentId: root.id, canvasX: 100, canvasY: 650, videoUrl: base + '/audit-video.mp4' }];
    let texts = [{ id: 'text-audit', projectKey: 'tree:audit-root', title: '文字节点', content: '现有文字', prompt: '', status: 'completed', canvasX: 540, canvasY: 650, width: 320, height: 240, sourceIds: [], targetIds: [], productIds: [root.id], createdAt: now, updatedAt: now }];
    const mutations = [], downloads = [], clipboardWrites = [], zipRequests = [];
    let downloadMime = 'image/png', downloadDelay = 0;
    const png = await readFile('public/demos/suite-demo/suppl-src.png');
    const model = { id: 'gpt-image-2', label: 'GPT Image 2', modality: 'image', supportsEdit: true, nativeResolutions: ['1K', '2K'] };
    page = await context.newPage(); page.on('pageerror', error => errors.push({ profile: profile.id, message: error.message }));
    await page.exposeFunction('__auditClipboardWrite', value => clipboardWrites.push(value));
    await context.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), p = url.pathname, m = req.method();
      if (m !== 'GET') mutations.push({ path: p, method: m, body: req.postData()?.startsWith('{') ? req.postDataJSON() : req.postData()?.slice(0, 120) });
      if (p === '/api/config') return route.fulfill({ json: { db: true, multiUser: true, authMode: 'mock', commerceVisible: false, imageModels: [model], defaultImageModel: model.id } });
      if (p === '/api/auth/session') return route.fulfill({ json: { user } });
      if (p === '/api/account') return route.fulfill({ json: { persisted: true, user, artworks: arts } });
      if (p === '/api/artworks/get') return route.fulfill({ json: { artworks: arts.filter(a => url.searchParams.get('ids')?.split(',').includes(a.id)) } });
      if (p === '/api/projects') return route.fulfill({ json: { names: { 'tree:audit-root': 'Win Mac审查' } } });
      if (p === '/api/models') return route.fulfill({ json: { managed: false, supported: true, version: 1, models: [model], defaultModelId: model.id } });
      if (p === '/api/text-models') return route.fulfill({ json: { managed: false, models: ['gpt-4o'], defaultModel: 'gpt-4o' } });
      if (p === '/api/billing/catalog') return route.fulfill({ json: { version: 1, features: Object.fromEntries(['image.generate', 'canvas.image', 'canvas.expand', 'canvas.text-generate', 'canvas.assistant', 'tool.cutout'].map(f => [f, { enabled: true, prices: { low: { '1K': 2 }, medium: { '1K': 4 }, high: { '1K': 8 } } }])), products: [], effective: { commerce: false, metering: true, recharge: false } } });
      if (p === '/api/billing/quote') return route.fulfill({ json: { ...req.postDataJSON(), version: 1, credits: 4, reserveCredits: 4 } });
      if (p === '/api/canvas/text-nodes') {
        if (m === 'POST') { const n = req.postDataJSON(); texts = texts.map(t => t.id === n.id ? n : t); return route.fulfill({ json: { persisted: true, node: n } }); }
        return route.fulfill({ json: { persisted: true, nodes: texts } });
      }
      if (p === '/api/canvas/text-generate') return route.fulfill({ json: { text: '仅隔离界面测试，未执行供应商', model: 'gpt-4o' } });
      if (p === '/api/artworks/rename') { const b = req.postDataJSON(); arts = arts.map(a => a.id === b.id ? { ...a, title: b.title } : a); }
      if (p === '/api/download') { downloads.push({ u: url.searchParams.get('u'), name: url.searchParams.get('n'), mime: downloadMime }); if (downloadDelay) await new Promise(r => setTimeout(r, downloadDelay)); return route.fulfill({ contentType: downloadMime, body: downloadMime === 'image/jpeg' ? Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]) : png }); }
      if (p === '/api/suite/download') { zipRequests.push(req.postDataJSON()); return route.fulfill({ contentType: 'application/zip', body: Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'binary') }); }
      if (p === '/api/generate-image' || p === '/api/agent/chat') summary.providerCalls++;
      return route.fulfill({ json: { ok: true, persisted: true, nodes: [], items: [], tasks: [], favs: [], settings: {}, names: {}, records: [], sessions: [], artworks: [] } });
    });
    await context.route('**/demos/suite-demo/suppl-src.png', route => route.fulfill({ contentType: 'image/png', body: png }));
    await context.route('**/audit-video.mp4', route => route.fulfill({ status: 204, body: '' }));
    await page.goto(base + '/canvas'); await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();
    await page.getByRole('button', { name: '收起助手', exact: true }).click();
    const mod = profile.platform === 'mac' ? 'Meta' : 'Control';
    const rootNode = page.locator('.react-flow__node[data-id="audit-root"]');
    const second = page.locator('.react-flow__node[data-id="audit-second"]');
    const textNode = page.locator('.react-flow__node[data-id="text-audit"]');
    async function closeTextDock() {
      const close = page.getByTestId('text-node-dock').getByRole('button', { name: '关闭', exact: true });
      if (await close.isVisible()) await close.click();
    }
    async function clickRoot() { await closeTextDock(); await page.locator('.react-flow__pane').click({ position: { x: 20, y: 200 } }); await rootNode.locator('img').click(); await expect(page.getByTestId('image-node-toolbar')).toBeVisible(); await expect(rootNode).toHaveClass(/\bselected\b/); }
    async function selectLowerNode(node) {
      const close = page.getByTestId('image-node-dock').getByRole('button', { name: '关闭', exact: true });
      if (await close.isVisible()) await close.click();
      await closeTextDock();
      await blurCanvas(); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(350);
      await node.click({ position: { x: 35, y: 25 } });
    }
    async function blurCanvas() { await page.evaluate(() => document.activeElement?.blur()); }
    const vp = () => page.locator('.react-flow__viewport').getAttribute('style');
    await check(profile.id, 'new-user-light-default', async () => {
      const state = await page.evaluate(() => ({ light: !!document.querySelector('.canvas-ui-light'), storage: localStorage.getItem('nv:canvas:bg') }));
      assert.equal(state.light, true, JSON.stringify(state)); return state;
    });
    // Switch to light for all remaining tests; leave the default defect independently recorded.
    await page.evaluate(() => localStorage.setItem('nv:canvas:bg', 'light')); await page.reload();
    await expect(rootNode).toBeVisible(); const collapse = page.getByRole('button', { name: '收起助手', exact: true }); if (await collapse.isVisible()) await collapse.click();
    await check(profile.id, 'toolbar-light', async () => { assert.ok(await page.locator('.canvas-ui-light').count()); });
    await check(profile.id, 'modifier-zoom-and-fit', async () => { await blurCanvas(); const before = await vp(); await page.keyboard.press(mod + '+Equal'); await page.waitForTimeout(250); assert.notEqual(await vp(), before); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(350); });
    await check(profile.id, 'ordinary-wheel-pan', async () => { await page.mouse.move(350, 500); const before = await vp(); await page.mouse.wheel(55, 110); await page.waitForTimeout(250); assert.notEqual(await vp(), before); await blurCanvas(); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(350); });
    await check(profile.id, 'tool-shortcuts-and-ime-guard', async () => { await blurCanvas(); await page.keyboard.press('h'); await expect(page.locator('.react-flow')).toHaveClass(/canvas-hand-tool/); await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', bubbles: true, cancelable: true, isComposing: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', bubbles: true, cancelable: true, isComposing: true })); }); await expect(page.locator('.react-flow')).toHaveClass(/canvas-hand-tool/); await page.keyboard.press('Escape'); await expect(page.locator('.react-flow')).not.toHaveClass(/canvas-hand-tool/); });
    await check(profile.id, 'multi-select-shift', async () => { await clickRoot(); const focusBefore = await page.evaluate(() => document.activeElement?.tagName); await page.keyboard.down('Shift'); await page.waitForTimeout(100); await second.locator('img').click(); await page.keyboard.up('Shift'); await page.waitForTimeout(200); const ids = await page.locator('.react-flow__node.selected').evaluateAll(ns => ns.map(n => n.dataset.id)); assert.deepEqual(ids.sort(), ['audit-root', 'audit-second'], JSON.stringify({ focusBefore, ids })); return { ids }; });
    await check(profile.id, 'context-menu-keyboard-fit', async () => { await clickRoot(); await rootNode.locator('img').click({ button: 'right' }); const menu = page.getByTestId('canvas-context-menu'); await expect(menu).toBeVisible(); const box = await menu.boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 1000, JSON.stringify(box)); await page.keyboard.press('End'); assert.equal(await menu.locator('button').last().evaluate(e => e === document.activeElement), true); await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); });
    if (profile.platform === 'mac') await check(profile.id, 'mac-control-click-preserves-selection', async () => { await clickRoot(); await rootNode.locator('img').click({ button: 'right', modifiers: ['Control'] }); await expect(page.getByTestId('canvas-context-menu')).toBeVisible(); const selected = await rootNode.getAttribute('class'); assert.match(selected, /\bselected\b/); return { selected }; });
    await page.keyboard.press('Escape');
    await check(profile.id, 'rename-ime-enter', async () => {
      await clickRoot(); await page.getByTestId('image-node-toolbar').locator('[data-action="rename"]').click();
      const input = page.getByPlaceholder('项目名称').last(); await expect(input).toBeVisible(); await input.fill('中文候选尚未确认');
      const n = mutations.filter(m => m.path === '/api/artworks/rename').length;
      await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
      await page.waitForTimeout(250);
      const observed = { inputVisible: await input.isVisible(), requests: mutations.filter(m => m.path === '/api/artworks/rename').length - n };
      assert.deepEqual(observed, { inputVisible: true, requests: 0 }); return observed;
    });
    await page.keyboard.press('Escape');
    await check(profile.id, 'text-generate-ime-enter', async () => {
      await selectLowerNode(textNode); const prompt = page.getByTestId('text-node-dock').locator('textarea'); await expect(prompt).toBeVisible(); await prompt.fill('中文输入法组合态提示');
      const n = mutations.filter(m => m.path === '/api/canvas/text-generate').length;
      await prompt.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, ctrlKey: profile.platform !== 'mac', metaKey: profile.platform === 'mac', bubbles: true, cancelable: true });
      await page.waitForTimeout(350); const requests = mutations.filter(m => m.path === '/api/canvas/text-generate').length - n;
      assert.equal(requests, 0, `composition generated ${requests} requests`); return { requests };
    });
    await check(profile.id, 'input-delete-does-not-delete-node', async () => { const prompt = page.getByTestId('text-node-dock').locator('textarea'); await prompt.fill('abc'); await prompt.press('Backspace'); assert.equal(await page.locator('.react-flow__node').count(), 4); });
    await check(profile.id, 'help-labels-modal-and-focus', async () => { await blurCanvas(); await page.locator('[data-tool="more"]').click(); await page.getByRole('menuitem', { name: '快捷键与帮助', exact: true }).click(); const d = page.getByTestId('canvas-help-dialog'); await expect(d).toBeVisible(); await expect(d.locator('[data-shortcut="undo"] kbd').first()).toHaveText(profile.platform === 'mac' ? '⌘' : 'Ctrl'); const close = d.getByRole('button', { name: '关闭帮助' }); await close.focus(); await page.keyboard.press('Backspace'); assert.equal(await page.locator('.react-flow__node').count(), 4); await expect(d).toBeVisible(); await page.keyboard.press('Escape'); await expect(d).toHaveCount(0); });
    for (const size of [{ width: 1366, height: 768 }, { width: 1093, height: 614 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) await check(profile.id, `layout-${size.width}x${size.height}`, async () => {
      await page.setViewportSize(size); await blurCanvas(); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(450); await clickRoot(); await page.waitForTimeout(200);
      const geometry = await page.evaluate(() => ['canvas-main-toolbar', 'canvas-view-toolbar', 'image-node-toolbar', 'image-node-dock'].map(id => { const e = document.querySelector(`[data-testid="${id}"]`); const b = e?.getBoundingClientRect(); return { id, visible: !!e, x: b?.x, y: b?.y, right: b?.right, bottom: b?.bottom }; }));
      await page.screenshot({ path: path.join(out, `${profile.id}-${size.width}x${size.height}.png`) });
      for (const b of geometry) assert.ok(b.visible && b.x >= -1 && b.y >= -1 && b.right <= size.width + 1 && b.bottom <= size.height + 1, JSON.stringify(geometry)); return { dpr: profile.dpr, geometry };
    });
    await check(profile.id, 'orb-dock-control-hit-targets', async () => {
      const observations = [];
      for (const size of [{ width: 1366, height: 768 }, { width: 1093, height: 614 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size); await blurCanvas(); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(450); await clickRoot(); await page.waitForTimeout(250);
        const controls = await page.evaluate(() => {
          const orb = document.querySelector('[data-testid="canvas-agent-orb"]');
          if (!orb) return [];
          return [...document.querySelectorAll('[data-testid="image-node-dock"] button,[data-testid="image-node-dock"] textarea,[data-testid="image-node-dock"] input,[data-testid="image-node-dock"] select')].flatMap(control => {
            const b = control.getBoundingClientRect(); if (b.width <= 0 || b.height <= 0) return [];
            const x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
            const top = document.elementFromPoint(x, y);
            if (!top || !orb.contains(top)) return [];
            return [{ label: control.getAttribute('aria-label') || control.title || control.textContent?.trim() || control.tagName,
              rect: { x: b.x, y: b.y, width: b.width, height: b.height }, point: { x, y }, interceptedBy: 'canvas-agent-orb' }];
          });
        });
        observations.push({ viewport: size, blockedControls: controls });
      }
      await writeFile(path.join(out, `${profile.id}-orb-hit-targets.json`), JSON.stringify(observations, null, 2));
      assert.equal(observations.reduce((n, row) => n + row.blockedControls.length, 0), 0, JSON.stringify(observations));
      return observations;
    });
    await page.setViewportSize({ width: 1440, height: 1000 }); await blurCanvas(); await page.keyboard.press(mod + '+0'); await page.waitForTimeout(350);
    await check(profile.id, 'png-download', async () => { await clickRoot(); const awaited = page.waitForEvent('download'); await page.getByTestId('image-node-toolbar').getByRole('button', { name: '下载图片', exact: true }).click(); const d = await awaited; assert.match(d.suggestedFilename(), /\.png$/); await d.saveAs(path.join(out, `${profile.id}-download.png`)); return { filename: d.suggestedFilename() }; });
    // User-confirmed naming policy: JPEG downloads intentionally retain the uniform .png filename.
    await check(profile.id, 'jpeg-download-png-naming-policy', async () => { downloadMime = 'image/jpeg'; await clickRoot(); const awaited = page.waitForEvent('download'); await page.getByTestId('image-node-toolbar').getByRole('button', { name: '下载图片', exact: true }).click(); const d = await awaited; await d.saveAs(path.join(out, `${profile.id}-jpeg-policy-download.bin`)); downloadMime = 'image/png'; assert.match(d.suggestedFilename(), /\.png$/i); return { mime: 'image/jpeg', filename: d.suggestedFilename(), policy: 'JPEG intentionally named PNG; user confirmed 2026-10-12' }; });
    downloadMime = 'image/png';
    await check(profile.id, 'video-download-source', async () => { await selectLowerNode(page.locator('.react-flow__node[data-id="audit-video"]')); await expect(page.getByTestId('image-node-toolbar')).toBeVisible(); const n = downloads.length; const awaited = page.waitForEvent('download'); await page.getByTestId('image-node-toolbar').getByRole('button', { name: '下载图片', exact: true }).click(); const d = await awaited; await d.saveAs(path.join(out, `${profile.id}-video-actual-download.bin`)); assert.equal(downloads[n].u, base + '/audit-video.mp4', JSON.stringify(downloads[n])); });
    await check(profile.id, 'copy-image-preserves-user-activation', async () => {
      await page.evaluate(() => {
        const fake = { write: async items => { await window.__auditClipboardWrite({ active: navigator.userActivation?.isActive ?? null, image: items[0].types.includes('image/png') }); }, writeText: async text => window.__auditClipboardWrite({ fallbackText: text }) };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: fake });
        if (!window.ClipboardItem) window.ClipboardItem = class { constructor(data) { this.types = Object.keys(data); } };
      });
      downloadDelay = 6000; await clickRoot(); await rootNode.locator('img').click({ button: 'right' });
      await page.getByRole('menuitem', { name: '复制图片', exact: true }).click();
      await expect.poll(() => clipboardWrites.length, { timeout: 16000 }).toBeGreaterThan(0); downloadDelay = 0;
      const write = clipboardWrites.at(-1); assert.notEqual(write.active, false, JSON.stringify(write)); return write;
    });
    downloadDelay = 0;
    await check(profile.id, 'comfy-dialog-focus-trap', async () => {
      await clickRoot(); await page.getByTestId('image-node-toolbar').getByRole('button', { name: '更多处理', exact: true }).click();
      await page.getByTestId('canvas-node-action-menu').locator('[data-action="workflow"]').click();
      const d = page.getByRole('dialog', { name: 'ComfyUI 工作流', exact: true }); await expect(d).toBeVisible();
      await d.getByRole('button', { name: '关闭', exact: true }).focus(); await page.keyboard.press('Shift+Tab');
      const inside = await d.evaluate(e => e.contains(document.activeElement)); assert.equal(inside, true, 'Focus escaped the aria-modal dialog');
    });
    await check(profile.id, 'comfy-dialog-escape', async () => {
      const d = page.getByRole('dialog', { name: 'ComfyUI 工作流', exact: true }); await expect(d).toBeVisible();
      await d.getByRole('button', { name: '关闭', exact: true }).focus(); await page.keyboard.press('Escape');
      await expect(d).toHaveCount(0);
    });
    const comfy = page.getByRole('dialog', { name: 'ComfyUI 工作流', exact: true }); if (await comfy.isVisible()) await comfy.getByRole('button', { name: '关闭', exact: true }).click();
    await check(profile.id, 'no-unhandled-page-errors', async () => { assert.equal(errors.filter(e => e.profile === profile.id).length, 0, JSON.stringify(errors)); });
    await writeFile(path.join(out, `${profile.id}-requests.json`), JSON.stringify({ mutations, downloads, clipboardWrites, zipRequests }, null, 2));
    await context.close(); await browser.close(); browser = null;
  }
  await writeFile(path.join(out, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`WIN_MAC_AUDIT_COMPLETE profiles=${profiles.length} checks=${results.length} pass=${results.filter(r => r.status === 'PASS').length} fail=${results.filter(r => r.status === 'FAIL').length} PROVIDER_CALLS=${summary.providerCalls} NATIVE_MAC=NOT_RUN`);
  // Audit findings are successful audit completion, not a claim that the product passed.
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify(summary, null, 2));
  await browser?.close();
  if (app?.pid) { if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'pipe' }); } catch {} } else app.kill('SIGTERM'); }
  await writeFile(path.join(out, 'next.log'), logs.join(''));
}
