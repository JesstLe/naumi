/* One exclusive PG, real upload route/service/Sharp/private storage. No provider
 * configuration, supplier traffic, deployed database, or billable operation. */
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/inline-reference-upload');
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function worker() {
  require('tsx/cjs');
  const sharp = require('sharp');
  const db = require('../src/lib/db.ts');
  const native = require('../src/lib/native-auth.ts');
  const route = require('../src/app/api/canvas/image-reference-upload/route.ts');
  const storage = require('../src/lib/storage.ts');
  const settings = require('../src/lib/canvas-node-settings-store.ts');
  const creation = require('../src/lib/saas/creation-context.ts');
  const schema = require('../src/lib/saas/creation-schema.ts');
  let checks = 0;
  const actor = 'upload-owner@example.test', other = 'other@example.test';
  const png = await sharp({ create: { width: 80, height: 60, channels: 4, background: { r: 32, g: 84, b: 160, alpha: 0.7 } } }).png().toBuffer();
  const previews = { thumbnail: await sharp(png).webp().toBuffer(), preview: await sharp(png).webp().toBuffer() };
  const defaultInput = { operationId: randomUUID(), projectKey: 'tree:root-a', parentId: 'root-a', title: '原始参考图.png' };
  const post = async (input = defaultInput, bytes = png, config = {}) => {
    const form = new FormData(); for (const [key, value] of Object.entries(input)) form.set(key, value);
    form.set('image', new File([bytes], input.title, { type: 'image/png' }));
    if (config.previews !== false) for (const [key, value] of Object.entries(previews)) form.set(key, new File([value], key + '.webp', { type: 'image/webp' }));
    const owner = config.owner || actor;
    return route.POST(new Request('http://internal/api/canvas/image-reference-upload', { method: 'POST', headers: {
      ...(config.auth === false ? {} : { cookie: `${native.USER_COOKIE}=${native.signUserSession(owner, Date.now())}` }),
      'x-naumi-workspace': 'personal', 'x-naumi-project-context': input.projectKey,
      ...(config.cross ? { origin: 'https://foreign.test', 'sec-fetch-site': 'cross-site' } : {}),
    }, body: form }));
  };
  try {
    await db.ensureSchema(); await schema.ensureCreationSchema(); await settings.ensureCanvasSettingsSchema();
    await db.getOrCreateUser(actor); await db.getOrCreateUser(other);
    await db.addArtworks(actor, [
      { id: 'root-a', title: 'A', category: 'main', prompt: '', status: 'completed', image: '/media/root-a.png', gradient: '', groupId: 'root-a' },
      { id: 'root-b', title: 'B', category: 'main', prompt: '', status: 'completed', image: '/media/root-b.png', gradient: '', groupId: 'root-b' },
      { id: 'foreign-in-b', title: 'Tenant B', category: 'main', prompt: '', status: 'completed', image: '/media/root-b.png', gradient: '', groupId: 'root-b' },
    ]);
    await db.getPool().query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project','tree:root-a','personal',NULL),($1,'project','tree:root-b','tenant',$2)", [actor, randomUUID()]);
    assert.equal((await post(defaultInput, png, { auth: false })).status, 401); checks++;
    assert.equal((await post(defaultInput, png, { cross: true })).status, 403); checks++;
    const first = await post(); assert.equal(first.status, 201, await first.clone().text()); const saved = await first.json();
    assert.equal((await storage.readManagedObject(saved.image, 64 * 1024 * 1024)).bytes.equals(png), true); checks++;
    const second = await post(); const replay = await second.json(); assert.equal(second.status, 201); assert.equal(replay.id, saved.id); checks++;
    const count = await db.getPool().query("SELECT count(*)::int n FROM app_artworks WHERE id=$1", [saved.id]); assert.equal(count.rows[0].n, 1); checks++;
    const concurrentInput = { ...defaultInput, operationId: randomUUID() };
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => post(concurrentInput).then(async r => ({ status: r.status, body: await r.json() }))));
    assert.deepEqual(concurrent.map(x => x.status), [201, 201, 201, 201]); assert.equal(new Set(concurrent.map(x => x.body.id)).size, 1); checks++;
    assert.equal((await post({ ...defaultInput, title: '另一个名称.png' })).status, 409); checks++;
    const altered = await sharp({ create: { width: 80, height: 60, channels: 3, background: 'red' } }).png().toBuffer();
    assert.equal((await post(defaultInput, altered)).status, 409); checks++;
    const foreign = await post({ ...defaultInput, operationId: randomUUID() }, png, { owner: other }); assert.ok([403, 404, 409].includes(foreign.status)); checks++;
    const alias = await post({ ...defaultInput, operationId: randomUUID(), projectKey: 'tree:foreign-in-b', parentId: 'foreign-in-b' }); assert.ok([403, 404, 409].includes(alias.status)); checks++;
    const parentMismatch = await post({ ...defaultInput, operationId: randomUUID(), parentId: 'foreign-in-b' }); assert.ok([403, 404, 409].includes(parentMismatch.status)); checks++;
    await db.getPool().query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,'root-a','image','{\"locked\":true}'::jsonb)", [actor]);
    assert.equal((await post({ ...defaultInput, operationId: randomUUID() })).status, 409); checks++;
    await db.getPool().query("UPDATE app_canvas_node_settings SET settings='{}'::jsonb WHERE email=$1 AND node_id='root-a'", [actor]);
    await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE id=$1", [saved.id]);
    assert.equal((await post()).status, 410); assert.ok((await db.getPool().query('SELECT deleted_at FROM app_artworks WHERE id=$1', [saved.id])).rows[0].deleted_at); checks++;
    const invalid = await post({ ...defaultInput, operationId: randomUUID() }, Buffer.from('not image')); assert.equal(invalid.status, 422); checks++;
    // A valid small PNG padded beyond the old video-upload limit stays byte-exact.
    const large = Buffer.concat([png, Buffer.alloc(21 * 1024 * 1024 - png.length)]);
    const largeResponse = await post({ ...defaultInput, operationId: randomUUID() }, large);
    assert.equal(largeResponse.status, 201, await largeResponse.clone().text()); const largeReceipt = await largeResponse.json();
    assert.equal((await storage.readManagedObject(largeReceipt.image, 64 * 1024 * 1024)).bytes.equals(large), true); checks++;
    assert.equal((await post({ ...defaultInput, operationId: randomUUID() }, large, { previews: false })).status, 422); checks++;
    const binding = (await db.getPool().query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2", [actor, largeReceipt.id])).rows[0];
    assert.equal(binding.scope_kind, 'personal'); assert.equal(binding.tenant_id, null); checks++;
    const result = { checks, originalHash: createHash('sha256').update(png).digest('hex'), realPg: true, actualRoute: true, actualSharp: true, localStorage: true, suppliers: 0 };
    fs.writeFileSync(path.join(output, 'SERVER_RESULT.json'), JSON.stringify(result, null, 2));
    console.log(`INLINE_REFERENCE_UPLOAD_SERVER=PASS checks=${checks} REAL_PG=1 ACTUAL_ROUTE=1 ORIGINAL_HASH=PRESERVED DUPLICATE_ROWS=0 SUPPLIERS=0`);
  } finally { await db.getPool().end(); }
}

async function parent() {
  let id, pool;
  const label = 'inline-ref-upload-' + randomUUID();
  try {
    id = docker(['run', '-d', '--memory=256m', '--cpus=1', '--label', 'io.naumi.inline-ref-upload=' + label, '-e', 'POSTGRES_PASSWORD=fixture', '-e', 'POSTGRES_DB=fixture', '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
    const inspect = JSON.parse(docker(['inspect', id]))[0];
    const port = Number(inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort), database = `postgres://postgres:fixture@127.0.0.1:${port}/fixture`;
    const { Pool } = require('pg');
    for (let attempt = 0; attempt < 60; attempt++) {
      pool = new Pool({ connectionString: database, connectionTimeoutMillis: 500 });
      try { await pool.query('SELECT 1'); break; } catch (error) { await pool.end(); pool = undefined; if (attempt === 59) throw error; await sleep(250); }
    }
    await pool.end(); pool = undefined;
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(key.toUpperCase())));
    Object.assign(env, { DATABASE_URL: database, PGSSLMODE: 'disable', PGPOOL_MAX: '5', SETTINGS_SECRET: 'inline-upload-local-fixture-only-20261102-0000', NAUMI_MULTI_USER: '1', MEDIA_PRIVATE: '1', STORAGE_DRIVER: 'local', MEDIA_DIR: path.join(output, 'media-' + label), NODE_ENV: 'test' });
    const result = spawnSync(process.execPath, ['--no-experimental-strip-types', '--import', 'tsx', '--conditions=react-server', __filename, 'worker'], { cwd: root, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 });
    fs.writeFileSync(path.join(output, 'server.stdout.txt'), result.stdout || ''); fs.writeFileSync(path.join(output, 'server.stderr.txt'), result.stderr || '');
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); if (result.error) throw result.error; process.exitCode = result.status;
  } finally {
    if (pool) await pool.end();
    if (id) {
      const inspect = JSON.parse(docker(['inspect', id]))[0]; assert.equal(inspect.Config.Labels['io.naumi.inline-ref-upload'], label);
      docker(['stop', id]); docker(['rm', '-v', id]);
      assert.equal(docker(['ps', '-aq', '--filter', 'label=io.naumi.inline-ref-upload=' + label]), '');
      console.log('INLINE_REFERENCE_UPLOAD_FIXTURE_CLEANUP=PASS containers=0');
    }
  }
}
(process.argv[2] === 'worker' ? worker() : parent()).catch(error => { console.error(error); process.exitCode = 1; });
