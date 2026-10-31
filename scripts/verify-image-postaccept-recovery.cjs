#!/usr/bin/env node
/** MOCK / REAL TS MODULES + AST. No supplier network, PostgreSQL, build or Git.
 * Parent-run focused regression: node scripts/verify-image-postaccept-recovery.cjs
 * --baseline overlays ../output/image-postaccept-recovery-fix-20261024/before.
 * A reproduced baseline deliberately exits 1; missing modules/fixtures are errors,
 * never successful reproductions. --source-root reads an explicitly supplied copy.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const ts = require('typescript');

const workspace = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let baseline = false, sourceRoot = workspace;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseline') baseline = true;
  else if (args[i] === '--source-root' && args[i + 1]) sourceRoot = path.resolve(args[++i]);
  else throw Error(`Unknown/incomplete argument: ${args[i]}`);
}
const beforeRoot = path.join(sourceRoot, 'output/image-postaccept-recovery-fix-20261024/before');
const out = path.join(workspace, 'output/image-postaccept-recovery-fix-20261024/tests');
const mode = baseline ? 'BASELINE' : 'MODIFIED';
const sources = new Map(), cases = [], fixtures = [];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const requiredBefore = new Set(['src/lib/image-jobs/runtime.ts', 'src/lib/image-gateway.ts', 'src/lib/model-config/channel-availability.ts']);
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
function source(rel) {
  if (!sources.has(rel)) {
    const original = path.join(sourceRoot, rel), snapshot = path.join(beforeRoot, rel);
    if (baseline && requiredBefore.has(rel)) assert.ok(fs.existsSync(snapshot), `Missing mandatory before source: ${snapshot}`);
    const file = baseline && fs.existsSync(snapshot) ? snapshot : original;
    const bytes = fs.readFileSync(file);
    sources.set(rel, { file, text: bytes.toString('utf8'), sha256: hash(bytes) });
  }
  return sources.get(rel).text;
}
function astParts(rel, names) {
  const text = source(rel), tree = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  assert.equal(tree.parseDiagnostics.length, 0, `TS parse error: ${rel}`);
  const wanted = new Set(names), found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) found.set(node.name.text, node.getText(tree));
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text)) {
          found.set(declaration.name.text, `const ${declaration.getText(tree)};`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const name of names) assert.ok(found.has(name), `Missing real AST declaration ${rel}:${name}`);
  return names.map(name => found.get(name)).join('\n');
}
function evaluate(text, filename, requireModule, bindings = {}) {
  const compiled = ts.transpileModule(text, { fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `Transpile diagnostics: ${filename}`);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, require: requireModule, Buffer, console, Error, TypeError,
    Date, URL, Request, Response, Headers, FormData, AbortController, AbortSignal, DOMException,
    structuredClone, setInterval, clearInterval, setTimeout, clearTimeout,
    process: { env: { NAUMI_ROUTER_STATE_DOMAIN: 'postaccept-fixture' } },
    fetch: (...values) => { throw Error(`UNEXPECTED_REAL_NETWORK: ${String(values[0])}`); },
    ...bindings,
  }, { filename });
  return module.exports;
}
function snippet(rel, names, bindings) {
  const text = `${astParts(rel, names)}\nmodule.exports={${names.join(',')}};`;
  return evaluate(text, `${rel}#AST(${names.join(',')})`, id => { throw Error(`Unexpected AST import ${id}`); }, bindings);
}

const PUBLIC = 'fixture-image', VERSION = 139;
let PNG;
function modelScope() {
  const frozen = { publicModelId: PUBLIC, modelVersion: VERSION, modality: 'image', modelDigest: 'a'.repeat(64),
    facts: { task: 'product', quality: 'medium', resolution: '1K', ratio: '1:1', quantity: 1 } };
  const hub = { frozen: clone(frozen), connection: { providerId: 'fixture-hub', protocol: 'openai-images',
    wireModel: 'jimeng/jimeng-image-5.0-pro', baseUrl: 'http://fixture.invalid/v1', apiKey: 'fixture-only',
    timeoutMs: 1, options: { imageAdapter: 'reverse-hub' } }, parameterMap: {}, capabilities: { maxReferenceImages: 0 } };
  const direct = { frozen: clone(frozen), connection: { providerId: 'fixture-direct', protocol: 'openai-images',
    wireModel: 'fixture-direct-model', baseUrl: 'http://direct.invalid/v1', apiKey: 'fixture-only', timeoutMs: 1 }, parameterMap: {}, capabilities: {} };
  return { frozen, connection: { ...direct.connection, wireModel: PUBLIC }, parameterMap: {}, capabilities: {},
    supplierRouting: { policy: {}, targets: [{ upstreamId: 'hub-up', scope: hub }, { upstreamId: 'direct-up', scope: direct }] } };
}

function fixture(name, count = 1) {
  const scope = modelScope(), modelContext = new AsyncLocalStorage();
  scope.frozen.facts.quantity = count;
  const f = { name, id: `postaccept-${name}`, count, scope, modelContext, rows: new Map(), pins: new Map(), calls: [],
    ledgerRows: [], tasks: new Map(), assets: new Map(), holds: 0, failures: 0, bodyEntries: 0,
    workerEntries: [], directCalls: 0, transportCalls: [], generationPosts: 0, gets: 0,
    ledger: [], deductions: 0, releases: 0, settleCalls: 0, failSql: null, failSave: null,
    queryError: null, taskState: 'succeeded', networkCalls: 0 };
  fixtures.push(f);
  const result = rows => ({ rows: clone(rows), rowCount: rows.length });
  const sql = { async query(statement, values = []) {
    const q = String(statement).replace(/\s+/g, ' ').trim();
    f.calls.push({ sql: q, values: clone(values) });
    if (f.failSql?.test(q)) throw f.dbError || Error('fixture-database-unavailable');
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(q)) return result([]);
    if (/^SELECT to_regclass\('app_supplier_calls'\) AS name$/.test(q)) return result([{ name: 'app_supplier_calls' }]);
    if (/^SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=\$1$/.test(q)) return result(f.pins.has(values[0]) ? [{ upstream_id: f.pins.get(values[0]) }] : []);
    if (/^INSERT INTO app_model_channel_operations\b/.test(q)) {
      if (!f.pins.has(values[0])) f.pins.set(values[0], values[1]);
      return result([{ upstream_id: f.pins.get(values[0]) }]);
    }
    if (/^UPDATE app_supplier_calls SET parameters=\$2::jsonb,billing_unit_id=\$3/.test(q)) {
      const row = f.ledgerRows.find(r => r.id === values[0]); assert.ok(row, 'adapter row exists');
      if (row.parameters == null) { row.parameters = JSON.parse(values[1]); row.billing_unit_id = values[2]; }
      return result([]);
    }
    if (/^UPDATE app_supplier_calls SET parameters=parameters \|\| \$2::jsonb/.test(q)) {
      const row = f.ledgerRows.find(r => r.id === values[0]); assert.ok(row);
      row.parameters = { ...row.parameters, ...JSON.parse(values[1]) }; return result([]);
    }
    if (/^SELECT .* FROM app_supplier_calls\b/.test(q)) {
      let rows = f.ledgerRows.filter(row => {
        for (const match of q.matchAll(/\b(id|billing_unit_id|operation_id|public_model_id|model_version|provider_id|model)\s*=\s*\$(\d+)\b/g)) {
          if (match[1] === 'billing_unit_id' && q.includes('left(billing_unit_id,length($4)+7)')) continue;
          if (row[match[1]] !== values[Number(match[2]) - 1]) return false;
        }
        if (q.includes('left(billing_unit_id,length($4)+7)') && row.billing_unit_id !== values[3] && !String(row.billing_unit_id).startsWith(`${values[3]}:image:`)) return false;
        for (const match of q.matchAll(/\b(billing_unit_id|operation_id)\s*=\s*ANY\(\$(\d+)::text\[\]\)/g)) {
          if (!values[Number(match[2]) - 1].includes(row[match[1]])) return false;
        }
        for (const match of q.matchAll(/\b(billing_unit_id|operation_id)\s+LIKE\s+\$(\d+)/g)) {
          const pattern = String(values[Number(match[2]) - 1]);
          if (!String(row[match[1]]).startsWith(pattern.replace(/%$/, ''))) return false;
        }
        const providerList = /provider_id=ANY\(\$(\d+)::text\[\]\)/.exec(q);
        if (providerList && !values[Number(providerList[1]) - 1].includes(row.provider_id)) return false;
        if (q.includes('task_id IS NOT NULL') && !q.includes('OR parameters IS NOT NULL') && row.task_id == null) return false;
        if (q.includes("task_id<>''") && row.task_id === '') return false;
        if (q.includes('parameters IS NOT NULL') && !q.includes('OR parameters IS NOT NULL') && row.parameters == null) return false;
        if (q.includes("state IN ('submitted','processing','running','completed','success','succeeded')") && !['submitted', 'processing', 'running', 'completed', 'success', 'succeeded'].includes(row.state)) return false;
        if (q.includes("state NOT IN ('rejected','failed','cancelled')") && ['rejected', 'failed', 'cancelled'].includes(row.state)) return false;
        if (q.includes("state <> 'pre-submission-failed'") && row.provider_id === 'fixture-apimart' && (row.state === 'pre-submission-failed' || row.task_id == null && row.parameters == null)) return false;
        return true;
      });
      if (/SELECT DISTINCT provider_id,\s*model FROM/.test(q)) rows = [...new Map(rows.map(r => [JSON.stringify([r.provider_id, r.model]), { provider_id: r.provider_id, model: r.model }])).values()];
      else if (/^SELECT 1 FROM/.test(q)) rows = rows.map(() => ({ '?column?': 1 }));
      if (/LIMIT 1\b/.test(q)) rows = rows.slice(0, 1);
      return result(rows);
    }
    if (/^SELECT \* FROM app_image_jobs WHERE id=\$1 FOR UPDATE$/.test(q)) return result(f.rows.has(values[0]) ? [f.rows.get(values[0])] : []);
    if (/^INSERT INTO app_ledger\b/.test(q)) {
      assert.ok(!f.ledger.some(row => row.id === values[0]), 'duplicate ledger INSERT must fail');
      f.ledger.push({ id: values[0], email: values[1], delta: values[2] }); return result([]);
    }
    if (/^UPDATE app_users SET credits_used=GREATEST/.test(q)) { f.releases++; return result([]); }
    if (/^UPDATE app_image_jobs SET billing_settled=true WHERE id=\$1$/.test(q)) { f.rows.get(values[0]).billing_settled = true; return result([]); }
    if (/^DELETE FROM app_gen_reservations WHERE job_id=\$1$/.test(q)) return result([]);
    throw Error(`UNMOCKED_SQL: ${q}`);
  }, async connect() { return { query: sql.query, release() {} }; } };
  f.sql = sql;
  const repository = {
    async createImageJob(id, email, kind, snapshot, payload, cost) { f.rows.set(id, { id, email, kind, snapshot: clone(snapshot), payload: clone(payload), cost, reserved_cost: cost, metered: true, lease_token: null, billing_settled: false }); },
    async getImageJob(id) { return f.rows.has(id) ? clone(f.rows.get(id)) : null; },
    async saveImageJob(id, snapshot) {
      if (f.failSave?.(snapshot)) throw Error('fixture-checkpoint-save-failed');
      assert.ok(f.rows.has(id)); f.rows.get(id).snapshot = clone(snapshot);
    },
    async holdImageJobBilling(id) { assert.ok(f.rows.has(id)); f.holds++; },
    async failUndeliveredImageJob(id) { f.failures++; f.rows.get(id).snapshot.status = 'error'; f.holds++; return true; },
  };
  const dbBindings = { getPool: () => sql, assertMutableStagingTask: async () => {},
    deductPrincipalFIFO: async () => { f.deductions++; }, refreshBalance: async () => {}, billingService: {}, billingOperation: () => { throw Error('Unexpected quoted billing fixture'); } };
  const settlement = snippet('src/lib/image-job-repository.ts', ['settleImageJob'], dbBindings);
  repository.settleImageJob = async (...values) => { f.settleCalls++; return settlement.settleImageJob(...values); };
  const mocks = new Map();
  const mock = (rel, exports) => mocks.set(rel, exports);
  const passthrough = (_context, run) => run();
  mock('src/platform/db/pool.ts', { dbEnabled: true, getPool: () => sql });
  mock('src/lib/image-job-repository.ts', repository);
  // Same external scheduling port for this paid-checkpoint test;real scheduling SQL has its own PG matrix.
  mock('src/lib/image-jobs/scheduling.ts', repository);
  mock('src/lib/staging-history.ts', { assertMutableStagingTask: async () => {} });
  mock('src/lib/storage.ts', {
    async uploadImage(bytes, _mime, key) { const url = `/media/${key}`; f.assets.set(url, Buffer.from(bytes)); return url; },
    async readManagedObject(url) { assert.ok(f.assets.has(url), `Unknown fixture object ${url}`); return { bytes: Buffer.from(f.assets.get(url)) }; },
  });
  mock('src/lib/settings-secret.ts', { workerSecret: () => 'fixture-worker-secret-not-used-1234' });
  mock('src/lib/settings.ts', { getOpenAISettings: async () => ({ apiKey: 'fixture-only' }) });
  mock('src/lib/openai-base.ts', { getOpenAIBaseUrl: async () => 'http://fixture.invalid/v1' });
  mock('src/lib/model-config/context.ts', { currentModelExecution: () => modelContext.getStore() || null,
    currentExecutionBundle: () => undefined, runLegacyModelExecution: run => run() });
  mock('src/lib/model-config/storage-schema.ts', { ensureModelSchema: async () => {} });
  mock('src/lib/model-config/execution.ts', { withFrozenExecutionBundle: passthrough });
  mock('src/lib/saas/creation-scope.ts', { withFrozenCreation: passthrough });
  mock('src/lib/bi/context.ts', { withBiModelContext: (_email, _kind, _id, run) => run() });
  mock('src/lib/release-runtime/identity.ts', { releaseRuntimeEnabled: () => false });
  mock('src/lib/release-runtime/background-activity.ts', { withBackgroundActivity: (_kind, _id, _phase, run) => run(),
    detachBackgroundActivity: (_kind, _id, _phase, run) => run(), bindBackgroundClaim: async () => {} });
  mock('src/lib/image-job-queue.ts', { dispatchImageQueue: () => { throw Error('Unexpected worker scan'); } });
  mock('src/lib/image-job-failure.ts', { IMAGE_JOB_RELEASED_MESSAGE: 'fixture released' });
  mock('src/lib/model-config/transport.ts', { modelEndpointFetch: () => { f.networkCalls++; throw Error('UNEXPECTED_REAL_TRANSPORT'); } });
  mock('src/lib/billing/synchronous-operation.ts', { currentSynchronousBilling: () => undefined });
  mock('src/lib/supplier-cost/collect.ts', { supplierContext: async () => ({ operationId: f.id }) });
  mock('src/lib/supplier-cost/runtime.ts', { supplierLedger: () => { throw Error('Use explicit fixture ledger'); }, accountIdentity: (base, key) => hash(`${base}\0${key}`) });
  mock('src/lib/competitor-image.ts', { preserveOutsideMask: () => { throw Error('Unexpected mask processing'); } });
  mock('src/lib/application/task-execution.ts', {deferApplicationTask: async () => false});
  mock('src/lib/worker/inflight.ts', {trackBackgroundWork: value => value});
  const real = new Set(['src/lib/image-jobs/runtime.ts', 'src/lib/image-gateway.ts', 'src/lib/model-config/channel-availability.ts',
    'src/lib/model-config/types.ts', 'src/lib/model-config/apimart-image-policy.ts', 'src/lib/model-config/reverse-hub-images.ts',
    'src/lib/imagegen/delivery-checkpoint.ts', 'src/lib/imagegen/ratio-support.ts', 'src/lib/supplier-cost/io.ts', 'src/lib/supplier-cost/money.ts']);
  const cache = new Map();
  const load = rel => {
    if (mocks.has(rel)) return mocks.get(rel);
    if (cache.has(rel)) return cache.get(rel);
    assert.ok(real.has(rel), `Unexpected fixture module ${rel}`);
    const placeholder = {}; cache.set(rel, placeholder);
    const exported = evaluate(source(rel), sources.get(rel).file, id => {
      if (id === 'server-only') return {};
      if (['node:async_hooks', 'node:crypto', 'node:timers/promises', 'sharp', 'zod'].includes(id)) return require(id);
      const resolved = id.startsWith('@/') ? `src/${id.slice(2)}.ts` : id.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), id)) + '.ts' : null;
      assert.ok(resolved, `Unexpected external import ${rel} -> ${id}`);
      return load(resolved);
    }, { fetch: (...values) => { f.networkCalls++; throw Error(`UNEXPECTED_REAL_NETWORK: ${String(values[0])}`); } });
    Object.assign(placeholder, exported); return placeholder;
  };
  const types = load('src/lib/model-config/types.ts');
  mock('src/lib/model-config/resolution-policy.ts', snippet('src/lib/model-config/resolution-policy.ts', ['RESOLUTION_FIELDS', 'mapResolution'], types));
  f.gateway = load('src/lib/image-gateway.ts');
  f.availability = load('src/lib/model-config/channel-availability.ts');
  f.adapter = load('src/lib/model-config/reverse-hub-images.ts');
  f.delivery = load('src/lib/imagegen/delivery-checkpoint.ts');
  f.jobs = new (load('src/lib/image-jobs/runtime.ts').DurableImageJobs)('generate');
  f.withScope = run => modelContext.run(scope, run);
  f.snapshot = () => clone(f.rows.get(f.id).snapshot);
  f.ledgerApi = {
    pool: sql, account: async () => {},
    async begin(input) {
      let row = f.ledgerRows.find(r => r.attempt_id === input.attemptId);
      if (!row) { row = { id: `call-${f.ledgerRows.length}`, attempt_id: input.attemptId, operation_id: f.id,
        public_model_id: scope.frozen.publicModelId, model_version: scope.frozen.modelVersion, account_id: input.accountId,
        provider_id: input.providerId, model: input.model, state: 'unknown', parameters: null, task_id: null };
        f.ledgerRows.push(row); }
      return clone(row);
    },
    async apply(id, patch) { const row = f.ledgerRows.find(r => r.id === id); assert.ok(row); row.state = patch.state; if (patch.taskId) row.task_id = patch.taskId; },
  };
  f.transport = async (url, init = {}) => {
    const method = init.method || 'GET'; f.transportCalls.push({ method, url });
    if (method === 'POST') {
      f.generationPosts++;
      assert.ok(f.allowInitialPost, `UNEXPECTED_GENERATION_POST: ${url}`);
      const body = JSON.parse(init.body), id = crypto.randomUUID();
      const task = { id, operation_id: body.operation_id, model: body.model, state: f.taskState };
      f.tasks.set(id, task); return Response.json(task, { status: 202 });
    }
    equal(method, 'GET', 'recovery transport is GET-only'); f.gets++;
    if (f.queryError) { if (f.failSqlAfterQuery) f.failSql = f.failSqlAfterQuery; throw f.queryError; }
    const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1)), task = f.tasks.get(id);
    assert.ok(task, `Unknown original task ${id}`);
    return Response.json({ ...task, state: f.taskState,
      ...(f.taskState === 'succeeded' ? { result: { data: [{ b64_json: PNG.toString('base64') }] } } : {}) });
  };
  f.fetcher = f.adapter.reverseHubImageFetch(scope.supplierRouting.targets[0].scope, {}, {
    ledger: f.ledgerApi, context: { operationId: f.id }, transport: f.transport, pollMs: 0 });
  f.request = () => new Request('http://fixture.invalid/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: PUBLIC, prompt: 'postaccept fixture', n: 1, size: '1024x1024' }) });
  f.seed = async (started = false) => {
    await f.withScope(() => f.jobs.create(f.id, 'fixture@example.test', { status: 'pending', createdAt: Date.now(),
      ...(started ? { paidOperations: { [f.id]: { model: PUBLIC, state: 'started', replayable: false } } } : {}) }, { p: { count }, fixture: true }, 6 * count, false));
  };
  f.accepted = async (index, overrides = {}) => {
    const unit = `${f.id}:image:${index}`;
    const prepared = await f.withScope(() => f.gateway.withImageOperation(PUBLIC, { id: unit, resolution: '1K', ratio: '1:1' },
      () => f.adapter.reverseHubImageRequest(f.request(), scope.supplierRouting.targets[0].scope)));
    const taskId = crypto.randomUUID();
    f.tasks.set(taskId, { id: taskId, operation_id: prepared.attemptId, model: scope.supplierRouting.targets[0].scope.connection.wireModel, state: 'succeeded' });
    const row = { id: `history-${index}`, attempt_id: prepared.attemptId, operation_id: f.id, billing_unit_id: unit,
      public_model_id: PUBLIC, model_version: VERSION, provider_id: 'fixture-hub', model: scope.supplierRouting.targets[0].scope.connection.wireModel,
      task_id: taskId, state: 'completed', account_id: hash(`${scope.supplierRouting.targets[0].scope.connection.baseUrl}\0${scope.supplierRouting.targets[0].scope.connection.apiKey}`),
      parameters: { requestHash: prepared.requestHash, acceptedOutputs: 1, modelVersion: VERSION }, ...overrides };
    f.ledgerRows.push(row); return row;
  };
  f.fanOut = snippet('src/lib/imagegen/generation-provider.ts', ['fanOut'], {
    p: { count }, model: PUBLIC, withImageIndex: f.gateway.withImageIndex,
    ImageOperationPending: f.gateway.ImageOperationPending, isImageGatewayModel: f.gateway.isImageGatewayModel,
  }).fanOut;
  f.execute = options => f.withScope(() => f.jobs.paidOperation(f.id, PUBLIC, { id: f.id, resolution: '1K', ratio: '1:1' }, async () => {
    f.bodyEntries++;
    const worker = async index => {
      f.workerEntries.push(index);
      if (options?.directFirst && index === 0) { f.directCalls++; return { b64_json: PNG.toString('base64') }; }
      const response = await f.fetcher(f.request());
      equal(response.status, 200, 'original task returns completed image');
      return (await response.json()).data[0];
    };
    // Checkpoint-internal fixture only: explicit aggregation propagates Pending.
    // Real route fanOut intentionally delivers a mixed-family partial result;
    // a separate case below preserves that behavior, not a route-retry claim.
    let outputs;
    if (options?.checkpointAggregate || options?.directFirst && !options.routeFanOut) {
      outputs = [];
      for (let index = 0; index < count; index++) outputs.push(await f.gateway.withImageIndex(PUBLIC, index, () => worker(index)));
    } else outputs = await f.fanOut(worker);
    return outputs.map((image, index) => ({ id: `image-${index}`, url: image.url || `data:image/png;base64,${image.b64_json}` }));
  }));
  return f;
}

async function caseRun(name, run, baselineBug = false) {
  const beforeChecks = checks;
  try { const evidence = await run(); cases.push({ name, status: 'PASS', checks: checks - beforeChecks, evidence }); console.log(`CASE=${name} RESULT=PASS`); }
  catch (error) {
    const detail = errorDetails(error), fixtureError = isFixtureError(error);
    cases.push({ name, status: 'FAIL', baselineBug, fixtureError, checks: checks - beforeChecks, error: detail });
    console.error(`CASE=${name} RESULT=FAIL ${String(error?.message || error)}`);
  }
}
function errorDetails(error) { const parts = [], seen = new Set(); while (error && !seen.has(error)) { seen.add(error); parts.push(String(error.stack || error)); error = error.cause; } return parts.join('\nCAUSED_BY: '); }
function isFixtureError(error) { return /UNMOCKED_|UNEXPECTED_REAL_|Unexpected fixture|Unexpected external|Missing real AST|Missing mandatory|TS parse error|Transpile diagnostics|Unknown fixture object|Unknown original task/.test(errorDetails(error)); }
async function rejected(run) { try { await run(); } catch (error) { if (isFixtureError(error)) throw error; checks++; return error; } throw Error('Expected rejection, execution silently succeeded'); }
function containsCause(error, needle) { const seen = new Set(); while (error && !seen.has(error)) { if (error === needle) return true; seen.add(error); error = error.cause; } return false; }
async function main() {
  PNG = await require('sharp')({ create: { width: 2, height: 2, channels: 4, background: 'white' } }).png().toBuffer();
  await caseRun('historical-root-indexed-ledger-two-jobs-get-only', async () => {
    const proof = [], recoveryErrors = [];
    for (const name of ['historical-a', 'historical-b']) {
      const f = fixture(name); await f.seed(true); await f.accepted(0);
      await f.withScope(() => f.jobs.handlePending(f.id, new f.gateway.ImageOperationPending(`${f.id}:image:0`, Error('old-first-pending'))));
      equal(f.snapshot().status, 'pending', 'first accepted indexed pending remains queued');
      let images;
      try { images = await f.execute(); }
      catch (error) {
        if (error instanceof f.gateway.ImageOperationPending) await f.withScope(() => f.jobs.handlePending(f.id, error));
        if (baseline) {
          equal(f.bodyEntries, 0, 'baseline root blocks before original indexed callback');
          equal(f.gets, 0, 'baseline incorrectly misses original task GET'); equal(f.generationPosts, 0, 'baseline fixture makes no generation POST');
          equal(f.snapshot().status, 'error', 'baseline second pending converts accepted task to terminal error');
          check(error instanceof f.gateway.ImageOperationPending && f.holds > 0, 'baseline typed pending plus billing hold reproduced');
        }
        recoveryErrors.push({ job: f.id, error, status: f.snapshot().status, bodyEntries: f.bodyEntries, gets: f.gets, posts: f.generationPosts });
        continue;
      }
      equal(images.length, 1, 'historical image delivered'); equal(f.generationPosts, 0, 'no new generation POST');
      equal(f.gets, 1, 'only original task GET'); equal(f.failures, 0, 'accepted original not converted into error');
      equal(f.snapshot().paidOperations[f.id].state, 'done', 'root finishes'); proof.push({ job: f.id, gets: f.gets, posts: f.generationPosts });
    }
    if (recoveryErrors.length) throw Object.assign(Error(`ROOT_INDEX_RECOVERY_FAILED: original child acceptedOutputs=1; ${JSON.stringify(recoveryErrors.map(({ error, ...record }) => record))}`), { cause: recoveryErrors[0].error });
    return proof;
  }, true);
  await caseRun('first-pending-persists-exact-child-identity', async () => {
    const f = fixture('first-pending'); await f.seed(); f.allowInitialPost = true; f.taskState = 'running';
    const error = await rejected(() => f.execute());
    check(error instanceof f.gateway.ImageOperationPending, 'actual typed pending reaches caller');
    const parent = f.snapshot().paidOperations[f.id], child = parent.children?.[`${f.id}:image:0`];
    check(child?.state === 'started', 'first pending has persisted indexed checkpoint');
    check(child.replayable === true && typeof child.gatewayIdentity === 'string' && child.gatewayIdentity.startsWith('accepted:'), 'child freezes exact accepted task identity on first pending');
    equal(Object.keys(f.snapshot().paidOperations).length, 1, 'children are not top-level paid operations');
    f.allowInitialPost = false; f.taskState = 'succeeded'; const posts = f.generationPosts;
    const images = await f.execute(); equal(images.length, 1, 'same accepted task completes');
    equal(f.generationPosts, posts, 'no repeated generation POST after pending');
    return { initialMockPosts: posts, recoveryMockGets: f.gets, child: `${f.id}:image:0` };
  }, true);
  await caseRun('historical-multi-image-exact-each-child', async () => {
    const f = fixture('historical-multi', 2); await f.seed(true); await f.accepted(0); await f.accepted(1);
    const images = await f.execute(); equal(images.length, 2, 'both existing tasks delivered'); equal(f.gets, 2, 'each original task queried exactly once');
    equal(f.generationPosts, 0, 'no new generation in historical fanout');
    const checkpoint = f.delivery.storedDeliveryCheckpoint(f.snapshot());
    check(checkpoint?.allDone === true && checkpoint.images.length === 2, 'real stored delivery allDone stays true without duplicated child images');
    return { gets: f.gets, posts: f.generationPosts, checkpointImages: checkpoint.images.length };
  }, true);
  await caseRun('successful-direct-sibling-reused-after-pending', async () => {
    console.log('BOUNDARY=CHECKPOINT_INTERNAL_FIXTURE NOT_REAL_ROUTE_PARTIAL_RETRY');
    const f = fixture('direct-sibling', 2); await f.seed(); await f.accepted(1); f.taskState = 'running';
    await rejected(() => f.execute({ directFirst: true }));
    const parent = f.snapshot().paidOperations[f.id];
    check(parent.children?.[`${f.id}:image:0`]?.state === 'done', 'successful direct sibling has real child result checkpoint');
    check(typeof parent.children[`${f.id}:image:0`].result?.b64_json?.$imageJobBase64?.$imageJobBuffer === 'string', 'child SDK b64 bytes live in encoded managed storage, not duplicate DB base64');
    equal(f.directCalls, 1, 'first direct call runs once'); equal(parent.state, 'started', 'root still unresolved');
    equal(f.delivery.storedDeliveryCheckpoint(f.snapshot()), null, 'child result does not become complete root delivery');
    f.taskState = 'succeeded'; const images = await f.execute({ directFirst: true });
    equal(images.length, 2, 'both images delivered after GET recovery'); equal(f.directCalls, 1, 'completed direct sibling is not submitted again');
    equal(images[0].url, `data:image/png;base64,${PNG.toString('base64')}`, 'actual snapshot decoder restores exact successful sibling bytes');
    equal(f.workerEntries.filter(index => index === 0).length, 1, 'actual withImageIndex skipped completed worker');
    const checkpoint = f.delivery.storedDeliveryCheckpoint(f.snapshot());
    check(checkpoint?.allDone === true && checkpoint.images.length === 2, 'nested checkpoint does not poison real allDone or duplicate root results');
    const entries = f.bodyEntries; await f.execute({ directFirst: true }); equal(f.bodyEntries, entries, 'completed root returns persisted result');
    await f.jobs.settle(f.id, 12, 'fixture original delivery'); await f.jobs.settle(f.id, 12, 'fixture retry delivery');
    equal(f.settleCalls, 2, 'both retries reach actual settlement AST'); equal(f.ledger.length, 1, 'actual billing_settled guard creates one ledger entry');
    equal(f.deductions, 1, 'one principal deduction'); equal(f.releases, 1, 'one reservation release');
    return { directCalls: f.directCalls, gets: f.gets, generationPosts: f.generationPosts, ledgerEntries: f.ledger.length };
  }, true);
  await caseRun('actual-route-mixed-fanout-partial-semantics-unchanged', async () => {
    const f = fixture('route-mixed-partial', 2); await f.seed(); await f.accepted(1); f.taskState = 'running';
    const images = await f.execute({ directFirst: true, routeFanOut: true });
    equal(images.length, 1, 'real route fanOut keeps successful direct partial output');
    equal(f.snapshot().paidOperations[f.id].state, 'done', 'actual mixed route completes partial root as before');
    equal(f.directCalls, 1, 'partial route direct image submitted once'); equal(f.generationPosts, 0, 'accepted pending sibling is GET-only');
    console.log('BOUNDARY=REAL_ROUTE_FANOUT_AST MIXED_PARTIAL=UNCHANGED NO_ROUTE_PARTIAL_RETRY_CLAIM');
    return { routeFanOut: 'ACTUAL_AST', partialImages: images.length, claimsPartialRetry: false };
  });
  await caseRun('image-zero-pin-not-permission-for-whole-fanout', async () => {
    console.log('BOUNDARY=CHECKPOINT_INTERNAL_FIXTURE UNKNOWN_SIBLING_MUST_NOT_POST');
    const f = fixture('one-pin-two-images', 2); await f.seed(true); await f.accepted(0);
    await f.withScope(() => f.availability.recoverableChannelIdentity(f.sql, f.scope, `${f.id}:image:0`));
    await rejected(() => f.execute({ checkpointAggregate: true }));
    check(!f.workerEntries.includes(1), 'unproven legacy sibling never enters adapter/POST');
    equal(f.generationPosts, 0, 'image zero pin does not authorize second generation');
    check(f.snapshot().paidOperations[f.id].state !== 'done', 'unknown whole fanout is not falsely completed');
    return { workerIndices: f.workerEntries, gets: f.gets, posts: f.generationPosts };
  });
  await caseRun('cross-root-version-model-provider-wire-rejected', async () => {
    const variants = [
      ['root', f => ({ operation_id: `${f.id}-other`, billing_unit_id: `${f.id}-other:image:0` })],
      ['version', () => ({ model_version: VERSION + 1 })], ['public-model', () => ({ public_model_id: 'other-public-model' })],
      ['provider', () => ({ provider_id: 'other-provider' })], ['wire-model', () => ({ model: 'jimeng/different-wire-model' })],
      ['malformed-index', f => ({ billing_unit_id: `${f.id}:image:0extra` })],
      ['account', () => ({ account_id: 'wrong-account' })], ['attempt', () => ({ attempt_id: 'wrong-attempt' })],
    ];
    for (const [label, changes] of variants) {
      const f = fixture(`mismatch-${label}`); await f.seed(true); await f.accepted(0, changes(f));
      await rejected(() => f.execute()); equal(f.workerEntries.length, 0, `${label}: no adapter entry`); equal(f.generationPosts, 0, `${label}: no POST`);
    }
    const f = fixture('attempt-model-mismatch'); await f.seed(true); await f.accepted(0);
    f.rows.get(f.id).snapshot.paidOperations[f.id].model = 'other-attempt-model';
    await rejected(() => f.execute()); equal(f.workerEntries.length, 0, 'saved attempt model mismatch rejected');
    return { rejectedIdentities: variants.length + 1 };
  });
  await caseRun('unknown-without-task-never-replayed', async () => {
    const f = fixture('unknown-no-task'); await f.seed(true); await f.accepted(0, { task_id: null, state: 'unknown' });
    await rejected(() => f.execute()); equal(f.workerEntries.length, 0, 'unknown ledger without task never passes child gate');
    equal(f.generationPosts, 0, 'unknown does not become generation permission');
    equal(f.snapshot().paidOperations[f.id].state, 'started', 'prior dispatch evidence retained');
    equal(f.ledger.length, 0, 'unknown does not settle');
  });
  await caseRun('query-failure-preserves-original-unknown', async () => {
    const f = fixture('query-unknown'); await f.seed(true); await f.accepted(0);
    const original = Error('fixture-original-query-unknown'); f.queryError = original;
    const error = await rejected(() => f.execute()); check(containsCause(error, original), 'original query error remains in cause chain');
    equal(f.generationPosts, 0, 'query failure never posts');
    equal(f.snapshot().paidOperations[f.id].state, 'started', 'query failure retains started root');
    check(f.ledgerRows[0].task_id != null && !['rejected', 'pre-submission-failed'].includes(f.ledgerRows[0].state), 'accepted supplier task survives query failure');
    equal(f.ledger.length, 0, 'query failure does not settle/refund');
    f.queryError = null; const images = await f.execute(); equal(images.length, 1, 'same task remains recoverable after query error');
    equal(f.generationPosts, 0, 'query retry remains GET-only');
    const fault = fixture('query-unknown-then-ledger-fault'); await fault.seed(true); await fault.accepted(0);
    const originalUnknown = Error('fixture-original-unknown-before-ledger-fault');
    fault.queryError = originalUnknown; fault.failSqlAfterQuery = /FROM app_supplier_calls/;
    const combined = await rejected(() => fault.execute());
    check(containsCause(combined, originalUnknown), 'recovery-bookkeeping DB error must retain original supplier unknown cause');
    equal(fault.generationPosts, 0, 'post-query ledger outage is not a replay permit');
    equal(fault.snapshot().paidOperations[fault.id].state, 'started', 'post-query ledger outage retains original dispatch evidence');
  }, true);
  await caseRun('database-failure-not-recovery-permission', async () => {
    const f = fixture('db-failure'); await f.seed(true); await f.accepted(0);
    const original = Error('fixture-database-original'); f.dbError = original; f.failSql = /FROM app_model_channel_operations/;
    const error = await rejected(() => f.execute()); check(containsCause(error, original), 'database exception is propagated');
    equal(f.workerEntries.length, 0, 'database failure does not enter supplier adapter'); equal(f.generationPosts, 0, 'database failure never posts');
    equal(f.ledger.length, 0, 'database exception does not settle');
  });
  await caseRun('stored-delivery-existing-policy-controls', async () => {
    const f = fixture('delivery-controls'), url = '/media/fixture-original.png', done = { state: 'done', result: [{ url }] };
    check(f.delivery.storedDeliveryCheckpoint({ paidOperations: { root: done } })?.allDone === true, 'preexisting completed root remains complete');
    check(f.delivery.storedDeliveryCheckpoint({ paidOperations: { root: done, other: { state: 'started' } } })?.allDone === false, 'genuinely unknown top-level attempt blocks full delivery');
    equal(f.delivery.storedDeliveryCheckpoint({ paidOperations: { root: { state: 'started', children: { child: done } } } }), null, 'nested done child alone is not a root delivery');
    equal(f.delivery.storedDeliveryCheckpoint({ paidOperations: { root: { state: 'done', result: [{ url: 'https://external.invalid/a.png' }] } } }), null, 'external URL is not local stored proof');
    check(f.delivery.storedDeliveryCheckpoint({ images: [{ url }] })?.final === true, 'final images keep precedence');
  });
  for (const f of fixtures) equal(f.networkCalls, 0, `${f.name}: no real supplier network`);
  const stable = [...sources].every(([, item]) => hash(fs.readFileSync(item.file)) === item.sha256);
  if (stable) check(true, 'SOURCE STABLE: loaded source hashes unchanged during this run');
  else cases.push({ name: 'source-stable', status: 'FAIL', fixtureError: true, error: 'SOURCE CHANGED DURING RUN' });
  const failures = cases.filter(c => c.status === 'FAIL');
  const reproduced = baseline && failures.some(c => c.name === 'historical-root-indexed-ledger-two-jobs-get-only' && !c.fixtureError && c.error.includes('ROOT_INDEX_RECOVERY_FAILED:'));
  const infrastructureFailure = failures.some(c => c.fixtureError);
  const status = baseline ? reproduced && !infrastructureFailure ? 'REPRODUCED' : 'INVALID_BASELINE' : failures.length ? 'FAIL' : 'PASS';
  const report = { mode, status, evidence: 'MOCK/REAL_TS_MODULES/AST_NOT_REAL_SUPPLIER_E2E', sourceRoot, beforeRoot: baseline ? beforeRoot : null,
    command: `node scripts/verify-image-postaccept-recovery.cjs${baseline ? ' --baseline' : ''}${sourceRoot !== workspace ? ` --source-root "${sourceRoot}"` : ''}`,
    checks, cases, sourceStable: stable, harnessSha256: hash(fs.readFileSync(__filename)), sources: [...sources].map(([relative, item]) => ({ relative, file: item.file, sha256: item.sha256 })),
    fixtures: fixtures.map(f => ({ name: f.name, workerEntries: f.workerEntries, rootEntries: f.bodyEntries, mockGenerationPosts: f.generationPosts,
      mockTaskGets: f.gets, realSupplierNetwork: f.networkCalls, holds: f.holds, undeliveredFailures: f.failures,
      ledgerEntries: f.ledger.length, deductions: f.deductions, snapshot: f.rows.get(f.id)?.snapshot })),
    realSupplierNetwork: 0, exitStatus: baseline || failures.length ? 1 : 0 };
  fs.mkdirSync(out, { recursive: true });
  const reportFile = path.join(out, `${mode}.json`); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  assert.equal(JSON.parse(fs.readFileSync(reportFile, 'utf8')).status, status, 'reopen actual report');
  console.log(`SOURCE STABLE=${stable ? 'PASS' : 'FAIL'} HASHES=${sources.size}`);
  console.log(`${mode}=${status} CASES=${cases.length} CHECKS=${checks} FAILURES=${failures.length} REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=${report.exitStatus}`);
  console.log(`REPORT=${reportFile}`);
  process.exitCode = report.exitStatus;
}
main().catch(error => { console.error(`HARNESS_ERROR=${String(error?.stack || error)}`); process.exitCode = 1; });
