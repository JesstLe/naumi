import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import React from 'react';
import ReactDOM from 'react-dom';

assert.match(React.version, /^19\./);
assert.equal(React.version, ReactDOM.version);
const evidence = process.env.REACT19_EVIDENCE_DIR || 'output/react19-upgrade/production';
await mkdir(evidence, { recursive: true });
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const logs = [], checks = [], errors = [];
const check = name => { checks.push(name); console.log('PASS ' + name); };
let app, browser;
try {
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: '', NAUMI_MULTI_USER: '0', SETTINGS_SECRET: randomUUID(), VIDEO_WORKER_SECRET: randomUUID(), NAUMI_VIDEO_WORKER: '0', MEDIA_PRIVATE: '1', STORAGE_DRIVER: 'local', OPENAI_API_KEY: 'isolated-react19-fixture', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', chunk => logs.push(chunk.toString()));
  app.stderr.on('data', chunk => logs.push(chunk.toString()));
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'production server ready');
  for (const [headers, language] of [[{ 'accept-language': 'en-US,en;q=0.9' }, 'en'], [{ 'accept-language': 'en', cookie: 'naumi_locale=zh' }, 'zh-CN']]) {
    for (const route of ['/', '/privacy', '/terms', '/contact', '/about']) {
      const response = await fetch(origin + route, { headers });
      assert.equal(response.status, 200, route);
      assert.match(await response.text(), new RegExp(`<html[^>]*lang="${language}"`));
    }
  }
  check('async headers/cookies: locale cookie overrides Accept-Language on five SSR pages');
  for (const [source, target] of [
    ['/brain?prompt=hello%20world&other=kept', '/dashboard?prompt=hello+world&other=kept'],
    ['/sign-in?redirect=%2Fcanvas&plan=pro', '/?redirect=%2Fcanvas&plan=pro&auth=sign-in'],
    ['/sign-up?redirect=%2Fworks&plan=team', '/?redirect=%2Fworks&plan=team&auth=sign-up'],
  ]) {
    const response = await fetch(origin + source, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), target);
  }
  check('async searchParams preserve legacy login/signup/brain query redirects');
  for (const [route, status] of [
    ['/api/canvas/image-tasks/react19-fixture', 401],
    ['/api/video/tasks/react19-fixture', 401],
    ['/api/competitors/react19-fixture', 401],
    ['/api/admin/supplier-cost/operations/react19-fixture', 404],
    ['/media/private/react19-fixture.png', 401],
    ['/media/invalid%2Fsegment.png', 400],
  ]) assert.equal((await fetch(origin + route)).status, status, route);
  const callback = await fetch(origin + '/api/supplier/apimart/invalid/callback', { method: 'POST', body: '{}' });
  assert.equal(callback.status, 400);
  check('Next promise route params: dynamic APIs retain anonymous and traversal rejection');
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/', '/generate', '/tools', '/privacy']) {
    await page.goto(origin + route);
    await page.waitForLoadState('networkidle');
    assert.ok(await page.locator('body').innerText());
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/tools');
  await page.waitForLoadState('networkidle');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile tools no horizontal overflow');
  await page.screenshot({ path: evidence + '/mobile-tools.png' });
  assert.deepEqual(errors, [], 'React hydration/client errors');
  check('production React hydration: home/generate/tools/privacy and mobile tools, no client errors');
  assert.doesNotMatch(logs.join(''), /should be awaited before using|sync-dynamic-apis|Invalid hook call/);
  console.log(`REACT19_UPGRADE=PASS react=${React.version} checks=${checks.length} REAL_UPSTREAM=0`);
} finally {
  await browser?.close();
  if (app) {
    try { process.platform === 'win32' ? execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) : app.kill('SIGTERM'); } catch {}
  }
  await writeFile(evidence + '/server.log', logs.join(''));
  await writeFile(evidence + '/result.json', JSON.stringify({ react: React.version, checks, errors, realUpstream: 0 }, null, 2));
}
