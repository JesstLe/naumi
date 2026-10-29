/* Isolated PostgreSQL integration: real repository, durable jobs, gateway and
 * billing implementation. Only unrelated app adapters and supplier callbacks
 * are fixtures. No .env loader and no production DATABASE_URL access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || root);
const mode = process.argv[3] || 'modified';
const wallClock = process.argv[4] === '--wall-clock';
assert.ok(['baseline', 'modified'].includes(mode));
const url = new URL(process.env.NAUMI_X2_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/naumi_x2_isolated');
assert.equal(url.username, 'x2_fixture');
assert.equal(url.port, '55432');
const pool = new Pool({ connectionString: url.href, ssl: false, max: 5, application_name: 'naumi-x2-isolated' });
const control = new Pool({ connectionString: url.href, ssl: false, max: 2 });
pool.on('error', () => {});
let time = 0, sequence = 0;
const timers = new Map();
function timer(fn, ms, interval) { const id = ++sequence; timers.set(id, { fn, at: time + ms, interval }); return { id, unref() {} }; }
function clear(t) { timers.delete(t?.id); }
async function drain() { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); }
async function advance(ms) {
  const end = time + ms;
  while (true) {
    const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    const [id, t] = next; time = t.at;
    if (t.interval) t.at += t.interval; else timers.delete(id);
    await t.fn(); await drain();
  }
  time = end; await drain();
}
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function until(fn, label) {
  const end = performance.now() + 5000;
  while (!await fn()) { if (performance.now() > end) throw Error('Timed out: ' + label); await new Promise(r => setTimeout(r, 5)); }
}
let renewalFaults = 0, renewalAttempts = 0, afterSave;
const rawConnect = pool.connect.bind(pool);
// Terminate only this explicitly local fixture's newly acquired backend.
async function killedQuery(sql, args) {
  const c = await rawConnect(); c.on('error', () => {});
  try { await control.query('SELECT pg_terminate_backend($1)', [c.processID]); await c.query(sql, args); }
  finally { c.release(true); }
}
function isRenew(sql) { return /UPDATE app_image_jobs SET lease_until=/.test(sql); }
const db = {
  dbEnabled: true, ensureSchema: async () => {}, creditMeteringEnabled: async () => true,
  expireDueBatches: async () => {}, refreshBalance: async () => {},
  getPool: () => ({
    async query(sql, args) {
      if (isRenew(sql)) { renewalAttempts++; if (renewalFaults-- > 0) return killedQuery(sql, args); }
      return pool.query(sql, args);
    },
    async connect() {
      const c = await rawConnect();
      let broken = false; const onError = () => { broken = true; }; c.on('error', onError);
      return { release: () => { c.removeListener('error', onError); c.release(broken); }, async query(sql, args) {
        if (isRenew(sql)) {
          renewalAttempts++;
          if (renewalFaults-- > 0) { broken = true; await control.query('SELECT pg_terminate_backend($1)', [c.processID]); }
        }
        const result = await c.query(sql, args);
        // Controlled dispatch gap: checkpoint commit succeeded, then lease lost.
        if (sql === 'COMMIT' && afterSave?.armed) { const hook = afterSave; afterSave = undefined; await hook.run(); }
        return result;
      }};
    },
  }),
};
const proofs = {};
const scope = { connection: { protocol: 'openai-images', wireModel: 'fixture' }, frozen: { publicModelId: 'fixture' } };
let acceptedReads = 0, creationEnabled = false, evidenceCalls = 0, evidenceFails = false;
const noCreation = { currentCreationContext: () => creationEnabled ? {} : undefined, withFrozenCreation: (_c, fn) => fn() };
const mocks = {
  'db': db,
  'saas/creation-context': noCreation,
  'saas/creation-writer': { acceptCreationTx: async () => null, creationLinkTx: async () => {}, recordImageStateTx: async () => { evidenceCalls++; if (evidenceFails) throw Error('fixture-evidence-outage'); }, attachBillingCreationTx: async () => {} },
  'release-runtime/background-activity': { withBackgroundActivity: (_a, _b, _c, fn) => fn(), detachBackgroundActivity: (_a, _b, _c, fn) => fn(), bindBackgroundClaim: async () => {} },
  'release-runtime/identity': { releaseRuntimeEnabled: () => true },
  'storage': { uploadImage: async () => { throw Error('Unexpected storage call'); }, readManagedObject: async () => { throw Error('Unexpected storage read'); } },
  'settings-secret': { workerSecret: () => 'fixture' },
  'settings': { getOpenAISettings: async () => ({ apiKey: 'fixture' }) },
  'openai-base': { getOpenAIBaseUrl: async () => 'http://fixture.invalid' },
  'bi/model-observer': { withBiModelContext: (_e, _k, _i, fn) => fn() },
  'model-config/context': { currentExecutionBundle: () => undefined, currentModelExecution: () => scope, runLegacyModelExecution: fn => fn() },
  'model-config/execution': { withFrozenExecutionBundle: (_b, fn) => fn() },
  'model-config/channel-availability': { acceptedImageOperationIdentities: async (_p, _s, id) => proofs[id] || {}, withAcceptedImageRead: (_id, fn) => { acceptedReads++; return fn(); } },
  'model-config/apimart-image-policy': { queryableImageScope: () => false },
};
const cache = new Map();
const context = vm.createContext({ console, process: { env: { NAUMI_IMAGE_JOB_CONCURRENCY_SUITE: '64' } }, Buffer, URL, Request, AbortController, AbortSignal, structuredClone,
  performance: wallClock ? performance : { now: () => time }, Date, Error, setImmediate,
  setInterval: wallClock ? setInterval : (fn, ms) => timer(fn, ms, ms), clearInterval: wallClock ? clearInterval : clear,
  setTimeout: wallClock ? setTimeout : (fn, ms) => timer(fn, ms), clearTimeout: wallClock ? clearTimeout : clear });
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.json') ? 'json' : 'ts', format: 'cjs', target: 'node20' }).code;
  const req = spec => {
    if (spec === 'server-only') return {};
    let p;
    if (spec.startsWith('@/lib/')) p = spec.slice(6);
    else if (spec.startsWith('.')) p = path.relative(path.join(root, 'src/lib'), path.resolve(path.dirname(file.startsWith(source) && source !== root ? file.replace(source, root) : file), spec)).replaceAll('\\', '/');
    else return require(spec);
    if (mocks[p]) return mocks[p];
    for (const ext of ['', '.ts', '.json']) {
      const candidate = path.resolve(source, 'src/lib', p + ext), fallback = path.resolve(root, 'src/lib', p + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
      if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) return load(fallback);
    }
    throw Error('Unresolved ' + spec + ' from ' + file);
  };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(req, module, module.exports);
  return module.exports;
}
const repo = load(path.join(source, 'src/lib/image-job-repository.ts'));
const { DurableImageJobs } = load(path.join(source, 'src/lib/durable-image-jobs.ts'));
const gateway = load(path.join(root, 'src/lib/image-gateway.ts'));
const jobs = new DurableImageJobs('suite');
const q = { schemaVersion: 1, engineVersion: 1, configVersion: 1, facts: { feature: 'image.generate', quantity: 1, quality: 'medium', resolution: '1K', metered: true, byok: false },
  tariff: { enabled: true, unit: 'image', pricing: { mode: 'fixed', credits: 6 }, settlement: { unknown: 'hold', qualityBasis: 'requested', successBasis: 'successful-units', failureBps: 0, byokBps: 10000, reserveBps: 10000 } },
  costRates: {}, reserveCredits: 6, requestedCredits: 6, authorizedCredits: 6, matchedRuleId: null };
const okResult = { state: 'succeeded', items: [{ id: 'image', state: 'succeeded' }] };
async function create(id, snapshot = {}) { await repo.createImageJob(id, 'fixture@example.test', 'suite', { status: 'pending', paidOperationVersion: 1, createdAt: Date.now(), ...snapshot }, {}, 6, true, q); }
async function expire(id) { await control.query("UPDATE app_image_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [id]); }
async function row(id) { return (await pool.query('SELECT * FROM app_image_jobs WHERE id=$1', [id])).rows[0]; }
async function blocked(fn) { try { await fn(); return false; } catch { return true; } }
const observations = {};
async function main() {
  await control.query(`
    DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE app_users(email text PRIMARY KEY,credits_used int NOT NULL DEFAULT 0,credits_total int NOT NULL DEFAULT 100);
    CREATE TABLE app_credit_batches(id text PRIMARY KEY,email text,amount int,remaining int,expired bool DEFAULT false,created_at timestamptz DEFAULT now(),expires_at timestamptz);
    CREATE TABLE app_ledger(id text PRIMARY KEY,email text,delta int,reason text,kind text);
    CREATE TABLE app_gen_reservations(job_id text PRIMARY KEY,email text,cost int);
    CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,quote jsonb,request_fingerprint text,state text,ledger_id text UNIQUE,reserved_credits int DEFAULT 0,charged_credits int DEFAULT 0,settlement_result jsonb,result_response jsonb,updated_at timestamptz DEFAULT now());
    CREATE TABLE app_billing_reconciliations(id text PRIMARY KEY,operation_id text,email text,actor text,request_fingerprint text,reason text,proof text,result jsonb,charge int);
    CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,cost int,metered bool,reserved_cost int DEFAULT 0,billing_settled bool DEFAULT false,lease_token text,lease_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    INSERT INTO app_users(email) VALUES('fixture@example.test');
    INSERT INTO app_credit_batches(id,email,amount,remaining,expires_at) VALUES('fixture','fixture@example.test',1000,1000,now()+interval '1 day');
  `);
  if (wallClock) {
    assert.equal(mode, 'modified');
    await create('wall-clock-280s'); renewalFaults = 1;
    const begun = performance.now(); let done = false;
    const task = jobs.kick('wall-clock-280s', async () => { await new Promise(r => setTimeout(r, 280000)); done = true; });
    await new Promise(r => setTimeout(r, 125000));
    assert.equal(await repo.claimImageJob('wall-clock-280s', 'suite'), null);
    console.log('WALL_CLOCK_125S second_claim=null;one_real_backend_terminated');
    await new Promise(r => setTimeout(r, 150000));
    assert.equal(done, false); assert.equal(await repo.claimImageJob('wall-clock-280s', 'suite'), null);
    await task;
    assert.ok(done && renewalAttempts >= 10);
    console.log(JSON.stringify({ wallClock: true, elapsedMs: Math.round(performance.now() - begun), renewalAttempts, supplierCalls: 0, secondClaims: 0 }));
    console.log('X2_WALL_CLOCK_280S=PASS'); return;
  }
  // One backend loss: execute the actual 25s heartbeat and wait >280 virtual s.
  await create('transient');
  const entered = gate(), release = gate();
  const running = jobs.kick('transient', async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const ttl = Number((await pool.query("SELECT extract(epoch FROM (lease_until-clock_timestamp())) AS ttl FROM app_image_jobs WHERE id='transient'")).rows[0].ttl);
  assert.ok(ttl > 115 && ttl <= 120);
  const startAttempts = renewalAttempts; renewalFaults = 1;
  await advance(25000); await until(() => renewalAttempts > startAttempts, 'first renewal'); await drain();
  await new Promise(r => setTimeout(r, 40));
  await advance(26000); await new Promise(r => setTimeout(r, 40)); await advance(25000);
  observations.heartbeatRecovered = renewalAttempts > startAttempts + 1;
  if (observations.heartbeatRecovered) { for (let i = 0; i < 10; i++) { await advance(25000); await new Promise(r => setTimeout(r, 10)); } }
  observations.longTaskSecondClaim = !!await repo.claimImageJob('transient', 'suite');
  assert.equal(observations.heartbeatRecovered, mode === 'modified');
  assert.equal(observations.longTaskSecondClaim, false);
  release.resolve(); await running;
  // Two owners contend; token fencing already protects normal late writes.
  await create('owners');
  const claims = await Promise.all([repo.claimImageJob('owners', 'suite'), repo.claimImageJob('owners', 'suite')]);
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find(Boolean); await expire('owners');
  const second = await repo.claimImageJob('owners', 'suite'); assert.ok(second);
  observations.oldWriteBlocked = await blocked(() => repo.saveImageJob('owners', { status: 'done', stale: true }, first.lease_token));
  observations.oldSettlementBlocked = await blocked(() => repo.settleImageJob('owners', okResult, 'fixture', first.lease_token));
  assert.ok(observations.oldWriteBlocked && observations.oldSettlementBlocked);
  await repo.releaseImageJob('owners', first.lease_token); assert.equal((await row('owners')).lease_token, second.lease_token);
  // A row lock held beyond expiry exposes transaction-start now() fencing.
  await create('lock-wait'); const lockedOwner = await repo.claimImageJob('lock-wait', 'suite');
  await control.query("UPDATE app_image_jobs SET lease_until=clock_timestamp()+interval '600 milliseconds' WHERE id='lock-wait'");
  const locker = await control.connect(); await locker.query('BEGIN'); await locker.query("SELECT id FROM app_image_jobs WHERE id='lock-wait' FOR UPDATE");
  const lateWrite = blocked(() => repo.saveImageJob('lock-wait', { status: 'pending', late: true }, lockedOwner.lease_token));
  await new Promise(r => setTimeout(r, 900)); await locker.query('COMMIT'); locker.release();
  observations.expiredLockWaitWriteBlocked = await lateWrite;
  assert.equal(observations.expiredLockWaitWriteBlocked, mode === 'modified');
  // An UPDATE queued behind a row lock must not resurrect an expired lease.
  await create('renew-wait'); const renewOwner = await repo.claimImageJob('renew-wait', 'suite');
  await control.query("UPDATE app_image_jobs SET lease_until=clock_timestamp()+interval '600 milliseconds' WHERE id='renew-wait'");
  const renewLock = await control.connect(); await renewLock.query('BEGIN'); await renewLock.query("SELECT id FROM app_image_jobs WHERE id='renew-wait' FOR UPDATE");
  const lateRenewal = blocked(() => repo.heartbeatImageJob('renew-wait', renewOwner.lease_token));
  await new Promise(r => setTimeout(r, 900)); await renewLock.query('COMMIT'); renewLock.release();
  observations.expiredLockWaitRenewalBlocked = await lateRenewal;
  assert.equal(observations.expiredLockWaitRenewalBlocked, mode === 'modified');
  // The job is locked, but settlement can still wait on a different wallet row.
  await create('wallet-wait'); const walletOwner = await repo.claimImageJob('wallet-wait', 'suite');
  await control.query("UPDATE app_image_jobs SET lease_until=clock_timestamp()+interval '600 milliseconds' WHERE id='wallet-wait'");
  const walletLock = await control.connect(); await walletLock.query('BEGIN'); await walletLock.query("SELECT email FROM app_users WHERE email='fixture@example.test' FOR UPDATE");
  const lateSettlement = blocked(() => repo.settleImageJob('wallet-wait', okResult, 'wallet wait', walletOwner.lease_token));
  await new Promise(r => setTimeout(r, 900)); await walletLock.query('COMMIT'); walletLock.release();
  observations.expiredWalletWaitSettlementBlocked = await lateSettlement;
  assert.equal(observations.expiredWalletWaitSettlementBlocked, mode === 'modified');
  await create('hold-fence'); const holdOld = await repo.claimImageJob('hold-fence', 'suite'); await expire('hold-fence');
  await repo.claimImageJob('hold-fence', 'suite');
  observations.oldOwnerHoldBlocked = await blocked(() => repo.holdImageJobBilling('hold-fence', holdOld.lease_token));
  assert.equal(observations.oldOwnerHoldBlocked, mode === 'modified');
  // No owner: baseline can commit intent on an expired row then call supplier.
  await create('ownerless'); const orphan = await repo.claimImageJob('ownerless', 'suite'); await expire('ownerless');
  let unownedCalls = 0;
  await blocked(() => jobs.paidOperation('ownerless', 'fixture', { id: 'ownerless', managedGateway: false }, async () => { unownedCalls++; return 'pixels'; }));
  observations.ownerlessSupplierCalls = unownedCalls;
  assert.equal(unownedCalls, mode === 'modified' ? 0 : 1);
  // Lose lease immediately after committed paid intent, before run callback.
  await create('dispatch-gap'); let gapCalls = 0;
  await jobs.kick('dispatch-gap', async () => {
    afterSave = { armed: true, run: () => expire('dispatch-gap') };
    await blocked(() => jobs.paidOperation('dispatch-gap', 'fixture', { id: 'dispatch-gap', managedGateway: false }, async () => { gapCalls++; return 'late-pixels'; }));
  });
  observations.expiredDispatchCalls = gapCalls;
  assert.equal(gapCalls, mode === 'modified' ? 0 : 1);
  await create('child-gap'); let childGapCalls = 0;
  await jobs.kick('child-gap', async () => {
    await blocked(() => jobs.paidOperation('child-gap', 'fixture', { id: 'child-gap' }, async () => {
      afterSave = { armed: true, run: () => expire('child-gap') };
      return gateway.withImageIndex('fixture', 0, async () => { childGapCalls++; return 'late-child'; });
    }));
  });
  observations.expiredChildDispatchCalls = childGapCalls;
  assert.equal(childGapCalls, mode === 'modified' ? 0 : 1);
  // Evidence writes are subordinate too: a stale owner must not publish them.
  await create('evidence'); const evidenceOwner = await repo.claimImageJob('evidence', 'suite');
  creationEnabled = true; evidenceFails = true;
  await repo.saveImageJob('evidence', { status: 'pending', checkpoint: 'kept' }, evidenceOwner.lease_token);
  assert.equal((await row('evidence')).snapshot.creationEvidencePending, true);
  const evidenceBefore = evidenceCalls;
  afterSave = { armed: true, run: async () => {
    await expire('evidence'); const other = await repo.claimImageJob('evidence', 'suite');
    await control.query("UPDATE app_image_jobs SET snapshot='{\"status\":\"pending\",\"newOwner\":true}'::jsonb WHERE id='evidence'");
    assert.ok(other);
  }};
  await repo.saveImageJob('evidence', { status: 'pending', checkpoint: 'old' }, evidenceOwner.lease_token);
  observations.staleEvidenceCalls = evidenceCalls - evidenceBefore;
  assert.equal(observations.staleEvidenceCalls, mode === 'modified' ? 0 : 1);
  assert.equal(!!(await row('evidence')).snapshot.creationEvidencePending, mode === 'baseline');
  assert.equal((await row('evidence')).snapshot.newOwner, true); creationEnabled = false; evidenceFails = false;
  // Same-owner duplicate operation calls serialize their intent CAS.
  await create('same-op'); let sameOpCalls = 0;
  await jobs.kick('same-op', async () => {
    const results = await Promise.allSettled([0, 1].map(() => jobs.paidOperation('same-op', 'fixture', { id: 'same-op' }, async () => { sameOpCalls++; return 'same-pixels'; })));
    assert.ok(results.some(r => r.status === 'fulfilled'));
  });
  assert.equal(sameOpCalls, 1); observations.sameOperationDispatches = sameOpCalls;
  // Sustained backend losses end the local authority, without failure billing.
  await create('persistent'); const persistentEntered = gate(), persistentRelease = gate();
  let persistentBlocked = false;
  const persistentRun = jobs.kick('persistent', async () => {
    persistentEntered.resolve(); await persistentRelease.promise;
    persistentBlocked = await blocked(() => jobs.patch('persistent', { oldOwner: true }));
  });
  await persistentEntered.promise;
  renewalFaults = 100;
  for (let i = 0; i < 13; i++) { await advance(10000); await new Promise(r => setTimeout(r, 10)); }
  await expire('persistent'); const recoveredOwner = await repo.claimImageJob('persistent', 'suite'); assert.ok(recoveredOwner);
  persistentRelease.resolve(); await persistentRun; renewalFaults = 0;
  assert.ok(persistentBlocked); assert.equal((await row('persistent')).billing_settled, false);
  assert.equal((await pool.query("SELECT cost FROM app_gen_reservations WHERE job_id='persistent'")).rows[0].cost, 6);
  observations.sustainedFailure = 'old-write-blocked;reservation-held;new-owner-only';
  // Existing checkpoint recovery returns pixels without paying again.
  await create('checkpoint', { paidOperations: { checkpoint: { model: 'fixture', state: 'done', result: 'stored-pixels' } } });
  let recovered, replayCalls = 0;
  await jobs.kick('checkpoint', async () => { recovered = await jobs.paidOperation('checkpoint', 'fixture', { id: 'checkpoint' }, async () => { replayCalls++; }); });
  assert.equal(recovered, 'stored-pixels'); assert.equal(replayCalls, 0);
  observations.checkpointReplayCalls = replayCalls;
  // Unknown never authorizes POST; confirmed accepted identity uses read seam.
  await create('unknown', { paidOperations: { unknown: { model: 'fixture', state: 'started', replayable: false } } });
  let unknownCalls = 0;
  await jobs.kick('unknown', async () => { assert.ok(await blocked(() => jobs.paidOperation('unknown', 'fixture', { id: 'unknown' }, async () => { unknownCalls++; }))); });
  assert.equal(unknownCalls, 0); observations.unknownReplayCalls = unknownCalls;
  await create('accepted', { paidOperations: { accepted: { model: 'fixture', state: 'started', replayable: true } } }); proofs.accepted = { accepted: 'fixture-task-id' };
  await jobs.kick('accepted', async () => { const result = await jobs.paidOperation('accepted', 'fixture', { id: 'accepted' }, async () => 'accepted-pixels'); assert.equal(result, 'accepted-pixels'); });
  assert.equal(acceptedReads, 1); observations.acceptedReadRecoveries = acceptedReads;
  // Accepted child checkpoints preserve successful siblings through recovery.
  await create('children'); let child0Calls = 0, child1Calls = 0;
  const childRun = () => gateway.withImageIndex('fixture', 0, async () => { child0Calls++; return 'child-0'; });
  await jobs.kick('children', async () => {
    assert.ok(await blocked(() => jobs.paidOperation('children', 'fixture', { id: 'children' }, async () => {
      await childRun();
      return gateway.withImageIndex('fixture', 1, async () => { child1Calls++; throw new gateway.ImageOperationPending('children:image:1', Error('accepted-but-disconnected')); });
    })));
  });
  assert.equal((await row('children')).snapshot.paidOperations.children.children['children:image:0'].state, 'done');
  proofs.children = { 'children:image:1': 'frozen-child-task' };
  await expire('children');
  await jobs.kick('children', async () => {
    const result = await jobs.paidOperation('children', 'fixture', { id: 'children' }, async () => {
      const first = await childRun();
      return [first, await gateway.withImageIndex('fixture', 1, async () => 'child-1')];
    });
    assert.equal(JSON.stringify(result), '["child-0","child-1"]');
    await jobs.settle('children', okResult, 'child recovery');
  });
  assert.equal(child0Calls, 1); assert.equal(child1Calls, 1);
  observations.childCheckpoint = 'sibling-reused;accepted-child-read;one-original-dispatch';
  // Late old owner's completed response cannot overwrite the new owner's result.
  await create('late-result'); const lateEntered = gate(), lateRelease = gate(); let oldLateBlocked = false;
  const lateRun = jobs.kick('late-result', async () => {
    oldLateBlocked = await blocked(() => jobs.paidOperation('late-result', 'fixture', { id: 'late-result' }, async () => { lateEntered.resolve(); await lateRelease.promise; return 'old-pixels'; }));
  });
  await lateEntered.promise; await expire('late-result'); proofs['late-result'] = { 'late-result': 'accepted-original-task' };
  await jobs.kick('late-result', async () => {
    assert.equal(await jobs.paidOperation('late-result', 'fixture', { id: 'late-result' }, async () => 'new-owner-original-pixels'), 'new-owner-original-pixels');
    await jobs.settle('late-result', okResult, 'original accepted recovery');
  });
  lateRelease.resolve(); await lateRun;
  assert.ok(oldLateBlocked); assert.equal((await row('late-result')).snapshot.paidOperations['late-result'].result, 'new-owner-original-pixels');
  observations.lateResult = 'new-owner-checkpoint-preserved;old-owner-blocked';
  // Failed accepted recovery remains started/unknown; no replacement paid call.
  await create('recover-failed', { paidOperations: { 'recover-failed': { model: 'fixture', state: 'started', replayable: true } } });
  proofs['recover-failed'] = { 'recover-failed': 'accepted-task-failed-query' };
  await jobs.kick('recover-failed', async () => {
    assert.ok(await blocked(() => jobs.paidOperation('recover-failed', 'fixture', { id: 'recover-failed' }, async () => { throw new gateway.ImageOperationPending('recover-failed', Error('query-failed')); })));
  });
  assert.equal((await row('recover-failed')).snapshot.paidOperations['recover-failed'].state, 'started');
  assert.equal((await pool.query("SELECT state FROM app_billing_operations WHERE id='recover-failed'")).rows[0].state, 'hold');
  observations.failedRecovery = 'started-retained;billing-hold';
  // Same operation concurrent settlement: real PG locks, billing implementation.
  await Promise.all(Array.from({ length: 8 }, () => repo.settleImageJob('owners', okResult, 'fixture', second.lease_token)));
  const ledger = (await pool.query("SELECT count(*)::int AS n,sum(delta)::int AS delta FROM app_ledger WHERE id='led-image-owners'")).rows[0];
  assert.deepEqual(ledger, { n: 1, delta: -6 });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_gen_reservations WHERE job_id='owners'")).rows[0].n, 0);
  observations.settlement = ledger;
  if (mode === 'modified') {
    const { startImageJobHeartbeat } = load(path.join(source, 'src/lib/image-job-lease.ts'));
    // A hung renewal uses no extra connection; expiry still fences callbacks.
    const hung = gate(); let renews = 0;
    const heart = startImageJobHeartbeat(async () => { renews++; await hung.promise; }, time);
    const ticking = advance(25000); await drain();
    // advance() awaits the callback, so expire independently of the hung query.
    time += 120000;
    assert.throws(() => heart.assertActive(), /任务执行权已过期/);
    hung.resolve(); await ticking;
    assert.throws(() => heart.assertActive(), /任务执行权已过期/);
    assert.equal(renews, 1); heart.stop();
    observations.hungRenewal = 'single-flight;deadline-fenced;late-success-not-resurrected';
    await create('detached'); const detached = gate(); let detachedResult;
    await jobs.kick('detached', async () => { detachedResult = detached.promise.then(() => blocked(() => jobs.patch('detached', { afterFinish: true }))); });
    detached.resolve(); assert.equal(await detachedResult, true);
    observations.detachedWrite = 'stopped-context-fenced';
  }
  const final = (await pool.query("SELECT (SELECT sum(remaining)::int FROM app_credit_batches) AS principal,(SELECT sum(delta)::int FROM app_ledger WHERE kind='consume') AS charged,(SELECT count(*)::int FROM app_ledger WHERE kind='consume') AS charges,(SELECT credits_used FROM app_users WHERE email='fixture@example.test') AS reserved,(SELECT sum(cost)::int FROM app_gen_reservations) AS reservations")).rows[0];
  assert.equal(final.principal, mode === 'modified' ? 982 : 976); assert.equal(final.charged, mode === 'modified' ? -18 : -24); assert.equal(final.charges, mode === 'modified' ? 3 : 4); assert.equal(final.reserved, final.reservations);
  observations.wallet = final;
  console.log(JSON.stringify({ mode, evidence: 'isolated-postgresql-real-implementation; supplier/adapters-fixture; virtual-heartbeat-clock', ...observations }));
  console.log(`X2_${mode.toUpperCase()}=PASS`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { timers.clear(); await pool.end(); await control.end(); });
