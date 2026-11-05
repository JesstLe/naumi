'use strict';
// Executes the harness from the requested source copy, not this driver's tree.
// The original unbound Canvas closure must really fail on the baseline; dependency
// or setup failures are ERROR and never stand in for that controlled failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
function main() {
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sourceRoot = path.resolve(option('--source-root', path.join(__dirname, '..')));
const out = path.resolve(option('--out', path.join(process.cwd(), 'output/reference-retention-fixture-contract')));
const harness = 'scripts/verify-canvas-reference-retention.cjs';
const sourceNames = [harness, 'src/components/canvas/canvas-client.tsx', 'src/lib/canvas/input-references.ts',
  'src/lib/canvas/image-references.ts', 'src/lib/canvas/image-creation.ts', 'src/lib/canvas/image-task-request.ts',
  'src/lib/canvas/image-reference-drafts.ts', 'src/lib/canvas/image-node-drafts.ts',
  'src/lib/canvas/background-generation.ts', 'src/lib/browser-crypto.ts',
  'src/components/canvas/image-composer.tsx', 'package.json', 'package-lock.json', 'tsconfig.json'];
const preparationCases = ['held-flush-keeps-original-single-flight-before-request',
  'rejected-flush-unlocks-without-generation-and-allows-explicit-new-submit',
  ...['account', 'workspace', 'project', 'epoch', 'account-ABA', 'workspace-ABA', 'project-ABA'].map(kind => 'flush-' + kind + '-fences-before-creation-port'),
  'original-ack-then-new-submit-keeps-new-token-through-old-finally', 'original-reference-nodes-are-not-mutated'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const snapshot = () => Object.fromEntries(sourceNames.map(name => {
  const bytes = fs.readFileSync(path.join(sourceRoot, name));
  return [name, {sha256: sha(bytes), bytes: bytes.length}];
}));
const report = {sourceRoot, sources: {}, status: 'ERROR', supplierCalls: 0,
  evidenceTier: 'actual copied complete Canvas reference harness and creation/request/submission owners; image bytes, identity/save and transport remain declared fixtures; scope assert/services current are fixtures, not post-acceptance ABA, PG, browser, supplier or billing proof'};
const dependencyRoot = path.resolve(__dirname, '..', 'node_modules');
const dependencyLink = path.join(sourceRoot, 'node_modules');
let createdDependencyLink = false;
try {
  fs.mkdirSync(out, {recursive: true});
  report.sources = snapshot();
  const nodePath = dependencyRoot;
  if (!fs.existsSync(dependencyLink)) {
    assert(!fs.existsSync(path.join(sourceRoot, '.git')), 'Do not install a dependency link into an active checkout');
    assert.equal(path.relative(sourceRoot, dependencyLink), 'node_modules');
    fs.symlinkSync(dependencyRoot, dependencyLink, process.platform === 'win32' ? 'junction' : 'dir');
    createdDependencyLink = true;
  }
  report.dependencies = {temporaryLinkCreated: createdDependencyLink, target: fs.realpathSync(dependencyRoot)};
  const env = {...process.env, NODE_PATH: nodePath};
  env.NODE_OPTIONS = (env.NODE_OPTIONS || '').replace(/--conditions(?:=|\s+)react-server(?:\s|$)/g, ' ').trim();
  const childOut = path.join(out, 'actual-harness');
  const command = [path.join(sourceRoot, harness), 'MODIFIED', sourceRoot, childOut];
  const child = spawnSync(process.execPath, command, {cwd: sourceRoot, env, encoding: 'utf8', timeout: 180000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true});
  report.child = {command: [process.execPath, ...command], cwd: sourceRoot,
    nodePath, exit: child.status, signal: child.signal, error: child.error ? String(child.error) : null,
    stdout: child.stdout || '', stderr: child.stderr || ''};
  fs.writeFileSync(path.join(out, 'CHILD.stdout.log'), report.child.stdout);
  fs.writeFileSync(path.join(out, 'CHILD.stderr.log'), report.child.stderr);
  assert(!child.error && !child.signal, 'Actual harness must start and finish normally');
  if (child.status === 0) {
    const result = JSON.parse(fs.readFileSync(path.join(childOut, 'result.json'), 'utf8'));
    assert.equal(result.mode, 'MODIFIED');
    assert.equal(result.checks, 125);
    assert.equal(result.originalReferenceChecks, 40);
    assert.equal(result.preparationChecks, 85);
    assert.equal(result.actualSubmissionOwners, true);
    assert.equal(result.paidCalls, 0);
    assert.deepEqual(result.preparationCases, preparationCases);
    assert.equal(result.sourceSha256, report.sources['src/components/canvas/canvas-client.tsx'].sha256);
    assert.match(report.child.stdout, /MODIFIED_REFERENCE_RETENTION=PASS CHECKS=125 /);
    assert.match(report.child.stdout, /REFERENCE_PREPARATION=PASS CASES=11 CHECKS=85 ORIGINAL_REFERENCE_CHECKS=40 ACTUAL_SUBMISSION_OWNERS=1 EXTERNAL_NETWORK=0/);
    report.status = 'PASS'; report.actualResult = result;
  } else {
    assert.equal(child.status, 1);
    assert.match(report.child.stderr, /ReferenceError: canvasAccountRef is not defined/);
    assert.match(report.child.stderr, /at Object\.generateSelectedImage \(evalmachine\.<anonymous>:4:21\)/);
    assert.match(report.child.stderr, /verify-canvas-reference-retention\.cjs:25:166/);
    assert.match(report.child.stderr, /verify-canvas-reference-retention\.cjs:29:78/);
    assert.equal(fs.existsSync(path.join(childOut, 'result.json')), false, 'Original fixture must fail before reference assertions');
    report.status = 'FAIL'; report.expectedOriginalAssertion = {error: 'ReferenceError: canvasAccountRef is not defined',
      stack: report.child.stderr, resultAbsent: true};
  }
  assert.deepEqual(snapshot(), report.sources, 'Copied input bytes must stay unchanged');
  report.sourceIntegrity = 'UNCHANGED';
} catch (error) {
  report.status = 'ERROR'; report.error = {message: error.message, stack: error.stack};
} finally {
  if (createdDependencyLink) {
    try {
      assert(fs.lstatSync(dependencyLink).isSymbolicLink(), 'Only remove the link this invocation created');
      assert.equal(fs.realpathSync(dependencyLink), fs.realpathSync(dependencyRoot));
      // Non-recursive unlink of this exact junction, never its dependency tree.
      if (process.platform === 'win32') fs.rmdirSync(dependencyLink);
      else fs.unlinkSync(dependencyLink);
      report.dependencies.temporaryLinkRemoved = !fs.existsSync(dependencyLink);
      assert(report.dependencies.temporaryLinkRemoved);
      assert(fs.existsSync(dependencyRoot), 'Shared dependencies remain in place');
    } catch (error) {
      report.status = 'ERROR'; report.dependencyCleanupError = {message: error.message, stack: error.stack};
    }
  }
}
const exit = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
report.exit = exit;
report.stdout = `REFERENCE_RETENTION_FIXTURE_CONTRACT=${report.status} ACTUAL_COPIED_HARNESS=1 CHILD_EXIT=${report.child?.exit ?? 'UNKNOWN'} SUPPLIER_CALLS=0`;
fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n');
assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'REPORT.json'), 'utf8')).status, report.status);
console.log(report.stdout);
process.exitCode = exit;
}
try { main(); }
catch (error) { console.error(error.stack || error); process.exitCode = 2; }
