// Real sharp pixel/call-count regression. No DB, storage, provider, or Sharp mocks.
// node --conditions=react-server --require=tsx/cjs scripts/verify-imagegen-pipeline.cjs <mode> <source-root> <evidence-root>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const mode = process.argv[2] || 'modified';
const sourceRoot = path.resolve(process.argv[3] || '.');
const evidence = path.resolve(process.argv[4] || 'output/capacity-image-pipeline-20261029');
const { processImagegenPixels, inspectImagegenPixels } = require(path.join(sourceRoot, 'src/lib/imagegen/postprocess.ts'));
const { removeChroma } = require(path.join(sourceRoot, 'src/lib/imagegen/chroma.ts'));
const { imagegenChromaSchema } = require(path.join(sourceRoot, 'src/lib/imagegen/schema.ts'));
const { decodeImagegenPixels } = require(path.join(sourceRoot, 'src/lib/imagegen/pixels.ts'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { mode, versions: { node: process.version, sharp: sharp.versions.sharp, vips: sharp.versions.vips }, results: [], checks: 0, budgetFailures: [] };
let active;
const originalBuffer = sharp.prototype.toBuffer, originalMetadata = sharp.prototype.metadata;
// Observe the exact native pipeline entry; delegate unchanged, including failures.
// metadata is a header probe, not a full decode. Raw-input pipelines are not decodes.
sharp.prototype.toBuffer = function (...args) {
  if (active) {
    const raw = !!this.options.input.rawChannels;
    active.operations.push({ input: raw ? 'raw' : 'encoded', output: this.options.formatOut });
    if (!raw) active.decodes++;
    if (['png', 'webp', 'jpeg'].includes(this.options.formatOut)) active.encodes++;
  }
  return Reflect.apply(originalBuffer, this, args);
};
sharp.prototype.metadata = function (...args) {
  if (active) active.metadata++;
  return Reflect.apply(originalMetadata, this, args);
};
function check(value, label) { assert(value, label); report.checks++; }
function equal(a, b, label) { assert.deepEqual(a, b, label); report.checks++; }
async function measured(fn) {
  const calls = { decodes: 0, encodes: 0, metadata: 0, operations: [] };
  active = calls;
  try { return { value: await fn(), calls }; } finally { active = undefined; }
}
function rgba(width, height, alpha = 'mixed') {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = (x * 7 + y * 3) % 256; data[i + 1] = (x * 2 + y * 11) % 256; data[i + 2] = (x + y * 13) % 256;
    data[i + 3] = alpha === 'opaque' ? 255 : x < width / 4 ? 0 : x < width / 2 ? 128 : 255;
  }
  return data;
}
const png = (data, width, height) => sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
function crc32(data) { let c = 0xffffffff; for (const b of data) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const baselineFile = path.join(evidence, 'baseline-results.json');
  const baseline = mode === 'baseline' ? null : JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const smallRaw = rgba(96, 64), small = await png(smallRaw, 96, 64);
  const opaque = await png(rgba(96, 64, 'opaque'), 96, 64);
  const webp = await sharp(small).webp({ lossless: true }).toBuffer();
  const jpeg = await sharp(opaque).jpeg({ quality: 93 }).withMetadata({ orientation: 6 }).toBuffer();
  const chromaRaw = rgba(96, 64, 'opaque');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) if (x < 24 || x >= 72 || y < 16 || y >= 48) chromaRaw.set([0, 255, 0, 255], (y * 96 + x) * 4);
  const chromaPng = await png(chromaRaw, 96, 64);
  async function success(name, bytes, output, chroma, expectedSize) {
    const before = hash(bytes), request = { output, ...(chroma ? { chroma: imagegenChromaSchema.parse(chroma) } : {}) };
    const sourceMeta = await sharp(bytes).metadata();
    const shrinking = output.downscaleMaxDim !== undefined && Math.max(sourceMeta.width, sourceMeta.height) > output.downscaleMaxDim;
    const expectedCalls = { decodes: shrinking ? 3 : 2, encodes: shrinking ? 2 : 1, metadata: 2 };
    const requestBefore = JSON.stringify(request);
    const { value: result, calls } = await measured(() => processImagegenPixels(bytes, request));
    equal(hash(bytes), before, name + ': immutable input bytes');
    equal(JSON.stringify(request), requestBefore, name + ': immutable request');
    equal(Object.keys(result).sort(), ['bytes', 'mime', 'width', 'height', 'transparentPixels', 'fullyTransparentPixels', 'visiblePixels', 'totalPixels'].sort(), name + ': output schema');
    const meta = await sharp(result.bytes).metadata();
    equal(meta.format, output.format, name + ': actual encoded format');
    equal(result.mime, output.format === 'jpeg' ? 'image/jpeg' : `image/${output.format}`, name + ': MIME');
    equal([meta.width, meta.height], expectedSize || [96, 64], name + ': actual dimensions');
    const actual = await inspectImagegenPixels(result.bytes);
    const { bytes: _, mime: __, ...facts } = result;
    equal(facts, actual, name + ': decoded final alpha facts');
    const decoded = await sharp(result.bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer();
    const item = { name, inputSha256: before, encodedSha256: hash(result.bytes), rgbaSha256: hash(decoded), bytes: result.bytes.length, facts, calls, expectedCalls };
    if (baseline) {
      const old = baseline.results.find(row => row.name === name);
      check(!!old, name + ': baseline recorded');
      for (const key of ['inputSha256', 'encodedSha256', 'rgbaSha256', 'bytes', 'facts']) equal(item[key], old[key], name + ': baseline equivalence ' + key);
    }
    if (Object.entries(expectedCalls).some(([key, value]) => calls[key] !== value)) report.budgetFailures.push(name);
    // These are observed Sharp pipelines, not codec-internal load counts or RSS claims.
    report.results.push(item);
    console.log(`CASE ${name} decode=${calls.decodes} encode=${calls.encodes} metadata=${calls.metadata} size=${meta.width}x${meta.height} pixels=PASS`);
    return result;
  }
  const plain = await success('png-alpha', small, { format: 'png', background: 'transparent' });
  equal(hash(await sharp(plain.bytes).ensureAlpha().raw().toBuffer()), hash(smallRaw), 'PNG preserves all RGBA including hidden RGB');
  await success('webp-lossless', webp, { format: 'webp', compression: 0, background: 'transparent' });
  await success('webp-lossy-resize', small, { format: 'webp', compression: 23, background: 'transparent', downscaleMaxDim: 64 }, undefined, [64, 43]);
  await success('png-uncompressed', small, { format: 'png', compression: 0 });
  await success('png-maxcompression', small, { format: 'png', compression: 100 });
  await success('no-enlarge', small, { format: 'png', downscaleMaxDim: 512 });
  const flat = await success('jpeg-explicit-background', small, { format: 'jpeg', flattenColor: '#1264b4', compression: 10 });
  equal(flat.transparentPixels, 0, 'JPEG has no transparent pixels');
  const flatPixels = await sharp(flat.bytes).ensureAlpha().raw().toBuffer();
  check([18, 100, 180].every((value, c) => Math.abs(flatPixels[(32 * 96 + 4) * 4 + c] - value) <= 3), 'JPEG explicit background is used');
  await success('jpeg-opaque', opaque, { format: 'jpeg' });
  await success('jpeg-exif-rotate-resize', jpeg, { format: 'png', downscaleMaxDim: 64 }, undefined, [43, 64]);
  for (const orientation of [2, 3, 4, 5, 6, 7, 8]) {
    const oriented = await sharp(opaque).jpeg({ quality: 94 }).withMetadata({ orientation }).toBuffer();
    const result = await success('exif-' + orientation, oriented, { format: 'png' }, undefined, orientation >= 5 ? [64, 96] : [96, 64]);
    const expected = await sharp(oriented).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer();
    equal(hash(await sharp(result.bytes).ensureAlpha().raw().toBuffer()), hash(expected), 'EXIF actual pixel orientation ' + orientation);
  }
  const p3 = await sharp(opaque).withIccProfile('p3').png().toBuffer();
  const color = await success('icc-p3-to-srgb', p3, { format: 'png' });
  equal(hash(await sharp(color.bytes).ensureAlpha().raw().toBuffer()), hash((await decodeImagegenPixels(p3, 'output')).data), 'embedded ICC conversion stays sRGB');
  for (const autoKey of ['none', 'corners', 'border']) await success('chroma-' + autoKey, chromaPng, { format: 'png', background: 'transparent' }, { autoKey });
  await success('chroma-webp', chromaPng, { format: 'webp', compression: 0, background: 'transparent' }, {});
  await success('chroma-jpeg', chromaPng, { format: 'jpeg', flattenColor: '#ffffff' }, {});
  await success('chroma-edges', chromaPng, { format: 'png', background: 'transparent', downscaleMaxDim: 64 }, { edgeContract: 2, edgeFeather: 1, softMatte: true, spillCleanup: true }, [64, 43]);
  const translucentRaw = Buffer.from(chromaRaw); for (let i = 3; i < translucentRaw.length; i += 4) translucentRaw[i] = 128;
  const semi = await success('chroma-original-alpha', await png(translucentRaw, 96, 64), { format: 'png' }, { edgeFeather: 1, softMatte: true, spillCleanup: true });
  const semiRaw = await sharp(semi.bytes).ensureAlpha().raw().toBuffer();
  check(semiRaw.every((v, i) => i % 4 !== 3 || v <= 128), 'chroma feather never raises source alpha');
  // Public byte-based API stays compatible; no caller must provide an internal buffer.
  const direct = await removeChroma(chromaPng, imagegenChromaSchema.parse({}));
  equal(hash(direct), report.results.find(x => x.name === 'chroma-none').encodedSha256, 'removeChroma PNG compatibility');
  async function rejected(name, bytes, request, pattern) {
    const before = hash(bytes); let message;
    await assert.rejects(() => processImagegenPixels(bytes, request), error => { message = error.message; return pattern.test(message); }); report.checks++;
    equal(hash(bytes), before, name + ': rejected input unchanged');
    report.results.push({ name, error: message });
    if (baseline) equal(message, baseline.results.find(x => x.name === name).error, name + ': exact baseline rejection');
    console.log(`REJECT ${name}: ${message}`);
  }
  const transparent = await png(Buffer.alloc(96 * 64 * 4), 96, 64);
  await rejected('all-transparent', transparent, { output: { format: 'png' } }, /全部透明/);
  const green = await sharp({ create: { width: 96, height: 64, channels: 4, background: '#00ff00' } }).png().toBuffer();
  await rejected('all-keyed', green, { output: { format: 'png' }, chroma: imagegenChromaSchema.parse({}) }, /全部透明/);
  await rejected('opaque-not-transparent', opaque, { output: { format: 'png', background: 'transparent' } }, /没有透明像素/);
  await rejected('jpeg-needs-background', small, { output: { format: 'jpeg' } }, /明确背景色/);
  await rejected('jpeg-transparent-forbidden', small, { output: { format: 'jpeg', background: 'transparent' } }, /JPEG不能保存透明/);
  const sparse = Buffer.alloc(2048 * 2048 * 4); sparse[(1024 * 2048 + 1024) * 4 + 3] = 255;
  await rejected('resize-loses-visible-subject', await png(sparse, 2048, 2048), { output: { format: 'png', downscaleMaxDim: 64 } }, /全部透明/);
  sparse.fill(255); sparse[(1024 * 2048 + 1024) * 4 + 3] = 254;
  await rejected('resize-loses-transparency', await png(sparse, 2048, 2048), { output: { format: 'png', downscaleMaxDim: 64, background: 'transparent' } }, /丢失透明像素/);
  await rejected('bad-image', Buffer.from('not a PNG'), { output: { format: 'png' } }, /unsupported image format/);
  const corrupt = Buffer.from(small);
  for (let pos = 8; pos < corrupt.length;) {
    const length = corrupt.readUInt32BE(pos);
    if (corrupt.toString('ascii', pos + 4, pos + 8) === 'IDAT') { corrupt[pos + 8 + Math.floor(length / 2)] ^= 255; corrupt.writeUInt32BE(crc32(corrupt.subarray(pos + 4, pos + 8 + length)), pos + 8 + length); break; }
    pos += 12 + length;
  }
  check((await sharp(corrupt).metadata()).width === 96, 'corrupt fixture still has readable metadata');
  await rejected('corrupt-pixels', corrupt, { output: { format: 'png' } }, /pngload|vipspng: libpng read error/);
  const overPixels = Buffer.from(small); overPixels.writeUInt32BE(40_000_001, 16); overPixels.writeUInt32BE(1, 20); overPixels.writeUInt32BE(crc32(overPixels.subarray(12, 29)), 29);
  await rejected('over-pixels', overPixels, { output: { format: 'png' } }, /pixel limit|像素/);
  await rejected('over-output-bytes', Buffer.alloc(64 * 1024 * 1024 + 1), { output: { format: 'png' } }, /64MiB/);
  await assert.rejects(() => decodeImagegenPixels(Buffer.alloc(12 * 1024 * 1024 + 1)), /12MiB/); report.checks++;
  await rejected('empty', Buffer.alloc(0), { output: { format: 'png' } }, /大小/);
  const animation = await sharp(Buffer.concat([rgba(96, 64, 'opaque'), rgba(96, 64)]), { raw: { width: 96, height: 128, channels: 4, pageHeight: 64 } }).webp({ lossless: true, delay: [80, 80] }).toBuffer();
  equal((await sharp(animation, { animated: true }).metadata()).pages, 2, 'real two-frame WebP fixture');
  await rejected('animated-webp', animation, { output: { format: 'png' } }, /仅支持静态/);
  const gif = await sharp(opaque).gif().toBuffer();
  await rejected('gif-unsupported', gif, { output: { format: 'png' } }, /仅支持静态/);
  const twoK = await png(rgba(2048, 2048), 2048, 2048);
  await success('synthetic-2k', twoK, { format: 'png', background: 'transparent' }, undefined, [2048, 2048]);
  const twoKChroma = await sharp(chromaPng).resize(2048, 2048, { fit: 'fill', kernel: 'nearest' }).png().toBuffer();
  await success('synthetic-2k-chroma', twoKChroma, { format: 'png', background: 'transparent' }, { edgeContract: 1, edgeFeather: 1 }, [2048, 2048]);
  const large = await png(rgba(4096, 3072), 4096, 3072);
  await success('bounded-12mp', large, { format: 'png', background: 'transparent', downscaleMaxDim: 2048 }, undefined, [2048, 1536]);
  fs.writeFileSync(path.join(evidence, `${mode}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(`PIXEL_CONTRACT=PASS cases=${report.results.length} checks=${report.checks}`);
  console.log(`OPTIMIZATION_BUDGET=${report.budgetFailures.length ? 'FAIL' : 'PASS'} failures=${report.budgetFailures.length} expected=no-shrink:decode2/encode1,shrink:decode3/encode2,metadata2`);
  if (report.budgetFailures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { sharp.prototype.toBuffer = originalBuffer; sharp.prototype.metadata = originalMetadata; });
