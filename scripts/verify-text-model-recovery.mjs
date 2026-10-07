import assert from 'node:assert/strict';
import {recoveryPlan} from './repair-canvas-text-model.mjs';
import {fixtureModelConfig} from './model-config-unit-fixture.ts';
import {publicModelCatalog} from '../src/lib/model-config/runtime.ts';
import {validateModelConfig} from '../src/lib/model-config/schema.ts';
import {modelConfigDigest} from '../src/lib/model-config/repository.ts';
import {createModelExecutor} from '../src/lib/model-config/execution.ts';

const config = fixtureModelConfig('https://fixture.example/v1', '00000000-0000-4000-8000-000000000001');
config.providers.push({...config.providers[0], id: 'text-provider', protocol: 'openai-chat'});
config.upstreamModels.push({...config.upstreamModels[0], id: 'text-upstream', providerId: 'text-provider', model: 'legacy-text-wire', modality: 'text', capabilities: {...config.upstreamModels[0].capabilities, vision: true, qualities: [], nativeResolutions: []}});
config.publicModels.push({id: 'original-text-alias', label: '原默认文字模型', modality: 'text', enabled: true, visible: false, target: {type: 'upstream', id: 'text-upstream'}});
config.bindings['text.generate'] = 'original-text-alias';
config.bindings['agent.text'] = 'original-text-alias';
const original = structuredClone(config);
const snapshot = c => ({version: 1, digest: modelConfigDigest(c), config: c});
const catalog = c => publicModelCatalog(snapshot(c), 'text', 'canvas.text-generate');
const executor = c => createModelExecutor({runtime: {byVersion: async () => snapshot(c), prepareExecution: async () => {throw Error('Router invocation forbidden in fixture');}}, credentials: {read: async () => 'fixture-key'}, gateway: () => {throw Error('Gateway invocation forbidden in fixture');}});
const input = c => ({feature: 'canvas.text-generate', binding: 'text.generate', requestedModelId: 'original-text-alias', snapshot: snapshot(c), billing: {version: 1}});
assert.equal(catalog(config).models.length, 0);
  await assert.rejects(executor(config).resolve(input(config)), /所选模型不可用/);
if (process.argv.includes('--baseline')) {
  console.log('BASELINE=PASS REPRODUCED_EMPTY_CATALOG=true REQUESTED_MODEL=UNAVAILABLE PAID_CALLS=0');
} else {
  const plan = recoveryPlan(config);
  validateModelConfig(plan.config);
  assert.deepEqual(config, original, 'Source config is immutable');
  assert.equal(catalog(plan.config).models[0].id, plan.id);
  assert.equal(catalog(plan.config).defaultModelId, plan.id);
  const frozen = await executor(plan.config).resolve(input(plan.config));
  const scope = await executor(plan.config).describe(frozen);
  assert.equal(scope.connection.wireModel, 'legacy-text-wire');
  assert.equal(scope.connection.providerId, 'text-provider');
  const restored = structuredClone(plan.config);
  restored.publicModels.find(m => m.id === plan.id).visible = false;
  assert.deepEqual(restored, original);
  assert.equal(catalog(restored).models.length, 0);
  await assert.rejects(executor(restored).resolve(input(restored)), /所选模型不可用/);
  if (process.argv.includes('--rollback')) {
    console.log('ROLLBACK=PASS COPY_RESTORED=true ORIGINAL_EMPTY_CATALOG=true ORIGINAL_REQUEST_REJECTION=true PAID_CALLS=0');
  } else {
    const {bootstrapModelConfig} = await import('../src/lib/model-config/bootstrap.ts');
    for (const whitelist of [['legacy-text-wire'], ['original-text-alias']]) {
      const imported = await bootstrapModelConfig({credentials: {importPlain: async () => ({id: '00000000-0000-4000-8000-000000000001'})}, sources: {video: [], text: {baseUrl: 'https://fixture.example/v1', apiKey: 'fixture-key', defaultModel: 'legacy-text-wire', agentModel: 'legacy-text-wire', models: ['legacy-text-wire'], aliases: {'original-text-alias': 'legacy-text-wire', 'other-alias': 'legacy-text-wire'}, visibleModels: whitelist, agent: {baseUrl: 'https://agent.fixture.example/v1', apiKey: 'fixture-agent-key'}}}});
      assert.equal(imported.publicModels.find(m => m.id === 'original-text-alias').visible, true);
      assert.equal(catalog(imported).models[0].id, 'original-text-alias');
      const defaultUpstream = imported.upstreamModels.find(m => m.id === imported.publicModels.find(m => m.id === 'original-text-alias').target.id);
      assert.equal(defaultUpstream.providerId, 'platform-agent');
      assert.equal(imported.publicModels.find(m => m.id === imported.bindings['agent.text']).visible, false);
      assert.equal(imported.publicModels.find(m => m.id === 'other-alias').visible, whitelist.includes('legacy-text-wire'), 'An explicit alias allowlist must not expose sibling aliases');
    }
    assert.deepEqual(recoveryPlan(plan.config).config, plan.config, 'Repeated plan is idempotent');
    const agentConfig = structuredClone(config);
    agentConfig.providers.push({...agentConfig.providers.at(-1), id: 'legacy-agent-provider'});
    agentConfig.upstreamModels.push({...agentConfig.upstreamModels.at(-1), id: 'legacy-agent-upstream', providerId: 'legacy-agent-provider'});
    agentConfig.publicModels.push({...agentConfig.publicModels.at(-1), id: 'hidden-agent', target: {type: 'upstream', id: 'legacy-agent-upstream'}});
    agentConfig.bindings['agent.text'] = 'hidden-agent';
    const agentPlan = recoveryPlan(agentConfig, {upstreamId: 'legacy-agent-upstream'});
    assert.equal(agentPlan.config.publicModels.find(m => m.id === plan.id).target.id, 'legacy-agent-upstream');
    const agentScope = await executor(agentPlan.config).describe(await executor(agentPlan.config).resolve(input(agentPlan.config)));
    assert.equal(agentScope.connection.providerId, 'legacy-agent-provider');
    assert.equal(agentScope.connection.wireModel, 'legacy-text-wire');
    assert.throws(() => recoveryPlan(agentConfig, {upstreamId: 'unknown'}));
    const hiddenSibling = structuredClone(config); hiddenSibling.publicModels.push({...config.publicModels.at(-1), id: 'internal-vision'});
    assert.equal(recoveryPlan(hiddenSibling).config.publicModels.at(-1).visible, false, 'No internal models exposed');
    for (const mutate of [c => c.providers.at(-1).enabled = false, c => c.upstreamModels.at(-1).enabled = false, c => c.publicModels.at(-1).enabled = false, c => c.upstreamModels.at(-1).capabilities.generate = false, c => c.providers.at(-1).credentialRef = undefined, c => c.bindings['text.generate'] = 'missing', c => c.business = {'canvas.text-generate': {enabled: false, defaultModelId: 'original-text-alias', options: []}}]) {
      const broken = structuredClone(config); mutate(broken); assert.throws(() => recoveryPlan(broken));
    }
    console.log('MODIFIED=PASS CATALOG=VISIBLE EXECUTION=ORIGINAL_UPSTREAM IMMUTABLE_SOURCE=true REPEAT=IDEMPOTENT DISABLED=REJECTED INTERNAL_MODELS=HIDDEN PRICES=UNCHANGED PAID_CALLS=0');
  }
}
