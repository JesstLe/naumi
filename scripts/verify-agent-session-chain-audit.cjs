// Diagnosis only: execute the current runtime against two synthetic slot snapshots.
// A reproduced defect is evidence, not a repaired behavior or live database test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const source = path.resolve(process.argv[2] || '.');

async function bundle(relative, mocks, mockEverything = false) {
  const entry = path.join(source, relative);
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-dependencies', setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') return;
        if (Object.hasOwn(mocks, args.path) || mockEverything) return { path: args.path, namespace: 'fixture' };
        if (args.path === 'server-only') return { path: args.path, namespace: 'fixture' };
        if (args.path.startsWith('@/')) {
          for (const ext of ['.ts', '.tsx']) {
            const file = path.join(source, 'src', args.path.slice(2)) + ext;
            if (fs.existsSync(file)) return { path: file };
          }
        }
      });
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: mocks[args.path] || 'module.exports={};', loader: 'js',
      }));
    } }],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
}

(async () => {
  const f = global.__agentSessionChainFixture = {
    reads: 0, writes: 0, registry: { sessions: new Map(), creating: new Map() },
    durable: { messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'first result' },
      { role: 'user', content: 'new requirement on slot B' }, { role: 'assistant', content: 'slot B result' }],
      steps: [{ type: 'assistant', turnId: 'turn-a', text: 'first result' }, { type: 'assistant', turnId: 'turn-b', text: 'slot B result' }] },
  };
  const originalFetch = global.fetch;
  global.fetch = async () => { throw Error('NETWORK_NOT_ALLOWED'); };
  try {
    const runtime = await bundle('src/lib/agent/runtime.ts', {
      '@/lib/db': `module.exports={dbEnabled:true,getAgentSession:async()=>{const f=global.__agentSessionChainFixture;f.reads++;return structuredClone(f.durable)},saveAgentSession:async(email,id,title,messages,steps)=>{const f=global.__agentSessionChainFixture;f.writes++;f.durable={messages:structuredClone(messages),steps:structuredClone(steps)}}};`,
      '@/lib/release-runtime/identity': `module.exports={releaseProcessRegistry:()=>global.__agentSessionChainFixture.registry};`,
      '@/lib/model-config/context': `module.exports={currentModelExecution:()=>undefined,currentExecutionBundle:()=>undefined};`,
      './harness': `module.exports={validateHarnessHistory:()=>{}};`,
    }, true);
    const cached = {
      id: 'ag-fixture', email: 'owner@example.test', title: 'fixture', modelId: 'fixture-model',
      contextStamp: JSON.stringify({ imageSkill: null }), running: false, lastUsedAt: Date.now(),
      cred: { cookie: '', authorization: '' }, harness: { publicText: x => x },
      agent: { state: { messages: [{ role: 'user', content: 'first' },
        { role: 'assistant', content: [{ type: 'text', text: 'first result' }] }] } },
      events: [{ type: 'assistant', at: 1, data: { turnId: 'turn-a', text: 'first result' } }],
    };
    f.registry.sessions.set('owner@example.test::ag-fixture', cached);
    const returned = await runtime.getOrCreateSession(cached.email, cached.id, [], cached.cred, cached.modelId);
    assert.equal(returned, cached);
    assert.equal(f.reads, 0);
    assert.equal(returned.agent.state.messages.length, 2);
    assert.equal(f.durable.messages.length, 4);
    console.log('CHECK=idle cached session reused without reading newer durable history');
    await runtime.persistAgentSession(returned);
    assert.equal(f.writes, 1);
    assert.equal(f.durable.messages.length, 2);
    assert.equal(f.durable.steps.length, 1);
    assert.ok(!JSON.stringify(f.durable).includes('turn-b'));
    console.log('CHECK=actual runtime serializer overwrites newer mocked store from 4 messages to 2');

    const db = fs.readFileSync(path.join(source, 'src/lib/db.ts'), 'utf8');
    const save = db.slice(db.indexOf('export async function saveAgentSession('), db.indexOf('// 旧库迁移:', db.indexOf('export async function saveAgentSession(')));
    assert.match(save, /messages\s*=\s*EXCLUDED\.messages/);
    assert.match(save, /steps\s*=\s*EXCLUDED\.steps/);
    assert.doesNotMatch(save, /expectedRevision|expectedVersion|expectedState|WHERE.*updated_at/);
    console.log('CHECK=database upsert has no expected snapshot condition');

    const schema = await bundle('src/lib/imagegen/schema.ts', {});
    const base = { version: 1, operationId: '00000000-0000-4000-8000-000000000001', entry: 'agent', mode: 'edit', prompt: 'Keep the layout and replace the product',
      inputs: [{ artworkId: 'layout', role: 'reference' }, { artworkId: 'product', role: 'insert' }],
      parameters: { ratio: '1:1', resolution: '1K' }, output: { format: 'png' } };
    assert.equal(schema.imagegenRequestSchema.safeParse(base).success, false);
    assert.equal(schema.imagegenRequestSchema.safeParse({ ...base, inputs: [{ artworkId: 'layout', role: 'edit-target' }, base.inputs[1]] }).success, true);
    console.log('CHECK=two images require an explicit edit target; corrected roles are accepted');

    const tools = fs.readFileSync(path.join(source, 'src/lib/agent/naumi-tools.ts'), 'utf8');
    const vision = tools.slice(tools.indexOf('name: "verify_image_output"'), tools.indexOf('\n  if (canvas)', tools.indexOf('name: "verify_image_output"')));
    assert.match(vision, /fd\.append\("image"/);
    assert.match(vision, /fd\.append\("goal"/);
    assert.doesNotMatch(vision, /fd\.append\("(?:reference|original|product)"/);
    console.log('CHECK=visual review wrapper submits one output and goal, not comparison sources');
    console.log('AGENT_CHAIN_AUDIT=CONFIRMED CHECKS=5 STALE_CACHE=1 NEWER_HISTORY_LOST=1 REAL_RUNTIME=1 DB_MOCK=1 SUPPLIER_CALLS=0');

    // Optional sanitized config projection; routing, not supplier execution.
    if (process.env.AGENT_CHAIN_ROUTING_FIXTURE) {
      const config = JSON.parse(fs.readFileSync(process.env.AGENT_CHAIN_ROUTING_FIXTURE, 'utf8'));
      const routing = await bundle('src/lib/model-config/runtime.ts', {
        './schema': 'module.exports={validateModelConfig:x=>x};',
        './image-preset': 'module.exports={selectedImagePreset:()=>null};',
        './channel-policy': 'module.exports={publicUpstreamIds:(c,m)=>m.supplierRouting?m.supplierRouting.channels.filter(x=>x.enabled).map(x=>x.upstreamId):[m.target.id]};',
        './projection': 'module.exports={monetaryCost:()=>null,modelCostRate:()=>null};',
        '../imagegen/capabilities': 'module.exports={missingImagegenCapabilities:()=>[],publishedImagegenCapabilities:x=>x};',
        './types': 'module.exports={ModelConfigError:class extends Error{}};',
      }, true);
      // The original saved projection intentionally contains no provider secrets,
      // parameter maps or prices. This focused replay only tests reference counts.
      for (const upstream of config.upstreamModels) upstream.parameterMap = {};
      const facts = { task: 'product', quality: 'medium', resolution: '1K', ratio: '1:1', needsEdit: true,
        needsMask: false, needsText: false, preserveIdentity: true, nativeResolution: false, references: 2, quantity: 1 };
      const simulate = id => routing.simulateModel({ version: 150, config }, { version: 8, config: {} }, id, facts);
      const banana = simulate('gemini-3.0-pro-image-three-four');
      assert.equal(banana.eligible.length, 0);
      assert.ok(banana.excluded.some(x => x.codes.includes('REFERENCE_LIMIT')));
      const gpt = simulate('gpt-image-2');
      assert.equal(gpt.eligible.length, 2);
      console.log('ROUTING_PROJECTION=CONFIRMED BANANA_TWO_REFS=REFERENCE_LIMIT GPT_TWO_REFS=2_ELIGIBLE REAL_ROUTING=1 OTHER_CHECKS_MOCKED=1 SUPPLIER_CALLS=0');
    }
  } finally { global.fetch = originalFetch; delete global.__agentSessionChainFixture; }
})().catch(error => { console.error(error); process.exitCode = 1; });
