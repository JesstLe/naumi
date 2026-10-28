#!/usr/bin/env node
'use strict';

// Deferred integration verification. Uses an existing, explicitly isolated,
// loopback PostgreSQL database; never creates a database, schema, or supplier job.
// CLI: NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgresql://... node scripts/verify-video-coordination-pool.cjs
// API: await require('./scripts/verify-video-coordination-pool.cjs').run({ connectionString });
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const ts = require('typescript');
const pg = require('pg');

const ROOT = path.resolve(__dirname, '..');
const SLOT = Symbol.for('naumi.video.coordination.pg.v1');
const SLOTS = Symbol.for('naumi.video.coordination.slots.v1');
const TRY = 'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired';
const UNLOCK = 'SELECT pg_advisory_unlock(hashtextextended($1,0))';
const MEDIA_UPDATE = 'UPDATE app_video_media_jobs SET status=$2,processed_seconds=$3,updated_at=now() WHERE id=$1';
const RUN_SELECT = 'SELECT * FROM app_video_workflow_runs WHERE id=$1';
const NODES_SELECT = 'SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1';
const RUN_UPDATE = 'UPDATE app_video_workflow_runs SET updated_at=now() WHERE id=$1';
const CASE_MS = 12000;

class VerificationError extends Error {}
function check(value, message) { if (!value) throw new VerificationError(message); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new VerificationError(`timeout: ${label}`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function until(predicate, label) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    check(Date.now() < deadline, `timeout: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function failure(error) {
  // Never render a driver error, connection string, credentials, or a stack.
  if (error instanceof VerificationError) return error.message;
  const code = String(error && (error.code || error.name) || 'UNKNOWN');
  return `unexpected ${/^[A-Za-z0-9_]+$/.test(code) ? code : 'ERROR'}`;
}
function connection(input) {
  check(process.env.NAUMI_VERIFY_ISOLATED_DB === '1', 'set NAUMI_VERIFY_ISOLATED_DB=1 for an independent fixture database');
  let url;
  try { url = new URL(input || process.env.DATABASE_URL || ''); }
  catch { throw new VerificationError('DATABASE_URL must be an explicit loopback PostgreSQL URL'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  check(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  check(host === 'localhost' || host === '::1' || net.isIP(host) === 4 && host.split('.')[0] === '127', 'database host must be loopback');
  check(url.pathname.length > 1 && !['/postgres', '/template0', '/template1'].includes(url.pathname), 'use an independent named fixture database');
  check(!url.hash, 'URL fragments are not accepted');
  for (const [key, value] of url.searchParams) {
    check(key === 'sslmode' && value === 'disable', 'URL query parameters may only set sslmode=disable');
  }
  return url.toString();
}
function transpile(source, filename) {
  return ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
}
function execute(source, filename, locals, imports = {}) {
  const module = { exports: {} };
  const context = vm.createContext({
    ...locals, module, exports: module.exports, Error, console,
    require(name) {
      check(Object.prototype.hasOwnProperty.call(imports, name), 'unexpected dependency requested by isolated source');
      return imports[name];
    },
  });
  new vm.Script(source, { filename }).runInContext(context, { timeout: 1500 });
  return module.exports;
}

// Extract the original declaration verbatim. Only a separate export statement
// is appended; the function AST, statements, SQL, keys and finally are unchanged.
function callsite(filename, name, prefix, parameter) {
  const text = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  check(source.parseDiagnostics.length === 0, `${name}: source parse failed`);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  check(fn && fn.body, `${name}: original function missing`);
  const imported = source.statements.some(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === './coordination-pool'
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some(entry => entry.name.text === 'acquireVideoCoordinationLock'
      && (!entry.propertyName || entry.propertyName.text === 'acquireVideoCoordinationLock')));
  check(imported, `${name}: coordination helper import missing`);
  const acquisitions = [], tries = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'acquireVideoCoordinationLock') acquisitions.push(node);
      check(!(ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'connect'), `${name}: direct connection remains`);
    }
    if (ts.isStringLiteralLike(node)) {
      check(!node.text.includes('pg_try_advisory_lock') && !node.text.includes('pg_advisory_unlock'), `${name}: direct session lock SQL remains`);
    }
    if (ts.isTryStatement(node)) tries.push(node);
    ts.forEachChild(node, visit);
  }
  visit(fn);
  check(acquisitions.length === 1, `${name}: expected exactly one helper acquisition`);
  const acquisition = acquisitions[0], key = acquisition.arguments[0];
  check(acquisition.arguments.length === 1 && ts.isTemplateExpression(key)
    && key.head.text === prefix && key.templateSpans.length === 1
    && ts.isIdentifier(key.templateSpans[0].expression) && key.templateSpans[0].expression.text === parameter
    && key.templateSpans[0].literal.text === '', `${name}: advisory key changed`);
  check(ts.isAwaitExpression(acquisition.parent) && ts.isVariableDeclaration(acquisition.parent.parent)
    && acquisition.parent.parent.name.getText(source) === 'lock', `${name}: helper acquisition must be awaited as lock`);
  const owner = tries.find(node => node.parent === fn.body && node.finallyBlock);
  const final = owner?.finallyBlock?.statements;
  check(final?.length === 1 && ts.isExpressionStatement(final[0]) && ts.isAwaitExpression(final[0].expression), `${name}: awaited finally release missing`);
  const release = final[0].expression.expression;
  check(ts.isCallExpression(release) && release.arguments.length === 0 && ts.isPropertyAccessExpression(release.expression)
    && release.expression.expression.getText(source) === 'lock' && release.expression.name.text === 'release', `${name}: finally must release the acquired lock`);
  return { name, code: transpile(`${fn.getText(source)}\nexport { ${name} };\n`, filename) };
}

function resources(connectionString) {
  const pools = new Set(), patches = new Set(), gates = new Set(), tasks = new Set();
  const options = { connectionString, max: 5, min: 0, ssl: false,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, query_timeout: 5000, statement_timeout: 5000 };
  const business = new pg.Pool(options);
  business.on('error', () => {});
  pools.add(business);
  const helperSource = transpile(fs.readFileSync(path.join(ROOT, 'src/lib/video/coordination-pool.ts'), 'utf8'), 'coordination-pool.ts');
  function load(runtime = {}) {
    const control = { fault: null, events: [], active: new Set() };
    class ObservedPool extends pg.Pool {
      constructor(config) { super(config); pools.add(this); }
      connect(callback) {
        if (callback) return super.connect(callback);
        const fault = control.fault;
        control.fault = null;
        control.events.push({ kind: 'connect', slots: this[SLOTS] || 0 });
        if (fault === 'connect-reject') {
          control.events.push({ kind: 'connect-reject' });
          return Promise.reject(new VerificationError('injected pre-client checkout rejection'));
        }
        return super.connect().then(client => {
          const query = client.query, release = client.release;
          let restored = false;
          function restore() {
            if (restored) return;
            restored = true;
            client.query = query;
            client.release = release;
            control.active.delete(client);
            patches.delete(restore);
          }
          patches.add(restore);
          control.active.add(client);
          client.query = async function (sql, values) {
            check(sql === TRY || sql === UNLOCK, 'helper issued unexpected coordination SQL');
            control.events.push({ kind: sql === TRY ? 'try' : 'unlock', pid: client.processID });
            if (sql === UNLOCK && fault === 'unlock-reject') throw new VerificationError('injected unlock rejection');
            if (sql === UNLOCK && fault === 'unlock-false') {
              check((await query.call(client, sql, values)).rows[0].pg_advisory_unlock === true, 'false-unlock precondition failed');
            }
            const result = await query.call(client, sql, values);
            if (sql === TRY && fault === 'acquire-ack-error') throw new VerificationError('injected acquisition acknowledgement error');
            if (sql === TRY && fault === 'malformed-ack') return { ...result, rows: [{ acquired: null }] };
            if (sql === TRY && fault === 'client-error') client.emit('error', new Error('injected client error'));
            return result;
          };
          client.release = function (discard) {
            control.events.push({ kind: 'release', discard: discard === true, pid: client.processID });
            restore();
            return release.call(client, discard);
          };
          return client;
        });
      }
    }
    const api = execute(helperSource, 'real-video-coordination-pool.cjs', {}, {
      'server-only': {}, 'node:process': runtime, pg: { Pool: ObservedPool }, '../db': { getPool: () => business },
    });
    return { ...api, control, runtime };
  }
  function track(promise) {
    tasks.add(promise);
    promise.catch(() => {}).finally(() => tasks.delete(promise));
    return promise;
  }
  function gate() { const entry = deferred(); gates.add(entry); return entry; }
  async function cleanup() {
    for (const entry of gates) entry.resolve();
    await bounded(Promise.allSettled([...tasks]), 1500, 'pending callsite cleanup').catch(() => {});
    for (const restore of [...patches]) restore();
    // Also close checked-out clients on failure; pool.end alone would wait forever.
    await bounded(Promise.allSettled([...pools].flatMap(pool => (pool._clients || []).map(client => client.end()))), 2000, 'socket cleanup').catch(() => {});
    await bounded(Promise.allSettled([...pools].map(pool => pool.end())), 2000, 'pool cleanup').catch(() => {});
  }
  return { business, load, track, gate, cleanup };
}

function runner(definition, helper, business, onHeld = async () => {}) {
  const stats = { reads: 0, updates: 0, finalViews: 0, creationUpdates: 0, claims: 0 };
  const actor = 'coordination-fixture@example.invalid';
  const forbidden = () => { throw new VerificationError('unexpected supplier, billing, schema or nonempty workflow branch'); };
  const read = async () => { check((await business.query('SELECT 1 AS ok')).rows[0].ok === 1, 'ordinary business SELECT failed'); stats.reads++; };
  class MediaWorkerError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class ModelConfigError extends Error {}
  const locals = {
    acquireVideoCoordinationLock: helper.acquireVideoCoordinationLock,
    MediaWorkerError, ModelConfigError, BillingError: class BillingError extends Error {},
    cleanupMediaJob: forbidden, finishMediaJobFailure: forbidden, publish: forbidden,
    dispatch: forbidden, withBackgroundActivity: forbidden, createVideoGeneration: forbidden,
    getVideoTask: forbidden, getVideoTaskByIdempotencyKey: forbidden, dependencyReference: forbidden,
    getVideoNode: forbidden, decryptAtRest: forbidden, runWorkflowCreation: forbidden,
    withFrozenWorkflowStage: forbidden, operationId: forbidden,
  };
  if (definition.name === 'getMediaJobLocal') {
    const row = id => ({ id, email: actor, status: 'processing', cancellation_requested_at: null });
    Object.assign(locals, {
      getRow: async (email, id) => { check(email === actor, 'media owner changed'); await read(); return row(id); },
      publicMediaJob: value => { stats.finalViews++; return { id: value.id, status: value.status }; },
      mediaWorkerRequest: async (id, method) => {
        check(method === 'GET', 'media test attempted a mutating worker request');
        await onHeld(id);
        return { status: 'processing', processedSeconds: 0 };
      },
      getPool: () => ({ query: async (sql, values) => {
        check(sql === MEDIA_UPDATE && values[1] === 'processing', 'media business SQL changed or unexpected branch');
        await read(); stats.updates++; return { rows: [], rowCount: 1 };
      } }),
    });
  } else {
    Object.assign(locals, {
      ensureWorkflowSchema: async () => {},
      getPool: () => ({ query: async (sql, values) => {
        check([RUN_SELECT, NODES_SELECT, RUN_UPDATE].includes(sql), 'workflow business SQL changed or unexpected branch');
        await read();
        if (sql === RUN_SELECT) return { rows: [{ id: values[0], email: actor, plan: { nodes: [] }, creation_scope: null, frozen_nodes_enc: null, cancellation_requested_at: null }] };
        if (sql === RUN_UPDATE) stats.updates++;
        return { rows: [], rowCount: sql === RUN_UPDATE ? 1 : 0 };
      } }),
      bindBackgroundClaim: async id => { stats.claims++; await onHeld(id); },
      assertWorkflowCreationScope: scope => { check(scope === null, 'workflow scope fixture changed'); return null; },
      creationTransaction: async callback => callback({}),
      updateWorkflowCreationTx: async () => { stats.creationUpdates++; },
      getVideoWorkflow: async (email, id) => { check(email === actor, 'workflow owner changed'); stats.finalViews++; return { id, nodes: [] }; },
    });
  }
  const fn = execute(definition.code, `${definition.name}.actual.cjs`, locals)[definition.name];
  return { stats, call: id => definition.name === 'getMediaJobLocal' ? fn(actor, id, true) : fn(id, actor) };
}

async function ordinaryReads(business) {
  const rows = await bounded(Promise.all(Array.from({ length: 5 }, () => business.query('SELECT 1 AS ok'))), 3000, 'five ordinary max=5 reads');
  check(rows.every(result => result.rows[0].ok === 1), 'ordinary pool reads failed while locks held');
  check(business.options.max === 5 && business.waitingCount === 0, 'ordinary pool capacity changed');
}
async function sameRuntime(definition, helper, env, prefix) {
  const held = [], ready = new Map(), completed = new Set();
  const duplicateBundle = env.load(helper.runtime);
  let entry = 0;
  const sharedBundles = { acquireVideoCoordinationLock: key =>
    (entry++ % 2 ? duplicateBundle : helper).acquireVideoCoordinationLock(key) };
  const before = helper.control.events.length;
  const harness = runner(definition, sharedBundles, env.business, async id => {
    held.push(id); await ready.get(id).promise;
  });
  const calls = Array.from({ length: 5 }, (_, index) => {
    const id = `${prefix}-${index}`;
    ready.set(id, env.gate());
    return env.track(harness.call(id).then(result => { completed.add(id); return result; }));
  });
  const pool = helper.getVideoCoordinationPool();
  await until(() => held.length === 2 && completed.size === 3, 'two held and three read-only calls finished');
  const retryIds = [...completed];
  check(duplicateBundle.getVideoCoordinationPool() === pool && pool[SLOTS] === 2, 'bundled callers did not share both synchronous reservations');
  check(pool.totalCount === 2 && pool.idleCount === 0 && pool.waitingCount === 0, 'busy same-runtime calls queued or exceeded two clients');
  check(harness.stats.updates === 0 && harness.stats.finalViews === 3 && held.length === 2, 'busy calls entered the body or failed to return read-only views');
  check(helper.control.events.slice(before).filter(event => event.kind === 'connect').length === 2,
    'busy calls attempted a coordination checkout');
  await ordinaryReads(env.business);
  held.forEach(id => ready.get(id).resolve());
  await bounded(Promise.all(calls), 5000, 'five same-runtime calls finish');
  check(harness.stats.updates === 2 && harness.stats.finalViews === 5 && pool[SLOTS] === 0,
    'initial batch did not finish with two bodies and five views');
  for (const id of retryIds) {
    ready.get(id).resolve();
    await bounded(harness.call(id), 3000, 'read-only call retry');
  }
  check(pool.totalCount === 2 && pool.idleCount === 2 && pool.waitingCount === 0
    && pool[SLOTS] === 0 && helper.control.active.size === 0, 'same-runtime slot or connection leaked');
  check(harness.stats.updates === 5 && harness.stats.finalViews === 8 && held.length === 5,
    'three read-only retries did not produce five total updates and eight views');
  if (definition.name === 'resumeVideoWorkflowLocal') check(harness.stats.creationUpdates === 5, 'empty-node workflow did not reach final creation update');
}
async function independentRuntimes(definition, env, prefix) {
  const held = [], gate = env.gate();
  const helpers = Array.from({ length: 5 }, () => env.load({}));
  const calls = helpers.map((helper, index) => {
    const harness = runner(definition, helper, env.business, async id => { held.push(id); await gate.promise; });
    return env.track(harness.call(`${prefix}-${index}`));
  });
  await until(() => held.length === 5, 'five independent coordination pools held');
  check(new Set(helpers.map(helper => helper.getVideoCoordinationPool())).size === 5, 'independent runtimes reused one pool');
  check(helpers.every(helper => helper.getVideoCoordinationPool().idleCount === 0
    && helper.getVideoCoordinationPool()[SLOTS] === 1), 'independent pool barrier not holding leases');
  await ordinaryReads(env.business);
  gate.resolve();
  await bounded(Promise.all(calls), 5000, 'independent-runtime callsites finish');
  check(helpers.every(helper => helper.getVideoCoordinationPool().waitingCount === 0
    && helper.getVideoCoordinationPool()[SLOTS] === 0 && helper.control.active.size === 0), 'independent callsite leaked a lease');
}

async function faults(definitions, helper, env, prefix) {
  const observer = env.load({});
  const pool = helper.getVideoCoordinationPool();
  async function free(key) {
    await until(() => helper.control.active.size === 0, 'fault lease returned');
    check(pool[SLOTS] === 0, 'fault path leaked a synchronous reservation');
    const lock = await observer.acquireVideoCoordinationLock(key);
    check(lock.acquired, 'discarded connection retained a real advisory lock');
    await lock.release();
  }
  {
    const before = helper.control.events.length;
    helper.control.fault = 'connect-reject';
    let failure;
    try { await helper.acquireVideoCoordinationLock(`${prefix}:connect-reject`); } catch (error) { failure = error; }
    check(failure?.name === 'VideoCoordinationCheckoutError' && failure.coordinationKey === `${prefix}:connect-reject`
      && failure.cause instanceof VerificationError && pool[SLOTS] === 0 && helper.control.active.size === 0,
      'pre-client connection rejection did not report its cause and release its slot');
    const events = helper.control.events.slice(before);
    check(events.length === 2 && events[0].kind === 'connect' && events[0].slots === 1
      && events[1].kind === 'connect-reject', 'pre-client rejection executed coordination SQL or a client release');
    check(pool[SLOTS] === 0, 'connect-rejection leaked a reservation');
  }
  for (const definition of definitions) {
    const id = `${prefix}-connect-reject-${definition.name}`;
    let bodies = 0;
    const harness = runner(definition, helper, env.business, async () => { bodies++; });
    const before = helper.control.events.length;
    helper.control.fault = 'connect-reject';
    let failure;
    try { await harness.call(id); } catch (error) { failure = error; }
    check(failure?.name === 'VideoCoordinationCheckoutError' && bodies === 0 && harness.stats.updates === 0 && harness.stats.finalViews === 0
      && harness.stats.creationUpdates === 0 && harness.stats.claims === 0,
      'actual callsite did not report a no-work checkout failure');
    const events = helper.control.events.slice(before);
    check(events.length === 2 && events[0].kind === 'connect' && events[0].slots === 1
      && events[1].kind === 'connect-reject' && pool[SLOTS] === 0 && helper.control.active.size === 0,
      'actual callsite connect-rejection leaked a slot or issued coordination SQL');
    await harness.call(id);
    check(bodies === 1 && harness.stats.updates === 1 && harness.stats.finalViews === 1 && pool[SLOTS] === 0,
      'actual callsite could not retry after pre-client connection rejection');
  }
  for (const fault of ['acquire-ack-error', 'malformed-ack', 'unlock-reject', 'unlock-false', 'client-error']) {
    const key = `${prefix}:${fault}`, before = helper.control.events.length;
    helper.control.fault = fault;
    if (fault === 'acquire-ack-error' || fault === 'malformed-ack') {
      let rejected = false;
      try { await helper.acquireVideoCoordinationLock(key); } catch { rejected = true; }
      check(rejected, `${fault}: acquisition did not reject`);
    } else {
      const lock = await helper.acquireVideoCoordinationLock(key);
      check(lock.acquired, `${fault}: setup acquisition failed`);
      await lock.release(); await lock.release();
    }
    const releases = helper.control.events.slice(before).filter(event => event.kind === 'release');
    check(releases.length === 1 && releases[0].discard, `${fault}: expected exactly one discarded client`);
    await free(key);
  }
  for (const definition of definitions) {
    const marker = new VerificationError('injected business failure');
    const id = `${prefix}-${definition.name}`;
    const harness = runner(definition, helper, env.business, async () => { throw marker; });
    for (let repeat = 0; repeat < 2; repeat++) {
      let caught;
      // Combine a caller failure with an unlock rejection on the first entry.
      helper.control.fault = repeat === 0 ? 'unlock-reject' : null;
      try { await harness.call(id); } catch (error) { caught = error; }
      check(caught === marker, 'unlock failure replaced the actual callsite business error');
      await free(`${definition.name === 'getMediaJobLocal' ? 'media-job:' : 'video-workflow:'}${id}`);
    }
  }
  const before = helper.control.events.length;
  const lock = await helper.acquireVideoCoordinationLock(`${prefix}:duplicate`);
  check(lock.acquired, 'duplicate-release setup failed');
  await Promise.all([lock.release(), lock.release(), lock.release()]);
  const events = helper.control.events.slice(before);
  check(events.filter(event => event.kind === 'unlock').length === 1 && events.filter(event => event.kind === 'release').length === 1, 'duplicate release issued multiple unlocks or returns');
  check(events.find(event => event.kind === 'release').discard === false, 'normal release discarded a healthy connection');
  check(pool[SLOTS] === 0 && helper.control.active.size === 0, 'duplicate release leaked or over-released a slot');
}

function startChild(connectionString) {
  const child = spawn(process.execPath, [__filename, '--coordination-child'], {
    env: { ...process.env, DATABASE_URL: connectionString, NAUMI_VERIFY_ISOLATED_DB: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  child.stdout.resume(); child.stderr.resume();
  const ready = deferred(), exited = deferred(), pending = new Map();
  let sequence = 0;
  child.on('message', message => {
    if (message?.ready) return ready.resolve();
    const request = pending.get(message?.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new VerificationError(`child: ${message.error}`));
    else request.resolve(message.value);
  });
  child.on('error', () => ready.reject(new VerificationError('child process start failed')));
  child.on('exit', code => {
    exited.resolve(code);
    ready.reject(new VerificationError('child exited before ready'));
    for (const request of pending.values()) request.reject(new VerificationError('child exited during request'));
    pending.clear();
  });
  async function request(op, payload = {}) {
    const id = ++sequence, entry = deferred(); pending.set(id, entry);
    child.send({ id, op, ...payload }, error => { if (error) entry.reject(new VerificationError('child IPC send failed')); });
    try { return await bounded(entry.promise, 7000, `child ${op}`); }
    finally { pending.delete(id); }
  }
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await bounded(exited.promise, 2500, 'child termination').catch(() => { child.kill('SIGKILL'); });
  }
  return { ready: ready.promise, exited: exited.promise, request, stop };
}
async function crossProcess(helper, env, connectionString, prefix) {
  const child = startChild(connectionString);
  let owner;
  try {
    await bounded(child.ready, 7000, 'child startup');
    owner = await helper.acquireVideoCoordinationLock(`${prefix}:shared`);
    check(owner.acquired, 'parent did not acquire shared key');
    const denied = await child.request('hold', { lease: 'denied', key: `${prefix}:shared` });
    check(!denied.acquired && denied.idle === 1 && denied.slots === 0 && denied.tries === 1,
      'cross-process failed try did not return its connection and slot');
    check((await child.request('hold', { lease: 'one', key: `${prefix}:one` })).acquired, 'independent child key one failed');
    check((await child.request('hold', { lease: 'two', key: `${prefix}:two` })).acquired, 'independent child key two failed');
    const beforeBusy = await child.request('stats');
    const busy = await bounded(child.request('hold', { lease: 'busy', key: `${prefix}:shared` }), 2000, 'child busy result without checkout');
    check(!busy.acquired && busy.slots === 2 && busy.total === 2 && busy.waiting === 0
      && busy.connects === beforeBusy.connects && busy.tries === beforeBusy.tries,
      'busy child acquisition queued, attempted a checkout or issued try-lock SQL');
    check(await child.request('read') === 1, 'child ordinary business SELECT blocked behind coordination pool');
    await ordinaryReads(env.business);
    await child.request('release', { lease: 'one' });
    const deniedRetry = await child.request('hold', { lease: 'busy-retry', key: `${prefix}:shared` });
    check(!deniedRetry.acquired && deniedRetry.idle === 1 && deniedRetry.waiting === 0
      && deniedRetry.slots === 1 && deniedRetry.tries === busy.tries + 1,
      'retry after a slot opened did not execute and release a real denied try-lock');
    check((await child.request('hold', { lease: 'retry-free', key: `${prefix}:retry-free` })).acquired,
      'child could not acquire an independent key after a slot opened');
    await child.request('release', { lease: 'retry-free' });
    await child.request('release', { lease: 'two' });
    await owner.release(); owner = null;
    check((await child.request('hold', { lease: 'owner', key: `${prefix}:shared` })).acquired, 'child failed to acquire after parent release');
    const reverse = await helper.acquireVideoCoordinationLock(`${prefix}:shared`);
    check(!reverse.acquired, 'parent entered a child-held critical section');
    await reverse.release();
    await child.request('release', { lease: 'owner' });
    const again = await helper.acquireVideoCoordinationLock(`${prefix}:shared`);
    check(again.acquired, 'shared key was not reusable after cross-process release');
    await again.release();
    await child.request('quit');
    check(await bounded(child.exited, 5000, 'clean child exit') === 0, 'child did not exit cleanly');
  } finally { if (owner) await owner.release(); await child.stop(); }
}

async function childMain() {
  const env = resources(connection());
  const helper = env.load(process), leases = new Map();
  const watchdog = setTimeout(() => process.exit(2), 45000);
  let closing = false;
  const stats = () => {
    const pool = helper.getVideoCoordinationPool();
    return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, slots: pool[SLOTS] || 0,
      connects: helper.control.events.filter(event => event.kind === 'connect').length,
      tries: helper.control.events.filter(event => event.kind === 'try').length };
  };
  async function close() {
    if (closing) return;
    closing = true;
    for (const lock of leases.values()) await lock.release();
    leases.clear(); await env.cleanup(); delete process[SLOT]; clearTimeout(watchdog);
  }
  process.on('disconnect', () => { close().finally(() => process.exit(0)); });
  process.on('message', message => {
    (async () => {
      check(!closing, 'child is closing');
      let value;
      if (message.op === 'hold') {
        check(!leases.has(message.lease), 'duplicate child lease');
        const lock = await helper.acquireVideoCoordinationLock(message.key);
        if (lock.acquired) leases.set(message.lease, lock); else await lock.release();
        value = { acquired: lock.acquired, ...stats() };
      } else if (message.op === 'release') {
        check(leases.has(message.lease), 'unknown child lease');
        await leases.get(message.lease).release(); leases.delete(message.lease); value = stats();
      } else if (message.op === 'stats') value = stats();
      else if (message.op === 'read') value = (await env.business.query('SELECT 1 AS ok')).rows[0].ok;
      else if (message.op === 'quit') { await close(); value = true; }
      else throw new VerificationError('unknown child operation');
      if (process.connected) process.send({ id: message.id, value }, () => { if (message.op === 'quit') process.disconnect(); });
    })().catch(error => { if (process.connected) process.send({ id: message.id, error: failure(error) }); });
  });
  process.send({ ready: true });
}

async function run({ connectionString } = {}) {
  const url = connection(connectionString);
  check(!process[SLOT], 'run verification in a fresh process without an existing video coordination singleton');
  const definitions = [
    callsite('src/lib/video/media-jobs.ts', 'getMediaJobLocal', 'media-job:', 'id'),
    callsite('src/lib/video/workflow.ts', 'resumeVideoWorkflowLocal', 'video-workflow:', 'runId'),
  ];
  const env = resources(url), passed = [], prefix = `video-coordination-${randomUUID()}`;
  let primary, stage = 'database isolation';
  async function step(label, body) {
    stage = label; await bounded(Promise.resolve().then(body), CASE_MS, label);
    passed.push(label); console.log(`PASS ${label}`);
  }
  try {
    await bounded((async () => {
      await step('explicit isolated loopback DB; no application tables or DDL', async () => {
        const row = (await env.business.query("SELECT to_regclass('public.app_users') AS users, to_regclass('public.app_video_media_jobs') AS media, to_regclass('public.app_video_workflow_runs') AS workflow")).rows[0];
        check(!row.users && !row.media && !row.workflow, 'fixture database contains application tables');
        const clients = await Promise.all(Array.from({ length: 5 }, () => env.business.connect()));
        try { check(new Set(clients.map(client => client.processID)).size === 5, 'ordinary pool did not supply five independent connections'); }
        finally { clients.forEach(client => client.release()); }
      });
      await step('AST: actual callsite keys, awaited finally release, no direct ordinary lock connection', async () => {
        primary = env.load(process);
        const duplicateBundle = env.load(process), pool = primary.getVideoCoordinationPool();
        check(pool === duplicateBundle.getVideoCoordinationPool() && process[SLOT] === pool, 'separately compiled bundles did not share the process singleton');
        check(pool.options.max === 2 && pool.options.min === 0 && pool.options.connectionTimeoutMillis === 5000
          && pool.options.idleTimeoutMillis === 10000 && pool.options.query_timeout === 5000, 'coordination pool bounds changed');
        check(pool.options.password === env.business.options.password && pool.options.ssl === env.business.options.ssl, 'password or SSL options were not preserved');
      });
      for (const definition of definitions) {
        await step(`${definition.name}: same-process held2/read-only3 without queue; retry3, five updates/eight views`,
          () => sameRuntime(definition, primary, env, `${prefix}-same-${definition.name}`));
        await step(`${definition.name}: five independent real coordination pools held at barrier; ordinary max5 reads`,
          () => independentRuntimes(definition, env, `${prefix}-independent-${definition.name}`));
      }
      await step('real child process: same-key exclusion both directions, immediate busy result, retry and failed-try return',
        () => crossProcess(primary, env, url, prefix));
      await step('actual helper faults: checkout error and retry, acquire error/malformed acknowledgement throws, unlock rejection/false, client/caller error, duplicate release',
        () => faults(definitions, primary, env, prefix));
      await step('final repeat entry: both actual callsites and no coordination lease leaks', async () => {
        for (const definition of definitions) await runner(definition, primary, env.business).call(`${prefix}-final`);
        check(primary.control.active.size === 0 && primary.getVideoCoordinationPool().waitingCount === 0
          && primary.getVideoCoordinationPool()[SLOTS] === 0, 'final coordination lease or reservation leak');
        await ordinaryReads(env.business);
      });
    })(), 90000, 'complete coordination verification');
    console.log(`PASS video coordination verification (${passed.length} groups)`);
    return { passed: true, checks: passed };
  } catch (error) {
    throw new VerificationError(`${stage}: ${failure(error)}`);
  } finally {
    await env.cleanup();
    if (primary && process[SLOT] === primary.getVideoCoordinationPool()) delete process[SLOT];
  }
}

module.exports = { run };
if (require.main === module) {
  const entry = process.argv.includes('--coordination-child') ? childMain : run;
  entry().catch(error => { console.error(`FAIL video coordination verification: ${failure(error)}`); process.exitCode = 1; });
}
