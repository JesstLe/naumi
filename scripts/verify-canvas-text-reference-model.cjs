'use strict';

// Execute the complete real requestFacts/withModelRequest module. Configuration,
// executor and DB are inert fixtures; no model, billing, or network is invoked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourceRoot = process.argv.includes('--source-root') ? path.resolve(process.argv[process.argv.indexOf('--source-root') + 1]) : root;
const file = path.join(sourceRoot, 'src/lib/model-config/requests.ts');
const source = fs.readFileSync(file, 'utf8');
const sha = crypto.createHash('sha256').update(source).digest('hex');
let checks = 0;
const state = { vision: false, inputTypes: ['text'], resolves: [], runs: [], snapshotReads: 0 };
class ModelConfigError extends Error { constructor(code, message, status) { super(message); Object.assign(this, { code, status }); } }
const snapshot = { version: 47, config: { bindings: { 'text.generate': 'text-only' }, business: { 'canvas.text-generate': {}, 'canvas.assistant': {} } } };
const billing = { version: 9 };
const forbidden = name => () => { throw new Error('Unexpected boundary: ' + name); };
const mocks = {
  '../db': { dbEnabled: true, getPool: forbidden('DB') },
  './context': { legacyModelExecutionActive: () => false },
  './server': { getModelAdministration: async () => ({ repo: { current: async () => { state.snapshotReads++; return snapshot; } }, billing: { current: async () => billing } }) },
  './execution': { getModelExecutor: async () => ({
    resolve: async input => { state.resolves.push(input); return { binding: input.binding, modelId: 'fixture-selected-model' }; },
    describe: async () => ({ capabilities: { vision: state.vision }, businessOption: { parameters: { inputTypes: state.inputTypes } } }),
    runBundle: async (bundle, bill, run) => { state.runs.push({ bundle, bill }); return run(); },
  }) },
  './types': { ModelConfigError },
  './accepted-context': { acceptedModelVersions: async () => null },
  '../billing/image-quotes': { imageBillingQuoteForRequest: async () => null },
  './selection-policy': { assertPlatformImageSelection: () => {}, requestedFeatureModel: (_feature, selected) => selected },
  './feature-path': { featureForRequest: pathname => pathname === '/api/canvas/text-generate' ? 'canvas.text-generate' : pathname === '/api/canvas/assistant' ? 'canvas.assistant' : 'image.generate' },
  '../canvas/generation-parameters': { canvasSourceFrameEdit: () => false },
};
// The refactor exposes these same owned read ports rather than the monolithic server.
Object.assign(mocks, {
  './availability': { modelConfigurationEnabled: async () => true },
  './execution-services': { getModelExecutionServices: () => ({
    models: { current: async () => { state.snapshotReads++; return snapshot; } },
    billing: { current: async () => billing },
  }) },
});
const compiled = ts.transpileModule(source + '\nexport { requestFacts as requestFactsForTest };', {
  fileName: file, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal(compiled.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const mod = { exports: {} };
vm.runInNewContext('(function(require,module,exports){' + compiled.outputText + '\n})', {
  Request, Response, URL, console,
  process: { env: { NAUMI_ROUTER_MANAGEMENT_URL: 'http://fixture.invalid' } },
  fetch: forbidden('network'),
}, { filename: file })(specifier => specifier === 'server-only' ? {} : mocks[specifier] || new Proxy({}, { get: (_target, key) => forbidden(specifier + ':' + String(key)) }), mod, mod.exports);
const { requestFactsForTest, withModelRequest } = mod.exports;
const request = (body, pathname = '/api/canvas/text-generate') => new Request('http://fixture.local' + pathname, { method: 'POST', headers: { 'content-type': 'application/json', 'x-naumi-feature-model': 'text-only' }, body: JSON.stringify(body) });
async function check(name, run) { await run(); checks++; console.log('CHECK=' + name); }

async function main() {
  await check('TEXT_REFERENCE_IDS_DO_NOT_REQUIRE_VISION', async () => {
    const req = request({ prompt: '写三条卖点', content: '正文', projectKey: 'tree:a', sourceIds: ['text-a', 'text-b'] });
    const before = await req.clone().text();
    assert.equal((await requestFactsForTest(req)).references, 0);
    assert.equal(await withModelRequest(req, async () => 'TEXT_OK'), 'TEXT_OK');
    assert.equal(state.resolves.at(-1).facts.references, 0);
    assert.equal(state.runs.at(-1).bundle.vision, undefined);
    assert.equal(state.runs.at(-1).bundle.modelVersion, 47);
    assert.equal(state.runs.at(-1).bundle.billingVersion, 9);
    assert.equal(await req.text(), before, 'classification does not consume or rewrite route input');
  });
  await check('MIXED_INPUT_RETAINS_IMAGE_CAPABILITY_GATE', async () => {
    const req = request({ sourceIds: ['text-a', 'image-a'] });
    assert.equal((await requestFactsForTest(req)).references, 1);
    await assert.rejects(withModelRequest(req, async () => assert.fail('must not execute')), error => error.code === 'MODEL_INCOMPATIBLE');
  });
  await check('PRODUCT_ONLY_REFERENCE_REQUIRES_VISION', async () => {
    for (const mode of ['general', 'assist']) {
      const req = request({ mode, sourceIds: [], productIds: ['product-a'] });
      assert.equal((await requestFactsForTest(req)).references, 1);
      await assert.rejects(withModelRequest(req, async () => assert.fail('must not execute')), error => error.code === 'MODEL_INCOMPATIBLE');
    }
  });
  await check('VISION_MODEL_ACCEPTS_ACTUAL_IMAGE_AND_TEXT_CONTEXT', async () => {
    state.vision = true; state.inputTypes = ['text', 'image'];
    const req = request({ sourceIds: ['text-a', 'image-a'], productIds: ['image-a', 'product-b'] });
    assert.equal((await requestFactsForTest(req)).references, 2);
    assert.equal(await withModelRequest(req, async () => 'VISION_OK'), 'VISION_OK');
    assert.equal(state.runs.at(-1).bundle.vision, state.runs.at(-1).bundle.text);
    state.vision = false; state.inputTypes = ['text'];
  });
  await check('LEGACY_PRODUCT_RECIPE_DOES_NOT_GAIN_TEXT_ID_EXEMPTION', async () => {
    for (const mode of ['reverse', 'assist']) assert.equal((await requestFactsForTest(request({ mode, sourceIds: ['text-not-supported'] }))).references, 1);
  });
  await check('OTHER_TEXT_FEATURE_SOURCE_IDS_UNCHANGED', async () => {
    const req = request({ sourceIds: ['text-looks-like-id'] }, '/api/canvas/assistant');
    assert.equal((await requestFactsForTest(req)).references, 1);
    await assert.rejects(withModelRequest(req, async () => assert.fail('must not execute')), error => error.code === 'MODEL_INCOMPATIBLE');
  });
  await check('IMAGE_ROUTE_REFERENCE_PRECEDENCE_UNCHANGED', async () => {
    assert.equal((await requestFactsForTest(request({ images: ['a', 'b'], sourceIds: ['text-a'], productIds: ['c'] }, '/api/generate-image'))).references, 2);
    assert.equal((await requestFactsForTest(request({ sourceIds: ['text-a', 'image-b'] }, '/api/generate-image'))).references, 2);
    assert.equal((await requestFactsForTest(request({ contextIds: ['a'] }, '/api/agent'))).references, 1);
  });
  console.log(`CANVAS_TEXT_REFERENCE_MODEL=PASS CHECKS=${checks} REQUEST_MODULE_SHA256=${sha} SUPPLIER_CALLS=0 EXIT=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
