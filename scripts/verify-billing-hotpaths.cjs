'use strict';
// Real PostgreSQL + actual billing service/repository. Legacy db.ts functions are
// extracted from their AST, not reimplemented. No dotenv, external HTTP or suppliers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || root);
const reportPath = path.resolve(process.argv[3] || 'output/billing-hotpaths.json');
const url = new URL(process.env.NAUMI_BILLING_HOTPATHS_DATABASE_URL || 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55449');
assert.equal(url.pathname, '/naumi_billing_hotpaths');
assert.equal(url.username, 'billing_fixture');
const pool = new Pool({ connectionString: url.href, ssl: false, max: 5, application_name: 'billing-hotpaths-94f72f4f', statement_timeout: 15000 });
const observer = new Pool({ connectionString: url.href, ssl: false, max: 2, application_name: 'billing-hotpaths-observer-94f72f4f', statement_timeout: 15000 });
const traceContext = new AsyncLocalStorage();
const originalConnect = pool.connect.bind(pool);
pool.connect = async function () {
  const client = await originalConnect(), query = client.query.bind(client), release = client.release.bind(client);
  client.query = async function (sql, args) {
    const trace = traceContext.getStore(), start = performance.now();
    try {
      const r = await query(sql, args);
      if (trace) trace.push({ sql, args, rows: r.rowCount, startedMs: start, endedMs: performance.now(), ms: performance.now() - start });
      return r;
    } catch (error) {
      if (trace) trace.push({ sql, args, error: error.code || error.message, startedMs: start, endedMs: performance.now(), ms: performance.now() - start });
      throw error;
    }
  };
  client.release = (...args) => { client.query = query; client.release = release; release(...args); };
  return client;
};
// pool.query's callback checkout must remain supported; use explicit checkout in
// this fixture only (the production transaction implementation remains unchanged).
pool.query = async (sql, args) => { const c = await pool.connect(); try { return await c.query(sql, args); } finally { c.release(); } };
const cache = new Map();
function load(relative) {
  const key = relative.replaceAll('\\', '/');
  if (cache.has(key)) return cache.get(key).exports;
  const name = [key, key + '.ts', key + '.json'].find(p => fs.existsSync(path.join(source, p)) || fs.existsSync(path.join(root, p)));
  assert.ok(name, `Unknown fixture import: ${key}`);
  const file = fs.existsSync(path.join(source, name)) ? path.join(source, name) : path.join(root, name);
  const m = { exports: {} }; cache.set(key, m);
  if (file.endsWith('.json')) { m.exports = JSON.parse(fs.readFileSync(file, 'utf8')); return m.exports; }
  const requireSource = spec => {
    if (spec === 'server-only') return {};
    const next = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? path.join(path.dirname(name), spec).replaceAll('\\', '/') : null;
    if (next === 'src/lib/saas/creation-writer') return { attachBillingCreationTx: async () => {} }; // no creation context in this wallet fixture
    if (next) return load(next);
    return require(spec);
  };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(requireSource, m, m.exports);
  return m.exports;
}
const repository = load('src/lib/billing/repository');
const { createBillingService, withBillingTransaction } = load('src/lib/billing/service');
const { BillingError } = load('src/lib/billing/types');
const service = createBillingService();
function legacy() {
  const file = path.join(source, 'src/lib/db.ts'), text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const names = ['expireDueBatches', 'liveBatchBalance', 'refreshBalance', 'deductPrincipalFIFO'];
  const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  assert.equal(functions.length, names.length);
  const body = functions.map(n => n.getText(ast).replace(/^export\s+/, '')).join('\n');
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('getPool', 'withBillingTransaction', 'BillingError', 'debitTx', js + '\nreturn {' + names.join(',') + '};')(() => pool, withBillingTransaction, BillingError, repository.debitTx);
}
const db = legacy();
const quote = (count = 1, byok = false) => ({ schemaVersion: 1, engineVersion: 1, configVersion: 7,
  facts: { feature: 'image.generate', quantity: count, quality: 'medium', resolution: '1K', metered: true, byok, paidFen: 0, userGroup: 'user' },
  tariff: { enabled: true, unit: 'image', pricing: { mode: 'fixed', credits: 6 }, settlement: { unknown: 'hold', qualityBasis: 'requested', successBasis: 'successful-units', failureBps: 0, byokBps: 0, reserveBps: 10000 }, rules: [] },
  costRates: {}, requestedCredits: byok ? 0 : 6 * count, authorizedCredits: byok ? 0 : 6 * count, reserveCredits: byok ? 0 : 6 * count, matchedRuleId: null, debitOrder: 'expires-first' });
const success = { state: 'succeeded', items: [{ id: 'a', state: 'succeeded' }] };
const op = (id, email, q = quote()) => ({ id, email, quote: q, reason: 'isolated billing fixture', ledgerId: 'led-' + id, fingerprint: id });
const run = action => withBillingTransaction(pool, action);
const records = { evidence: 'real isolated PostgreSQL; actual billing implementation; legacy AST; creation hook fixture; no HTTP/browser', source, postgres: '', checks: [], performance: [], plans: [], audit: {}, supplierCalls: 0 };
async function step(name, fn) { await fn(); records.checks.push(name); }
async function user(email, batches = [100]) {
  await pool.query('INSERT INTO app_users(email,credits_total) VALUES($1,$2)', [email, batches.reduce((a, b) => a + b, 0)]);
  await pool.query(`INSERT INTO app_credit_batches(id,email,amount,remaining,source,created_at,expires_at)
    SELECT $1||'-'||lpad(i::text,8,'0'),$1,n,n,'admin',now()+i*interval '1 second',now()+interval '1 year'+i*interval '1 second'
    FROM unnest($2::int[]) WITH ORDINALITY AS v(n,i)`, [email, batches]);
}
async function state(email) {
  return (await pool.query(`SELECT credits_total,credits_used,
    (SELECT COALESCE(sum(remaining),0)::int FROM app_credit_batches WHERE email=$1 AND expires_at>now()) AS principal,
    (SELECT COALESCE(sum(cost),0)::int FROM app_gen_reservations WHERE email=$1) AS reservations,
    (SELECT COALESCE(sum(delta),0)::int FROM app_ledger WHERE email=$1 AND kind='consume') AS consumed
    FROM app_users WHERE email=$1`, [email])).rows[0];
}
async function schema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
  // Database identity above is exact; this schema belongs exclusively to this fixture.
  await pool.query('DROP SCHEMA IF EXISTS billing_hotpaths CASCADE; CREATE SCHEMA billing_hotpaths');
  await pool.query(`CREATE TABLE billing_hotpaths.app_users(email text PRIMARY KEY,credits_used int NOT NULL DEFAULT 0,credits_total int NOT NULL DEFAULT 0);
    CREATE TABLE billing_hotpaths.app_credit_batches(id text PRIMARY KEY,email text NOT NULL,amount int NOT NULL,remaining int NOT NULL,source text NOT NULL,reason text NOT NULL DEFAULT '',order_id text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,expired boolean NOT NULL DEFAULT false);
    CREATE INDEX app_credit_batches_live_idx ON billing_hotpaths.app_credit_batches(email,expires_at);
    CREATE TABLE billing_hotpaths.app_ledger(id text PRIMARY KEY,email text NOT NULL,delta int NOT NULL,reason text,kind text,created_at timestamptz DEFAULT now(),expires_at timestamptz);
    CREATE TABLE billing_hotpaths.app_gen_reservations(job_id text PRIMARY KEY,email text,cost int);
    CREATE TABLE billing_hotpaths.app_billing_operations(id text PRIMARY KEY,email text,feature text,quote jsonb,request_fingerprint text,state text,ledger_id text,reserved_credits int DEFAULT 0,charged_credits int DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),settlement_result jsonb,result_response jsonb);`);
  // Fresh pool sessions inherit options, including all concurrent transactions.
  pool.options.options = '-c search_path=billing_hotpaths,public';
  observer.options.options = '-c search_path=billing_hotpaths,public';
  // The schema setup session was opened before options were assigned.
  await pool.query('SET search_path=billing_hotpaths,public');
  records.postgres = (await pool.query('SELECT version() AS v')).rows[0].v;
}
async function semantics() {
  await step('zero debit stays a no-op and SQL errors propagate unchanged', async () => {
    const email = 'errors@example.test'; await user(email, [10]);
    await run(async tx => { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, 0, 'expires-first'); });
    const error = Object.assign(Error('fixture-query-failure'), { code: 'XX000' });
    const failing = { query: async () => { throw error; } };
    await assert.rejects(repository.debitTx(failing, email, 1, 'expires-first'), e => e === error);
    await assert.rejects(db.deductPrincipalFIFO({ query: async sql => { if (sql.includes('app_users')) return { rows: [] }; throw error; } }, email, 1), e => e === error);
    assert.equal((await state(email)).principal, 10);
  });
  await step('same-operation 8-way reserve and settle: one charge, one release', async () => {
    const email = 'same@example.test'; await user(email); const input = op('same', email);
    await Promise.all(Array.from({ length: 8 }, () => run(tx => service.reserveTx(tx, input))));
    assert.equal((await state(email)).credits_used, 6);
    await Promise.all(Array.from({ length: 8 }, () => run(tx => service.settleTx(tx, input, success))));
    assert.deepEqual(await state(email), { credits_total: 94, credits_used: 0, principal: 94, reservations: 0, consumed: -6 });
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE id='led-same'")).rows[0].n, 1);
    await assert.rejects(run(tx => service.reserveTx(tx, { ...input, fingerprint: 'different' })), /不同计费操作/);
  });
  await step('partial success and immutable quoted price', async () => {
    const email = 'partial@example.test'; await user(email); const input = op('partial', email, quote(2));
    await run(tx => service.reserveTx(tx, input));
    const result = await run(tx => service.settleTx(tx, input, { state: 'succeeded', items: [{ id: 'a', state: 'succeeded' }, { id: 'b', state: 'failed' }] }));
    assert.equal(result.charge, 6); assert.equal((await state(email)).credits_used, 0);
    assert.equal((await pool.query("SELECT quote->>'configVersion' v FROM app_billing_operations WHERE id='partial'")).rows[0].v, '7');
  });
  await step('UNKNOWN holds principal/reservation; BYOK zero; failed result releases only own hold', async () => {
    const email = 'unknown@example.test'; await user(email);
    const input = op('unknown', email); await run(tx => service.reserveTx(tx, input));
    assert.equal((await run(tx => service.settleTx(tx, input, { state: 'unknown', items: [] }))).state, 'hold');
    assert.deepEqual(await state(email), { credits_total: 100, credits_used: 6, principal: 100, reservations: 6, consumed: 0 });
    const free = op('byok', email, quote(1, true)); await run(tx => service.reserveTx(tx, free));
    assert.equal((await run(tx => service.settleTx(tx, free, success))).charge, 0);
    const failed = op('failed', email); await run(tx => service.reserveTx(tx, failed));
    await run(tx => service.settleTx(tx, failed, { state: 'failed', items: [] }));
    assert.equal((await state(email)).credits_used, 6);
  });
  await step('12 distinct operations on one owner never overspend, mixed legacy/new lock order', async () => {
    const email = 'concurrent@example.test'; await user(email, Array(20).fill(3));
    const inputs = Array.from({ length: 12 }, (_, i) => op('race-' + i, email));
    const reserved = await Promise.allSettled(inputs.map(input => run(tx => service.reserveTx(tx, input))));
    assert.equal(reserved.filter(r => r.status === 'fulfilled').length, 10);
    await Promise.all(inputs.filter((_, i) => reserved[i].status === 'fulfilled').map(input => run(tx => service.settleTx(tx, input, success))));
    assert.deepEqual(await state(email), { credits_total: 0, credits_used: 0, principal: 0, reservations: 0, consumed: -60 });
    const mixed = 'mixed@example.test'; await user(mixed, [10, 10]); const input = op('mixed', mixed);
    await run(tx => service.reserveTx(tx, input));
    await Promise.all([run(tx => service.settleTx(tx, input, success)), run(async tx => { assert.equal(await db.deductPrincipalFIFO(tx, mixed, 7), 7); await repository.syncBalanceTx(tx, mixed); })]);
    assert.equal((await state(mixed)).principal, 7);
  });
  for (const order of ['expires-first', 'created-first']) await step('FIFO ' + order + ': boundaries, ties, expired/empty and shortfall rollback', async () => {
    const email = order + '@example.test'; await user(email, [4, 5, 7, 11]);
    await pool.query("UPDATE app_credit_batches SET expires_at=now()+interval '2 years' WHERE id=$1", [email + '-00000001']);
    await run(async tx => { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, 6, order); await repository.syncBalanceTx(tx, email); });
    assert.deepEqual((await pool.query('SELECT remaining FROM app_credit_batches WHERE email=$1 ORDER BY id', [email])).rows.map(r => r.remaining), order === 'created-first' ? [0, 3, 7, 11] : [4, 0, 6, 11]);
    const before = await state(email);
    await assert.rejects(run(async tx => { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, 100, order); }), /可用积分不足/);
    assert.deepEqual(await state(email), before);
    await pool.query("UPDATE app_credit_batches SET created_at='2020-01-01',expires_at='2035-01-01' WHERE email=$1", [email]);
    await run(async tx => { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, 1, order); });
    const first = (await pool.query('SELECT remaining FROM app_credit_batches WHERE email=$1 AND amount=4', [email])).rows[0].remaining;
    assert.equal(first, order === 'created-first' ? 0 : 3);
  });
  await step('expired batches excluded and expire ledger exactly once', async () => {
    const email = 'expired@example.test'; await user(email, [9, 10]);
    await pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 day' WHERE id=$1", [email + '-00000001']);
    await Promise.all([db.refreshBalance(email), run(async tx => { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, 10, 'expires-first'); await repository.syncBalanceTx(tx, email); })]);
    await db.refreshBalance(email);
    assert.equal((await state(email)).principal, 0);
    assert.deepEqual((await pool.query("SELECT delta FROM app_ledger WHERE email=$1 AND kind='expire'", [email])).rows, [{ delta: -9 }]);
    await assert.rejects(run(tx => db.deductPrincipalFIFO(tx, email, 1)), /可用积分不足/);
    assert.equal(await run(tx => db.deductPrincipalFIFO(tx, email, 0)), 0);
  });
  await step('ledger failure rolls back batch debit, reservation and operation together', async () => {
    const email = 'rollback@example.test'; await user(email, [3, 9]); const input = op('rollback', email);
    await run(tx => service.reserveTx(tx, input)); const before = await state(email);
    await assert.rejects(run(async tx => {
      const query = tx.query.bind(tx);
      tx.query = (sql, args) => { if (sql.startsWith('INSERT INTO app_ledger')) throw Error('fixture-ledger-failure'); return query(sql, args); };
      try { return await service.settleTx(tx, input, success); } finally { tx.query = query; }
    }), /fixture-ledger-failure/);
    assert.deepEqual(await state(email), before);
    assert.equal((await pool.query("SELECT state FROM app_billing_operations WHERE id='rollback'")).rows[0].state, 'reserved');
  });
  await step('refresh waits on owner then sees committed debit, not stale principal', async () => {
    const email = 'refresh-wait@example.test'; await user(email, [100]);
    const holder = await pool.connect(); let reading;
    try {
      await holder.query('BEGIN'); await holder.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE', [email]);
      reading = db.refreshBalance(email); const until = performance.now() + 5000; let waiting = false;
      while (performance.now() < until) {
        waiting = !!(await observer.query("SELECT 1 FROM pg_stat_activity WHERE application_name='billing-hotpaths-94f72f4f' AND wait_event_type='Lock' AND query LIKE '%app_users%'")).rowCount;
        if (waiting) break; await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(waiting, 'must observe real PG wallet lock wait');
      await repository.debitTx(holder, email, 6, 'expires-first'); await repository.syncBalanceTx(holder, email);
      await holder.query('COMMIT'); assert.equal(await reading, 94);
      assert.equal((await state(email)).credits_total, 94);
    } finally { await holder.query('ROLLBACK'); holder.release(); if (reading) await reading; }
  });
  await step('differential FIFO 32 deterministic wallets, exact exhaustion and legacy shortfall', async () => {
    let seed = 7419; const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 32; i++) {
      const email = `differential-${i}@example.test`, amounts = Array.from({ length: 1 + random() % 30 }, () => 1 + random() % 100);
      await user(email, amounts); const total = amounts.reduce((a, b) => a + b), n = i % 4 === 0 ? total : 1 + random() % total;
      const expected = [...amounts]; let need = n;
      for (let k = 0; k < expected.length; k++) { const take = Math.min(expected[k], need); expected[k] -= take; need -= take; }
      await run(async tx => { if (i % 2) await db.deductPrincipalFIFO(tx, email, n); else { await repository.lockWallet(tx, email); await repository.debitTx(tx, email, n, i % 3 ? 'expires-first' : 'created-first'); } });
      assert.deepEqual((await pool.query('SELECT remaining FROM app_credit_batches WHERE email=$1 ORDER BY id', [email])).rows.map(r => r.remaining), expected);
      await assert.rejects(run(tx => db.deductPrincipalFIFO(tx, email, total + 1)), e => e.code === 'INSUFFICIENT_CREDITS' && e.message === '可用积分不足或已到期');
      assert.deepEqual((await pool.query('SELECT remaining FROM app_credit_batches WHERE email=$1 ORDER BY id', [email])).rows.map(r => r.remaining), expected);
    }
  });
}
const debitStatement = sql => (/SELECT id,\s*remaining FROM app_credit_batches/.test(sql) || /WITH ordered AS/.test(sql));
async function measuredDebit(email, amount, legacyPath, order, label, explain = false) {
  const trace = [], begin = performance.now(); let plan;
  await traceContext.run(trace, () => run(async tx => {
    await tx.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE', [email]);
    if (explain) {
      const query = tx.query.bind(tx);
      tx.query = async (sql, args) => {
        if (debitStatement(sql)) {
          await query('SAVEPOINT explain_debit');
          plan = (await query('EXPLAIN(ANALYZE,BUFFERS,TIMING OFF,FORMAT JSON) ' + sql, args)).rows[0]['QUERY PLAN'][0];
          await query('ROLLBACK TO SAVEPOINT explain_debit'); await query('RELEASE SAVEPOINT explain_debit');
        }
        return query(sql, args);
      };
    }
    if (legacyPath) await db.deductPrincipalFIFO(tx, email, amount); else await repository.debitTx(tx, email, amount, order);
    // Independent PG connection probes a tail batch with NOWAIT while the debit
    // transaction still holds locks. This is measurement, not an application writer.
    const c = await observer.connect();
    try {
      await c.query('BEGIN');
      try { await c.query('SELECT id FROM app_credit_batches WHERE id=$1 FOR UPDATE NOWAIT', [email + '-00010000']); records.tailLockFree = true; }
      catch (error) { assert.equal(error.code, '55P03'); records.tailLockFree = false; }
      await c.query('ROLLBACK');
    } finally { c.release(); }
    await tx.query('ROLLBACK'); // benchmark does not spend fixture principal
  }));
  const result = { label, amount, legacyPath, order, ms: performance.now() - begin, queries: trace.length,
    debitQueries: trace.filter(r => debitStatement(r.sql) || /^UPDATE app_credit_batches SET remaining/.test(r.sql)).length,
    returnedBatchRows: trace.filter(r => debitStatement(r.sql)).reduce((n, r) => n + (r.rows || 0), 0), tailLockFree: records.tailLockFree, trace };
  if (plan) records.plans.push({ label, plan });
  records.performance.push(result);
}
async function performanceAudit() {
  await user('hot@example.test', Array(10000).fill(10));
  await user('cold@example.test', [10]);
  await pool.query(`INSERT INTO app_credit_batches(id,email,amount,remaining,source,created_at,expires_at,expired)
    SELECT 'cold-'||i,'cold@example.test',10,10,'admin','2020-01-01','2021-01-01',true FROM generate_series(1,50000) i;
    INSERT INTO app_credit_batches(id,email,amount,remaining,source,created_at,expires_at,expired)
    SELECT 'other-'||i,'other-'||(i%10000)||'@example.test',10,10,'admin','2020-01-01','2021-01-01',true FROM generate_series(1,150000) i;
    ANALYZE app_credit_batches; ANALYZE app_users;`);
  records.audit.fixture = { activeHotOwner: 10000, expiredColdOwner: 50000, activeColdOwner: 1, unrelatedExpired: 150000, analyze: 'local synthetic only' };
  for (const [label, legacyPath, order, amount] of [
    ['new-small', false, 'expires-first', 6], ['legacy-small', true, 'expires-first', 6],
    ['new-created', false, 'created-first', 6], ['new-many', false, 'expires-first', 600],
  ]) {
    for (let round = 0; round < 4; round++) await measuredDebit('hot@example.test', amount, legacyPath, order, label + '-' + round);
    await measuredDebit('hot@example.test', amount, legacyPath, order, label + '-plan', true);
  }
  records.transactions = [];
  // Full service transactions (including operation + owner locks, expiry, sum,
  // ledger and hold release); no observer query inside the measured transaction.
  for (const concurrency of [1, 5]) {
    for (const distribution of ['same-owner', 'distinct-owner']) {
      const owners = Array.from({ length: distribution === 'same-owner' ? 1 : concurrency }, (_, i) => `timed-${concurrency}-${distribution}-${i}@example.test`);
      for (const email of owners) await user(email, Array(1000).fill(10));
      for (let round = 0; round < 3; round++) await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
        const input = op(`timed-${concurrency}-${distribution}-${round}-${i}`, owners[i % owners.length]);
        for (const phase of ['reserve', 'settle']) {
          const trace = [], at = performance.now();
          await traceContext.run(trace, () => run(tx => phase === 'reserve' ? service.reserveTx(tx, input) : service.settleTx(tx, input, success)));
          const begun = trace.find(r => r.sql === 'BEGIN'), committed = trace.find(r => r.sql === 'COMMIT');
          const wallet = trace.find(r => /FROM app_users.*FOR UPDATE/.test(r.sql));
          records.transactions.push({ concurrency, distribution, round, phase, ms: performance.now() - at, statements: trace.length,
            transactionMs: committed.endedMs - begun.startedMs, checkoutMs: begun.startedMs - at,
            walletHeldMs: committed.endedMs - wallet.endedMs,
            walletLockMs: trace.filter(r => /FROM app_users.*FOR UPDATE/.test(r.sql)).reduce((n, r) => n + r.ms, 0), trace });
        }
      }));
      for (const email of owners) { const wallet = await state(email); assert.equal(wallet.credits_used, 0); assert.equal(wallet.principal, wallet.credits_total); assert.equal(wallet.reservations, 0); }
    }
  }
  const readTrace = [];
  await traceContext.run(readTrace, async () => { for (let i = 0; i < 5; i++) await db.refreshBalance('cold@example.test'); });
  records.audit.refresh = { requests: 5, statements: readTrace.length, expiryCalls: readTrace.filter(r => /WITH upd AS/.test(r.sql)).length, sumCalls: readTrace.filter(r => /SUM\(remaining\)/.test(r.sql)).length, trace: readTrace };
  for (const entry of [readTrace.find(r => /WITH upd AS/.test(r.sql)), readTrace.find(r => /SUM\(remaining\)/.test(r.sql))]) {
    const tx = await pool.connect(); try { await tx.query('BEGIN'); const plan = (await tx.query('EXPLAIN(ANALYZE,BUFFERS,TIMING OFF,FORMAT JSON) ' + entry.sql, entry.args)).rows[0]['QUERY PLAN'][0]; records.plans.push({ label: /WITH upd/.test(entry.sql) ? 'repeat-expiry-cold' : 'live-sum-cold', plan }); await tx.query('ROLLBACK'); } finally { tx.release(); }
  }
  records.audit.statements = (await pool.query("SELECT query,calls,rows,total_exec_time,shared_blks_hit,shared_blks_read FROM public.pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query LIKE '%app_credit_batches%' ORDER BY calls DESC")).rows;
}
async function main() {
  await schema(); await pool.query('SELECT public.pg_stat_statements_reset()');
  await semantics(); await performanceAudit();
  const small = records.performance.filter(r => /small-\d$/.test(r.label));
  const many = records.performance.filter(r => /^new-many-\d$/.test(r.label));
  records.budgetFailures = [];
  if (small.some(r => r.returnedBatchRows > 1 || !r.tailLockFree)) records.budgetFailures.push('small debit locks/returns unrelated active batches');
  if (many.some(r => r.debitQueries > 1)) records.budgetFailures.push('multi-batch debit uses per-batch UPDATE roundtrips');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(records, null, 2));
  console.log('SEMANTICS=' + records.checks.length + '/'+ records.checks.length);
  console.log('SMALL_DEBIT_RETURNED_ROWS=' + small[0].returnedBatchRows + ';TAIL_LOCK_FREE=' + small[0].tailLockFree);
  console.log('MULTI_BATCH_DEBIT_QUERIES=' + many[0].debitQueries);
  console.log('REFRESH_5_REQUESTS=' + JSON.stringify({ expiry: records.audit.refresh.expiryCalls, sum: records.audit.refresh.sumCalls, statements: records.audit.refresh.statements }));
  console.log('BUDGET_FAILURES=' + records.budgetFailures.length + ';SUPPLIER_CALLS=0');
  process.exitCode = records.budgetFailures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); await observer.end(); });
