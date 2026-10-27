const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const mode = process.argv[2] || 'MODIFIED';
const source = path.resolve(process.argv[3] || '.');
const child = process.argv.includes('--child');
const out = path.resolve('output/video-native-postgres');
function exec(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (r.status !== 0) throw Error((r.stderr || r.stdout || r.error?.message || command + ' failed').replace(/postgres(?:ql)?:\/\/\S+/g, '[fixture-db-url]'));
  return r.stdout.trim();
}

async function runChild() {
  require('tsx/cjs');
  const db = require(path.join(source, 'src/lib/db.ts'));
  const repo = require(path.join(source, 'src/lib/canvas/video-node-repository.ts'));
  const compile = require(path.join(source, 'src/lib/video/prompt.ts')).compileVideoPrompt;
  const pool = db.getPool();
  try {
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/naumi_video_fixture_native_/);
    await repo.ensureVideoNodeSchema();
    const owner = 'native-fixture@example.test', id = 'native-' + crypto.randomUUID(), key = 'tree:' + id;
    const inputs = ['a', 'b'].map(x => ({ id: 'ref-' + x, nodeId: 'asset-' + x, kind: 'image', role: 'reference', value: 'https://fixture.test/' + x }));
    const config = { prompt: '固定 {{ref 1}}，对比 图片2', providerOptions: { seed: 0, cameraFixed: false, opaque: 'keep' } };
    async function save(input) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await repo.saveVideoNodeTx(client, owner, input, key); await client.query('COMMIT'); return result; } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } }
    let node = await save({ id, projectKey: key, expectedRevision: 0, operationId: crypto.randomUUID(), title: '真实事务', config, inputs });
    const request = { id, expectedRevision: node.revision, operationId: crypto.randomUUID(), inputs: [inputs[1], inputs[0]] };
    node = await save(request);
    assert.equal(node.config.prompt, mode === 'MODIFIED' ? '固定 {{ref 2}}，对比 图片1' : config.prompt);
    assert.deepEqual(node.config.providerOptions, config.providerOptions);
    assert.equal((await save(request)).revision, node.revision);
    assert.equal(compile(node.config.prompt, node.inputs).bindings[mode === 'MODIFIED' ? 'ref 2' : 'ref 1'].nodeId, mode === 'MODIFIED' ? 'asset-a' : 'asset-b');
    const results = await Promise.allSettled([1, 2].map(x => save({ id, expectedRevision: node.revision, operationId: crypto.randomUUID(), x })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'VIDEO_NODE_REVISION_CONFLICT').length, 1);
    node = await repo.getVideoNode(owner, id);
    node = await save({ id, expectedRevision: node.revision, operationId: crypto.randomUUID(), inputs: [inputs[1]], config: node.config });
    if (mode === 'MODIFIED') { assert.ok(node.config.prompt.includes('{{ref 0}}')); assert.throws(() => compile(node.config.prompt, node.inputs), /已移除/); }
    else assert.ok(!node.config.prompt.includes('{{ref 0}}'));
    const operationRows = await pool.query('SELECT count(*)::int AS n FROM app_canvas_video_node_operations WHERE email=$1', [owner]);
    assert.equal(operationRows.rows[0].n, 4);
    console.log(`${mode}_POSTGRES=PASS REAL_TRANSACTIONS=4 REPLAY=IDEMPOTENT CONCURRENT_REVISION=ONE_WINNER ZERO_FALSE_UNKNOWN=PRESERVED REFERENCE_IDENTITY=${mode === 'MODIFIED' ? 'STABLE' : 'OLD_RETARGET_REPRODUCED'} SUPPLIER_CALLS=0`);
  } finally { await pool.end(); }
}

async function main() {
  if (child) return runChild();
  fs.mkdirSync(out, { recursive: true });
  const tag = 'video-native-' + crypto.randomUUID(), password = crypto.randomBytes(24).toString('hex'), database = 'naumi_video_fixture_native_' + crypto.randomBytes(6).toString('hex');
  const envFile = path.join(out, tag + '.env');
  fs.writeFileSync(envFile, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
  let container;
  try {
    container = exec('docker', ['run', '--detach', '--rm', '--name', tag, '--label', 'naumi.task=canvas-video-native-20261027', '--memory', '384m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432', '--env-file', envFile, 'postgres:16-alpine']);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', database], { windowsHide: true, encoding: 'utf8' });
      if (r.status === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'Isolated PostgreSQL readiness');
    const port = Number(exec('docker', ['port', container, '5432/tcp']).split(':').at(-1));
    const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`, NAUMI_VERIFY_ISOLATED_DB: '1', NAUMI_VIDEO_WORKER: '0', SETTINGS_SECRET: crypto.randomBytes(32).toString('hex') };
    const result = exec(process.execPath, ['--conditions', 'react-server', __filename, mode, source, '--child'], { env });
    console.log(result);
  } finally {
    if (container) {
      const label = exec('docker', ['inspect', '--format', '{{index .Config.Labels "naumi.task"}}', container]);
      assert.equal(label, 'canvas-video-native-20261027');
      exec('docker', ['rm', '--force', container]);
    }
    if (path.resolve(envFile).startsWith(out + path.sep)) fs.unlinkSync(envFile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
