import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'output/canvas-win-mac-audit-20261012');
const stage = process.argv[2];
assert.ok(['ASSESS', 'BASELINE', 'MODIFIED', 'ROLLBACK'].includes(stage));
const readJson = async file => JSON.parse(await readFile(path.join(dir, file), 'utf8'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
if (stage === 'ASSESS') {
  // Preserve the original run verbatim; only its expected filename rule changed.
  const rawBytes = await readFile(path.join(dir, 'verified/results.json'));
  const raw = JSON.parse(rawBytes);
  const naming = await readJson('naming-rule-confirmed/results.json');
  assert.equal(raw.results.length, 82);
  assert.equal(naming.results.length, 4);
  let corrected = 0;
  const results = raw.results.map(item => {
    if (item.id !== 'jpeg-download-extension') return item;
    assert.equal(item.status, 'FAIL');
    assert.match(item.message, /response image\/jpeg; filename .*\.png$/);
    const regression = naming.results.find(x => x.profile === item.profile);
    assert.equal(regression?.id, 'jpeg-download-png-naming-policy');
    assert.equal(regression.status, 'PASS');
    assert.equal(regression.detail.mime, 'image/jpeg');
    assert.match(regression.detail.filename, /\.png$/);
    corrected++;
    return { ...item, id: 'jpeg-download-png-naming-policy', status: 'PASS',
      originalId: item.id, originalStatus: item.status, originalMessage: item.message,
      assessment: 'User confirmed JPEG downloads intentionally use PNG filenames; product unchanged.' };
  });
  assert.equal(corrected, 4);
  const orbRuns = [
    { file: 'orb-layout-supplement/results.json', profiles: ['win-chrome', 'win-edge-125', 'mac-chrome-sim'] },
    { file: 'orb-webkit-verified/results.json', profiles: ['mac-webkit-sim'] },
  ];
  const orbResults = [];
  for (const { file, profiles } of orbRuns) {
    const run = await readJson(file);
    assert.equal(run.providerCalls, 0); assert.equal(run.nativeMac, false);
    for (const profile of profiles) {
      const item = run.results.find(x => x.profile === profile && x.id === 'orb-dock-control-hit-targets');
      assert.equal(item?.status, 'FAIL');
      const observations = await readJson(`${path.dirname(file)}/${profile}-orb-hit-targets.json`);
      assert.equal(observations.length, 4);
      assert.ok(observations.some(x => x.blockedControls.some(c => c.label === '关闭')));
      orbResults.push({ ...item, sourceEvidence: file, observations });
    }
  }
  assert.equal(orbResults.length, 4);
  const assessment = { ...raw, results, originalEvidence: 'verified/results.json',
    originalSha256: sha256(rawBytes), correctedExpectations: corrected,
    productModified: false, rule: 'JPEG downloads intentionally named PNG; user confirmed 2026-10-12',
    totals: { checks: results.length, pass: results.filter(x => x.status === 'PASS').length,
      fail: results.filter(x => x.status === 'FAIL').length }, orbResults,
    finalBrowserMatrix: { checks: 142, pass: 112, fail: 30 },
    matrixGroups: { assessedBase: 82, existingRegressions: 52, comfyDialog: 4, orbSupplement: 4 },
    excludedHarnessFailure: 'Initial supplemental WebKit click timeout; viewport-fit setup corrected, separate rerun retained.' };
  assert.deepEqual(assessment.totals, { checks: 82, pass: 60, fail: 22 });
  await writeFile(path.join(dir, 'assessed-results.json'), JSON.stringify(assessment, null, 2) + '\n');
  console.log('REPORT_ASSESSMENT=PASS RAW=UNCHANGED CORRECTED_EXPECTATIONS=4 CHECKS=82 PASS=60 FAIL=22 PRODUCT=UNCHANGED');
  process.exit(0);
}
const file = stage === 'BASELINE' ? 'BASELINE_FILE.md' : stage === 'MODIFIED' ? 'MODIFIED_FILE.md' : 'rollback-rehearsal/MODIFIED_FILE.md';
const data = await readFile(path.join(dir, file));
const state = data.toString('utf8').includes('Audit-State: AUDITED') ? 'AUDITED' : 'PLANNED';
assert.equal(state, stage === 'MODIFIED' ? 'AUDITED' : 'PLANNED');
if (stage === 'MODIFIED') {
  const report = data.toString('utf8');
  for (const id of ['C01', 'C02', 'C03', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'T01']) assert.ok(report.includes(`| ${id} |`));
  assert.ok(!report.includes('| C04 |'), 'JPEG naming rule is not a product defect');
  assert.ok(report.includes('10 类已确认产品缺陷'));
  assert.ok(report.includes('| C12 |'));
  const r = await readJson('verified/results.json');
  assert.equal(r.results.length, 82); assert.equal(r.providerCalls, 0); assert.equal(r.nativeMac, false);
  assert.equal(r.results.filter(x => x.status === 'PASS').length, 56);
  const assessed = await readJson('assessed-results.json');
  assert.equal(assessed.originalSha256, sha256(await readFile(path.join(dir, 'verified/results.json'))));
  assert.equal(assessed.productModified, false);
  assert.deepEqual(assessed.totals, { checks: 82, pass: 60, fail: 22 });
  assert.equal(assessed.results.filter(x => x.originalStatus === 'FAIL' && x.status === 'PASS').length, 4);
  assert.equal(assessed.orbResults.length, 4);
  assert.ok(assessed.orbResults.every(x => x.status === 'FAIL' && x.observations.some(row => row.blockedControls.length)));
  assert.deepEqual(assessed.finalBrowserMatrix, { checks: 142, pass: 112, fail: 30 });
  const naming = await readJson('naming-rule-confirmed/results.json');
  assert.equal(naming.results.length, 4); assert.ok(naming.results.every(x => x.status === 'PASS'));
  assert.equal(naming.providerCalls, 0); assert.equal(naming.nativeMac, false);
  const dialog = await readJson('dialogs-verified/results.json');
  assert.equal(dialog.results.length, 4); assert.equal(dialog.results.filter(x => x.status === 'FAIL').length, 4);
  for (const engine of ['edge', 'webkit']) {
    const regression = await readJson(`${engine}-regression/result.json`);
    assert.equal(regression.checks.length, 26); assert.equal(regression.providerCalls, 0); assert.deepEqual(regression.errors, []);
  }
  const layout = await readJson('layout-overlap.json');
  assert.equal(layout.pairs, 96); assert.deepEqual(layout.overlaps, []);
  const runtime = await readJson('runtime/results.json');
  assert.equal(runtime.findings.length, 4); assert.equal(runtime.clipboardFileChecks, 7);
  assert.equal(sha256(await readFile(path.join(root, 'src/components/canvas/canvas-client.tsx'))), r.sourceSha256);
  assert.equal(sha256(await readFile(path.join(root, 'docs/changes/2026-10-12-canvas-win-mac-audit.md'))), sha256(data));
  console.log('REPORT_MODIFIED=PASS STATE=AUDITED BROWSER=142 PASS=112 FAIL=30 CONFIRMED=10 RISK=1 JPEG_POLICY=4/4 PRODUCT=UNCHANGED');
} else {
  const baseline = await readFile(path.join(dir, 'BASELINE_FILE.md'));
  assert.equal(sha256(data), sha256(baseline));
  console.log(stage === 'BASELINE' ? 'REPORT_BASELINE=PASS STATE=PLANNED' : 'REPORT_ROLLBACK=PASS STATE=PLANNED HASH=RESTORED');
}
