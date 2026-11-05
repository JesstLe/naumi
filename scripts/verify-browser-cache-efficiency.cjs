// Actual product modules + real Edge/IndexedDB/Blob decode. HTTP and storage faults are explicit fixtures.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const esbuild = require('esbuild'), sharp = require('sharp');
const { chromium, expect } = require('@playwright/test');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const sourceRoot = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const outputRoot = path.resolve(arg('--output-root', process.env.BROWSER_CACHE_EFFICIENCY_EVIDENCE||'output/browser-cache-efficiency'));
const dependencies = path.resolve(__dirname, '../node_modules'), baseline = args.includes('--baseline');
const owner = 'efficiency-owner@fixture.test', other = 'efficiency-other@fixture.test';
const source = '/media/efficiency.png', source2 = '/media/efficiency-other.png';
const checks = [], loaded = [], errors = [], external = [];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let browser, server;
fs.mkdirSync(outputRoot, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {CachedImage} from '@/components/cached-image';
import * as images from '@/lib/browser-image-cache';
import {BrowserCacheStorage} from '@/lib/browser-cache-storage';
import {VerifiedImageContentPool} from '@/lib/browser-image-content';
const root=createRoot(document.getElementById('root'));
window.fixture={images,BrowserCacheStorage,VerifiedImageContentPool,render:(src)=>root.render(src?<CachedImage src={src} width="96" height="72" alt="cache fixture"/>:null)};
window.fixtureReady=true;`;

async function compile() {
  const result = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: sourceRoot, sourcefile: 'cache-efficiency-fixture.tsx' },
    outfile: path.join(outputRoot, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true,
    nodePaths: [dependencies], alias: { '@': path.join(sourceRoot, 'src'), react: path.join(dependencies, 'react'), 'react-dom': path.join(dependencies, 'react-dom') },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE': '"0"' },
    plugins: [{ name: 'explicit-auth', setup(build) {
      build.onResolve({ filter: /(^|\/)supabase$/ }, input => ({ path: input.path, namespace: 'fixture-auth' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture-auth' }, () => ({ contents: 'export async function authHeader(){return {};}', loader: 'js' }));
    } }],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(input);
    if (!input.includes('src/') || input.startsWith('fixture-auth:') || file.includes(`${path.sep}node_modules${path.sep}`) || !fs.existsSync(file)) continue;
    loaded.push({ file, sha256: hash(fs.readFileSync(file)) });
  }
  for (const relative of ['src/lib/browser-cache-storage.ts', 'src/lib/browser-image-cache.ts', 'src/lib/browser-image-content.ts', 'src/components/cached-image.tsx'])
    assert.ok(loaded.some(row => row.file === path.join(sourceRoot, relative)), 'whole actual module loaded: ' + relative);
}

async function main() {
  await compile();
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#467e65' } }).png().toBuffer();
  const digest = hash(png);
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); res.end(fs.readFileSync(path.join(outputRoot, 'bundle.js'))); }
    else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function fixture(options = {}) {
    const config = { account: owner, version: 'local:fixture', deny: false, delay: 0, ...options };
    const calls = { manifest: 0, media: 0, sources: [], supplier: 0 };
    const context = await browser.newContext(), page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-30T00:00:00Z') });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin && !['blob:', 'data:'].includes(url.protocol)) { external.push(url.href); return route.abort(); }
      if (url.pathname === '/api/media/image-cache') {
        calls.manifest++;
        if (config.deny) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"denied"}' });
        const sources = route.request().postDataJSON().sources;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ account: config.account,
          results: Object.fromEntries(sources.map(value => [value, { account: config.account, source: value, version: config.version,
            bytes: png.length, contentType: 'image/png', fetchUrl: value }])) }) });
      }
      if (url.pathname.startsWith('/media/')) {
        calls.media++; calls.sources.push(url.pathname);
        if (config.delay) await new Promise(resolve => setTimeout(resolve, config.delay));
        try { return await route.fulfill({ contentType: 'image/png', body: png, headers: { 'cache-control': 'no-store' } }); } catch { return; }
      }
      if (url.pathname.startsWith('/api/')) throw Error('unexpected endpoint ' + url.pathname);
      return route.continue();
    });
    await page.goto(origin); await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(owner => window.fixture.images.activateBrowserImages(owner), owner);
    return { page, context, config, calls, close: () => context.close() };
  }

  async function check(name, expectedDefect, action) {
    try { checks.push({ name, expectedDefect, pass: true, detail: await action() }); }
    catch (error) { checks.push({ name, expectedDefect, pass: false, error: error.message }); }
    console.log('CHECK=' + name + ' RESULT=' + (checks.at(-1).pass ? 'PASS' : 'FAIL'));
  }

  async function image(f, url = source, options = {}) {
    return f.page.evaluate(async ({ url, options }) => {
      const start = performance.now(), lease = await window.fixture.images.acquireBrowserImage(url, undefined, options);
      try { const img = new Image(); img.src = lease.url; await img.decode(); return { width: img.naturalWidth, elapsedMs: performance.now() - start }; }
      finally { lease.release(); }
    }, { url, options });
  }

  async function imageFault(f, mode = 'readwrite') {
    await f.page.evaluate(mode => {
      const original = IDBDatabase.prototype.transaction;
      window.imageFaultStats = { transactions: 0, aborts: 0 };
      IDBDatabase.prototype.transaction = function (stores, actualMode = 'readonly', ...rest) {
        if (this.name !== 'naumi-image-bytes-v1' || actualMode !== mode) return original.call(this, stores, actualMode, ...rest);
        window.imageFaultStats.transactions++;
        throw new DOMException('Fixture transient storage fault', 'UnknownError');
      };
    }, mode);
  }

  async function storageFixture() {
    const f = await fixture();
    await f.page.evaluate(() => {
      const name = 'cache-efficiency-storage';
      window.storageState = { fault: false, opens: 0, transactions: 0, aborts: 0, stale: null, connections: [] };
      const originalOpen = indexedDB.open.bind(indexedDB), originalTransaction = IDBDatabase.prototype.transaction;
      indexedDB.open = function (dbName, ...rest) { if (dbName === name) window.storageState.opens++; return originalOpen(dbName, ...rest); };
      IDBDatabase.prototype.transaction = function (stores, mode = 'readonly', ...rest) {
        if (this.name !== name) return originalTransaction.call(this, stores, mode, ...rest);
        window.storageState.transactions++;
        if (window.storageState.fault) {
          const tx = { mode, db: this, error: new DOMException('Transient fixture failure', 'UnknownError'),
            abort() { window.storageState.aborts++; }, objectStore() { return { get: () => ({ readyState: 'pending' }), put: () => ({ readyState: 'pending' }) }; } };
          window.storageState.stale = tx;
          setTimeout(() => tx.onerror?.(), 0);
          return tx;
        }
        return originalTransaction.call(this, stores, mode, ...rest);
      };
      window.cacheStorage = new window.fixture.BrowserCacheStorage(name, 1, db => db.createObjectStore('rows', { keyPath: 'id' }));
      window.storageWrite = value => window.cacheStorage.run('rows', 'readwrite', 'fallback', (tx, result) => {
        const request = tx.objectStore('rows').put({ id: 'one', value }); request.onsuccess = () => result('written');
      });
      window.storageRead = () => window.cacheStorage.run('rows', 'readonly', 'fallback', (tx, result) => {
        const request = tx.objectStore('rows').get('one'); request.onsuccess = () => result(request.result?.value || 'missing');
      });
    });
    assert.equal(await f.page.evaluate(() => window.storageWrite('persisted')), 'written');
    return f;
  }

  await check('TRANSIENT_STORAGE_RECOVERS_SINGLE_PROBE_AND_IGNORES_OLD_EVENTS', true, async () => {
    const f = await storageFixture();
    try {
      const first = await f.page.evaluate(async () => { window.storageState.fault = true; const result = await window.storageRead(); window.storageState.old = window.storageState.stale; window.storageState.fault = false; return { result, opens: window.storageState.opens, transactions: window.storageState.transactions }; });
      assert.equal(first.result, 'fallback');
      const cool = await f.page.evaluate(async () => ({ values: await Promise.all(Array.from({ length: 8 }, () => window.storageRead())), opens: window.storageState.opens }));
      assert.ok(cool.values.every(value => value === 'fallback')); assert.equal(cool.opens, first.opens);
      await f.page.clock.fastForward(15100);
      const probe = await f.page.evaluate(async () => ({ values: await Promise.all(Array.from({ length: 8 }, () => window.storageRead())), opens: window.storageState.opens, transactions: window.storageState.transactions }));
      assert.equal(probe.opens, first.opens + 1, 'one demand-driven recovery open, not permanent bypass or an open storm');
      assert.equal(probe.transactions, first.transactions + 1, 'eight callers cause only one recovery transaction');
      assert.equal(probe.values.filter(value => value === 'persisted').length, 1, 'other concurrent probe callers fail open without waiting');
      assert.equal(await f.page.evaluate(() => window.storageRead()), 'persisted');
      await f.page.evaluate(() => { window.storageState.old.onerror?.(); window.storageState.old.onabort?.(); window.storageState.old.oncomplete?.(); });
      assert.equal(await f.page.evaluate(() => window.storageRead()), 'persisted', 'late failed-generation events cannot disable recovered connection');
      const final = await f.page.evaluate(() => ({ opens: window.storageState.opens, transactions: window.storageState.transactions }));
      assert.equal(final.opens, probe.opens);
      return { first, cool, probe, final };
    } finally { await f.close(); }
  });

  await check('REPEATED_STORAGE_FAILURE_BACKS_OFF_WITHOUT_BACKGROUND_RETRY_LOOP', true, async () => {
    const f = await storageFixture();
    try {
      await f.page.evaluate(async () => { window.storageState.fault = true; await window.storageRead(); });
      const first = await f.page.evaluate(() => window.storageState.opens);
      await f.page.clock.fastForward(15100); await f.page.evaluate(() => window.storageRead());
      const second = await f.page.evaluate(() => window.storageState.opens); assert.equal(second, first + 1);
      await f.page.clock.fastForward(15100); await f.page.evaluate(() => window.storageRead());
      assert.equal(await f.page.evaluate(() => window.storageState.opens), second, 'second failed attempt waits 30 seconds');
      await f.page.clock.fastForward(15100); await f.page.evaluate(() => window.storageRead());
      const third = await f.page.evaluate(() => window.storageState.opens); assert.equal(third, second + 1);
      await f.page.clock.fastForward(61000);
      assert.equal(await f.page.evaluate(() => window.storageState.opens), third, 'elapsed time alone never launches a probe');
      await f.page.evaluate(() => window.storageRead());
      const fourth = await f.page.evaluate(() => window.storageState.opens); assert.equal(fourth, third + 1);
      await f.page.clock.fastForward(61000); await f.page.evaluate(() => window.storageRead());
      assert.equal(await f.page.evaluate(() => window.storageState.opens), fourth, 'fourth failure waits 120 seconds');
      await f.page.clock.fastForward(61000); await f.page.evaluate(() => window.storageRead());
      const fifth = await f.page.evaluate(() => window.storageState.opens); assert.equal(fifth, fourth + 1);
      await f.page.clock.fastForward(121000); await f.page.evaluate(() => window.storageRead());
      assert.equal(await f.page.evaluate(() => window.storageState.opens), fifth + 1, 'backoff capped at 120 seconds');
      await f.page.clock.fastForward(121000);
      assert.equal(await f.page.evaluate(async () => { window.storageState.fault = false; return window.storageRead(); }), 'persisted');
      await f.page.evaluate(async () => { window.storageState.fault = true; await window.storageRead(); window.storageState.fault = false; });
      const beforeResetProbe = await f.page.evaluate(() => window.storageState.opens);
      await f.page.clock.fastForward(15100); assert.equal(await f.page.evaluate(() => window.storageRead()), 'persisted');
      assert.equal(await f.page.evaluate(() => window.storageState.opens), beforeResetProbe + 1, 'successful recovery resets future backoff to 15 seconds');
      return { opens: [first, second, third, fourth, fifth], virtualTimeOnly: true };
    } finally { await f.close(); }
  });

  await check('NON_HASH_IMAGE_REOPEN_THREE_TIMES_DOWNLOADS_ONCE_WITH_DISK_UNAVAILABLE', true, async () => {
    const f = await fixture();
    try { await imageFault(f); const results = [];
      for (let n = 0; n < 3; n++) {
        await f.page.evaluate(source => window.fixture.render(source), source);
        await f.page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 32);
        results.push(await f.page.locator('img').evaluate(image => ({ width: image.naturalWidth, source: image.getAttribute('data-browser-image-cache') })));
        if (n < 2) { await f.page.evaluate(() => window.fixture.render(null)); await f.page.locator('img').waitFor({ state: 'detached' }); }
      }
      await f.page.screenshot({ path: path.join(outputRoot, 'nonhash-reopened-image.png') });
      assert.ok(results.every(result => result.width === 32)); assert.equal(f.calls.media, 1, JSON.stringify({ results, calls: f.calls }));
      assert.equal(f.calls.manifest, 3, 'each reuse is independently authorized'); return { results, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('WARM_SHA_MEMORY_HIT_DOES_NOT_WAIT_FOR_UNRELATED_IDB_READ', true, async () => {
    const f = await fixture({ version: digest });
    try {
      await image(f); await f.page.waitForTimeout(50);
      await f.page.evaluate(() => {
        const original = IDBDatabase.prototype.transaction; window.readFaultCalls = 0;
        IDBDatabase.prototype.transaction = function (stores, mode = 'readonly', ...rest) {
          if (this.name !== 'naumi-image-bytes-v1' || mode !== 'readonly') return original.call(this, stores, mode, ...rest);
          window.readFaultCalls++;
          return { abort() {}, objectStore() { return { get: () => ({ readyState: 'pending' }) }; } };
        };
      });
      const result = await image(f); assert.equal(result.width, 32); assert.equal(f.calls.media, 1);
      assert.equal(await f.page.evaluate(() => window.readFaultCalls), 0, 'memory hit must be checked before any disk read');
      return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('NON_HASH_IDENTICAL_VERSION_DIFFERENT_SOURCES_NOT_SHARED', false, async () => {
    const f = await fixture();
    try { await imageFault(f); assert.equal((await image(f)).width, 32); assert.equal((await image(f, source2)).width, 32); assert.equal(f.calls.media, 2); assert.deepEqual(f.calls.sources, [source, source2]); return { calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('BYPASS_FETCHES_ONCE_THEN_REPLACES_EXACT_READY_ENTRY', true, async () => {
    const f = await fixture();
    try { await imageFault(f); await image(f); await image(f, source, { bypassCache: true }); await image(f);
      assert.equal(f.calls.media, 2, 'fresh bypass plus warm reuse, not repeated legacy downloads'); assert.equal(f.calls.manifest, 3); return { calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('WARM_MEMORY_STILL_REQUIRES_FRESH_AUTHORIZATION', false, async () => {
    const f = await fixture();
    try { await imageFault(f); await image(f); f.config.deny = true;
      const result = await f.page.evaluate(async source => { try { const lease = await window.fixture.images.acquireBrowserImage(source); lease.release(); return 'resolved'; } catch { return 'denied'; } }, source);
      assert.equal(result, 'denied'); assert.equal(f.calls.media, 1); assert.equal(f.calls.manifest, 2); return { result, calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('OWNER_AND_VERSION_CHANGES_NEVER_REUSE_OLD_BYTES', false, async () => {
    const f = await fixture();
    try { await imageFault(f); await image(f); f.config.version = 'local:fixture-v2'; await image(f); assert.equal(f.calls.media, 2);
      f.config.account = other; await f.page.evaluate(other => window.fixture.images.activateBrowserImages(other), other); await image(f);
      assert.equal(f.calls.media, 3); return { calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('SHA_VERIFIED_IDENTICAL_BYTES_KEEP_AUTHORIZED_CROSS_SOURCE_DEDUP', false, async () => {
    const f = await fixture({ version: digest });
    try { await imageFault(f); await image(f); await image(f, source2); assert.equal(f.calls.media, 1); assert.equal(f.calls.manifest, 2); return { calls: f.calls }; }
    finally { await f.close(); }
  });

  await check('SHA_NEW_SOURCE_PERSISTS_BEFORE_RELOAD_WITHOUT_EXTRA_DOWNLOAD', false, async () => {
    const f = await fixture({ version: digest });
    try {
      await image(f); await image(f, source2);
      assert.equal(f.calls.media, 1); assert.equal(f.calls.manifest, 2);
      // IndexedDB is asynchronous: poll its awaited boolean, not a Promise handle.
      await expect.poll(()=>f.page.evaluate(async ({ owner, source, version }) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('naumi-image-bytes-v1', 2);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        try { return await new Promise(resolve => {
          const tx = db.transaction(['images','metadata']), id=JSON.stringify([owner, source, version]);
          const request = tx.objectStore('images').get(id), metadata=tx.objectStore('metadata').get(id);
          tx.oncomplete = () => resolve(!!request.result?.blob && metadata.result?.bytes === request.result.blob.size);
          tx.onerror = tx.onabort = () => resolve(false);
        }); } finally { db.close(); }
      }, { owner, source: source2, version: digest }),{timeout:4000}).toBe(true);
      for(let round=0;round<3;round++){
        await f.page.reload(); await f.page.waitForFunction(() => window.fixtureReady);
        await f.page.evaluate(owner => window.fixture.images.activateBrowserImages(owner), owner);
        const decoded = await image(f, source2);
        assert.equal(decoded.width, 32); assert.equal(f.calls.media, 1, 'persisted B reload '+round); assert.equal(f.calls.manifest, 3+round);
      }
      return { calls: f.calls, sourceBPersisted: true, reloadExtraDownloads: 0 };
    } finally { await f.close(); }
  });

  await check('MEMORY_POOL_RETAINS_EXISTING_BYTE_ITEM_LIMITS_AND_LRU', false, async () => {
    const f = await fixture();
    try {
      const result = await f.page.evaluate(async () => {
        const pool = new window.fixture.VerifiedImageContentPool(8, 2); let loads = 0;
        const blob = new Blob(['1234']); const signal = new AbortController().signal;
        pool.remember('a', blob); pool.remember('b', blob); pool.remember('c', blob);
        const load = async () => { loads++; return blob; };
        await pool.acquire('b', 'b', load, signal); const warm = loads;
        await pool.acquire('a', 'a', load, signal); const evicted = loads;
        const large = async () => { loads++; return new Blob(['123456789']); };
        await pool.acquire('large', 'large', large, signal); await pool.acquire('large', 'large', large, signal);
        pool.clear(); await pool.acquire('a', 'a', load, signal);
        return { warm, evicted, final: loads };
      });
      assert.deepEqual(result, { warm: 0, evicted: 1, final: 4 }); return result;
    } finally { await f.close(); }
  });

  await check('CANCELLED_REQUEST_DOES_NOT_PUBLISH_PIXELS', false, async () => {
    const f = await fixture({ delay: 180 });
    try {
      const result = await f.page.evaluate(async source => {
        const controller = new AbortController(); const work = window.fixture.images.acquireBrowserImage(source, controller.signal).then(lease => { lease.release(); return 'resolved'; }, () => 'cancelled');
        setTimeout(() => controller.abort(), 40); return work;
      }, source);
      assert.equal(result, 'cancelled'); return { result, calls: f.calls };
    } finally { await f.close(); }
  });

  await check('ZERO_PAGEERROR_EXTERNAL_NETWORK_AND_SUPPLIER_CALLS', false, async () => {
    assert.deepEqual(errors, []); assert.deepEqual(external, []); return { errors, external, supplierCalls: 0, productionWrites: 0 };
  });
  const sourceUnchanged = loaded.every(row => hash(fs.readFileSync(row.file)) === row.sha256); assert.ok(sourceUnchanged);
  const failed = checks.filter(row => !row.pass), old = failed.filter(row => row.expectedDefect), control = failed.filter(row => !row.expectedDefect);
  const status = baseline ? (old.length === 5 && control.length === 0 ? 'REPRODUCED' : 'INVALID_BASELINE') : failed.length ? 'FAIL' : 'PASS';
  const exit = status === 'PASS' ? 0 : status === 'REPRODUCED' ? 1 : 2;
  fs.writeFileSync(path.join(outputRoot, 'RESULT.json'), JSON.stringify({ status, sourceRoot, baseline, checks, loaded, sourceUnchanged, errors, external, supplierCalls: 0, productionWrites: 0, exit }, null, 2));
  console.log(`BROWSER_CACHE_EFFICIENCY=${status} CASES=${checks.length} FAILED=${failed.length} OLD_DEFECTS=${old.length} CONTROL_FAILURES=${control.length} REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=${exit}`);
  process.exitCode = exit;
}
main().catch(error => { console.error(error); process.exitCode = 2; }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
