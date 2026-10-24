#!/usr/bin/env node
'use strict';

/**
 * Offline SOURCE contract: real AST-selected server functions and real VM modules.
 * No DB, supplier, browser, package installation, Git, or network access is needed.
 * React scheduling below is a minimal explicit hook fixture, NOT browser acceptance.
 *
 * node scripts/verify-canvas-pricing-catalog-client.cjs
 * node scripts/verify-canvas-pricing-catalog-client.cjs --baseline
 * node scripts/verify-canvas-pricing-catalog-client.cjs --source-root C:/absolute/copy
 * node scripts/verify-canvas-pricing-catalog-client.cjs --baseline --source-root C:/absolute/restored-copy
 *
 * Default baseline reads before/. Explicit --source-root always selects THAT root,
 * including for baseline/rollback. The five changed inputs never fall back. Only
 * unchanged, allowlisted pure dependencies can fall back to this script's checkout
 * when a source root is a sparse before/ or restored copy. Baseline is SHA-pinned.
 * Test doubles exist at auth/settings/model-selection/HTTP/React boundaries; price
 * calculation, directory traversal, quote caching, submission and scope predicates
 * come from production source, not copied implementations.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const REPO = path.resolve(__dirname, '..');
const BEFORE = 'output/canvas-model-pricing-fix-20261024/before';
const FILES = {
  server: 'src/lib/billing/server.ts', route: 'src/app/api/billing/catalog/route.ts',
  client: 'src/lib/billing/client.tsx', workspace: 'src/lib/saas/workspace-client.ts',
  canvas: 'src/components/canvas/canvas-client.tsx',
};
const PIN = {
  server: 'e612203160f1e67f12d2b5047f4e4630a054c24cfd04353cd9db49af71a791a0',
  route: 'fea095a40ede53ad1b9f5040badbe7692e7e9122c20ff0e0927f88ac7803f03d',
  client: 'd234282ce88d622ae13ecf6be470e2f774b7d98fc935706dfc957e28189a3949',
  workspace: '7a7cc1b6fdade39ad228faef99b25a919fd3c04c997aa6f80ac2c2a5583a7d40',
  canvas: '94c53327debf163f0f3fa34dbe48d3eaf463bd79920ab75b7fb2e3ad9c54d2c7',
};
let groups = 0, active = 'SETUP', fixtureHTTP = 0;
const plain = value => JSON.parse(JSON.stringify(value));
const eq = assert.strictEqual, deep = (a, b) => assert.deepStrictEqual(plain(a), plain(b));
async function test(name, body) { active = name; await body(); groups++; console.log(`CASE=${name} RESULT=PASS`); }
function options() {
  let baseline = false, root, explicit = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--baseline') baseline = true;
    else if (arg === '--source-root' || arg.startsWith('--source-root=')) {
      root = arg === '--source-root' ? process.argv[++i] : arg.slice(14);
      if (!root || !path.isAbsolute(root)) throw new Error('--source-root requires an absolute path');
      root = path.resolve(root); explicit = true;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return { baseline, root: root || (baseline ? path.join(REPO, BEFORE) : REPO), explicit };
}
const opts = options();
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');
const selected = file => path.join(opts.root, file);
const changed = new Set(Object.values(FILES));
function sourceFile(file) {
  const chosen = selected(file);
  if (fs.existsSync(chosen) || changed.has(file)) return chosen;
  return path.join(REPO, file); // Pure, unchanged dependency only; see VM allowlist.
}
function ast(file) {
  const text = read(file), node = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (node.parseDiagnostics.length) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(node.parseDiagnostics[0].messageText, '\n')}`);
  return { text, node, file };
}
function find(model, predicate) {
  const result = [];
  const visit = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(model.node); return result;
}
function declaration(model, name) {
  const nodes = find(model, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  eq(nodes.length, 1, `one actual function ${name} in ${model.file}`);
  assert.ok(nodes[0].body); return nodes[0].getText(model.node);
}
function compile(text, file) {
  const result = ts.transpileModule(text, { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const error = result.diagnostics?.find(d => d.category === ts.DiagnosticCategory.Error);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return result.outputText;
}
const deny = () => { throw new Error('Unexpected dependency/network access in offline fixture'); };
const globals = () => ({ Error, TypeError, console, Request, Response, Headers, Event, EventTarget,
  TextEncoder, TextDecoder, TransformStream, FormData, Uint8Array, structuredClone, fetch: deny });
function execute(text, file, bindings = {}) {
  const exports = {}, context = vm.createContext({ ...globals(), exports, module: { exports }, require: deny, ...bindings });
  vm.runInContext(compile(text, file), context, { filename: file, timeout: 5000 });
  return { exports: context.module.exports, context };
}
const PURE = new Set(['billing/quote.ts', 'billing/types.ts', 'billing/rules/registry.ts',
  'billing/rules/evaluate.ts', 'billing/costs.ts', 'billing/money.ts', 'billing/api-cost.ts',
  'billing/canvas-defaults.ts', 'model-config/types.ts']);
const pureCache = new Map();
function pure(relative) {
  if (!PURE.has(relative)) throw new Error(`Non-allowlisted production import: ${relative}`);
  if (pureCache.has(relative)) return pureCache.get(relative);
  const file = sourceFile(`src/lib/${relative}`), exports = {};
  pureCache.set(relative, exports);
  const loaded = execute(read(file), file, { exports, module: { exports }, require: name => {
    if (!name.startsWith('.')) throw new Error(`Unexpected pure dependency: ${name}`);
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts';
    return pure(dep);
  } });
  return loaded.exports;
}
const { BillingError } = pure('billing/types.ts');
const { ModelConfigError } = pure('model-config/types.ts');
const registry = pure('billing/rules/registry.ts');
const { quote } = pure('billing/quote.ts');
const serverAST = ast(selected(FILES.server));
const clientAST = ast(selected(FILES.client));
const responseModule = execute(declaration(ast(sourceFile('src/lib/billing/access.ts')), 'billingJson'),
  'actual-billing-json.ts', { PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' } });
const { billingJson } = responseModule.exports;
const { billingErrorResponse } = execute(declaration(ast(sourceFile('src/lib/billing/request.ts')), 'billingErrorResponse'),
  'actual-billing-error-response.ts', { BillingError, ModelConfigError, billingJson }).exports;
function deferred() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
const scopeError = result => { assert.ok(result.error); assert.match(result.error.message, /创作空间已切换/); };
function snapshot() {
  const config = JSON.parse(read(sourceFile('src/lib/billing/bootstrap.json')));
  for (const feature of registry.FEATURE_IDS) {
    const tariff = config.features[feature] ||= structuredClone(config.features['image.generate']);
    tariff.enabled = true; tariff.pricing = { mode: 'fixed', credits: 7 }; tariff.rules = [];
    tariff.settlement.qualityBasis = 'requested';
  }
  config.switches.metering = 'on'; config.switches.commerce = true; config.switches.recharge = true;
  return { version: 73, config };
}
function catalogFixture(settings = {}) {
  const state = { db: true, email: 'owner@example.test', paid: 1234, manual: '0', multi: false,
    supabase: false, incompatible: true, models: 0, paidReads: [], errors: [], snapshot: snapshot(), ...settings };
  const bindings = { BillingError, ...registry, CANVAS_FREE_DEFAULTS: pure('billing/canvas-defaults.ts').CANVAS_FREE_DEFAULTS,
    process: { env: { NAUMI_PUBLIC_COMMERCE: '1' } }, billingSnapshot: async () => state.snapshot,
    resolveUserEmail: async () => state.email, totalPaidCents: async email => { state.paidReads.push(email); return state.paid; },
    getSetting: async () => state.manual, multiUserEnabled: async () => state.multi,
    assertPlatformImageSelection: () => {}, requestedFeatureModel: () => undefined,
    getUserImageProvider: async () => null, upstreamUserImageModel: value => value,
    managedBillingModel: async () => { state.models++; if (state.incompatible) throw new ModelConfigError('MODEL_INCOMPATIBLE', 'fixture default model incompatible', 400); return null; },
    getUserDefaultImageModel: async () => 'fixture-default', getOpenAISettings: async () => ({ model: 'fixture-default' }),
    isNewApiFlowImageModel: () => false };
  const names = ['meteringFor', 'billingSwitches', opts.baseline ? 'resolveBillingFacts' : 'billingCatalogFacts'];
  const loaded = execute(names.map(name => declaration(serverAST, name)).join('\n'), 'actual-catalog-server-functions.ts', bindings);
  const sync = () => { loaded.context.dbEnabled = state.db; loaded.context.supabaseEnabled = state.supabase; };
  sync();
  const route = execute(read(selected(FILES.route)), selected(FILES.route), { require: name => {
    if (name === '@/lib/billing/server') return { ...loaded.exports, billingSnapshot: bindings.billingSnapshot };
    if (name === '@/lib/billing/request') return { billingErrorResponse: error => { state.errors.push(error); return billingErrorResponse(error); } };
    if (name === '@/lib/billing/access') return { billingJson };
    if (name === '@/lib/billing/rules/registry') return registry;
    if (name === '@/lib/billing/types') return { BillingError };
    if (name === '@/lib/billing/quote') return { quote };
    throw new Error(`Unexpected route dependency ${name}`);
  } }).exports;
  return { state, sync, server: loaded.exports, request: () => route.GET(new Request('http://fixture.invalid/api/billing/catalog')) };
}

// Hook fixture preserves slots, refs, dependency equality and effect cleanup.
// State writes do NOT auto-render: each race chooses its explicit commit boundary.
function clientFixture(settings = {}) {
  const window = new EventTarget(), calls = [], notices = [], storage = new Map();
  const auth = { user: { email: 'owner@example.test' }, ready: false };
  let activeRunner, value, model = 'model-a';
  const useSlot = init => { const runner = activeRunner, index = runner.cursor++; return runner.slots[index] ||= init(); };
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    createContext: () => ({ Provider: Symbol('fixture-provider') }), useContext: () => value,
    useState: initial => { const slot = useSlot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      return [slot.value, update => { slot.value = typeof update === 'function' ? update(slot.value) : update; }]; },
    useRef: initial => useSlot(() => ({ current: initial })),
    useCallback: (callback, deps) => { const slot = useSlot(() => ({}));
      if (!same(slot.deps, deps)) { slot.value = callback; slot.deps = deps; } return slot.value; },
    useEffect: (effect, deps) => { const slot = useSlot(() => ({}));
      if (!same(slot.deps, deps)) activeRunner.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); slot.deps = deps; }); },
  };
  function runner(renderBody) {
    return { slots: [], cursor: 0, effects: [], result: undefined,
      render(effects = false) { this.cursor = 0; this.effects = []; activeRunner = this;
        try { this.result = renderBody(); } finally { activeRunner = undefined; }
        if (effects) this.effects.forEach(effect => effect()); return this.result; },
      dispose() { this.slots.forEach(slot => slot.cleanup?.()); },
    };
  }
  const workspace = execute(read(selected(FILES.workspace)), selected(FILES.workspace), { window }).exports;
  const csrf = () => settings.auth ? settings.auth() : Promise.resolve({ 'x-fixture-auth': '1' });
  const network = async (url, init) => {
    fixtureHTTP++; const call = { url, init }; calls.push(call);
    if (settings.fetch) return settings.fetch(url, init, call);
    if (url === '/api/billing/catalog') return Response.json({ version: 73, features: {}, products: [] });
    if (url === '/api/billing/quote') return Response.json({ version: 73, credits: 19, reserveCredits: 19, quote: { id: 'real-quote-token' } });
    return Response.json({ ok: true });
  };
  const cryptoBoundary = { browserRandomUUID: () => 'fixture-operation-0001',
    browserSha256Hex: async bytes => createHash('sha256').update(bytes).digest('hex') };
  const intent = execute(read(sourceFile('src/lib/billing/client-intent.ts')), 'actual-client-intent.ts', {
    require: name => { eq(name, '../browser-crypto'); return cryptoBoundary; },
  }).exports;
  const loaded = execute(read(selected(FILES.client)), selected(FILES.client), { window, fetch: network,
    confirm: () => { throw new Error('Unexpected confirmation'); },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, item) => storage.set(key, item), removeItem: key => storage.delete(key) },
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '@/components/ui/toast') return { useToast: () => ({ toast: (...args) => notices.push(args) }) };
      if (name === '@/lib/browser-data-cache') return { invalidateBrowserData: () => {} };
      if (name === '@/lib/supabase') return { authHeader: csrf };
      if (name === '@/lib/auth-context') return { useAuth: () => auth };
      if (name === './client-intent') return intent;
      if (name === '../model-config/public-client') return { MODEL_CATALOG_REFRESH: 'fixture:model-catalog' };
      if (name === '../model-config/feature-client') return { chosenFeatureModel: () => model, FEATURE_MODEL_SELECTION: 'fixture:feature-selection' };
      if (name === '../browser-crypto') return cryptoBoundary;
      if (name === '../saas/workspace-client') return workspace;
      throw new Error(`Unexpected billing-client dependency ${name}`);
    },
  }).exports;
  const provider = runner(() => { const tree = loaded.BillingProvider({ children: null }); value = tree.props.value; return value; });
  provider.render(settings.effects || false);
  return { calls, notices, auth, window, workspace, provider, get value() { return value; },
    render: effects => provider.render(effects), setModel: next => { model = next; },
    estimates: input => runner(() => loaded.useBillingEstimate(input)),
    quoteCalls: () => calls.filter(call => call.url === '/api/billing/quote'),
    paidCalls: () => calls.filter(call => call.url === '/api/paid-fixture'),
  };
}
const input = { canvas: true, feature: 'canvas.image', quantity: 1, quality: 'medium', resolution: '1K', ratio: '1:1' };
const quoted = (credits = 19) => Response.json({ version: 73, credits, reserveCredits: credits, quote: { id: 'real-quote-token' } });
function aba(h) { const start = h.workspace.currentWorkspace(); h.workspace.selectWorkspace('team-b'); h.workspace.selectWorkspace(start); }

async function commonCatalog() {
  await test('CATALOG_AUTH_401_BEFORE_MODEL_RESOLUTION', async () => {
    const h = catalogFixture({ email: null }); const response = await h.request();
    eq(response.status, 401); eq((await response.json()).code, 'INVALID_RESULT'); eq(h.state.models, 0); eq(h.state.paidReads.length, 0);
  });
  await test('CATALOG_METERING_PAID_FACTS_UNCHANGED', async () => {
    const h = catalogFixture({ incompatible: false });
    const facts = opts.baseline
      ? await h.server.resolveBillingFacts(new Request('http://fixture.invalid'), { feature: 'image.generate', quantity: 1 }, h.state.snapshot)
      : await h.server.billingCatalogFacts(new Request('http://fixture.invalid'), h.state.snapshot);
    eq(facts.metered, true); eq(facts.paidFen, 1234); eq(facts.byok, false); eq(facts.userGroup, 'default');
    deep(h.state.paidReads, ['owner@example.test']);
    const expected = [false, true, true, true, false];
    const fixtures = [
      { db: false, mode: 'on' }, { db: true, mode: 'on' }, { db: true, mode: 'legacy-auto', manual: '1' },
      { db: true, mode: 'legacy-auto', multi: true }, { db: true, mode: 'off' },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      Object.assign(h.state, { manual: '0', multi: false, ...fixture }); h.state.snapshot.config.switches.metering = fixture.mode; h.sync();
      eq(await h.server.meteringFor(h.state.snapshot), expected[index]);
    }
  });
}
async function baseline() {
  await commonCatalog();
  await test('BASELINE_DEFAULT_MODEL_POISONS_ENTIRE_CATALOG', async () => {
    const h = catalogFixture(); const response = await h.request();
    eq(response.status, 400); const body = await response.json(); eq(body.code, 'MODEL_INCOMPATIBLE'); eq(body.features, undefined); eq(h.state.models, 1);
  });
  await test('BASELINE_MATRIX_HOLE_POISONS_ENTIRE_CATALOG', async () => {
    const h = catalogFixture({ incompatible: false });
    h.state.snapshot.config.features['image.generate'].pricing = { mode: 'matrix', prices: { medium: { '1K': 0 } } };
    const response = await h.request(); eq(response.status, 400); eq((await response.json()).code, 'INVALID_RESULT');
  });
  await test('BASELINE_NULL_CATALOG_BLOCKS_QUOTE_AND_SUBMIT', async () => {
    const h = clientFixture(); eq(h.value.catalog, null);
    await assert.rejects(() => h.value.quoteAndSubmit('/api/paid-fixture', { method: 'POST', body: '{}' }, input), /报价加载中/);
    eq(h.calls.length, 0);
  });
  await test('BASELINE_AUTH_WAIT_ABA_SENDS_STALE_QUOTE', async () => {
    const gate = deferred(), h = clientFixture({ auth: () => gate.promise });
    const pending = h.value.quote(input); aba(h); gate.resolve({});
    eq((await pending).credits, 19); eq(h.quoteCalls().length, 1);
    eq(h.workspace.currentWorkspaceRevision, undefined); eq(h.workspace.WORKSPACE_SELECTION, undefined);
  });
  await test('BASELINE_CANVAS_TWO_PRICE_CONTROLS_OMIT_RATIO_COUNT', () => canvasContract(true));
}
async function modifiedCatalog() {
  await commonCatalog();
  await test('CATALOG_DEFAULT_MODEL_INCOMPATIBLE_DOES_NOT_BLOCK_OTHER_PRICES', async () => {
    const h = catalogFixture(); const response = await h.request(); eq(response.status, 200);
    const body = await response.json(); eq(body.features['tool.cutout'].prices.medium['1K'], 7);
    eq(body.features['canvas.image'].prices.high['4K'], 7); eq(h.state.models, 0);
    const facts = await h.server.billingCatalogFacts(new Request('http://fixture.invalid'), h.state.snapshot);
    eq(facts.modelId, undefined); eq(facts.providerId, undefined);
    deep(body.effective, { metering: true, commerce: true, recharge: true, environmentCommerce: true });
  });
  await test('CATALOG_MATRIX_NULL_MISSING_AND_ZERO_ARE_DISTINCT', async () => {
    const h = catalogFixture();
    h.state.snapshot.config.features['image.generate'].pricing = { mode: 'matrix', prices: { medium: { '1K': 0, '2K': null, '4K': 11 } } };
    const response = await h.request(); eq(response.status, 200); const body = await response.json();
    deep(body.features['image.generate'].prices.medium, { '1K': 0, '2K': null, '4K': 11, '5K': null });
    eq(body.features['image.generate'].prices.high['1K'], null); eq(body.features['tool.cutout'].prices.medium['1K'], 7);
  });
  await test('CATALOG_INVALID_CONFIG_IS_NOT_MASKED_AS_NULL', async () => {
    const h = catalogFixture(); h.state.snapshot.config.features['tool.cutout'].pricing = { mode: 'cost-plus', costKey: 'fixture-missing' };
    const response = await h.request(); eq(response.status, 400); eq((await response.json()).code, 'INVALID_CONFIG');
    eq(h.state.errors[0].code, 'INVALID_CONFIG');
  });
  await test('CATALOG_UNEXPECTED_ERROR_REACHES_OUTER_ERROR_HANDLER', async () => {
    const h = catalogFixture(); const failure = new Error('fixture-unexpected');
    Object.defineProperty(h.state.snapshot.config.features['tool.cutout'], 'pricing', { get() { throw failure; }, enumerable: true });
    const response = await h.request(); eq(response.status, 503); eq(h.state.errors[0], failure);
    eq((await response.json()).features, undefined);
  });
  await test('CATALOG_DEMO_AND_PAID_CONDITION_USE_REAL_QUOTE', async () => {
    const h = catalogFixture({ db: false, email: null }); let response = await h.request(); eq(response.status, 200);
    eq((await response.json()).features['canvas.image'].prices.medium['1K'], 0); eq(h.state.paidReads.length, 0);
    h.state.db = true; h.state.email = 'owner@example.test'; h.sync();
    h.state.snapshot.config.features['canvas.image'].rules = [{ id: 'paid-fixture', priority: 1, when: { minPaidFen: 1000 }, pricing: { mode: 'fixed', credits: 2 } }];
    response = await h.request(); eq((await response.json()).features['canvas.image'].prices.medium['1K'], 2);
    h.state.paid = 0; response = await h.request(); eq((await response.json()).features['canvas.image'].prices.medium['1K'], 7);
  });
}
async function modifiedClient() {
  await test('QUOTE_AND_SUBMIT_NULL_CATALOG_USES_REAL_QUOTE_AND_SUBMIT_NO_CONFIRM', async () => {
    const h = clientFixture(); let guards = 0; eq(h.value.catalog, null);
    const response = await h.value.quoteAndSubmit('/api/paid-fixture', { method: 'POST', body: '{"prompt":"fixture"}' }, input, () => guards++);
    eq(response.status, 200); deep(h.calls.map(call => call.url), ['/api/billing/quote', '/api/paid-fixture']);
    const headers = h.paidCalls()[0].init.headers; eq(headers.get('x-naumi-image-quote'), 'real-quote-token');
    eq(headers.get('x-naumi-billing-credits'), '19'); eq(headers.get('x-naumi-billing-version'), '73');
    assert.ok(guards >= 3); eq(h.notices.length, 0);
    const callback = find(clientAST, node => ts.isVariableDeclaration(node) && node.name.getText(clientAST.node) === 'quoteAndSubmit');
    eq(callback.length, 1); assert.doesNotMatch(callback[0].getText(clientAST.node), /\b(?:confirm|setConfirm|window\.confirm)\s*\(/);
  });
  await test('QUOTE_FAILURE_NEVER_SUBMITS_PAID_REQUEST', async () => {
    const h = clientFixture({ fetch: () => Response.json({ error: 'quote-rejected' }, { status: 409 }) });
    await assert.rejects(() => h.value.quoteAndSubmit('/api/paid-fixture', { method: 'POST', body: '{}' }, input), /quote-rejected/);
    eq(h.quoteCalls().length, 1); eq(h.paidCalls().length, 0);
  });
  await test('QUOTE_DEDUP_AND_MODEL_QUALITY_RESOLUTION_RATIO_COUNT_KEYS', async () => {
    const h = clientFixture(), first = h.value.quote(input); eq(h.value.quote({ ...input }), first); await first;
    const variants = [{ modelId: 'model-b' }, { quality: 'high' }, { resolution: '4K' }, { ratio: '16:9' }, { quantity: 4 }];
    for (const variant of variants) { const pending = h.value.quote({ ...input, ...variant }); assert.notStrictEqual(pending, first); await pending; }
    h.setModel('model-c'); await h.value.quote(input); eq(h.quoteCalls().length, 7);
    const call = h.quoteCalls()[0]; eq(call.init.headers['x-naumi-canvas'], '1');
    const facts = JSON.parse(call.init.body); eq(facts.canvas, undefined); eq(facts.modelId, 'model-a');
    eq(JSON.parse(h.quoteCalls()[5].init.body).quantity, 4);
  });
  await test('WORKSPACE_REVISION_PARTITIONS_CACHE_WITHOUT_EVENT_CLEARING', async () => {
    const h = clientFixture(), first = h.value.quote(input); await first; aba(h);
    const second = h.value.quote(input); assert.notStrictEqual(first, second); await second;
    eq(h.quoteCalls().length, 2); eq(h.workspace.currentWorkspaceRevision(), 2);
  });
  await test('QUOTE_AUTH_WAIT_WORKSPACE_ABA_SENDS_ZERO_HTTP', async () => {
    const gate = deferred(), h = clientFixture({ auth: () => gate.promise });
    const result = observe(h.value.quote(input)); aba(h); gate.resolve({}); scopeError(await result); eq(h.calls.length, 0);
  });
  await test('QUOTE_AUTH_WAIT_OWNER_CHANGE_SENDS_ZERO_HTTP', async () => {
    const gate = deferred(), h = clientFixture({ auth: () => gate.promise });
    const result = observe(h.value.quote(input)); h.auth.user = { email: 'other@example.test' }; h.render(false);
    gate.resolve({}); scopeError(await result); eq(h.calls.length, 0);
  });
  await test('QUOTE_HTTP_RETURN_AFTER_WORKSPACE_ABA_IS_REJECTED', async () => {
    const gate = deferred(), h = clientFixture({ fetch: () => gate.promise });
    const result = observe(h.value.quote(input)); await flush(); eq(h.quoteCalls().length, 1);
    aba(h); gate.resolve(quoted(991)); scopeError(await result);
  });
  await test('QUOTE_JSON_RETURN_AFTER_WORKSPACE_CHANGE_IS_NOT_DISPLAYED', async () => {
    const json = deferred(), h = clientFixture({ fetch: () => ({ ok: true, json: () => json.promise }) });
    const estimate = h.estimates(input); estimate.render(true); await flush(); eq(h.quoteCalls().length, 1);
    aba(h); json.resolve({ version: 73, credits: 991, reserveCredits: 991 }); await flush();
    const result = estimate.render(false); eq(result.quote, null); eq(result.cost, 0); assert.match(result.error, /创作空间已切换/);
    estimate.dispose();
  });
  await test('QUOTE_FAILURE_EVICTS_FOR_RETRY', async () => {
    let attempts = 0; const h = clientFixture({ fetch: () => ++attempts === 1 ? Response.json({ error: 'retry-me' }, { status: 503 }) : quoted() });
    const failed = h.value.quote(input); await assert.rejects(() => failed, /retry-me/);
    const retry = h.value.quote(input); assert.notStrictEqual(retry, failed); eq((await retry).credits, 19); eq(h.quoteCalls().length, 2);
  });
  await test('OLD_REJECTION_CANNOT_DELETE_SAME_KEY_REPLACEMENT_PROMISE', async () => {
    const old = deferred(), newer = deferred(); let attempts = 0;
    const h = clientFixture({ effects: true, fetch: () => ++attempts === 1 ? old.promise : newer.promise });
    const first = h.value.quote(input), result = observe(first); await flush();
    const cache = h.provider.slots.find(slot => slot.current && typeof slot.current.keys === 'function' && typeof slot.current.get === 'function').current;
    const oldKey = Array.from(cache.keys())[0];
    h.window.dispatchEvent(new Event('fixture:feature-selection')); // Batched state: no render, same closure/key.
    const replacement = h.value.quote(input); assert.notStrictEqual(replacement, first);
    eq(Array.from(cache.keys())[0], oldKey); await flush(); old.reject(new Error('old-rejected')); await result; await flush();
    eq(cache.get(oldKey), replacement); eq(h.value.quote(input), replacement);
    newer.resolve(quoted()); await replacement; eq(h.quoteCalls().length, 2); h.provider.dispose();
  });
  await test('WORKSPACE_EVENT_REVISION_RERENDER_AND_EFFECT_CLEANUP', async () => {
    const h = clientFixture({ effects: true }), workspace = h.workspace;
    const seen = []; h.window.addEventListener(workspace.WORKSPACE_SELECTION, () => seen.push([workspace.currentWorkspace(), workspace.currentWorkspaceRevision()]));
    eq(workspace.currentWorkspace(), 'personal'); eq(workspace.currentWorkspaceRevision(), 0);
    workspace.selectWorkspace(''); workspace.selectWorkspace('personal'); eq(seen.length, 0);
    await h.value.quote(input); const callback = h.value.quote;
    workspace.selectWorkspace('team-b'); workspace.selectWorkspace('team-b'); workspace.selectWorkspace('');
    deep(seen, [['team-b', 1], ['personal', 2]]); await flush(); h.render(true);
    assert.notStrictEqual(h.value.quote, callback); assert.ok(h.calls.some(call => call.url === '/api/billing/catalog'));
    await h.value.quote(input); eq(h.quoteCalls().length, 2);
    h.provider.dispose(); const count = h.calls.length; workspace.selectWorkspace('team-c'); await flush(); eq(h.calls.length, count);
    const noWindow = execute(read(selected(FILES.workspace)), 'actual-workspace-without-window.ts').exports;
    noWindow.selectWorkspace('team'); eq(noWindow.currentWorkspaceRevision(), 1);
  });
  await test('CATALOG_REFRESH_AUTH_WAIT_ABA_SENDS_ZERO_HTTP', async () => {
    const gate = deferred(), h = clientFixture({ auth: () => gate.promise });
    const pending = h.value.refresh(); aba(h); gate.resolve({}); await pending; eq(h.calls.length, 0); h.render(false); eq(h.value.catalog, null);
  });
  await test('CATALOG_REFRESH_STALE_JSON_CANNOT_OVERWRITE_NEW_SCOPE', async () => {
    const gate = deferred(); let count = 0;
    const h = clientFixture({ fetch: () => ++count === 1 ? { ok: true, json: () => gate.promise } : Response.json({ version: 74, marker: 'new-scope' }) });
    const old = h.value.refresh(); await flush(); aba(h); await h.value.refresh(); h.render(false);
    eq(h.value.catalog.version, 74); eq(h.value.loading, false);
    gate.resolve({ version: 73, marker: 'stale' }); await old; h.render(false);
    eq(h.value.catalog.version, 74); eq(h.value.error, null); eq(h.value.loading, false);
  });
}

function canvasContract(isBaseline) {
  const model = ast(selected(FILES.canvas));
  const feature = node => node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(model.node) === 'feature')?.initializer?.text;
  const controls = find(model, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(model.node) === 'ImageQualityControl' && feature(node) === 'canvas.image');
  eq(controls.length, 2);
  for (const [index, control] of controls.entries()) {
    const attrs = Object.fromEntries(control.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(model.node), attr.initializer]));
    eq(attrs.modelId.expression.getText(model.node), 'genModel'); eq(attrs.resolution.expression.getText(model.node), 'genResolution');
    if (isBaseline) { eq(attrs.ratio, undefined); eq(attrs.quantity, undefined); }
    else {
      const ratio = attrs.ratio.expression.getText(model.node);
      eq(ratio, index === 0 ? 'generationMode === "triptych" ? "16:9" : genRatio' : 'genRatio');
      const resolveRatio = new Function('generationMode', 'genRatio', `return (${ratio});`);
      eq(resolveRatio('triptych', '1:1'), index === 0 ? '16:9' : '1:1');
      eq(resolveRatio('standard', '3:4'), '3:4');
      eq(attrs.quantity.expression.getText(model.node), index === 0 ? 'selectedGenerationCount' : 'genCount');
    }
  }
  if (isBaseline) return;
  const beforeFile = path.join(REPO, BEFORE, FILES.canvas); eq(sha(beforeFile), PIN.canvas);
  const before = ast(beforeFile), printer = ts.createPrinter({ removeComments: true });
  const transformed = ts.transform(model.node, [context => {
    const visit = node => {
      if (controls.includes(node)) {
        const attributes = node.attributes.properties.filter(attr => !ts.isJsxAttribute(attr) || !['ratio', 'quantity'].includes(attr.name.getText(model.node)));
        return context.factory.updateJsxSelfClosingElement(node, node.tagName, node.typeArguments, context.factory.updateJsxAttributes(node.attributes, attributes));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  }]);
  // Compare printed tokens, not source-position-dependent printer whitespace.
  const tokens = source => {
    const parsed = astText(source), result = [];
    const visit = node => {
      const children = node.getChildren(parsed);
      if (!children.length) result.push([node.kind, node.getText(parsed)]);
      else children.forEach(visit);
    };
    visit(parsed); return result;
  };
  const astText = source => ts.createSourceFile('normalized.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  try { deep(tokens(printer.printFile(transformed.transformed[0])), tokens(printer.printFile(before.node))); }
  finally { transformed.dispose(); }
}
async function main() {
  await test('SOURCE_SELECTION_AND_PINNED_BASELINE', () => {
    for (const [name, relative] of Object.entries(FILES)) {
      const file = selected(relative); assert.ok(fs.statSync(file).isFile()); const digest = sha(file);
      if (opts.baseline) eq(digest, PIN[name], `baseline ${relative}`);
      console.log(`SOURCE=${file} SHA256=${digest}`);
    }
    console.log(`MODE=${opts.baseline ? 'BASELINE_REPRODUCTION' : 'MODIFIED_CONTRACT'} SOURCE_ROOT=${opts.root} EXPLICIT_ROOT=${opts.explicit}`);
  });
  if (opts.baseline) await baseline();
  else {
    await modifiedCatalog(); await modifiedClient();
    await test('CANVAS_THIN_AST_ONLY_TWO_RATIO_COUNT_PROP_PAIRS_NO_PAID_CHANGE', () => canvasContract(false));
  }
  assert.ok(groups <= 40, 'keep this verifier pragmatic');
  console.log(`CANVAS_PRICING_CATALOG_CLIENT_${opts.baseline ? 'BASELINE' : 'MODIFIED'}=PASS GROUPS=${groups} FIXTURE_HTTP=${fixtureHTTP} NETWORK_CALLS=0 SUPPLIER_CALLS=0 DB_CALLS=0`);
  console.log('EVIDENCE=REAL_AST_FUNCTIONS_AND_VM_MODULES REACT=MINIMAL_HOOK_FIXTURE CANVAS=STATIC_AST PG=NOT_RUN BROWSER=NOT_RUN');
}
main().catch(error => {
  console.error(`CANVAS_PRICING_CATALOG_CLIENT=FAIL CASE=${active} GROUPS_PASSED=${groups}`);
  console.error(error.stack || error); process.exitCode = 1;
});
