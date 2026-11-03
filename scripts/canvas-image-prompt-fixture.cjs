'use strict';
// One owner for the declared image-prompt fixture protocol. HTTP adapters only
// decode their request and transport the returned status/body.
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));

function createImagePromptFixture({ getArtworks, state }) {
  const prompts = new Map(), operations = new Map();
  state.promptRequests ||= [];
  async function request(method, input) {
    const artworks = getArtworks();
    const key = input.projectKey + '|' + input.nodeId;
    const art = artworks.find(art => art.id === input.nodeId);
    state.promptRequests.push({ method, ...clone(input) });
    if (!art || input.projectKey !== 'tree:' + (art.groupId || art.id)) return { status: 404, body: { error: 'fixture prompt node/project mismatch', code: 'IMAGE_PROMPT_NODE_UNAVAILABLE' } };
    const current = prompts.get(key) || { document: null, revision: 0 };
    if (method === 'GET') return { status: 200, body: { ...clone(current), workspace: 'personal', persisted: true } };
    assert.equal(method, 'POST');
    if (state.promptSaveGate) { const gate = state.promptSaveGate; state.promptSaveGate = null; gate.entered = true; await gate.promise; }
    const fingerprint = JSON.stringify(input), old = operations.get(input.operationId);
    if (old) return { status: old.fingerprint === fingerprint ? 200 : 409, body: old.fingerprint === fingerprint ? old.result : { error: 'fixture operation conflict' } };
    if (input.expectedRevision !== current.revision) return { status: 409, body: { error: 'fixture prompt revision conflict', code: 'IMAGE_PROMPT_REVISION_CONFLICT' } };
    const doc = input.document;
    assert.equal(doc.version, 1); assert.equal(typeof doc.prompt, 'string');
    assert(Array.isArray(doc.bindings) && Array.isArray(doc.activeKeys) && Array.isArray(doc.additionalKeys) && Array.isArray(doc.hiddenReferenceIds));
    assert.equal(new Set(doc.bindings.map(b => b.key)).size, doc.bindings.length);
    assert.equal(new Set(doc.bindings.map(b => b.number)).size, doc.bindings.length);
    assert(doc.activeKeys.every(k => doc.bindings.some(b => b.key === k) && artworks.some(a => 'node:' + a.id === k)));
    assert(doc.additionalKeys.every(k => doc.activeKeys.includes(k)));
    const result = { document: clone(doc), revision: current.revision + 1, workspace: 'personal', persisted: true };
    prompts.set(key, result); operations.set(input.operationId, { fingerprint, result: clone(result) });
    return { status: 200, body: result };
  }
  // Keep the mapping harness's existing observation map without duplicating state.
  return { request, prompts };
}
module.exports = { createImagePromptFixture };
