#!/usr/bin/env node
'use strict';
// Offline evidence packaging only. Never executes a request, runner, or descriptor command.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const TOOL = 'scripts/capture-imagegen-benchmark-case.cjs';
const ROLES = ['parameters', 'request', 'response', 'input-asset', 'frozen-quote', 'frozen-config', 'operation-sequence', 'initial-state', 'fault-conditions'];
const REQUIRED = ['parameters', 'operation-sequence', 'initial-state', 'fault-conditions'];
const EXACT = ROLES.filter(x => x !== 'input-asset');
const FIDELITIES = ['exact-full-request', 'original-parameters', 'mechanism-fixture'];
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const OP = /^op-[a-f0-9]{16,64}$/;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
function need(condition, code) { if (!condition) throw Error(code); }
function object(value, allowed, required = allowed) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT');
  need(Object.keys(value).every(k => allowed.includes(k)), 'UNKNOWN_FIELD');
  need(required.every(k => Object.hasOwn(value, k)), 'MISSING_FIELD');
}
function one(value, values) { need(values.includes(value), 'INVALID_ENUM'); }
function integer(value, min = 0, max = 1000000000) {
  need(Number.isSafeInteger(value) && value >= min && value <= max, 'INVALID_NUMBER');
}
function alias(value) { need(typeof value === 'string' && ID.test(value), 'INVALID_PSEUDONYM'); }
function digest(value) { need(typeof value === 'string' && HASH.test(value), 'INVALID_SHA256'); }
function operation(value) { need(typeof value === 'string' && OP.test(value), 'INVALID_OPERATION_PSEUDONYM'); }

// Deliberately small structured projections. Prompts, URLs, arbitrary headers/text and
// unknown fields are not a redaction problem to guess at: keep their originals private.
const SECRET_KEY = /authorization|cookie|token|secret|password|passwd|api.?key|email|prompt|headers?|url|uri|credential|private.?key/i;
const SECRET_VALUE = /(?:https?|file|ftp|wss?):|(?:bearer|basic)\s+|\b(?:sk|sess|ghp|github_pat)[_-][a-z0-9_-]+|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}|[?&][^\s=]+=/i;
function noSecrets(value) {
  if (typeof value === 'string') need(!SECRET_VALUE.test(value), 'SECRET_REJECTED');
  else if (Array.isArray(value)) value.forEach(noSecrets);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      need(!SECRET_KEY.test(key), 'SECRET_REJECTED');
      noSecrets(child);
    }
  }
}
function parameters(value) {
  const numeric = ['width', 'height', 'count', 'referenceCount', 'modelVersion', 'billingVersion', 'sizePolicyVersion'];
  object(value, [...numeric, 'ratio', 'resolution', 'quality'], []);
  need(Object.keys(value).length > 0, 'EMPTY_PARAMETERS');
  for (const [k, v] of Object.entries(value)) {
    if (numeric.includes(k)) integer(v, k === 'referenceCount' ? 0 : 1);
    else if (k === 'ratio') need(typeof v === 'string' && /^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$/.test(v), 'INVALID_RATIO');
    else if (k === 'resolution') one(v, ['1K', '2K', '4K', 'auto']);
    else one(v, ['auto', 'standard', 'high', 'medium', 'low', 'hd']);
  }
}
function validatePayload(role, value) {
  noSecrets(value);
  if (role === 'parameters' || role === 'frozen-config') parameters(value);
  else if (role === 'request') {
    object(value, ['method', 'parameters'], ['method']);
    one(value.method, ['POST', 'GET']);
    if (value.parameters !== undefined) parameters(value.parameters);
  } else if (role === 'response') {
    object(value, ['status', 'outcome', 'deliveredImages'], ['status', 'outcome']);
    integer(value.status, 100, 599);
    one(value.outcome, ['failed', 'pending', 'delivered', 'unknown', 'rejected']);
    if (value.deliveredImages !== undefined) integer(value.deliveredImages, 0, 100);
  } else if (role === 'frozen-quote') {
    object(value, ['modelVersion', 'billingVersion', 'credits', 'count']);
    integer(value.modelVersion, 1); integer(value.billingVersion, 1); integer(value.count, 1, 100);
    need(Number.isFinite(value.credits) && value.credits >= 0 && value.credits <= 1e9, 'INVALID_NUMBER');
  } else if (role === 'operation-sequence') {
    object(value, ['steps']);
    need(Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 100, 'INVALID_STEPS');
    for (const step of value.steps) {
      object(step, ['action', 'afterMs'], ['action']);
      one(step.action, ['upload', 'preview', 'quote', 'submit', 'poll', 'refresh', 'retry-local-delivery', 'worker-recover', 'cancel']);
      if (step.afterMs !== undefined) integer(step.afterMs);
    }
  } else if (role === 'initial-state') {
    object(value, ['status', 'reservation', 'checkpoint', 'paidOperation']);
    one(value.status, ['new', 'pending', 'running', 'done', 'failed', 'needs_attention']);
    one(value.reservation, ['none', 'held', 'settled', 'released']);
    one(value.checkpoint, ['none', 'stored']);
    one(value.paidOperation, ['not-started', 'started', 'unknown', 'complete', 'not-charged']);
  } else if (role === 'fault-conditions') {
    object(value, ['conditions']);
    need(Array.isArray(value.conditions) && value.conditions.length > 0 && value.conditions.length <= 100, 'INVALID_CONDITIONS');
    for (const condition of value.conditions) {
      object(condition, ['kind', 'afterStep', 'httpStatus'], ['kind']);
      one(condition.kind, ['none', 'local-capacity', 'quote-drift', 'supplier-quota', 'supplier-error', 'unknown-outcome', 'delivery-failure', 'large-result', 'ratio-rejection', 'ratio-difference', 'saved-checkpoint']);
      if (condition.afterStep !== undefined) integer(condition.afterStep, 0, 99);
      if (condition.httpStatus !== undefined) integer(condition.httpStatus, 100, 599);
    }
  } else need(false, 'PRIVATE_ONLY_ROLE');
  return value;
}

function localPath(value) {
  need(typeof value === 'string' && value.length > 0 && !/[\x00-\x1f]/.test(value), 'INVALID_LOCAL_PATH');
  // Reject UNC, device paths, drive-relative paths, ADS and scheme references before IO.
  need(!/^(?:[\\/]{2}|\\|[a-z][a-z0-9+.-]*:\/\/)/i.test(value), 'NONLOCAL_PATH');
  if (process.platform === 'win32') need(!value.startsWith('/'), 'NONLOCAL_PATH');
  const tail = /^[a-z]:[\\/]/i.test(value) ? value.slice(2) : value;
  need(!tail.includes(':') && !/^[a-z]:[^\\/]/i.test(value), 'NONLOCAL_PATH');
  need(!value.split(/[\\/]/).includes('..'), 'PATH_TRAVERSAL');
  return path.resolve(value);
}
function noLinks(target) {
  const absolute = path.resolve(target), parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) continue;
    need(!fs.lstatSync(cursor).isSymbolicLink(), 'LINK_PATH_REJECTED');
  }
  if (fs.existsSync(absolute)) need(!fs.realpathSync(absolute).startsWith('\\\\'), 'NONLOCAL_PATH');
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function evidencePath(parent, relative) {
  need(typeof relative === 'string' && /^[a-zA-Z0-9_./-]+$/.test(relative), 'INVALID_EVIDENCE_PATH');
  need(!relative.startsWith('/') && !relative.split('/').some(x => !x || x === '.' || x === '..'), 'PATH_TRAVERSAL');
  const result = path.resolve(parent, relative);
  need(within(parent, result), 'PATH_TRAVERSAL');
  noLinks(result);
  return result;
}
function readLocal(file, keepBytes = false) {
  noLinks(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(fd);
    need(before.isFile(), 'NOT_REGULAR_FILE');
    need(!keepBytes || before.size <= 1024 * 1024, 'JSON_TOO_LARGE');
    const hash = crypto.createHash('sha256'), chunks = [];
    const block = Buffer.alloc(64 * 1024);
    let length = 0, n;
    while ((n = fs.readSync(fd, block, 0, block.length, null)) > 0) {
      hash.update(block.subarray(0, n)); length += n;
      if (keepBytes) chunks.push(Buffer.from(block.subarray(0, n)));
      need(!keepBytes || length <= 1024 * 1024, 'JSON_TOO_LARGE');
    }
    const after = fs.fstatSync(fd);
    need(length === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs, 'INPUT_CHANGED');
    return {sha256: hash.digest('hex'), byteLength: length, bytes: keepBytes ? Buffer.concat(chunks) : null};
  } finally { fs.closeSync(fd); }
}
function parseJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw Error('INVALID_JSON'); }
}
function source(value) {
  object(value, ['commit', 'entrypoint', 'operationPseudonym']);
  need(typeof value.commit === 'string' && /^[a-f0-9]{40}$/.test(value.commit), 'INVALID_SOURCE_COMMIT');
  one(value.entrypoint, ['/api/imagegen', '/api/generate-image', 'worker-recovery', 'local-handler', 'parameter-function']);
  operation(value.operationPseudonym);
}
function evidenceMeta(e, op) {
  alias(e.id); one(e.role, ROLES); one(e.origin, ['original', 'sanitized-original', 'fixture']);
  alias(e.sourceId); operation(e.operationPseudonym);
  need(e.operationPseudonym === op, 'OPERATION_MISMATCH');
  one(e.handling, ['shareable-json', 'private-hash-only']); digest(e.sha256);
  if (e.role === 'input-asset') need(e.handling === 'private-hash-only', 'PRIVATE_ONLY_ROLE');
}
function completeness(meta, entries) {
  const roles = entries.map(x => x.role);
  need(REQUIRED.every(x => roles.includes(x)), 'MISSING_REQUIRED_EVIDENCE');
  need(new Set(entries.map(x => x.id)).size === entries.length, 'DUPLICATE_EVIDENCE');
  for (const role of ROLES.filter(x => x !== 'input-asset')) need(roles.filter(x => x === role).length <= 1, 'DUPLICATE_ROLE');
  need(roles.filter(x => x === 'input-asset').length <= meta.inputAssetCount, 'ASSET_COUNT_MISMATCH');
  const originals = entries.filter(x => x.origin === 'original');
  const missing = EXACT.filter(role => !originals.some(x => x.role === role));
  const originalAssets = originals.filter(x => x.role === 'input-asset').length;
  if (originalAssets !== meta.inputAssetCount) missing.push('input-assets');
  const complete = missing.length === 0;
  if (meta.fidelity === 'exact-full-request') {
    need(complete, 'EXACT_ORIGINAL_EVIDENCE_REQUIRED');
    need(['request', 'response'].every(role => originals.some(x => x.role === role && x.handling === 'private-hash-only')), 'EXACT_PRIVATE_ORIGINAL_REQUIRED');
  }
  if (meta.fidelity === 'original-parameters') need(originals.some(x => x.role === 'parameters'), 'ORIGINAL_PARAMETERS_REQUIRED');
  return {presentRoles: ROLES.filter(x => roles.includes(x)), missingOriginalEvidence: missing,
    originalInputAssets: originalAssets, originalMaterialsComplete: complete,
    provenance: 'operator-declared-local-bytes-hashed-not-authenticated', replayEvidence: 'absent'};
}
function manifestFor(meta, entries, capturedAt, toolHash) {
  return {schemaVersion: 1, kind: 'imagegen-benchmark-case', caseId: meta.caseId, capturedAt,
    captureTool: {path: TOOL, sha256: toolHash}, source: meta.source, fidelity: meta.fidelity,
    fidelityMeaning: 'material-coverage-only-not-exact-replay', inputAssetCount: meta.inputAssetCount,
    evidenceCompleteness: completeness(meta, entries), status: 'captured',
    replay: {status: 'not-run', result: null, exactReplayVerified: false, employeeExactRequestsReplayed: 0},
    historyClosure: 'NOT_PROVEN', historicalIncidentsResolvedByThisCapture: 0, evidence: entries};
}
function outputPath(value) {
  const output = localPath(value);
  need(within(path.join(ROOT, 'output'), output), 'OUTPUT_MUST_BE_IGNORED_LOCAL_OUTPUT');
  noLinks(output);
  const relative = path.relative(ROOT, output).split(path.sep).join('/');
  const ignored = cp.spawnSync('git', ['check-ignore', '-q', '--', relative], {cwd: ROOT, stdio: 'pipe', windowsHide: true});
  need(ignored.status === 0, 'OUTPUT_NOT_GIT_IGNORED');
  const tracked = cp.spawnSync('git', ['ls-files', '--', relative], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  need(tracked.status === 0 && tracked.stdout.trim() === '', 'OUTPUT_ALREADY_TRACKED');
  return output;
}
function captureCase(input, output) {
  const inputPath = localPath(input), destination = outputPath(output);
  need(!fs.existsSync(destination), 'OUTPUT_EXISTS');
  const descriptor = parseJson(readLocal(inputPath, true).bytes);
  object(descriptor, ['schemaVersion', 'caseId', 'fidelity', 'source', 'inputAssetCount', 'evidence']);
  need(descriptor.schemaVersion === 1, 'INVALID_SCHEMA'); alias(descriptor.caseId);
  one(descriptor.fidelity, FIDELITIES); source(descriptor.source); integer(descriptor.inputAssetCount, 0, 100);
  need(Array.isArray(descriptor.evidence) && descriptor.evidence.length > 0 && descriptor.evidence.length <= 108, 'INVALID_EVIDENCE');
  const payloads = [];
  const entries = descriptor.evidence.map((e, index) => {
    object(e, ['id', 'role', 'origin', 'sourceId', 'operationPseudonym', 'handling', 'path', 'sha256']);
    evidenceMeta(e, descriptor.source.operationPseudonym);
    const original = readLocal(evidencePath(path.dirname(inputPath), e.path), e.handling === 'shareable-json');
    need(original.sha256 === e.sha256, 'HASH_MISMATCH');
    let packageFile = null;
    if (e.handling === 'shareable-json') {
      const bytes = jsonBytes(validatePayload(e.role, parseJson(original.bytes)));
      const relative = `evidence/e-${String(index).padStart(3, '0')}.json`;
      packageFile = {path: relative, sha256: sha(bytes), byteLength: bytes.length};
      payloads.push({relative, bytes});
    }
    // Input path, filename and descriptor bytes never enter the package.
    return {id: e.id, role: e.role, origin: e.origin, sourceId: e.sourceId,
      operationPseudonym: e.operationPseudonym, handling: e.handling,
      sha256: original.sha256, byteLength: original.byteLength, packageFile};
  });
  const manifest = manifestFor(descriptor, entries, new Date().toISOString(), readLocal(__filename).sha256);
  // Alias strings are constrained; scan metadata too, not private originals/hash strings.
  for (const e of entries) { noSecrets(e.id); noSecrets(e.sourceId); }
  noSecrets(descriptor.caseId);
  fs.mkdirSync(path.dirname(destination), {recursive: true}); noLinks(destination);
  fs.mkdirSync(destination);
  if (payloads.length) fs.mkdirSync(path.join(destination, 'evidence'));
  for (const item of payloads) fs.writeFileSync(path.join(destination, item.relative), item.bytes, {flag: 'wx', mode: 0o600});
  fs.writeFileSync(path.join(destination, 'manifest.json'), jsonBytes(manifest), {flag: 'wx', mode: 0o600});
  return verifyCase(destination);
}
function verifyCase(directory) {
  const root = outputPath(directory);
  const manifest = parseJson(readLocal(path.join(root, 'manifest.json'), true).bytes);
  object(manifest, ['schemaVersion', 'kind', 'caseId', 'capturedAt', 'captureTool', 'source', 'fidelity', 'fidelityMeaning', 'inputAssetCount', 'evidenceCompleteness', 'status', 'replay', 'historyClosure', 'historicalIncidentsResolvedByThisCapture', 'evidence']);
  alias(manifest.caseId); noSecrets(manifest.caseId); source(manifest.source); one(manifest.fidelity, FIDELITIES);
  integer(manifest.inputAssetCount, 0, 100);
  need(typeof manifest.capturedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.capturedAt), 'INVALID_CAPTURE_TIME');
  object(manifest.captureTool, ['path', 'sha256']); digest(manifest.captureTool.sha256);
  need(Array.isArray(manifest.evidence) && manifest.evidence.length > 0 && manifest.evidence.length <= 108, 'INVALID_EVIDENCE');
  const expectedFiles = ['manifest.json'];
  manifest.evidence.forEach((e, index) => {
    object(e, ['id', 'role', 'origin', 'sourceId', 'operationPseudonym', 'handling', 'sha256', 'byteLength', 'packageFile']);
    evidenceMeta(e, manifest.source.operationPseudonym); integer(e.byteLength, 0, Number.MAX_SAFE_INTEGER);
    noSecrets(e.id); noSecrets(e.sourceId);
    if (e.handling === 'private-hash-only') need(e.packageFile === null, 'PRIVATE_COPY_REJECTED');
    else {
      object(e.packageFile, ['path', 'sha256', 'byteLength']); digest(e.packageFile.sha256);
      integer(e.packageFile.byteLength, 1, 1024 * 1024);
      need(e.packageFile.path === `evidence/e-${String(index).padStart(3, '0')}.json`, 'INVALID_PACKAGE_PATH');
      const actual = readLocal(evidencePath(root, e.packageFile.path), true);
      need(actual.sha256 === e.packageFile.sha256 && actual.byteLength === e.packageFile.byteLength, 'HASH_MISMATCH');
      const payload = validatePayload(e.role, parseJson(actual.bytes));
      need(jsonBytes(payload).equals(actual.bytes), 'NONCANONICAL_PAYLOAD');
      expectedFiles.push(e.packageFile.path);
    }
  });
  const expected = manifestFor(manifest, manifest.evidence, manifest.capturedAt, manifest.captureTool.sha256);
  try { assert.deepEqual(manifest, expected); } catch { throw Error('MANIFEST_CLAIM_MISMATCH'); }
  const actualFiles = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const relative = prefix + entry.name;
      need(!entry.isSymbolicLink(), 'LINK_PATH_REJECTED');
      if (entry.isDirectory()) { need(relative === 'evidence', 'UNLISTED_PACKAGE_FILE'); walk(path.join(dir, entry.name), relative + '/'); }
      else { need(entry.isFile(), 'NOT_REGULAR_FILE'); actualFiles.push(relative); }
    }
  }
  walk(root);
  need(JSON.stringify(actualFiles.sort()) === JSON.stringify(expectedFiles.sort()), 'UNLISTED_PACKAGE_FILE');
  return manifest;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/capture-imagegen-benchmark-case.cjs --input LOCAL_DESCRIPTOR.json --output output/NEW_CASE\n       node scripts/capture-imagegen-benchmark-case.cjs --verify output/EXISTING_CASE');
    return;
  }
  let result;
  if (args.length === 2 && args[0] === '--verify') {
    result = verifyCase(args[1]);
    console.log(`CASE_VERIFY=PASS STATUS=${result.status} FIDELITY=${result.fidelity} REPLAYED=0 HISTORY_CLOSURE=NOT_PROVEN`);
  } else {
    need(args.length === 4 && args[0] === '--input' && args[2] === '--output', 'INVALID_ARGUMENTS');
    result = captureCase(args[1], args[3]);
    console.log(`CASE_CAPTURE=PASS STATUS=${result.status} FIDELITY=${result.fidelity} FILES=${1 + result.evidence.filter(e => e.packageFile).length} REPLAYED=0 HISTORY_CLOSURE=NOT_PROVEN`);
  }
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    // Do not echo input, path, JSON parser diagnostics, OS error messages or stack traces.
    const message = /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'LOCAL_IO_OR_VALIDATION_ERROR';
    console.error(`CASE_CAPTURE=ERROR CODE=${message}`); process.exitCode = 1;
  }
}
module.exports = {captureCase, verifyCase, validatePayload};
