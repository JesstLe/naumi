'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const preload = path.join(__dirname, 'runtime-memory.cjs');

function child(profile, source, args = []) {
  const env = { ...process.env, NAUMI_NATIVE_MEMORY_PROFILE: profile };
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, [...args, '-e', source], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}

test('default and unknown profiles never load sharp or change process configuration', () => {
  for (const profile of ['', 'off', 'unknown', '1']) {
    const report = JSON.parse(child(profile, `
      const Module = require('node:module'), original = Module._load;
      Module._load = function(name, ...rest) {
        if (name === 'sharp') throw Error('default profile loaded sharp');
        return original.call(this, name, ...rest);
      };
      const env = JSON.stringify(process.env);
      const report = require(${JSON.stringify(preload)});
      require('node:assert/strict').equal(JSON.stringify(process.env), env);
      process.stdout.write(JSON.stringify(report));
    `));
    assert.deepEqual(report, { enabled: false, profile: 'default', sharp: null });
  }
});

test('bounded profile applies exact native limits and exposes the observed report', () => {
  const report = JSON.parse(child('bounded', `
    const sharp = require('sharp');
    sharp.cache({ memory: 128, items: 100, files: 20 }); sharp.concurrency(3);
    const report = require(${JSON.stringify(preload)});
    const assert = require('node:assert/strict');
    assert.equal(sharp.cache().memory.max, 32);
    assert.equal(sharp.cache().items.max, 64);
    assert.equal(sharp.cache().files.max, 0);
    assert.equal(sharp.concurrency(), 1);
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.sharp.cache), true);
    assert.equal(require(${JSON.stringify(preload)}), report);
    process.stdout.write(JSON.stringify(report));
  `));
  assert.deepEqual(report, { enabled: true, profile: 'bounded', sharp: { cache: { memory: 32, items: 64, files: 0 }, concurrency: 1 } });
});

test('node --require startup is silent in both profiles', () => {
  for (const profile of ['', 'bounded']) assert.equal(child(profile, '', ['--require', preload]), '');
});

test('bounded process still encodes and decodes a real image', () => {
  assert.equal(child('bounded', `
    const assert = require('node:assert/strict'), sharp = require('sharp');
    sharp({ create: { width: 64, height: 32, channels: 3, background: '#abc' } })
      .png().toBuffer().then(async bytes => {
        const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
        assert.equal(decoded.info.width, 64); assert.equal(decoded.info.height, 32);
        assert.equal(decoded.data.length, 64 * 32 * 3);
      }).catch(error => { console.error(error); process.exitCode = 1; });
  `, ['--require', preload]), '');
});
