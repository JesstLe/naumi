#!/usr/bin/env node
'use strict';
/** Historical mechanisms, not a replay of unidentified employee clicks.
 * Uses existing real-handler/VM probes. No production or external supplier calls.
 * Exit 0=closed, 1=unexpected regression/harness failure, 2=known open/not-proven.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const options = {root: repo, output: 'output/imagegen-history-benchmark-20261023/run', phase: 'compare', suite: 'history', cases: []};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--self-test') options.selfTest = true;
  else if (flag === '--case') {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), 'Missing --case');
    options.cases.push(path.resolve(process.argv[++i]));
  }
  else if (['--root', '--output', '--phase', '--suite', '--observations'].includes(flag)) {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing ${flag}`);
    options[flag.slice(2)] = process.argv[++i];
  } else throw Error(`Unknown argument: ${flag}`);
}
options.root = fs.realpathSync(path.resolve(options.root));
options.output = path.resolve(options.output);
assert(['baseline', 'modified', 'compare'].includes(options.phase));
assert(['history', 'pricing-friction','admin-anomalies'].includes(options.suite));
const manifestPath = path.join(repo, options.suite==='admin-anomalies'?'docs/benchmarks/admin-anomaly-watch.json':'docs/benchmarks/imagegen-history-20261023.json');
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const manifestSha256 = digest(manifestBytes);
const observationLedger=options.observations?require('./admin-anomaly-benchmark.cjs').verifyLedger(path.resolve(options.observations)):null;
// Optional offline evidence packages are verified and indexed, never executed.
// A captured case does not turn a mechanism suite into an employee exact replay.
const capturedCases = options.cases.map(caseDir => {
  const m = require('./capture-imagegen-benchmark-case.cjs').verifyCase(caseDir);
  return {caseId: m.caseId, manifestSha256: digest(fs.readFileSync(path.join(caseDir, 'manifest.json'))),
    source: m.source, fidelity: m.fidelity, evidenceCompleteness: m.evidenceCompleteness,
    status: 'captured', replayStatus: 'not-run', exactReplayVerified: false, employeeExactRequestsReplayed: 0};
});
assert.equal(new Set(capturedCases.map(c => c.caseId)).size, capturedCases.length, 'Duplicate case ID');
function verdict(rows, mode, scenarios = manifest.scenarios) {
  if (rows.some(r => !r.valid)) return {status: 'ERROR', exit: 1};
  if (mode === 'baseline') return {status: 'BASELINE_REPRODUCED', exit: 0};
  // Deliberately do not turn unresolved historical classes into a green run.
  return scenarios.some(s => ['OPEN', 'NOT_PROVEN'].includes(s.historyClosure))
    ? {status: 'PARTIAL', exit: 2} : {status: 'PASS', exit: 0};
}
if (options.selfTest) {
  assert.equal(manifest.version, 1);
  assert.equal(new Set(manifest.scenarios.map(x => x.id)).size, manifest.scenarios.length);
  assert(manifest.scenarios.every(x => x.origin && x.replayFidelity && x.historyClosure));
  assert(manifest.scenarios.some(x => x.historyClosure === 'OPEN'));
  assert.equal(manifest.employeeExactRequestsReplayed, 0);
  assert.deepEqual(verdict([{valid: true}], 'compare'), {status: 'PARTIAL', exit: 2});
  assert.deepEqual(verdict([{valid: false}], 'compare'), {status: 'ERROR', exit: 1});
  assert.deepEqual(verdict([{valid: true}], 'baseline'), {status: 'BASELINE_REPRODUCED', exit: 0});
  assert.deepEqual(verdict([{valid: true}], 'compare', []), {status: 'PASS', exit: 0});
  console.log(`BENCHMARK_SELF_TEST=PASS SCENARIOS=${manifest.scenarios.length} OPEN_NOT_GREEN=1 EXACT_REPLAY_NOT_INVENTED=1`);
  process.exit(0);
}
assert(process.env.NAUMI_VERIFY_ISOLATED_DB === '1', 'Set NAUMI_VERIFY_ISOLATED_DB=1');
const dsn = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.equal(dsn.hostname, '127.0.0.1', 'Only loopback PostgreSQL');
assert(!fs.existsSync(options.output), 'Use a NEW output directory; prior results are immutable');
fs.mkdirSync(options.output, {recursive: true});
const nodeModules = fs.realpathSync(path.join(repo, 'node_modules'));
const results = [], baselineRoots = new Map();
let finished = false;
const sourceCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: options.root, encoding: 'utf8'}).trim();
const sourceDirty = cp.execFileSync('git', ['status', '--porcelain'], {cwd: options.root, encoding: 'utf8'}).trim();
const productHash = digest(cp.execFileSync('git', ['diff', '--binary', 'HEAD', '--', 'src'], {cwd: options.root}));
const env = {...process.env, NODE_ENV: 'test'};
// The only secrets accepted here belong to local fixture data; do not inherit
// optional production supplier/storage environment into child probes.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLICATE_API_TOKEN', 'NEW_API_FLOW_KEY', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete env[key];
function baselineRoot(ref) {
  if (baselineRoots.has(ref)) return baselineRoots.get(ref);
  const sha = cp.execFileSync('git', ['rev-parse', ref], {cwd: repo, encoding: 'utf8'}).trim();
  const target = path.join(options.output, 'source-' + sha.slice(0, 8));
  const archive = target + '.tar';
  cp.execFileSync('git', ['archive', '--format=tar', '--output=' + archive, sha], {cwd: repo});
  cp.execFileSync('python', ['-c', 'import pathlib,sys,tarfile;p=pathlib.Path(sys.argv[2]);p.mkdir();t=tarfile.open(sys.argv[1]);t.extractall(p,filter="data");t.close()', archive, target]);
  fs.symlinkSync(nodeModules, path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  baselineRoots.set(ref, target);
  return target;
}
function probe(id, phase, root, script, args, expected, expectedExit = 0) {
  let entry = script;
  const actualRoot = id === 'rate' || ['release-finish-isolation','parent-binding'].includes(id) || options.suite === 'pricing-friction' && id !== 'pricing-core' ? repo : root;
  if (phase === 'baseline' && script.endsWith('.ts') && actualRoot === root) {
    entry = path.posix.join('scripts', '__history_' + path.basename(script));
    fs.copyFileSync(path.join(repo, script), path.join(root, entry));
  }
  const cli = script.endsWith('.ts') ? ['--import', 'tsx', '--conditions=react-server', entry, ...args] : [entry, ...args];
  // Rate test owns its frozen AST fixtures and reads baseline via git show.
  const started = Date.now();
  console.log(`START ${phase}/${id}`);
  const run = cp.spawnSync(process.execPath, cli, {cwd: actualRoot, env, encoding: 'utf8', timeout: 240000, maxBuffer: 12 * 1024 * 1024});
  const output = (run.stdout || '') + (run.stderr || '');
  const log = `${phase}-${id}.txt`;
  fs.writeFileSync(path.join(options.output, log), output);
  const valid = run.status === expectedExit && expected.every(x => output.includes(x));
  const row = {id, phase, source: phase === 'baseline' ? path.basename(root) : sourceCommit,
    command: [process.execPath, ...cli], cwd: actualRoot, input: 'Explicit local fixture; original product handlers or documented VM projection; not employee-exact data',
    expectedExit, exit: run.status, signal: run.signal, expectedMarkers: expected, valid, log,
    harnessSha256: digest(fs.readFileSync(path.join(actualRoot, entry))), milliseconds: Date.now() - started,
    literals: output.split(/\r?\n/).filter(s => /^(BASELINE|SIMPLIFY_|MODIFIED|ROUTE=|REVIEW_|IMAGEGEN_RELOAD|IMAGE_BILLING|HISTORY_RATIOS|PASS expect|QUOTA_CASE|SUNJIANG_REAL|BOUNDARY|PRICING_FRICTION|AGENT_PRICING|WORKBENCH_)/.test(s))};
  results.push(row);
  console.log(`${phase}/${id} ${valid ? 'EXPECTED' : 'ERROR'} EXIT=${run.status}`);
  save();
}
function save() {
  const outcome = finished ? verdict(results, options.phase) : {status: 'RUNNING', exit: null};
  const report = {schema: 1, kind: 'historical-mechanism-benchmark', createdAt: new Date().toISOString(),
    sourceCommit, sourceDirty, sourceDiffSha256: productHash, manifestSha256, phase: options.phase, suite: options.suite,
    employeeExactRequestsReplayed: 0, historicalIncidentsResolvedByThisRun: 0,
    historyCounting: 'Never sum overlapping cohorts or parent/child/provider rows. Test assertions are not employee incidents.',
    productSourceChanged: false, productionMutations: 0, externalSupplierCalls: 0,
    completedChecks: results.length, expectedChecks: options.suite==='admin-anomalies'?(options.phase==='compare'?6:3):options.suite === 'pricing-friction' ? (options.phase === 'compare' ? 8 : 4) : options.phase === 'baseline' ? 5 : options.phase === 'modified' ? 10 : 15,
    ...outcome, scenarios: manifest.scenarios, capturedCases, observationLedger, results};
  fs.writeFileSync(path.join(options.output, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  const md = ['# 历史失败行为 benchmark', '', `版本：\`${sourceCommit}\`；结论：**${outcome.status}**；退出码：${outcome.exit}。`,
    '员工原始完整请求精确重放：0；以下为保留故障机制/操作次序的隔离复现。不是生产任务重提，也不是历史任务已修复计数。', '',
    '|检查|阶段|实际退出码|输出断言|', '|---|---|---:|---|',
    ...results.map(r => `|${r.id}|${r.phase}|${r.exit}|${r.valid ? '符合预先定义' : '执行/断言失败'}|`), '',
    '## 未闭合', ...manifest.scenarios.filter(s => ['OPEN', 'NOT_PROVEN'].includes(s.historyClosure)).map(s => `- ${s.id}：${s.behavior}；${s.historyClosure}。${s.limitation}`), '',
    '完整命令、输入、源版本、脚本SHA、输出和退出码见 REPORT.json 与逐项日志。'];
  fs.writeFileSync(path.join(options.output, 'REPORT.md'), md.join('\n') + '\n');
}
const B0 = '1871f84d181c8b5dc48ee506544a3857875907c1';
const B1 = '05598fe53bd03bfbaa74ff6ee5b39c2b689cb055';
const B2 = '9f049b07b4219b46ef8a5cb51bc49a4a0ad33e26';
try {
  if(options.suite==='admin-anomalies'){
    if(options.phase!=='modified'){const root=baselineRoot('af22c6e5f149215cfd5bf862f781e95e67c88987');probe('admin-anomalies','baseline',root,'scripts/verify-admin-anomaly-regressions.ts',['--baseline','--source-root',root],['BASELINE=REPRODUCED SCANNER_FIXED_KEY_BLOCK=1 LEGACY_FILTER_MISMATCH=1','"supplierPosts":0']);}
    if(options.phase!=='baseline')probe('admin-anomalies','modified',options.root,'scripts/verify-admin-anomaly-regressions.ts',[],['"mode":"modified"','"failed":[]','"supplierPosts":0','"originalUnknownPreserved":true']);
    if(options.phase!=='modified'){
      const root=baselineRoot('368c93e2343c57a330a0db6831ccbef01283ed6d');
      probe('release-finish-isolation','baseline',root,'scripts/verify-release-finish-isolation.cjs',['--baseline','--source-root',root],['BASELINE=REPRODUCED CLEANUP_FAILURE_TO_UNKNOWN=2','REAL_PG=1']);
      probe('parent-binding','baseline',root,'scripts/verify-imagegen-parent-completion.cjs',['--source-root',root,'--output-root',path.join(options.output,'parent-baseline')],['IMAGEGEN_PARENT_COMPLETION=FAIL CASES=25 FAILED=1','SUPPLIER_POST=0'],1);
    }
    if(options.phase!=='baseline'){
      probe('release-finish-isolation','modified',options.root,'scripts/verify-release-finish-isolation.cjs',[],['MODIFIED=PASS GROUPS=8 REAL_PG=1','ORIGINAL_UNKNOWN_PRESERVED=1']);
      probe('parent-binding','modified',options.root,'scripts/verify-imagegen-parent-completion.cjs',['--output-root',path.join(options.output,'parent-modified')],['IMAGEGEN_PARENT_COMPLETION=PASS CASES=25 FAILED=0','SUPPLIER_POST=0']);
    }
  } else if (options.suite === 'pricing-friction') {
    if (options.phase !== 'modified') {
      const root = baselineRoot('84fc45effa74b15785dfaaa39cd39598b19734ca');
      probe('pricing-core', 'baseline', root, 'scripts/verify-pricing-friction-core.ts', ['baseline'], ['PRICING_FRICTION_CORE=PASS mode=baseline', 'rich=PRICE_CHANGED', 'consume_rows=0']);
      probe('pricing-image', 'baseline', root, 'scripts/verify-pricing-friction-image.ts', ['--mode','baseline','--source-root',root], ['BASELINE=REPRODUCED', 'EXTERNAL_CALLS=0']);
      probe('pricing-agent', 'baseline', root, 'scripts/verify-pricing-friction-agent.ts', ['--baseline','--source-root',root], ['AGENT_PRICING_BASELINE=PASS', 'FIRST_BLOCKED=33']);
      probe('pricing-workbench', 'baseline', root, 'scripts/verify-pricing-friction-workbench.ts', ['--mode','baseline','--source-root',root], ['WORKBENCH_BASELINE=PASS']);
    }
    if (options.phase !== 'baseline') {
      probe('pricing-core', 'modified', options.root, 'scripts/verify-pricing-friction-core.ts', ['modified'], ['PRICING_FRICTION_CORE=PASS mode=modified', 'rich=ACCEPTED', 'poor=INSUFFICIENT_CREDITS', 'consume_rows=1']);
      probe('pricing-image', 'modified', options.root, 'scripts/verify-pricing-friction-image.ts', ['--mode','modified','--source-root',options.root], ['MODIFIED=PASS', 'EXTERNAL_CALLS=0']);
      probe('pricing-agent', 'modified', options.root, 'scripts/verify-pricing-friction-agent.ts', ['--source-root',options.root], ['AGENT_PRICING_MODIFIED=PASS', 'FIRST_BLOCKED=0']);
      probe('pricing-workbench', 'modified', options.root, 'scripts/verify-pricing-friction-workbench.ts', ['--mode','modified','--source-root',options.root], ['WORKBENCH_MODIFIED=PASS']);
    }
  } else {
  if (options.phase !== 'modified') {
    probe('preview-submit', 'baseline', baselineRoot(B0), 'scripts/verify-imagegen-confirmation-pg.ts', ['--baseline'], ['BASELINE=REPRODUCED', 'SUBMIT_STATUS=400', 'ACCEPTED=false', 'SUPPLIER_POSTS=0']);
    probe('frozen-quote', 'baseline', baselineRoot(B1), 'scripts/verify-imagegen-frozen-quote-pg.ts', ['--simplify', '--baseline'], ['SIMPLIFY_BASELINE=REPRODUCED', 'RAW_STALE_HEADERS_409=1']);
    probe('busy', 'baseline', baselineRoot(B1), 'scripts/verify-image-concurrency-convergence.ts', ['--baseline'], ['BASELINE=PASS', 'BUSY_STATUS=error', 'PAID_STATE=rejected']);
    probe('recovery-boundaries', 'baseline', baselineRoot(B2), 'scripts/verify-image-concurrency-convergence.ts', ['--review-regressions', '--review-baseline'], ['BASELINE_APLUS_REDO=PASS', 'FINAL=pending DUE_AGAIN=1', 'BASELINE_CANVAS_PIN=PASS', 'STATUS=failed RESERVATION=0']);
    probe('rate', 'baseline', repo, 'scripts/verify-image-creation-rate-limits.cjs', ['--ref', B1, '--expect', 'limited'], ['PASS expect=limited routes=29 oldGuards=31 requests=3192']);
  }
  if (options.phase !== 'baseline') {
    probe('preview-submit', 'modified', options.root, 'scripts/verify-imagegen-confirmation-pg.ts', [], ['MODIFIED=PASS', 'ACTUAL_PNG_PIXELS=1024,2048,4096', 'OLD_RECEIPT_NO_REPOST=PASS']);
    probe('frozen-quote', 'modified', options.root, 'scripts/verify-imagegen-frozen-quote-pg.ts', ['--simplify'], ['SIMPLIFY_MODIFIED=PASS', 'FOREIGN_DENIED=1', 'GENERIC_4K_TO_2K_FROZEN_PRICE=14']);
    probe('busy', 'modified', options.root, 'scripts/verify-image-concurrency-convergence.ts', [], ['ROUTE=PASS BUSY_POSTS=0 QUEUED=pending', 'SAME_OP_POSTS=1 LEDGER=1', 'UNKNOWN_REPLAYS=0', 'MODIFIED=PASS REAL_LOCAL_POSTGRES=1']);
    probe('recovery-boundaries', 'modified', options.root, 'scripts/verify-image-concurrency-convergence.ts', ['--review-regressions'], ['MODIFIED_APLUS_REDO=PASS', 'FINAL=awaiting_review DUE_AGAIN=0', 'MODIFIED_CANVAS_PIN=PASS', 'STATUS=needs_attention RESERVATION=1']);
    probe('rate', 'modified', options.root, 'scripts/verify-image-creation-rate-limits.cjs', ['--root', options.root, '--expect', 'unlimited'], ['PASS expect=unlimited routes=29 oldGuards=31 requests=3192']);
    probe('reload', 'modified', options.root, 'scripts/verify-imagegen-reload-recovery.cjs', [], ['IMAGEGEN_RELOAD_RECOVERY=PASS', 'REAL_CLIENT_GET_ONLY=1']);
    probe('original-ratios', 'modified', options.root, 'scripts/verify-imagegen-history-ratios.cjs', [], ['HISTORY_RATIOS=PASS ORIGINAL_PARAMETER_ROWS=80', 'FRESH_V2_SUPPORTED=75 STILL_OUTSIDE_3_TO_1=5']);
    probe('delivery', 'modified', options.root, 'scripts/verify-image-delivery-completion.ts', [], ['MODIFIED=PASS', 'RAW_2K=2048 RAW_4K=4096', 'BILLING=ONCE UNKNOWN_POST=0']);
    probe('ratio-output', 'modified', options.root, 'scripts/verify-sunjiang-image-routes.ts', [], ['SUNJIANG_REAL_ROUTES=PASS', 'RATIO_DIFFERENCE=WARNING', 'DUPLICATE_POSTS=0']);
    probe('supplier-quota', 'modified', options.root, 'scripts/verify-imagegen-history-supplier-quota.ts', [], ['QUOTA_CASE=OPEN', 'STATUS=403', 'A_POSTS=1', 'B_POSTS=0']);
  }
  }
} catch (error) {
  results.push({id: 'benchmark-infrastructure', phase: options.phase, valid: false, exit: 1, error: String(error)});
} finally {
  assert.equal(digest(cp.execFileSync('git', ['diff', '--binary', 'HEAD', '--', 'src'], {cwd: options.root})), productHash, 'Benchmark changed product source');
  finished = true;
  save();
}
const outcome = verdict(results, options.phase);
console.log(`HISTORY_BENCHMARK=${outcome.status} CHECKS=${results.length} EXPECTED=${results.filter(x => x.valid).length} EXACT_EMPLOYEE_REPLAYS=0 PRODUCTION_MUTATIONS=0 EXTERNAL_SUPPLIER_CALLS=0 EXIT=${outcome.exit}`);
process.exitCode = outcome.exit;
