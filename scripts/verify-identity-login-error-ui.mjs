// Isolated HTTP/Chromium renderer acceptance; never contacts an identity authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { chromium } = require('playwright');
const { apiResolver } = require('next/dist/server/api-utils/node/api-resolver.js');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/enterprise/identity/login-error.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, URL });
const { loginErrorResponse } = module.exports;
const out = path.resolve('output/sso-login-error-20261119');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/login') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>隔离登录入口</h1>'); return; }
  const code = req.url.slice(1);
  if (!['product_access_required', 'login_expired', 'account_changed', 'service_unavailable'].includes(code)) { res.writeHead(404); res.end(); return; }
  void apiResolver(req, res, {}, { default: (_req, response) => {
    const p = loginErrorResponse(code, `http://127.0.0.1:${server.address().port}/api/auth/central/callback`);
    for (const [key, value] of Object.entries(p.headers)) response.setHeader(key, value);
    response.status(p.status).send(p.html);
  } }, { previewModeId: 'fixture-preview-mode', previewModeEncryptionKey: 'fixture-only', previewModeSigningKey: 'fixture-only' }, false, false);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let checks = 0;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const external = [];
  page.on('request', req => { if (!req.url().startsWith(`http://127.0.0.1:${server.address().port}/`)) external.push(req.url()); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [code, status, title] of [
    ['product_access_required', 403, '当前账号尚未开通企业协作'], ['login_expired', 400, '登录请求已过期'],
    ['account_changed', 409, '登录账号已变化'], ['service_unavailable', 503, '登录服务暂时不可用'],
  ]) {
    const response = await fetch(origin + '/' + code);
    assert.equal(response.status, status); assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.ok((await response.text()).includes(title)); checks++;
    for (const width of [360, 760, 1280]) {
      await page.setViewportSize({ width, height: 800 }); await page.goto(origin + '/' + code);
      assert.equal(await page.locator('h1').textContent(), title);
      assert.equal(await page.evaluate(() => document.characterSet), 'UTF-8');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('a').getAttribute('href'), origin + '/login');
      if (code === 'product_access_required') await page.screenshot({ path: path.join(out, `ERROR_PAGE_${width}.png`), fullPage: true });
      checks++;
    }
  }
  await page.goto(origin + '/product_access_required'); await page.keyboard.press('Tab');
  assert.equal(await page.locator('a').evaluate(a => document.activeElement === a), true); checks++;
  await page.keyboard.press('Enter'); await page.waitForURL(origin + '/login');
  assert.equal(await page.locator('h1').textContent(), '隔离登录入口'); checks++;
  assert.deepEqual(external, []); checks++;
  console.log(`IDENTITY_LOGIN_UI passed=${checks} failed=0 next_http=1 chromium=1 widths=360,760,1280 external_requests=0`);
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
