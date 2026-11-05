#!/usr/bin/env node
'use strict';
// Actual TypeScript modules, controlled I/O boundaries; no .env, DB, container,
// supplier, or user data. --source selects a saved source preimage/copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const arg = process.argv.indexOf('--source');
const source = arg < 0 ? root : path.resolve(process.argv[arg + 1]);
const sourceFile = file => fs.existsSync(path.join(source, file)) ? path.join(source, file) : path.join(root, file);
const read = file => fs.readFileSync(sourceFile(file), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
let passed = 0, failed = 0;
async function test(name, fn) {
  const only = process.argv.indexOf('--only');
  if (only >= 0 && !name.includes(process.argv[only + 1])) return;
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.code === 'ERR_ASSERTION' ? 'assertion' : String(e.message).split('\n')[0]}`); }
}

function loader({ env = {}, processObject = { env }, mocks = {}, timers = {}, logs = [] } = {}) {
  const cache = new Map();
  function load(file, fresh = false) {
    if (!fresh && cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const compiled = ts.transpileModule(read(file), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    }, fileName: file, reportDiagnostics: true });
    assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const requireModule = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'server-only') return {};
      if (id === 'node:process') return processObject;
      if (id.startsWith('node:')) return require(id);
      if (id.startsWith('.') || id.startsWith('@/')) {
        const resolved = (id.startsWith('@/') ? path.join('src', id.slice(2)) : path.join(path.dirname(file), id)).replaceAll('\\', '/');
        return load(resolved + '.ts');
      }
      throw new Error('UNMOCKED_IO:' + id);
    };
    const context = vm.createContext({ module, exports: module.exports, require: requireModule,
      process: processObject, console: { error: (...args) => logs.push(args.join(' ')) }, Buffer,
      setTimeout, clearTimeout, setInterval, clearInterval, ...timers, AbortController, structuredClone, URL, URLSearchParams });
    new vm.Script(compiled.outputText, { filename: file }).runInContext(context);
    return module.exports;
  }
  return { load, logs, processObject };
}
const plain = value => JSON.parse(JSON.stringify(value));
function workerFixture(env = {}, override = {}) {
  const calls = [], logs = [], timeouts = new Set(), intervals = new Set();
  const timer = (set, fn, ms) => { const t = { fn, ms, unref() {} }; set.add(t); return t; };
  const processObject = { env };
  const l = loader({ processObject, logs, timers: {
    setTimeout: (fn, ms) => timer(timeouts, fn, ms), clearTimeout: t => timeouts.delete(t),
    setInterval: (fn, ms) => timer(intervals, fn, ms), clearInterval: t => intervals.delete(t),
  }, mocks: {
    '@/lib/release-runtime/background-activity': { withBackgroundActivity: async (_a, _b, _c, run) => run() },
    '@/platform/db/pool': { dbEnabled: true },
    '@/lib/video/runtime': { recoverDueVideoTasks: async n => { calls.push(['video', n]); return override.video ? override.video(n) : n; } },
    './workflow': { recoverVideoWorkflows: async n => { calls.push(['workflow', n]); return override.workflow ? override.workflow(n) : n; } },
    '@/lib/worker/image-recovery': { recoverDurableImageJobs: async () => { calls.push(['image']); return override.image?.(); } },
    '@/lib/supplier-cost/worker': { scanSupplierCostsOnce: async () => { calls.push(['cost']); return override.cost?.(); } },
    '../application/task-execution': {applicationTasksRunHere:()=>true,deferApplicationTask:async()=>false},
    '../reference-workbench/service': { recoverReferenceWorkbench: async () => { calls.push(['reference']); return override.reference?.(); } },
  } });
  return { ...l, calls, timeouts, intervals, worker: l.load('src/lib/video/worker.ts') };
}

async function main() {
  await test('queue-defaults-and-valid-lanes', async () => {
    const q = loader().load('src/lib/image-job-queue.ts');
    assert.deepEqual(Array.from(q.IMAGE_JOB_KINDS, q.imageJobConcurrency), [16, 4, 4, 16]);
    const configured = loader({ env: { NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE: '23' } }).load('src/lib/image-job-queue.ts');
    assert.equal(configured.imageJobConcurrency('generate'), 23);
  });
  await test('queue-invalid-settings-are-explicit', async () => {
    for (const value of ['', '0', '-1', '1.5', 'abc', '257', 'Infinity', '1e1']) {
      const q = loader({ env: { NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE: value } }).load('src/lib/image-job-queue.ts');
      assert.throws(() => q.imageJobConcurrency('generate'), /INVALID_RUNTIME_SETTING:NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE/);
    }
  });
  await test('dispatch-default-four-fifo-and-failure-isolation', async () => {
    const q = loader().load('src/lib/image-job-queue.ts'), gate = deferred();
    const seen = [], errors = []; let active = 0, peak = 0;
    const result = q.dispatchImageQueue(Array.from({ length: 40 }, (_, i) => i), async i => {
      seen.push(i); peak = Math.max(peak, ++active); await gate.promise; active--;
      if (i === 1) throw new Error('fixture'); return i !== 2;
    }, e => errors.push(e));
    await flush(); assert.equal(active, 4); gate.resolve();
    assert.equal(await result, 38); assert.equal(peak, 4); assert.equal(errors.length, 1);
    assert.deepEqual(seen, Array.from({ length: 40 }, (_, i) => i));
  });
  await test('dispatch-configured-twelve-not-silently-eight', async () => {
    const q = loader({ env: { NAUMI_IMAGE_DISPATCH_BUDGET: '12', NAUMI_IMAGE_DISPATCH_CONCURRENCY: '12' } }).load('src/lib/image-job-queue.ts');
    const gate = deferred(); let started = 0;
    const run = q.dispatchImageQueue(Array.from({ length: 20 }), async () => { started++; await gate.promise; return true; }, () => {}, 12);
    await flush(); const observed = started; gate.resolve(); assert.equal(await run, 20); assert.equal(observed, 12);
  });
  await test('dispatch-environment-and-budget-diagnostics', async () => {
    const q = loader({ env: { NAUMI_IMAGE_DISPATCH_BUDGET: '12', NAUMI_IMAGE_DISPATCH_CONCURRENCY: '9' } }).load('src/lib/image-job-queue.ts');
    const gate = deferred(); let started = 0;
    const run = q.dispatchImageQueue(Array.from({ length: 16 }), async () => { started++; await gate.promise; return true; }, () => {});
    await flush(); const observed = started; gate.resolve(); await run; assert.equal(observed, 9);
    for (const n of [0, 1.2, NaN, Infinity, 13]) await assert.rejects(q.dispatchImageQueue([1], async () => true, () => {}, n), /IMAGE_DISPATCH/);
  });
  await test('dispatch-cancel-stops-new-work-and-drains-started', async () => {
    const q = loader().load('src/lib/image-job-queue.ts'), gate = deferred(), controller = new AbortController();
    let started = 0, done = false;
    const run = q.dispatchImageQueue(Array.from({ length: 40 }), async () => { started++; await gate.promise; return true; }, () => {}, 4, { signal: controller.signal }).then(n => { done = true; return n; });
    await flush(); controller.abort(); assert.equal(done, false); gate.resolve(); assert.equal(await run, 4); assert.equal(started, 4);
    assert.equal(await q.dispatchImageQueue([1], async () => { throw Error('must-not-send'); }, () => {}, 4, { signal: controller.signal }), 0);
  });
  await test('dispatch-local-http-backlog-and-failure', async () => {
    let active = 0, peak = 0, received = 0;
    const server = http.createServer((req, res) => {
      received++; peak = Math.max(peak, ++active);
      setTimeout(() => { active--; res.writeHead(req.url === '/5' ? 503 : 200); res.end('{}'); }, 15);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const q = loader({ env: { NAUMI_IMAGE_DISPATCH_CONCURRENCY: '6' } }).load('src/lib/image-job-queue.ts');
      const result = await q.dispatchImageQueue(Array.from({ length: 42 }, (_, i) => i), async i => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/${i}`, { signal: AbortSignal.timeout(3000) });
        await response.arrayBuffer(); return response.ok;
      }, () => {});
      assert.equal(result, 41); assert.equal(received, 42); assert.equal(peak, 6);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  });
  await test('video-default-and-configured-batches', async () => {
    const f = workerFixture(); assert.equal(await f.worker.scanVideoWorkerOnce(), 5); assert.deepEqual(f.calls, [['video', 3], ['workflow', 2]]);
    const g = workerFixture({ NAUMI_VIDEO_SCAN_BATCH: '12', NAUMI_VIDEO_WORKFLOW_BATCH: '7' });
    assert.equal(await g.worker.scanVideoWorkerOnce(), 19); assert.deepEqual(g.calls, [['video', 12], ['workflow', 7]]);
  });
  await test('video-invalid-settings-before-any-work', async () => {
    for (const [key, value] of [['NAUMI_VIDEO_SCAN_BATCH', '21'], ['NAUMI_VIDEO_WORKFLOW_BATCH', '11'], ['NAUMI_VIDEO_SCAN_INTERVAL_MS', '2147483648'], ['NAUMI_VIDEO_SCAN_BATCH', '0']]) {
      const f = workerFixture({ [key]: value }); await assert.rejects(f.worker.scanVideoWorkerOnce(), /INVALID_RUNTIME_SETTING/); assert.equal(f.calls.length, 0);
    }
  });
  await test('video-slow-scan-shared-across-module-copies', async () => {
    const gate = deferred(), f = workerFixture({}, { video: () => gate.promise });
    const other = f.load('src/lib/video/worker.ts', true);
    const first = f.worker.scanVideoWorkerOnce(), second = other.scanVideoWorkerOnce();
    await flush(); const count = f.calls.filter(c => c[0] === 'video').length; gate.resolve(3);
    await Promise.all([first, second]); assert.equal(count, 1);
  });
  await test('video-phase-failure-does-not-skip-workflows', async () => {
    const f = workerFixture({}, { video: async () => { throw Error('private-fixture-detail'); } });
    assert.equal(await f.worker.scanVideoWorkerOnce(), 2); assert.deepEqual(f.calls, [['video', 3], ['workflow', 2]]);
    assert.ok(f.logs.some(s => s.includes('video'))); assert.ok(!f.logs.join('').includes('private-fixture-detail'));
  });
  await test('embedded-cadence-single-flight-and-stop-drain', async () => {
    const gate = deferred(), f = workerFixture({ NAUMI_VIDEO_SCAN_INTERVAL_MS: '33' }, { image: () => gate.promise, cost: async () => { throw Error('fixture'); } });
    f.worker.startVideoWorker(); f.load('src/lib/video/worker.ts', true).startVideoWorker();
    assert.equal(f.timeouts.size, 1); assert.equal(f.intervals.size, 1);
    const initial = [...f.timeouts][0]; assert.equal(initial.ms, 15000); f.timeouts.delete(initial); initial.fn(); await flush();
    assert.equal(f.timeouts.size, 0); assert.equal(f.calls.filter(c => c[0] === 'image').length, 1);
    const interval = [...f.intervals][0]; assert.equal(interval.ms, 33); interval.fn(); await flush();
    assert.equal(f.calls.filter(c => c[0] === 'image').length, 1);
    assert.equal(f.calls.filter(c => c[0] === 'video').length, 2);
    let drained = false; const stop = f.worker.stopVideoWorker().then(() => { drained = true; }); await flush(); assert.equal(drained, false);
    gate.resolve(); await stop; assert.equal(f.timeouts.size, 0); assert.equal(f.intervals.size, 0);
    f.worker.startVideoWorker(); const restart = [...f.timeouts][0]; f.timeouts.delete(restart); restart.fn(); await flush();
    assert.equal([...f.intervals][0].ms, 33); await f.worker.stopVideoWorker(); assert.equal(f.timeouts.size, 0); assert.equal(f.intervals.size, 0);
  });
  await test('database-budget-reserves-configured-video-pool', async () => {
    const m = loader({ mocks: { pg: { Pool: class {} } } }).load('src/lib/db/connection.ts');
    assert.equal(m.databasePoolBudget({}).total, 15);
    assert.throws(() => m.databasePoolBudget({ NAUMI_VIDEO_COORDINATION_POOL_MAX: '3' }), /DATABASE_POOL_BUDGET_EXCEEDED/);
    assert.equal(m.databasePoolBudget({ NAUMI_VIDEO_COORDINATION_POOL_MAX: '4', NAUMI_DB_POOL_BUDGET: '17' }).total, 17);
    assert.throws(() => m.databasePoolBudget({ NAUMI_VIDEO_COORDINATION_POOL_MAX: '0' }), /INVALID_DATABASE_POOL_CONFIG/);
  });
  await test('database-old-hmr-generation-keeps-two-video-reservations', async () => {
    const p = { env: { NAUMI_VIDEO_COORDINATION_POOL_MAX: '9' } };
    p[Symbol.for('naumi.database.pools.v1')] = { config: { options: {}, budget: { business: 5, tick: 2, other: 8, total: 15, budget: 15 } } };
    const m = loader({ processObject: p, mocks: { pg: { Pool: class {} } } }).load('src/lib/db/connection.ts');
    assert.equal(m.videoCoordinationPoolLimit(), 2);
  });
  await test('coordination-configured-slots-budget-freeze-errors-and-release', async () => {
    let checkouts = 0, checkoutFailure = false, queryFailure = false, unlockFailure = false; const releases = [];
    class Pool extends EventEmitter {
      constructor(options) { super(); this.options = options; }
      async connect() {
        checkouts++; if (checkoutFailure) throw Error('private-connect');
        const client = new EventEmitter(); client.query = async sql => {
          if (queryFailure) throw Error('private-query');
          return { rows: [sql.includes('pg_try') ? { acquired: true } : { pg_advisory_unlock: !unlockFailure }] };
        }; client.release = discard => releases.push(discard); return client;
      }
    }
    const env = { NAUMI_VIDEO_COORDINATION_POOL_MAX: '3', NAUMI_DB_POOL_BUDGET: '16' };
    const mocks = { pg: { Pool } }, l = loader({ env, mocks });
    const db = l.load('src/lib/db/connection.ts'); mocks['../db'] = db;
    const m = l.load('src/lib/video/coordination-pool.ts');
    const locks = await Promise.all(['a', 'b', 'c'].map(m.acquireVideoCoordinationLock));
    assert.ok(locks.every(l => l.acquired)); assert.equal(checkouts, 3);
    const other = l.load('src/lib/video/coordination-pool.ts', true);
    assert.equal((await other.acquireVideoCoordinationLock('d')).acquired, false); assert.equal(checkouts, 3);
    env.NAUMI_VIDEO_COORDINATION_POOL_MAX = '12'; env.NAUMI_DB_POOL_BUDGET = '25';
    assert.equal(m.getVideoCoordinationPool().options.max, 3);
    for (const lock of locks) { await lock.release(); await lock.release(); } assert.equal(releases.length, 3);
    checkoutFailure = true; await assert.rejects(m.acquireVideoCoordinationLock('e'), { code: 'VIDEO_COORDINATION_UNAVAILABLE' }); checkoutFailure = false;
    queryFailure = true; await assert.rejects(m.acquireVideoCoordinationLock('f')); queryFailure = false; assert.equal(releases.at(-1), true);
    const last = await m.acquireVideoCoordinationLock('g'); unlockFailure = true; await last.release(); assert.equal(releases.at(-1), true);
    assert.equal(m.getVideoCoordinationPool()[Symbol.for('naumi.video.coordination.slots.v1')], 0);
  });
  await test('workflow-recovery-isolates-one-failed-run', async () => {
    const text = read('src/lib/video/workflow.ts');
    const ast = ts.createSourceFile('workflow.ts', text, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'recoverVideoWorkflows');
    assert.ok(fn); const visited = [], logs = [];
    const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const context = { exports: {}, process:{env:{}},deferApplicationTask:async()=>false,recoveringVideoWorkflows:new Set(),ensureWorkflowSchema: async () => {}, getPool: () => ({ query: async () => ({ rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }) }),
      resumeVideoWorkflow: async id => { visited.push(id); if (id === 'a') throw Error('fixture'); }, console: { error: s => logs.push(s) } };
    vm.runInNewContext(code, context); assert.equal(await context.exports.recoverVideoWorkflows(3), 2); assert.deepEqual(visited, ['a', 'b', 'c']);
  });
  await test('image-lane-fairness-and-paid-lease-guards-remain-in-source', async () => {
    const repository = read(fs.existsSync(path.join(root,'src/lib/image-jobs/scheduling.ts'))?'src/lib/image-jobs/scheduling.ts':'src/lib/image-job-repository.ts');
    assert.match(repository, /row_number\(\) OVER\(PARTITION BY kind ORDER BY updated_at,id\)/);
    assert.match(repository, /ORDER BY w\.lane_rank,w\.updated_at,w\.id/);
    assert.match(repository, /b\.capacity-COALESCE\(a\.n,0\)/);
    assert.match(repository, /lease_token=\$2/);
    const recovery = read('src/lib/worker/image-recovery.ts');
    assert.match(recovery, /if\(!recoveryScan\)recoveryScan=/);
    assert.match(recovery,/resumeImageJob/);
    assert.match(recovery,/dispatchImageQueue\(jobs,resumeImageJob/);
    assert.match(recovery,/undefined,options/);
    assert.match(recovery,/import\("\.\.\/imagegen\/generation-runtime"\)/);
    assert.doesNotMatch(recovery,/fetch\(/);
  });
  await test('bootstrap-first-only-preserves-admin-zero-false-and-explicit-values', async () => {
    const mocks = { zod: require('zod'), '../video/capabilities': { configuredVideoCapability: () => ({ maxReferenceImages: 0 }) } };
    const l = loader({ mocks });
    const schema = l.load('src/lib/model-config/schema.ts');
    mocks['./schema'] = schema;
    mocks['@/lib/model-config/storage-schema']={ensureModelSchema:async()=>{}};
    mocks['@/lib/video/model-defaults-schema']={ensureVideoDefaultsSchema:async()=>{}};
    mocks['@/lib/supplier-models/video-schema']={ensureSupplierVideoSchema:async()=>{}};
    mocks['../settings-secret'] = { settingsSecret: () => 'synthetic-not-used' };
    mocks['./capacity'] = { registerProviderCapacities: async () => {} };
    mocks['../video/frozen-capability'] = { ensureVideoDefaultsSchema: async () => {}, freezeManagedVideoCapability: async () => {} };
    mocks['../supplier-models/video-access'] = { ensureSupplierVideoSchema: async () => {} };
    const bootstrap = l.load('src/lib/model-config/bootstrap.ts');
    const repoModule = l.load('src/lib/model-config/repository.ts');
    let initializations = 0, credentialImports = 0, active;
    const query = async (sql, params) => {
      if (sql.startsWith('SELECT v.* FROM app_model_config_state')) return { rows: active ? [active] : [] };
      if (sql.startsWith('SELECT 1 FROM app_model_config_state')) return { rowCount: active ? 1 : 0, rows: [] };
      if (sql.startsWith('SELECT 1 FROM app_model_credentials')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO app_model_config_versions')) { active = { config: JSON.parse(params[1]), digest: params[2], version: 1 }; return { rows: [active] }; }
      if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock|INSERT INTO app_model_publications|INSERT INTO app_model_config_state)/.test(sql)) return { rows: [] };
      throw Error('UNEXPECTED_BOOTSTRAP_SQL');
    };
    const pool = { query, connect: async () => ({ query, release() {} }) };
    const repo = repoModule.createModelRepository({ pool, initialize: async tx => {
      initializations++;
      return bootstrap.bootstrapModelConfig({ tx, credentials: { importPlain: async () => { credentialImports++; return { id: '12345678-1234-4234-8234-123456789abc' }; } }, sources: {
        image: { baseUrl: 'https://provider.example/v1', apiKey: 'synthetic', models: ['fixture-image'], defaultModel: 'fixture-image', qualitySupported: false }, video: [],
      } });
    } });
    // Check the real bootstrap/schema directly before the repository wraps any
    // lower-level error into its deliberately redacted CONFIG_UNAVAILABLE.
    await bootstrap.bootstrapModelConfig({ credentials: { importPlain: async () => ({ id: '12345678-1234-4234-8234-123456789abc' }) }, sources: {
      image: { baseUrl: 'https://provider.example/v1', apiKey: 'synthetic', models: ['fixture-image'], defaultModel: 'fixture-image', qualitySupported: false }, video: [],
    } });
    const first = await repo.current(); assert.equal(first.config.providers[0].maxConcurrent, 4);
    active.config.providers[0].maxConcurrent = 13;
    active.config.upstreamModels[0].capabilities.maxReferenceImages = 0;
    active.config.upstreamModels[0].capabilities.expectedLatencyMs = 0;
    active.config.upstreamModels[0].capabilities.verified = false;
    active.config.publicModels[0].visible = false;
    active.config.providers.push({ ...active.config.providers[0], id: 'disabled-fixture', enabled: false, maxConcurrent: 7 });
    active.digest = repoModule.modelConfigDigest(schema.validateModelConfig(active.config));
    const before = structuredClone(active.config);
    for (let i = 0; i < 3; i++) assert.deepEqual(plain((await repo.current()).config), plain(before));
    assert.equal(initializations, 1); assert.equal(credentialImports, 1);
    // Zero is meaningful for capability fields, not a valid provider concurrency.
    const invalid = structuredClone(before); invalid.providers[0].maxConcurrent = 0;
    assert.throws(() => schema.validateModelConfig(invalid));
  });
  const combined = await import(pathToFileURL(sourceFile('scripts/video-worker-with-media.mjs')).href);
  const env = { NAUMI_MEDIA_WORKER: '1', NAUMI_WORKER_RELEASE_CONTROL: '1', VIDEO_WORKER_SECRET: 'synthetic-scanner-secret-at-least-32', MEDIA_WORKER_SECRET: 'synthetic-media-secret-at-least-32', SOURCE_COMMIT: 'b'.repeat(40), NAUMI_WORKER_STATE_FILE: '/release-state/worker.json' };
  const plan = e => combined.combinedWorkerPlan(e, { platform: 'linux', uid: 0, pid: 1 });
  await test('combined-single-media-protocol-remains-enforced', async () => {
    assert.throws(() => plan({ ...env, MEDIA_WORKER_CONCURRENCY: '2' }), /SINGLE_MEDIA_JOB/);
    assert.equal(plan(env).media.env.MEDIA_WORKER_CONCURRENCY, '1');
    assert.throws(() => combined.verifiedMediaHealth({ ok: true, sandbox: true, version: env.SOURCE_COMMIT, draining: false, running: 0, queued: 0, terminal: 0, maxActive: 8, concurrency: 2 }, env.SOURCE_COMMIT), /HEALTH_INVALID/);
  });
  await test('combined-reviewed-libuv-reaches-real-child-without-secret-copy', async () => {
    const p = plan({ ...env, NAUMI_NATIVE_MEMORY_PROFILE: 'bounded', UV_THREADPOOL_SIZE: '2', MALLOC_ARENA_MAX: '2', DATABASE_URL: 'synthetic-never-forward' });
    for (const child of [p.scanner, p.media]) {
      const windows = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(key.toUpperCase())));
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', 'console.log(JSON.stringify({uv:process.env.UV_THREADPOOL_SIZE,arena:process.env.MALLOC_ARENA_MAX,db:!!process.env.DATABASE_URL,options:!!process.env.NODE_OPTIONS}))'], { env: { ...windows, ...child.env }, encoding: 'utf8', timeout: 5000, windowsHide: true });
      assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), { uv: '2', arena: '2', db: false, options: false });
    }
  });
  await test('combined-invalid-cadence-fails-before-spawn', async () => {
    for (const value of ['abc', '0', '4999', '2147483648']) assert.throws(() => plan({ ...env, VIDEO_WORKER_INTERVAL_MS: value }), /WORKER_INTERVAL/);
    assert.equal(plan({ ...env, VIDEO_WORKER_INTERVAL_MS: '9000' }).scanner.env.VIDEO_WORKER_INTERVAL_MS, '9000');
  });
  console.log(`CAPACITY_RUNTIME_SETTINGS passed=${passed} failed=${failed}`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error('HARNESS_ERROR:' + error.message); process.exitCode = 2; });
