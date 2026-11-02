// Complete production client/recovery modules; only authentication, image-header
// inspection and HTTP are fixtures. No supplier, database, cancellation or refund.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript'), crypto = require('node:crypto');
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const positional = args.filter((value, index) => !value.startsWith('--') && !(index && args[index - 1].startsWith('--')));
const root = path.resolve(arg('--source-root', positional[0] || '.'));
const fallback = process.cwd(), out = path.resolve(arg('--output-root', positional[1] || 'output/canvas-background-receipts'));
fs.mkdirSync(out, { recursive: true });
const loaded = [], checks = [], memory = new Map();
const sessionStorage = { get length() { return memory.size; }, key: i => [...memory.keys()][i] ?? null,
  getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
const state = { posts: [], plans: [], gets: [], uploads: [], quotes: new Map(), accepted: new Map(), loseNextAck: false, get404: false };
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixtureFetch(url, init = {}) {
  if (url === '/api/imagegen/inputs') {
    const file = init.body.get('image');
    state.uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()).toString('hex') });
    return Response.json({ artworkId: 'asset-' + state.uploads.length, url: '/fixture.png', width: 1024, height: 1024 });
  }
  if (url === '/api/imagegen/plan') {
    const request = JSON.parse(init.body), id = uuid(state.plans.length + 1);
    state.plans.push(clone(request));
    const plan = { request: { ...request, parameters: { ...request.parameters, resolution: '2K' } },
      requestedParameters: clone(request.parameters), intent: { background: null }, steps: [{ operation: 'edit', credits: 12 }],
      warnings: ['4K→2K，报价不变'], totalCredits: 12, confirmationRequired: false, billingVersion: 8, modelVersion: 125, quote: { id } };
    state.quotes.set(id, { request: clone(request), plan: clone(plan) });
    return Response.json(plan);
  }
  if (url === '/api/imagegen' && init.method === 'POST') {
    const body = JSON.parse(init.body), quote = state.quotes.get(body.quoteId);
    assert.ok(quote, 'paid submission references an existing frozen quote');
    assert.equal(body.operationId, quote.request.operationId);
    assert.deepEqual(Object.keys(body).sort(), ['confirmed', 'operationId', 'quoteId']);
    state.posts.push(clone(body));
    state.accepted.set(body.operationId, { request: clone(quote.request), authorizedCredits: quote.plan.totalCredits });
    if (state.loseNextAck) { state.loseNextAck = false; throw Error('fixture: upstream accepted, browser ACK lost'); }
    return Response.json({ operationId: body.operationId, jobId: 'imagegen-' + body.operationId, status: 'pending' });
  }
  if (String(url).startsWith('/api/imagegen?')) {
    const operationId = new URL(url, 'http://fixture').searchParams.get('operationId');
    state.gets.push({ operationId, headers: clone(init.headers) });
    if (state.get404) return Response.json({ error: 'fixture: temporary receipt unavailable' }, { status: 404 });
    assert.ok(state.accepted.has(operationId));
    return Response.json({ operationId, jobId: 'imagegen-' + operationId, status: 'pending', artifacts: [] });
  }
  throw Error('Unexpected network, including forbidden cancel/refund: ' + url);
}
function createLoader() {
  const sandbox = { console, Response, Request, Headers, FormData, Blob, File, URL, AbortSignal, TextEncoder, TextDecoder,
    crypto: crypto.webcrypto, Map, Set, Date, Promise, JSON, Error, structuredClone, sessionStorage, window: {}, fetch: fixtureFetch };
  const context = vm.createContext(sandbox), cache = new Map();
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const selected = path.join(root, rel), file = fs.existsSync(selected) ? selected : path.join(fallback, rel);
    const source = fs.readFileSync(file, 'utf8'), mod = { exports: {} };
    cache.set(rel, mod.exports);
    loaded.push({ file, sha256: crypto.createHash('sha256').update(source).digest('hex') });
    function req(id) {
      if (id === '../supabase') return { authHeader: async () => ({ authorization: 'ephemeral-fixture-not-for-storage' }) };
      if (id === '../browser-reference-image') return { prepareReferenceImage: async file => ({ file, sourceWidth: 1024, sourceHeight: 1024, optimized: false }), browserImageHeader: async () => ({ width: 1024, height: 1024 }) };
      if (id.startsWith('@/')) return load('src/' + id.slice(2) + (/\.[cm]?[jt]sx?$/.test(id) ? '' : '.ts'));
      if (!id.startsWith('.')) return require(id);
      const relPath = path.posix.normalize(path.posix.join(path.posix.dirname(rel), id));
      return load(relPath + (/\.[cm]?[jt]sx?$/.test(relPath) ? '' : '.ts'));
    }
    const code = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInContext('(function(require,module,exports){' + code + '\n})', context, { filename: file })(req, mod, mod.exports);
    return mod.exports;
  }
  return { client: load('src/lib/imagegen/canvas-client.ts'), recovery: load('src/lib/imagegen/client-recovery.ts') };
}
const scope = { owner: 'background@test.invalid', workspace: 'personal', project: 'tree:source' };
function form(attempt, prompt = '保持主体，背景更明亮') {
  const value = new FormData();
  for (const [key, input] of Object.entries({ imagegenNodeId: `node:source:attempt:${attempt}`, prompt, parentId: 'source', quality: 'medium', resolution: '4K', ratio: '1:1', count: '1' })) value.set(key, input);
  value.append('image', new File(['fixture-reference'], 'reference.png', { type: 'image/png' }));
  return value;
}
function stored(recovery, value, selectedScope = scope) {
  const key = recovery.pendingAttemptKey(selectedScope.owner, selectedScope.workspace, selectedScope.project, 'node:' + value.get('imagegenNodeId'));
  return { key, value: recovery.readPendingAttempt(key) };
}
const counts = () => ({ posts: state.posts.length, plans: state.plans.length, uploads: state.uploads.length });
async function main() {
  let { client, recovery } = createLoader();
  const A = form('A', '第一个提示词：蓝色背景'), B = form('B', '第二个提示词：绿色背景');
  const aResponse = await client.submitCanvasImagegen(A, undefined, undefined, scope), a = await aResponse.json();
  const aOriginal = memory.get(stored(recovery, A).key), acceptedOriginal = clone(state.accepted.get(a.operationId || a.jobId.slice(9)));
  await client.submitCanvasImagegen(B, undefined, undefined, scope);
  const pA = stored(recovery, A).value, pB = stored(recovery, B).value;
  assert.notEqual(pA.operationId, pB.operationId); assert.notEqual(pA.quoteId, pB.quoteId);
  assert.equal(state.posts.length, 2); assert.equal(memory.get(stored(recovery, A).key), aOriginal);
  assert.deepEqual(state.accepted.get(pA.operationId), acceptedOriginal);
  assert.equal(pA.request.prompt, A.get('prompt')); assert.equal(pB.request.prompt, B.get('prompt'));
  checks.push('ACCEPTED_A_AND_EXPLICIT_B_HAVE_DISTINCT_IDS_QUOTES_POSTS_OLD_INPUT_UNCHANGED');

  for (const p of [pA, pB]) {
    assert.equal(p.request.parameters.resolution, '4K'); assert.equal(p.authorizedCredits, 12);
    assert.equal(state.quotes.get(p.quoteId).plan.request.parameters.resolution, '2K');
    assert.equal(state.accepted.get(p.operationId).authorizedCredits, 12);
  }
  assert.ok([...memory.values()].every(value => !value.includes('ephemeral-fixture-not-for-storage')));
  checks.push('ORIGINAL_4K_QUOTE_12_PRESERVED_WHILE_PLAN_EFFECTIVE_2K_NO_AUTH_STORED');

  const C = form('C', B.get('prompt')); await client.submitCanvasImagegen(C, undefined, undefined, scope);
  assert.notEqual(stored(recovery, C).value.operationId, pB.operationId); assert.equal(state.posts.length, 3);
  checks.push('UNCHANGED_PROMPT_EXPLICIT_NEW_ATTEMPT_IS_A_NEW_PURCHASE');

  const D = form('D'), beforeConcurrent = counts();
  const concurrent = await Promise.all([client.submitCanvasImagegen(D, undefined, undefined, scope), client.submitCanvasImagegen(D, undefined, undefined, scope)]);
  const [d1, d2] = await Promise.all(concurrent.map(response => response.json()));
  assert.equal(d1.jobId, d2.jobId); assert.equal(state.posts.length, beforeConcurrent.posts + 1);
  assert.equal(state.plans.length, beforeConcurrent.plans + 1); assert.equal(state.uploads.length, beforeConcurrent.uploads + 1);
  checks.push('SAME_ATTEMPT_CONCURRENT_EVENTS_SHARE_ONE_UPLOAD_QUOTE_AND_POST');

  const U = form('UNKNOWN'), bBytes = memory.get(stored(recovery, B).key); state.loseNextAck = true;
  await assert.rejects(client.submitCanvasImagegen(U, undefined, undefined, scope), /ACK lost/);
  const unknown = stored(recovery, U), unknownBytes = memory.get(unknown.key), beforeUnknown = counts();
  assert.equal(unknown.value.accepted, 'unknown');
  U.set('prompt', '后来修改的草稿绝不能改写原未知任务'); state.get404 = true;
  await assert.rejects(client.submitCanvasImagegen(U, undefined, undefined, scope));
  assert.deepEqual(counts(), beforeUnknown); assert.equal(memory.get(unknown.key), unknownBytes);
  assert.equal(memory.get(stored(recovery, B).key), bBytes);
  checks.push('UNKNOWN_404_RETRY_GET_ONLY_RETAINS_ORIGINAL_RECEIPT_AND_OTHER_TASK');

  const E = form('E', '明确另开一次生成'); state.get404 = false;
  await client.submitCanvasImagegen(E, undefined, undefined, scope);
  assert.equal(memory.get(unknown.key), unknownBytes);
  const beforeRecover = counts(); await client.submitCanvasImagegen(U, undefined, undefined, scope);
  assert.deepEqual(counts(), beforeRecover); assert.equal(state.gets.at(-1).operationId, unknown.value.operationId);
  assert.equal(stored(recovery, U).value.request.prompt, '保持主体，背景更明亮');
  checks.push('NEW_EXPLICIT_TASK_DOES_NOT_ERASE_UNKNOWN_OLD_RECOVERY_USES_ORIGINAL_ID');

  const beforeReload = counts(), expectedIds = recovery.listPendingAttempts(scope).map(p => p.operationId).sort();
  ({ client, recovery } = createLoader());
  assert.deepEqual(Array.from(recovery.listPendingAttempts(scope), p => p.operationId).sort(), Array.from(expectedIds));
  await client.submitCanvasImagegen(B, undefined, undefined, scope);
  assert.deepEqual(counts(), beforeReload); assert.equal(state.gets.at(-1).operationId, pB.operationId);
  checks.push('RELOADED_FULL_MODULES_RESTORE_ALL_IDENTITIES_WITH_GET_ONLY');

  const storageBeforeForeign = [...memory.entries()];
  for (const otherScope of [{ ...scope, owner: 'other@test.invalid' }, { ...scope, workspace: 'enterprise:other' }, { ...scope, project: 'tree:other' }]) {
    assert.equal(recovery.listPendingAttempts(otherScope).length, 0);
    recovery.completeCanvasImagegen('imagegen-' + pA.operationId, otherScope);
  }
  assert.deepEqual([...memory.entries()], storageBeforeForeign);
  checks.push('FOREIGN_OWNER_WORKSPACE_AND_PROJECT_CANNOT_LIST_OR_CLEAR_RECEIPTS');

  const remaining = [...memory.entries()].filter(([key]) => key !== stored(recovery, A).key);
  recovery.completeCanvasImagegen('imagegen-' + pA.operationId, scope);
  assert.equal(stored(recovery, A).value, null); assert.deepEqual([...memory.entries()], remaining);
  assert.ok(stored(recovery, B).value); assert.ok(stored(recovery, U).value);
  checks.push('COMPLETING_A_CLEARS_ONLY_A_B_AND_RECOVERED_UNKNOWN_STAY_INTACT');

  return { status: 'PASS', checks, loaded, fixtureCounts: { ...counts(), gets: state.gets.length, retainedReceipts: memory.size },
    supplierCalls: 0, database: false, evidence: 'Production client/recovery modules, HTTP quote/receipt fixtures; not real supplier or wallet acceptance', exit: 0 };
}
main().then(result => {
  result.stdout = `CANVAS_BACKGROUND_RECEIPTS=PASS CHECKS=${checks.length} FULL_CLIENT_MODULES=1 SUPPLIER_CALLS=0 EXIT=0`;
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(result, null, 2)); console.log(result.stdout);
}).catch(error => {
  const stdout = `CANVAS_BACKGROUND_RECEIPTS=FAIL CHECKS=${checks.length} FULL_CLIENT_MODULES=1 SUPPLIER_CALLS=0 EXIT=1`;
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: 'FAIL', checks, loaded, error: error.stack, stdout, exit: 1 }, null, 2));
  console.error(stdout); console.error(error); process.exitCode = 1;
});
