/** Real loopback PostgreSQL + uninstrumented pg Clients in isolated Node processes.
 * No production env, dotenv, supplier, HTTP, browser or business schema bootstrap.
 * --source is a source snapshot (or .); expected baseline failures are assertions.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA']);
for (const key of Object.keys(process.env)) if (!allowed.has(key.toUpperCase())) delete process.env[key];
const { transformSync } = require('esbuild');
const { Client } = require('pg');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 5000;
  while (!(await fn())) { if (Date.now() > end) throw Error('FIXTURE_CONDITION_TIMEOUT'); await delay(10); }
}
function load(root, file, bindings = {}) {
  const filename = path.join(root, file), module = { exports: {} };
  const code = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(
    name => name === 'server-only' ? {} : Object.hasOwn(bindings, name) ? bindings[name] : require(name), module, module.exports);
  return module.exports;
}
async function probe(name, root, database) {
  const url = new URL(database);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/runtime_clients_fixture');
  process.env.DATABASE_URL = database;
  const owner=fs.existsSync(path.join(root,'src/platform/db/pool.ts'))?'src/platform/db/pool.ts':'src/lib/db/connection.ts';
  const connection = load(root, owner), pool = connection.getPool();
  assert.equal(pool.options.max, 5);
  const memory = process.memoryUsage();
  console.log('RUNTIME node=' + process.version + ' rss=' + memory.rss + ' heapUsed=' + memory.heapUsed + ' external=' + memory.external + ' heapLimit=' + require('node:v8').getHeapStatistics().heap_size_limit);
  const admin = new Client({ connectionString: database }); await admin.connect();
  assert.equal((await admin.query('SELECT current_database() name')).rows[0].name, 'runtime_clients_fixture');
  const owned = new Set();
  async function remember(client) { const pid = (await client.query('SELECT pg_backend_pid() pid')).rows[0].pid; owned.add(pid); return pid; }
  async function terminate(pid) {
    assert.ok(owned.has(pid), 'only kill a backend just borrowed by this child');
    assert.equal((await admin.query('SELECT pg_terminate_backend($1) killed', [pid])).rows[0].killed, true);
  }
  function repository() {
    return load(root, 'src/lib/reference-workbench/repository.ts', {
      '../db': { getPool: connection.getPool, ensureSchema: async () => {} },
      '@/platform/db/pool': {getPool:connection.getPool},
      '@/lib/persistence/schema': {ensureSchema:async()=>{}},
      '@/lib/reference-workbench/schema':load(root,'src/lib/reference-workbench/schema.ts',{'@/platform/db/pool':connection,'@/lib/persistence/schema':{ensureSchema:async()=>{}},'@/platform/db/schema-readiness':load(root,'src/platform/db/schema-readiness.ts')}),

      './contract': { WorkbenchError: class WorkbenchError extends Error {} },
    });
  }
  try {
    if (name === 'borrowed-disconnect' || name === 'idle-disconnect' || name === 'closing-disconnect') {
      const client = await pool.connect(), pid = await remember(client);
      if (name === 'idle-disconnect') client.release();
      let close;
      if (name === 'closing-disconnect') close = connection.closeDatabasePools();
      await terminate(pid); await delay(150);
      if (name !== 'idle-disconnect') {
        await assert.rejects(client.query('SELECT 1'));
        client.release(); // driver, not a mock or test listener, evicts the failed connection
      }
      if (close) await close;
      else { await until(() => pool.totalCount === 0); assert.equal((await pool.query('SELECT 1 n')).rows[0].n, 1); }
      console.log('DISCONNECT=HANDLED kind=' + name + ' recovery=1');
    } else if (name === 'query-disconnect') {
      const client = await pool.connect(), pid = await remember(client);
      const query = client.query('SELECT pg_sleep(10)');
      // Attach a rejection consumer immediately, not a Client error listener.
      const error = query.then(() => null, error => error);
      await until(async () => (await admin.query("SELECT wait_event='PgSleep' sleeping FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.sleeping);
      await terminate(pid); const original = await error;
      assert.equal(original.code, '57P01'); await delay(100); client.release();
      await until(() => pool.totalCount === 0);
      console.log('QUERY_DISCONNECT original=57P01 clients=0');
    } else if (name === 'repository-rollback-failure') {
      const repo = repository(); let original, caught;
      const released = []; pool.on('release', error => released.push(!!error));
      try {
        await repo.transaction('runtime-fixture-rollback', async tx => {
          await remember(tx);
          try { await tx.query('SELECT pg_terminate_backend(pg_backend_pid())'); }
          catch (error) { original = error; throw error; }
        });
      } catch (error) { caught = error; }
      assert.ok(original); assert.ok(caught);
      console.log('ROLLBACK original=' + original.code + ' preserved=' + (caught === original) + ' caught=' + caught.message);
      console.log('ROLLBACK_RELEASE discard=' + released.at(-1));
      await delay(100);
      await until(() => pool.totalCount === 0);
    } else if (name === 'transactions') {
      const repo = repository();
      const normal = await repo.transaction('runtime-fixture-normal', async tx => {
        const pid = await remember(tx);
        await tx.query('CREATE TEMP TABLE runtime_values(n int)');
        await tx.query('INSERT INTO runtime_values VALUES (1)'); return pid;
      });
      const client = await pool.connect(); assert.equal(await remember(client), normal); client.release();
      const error = Object.assign(Error('ORIGINAL_APPLICATION_ERROR'), { snapshot: 'RUNTIME_BIG_SNAPSHOT_' + 'x'.repeat(1024 * 1024) });
      await assert.rejects(repo.transaction('runtime-fixture-error', async tx => {
        await tx.query('INSERT INTO runtime_values VALUES (2)'); throw error;
      }), value => value === error);
      assert.equal((await pool.query('SELECT count(*)::int n FROM runtime_values')).rows[0].n, 1);
      await assert.rejects(repo.transaction('runtime-fixture-sql-error', async tx => { await tx.query('SELECT 1/0'); }), value => value.code === '22012');
      const same = await pool.connect(); assert.equal(await remember(same), normal); same.release();
      assert.equal((await admin.query('SELECT state FROM pg_stat_activity WHERE pid=$1', [normal])).rows[0].state, 'idle');
      console.log('TRANSACTIONS commit=1 rollback=1 original=1 sqlError=22012 healthyReuse=1 idle=1');
    } else if (name === 'shared-transaction') {
      const repo = repository(); await repo.ensureWorkbench();
      const id = randomUUID(), owner = 'fixture-owner';
      await repo.transaction('runtime-shared', async tx => {
        await repo.putDocument(owner, 'fixture', id, { n: 1 }, tx);
        assert.deepEqual(await repo.document(owner, 'fixture', id, tx), { n: 1 });
        assert.equal((await admin.query('SELECT count(*)::int n FROM app_reference_documents WHERE id=$1', [id])).rows[0].n, 0);
      });
      assert.deepEqual(await repo.document(owner, 'fixture', id), { n: 1 });
      const error = Error('SHARED_ROLLBACK');
      await assert.rejects(repo.transaction('runtime-shared', async tx => {
        await repo.putDocument(owner, 'fixture', id, { n: 2 }, tx); throw error;
      }), value => value === error);
      assert.deepEqual(await repo.document(owner, 'fixture', id), { n: 1 });
      console.log('SHARED_TRANSACTION outsideBeforeCommit=0 committed=1 rolledBack=1 sameClient=1');
    } else if (name === 'callback-reuse') {
      let previous, listenerCount;
      for (let n = 0; n < 100; n++) await new Promise((resolve, reject) => pool.connect(async (error, client, release) => {
        if (error) return reject(error);
        try {
          if (n) { assert.equal(client, previous); assert.equal(client.listenerCount('error'), listenerCount); }
          previous = client; listenerCount = client.listenerCount('error');
          assert.equal((await client.query('SELECT 1 n')).rows[0].n, 1); release(); resolve();
        } catch (error) { release(error); reject(error); }
      }));
      assert.equal(pool.totalCount, 1); assert.equal(pool.idleCount, 1);
      console.log('CALLBACK_REUSE count=100 clients=1 listenerGrowth=0');
    } else if (name === 'concurrent-reload-late-close') {
      const held = await Promise.all(Array.from({ length: 5 }, () => pool.connect()));
      const originalListeners = held.map(c => c.listenerCount('error'));
      for (let n = 0; n < 25; n++) assert.equal(load(root, owner).getPool(), pool);
      held.forEach((c, n) => assert.equal(c.listenerCount('error'), originalListeners[n]));
      let late = false;
      const pending = pool.connect().then(client => { late = true; client.release(); });
      await delay(40); assert.equal(late, false); assert.equal(pool.waitingCount, 1);
      held.pop().release(); await pending; assert.equal(late, true);
      held.forEach(c => c.release());
      const repo = repository();
      await Promise.all(Array.from({ length: 20 }, (_, n) => repo.transaction('runtime-concurrency-' + n % 3, async tx => {
        assert.equal((await tx.query('SELECT $1::int n', [n])).rows[0].n, n);
      })));
      assert.equal(pool.waitingCount, 0); assert.equal(pool.totalCount, pool.idleCount);
      const client = await pool.connect(); let closed = false;
      const close = connection.closeDatabasePools().then(() => { closed = true; });
      assert.throws(connection.getPool, /DATABASE_POOLS_CLOSING/);
      await delay(30); assert.equal(closed, false);
      assert.equal((await client.query('SELECT 1 n')).rows[0].n, 1); client.release(); await close;
      assert.equal(pool.totalCount, 0);
      const fresh = connection.getPool(); assert.notEqual(fresh, pool);
      assert.equal((await fresh.query('SELECT 1 n')).rows[0].n, 1);
      console.log('LIFECYCLE concurrency=20 reload=25 lateReturned=1 closeDrained=1 nextGeneration=1');
    } else throw Error('UNKNOWN_PROBE');
  } finally { await connection.closeDatabasePools(); await admin.end(); }
  console.log('PROBE=PASS name=' + name);
}
async function controller() {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  for (const key of ['--source', '--expect', '--output']) assert.ok(args.includes(key), key);
  const root = path.resolve(value('--source')), expected = value('--expect'), output = path.resolve(value('--output'));
  assert.ok(['baseline', 'connection-fixed', 'modified'].includes(expected)); fs.mkdirSync(output, { recursive: true });
  const tag = 'runtime-clients-' + randomUUID().slice(0, 8), name = 'naumi-' + tag;
  const runs = [];
  // Explicit local daemon; do not inherit DOCKER_HOST, contexts or credentials.
  const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock';
  function docker(args, required = true) {
    const result = spawnSync('docker', ['--host', endpoint, ...args], { env: process.env, encoding: 'utf8', timeout: 30000 });
    runs.push({ command: ['docker', '--host', endpoint, ...args], input: '', stdout: result.stdout, stderr: result.stderr, exit: result.status });
    if (required) assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }
  let created = false;
  try {
    docker(['run', '-d', '--name', name, '--label', 'io.naumi.runtime-clients=' + tag,
      '--memory', '256m', '--cpus', '1', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e', 'POSTGRES_USER=runtime_fixture', '-e', 'POSTGRES_DB=runtime_clients_fixture', 'postgres:16-alpine']);
    created = true;
    const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
    const database = 'postgresql://runtime_fixture:fixture-password-log-marker@127.0.0.1:' + port + '/runtime_clients_fixture?sslmode=disable';
    for (let n = 0; ; n++) {
      const result = spawnSync('docker', ['--host', endpoint, 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'runtime_fixture', '-d', 'runtime_clients_fixture'], { env: process.env, encoding: 'utf8' });
      if (result.status === 0) break; assert.ok(n < 50); await delay(100);
    }
    for (const scenario of ['borrowed-disconnect', 'idle-disconnect', 'closing-disconnect', 'query-disconnect', 'repository-rollback-failure', 'transactions', 'shared-transaction', 'callback-reuse', 'concurrent-reload-late-close']) {
      const command = [process.execPath, __filename, '--child', scenario, root, database];
      const result = spawnSync(command[0], command.slice(1), { env: process.env, encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
      const record = { scenario, command, input: '', stdout: result.stdout, stderr: result.stderr, exit: result.status, error: result.error?.message };
      runs.push(record); fs.writeFileSync(path.join(output, scenario + '.json'), JSON.stringify(record, null, 2));
      const crashes = ['borrowed-disconnect', 'idle-disconnect', 'closing-disconnect', 'query-disconnect', 'repository-rollback-failure'].includes(scenario);
      assert.equal(result.status, expected === 'baseline' && crashes ? 1 : 0, result.stdout + result.stderr);
      if (expected === 'baseline' && crashes) assert.match(result.stderr, /Unhandled 'error' event/);
      else assert.match(result.stdout, /PROBE=PASS/);
      if (scenario === 'repository-rollback-failure' && expected !== 'baseline') assert.match(result.stdout, new RegExp('preserved=' + (expected === 'modified')));
      if (scenario === 'repository-rollback-failure' && expected !== 'baseline') assert.match(result.stdout, new RegExp('ROLLBACK_RELEASE discard=' + (expected === 'modified')));
      if (expected === 'modified') {
        assert.doesNotMatch(result.stdout + result.stderr, /fixture-password-log-marker|postgresql:\/\/|RUNTIME_BIG_SNAPSHOT_|runtime_fixture/);
        assert.ok(Buffer.byteLength(result.stderr) < 512);
      }
      console.log('CASE ' + scenario + ' exit=' + result.status + ' expected=' + expected + ' PASS');
    }
    console.log('SUITE=PASS cases=9 tier=real-local-PG+Node-child source=' + expected);
  } finally {
    if (created) {
      const label = docker(['inspect', '--format', '{{ index .Config.Labels "io.naumi.runtime-clients" }}', name]);
      assert.equal(label, tag); docker(['rm', '-f', '-v', name]);
      assert.equal(docker(['ps', '-aq', '--filter', 'label=io.naumi.runtime-clients=' + tag]), '');
      console.log('FIXTURE_REMOVED=1 ownLabel=' + tag);
    }
    fs.writeFileSync(path.join(output, 'RUNS.json'), JSON.stringify(runs, null, 2));
  }
}
(process.argv[2] === '--child' ? probe(process.argv[3], path.resolve(process.argv[4]), process.argv[5]) : controller())
  .catch(error => { console.error(error); process.exitCode = 1; });
