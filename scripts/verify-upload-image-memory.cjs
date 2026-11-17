// Real upload route + Sharp + storage/asset orchestration; synthetic auth, SQL and
// object-store transport. No .env, network, server, container or provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {crc32} = require('node:zlib');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'output/capacity-upload-memory-20261029');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP'].includes(key.toUpperCase())));
// Re-exec before loading native modules. Windows key casing is not significant.
if (!process.argv.includes('--isolated')) {
  const child = spawnSync(process.execPath, ['--expose-gc', __filename, ...process.argv.slice(2), '--isolated'],
    {env: cleanEnv, stdio: 'inherit'});
  process.exit(child.status ?? 1);
}
const sharp = require('sharp');
const ts = require('typescript');
const source = path.resolve(process.argv[2] || root);
const mode = process.argv[3] || 'modified';
const command = process.argv[4] || 'suite';
assert.ok(['baseline', 'modified', 'rollback'].includes(mode));
const fixtures = path.join(output, 'fixtures');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = 'upload-fixture@example.test';
const records = [];
let calls = [];
const nativeBuffer = sharp.prototype.toBuffer;
sharp.prototype.toBuffer = async function (...args) {
  const entry = {raw: this.options.formatOut === 'raw', inputRaw: !!this.options.input?.rawChannels,
    width: this.options.width, height: this.options.height, length: 0, failed: false};
  calls.push(entry);
  try {
    const result = await nativeBuffer.apply(this, args);
    entry.length = (Buffer.isBuffer(result) ? result : result.data).length;
    return result;
  } catch (error) { entry.failed = true; throw error; }
};

async function generate() {
  fs.mkdirSync(fixtures, {recursive: true});
  const raw = Buffer.alloc(96 * 64 * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = (i * 13) % 256; raw[i + 1] = (i >>> 8) % 256;
    raw[i + 2] = 160; raw[i + 3] = i % 12 ? 180 : 0;
  }
  const input = () => sharp(raw, {raw: {width: 96, height: 64, channels: 4}});
  await input().png().toFile(path.join(fixtures, 'transparent.png'));
  await input().jpeg().withMetadata({orientation: 6}).toFile(path.join(fixtures, 'exif.jpeg'));
  await input().avif().toFile(path.join(fixtures, 'static.avif'));
  await input().gif().toFile(path.join(fixtures, 'static.gif'));
  const animation = Buffer.alloc(32 * 32 * 4 * 2, 180);
  animation.fill(60, 32 * 32 * 4); // Distinct frames: encoders otherwise collapse identical frames.
  await sharp(animation, {raw: {width: 32, height: 64, channels: 4, pageHeight: 32}})
    .gif({delay: [100, 100], loop: 0}).toFile(path.join(fixtures, 'animated.gif'));
  await sharp(animation, {raw: {width: 32, height: 64, channels: 4, pageHeight: 32}})
    .webp({delay: [100, 100], loop: 0}).toFile(path.join(fixtures, 'animated.webp'));
  for (const format of ['png', 'jpeg', 'webp']) {
    await sharp({create: {width: 8000, height: 8000, channels: 4,
      background: {r: 25, g: 100, b: 200, alpha: 0.6}}})[format]()
      .toFile(path.join(fixtures, '64mp.' + format));
  }
  await sharp({create: {width: 2300, height: 2300, channels: 3, background: '#3070a0'}})
    .png({compressionLevel: 0}).toFile(path.join(fixtures, 'browser-large.png'));
  const png = fs.readFileSync(path.join(fixtures, 'transparent.png'));
  const malicious = Buffer.from(png);
  malicious.writeUInt32BE(8001, 16); malicious.writeUInt32BE(8000, 20);
  malicious.writeUInt32BE(crc32(malicious.subarray(12, 29)), 29);
  fs.writeFileSync(path.join(fixtures, 'over-pixels.png'), malicious);
  const manifest = fs.readdirSync(fixtures).map(name => {
    const bytes = fs.readFileSync(path.join(fixtures, name));
    return {name, bytes: bytes.length, sha256: sha(bytes)};
  });
  fs.writeFileSync(path.join(output, 'INPUTS.json'), JSON.stringify(manifest, null, 2));
  console.log('FIXTURES=PASS FILES=' + manifest.length + ' NETWORK=0');
}

function fixture() {
  const uploads = new Map(), assets = new Map(), artworks = new Map(), objects = new Map();
  const state = {reads: 0, writes: 0, clients: 0, transactions: 0, locks: new Set(), responses: [],
    failWrite: false, failRead: false, failArtwork: false, streams: 0, unhandled: []};
  const result = rows => ({rows, rowCount: rows.length});
  async function query(sql, a = []) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('CREATE TABLE')) return result([]);
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      state.transactions += sql === 'BEGIN' ? 1 : -1; return result([]);
    }
    if (sql === "SET LOCAL lock_timeout='750ms'") {
      assert.ok(state.transactions > 0); return result([]);
    }
    if (sql.startsWith('SELECT pg_try_advisory_lock')) {
      const acquired = !state.locks.has(a[0]); if (acquired) state.locks.add(a[0]);
      return result([{acquired}]);
    }
    if (sql.startsWith('SELECT pg_advisory_unlock')) { state.locks.delete(a[0]); return result([{}]); }
    if (sql.startsWith('SELECT count(*)::int n')) {
      const rows = [...uploads.values()].filter(r => r.owner === a[0] && !r.committed_id && +new Date(r.expires_at) > Date.now());
      return result([{n: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0)}]);
    }
    if (sql.startsWith('INSERT INTO app_media_uploads')) {
      uploads.set(a[0], {id: a[0], owner: a[1], staging_key: a[2], content_type: a[3], bytes: a[4], expires_at: new Date(Date.now() + 600_000)});
      return result([{}]);
    }
    if (/^SELECT (\*|asset_key) FROM app_media_uploads/.test(sql)) {
      const r = uploads.get(a[0]); return result(r?.owner === a[1] ? [{...r}] : []);
    }
    if (sql.startsWith('UPDATE app_media_uploads')) {
      const r = uploads.get(a[0]); if (r?.owner !== a[1]) return result([]);
      if (sql.includes('asset_key=')) r.asset_key ||= a[2]; else r.committed_id = a[2];
      return result([{...r}]);
    }
    if (/^SELECT (\*|owner,sha256|key,owner,public,remote_ready,content_type,sha256,bytes,width,height,thumbnail_key,preview_key) FROM app_media_assets/.test(sql)) {
      return result(assets.has(a[0]) ? [{...assets.get(a[0])}] : []);
    }
    if (sql.startsWith('WITH candidate AS MATERIALIZED ( SELECT key FROM app_media_assets') && sql.includes('SET variant_claim_id=$5')) {
      const row=assets.get(a[0]);
      if(!row||row.sha256!==a[1]||row.owner!==a[2]||row.public!==a[3]||
        row.thumbnail_key&&row.preview_key||row.variant_claim_until>Date.now()||state.locks.has('media-variants:'+a[0]))return result([]);
      row.variant_claim_id=a[4];row.variant_claim_until=Date.now()+60_000*a[5];
      return result([{key:a[0]}]);
    }
    if (sql.startsWith('WITH candidate AS ( SELECT key FROM app_media_assets') && sql.includes('SET variant_claim_id=NULL')) {
      const row=assets.get(a[0]);
      if(row?.variant_claim_id===a[1]){row.variant_claim_id=null;row.variant_claim_until=null;}
      return result([]);
    }
    if (sql.startsWith('INSERT INTO app_media_assets')) {
      const old = assets.get(a[0]);
      if (sql.includes('WHERE app_media_assets.owner=') && old && (old.owner !== a[1] || old.sha256 !== a[5])) return result([]);
      if (sql.includes('DO NOTHING') && old) return result([]);
      let row;
      if (sql.includes("false,$3")) row = {key: a[0], owner: a[1], public: false, driver: a[2], remote_ready: a[3], content_type: a[4], sha256: a[5], bytes: a[6], width: a[7], height: a[8]};
      else if (sql.includes("'image/webp'")) row = {key: a[0], owner: a[1], public: a[2], driver: a[3], remote_ready: a[4], content_type: 'image/webp', sha256: a[5], bytes: a[6], width: a[7], height: a[8]};
      else row = {key: a[0], owner: old?.owner || a[1], public: a[2], driver: a[3], remote_ready: a[4], content_type: a[5], sha256: a[6], bytes: a[7], width: old?.width ?? null, height: old?.height ?? null};
      if(sql.includes('app_media_assets.bytes=EXCLUDED.bytes')&&old&&
        (old.owner!==row.owner||old.public!==row.public||old.sha256!==row.sha256||old.bytes!==row.bytes))return result([]);
      if(sql.includes('variant_claim_id=CASE')&&old&&(old.sha256!==row.sha256||old.owner==null&&row.owner!=null)){
        row.variant_claim_id=null;row.variant_claim_until=null;
        if(old.sha256!==row.sha256){row.thumbnail_key=null;row.preview_key=null;}
      }
      assets.set(a[0], {...old, ...row}); return result([{key: a[0]}]);
    }
    if (sql.startsWith('UPDATE app_media_assets SET thumbnail_key')) {
      const row = assets.get(a[0]); if (!row) return result([]);
      if(a.length===9){
        if(row.sha256!==a[1]||row.owner!==a[2]||row.public!==a[3]||row.variant_claim_id!==a[4]||
          !(row.variant_claim_until>Date.now())||row.thumbnail_key&&row.preview_key)return result([]);
        Object.assign(row,{thumbnail_key:a[5],preview_key:a[6],width:a[7],height:a[8],variant_claim_id:null,variant_claim_until:null});
        return result([{key:a[0]}]);
      }
      if (a.length === 6 && row.sha256 !== a[5] || a.length === 4 && row.owner !== a[3]) return result([]);
      if (a.length === 5 && (row.owner !== a[3] || row.sha256 !== a[4])) return result([]);
      row.thumbnail_key = a[1]; row.preview_key = a[2];
      if (a.length === 6) { row.width = a[3]; row.height = a[4]; }
      return result([{key: a[0]}]);
    }
    state.unhandled.push(sql);throw Error('UNHANDLED_FIXTURE_SQL: ' + sql);
  }
  const pool = {query, connect: async () => {
    state.clients++; let released = false;
    return {query, release() { assert.equal(released, false); released = true; state.clients--; }};
  }};
  const mock = {
    'src/lib/db': {dbEnabled: true, ensureSchema: async () => {}, getPool: () => pool,
      listArtworksByIds: async (email, ids) => ids.map(id => artworks.get(email + ':' + id)).filter(Boolean),
      addArtworks: async (email, rows) => { if (state.failArtwork) throw Error('FIXTURE_ARTWORK_FAILURE'); for (const r of rows) artworks.set(email + ':' + r.id, r); },
      setArtworkPosition: async () => {}},
    'src/lib/request-auth': {authenticatedEmail: async request => request.headers.get('x-fixture-owner')},
    'src/lib/bi/model-observer': {currentBiContext: () => undefined},
    'src/lib/release-runtime/background-activity': {withBackgroundActivity: (_a, _b, _c, fn) => fn(), bindBackgroundClaim: async () => {}},
    'src/lib/object-storage/adapter': {safeStorageKey: key => key, createObjectStorage: () => ({
      presign: async (_method, key) => 'https://fixture.invalid/' + key,
      put: async (key, bytes, mime) => { if (state.failWrite) throw Error('FIXTURE_WRITE_FAILURE');
        assert.equal(state.transactions, 0, 'No object I/O inside transaction'); state.writes++;
        if(key.startsWith('media-variants/v2/'))assert.equal(state.clients,0,'variant storage I/O must not hold a checked-out connection');
        objects.set(key, {bytes: Buffer.from(bytes), mime}); },
      get: async key => {
        state.reads++; const item = objects.get(key); assert.ok(item, 'FIXTURE_OBJECT_EXISTS');
        let sent = false; state.streams++;
        const body = new ReadableStream({pull(controller) {
          if (state.failRead) { state.streams--; controller.error(new DOMException('fixture abort', 'AbortError')); return; }
          if (sent) { state.streams--; controller.close(); return; }
          sent = true; controller.enqueue(item.bytes);
        }, cancel() { state.streams--; }});
        const response = new Response(body, {headers: {'content-type': item.mime, 'content-length': String(item.bytes.length)}});
        state.responses.push(response); return response;
      },
    })},
  };
  // This worktree already split the original db facade into its real I/O owners.
  // Keep exactly the same synthetic SQL/auth/artwork transport boundary; do not
  // load the old monolith (and UI catalog) or stub image decoding/storage rules.
  mock['src/platform/db/pool'] = {dbEnabled: true, getPool: () => pool};
  mock['src/lib/persistence/schema'] = {ensureSchema: async () => {}};
  mock['src/lib/artworks/repository'] = {listArtworksByIds: mock['src/lib/db'].listArtworksByIds};
  mock['src/lib/artworks/writer'] = {addArtworks: mock['src/lib/db'].addArtworks};
  mock['src/lib/canvas/artwork-repository'] = {setArtworkPosition: mock['src/lib/db'].setArtworkPosition};
  const cache = new Map();
  const context = vm.createContext({console, Buffer, URL, Request, Response, Headers, FormData, File, ReadableStream,
    AbortController, AbortSignal, DOMException, setTimeout, clearTimeout, setInterval, clearInterval,
    process: {env: {STORAGE_DRIVER: 's3', MEDIA_PRIVATE: '1', S3_ENDPOINT: 'https://fixture.invalid',
      S3_ACCESS_KEY_ID: 'fixture', S3_SECRET_ACCESS_KEY: 'fixture', S3_BUCKET: 'fixture', MEDIA_DIR: path.join(output, 'unused-mirror')}},
    fetch: () => { throw Error('NETWORK_FORBIDDEN'); }});
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel).exports;
    const file = [source, root].map(r => path.join(r, rel)).find(p => fs.existsSync(p)); assert.ok(file, rel);
    const mod = {exports: {}}; cache.set(rel, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
    const req = spec => {
      if (spec === 'server-only') return {};
      if (spec === 'sharp') return sharp;
      const target = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)) : null;
      if (!target) return require(spec);
      if (mock[target]) return mock[target];
      return load(target + '.ts');
    };
    vm.runInContext('(function(require,module,exports){' + code + '\n})', context, {filename: file})(req, mod, mod.exports);
    return mod.exports;
  }
  const route = load('src/app/api/media/uploads/route.ts');
  async function post(payload, previews, email = owner, signal) {
    let body = JSON.stringify(payload), headers = {'x-fixture-owner': email};
    if (previews) {
      body = new FormData(); body.append('payload', JSON.stringify(payload));
      for (const [name, bytes] of Object.entries(previews)) body.append(name, new File([bytes], name + '.webp', {type: 'image/webp'}));
    } else headers['content-type'] = 'application/json';
    const response = await route.POST(new Request('https://fixture.invalid/api/media/uploads', {method: 'POST', body, headers, signal}));
    return {status: response.status, body: await response.json()};
  }
  function seed(bytes, mime = 'image/png', name = 'input', extra = {}) {
    const h = sha(Buffer.from(name)), id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    const row = {id, owner, staging_key: 'pending-uploads/' + id, content_type: mime, bytes: bytes.length,
      expires_at: new Date(Date.now() + 600_000), ...extra};
    uploads.set(id, row); objects.set(row.staging_key, {bytes, mime}); return row;
  }
  function released() {
    assert.equal(state.clients, 0); assert.equal(state.transactions, 0); assert.equal(state.locks.size, 0);
    assert.equal(state.streams, 0); assert.ok(state.responses.every(r => !r.body.locked));
  }
  return {post, seed, state, assets, artworks, objects, uploads, released, route};
}

const read = name => fs.readFileSync(path.join(fixtures, name));
async function previewsFor(bytes) {
  const thumbnail = await sharp(bytes).rotate().resize({width: 512, height: 512, fit: 'inside', withoutEnlargement: true}).webp().toBuffer();
  const preview = await sharp(bytes).rotate().resize({width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true}).webp().toBuffer();
  return {thumbnail, preview};
}
function record(name, extra = {}) { records.push({name, ...extra}); console.log('PASS ' + name + (Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '')); }
async function success(name, bytes, mime, previews) {
  const f = fixture(), row = f.seed(bytes, mime, name); calls = [];
  const result = await f.post({action: 'complete', id: row.id}, previews);
  assert.deepEqual(f.state.unhandled,[],name+': unsupported fixture statements');
  assert.equal(result.status, 200, name + ': ' + JSON.stringify(result));
  const asset = f.assets.get(row.asset_key), saved = f.objects.get(row.asset_key);
  assert.equal(sha(saved.bytes), sha(bytes)); assert.equal(asset.sha256, sha(bytes));
  const meta = await sharp(bytes).metadata(); const swap = meta.orientation >= 5 && meta.orientation <= 8;
  assert.equal(result.body.width, swap ? meta.height : meta.width); assert.equal(result.body.height, swap ? meta.width : meta.height);
  const summary = {status: result.status, width: result.body.width, height: result.body.height, sha256: sha(saved.bytes),
    thumbnail: sha(f.objects.get(asset.thumbnail_key).bytes), preview: sha(f.objects.get(asset.preview_key).bytes)};
  if (!previews) {
    const raw = calls.filter(c => c.raw && !c.inputRaw);
    assert.equal(raw.length, 2, 'validation and existing variant decode');
    assert.equal(raw[0].length <= 4, mode === 'modified');
    summary.validationBytes = raw[0].length;
  }
  const reads = f.state.reads, writes = f.state.writes, previous = calls.length;
  assert.equal((await f.post({action: 'complete', id: row.id})).status, 200);
  assert.equal(f.state.reads, reads); assert.equal(f.state.writes, writes); assert.equal(calls.length, previous);
  f.released(); record(name, summary); return summary;
}
async function rejection(name, bytes, expected, {mime = 'image/png', previews, extra = {}, email = owner} = {}) {
  const f = fixture(), row = f.seed(bytes, mime, name, extra); calls = [];
  const result = await f.post({action: 'complete', id: row.id}, previews, email);
  assert.equal(result.status, expected, name + ': ' + JSON.stringify(result));
  assert.equal(f.state.writes, 0); assert.equal(f.artworks.size, 0); f.released(); record(name, {status: result.status});
}
async function suite() {
  const small = read('transparent.png');
  await success('transparent-original-and-retry', small, 'image/png');
  await success('exif-original-and-oriented-variants', read('exif.jpeg'), 'image/jpeg');
  for (const [name, mime] of [['static.gif', 'image/gif'], ['static.avif', 'image/avif'], ['animated.gif', 'image/gif'], ['animated.webp', 'image/webp']]) {
    if (name.startsWith('animated.')) assert.equal((await sharp(read(name)).metadata()).pages, 2);
    await success(name + '-existing-first-frame-contract', read(name), mime);
  }
  for (const ext of ['png', 'jpeg', 'webp']) await success('64mp-' + ext, read('64mp.' + ext), 'image/' + ext);
  const large = read('browser-large.png'); assert.ok(large.length > 12 * 1024 * 1024);
  await success('browser-previews-large-original', large, 'image/png', await previewsFor(large));
  await success('browser-previews-exif', read('exif.jpeg'), 'image/jpeg', await previewsFor(read('exif.jpeg')));
  const exact = Buffer.alloc(12 * 1024 * 1024); small.copy(exact);
  await success('no-previews-12MiB-exact', exact, 'image/png');
  await rejection('no-previews-12MiB-plus-one', Buffer.concat([exact, Buffer.alloc(1)]), 422);
  await rejection('bad-image', Buffer.from('not an image'), 503);
  await rejection('malicious-pixel-dimensions', read('over-pixels.png'), 503);
  await rejection('mime-mismatch', small, 422, {mime: 'image/jpeg'});
  await rejection('size-mismatch', small, 422, {extra: {bytes: small.length + 1}});
  await rejection('owner-mismatch', small, 404, {email: 'other@example.test'});
  await rejection('expired', small, 410, {extra: {expires_at: new Date(0)}});
  await rejection('anonymous', small, 401, {email: ''});
  for (const ext of ['png', 'jpeg']) {
    const bytes = read('64mp.' + ext);
    for (const ratio of [0.5, 0.9, 0.99]) {
      const truncated = bytes.subarray(0, Math.floor(bytes.length * ratio));
      const meta = await sharp(truncated, {failOn: 'error'}).metadata(); assert.equal(meta.width, 8000);
      await rejection('metadata-readable-decode-failure-' + ext + '-' + ratio, truncated, 503, {mime: 'image/' + ext});
    }
  }
  await rejection('truncated-webp', read('64mp.webp').subarray(0, Math.floor(read('64mp.webp').length * 0.8)), 503, {mime: 'image/webp'});
  {
    // Keep RIFF/chunk lengths internally consistent: metadata succeeds but the
    // last 1% of the VP8 raster is absent. This is not a header-only rejection.
    const bytes = read('64mp.webp');
    const truncated = Buffer.from(bytes.subarray(0, Math.floor(bytes.length * 0.99) & ~1));
    truncated.writeUInt32LE(truncated.length - 8, 4);
    for (let i = 12; i + 8 < truncated.length;) {
      const n = truncated.readUInt32LE(i + 4);
      if (i + 8 + n > truncated.length) { truncated.writeUInt32LE(truncated.length - i - 8, i + 4); break; }
      i += 8 + n + n % 2;
    }
    assert.equal((await sharp(truncated).metadata()).width, 8000);
    await rejection('metadata-readable-decode-failure-webp-0.99', truncated, 503, {mime: 'image/webp'});
  }
  const previews = await previewsFor(small);
  await rejection('corrupt-browser-preview', small, 503, {previews: {...previews, preview: previews.preview.subarray(0, Math.floor(previews.preview.length * 0.8))}});
  await rejection('wrong-browser-preview-dimensions', large, 503, {previews});
  await rejection('animated-original-with-previews-rejected', read('animated.webp'), 503,
    {mime: 'image/webp', previews: await previewsFor(read('animated.webp'))});
  {
    const f = fixture();
    for (const [bytes, status] of [[1, 200], [64 * 1024 * 1024, 200], [64 * 1024 * 1024 + 1, 400]])
      assert.equal((await f.post({action: 'prepare', bytes, contentType: 'image/png'})).status, status);
    f.released(); record('prepare-64MiB-byte-boundary');
  }
  {
    const f = fixture(), row = f.seed(small);
    assert.equal((await f.post({action: 'complete', id: row.id, parentId: 'missing-parent'})).status, 404);
    assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0); f.released(); record('parent-owner-check-before-decode');
  }
  {
    const f = fixture(), row = f.seed(small), key = `canvas-uploads/${row.id}-${sha(small).slice(0, 24)}.png`;
    f.assets.set(key, {key, owner: 'other@example.test', sha256: sha(small)});
    assert.equal((await f.post({action: 'complete', id: row.id}, previews)).status, 503);
    assert.equal(f.state.writes, 0); assert.equal(f.artworks.size, 0); f.released(); record('browser-original-existing-key-owner-rejection');
  }
  {
    const f = fixture(), row = f.seed(small); f.state.failArtwork = true;
    assert.equal((await f.post({action: 'complete', id: row.id})).status, 503);
    assert.ok(row.asset_key); const count = calls.length, reads = f.state.reads, writes = f.state.writes;
    f.objects.delete(row.staging_key); f.state.failArtwork = false;
    assert.equal((await f.post({action: 'complete', id: row.id})).status, 200);
    assert.equal(calls.length, count); assert.equal(f.state.reads, reads); assert.equal(f.state.writes, writes);
    f.artworks.clear(); assert.equal((await f.post({action: 'complete', id: row.id})).status, 410);
    f.released(); record('existing-asset-retry-without-staging-or-decode-and-deleted-artwork');
  }
  {
    const f = fixture(), row = f.seed(small); f.state.failWrite = true;
    assert.equal((await f.post({action: 'complete', id: row.id})).status, 503); assert.equal(f.artworks.size, 0); f.released();
    f.state.failWrite = false; assert.equal((await f.post({action: 'complete', id: row.id})).status, 200); f.released();
    record('storage-failure-release-and-same-id-retry');
  }
  {
    const f = fixture(), row = f.seed(small); f.state.failRead = true;
    assert.equal((await f.post({action: 'complete', id: row.id})).status, 503); assert.equal(f.state.writes, 0); f.released();
    f.state.failRead = false; assert.equal((await f.post({action: 'complete', id: row.id})).status, 200); f.released();
    record('object-stream-abort-unlocks-and-retry');
  }
  {
    const f = fixture(), body = new ReadableStream({start(c) {c.error(new DOMException('fixture abort', 'AbortError'));}});
    const request = new Request('https://fixture.invalid', {method: 'POST', body, duplex: 'half',
      headers: {'x-fixture-owner': owner, 'content-type': 'multipart/form-data; boundary=fixture'}});
    assert.equal((await f.route.POST(request)).status, 400); assert.equal(request.body.locked, false); f.released();
    record('multipart-body-abort-unlocks');
  }
  {
    const f = fixture(), rows = Array.from({length: 3}, (_, i) => f.seed(small, 'image/png', 'concurrent-' + i));
    const result = await Promise.all(rows.map(r => f.post({action: 'complete', id: r.id})));
    assert.ok(result.every(r => r.status === 200)); assert.equal(f.artworks.size, 3); f.released();
    const row = f.seed(small, 'image/png', 'concurrent-same-id');
    assert.ok((await Promise.all([f.post({action: 'complete', id: row.id}), f.post({action: 'complete', id: row.id})])).every(r => r.status === 200));
    assert.equal(f.artworks.size, 4); f.released(); record('concurrent-complete-and-same-id-idempotent-state');
  }
  const counters = sharp.counters(); assert.equal(counters.queue, 0); assert.equal(counters.process, 0);
  fs.writeFileSync(path.join(output, mode + '-suite.json'), JSON.stringify(records, null, 2));
  console.log(`SUITE=PASS MODE=${mode} CASES=${records.length} NATIVE_QUEUE=0 NATIVE_PROCESS=0 NETWORK=0`);
}

async function memory() {
  const format = process.argv[5] || 'png', concurrency = Number(process.argv[6] || 1);
  const f = fixture(), bytes = read('64mp.' + format);
  const rows = Array.from({length: concurrency}, (_, i) => f.seed(bytes, 'image/' + format, 'memory-' + i));
  global.gc?.(); const start = process.memoryUsage(); let peakRSS = start.rss, peakExternal = start.external, peakArray = start.arrayBuffers;
  const sample = () => { const m = process.memoryUsage(); peakRSS = Math.max(peakRSS, m.rss); peakExternal = Math.max(peakExternal, m.external); peakArray = Math.max(peakArray, m.arrayBuffers); };
  const timer = setInterval(sample, 2), at = performance.now(); calls = [];
  try {
    const result = await Promise.all(rows.map(r => f.post({action: 'complete', id: r.id})));
    assert.ok(result.every(r => r.status === 200), JSON.stringify(result)); sample(); f.released();
    for (const row of rows) assert.equal(sha(f.objects.get(row.asset_key).bytes), sha(bytes));
    const counters = sharp.counters(); assert.equal(counters.queue, 0); assert.equal(counters.process, 0);
    console.log(JSON.stringify({mode, format, concurrency, peakRSS, rssDelta: peakRSS - start.rss, peakExternal, peakArray,
      elapsedMs: performance.now() - at, native: counters, rawOutputBytes: calls.filter(c => c.raw).reduce((n, c) => n + c.length, 0),
      originalSHA256: sha(bytes), width: 8000, height: 8000, tier: 'real-route-sharp; synthetic-auth-sql-object-transport'}));
  } finally { clearInterval(timer); }
}

(async () => {
  if (command === 'generate') await generate();
  else if (command === 'memory') await memory();
  else await suite();
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
