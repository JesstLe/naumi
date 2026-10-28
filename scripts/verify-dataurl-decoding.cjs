/** Full storage/canvas modules; only I/O boundaries are replaced. No network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const ts = require('typescript');
const sharp = require('sharp');

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `${name} needs a value`);
  return path.resolve(args[i + 1]);
}
const root = path.resolve(__dirname, '..');
const sourceFile = option('--source-file', path.join(root, 'src/lib/storage.ts'));
const out = option('--output-root', path.join(root, 'output/dataurl-decoding'));
const baseline = args.includes('--baseline');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const loaded = [], cases = [];
let network = 0, io = 0, base64Decodes = 0;
const forbidden = () => { io++; throw Error('Unexpected I/O boundary'); };
const guardedBuffer = new Proxy(Buffer, {get(target, name) {
  if (name === 'from') return (...values) => {
    if (values[1] === 'base64') base64Decodes++;
    return Buffer.from(...values);
  };
  return Reflect.get(target, name);
}});
function load(filename, dependencies) {
  const source = fs.readFileSync(filename, 'utf8');
  loaded.push({path: filename, sha256: sha(fs.readFileSync(filename))});
  const compiled = ts.transpileModule(source, {fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }}).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {exports, Buffer: guardedBuffer, Uint8Array, URL, Response,
    Headers, AbortSignal, process: {env: {}}, console,
    fetch: async () => { network++; throw Error('Network forbidden'); },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (['node:path', 'path', 'node:crypto'].includes(name)) return require(name);
      if (name === 'server-only') return {};
      throw Error('Unmocked dependency: ' + name);
    },
  }, {filename});
  return exports;
}
const storage = load(sourceFile, {
  'fs/promises': {readFile: forbidden, stat: forbidden, statfs: forbidden, mkdir: forbidden},
  'node:fs': {createReadStream: forbidden},
  './object-storage/config': {storageConfiguration: () => ({driver: 'local', enabled: true,
    mediaDir: '/fixture', privateMedia: true, accessMode: 'proxy', publicBase: ''})},
  './object-storage/adapter': {createObjectStorage: () => ({put: forbidden, get: forbidden,
    exists: forbidden, delete: forbidden}), safeStorageKey: value => value},
  './image-upload-policy': {ORIGINAL_IMAGE_MAX_BYTES: 64 * 1024 * 1024},
});
const limits = load(path.join(root, 'src/lib/imagegen/image-limits.ts'), {});
const canvas = load(path.join(root, 'src/lib/canvas-image-input.ts'), {
  '@/lib/storage': storage, '@/lib/media-assets': {canReadMedia: forbidden},
  './imagegen/image-limits': limits,
});
async function check(name, action, kind = 'positive') {
  const start = performance.now();
  try { await action(); cases.push({name, kind, status: 'PASS', ms: performance.now() - start}); }
  catch (error) { cases.push({name, kind, status: 'FAIL', error: String(error), ms: performance.now() - start}); }
}
function decodeExact(mime, bytes, padded = true) {
  const encoded = bytes.toString('base64');
  const actual = storage.dataUrlToBytes(`data:${mime};base64,${padded ? encoded : encoded.replace(/=+$/, '')}`);
  assert.ok(actual); assert.equal(actual.contentType, mime);
  assert.ok(actual.bytes instanceof Uint8Array); assert.equal(Buffer.isBuffer(actual.bytes), false);
  assert.equal(actual.bytes.buffer.byteLength, actual.bytes.byteLength, 'independent exact-size allocation');
  assert.equal(sha(actual.bytes), sha(bytes));
  return actual;
}
async function main() {
  fs.mkdirSync(out, {recursive: true});
  assert.ok(!fs.existsSync(path.join(out, 'RESULT.json')), 'Use a new output root');
  for (const mime of ['image/png', 'IMAGE/PNG', 'image/jpeg', 'image/svg+xml', 'application/octet-stream']) {
    await check('mime-' + mime, () => decodeExact(mime, Buffer.from('image bytes')));
  }
  await check('byte-roundtrips-padded-unpadded', () => {
    for (let length = 1; length <= 96; length++) {
      const bytes = Buffer.from(Array.from({length}, (_, i) => (i * 37 + length) % 256));
      decodeExact('image/png', bytes); decodeExact('image/png', bytes, false);
    }
    assert.equal(storage.dataUrlToBytes('data:image/png;base64,TR==').bytes[0], 77, 'pad bits remain compatible');
  });
  const invalid = [
    ['missing-prefix', 'image/png;base64,YQ=='], ['wrong-prefix', 'DATA:image/png;base64,YQ=='],
    ['missing-marker', 'data:image/png,YQ=='], ['empty-mime', 'data:;base64,YQ=='],
    ['parameters', 'data:image/png;charset=utf-8;base64,YQ=='], ['empty-type', 'data:/png;base64,YQ=='],
    ['empty-subtype', 'data:image/;base64,YQ=='], ['no-slash', 'data:image;base64,YQ=='],
    ['double-slash', 'data:image/x/png;base64,YQ=='], ['mime-space', 'data:image/p ng;base64,YQ=='],
    ['mime-newline', 'data:image/png\n;base64,YQ=='], ['mime-unicode', 'data:image/图;base64,YQ=='],
    ['marker-case', 'data:image/png;BASE64,YQ=='], ['empty-body', 'data:image/png;base64,'],
    ['invalid-char', 'data:image/png;base64,@@@'], ['whitespace', 'data:image/png;base64,Y Q=='],
    ['newline', 'data:image/png;base64,YQ==\n'], ['unicode', 'data:image/png;base64,Y中Q='],
    ['urlsafe-dash', 'data:image/png;base64,-w=='], ['urlsafe-underscore', 'data:image/png;base64,_w=='],
    ['internal-padding', 'data:image/png;base64,Y=Q='], ['excess-padding', 'data:image/png;base64,YQ==='],
    ['padding-only', 'data:image/png;base64,=='], ['short-padding', 'data:image/png;base64,YQ='],
    ['long-padding', 'data:image/png;base64,YWJj='], ['single-sextet', 'data:image/png;base64,Y'],
    ['five-sextets', 'data:image/png;base64,YWJjY'], ['junk-tail', 'data:image/png;base64,YQ==,junk'],
  ];
  for (const [name, input] of invalid) await check(name, () => {
    const before = base64Decodes;
    const actual = storage.dataUrlToBytes(input);
    assert.equal(actual, null, 'Malformed data URL must be rejected');
    assert.equal(base64Decodes, before, 'Reject before permissive Buffer decoder');
  }, 'reject');
  const raw = Buffer.alloc(1536 * 2048 * 3);
  let seed = 0x7f4a7c15;
  for (let i = 0; i < raw.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; raw[i] = seed & 255; }
  const png = await sharp(raw, {raw: {width: 1536, height: 2048, channels: 3}}).png({compressionLevel: 0}).toBuffer();
  const large = png.toString('base64');
  assert.ok(large.length > 6_500_000);
  fs.writeFileSync(path.join(out, 'fixture-1536x2048.png'), png);
  await check('large-2k-png-roundtrip', async () => {
    const actual = decodeExact('image/png', png);
    const decoded = await sharp(Buffer.from(actual.bytes)).raw().toBuffer({resolveWithObject: true});
    assert.equal(decoded.info.width, 1536); assert.equal(decoded.info.height, 2048);
    assert.equal(sha(decoded.data), sha(raw));
  });
  for (const index of [0, Math.floor(large.length / 2), large.length - 1]) await check('large-invalid-at-' + index, () => {
    const before = base64Decodes;
    // Avoid formatting a multi-megabyte Uint8Array in the expected baseline failure.
    const actual = storage.dataUrlToBytes('data:image/png;base64,' + large.slice(0, index) + '@' + large.slice(index + 1));
    assert.equal(actual === null, true, 'Malformed large payload must be rejected');
    assert.equal(base64Decodes, before);
  }, 'reject');
  await check('canvas-input-output-inline', async () => {
    for (const read of [canvas.readCanvasImage, canvas.readCanvasOutput]) {
      const actual = await read('data:image/png;base64,' + large, 'http://fixture.invalid', 'owner');
      assert.equal(sha(actual.buffer), sha(png)); assert.equal(actual.mimeType, 'image/png');
    }
  });
  await check('existing-input-output-budgets', async () => {
    const bytes = Buffer.alloc(13 * 1024 * 1024, 0x73), url = 'data:image/png;base64,' + bytes.toString('base64');
    await assert.rejects(() => canvas.readCanvasImage(url, 'http://fixture.invalid', 'owner'), /读取大小限制/);
    const actual = await canvas.readCanvasOutput(url, 'http://fixture.invalid', 'owner');
    assert.equal(sha(actual.buffer), sha(bytes));
  });
  await check('zero-external-io', () => { assert.equal(io, 0); assert.equal(network, 0); });
  const failed = cases.filter(c => c.status === 'FAIL');
  const required = ['empty-mime', 'invalid-char', 'single-sextet', 'parameters'];
  const reproduced = baseline && required.every(name => failed.some(c => c.name === name)) && failed.every(c => c.kind === 'reject');
  const status = reproduced ? 'REPRODUCED' : !baseline && !failed.length ? 'PASS' : 'FAIL';
  const exit = status === 'PASS' ? 0 : 1;
  const report = {status, baseline, node: process.version, loaded, cases, reproduced: reproduced ? failed.length : 0,
    failed: reproduced ? 0 : failed.length, network, io, fixture: {width: 1536, height: 2048, bytes: png.length,
      base64Characters: large.length, sha256: sha(png)}, exit};
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`DATAURL_DECODER=${status} CASES=${cases.length} REPRODUCED=${report.reproduced} FAILED=${report.failed} EXTERNAL_NETWORK=${network} EXIT=${exit}`);
  process.exitCode = exit;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
