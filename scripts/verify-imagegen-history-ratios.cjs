#!/usr/bin/env node
'use strict';
/** 80 retained employee ratio values. Not a full original-request/image replay. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = process.cwd();
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/benchmarks/imagegen-history-ratios-20261023.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'src/lib/imagegen/request-size.ts'), 'utf8');
const mod = {exports: {}};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
  {module: mod, exports: mod.exports, Error, Set, Math, Number, console});
const {exactImageRequestSize, ExactImageSizeError} = mod.exports;
assert.equal(sample.cases.length, 80);
assert.equal(new Set(sample.cases.map(x => x.case)).size, 80);
let allowed = 0, blocked = 0;
for (const row of sample.cases) {
  const [w, h] = row.ratio.split(':').map(Number), valid = w / h >= 1 / 3 && w / h <= 3;
  // New operations enter the existing v2 custom-size contract. This does NOT
  // alter old paid jobs, old frozen contracts or source reference image pixels.
  if (!valid) {
    assert.throws(() => exactImageRequestSize(row.ratio, 'gpt-image-2', true), e => e instanceof ExactImageSizeError);
    blocked++; continue;
  }
  const size = exactImageRequestSize(row.ratio, 'gpt-image-2', true);
  assert.match(size, /^\d+x\d+$/);
  const [x, y] = size.split('x').map(Number);
  assert(x % 16 === 0 && y % 16 === 0 && x / y >= 1 / 3 && x / y <= 3 && x * y >= 655360 && x * y <= 1572864);
  // An old frozen v1 is not silently upgraded just because a new request works.
  assert.throws(() => exactImageRequestSize(row.ratio, 'gpt-image-2', false), e => e instanceof ExactImageSizeError);
  allowed++;
}
assert.equal(allowed + blocked, 80);
console.log(`HISTORY_RATIOS=PASS ORIGINAL_PARAMETER_ROWS=80 UNIQUE_OPERATIONS=80 DISTINCT_RATIOS=${new Set(sample.cases.map(x => x.ratio)).size} FRESH_V2_SUPPORTED=${allowed} STILL_OUTSIDE_3_TO_1=${blocked} OLD_FROZEN_NOT_REWRITTEN=1 FULL_EMPLOYEE_REPLAYS=0 SUPPLIER_CALLS=0`);
