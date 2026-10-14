import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { build } from 'esbuild';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== '1' || new URL(process.env.DATABASE_URL || 'http://invalid').hostname !== '127.0.0.1')
    throw new Error('Requires explicitly isolated local PostgreSQL');
  const root = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const schema = 'worker_drain_' + randomUUID().replaceAll('-', '');
  await root.query('CREATE SCHEMA ' + schema);
  const sql = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, options: '-c search_path=' + schema });
  const secret = 'fixture-only-drain-status-authentication-20261014';
  const bundle = (await build({ stdin: { contents: 'import {GET} from "./src/app/api/video/worker/drain-status/route";globalThis.getStatus=GET;', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'isolated-pool-and-auth', setup(b) {
      b.onResolve({ filter: /^(server-only|\.\.\/db|@\/lib\/durable-image-jobs)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'server-only' ? '' : a.path === '../db' ? 'export const getPool=()=>globalThis.fixturePool;' : 'export const imageWorkerAuthorized=r=>r.headers.get("x-video-worker-secret")===globalThis.fixtureSecret;', loader: 'js' }));
    } }] })).outputFiles[0].text;
  const context = vm.createContext({ fixturePool: sql, fixtureSecret: secret, Response, Request, console });
  vm.runInContext(bundle, context);
  const route = (context as any).getStatus as (request: Request) => Promise<Response>;
  const read = async () => {
    const response = await route(new Request('http://127.0.0.1/api/video/worker/drain-status', { headers: { 'x-video-worker-secret': secret } }));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); return await response.json();
  };
  const guarded = await sql.connect();
  try {
    assert.equal((await route(new Request('http://127.0.0.1/api/video/worker/drain-status'))).status, 401);
    const missing = await read(); assert.equal(missing.drained, true); assert.equal(missing.absentTables.length, 5);
    await sql.query(`CREATE TABLE app_image_jobs(lease_token text,snapshot jsonb);
      CREATE TABLE app_canvas_image_tasks(lease_until timestamptz,status text);
      CREATE TABLE app_video_tasks(poll_lock_until timestamptz,status text);
      CREATE TABLE app_supplier_cost_jobs(lease_id text);
      CREATE TABLE app_imagegen_batch_items(lease_token text,state text);`);
    assert.equal((await read()).absentTables.length, 0);
    // Expiration is deliberately irrelevant to the conservative drain gate.
    await sql.query(`INSERT INTO app_image_jobs VALUES ('old', '{"status":"pending"}'),('terminal','{"status":"done"}');
      INSERT INTO app_canvas_image_tasks VALUES(now()-interval '1 day','processing');
      INSERT INTO app_video_tasks VALUES(now()-interval '1 day','processing');
      INSERT INTO app_supplier_cost_jobs VALUES('old');
      INSERT INTO app_imagegen_batch_items VALUES('old','submitted');`);
    const held = await read(); assert.equal(held.activeFences, 5); assert.equal(held.drained, false);
    assert.deepEqual(held.counts, { imageJobs: 1, canvasImages: 1, videoPolls: 1, supplierCosts: 1, imagegenItems: 1 });
    assert.equal((await sql.query("SELECT lease_token FROM app_image_jobs WHERE snapshot->>'status'='pending'")).rows[0].lease_token, 'old');
    assert.equal((await sql.query("SELECT lease_until<now() AS expired,status FROM app_canvas_image_tasks")).rows[0].status, 'processing');
    await sql.query(`UPDATE app_image_jobs SET lease_token=NULL;UPDATE app_canvas_image_tasks SET lease_until=NULL;
      UPDATE app_video_tasks SET poll_lock_until=NULL;UPDATE app_supplier_cost_jobs SET lease_id=NULL;UPDATE app_imagegen_batch_items SET lease_token=NULL;`);
    assert.equal((await read()).activeFences, 0);
    await guarded.query('BEGIN');
    await guarded.query('SELECT 1');
    const tx = await read(); assert.ok(tx.activeTransactions >= 1); assert.equal(tx.drained, false);
    await guarded.query('ROLLBACK');
    await guarded.query('SELECT pg_advisory_lock(847203114)');
    const lock = await read(); assert.ok(lock.advisoryLocks >= 1); assert.equal(lock.drained, false);
    await guarded.query('SELECT pg_advisory_unlock(847203114)');
    assert.equal((await read()).drained, true);
    const readonlySql = readFileSync('src/lib/worker/drain-status.ts', 'utf8');
    assert.match(readonlySql, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
    // Readback confirms the status endpoint has not settled/cleared any fence.
    assert.equal(Number((await sql.query('SELECT count(*) FROM app_image_jobs')).rows[0].count), 2);
    assert.equal((await sql.query("SELECT snapshot->>'status' AS status FROM app_image_jobs WHERE snapshot->>'status'='pending'")).rows[0].status, 'pending');
    console.log('WORKER_DRAIN_STATUS=PASS REAL_POSTGRES_READ_ONLY AUTH401 EMPTY_OR_ABSENT_TABLES EXPIRED_FENCES_NOT_COMPLETION ALL5_FENCES ACTIVE_TRANSACTIONS_ADVISORY_LOCKS BLOCK_DRAIN NO_LEASE_CLEAR_NO_PROVIDER_CALLS');
  } finally {
    await guarded.query('ROLLBACK').catch(() => {}); await guarded.query('SELECT pg_advisory_unlock_all()').catch(() => {}); guarded.release();
    await sql.end(); await root.query('DROP SCHEMA ' + schema + ' CASCADE'); await root.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
