'use strict';

// Offline regression harness: execute the real TS quote resolver and pricing engine.
// --baseline reads the saved before tree and is expected to expose the regression.
// --source-root <tree> runs the same assertions against an actual rollback copy.
// Unchanged dependencies absent from a partial before/rollback tree use this checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let baseline = false, sourceRoot = root;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseline') baseline = true;
  else if (args[i] === '--source-root' && args[i + 1] && !args[i + 1].startsWith('--')) sourceRoot = path.resolve(args[++i]);
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
if (baseline) {
  assert.equal(sourceRoot, root, 'Use either --baseline or --source-root, not both');
  sourceRoot = path.join(root, 'output/canvas-model-pricing-fix-20261024/before');
}
const billingPath = 'src/lib/model-config/billing-model.ts';
const sourcePath = path.join(sourceRoot, billingPath);
const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
const modules = new Map();
const slices = {
  'src/lib/model-config/business.ts': ['FEATURE_BINDINGS', 'selectedBusinessOption', 'upstreamSupportsFeature', 'compatiblePublicModels'],
  'src/lib/model-config/tool-scope.ts': ['modelAllowedForFeature', 'featureDefaultModel', 'assertToolScope'],
  'src/lib/model-config/image-preset.ts': ['isDefaultImageFeature', 'selectedImagePreset', 'presetPublicId'],
  'src/lib/model-config/channel-policy.ts': ['publicUpstreamIds'],
};
const allowed = new Set([
  billingPath, ...Object.keys(slices),
  'src/lib/model-config/bindings.ts', 'src/lib/model-config/types.ts', 'src/lib/model-config/selection-policy.ts',
  ...['quote', 'types', 'costs', 'money', 'api-cost', 'canvas-defaults', 'rules/registry', 'rules/evaluate'].map(p => `src/lib/billing/${p}.ts`),
]);
let state, networkCalls = 0, supplierCalls = 0;
const forbiddenNetwork = () => { networkCalls++; throw new Error('Unexpected network access'); };
const forbiddenSupplier = () => { supplierCalls++; throw new Error('Unexpected route preparation or supplier access'); };
const mocks = {
  'src/lib/model-config/context.ts': {
    currentExecutionBundle: () => state.bundle,
    currentModelExecution: role => role ? state.scopes[role] : state.globalScope,
  },
  'src/lib/model-config/requests.ts': { modelConfigurationEnabled: async () => state.configurationEnabled },
  'src/lib/model-config/server.ts': {
    getModelAdministration: async () => {
      state.adminCalls++;
      assert.equal(state.forbidAdmin, false, 'Matching frozen scope returns before administration');
      return {
        repo: {
          current: async () => { state.reads.push('current'); return state.snapshot; },
          byVersion: async version => { state.reads.push(`byVersion:${version}`); assert.ok(state.versions[version], 'Known accepted snapshot'); return state.versions[version]; },
        },
        runtime: { prepareExecution: forbiddenSupplier },
      };
    },
  },
};

function load(relative) {
  if (mocks[relative]) return mocks[relative];
  assert.ok(allowed.has(relative), `No unexpected I/O dependency: ${relative}`);
  if (modules.has(relative)) return modules.get(relative).exports;
  const candidate = path.join(sourceRoot, relative);
  const filename = fs.existsSync(candidate) ? candidate : path.join(root, relative);
  let source = fs.readFileSync(filename, 'utf8');
  if (slices[relative]) {
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const names = new Set(slices[relative]), found = new Set();
    source = ast.statements.filter(node => {
      if (ts.isImportDeclaration(node)) return true;
      const declarations = ts.isVariableStatement(node) ? node.declarationList.declarations : [node];
      const selected = declarations.some(d => d.name && names.has(d.name.getText(ast)));
      if (selected) declarations.forEach(d => { if (d.name) found.add(d.name.getText(ast)); });
      return selected;
    }).map(node => node.getText(ast)).join('\n');
    for (const name of names) assert.ok(found.has(name), `Real TS declaration exists: ${relative}:${name}`);
  }
  const compiled = ts.transpileModule(source, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, `TS transpilation: ${relative}`);
  const module = { exports: {} };
  modules.set(relative, module);
  const requireLocal = specifier => {
    if (specifier === 'server-only') return {};
    assert.ok(specifier.startsWith('.'), `No external dependency or network client: ${specifier}`);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier)) + '.ts';
    return load(target);
  };
  const run = vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})`, {
    structuredClone, fetch: forbiddenNetwork,
  }, { filename });
  run(requireLocal, module, module.exports);
  return module.exports;
}

const { managedBillingModel } = load(billingPath);
const { compatiblePublicModels, FEATURE_BINDINGS } = load('src/lib/model-config/business.ts');
const { quote } = load('src/lib/billing/quote.ts');
const { ModelConfigError } = load('src/lib/model-config/types.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const request = headers => ({ headers: new Headers(headers) });
const identity = (providerId = 'primary-provider', modelId = 'family') => ({ modelId, providerId });

function reset(modality = 'image', routing = true) {
  const config = {
    schemaVersion: 1,
    publicModels: [{ id: 'family', label: 'Fixture family', modality, enabled: true, visible: true, target: { type: 'upstream', id: 'primary' },
      ...(routing ? { supplierRouting: { mode: 'priority', channels: [{ upstreamId: 'alternate', enabled: true, priority: 1, weight: 1 }] } } : {}) }],
    upstreamModels: ['primary', 'alternate'].map(id => ({ id, providerId: `${id}-provider`, modality, enabled: true, capabilities: { generate: true, edit: true, vision: true, transparent: true } })),
    providers: ['primary', 'alternate'].map(id => ({ id: `${id}-provider`, enabled: true, protocol: modality === 'text' ? 'openai-chat' : 'openai-images' })),
    bindings: { 'image.generate': 'family', 'image.edit': 'family', 'text.generate': 'family', 'vision.ocr': 'family' }, pools: [],
  };
  state = { snapshot: { version: 47, digest: 'fixture', config }, versions: {}, reads: [], scopes: {}, globalScope: undefined, bundle: undefined, adminCalls: 0, forbidAdmin: false, configurationEnabled: true };
  return config;
}
const resolve = (feature = 'canvas.image', selected = 'family', headers) => managedBillingModel(request(headers), feature, selected);
async function reject(code, feature = 'canvas.image', selected = 'family', headers) {
  await assert.rejects(() => resolve(feature, selected, headers), error => error instanceof ModelConfigError && error.code === code);
}
function priced(result, feature = 'canvas.image') {
  const settlement = { qualityBasis: 'requested', successBasis: 'successful-units', failureBps: 0, byokBps: 10000, reserveBps: 10000, unknown: 'hold' };
  const tariff = { label: 'Fixture price', enabled: true, unit: 'image', pricing: { mode: 'fixed', credits: 2 }, settlement,
    rules: [['alternate-provider', 31], ['managed-router', 99], ['primary-provider', 7]].map(([provider, credits]) => ({ id: `price-${provider}`, when: { providerId: [provider] }, pricing: { mode: 'fixed', credits } })) };
  return quote({ version: 9, config: { features: { [feature]: tariff }, costs: {}, credits: { debitOrder: ['subscription', 'pack'], staleReservationMinutes: 30 } } },
    { feature, quantity: 2, quality: 'medium', resolution: '1K', ...result, metered: true, byok: false, paidFen: 0, userGroup: 'fixture' });
}

const cases = [];
const test = (name, run) => cases.push({ name, run });
for (const fault of ['primary-disabled', 'provider-disabled', 'capability-mismatch']) {
  test(`supplier-image-${fault}-keeps-provider-price`, async () => {
    const config = reset(), before = plain(await resolve()), beforePrice = plain(priced(before));
    if (fault === 'primary-disabled') config.upstreamModels[0].enabled = false;
    if (fault === 'provider-disabled') config.providers[0].enabled = false;
    if (fault === 'capability-mismatch') config.upstreamModels[0].capabilities = { generate: false, edit: false };
    assert.equal(compatiblePublicModels(config, 'image.edit', 'canvas.image').some(m => m.id === 'family'), true, 'Actual listing admits the alternate');
    const saved = plain(config), after = plain(await resolve());
    assert.deepEqual(after, identity());
    assert.deepEqual(after, before);
    assert.deepEqual(plain(priced(after)), beforePrice, 'Actual provider-specific quote remains unchanged');
    assert.equal(beforePrice.matchedRuleId, 'price-primary-provider');
    assert.equal(beforePrice.requestedCredits, 14);
    assert.deepEqual(plain(config), saved, 'Quote resolution leaves model config unchanged');
  });
  test(`single-target-${fault}-still-rejected`, async () => {
    const config = reset('image', false);
    if (fault === 'primary-disabled') config.upstreamModels[0].enabled = false;
    if (fault === 'provider-disabled') config.providers[0].enabled = false;
    if (fault === 'capability-mismatch') config.upstreamModels[0].capabilities = { generate: false, edit: false };
    await reject('MODEL_INCOMPATIBLE');
  });
}
for (const feature of ['canvas.text-generate', 'canvas.ocr']) test(`supplier-text-${feature}-alternate-admitted`, async () => {
  const config = reset('text');
  config.upstreamModels[0].enabled = false;
  config.providers[0].enabled = false;
  config.upstreamModels[0].capabilities = { generate: false, vision: false };
  assert.equal(compatiblePublicModels(config, FEATURE_BINDINGS[feature], feature).length, 1);
  assert.deepEqual(plain(await resolve(feature)), identity());
});
for (const protocol of ['openai-images', 'new-api-flow', 'apimart-images', 'fal-images']) test(`existing-provider-identity-${protocol}`, async () => {
  const config = reset('image', false);
  config.providers[0].protocol = protocol;
  assert.deepEqual(plain(await resolve()), identity(['apimart-images', 'fal-images'].includes(protocol) ? 'managed-router' : 'primary-provider'));
});
test('single-target-healthy', async () => { reset('image', false); assert.deepEqual(plain(await resolve()), identity()); });
for (const missing of ['primary', 'provider']) test(`missing-${missing}-typed-rejection`, async () => {
  const config = reset();
  if (missing === 'primary') config.upstreamModels.shift(); else config.providers.shift();
  await reject('MODEL_INCOMPATIBLE');
});
for (const field of ['enabled', 'visible']) test(`public-model-${field}-retained`, async () => {
  const config = reset(); config.publicModels[0][field] = false; await reject('MODEL_UNAVAILABLE');
});
test('public-model-modality-retained', async () => { const config = reset(); config.publicModels[0].modality = 'text'; await reject('MODEL_UNAVAILABLE'); });
test('hidden-default-without-explicit-selection-retained', async () => {
  const config = reset(); config.publicModels[0].visible = false;
  assert.deepEqual(plain(await managedBillingModel(request(), 'canvas.image')), identity());
});
test('feature-disabled-retained', async () => { const config = reset(); config.business = { 'canvas.image': { enabled: false } }; await reject('FEATURE_DISABLED'); });
test('business-option-not-enabled-retained', async () => {
  const config = reset(); config.business = { 'canvas.image': { enabled: true, options: [{ modelId: 'family', enabled: false }] } }; await reject('MODEL_INCOMPATIBLE');
});
test('tool-scope-retained', async () => {
  const config = reset(); config.publicModels[0].toolScope = { features: ['image.generate'], defaultFor: [] }; await reject('MODEL_OUTSIDE_TOOL_SCOPE');
});
test('canvas-system-scope-retained', async () => {
  const config = reset(); config.publicModels[0].toolScope = { systems: ['canvas'], features: [], defaultFor: [] }; assert.deepEqual(plain(await resolve()), identity());
});
test('pool-early-return-retained', async () => {
  const config = reset(); delete config.publicModels[0].supplierRouting; config.publicModels[0].target = { type: 'pool', id: 'fixture-pool' };
  config.upstreamModels = []; config.providers = []; assert.deepEqual(plain(await resolve()), identity('managed-router'));
});
test('legacy-preset-id-and-provider-retained', async () => {
  const config = reset(); config.providers[0].protocol = 'apimart-images';
  config.defaultImagePreset = { enabled: true, upstreamId: 'primary', defaultModelIds: ['family'], aliases: [{ id: 'preset-id', label: 'Fixture preset' }] };
  assert.deepEqual(plain(await resolve()), identity('primary-provider', 'preset-id'));
});
test('preset-scope-retained', async () => {
  const config = reset(); config.publicModels.push({ id: 'preset-id', toolScope: { features: ['image.generate'] } });
  config.defaultImagePreset = { enabled: true, upstreamId: 'primary', defaultModelIds: ['family'], aliases: [{ id: 'preset-id', label: 'Fixture preset' }] };
  await reject('MODEL_OUTSIDE_TOOL_SCOPE');
});
for (const binding of ['image.edit', 'image.generate']) test(`frozen-scope-${binding}-returns-before-admin`, async () => {
  reset(); state.forbidAdmin = true;
  state.scopes.image = { frozen: { binding, feature: 'canvas.image', publicModelId: 'frozen-model' }, connection: { providerId: 'frozen-provider' } };
  assert.deepEqual(plain(await resolve()), identity('frozen-provider', 'frozen-model'));
  assert.equal(state.adminCalls, 0); assert.deepEqual(state.reads, []);
});
test('different-scope-feature-does-not-short-circuit', async () => {
  reset(); state.scopes.image = { frozen: { binding: 'image.edit', feature: 'canvas.expand', publicModelId: 'other-model' }, connection: { providerId: 'other-provider' } };
  assert.deepEqual(plain(await resolve()), identity()); assert.deepEqual(state.reads, ['current']);
});
for (const acceptedFrom of ['bundle', 'global-scope']) test(`accepted-${acceptedFrom}-byVersion-before-current`, async () => {
  reset(); const accepted = structuredClone(state.snapshot); accepted.version = 46;
  accepted.config.upstreamModels[0].providerId = 'accepted-provider'; accepted.config.providers[0].id = 'accepted-provider';
  state.versions[46] = accepted; state.snapshot.config.publicModels[0].enabled = false;
  if (acceptedFrom === 'bundle') { state.bundle = { modelVersion: 46 }; state.globalScope = { frozen: { modelVersion: 45 } }; }
  else state.globalScope = { frozen: { modelVersion: 46 } };
  assert.deepEqual(plain(await resolve()), identity('accepted-provider')); assert.deepEqual(state.reads, ['byVersion:46']);
});
test('text-header-selection-retained', async () => {
  reset('text'); assert.deepEqual(plain(await managedBillingModel(request({ 'x-naumi-text-model': ' family ' }), 'canvas.text-generate')), identity());
});
test('admin-cutout-without-binding-retained', async () => { reset(); assert.equal(await resolve('tool.cutout', 'ignored-explicit-id'), null); });
test('configuration-disabled-early-null', async () => { reset(); state.configurationEnabled = false; assert.equal(await resolve(), null); assert.equal(state.adminCalls, 0); });
test('unmanaged-feature-early-null', async () => { reset(); assert.equal(await resolve('tool.upscale'), null); assert.equal(state.adminCalls, 0); });

(async () => {
  let passed = 0;
  for (const { name, run } of cases) {
    try { await run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}: ${error.code || error.name}: ${error.message}`); }
  }
  assert.equal(networkCalls, 0, 'No network calls');
  assert.equal(supplierCalls, 0, 'No supplier or route preparation calls');
  const failed = cases.length - passed;
  console.log(`CANVAS_MODEL_QUOTE_ROUTING=${failed ? 'FAIL' : 'PASS'} MODE=${baseline ? 'baseline' : sourceRoot === root ? 'modified' : 'source-root'} CASES=${cases.length} PASSED=${passed} FAILED=${failed} SUPPLIER_CALLS=${supplierCalls} NETWORK_CALLS=${networkCalls} DB_MODULES=0 SOURCE_SHA256=${sourceSha256}`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
