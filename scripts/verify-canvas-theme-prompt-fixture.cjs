'use strict';
// Narrow executable contract: the actual theme route callback, actual old proxy
// callback, ImagePromptClient and the selected-image consumer gate. HTTP/browser,
// React lifecycle completion and creation execution are explicit external ports.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ts = require('typescript');
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sourceRoot = path.resolve(arg('--source-root', process.cwd()));
const out = path.resolve(arg('--out', process.env.CANVAS_TEST_OUT || path.join(sourceRoot, 'output/canvas-theme-prompt-fixture')));
// An optional sealed old source is differential evidence, never a requirement
// for ordinary tracked CI. Without it, assert the fixed protocol contract once.
const baselineRoot = args.includes('--baseline-root') ? path.resolve(arg('--baseline-root')) : null;
// Formal CI owns sourceRoot/output. Other in-source destinations are rejected;
// copied-source comparisons normally keep evidence completely outside the copy.
const relativeOut = path.relative(sourceRoot, out);
assert(relativeOut === '..' || relativeOut.startsWith('..' + path.sep) || path.isAbsolute(relativeOut) || relativeOut === 'output' || relativeOut.startsWith('output' + path.sep), '--out must be external or inside sourceRoot/output');
fs.mkdirSync(out, { recursive: true });
const report = { sourceRoot, baselineRoot, sources: {}, baselineSources: {}, checks: [], projections: {},
  evidenceTier: 'actual source callbacks + actual ImagePromptClient + extracted consumer; external route/HTTP/React-lifecycle/creation ports; no browser, PG, supplier or billing proof',
  mockedPorts: ['Playwright route transport over native Request/Response', 'HTTP request/response adapter without network', 'successful open -> React loaded-state transition', 'submission lock and creation-executor ports'],
  realSupplierCalls: 0, realPurchaseCalls: 0 };
const oracleBytes = fs.readFileSync(__filename);
report.oracle = { file: __filename, sha256: crypto.createHash('sha256').update(oracleBytes).digest('hex'), bytes: oracleBytes.length };
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function read(root, relative) {
  const file = path.resolve(root, relative), bytes = fs.readFileSync(file);
  const records = root === sourceRoot ? report.sources : report.baselineSources;
  records[relative.replaceAll('\\', '/')] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  return bytes.toString('utf8');
}
function parse(root, relative) {
  const text = read(root, relative);
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, relative.endsWith('.tsx') ? ts.ScriptKind.TSX : relative.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
}
function all(node, predicate, found = []) { if (predicate(node)) found.push(node); ts.forEachChild(node, child => { all(child, predicate, found); }); return found; }
function names(binding) { return ts.isIdentifier(binding) ? [binding.text] : binding.elements.flatMap(element => element.name ? names(element.name) : []); }
function declarationNames(statement) { return statement.declarationList.declarations.flatMap(declaration => names(declaration.name)); }
function transpile(text, filename) { return ts.transpileModule(text, { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const cache = new Map();
function load(root, relative) {
  const file = path.resolve(root, relative), key = root + '|' + file;
  if (cache.has(key)) return cache.get(key).exports;
  let text = read(root, path.relative(root, file));
  if (file.endsWith('.ts') || file.endsWith('.tsx')) text = transpile(text, file);
  const loadedModule = { exports: {} }; cache.set(key, loadedModule);
  const actualRequire = createRequire(__filename);
  function sourceRequire(id) {
    if (!id.startsWith('.') && !id.startsWith('@/')) return actualRequire(id);
    const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(file), id);
    const candidate = [target, target + '.ts', target + '.tsx', target + '.cjs', target + '.js', path.join(target, 'index.ts')].find(name => fs.existsSync(name) && fs.statSync(name).isFile());
    assert(candidate, 'actual source import resolves: ' + id);
    return load(root, path.relative(root, candidate));
  }
  vm.runInThisContext('(function(require,module,exports,__filename,__dirname){' + text + '\n})', { filename: file })(sourceRequire, loadedModule, loadedModule.exports, file, path.dirname(file));
  return loadedModule.exports;
}
function evaluate(body, scope, filename) {
  const keys = Object.keys(scope);
  return vm.runInThisContext('(function(' + keys.join(',') + '){' + body + '\n})', { filename })(...keys.map(key => scope[key]));
}
function extraction(file, node) { return { file, line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1, sha256: crypto.createHash('sha256').update(node.getText()).digest('hex'), bytes: Buffer.byteLength(node.getText()) }; }
function makeServe(root) {
  const relative = 'scripts/serve-canvas-regeneration-fixture.cjs', source = parse(root, relative);
  const call = all(source, node => ts.isCallExpression(node) && node.expression.getText(source) === 'http.createServer')[0];
  assert(call && ts.isArrowFunction(call.arguments[0]), 'actual proxy callback exists');
  const declarations = source.statements.filter(statement => ts.isVariableStatement(statement) && statement.pos < call.pos &&
    !declarationNames(statement).some(name => ['http', 'app', 'server'].includes(name)));
  const callback = evaluate(declarations.map(node => node.getText(source)).join('\n') + '\nreturn (' + call.arguments[0].getText(source) + ');',
    { crypto, process: { env: {} }, fs, path, Buffer, URL, http: { request() { throw Error('UNDECLARED_UPSTREAM_HTTP_PORT'); } } }, relative);
  report.extractions ||= {}; report.extractions.serveCallback = extraction(relative, call.arguments[0]);
  return async request => {
    let status = 200, headers = {}, payload;
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
    const req = { url: new URL(request.url).pathname + new URL(request.url).search, method: request.method, headers: Object.fromEntries(request.headers),
      async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); } };
    const res = { writeHead(code, next = {}) { status = code; headers = next; }, end(value = '') { payload = value; } };
    await callback(req, res); assert.notEqual(payload, undefined, 'actual proxy completed response');
    return new Response(payload, { status, headers });
  };
}
function makeTheme(root) {
  const relative = 'scripts/verify-canvas-theme-matrix.cjs', source = parse(root, relative);
  const call = all(source, node => ts.isCallExpression(node) && node.expression.getText(source) === 'context.route')[0];
  assert(call && ts.isArrowFunction(call.arguments[1]), 'actual theme context.route callback exists');
  let block = call.parent; while (block && !ts.isBlock(block)) block = block.parent;
  assert(block, 'route lexical block exists');
  const forbidden = new Set(['runtime', 'browser', 'context', 'page', 'pixels']);
  const declarations = block.statements.filter(statement => ts.isVariableStatement(statement) && statement.pos < call.pos && !declarationNames(statement).some(name => forbidden.has(name)));
  const imports = source.statements.filter(statement => ts.isVariableStatement(statement) && declarationNames(statement).includes('createImagePromptFixture'));
  const hasState = declarations.some(statement => declarationNames(statement).includes('promptFixtureState'));
  const hasOwner = declarations.some(statement => declarationNames(statement).includes('imagePromptFixture'));
  const getOwner = hasOwner ? 'imagePromptFixture' : 'null', getState = hasState ? 'promptFixtureState' : 'null';
  const result = evaluate(imports.concat(declarations).map(node => node.getText(source)).join('\n') +
    '\nreturn {callback:(' + call.arguments[1].getText(source) + '),getOwner:()=>(' + getOwner + '),getState:()=>(' + getState + '),getArtworks:()=>arts};',
    { require(id) { assert(id.startsWith('.'), 'theme owner is a local source import'); return load(root, path.relative(root, path.resolve(root, 'scripts', id))); },
      crypto, assert, Buffer, URL, pixels: Buffer.from('narrow-prompt-route-port'), process: { env: {} } }, relative);
  report.extractions ||= {}; report.extractions.themeRoute = extraction(relative, call.arguments[1]);
  report.themeOwnerImported = imports.length > 0; report.themeOwnerInitialized = hasOwner;
  const serve = makeServe(root), traffic = [];
  result.request = async (input, init) => {
    const native = new Request(new URL(input, 'http://127.0.0.1:15381'), init);
    const rawBody = native.method === 'GET' ? null : await native.clone().text();
    let response, transport;
    const route = { request: () => ({ url: () => native.url, method: () => native.method, headers: () => Object.fromEntries(native.headers), postDataJSON: () => JSON.parse(rawBody) }),
      async fetch() { return serve(native.clone()); },
      async fulfill(options) { transport = 'theme-fulfill'; response = new Response(options.body, { status: options.status || 200, headers: { 'content-type': options.contentType || 'application/json' } }); },
      async continue() { transport = 'actual-serve-callback'; response = await serve(native.clone()); },
      abort() { throw Error('EXTERNAL_ROUTE_ABORTED'); } };
    await result.callback(route); assert(response instanceof Response, 'native response transported');
    traffic.push({ method: native.method, path: new URL(native.url).pathname, input: rawBody ? JSON.parse(rawBody) : Object.fromEntries(new URL(native.url).searchParams),
      transport, status: response.status, body: plain(await response.clone().json()) });
    return response;
  };
  result.traffic = traffic;
  return result;
}
function consumer(root, client, key, address, document, loaded) {
  const hookFile = 'src/components/canvas/use-image-prompt-sync.ts', hook = parse(root, hookFile);
  const readyDeclaration = all(hook, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ready')[0];
  const hookReturn = all(hook, node => ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression) && node.expression.properties.some(property => property.name?.getText(hook) === 'flush'))[0];
  const flushProperty = hookReturn?.expression.properties.find(property => property.name?.getText(hook) === 'flush');
  assert(readyDeclaration?.initializer && ts.isPropertyAssignment(flushProperty), 'actual hook ready/flush expressions');
  const promptSync = evaluate('const ready=' + readyDeclaration.initializer.getText(hook) + ';return {ready,flush:' + transpile('const value=' + flushProperty.initializer.getText(hook) + ';', hookFile).replace(/^const value\s*=\s*/, '').replace(/;\s*$/, '') + '};',
    { key, loaded: loaded ? { key, client } : null, client, latest: { current: { document } } }, hookFile);
  const canvasFile = 'src/components/canvas/canvas-client.tsx', canvas = parse(root, canvasFile);
  const selectedFunction = all(canvas, node => ts.isFunctionDeclaration(node) && node.name?.text === 'generateSelectedImage')[0];
  const flushFunction = all(canvas, node => ts.isFunctionDeclaration(node) && node.name?.text === 'flushImagePrompts')[0];
  assert(selectedFunction && flushFunction, 'actual selected-image consumer functions');
  const state = { creationPortCalls: 0, errors: [], locks: 0, releases: 0 };
  const canvasAccountRef = { current: 'fixture-account' }, canvasContextEpochRef = { current: 1 };
  const scope = { selected: { id: address.nodeId }, canvasAccountRef, canvasContextEpochRef, canvasOwnerEpochRef: { current: { revision: 1 } },
    currentWorkspace: () => address.workspace, activeProjectRef: { current: { key: address.projectKey } }, imageSubmissionRef: { current: new Map() },
    canvasImageSubmissionKey: (...values) => values.join('|'), beginCanvasImageSubmission: () => { state.locks++; let released = false; return () => { if (released) return false; released = true; state.releases++; return true; }; },
    setImageSubmissionEpoch: () => {}, referenceUploadLock: { current: false }, promptSync, setGenError: error => state.errors.push(error),
    canvasImageCreationServices: () => ({ isCurrent: () => true }), executeCanvasImageCreation: async () => { state.creationPortCalls++; return null; },
    editPrompt: document.prompt, generationMode: 'standard', genRatio: '1:1', genStyle: null, genCount: 1, genResolution: '1K', visibleDockRefs: [], extraFiles: [], composerReferences: [], dockReferenceState: { error: null }, referenceError: null,
    newCanvasImageAttempt: () => 'narrow-creation-port' };
  const run = evaluate(transpile(flushFunction.getText(canvas) + '\n' + selectedFunction.getText(canvas), canvasFile) + '\nreturn generateSelectedImage;', scope, canvasFile);
  report.extractions ||= {}; report.extractions.hookReady = extraction(hookFile, readyDeclaration.initializer); report.extractions.hookFlush = extraction(hookFile, flushProperty.initializer);
  report.extractions.generateSelectedImage = extraction(canvasFile, selectedFunction); report.extractions.flushImagePrompts = extraction(canvasFile, flushFunction);
  return { run, state, ready: promptSync.ready };
}
const doc = (prompt = '保持【图1】商品，参考【图2】构图。') => ({ version: 1, prompt, bindings: [{ key: 'node:regeneration-root', number: 1, role: 'edit-target' }, { key: 'node:reference-neighbor', number: 2, role: 'reference' }], activeKeys: ['node:regeneration-root', 'node:reference-neighbor'], additionalKeys: ['node:reference-neighbor'], hiddenReferenceIds: [] });
const address = { projectKey: 'tree:regeneration-root', nodeId: 'regeneration-root', workspace: 'personal' };
function deferred() { let resolve; return { entered: false, promise: new Promise(done => { resolve = done; }), release: () => resolve() }; }
async function test(name, run) { try { const detail = await run(); report.checks.push({ name, status: 'PASS', ...(detail === undefined ? {} : { detail }) }); } catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message, stack: error.stack }); } }
async function mappingProjection(root) {
  const { commonFixture, fixtureAccount } = load(root, 'scripts/canvas-mapping-ui-fixture.cjs');
  const account = fixtureAccount(), arts = [{ id: 'regeneration-root' }, { id: 'reference-neighbor', groupId: 'regeneration-root' }];
  const state = {}, common = commonFixture({ account, artworks: arts, state }), rows = [];
  async function send(method, input, pathname = '/api/canvas/image-prompts', options = {}) {
    const request = new Request('http://127.0.0.1:15381' + pathname + (method === 'GET' && input ? '?' + new URLSearchParams(input) : ''), { method, ...(method === 'GET' ? {} : { body: JSON.stringify(input), headers: { 'content-type': 'application/json' } }) });
    let output;
    const route = { request: () => ({ url: () => request.url, method: () => request.method, postDataJSON: () => input }), fulfill: async value => { output = { status: value.status, body: JSON.parse(value.body), contentType: value.contentType }; } };
    try { const handled = await common.handle(route); if (!options.silent) rows.push({ method, path: pathname, input: plain(input), handled, response: plain(output) }); return output; }
    catch (error) { const failure = { name: error.name, code: error.code, message: error.message }; if (!options.silent) rows.push({ method, path: pathname, input: plain(input), error: failure }); return { error: failure }; }
  }
  const readAddress = { projectKey: address.projectKey, nodeId: address.nodeId };
  const write = { ...readAddress, expectedRevision: 0, operationId: 'op-original', document: doc() };
  assert.deepEqual((await send('GET', readAddress)).body, { document: null, revision: 0, workspace: 'personal', persisted: true });
  assert.equal((await send('POST', write)).body.revision, 1);
  assert.equal((await send('POST', write)).body.revision, 1);
  assert.equal((await send('POST', { ...write, document: doc('conflicting body') })).status, 409);
  assert.equal((await send('POST', { ...write, operationId: 'op-cas' })).body.code, 'IMAGE_PROMPT_REVISION_CONFLICT');
  assert.equal((await send('POST', { ...write, operationId: 'op-fingerprint', expectedRevision: 1, audit: { fullInput: 1 } })).body.revision, 2);
  assert.equal((await send('POST', { ...write, operationId: 'op-fingerprint', expectedRevision: 1, audit: { fullInput: 2 } })).status, 409);
  assert.equal((await send('GET', { ...readAddress, nodeId: 'missing' })).status, 404);
  assert.equal((await send('GET', { ...readAddress, projectKey: 'tree:wrong' })).status, 404);
  const malformed = [
    { ...doc(), version: 2 }, { ...doc(), prompt: 2 }, { ...doc(), bindings: null },
    { ...doc(), bindings: [doc().bindings[0], doc().bindings[0]] },
    { ...doc(), bindings: [doc().bindings[0], { ...doc().bindings[1], number: 1 }] },
    { ...doc(), activeKeys: ['node:not-bound'] },
    { ...doc(), bindings: [{ key: 'node:missing', number: 1, role: 'reference' }], activeKeys: ['node:missing'], additionalKeys: [] },
    { ...doc(), additionalKeys: ['node:not-active'] },
  ];
  for (const [index, document] of malformed.entries()) assert((await send('POST', { ...write, expectedRevision: 2, operationId: 'invalid-' + index, document })).error);
  const gate = deferred(); state.promptSaveGate = gate;
  let settled = false;
  const saving = send('POST', { ...write, expectedRevision: 2, operationId: 'op-gated', document: doc('gated') }).then(result => { settled = true; return result; });
  await Promise.resolve(); assert.equal(gate.entered, true); assert.equal(settled, false); assert.equal(state.promptSaveGate, null);
  rows.push({ gate: { entered: true, settledBeforeRelease: false, consumed: true } }); gate.release(); assert.equal((await saving).body.revision, 3);
  const receipt = await send('GET', readAddress); assert.equal(receipt.body.document.prompt, 'gated');
  // The original public observation map and all non-prompt branches remain covered.
  assert.deepEqual(plain(common.prompts.get(address.projectKey + '|' + address.nodeId)), receipt.body);
  const endpoints = ['/api/config', '/api/auth/session', '/api/feature-access', '/api/models', '/api/text-models', '/api/video/catalog', '/api/canvas/image-tasks', '/api/video/tasks', '/api/video/workflows', '/api/billing/catalog', '/api/canvas/node-settings', '/api/projects', '/not-owned'];
  for (const endpoint of endpoints) await send('GET', {}, endpoint);
  await send('POST', { feature: 'canvas.image', modelId: 'gpt-image-2' }, '/api/billing/quote');
  await send('POST', { key: 'tree:regeneration-root', name: 'project' }, '/api/projects'); await send('GET', {}, '/api/projects');
  rows.push({ promptRequests: plain(state.promptRequests), prompts: plain([...common.prompts]) });
  return rows;
}
async function main() {
  const theme = makeTheme(sourceRoot);
  if (theme.getOwner()) await test('theme owner resolves artwork lazily after the first actual account callback', async () => {
    assert.equal(theme.getArtworks(), undefined);
    const before = await theme.request('/api/canvas/image-prompts?' + new URLSearchParams({ projectKey: address.projectKey, nodeId: address.nodeId }));
    assert.equal(before.status, 404);
    await theme.request('/api/account');
    const after = await theme.request('/api/canvas/image-prompts?' + new URLSearchParams({ projectKey: address.projectKey, nodeId: address.nodeId }));
    assert.equal(after.status, 200); assert.deepEqual(await after.json(), { document: null, revision: 0, workspace: 'personal', persisted: true });
  });
  await theme.request('/api/account');
  const { ImagePromptClient } = load(sourceRoot, 'src/lib/canvas/image-prompt-client.ts');
  const client = new ImagePromptClient(theme.request, () => true, () => {}, 60000), key = JSON.stringify(['fixture-account', address.projectKey, address.nodeId]);
  let loaded = false, loadError, initial;
  try { initial = await client.open(key, address); loaded = true; } catch (error) { loadError = error.message; }
  report.open = { loaded, error: loadError || null, receipt: plain(initial), clientError: client.error(key) };
  await test('theme GET returns the complete original prompt receipt to the actual client', async () => {
    assert.equal(loaded, true, loadError); assert.deepEqual(plain(initial), { document: null, revision: 0, workspace: 'personal' });
  });
  await test('original selected-image consumer preserves the receipt gate', async () => {
    const consumerPort = consumer(sourceRoot, client, key, address, doc(), loaded);
    await consumerPort.run(); report.consumer = { ready: consumerPort.ready, ...consumerPort.state };
    assert.equal(consumerPort.ready, loaded); assert.equal(consumerPort.state.creationPortCalls, loaded ? 1 : 0);
    if (!loaded) assert.deepEqual(consumerPort.state.errors, ['提示词正在读取，请稍后重试']);
    if (loaded) assert.deepEqual(consumerPort.state.errors, []);
    assert.equal(consumerPort.state.releases, 1);
  });
  if (loaded) {
    await test('theme POST persists the actual document with revision and reload', async () => {
      const reloaded = new ImagePromptClient(theme.request, () => true, () => {}, 60000);
      try { const receipt = await reloaded.open('reload', address); assert.equal(receipt.revision, 1); assert.deepEqual(plain(receipt.document), doc()); }
      finally { reloaded.dispose(); }
    });
    await test('actual theme route preserves CAS, exact operation replay and full-input conflict', async () => {
      const input = { projectKey: address.projectKey, nodeId: address.nodeId, expectedRevision: 1, operationId: 'theme-op-original', document: doc('theme revision 2'), metadata: 'original' };
      const post = async body => { const response = await theme.request('/api/canvas/image-prompts', { method: 'POST', body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
      const saved = await post(input); assert.equal(saved.status, 200); assert.equal(saved.body.revision, 2);
      assert.deepEqual(await post(input), saved);
      assert.equal((await post({ ...input, metadata: 'changed' })).status, 409);
      const stale = await post({ ...input, operationId: 'theme-stale' }); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'IMAGE_PROMPT_REVISION_CONFLICT');
    });
    await test('actual theme owner reads lazy account artworks and rejects node/project/reference mismatches', async () => {
      const query = new URLSearchParams({ projectKey: 'tree:wrong', nodeId: address.nodeId });
      assert.equal((await theme.request('/api/canvas/image-prompts?' + query)).status, 404);
      const owner = theme.getOwner(); assert(owner, 'actual imported owner instance');
      const input = { projectKey: address.projectKey, nodeId: address.nodeId, expectedRevision: 2, operationId: 'invalid-reference', document: { ...doc(), activeKeys: ['node:unknown'] } };
      await assert.rejects(owner.request('POST', input));
      assert(theme.getArtworks().some(art => art.id === address.nodeId));
    });
    await test('actual client and original consumer wait for promptSaveGate before creation', async () => {
      const gate = deferred(), state = theme.getState(); assert(state); state.promptSaveGate = gate;
      const port = consumer(sourceRoot, client, key, address, doc('wait before creation'), true);
      let done = false; const running = port.run().then(() => { done = true; });
      for (let spin = 0; spin < 50 && !gate.entered; spin++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(gate.entered, true); assert.equal(done, false); assert.equal(port.state.creationPortCalls, 0);
      gate.release(); await running;
      // The preceding raw route CAS test deliberately advanced remote state. The
      // old client must retain that CAS conflict, not silently submit a stale draft.
      assert.equal(port.state.creationPortCalls, 0); assert(port.state.errors.some(error => /revision conflict/.test(error)));
      await client.reloadSaved(key, address);
      const successGate = deferred(); state.promptSaveGate = successGate;
      const success = consumer(sourceRoot, client, key, address, doc('save before creation'), true);
      const accepted = success.run(); for (let spin = 0; spin < 50 && !successGate.entered; spin++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(successGate.entered, true); assert.equal(success.state.creationPortCalls, 0); successGate.release(); await accepted;
      assert.equal(success.state.creationPortCalls, 1); assert.deepEqual(success.state.errors, []);
      report.gatedConsumer = { staleDraft: port.state, savedDraft: success.state };
    });
  } else report.unrun = ['theme POST/reload', 'theme CAS/replay/conflict', 'theme node/project/reference validation', 'theme promptSaveGate wait'];
  client.dispose(); report.traffic = theme.traffic;
  await test(baselineRoot ? 'mapping extraction preserves the entire observed HTTP/state projection EXACT' : 'mapping adapter satisfies the fixed HTTP/state CONTRACT', async () => {
    const after = await mappingProjection(sourceRoot);
    report.projections.mappingAfter = after;
    if (baselineRoot) {
      const before = await mappingProjection(baselineRoot); report.projections.mappingBefore = before;
      assert.deepEqual(after, before); report.mappingProjection = 'EXACT';
    } else report.mappingProjection = 'CONTRACT';
  });
  await test('all executed source bytes remain unchanged', async () => {
    for (const [root, records] of [[sourceRoot, report.sources], [baselineRoot, report.baselineSources]]) for (const [relative, record] of Object.entries(records)) {
      const bytes = fs.readFileSync(path.resolve(root, relative));
      assert.equal(bytes.length, record.bytes); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256);
    }
    report.sourceIntegrity = 'UNCHANGED';
  });
  const failures = report.checks.filter(check => check.status === 'FAIL');
  report.status = failures.length ? 'FAIL' : 'PASS';
  report.marker = 'CANVAS_THEME_PROMPT_FIXTURE=' + report.status + ' actual_client=1 actual_theme_callback=1 purchase_port=' + (report.consumer?.creationPortCalls ?? 'UNKNOWN') + ' mapping=' + (report.mappingProjection || 'FAIL');
  report.exitStatus = failures.length ? 1 : 0;
  fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(report.marker); process.exitCode = report.exitStatus;
}
main().catch(error => {
  report.status = 'FAIL'; report.exitStatus = 1; report.fatal = { message: error.message, stack: error.stack };
  report.marker = 'CANVAS_THEME_PROMPT_FIXTURE=FAIL actual_client=0 actual_theme_callback=0 purchase_port=UNKNOWN mapping=FAIL';
  fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n'); console.log(report.marker); process.exitCode = 1;
});
