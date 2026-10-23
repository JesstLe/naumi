#!/usr/bin/env node
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {captureCase, verifyCase} = require('./capture-imagegen-benchmark-case.cjs');
const repo = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const baseCommit = 'cd64d1ffd4eda66afcbe7817fc9016203c92be4a';
const operationPseudonym = 'op-0123456789abcdef';
const fixtures = {
  parameters: {ratio: '1:2', referenceCount: 0, modelVersion: 112, billingVersion: 8},
  request: {method: 'POST', parameters: {width: 1024, height: 2048}},
  response: {status: 403, outcome: 'failed', deliveredImages: 0},
  'frozen-quote': {modelVersion: 112, billingVersion: 8, credits: 14, count: 1},
  'frozen-config': {modelVersion: 112, billingVersion: 8, sizePolicyVersion: 1},
  'operation-sequence': {steps: [{action: 'preview'}, {action: 'submit', afterMs: 200}]},
  'initial-state': {status: 'new', reservation: 'none', checkpoint: 'none', paidOperation: 'not-started'},
  'fault-conditions': {conditions: [{kind: 'supplier-quota', httpStatus: 403, afterStep: 1}]},
};
// All generated fixtures/results stay ignored, and remain for a reviewer to inspect.
fs.mkdirSync(path.join(repo, 'output'), {recursive: true});
const runRoot = fs.mkdtempSync(path.join(repo, 'output', 'capture-case-tests-'));
let serial = 0;
function fixture(options = {}) {
  const dir = path.join(runRoot, `input-${++serial}`);
  fs.mkdirSync(dir);
  const descriptor = {schemaVersion: 1, caseId: 'case-test', fidelity: 'mechanism-fixture',
    source: {commit: baseCommit, entrypoint: '/api/imagegen', operationPseudonym}, inputAssetCount: 0, evidence: []};
  for (const [index, [role, payload]] of Object.entries(fixtures).entries()) {
    const relative = `f-${index}.json`, bytes = json(payload);
    fs.writeFileSync(path.join(dir, relative), bytes);
    descriptor.evidence.push({id: `e-${index}`, role, origin: options.origin || 'fixture', sourceId: 'source-test',
      operationPseudonym, handling: 'shareable-json', path: relative, sha256: sha(bytes)});
  }
  const input = path.join(dir, 'descriptor.json'), output = path.join(runRoot, `case-${serial}`);
  function write() { fs.writeFileSync(input, json(descriptor)); }
  function change(role, payload) {
    const item = descriptor.evidence.find(e => e.role === role), bytes = json(payload);
    fs.writeFileSync(path.join(dir, item.path), bytes); item.sha256 = sha(bytes); write();
  }
  write(); return {dir, input, output, descriptor, write, change};
}
function rejected(change, code) {
  const f = fixture(); change(f); f.write();
  assert.throws(() => captureCase(f.input, f.output), code);
  assert.equal(fs.existsSync(f.output), false, 'invalid input must not create a partial package');
}
function mutateManifest(f, change) {
  const p = path.join(f.output, 'manifest.json'), m = JSON.parse(fs.readFileSync(p));
  change(m); fs.writeFileSync(p, json(m));
}

test('valid fixture package hashes exact persisted bytes; captured is never replayed or fixed', () => {
  const f = fixture(), m = captureCase(f.input, f.output);
  assert.equal(m.status, 'captured'); assert.equal(m.replay.status, 'not-run');
  assert.equal(m.replay.result, null); assert.equal(m.replay.exactReplayVerified, false);
  assert.equal(m.replay.employeeExactRequestsReplayed, 0); assert.equal(m.historyClosure, 'NOT_PROVEN');
  assert.equal(m.historicalIncidentsResolvedByThisCapture, 0);
  assert.equal(m.evidenceCompleteness.originalMaterialsComplete, false);
  assert(m.evidenceCompleteness.missingOriginalEvidence.includes('request'));
  for (const e of m.evidence) {
    const bytes = fs.readFileSync(path.join(f.output, e.packageFile.path));
    assert.equal(sha(bytes), e.packageFile.sha256); assert.equal(bytes.length, e.packageFile.byteLength);
  }
  assert.deepEqual(verifyCase(f.output), m);
  assert.throws(() => captureCase(f.input, f.output), /OUTPUT_EXISTS/);
});

test('original parameters need real local bytes with original declaration, not sanitized/fixture', () => {
  for (const origin of ['fixture', 'sanitized-original']) rejected(f => {
    f.descriptor.fidelity = 'original-parameters'; f.descriptor.evidence[0].origin = origin;
  }, /ORIGINAL_PARAMETERS_REQUIRED/);
  const f = fixture(); f.descriptor.fidelity = 'original-parameters'; f.descriptor.evidence[0].origin = 'original'; f.write();
  const m = captureCase(f.input, f.output);
  assert.equal(m.fidelity, 'original-parameters'); assert.equal(m.replay.employeeExactRequestsReplayed, 0);
});

test('private originals are hashed in place, never copied or named in shared manifest/logs', () => {
  const f = fixture(), marker = 'PRIVATE_ORIGINAL_DO_NOT_COPY_0123456789';
  const originalName = 'private-alice-example.json';
  const bytes = json({prompt: marker, Authorization: 'Bearer SECRET_PRIVATE', email: 'alice@example.test', url: 'https://example.test/?token=SECRET_PRIVATE'});
  fs.writeFileSync(path.join(f.dir, originalName), bytes);
  const e = f.descriptor.evidence.find(x => x.role === 'request');
  Object.assign(e, {path: originalName, sha256: sha(bytes), handling: 'private-hash-only', origin: 'original'});
  f.write(); const m = captureCase(f.input, f.output);
  assert.equal(m.evidence.find(x => x.role === 'request').sha256, sha(bytes));
  assert.equal(m.evidence.find(x => x.role === 'request').packageFile, null);
  const packageBytes = fs.readFileSync(path.join(f.output, 'manifest.json'), 'utf8') + fs.readdirSync(path.join(f.output, 'evidence')).map(n => fs.readFileSync(path.join(f.output, 'evidence', n))).join('');
  for (const secret of [marker, originalName, f.dir, 'SECRET_PRIVATE', 'alice@example.test', 'Authorization']) assert(!packageBytes.includes(secret));
  assert.equal(fs.readFileSync(path.join(f.dir, originalName), 'utf8'), bytes);
});

test('complete declared-original materials remain captured, never authenticate historical provenance', () => {
  const f = fixture({origin: 'original'}); f.descriptor.fidelity = 'exact-full-request'; f.descriptor.inputAssetCount = 1;
  for (const e of f.descriptor.evidence) e.handling = 'private-hash-only';
  const bytes = Buffer.from([137, 80, 78, 71, 1, 2, 3]); fs.writeFileSync(path.join(f.dir, 'asset.bin'), bytes);
  f.descriptor.evidence.push({id: 'asset-one', role: 'input-asset', origin: 'original', sourceId: 'source-test', operationPseudonym,
    handling: 'private-hash-only', path: 'asset.bin', sha256: sha(bytes)});
  f.write(); const m = captureCase(f.input, f.output);
  assert.equal(m.evidenceCompleteness.originalMaterialsComplete, true);
  assert.equal(m.evidenceCompleteness.provenance, 'operator-declared-local-bytes-hashed-not-authenticated');
  assert.equal(m.replay.exactReplayVerified, false); assert.equal(m.replay.result, null);
  assert.deepEqual(fs.readdirSync(f.output), ['manifest.json']);
  mutateManifest(f, x => { x.replay.exactReplayVerified = true; x.replay.employeeExactRequestsReplayed = 1; });
  assert.throws(() => verifyCase(f.output), /MANIFEST_CLAIM_MISMATCH/);
});

test('forged exact label, missing originals/assets/source/operation/hash, and fake replay/closure fail', () => {
  rejected(f => { f.descriptor.fidelity = 'exact-full-request'; }, /EXACT_ORIGINAL_EVIDENCE_REQUIRED/);
  rejected(f => { f.descriptor.evidence = f.descriptor.evidence.filter(e => e.role !== 'initial-state'); }, /MISSING_REQUIRED_EVIDENCE/);
  rejected(f => { f.descriptor.source.commit = 'HEAD'; }, /INVALID_SOURCE_COMMIT/);
  rejected(f => { delete f.descriptor.evidence[0].sourceId; }, /MISSING_FIELD/);
  rejected(f => { f.descriptor.evidence[0].sha256 = '0'.repeat(64); }, /HASH_MISMATCH/);
  rejected(f => { f.descriptor.evidence[0].operationPseudonym = 'op-abcdef0123456789'; }, /OPERATION_MISMATCH/);
  rejected(f => { f.descriptor.replay = {status: 'passed'}; }, /UNKNOWN_FIELD/);
  rejected(f => { f.descriptor.status = 'replayed'; }, /UNKNOWN_FIELD/);
  rejected(f => { f.descriptor.historyClosure = 'CLOSED'; }, /UNKNOWN_FIELD/);
  const f = fixture({origin: 'original'}); f.descriptor.fidelity = 'exact-full-request';
  f.descriptor.evidence.forEach(e => { e.handling = 'private-hash-only'; });
  f.descriptor.inputAssetCount = 1; f.write();
  assert.throws(() => captureCase(f.input, f.output), /EXACT_ORIGINAL_EVIDENCE_REQUIRED/);
});

test('secret/PII/free text and unknown fields in every shared role fail without echo', () => {
  const sensitive = [
    {Authorization: 'Bearer NEVER_ECHO_SECRET'}, {cookie: 'session=NEVER_ECHO_SECRET'},
    {token: 'NEVER_ECHO_SECRET'}, {api_key: 'NEVER_ECHO_SECRET'}, {email: 'alice@example.test'},
    {url: 'https://example.test/?key=NEVER_ECHO_SECRET'}, {prompt: 'PRIVATE_PROMPT'},
    {unexpected: [{cookie: 'NEVER_ECHO_SECRET'}]}, {ratio: 'https://example.test/path?x=SECRET'},
    {ratio: 'https://user:password@example.test/'}, {ratio: 'alice@example.test'}, {ratio: 'sk-NEVER_ECHO_SECRET'},
    {ratio: 'Bearer NEVER_ECHO_SECRET'}, {custom: 'not-whitelisted'},
  ];
  for (const payload of sensitive) rejected(f => f.change('parameters', payload), /SECRET_REJECTED|UNKNOWN_FIELD/);
  for (const role of Object.keys(fixtures)) rejected(f => f.change(role, {...fixtures[role], unexpected: 'PRIVATE_PROMPT'}), /UNKNOWN_FIELD/);
  const f = fixture(); f.change('response', {status: 403, outcome: 'https://user:password@example.test/?secret=NEVER_ECHO_SECRET'});
  const result = cp.spawnSync(process.execPath, [path.join(repo, 'scripts/capture-imagegen-benchmark-case.cjs'), '--input', f.input, '--output', f.output], {encoding: 'utf8'});
  assert.equal(result.status, 1); assert.equal(result.stderr, 'CASE_CAPTURE=ERROR CODE=SECRET_REJECTED\n');
  assert.equal(result.stdout, ''); assert(!JSON.stringify(result).includes('NEVER_ECHO_SECRET'));
});

test('path traversal, network/device/ADS paths and output siblings fail before IO', () => {
  for (const p of ['../escape.json', '/absolute', 'x/../../outside', 'C:relative', 'C:/outside.json', '\\rooted', '\\\\host\\share', '\\\\?\\C:\\device', 'file:stream', 'https://host/file', 'nested//x.json']) {
    rejected(f => { f.descriptor.evidence[0].path = p; }, /PATH_TRAVERSAL|INVALID_EVIDENCE_PATH/);
  }
  rejected(f => { f.descriptor.caseId = '../x'; }, /INVALID_PSEUDONYM/);
  const f = fixture();
  for (const p of ['../output-other/case', 'output/../escape', 'output-other/case', '\\\\host\\share', 'C:relative', 'output/x:stream', 'https://example.test/case']) {
    assert.throws(() => captureCase(f.input, p), /OUTPUT_MUST_BE_IGNORED_LOCAL_OUTPUT|PATH_TRAVERSAL|NONLOCAL_PATH/);
  }
});

test('links/junctions reject escape; external sentinel and originals remain unchanged', () => {
  const f = fixture();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-case-sentinel-'));
  fs.writeFileSync(path.join(external, 'sentinel.json'), 'DO_NOT_CHANGE');
  const linked = path.join(f.dir, 'link');
  fs.symlinkSync(external, linked, 'junction');
  f.descriptor.evidence[0].path = 'link/sentinel.json'; f.write();
  assert.throws(() => captureCase(f.input, f.output), /LINK_PATH_REJECTED/);
  assert.equal(fs.readFileSync(path.join(external, 'sentinel.json'), 'utf8'), 'DO_NOT_CHANGE');
  const outputLink = path.join(runRoot, 'linked-output'); fs.symlinkSync(external, outputLink, 'junction');
  assert.throws(() => captureCase(f.input, path.join(outputLink, 'case')), /LINK_PATH_REJECTED/);
  assert.equal(fs.existsSync(path.join(external, 'case')), false);
});

test('duplicate identities/roles, bad numbers/JSON and copy of assets reject', () => {
  rejected(f => { f.descriptor.evidence[1].id = f.descriptor.evidence[0].id; }, /DUPLICATE_EVIDENCE/);
  rejected(f => { f.change('request', {width: 1024}); f.descriptor.evidence[1].role = 'parameters'; }, /DUPLICATE_ROLE/);
  rejected(f => f.change('parameters', {count: -1}), /INVALID_NUMBER/);
  rejected(f => { f.descriptor.evidence[1].role = 'input-asset'; }, /PRIVATE_ONLY_ROLE/);
  rejected(f => { fs.writeFileSync(path.join(f.dir, f.descriptor.evidence[0].path), '{SECRET_INVALID'); f.descriptor.evidence[0].sha256 = sha('{SECRET_INVALID'); }, /INVALID_JSON/);
});

test('verifier rejects tampered byte/hash, extra files, path and replay/closure claims', () => {
  for (const mutation of [
    m => { m.status = 'replayed'; }, m => { m.historyClosure = 'CLOSED'; },
    m => { m.replay.result = {passed: true}; }, m => { m.historicalIncidentsResolvedByThisCapture = 1; },
    m => { m.evidenceCompleteness.originalMaterialsComplete = true; }, m => { m.fidelity = 'exact-full-request'; },
    m => { m.evidence[0].sha256 = 'wrong'; }, m => { m.evidence[0].packageFile.path = '../outside'; },
  ]) {
    const f = fixture(); captureCase(f.input, f.output); mutateManifest(f, mutation);
    assert.throws(() => verifyCase(f.output), /MANIFEST_CLAIM_MISMATCH|EXACT_ORIGINAL_EVIDENCE_REQUIRED|INVALID_SHA256|INVALID_PACKAGE_PATH/);
  }
  const f = fixture(), m = captureCase(f.input, f.output), payload = path.join(f.output, m.evidence[0].packageFile.path);
  fs.appendFileSync(payload, ' '); assert.throws(() => verifyCase(f.output), /HASH_MISMATCH/);
  const g = fixture(); captureCase(g.input, g.output); fs.writeFileSync(path.join(g.output, 'private.txt'), 'PRIVATE');
  assert.throws(() => verifyCase(g.output), /UNLISTED_PACKAGE_FILE/);
});

test('historical catalog keeps exact zero and CLI remains offline/no dependency installation', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repo, 'docs/benchmarks/imagegen-history-20261023.json')));
  assert.equal(catalog.employeeExactRequestsReplayed, 0);
  const code = fs.readFileSync(path.join(repo, 'scripts/capture-imagegen-benchmark-case.cjs'), 'utf8');
  assert(!/require\(['"](?:https?|net|tls|dns|undici)['"]\)|\bfetch\(/.test(code));
  assert(!/execSync|execFileSync|\beval\(|new Function|shell:\s*true/.test(code));
  const result = cp.spawnSync(process.execPath, [path.join(repo, 'scripts/capture-imagegen-benchmark-case.cjs'), '--help'], {encoding: 'utf8'});
  assert.equal(result.status, 0); assert(result.stdout.includes('--verify')); assert.equal(result.stderr, '');
});
