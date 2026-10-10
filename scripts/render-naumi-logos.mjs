import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve('design/brand/naumi-logo-options-20261010');
const schemes = JSON.parse(await fs.readFile(path.join(root, 'schemes.json'), 'utf8'));
let checks = 0, rendered = 0;
for (const scheme of schemes) {
  const dir = path.join(root, scheme.folder);
  for (const filename of (await fs.readdir(dir)).filter(name => name.endsWith('.svg'))) {
    const input = path.join(dir, filename);
    const source = await fs.readFile(input, 'utf8');
    // Logo exports must not depend on installed fonts or remote linked resources.
    if (!filename.includes('preview')) { assert.ok(!source.includes('<text')); checks++; }
    assert.ok(!source.includes('https://') && !source.includes('<image')); checks++;
    const output = input.replace(/\.svg$/, '.png');
    await sharp(input).png().toFile(output); rendered++;
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'png'); checks++;
    if (filename.startsWith('symbol-')) {
      const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.channels, 4); checks++;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; if (data[i] === 255) opaque++; }
      assert.ok(transparent > 0 && opaque > 0); checks++;
    }
  }
  for (const size of [16, 24, 32, 48, 64]) {
    const output = path.join(dir, `favicon-${size}.png`);
    await sharp(path.join(dir, 'app-dark.svg')).resize(size, size).png().toFile(output); rendered++;
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, size); assert.equal(metadata.height, size); checks++;
  }
}
await sharp(path.join(root, 'comparison.svg')).png().toFile(path.join(root, 'comparison.png')); rendered++;
const selected = await fs.readFile(path.join(root, 'a-capsule-n/symbol-black.svg'), 'utf8');
assert.ok(selected.includes('M73 179 L96 77 L160 179 L183 77') && selected.includes('stroke-width="31"')); checks++;
assert.equal(schemes.length, 6); checks++;
console.log(`LOGO_RENDER=PASS schemes=${schemes.length} pngs=${rendered} checks=${checks}`);
