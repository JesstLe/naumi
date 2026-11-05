/* Actual upload helper + transport. Browser decoding/auth are explicit ports;
 * request/XHR fixtures never contact the network or call a supplier. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || root);
let checks = 0;
const storage = new Map();
let authenticating, previewHook, previewCount = 0;
let authValues = { Authorization: 'fixture-A', 'x-naumi-workspace': 'changed-workspace' };
const fakeAuth = { authHeader: async () => { if (authenticating) await authenticating(); return authValues; } };
const fakePreview = { prepareOriginalImage: async file => {
  previewCount++; if (previewHook) await previewHook(file);
  return { width: 80, height: 60, mime: 'image/png', thumbnail: new Blob(['thumb'], { type: 'image/webp' }), preview: new Blob(['preview'], { type: 'image/webp' }) };
} };
const modules = new Map();
function load(file) {
  const full = path.resolve(source, file); if (modules.has(full)) return modules.get(full).exports;
  const loadedModule = { exports: {} }; modules.set(full, loadedModule);
  const code = esbuild.transformSync(fs.readFileSync(full, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const req = name => {
    if (name === '@/lib/supabase' || /\/supabase$/.test(name)) return fakeAuth;
    if (/browser-reference-image$/.test(name)) return fakePreview;
    if (name.startsWith('.') || name.startsWith('@/')) {
      const next = name.startsWith('@/') ? path.resolve(source, 'src', name.slice(2)) : path.resolve(path.dirname(full), name);
      return load(path.relative(source, next.endsWith('.ts') ? next : next + '.ts'));
    }
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: full })(req, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
async function main() {
  if (!fs.existsSync(path.join(source, 'src/lib/canvas/persist-image-reference-upload.ts'))) {
    console.log('INLINE_REFERENCE_UPLOAD_BASELINE=MISSING_HELPER'); process.exitCode = 42; return;
  }
  const { uploadCanvasPromptReference: upload } = load('src/lib/canvas/persist-image-reference-upload.ts');
  const seen = [], options = {
    ownerScope: 'owner-A', workspace: 'tenant-A', projectKey: 'tree:parent-A', parentId: 'parent-A', isCurrent: () => true,
    request: async (url, init) => {
      const h = new Headers(init.headers), form = init.body;
      const input = { url, operationId: form.get('operationId'), parentId: form.get('parentId'), projectKey: form.get('projectKey'),
        original: Buffer.from(await form.get('image').arrayBuffer()), thumb: await form.get('thumbnail').text(), preview: await form.get('preview').text(), h };
      seen.push(input);
      return Response.json({ id: 'art-ref-' + input.operationId, image: '/media/fixture.png', title: 'sample.png' });
    },
  };
  const file = new File(['ORIGINAL_BYTES'], 'sample.png', { type: 'image/png' });
  const [a, b] = await Promise.all([upload(file, options), upload(file, options)]);
  assert.deepEqual(a, b); assert.equal(seen.length, 1); checks++;
  assert.equal(seen[0].url, '/api/canvas/image-reference-upload'); assert.equal(seen[0].h.get('x-naumi-workspace'), 'tenant-A');
  assert.equal(seen[0].h.get('x-naumi-project-context'), 'tree:parent-A'); assert.equal(seen[0].h.get('authorization'), 'fixture-A');
  assert.equal(seen[0].original.toString(), 'ORIGINAL_BYTES'); assert.equal(seen[0].thumb, 'thumb'); checks++;
  await upload(file, options); assert.equal(seen.length, 1); checks++;
  let current = true, requestCount = 0;
  previewHook = () => { current = false; };
  await assert.rejects(upload(new File(['PREPARE'], 'prepare.png', { type: 'image/png' }), { ...options, isCurrent: () => current, request: async () => { requestCount++; return Response.json({}); } }), /已切换/);
  assert.equal(requestCount, 0); previewHook = undefined; checks++;
  current = true; authenticating = async () => { current = false; };
  await assert.rejects(upload(new File(['AUTH'], 'auth.png', { type: 'image/png' }), { ...options, isCurrent: () => current, request: async () => { requestCount++; return Response.json({}); } }), /已切换/);
  assert.equal(requestCount, 0); authenticating = undefined; checks++;
  const retries = [], retryFile = new File(['UNCERTAIN'], 'retry.png', { type: 'image/png' });
  let dropped = false;
  const retryOpts = { ...options, request: async (url, init) => { retries.push(init.body.get('operationId')); if (!dropped) { dropped = true; throw Error('ACK_LOST'); } return options.request(url, init); } };
  await assert.rejects(upload(retryFile, retryOpts), /ACK_LOST/); await upload(retryFile, retryOpts);
  assert.equal(retries.length, 2); assert.equal(retries[0], retries[1]); checks++;
  // Re-selecting the original after an unknown ACK retains the same opaque ID.
  const reselect = new File(['RESELECT'], 'reselect.png', { type: 'image/png' });
  let priorId;
  await assert.rejects(upload(reselect, { ...options, request: async (_url, init) => { priorId = init.body.get('operationId'); throw Error('ACK_LOST'); } }), /ACK_LOST/);
  let nextId;
  await upload(new File(['RESELECT'], 'reselect.png', { type: 'image/png' }), { ...options, request: async (url, init) => { nextId = init.body.get('operationId'); return options.request(url, init); } });
  assert.equal(priorId, nextId); checks++;
  const shared = new File(['SCOPED'], 'shared.png', { type: 'image/png' });
  const ownerA = await upload(shared, options), ownerB = await upload(shared, { ...options, ownerScope: 'owner-B' });
  assert.notEqual(ownerA.id, ownerB.id); checks++;
  current = true;
  const completed = new File(['COMPLETE'], 'completed.png', { type: 'image/png' });
  const fenced = { ...options, isCurrent: () => current, request: async (url, init) => { const response = await options.request(url, init); current = false; return response; } };
  await assert.rejects(upload(completed, fenced), /已切换/); const count = seen.length; current = true;
  await upload(completed, fenced); assert.equal(seen.length, count); checks++;
  await assert.rejects(upload(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), options), /64MiB/); checks++;
  const large = new File([new Uint8Array(21 * 1024 * 1024)], 'above-video-limit.png', { type: 'image/png' });
  await upload(large, options); assert.equal(seen.at(-1).original.length, 21 * 1024 * 1024); checks++;
  await assert.rejects(upload(new File(['bad'], 'bad.exe', { type: 'application/octet-stream' }), options), /PNG/); checks++;
  const { uploadFormData } = load('src/lib/client-image-upload.ts');
  let sent = 0, captured;
  global.XMLHttpRequest = class {
    upload = {}; headers = {}; status = 200; responseText = '{"ok":true}';
    open(method, url) { captured = { method, url, headers: this.headers }; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(form) { sent++; captured.form = form; this.onload(); }
  };
  const form = new FormData(); form.set('image', file);
  await uploadFormData('/api/canvas/image-reference-upload', form, undefined, 5000, () => {}, { headers: { Authorization: 'frozen', 'x-naumi-workspace': 'frozen-workspace' } });
  assert.equal(sent, 1); assert.equal(captured.headers.authorization, 'frozen'); assert.equal(captured.headers['x-naumi-workspace'], 'frozen-workspace'); checks++;
  await assert.rejects(uploadFormData('/api/canvas/image-reference-upload', form, undefined, 5000, () => { throw Error('CANCELLED'); }, { headers: {} }), /CANCELLED/);
  assert.equal(sent, 1); checks++;
  console.log(`INLINE_REFERENCE_UPLOAD_CLIENT=PASS checks=${checks} original_bytes=preserved large21MiB=accepted unknown_ack=same_operation suppliers=0 network=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
