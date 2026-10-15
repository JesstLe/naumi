// Exact deployed module + real isolated PostgreSQL. No supplier/network calls.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const pg = require(process.env.NAUMI_PG_MODULE || '/app/node_modules/pg');
const path = require('node:path');
const root = process.argv[2], mode = process.argv[3];
async function load(file) {
  const factory = require(file), exports = {};
  let resolve, reject;
  const ready = new Promise((a, b) => { resolve = a; reject = b; });
  class ConfigError extends Error { constructor(code, message, status) { super(message); Object.assign(this, { code, status }); } }
  const modules = { 77598: crypto, 60401: { Nj: async () => {} }, 73302: { u: ConfigError }, 74823: {}, 12320: {} };
  function webpack(id) { if (!(id in modules)) throw Error('Unexpected dependency ' + id); return modules[id]; }
  webpack.a = (_m, callback) => callback(dependencies => dependencies, error => error ? reject(error) : resolve());
  webpack.d = (object, getters) => { for (const [name, get] of Object.entries(getters)) Object.defineProperty(object, name, { get }); };
  factory({}, exports, webpack); await ready; return exports;
}
async function main() {
  assert.ok(['BASELINE', 'MODIFIED', 'ROLLBACK'].includes(mode));
  const file = path.join(root, mode === 'MODIFIED' ? 'capacity-modified.cjs' : mode === 'ROLLBACK' ? 'capacity-rollback.cjs' : 'capacity-original.cjs');
  const runtime = await load(file), pool = new pg.Pool({ connectionString: process.env.FIXTURE_DATABASE_URL, max: 16 });
  const previous = process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS;
  process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS = ' geeknow-images , ';
  const leases = [];
  try {
    await pool.query(`DROP TABLE IF EXISTS app_model_provider_leases,app_model_capacity_accounts,app_model_provider_budgets;
      CREATE TABLE app_model_provider_budgets(identity text PRIMARY KEY,max_concurrent int NOT NULL CHECK(max_concurrent>0));
      CREATE TABLE app_model_capacity_accounts(alias text PRIMARY KEY,identity text NOT NULL REFERENCES app_model_provider_budgets(identity));
      CREATE TABLE app_model_provider_leases(identity text NOT NULL REFERENCES app_model_provider_budgets(identity),token uuid PRIMARY KEY,expires_at timestamptz NOT NULL);`);
    const capacity = runtime.qy(pool), limit = { providerId: 'geeknow-images', baseUrl: 'https://fixture.invalid/v1', maxConcurrent: 4, timeoutMs: 1000 };
    const batch = await Promise.allSettled(Array.from({ length: 80 }, () => capacity.acquire(limit)));
    const granted = batch.filter(x => x.status === 'fulfilled').map(x => x.value); leases.push(...granted);
    assert.equal(granted.length, mode === 'MODIFIED' ? 80 : 4);
    for (const result of batch.filter(x => x.status === 'rejected')) assert.equal(result.reason.code, 'PROVIDER_BUSY');
    const summary = await runtime.iK(pool, { providers: [{ id: 'geeknow-images', baseUrl: limit.baseUrl, maxConcurrent: 4 }] });
    assert.equal(summary['geeknow-images'].inFlight, granted.length);
    assert.equal(summary['geeknow-images'].maxConcurrent, mode === 'MODIFIED' ? 0 : 4);
    if (mode === 'MODIFIED') assert.equal(summary['geeknow-images'].unlimited, true);
    for (let i = 0; i < 4; i++) leases.push(await capacity.acquire({ ...limit, providerId: 'other-supplier' }));
    await assert.rejects(capacity.acquire({ ...limit, providerId: 'other-supplier' }), e => e.code === 'PROVIDER_BUSY');
    for (const lease of leases.splice(0)) { await lease.release(); await lease.release(); }
    assert.equal(Number((await pool.query('SELECT count(*) AS n FROM app_model_provider_leases')).rows[0].n), 0);
    process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS = '';
    for (let i = 0; i < 4; i++) leases.push(await capacity.acquire(limit));
    await assert.rejects(capacity.acquire(limit), e => e.code === 'PROVIDER_BUSY');
    for (const lease of leases.splice(0)) await lease.release();
    console.log(`${mode}=PASS; GEEKNOW_ACCEPTED=${granted.length}/80; OTHER_CAP=4; LIVE_LEASE_COUNT=PASS; RELEASE=PASS; POLICY_OFF_CAP=4; UPSTREAM_CALLS=0`);
  } finally {
    for (const lease of leases) await lease.release().catch(() => {});
    await pool.end();
    if (previous === undefined) delete process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS;
    else process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS = previous;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
