// Local, variable metrics only. Fresh processes, alternating order, real Sharp.
// No service, fixture DB, supplier, env-file loader, or production configuration.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const hash = b => createHash('sha256').update(b).digest('hex');
const evidence = path.resolve(process.argv[2] || 'output/capacity-image-pipeline-20261029');
const baselineRoot = path.resolve(process.argv[3] || path.join(evidence, 'baseline'));
const modifiedRoot = path.resolve(process.argv[4] || '.');

async function sample() {
  const [sourceRoot, fixturePath, kind] = process.argv.slice(3);
  const { processImagegenPixels } = require(path.join(sourceRoot, 'src/lib/imagegen/postprocess.ts'));
  const { imagegenChromaSchema } = require(path.join(sourceRoot, 'src/lib/imagegen/schema.ts'));
  const bytes = fs.readFileSync(fixturePath);
  const request = { output: { format: 'png', background: 'transparent', ...(kind === 'large' ? { downscaleMaxDim: 2048 } : {}) }, ...(kind === 'chroma' ? { chroma: imagegenChromaSchema.parse({ edgeContract: 1, edgeFeather: 1 }) } : {}) };
  // Prime bindings with a small image, not a cached copy of the measured image.
  const warmup = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 100, g: 20, b: 200, alpha: 0.5 } } }).png().toBuffer();
  await processImagegenPixels(warmup, { output: { format: 'png' } });
  global.gc?.();
  const rssStartBytes = process.memoryUsage().rss;
  let peakObservedRssBytes = rssStartBytes;
  const timer = setInterval(() => { peakObservedRssBytes = Math.max(peakObservedRssBytes, process.memoryUsage().rss); }, 5);
  const start = performance.now();
  let result;
  try { result = await processImagegenPixels(bytes, request); } finally { clearInterval(timer); }
  const elapsedMs = performance.now() - start;
  const rssEndBytes = process.memoryUsage().rss;
  peakObservedRssBytes = Math.max(peakObservedRssBytes, rssEndBytes);
  console.log(JSON.stringify({ elapsedMs, rssStartBytes, rssEndBytes, peakObservedRssBytes, processMaxRssKiB: process.resourceUsage().maxRSS, sha256: hash(result.bytes), width: result.width, height: result.height, transparentPixels: result.transparentPixels, sharpConcurrency: sharp.concurrency(), sharpCache: sharp.cache() }));
}

async function main() {
  fs.mkdirSync(path.join(evidence, 'bench-inputs'), { recursive: true });
  const cases = [{ name: '2k-png', width: 2048, height: 2048, kind: 'plain' }, { name: '2k-chroma-edges', width: 2048, height: 2048, kind: 'chroma' }, { name: '12mp-resize', width: 4096, height: 3072, kind: 'large' }];
  for (const c of cases) {
    const raw = Buffer.alloc(c.width * c.height * 4);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (c.kind === 'chroma' && (x < c.width / 4 || x >= c.width * 3 / 4 || y < c.height / 4 || y >= c.height * 3 / 4)) raw.set([0, 255, 0, 255], i);
      else raw.set([(x * 7 + y * 3) % 256, (x * 2 + y * 11) % 256, (x + y * 13) % 256, c.kind === 'chroma' ? 255 : x < c.width / 4 ? 0 : x < c.width / 2 ? 128 : 255], i);
    }
    c.file = path.join(evidence, 'bench-inputs', c.name + '.png');
    fs.writeFileSync(c.file, await sharp(raw, { raw: { width: c.width, height: c.height, channels: 4 } }).png().toBuffer());
    c.sha256 = hash(fs.readFileSync(c.file));
  }
  // Only platform variables are inherited, never DB/storage/provider credentials.
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const samples = [];
  for (let round = 0; round < 5; round++) for (const c of cases) for (const mode of round % 2 ? ['modified', 'baseline'] : ['baseline', 'modified']) {
    const args = ['--expose-gc', '--conditions=react-server', '--require=tsx/cjs', __filename, '--sample', mode === 'baseline' ? baselineRoot : modifiedRoot, c.file, c.kind];
    const child = spawnSync(process.execPath, args, { cwd: modifiedRoot, env, encoding: 'utf8', timeout: 120000 });
    if (child.status !== 0) throw new Error(`Benchmark child failed: ${child.status}\n${child.stdout}\n${child.stderr}`);
    const value = JSON.parse(child.stdout.trim());
    samples.push({ round, case: c.name, mode, command: [process.execPath, ...args], exitStatus: child.status, literalStdout: child.stdout, ...value });
    console.log(`SAMPLE ${c.name} ${mode} round=${round + 1} ms=${value.elapsedMs.toFixed(1)} sampledPeakRssMiB=${(value.peakObservedRssBytes / 1048576).toFixed(1)}`);
  }
  const distribution = values => { const sorted = values.toSorted((a, b) => a - b); return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) }; };
  const summary = cases.map(c => {
    const subset = samples.filter(s => s.case === c.name);
    assert.equal(new Set(subset.map(s => s.sha256)).size, 1, `${c.name}: encoded bytes must match in every process`);
    return { case: c.name, samplesPerMode: 5, equivalentEncodedBytes: true, ...Object.fromEntries(['baseline', 'modified'].map(mode => {
      const rows = subset.filter(s => s.mode === mode);
      return [mode, { elapsedMs: distribution(rows.map(s => s.elapsedMs)), sampledPeakRssMiB: distribution(rows.map(s => s.peakObservedRssBytes / 1048576)), processMaxRssMiB: distribution(rows.map(s => s.processMaxRssKiB / 1024)) }];
    })) };
  });
  fs.writeFileSync(path.join(evidence, 'BENCHMARK.json'), JSON.stringify({ note: 'Local variable metrics, not capacity. 5ms RSS sampling misses synchronous/native transients. processMaxRSS includes imports/warmup. No RSS is inferred from pixel byte size. Five fresh processes per mode/case, alternating order; same settings and byte-identical outputs.', versions: { node: process.version, sharp: sharp.versions.sharp, vips: sharp.versions.vips }, cases, summary, samples }, null, 2) + '\n');
  console.log('BENCHMARK=PASS samples=30 equivalentEncodedBytes=true');
  console.log(JSON.stringify(summary, null, 2));
}
(process.argv[2] === '--sample' ? sample() : main()).catch(error => { console.error(error); process.exitCode = 1; });
