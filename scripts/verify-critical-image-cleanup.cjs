/* A60: real local repository/durable/lease/billing modules and one exclusive PG.
 * No env loader, external DB, provider, HTTP, storage, or production access.
 * The release adapter awaits the detached action so its original thrown value
 * is observable; timers/creation writer/unrelated model adapters are fixtures. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { Pool } = require('pg'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), source = path.resolve(process.argv[2] || root);
const mode = process.argv[3] || 'modified';
assert(['baseline', 'candidate', 'modified'].includes(mode));
const baseline = mode === 'baseline', label = 'a60-' + randomUUID();
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let container, fixturePort, pool, control, refused, checks = 0, clock = 0, timerId = 0;
const timers = new Map(), logs = [], metrics = { releases: 0, connections: 0, returned: 0, discarded: 0, runs: 0 };
let creation = false, evidenceFault = false, checkoutFault = false, bindFault, rollbackFault = false;
let primaryFault, primaryArmed = false, primaryObserved, killBeforeRollback = false, lastClient;
let faultPoint = 'SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE';
let nativeEvidence = false, inheritedPending = false, afterCheckpoint;
const capture = (...items) => logs.push(items.map(String).join(' '));
const rawConsole = { error: capture, warn: capture, log: capture };
const stages = name => logs.filter(line => line.includes('stage=' + name + ' '));
function clearFaults() {
  clock += 60001; logs.length = 0; creation = evidenceFault = checkoutFault = rollbackFault = primaryArmed = killBeforeRollback = false;
  bindFault = primaryFault = primaryObserved = undefined;
  nativeEvidence = inheritedPending = false; afterCheckpoint = undefined;
  faultPoint = 'SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE';
}
const db = {
  dbEnabled: true, ensureSchema: async () => {}, creditMeteringEnabled: async () => true,
  expireDueBatches: async () => {}, refreshBalance: async () => {},
  getPool: () => ({
    async query(sql, values) {
      if (sql.startsWith('UPDATE app_image_jobs SET lease_token=NULL')) metrics.releases++;
      return pool.query(sql, values);
    },
    async connect() {
      if (checkoutFault && creation && metrics.connections > checkoutFault) return refused.connect();
      const c = await pool.connect(); metrics.connections++; lastClient = c;
      // Deliberately do NOT add a harness error listener to the borrowed client.
      // The implementation owns its listener and its discard decision.
      return {
        on: (event, listener) => c.on(event, listener),
        removeListener: (event, listener) => c.removeListener(event, listener),
        release(discard) { metrics.returned++; if (discard) metrics.discarded++; c.release(discard); },
        async query(sql, values) {
          if (primaryArmed && sql.startsWith(faultPoint)) {
            primaryArmed = false;
            if (primaryFault === 'sql' || primaryFault === 'cancel') {
              try {
                if (primaryFault === 'cancel') { await c.query("SET LOCAL statement_timeout='15ms'"); return await c.query('SELECT pg_sleep(1)'); }
                return await c.query('SELECT 1/0');
              } catch (e) { primaryObserved = e; throw e; }
            }
            primaryObserved = primaryFault; throw primaryFault;
          }
          if (sql === 'ROLLBACK' && rollbackFault) {
            rollbackFault = false;
            if (killBeforeRollback) {
              await control.query('SELECT pg_terminate_backend($1)', [c.processID]);
              await new Promise(r => setTimeout(r, 25));
              return c.query(sql);
            }
            // A real PG statement failure at the rollback seam leaves this
            // session aborted, not known-clean. Never fake the PG error/result.
            return c.query('SELECT 1/0');
          }
          const result = await c.query(sql, values);
          if (sql === 'COMMIT' && afterCheckpoint) { const hook = afterCheckpoint; afterCheckpoint = undefined; await hook(); }
          return result;
        },
      };
    },
  }),
};
const mocks = {
  db,
  'saas/creation-context': { currentCreationContext: () => creation ? { evidencePending: inheritedPending } : undefined, withFrozenCreation: (_c, fn) => fn() },
  'saas/creation-writer': {
    acceptCreationTx: async () => null, creationLinkTx: async () => {}, attachBillingCreationTx: async () => {},
    recordImageStateTx: async (tx, id, snapshot) => {
      if (evidenceFault === true) await tx.query('SELECT 1/0');
      let recorded;try{recorded=nativeEvidence?await load('src/lib/saas/creation-writer.ts').recordImageStateTx(tx,id,snapshot):undefined;}catch(error){console.log('NATIVE_WRITER_FIXTURE_DIAGNOSTIC='+String(error.message));throw error;}
      if (evidenceFault === 'after-write') await tx.query('SELECT 1/0');
      return recorded;
    },
    publicCreationParameters: value => load('src/lib/saas/creation-writer.ts').publicCreationParameters(value),
  },
  'billing/schema': { ensureBillingSchema: async () => {} },
  'teams/server': { TeamError: class TeamError extends Error { constructor(message, status) { super(message); this.status = status; } } },
  'enterprise/server': { enterpriseRead: async () => { throw Error('unexpected tenant boundary'); } },
  'bi/call-scope': { currentObservedCallId: () => undefined },
  'release-runtime/background-activity': {
    withBackgroundActivity: (_a, _b, _c, fn) => fn(), detachBackgroundActivity: (_a, _b, _c, fn) => fn(),
    bindBackgroundClaim: async () => { if (bindFault !== undefined) throw bindFault; },
  },
  'release-runtime/identity': { releaseRuntimeEnabled: () => true },
  storage: new Proxy({ isManagedImageUrl: url => url.startsWith('/media/') }, { get: (target, key) => target[key] || (async () => { throw Error('unexpected storage access'); }) }),
  'settings-secret': { workerSecret: () => 'fixture' },
  settings: { getOpenAISettings: async () => ({ apiKey: 'fixture' }) },
  'openai-base': { getOpenAIBaseUrl: async () => 'http://fixture.invalid' },
  'bi/model-observer': { withBiModelContext: (_e, _k, _i, fn) => fn() },
  'model-config/context': { currentExecutionBundle: () => undefined, currentModelExecution: () => undefined, runLegacyModelExecution: fn => fn() },
  'model-config/execution': { withFrozenExecutionBundle: (_b, fn) => fn() },
  'model-config/channel-availability': { acceptedImageOperationIdentities: async () => ({}), withAcceptedImageRead: (_id, fn) => fn() },
  'model-config/apimart-image-policy': { queryableImageScope: () => false },
};
Object.assign(mocks,{
 'persistence/schema':{ensureSchema:db.ensureSchema},
 'saas/creation-scope':mocks['saas/creation-context'],
 'saas/creation-access':{bindActualCreationProject:async()=>{}},
 'bi/context':mocks['bi/model-observer'],
 'billing/runtime':{creditMeteringEnabled:db.creditMeteringEnabled},
 'application/task-execution':{deferApplicationTask:async()=>false},
 'worker/inflight':{trackBackgroundWork:promise=>promise},
});
const cache = new Map();
const context = vm.createContext({ console: rawConsole, process: { env: {} }, Buffer, URL, Request, AbortController, AbortSignal, structuredClone,
  performance: { now: () => clock }, Date, Error, setImmediate,
  setTimeout(fn, ms) { const t = { id: ++timerId, unref() {} }; timers.set(t.id, { fn, ms }); return t; },
  clearTimeout: t => timers.delete(t?.id),
});
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const selected = path.join(source, relative), file = fs.existsSync(selected) ? selected : path.join(root, relative);
  const module = { exports: {} }; cache.set(relative, module);
  const code = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', target: 'node20', supported: { 'dynamic-import': false } }).code;
  const req = spec => {
    if (spec === 'server-only') return {};
    if(spec==='lucide-react')return new Proxy({},{get:()=>()=>null});
    if(spec==='@/platform/db/pool')return db;
    if(spec.startsWith('@/platform/'))return load('src/'+spec.slice(2)+'.ts');
    let p;
    if (spec.startsWith('@/lib/')) p = spec.slice(6);
    else if (spec.startsWith('.')) p = path.posix.normalize(path.posix.join(path.posix.dirname(relative), spec)).replace(/^src\/lib\//, '');
    else return require(spec);
    if (mocks[p]) return mocks[p];
    return load('src/lib/' + p + (p.endsWith('.ts') ? '' : '.ts'));
  };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(req, module, module.exports);
  return module.exports;
}
const quote = { schemaVersion: 1, engineVersion: 1, configVersion: 1,
  facts: { feature: 'image.generate', quantity: 1, quality: 'medium', resolution: '1K', metered: true, byok: false },
  tariff: { enabled: true, unit: 'image', pricing: { mode: 'fixed', credits: 6 }, settlement: { unknown: 'hold', qualityBasis: 'requested', successBasis: 'successful-units', failureBps: 0, byokBps: 10000, reserveBps: 10000 } },
  costRates: {}, reserveCredits: 6, requestedCredits: 6, authorizedCredits: 6, matchedRuleId: null };
const checkpoint = { root: { state: 'started', attemptToken: 'PRIVATE_NONCE', replayable: false, children: { child: { state: 'done', result: { marker: 'saved' } } } } };
let repo, jobs, lease;
const row = async id => (await control.query('SELECT * FROM app_image_jobs WHERE id=$1', [id])).rows[0];
async function invariant(id) {
  const r = await row(id);
  return JSON.stringify({ payload: r.payload, paid: r.snapshot.paidOperations, billing: (await control.query('SELECT * FROM app_billing_operations WHERE id=$1', [id])).rows,
    reservations: (await control.query('SELECT * FROM app_gen_reservations WHERE job_id=$1', [id])).rows,
    ledger: (await control.query('SELECT * FROM app_ledger ORDER BY id')).rows });
}
async function create(id, snapshot = {}) {
  await repo.createImageJob(id, 'fixture@example.test', 'suite', { status: 'pending', paidOperationVersion: 1, paidOperations: checkpoint, ...snapshot }, { nonce: 'PRIVATE_NONCE' }, 6, true, quote);
}
const setReleaseFault = on => control.query(on ? "INSERT INTO a60_faults VALUES('release') ON CONFLICT DO NOTHING" : "DELETE FROM a60_faults WHERE stage='release'");
async function outcome(fn) { try { return { value: await fn(), threw: false }; } catch (error) { return { error, threw: true }; } }
async function step(name, fn) {
  clearFaults(); await setReleaseFault(false); await fn(); assert.equal(timers.size, 0);
  // Earlier failure specimens deliberately retain leases. Retire only these
  // exclusive fixture leases between cases; do not inflate product concurrency.
  await setReleaseFault(false); await control.query('UPDATE app_image_jobs SET lease_token=NULL,lease_until=NULL');
  checks++; console.log('PASS ' + name);
}
async function tcp(port) { return new Promise(resolve => { const s = net.createConnection({ host: '127.0.0.1', port }); s.on('connect', () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); s.setTimeout(200, () => { s.destroy(); resolve(false); }); }); }
async function main() {
  try {
    container = docker(['run', '-d', '--name', label, '--label', 'naumi.fixture=' + label, '--memory', '256m', '--cpus', '1', '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_USER=a60_fixture', '-e', 'POSTGRES_PASSWORD=a60_local_only', '-e', 'POSTGRES_DB=a60_isolated', 'postgres:16-alpine']);
    const config = JSON.parse(docker(['inspect', container]))[0];
    assert.equal(config.Config.Labels['naumi.fixture'], label); assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024); assert.equal(config.HostConfig.NanoCpus, 1000000000);
    const binding = config.NetworkSettings.Ports['5432/tcp'][0]; assert.equal(binding.HostIp, '127.0.0.1');
    const port = fixturePort = Number(binding.HostPort), connectionString = `postgresql://a60_fixture:a60_local_only@127.0.0.1:${port}/a60_isolated`;
    console.log(`FIXTURE label=${label} port=${port} memory=256MiB cpus=1`);
    control = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000 });
    pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 1000 }); pool.on('error', () => {});
    const end = Date.now() + 30000;
    while (true) { if (await tcp(port)) { try { await control.query('SELECT 1'); break; } catch {} } assert(Date.now() < end, 'TCP/SQL readiness deadline'); await new Promise(r => setTimeout(r, 100)); }
    console.log('TCP_SQL_READY=PASS');
    const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const closedPort = server.address().port; await new Promise(r => server.close(r));
    refused = new Pool({ connectionString: `postgresql://a60_fixture:a60_local_only@127.0.0.1:${closedPort}/a60_isolated`, max: 1, connectionTimeoutMillis: 200 });
    await control.query(`
      CREATE TABLE app_users(email text PRIMARY KEY,credits_used int NOT NULL DEFAULT 0,credits_total int NOT NULL DEFAULT 100);
      CREATE TABLE app_credit_batches(id text PRIMARY KEY,email text,amount int,remaining int,expired bool DEFAULT false,created_at timestamptz DEFAULT now(),expires_at timestamptz);
      CREATE TABLE app_ledger(id text PRIMARY KEY,email text,delta int,reason text,kind text);
      CREATE TABLE app_gen_reservations(job_id text PRIMARY KEY,email text,cost int);
      CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,quote jsonb,request_fingerprint text,state text,ledger_id text UNIQUE,reserved_credits int DEFAULT 0,charged_credits int DEFAULT 0,settlement_result jsonb,result_response jsonb,updated_at timestamptz DEFAULT now());
      CREATE TABLE app_billing_reconciliations(id text PRIMARY KEY,operation_id text,email text,actor text,request_fingerprint text,reason text,proof text,result jsonb,charge int);
      CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,cost int,metered bool,reserved_cost int DEFAULT 0,billing_settled bool DEFAULT false,lease_token text,lease_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE a60_faults(stage text PRIMARY KEY);
      CREATE FUNCTION fail_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.lease_token IS NOT NULL AND NEW.lease_token IS NULL AND EXISTS(SELECT 1 FROM a60_faults WHERE stage='release') THEN PERFORM 1/0; END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER fail_release BEFORE UPDATE ON app_image_jobs FOR EACH ROW EXECUTE FUNCTION fail_release();
      INSERT INTO app_users(email) VALUES('fixture@example.test');
      INSERT INTO app_credit_batches(id,email,amount,remaining,expires_at) VALUES('fixture','fixture@example.test',10000,10000,now()+interval '1 day');
      INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES('original-paid-ledger','fixture@example.test',-6,'original-result','consume');
    `);
    repo = load('src/lib/image-job-repository.ts'); lease = load('src/lib/image-job-lease.ts');
    jobs = new (load('src/lib/image-jobs/runtime.ts').DurableImageJobs)('suite');
    await step('release SQL failure retains committed success and original paid identity', async () => {
      await create('success'); const before = await invariant('success'); await setReleaseFault(true);
      const result = await jobs.kick('success', async () => { metrics.runs++; await jobs.patch('success', { status: 'done' }); });
      assert.equal(result, undefined); const saved = await row('success'); assert.equal(saved.snapshot.status, 'done'); assert(saved.lease_token);
      assert.equal(await invariant('success'), before); assert.equal(await repo.claimImageJob('success', 'suite'), null);
      assert.equal(stages('lease-release').length, baseline ? 0 : 1); if (!baseline) assert(stages('lease-release')[0].includes('code=22012'));
      console.log(`RELEASE_SQLSTATE=22012 SUCCESS=done LEASE_RETAINED=1 DIAGNOSTICS=${stages('lease-release').length} REPLAY=0`);
    });
    await step('bind failure preserves original object and UNKNOWN hold, with no execution', async () => {
      await create('bind'); await control.query("UPDATE app_billing_operations SET state='hold' WHERE id='bind'"); const before = await invariant('bind');
      bindFault = { code: 'RELEASE_BIND_CONFLICT', private: 'PRIVATE_KEY' }; await setReleaseFault(true);
      const result = await outcome(() => jobs.kick('bind', async () => { throw Error('must not execute'); }));
      assert.equal(result.error, bindFault); assert.equal(await invariant('bind'), before); assert((await row('bind')).lease_token);
      assert.equal(stages('claim-release').length, baseline ? 0 : 1);
    });
    await step('postcommit evidence connection refusal does not reverse checkpoint', async () => {
      await create('evidence'); const r = await repo.claimImageJob('evidence', 'suite'), before = await invariant('evidence');
      creation = true; checkoutFault = metrics.connections; // Main checkout allowed, evidence checkout refused.
      const result = await outcome(() => repo.saveImageJob('evidence', { ...r.snapshot, receipt: 'committed' }, r.lease_token));
      assert.equal(result.threw, baseline); if (baseline) assert.equal(result.error.code, 'ECONNREFUSED');
      assert.equal((await row('evidence')).snapshot.receipt, 'committed'); assert.equal(await invariant('evidence'), before);
      assert.equal(stages('checkpoint-evidence').length, baseline ? 0 : 1);
      console.log(`EVIDENCE_CONNECT=ECONNREFUSED CHECKPOINT=committed CALL_REJECTED=${Number(result.threw)} DIAGNOSTICS=${stages('checkpoint-evidence').length}`);
    });
    await step('failure rollback keeps first SQL error and discards unclean session', async () => {
      await create('rollback'); const r = await repo.claimImageJob('rollback', 'suite'), before = await invariant('rollback');
      primaryFault = 'sql'; primaryArmed = rollbackFault = true; const discarded = metrics.discarded;
      const result = await outcome(() => repo.failUndeliveredImageJob('rollback', r.lease_token, 'image-worker-failed'));
      assert(result.threw); assert.equal(result.error === primaryObserved, !baseline); assert.equal(await invariant('rollback'), before);
      assert.equal(metrics.discarded - discarded, baseline ? 0 : 1);
      const check = await outcome(() => pool.query('SELECT 1')); assert.equal(check.threw, baseline);
      if (baseline) { assert.equal(check.error.code, '25P02'); await pool.query('ROLLBACK'); }
      console.log(`ROLLBACK_ORIGINAL_IDENTITY=${Number(result.error === primaryObserved)} DISCARD=${metrics.discarded - discarded} NEXT_QUERY_OK=${Number(!check.threw)}`);
    });
    if (!baseline) {
      await step('normal completion and duplicate same-owner claim execute once', async () => {
        await create('concurrent'); const before = await invariant('concurrent'); let runs = 0;
        await Promise.all(Array.from({ length: 8 }, () => jobs.kick('concurrent', async () => { runs++; await jobs.patch('concurrent', { status: 'done' }); })));
        assert.equal(runs, 1); assert.equal((await row('concurrent')).lease_token, null); assert.equal(await invariant('concurrent'), before); assert.equal(logs.length, 0);
      });
      await step('lease cancellation preserves UNKNOWN and reservation; no failure settlement', async () => {
        await create('cancel'); await control.query("UPDATE app_billing_operations SET state='hold' WHERE id='cancel'"); const before = await invariant('cancel');
        await jobs.kick('cancel', async () => { throw new lease.ImageJobLeaseLostError(); });
        assert.equal(await invariant('cancel'), before); assert.equal((await row('cancel')).snapshot.status, 'pending'); assert.equal((await row('cancel')).lease_token, null);
        assert.equal((await control.query("SELECT count(*)::int n FROM app_billing_reconciliations WHERE operation_id='cancel'")).rows[0].n, 0);
      });
      await step('evidence SQL savepoint failure is deferred and marked without changing success', async () => {
        await create('evidence-sql'); const r = await repo.claimImageJob('evidence-sql', 'suite'), before = await invariant('evidence-sql'); creation = evidenceFault = true;
        await repo.saveImageJob('evidence-sql', { ...r.snapshot, receipt: 'committed' }, r.lease_token);
        assert.equal((await row('evidence-sql')).snapshot.creationEvidencePending, true); assert.equal(await invariant('evidence-sql'), before);
        assert.equal(stages('checkpoint-evidence').length, 1);
      });
      for (const value of [new Error('PRIVATE_ERROR'), 'PRIVATE_THROWN', null, { secret: 'PRIVATE_OBJECT' }]) {
        await step('original thrown value survives failure cleanup rollback: ' + (value === null ? 'null' : typeof value), async () => {
          const id = 'identity-' + checks; await create(id); const r = await repo.claimImageJob(id, 'suite'), before = await invariant(id);
          primaryFault = value; primaryArmed = rollbackFault = true;
          const result = await outcome(() => repo.failUndeliveredImageJob(id, r.lease_token, 'image-worker-failed'));
          assert(result.threw); assert.equal(result.error, value); assert.equal(await invariant(id), before); await pool.query('SELECT 1');
          assert.equal(stages('failure-rollback').length, 1); assert(logs.every(x => !x.includes('PRIVATE')));
        });
      }
      await step('real borrowed connection termination is contained and returned once', async () => {
        await create('disconnect'); const r = await repo.claimImageJob('disconnect', 'suite'); const before = await invariant('disconnect');
        primaryFault = new Error('PRIVATE_ORIGINAL'); primaryArmed = rollbackFault = killBeforeRollback = true;
        const acquired = metrics.connections, returned = metrics.returned, discarded = metrics.discarded;
        const result = await outcome(() => repo.failUndeliveredImageJob('disconnect', r.lease_token, 'image-worker-failed'));
        assert.equal(result.error, primaryFault); assert.equal(metrics.connections - acquired, 1); assert.equal(metrics.returned - returned, 1); assert.equal(metrics.discarded - discarded, 1);
        // pg-pool reinstalls its own idleListener even when discarding. The
        // checked-out lifecycle listener alone must be removed by this module.
        assert(!lastClient.listeners('error').some(fn => fn.name === 'onError'));
        assert.equal(await invariant('disconnect'), before); await pool.query('SELECT 1');
      });
      await step('checkpoint main transaction keeps non-Error rejection and original data', async () => {
        await create('save-rollback'); const r = await repo.claimImageJob('save-rollback', 'suite'), before = JSON.stringify(await row('save-rollback'));
        faultPoint = 'COMMIT'; primaryFault = { sentinel: 'PRIVATE_PRIMARY' }; primaryArmed = rollbackFault = true;
        const result = await outcome(() => repo.saveImageJob('save-rollback', { ...r.snapshot, receipt: 'uncommitted' }, r.lease_token));
        assert.equal(result.error, primaryFault); await pool.query('SELECT 1'); assert.equal(JSON.stringify(await row('save-rollback')), before);
      });
      await step('postcommit evidence rollback failure is contained with original receipt intact', async () => {
        await create('evidence-rollback'); const r = await repo.claimImageJob('evidence-rollback', 'suite'), before = await invariant('evidence-rollback');
        creation = true; faultPoint = 'SAVEPOINT image_state_evidence'; primaryFault = new Error('PRIVATE_EVIDENCE'); primaryArmed = rollbackFault = true;
        await repo.saveImageJob('evidence-rollback', { ...r.snapshot, receipt: 'committed' }, r.lease_token);
        assert.equal((await row('evidence-rollback')).snapshot.receipt, 'committed'); assert.equal(await invariant('evidence-rollback'), before);
        assert.equal(stages('checkpoint-evidence').length, 1); assert.equal(stages('evidence-rollback').length, 1); await pool.query('SELECT 1');
      });
      await step('same-owner terminal failure concurrency releases only once; original contract retained', async () => {
        await create('terminal', { paidOperations: {} }); const r = await repo.claimImageJob('terminal', 'suite');
        const results = await Promise.all(Array.from({ length: 8 }, () => repo.failUndeliveredImageJob('terminal', r.lease_token, 'image-worker-failed')));
        assert.equal(results.filter(Boolean).length, 1); assert.equal((await row('terminal')).billing_settled, true);
        assert.equal((await control.query("SELECT count(*)::int n FROM app_billing_reconciliations WHERE operation_id='terminal'")).rows[0].n, 1);
        assert.equal((await control.query("SELECT count(*)::int n FROM app_ledger WHERE id='led-image-terminal'")).rows[0].n, 0);
        assert.equal((await control.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id='terminal'")).rows[0].n, 0);
      });
      await step('failure cleanup partial billing writes roll back together without erasing UNKNOWN evidence', async () => {
        await create('billing-rollback', { paidOperations: {} }); const r = await repo.claimImageJob('billing-rollback', 'suite');
        const before = await invariant('billing-rollback'), saved = JSON.stringify(await row('billing-rollback'));
        const wallet = JSON.stringify((await control.query('SELECT * FROM app_users')).rows);
        primaryFault = new Error('PRIVATE_COMMIT'); primaryArmed = rollbackFault = true; faultPoint = 'COMMIT';
        const result = await outcome(() => repo.failUndeliveredImageJob('billing-rollback', r.lease_token, 'image-worker-failed'));
        assert.equal(result.error, primaryFault); await pool.query('SELECT 1');
        assert.equal(await invariant('billing-rollback'), before); assert.equal(JSON.stringify(await row('billing-rollback')), saved);
        assert.equal(JSON.stringify((await control.query('SELECT * FROM app_users')).rows), wallet);
        assert.equal((await control.query("SELECT count(*)::int n FROM app_billing_reconciliations WHERE operation_id='billing-rollback'")).rows[0].n, 0);
      });
      await step('actual SQL cancellation keeps original 57014 and returns clean connection', async () => {
        await create('sql-cancel'); const r = await repo.claimImageJob('sql-cancel', 'suite'), before = await invariant('sql-cancel');
        primaryFault = 'cancel'; primaryArmed = true;
        const result = await outcome(() => repo.failUndeliveredImageJob('sql-cancel', r.lease_token, 'image-worker-failed'));
        assert(result.threw); assert.equal(result.error, primaryObserved); assert.equal(result.error.code, '57014');
        assert.equal(await invariant('sql-cancel'), before); assert.equal(stages('failure-rollback').length, 0); await pool.query('SELECT 1');
      });
      await step('already checkpointed paid result is read without supplier replay or new ledger', async () => {
        await create('paid-done', { paidOperations: { root: { ...checkpoint.root, state: 'done', result: { value: 'original-result' } } } });
        const before = await invariant('paid-done'); let supplier = 0;
        await jobs.kick('paid-done', async () => {
          const value = await jobs.paidOperation('paid-done', 'fixture', { id: 'root', managedGateway: false }, async () => { supplier++; throw Error('no replay'); });
          assert.equal(value.value, 'original-result'); await jobs.patch('paid-done', { status: 'done' });
        });
        assert.equal(supplier, 0); assert.equal(await invariant('paid-done'), before);
      });
      await step('stale/duplicate release is an idempotent no-op and leaves current owner intact', async () => {
        await create('idempotent'); const r = await repo.claimImageJob('idempotent', 'suite'), before = await invariant('idempotent');
        await repo.releaseImageJob('idempotent', 'another-owner'); assert.equal((await row('idempotent')).lease_token, r.lease_token);
        await repo.releaseImageJob('idempotent', r.lease_token); await repo.releaseImageJob('idempotent', r.lease_token);
        assert.equal((await row('idempotent')).lease_token, null); assert.equal(await invariant('idempotent'), before); assert.equal(logs.length, 0);
      });
      await step('worker failure cleanup error is diagnosed without changing kick or hold contract', async () => {
        await create('worker-failed'); await control.query("UPDATE app_billing_operations SET state='hold' WHERE id='worker-failed'");
        const before = await invariant('worker-failed');
        const result = await jobs.kick('worker-failed', async () => {
          primaryFault = 'sql'; primaryArmed = true; throw { original: 'PRIVATE_ACCOUNT_PROMPT_TOKEN_SQL' };
        });
        assert.equal(result, undefined); assert.equal(await invariant('worker-failed'), before); assert.equal((await row('worker-failed')).snapshot.status, 'pending');
        assert.equal(stages('execute').length, 1); assert.equal(stages('failure-stop').length, 1); assert(logs.every(x => !x.includes('PRIVATE')));
      });
      await step('bounded finite stage diagnostics redact hostile getters, codes, messages and log sinks', async () => {
        const { reportImageJobCleanupFailure: report } = load('src/lib/image-job-cleanup.ts');
        for (let n = 0; n < 1000; n++) report('lease-release', { code: 'PRIVATE_CODE_' + n, message: 'PRIVATE_PROMPT SQL token account' });
        assert.equal(stages('lease-release').length, 1); assert(stages('lease-release')[0].includes('code=UNCLASSIFIED'));
        clock += 60001; report('lease-release', { code: '55P03' }); assert.equal(stages('lease-release').length, 2); assert(stages('lease-release')[1].includes('suppressed=999'));
        clock += 60001; report('lease-release', Object.defineProperty({}, 'code', { get() { throw Error('PRIVATE_GETTER'); } }));
        const original = rawConsole.error; rawConsole.error = () => { throw Error('PRIVATE_SINK'); };
        clock += 60001; try { report('lease-release', new Error('PRIVATE')); } finally { rawConsole.error = original; }
        assert(logs.every(x => !/PRIVATE|fixture@example|PRIVATE_NONCE/.test(x))); assert(logs.every(x => x.length < 180));
      });
    }
    // Parent integration: actual creation writer/schema/detail/asset readers.
    // Auth/storage transport and admission remain fixtures; no provider replay.
    await control.query(`ALTER TABLE app_users ADD COLUMN name text;
      CREATE TABLE app_artworks(id text PRIMARY KEY,email text,image_url text,video_url text,canvas_image_version jsonb,deleted_at timestamptz);
      CREATE TABLE app_video_tasks(id text PRIMARY KEY,email text,parameters jsonb,status text);
      CREATE TABLE app_canvas_image_tasks(id text PRIMARY KEY,email text,parameters jsonb,result_artwork_id text);
      CREATE TABLE app_billing_api_cost_reviews(operation_id text,status text,refund_credits int);`);
    await load('src/lib/saas/creation-schema.ts').ensureCreationSchema();
    const reader = load('src/lib/saas/creations.ts');
    const fixed = mode === 'modified';
    async function linked(id) {
      await create(id);
      await control.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id) VALUES($1,'fixture@example.test','personal','image:suite',$1)", [id]);
      await control.query("INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id) VALUES($1,'fixture@example.test','image:suite',$1)", [id]);
      await control.query("INSERT INTO app_artworks(id,email,image_url) VALUES($1,'fixture@example.test',$2)", ['work-' + id, '/media/' + id + '.png']);
      const r = await repo.claimImageJob(id, 'suite');
      return { r, snapshot: { ...r.snapshot, status: 'done', images: [{ artworkId: 'work-' + id }] } };
    }
    await step('parent: checkout outage retains actual history assets and pending evidence', async () => {
      const id = 'history-outage', { r, snapshot } = await linked(id), before = await invariant(id);
      creation = nativeEvidence = true; checkoutFault = metrics.connections;
      const saved = await outcome(() => repo.saveImageJob(id, snapshot, r.lease_token));
      assert.equal(saved.threw, baseline); checkoutFault = false;
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.status, 'succeeded'); assert.equal(detail.evidencePending, fixed);
      assert.equal(detail.assets.length, fixed ? 1 : 0);
      if (fixed) assert.equal((await reader.creationAsset({ platform: true }, id, detail.assets[0].id)).url, '/media/' + id + '.png');
      assert.equal(await invariant(id), before);
      console.log(`HISTORY_CHECKOUT_OUTAGE status=${detail.status} pending=${detail.evidencePending} assets=${detail.assets.length} REPLAY=0`);
    });
    await step('parent: successful native writer persists output and clears only new pending marker', async () => {
      const id = 'history-success', { r, snapshot } = await linked(id), before = await invariant(id);
      creation = nativeEvidence = true; await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.assets.length, 1); assert.equal(detail.evidencePending, false);
      assert.equal((await row(id)).snapshot.creationEvidencePending, undefined);
      assert.equal((await reader.creationAsset({ platform: true }, id, detail.assets[0].id)).url, '/media/' + id + '.png');
      assert.equal(await invariant(id), before);
      const denied = await outcome(() => reader.creationAsset({ platform: true, boundTenantId: '00000000-0000-0000-0000-000000000099' }, id, detail.assets[0].id));
      assert.equal(denied.error.status, 404);
      console.log('HISTORY_SUCCESS assets=1 pending=false BOUND_TENANT_MISMATCH=404');
    });
    await step('parent: evidence SQL failure preserves fallback and no partial secondary writes', async () => {
      const id = 'history-sql', { r, snapshot } = await linked(id);
      creation = nativeEvidence = evidenceFault = true; await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.evidencePending, true); assert.equal(detail.assets.length, 1);
      assert.equal((await control.query('SELECT count(*)::int n FROM app_creation_assets WHERE creation_id=$1', [id])).rows[0].n, 0);
    });
    await step('parent: native evidence writes roll back atomically to their savepoint', async () => {
      const id = 'history-partial-write', { r, snapshot } = await linked(id);
      creation = nativeEvidence = true; evidenceFault = 'after-write';
      await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.evidencePending, true); assert.equal(detail.assets.length, 1);
      assert.equal((await control.query('SELECT count(*)::int n FROM app_creation_assets WHERE creation_id=$1', [id])).rows[0].n, 0);
      assert.equal((await control.query('SELECT count(*)::int n FROM app_creation_events WHERE creation_id=$1', [id])).rows[0].n, 0);
      assert.equal((await control.query('SELECT status FROM app_creation_records WHERE id=$1', [id])).rows[0].status, 'queued');
    });
    await step('parent: evidence COMMIT rejection retains durable pending and original checkpoint', async () => {
      const id = 'history-commit', { r, snapshot } = await linked(id), before = await invariant(id);
      creation = nativeEvidence = true;
      afterCheckpoint = async () => { primaryArmed = true; primaryFault = 'sql'; faultPoint = 'COMMIT'; };
      await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.assets.length, fixed ? 1 : 0); assert.equal(detail.evidencePending, fixed);
      assert.equal((await control.query('SELECT count(*)::int n FROM app_creation_assets WHERE creation_id=$1', [id])).rows[0].n, 0);
      assert.equal(await invariant(id), before);
    });
    await step('parent: lease loss after checkpoint never projects evidence or clears pending', async () => {
      const id = 'history-lease', { r, snapshot } = await linked(id), before = await invariant(id);
      creation = nativeEvidence = true;
      afterCheckpoint = async () => { await control.query("UPDATE app_image_jobs SET lease_token='next-owner',lease_until=clock_timestamp()+interval '1 minute' WHERE id=$1", [id]); };
      await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.assets.length, fixed ? 1 : 0); assert.equal(detail.evidencePending, fixed);
      assert.equal((await row(id)).lease_token, 'next-owner'); assert.equal(await invariant(id), before);
      assert.equal((await control.query('SELECT count(*)::int n FROM app_creation_assets WHERE creation_id=$1', [id])).rows[0].n, 0);
    });
    for (const inherited of ['context', 'snapshot']) await step('parent: earlier pending ' + inherited + ' remains unresolved after native evidence success', async () => {
      const id = 'history-pending-' + inherited, { r, snapshot } = await linked(id);
      creation = nativeEvidence = true; inheritedPending = inherited === 'context';
      if (inherited === 'snapshot') snapshot.creationEvidencePending = true;
      await repo.saveImageJob(id, snapshot, r.lease_token);
      const detail = await reader.creationDetail({ platform: true }, id);
      assert.equal(detail.assets.length, 1); assert.equal(detail.evidencePending, true);
    });
    await step('parent: older postcommit evidence does not overwrite newer checkpoint evidence', async () => {
      const id = 'history-race', { r, snapshot } = await linked(id);
      const newer = { ...snapshot, status: 'running', stage: 'newer-checkpoint', creationEvidencePending: true };
      creation = nativeEvidence = true;
      afterCheckpoint = async () => {
        await control.query('UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1', [id, JSON.stringify(newer)]);
        await control.query("UPDATE app_creation_records SET status='running' WHERE id=$1", [id]);
      };
      await repo.saveImageJob(id, snapshot, r.lease_token);
      assert.deepEqual((await row(id)).snapshot, newer);
      const evidenceStatus = (await control.query('SELECT status FROM app_creation_records WHERE id=$1', [id])).rows[0].status;
      assert.equal(evidenceStatus, fixed ? 'running' : 'succeeded');
      console.log(`HISTORY_RACE new_snapshot=retained evidence_status=${evidenceStatus}`);
    });
    await step('parent: missing creation link is not proof of evidence completion', async () => {
      const id = 'history-no-link'; await create(id); const r = await repo.claimImageJob(id, 'suite');
      creation = nativeEvidence = true; await repo.saveImageJob(id, { ...r.snapshot, receipt: 'committed' }, r.lease_token);
      assert.equal((await row(id)).snapshot.creationEvidencePending === true, fixed);
    });
    if (!baseline) await step('parent: diagnostics share fixed stage budget across module copies', async () => {
      const first = load('src/lib/image-job-cleanup.ts'); cache.delete('src/lib/image-job-cleanup.ts');
      const second = load('src/lib/image-job-cleanup.ts');
      first.reportImageJobCleanupFailure('lease-release', { code: '55P03' });
      second.reportImageJobCleanupFailure('lease-release', { code: '55P03' });
      assert.equal(stages('lease-release').length, fixed ? 1 : 2);
      console.log(`DIAGNOSTIC_MODULE_COPIES=2 FIRST_REPORTS=${stages('lease-release').length}`);
      if (fixed) {
        clock += 60001; second.reportImageJobCleanupFailure('lease-release', { code: '55P03' });
        assert(stages('lease-release')[1].includes('suppressed=1'));
        const previous = logs.length; for (let n = 0; n < 1000; n++) second.reportImageJobCleanupFailure('unregistered-' + n, {});
        assert.equal(logs.length, previous);
      }
    });
    assert.equal(metrics.connections, metrics.returned); assert.equal(pool.waitingCount, 0); assert.equal(pool.totalCount, pool.idleCount);
    console.log(`A60_${mode.toUpperCase()}=PASS CASES=${checks} REAL_PG=1 CHECKED_OUT=0 TIMERS=0 SUPPLIER_CALLS=0`);
  } finally {
    await Promise.allSettled([pool?.end(), control?.end(), refused?.end()]);
    if (container) {
      assert.equal(JSON.parse(docker(['inspect', container]))[0].Config.Labels['naumi.fixture'], label);
      docker(['rm', '-f', container]); assert.equal(docker(['ps', '-aq', '--filter', 'label=naumi.fixture=' + label]), '');
      assert.equal(await tcp(fixturePort), false); console.log('FIXTURE_REMOVED=1 TCP_CLOSED=1');
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
