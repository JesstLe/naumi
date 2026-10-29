/** Actual borrowed pg Client: no test listener is allowed to hide a process crash. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const input = new URL(process.env.NAUMI_X2_TEST_DATABASE_URL || 'http://invalid');
assert.equal(input.protocol, 'postgresql:');
assert.equal(input.hostname, '127.0.0.1');
assert.equal(input.port, '55432');
assert.equal(input.pathname, '/naumi_x2_isolated');
assert.equal(input.username, 'x2_fixture');
for (const k of Object.keys(process.env)) {
  if (k.startsWith('PG') || k === 'DATABASE_URL' || k.startsWith('NAUMI_DB_') || k === 'NAUMI_TICK_POOL_MAX') delete process.env[k];
}
process.env.DATABASE_URL = input.href;
const source = path.resolve(process.argv[2] || 'src/lib/image-job-repository.ts');
const baseline = process.argv[3] === 'baseline';

async function probe(schema) {
  assert.match(schema, /^heartbeat_connection_[a-f0-9]{32}$/);
  process.env.PGOPTIONS = '-c search_path=' + schema;
  const { getPool, closeDatabasePools } = require(path.join(root, 'src/lib/db/connection.ts'));
  // Load the selected repository bytes, resolving every import against the real
  // application. The only instrumentation delays one SQL and kills its own PID.
  const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(createRequire(path.join(root, 'src/lib/image-job-repository.ts')), module, module.exports);
  const { heartbeatImageJob } = module.exports;
  const pool = getPool(), original = pool.connect.bind(pool);
  const admin = new Pool({ connectionString: input.href, max: 1, ssl: false });
  let terminated;
  pool.connect = async () => {
    const client = await original(), query = client.query.bind(client);
    client.query = (sql, ...args) => {
      if (typeof sql === 'string' && sql.startsWith('SELECT id FROM app_image_jobs')) {
        setTimeout(() => { terminated = admin.query('SELECT pg_terminate_backend($1)', [client.processID]); }, 40);
        return query('SELECT pg_sleep(2)');
      }
      return query(sql, ...args);
    };
    return client;
  };
  try {
    await assert.rejects(heartbeatImageJob('probe', 'token'));
    await terminated;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(pool.totalCount, 0);
    pool.connect = original;
    await heartbeatImageJob('probe', 'token');
    assert.equal((await pool.query("SELECT lease_until > clock_timestamp() AS valid FROM app_image_jobs WHERE id='probe'")).rows[0].valid, true);
    console.log('HEARTBEAT_CONNECTION=HANDLED BAD_CLIENTS=0 NEXT_RENEWAL=PASS');
  } finally { pool.connect = original; await closeDatabasePools(); await admin.end(); }
}

async function main() {
  const admin = new Pool({ connectionString: input.href, max: 1, ssl: false });
  const schema = 'heartbeat_connection_' + randomUUID().replaceAll('-', '');
  try {
    assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name, 'naumi_x2_isolated');
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query(`CREATE TABLE ${schema}.app_image_jobs(id text PRIMARY KEY,lease_token text,lease_until timestamptz);
      INSERT INTO ${schema}.app_image_jobs VALUES('probe','token',now()+interval '120 seconds')`);
    const child = spawnSync(process.execPath, ['--conditions=react-server', '--import=tsx', __filename, source, baseline ? 'baseline' : 'modified', '--probe', schema], {
      cwd: root, env: process.env, encoding: 'utf8', timeout: 20000,
    });
    if (baseline) {
      assert.equal(child.status, 1, child.stdout + child.stderr);
      assert.match(child.stderr, /Unhandled 'error' event/);
      console.log('HEARTBEAT_CONNECTION_BASELINE=REPRODUCED CHILD_EXIT=1 UNHANDLED_CLIENT_ERROR=1');
    } else {
      assert.equal(child.status, 0, child.stdout + child.stderr);
      assert.match(child.stdout, /HEARTBEAT_CONNECTION=HANDLED BAD_CLIENTS=0 NEXT_RENEWAL=PASS/);
      process.stdout.write(child.stdout);
      console.log('HEARTBEAT_CONNECTION_MODIFIED=PASS CHILD_EXIT=0 SUPPLIER_CALLS=0');
    }
  } finally { await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await admin.end(); }
}
(process.argv[4] === '--probe' ? probe(process.argv[5]) : main()).catch(error => { console.error(error); process.exitCode = 1; });
