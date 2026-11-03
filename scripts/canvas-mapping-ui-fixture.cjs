'use strict';
// Declared loopback HTTP boundaries for full Next/ReactFlow acceptance. This is
// not production auth, server-side prompt authorization, wallet or supplier proof.
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
function fixtureAccount() {
  return { persisted: true, user: { email: 'mapping-ui-fixture@example.test', name: '映射整合测试',
    plan: 'starter', creditsTotal: 10000, creditsUsed: 0, joinedAt: '2026-01-01T00:00:00Z',
    renewsAt: '2027-01-01T00:00:00Z', invoices: [], canHigh: true },
    artworks: [{ id: 'fixture-seed', title: '测试商品', category: 'main', status: 'completed',
      prompt: '保持商品', image: '/media/fixture-seed.png', createdAt: '2026-11-01T00:00:00Z', gradient: 'from-slate-100 to-white', origin: 'canvas' }] };
}
function requireLoopback(base) {
  const url = new URL(base);
  assert.equal(url.protocol, 'http:'); assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'UI fixture is loopback only');
}
function commonFixture({ account, artworks, state }) {
  const prompts = new Map(), operations = new Map(), names = {};
  state.promptRequests ||= [];
  const model = { id: 'gpt-image-2', label: 'GPT-Image-2.5', modality: 'image', provider: 'managed',
    supportsEdit: true, qualitySupported: true, qualities: ['medium'], nativeResolutions: ['1K'],
    generationParameters: { ratios: ['1:1', '3:4', '9:16', '16:9'], resolutions: ['1K'] }, maxReferenceImages: 16 };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  async function handle(route) {
    const request = route.request(), u = new URL(request.url()), p = u.pathname, method = request.method();
    if (p === '/api/config') { await json(route, { db: true, storage: true, authMode: 'mock', multiUser: true,
      creditsMetered: true, imageModels: [model], imageModelBindings: { 'image.generate': model.id, 'image.edit': model.id },
      defaultImageModel: model.id, modelVersion: 1, imageQualityCapable: true }); return true; }
    if (p === '/api/auth/session') { await json(route, { user: account.user }); return true; }
    if (p === '/api/feature-access') { await json(route, { email: account.user.email, policy: { mode: 'default', allowed: [], version: 1 } }); return true; }
    if (p === '/api/models') { await json(route, { managed: true, supported: true, available: true, version: 1,
      feature: u.searchParams.get('feature'), models: [model], defaultModelId: model.id }); return true; }
    if (p === '/api/text-models') { await json(route, { models: [], defaultModel: '' }); return true; }
    if (p === '/api/video/catalog') { await json(route, { models: [], enabled: false, version: 1 }); return true; }
    if (method === 'GET' && ['/api/canvas/image-tasks', '/api/video/tasks', '/api/video/workflows'].includes(p)) { await json(route, { tasks: [], workflows: [], persisted: true }); return true; }
    if (p === '/api/billing/catalog') { await json(route, { version: 1, features: Object.fromEntries(['image.generate', 'canvas.image', 'canvas.expand', 'canvas.text-generate', 'canvas.assistant', 'tool.cutout'].map(id => [id, { enabled: true, label: id, unit: 'image', prices: { medium: { '1K': 6 } } }])), products: [], thresholds: { highQualityPaidFen: 0, agentConfirmCredits: 100 }, effective: { metering: true, commerce: false, recharge: false } }); return true; }
    if (p === '/api/billing/quote') { const input = request.postDataJSON(); await json(route, { ...input, credits: 6, reserveCredits: 6, version: 1 }); return true; }
    if (p === '/api/canvas/node-settings') { await json(route, { persisted: true, settings: {} }); return true; }
    if (p === '/api/projects') {
      if (method === 'POST') { const input = request.postDataJSON(); names[input.key] = input.name; await json(route, { ok: true, name: input.name }); }
      else await json(route, { names }); return true;
    }
    if (p === '/api/canvas/image-prompts') {
      const input = method === 'GET' ? Object.fromEntries(u.searchParams) : request.postDataJSON();
      const key = input.projectKey + '|' + input.nodeId;
      const art = artworks.find(art => art.id === input.nodeId);
      state.promptRequests.push({ method, ...clone(input) });
      if (!art || input.projectKey !== 'tree:' + (art.groupId || art.id)) { await json(route, { error: 'fixture prompt node/project mismatch', code: 'IMAGE_PROMPT_NODE_UNAVAILABLE' }, 404); return true; }
      const current = prompts.get(key) || { document: null, revision: 0 };
      if (method === 'GET') { await json(route, { ...clone(current), workspace: 'personal', persisted: true }); return true; }
      assert.equal(method, 'POST');
      if (state.promptSaveGate) { const gate = state.promptSaveGate; state.promptSaveGate = null; gate.entered = true; await gate.promise; }
      const fingerprint = JSON.stringify(input), old = operations.get(input.operationId);
      if (old) { await json(route, old.fingerprint === fingerprint ? old.result : { error: 'fixture operation conflict' }, old.fingerprint === fingerprint ? 200 : 409); return true; }
      if (input.expectedRevision !== current.revision) { await json(route, { error: 'fixture prompt revision conflict', code: 'IMAGE_PROMPT_REVISION_CONFLICT' }, 409); return true; }
      const doc = input.document;
      assert.equal(doc.version, 1); assert.equal(typeof doc.prompt, 'string');
      assert(Array.isArray(doc.bindings) && Array.isArray(doc.activeKeys) && Array.isArray(doc.additionalKeys) && Array.isArray(doc.hiddenReferenceIds));
      assert.equal(new Set(doc.bindings.map(b => b.key)).size, doc.bindings.length);
      assert.equal(new Set(doc.bindings.map(b => b.number)).size, doc.bindings.length);
      assert(doc.activeKeys.every(k => doc.bindings.some(b => b.key === k) && artworks.some(a => 'node:' + a.id === k)));
      assert(doc.additionalKeys.every(k => doc.activeKeys.includes(k)));
      const result = { document: clone(doc), revision: current.revision + 1, workspace: 'personal', persisted: true };
      prompts.set(key, result); operations.set(input.operationId, { fingerprint, result: clone(result) });
      await json(route, result); return true;
    }
    return false;
  }
  return { handle, prompts };
}
module.exports = { fixtureAccount, requireLoopback, commonFixture };

