#!/usr/bin/env node
'use strict';
// Whole-route execution with deterministic auth/model/storage boundaries.
// The supplier response is a fixture; no HTTP, database, or paid model request.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const workspace = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(option('--source-root', workspace));
const outputRoot = path.resolve(option('--output-root', path.join(workspace, 'output/tool-text-results')));
const baseline = args.includes('--baseline');
const loaded = new Map(), cases = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aA1sAAAAASUVORK5CYII=', 'base64');
function source(relative) {
  const pinnedDependencies = new Set(['src/lib/supabase.ts', 'src/lib/model-config/feature-client.ts']);
  const requested = path.join(sourceRoot, relative);
  const full = fs.existsSync(requested) ? requested : pinnedDependencies.has(relative) ? path.join(workspace, relative) : requested;
  const bytes = fs.readFileSync(full);
  loaded.set(relative, {path: full, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
  return bytes.toString('utf8');
}
function evaluate(relative, stubs, cache = new Map(), globals = {}) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const text = source(relative), loadedModule = {exports: {}};
  cache.set(relative, loadedModule);
  const output = ts.transpileModule(text, {fileName: relative, compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const requireSource = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id] && Object.hasOwn(stubs[id], '__realModule') ? evaluate(stubs[id].__realModule, stubs, cache, globals) : stubs[id];
    if (id === '@/lib/tool-text-results') return evaluate('src/lib/tool-text-results.ts', stubs, cache, globals);
    throw new Error('UNMOCKED_DEPENDENCY:' + id);
  };
  const context = {module: loadedModule, exports: loadedModule.exports, require: requireSource, console, Buffer, process: {env: {}}, Request, Response, Headers, FormData, File, Blob, URL,
    fetch: () => {throw new Error('FORBIDDEN_NETWORK');}, setTimeout, clearTimeout, ...globals};
  vm.runInNewContext(output, context, {filename: path.join(sourceRoot, relative)});
  return loadedModule.exports;
}
async function route(kind, raw) {
  const seen = {modelCalls: 0, reserves: 0, ledgerWrites: 0, refunds: 0, creationStarts: 0, finishes: []};
  const stubs = {
    'server-only': {},
    'next/server': {NextResponse: {json: (value, init) => Response.json(value, init)}},
    '@/lib/model-config/clients': {modelAwareOpenAI: () => ({chat: {completions: {create: async () => {seen.modelCalls++; return {choices: [{message: {content: raw}}]};}}}})},
    '@/lib/bi/model-observer': {observeOpenAI: value => value, withBiRequest: (_request, action) => action()},
    '@/lib/billing/synchronous': {withBillingRequest: (_request, _feature, action) => action(), configuredToolCost: async () => 7, synchronousChargedCredits: x => x},
    '@/lib/commerce': {insufficientCreditsMessage: 'fixture insufficient'},
    '@/lib/vision-image': {toVisionDataUrl: async bytes => 'data:image/png;base64,' + bytes.toString('base64')},
    '@/lib/text-models': {requestedTextModel: () => 'fixture-text-vision'},
    '@/lib/db': {dbEnabled: true, reserveCredits: async () => {seen.reserves++; return true;}, refundCredits: async () => {seen.refunds++;},
      getUser: async () => ({email: 'fixture@example.test'}), isBanned: async () => false,
      addLedgerEntry: async () => {seen.ledgerWrites++;}, addArtworks: async () => {throw new Error('UNEXPECTED_ARTWORK_WRITE');}},
    '@/lib/ip': {clientIp: () => '127.0.0.1'},
    '@/lib/rate-limit-http': {checkRateLimit: async () => true},
    '@/lib/admin-auth': {resolveUserEmail: async () => 'fixture@example.test'},
    '@/lib/settings': {getOpenAISettings: async () => ({apiKey: 'fixture-not-a-key'})},
    '@/lib/openai-base': {getOpenAIBaseUrl: async () => 'http://fixture.invalid'},
    '@/lib/api-error': {safeError: (_error, fallback) => fallback},
    '@/lib/prompt-config': {getTitleSystem: async () => 'fixture title system'},
    '@/lib/storage': {storageEnabled: false, uploadImage: async () => {throw new Error('UNEXPECTED_STORAGE_WRITE');}},
    '@/lib/saas/creation-context': {currentCreationContext: () => null},
    '@/lib/saas/creation-writer': {startCreation: async () => {seen.creationStarts++; return 'fixture-creation';},
      finishCreation: async (_id, _email, state, data) => {seen.finishes.push({state, data});}, prepareOriginalCreationInput: async () => {}},
    '@/lib/billing/request': {operationIdFor: () => 'fixture-operation'},
  };
  const loadedModule = evaluate(`src/app/api/${kind}/route.ts`, stubs);
  const form = new FormData();
  form.append('image', new File([png], 'fixture.png', {type: 'image/png'}));
  form.append('idea', 'fixture product'); form.append('email', 'fixture@example.test');
  const response = await loadedModule.POST(new Request('http://fixture.invalid/api/' + kind, {method: 'POST', body: form}));
  const result = {status: response.status, body: await response.json(), seen};
  assert.equal(seen.modelCalls, 1, 'one fixture completion, never a repeated generation');
  return result;
}

async function titleClient({withFile = false, managed = true, available = true, deferred = false} = {}) {
  let stateIndex = 0, resolveCatalog;
  const stateValues = [], calls = [], pendingCatalog = new Promise(resolve => {resolveCatalog = resolve;});
  const react = {useRef: () => ({current: null}), useEffect: () => {}, useCallback: f => f,
    useState: value => {const index = stateIndex++; value = index === 0 && withFile ? new File([png], 'input.png', {type: 'image/png'}) : index === 2 ? 'fixture product' : value; stateValues[index] = value; return [value, next => {stateValues[index] = typeof next === 'function' ? next(stateValues[index]) : next;}];}};
  const jsx = (type, props) => ({type, props: props || {}});
  const store = new Map([['naumi:text-model', 'legacy-stale-model']]);
  const stubs = {
    react, 'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'Fragment'},
    '@/components/cached-image': {CachedImage: 'CachedImage'}, '@/lib/tool-ui': {toolImageError: () => null},
    '@/lib/clipboard': {copyText: async () => true}, 'lucide-react': new Proxy({}, {get: (_target, name) => String(name)}),
    '@/components/tools/prompt-assist-popup': {PromptAssistPopup: 'PromptAssistPopup'},
    '@/lib/auth-context': {useAuth: () => ({user: {email: 'fixture@example.test'}})},
    '@/lib/auth-modal-context': {useAuthModal: () => ({openAuth: () => {throw new Error('UNEXPECTED_LOGIN');}})},
    '@/lib/i18n/locale-context': {useI18n: () => ({locale: 'zh'})}, '@/lib/utils': {cn: (...x) => x.join(' ')},
    '@/components/tools/tool-shell': {ToolShell: 'ToolShell'}, '@/components/tools/tool-demo': {ToolDemo: 'ToolDemo', getDemo: () => ({})},
    '@/components/gen-loader': {GenLoader: 'GenLoader'}, '@/components/ui/text-model-select': {TextModelSelect: 'TextModelSelect'},
    '@/lib/model-config/feature-client': {__realModule: 'src/lib/model-config/feature-client.ts'},
    '@/lib/supabase': {__realModule: 'src/lib/supabase.ts'}, '../supabase': {__realModule: 'src/lib/supabase.ts'},
    '@/lib/saas/workspace-client': {currentWorkspace: () => 'personal'},
    '@supabase/supabase-js': {createClient: () => {throw new Error('UNEXPECTED_SUPABASE');}},
    '@/lib/image-quality-preference': {currentImageQuality: () => 'medium'},
    '@/lib/model-config/public-client': {currentModelCatalogVersion: () => 11},
    './public-client': {MODEL_CATALOG_REFRESH: 'models-refresh', rememberModelCatalogVersion: () => {}},
    '../image-model-routing': {compactImageModelOptions: x => x, imageModelDisplayId: x => x},
    './selection-policy': {adminConfiguredFeature: () => false},
  };
  const localStorage = {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key)};
  const mockedFetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/models?feature=')) {
      calls.push({kind: 'catalog', url});
      if (deferred) await pendingCatalog;
      return Response.json({managed, feature: 'canvas.text-generate', available, supported: true, defaultModelId: 'visible-default-model', models: available ? [{id: 'visible-default-model', label: 'Visible model', modality: 'text', supportsEdit: false}] : []});
    }
    assert.equal(url, '/api/title-gen', 'only the title route is permitted');
    const headers = Object.fromEntries(new Headers(init.headers));
    calls.push({kind: 'title', method: init.method, headers, multipart: init.body instanceof FormData,
      imagePresent: init.body instanceof FormData && init.body.get('image') instanceof File});
    return Response.json(validTitle);
  };
  const loadedModule = evaluate('src/components/titles/title-gen-client.tsx', stubs, new Map(), {
    window: {localStorage, dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {}},
    localStorage, Event, fetch: mockedFetch,
  });
  const tree = loadedModule.TitleGenClient();
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {for (const item of node) {const found = find(item, type); if (found) return found;} return null;}
    if (node.type === type) return node;
    return find(node.props?.children, type) || find(node.props?.left, type);
  };
  const shell = find(tree, 'ToolShell'), selector = find(tree, 'TextModelSelect');
  assert.ok(shell && selector, 'real component rendered its action and selector');
  const promise = shell.props.onAction();
  await new Promise(resolve => setImmediate(resolve));
  const titleCallsBeforeCatalog = calls.filter(x => x.kind === 'title').length;
  resolveCatalog(); await promise;
  return {calls, titleCallsBeforeCatalog, selectorFeature: selector.props.feature, error: stateValues[8]};
}
async function test(name, run) {
  try { const observed = await run(); cases.push({name, status: 'PASS', observed}); }
  catch (error) { cases.push({name, status: 'FAIL', error: error.message}); }
}
const validRisk = {risk: 'high', riskLabel: '高风险', summary: '识别到示例风险', items: [{name: '示例元素', reason: '需要复核授权'}], advice: '核对授权'};
const validTitle = {titles: ['测试商品标题'], sellingPoints: ['测试卖点']};
async function main() {
  if (baseline) {
    await test('baseline-malformed-ipcheck-is-fake-low', async () => { const r = await route('ipcheck', 'not json'); assert.equal(r.status, 200); assert.equal(r.body.result.risk, 'low'); assert.equal(r.seen.ledgerWrites, 1); return r; });
    await test('baseline-empty-ipcheck-accepted', async () => { const r = await route('ipcheck', '{}'); assert.equal(r.status, 200); assert.deepEqual(r.body.result, {}); assert.equal(r.seen.ledgerWrites, 1); return r; });
    await test('baseline-malformed-title-orphans-creation', async () => { const r = await route('title-gen', 'not json'); assert.equal(r.status, 502); assert.equal(r.seen.creationStarts, 1); assert.equal(r.seen.finishes.length, 0); return r; });
    await test('baseline-title-uses-stale-global-model', async () => {const r = await titleClient(); const call = r.calls.find(x => x.kind === 'title'); assert.equal(call.headers['x-naumi-text-model'], 'legacy-stale-model'); assert.equal(call.headers['x-naumi-feature-model'], undefined); assert.equal(r.calls.some(x => x.kind === 'catalog'), false); return r;});
  } else {
    for (const [name, raw] of [['non-json', 'not json'], ['empty', '{}'], ['null', 'null'], ['array', '[]'], ['invalid-risk', JSON.stringify({...validRisk, risk: 'unknown'})], ['empty-summary', JSON.stringify({...validRisk, summary: ''})], ['bad-items', JSON.stringify({...validRisk, items: ['wrong']})]]) {
      await test('invalid-ipcheck-' + name, async () => {const r = await route('ipcheck', raw); assert.equal(r.status, 502); assert.equal(r.body.code, 'INVALID_TOOL_TEXT_RESULT'); assert.equal(r.body.result, undefined); assert.equal(r.seen.ledgerWrites, 0); assert.equal(r.seen.refunds, 0); return r;});
    }
    for (const [name, raw] of [['non-json', 'not json'], ['null', 'null'], ['array', '[]'], ['empty', '{}'], ['empty-titles', '{"titles":[]}'], ['blank-titles', '{"titles":[" "]}']]) {
      await test('invalid-title-' + name, async () => {const r = await route('title-gen', raw); assert.equal(r.status, 502); assert.equal(r.body.code, 'INVALID_TOOL_TEXT_RESULT'); assert.equal(r.seen.creationStarts, 1); assert.equal(r.seen.finishes.length, 1); assert.equal(r.seen.finishes[0].state, 'failed'); assert.ok(r.seen.finishes[0].data.summary); return r;});
    }
    await test('fenced-ipcheck-canonical-risk-label', async () => {const r = await route('ipcheck', '```json\n' + JSON.stringify({...validRisk, riskLabel: '低风险'}) + '\n```'); assert.equal(r.status, 200); assert.equal(r.body.result.riskLabel, '高风险'); return r;});
    await test('fenced-title', async () => {const r = await route('title-gen', '```json\n' + JSON.stringify(validTitle) + '\n```'); assert.equal(r.status, 200); assert.equal(r.seen.finishes[0].state, 'succeeded'); return r;});
    for (const withFile of [false, true]) await test('title-visible-model-' + (withFile ? 'multipart' : 'json'), async () => {
      const r = await titleClient({withFile, deferred: true}); const call = r.calls.find(x => x.kind === 'title');
      assert.equal(r.titleCallsBeforeCatalog, 0); assert.equal(r.selectorFeature, 'canvas.text-generate');
      assert.equal(call.headers['x-naumi-feature-model'], 'visible-default-model'); assert.equal(call.multipart, withFile);
      assert.equal(call.headers['x-naumi-text-model'], 'legacy-stale-model');
      assert.equal(withFile ? call.imagePresent : call.headers['content-type'] === 'application/json', true); return r;
    });
    await test('title-unavailable-model-no-submission', async () => {const r = await titleClient({available: false}); assert.equal(r.calls.some(x => x.kind === 'title'), false); assert.ok(r.error); return r;});
    await test('title-explicit-unmanaged-retains-global-model', async () => {const r = await titleClient({managed: false}); const call = r.calls.find(x => x.kind === 'title'); assert.equal(call.headers['x-naumi-feature-model'], undefined); assert.equal(call.headers['x-naumi-text-model'], 'legacy-stale-model'); return r;});
  }
  await test('valid-ipcheck-positive-control', async () => {const r = await route('ipcheck', JSON.stringify(validRisk)); assert.equal(r.status, 200); assert.equal(r.body.result.risk, 'high'); assert.equal(r.seen.ledgerWrites, 1); assert.equal(r.seen.refunds, 0); return r;});
  await test('valid-title-positive-control', async () => {const r = await route('title-gen', JSON.stringify(validTitle)); assert.equal(r.status, 200); assert.deepEqual(r.body.titles, validTitle.titles); assert.equal(r.seen.finishes.length, 1); assert.equal(r.seen.finishes[0].state, 'succeeded'); return r;});
  const failed = cases.filter(x => x.status === 'FAIL').length;
  const report = {mode: baseline ? 'BASELINE' : 'MODIFIED', status: failed ? 'FAIL' : baseline ? 'REPRODUCED' : 'PASS', sourceRoot,
    cases, loaded: Object.fromEntries(loaded), network: 0, paidSupplierRequests: 0,
    evidenceLevel: 'whole real route/client modules and pure parser; actual authHeader and ensureFeatureModelSelection; React/HTTP/auth/model/billing/storage/creation boundaries are fixtures, not live financial acceptance'};
  fs.mkdirSync(outputRoot, {recursive: true});
  const file = path.join(outputRoot, baseline ? 'BASELINE.json' : 'MODIFIED.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), {flag: 'wx'});
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, report.status);
  const exit = failed ? 2 : baseline ? 1 : 0;
  console.log(`TOOL_TEXT_RESULTS=${report.status} CASES=${cases.length} FAILED=${failed} NETWORK=0 PAID_SUPPLIER_REQUESTS=0 EXIT=${exit}`);
  if (failed) console.error(JSON.stringify(cases.filter(x => x.status === 'FAIL')));
  process.exitCode = exit;
}
main().catch(error => {console.error(error.stack); process.exitCode = 2;});
