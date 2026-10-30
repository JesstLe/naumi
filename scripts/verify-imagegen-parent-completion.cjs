#!/usr/bin/env node
'use strict';
/**
 * Whole-module, zero-network regression for imagegen child -> parent completion.
 * No product function is extracted/reimplemented. DurableImageJobs, dispatch,
 * background-activity, image-job-repository and creation-writer run transpiled.
 * PostgreSQL/media/release-store are deterministic boundary fixtures (not PG).
 * The fixture terminal producer represents an already accepted/settled child;
 * actual generate/adapters/supplier entry points are throwing sentinels.
 *
 * node scripts/verify-imagegen-parent-completion.cjs [--source-root ABS]
 *   [--output-root ABS] [--baseline]
 * --baseline defaults --source-root to output/.../before; an explicit source root
 * wins (including a rollback copy). Unchanged dependencies use this workspace.
 * A successful baseline reproduction deliberately exits 1, never because an
 * old module lacks the new notify export. Fixture/loader errors exit 2.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {AsyncLocalStorage} = require('node:async_hooks');
const ts = require('typescript');

const workspace = path.resolve(__dirname, '..');
const taskDir = path.join(workspace, 'output/imagegen-parent-completion-fix-20261024');
const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  assert.ok(args[at + 1] && !args[at + 1].startsWith('--'), `value required: ${name}`);
  return path.resolve(args[at + 1]);
}
const baseline = args.includes('--baseline');
const beforeRoot = path.join(taskDir, 'before');
const sourceRoot = option('--source-root', baseline ? beforeRoot : workspace);
const outputRoot = option('--output-root', process.env.IMAGEGEN_PARENT_COMPLETION_EVIDENCE || path.join(taskDir, 'tests'));
const changedFiles = new Set([
  'src/lib/image-jobs/runtime.ts',
  'src/lib/imagegen/dispatch.ts',
  'src/lib/release-runtime/background-activity.ts',
]);
const compilation = new Map();
const loaded = new Map();
const reports = [];
const fixtures = [];
const OWNER = 'parent-completion@example.test';
const OP = '10000000-0000-4000-8000-000000000024';
const PID = `imagegen-${OP}`;
const CID = 'generate-already-accepted-24';
const ART = 'art-already-saved-24';
const copy = value => value === undefined ? undefined : structuredClone(value);
const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const result = rows => ({rows, rowCount: rows.length});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
class FixtureBoundaryError extends Error {}
class ForbiddenBusinessEntry extends Error {}
function readSource(relative) {
  const selected = fs.existsSync(path.join(sourceRoot, relative)) ? path.join(sourceRoot, relative) : path.join(workspace, relative);
  if (changedFiles.has(relative)) assert.ok(fs.existsSync(path.join(sourceRoot, relative)), `changed source required in --source-root: ${relative}`);
  const bytes = fs.readFileSync(selected);
  const digest = hash(bytes);
  const prior = loaded.get(relative);
  assert.ok(!prior || prior.sha256 === digest, `source changed during verification: ${relative}`);
  loaded.set(relative, {relative, path: selected, sha256: digest, wholeModule: true,
    origin: selected.startsWith(beforeRoot + path.sep) ? 'before-overlay' : selected.startsWith(sourceRoot + path.sep) ? 'source-root' : 'workspace-dependency'});
  const key = `${relative}:${digest}`;
  if (!compilation.has(key)) {
    const compiled = ts.transpileModule(bytes.toString('utf8'), {
      fileName: selected,
      reportDiagnostics: true,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        esModuleInterop: true, isolatedModules: true},
    });
    const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new FixtureBoundaryError(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => sourceRoot, getCanonicalFileName: n => n, getNewLine: () => '\n',
    }));
    compilation.set(key, compiled.outputText);
  }
  return {selected, code: compilation.get(key)};
}

function fixture({runtime = true} = {}) {
  const f = {runtime, clock: Date.UTC(2026, 9, 24, 12), rows: new Map(), works: new Map(),
    creations: new Map(), links: new Map(), assets: new Map(), events: new Map(), activities: new Map(),
    trace: [], sql: [], logs: [], hooks: {}, metrics: {network: 0, supplierPosts: 0, generateEntries: 0,
      settleCalls: 0, billingWrites: 0, claims: 0, claimAttempts: 0, cooldownClears: 0,
      notificationReads: 0, activityBegins: 0, activityDenied: 0, fixtureProducerCalls: 0},
    capacity: 16, modules: new Map(), handles: new Set()};
  fixtures.push(f);
  f.event = (type, fields = {}) => {const e = {seq: f.trace.length + 1, type, ...fields}; f.trace.push(e); return e;};
  const fail = name => (..._args) => {
    if (/supplier|adapter|generation/.test(name)) f.metrics.generateEntries++;
    throw new ForbiddenBusinessEntry(`FORBIDDEN_BUSINESS_ENTRY:${name}`);
  };
  const db = {dbEnabled: true, getPool: () => pool, ensureSchema: async () => {},
    listArtworksByIds: async (owner, ids) => ids.map(id => f.works.get(id)).filter(w => w?.email === owner).map(copy),
    addArtworks: fail('unexpected-artwork-write'),
    deductPrincipalFIFO: fail('billing-debit'), refreshBalance: fail('balance-refresh'),
    creditMeteringEnabled: async () => true, expireDueBatches: fail('reservation-expiry')};
  const processFixture = {env: {}, pid: 1};
  class Clock extends Date {constructor(...values) {super(...(values.length ? values : [f.clock]));} static now() {return f.clock;}}
  const timers = {setInterval: () => {const h = {unref() {}}; f.handles.add(h); return h;},
    clearInterval: h => f.handles.delete(h),
    setTimeout: () => {const h={unref(){}};f.handles.add(h);return h;}, clearTimeout: h => f.handles.delete(h)};
  class DurableALS extends AsyncLocalStorage {constructor() {super(); f.executionALS = this;}}
  const identity = {releaseRuntimeEnabled: () => f.runtime,
    releaseIdentity: () => ({instanceId: 'fixture-instance', bootId: 'fixture-boot'}),
    releaseProcessRegistry: () => ({runtimeId: 'fixture-runtime'})};
  const store = {
    OBSERVED_BACKGROUND_SCOPES: ['durable-image'],
    async beginBackgroundActivity(scope, key, admission, parent) {
      f.metrics.activityBegins++;
      const existing = [...f.activities.values()].find(a => a.scope === scope && a.key === key && ['active', 'unknown'].includes(a.state));
      if (existing && admission === 'claim') {f.metrics.activityDenied++; f.event('activity-denied', {key, state: existing.state}); return null;}
      const id = `activity-${f.activities.size + 1}`;
      f.activities.set(id, {id, scope, key, state: 'active', parent: parent?.id || null});
      f.event('activity-begin', {id, key, parent: parent?.id || null}); return id;
    },
    async bindBackgroundActivity(id, key, token) {
      assert.equal(f.activities.get(id)?.state, 'active', 'real wrapper binds an active activity');
      if (f.hooks.beforeBind) await f.hooks.beforeBind(id, key, token);
      Object.assign(f.activities.get(id), {key, token}); f.event('activity-bind', {id, key, token});
    },
    async heartbeatActivity() {},
    async finishActivity(id) {
      const a = f.activities.get(id); assert.equal(a?.state, 'active');
      f.event('activity-finishing', {id, key: a.key});
      if (f.hooks.beforeFinish) await f.hooks.beforeFinish(a);
      if (f.hooks.finishError?.(a)) throw new Error('FIXTURE_FINISH_ACTIVITY_ERROR');
      a.state = 'finished'; f.event('activity-finished', {id, key: a.key});
    },
    async unknownActivity(id) {const a = f.activities.get(id); if (a?.state === 'active') a.state = 'unknown'; f.event('activity-unknown', {id, key: a?.key});},
  };
  class TeamError extends Error {}
  class Pending extends Error {constructor(operationId, cause) {super('fixture-pending', {cause}); this.operationId = operationId;}}
  class Deferred extends Pending {}
  const modelContext = {currentExecutionBundle: () => undefined, currentModelExecution: () => undefined,
    runLegacyModelExecution: async run => run()};
  const billing = {createBillingService: () => new Proxy({}, {get: (_t, name) => (..._args) => {
    f.metrics.settleCalls++; throw new ForbiddenBusinessEntry(`FORBIDDEN_BILLING_SERVICE:${String(name)}`);
  }})};
  const pool = {query: (...values) => query(...values), connect: async () => ({query: (...values) => query(...values),on(){},removeListener(){},release() {}})};
  function notificationContext(id, kind) {
    const execution = f.executionALS?.getStore();
    const background = processFixture[Symbol.for('naumi.release.background-context.v1')]?.getStore();
    assert.equal(execution, undefined, 'notification executes outside DurableImageJobs execution ALS');
    assert.equal(background, undefined, 'notification executes outside background span');
    const key = `${kind}:${id}`;
    const own = [...f.activities.values()].filter(a => a.key === key).at(-1);
    // Direct notify tests may have no own wrapper. A callback from a real wrapper
    // must observe its own same-key activity durably finished, not just SQL release.
    assert.notEqual(own?.state, 'active', 'notification precedes same-key finishActivity');
    assert.notEqual(own?.state, 'unknown', 'unknown same-key activity never grants settled callback');
    f.event('notification', {id, kind, executionALS: 'empty', backgroundALS: 'empty', activityState: own?.state || 'direct'});
  }
  async function query(raw, parameters = []) {
    const sql = String(raw).replace(/\s+/g, ' ').trim(), p = parameters;
    f.sql.push({sql, parameters: copy(p)});
    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)/.test(sql) || sql.includes('pg_advisory_xact_lock')) return result([]);
    if (sql.includes('FROM app_image_jobs parent')) {
      f.metrics.notificationReads++;
      const kind = sql.includes('WHERE child.id=$1') ? 'generate' : 'imagegen';
      notificationContext(p[0], kind);
      for (const expected of ["child.kind='generate'", 'child.email=parent.email', "parent.kind='imagegen'",
        "parent.snapshot->>'status' IN ('pending','running')", 'parent.lease_token IS NULL',
        "link.value->>'state'='submitted'", "child.snapshot->>'status' IN ('done','error','needs_attention')", 'child.lease_token IS NULL'])
        assert.ok(sql.includes(expected), `SQL fixture contract missing: ${expected}`);
      if (f.hooks.notifyError) throw new Error('FIXTURE_NOTIFICATION_DB_ERROR_DO_NOT_LOG_SECRET');
      const found = [];
      for (const parent of f.rows.values()) {
        if (parent.kind !== 'imagegen' || !['pending', 'running'].includes(parent.snapshot.status) || parent.lease_token !== null) continue;
        for (const link of Object.values(parent.snapshot.children || {})) {
          const child = f.rows.get(link.jobId);
          if (link.state !== 'submitted' || child?.kind !== 'generate' || child.email !== parent.email ||
            !['done', 'error', 'needs_attention'].includes(child.snapshot.status) || child.lease_token !== null) continue;
          if ((kind === 'generate' ? child.id : parent.id) !== p[0]) continue;
          found.push({id: parent.id, email: parent.email, snapshot: copy(parent.snapshot), plan: copy(parent.payload.plan), child_id: child.id});
        }
      }
      if (f.hooks.afterNotificationSelect) await f.hooks.afterNotificationSelect(found);
      return result(found);
    }
    if (sql.startsWith('UPDATE app_image_jobs SET lease_until=NULL')) {
      for (const expected of ['email=$2', "kind='imagegen'", 'lease_token IS NULL', 'snapshot=$3::jsonb', 'RETURNING id'])
        assert.ok(sql.includes(expected), `cooldown CAS missing: ${expected}`);
      if (f.hooks.beforeCooldownCAS) await f.hooks.beforeCooldownCAS(p);
      const row = f.rows.get(p[0]);
      if (!row || row.email !== p[1] || row.kind !== 'imagegen' || row.lease_token !== null ||
        !['pending', 'running'].includes(row.snapshot.status) || !jsonEqual(row.snapshot, JSON.parse(p[2]))) return result([]);
      row.lease_until = null; f.metrics.cooldownClears++; f.event('cooldown-cleared', {id: row.id}); return result([{id: row.id}]);
    }
    if (sql.startsWith('UPDATE app_image_jobs SET lease_token=$3')) {
      f.metrics.claimAttempts++; const row = f.rows.get(p[0]);
      const active = [...f.rows.values()].filter(r => r.kind === p[1] && r.lease_token && r.lease_until > f.clock).length;
      if (!row || row.kind !== p[1] || row.lease_until !== null && row.lease_until >= f.clock ||
        ['done', 'error', 'needs_attention'].includes(row.snapshot.status) || active >= Math.min(f.capacity, p[3])) {
        f.event('claim-empty', {id: p[0], kind: p[1]}); return result([]);
      }
      row.lease_token = p[2]; row.lease_until = f.clock + 120000; f.metrics.claims++;
      f.event('claim', {id: row.id, token: p[2]}); return result([copy(row)]);
    }
    if(sql.startsWith('SELECT id FROM app_image_jobs WHERE id=$1')){const row=f.rows.get(p[0]);return result(row&&(!sql.includes('snapshot=$2::jsonb')||jsonEqual(row.snapshot,JSON.parse(p[1])))?[{id:row.id}]:[]);}
    if(sql.startsWith('SELECT 1 FROM app_image_jobs WHERE id=$1')){const row=f.rows.get(p[0]);return result(row&&(p[1]!=null?row.lease_token===p[1]&&row.lease_until>f.clock:row.lease_token===null&&(row.lease_until===null||row.lease_until<f.clock))?[{'?column?':1}]:[]);}
    if(sql.startsWith("UPDATE app_image_jobs SET snapshot=snapshot-'creationEvidencePending'")){const row=f.rows.get(p[0]);if(row&&jsonEqual(row.snapshot,JSON.parse(p[1])))delete row.snapshot.creationEvidencePending;return result([]);}
    if (sql.startsWith('UPDATE app_image_jobs SET snapshot=$2::jsonb,updated_at=now()')) {
      const row = f.rows.get(p[0]), snapshot = JSON.parse(p[1]);
      if (f.hooks.beforeSave) await f.hooks.beforeSave(row, snapshot);
      if (!row || p.length>2&&!(p[2] !== null ? row.lease_token === p[2] && row.lease_until > f.clock : row.lease_until === null || row.lease_until < f.clock)) return result([]);
      row.snapshot = snapshot; f.event('snapshot-saved', {id: row.id, status: snapshot.status, token: p[2]});
      if (f.hooks.afterSave) await f.hooks.afterSave(row, snapshot);
      return result([{id: row.id}]);
    }
    if (sql.startsWith('UPDATE app_image_jobs SET lease_token=NULL,updated_at=now()')) {
      const row = f.rows.get(p[0]); if (!row || row.lease_token !== p[1]) return result([]);
      row.lease_token = null; row.lease_until = row.snapshot.status === 'pending' ? f.clock + 10000 : null;
      f.event('sql-lease-released', {id: row.id, status: row.snapshot.status, lease_until: row.lease_until}); return result([{id: row.id}]);
    }
    if (sql.startsWith('SELECT * FROM app_image_jobs WHERE id=$1 AND kind=$2')) {
      if (f.hooks.beforeJobRead) await f.hooks.beforeJobRead(p[0], p[1]);
      const row = f.rows.get(p[0]); return result(row?.kind === p[1] ? [copy(row)] : []);
    }
    if (sql.startsWith('SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE')) return result(f.rows.has(p[0]) ? [copy(f.rows.get(p[0]))] : []);
    if (sql.startsWith("SELECT email,snapshot FROM app_image_jobs WHERE id=$1 AND kind='generate'")) {
      const row = f.rows.get(p[0]), saved = row?.kind === 'generate' ? copy(row) : undefined;
      if (f.hooks.afterChildRead) await f.hooks.afterChildRead(saved);
      return result(saved ? [{email: saved.email, snapshot: saved.snapshot}] : []);
    }
    if (sql.includes("AS error,snapshot->>'imagegenOutputWarning'")) {
      const row = f.rows.get(p[0]); return result(row?.email === p[1] ? [{error: row.snapshot.imagegenOutputError,
        warning: row.snapshot.imagegenOutputWarning, images: row.snapshot.images?.length || 0}] : []);
    }
    if (sql.includes("payload->'creationScope' AS scope")) {
      const row = f.rows.get(p[0]); return result(row?.email === p[1] && row.kind === 'imagegen' ? [{scope: copy(row.payload.creationScope)}] : []);
    }
    if (sql.includes('COALESCE((SELECT -sum(l.delta)') && sql.includes('FROM app_image_jobs j')) {
      return result(p[0].map(id=>f.rows.get(id)).filter(row=>row?.email===p[1]).map(row=>({id:row.id,billing_settled:row.billing_settled,legacy_charge:'0'})));
    }
    if (sql.startsWith('SELECT id,state,charged_credits FROM app_billing_operations')) return result(f.ledger.filter(row=>row.email===p[0]&&p[1].includes(row.id)));
    if (sql.startsWith('SELECT COALESCE(sum(charged_credits),0)::int AS n')) {
      const ids = new Set([...p[1], ...p[2]]); return result([{n: f.ledger.filter(x => x.email === p[0] && ids.has(x.id)).reduce((n, x) => n + x.charged_credits, 0)}]);
    }
    if (sql.includes('SELECT c.id,c.actor_email FROM app_creation_records')) {
      return result([...f.links.values()].filter(l => l.target_id === p[0] && l.target_type.startsWith('image:'))
        .map(l => ({id: l.creation_id, actor_email: f.creations.get(l.creation_id).actor_email})));
    }
    if (sql.startsWith('UPDATE app_creation_records SET status=$2')) {
      f.creations.get(p[0]).status = p[1]; f.event('creation-state', {id: p[0], status: p[1]}); return result([{id: p[0]}]);
    }
    if (sql.startsWith('INSERT INTO app_creation_events')) {
      const k = `${p[1]}:${p[2]}`; if (!f.events.has(k)) f.events.set(k, {id: p[0], creation_id: p[1], event_key: p[2], status: p[4]}); return result([]);
    }
    if (sql === 'SELECT image_url,video_url,canvas_image_version FROM app_artworks WHERE id=$1 AND email=$2 FOR SHARE') {
      const row = f.works.get(p[0]);
      return result(row?.email === p[1] ? [{image_url: row.image_url ?? row.image, video_url: row.video_url ?? null, canvas_image_version: row.canvas_image_version ?? null}] : []);
    }
    if (sql.startsWith('SELECT 1 FROM app_artworks WHERE id=$1 AND email=$2')) {
      const row = f.works.get(p[0]); return result(row?.email === p[1] ? [{'?column?': 1}] : []);
    }
    if (sql.startsWith('INSERT INTO app_creation_links')) {
      const l = {creation_id: p[0], actor_email: p[1], target_type: p[2], target_id: p[3], relation: p[4]};
      f.links.set(JSON.stringify(l), l); return result([]);
    }
    if (sql.startsWith('SELECT 1 FROM app_creation_assets WHERE creation_id=$1 AND direction=$2 AND storage_ref=$3'))
      return result([...f.assets.values()].filter(a => a.creation_id === p[0] && a.direction === p[1] && a.storage_ref === p[2]).map(() => ({'?column?': 1})));
    if (sql.startsWith('SELECT COALESCE(max(position),-1)+1 AS next FROM app_creation_assets')) {
      const positions = [...f.assets.values()].filter(a => a.creation_id === p[0] && a.direction === p[1] && a.role === p[2] && a.variant === p[3]).map(a => a.position);
      return result([{next: positions.length ? Math.max(...positions) + 1 : 0}]);
    }
    if (sql === "SELECT to_regclass('app_media_assets') AS name") return result([{name: null}]);
    if (sql.startsWith('INSERT INTO app_creation_assets')) {
      const a = {id: p[0], creation_id: p[1], actor_email: p[2], direction: p[3], role: p[4], position: p[5], variant: p[6], storage_ref: p[7], storage_snapshot: p[16]};
      const k = JSON.stringify([a.creation_id, a.direction, a.role, a.position, a.variant]); if (!f.assets.has(k)) f.assets.set(k, a); return result([]);
    }
    if (/^(UPDATE|INSERT|DELETE).*app_(billing|ledger|gen_reservations)/.test(sql)) {f.metrics.billingWrites++; throw new ForbiddenBusinessEntry(`BILLING_WRITE:${sql}`);}
    throw new FixtureBoundaryError(`UNHANDLED_SQL:${sql}`);
  }
  const dependencies = {
    'src/lib/image-jobs/runtime.ts': {
      '@/lib/saas/creation-scope': () => load('src/lib/saas/creation-scope.ts'),
      '@/lib/release-runtime/background-activity': () => load('src/lib/release-runtime/background-activity.ts'),
      '@/lib/release-runtime/identity': identity, '@/platform/db/pool': db, '@/lib/staging-history': {assertMutableStagingTask: async () => {}},
      '@/lib/storage': {uploadImage: fail('unexpected-upload'), readManagedObject: fail('unexpected-managed-object')},
      '@/lib/settings-secret': {workerSecret: fail('worker-secret')},
      '@/lib/image-job-repository': () => load('src/lib/image-job-repository.ts'),
      '@/lib/image-gateway': {ImageOperationPending: Pending, ImageOperationDeferred: Deferred,
        isImageGatewayModel: () => false, withImageOperation: fail('supplier-paid-operation'), withImageIndexCheckpoint: fail('supplier-index')},
      './image-job-queue': () => load('src/lib/image-job-queue.ts'), '@/lib/settings': {getOpenAISettings: fail('supplier-settings')},
      '@/lib/openai-base': {getOpenAIBaseUrl: fail('supplier-origin')},
      '@/lib/bi/context': {withBiModelContext: async (_owner, _kind, _id, run) => run()},
      '@/lib/model-config/context': modelContext, '@/lib/model-config/execution': {withFrozenExecutionBundle: async (_bundle, run) => run()},
      '@/lib/model-config/channel-availability': {acceptedImageOperationIdentities: fail('supplier-accepted-identities'), withAcceptedImageRead: fail('supplier-accepted-read')},
      '@/lib/image-job-failure': () => load('src/lib/image-job-failure.ts'),
      './imagegen/dispatch': () => load('src/lib/imagegen/dispatch.ts'),
    },
    'src/lib/image-job-repository.ts': {
      '@/lib/saas/creation-scope': () => load('src/lib/saas/creation-scope.ts'),
      './saas/creation-writer': () => load('src/lib/saas/creation-writer.ts'), './image-job-queue': () => load('src/lib/image-job-queue.ts'),
      '@/platform/db/pool': db, '@/lib/billing/service': billing, '@/lib/image-job-failure': () => load('src/lib/image-job-failure.ts'),
      './billing/repository': {lockWallet: fail('wallet-lock'), syncBalanceTx: fail('wallet-sync')},
      '@/lib/staging-history': {assertMutableStagingTask: async () => {}, excludeImportedHistory: () => '', isImportedHistory: async () => false},
    },
    'src/lib/saas/creation-scope.ts': {
      '@/platform/db/pool': db, '@/lib/enterprise/server': {enterpriseCreationRead: fail('enterprise-read')},
      '@/lib/teams/server': {TeamError}, './creation-schema': {ensureCreationSchema: async () => {}},
      '@/lib/settings-secret': {settingsSecret: fail('settings-secret')},
      '@/lib/feature-access/catalog': {}, '@/lib/feature-access/server': {},
    },
    'src/lib/saas/creation-writer.ts': {
      './creation-scope': () => load('src/lib/saas/creation-scope.ts'), './creation-contracts': () => load('src/lib/saas/creation-contracts.ts'),
      '@/lib/model-config/context': modelContext, '@/platform/db/pool': db, './creation-schema': {ensureCreationSchema: async () => {}},
      '@/lib/storage': {uploadImage: fail('creation-upload')}, '@/lib/bi/call-scope': {currentObservedCallId: () => undefined}, '@/lib/teams/server': {TeamError},
    },
    'src/lib/release-runtime/background-activity.ts': {
      './identity': identity, './accepted-context': {currentAcceptedParent: () => undefined}, './store': store,
    },
    'src/lib/imagegen/creation-scope.ts': {'@/lib/saas/creation-scope': () => load('src/lib/saas/creation-scope.ts')},
    'src/lib/imagegen/output-advisory.ts': {'./request-size': {imageRatioMismatch: fail('unused-ratio-comparison')}, './notice-visibility': () => load('src/lib/imagegen/notice-visibility.ts')},
    'src/lib/imagegen/dispatch.ts': {
      '@/lib/image-jobs/runtime': () => load('src/lib/image-jobs/runtime.ts'), '@/platform/db/pool': db,
      '../canvas-image-input': {readCanvasOutput: async url => {
        assert.ok([...f.works.values()].some(w => w.image === url), 'media fixture serves only saved artworks');
        return {buffer: Buffer.from('fixture-pixels'), mimeType: 'image/png'};
      }},
      './postprocess': {inspectImagegenPixels: async () => ({width: 1024, height: 1024, visiblePixels: 1048576, transparentPixels: 0})},
      '../canvas-local-image-edit': {saveCanvasLocalEdit: fail('unexpected-postprocess')},
      './plan': {planImagegen: fail('unexpected-replan'), imagegenFingerprint: value => JSON.stringify(value)},
      './quotes': {assertImagegenQuoteReference: fail('unexpected-quote'), frozenImagegenQuote: fail('unexpected-quote'), latestImagegenQuote: fail('unexpected-quote')},
      './adapters': {executeImagegenStep: fail('adapter-generate-supplier-entry')},
      './generation-core': () => load('src/lib/imagegen/generation-core.ts'),
      './schema': {imagegenRequestSchema: {parse: copy}}, './cancel': () => load('src/lib/imagegen/cancel.ts'),
      './input-assets': {readImagegenInputAsset: fail('unexpected-input-asset')}, './inputs': {readImagegenInputs: fail('unexpected-inputs')},
      './mask': {preserveMaskedOutside: fail('unexpected-mask')}, './output-advisory': () => load('src/lib/imagegen/output-advisory.ts'),
      './receipt-policy': () => load('src/lib/imagegen/receipt-policy.ts'),
      '../image-job-review': {storedImageReview: async () => null, IMAGE_REVIEW_MESSAGE: 'fixture-review'},
      './stored-delivery': {storedDeliveryState: async () => null, recoverStoredDelivery: fail('unexpected-recovery')},
      './completed-parent-receipt': {finalizeCompletedParent:async()=>false},
      '@/lib/saas/creation-scope': () => load('src/lib/saas/creation-scope.ts'), './creation-scope': () => load('src/lib/imagegen/creation-scope.ts'),
    },
    'src/lib/imagegen/generation-core.ts': {
      '../native-auth': {signUserSession: fail('generation-auth'), USER_COOKIE: 'fixture'},
      '../model-config/accepted-context': {signAcceptedModelContext: fail('generation-context')},
      './inputs': {readImagegenInputs: fail('generation-inputs')}, './prompt': {compileImagegenPrompt: fail('generation-prompt')},
      './context': {withImagegenStep: fail('generation-step')}, '@/platform/db/pool': db,
      '@/lib/saas/creation-scope': () => load('src/lib/saas/creation-scope.ts'),
    },
    'src/lib/imagegen/cancel.ts': {
      './coordination-pool': {imageCoordinationPool: () => pool},
      '../image-job-repository': () => load('src/lib/image-job-repository.ts'), './creation-scope': () => load('src/lib/imagegen/creation-scope.ts'),
    },
  };

  // Execute the existing attachment owner: without canvasTarget it must return
  // before schema/DB/history effects, rather than a sentinel rejecting success.
  dependencies['src/lib/imagegen/dispatch.ts']['../canvas/image-version-store']=()=>load('src/lib/canvas/image-version-store.ts');
  dependencies['src/lib/canvas/image-version-store.ts']={
    '../persistence/schema':{ensureSchema:fail('unexpected-canvas-schema')},
    './storage-schema':{ensureCanvasSettingsSchema:fail('unexpected-canvas-schema'),ensureCanvasImageVersionSchema:fail('unexpected-canvas-schema')},
    '../saas/creation-access':{assertCreationProjectInput:fail('unexpected-canvas-access')},
    '../saas/creation-scope':()=>load('src/lib/saas/creation-scope.ts'),
    '../saas/creation-schema':{ensureCreationSchema:fail('unexpected-canvas-schema')},
    './image-versions':()=>load('src/lib/canvas/image-versions.ts'),
  };
  dependencies['src/lib/imagegen/dispatch.ts']['./task-diagnostics']=()=>load('src/lib/imagegen/task-diagnostics.ts');
  dependencies['src/lib/imagegen/dispatch.ts']['./delivery-billing']=()=>load('src/lib/imagegen/delivery-billing.ts');
  dependencies['src/lib/imagegen/delivery-billing.ts']={'@/platform/db/pool':db};
  dependencies['src/lib/image-jobs/runtime.ts']['../image-job-codec']=()=>load('src/lib/image-job-codec.ts');
  dependencies['src/lib/image-jobs/runtime.ts']['../image-job-lease']=()=>load('src/lib/image-job-lease.ts');
  dependencies['src/lib/image-job-codec.ts']={
    './object-storage/runtime':{dataUrlToBytes:fail('unexpected-byte-input')},
    './media-upload':{uploadImage:fail('unexpected-byte-upload')},
    './object-storage/managed-read':{readManagedObject:fail('unexpected-byte-read')},
    './image-jobs/result-storage':{writeImageJobResult:fail('unexpected-byte-result'),readImageJobResult:fail('unexpected-byte-result-read')},
  };
  dependencies['src/lib/image-job-repository.ts']['./image-job-lease']=()=>load('src/lib/image-job-lease.ts');
  // Ownership-only aliases: execute the same fixture boundaries after the refactor.
  for (const deps of Object.values(dependencies)) {
    if (deps['@/lib/storage']) {deps['@/lib/media-upload']=deps['@/lib/storage'];deps['@/lib/object-storage/managed-read']=deps['@/lib/storage'];deps['@/lib/object-storage/runtime']=deps['@/lib/storage'];}
    if (deps['@/lib/teams/server']) deps['@/lib/teams/errors']=deps['@/lib/teams/server'];
  }
  dependencies['src/lib/image-jobs/runtime.ts']['@/lib/application/task-execution']={deferApplicationTask:async()=>false};
  dependencies['src/lib/image-jobs/runtime.ts']['@/lib/worker/inflight']=()=>load('src/lib/worker/inflight.ts');
  dependencies['src/lib/image-job-repository.ts']['@/lib/saas/creation-scope']=()=>load('src/lib/saas/creation-scope.ts');
  dependencies['src/lib/image-job-repository.ts']['@/lib/persistence/schema']={ensureSchema:async()=>{}};
  dependencies['src/lib/image-job-repository.ts']['@/lib/billing/wallet-balance']={deductPrincipalFIFO:fail('wallet-deduct'),refreshBalance:fail('wallet-refresh'),expireDueBatches:fail('wallet-expire')};
  dependencies['src/lib/image-job-repository.ts']['@/lib/billing/runtime']={creditMeteringEnabled:async()=>true};
  dependencies['src/lib/image-job-repository.ts']['./image-job-failure']=()=>load('src/lib/image-job-failure.ts');
  dependencies['src/lib/image-job-repository.ts']['./staging-history']=dependencies['src/lib/image-job-repository.ts']['@/lib/staging-history'];
  dependencies['src/lib/saas/creation-writer.ts']['./creation-outcome-policy']=()=>load('src/lib/saas/creation-outcome-policy.ts');
  dependencies['src/lib/release-runtime/background-activity.ts']['../worker/inflight']=()=>load('src/lib/worker/inflight.ts');
  dependencies['src/lib/imagegen/generation-core.ts']['./operation-id']=()=>load('src/lib/imagegen/operation-id.ts');
  dependencies['src/lib/imagegen/generation-core.ts']['./step-intent']=()=>load('src/lib/imagegen/step-intent.ts');
  dependencies['src/lib/imagegen/generation-core.ts']['./generation-operation']={submitGenerationOperation:fail('generation-business-entry')};
  dependencies['src/lib/imagegen/generation-core.ts']['../billing/submission-identity']={multipartFieldText:value=>value};
  dependencies['src/lib/imagegen/generation-core.ts']['@/lib/artworks/repository']={listArtworksByIds:async()=>[]};
  dependencies['src/lib/imagegen/generation-core.ts']['@/lib/saas/creation-access']={assertCreationProjectInput:fail('generation-project')};
  dependencies['src/lib/imagegen/creation-scope.ts']['@/lib/saas/creation-scope']=()=>load('src/lib/saas/creation-scope.ts');
  dependencies['src/lib/imagegen/dispatch.ts']['@/lib/artworks/repository']={listArtworksByIds:async(owner,ids)=>ids.map(id=>f.works.get(id)).filter(w=>w?.email===owner)};
  dependencies['src/lib/imagegen/dispatch.ts']['@/lib/artworks/writer']={addArtworks:fail('unexpected-artwork-write')};
  dependencies['src/lib/imagegen/dispatch.ts']['./delivery-billing']=()=>load('src/lib/imagegen/delivery-billing.ts');
  dependencies['src/lib/imagegen/delivery-billing.ts']={'@/platform/db/pool':db,'./operation-id':()=>load('src/lib/imagegen/operation-id.ts')};

  function load(relative) {
    if (f.modules.has(relative)) return f.modules.get(relative).exports;
    const {selected, code} = readSource(relative), loadedModule = {exports: {}}; f.modules.set(relative, loadedModule);
    const imports = specifier => {
      if (specifier === 'server-only') return {};
      if (specifier === 'zod') return require('zod');
      if (specifier === 'node:process') return processFixture;
      if (specifier === 'node:crypto') return crypto;
      if (specifier === 'node:async_hooks') return {AsyncLocalStorage: relative === 'src/lib/image-jobs/runtime.ts' ? DurableALS : AsyncLocalStorage};
      if(specifier==='../image-job-cleanup'||specifier==='./image-job-cleanup')return load('src/lib/image-job-cleanup.ts');
      if(relative==='src/lib/image-job-cleanup.ts'&&specifier==='./imagegen/task-diagnostics')return load('src/lib/imagegen/task-diagnostics.ts');
      const ownedPorts={
        '@/platform/db/pool':db,
        '@/lib/saas/creation-scope':()=>load('src/lib/saas/creation-scope.ts'),
        '@/lib/saas/creation-access':{bindActualCreationProject:fail('unexpected-project-bind')},
        '@/platform/db/transaction':()=>load('src/platform/db/transaction.ts'),
        '@/lib/persistence/schema':{ensureSchema:async()=>{}},
      };
      if(Object.hasOwn(ownedPorts,specifier))return typeof ownedPorts[specifier]==='function'?ownedPorts[specifier]():ownedPorts[specifier];
      if ((specifier==='./task-diagnostics' && relative==='src/lib/imagegen/dispatch.ts') || (specifier==='./imagegen/task-diagnostics' && ['src/lib/image-job-repository.ts'].includes(relative))) return load('src/lib/imagegen/task-diagnostics.ts');
      if(relative==='src/lib/image-jobs/runtime.ts' && specifier==='../imagegen/task-diagnostics')return load('src/lib/imagegen/task-diagnostics.ts');
      if(relative==='src/lib/imagegen/task-diagnostics.ts' && specifier==='./failure-evidence')return load('src/lib/imagegen/failure-evidence.ts');
      if(relative==='src/lib/image-job-queue.ts' && specifier==='./runtime/positive-integer')return load('src/lib/runtime/positive-integer.ts');
      const map = dependencies[relative] || {};
      if (!Object.hasOwn(map, specifier)) throw new FixtureBoundaryError(`UNMOCKED_IMPORT:${relative}:${specifier}`);
      return typeof map[specifier] === 'function' ? map[specifier]() : map[specifier];
    };
    vm.runInNewContext(code, {module:loadedModule, exports: loadedModule.exports, require: imports, Buffer, structuredClone,
      URL, Request, Response, Headers, AbortSignal, Date: Clock, performance:{now:()=>f.clock},process: processFixture,
      console: {error: (...v) => f.logs.push(v.map(String).join(' ')), log: (...v) => f.logs.push(v.map(String).join(' '))},
      fetch: (..._v) => {f.metrics.network++; f.metrics.supplierPosts++; throw new ForbiddenBusinessEntry('FORBIDDEN_NETWORK');},
      ...timers}, {filename: selected, timeout: 10000});
    if (relative === 'src/lib/image-job-repository.ts') {
      const settle = loadedModule.exports.settleImageJob;
      loadedModule.exports.settleImageJob = (...v) => {f.metrics.settleCalls++; return settle(...v);};
    }
    return loadedModule.exports;
  }
  f.load = load;
  f.api = load('src/lib/imagegen/dispatch.ts');
  f.repository = load('src/lib/image-job-repository.ts');
  f.background = load('src/lib/release-runtime/background-activity.ts');
  f.childJobs = new (load('src/lib/image-jobs/runtime.ts').DurableImageJobs)('generate', f.api.notifyImagegenJobReleased);
  f.scope = id => ({actorEmail: OWNER, scopeKind: 'personal', tenantId: null, creationId: id});
  f.plan = {request: {version: 1, operationId: OP, entry: 'canvas', mode: 'generate', prompt: 'fixture',
    inputs: [], output: {format: 'png'}, parameters: {}, variants: 1},
    steps: [{key: 'generate', operation: 'generate', credits: 7, parameters: {}}], intent: {background: null}, warnings: []};
  f.rows.set(PID, {id: PID, kind: 'imagegen', email: OWNER, lease_token: null, lease_until: f.clock + 10000, billing_settled: true,
    payload: {plan: copy(f.plan), creationScope: f.scope('creation-parent')}, snapshot: {paidOperationVersion: 1, status: 'pending', fingerprint: 'fixture',
      result: {operationId: OP, jobId: PID, status: 'queued', stage: 'generating', artifacts: [], chargedCredits: 0},
      children: {generate: {state: 'submitted', jobId: CID}}}});
  f.rows.set(CID, {id: CID, kind: 'generate', email: OWNER, lease_token: null, lease_until: null, billing_settled: true,
    payload: {creationScope: f.scope('creation-child')}, snapshot: {paidOperationVersion: 1, status: 'pending', images: []}});
  f.works.set(ART, {id: ART, email: OWNER, image: '/media/fixture-already-saved.png', status: 'completed'});
  f.ledger = [{id: CID, email: OWNER, state: 'settled', charged_credits: 7, ledger_id: `led-image-${CID}`}];
  for (const [id, job, kind] of [['creation-parent', PID, 'imagegen'], ['creation-child', CID, 'generate']]) {
    f.creations.set(id, {id, actor_email: OWNER, status: 'queued'});
    const l = {creation_id: id, actor_email: OWNER, target_type: `image:${kind}`, target_id: job, relation: 'execution'};
    f.links.set(JSON.stringify(l), l);
  }
  f.originalLedger = JSON.stringify(f.ledger);
  f.parent = () => f.rows.get(PID);
  f.child = () => f.rows.get(CID);
  f.notify = (id = CID, kind = 'generate') => {
    assert.equal(typeof f.api.notifyImagegenJobReleased, 'function', 'modified source exports notifier');
    return f.api.notifyImagegenJobReleased(id, kind);
  };
  f.completeChild = async (status = 'done', {throwAfter = false} = {}) => {
    await f.childJobs.kick(CID, async (_payload, snapshot) => {
      f.metrics.fixtureProducerCalls++;
      await f.childJobs.set(CID, {...snapshot, status, images: status === 'done' ? [{id: ART}] : [],
        ...(status === 'done' ? {} : {error: 'fixture-original-child-failure'})});
      if (throwAfter) throw new Error('FIXTURE_CHILD_EXECUTION_CATCH');
    });
  };
  f.assertZeroPaid = () => {
    for (const field of ['network', 'supplierPosts', 'generateEntries', 'settleCalls', 'billingWrites']) assert.equal(f.metrics[field], 0, `${field}=0`);
    assert.equal(JSON.stringify(f.ledger), f.originalLedger, 'existing settlement and original ledger stay byte-equivalent');
  };
  return f;
}

async function pump(turns = 800) {for (let n = 0; n < turns; n++) await Promise.resolve();}
async function until(predicate, label) {
  for (let n = 0; n < 12000; n++) {if (predicate()) return; await Promise.resolve();}
  throw new Error(`fixture barrier not reached: ${label}`);
}
async function drain(f) {
  await pump(1600);
  assert.equal([...f.activities.values()].filter(a => a.state === 'active').length, 0, 'all fixture release activities settled');
  assert.equal(f.handles.size, 0, 'all real-wrapper and durable heartbeats cleared');
  f.assertZeroPaid();
}
function assertSucceeded(f) {
  const p = f.parent();
  assert.equal(p.snapshot.status, 'done'); assert.equal(p.snapshot.result.status, 'succeeded');
  assert.equal(p.snapshot.result.stage, 'done'); assert.equal(p.snapshot.result.chargedCredits, 7);
  assert.equal(p.snapshot.result.billingStatus, 'confirmed');
  assert.deepEqual(Array.from(p.snapshot.result.artifacts, a => a.artworkId), [ART]);
  assert.equal(f.creations.get('creation-parent').status, 'succeeded');
  assert.equal([...f.assets.values()].filter(a => a.creation_id === 'creation-parent' && a.storage_ref === `artwork:${ART}`).length, 1);
  assert.equal([...f.links.values()].filter(l => l.creation_id === 'creation-parent' && l.target_id === ART && l.relation === 'output').length, 1);
  assert.equal(p.lease_token, null); f.assertZeroPaid();
}
async function caseRun(name, run) {
  const first = fixtures.length;
  try {await run(); reports.push({name, status: 'PASS', fixtures: fixtures.slice(first).map(f => ({metrics: {...f.metrics}, trace: f.trace, logs: f.logs}))}); console.log(`PASS ${name}`);}
  catch (error) {reports.push({name, status: 'FAIL', error: {name: error.name, message: error.message, stack: error.stack},
    fixtures: fixtures.slice(first).map(f => ({metrics: {...f.metrics}, trace: f.trace, logs: f.logs, sql: f.sql}))}); console.error(`FAIL ${name}: ${error.message}`);}
}
async function baselineRun() {
  for (const file of changedFiles) {
    assert.ok(fs.existsSync(path.join(beforeRoot, file)), `original before file required: ${file}`);
    assert.equal(hash(fs.readFileSync(path.join(sourceRoot, file))), hash(fs.readFileSync(path.join(beforeRoot, file))), `baseline/rollback input must match original before bytes: ${file}`);
  }
  const f = fixture();
  await f.completeChild(); await drain(f);
  const symptom = {child: f.child().snapshot.status, childSettled: f.child().billing_settled,
    artworkSaved: f.works.has(ART), parent: f.parent().snapshot.status, result: f.parent().snapshot.result.status,
    creation: f.creations.get('creation-parent').status, supplierPosts: f.metrics.supplierPosts, settleCalls: f.metrics.settleCalls};
  assert.deepEqual(symptom, {child: 'done', childSettled: true, artworkSaved: true, parent: 'pending', result: 'queued', creation: 'queued', supplierPosts: 0, settleCalls: 0});
  // Positive control executes OLD runParent/lease/creation code after advancing
  // the real repository cooldown. Missing notify is never invoked/asserted.
  f.clock += 10001; await f.api.resumeImagegen(PID); await drain(f); assertSucceeded(f);
  reports.push({name: 'baseline-child-done-parent-pending', status: 'REPRODUCED', symptom,
    positiveControl: 'old resumeImagegen -> actual runParent -> parent done / creation succeeded after 10s fixture clock', trace: f.trace, metrics: {...f.metrics}});
  return 'REPRODUCED';
}
async function modifiedRun() {
  await caseRun('terminal child releases -> parent done + creation output + no supplier/settlement', async () => {
    const f = fixture(); await f.completeChild(); await drain(f); assertSucceeded(f);
    const release = f.trace.find(e => e.type === 'sql-lease-released' && e.id === CID);
    const finish = f.trace.find(e => e.type === 'activity-finished' && e.key === `generate:${CID}`);
    const notify = f.trace.find(e => e.type === 'notification' && e.kind === 'generate');
    assert.ok(release.seq < finish.seq && finish.seq < notify.seq, 'SQL release -> activity finished -> notification');
  });
  for (const status of ['error', 'needs_attention']) await caseRun(`${status} child -> failed parent, preserved existing settlement`, async () => {
    const f = fixture(); await f.completeChild(status); await drain(f);
    assert.equal(f.parent().snapshot.status, 'error'); assert.equal(f.parent().snapshot.result.status, 'failed');
    assert.equal(f.creations.get('creation-parent').status, 'failed'); assert.equal(f.parent().snapshot.result.chargedCredits, 7);
  });
  await caseRun('pending and unknown children do not complete parent or clear cooldown', async () => {
    for (const status of ['pending', 'running', 'unknown']) {
      const f = fixture(); f.child().snapshot.status = status; await f.notify(); await drain(f);
      assert.equal(f.parent().snapshot.status, 'pending'); assert.equal(f.metrics.cooldownClears, 0); assert.equal(f.metrics.claims, 0);
    }
  });
  await caseRun('different owner and unrelated parent never wake', async () => {
    const f = fixture(), unrelated = copy(f.parent()); unrelated.id += '-unrelated'; unrelated.snapshot.children.generate.jobId = 'other-child';
    f.rows.set(unrelated.id, unrelated);
    const foreign = copy(f.parent()); foreign.id += '-foreign'; foreign.email = 'other@example.test'; f.rows.set(foreign.id, foreign);
    await f.completeChild(); await drain(f); assertSucceeded(f);
    assert.equal(unrelated.snapshot.status, 'pending'); assert.equal(foreign.snapshot.status, 'pending');
    assert.equal(f.trace.filter(e => e.type === 'claim' && e.id !== CID && e.id !== PID).length, 0);
  });
  await caseRun('live parent and live child lease cannot be cleared by notification', async () => {
    const f = fixture(); f.child().snapshot = {...f.child().snapshot, status: 'done', images: [{id: ART}]};
    f.parent().lease_token = 'another-parent-token'; f.parent().lease_until = f.clock + 120000;
    await f.notify(); assert.equal(f.parent().lease_token, 'another-parent-token'); assert.equal(f.metrics.cooldownClears, 0);
    await f.repository.releaseImageJob(PID, 'another-parent-token');
    f.child().lease_token = 'another-child-token'; f.child().lease_until = f.clock + 120000;
    await f.notify(PID, 'imagegen'); assert.equal(f.metrics.cooldownClears, 0);
    await f.repository.releaseImageJob(CID, 'another-child-token'); await f.notify(PID, 'imagegen'); await drain(f); assertSucceeded(f);
  });
  await caseRun('terminal parent does not reenter', async () => {
    for (const status of ['done', 'error', 'needs_attention']) {
      const f = fixture(); f.parent().snapshot.status = status; await f.completeChild(); await drain(f);
      assert.equal(f.parent().snapshot.status, status); assert.equal(f.metrics.cooldownClears, 0);
      assert.equal(f.trace.filter(e => e.type === 'claim' && e.id === PID).length, 0);
    }
  });
  await caseRun('frozen frontier blocks earlier pending unknown missing or starting steps', async () => {
    for (const state of ['submitted', 'starting', 'missing', 'unknown']) {
      const f = fixture(); f.parent().payload.plan.steps.unshift({key: 'earlier', operation: 'generate', parameters: {}});
      if (state !== 'missing') f.parent().snapshot.children.earlier = {state, jobId: 'earlier-not-done'};
      await f.completeChild(); await drain(f); assert.equal(f.parent().snapshot.status, 'pending'); assert.equal(f.metrics.cooldownClears, 0);
    }
    const f = fixture(); f.parent().payload.plan.steps.push({key: 'later', operation: 'generate', parameters: {}});
    f.parent().snapshot.children.later = {state: 'starting'}; await f.completeChild(); await drain(f); assert.equal(f.metrics.cooldownClears, 0);
  });
  await caseRun('already-done frozen prefix consumes submitted terminal frontier without replay', async () => {
    const f = fixture(); f.parent().payload.plan.steps.unshift({key: 'prefix', operation: 'generate', parameters: {}});
    f.parent().snapshot.children.prefix = {state: 'done', ids: [ART]};
    await f.completeChild(); await drain(f); assertSucceeded(f);
  });
  for (const point of ['before-pending-save', 'after-pending-save']) await caseRun(`lost wake: child done ${point}, parent post-release reconciles`, async () => {
    const f = fixture(), gate = deferred(); let held = false;
    f.parent().lease_until = null;
    if (point === 'before-pending-save') f.hooks.afterChildRead = async row => {
      if (!held && row?.snapshot.status === 'pending') {held = true; await gate.promise;}
    };
    else f.hooks.afterSave = async (row, snapshot) => {
      if (!held && row.id === PID && snapshot.status === 'pending') {held = true; await gate.promise;}
    };
    await f.api.resumeImagegen(PID); await until(() => held, point);
    await f.completeChild(); await until(() => f.child().lease_token === null && f.child().snapshot.status === 'done', 'child released'); await pump();
    assert.equal(f.parent().lease_token !== null, true, 'child notification cannot interrupt active parent');
    gate.resolve(); await drain(f); assertSucceeded(f);
  });
  await caseRun('lost wake after SQL parent release but before activity finish is rescued after finish', async () => {
    const f = fixture(), gate = deferred(); let held = false;
    f.parent().lease_until = null;
    f.hooks.beforeFinish = async a => {if (!held && a.key === `imagegen:${PID}`) {held = true; await gate.promise;}};
    await f.api.resumeImagegen(PID); await until(() => held, 'parent finish barrier');
    assert.equal(f.parent().lease_token, null); assert.equal(f.parent().lease_until, f.clock + 10000);
    await f.completeChild(); await pump(1600); assert.ok(f.metrics.activityDenied > 0, 'child wake encounters active same-key activity');
    assert.equal(f.parent().snapshot.status, 'pending'); gate.resolve(); await drain(f); assertSucceeded(f);
  });
  await caseRun('v2 ordinary empty-claim poll activity B rescues its blocked child wake', async () => {
    const f = fixture(), gate = deferred(); let held = false;
    f.hooks.beforeFinish = async a => {if (!held && a.key === `imagegen:${PID}`) {held = true; await gate.promise;}};
    await f.api.resumeImagegen(PID); await until(() => held, 'B empty claim finish barrier');
    assert.ok(f.trace.some(e => e.type === 'claim-empty' && e.id === PID));
    await f.completeChild(); await pump(1600); assert.ok(f.metrics.activityDenied > 0);
    assert.equal(f.parent().snapshot.status, 'pending'); gate.resolve(); await drain(f); assertSucceeded(f);
    assert.equal(f.trace.filter(e => e.type === 'claim' && e.id === PID).length, 1);
  });
  await caseRun('child completes after parent pending+activity already finished', async () => {
    const f = fixture(); f.parent().lease_until = null; await f.api.resumeImagegen(PID); await drain(f);
    assert.equal(f.parent().snapshot.status, 'pending'); await f.completeChild(); await drain(f); assertSucceeded(f);
  });
  await caseRun('reentrant same-parent concurrent notifications are idempotent', async () => {
    const f = fixture(); f.child().snapshot = {...f.child().snapshot, status: 'done', images: [{id: ART}]};
    await Promise.all(Array.from({length: 8}, () => f.notify())); await drain(f); assertSucceeded(f);
    assert.equal(f.trace.filter(e => e.type === 'claim' && e.id === PID).length, 1);
    assert.equal([...f.events.values()].filter(e => e.creation_id === 'creation-parent' && e.status === 'succeeded').length, 1);
    const claims = f.metrics.claims; await f.notify(); await f.notify(PID, 'imagegen'); await drain(f); assert.equal(f.metrics.claims, claims);
  });
  await caseRun('notification DB failure cannot reverse done child or existing settlement', async () => {
    const f = fixture(); f.hooks.notifyError = true; await f.completeChild(); await drain(f);
    assert.equal(f.child().snapshot.status, 'done'); assert.equal(f.child().billing_settled, true);
    assert.equal(f.parent().snapshot.status, 'pending'); assert.equal(f.creations.get('creation-parent').status, 'queued');
    assert.ok(f.logs.some(s => s.includes('[image-job-cleanup] stage=parent-notify')));
    assert.ok(f.logs.every(s => !s.includes('DO_NOT_LOG_SECRET')), 'notification failure logs fixed text, not raw DB error');
  });
  await caseRun('snapshot CAS rejects changed snapshot or newly acquired lease', async () => {
    for (const mutation of ['snapshot', 'lease']) {
      const f = fixture(); f.child().snapshot = {...f.child().snapshot, status: 'done', images: [{id: ART}]};
      f.hooks.beforeCooldownCAS = async () => {
        if (mutation === 'snapshot') f.parent().snapshot.concurrentMarker = 'new-state';
        else {f.parent().lease_token = 'new-owner'; f.parent().lease_until = f.clock + 120000;}
      };
      await f.notify(); assert.equal(f.metrics.cooldownClears, 0); assert.equal(f.metrics.claims, 0);
      if (mutation === 'lease') assert.equal(f.parent().lease_token, 'new-owner'); f.assertZeroPaid();
    }
  });
  await caseRun('pre-execution release binding failure releases only owned job lease without executing or clearing UNKNOWN', async () => {
    for (const replaceLease of [false, true]) {
      const f = fixture(); f.parent().lease_until = null;
      f.hooks.beforeBind = async (_id, key) => {
        if (key !== `imagegen:${PID}`) return;
        if (replaceLease) {f.parent().lease_token = 'another-executor'; f.parent().lease_until = f.clock + 120000;}
        throw new Error('timeout exceeded when trying to connect');
      };
      await f.api.resumeImagegen(PID); await drain(f);
      assert.equal(f.parent().snapshot.status, 'pending');
      assert.equal(f.parent().lease_token, replaceLease ? 'another-executor' : null);
      assert.equal(f.metrics.fixtureProducerCalls || 0, 0);
      assert.equal(f.metrics.notificationReads || 0, 0);
      assert([...f.activities.values()].some(a => a.state === 'unknown'));
      assert(f.logs.some(line => line.includes('stage=action code=PG_POOL_TIMEOUT')));
      const claims = f.metrics.claims; await f.api.resumeImagegen(PID); await drain(f); assert.equal(f.metrics.claims, claims);
      f.assertZeroPaid();
    }
  });
  await caseRun('parent execution catch plus failed error persistence does not self-hot-loop', async () => {
    const f = fixture(); f.parent().lease_until = null; f.child().snapshot.status = 'done';
    f.hooks.beforeJobRead = async id => {if (id === PID && f.parent().lease_token) throw new Error('FIXTURE_PARENT_DB_FAILURE');};
    await f.api.resumeImagegen(PID); await drain(f);
    assert.equal(f.metrics.notificationReads, 0); assert.equal(f.metrics.activityBegins, 1);
    assert.equal(f.parent().snapshot.status, 'pending'); assert.equal(f.parent().lease_token, null);
  });
  await caseRun('generate catch still notifies only its actual persisted terminal result', async () => {
    const f = fixture(); await f.completeChild('error', {throwAfter: true}); await drain(f);
    assert.equal(f.parent().snapshot.result.status, 'failed'); assert.ok(f.metrics.notificationReads > 0);
    assert.equal(f.child().snapshot.failureDiagnostic?.version,1,'actual Durable catch persists bounded diagnostic');
    assert.equal(f.child().snapshot.failureDiagnostic?.stage,'execute');
  });
  await caseRun('real readImagegenReceipt remains strictly read-only', async () => {
    const f = fixture(); const before = JSON.stringify([...f.rows]);
    const counts = JSON.stringify(f.metrics); const sqlAt = f.sql.length;
    const receipt = await f.api.readImagegenReceipt(OP, OWNER); assert.equal(receipt.status, 'queued');
    assert.equal(JSON.stringify([...f.rows]), before); assert.equal(JSON.stringify(f.metrics), counts);
    assert.ok(f.sql.slice(sqlAt).every(q => q.sql.startsWith('SELECT')));
    await f.completeChild(); await drain(f); assertSucceeded(f);
    const done = JSON.stringify([...f.rows]), claims = f.metrics.claims, writesAt = f.sql.length;
    assert.equal((await f.api.readImagegenReceipt(OP, OWNER)).status, 'succeeded');
    assert.equal(JSON.stringify([...f.rows]), done); assert.equal(f.metrics.claims, claims);
    assert.ok(f.sql.slice(writesAt).every(q => q.sql.startsWith('SELECT'))); f.assertZeroPaid();
  });
  await caseRun('finishActivity DB barrier, failure and settled-hook exception preserve exact semantics', async () => {
    const f = fixture(), gate = deferred(); let finishing = false, settled = 0;
    f.hooks.beforeFinish = async () => {finishing = true; await gate.promise;};
    await f.background.detachBackgroundActivity('durable-image', 'wrapper:finish-order', 'claim', async () => {}, async () => {
      settled++; assert.equal([...f.activities.values()][0].state, 'finished'); throw new Error('FIXTURE_SETTLED_HOOK_ERROR');
    });
    await until(() => finishing, 'wrapper finish DB barrier'); assert.equal(settled, 0); gate.resolve(); await drain(f);
    assert.equal(settled, 1); assert.equal([...f.activities.values()][0].state, 'finished');
    const g = fixture(); let called = 0; g.hooks.finishError = () => true;
    await g.background.detachBackgroundActivity('durable-image', 'wrapper:unknown', 'claim', async () => {}, async () => {called++;});
    await drain(g); assert.equal(called, 0); assert.equal([...g.activities.values()][0].state, 'unknown');
    assert.equal(await g.background.detachBackgroundActivity('durable-image', 'wrapper:unknown', 'claim', async () => {throw new Error('MUST_NOT_RUN');}), false);
    assert.equal(called, 0);
  });
  await caseRun('unknown same-key parent activity remains blocking and grants no paid work', async () => {
    const f = fixture(); f.activities.set('existing-unknown', {id: 'existing-unknown', scope: 'durable-image', key: `imagegen:${PID}`, state: 'unknown'});
    await f.completeChild(); await drain(f); assert.equal(f.parent().snapshot.status, 'pending');
    assert.equal(f.activities.get('existing-unknown').state, 'unknown'); assert.equal(f.trace.filter(e => e.type === 'claim' && e.id === PID).length, 0);
  });
  await caseRun('v2 capacity full empty claim stays bounded under runtime and no-runtime', async () => {
    for (const runtime of [true, false]) {
      const f = fixture({runtime}); f.capacity = 0; f.child().snapshot = {...f.child().snapshot, status: 'done', images: [{id: ART}]};
      f.parent().lease_until = null; await f.api.resumeImagegen(PID); await drain(f);
      assert.equal(f.parent().snapshot.status, 'pending'); assert.equal(f.metrics.claims, 0);
      assert.equal(f.metrics.notificationReads, 1, 'ordinary poll one recheck; notify-origin empty claim no recursive recheck');
      assert.equal(f.metrics.claimAttempts, 2); assert.equal(f.metrics.activityBegins, runtime ? 2 : 0);
    }
  });
  await caseRun('no-runtime durable continuation preserves completion and no-runtime settled-hook order', async () => {
    const f = fixture({runtime: false}); await f.completeChild(); await drain(f); assertSucceeded(f);
    assert.equal(f.metrics.activityBegins, 0);
    const order = [];
    await f.background.detachBackgroundActivity('durable-image', 'fallback', 'claim', async () => {order.push('action');}, async () => {order.push('settled');});
    await pump(); assert.deepEqual(order, ['action', 'settled']);
  });
  return reports.some(r => r.status === 'FAIL') ? 'FAIL' : 'PASS';
}

(async () => {
  let status = 'HARNESS_ERROR', exitStatus = 2, fatal;
  try {status = baseline ? await baselineRun() : await modifiedRun(); exitStatus = baseline ? 1 : status === 'PASS' ? 0 : 1;}
  catch (error) {fatal = {name: error.name, message: error.message, stack: error.stack}; console.error(error.stack || error);}
  const totals = fixtures.reduce((sum, f) => {for (const [k, v] of Object.entries(f.metrics)) sum[k] = (sum[k] || 0) + v; return sum;}, {});
  const stdout = `IMAGEGEN_PARENT_COMPLETION=${status} CASES=${reports.length} FAILED=${reports.filter(r => r.status === 'FAIL').length} SUPPLIER_POST=${totals.supplierPosts || 0} SETTLE_CALLS=${totals.settleCalls || 0} NETWORK=${totals.network || 0} EXIT=${exitStatus}`;
  const report = {status, exitStatus, mode: baseline ? 'BASELINE' : 'MODIFIED', argv: process.argv.slice(1),
    sourceRoot, outputRoot, baselineReference: baseline ? beforeRoot : null,
    stdout, script: {path: __filename, sha256: hash(fs.readFileSync(__filename))},
    loadedModules: [...loaded.values()].sort((a, b) => a.relative.localeCompare(b.relative)),
    boundaries: {wholeModuleTypeScriptTranspile: true, actualDurableImageJobs: true, actualDispatchRunParent: true,
      actualBackgroundWrapper: true, actualRepositoryClaimSaveRelease: true, actualCreationWriter: true,
      externalSQL: 'deterministic in-memory query fixture, not PostgreSQL execution',
      releaseStore: 'active/finished/unknown boundary fixture; actual wrapper and ALS execute',
      media: 'owned saved-artwork bytes/pixels fixture', paidWork: 'generate/adapters/supplier entry throw sentinel',
      production: 'not accessed', network: 'no network imports; VM fetch throws; host only fs/ts/crypto/async_hooks/zod',
      fixtureChildProducer: 'writes terminal snapshot only through actual DurableImageJobs.set/repository.save; no generation or settlement'},
    totals, cases: reports, ...(fatal ? {fatal} : {})};
  fs.mkdirSync(outputRoot, {recursive: true});
  const file = path.join(outputRoot, baseline ? 'BASELINE.json' : 'MODIFIED.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, status, 'report reopened');
  console.log(stdout); console.log(`REPORT=${file}`); process.exitCode = exitStatus;
})().catch(error => {console.error(error.stack || error); process.exitCode = 2;});
