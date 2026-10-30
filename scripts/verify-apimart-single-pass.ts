/** Real APIMart selection -> parameter-plan regression, with no supplier or DB.
 * Run with Node's react-server condition and tsx. --source-root loads a complete
 * source copy. --adapter-file loads the complete preserved adapter module in
 * memory against that root; --baseline records the original double translation.
 * This suite is not the HTTP/PG/paid-delivery acceptance suite. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Module, {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `${name} needs a path`);
  return process.argv[i + 1];
};
const root = path.resolve(argument('--source-root') || process.env.PARAMETER_SOURCE_ROOT || '.');
const adapterFile = path.resolve(argument('--adapter-file') || path.join(root, 'src/lib/model-config/apimart-preset.ts'));
const baseline = process.argv.includes('--baseline');
const load = (file: string) => import(pathToFileURL(path.join(root, file)).href);
let checks = 0, cases = 0, networkCalls = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};

async function adapterModule() {
  if (!argument('--adapter-file')) return load('src/lib/model-config/apimart-preset.ts');
  // The whole archived source is evaluated. Its imports resolve from source-root
  // so a one-file pre-change snapshot needs no copied or stubbed business logic.
  const filename = path.join(root, 'src/lib/model-config/apimart-preset.ts');
  const module = new Module(filename) as Module & {paths: string[]; _compile(source: string, filename: string): void};
  module.filename = filename;
  module.paths = (Module as unknown as {_nodeModulePaths(path: string): string[]})._nodeModulePaths(path.dirname(filename));
  module.require = createRequire(pathToFileURL(filename));
  module._compile(ts.transpileModule(readFileSync(adapterFile, 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true},
    fileName: filename,
  }).outputText, filename);
  return module.exports;
}

async function main() {
  // Pure contract suite: importing an adapter must not enable a real DB or HTTP.
  process.env.DATABASE_URL = '';
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {networkCalls++; throw new Error('Unexpected network in pure single-pass regression');};
  try {
    const {fixtureModelConfig} = await load('scripts/model-config-unit-fixture.ts');
    const {validateModelConfig} = await load('src/lib/model-config/schema.ts');
    const {compileImageParameterPlan} = await load('src/lib/model-config/image-parameter-plan.ts');
    const {apimartExecutionParameters} = await adapterModule();
    const {apimartImageParameters} = await load('src/lib/model-config/apimart-image-parameters.ts');
    const {withImageOperation, currentImageOperationParameters} = await load('src/lib/image-gateway.ts');
    const {effectiveImageParameters, initializeImagePreset} = await load('src/lib/model-config/image-preset.ts');
    const {policyQuality} = await load('src/lib/model-config/quality-policy.ts');
    const high = {quality: 'high', resolution: '4K', ratio: '1:1'};
    const credentialRef = '00000000-0000-4000-8000-000000000001';

    function make(options: {qualities?: string[]; mode?: 'map' | 'omit' | 'passthrough'; highWire?: string; selected?: typeof high; legacy?: boolean} = {}) {
      const config = fixtureModelConfig('https://fixture.invalid/v1', credentialRef);
      config.providers[0].protocol = 'apimart-images';
      const upstream = config.upstreamModels[0];
      upstream.capabilities.qualities = options.qualities || ['medium', 'high'];
      upstream.capabilities.nativeResolutions = ['1K', '2K', '4K'];
      upstream.parameterMap = {
        qualityPolicy: {mode: options.mode || 'map', choices: [
          {id: 'high', label: 'High', value: options.highWire || 'medium'},
          {id: 'medium', label: 'Medium', value: 'low'},
        ]},
        resolutionPolicy: {mode: 'map', field: 'resolution', ratioField: 'size', values: {'1K': '1k', '2K': '2k', '4K': '2k'}},
        apimartImages: {schemaVersion: 1, ratios: ['1:1', '3:4'], maxOutputs: 1, supportsMask: false},
      };
      const valid = validateModelConfig(config), u = valid.upstreamModels[0];
      const selected = {...(options.selected || high)};
      const plan = compileImageParameterPlan(u, selected, {publicModelId: 'image-a', protocol: 'apimart-images', modelVersion: 200});
      const scope = {
        frozen: {
          ...(!options.legacy ? {imageParameterPlanVersion: 1, imageParameterPlans: {u1: plan}} : {}),
          modelVersion: 200, publicModelId: 'image-a', target: {type: 'upstream', id: 'u1'},
          requestedParameters: selected, facts: {...selected},
        },
        parameterMap: u.parameterMap, capabilities: u.capabilities,
        connection: {wireModel: u.model, protocol: 'apimart-images'}, channelGuard: {upstreamId: 'u1'},
      };
      const quote = {
        requestedParameters: {...selected},
        // This is the same policyQuality -> wire storage used by business-billing.
        effectiveParameters: {...selected, quality: policyQuality(u.parameterMap.qualityPolicy, selected.quality) || 'auto'},
        requestedCredits: 12, authorizedCredits: 12, reserveCredits: 12,
      };
      return {scope, quote, plan, config: valid};
    }

    async function parameters(label: string, value: ReturnType<typeof make>, operation?: Partial<typeof high>) {
      cases++;
      const before = structuredClone(value);
      const calculate = async () => {
        const selected = apimartExecutionParameters(value.scope, {quality: 'body-default'}, value.quote, currentImageOperationParameters());
        return {selected, result: apimartImageParameters(value.scope, selected)};
      };
      const result = operation
        ? await withImageOperation('wire-image-one', {id: `single-pass-${cases}`, ...operation}, calculate)
        : await calculate();
      equal(value, before, `${label}: scope, saved plan, quote and original price are immutable`);
      return result;
    }

    const initial = make();
    const collision = await parameters('wire alias collides with another semantic id', initial, high);
    equal(initial.plan.wire.quality, 'medium', 'frozen plan contains one translation');
    if (baseline) {
      equal(collision.selected.quality, 'medium', 'baseline feeds wire medium back as semantic medium');
      equal(collision.result.upstream.quality, 'low', 'baseline reproduces high -> medium -> low');
      equal(networkCalls, 0, 'baseline stays offline');
      console.log(`BASELINE=REPRODUCED CHECKS=${checks} CONFIG=VALID USER_QUALITY=high FROZEN_WIRE=medium ACTUAL_WIRE=low NETWORK=0 DATABASE=DISABLED`);
      return;
    }
    equal(collision.selected.quality, 'high', 'new plan retains semantic high');
    equal(collision.result.upstream.quality, 'medium', 'non-idempotent mapping executes once');
    equal(collision.result.upstream.resolution, '2k', 'explicit 4K map uses 2k');
    equal(collision.result.parameterPlan, initial.plan, 'same input uses the frozen plan');

    const {executionImageParameterPlan} = await load('src/lib/model-config/image-plan-runtime.ts');
    const directPlan = await withImageOperation('wire-image-one', {id:'single-pass-direct-runtime', ...high, quality:'medium'}, async()=>executionImageParameterPlan(initial.scope));
    equal(directPlan, initial.plan, 'runtime without adapter selection uses frozen semantic quality');
    cases++;

    const frameValue=make({selected:{...high,ratio:'3:4'}});
    frameValue.scope.frozen.requestedParameters={...high,ratio:'941:1672'};
    frameValue.quote.requestedParameters={...high,ratio:'941:1672'};
    const frame=await parameters('nearest frame and non-idempotent quality coexist',frameValue,{...high,quality:'medium',ratio:'941:1672'});
    equal(frame.selected.quality,'high','nearest frame does not change semantic quality');
    equal(frame.selected.ratio,'3:4','quote effective nearest frame remains authoritative');
    equal(frame.result.upstream,{quality:'medium',resolution:'2k',size:'3:4'},'single-pass wire and effective frame both survive');
    equal(frameValue.quote.requestedParameters.ratio,'941:1672','original reference target stays in quote audit');

    const noOperation = await parameters('no current operation', make());
    equal(noOperation.result.upstream.quality, 'medium', 'frozen selection also survives without operation');

    for (const wire of ['hd', 'high', 'medium']) {
      const alias = await parameters(`wire ${wire}`, make({highWire: wire}), high);
      equal(alias.selected.quality, 'high', `${wire}: wire spelling is never semantic ownership`);
      equal(alias.result.upstream.quality, wire, `${wire}: exact configured wire preserved`);
    }
    const empty = await parameters('empty discovery qualities', make({qualities: []}), high);
    equal(empty.result.upstream.quality, 'medium', 'missing metadata does not alter explicit mapping');
    const omit = await parameters('omit quality', make({mode: 'omit'}), high);
    equal(omit.selected.quality, 'high', 'omit auto marker stays out of semantic choice');
    equal(Object.hasOwn(omit.result.upstream, 'quality'), false, 'omit emits no wire quality');
    const passthrough = await parameters('passthrough quality', make({mode: 'passthrough'}), high);
    equal(passthrough.result.upstream.quality, 'high', 'passthrough preserves original');

    for (const operationQuality of ['medium', 'hd', 'auto']) {
      const opaque = await parameters(`operation already contains wire ${operationQuality}`, make(), {...high, quality: operationQuality});
      equal(opaque.selected.quality, 'high', `${operationQuality}: opaque operation value does not replace frozen semantic quality`);
      equal(opaque.result.upstream.quality, 'medium', `${operationQuality}: actual request translates the admitted choice once`);
    }
    // A legitimate new stage changes its frozen facts and corresponding plan.
    // The original user/price selection may still be high; operation quality is
    // not independently trusted because generate-image may already map it.
    const stageValue = make({selected: {...high, quality: 'medium'}});
    stageValue.scope.frozen.requestedParameters = {...high};
    stageValue.quote.requestedParameters = {...high};
    const stage = await parameters('legitimate changed frozen semantic stage', stageValue, {...high, quality: 'low'});
    equal(stage.selected.quality, 'medium', 'explicit frozen stage semantic change remains valid');
    equal(stage.result.upstream.quality, 'low', 'new frozen stage maps its own input once');
    const emptyStageValue = make({qualities: [], selected: {...high, quality: 'medium', ratio: '3:4'}});
    emptyStageValue.scope.frozen.requestedParameters = {...high};
    emptyStageValue.quote.requestedParameters = {...high};
    const emptyStage = await parameters('changed frozen stage with missing discovery', emptyStageValue, {...high, quality: 'low', ratio: '3:4'});
    equal(emptyStage.selected.quality, 'medium', 'new semantic stage uses frozen input, not metadata whitelist');
    equal(emptyStage.result.upstream, {quality: 'low', resolution: '2k', size: '3:4'}, 'stage mapping retains effective frame');

    const fallbackValue = make();
    fallbackValue.quote.effectiveParameters.resolution = '2K';
    const fallback = await parameters('explicit resolution fallback', fallbackValue, {...high, resolution: '2K'});
    equal(fallback.selected.resolution, '2K', 'explicit actual resolution still takes effect');
    equal(fallback.result.upstream.resolution, '2k', 'fallback resolution reaches wire');
    equal(fallback.result.upstream.quality, 'medium', 'resolution fallback does not remap quality twice');
    equal(fallbackValue.quote.requestedParameters.resolution, '4K', 'original priced resolution kept');
    equal([fallbackValue.quote.requestedCredits, fallbackValue.quote.authorizedCredits, fallbackValue.quote.reserveCredits], [12, 12, 12], 'quote amounts unchanged, not a settlement integration test');

    const legacyValue = make({legacy: true, selected: {...high, resolution: '1K'}});
    const legacy = await parameters('legacy frozen interpretation', legacyValue, {...high, resolution: '1K'});
    equal(legacy.selected.quality, 'medium', 'legacy effective quality priority preserved');
    equal(legacy.result.upstream.quality, 'low', 'legacy unversioned interpretation is not retroactively changed');

    const presetConfig = fixtureModelConfig('https://fixture.invalid/v1', credentialRef);
    presetConfig.providers[0].protocol = 'apimart-images';
    presetConfig.upstreamModels[0].capabilities.qualities = ['low', 'medium'];
    presetConfig.upstreamModels[0].capabilities.nativeResolutions = ['1K', '2K', '4K'];
    presetConfig.upstreamModels[0].parameterMap = {};
    const preset = initializeImagePreset(presetConfig);
    const stamp = '2026-10-29T00:00:00.000Z';
    Object.assign(preset, {
      enabled: true, upstreamId: 'u1', qualityParameter: 'quality',
      authorizationCnyMicros: '1000000', creditsPerCnyMicros: '1000000',
      evidence: {actualModel: 'wire-image-one', source: 'isolated parameter fixture, no supplier proof', checkedAt: stamp, confirmed: true},
      resolutions: ['1K', '2K', '4K'], ratios: ['1:1'], resolutionMap: {'1K': '1k', '2K': '2k', '4K': '4k'}, ratioMap: {'1:1': '1:1'},
      outputDimensions: Object.fromEntries(['1K', '2K', '4K'].map(r => [`${r}:1:1`, {width: 1024, height: 1024}])),
      prices: ['low', 'medium'].flatMap(quality => ['1K', '2K', '4K'].map(resolution => ({quality, resolution,
        procurement: {confirmed: true, currency: 'CNY', basis: 'image', amountMicros: '100000', source: 'isolated fixture cost', updatedAt: stamp}}))),
    });
    presetConfig.defaultImagePreset = preset;
    const verifiedPreset = validateModelConfig(presetConfig).defaultImagePreset!;
    const presetScope = {...make().scope, imagePreset: verifiedPreset};
    delete (presetScope.frozen as {imageParameterPlanVersion?: number}).imageParameterPlanVersion;
    delete (presetScope.frozen as {imageParameterPlans?: unknown}).imageParameterPlans;
    for (const resolution of ['1K', '2K']) {
      const quote = {requestedParameters: {...high}, effectiveParameters: {...high, quality: 'medium'}, requestedCredits: 12};
      const before = structuredClone(quote);
      const chosen = apimartExecutionParameters(presetScope, {}, quote, {quality: 'low', resolution, ratio: '1:1'});
      equal(chosen.resolution, resolution, `legacy preset operation resolution ${resolution} wins`);
      equal(effectiveImageParameters(verifiedPreset, chosen).upstream.resolution, resolution.toLowerCase(), `preset wire ${resolution}`);
      equal(quote, before, 'preset quote unchanged');
    }
    const presetFallbackQuote = {requestedParameters: {...high}, effectiveParameters: {...high, quality: 'medium', resolution: '2K'}};
    const presetFallback = apimartExecutionParameters(presetScope, {}, presetFallbackQuote, {...high, resolution: '1K'});
    equal(presetFallback.resolution, '2K', 'new explicit preset fallback retains effective tier');
    equal(effectiveImageParameters(verifiedPreset, presetFallback).upstream.resolution, '2k', 'preset fallback wire');

    equal(networkCalls, 0, 'no network or supplier calls');
    console.log(`APIMART_SINGLE_PASS=PASS CHECKS=${checks} CASES=${cases} NON_IDEMPOTENT_MAP=ONCE EMPTY_METADATA=PASS OMIT=PASS SEMANTIC_STAGE=PASS PRESET_LEGACY=PRESERVED ORIGINAL_QUOTE=UNCHANGED NETWORK=0 DATABASE=DISABLED`);
    console.log(`ADAPTER_SOURCE_SHA256=${createHash('sha256').update(readFileSync(adapterFile)).digest('hex')}`);
  } finally {
    globalThis.fetch = fetch;
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
