// Real product cache modules, React image component, IndexedDB and Edge.
// Only authentication headers, HTTP data and deliberately faulty IDB events are fixtures.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const sharp = require('sharp');
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const sourceRoot = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const outputRoot = path.resolve(arg('--output-root', process.env.BROWSER_CACHE_RESILIENCE_EVIDENCE||'output/browser-cache-resilience'));
const baseline = args.includes('--baseline');
const dependencies = path.resolve(__dirname, '../node_modules');
const owner = 'cache-owner@fixture.test';
const other = 'cache-other@fixture.test';
const source = '/media/cache-resilience.png';
const checks = [], pageErrors = [], external = [], loaded = [];
let browser, server;
fs.mkdirSync(outputRoot, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {CachedImage} from '@/components/cached-image';
import * as images from '@/lib/browser-image-cache';
import * as data from '@/lib/browser-data-cache';
const root=createRoot(document.getElementById('root'));
window.fixture={images,data,render:(src)=>root.render(src?<CachedImage src={src} networkQueue="canvas" width="96" height="72" alt="缓存测试图" onLoad={()=>window.imageLoads++} onError={()=>window.imageErrors++}/>:null)};
window.imageLoads=0;window.imageErrors=0;
window.fixtureReady=true;`;

async function compile() {
  const bundle = await esbuild.build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: sourceRoot, sourcefile: 'cache-resilience-fixture.tsx' },
    outfile: path.join(outputRoot, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife',
    jsx: 'automatic', metafile: true, nodePaths: [dependencies],
    alias: { '@': path.join(sourceRoot, 'src'), react: path.join(dependencies, 'react'), 'react-dom': path.join(dependencies, 'react-dom') },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE': '"0"' },
    plugins: [{ name: 'explicit-auth-boundary', setup(build) {
      build.onResolve({ filter: /(^|\/)supabase$/ }, input => ({ path: input.path, namespace: 'auth-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({ contents: 'export async function authHeader(){return {};}', loader: 'js' }));
    } }],
  });
  for (const input of Object.keys(bundle.metafile.inputs)) {
    if (input.startsWith('auth-fixture:') || !input.includes('src/')) continue;
    const absolute = path.resolve(input);
    if (absolute.includes(`${path.sep}node_modules${path.sep}`) || !fs.existsSync(absolute)) continue;
    loaded.push({ file: absolute, sha256: hash(fs.readFileSync(absolute)) });
  }
  for (const name of ['src/lib/browser-image-cache.ts', 'src/lib/browser-data-cache.ts', 'src/components/cached-image.tsx']) {
    const file = path.join(sourceRoot, name);
    assert.ok(loaded.some(item => item.file === file), 'actual product module loaded: ' + name);
  }
}

async function main() {
  await compile();
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#477f65' } }).png().toBuffer();
  const bad = Buffer.alloc(png.length, 65);
  const digest = hash(png);
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(outputRoot, 'bundle.js'))); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function fixture(options = {}) {
    const config = { account: owner, version: 'local:fixture', deny: false, badNetwork: false, delayMs: 0, ...options };
    const calls = { manifest: 0, media: 0, account: 0, provider: 0 };
    const context = await browser.newContext({ viewport: { width: 900, height: 550 } });
    const page = await context.newPage();
    page.setDefaultTimeout(3500);
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin && !['blob:', 'data:'].includes(url.protocol)) { external.push(url.href); return route.abort(); }
      const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (url.pathname === '/api/media/image-cache') {
        calls.manifest++;
        if (config.deny) return json({ error: 'Denied fixture' }, 403);
        const sources = route.request().postDataJSON().sources;
        return json({ account: config.account, results: Object.fromEntries(sources.map(item => [item, { account: config.account, source: item, version: config.version, bytes: png.length, contentType: 'image/png', fetchUrl: item }])) });
      }
      if (url.pathname.startsWith('/media/')) {
        calls.media++;
        if (config.delayMs) await new Promise(resolve => setTimeout(resolve, config.delayMs));
        try { return await route.fulfill({ status: 200, contentType: 'image/png', body: config.badNetwork ? bad : png, headers: { 'cache-control': 'no-store' } }); } catch { return; }
      }
      if (url.pathname === '/api/account') {
        calls.account++;
        return json({ artworks: [{ id: 'cache-fixture-art', status: 'completed', image: source }], user: { password: 'never-cache-this' }, balance: 999 });
      }
      if (url.pathname.startsWith('/api/')) throw Error('Unexpected API fixture: ' + url.pathname);
      return route.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.fixtureReady === true);
    await page.evaluate(email => { window.fixture.images.activateBrowserImages(email); window.fixture.data.activateBrowserData(email); }, owner);
    return { context, page, config, calls, close: () => context.close() };
  }

  async function seedImage(page, corrupt = false, version = 'local:fixture') {
    await page.evaluate(async ({ source, owner, bytes, corrupt, version }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('naumi-image-bytes-v1', 2);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('images')) r.result.createObjectStore('images', { keyPath: 'id' }); if (!r.result.objectStoreNames.contains('metadata')) r.result.createObjectStore('metadata', { keyPath: 'id' }); };
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      const id = JSON.stringify([owner, source, version]);
      const value = corrupt ? new Uint8Array(bytes.length).fill(65) : new Uint8Array(bytes);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['images', 'metadata'], 'readwrite');
        tx.objectStore('images').put({ id, blob: new Blob([value], { type: 'image/png' }) });
        tx.objectStore('metadata').put({ id, account: owner, source, version, bytes: bytes.length, at: Date.now(), created: Date.now() });
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, { source, owner, bytes: Array.from(png), corrupt, version });
  }

  async function fault(page, dbName, mode, kind = 'stall') {
    await page.evaluate(({ dbName, mode, kind }) => {
      window.faultStats = { transactions: 0, aborts: 0 };
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, actualMode = 'readonly', ...rest) {
        if (this.name !== dbName || actualMode !== mode) return original.call(this, stores, actualMode, ...rest);
        window.faultStats.transactions++;
        if (kind === 'quota') throw new DOMException('Fixture quota exhausted', 'QuotaExceededError');
        const transaction = new EventTarget();
        Object.assign(transaction, {
          mode: actualMode, db: this, error: null,
          abort() { window.faultStats.aborts++; },
          objectStore() { return {
            get: () => ({ readyState: 'pending' }), getAll: () => ({ readyState: 'pending' }),
            put: () => ({ readyState: 'pending' }), delete: () => ({ readyState: 'pending' }), clear: () => ({ readyState: 'pending' }),
          }; },
        });
        return transaction;
      };
    }, { dbName, mode, kind });
  }

  async function imageResult(page, timeout = 2800) {
    return page.evaluate(async ({ source, timeout }) => {
      const started = performance.now();
      return Promise.race([
        window.fixture.images.acquireBrowserImage(source, undefined, { networkQueue: 'canvas' }).then(async lease => {
          try { const image = new Image(); image.src = lease.url; await image.decode(); return { kind: 'resolved', width: image.naturalWidth, elapsedMs: performance.now() - started }; }
          finally { lease.release(); }
        }, error => ({ kind: 'rejected', message: error.message, elapsedMs: performance.now() - started })),
        new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout', elapsedMs: performance.now() - started }), timeout)),
      ]);
    }, { source, timeout });
  }

  async function dataResult(page, timeout = 2800) {
    return page.evaluate(async ({ owner, timeout }) => {
      const started = performance.now();
      return Promise.race([
        window.fixture.data.loadAccountSnapshot(owner).then(value => ({ kind: 'resolved', value, elapsedMs: performance.now() - started }), error => ({ kind: 'rejected', message: error.message })),
        new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout', elapsedMs: performance.now() - started }), timeout)),
      ]);
    }, { owner, timeout });
  }

  async function check(name, expectedDefect, run) {
    let detail;
    try { detail = await run(); checks.push({ name, pass: true, expectedDefect, detail }); }
    catch (error) { checks.push({ name, pass: false, expectedDefect, error: error.message }); }
    console.log('CHECK=' + name + ' RESULT=' + (checks.at(-1).pass ? 'PASS' : 'FAIL'));
  }

  for (const mode of ['readonly', 'readwrite']) {
    await check('IMAGE_' + mode.toUpperCase() + '_HANG_SETTLES_WITH_DECODED_IMAGE', true, async () => {
      const f = await fixture();
      try {
        await fault(f.page, 'naumi-image-bytes-v1', mode); const result = await imageResult(f.page);
        assert.equal(result.kind, 'resolved', JSON.stringify({ result, calls: f.calls })); assert.equal(result.width, 32); assert.equal(f.calls.media, 1);
        await f.page.waitForFunction(() => window.faultStats.transactions > 0);
        const state = await f.page.evaluate(() => window.faultStats);
        if (mode === 'readonly') assert.equal(state.aborts, 1);
        else assert.ok(result.elapsedMs < 1000, 'successful network image is returned before stalled disk write deadline');
        return { result, calls: f.calls, fault: state };
      }
      finally { await f.close(); }
    });
    await check('ACCOUNT_' + mode.toUpperCase() + '_HANG_SETTLES_WITH_SERVER_DATA', true, async () => {
      const f = await fixture();
      try {
        await fault(f.page, 'naumi-business-cache-v1', mode); const result = await dataResult(f.page);
        assert.equal(result.kind, 'resolved', JSON.stringify({ result, calls: f.calls })); assert.equal(result.value.artworks[0].id, 'cache-fixture-art'); assert.equal(result.value.user, undefined); assert.equal(f.calls.account, 1);
        await f.page.waitForFunction(() => window.faultStats.transactions > 0);
        const state = await f.page.evaluate(() => window.faultStats);
        if (mode === 'readonly') assert.equal(state.aborts, 1);
        else assert.ok(result.elapsedMs < 1000, 'live account data is returned before stalled disk write deadline');
        return { result, calls: f.calls, fault: state };
      }
      finally { await f.close(); }
    });
  }

  await check('BROKEN_NON_HASH_CACHE_REPAIRS_AND_REOPEN_USES_FIXED_BYTES', true, async () => {
    const f = await fixture();
    try {
      await seedImage(f.page, true);
      await f.page.evaluate(source => window.fixture.render(source), source);
      await f.page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 32);
      assert.equal(f.calls.media, 1, 'one repaired image transfer');
      await f.page.evaluate(() => window.fixture.render(null));
      await f.page.waitForFunction(() => !document.querySelector('img'));
      await f.page.evaluate(source => window.fixture.render(source), source);
      await f.page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 32);
      assert.equal(f.calls.media, 1, 'reopening does not hit the same corrupt bytes');
      await new Promise(resolve => setTimeout(resolve, 80));
      await f.page.reload(); await f.page.waitForFunction(() => window.fixtureReady);
      await f.page.evaluate(({ owner, source }) => { window.fixture.images.activateBrowserImages(owner); window.fixture.render(source); }, { owner, source });
      await f.page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 32);
      assert.equal(f.calls.media, 1, 'refresh reads repaired persisted bytes, not corrupt old entry');
      await f.page.screenshot({ path: path.join(outputRoot, 'repaired-image.png') });
      return { calls: f.calls, naturalWidth: 32 };
    } finally { await f.close(); }
  });

  await check('IMAGE_BATCH_ALL_WAITERS_SETTLE_AND_NEXT_REQUEST_BYPASSES_BAD_IDB', true, async () => {
    const f = await fixture();
    try {
      await fault(f.page, 'naumi-image-bytes-v1', 'readonly');
      const result = await f.page.evaluate(async () => {
        const firstSources = Array.from({ length: 6 }, (_, i) => '/media/batch-' + i + '.png');
        const run = src => window.fixture.images.acquireBrowserImage(src, undefined, { networkQueue: 'canvas' }).then(async lease => {
          try { const image = new Image(); image.src = lease.url; await image.decode(); return image.naturalWidth; } finally { lease.release(); }
        });
        const first = await Promise.race([Promise.all(firstSources.map(run)), new Promise(resolve => setTimeout(() => resolve('timeout'), 2800))]);
        if (first === 'timeout') return { first };
        const before = { ...window.faultStats }, start = performance.now();
        const second = await run('/media/batch-after.png');
        return { first, second, secondElapsedMs: performance.now() - start, before, after: { ...window.faultStats } };
      });
      assert.deepEqual(result.first, [32, 32, 32, 32, 32, 32]); assert.equal(result.second, 32);
      assert.ok(result.secondElapsedMs < 700); assert.equal(result.after.transactions, result.before.transactions); assert.equal(f.calls.media, 7);
      return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('ACCOUNT_WAITERS_SETTLE_AND_NEW_QUERY_BYPASSES_BAD_IDB', true, async () => {
    const f = await fixture();
    try {
      await fault(f.page, 'naumi-business-cache-v1', 'readonly');
      const result = await f.page.evaluate(async owner => {
        const run = query => window.fixture.data.loadAccountSnapshot(owner, query);
        const first = await Promise.race([Promise.all(['a=1', 'a=2', 'a=3'].map(run)), new Promise(resolve => setTimeout(() => resolve('timeout'), 2800))]);
        if (first === 'timeout') return { first };
        const before = { ...window.faultStats }, start = performance.now(); const second = await run('a=4');
        return { first, second, secondElapsedMs: performance.now() - start, before, after: { ...window.faultStats } };
      }, owner);
      assert.equal(result.first.length, 3); assert.ok(result.first.every(row => row.artworks[0].id === 'cache-fixture-art'));
      assert.equal(result.second.artworks[0].id, 'cache-fixture-art'); assert.ok(result.secondElapsedMs < 700);
      assert.equal(result.after.transactions, result.before.transactions); assert.equal(f.calls.account, 4);
      return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('CORRUPT_CACHE_AND_BAD_NETWORK_STOP_AFTER_ONE_REPAIR', false, async () => {
    const f = await fixture({ badNetwork: true });
    try {
      await seedImage(f.page, true); await f.page.evaluate(source => window.fixture.render(source), source);
      await f.page.waitForFunction(() => window.imageErrors > 0);
      // Wait beyond the first automatic transport retry window; malformed
      // bytes after repair must not spend that budget or look unauthorized.
      await new Promise(resolve => setTimeout(resolve, 1100));
      assert.equal(f.calls.media, 1, 'one authorized repair without transport retries');
      const state=await f.page.locator('img').evaluate(image=>({width:image.naturalWidth,denied:image.hasAttribute('data-browser-image-denied'),errors:window.imageErrors}));
      assert.deepEqual(state,{width:0,denied:false,errors:1});
      return { calls: f.calls, errors: await f.page.evaluate(() => window.imageErrors) };
    } finally { await f.close(); }
  });

  await check('DENIED_AUTHORIZATION_NEVER_BYPASSES_TO_MEDIA', false, async () => {
    const f = await fixture({ deny: true });
    try { await seedImage(f.page, true); const result = await imageResult(f.page); assert.equal(result.kind, 'rejected'); assert.equal(f.calls.media, 0); return { result, calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('QUOTA_ERRORS_DO_NOT_FAIL_IMAGE_OR_ACCOUNT_READ', false, async () => {
    const f = await fixture();
    try { await fault(f.page, 'naumi-image-bytes-v1', 'readwrite', 'quota'); const image = await imageResult(f.page); assert.equal(image.kind, 'resolved'); await fault(f.page, 'naumi-business-cache-v1', 'readwrite', 'quota'); const data = await dataResult(f.page); assert.equal(data.kind, 'resolved'); return { image, data, calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('HEALTHY_COLD_ONCE_REOPEN_AND_REFRESH_ZERO_BYTE_TRANSFERS', false, async () => {
    const f = await fixture({ version: digest });
    try {
      assert.equal((await imageResult(f.page)).kind, 'resolved'); assert.equal(f.calls.media, 1);
      assert.equal((await imageResult(f.page)).kind, 'resolved'); assert.equal(f.calls.media, 1);
      await new Promise(resolve => setTimeout(resolve, 80));
      await f.page.reload(); await f.page.waitForFunction(() => window.fixtureReady);
      await f.page.evaluate(owner => window.fixture.images.activateBrowserImages(owner), owner);
      assert.equal((await imageResult(f.page)).kind, 'resolved'); assert.equal(f.calls.media, 1);
      return { calls: f.calls, cold: 1, reopenBytes: 0, refreshBytes: 0 };
    } finally { await f.close(); }
  });

  await check('ACCOUNT_SWITCH_DURING_DOWNLOAD_NEVER_EXPOSES_OLD_IMAGE', false, async () => {
    const f = await fixture({ delayMs: 180 });
    try {
      const result = await f.page.evaluate(async ({ source, other }) => {
        const work = window.fixture.images.acquireBrowserImage(source).then(lease => { lease.release(); return 'resolved'; }, () => 'rejected');
        setTimeout(() => window.fixture.images.activateBrowserImages(other), 60); return work;
      }, { source, other });
      assert.equal(result, 'rejected'); return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('CANCELLED_DOWNLOAD_DOES_NOT_PUBLISH_IMAGE', false, async () => {
    const f = await fixture({ delayMs: 180 });
    try {
      const result = await f.page.evaluate(async source => {
        const abort = new AbortController();
        const work = window.fixture.images.acquireBrowserImage(source, abort.signal).then(lease => { lease.release(); return 'resolved'; }, () => 'rejected');
        setTimeout(() => abort.abort(), 60); return work;
      }, source);
      assert.equal(result, 'rejected'); return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('ZERO_PAGE_ERRORS_EXTERNAL_NETWORK_AND_SUPPLIER_CALLS', false, async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(external, []); return { pageErrors, external, supplierCalls: 0, productionWrites: 0 }; });
  const unchanged = loaded.every(item => hash(fs.readFileSync(item.file)) === item.sha256);
  assert.ok(unchanged, 'loaded source remained stable throughout browser tests');
  const failures = checks.filter(item => !item.pass);
  const defects = failures.filter(item => item.expectedDefect);
  const controlFailures = failures.filter(item => !item.expectedDefect);
  const status = baseline ? (defects.length === 7 && !controlFailures.length ? 'REPRODUCED' : 'INVALID_BASELINE') : failures.length ? 'FAIL' : 'PASS';
  const exit = status === 'PASS' ? 0 : status === 'REPRODUCED' ? 1 : 2;
  fs.writeFileSync(path.join(outputRoot, 'RESULT.json'), JSON.stringify({ status, sourceRoot, baseline, checks, loaded, sourceUnchanged: unchanged, pageErrors, external, supplierCalls: 0, productionWrites: 0, exit }, null, 2));
  console.log(`BROWSER_CACHE_RESILIENCE=${status} CASES=${checks.length} FAILED=${failures.length} OLD_DEFECTS=${defects.length} CONTROL_FAILURES=${controlFailures.length} REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=${exit}`);
  process.exitCode = exit;
}

main().catch(error => { console.error(error); process.exitCode = 2; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
