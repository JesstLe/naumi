/** Local-only PostgreSQL lifecycle tests for withBillingTransaction.
 * One owned fixture; real application Pool listener, no test Client error listener.
 * Source snapshots replace only service.ts. Other modules use the fixed checkout.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA']);
for (const key of Object.keys(process.env)) if (!allowed.has(key.toUpperCase())) delete process.env[key];
const { Client } = require('pg');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) {
  const deadline = Date.now() + 8000;
  while (!(await fn())) { if (Date.now() > deadline) throw Error('LOCAL_FIXTURE_TIMEOUT'); await wait(10); }
}
function load(file, bindings = {}) {
  const module = { exports: {} };
  const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
    name => name === 'server-only' ? {} : Object.hasOwn(bindings, name) ? bindings[name] : require(name), module, module.exports);
  return module.exports;
}
// A real TCP relay discards the COMMIT reply, then closes the socket after PG's
// ReadyForQuery. Both durable commit and rejected commit are unobserved by pg.
async function relay(port) {
  const sockets = new Set();
  const state = { drop: false, droppedReply: false, committedReply: false, errorReply: false, bytes: Buffer.alloc(0) };
  const server = net.createServer(down => {
    const up = net.connect({ host: '127.0.0.1', port }); sockets.add(up); sockets.add(down);
    down.on('data', data => up.write(data));
    up.on('data', data => {
      if (!state.drop) { down.write(data); return; }
      state.bytes = Buffer.concat([state.bytes, data]);
      while (state.bytes.length >= 5) {
        const size = state.bytes.readInt32BE(1) + 1;
        if (state.bytes.length < size) break;
        const kind = String.fromCharCode(state.bytes[0]);
        if (kind === 'C') state.committedReply = true;
        if (kind === 'E') state.errorReply = true;
        state.bytes = state.bytes.subarray(size);
        if (kind === 'Z') { state.droppedReply = true; up.destroy(); down.destroy(); }
      }
    });
    for (const s of [up, down]) { s.on('error', () => {}); s.on('close', () => { sockets.delete(s); up.destroy(); down.destroy(); }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { state, port: server.address().port, async close() { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); } };
}
async function probe(source, database) {
  const url = new URL(database);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/billing_tx_fixture');
  const connection = load(path.join(root, 'src/lib/db/connection.ts'));
  const { withBillingTransaction: transaction } = load(path.join(source, 'src/lib/billing/service.ts'), {
    '../saas/creation-writer': {}, './types': {}, './fingerprint': {}, './quote': {}, './repository': {},
    './api-cost-ledger': {}, '../staging-history': {},
  });
  const admin = new Client({ connectionString: database }); await admin.connect();
  await admin.query(`CREATE TABLE IF NOT EXISTS lifecycle_value(id text PRIMARY KEY, n int);
    CREATE TABLE IF NOT EXISTS lifecycle_parent(id int PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS lifecycle_child(id text PRIMARY KEY, parent_id int REFERENCES lifecycle_parent(id) DEFERRABLE INITIALLY DEFERRED);
    CREATE TABLE IF NOT EXISTS lifecycle_hold(id text PRIMARY KEY, state text, reserved int, operation text, quote jsonb)`);
  const cases = [];
  async function scenario(name, action) {
    let proxy;
    if (name.startsWith('commit-reply-lost')) proxy = await relay(Number(url.port));
    const conn = new URL(database); if (proxy) conn.port = String(proxy.port);
    process.env.DATABASE_URL = conn.href;
    const pool = connection.getPool(); assert.equal(pool.options.max, 5);
    const records = [], owned = new Set(); let hooks = {}, pending = 0, peak = 0;
    const borrowed = {
      async connect() {
        if (hooks.checkout) return hooks.checkout();
        const c = await pool.connect(); owned.add(c.processID);
        const record = { pid: c.processID, client: c, sql: [], errors: [], releases: [], queryableAtRelease: null };
        records.push(record); pending++; peak = Math.max(peak, pending);
        const query = c.query.bind(c), release = c.release.bind(c);
        c.query = async (sql, args) => {
          record.sql.push(typeof sql === 'string' ? sql : sql.text);
          try {
            if (hooks.query) return await hooks.query({ c, record, sql, args, query });
            return await query(sql, args);
          } catch (error) { record.errors.push({ sql, error }); throw error; }
        };
        c.release = discard => {
          record.releases.push(!!discard); record.queryableAtRelease = c._queryable;
          pending--; c.query = query; return release(discard);
        };
        return c;
      },
    };
    async function terminate(c) {
      assert.ok(owned.has(c.processID));
      assert.equal((await admin.query('SELECT pg_terminate_backend($1) ok', [c.processID])).rows[0].ok, true);
    }
    const run = fn => transaction(borrowed, fn);
    async function outcome(fn) { try { return { result: await fn() }; } catch (error) { return { error }; } }
    async function health(discard) {
      const previous = records.at(-1); hooks = {};
      const result = await run(async c => (await c.query('SELECT 42 AS n')).rows[0].n);
      assert.equal(result, 42);
      assert.equal(records.at(-1).pid === previous.pid, !discard, 'healthy reuse / bad client eviction');
    }
    try {
      const details = await action({ run, outcome, records, hooks, terminate, health, proxy, pool, borrowed });
      for (const r of records) assert.equal(r.releases.length, 1, 'exactly one release per checkout');
      assert.equal(pending, 0);
      const row = { name, ok: true, checkouts: records.length, releases: records.reduce((n, r) => n + r.releases.length, 0), peak, ...details };
      cases.push(row); console.log('CASE ' + JSON.stringify(row));
    } catch (error) {
      const row = { name, ok: false, message: error.message, checkouts: records.length,
        releases: records.map(r => r.releases), queryableAtRelease: records.map(r => r.queryableAtRelease) };
      cases.push(row); console.log('CASE ' + JSON.stringify(row));
    } finally { await connection.closeDatabasePools(); if (proxy) await proxy.close(); }
  }
  try {
    await scenario('success', async ({ run, records, health }) => {
      const id = randomUUID(), result = { same: true };
      let finish, entered;
      const gate = new Promise(resolve => { finish = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      const pending = run(async c => { await c.query('INSERT INTO lifecycle_value VALUES($1,1)', [id]); entered(); await gate; return result; });
      pending.catch(() => {});
      try {
        await Promise.race([started, pending]);
        assert.equal(records[0].releases.length, 0, 'never release an active business transaction');
        assert.equal((await admin.query('SELECT * FROM lifecycle_value WHERE id=$1', [id])).rowCount, 0);
      } finally { finish(); }
      assert.equal(await pending, result);
      assert.deepEqual(records[0].sql, ['BEGIN', 'INSERT INTO lifecycle_value VALUES($1,1)', 'COMMIT']);
      assert.equal((await admin.query('SELECT n FROM lifecycle_value WHERE id=$1', [id])).rows[0].n, 1);
      await health(false); return { sameTransaction: true, activeReleaseCount: 0, durable: true, reused: true };
    });
    await scenario('business-error', async ({ run, outcome, records, health }) => {
      const error = new Error('LOCAL_BUSINESS_FAILURE postgresql://local-only-log-marker ' + 'BIG_PARAMS'.repeat(8192)), id = randomUUID();
      const out = await outcome(() => run(async c => { await c.query('INSERT INTO lifecycle_value VALUES($1,1)', [id]); throw error; }));
      assert.equal(out.error, error); assert.equal((await admin.query('SELECT * FROM lifecycle_value WHERE id=$1', [id])).rowCount, 0);
      assert.equal(records[0].releases[0], false); await health(false); return { originalIdentity: true, rolledBack: true, reused: true };
    });
    await scenario('non-Error-throw', async ({ run, outcome, health }) => {
      const original = { code: 'LOCAL_SENTINEL' }; assert.equal((await outcome(() => run(async () => { throw original; }))).error, original);
      await health(false); return { originalIdentity: true };
    });
    await scenario('sql-error', async ({ run, outcome, records, health }) => {
      const out = await outcome(() => run(c => c.query('SELECT 1/0')));
      assert.equal(out.error, records[0].errors[0].error); assert.equal(out.error.code, '22012'); await health(false);
      return { originalIdentity: true, code: out.error.code, reused: true };
    });
    await scenario('checkout-error', async ({ run, outcome, hooks, records }) => {
      const original = new Error('LOCAL_CHECKOUT_FAILURE'); hooks.checkout = async () => { throw original; };
      let actions = 0; assert.equal((await outcome(() => run(async () => actions++))).error, original);
      assert.equal(actions, 0); assert.equal(records.length, 0); return { actions, releases: 0, tier: 'checkout-rejection-seam' };
    });
    await scenario('begin-disconnect', async ({ run, outcome, hooks, records, terminate, health }) => {
      hooks.query = async ({ c, sql, args, query }) => { if (sql === 'BEGIN') { await terminate(c); await until(() => !c._queryable); } return query(sql, args); };
      let actions = 0; const out = await outcome(() => run(async () => actions++));
      const original = records[0].errors[0].error;
      const identity = out.error === original; await health(true);
      console.log('OBSERVED begin-disconnect originalIdentity=' + identity + ' actions=' + actions + ' badClientEvicted=true');
      assert.equal(actions, 0); assert.equal(identity, true, 'BEGIN original error identity');
      return { actions, originalIdentity: identity, evicted: true };
    });
    await scenario('rollback-disconnect', async ({ run, outcome, records, terminate, health }) => {
      const original = new Error('LOCAL_ACTION_BEFORE_BACKEND_TERMINATION');
      const out = await outcome(() => run(async c => { await terminate(c); await until(() => !c._queryable); throw original; }));
      const identity = out.error === original; const explicitDiscard = records[0].releases[0];
      await health(true); // Baseline pg already evicts physically dead clients.
      console.log('OBSERVED rollback-disconnect originalIdentity=' + identity + ' explicitDiscard=' + explicitDiscard + ' badClientEvicted=true');
      assert.equal(identity, true, 'ROLLBACK replaced original action error'); assert.equal(explicitDiscard, true);
      return { originalIdentity: identity, explicitDiscard, evicted: true };
    });
    await scenario('execution-disconnect', async ({ run, outcome, records, terminate, health }) => {
      const out = await outcome(() => run(async c => {
        const pending = c.query('SELECT pg_sleep(8)'); pending.catch(() => {});
        await until(async () => (await admin.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1', [c.processID])).rows[0]?.wait_event === 'PgSleep');
        await terminate(c); return pending;
      }));
      const first = records[0].errors[0].error, identity = out.error === first;
      await health(true); console.log('OBSERVED execution-disconnect originalIdentity=' + identity + ' badClientEvicted=true');
      assert.equal(identity, true, 'executing query error identity');
      return { originalIdentity: true, code: first.code || 'TRANSPORT', evicted: true };
    });
    await scenario('rollback-sql-rejection-seam', async ({ run, outcome, hooks, records, health }) => {
      hooks.query = ({ sql, args, query }) => query(sql === 'ROLLBACK' ? 'SELECT 1/0' : sql, args);
      const original = new Error('LOCAL_ORIGINAL_BEFORE_ROLLBACK_FAILURE');
      const out = await outcome(() => run(async () => { throw original; }));
      const record = records[0], identity = out.error === original;
      assert.equal(record.errors[0].error.code, '22012'); assert.equal(record.queryableAtRelease, true);
      console.log('OBSERVED rollback-sql-rejection-seam originalIdentity=' + identity + ' queryableAtRelease=true explicitDiscard=' + record.releases[0]);
      assert.equal(record.releases[0], true, 'queryable but unclean transaction must be discarded');
      await health(true); assert.equal(identity, true);
      return { originalIdentity: true, queryable: true, evicted: true, tier: 'real-PG-SQL-dispatch-seam-not-natural-ROLLBACK-error' };
    });
    await scenario('commit-deferred-error', async ({ run, outcome, records, health }) => {
      const id = randomUUID(); let actions = 0;
      const out = await outcome(() => run(async c => { actions++; await c.query('INSERT INTO lifecycle_child VALUES($1,404)', [id]); }));
      assert.equal(out.error, records[0].errors[0].error); assert.equal(out.error.code, '23503'); assert.equal(actions, 1);
      assert.equal((await admin.query('SELECT * FROM lifecycle_child WHERE id=$1', [id])).rowCount, 0);
      await health(false); return { originalIdentity: true, code: '23503', actions, reused: true };
    });
    for (const committed of [true, false]) await scenario('commit-reply-lost-' + (committed ? 'committed' : 'rejected'), async ({ run, outcome, records, hooks, proxy, health }) => {
      const id = randomUUID(), quote = { frozen: 1, requestedCredits: 6 };
      await admin.query('INSERT INTO lifecycle_hold VALUES($1,\'hold\',6,$1,$2)', [id, quote]);
      hooks.query = ({ sql, args, query }) => { if (sql === 'COMMIT') proxy.state.drop = true; return query(sql, args); };
      let actions = 0;
      const out = await outcome(() => run(async c => {
        actions++; await c.query('INSERT INTO lifecycle_value VALUES($1,6)', [id]);
        if (!committed) await c.query('INSERT INTO lifecycle_child VALUES($1,404)', [id]);
      }));
      assert.equal(proxy.state.droppedReply, true); assert.equal(actions, 1);
      assert.equal(proxy.state.committedReply, committed); assert.equal(proxy.state.errorReply, !committed);
      const durable = (await admin.query('SELECT * FROM lifecycle_value WHERE id=$1', [id])).rowCount;
      assert.equal(durable, committed ? 1 : 0);
      const hold = (await admin.query('SELECT * FROM lifecycle_hold WHERE id=$1', [id])).rows[0];
      assert.deepEqual(hold, { id, state: 'hold', reserved: 6, operation: id, quote });
      const identity = out.error === records[0].errors.find(r => r.sql === 'COMMIT').error;
      proxy.state.drop = false; await health(true);
      console.log('OBSERVED commit-reply-lost committed=' + committed + ' durable=' + durable + ' actions=' + actions + ' hold=unchanged originalIdentity=' + identity);
      assert.equal(identity, true, 'unobserved COMMIT error must survive cleanup');
      return { originalIdentity: true, clientOutcome: 'UNKNOWN', durable, actions, hold: 'unchanged', evicted: true, tier: 'real-PG+TCP-reply-drop+synthetic-hold' };
    });
    await scenario('commit-ack-rejection-seam-clean-rollback', async ({ run, outcome, hooks, records, health }) => {
      const original = new Error('LOCAL_UNOBSERVED_COMMIT_ACK'), id = randomUUID(); let actions = 0;
      hooks.query = async ({ sql, args, query }) => { const result = await query(sql, args); if (sql === 'COMMIT') throw original; return result; };
      const out = await outcome(() => run(async c => { actions++; await c.query('INSERT INTO lifecycle_value VALUES($1,6)', [id]); }));
      assert.equal(out.error, original); assert.equal(actions, 1);
      assert.equal(records[0].errors.length, 1); assert.equal(records[0].sql.at(-1), 'ROLLBACK');
      assert.equal((await admin.query('SELECT * FROM lifecycle_value WHERE id=$1', [id])).rowCount, 1);
      await health(false);
      return { originalIdentity: true, actions, rollbackSucceeded: true, durable: 1, clientOutcome: 'UNKNOWN', tier: 'real-commit+adapter-ack-rejection-seam' };
    });
    await scenario('concurrent-success-business-sql', async ({ run, outcome, records }) => {
      const results = await Promise.all(Array.from({ length: 24 }, (_, i) => outcome(() => run(async c => {
        await c.query('SELECT pg_sleep(0.01)');
        if (i % 3 === 1) throw Error('LOCAL_CONCURRENT_BUSINESS');
        if (i % 3 === 2) await c.query('SELECT 1/0');
        return i;
      }))));
      assert.equal(results.filter(r => !r.error).length, 8);
      for (const r of records) assert.equal(r.releases[0], false);
      assert.ok(new Set(records.map(r => r.pid)).size <= 5);
      return { transactions: 24, success: 8, expectedFailures: 16, physicalClients: new Set(records.map(r => r.pid)).size };
    });
  } finally { await admin.end(); }
  const failed = cases.filter(c => !c.ok).length;
  console.log(`LIFECYCLE_RESULT cases=${cases.length} passed=${cases.length - failed} failed=${failed} suppliers=0`);
  process.exitCode = failed ? 1 : 0;
}
async function controller() {
  const source = path.resolve(process.argv[2] || root), output = path.resolve(process.argv[3] || 'output/billing-transaction-lifecycle/run');
  const regressions = process.argv.includes('--regressions');
  fs.mkdirSync(output, { recursive: true });
  const tag = 'billing-tx-' + randomUUID(), name = 'naumi-' + tag, password = 'local-only-' + randomUUID();
  const runs = []; let id;
  const env = { ...process.env };
  function command(label, command, args, overrides = {}, timeout = 180000) {
    const result = spawnSync(command, args, { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const record = { label, command, args: args.map(arg => arg.startsWith('postgresql://') ? 'LOCAL_FIXTURE_URL(injected, loopback billing_tx_fixture)' : arg), input: 'stdin=empty; environment=case-insensitive OS whitelist plus local fixture inputs', stdout: result.stdout || '', stderr: result.stderr || '', exit: result.status, signal: result.signal, error: result.error?.message };
    runs.push(record); fs.writeFileSync(path.join(output, 'RUNS.json'), JSON.stringify(runs, null, 2)); return result;
  }
  const docker = args => {
    const r = spawnSync('docker', args, { env: { ...env, POSTGRES_PASSWORD: password }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(r.status, 0, 'local fixture Docker command failed: ' + r.stderr); return r.stdout.trim();
  };
  try {
    id = docker(['create', '--name', name, '--label', 'io.naumi.billing-tx=' + tag, '--memory', '256m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data',
      '-p', '127.0.0.1:55432:5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=x2_fixture', '-e', 'POSTGRES_DB=billing_tx_fixture',
      'postgres:16-alpine', '-c', 'shared_buffers=32MB', '-c', 'max_connections=25']);
    assert.equal(docker(['start', id]), id);
    console.log('FIXTURE_CREATED id=' + id + ' label=' + tag + ' port=55432 memory=256MiB');
    const database = `postgresql://x2_fixture:${password}@127.0.0.1:55432/billing_tx_fixture`;
    await until(async () => { const c = new Client({ connectionString: database, connectionTimeoutMillis: 1000 }); try { await c.connect(); await c.query('SELECT 1'); return true; } catch { return false; } finally { await c.end().catch(() => {}); } });
    const probeResult = command('LIFECYCLE', process.execPath, [__filename, '--probe', source, database]);
    console.log(probeResult.stdout.trim()); if (probeResult.stderr) process.stderr.write(probeResult.stderr);
    assert.doesNotMatch(probeResult.stdout + probeResult.stderr, /local-only-|postgresql:\/\/|BIG_PARAMS|x2_fixture/);
    process.exitCode = probeResult.status === 0 ? 0 : 1;
    if (regressions) {
      const localEnv = { DATABASE_URL: database, NAUMI_VERIFY_ISOLATED_DB: '1', NODE_ENV: 'test', PGSSLMODE: 'disable' };
      for (const file of ['verify-billing-rules.ts', 'verify-billing-wallet.ts']) {
        const r = command(file, process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/' + file], localEnv);
        console.log('REGRESSION ' + file + ' exit=' + r.status); if (r.status !== 0) process.exitCode = 1;
      }
      const admin = new Client({ connectionString: database }); await admin.connect();
      try { await admin.query('CREATE DATABASE naumi_x2_isolated'); } finally { await admin.end(); }
      const x2 = command('X2', process.execPath, ['scripts/verify-image-job-lease.cjs', root, 'modified'], { NAUMI_X2_TEST_DATABASE_URL: database.replace('/billing_tx_fixture', '/naumi_x2_isolated') });
      console.log('REGRESSION X2 exit=' + x2.status); if (x2.status !== 0) process.exitCode = 1;
      const tsc = command('TSC', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'], {}, 240000);
      console.log('REGRESSION TSC exit=' + tsc.status); if (tsc.status !== 0) process.exitCode = 1;
    }
  } finally {
    if (id) {
      assert.equal(docker(['inspect', '--format', '{{ index .Config.Labels "io.naumi.billing-tx" }}', id]), tag);
      let stopped, removed; const errors = [];
      try { stopped = docker(['stop', '--timeout', '10', id]); assert.equal(stopped, id); } catch (error) { errors.push(error.message); }
      try { removed = docker(['rm', '-f', '-v', id]); assert.equal(removed, id); } catch (error) { errors.push(error.message); }
      const remaining = docker(['ps', '-aq', '--filter', 'label=io.naumi.billing-tx=' + tag]);
      fs.writeFileSync(path.join(output, 'FIXTURE.json'), JSON.stringify({ id, tag, port: 55432, stopped, removed, remaining, errors }, null, 2));
      console.log('FIXTURE_REMOVED id=' + id + ' matchingLabel=1 remaining=' + (remaining ? 1 : 0));
      assert.equal(remaining, ''); assert.deepEqual(errors, []);
    }
    fs.writeFileSync(path.join(output, 'RUNS.json'), JSON.stringify(runs, null, 2));
  }
}
(process.argv[2] === '--probe' ? probe(path.resolve(process.argv[3]), process.argv[4]) : controller())
  .catch(error => { console.error(error.stack); process.exitCode = 1; });
