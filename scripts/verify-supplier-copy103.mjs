import assert from 'node:assert/strict';
import { makeSupplierCopy103Plan, rollbackSupplierCopy103, supplierCopy103LocalEndpoints } from './lib/supplier-copy103.mjs';
import { digest } from './lib/apib-activation.mjs';
import { fixtureModelConfig } from './model-config-unit-fixture.ts';
import { validateModelConfig } from '../src/lib/model-config/schema.ts';

const clone = structuredClone;
const OLD_REF = '10000000-0000-4000-8000-000000000001';
const SOURCE_REF = '20000000-0000-4000-8000-000000000001';
const NEW_REF = '30000000-0000-4000-8000-000000000001';
const SECOND_SOURCE_REF = '20000000-0000-4000-8000-000000000002';
const SECOND_NEW_REF = '30000000-0000-4000-8000-000000000002';
const pricing = amountMicros => ({ mode: 'cny-fixed', amountMicros, creditsPerCnyMicros: '100000000', rounding: 'ceil' });
const option = (modelId, amountMicros) => ({ modelId, enabled: true, sort: 1, unit: 'image', pricing: pricing(amountMicros), parameters: { qualities: ['medium'], resolutions: ['1K'], ratios: ['1:1'] } });

function fixture() {
  const target = fixtureModelConfig('https://supplier.example/v1', OLD_REF);
  const source = fixtureModelConfig('https://supplier.example/v1', SOURCE_REF);
  target.publicModels[0].toolScope = { features: ['image.generate', 'canvas.image'], defaultFor: ['image.generate'] };
  source.publicModels[0].toolScope = { features: ['image.generate', 'canvas.image'], defaultFor: ['canvas.image'] };
  target.publicModels[0].supplierRouting = { mode: 'priority', channels: [{ upstreamId: 'u1', enabled: true, priority: 1, weight: 1 }] };
  source.publicModels[0].supplierRouting = clone(target.publicModels[0].supplierRouting);
  target.providers.push({ ...clone(target.providers[0]), id: 'target-p', name: 'Target only' });
  target.upstreamModels.push({ ...clone(target.upstreamModels[0]), id: 'target-u', providerId: 'target-p' });
  target.publicModels.push({ ...clone(target.publicModels[0]), id: 'target-model', label: 'Target model', target: { type: 'upstream', id: 'target-u' }, toolScope: { features: ['image.generate'], defaultFor: [] }, supplierRouting: undefined });
  delete target.publicModels[1].supplierRouting;
  target.pools.push({ id: 'target-pool', modality: 'image', strategy: 'priority', candidates: ['target-u'], rules: [] });
  target.bindings['image.edit'] = 'target-model';
  target.business = { 'image.generate': { enabled: true, defaultModelId: 'image-a', options: [option('image-a', '120000'), option('target-model', '80000')] } };
  target.business['image.generate'].options[0].postprocess = { enabled: false, kind: 'resize', processor: 'sharp-lanczos3', width: 2048, height: 2048, failure: 'hold' };
  target.fixedMonthlyCosts = [{ id: 'hosting', name: 'Target hosting', amountCnyMicros: '2000000', enabled: true }];
  target.defaultImagePreset = { schemaVersion: 1, enabled: false, aliases: [{ id: 'target-preset-alias', label: 'Target preset' }], defaultModelIds: ['image-a'], qualityCap: 'medium', qualityParameter: 'omit', supportsMask: false, resolutions: [], ratios: [], resolutionMap: {}, ratioMap: {}, costSource: 'task-total-then-usage', factorBps: 15000, creditsPerCnyMicros: '100000000', rounding: 'ceil', authorizationCnyMicros: '500000', prices: [] };
  source.providers.push({ ...clone(source.providers[0]), id: 'source-p', credentialRef: SECOND_SOURCE_REF, baseUrl: 'https://second.example/v1', name: 'Source added' });
  source.upstreamModels.push({ ...clone(source.upstreamModels[0]), id: 'source-u', providerId: 'source-p', model: 'source-wire' });
  source.publicModels.push({ ...clone(source.publicModels[0]), id: 'source-model', label: 'Source model', target: { type: 'upstream', id: 'source-u' }, toolScope: { features: ['image.generate'], defaultFor: ['image.generate'] }, supplierRouting: undefined });
  delete source.publicModels[1].supplierRouting;
  source.pools.push({ id: 'source-pool', modality: 'image', strategy: 'priority', candidates: ['source-u'], rules: [] });
  source.publicModels[0].supplierRouting.channels.push({ upstreamId: 'source-u', enabled: true, priority: 2, weight: 3 });
  source.upstreamModels[0].parameterMap.quality = { high: 'medium', medium: 'low' };
  source.upstreamModels[0].procurement = { confirmed: true, currency: 'USD', source: 'fixture public tariff', updatedAt: '2026-10-29T00:00:00.000Z', basis: 'image', amountMicros: '40000' };
  source.business = { 'image.generate': { enabled: false, defaultModelId: 'source-model', options: [option('image-a', '90000'), option('source-model', '90000')] } };
  source.business['image.generate'].options[0].parameters = { qualities: ['high'], resolutions: ['2K'], ratios: ['3:2'] };
  source.business['image.generate'].options[0].routing = { enabled: false, defaultUpstreamId: 'source-u', maxAttempts: 1, costCapCnyMicros: '60000', rules: [] };
  source.business['image.generate'].options[0].postprocess = { enabled: false, kind: 'native', processor: 'none', width: 1024, height: 1024, failure: 'hold' };
  source.fixedMonthlyCosts = [{ id: 'source-fee', name: 'Do not copy', amountCnyMicros: '3000000', enabled: false }];
  source.defaultImagePreset = { ...clone(target.defaultImagePreset), factorBps: 20000, authorizationCnyMicros: '900000' };
  const credentials = { p1: { sourceCredentialRef: SOURCE_REF, targetCredentialRef: NEW_REF }, 'source-p': SECOND_NEW_REF };
  return { source, target, credentials };
}

let cases = 0;
function test(name, run) { run(); cases++; console.log(`PASS ${name}`); }
const { source, target, credentials } = fixture();
const sourceHash = digest(source), targetHash = digest(target);
let plan;
test('baseline source and target pass actual model schema', () => {
  validateModelConfig(source); validateModelConfig(target);
});
test('all source groups upsert with remapped credentials and procurement', () => {
  plan = makeSupplierCopy103Plan(source, target, credentials);
  assert.equal(plan.config.providers.find(p => p.id === 'p1').credentialRef, NEW_REF);
  assert.equal(plan.config.providers.find(p => p.id === 'source-p').credentialRef, SECOND_NEW_REF);
  assert.deepEqual(plan.config.upstreamModels[0], source.upstreamModels[0]);
  for (const group of ['providers', 'upstreamModels', 'publicModels', 'pools']) for (const row of source[group]) {
    const expected = clone(row);
    if (group === 'providers') expected.credentialRef = typeof credentials[row.id] === 'string' ? credentials[row.id] : credentials[row.id].targetCredentialRef;
    if (group === 'publicModels' && expected.toolScope) expected.toolScope.defaultFor = clone(target.publicModels.find(p => p.id === row.id)?.toolScope?.defaultFor || []);
    assert.deepEqual(plan.config[group].find(p => p.id === row.id), expected);
  }
  assert.deepEqual(plan.sourceCounts, { providers: 2, upstreamModels: 2, publicModels: 2, pools: 1, businessOptionsMatched: 1 });
  assert.deepEqual(plan.conflicts, []);
});
test('candidate passes real schema and full reference closure', () => { validateModelConfig(plan.config); });
test('target-only providers upstreams publics pools and bindings remain', () => {
  for (const group of ['providers', 'upstreamModels', 'publicModels', 'pools']) for (const row of target[group].filter(row => row.id.startsWith('target-')))
    assert.deepEqual(plan.config[group].find(item => item.id === row.id), row);
  assert.deepEqual(plan.config.bindings, target.bindings);
});
test('target pricing unit enabled sort default and postprocess stay unchanged', () => {
  const candidate = clone(plan.config.business), before = clone(target.business);
  for (const business of [candidate, before]) for (const f of Object.values(business)) for (const o of f.options) { delete o.parameters; delete o.routing; }
  assert.deepEqual(candidate, before);
  assert.deepEqual(plan.config.defaultImagePreset, target.defaultImagePreset);
  assert.deepEqual(plan.config.fixedMonthlyCosts, target.fixedMonthlyCosts);
  assert.equal(plan.config.business['image.generate'].options.length, 2);
});
test('only matching business model execution parameters and routing copy', () => {
  const actual = plan.config.business['image.generate'].options[0], expected = source.business['image.generate'].options[0];
  assert.deepEqual(actual.routing, expected.routing); assert.deepEqual(actual.parameters, expected.parameters);
  assert.deepEqual(plan.config.business['image.generate'].options[1], target.business['image.generate'].options[1]);
});
test('existing tool defaults preserved and new source defaults cleared', () => {
  assert.deepEqual(plan.config.publicModels.find(m => m.id === 'image-a').toolScope.defaultFor, ['image.generate']);
  assert.deepEqual(plan.config.publicModels.find(m => m.id === 'source-model').toolScope.defaultFor, []);
});
test('source and target inputs never mutate', () => { assert.equal(digest(source), sourceHash); assert.equal(digest(target), targetHash); });
test('selective inverse restores entire original digest exactly', () => {
  const result = rollbackSupplierCopy103(plan.config, plan);
  assert.deepEqual(result, target); assert.equal(digest(result), targetHash); validateModelConfig(result);
});
test('inverse preserves later unrelated labels weights prices and target-only row', () => {
  const current = clone(plan.config);
  current.upstreamModels[0].label = 'Later label';
  current.publicModels[0].supplierRouting.channels[0].weight = 7;
  current.business['image.generate'].options[0].pricing.amountMicros = '130000';
  current.providers.push({ ...clone(target.providers[0]), id: 'later-p', name: 'Later provider' });
  const restored = rollbackSupplierCopy103(current, plan);
  assert.equal(restored.upstreamModels[0].label, 'Later label');
  assert.equal(restored.publicModels[0].supplierRouting.channels[0].weight, 7);
  assert.equal(restored.business['image.generate'].options[0].pricing.amountMicros, '130000');
  assert(restored.providers.some(p => p.id === 'later-p')); validateModelConfig(restored);
});
test('inverse own changed leaf conflict HOLD and input unchanged', () => {
  const current = clone(plan.config); current.upstreamModels[0].parameterMap.quality.high = 'high';
  const original = digest(current);
  assert.throws(() => rollbackSupplierCopy103(current, plan), /ROLLBACK_FIELD_CONFLICT/); assert.equal(digest(current), original);
});
test('inverse changed newly-added row HOLD', () => {
  const current = clone(plan.config); current.providers.find(p => p.id === 'source-p').name = 'Later rename';
  assert.throws(() => rollbackSupplierCopy103(current, plan), /ROLLBACK_FIELD_CONFLICT/);
});
test('inverse later dependency on added provider HOLD', () => {
  const current = clone(plan.config); current.upstreamModels.push({ ...clone(current.upstreamModels[0]), id: 'later-upstream', providerId: 'source-p' });
  assert.throws(() => rollbackSupplierCopy103(current, plan), /ROLLBACK_DEPENDENCY_HOLD/);
});
test('inverse later dependency on added public HOLD', () => {
  const current = clone(plan.config); current.bindings['image.edit'] = 'source-model';
  assert.throws(() => rollbackSupplierCopy103(current, plan), /ROLLBACK_DEPENDENCY_HOLD/);
});
test('inverse later channel to a target-only upstream is retained', () => {
  const current = clone(plan.config);
  current.publicModels[0].supplierRouting.channels.push({ upstreamId: 'target-u', enabled: true, priority: 3, weight: 5 });
  const restored = rollbackSupplierCopy103(current, plan);
  assert.deepEqual(restored.publicModels[0].supplierRouting.channels.map(c => c.upstreamId), ['u1', 'target-u']);
  assert.equal(restored.publicModels[0].supplierRouting.channels[1].weight, 5); validateModelConfig(restored);
});
test('missing or unchanged source credential refs are rejected', () => {
  assert.throws(() => makeSupplierCopy103Plan(source, target, {}), /CREDENTIAL_MAPPING_REQUIRED/);
  assert.throws(() => makeSupplierCopy103Plan(source, target, { ...credentials, p1: SOURCE_REF }), /CREDENTIAL_MAPPING_REQUIRED/);
});
test('strict credential map catches changed source ref', () => {
  assert.throws(() => makeSupplierCopy103Plan(source, target, { ...credentials, p1: { sourceCredentialRef: OLD_REF, targetCredentialRef: NEW_REF } }), /CREDENTIAL_SOURCE_CHANGED/);
});
test('same-ID semantic identity changes require explicit conflict review', () => {
  const changed = clone(source); changed.upstreamModels[0].model = 'different-wire';
  const reviewed = makeSupplierCopy103Plan(changed, target, credentials);
  assert(reviewed.conflicts.some(c => c.code === 'SAME_ID_IDENTITY_CHANGED' && c.field === 'model'));
});
test('source cannot silently remove target tool default feature', () => {
  const changed = clone(source); changed.publicModels[0].toolScope.features = ['canvas.image'];
  assert(makeSupplierCopy103Plan(changed, target, credentials).conflicts.some(c => c.code === 'TARGET_DEFAULT_SCOPE_CONFLICT'));
});
test('source missing toolScope preserves target explicit scope and defaults', () => {
  const changed = clone(source); delete changed.publicModels[0].toolScope;
  assert.deepEqual(makeSupplierCopy103Plan(changed, target, credentials).config.publicModels[0].toolScope, target.publicModels[0].toolScope);
});
test('source absent routing or parameters remove only those two leaves', () => {
  const changed = clone(source); const o = changed.business['image.generate'].options[0]; delete o.routing; delete o.parameters;
  const result = makeSupplierCopy103Plan(changed, target, credentials);
  assert(!Object.hasOwn(result.config.business['image.generate'].options[0], 'parameters'));
  assert.deepEqual(rollbackSupplierCopy103(result.config, result), target);
});
test('source missing business does not alter target business', () => {
  const changed = clone(source); delete changed.business;
  assert.deepEqual(makeSupplierCopy103Plan(changed, target, credentials).config.business, target.business);
});
test('absent target customer root fields stay absent', () => {
  const sparse = clone(target); delete sparse.business; delete sparse.defaultImagePreset; delete sparse.fixedMonthlyCosts;
  const result = makeSupplierCopy103Plan(source, sparse, credentials);
  for (const key of ['business', 'defaultImagePreset', 'fixedMonthlyCosts']) assert(!Object.hasOwn(result.config, key));
  assert.deepEqual(rollbackSupplierCopy103(result.config, result), sparse); validateModelConfig(result.config);
});
test('disabled no-credential source provider remains absent no guessed ref', () => {
  const changed = clone(source); changed.providers.push({ ...clone(changed.providers[0]), id: 'disabled-source', enabled: false }); delete changed.providers.at(-1).credentialRef;
  const actual = makeSupplierCopy103Plan(changed, target, credentials).config.providers.find(p => p.id === 'disabled-source');
  assert(!actual.enabled && !Object.hasOwn(actual, 'credentialRef'));
});
test('local source endpoint list flags services private IPv4 IPv6 and 47 without rewriting', () => {
  const endpoints = ['http://localhost:8000/v1', 'http://127.0.0.2/v1', 'http://[::1]/v1', 'http://router:3000/v1', 'http://host.docker.internal/v1', 'http://api.local/v1', 'http://10.2.3.4/v1', 'http://172.20.0.2/v1', 'http://192.168.1.2/v1', 'http://169.254.0.2/v1', 'http://100.64.0.2/v1', 'http://[fc00::1]/v1', 'https://47.105.59.142/v1'];
  const input = { providers: endpoints.map((baseUrl, i) => ({ id: `p${i}`, baseUrl })) }, before = digest(input);
  const result = supplierCopy103LocalEndpoints(input); assert.equal(result.length, endpoints.length); assert.equal(digest(input), before);
  assert.equal(result.at(-1).reason, 'SOURCE_SITE_ENDPOINT');
  assert.deepEqual(supplierCopy103LocalEndpoints({ providers: [{ id: 'external', baseUrl: 'https://supplier.example/v1' }] }), []);
});
test('provider appUrl is also checked and no credential-bearing URL is echoed', () => {
  const result = supplierCopy103LocalEndpoints({ providers: [{ id: 'p', baseUrl: 'https://supplier.example/v1', options: { appUrl: 'http://worker:9000' } }] });
  assert.equal(result[0].field, 'options.appUrl');
  for (const baseUrl of ['https://user:secret@host.example/v1', 'https://host.example/v1?key=secret', 'https://host.example/v1#secret']) {
    assert.throws(() => supplierCopy103LocalEndpoints({ providers: [{ id: 'p', baseUrl }] }), error => /ENDPOINT_SECRET_OR_INVALID:p:baseUrl/.test(error.message) && !error.message.includes('secret'));
  }
});
test('duplicate entity IDs and matching business model IDs are rejected', () => {
  const changed = clone(source); changed.providers.push(clone(changed.providers[0]));
  assert.throws(() => makeSupplierCopy103Plan(changed, target, credentials), /ROW_IDENTITY/);
  const duplicate = clone(source); duplicate.business['image.generate'].options.push(clone(duplicate.business['image.generate'].options[0]));
  assert.throws(() => makeSupplierCopy103Plan(duplicate, target, credentials), /ROW_IDENTITY/);
});
test('plan and inverse are deterministic and idempotent plan has no delta', () => {
  assert.deepEqual(makeSupplierCopy103Plan(source, target, credentials), plan);
  const repeated = makeSupplierCopy103Plan(source, plan.config, credentials);
  assert.equal(repeated.delta.length, 0); assert.deepEqual(repeated.config, plan.config);
});
console.log(`SUPPLIER_COPY103 PASS ${cases}/${cases} networkCalls=0 databaseWrites=0 supplierCalls=0`);
