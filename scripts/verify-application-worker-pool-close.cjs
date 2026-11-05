#!/usr/bin/env node
'use strict';

/** Actual application/coordination/inflight modules, real isolated PostgreSQL
 * sockets; startup/release/receipt/scan dependencies are explicit fixtures.
 * No application tables, DDL, suppliers, HTTP, claims or paid operations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { setImmediate: nextTurn } = require('node:timers/promises');
const pg = require('pg');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function load(file, imports, locals = {}) {
  const projected = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module: projected, exports: projected.exports, console, setTimeout, clearTimeout, ...locals,
    require(name) { assert.ok(Object.hasOwn(imports, name), 'unregistered dependency: ' + name); return imports[name]; },
  }, { filename: file, timeout: 1500 });
  return projected.exports;
}
async function scenario(url, mode) {
  const events = [], pools = [], runtime = {};
  let videoCreated = 0, imageClosed = 0, videoClosed = 0;
  class ObservedPool extends pg.Pool {
    constructor(options) { super(options); videoCreated++; pools.push(this); }
    async end() { events.push('video-close'); await super.end(); }
  }
  const business = new pg.Pool({ connectionString: url, max: 5, ssl: false, connectionTimeoutMillis: 3000 });
  const release = new pg.Pool({ connectionString: url, max: 2, ssl: false, connectionTimeoutMillis: 3000 });
  for (const [pool, label] of [[business, 'business'], [release, 'release']]) {
    const end = pool.end.bind(pool); pool.end = () => { events.push(label + '-close'); return end(); }; pools.push(pool);
  }
  const helperImports = { 'server-only': {}, 'node:process': runtime, pg: { Pool: ObservedPool }, '@/platform/db/pool': { getPool: () => business } };
  const helper = load('src/lib/video/coordination-pool.ts', helperImports);
  const inflight = load('src/lib/worker/inflight.ts', {});
  const status = async () => ({ observations: { unknownLeases: 0, trackedAcceptedWork: 0 } });
  const worker = load('src/lib/worker/application.ts', {
    'server-only': {}, '@/platform/db/pool': { dbEnabled: true, getPool: () => business },
    '../application/persistence': { initializeApplicationPersistence: async () => { if (mode === 'init-failure') throw Error('fixture-init-failure'); } },
    '../release-runtime/identity': { releaseRuntimeEnabled: () => true, releaseIdentity: () => ({ instanceId: 'fixture-worker' }) },
    '../release-runtime/store': { ensureReleaseSchema: async () => {}, releasePool: () => release, releaseStatus: status },
    '../release-runtime/worker-tick-receipts': { createWorkerTickReceiptStore: () => ({}), runReceiptedWorkerTick: () => { throw Error('unexpected tick'); } },
    '../imagegen/coordination-pool': { closeImageCoordinationPool: async () => { imageClosed++; events.push('image-close'); if (mode === 'close-failure') throw Error('fixture-image-close-failure'); } },
    '../video/coordination-pool': { closeVideoCoordinationPool: async () => { videoClosed++; await helper.closeVideoCoordinationPool(); } },
    './scan': { scanApplicationWorkerOnce: () => { throw Error('unexpected scan'); } },
    './inflight': inflight,
    './wakeup': { listenForApplicationWork: async () => ({ close: async () => { events.push('listener-close'); } }) },
  });
  let app, lock, releaseWork;
  try {
    if (mode === 'init-failure') {
      await assert.rejects(worker.createDirectWorkerApplication(), /fixture-init-failure/); checks++;
      check(videoCreated === 0 && imageClosed === 1 && videoClosed === 1, 'failed startup closes without creating video pool');
      check(business.ended && release.ended, 'failed startup closes other pools');
      return;
    }
    app = await worker.createDirectWorkerApplication();
    await app.listen(() => {}, () => false, 1000);
    if (mode !== 'unused') {
      const key = 'worker-pool-close-' + randomUUID();
      lock = await helper.acquireVideoCoordinationLock(key);
      check(lock.acquired, 'real PG lock acquired');
      const duplicate = load('src/lib/video/coordination-pool.ts', helperImports);
      check(duplicate.getVideoCoordinationPool() === helper.getVideoCoordinationPool(), 'compiled copies share video pool');
      await inflight.trackBackgroundWork(Promise.resolve());
      const gate = new Promise(resolve => { releaseWork = resolve; });
      inflight.trackBackgroundWork(gate.then(async () => { await lock.release(); events.push('work-released'); }));
    }
    let settled = false;
    const closing = app.close(); closing.then(() => { settled = true; }, () => { settled = true; });
    check(closing === app.close(), 'concurrent close reuses the same promise');
    await nextTurn(); await nextTurn();
    if (releaseWork) {
      check(!settled && !events.some(event => event.endsWith('-close') && event !== 'listener-close'), 'drain retains all pools while active work owns lock');
      check(events[0] === 'listener-close', 'wakeup listener stops before drain');
      check((await business.query('SELECT 1 AS ok')).rows[0].ok === 1, 'business connection remains usable during drain');
      releaseWork();
    }
    if (mode === 'close-failure') { await assert.rejects(closing, /DIRECT_WORKER_POOL_CLOSE_FAILED/); checks++; }
    else await closing;
    check(imageClosed === 1 && videoClosed === 1, 'both coordination teardown ports called once');
    check(business.ended && release.ended && pools.every(pool => pool.ended), 'every existing PG pool ended even if peer close rejected');
    check(inflight.backgroundWorkCount() === 0, 'no tracked callback remains');
    check(videoCreated === (mode === 'unused' ? 0 : 1), 'teardown never constructs a pool');
    check(!runtime[Symbol.for('naumi.video.coordination.pg.v1')], 'video singleton cleared');
    if (mode !== 'unused') check(events.indexOf('work-released') < events.indexOf('video-close'), 'real lock releases before pool closes');
    await helper.closeVideoCoordinationPool();
    check(videoCreated === (mode === 'unused' ? 0 : 1), 'repeated teardown remains lazy');
  } finally {
    releaseWork?.(); await lock?.release(); await inflight.waitForBackgroundWork();
    await Promise.allSettled(pools.filter(pool => !pool.ending && !pool.ended).map(pool => pool.end()));
  }
}
async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /fixture/);
  const watchdog = setTimeout(() => { console.error('APPLICATION_WORKER_POOL_CLOSE=TIMEOUT'); process.exit(2); }, 20000);
  try {
    for (const mode of ['unused', 'active', 'close-failure', 'init-failure']) { await scenario(url.toString(), mode); console.log('PASS pool-close ' + mode); }
    console.log(`APPLICATION_WORKER_POOL_CLOSE=PASS groups=4 checks=${checks} ACTUAL_APPLICATION=1 ACTUAL_HELPER=1 ACTUAL_INFLIGHT=1 REAL_PG=1 STARTUP_RELEASE_SCAN=FIXTURE SUPPLIER_POST=0 DDL=0`);
    console.log('APPLICATION_WORKER_POOL_CLOSE_CLEANUP=PASS POOLS_CLOSED=1 NO_SCHEMA_CREATED=1');
  } finally { clearTimeout(watchdog); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
