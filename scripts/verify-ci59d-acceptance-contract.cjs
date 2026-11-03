'use strict';
// Executes the harness from the requested source copy, not this driver's tree.
// The original admission assertion must really fail on the baseline; dependency
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
const out = path.resolve(option('--out', path.join(process.cwd(), 'output/ci59d-acceptance-contract')));
const harness = 'scripts/verify-main-sync-assistant-navigation.cjs';
const sourceNames = [harness, 'src/lib/canvas/assistant-session.ts', 'src/lib/canvas/project-navigation.ts',
  'src/lib/canvas/document-scope.ts', 'src/lib/canvas/text-task.ts', 'src/lib/canvas/text-task-request.ts',
  'src/lib/video/storyboard-client.ts', 'src/components/canvas/use-canvas-project-navigation.ts',
  'package.json', 'package-lock.json'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const snapshot = () => Object.fromEntries(sourceNames.map(name => {
  const bytes = fs.readFileSync(path.join(sourceRoot, name));
  return [name, {sha256: sha(bytes), bytes: bytes.length}];
}));
const report = {sourceRoot, sources: {}, status: 'ERROR', supplierCalls: 0,
  evidenceTier: 'actual copied full owner/React-hook harness; its auth, HTTP/SSE, workspace, document and submit ports remain declared fixtures; no PG, live supplier or billing proof'};
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
  const command = [path.join(sourceRoot, harness), '--source-root', sourceRoot, '--out', childOut];
  const child = spawnSync(process.execPath, command, {cwd: sourceRoot, env, encoding: 'utf8', timeout: 180000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true});
  report.child = {command: [process.execPath, ...command], cwd: sourceRoot,
    nodePath, exit: child.status, signal: child.signal, error: child.error ? String(child.error) : null,
    stdout: child.stdout || '', stderr: child.stderr || ''};
  fs.writeFileSync(path.join(out, 'CHILD.stdout.log'), report.child.stdout);
  fs.writeFileSync(path.join(out, 'CHILD.stderr.log'), report.child.stderr);
  assert(!child.error && !child.signal, 'Actual harness must start and finish normally');
  assert.match(report.child.stdout, /MAIN_SYNC_ASSISTANT_CLEANUP=PASS BROWSER_CLOSED=1 LOOPBACK_CLOSED=1/);
  if (child.status === 0) {
    const result = JSON.parse(fs.readFileSync(path.join(childOut, 'RESULT.json'), 'utf8'));
    assert.equal(result.status, 'PASS');
    assert(result.actualAssistantOwner && result.actualProjectOwner && result.actualReactHook && result.actualTextTaskOwner);
    assert(result.cases >= 17 && result.checks >= 95);
    for (const suffix of ['project', 'account-ABA', 'workspace-ABA']) {
      assert(result.details.includes('accepted-text-' + suffix + '-retains-original-answer-and-document-identity'));
    }
    report.status = 'PASS'; report.actualResult = result;
  } else {
    const failure = JSON.parse(fs.readFileSync(path.join(childOut, 'FAILURE.json'), 'utf8'));
    assert.equal(child.status, 1);
    assert.match(failure.error, /0 !== 1/);
    assert.match(failure.stack, /verify-main-sync-assistant-navigation\.cjs:89:/);
    assert.equal(failure.cases, 9, 'Baseline must reach the original admission assertion, not a setup failure');
    report.status = 'FAIL'; report.expectedOriginalAssertion = failure;
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
report.stdout = `CI59D_ACCEPTANCE_CONTRACT=${report.status} ACTUAL_COPIED_HARNESS=1 CHILD_EXIT=${report.child?.exit ?? 'UNKNOWN'} SUPPLIER_CALLS=0`;
fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n');
assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'REPORT.json'), 'utf8')).status, report.status);
console.log(report.stdout);
process.exitCode = exit;
}
try { main(); }
catch (error) { console.error(error.stack || error); process.exitCode = 2; }
