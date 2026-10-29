'use strict';
// Actual BI route/use case, auth, schema and billing code against one disposable
// PostgreSQL. Only the selected user-management source bytes are substituted
// for baseline/rollback comparison; no auth/service/repository is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const mode = option('--mode', 'modified');
assert.ok(['baseline', 'modified', 'rollback', 'native', 'types'].includes(mode));
const source = path.resolve(option('--source', path.join(root, 'src/lib/bi/user-management.ts')));
const reportPath = path.resolve(option('--report', path.join(root, 'output/capacity-bi-user-mutation', `${mode}.json`)));
const fixtureUrl = 'postgresql://bi_fixture:bi_fixture_local@127.0.0.1:55497/naumi_bi_mutation_fixture';

if (process.env.NAUMI_BI_MUTATION_CHILD !== '1') {
  // Windows keys are case-insensitive. Preserve SystemRoot, never inherited
  // provider keys, DATABASE_URL, NODE_OPTIONS, PG* or production .env contents.
  const allowed = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'comspec', 'pathext', 'appdata', 'localappdata', 'userprofile', 'homedrive', 'homepath']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
  if (process.platform === 'win32') assert.ok(Object.keys(env).some(key => key.toLowerCase() === 'systemroot'));
  Object.assign(env, {
    NAUMI_BI_MUTATION_CHILD: '1', NAUMI_VERIFY_ISOLATED_DB: '1',
    DATABASE_URL: fixtureUrl, NAUMI_MULTI_USER: '1',
    SETTINGS_SECRET: 'fixture-bi-mutation-0123456789abcdef0123456789abcdef',
    NODE_ENV: 'test', NEXT_TELEMETRY_DISABLED: '1',
  });
  const childArgs = mode === 'types'
    ? [require.resolve('typescript/bin/tsc'), '--noEmit', '--incremental', 'false']
    : ['--conditions=react-server', '--import', 'tsx', __filename, ...args];
  const result = spawnSync(process.execPath, childArgs, { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}

if (mode === 'native') {
  assert.equal(process.env.DATABASE_URL, fixtureUrl);
  const resetPool = new (require('pg').Pool)({ connectionString: fixtureUrl });
  (async () => {
    try { await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public'); }
    finally { await resetPool.end(); }
    require('./verify-bi-management.ts');
  })().catch(error => { console.error(error); process.exitCode = 1; });
  return;
}

const { AsyncLocalStorage } = require('node:async_hooks');
const Module = require('node:module');
const ts = require('typescript');
const pg = require('pg');
assert.equal(process.env.DATABASE_URL, fixtureUrl);
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
const target = path.join(root, 'src/lib/bi/user-management.ts');
const selected = fs.readFileSync(source, 'utf8');
let selectedLoads = 0;
const compile = Module.prototype._compile;
Module.prototype._compile = function (code, filename) {
  if (path.resolve(filename) === target) {
    selectedLoads++;
    code = ts.transpileModule(selected, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
  }
  return compile.call(this, code, filename);
};
let externalCalls = 0;
global.fetch = async () => { externalCalls++; throw new Error('Fixture forbids external HTTP'); };
for (const protocol of ['node:http', 'node:https']) {
  const api = require(protocol);
  api.request = api.get = () => { externalCalls++; throw new Error('Fixture forbids external HTTP'); };
}
const context = new AsyncLocalStorage();
const query = pg.Client.prototype.query;
pg.Client.prototype.query = function (...values) {
  const trace = context.getStore();
  if (!trace) return query.apply(this, values);
  const sql = typeof values[0] === 'string' ? values[0] : values[0].text;
  const start = performance.now();
  const record = (error, result) => trace.sql.push({ sql, rows: result?.rows?.length || 0, affected: result?.rowCount ?? null,
    error: error?.code || null, ms: Number((performance.now() - start).toFixed(3)) });
  if (typeof values[values.length - 1] === 'function') {
    const callback = values.pop();
    return query.apply(this, [...values, (error, result) => { record(error, result); callback(error, result); }]);
  }
  return (async () => {
    if (trace.probe && sql.startsWith('INSERT INTO app_bi_management_log')) {
      trace.probes = await context.exit(trace.probe);
      trace.probe = null;
    }
    try { const result = await query.apply(this, values); record(null, result); return result; }
    catch (error) { record(error); throw error; }
  })();
};
const observer = new pg.Pool({ connectionString: fixtureUrl, max: 2, statement_timeout: 15000, application_name: 'bi-mutation-observer-c4c82db7' });
const report = { mode, source, sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
  evidence: 'real isolated PG + actual module/route/auth/billing; native signed sessions; no HTTP server/browser/production capacity',
  checks: [], metrics: [], traces: [], externalCalls: 0 };
let db, m, pool, native, pw, api;
let sequence = 0;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
const operator = 'operator@bi-fixture.test';
const command = (email, action, fields = {}, version = 0) => m.userCommandSchema.parse({ id: id(), email, action,
  reason: 'isolated BI mutation acceptance', ...(action === 'create' ? {} : { expectedVersion: version }), ...fields });
const request = (email, body, headers = {}) => new Request('http://fixture.test/api/admin/bi/users', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(email ? { cookie: 'nv_user=' + native.signUserSession(email, Date.now()) } : {}), ...headers }, body: JSON.stringify(body),
});
async function step(name, action) { await action(); report.checks.push(name); }
async function seed(email, count = 1, remaining = 100, reserved = 0, role = 'user') {
  await pool.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at,role) VALUES($1,'Before','starter',$2,$3,now()+interval '1 month',$4)`, [email, count * remaining, reserved, role]);
  if (count) await pool.query(`INSERT INTO app_credit_batches(id,email,amount,remaining,source,created_at,expires_at)
    SELECT $1||'-'||lpad(i::text,5,'0'),$1,$3,$3,'admin',now()+i*interval '1 second',now()+interval '1 year'+i*interval '1 second' FROM generate_series(1,$2::int) i`, [email, count, remaining]);
}
async function state(email) {
  const row = (await pool.query('SELECT * FROM app_users WHERE email=$1', [email])).rows[0] || null;
  const tables = {};
  for (const table of ['app_credit_batches', 'app_ledger', 'app_billing_operations', 'app_gen_reservations', 'app_bi_management_log', 'app_bi_access_log']) {
    tables[table] = (await pool.query(`SELECT * FROM ${table} WHERE ${table === 'app_bi_access_log' ? 'target_email' : 'email'}=$1 ORDER BY ${table === 'app_gen_reservations' ? 'job_id' : 'id'}`, [email])).rows;
  }
  return { row, ...tables };
}
async function audit(cmd) { return (await pool.query('SELECT * FROM app_bi_management_log WHERE id=$1', [cmd.id])).rows[0]; }
async function nowait(sql, args) {
  const client = await observer.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(sql, args);
    assert.equal(result.rows.length, 1);
    return 'FREE';
  } catch (error) { if (error.code === '55P03') return '55P03'; throw error; }
  finally { await client.query('ROLLBACK'); client.release(); }
}
async function waitForBlock(pid) {
  const until = Date.now() + 5000;
  do {
    if ((await observer.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n > 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < until);
  throw new Error('Expected real PostgreSQL owner-lock wait');
}
async function measured(label, cmd, tail) {
  const trace = { label, sql: [], probe: async () => ({
    owner: await nowait('SELECT email FROM app_users WHERE email=$1 FOR UPDATE NOWAIT', [cmd.email]),
    tail: await nowait('SELECT id FROM app_credit_batches WHERE id=$1 FOR UPDATE NOWAIT', [tail]),
  }) };
  const start = performance.now();
  const result = await context.run(trace, () => m.manageBiUser(cmd, operator));
  const end = trace.sql.findIndex(q => q.sql.startsWith('INSERT INTO app_billing_operations'));
  const caller = (end < 0 ? trace.sql : trace.sql.slice(0, end)).filter(q => q.sql.includes('FROM app_credit_batches'));
  const metric = { label, liveBatches: 10000, totalSql: trace.sql.length,
    callerBatchSql: caller.length, callerBatchReturned: caller.reduce((n, q) => n + q.rows, 0),
    ownerNowait: trace.probes.owner, tailNowait: trace.probes.tail, ms: Number((performance.now() - start).toFixed(3)) };
  report.metrics.push(metric); report.traces.push({ label, sql: trace.sql });
  const baseline = mode !== 'modified';
  assert.equal(metric.ownerNowait, '55P03', 'owner lock must remain held');
  assert.equal(metric.tailNowait, baseline ? '55P03' : 'FREE');
  assert.equal(metric.callerBatchReturned, baseline ? 10000 : cmd.action === 'adjust' ? 1 : 0);
  assert.equal(metric.callerBatchSql, baseline || cmd.action === 'adjust' ? 1 : 0);
  assert.equal(result.version, 1);
  return result;
}
async function main() {
  // Only the hard-coded disposable endpoint is accepted; no .env loading.
  assert.equal((await observer.query('SELECT current_database() AS db,current_user AS u')).rows[0].db, 'naumi_bi_mutation_fixture');
  assert.equal((await observer.query('SELECT current_user AS u')).rows[0].u, 'bi_fixture');
  await observer.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  db = require('../src/lib/db.ts');
  const bi = require('../src/lib/bi/repository.ts');
  m = require('../src/lib/bi/user-management.ts');
  native = require('../src/lib/native-auth.ts'); pw = require('../src/lib/pw.ts');
  api = require('../src/app/api/admin/bi/users/route.ts');
  assert.equal(selectedLoads, 1, 'route and test share one selected actual module');
  await bi.ensureBiSchema(); pool = db.getPool();
  await (await require('../src/lib/billing/server.ts').getBillingRuntime()).config.current();
  report.postgres = (await pool.query('SELECT version() AS v')).rows[0].v;
  report.dependencies = Object.fromEntries(['react', 'react-dom', '@types/react', '@types/react-dom', 'typescript'].map(p => [p, require(p + '/package.json').version]));
  assert.equal(report.dependencies.react, '19.3.0'); assert.equal(report.dependencies['@types/react'], '19.3.0');
  await seed(operator, 0, 0, 0, 'admin');

  for (const [action, fields] of [
    ['profile', { name: 'After', phone: 'fixture-phone', note: 'fixture-note' }],
    ['ban', { banned: true }], ['role', { role: 'admin' }], ['reset-password', { password: 'fixture-password-new' }],
  ]) await step(`10000 live batches: ${action}, audit and NOWAIT`, async () => {
    const email = `${action}@bi-fixture.test`; await seed(email, 10000, 10, 20);
    const before = await state(email), cmd = command(email, action, fields);
    await measured(action, cmd, email + '-10000');
    const after = await state(email), log = await audit(cmd);
    assert.deepEqual(log.changes.before, Object.fromEntries(['name', 'phone', 'note', 'role', 'banned'].map(k => [k, before.row[k]])));
    assert.deepEqual(Object.keys(log.changes).sort(), (action === 'reset-password' ? ['after', 'before', 'sessionsRevoked'] : ['after', 'before']).sort());
    const projection = Object.fromEntries(['name', 'phone', 'note', 'role', 'banned', 'management_version'].map(k => [k, after.row[k]]));
    assert.deepEqual(log.changes.after, projection);
    assert.equal(after.row.credits_total, before.row.credits_total); assert.equal(after.row.credits_used, 20);
    for (const table of ['app_credit_batches', 'app_ledger', 'app_billing_operations', 'app_gen_reservations']) assert.deepEqual(after[table], before[table]);
    assert.equal(after.app_bi_access_log.length, 1); assert.equal(log.ledger_id, null);
    if (action === 'profile') assert.equal(after.row.name, 'After');
    if (action === 'ban') { assert.equal(after.row.banned, true); assert.ok(after.row.auth_revoked_before); }
    if (action === 'role') assert.equal(after.row.role, 'admin');
    if (action === 'reset-password') { assert.ok(pw.verifyPassword(fields.password, after.row.password_hash)); assert.equal(log.changes.sessionsRevoked, true); }
    assert.ok(!JSON.stringify(log).includes('password-new')); assert.ok(!JSON.stringify(log).includes('password_hash'));
  });

  for (const delta of [6, -6, -600]) await step(`10000 live batches: adjustment ${delta}, balances and audit`, async () => {
    const email = `adjust${delta}@bi-fixture.test`; await seed(email, 10000, 10, 20);
    const cmd = command(email, 'adjust', { delta, months: 2 });
    await measured(`adjust${delta}`, cmd, email + '-10000');
    const after = await state(email), log = await audit(cmd);
    assert.equal(after.row.credits_total, 100000 + delta); assert.equal(after.row.credits_used, 20);
    assert.equal(log.changes.availableBefore, 99980); assert.equal(log.changes.availableAfter, 99980 + delta);
    assert.equal(log.changes.delta, delta); assert.equal(log.ledger_id, 'led-bi-' + cmd.id);
    assert.equal(after.app_ledger.filter(r => r.id === log.ledger_id).length, 1);
    assert.equal(after.app_ledger.find(r => r.id === log.ledger_id).delta, delta);
    assert.equal(after.app_billing_operations[0].state, 'settled');
    if (delta < 0) {
      const trace = report.traces.at(-1).sql;
      assert.equal(trace.filter(q => q.sql.includes('WITH ordered AS')).length, 1, 'preserve one-SQL FIFO prefix debit');
      assert.equal(after.app_credit_batches.filter(b => b.remaining < 10).length, Math.ceil(-delta / 10));
    }
  });

  await step('create zero and positive credits; before=null; explicit grants only', async () => {
    for (const initialCredits of [0, 25]) {
      const cmd = command(`create${initialCredits}@bi-fixture.test`, 'create', { name: 'Created', password: 'fixture-password-create', initialCredits });
      assert.equal((await m.manageBiUser(cmd, operator)).version, 1);
      const result = await state(cmd.email), log = await audit(cmd);
      assert.equal(log.changes.before, null); assert.equal(result.row.credits_total, initialCredits);
      assert.equal(result.app_credit_batches.length, initialCredits ? 1 : 0);
      assert.equal(result.app_ledger.length, initialCredits ? 1 : 0);
      assert.ok(pw.verifyPassword('fixture-password-create', result.row.password_hash));
      if (initialCredits) { assert.equal(log.changes.availableBefore, 0); assert.equal(log.changes.availableAfter, initialCredits); }
      else assert.equal('availableBefore' in log.changes, false);
      await assert.rejects(m.manageBiUser({ ...cmd, id: id() }, operator), e => e.status === 409 && /已存在/.test(e.message));
    }
  });
  await step('expired/zero batches excluded; reserved holds survive exact available debit', async () => {
    const email = 'held@bi-fixture.test'; await seed(email, 2, 10, 12);
    await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES('expired',$1,99,99,'admin',now()-interval '1 day'),('zero',$1,10,0,'admin',now()+interval '1 day')", [email]);
    await pool.query("INSERT INTO app_gen_reservations(job_id,email,cost) VALUES('other-hold',$1,12)", [email]);
    await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id,reserved_credits) VALUES('other-hold',$1,'image.generate','{}','hold-fixture','hold','led-other-hold',12)", [email]);
    const before = await state(email);
    await assert.rejects(m.manageBiUser(command(email, 'adjust', { delta: -9 }), operator), e => e.status === 402 && /预留/.test(e.message));
    assert.deepEqual(await state(email), before);
    const cmd = command(email, 'adjust', { delta: -8 }); await m.manageBiUser(cmd, operator);
    const after = await state(email), log = await audit(cmd);
    assert.equal(after.row.credits_total, 12); assert.equal(after.row.credits_used, 12);
    assert.deepEqual(after.app_gen_reservations, before.app_gen_reservations);
    assert.deepEqual(after.app_billing_operations.find(x => x.id === 'other-hold'), before.app_billing_operations[0]);
    assert.equal(log.changes.availableBefore, 8); assert.equal(log.changes.availableAfter, 0);
    assert.equal(after.app_credit_batches.find(x => x.id === 'expired').remaining, 99);
  });
  await step('insufficient principal, missing user, stale version keep original errors and state', async () => {
    const email = 'insufficient@bi-fixture.test'; await seed(email, 1, 5); const before = await state(email);
    await assert.rejects(m.manageBiUser(command(email, 'adjust', { delta: -6 }), operator), e => e.status === 402);
    await assert.rejects(m.manageBiUser(command(email, 'profile', { name: 'Stale', phone: '', note: '' }, 1), operator), e => e.status === 409 && /刷新/.test(e.message));
    await assert.rejects(m.manageBiUser(command('missing@bi-fixture.test', 'adjust', { delta: 1 }), operator), e => e.status === 404);
    assert.deepEqual(await state(email), before);
  });
  await step('same nonce eight concurrent calls: one mutation/ledger/audit, seven replays', async () => {
    const email = 'nonce@bi-fixture.test'; await seed(email); const cmd = command(email, 'adjust', { delta: -6 });
    const results = await Promise.all(Array.from({ length: 8 }, () => m.manageBiUser(cmd, operator)));
    assert.equal(results.filter(r => r.replayed).length, 7);
    const after = await state(email); assert.equal(after.row.credits_total, 94); assert.equal(after.row.management_version, 1);
    for (const table of ['app_bi_management_log', 'app_bi_access_log', 'app_ledger', 'app_billing_operations']) assert.equal(after[table].length, 1);
    await assert.rejects(m.manageBiUser({ ...cmd, delta: -7 }, operator), e => e.status === 409 && /不同操作/.test(e.message));
    await assert.rejects(m.manageBiUser(cmd, 'other-admin@bi-fixture.test'), e => e.status === 409 && /不同操作/.test(e.message));
    assert.deepEqual(await state(email), after);
  });
  await step('different operations same owner: version conflict then explicit current-version retry', async () => {
    const email = 'two-operations@bi-fixture.test'; await seed(email);
    const commands = [command(email, 'adjust', { delta: -6 }), command(email, 'profile', { name: 'Concurrent', phone: '', note: '' })];
    const results = await Promise.allSettled(commands.map(c => m.manageBiUser(c, operator)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failed = results.findIndex(r => r.status === 'rejected'); assert.equal(results[failed].reason.status, 409);
    await m.manageBiUser({ ...commands[failed], expectedVersion: 1 }, operator);
    const after = await state(email); assert.equal(after.row.management_version, 2); assert.equal(after.row.credits_total, 94);
    assert.equal(after.row.name, 'Concurrent'); assert.equal(after.app_bi_management_log.length, 2); assert.equal(after.app_ledger.length, 1);
  });
  await step('independent billing adjustment waits on BI owner lock, then commits without lost balance', async () => {
    const email = 'billing-concurrent@bi-fixture.test'; await seed(email, 2, 10);
    const service = (await require('../src/lib/billing/server.ts').getBillingRuntime()).service;
    const external = await pool.connect();
    const pid = (await external.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const cmd = command(email, 'adjust', { delta: -6 });
    let concurrent;
    const trace = { sql: [], probe: async () => {
      concurrent = (async () => {
        await external.query('BEGIN');
        try {
          await service.adjustTx(external, { id: 'external-adjust', email, amount: -5, source: 'admin', reason: 'fixture independent adjustment', expiry: { unit: 'months', value: 2 }, ledgerId: 'external-ledger', actor: operator, fingerprint: 'external-adjust', debitOrder: 'expires-first' });
          await external.query('COMMIT');
        } catch (error) { await external.query('ROLLBACK'); throw error; }
      })();
      // Observe a real lock wait before allowing BI to insert its audit/commit.
      await waitForBlock(pid);
      return { independentBilling: 'BLOCKED_ON_OWNER' };
    } };
    try { await context.run(trace, () => m.manageBiUser(cmd, operator)); await concurrent; }
    finally { external.release(); }
    const after = await state(email), log = await audit(cmd);
    assert.equal(after.row.credits_total, 9); assert.equal(after.row.management_version, 1);
    assert.equal(after.app_ledger.length, 2); assert.equal(after.app_billing_operations.length, 2);
    assert.equal(log.changes.availableBefore, 20); assert.equal(log.changes.availableAfter, 14);
    report.traces.push({ label: 'independent-billing-owner-wait', sql: trace.sql, probes: trace.probes });
  });
  await step('concurrent same nonce different fingerprint: exactly one success and one conflict', async () => {
    const email = 'nonce-conflict@bi-fixture.test'; await seed(email);
    const cmd = command(email, 'adjust', { delta: 6 });
    const results = await Promise.allSettled([m.manageBiUser(cmd, operator), m.manageBiUser({ ...cmd, delta: 7 }, operator)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
    const after = await state(email); assert.equal(after.app_ledger.length, 1); assert.equal(after.app_bi_management_log.length, 1);
    assert.equal(after.row.credits_total, 100 + after.app_ledger[0].delta);
  });
  for (const table of ['app_ledger', 'app_bi_management_log', 'app_bi_access_log']) await step(`${table} failure: entire user/batch/ledger/operation/audit rollback`, async () => {
    const email = `${table}@bi-fixture.test`; await seed(email, 2, 10, 2);
    for (const delta of [6, -6]) {
      const cmd = command(email, 'adjust', { delta }), before = await state(email);
      await pool.query(`CREATE OR REPLACE FUNCTION bi_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'bi fixture write failure' USING ERRCODE='P0001'; END $$; CREATE TRIGGER bi_fixture_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION bi_fixture_fail()`);
      try { await assert.rejects(m.manageBiUser(cmd, operator), e => e.code === 'P0001'); }
      finally { await pool.query(`DROP TRIGGER bi_fixture_fail ON ${table}`); }
      assert.deepEqual(await state(email), before);
    }
  });
  await step('noncredit profile audit failure rolls back profile/version', async () => {
    const email = 'profile-failure@bi-fixture.test'; await seed(email); const before = await state(email);
    await pool.query('CREATE TRIGGER bi_fixture_fail BEFORE INSERT ON app_bi_access_log FOR EACH ROW EXECUTE FUNCTION bi_fixture_fail()');
    try { await assert.rejects(m.manageBiUser(command(email, 'profile', { name: 'No commit', phone: 'failure-phone', note: '' }), operator), e => e.code === 'P0001'); }
    finally { await pool.query('DROP TRIGGER bi_fixture_fail ON app_bi_access_log'); }
    assert.deepEqual(await state(email), before);
  });
  await step('actual route: anonymous/nonadmin/banned admin, CSRF, validation, management errors', async () => {
    const email = 'route@bi-fixture.test'; await seed(email); const cmd = command(email, 'profile', { name: 'Route', phone: 'route-phone', note: '' });
    const before = await state(email);
    assert.equal((await api.POST(request(null, cmd))).status, 404);
    assert.equal((await api.POST(request(email, cmd))).status, 404);
    await seed('banned-admin@bi-fixture.test', 0, 0, 0, 'admin'); await pool.query("UPDATE app_users SET banned=true WHERE email='banned-admin@bi-fixture.test'");
    assert.equal((await api.POST(request('banned-admin@bi-fixture.test', cmd))).status, 404);
    assert.equal(await native.activeNativeUserEmail(request(operator, cmd)), operator);
    assert.equal(await db.getUserRole(operator), 'admin');
    assert.equal(await require('../src/lib/admin-auth.ts').requireAdmin(request(operator, cmd)), true, 'native signed admin authorization');
    assert.equal((await api.POST(request(operator, cmd, { origin: 'https://evil.test' }))).status, 403);
    assert.equal((await api.POST(request(operator, cmd, { 'sec-fetch-site': 'cross-site' }))).status, 403);
    assert.equal((await api.POST(request(operator, { ...cmd, unexpected: true }))).status, 400);
    assert.equal((await api.POST(request(operator, { ...cmd, expectedVersion: 3 }))).status, 409);
    assert.equal((await api.POST(request(operator, { ...cmd, email: 'absent@bi-fixture.test' }))).status, 404);
    assert.equal((await api.POST(request(operator, command(email, 'adjust', { delta: -101 })))).status, 402);
    assert.deepEqual(await state(email), before);
    const response = await api.POST(request(operator, cmd, { origin: 'http://fixture.test' })); assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal((await response.json()).version, 1);
    const replay = await api.POST(request(operator, cmd)); assert.equal((await replay.json()).replayed, true);
  });
  await step('route audit SQL error returns uncertain 500 and same nonce retry succeeds once', async () => {
    const email = 'uncertain@bi-fixture.test'; await seed(email); const cmd = command(email, 'adjust', { delta: 6 }), before = await state(email);
    await pool.query('CREATE TRIGGER bi_fixture_fail BEFORE INSERT ON app_bi_access_log FOR EACH ROW EXECUTE FUNCTION bi_fixture_fail()');
    try { const response = await api.POST(request(operator, cmd)); assert.equal(response.status, 500); assert.equal((await response.json()).uncertain, true); }
    finally { await pool.query('DROP TRIGGER bi_fixture_fail ON app_bi_access_log'); }
    assert.deepEqual(await state(email), before);
    assert.equal((await api.POST(request(operator, cmd))).status, 200);
    assert.equal((await state(email)).app_ledger.length, 1);
  });
  await step('self role/ban/reset guards; admin ban rule; last active administrator', async () => {
    const before = await state(operator);
    for (const [action, fields] of [['role', { role: 'user' }], ['ban', { banned: true }], ['reset-password', { password: 'fixture-new-password' }]]) {
      const response = await api.POST(request(operator, command(operator, action, fields)));
      assert.equal(response.status, 403); assert.match((await response.json()).error, /自己的账户/);
    }
    assert.deepEqual(await state(operator), before);
    await assert.rejects(m.manageBiUser(command(operator, 'ban', { banned: true }), 'another-operator'), e => e.status === 403 && /管理员权限/.test(e.message));
    await pool.query("UPDATE app_users SET role='user' WHERE role='admin' AND email<>$1", [operator]);
    await assert.rejects(m.manageBiUser(command(operator, 'role', { role: 'user' }), 'local-admin'), e => e.status === 403 && /最后一个/.test(e.message));
  });
  assert.equal(externalCalls, 0); report.externalCalls = externalCalls;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`BI_USER_MUTATION=${mode.toUpperCase()} PASS checks=${report.checks.length} source_sha256=${report.sourceSha256}`);
  for (const x of report.metrics) console.log(`${x.label}: live=10000 sql=${x.totalSql} caller_batch_sql=${x.callerBatchSql} caller_rows=${x.callerBatchReturned} owner=${x.ownerNowait} tail=${x.tailNowait}`);
  console.log('AUTH=REAL_ROUTE BILLING=REAL_SERVICE PG=REAL_ISOLATED EXTERNAL_CALLS=0');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  pg.Client.prototype.query = query; Module.prototype._compile = compile;
  if (pool) await pool.end(); await observer.end();
});
