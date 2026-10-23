#!/usr/bin/env node
/* Local integration harness. No production imports are executed as a component.
 * Run only after SOURCE STABLE. No HTTP requests, Git, builds or server startup.
 * node scripts/verify-canvas-jimeng-integration.cjs [--baseline [--source-root <absolute>]|--preview-only]
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const esbuild = require('esbuild');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output/jimeng-canvas-20261023');
const PREVIEW = path.join(OUT, 'ui-preview');
const REL = 'src/components/canvas/canvas-client.tsx';
const BASELINE = process.argv.includes('--baseline');
const PREVIEW_ONLY = process.argv.includes('--preview-only');
const sourceRootIndex = process.argv.indexOf('--source-root');
assert(!(BASELINE && PREVIEW_ONLY), '--baseline and --preview-only are mutually exclusive');
let baselineRoot = path.join(OUT, 'baseline');
if (sourceRootIndex !== -1) {
  assert(BASELINE, '--source-root is only supported with --baseline');
  assert.equal(process.argv.filter(arg => arg === '--source-root').length, 1, 'Only one --source-root is accepted');
  const value = process.argv[sourceRootIndex + 1];
  assert(value && path.isAbsolute(value), '--source-root requires an absolute directory');
  assert(fs.statSync(value).isDirectory(), '--source-root must be a directory');
  baselineRoot = path.resolve(value);
}
const sourcePath = path.join(BASELINE ? baselineRoot : ROOT, REL);
const source = fs.readFileSync(sourcePath, 'utf8');
const sourceHash = hash(sourcePath);
const sf = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const results = [];
const artifacts = [];
const extracted = {};
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function json(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8'); return file; }
function walk(node, predicate) { const found = []; function visit(n) { if (predicate(n)) found.push(n); ts.forEachChild(n, visit); } visit(node); return found; }
function line(node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; }
function name(n) { return n.name?.getText(sf); }
function functionNode(id) {
  const matches = walk(sf, n => ts.isFunctionDeclaration(n) && name(n) === id);
  assert.equal(matches.length, 1, `Exactly one function ${id}`);
  return matches[0];
}
function functionText(id) {
  const node = functionNode(id);
  extracted[id] = { line: line(node), endLine: sf.getLineAndCharacterOfPosition(node.end).line + 1, sha256: crypto.createHash('sha256').update(node.getText(sf)).digest('hex') };
  return node.getText(sf);
}
function variableNode(id) {
  const matches = walk(sf, n => ts.isVariableDeclaration(n) && name(n) === id);
  assert.equal(matches.length, 1, `Exactly one variable ${id}`);
  return matches[0];
}
function variableCallback(id) {
  const node = variableNode(id), init = node.initializer;
  assert(ts.isCallExpression(init) && init.arguments.length, `${id} callback initializer`);
  extracted[id] = { line: line(node), endLine: sf.getLineAndCharacterOfPosition(node.end).line + 1 };
  return `const ${id} = ${init.arguments[0].getText(sf)};`;
}
function toJS(text, filename = 'extracted-canvas.ts') {
  return ts.transpileModule(text, { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, alwaysStrict: false } }).outputText;
}
function compile(env, declarations, exports) {
  // A with-environment preserves exact original function bodies and shared ref
  // identities without evaluating CanvasClient or replacing its async guards.
  return Function('env', `with (env) { ${toJS(declarations)}; return {${exports.join(',')}}; }`)(env);
}
function loadPure(relative) {
  const file = path.join(ROOT, relative), code = toJS(fs.readFileSync(file, 'utf8'), file), module = { exports: {} };
  Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}
function jsxTag(node) { return node.tagName?.getText(sf); }
function jsxAll(tag) { return walk(sf, n => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && jsxTag(n) === tag); }
function prop(node, key) { return node.attributes.properties.find(n => ts.isJsxAttribute(n) && n.name.getText(sf) === key)?.initializer; }
function expression(node, key) { const value = prop(node, key); return value && ts.isJsxExpression(value) ? value.expression : value; }
function propText(node, key) { return expression(node, key)?.getText(sf) || ''; }
function parentJSX(node, tag) { for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p) && jsxTag(p.openingElement) === tag) return p.openingElement; }
async function test(label, run) {
  try { const detail = await run(); results.push({ label, status: 'PASS', ...(detail === undefined ? {} : { detail }) }); }
  catch (error) { results.push({ label, status: 'FAIL', error: error.stack || String(error) }); }
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function spinUntil(check) { for (let i = 0; i < 40; i++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); } throw new Error('Local deferred stage was not reached'); }
const plain = value => JSON.parse(JSON.stringify(value));
function makeNode(id, x, y, type = 'image', width = 180, height = 120) {
  return { id, type, position: { x, y }, measured: { width, height: height + 36 }, data: { title: id, width, height, ...(type === 'text' ? { nodeKind: 'text' } : {}) }, selected: false };
}
let helpers, declarations;
function makeEnv(options = {}) {
  const nodes = options.nodes || [makeNode('image-a', 50, 30), makeNode('image-b', 310, 155), makeNode('image-c', 650, 95), makeNode('image-unselected', 940, 350), makeNode('text-a', 380, 410, 'text'), makeNode('pend-a', 1100, 600, 'pend'), makeNode('task-a', 1100, 750, 'image'), makeNode('workflow-a', 0, 0, 'workflowGroup'), makeNode('decoration-a', 0, 0, 'workflowDecoration')];
  const env = {
    nodes: plain(nodes), rfNodes: plain(nodes), rfEdges: [], works: [], textNodes: [], videos: [], undo: [], redo: [], events: [], requests: [], tips: [], fits: [], groups: [], selectionCalls: [],
    activeKey: 'project-a', historyAccount: 'account-local', historyScope: '["account-local","project-a"]',
    historyScopeRef: { current: '["account-local","project-a"]' }, canvasContextEpochRef: { current: 1 }, canvasAccountRef: { current: 'account-local' }, workspace: 'workspace-local', workspaceRevision: 0,
    active: { key: 'project-a', members: [], textNodes: [], videoNodes: [] }, readOnly: false, user: { email: 'fixture@local.invalid' }, nodeSettingsReady: true, textNodesReady: true,
    historyBusyRef: { current: false }, historyAttemptsRef: { current: new WeakMap() }, historyScopesRef: { current: new WeakMap() },
    textSaveQueuesRef: { current: new Map() }, unsavedTextRef: { current: new Set() }, pendNodesRef: { current: [] }, textNodesRef: { current: [] }, nodeSettingsRef: { current: {} },
    multiSel: ['image-a', 'image-b', 'image-c'], selectedId: null, selectedTextId: null, selectedPendId: null, canvasSize: { width: 1440 }, navigatorOpen: true,
    workflowManifests: [{ projectKey: 'project-a', groups: [{ id: 'workflow-a', members: ['image-a', 'text-a'] }] }, { projectKey: 'project-b', groups: [{ id: 'workflow-a', members: ['foreign-id'] }] }],
    locked: new Set(), NODE_W: 320, NODE_H: 236, NODE_LABEL_H: 36, TEXT_NODE_DEFAULT_H: 240,
    L: zh => zh, t: key => key, structuredClone, AbortSignal, Headers, Promise, Map, Set, WeakMap, Error, RangeError, Array, Number, JSON,
    arrangeCanvasSelection: helpers.arrangeCanvasSelection,
    browserRandomUUID: () => `local-operation-${++env.operationCounter}`, operationCounter: 0,
    currentWorkspace: () => env.workspace,
    currentWorkspaceRevision: () => env.workspaceRevision,
    isNodeLocked: id => env.locked.has(id),
    flashTip: message => { env.tips.push(message); },
    setHistorySaving: value => { env.historySaving = value; env.events.push(`busy:${value}`); },
    setUnsavedTextCount: value => { env.unsavedTextCount = value; },
    setNodeSettings: value => { env.nodeSettings = value; },
    setCreatingNew: value => { env.creatingNew = value; }, setBrowsing: value => { env.browsing = value; }, setActiveKey: value => { env.activeKey = value; },
    setCanvasTool: value => { env.canvasTool = value; }, setSelectedEdge: value => { env.selectedEdge = value; },
    setNavigatorOpen: value => { env.navigatorOpen = value; },
    setSelectedId: value => { env.selectedId = value; }, setSelectedTextId: value => { env.selectedTextId = value; }, setSelectedPendId: value => { env.selectedPendId = value; },
    setMultiSel: value => { env.multiSel = typeof value === 'function' ? value(env.multiSel) : value; },
    setRfNodes: value => { env.nodes = typeof value === 'function' ? value(env.nodes) : value; },
    setRfEdges: value => { env.rfEdges = typeof value === 'function' ? value(env.rfEdges) : value; },
    setPendNodes: value => { env.pendNodesRef.current = typeof value === 'function' ? value(env.pendNodesRef.current) : value; },
    setUndoStack: fn => { env.events.push('undo'); env.undo = fn(env.undo); },
    setRedoStack: fn => { env.events.push('redo'); env.redo = fn(env.redo); },
    setWorks: fn => { env.events.push('local:works'); env.works = fn(env.works); },
    setTextNodes: fn => { env.events.push('local:text'); env.textNodes = fn(env.textNodes); env.textNodesRef.current = env.textNodes; },
    expectJsonOk: async response => { env.events.push('persist:ack'); if (!response.ok) throw new Error('local fixture persistence rejected'); return {}; },
    authHeader: async () => { env.events.push('auth:start'); if (env.authGate) await env.authGate.promise; return { authorization: 'local-fixture', 'x-naumi-workspace': env.workspace }; },
    fetch: async (url, init) => {
      assert.equal(url, '/api/canvas/history', 'Only the local history stub is callable');
      env.requestHeaders = Object.fromEntries(init.headers.entries());
      const body = JSON.parse(init.body); env.requests.push(body); env.events.push('persist:request');
      if (env.responseGate) await env.responseGate.promise;
      return { ok: env.persistOK !== false };
    },
  };
  env.videoNodesStore = { nodes: [], getNode: id => env.videos.find(v => v.id === id), flush: async () => { env.events.push('video:flush'); if (env.flushGate) await env.flushGate.promise; }, refresh: async () => { env.events.push('video:refresh'); if (env.refreshError) throw new Error('local video refresh failed'); } };
  env.rfRef = { current: { getNodes: () => env.nodes, getNode: id => env.nodes.find(node => node.id === id), fitView: options => { env.fits.push(options); return Promise.resolve(true); } } };
  // The real Undo/Redo functions read current React state; getters keep their
  // AST-extracted bodies attached to the fixture's current stack identities.
  Object.defineProperties(env, { undoStack: { get: () => env.undo }, redoStack: { get: () => env.redo } });
  env.active.members = env.nodes.filter(n => !['text', 'pend', 'workflowGroup', 'workflowDecoration', 'videoGeneration'].includes(n.type) && !n.id.startsWith('task-')).map(n => ({ id: n.id, canvasX: n.position.x, canvasY: n.position.y }));
  env.active.textNodes = env.nodes.filter(n => n.type === 'text').map(n => ({ id: n.id, projectKey: env.activeKey, canvasX: n.position.x, canvasY: n.position.y }));
  env.active.videoNodes = env.nodes.filter(n => n.type === 'videoGeneration').map(n => ({ id: n.id, projectKey: env.activeKey, revision: 3, canvasX: n.position.x, canvasY: n.position.y }));
  env.works = plain(env.active.members); env.textNodes = plain(env.active.textNodes); env.textNodesRef.current = env.textNodes; env.videos = plain(env.active.videoNodes); env.videoNodesStore.nodes = env.videos;
  Object.assign(env, options.env || {});
  Object.assign(env, compile(env, declarations, ['privateFetchRaw', 'fitCanvasSelection', 'locateOutlineNode', 'arrangeSelection', 'applyHistory', 'doUndo', 'doRedo', 'pushUndo', 'applyArtworkSelection', 'clearCanvasSelection', 'selectWorkflowGroup', 'flowNodeSize']));
  return env;
}
function assertNoCommit(env) { assert.equal(env.requests.length, 0); assert.equal(env.undo.length, 0); assert.equal(env.events.some(e => e.startsWith('local:')), false); }
async function sourceTests() {
  await test('AST: three multi-selection toolbars wire actual layout callback', () => {
    const bars = jsxAll('SelectionLayoutControls'); assert.equal(bars.length, 3);
    const ids = bars.map(node => { assert.equal(propText(node, 'onArrange'), 'arrangeSelection'); assert.equal(propText(node, 'busy'), 'historySaving'); assert(propText(node, 'disabled').includes('nodeSettingsReady')); return propText(parentJSX(node, 'BatchSelectionToolbar'), 'testId').replaceAll('"', ''); });
    assert.deepEqual(ids.sort(), ['image-batch-bar', 'mixed-node-batch-bar', 'text-batch-bar']);
    return bars.map(node => ({ line: line(node), parent: propText(parentJSX(node, 'BatchSelectionToolbar'), 'testId') }));
  });
  await test('AST: image and pending composers append creative fragments, not generation', () => {
    const controls = jsxAll('CreativePresets'); assert.equal(controls.length, 2);
    const scopes = controls.map(node => { const shell = parentJSX(node, 'CanvasComposerShell'); assert(shell); const apply = expression(node, 'onApply'); const calls = walk(apply, n => ts.isCallExpression(n)).map(n => n.expression.getText(sf)); assert(calls.includes('setEditPrompt')); assert(calls.includes('appendCreativePreset')); assert(!calls.some(n => /generate|runGen|privateFetch|submit/i.test(n))); assert(propText(node, 'disabled')); return { line: line(node), composer: propText(shell, 'data-testid') }; });
    assert.equal(new Set(scopes.map(s => s.composer)).size, 2); return scopes;
  });
  await test('AST: navigator consumes current ReactFlow nodes and original selection', () => {
    const node = jsxAll('CanvasNavigator'); assert.equal(node.length, 1);
    assert.equal(propText(node[0], 'entries'), 'outlineEntries');
    const index = variableNode('outlineEntries').getText(sf); assert(index.includes('canvasOutlineEntries(rfNodes)')); assert(index.includes('[rfNodes]'));
    for (const id of ['multiSel', 'selectedId', 'selectedTextId', 'selectedPendId']) assert(propText(node[0], 'selectedIds').includes(id));
    assert.equal(propText(node[0], 'onLocate'), 'locateOutlineNode');
    const onSelect = propText(node[0], 'onSelect'); assert(onSelect.indexOf('applyArtworkSelection(ids)') < onSelect.indexOf('fitCanvasSelection(ids)'));
    assert(propText(node[0], 'onFitSelection').includes('fitCanvasSelection()')); assert(propText(node[0], 'key').includes('activeKey'));
    return { line: line(node[0]), entriesLine: line(variableNode('outlineEntries')) };
  });
  await test('AST: navigator graph source is active-project artwork, text, video and manifest only', () => {
    const graph = walk(sf, n => ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.name.getText(sf) === '{ nodes, edges }'); assert.equal(graph.length, 1);
    assert(graph[0].getText(sf).includes('active.members')); assert(graph[0].getText(sf).includes('if (!active) return { nodes: [], edges: [] }'));
    const display = walk(sf, n => ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.name.getText(sf) === '{ displayNodes, displayEdges }'); assert.equal(display.length, 1);
    const body = display[0].getText(sf); assert(/videoNodesStore.nodes.filter\(node\s*=>\s*node.projectKey\s*===\s*activeKey\)/.test(body)); assert(/textNodes.filter\(\(node\)\s*=>\s*node.projectKey\s*===\s*activeKey\)/.test(body)); assert(body.includes('workflowManifests.filter(m => m.projectKey === activeKey)'));
    return { graphLine: line(graph[0]), displayLine: line(display[0]) };
  });
  await test('AST: fit selection menu and guarded Ctrl/Cmd+K shortcut', () => {
    const keys = walk(sf, n => ts.isFunctionDeclaration(n) && name(n) === 'onKey' && n.getText(sf).includes('setNavigatorOpen'));
    assert.equal(keys.length, 1); const text = keys[0].getText(sf);
    assert(/mod\s*&&\s*!e.altKey\s*&&\s*key === "k"\s*&&\s*!browsing/.test(text));
    for (const guard of ['e.defaultPrevented', 'e.isComposing', 'data-canvas-hotkeys-blocked', 'canvasShortcutLayerOpen', 'INPUT', 'TEXTAREA']) assert(text.includes(guard));
    const fits = walk(sf, n => ts.isCallExpression(n) && n.expression.getText(sf) === 'fitCanvasSelection'); assert(fits.length >= 4);
    return { shortcutLine: line(keys[0]), fitCallLines: fits.map(line) };
  });
}
function contextEffect(env) {
  const calls = walk(sf, n => ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect' && n.arguments[0]?.getText(sf).includes('const previous = previousCanvasContextRef.current'));
  assert.equal(calls.length, 1);
  env.activeProjectRef ||= { current: env.active }; env.ocrRequestEpochRef ||= { current: 0 };
  env.targetEmail ??= 'target-a'; env.canvasWorkspace ??= env.workspace;
  env.previousCanvasContextRef ||= { current: { key: env.activeKey, email: env.user?.email || '', target: env.targetEmail, workspace: env.canvasWorkspace } };
  env.setOcrArtworkId ||= () => {}; env.setOcrSegments ||= () => {}; env.setOcrStatus ||= () => {};
  return { node: calls[0], callback: compile(env, `const contextEffect = ${calls[0].arguments[0].getText(sf)};`, ['contextEffect']).contextEffect };
}
async function contextTests() {
  await test('Actual workspace revision: changes count, same ID stays stable, A-B-A cannot vanish', () => {
    const w = loadPure('src/lib/saas/workspace-client.ts'); w.selectWorkspace('workspace-a'); const start = w.currentWorkspaceRevision(); w.selectWorkspace('workspace-a'); assert.equal(w.currentWorkspaceRevision(), start); w.selectWorkspace('workspace-b'); w.selectWorkspace('workspace-a'); assert.equal(w.currentWorkspace(), 'workspace-a'); assert.equal(w.currentWorkspaceRevision(), start + 2);
    w.selectWorkspace(''); assert.equal(w.currentWorkspace(), 'personal'); const personal = w.currentWorkspaceRevision(); w.selectWorkspace(''); assert.equal(w.currentWorkspaceRevision(), personal);
  });
  await test('Actual Canvas context effect increments epoch for targetEmail and workspace ABA', () => {
    const e = makeEnv(), { node, callback } = contextEffect(e), text = node.getText(sf); assert(text.includes('targetEmail')); assert(text.includes('canvasWorkspace')); const initial = e.canvasContextEpochRef.current;
    callback(); assert.equal(e.canvasContextEpochRef.current, initial);
    e.targetEmail = 'target-b'; callback(); e.targetEmail = 'target-a'; callback(); assert.equal(e.canvasContextEpochRef.current, initial + 2);
    e.canvasWorkspace = 'workspace-b'; callback(); e.canvasWorkspace = e.workspace; callback(); assert.equal(e.canvasContextEpochRef.current, initial + 4);
    return { line: line(node), targetEpochChanges: 2, workspaceEpochChanges: 2 };
  });
  await test('Actual privateFetchRaw auth wait invalidation sends zero HTTP', async () => {
    const e = makeEnv(), gate = deferred(); e.authGate = gate; let current = true; const p = e.privateFetchRaw('/api/canvas/history', { method: 'POST', body: '{"operations":[]}' }, () => current); await spinUntil(() => e.events.includes('auth:start')); current = false; gate.resolve(); await assert.rejects(p, /上下文已切换/); assert.equal(e.requests.length, 0);
  });
  await test('Actual privateFetchRaw default predicate preserves existing header and return semantics', async () => {
    const e = makeEnv(); await e.privateFetchRaw('/api/canvas/history', { method: 'POST', headers: { 'x-naumi-workspace': 'explicit-origin' }, body: '{"operations":[]}' }); assert.equal(e.requests.length, 1); assert.equal(e.requestHeaders['x-naumi-workspace'], 'explicit-origin'); assert.equal(e.requestHeaders.authorization, 'local-fixture');
  });
}
async function presetKeyboardTests() {
  const file = path.join(ROOT, 'src/components/canvas/creative-presets.tsx');
  const text = fs.readFileSync(file, 'utf8'), tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = walk(tree, n => ts.isVariableDeclaration(n) && n.name.getText(tree) === 'onCardKeyDown');
  assert.equal(callbacks.length, 1);
  const creative = loadPure('src/lib/canvas/creative-presets.ts');
  for (const index of [0, 1]) await test(`Actual creative card keyboard: two blue results, three columns, ArrowUp from ${index}`, () => {
    const results = creative.filterCreativePresets('color', '蓝色'); assert.equal(results.length, 2);
    const selected = [], focused = [], scrolled = [], prevented = [];
    const env = { results, setSelectedId: id => selected.push(id), getComputedStyle: () => ({ gridTemplateColumns: '120px 120px 120px' }), grid: { current: { querySelector: selector => ({ focus: () => focused.push(selector), scrollIntoView: () => scrolled.push(selector) }) } } };
    const { handler } = compile(env, `const handler = ${callbacks[0].initializer.getText(tree)};`, ['handler']);
    handler({ key: 'ArrowUp', nativeEvent: { isComposing: false }, preventDefault: () => prevented.push(true) }, index);
    assert.deepEqual(selected, [results[1 - index].id]); assert.equal(prevented.length, 1); assert.equal(focused.length, 1); assert.equal(scrolled.length, 1);
  });
  await test('Actual creative JSX: zero results renders no cards and attaches no card handler', () => {
    const branches = walk(tree, n => ts.isConditionalExpression(n) && n.condition.getText(tree) === 'results.length' && n.whenTrue.getText(tree).includes('onCardKeyDown'));
    assert.equal(branches.length, 1);
    // The icon has no event semantics. Stub that decoration only; render the
    // exact AST-extracted JSX branch with real React to check handler absence.
    const node = branches[0], env = { require, exports: {}, results: [], grid: { current: null }, categoryLabel: '配色', uid: 'local', category: 'color', styles: new Proxy({}, { get: (_, k) => String(k) }), Search: () => null, setQuery: () => {}, search: { current: null }, onCardKeyDown: () => { throw new Error('Zero results must never enter card handler'); } };
    const js = toJS(`const emptyBranch = ${node.getText(tree)};`, 'actual-preset-zero-results.tsx');
    const rendered = Function('env', `with(env){${js}; return emptyBranch;}`)(env);
    const html = require('react-dom/server').renderToStaticMarkup(rendered);
    assert(html.includes('未找到匹配的配色')); assert.equal(html.includes('role="radio"'), false); assert.equal(html.includes('data-preset-id'), false);
    return { sourceLine: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, cards: 0, handlerCalls: 0 };
  });
}
async function runtimeTests() {
  for (const action of ['left', 'centerX', 'right', 'top', 'centerY', 'bottom', 'distributeX', 'distributeY']) await test(`AST runtime: ${action}, one atomic history and unselected node unchanged`, async () => {
    const e = makeEnv(), before = plain(e.works), selectedBefore = e.nodes.filter(n => e.multiSel.includes(n.id));
    const expected = helpers.arrangeCanvasSelection(selectedBefore.map(n => ({ id: n.id, ...n.position, ...n.measured })), action);
    await e.arrangeSelection(action); assert.equal(e.requests.length, expected.length ? 1 : 0); assert.equal(e.undo.length, expected.length ? 1 : 0);
    if (expected.length) { assert.equal(e.undo[0].kind, 'move-many'); assert.deepEqual(e.undo[0].moves, expected); assert.deepEqual(e.requests[0].operations.map(n => n.id), expected.map(n => n.id)); assert(e.events.indexOf('persist:ack') < e.events.indexOf('undo')); assert(e.events.indexOf('persist:ack') < e.events.indexOf('local:works')); }
    assert.deepEqual(e.works.find(n => n.id === 'image-unselected'), before.find(n => n.id === 'image-unselected'));
    assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false);
  });
  const blocked = [
    ['read-only', e => e.readOnly = true], ['logged-out', e => e.user = null], ['no active project', e => e.active = null],
    ['node settings loading', e => e.nodeSettingsReady = false], ['text loading', e => e.textNodesReady = false], ['history busy', e => e.historyBusyRef.current = true],
    ['locked selection', e => e.locked.add('image-b')], ['pending selection', e => e.multiSel = ['image-a', 'pend-a']], ['task placeholder', e => e.multiSel = ['image-a', 'task-a']],
    ['generating image', e => e.nodes.find(n => n.id === 'image-b').data.generating = true], ['uploading image', e => e.nodes.find(n => n.id === 'image-b').data.uploading = true], ['pending image flag', e => e.nodes.find(n => n.id === 'image-b').data.pending = true],
    ['group selection', e => e.multiSel = ['image-a', 'workflow-a']], ['decoration selection', e => e.multiSel = ['image-a', 'decoration-a']], ['stale missing node', e => e.multiSel = ['image-a', 'gone-id']],
    ['foreign-project node', e => { e.nodes.push(makeNode('foreign', 400, 200)); e.multiSel = ['image-a', 'foreign']; }],
    ['single node', e => e.multiSel = ['image-a']], ['empty selection', e => e.multiSel = []], ['two-node distribution', e => { e.multiSel = ['image-a', 'image-b']; e.action = 'distributeX'; }],
  ];
  for (const [label, setup] of blocked) await test(`AST runtime: ${label} produces zero persistence/undo`, async () => { const e = makeEnv(); setup(e); await e.arrangeSelection(e.action || 'left'); assertNoCommit(e); });
  for (const count of [400, 401]) await test(`AST runtime: ${count}-node boundary`, async () => { const e = makeEnv({ nodes: Array.from({ length: count }, (_, i) => makeNode(`image-${i}`, i * 10, i * 20)) }); e.multiSel = e.nodes.map(n => n.id); await e.arrangeSelection('left'); assert.equal(e.requests.length, count === 400 ? 1 : 0); assert.equal(e.undo.length, count === 400 ? 1 : 0); });
  await test('AST runtime: live ReactFlow geometry overrides stale render nodes', async () => { const e = makeEnv(); e.rfNodes.forEach(n => n.position.x = -99999); await e.arrangeSelection('left'); assert(e.undo[0].moves.every(m => m.to.x === 50)); });
  await test('AST runtime: absent ReactFlow instance uses current render fallback', async () => { const e = makeEnv(); e.rfRef.current = null; await e.arrangeSelection('left'); assert.equal(e.undo.length, 1); });
  await test('AST runtime: failed persist leaves positions unchanged and pushes zero undo', async () => { const e = makeEnv({ env: { persistOK: false } }), before = plain(e.works); await e.arrangeSelection('left'); assert.equal(e.requests.length, 1); assert.equal(e.undo.length, 0); assert.deepEqual(e.works, before); assert.equal(e.tips.length, 1); assert.equal(e.historyBusyRef.current, false); });
  await test('AST runtime: fulfilled text queue with unsaved text blocks commit', async () => { const e = makeEnv(); e.textSaveQueuesRef.current.set('text-a', Promise.resolve(null)); e.unsavedTextRef.current.add('text-a'); await e.arrangeSelection('left'); assertNoCommit(e); assert.equal(e.tips.length, 1); });
  await test('AST runtime: rejected text queue releases busy without undo', async () => { const e = makeEnv(); e.textSaveQueuesRef.current.set('text-a', Promise.reject(new Error('local queue rejected'))); await e.arrangeSelection('left'); assertNoCommit(e); assert.equal(e.historyBusyRef.current, false); });
  await test('AST runtime: two same-tick layouts serialize as one transaction', async () => { const e = makeEnv(), gate = deferred(); e.responseGate = gate; const first = e.arrangeSelection('left'); await spinUntil(() => e.requests.length === 1); await e.arrangeSelection('top'); assert.equal(e.requests.length, 1); gate.resolve(); await first; assert.equal(e.undo.length, 1); });
  for (const stage of ['text-queue', 'video-flush', 'auth-header', 'history-response']) for (const change of ['scope', 'epoch', 'workspace', 'project-ABA', 'workspace-ABA', 'targetEmail-ABA']) await test(`AST runtime: ${change} switch during ${stage} never applies to new project`, async () => {
    const e = makeEnv(), gate = deferred(), before = plain(e.works);
    if (stage === 'text-queue') e.textSaveQueuesRef.current.set('text-a', gate.promise);
    if (stage === 'video-flush') e.flushGate = gate;
    if (stage === 'auth-header') e.authGate = gate;
    if (stage === 'history-response') e.responseGate = gate;
    const pending = e.arrangeSelection('left');
    if (stage === 'video-flush') await spinUntil(() => e.events.includes('video:flush'));
    if (stage === 'auth-header') await spinUntil(() => e.events.includes('auth:start'));
    if (stage === 'history-response') await spinUntil(() => e.requests.length === 1);
    if (change === 'scope') e.historyScopeRef.current = '["account-local","project-b"]';
    if (change === 'epoch' || change === 'project-ABA') e.canvasContextEpochRef.current += change === 'project-ABA' ? 2 : 1;
    if (change === 'workspace') e.workspace = 'workspace-b';
    if (change === 'workspace-ABA') e.workspaceRevision += 2;
    if (change === 'targetEmail-ABA') { const { callback } = contextEffect(e); e.targetEmail = 'target-b'; callback(); e.targetEmail = 'target-a'; callback(); }
    gate.resolve(); await pending;
    assert.equal(e.requests.length, stage === 'history-response' ? 1 : 0); assert.equal(e.undo.length, 0); assert.deepEqual(e.works, before); assert.equal(e.historyBusyRef.current, false);
    return { alreadySubmitted: stage === 'history-response', serverRollbackClaimed: false };
  });
  await test('AST runtime: account switch after response suppresses all local application', async () => { const e = makeEnv(), gate = deferred(), before = plain(e.works); e.responseGate = gate; const p = e.arrangeSelection('left'); await spinUntil(() => e.requests.length === 1); e.canvasAccountRef.current = 'account-b'; e.historyScopeRef.current = '["account-b","project-a"]'; gate.resolve(); await p; assert.deepEqual(e.works, before); assert.equal(e.undo.length, 0); });
  await test('AST runtime: new layout preserves other scope undo/redo and clears own redo', async () => {
    const e = makeEnv(), a = { kind: 'rename' }, b = { kind: 'rename' }, ra = { kind: 'rename' }, rb = { kind: 'rename' };
    for (const act of [a, ra]) e.historyScopesRef.current.set(act, e.historyScope); for (const act of [b, rb]) e.historyScopesRef.current.set(act, 'scope-b'); e.undo = [a, b]; e.redo = [ra, rb];
    await e.arrangeSelection('left'); assert(e.undo.includes(a) && e.undo.includes(b)); assert.equal(e.undo.length, 3); assert.deepEqual(e.redo, [rb]); assert.equal(e.historyScopesRef.current.get(e.undo[2]), e.historyScope);
  });
  await test('AST runtime: mixed image/text/video layout uses one persisted transaction and revisioned video patch', async () => {
    const e = makeEnv({ nodes: [makeNode('image-a', 10, 20), makeNode('text-a', 200, 80, 'text'), makeNode('video-a', 400, 150, 'videoGeneration'), makeNode('unselected', 600, 120)] });
    e.multiSel = ['image-a', 'text-a', 'video-a']; await e.arrangeSelection('left'); assert.equal(e.requests.length, 1); assert.equal(e.undo.length, 1);
    const operations = e.requests[0].operations; assert(operations.some(op => op.type === 'position' && op.id === 'text-a' && op.text === true)); assert(operations.some(op => op.type === 'video-patch' && op.id === 'video-a' && op.expectedRevision === 3));
    assert(e.events.indexOf('persist:ack') < e.events.indexOf('local:text')); assert(e.events.indexOf('video:refresh') < e.events.indexOf('undo'));
  });
  await test('AST runtime: committed mixed layout remains undoable if postcommit video refresh fails', async () => {
    const e = makeEnv({ nodes: [makeNode('image-a', 50, 20), makeNode('text-a', 200, 80, 'text'), makeNode('video-a', 400, 150, 'videoGeneration')] });
    // The first refresh is now preflight. Fail only the postcommit read, not
    // the preflight; otherwise this no longer exercises the original bug.
    const refresh = e.videoNodesStore.refresh; let refreshCalls = 0;
    e.videoNodesStore.refresh = async () => { refreshCalls++; if (refreshCalls === 2) { e.events.push('video:refresh'); throw new Error('local video refresh failed'); } await refresh(); };
    e.multiSel = ['image-a', 'text-a', 'video-a']; await e.arrangeSelection('left');
    assert.equal(e.requests.length, 1); assert(e.events.includes('persist:ack')); assert.equal(e.undo.length, 1, 'Server-committed layout must not lose undo due to a later local refresh error');
    assert.equal(refreshCalls, 2, 'Preflight succeeds before the failed postcommit read');
    assert(e.tips.some(tip => tip === '布局已保存，视频节点显示稍后同步'));
  });
  await test('AST runtime: non-move-many postcommit refresh failures retain original throw behavior', async () => {
    const e = makeEnv({ nodes: [makeNode('video-a', 400, 150, 'videoGeneration')] }); e.refreshError = true;
    await assert.rejects(e.applyHistory({ kind: 'video-patch', id: 'video-a', from: { x: 400 }, to: { x: 500 } }, false), /local video refresh failed/); assert.equal(e.requests.length, 1); assert.equal(e.undo.length, 0);
  });
  for (const id of ['image-a', 'text-a', 'pend-a', 'task-a', 'workflow-a']) await test(`AST runtime: locate ${id} selects appropriate branch and fits explicit target`, () => {
    const e = makeEnv(); e.multiSel = ['image-b']; e.locateOutlineNode(id); assert.equal(e.fits.length, 1); assert.deepEqual(e.fits[0].nodes.map(n => n.id), [id]);
    if (id === 'workflow-a') assert.deepEqual(e.multiSel, ['image-a', 'text-a']);
    else if (id === 'pend-a') { assert.equal(e.selectedPendId, id); assert.deepEqual(e.multiSel, []); }
    else if (id === 'task-a') { assert.equal(e.selectedId, null); assert.equal(e.selectedTextId, null); assert.deepEqual(e.multiSel, []); }
    else { assert.deepEqual(e.multiSel, [id]); assert.equal(id === 'text-a' ? e.selectedTextId : e.selectedId, id); assert.equal(e.nodes.find(n => n.id === id).selected, true); }
  });
  await test('AST runtime: missing outline id is a no-op', () => { const e = makeEnv(), before = plain(e.multiSel); e.locateOutlineNode('foreign-absent'); assert.equal(e.fits.length, 0); assert.deepEqual(e.multiSel, before); });
  for (const width of [767, 768]) await test(`AST runtime: locate mobile close boundary ${width}`, () => { const e = makeEnv(); e.canvasSize.width = width; e.locateOutlineNode('image-a'); assert.equal(e.navigatorOpen, width >= 768); });
  await test('AST runtime: fit defaults to multi-selection; singles and explicit ids are independent', () => {
    const e = makeEnv(); e.multiSel = ['image-a', 'text-a']; e.selectedId = 'image-c'; e.fitCanvasSelection(); assert.deepEqual(e.fits.pop().nodes.map(n => n.id), ['image-a', 'text-a']);
    e.multiSel = []; e.selectedId = 'image-c'; e.selectedTextId = 'text-a'; e.selectedPendId = 'pend-a'; e.fitCanvasSelection(); assert.deepEqual(e.fits.pop().nodes.map(n => n.id), ['image-c', 'text-a', 'pend-a']);
    e.fitCanvasSelection(['image-b']); assert.deepEqual(e.fits.pop().nodes.map(n => n.id), ['image-b']); e.fitCanvasSelection([]); assert.equal(e.fits.length, 0);
  });
  await test('Pure helpers: real navigator filters local nodes and creative append preserves prompt', () => {
    const nav = loadPure('src/lib/canvas/navigator.ts'), creative = loadPure('src/lib/canvas/creative-presets.ts'), nodes = [makeNode('image-a', 0, 0), makeNode('text-a', 0, 0, 'text')]; nodes[0].data.prompt = '陶瓷 咖啡杯'; nodes[1].data.content = '清晨';
    const index = nav.canvasOutlineEntries(nodes); assert.equal(index.length, 2); assert.equal(nav.filterCanvasOutline(index, '陶瓷 咖啡杯', 'image').length, 1); assert.equal(nav.filterCanvasOutline(index, '陶瓷', 'text').length, 0);
    const preset = creative.CREATIVE_PRESETS[0], prompt = '  保留原提示词及格式。\n'; const next = creative.appendCreativePreset(prompt, preset); assert(next.startsWith(prompt)); assert(next.includes(preset.promptFragment)); assert.equal(creative.appendCreativePreset(next, preset), next); assert(creative.filterCreativePresets('camera', '俯拍').length > 0);
  });
}
function realBoundsNode(id, x, y, type = 'image') {
  const node = makeNode(id, x, y, type, 200, 200);
  // Unlike makeNode's legacy placement fixture, these are the actual rendered
  // outer bounds, equal across media/text/video, without a synthetic label pad.
  node.measured = { width: 200, height: 200 };
  return node;
}
function localPositions(e) { return plain({ nodes: e.nodes, works: e.works, textNodes: e.textNodes, videos: e.videos }); }
function freshVideoMove(e) {
  const video = e.videos[0];
  return { kind: 'move-many', moves: [{ id: video.id, from: { x: video.canvasX, y: video.canvasY }, to: { x: 50, y: video.canvasY } }] };
}
function revisionScenario(options = {}) {
  const e = makeEnv({ nodes: [realBoundsNode('image-anchor', 50, 20), realBoundsNode('image-a', 150, 60), realBoundsNode('text-a', 200, 80, 'text'), realBoundsNode('video-a', 400, 150, 'videoGeneration')] });
  e.multiSel = e.nodes.map(node => node.id);
  const state = { initialRevision: options.revision ?? 10, video: plain(e.videos[0]), works: plain(e.works), textNodes: plain(e.textNodes), ledger: new Map(), rawRequests: [], refreshes: [], timeline: [], commits: 0 };
  state.video.revision = state.initialRevision;
  e.videos[0].revision = state.initialRevision - 1; // Prove preflight replaces stale local revisions.
  e.videoNodesStore.refresh = async () => {
    const call = state.refreshes.length + 1, fails = (options.failRefreshCalls || []).includes(call);
    e.events.push('video:refresh'); state.timeline.push(`refresh:${call}:${state.video.revision}:${fails ? 'FAIL' : 'OK'}`);
    state.refreshes.push({ call, revision: state.video.revision, status: fails ? 'FAIL' : 'OK' });
    if (fails) throw new Error('local video refresh failed');
    e.videos = [plain(state.video)]; e.videoNodesStore.nodes = e.videos;
  };
  e.fetch = async (url, init) => {
    assert.equal(url, '/api/canvas/history'); assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body); e.requestHeaders = Object.fromEntries(init.headers.entries());
    e.requests.push(body); state.rawRequests.push(init.body); e.events.push('persist:request');
    state.timeline.push(`post:${body.operationId}:${body.operations.find(op => op.type === 'video-patch')?.expectedRevision}`);
    const previous = state.ledger.get(body.operationId);
    if (previous) assert.equal(init.body, previous, 'An idempotent replay must preserve the literal original body');
    else {
      // Validate every operation before any write, as an atomic local server
      // fixture. A stale revision fails the test rather than returning a fake OK.
      for (const op of body.operations) {
        if (op.type === 'video-patch') { assert.equal(op.id, state.video.id); assert.equal(op.expectedRevision, state.video.revision, 'Video POST must carry the current server revision'); }
        else { assert.equal(op.type, 'position'); assert((op.text ? state.textNodes : state.works).some(row => row.id === op.id)); }
      }
      for (const op of body.operations) {
        if (op.type === 'video-patch') { Object.assign(state.video, { canvasX: op.fields.x, canvasY: op.fields.y, revision: state.video.revision + 1 }); }
        else { const row = (op.text ? state.textNodes : state.works).find(row => row.id === op.id); Object.assign(row, { canvasX: op.x, canvasY: op.y }); }
      }
      state.ledger.set(body.operationId, init.body); state.commits++;
      state.timeline.push(`commit:${state.video.revision}`);
    }
    if (options.unknownFirst && state.rawRequests.length === 1) throw new Error('local unknown outcome after server commit');
    return { ok: true };
  };
  return { e, state };
}
async function p2RegressionTests() {
  for (const action of ['bottom', 'centerY']) await test(`P2 AST geometry: equal measured 200px image/text/video ${action} is a true no-op`, async () => {
    const nodes = [realBoundsNode('image-a', 0, 75), realBoundsNode('text-a', 300, 75, 'text'), realBoundsNode('video-a', 600, 75, 'videoGeneration')];
    // Contradictory content heights catch using placement/content geometry even
    // if all three nodes happen to share the same measured outer bounds.
    nodes.forEach((node, index) => node.data.height = [164, 200, 140][index]);
    const e = makeEnv({ nodes }); e.multiSel = nodes.map(node => node.id); const before = localPositions(e);
    await e.arrangeSelection(action);
    assertNoCommit(e); assert.deepEqual(localPositions(e), before); assert.equal(e.operationCounter, 0); assert.deepEqual(e.tips, []);
    assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false);
    return { measuredHeights: [200, 200, 200], y: 75, http: 0, undo: 0 };
  });
  await test('P2 AST geometry: mixed 200px nodes at y=0/300/600 already have equal vertical gaps', async () => {
    const nodes = [realBoundsNode('image-a', 10, 0), realBoundsNode('text-a', 400, 300, 'text'), realBoundsNode('video-a', 750, 600, 'videoGeneration')];
    const e = makeEnv({ nodes }); e.multiSel = nodes.map(node => node.id); const before = localPositions(e);
    await e.arrangeSelection('distributeY'); assertNoCommit(e); assert.deepEqual(localPositions(e), before); assert.equal(e.operationCounter, 0); assert.deepEqual(e.tips, []);
    assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false);
    return { y: [0, 300, 600], heights: [200, 200, 200], gaps: [100, 100], http: 0 };
  });
  const boundsCases = [
    ['measured before node/style/data', { measured: { width: 211, height: 212 }, width: 311, height: 312, style: { width: '411', height: 412 }, data: { width: 511, height: 512 } }, { width: 211, height: 212 }],
    ['node before style/data', { width: 311, height: 312, style: { width: '411', height: 412 }, data: { width: 511, height: 512 } }, { width: 311, height: 312 }],
    ['numeric style before data', { style: { width: '411', height: 412 }, data: { width: 511, height: 512 } }, { width: 411, height: 412 }],
    ['data before constants', { style: { width: 'auto', height: '100%' }, data: { width: 511, height: 512 } }, { width: 511, height: 512 }],
    ['NODE_W/H defaults', { style: { width: 'auto', height: '100%' } }, { width: 320, height: 236 }],
    ['width/height independent precedence', { measured: { width: 211 }, height: 312, style: { width: 411, height: 412 }, data: { width: 511, height: 512 } }, { width: 211, height: 312 }],
  ];
  for (const [label, fields, dimensions] of boundsCases) await test(`P2 AST geometry: ${label}`, async () => {
    const nodes = ['image', 'text', 'videoGeneration'].map((type, index) => {
      const node = realBoundsNode(['image-a', 'text-a', 'video-a'][index], index * 700, index * 300, type);
      delete node.measured; delete node.data.width; delete node.data.height;
      const { data, ...outer } = fields; Object.assign(node, plain(outer)); Object.assign(node.data, data || {}); return node;
    });
    const e = makeEnv({ nodes }); e.multiSel = nodes.map(node => node.id); let captured;
    e.arrangeCanvasSelection = (selection, action) => { captured = plain(selection); return helpers.arrangeCanvasSelection(selection, action); };
    await e.arrangeSelection('bottom');
    assert.deepEqual(captured, nodes.map(node => ({ id: node.id, ...node.position, ...dimensions })));
    assert.equal(e.requests.length, 1); assert.equal(e.undo.length, 1); assert.deepEqual(e.tips, []);
    assert.deepEqual(e.undo[0].moves, nodes.slice(0, 2).map(node => ({ id: node.id, from: node.position, to: { x: node.position.x, y: 600 } })));
    return { capturedDimensions: captured.map(({ width, height }) => ({ width, height })), http: 1, undo: 1 };
  });
  await test('P2 AST geometry: legacy flowNodeSize source and media +36 placement behavior remain unchanged', () => {
    assert.equal(walk(functionNode('arrangeSelection'), n => ts.isCallExpression(n) && n.expression.getText(sf) === 'flowNodeSize').length, 0);
    // Frozen raw-baseline AST hash keeps normal modified verification reusable
    // from a fresh checkout without depending on ignored backup artifacts.
    assert.equal(crypto.createHash('sha256').update(functionNode('flowNodeSize').getText(sf)).digest('hex'), '64f254316e39e98e26542490d37188f9f30fd38cd07a809fe6a026203313c8e3', 'Legacy placement helper must not be changed to fix alignment');
    const e = makeEnv();
    for (const type of ['image', 'text', 'videoGeneration']) {
      const node = makeNode(`legacy-${type}`, 0, 0, type, 180, 120); node.measured = { width: 200, height: 200 };
      assert.deepEqual(e.flowNodeSize(node), { width: 180, height: type === 'text' ? 120 : 156 });
    }
    assert.deepEqual(e.flowNodeSize(undefined), { width: 320, height: 236 });
    return { sourceUnchanged: true, nonTextHeight: 156, textHeight: 120, labelPadding: 36 };
  });
  await test('P2 AST edges: hidden ReactFlow prop preserves getEdges topology and original objects', () => {
    const flow = jsxAll('ReactFlow'); assert.equal(flow.length, 1); const node = expression(flow[0], 'edges'); assert(node);
    const originals = [
      { id: 'a-b', source: 'image-a', target: 'text-a', sourceHandle: 'out', targetHandle: 'in', type: 'lineage', selected: true, hidden: false, data: { kind: 'reference' } },
      { id: 'b-c', source: 'text-a', target: 'video-a', sourceHandle: 'text-out', targetHandle: 'prompt-in', type: 'workflow', hidden: true, data: { weight: 2 } },
      { id: 'c-a', source: 'video-a', target: 'image-a', type: 'default', data: { cycle: true } },
    ];
    const before = plain(originals); originals.forEach(edge => { Object.freeze(edge.data); Object.freeze(edge); }); Object.freeze(originals);
    const env = { rfEdges: originals, linksVisible: false };
    const evaluate = () => compile(env, `const actualEdges = ${node.getText(sf)};`, ['actualEdges']).actualEdges;
    const hidden = evaluate(), getEdges = () => hidden; // getEdges fixture reads the exact evaluated ReactFlow prop.
    assert.equal(getEdges().length, originals.length);
    getEdges().forEach((edge, index) => { assert.notEqual(edge, originals[index]); assert.deepEqual(edge, { ...originals[index], hidden: true }); assert.equal(edge.data, originals[index].data); });
    const topology = edges => edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({ id, source, target, sourceHandle, targetHandle, type }));
    assert.deepEqual(topology(getEdges()), topology(originals)); assert.deepEqual(originals, before);
    env.linksVisible = true; assert.equal(evaluate(), originals); assert.deepEqual(originals, before);
    extracted.ReactFlowEdges = { line: line(node), expression: node.getText(sf) };
    return { sourceLine: line(node), edgeCountVisible: originals.length, edgeCountHidden: getEdges().length, originalsUnchanged: true, boundary: 'AST-extracted ReactFlow edges prop; getEdges fixture, not mounted ReactFlow' };
  });
  await test('P2 AST video: second refresh fails after commit, immediate real Undo refreshes N+1 and succeeds', async () => {
    const { e, state } = revisionScenario({ failRefreshCalls: [2] }); const before = { works: plain(e.works), textNodes: plain(e.textNodes), video: plain(state.video) };
    await e.arrangeSelection('left');
    assert.equal(e.requests.length, 1); assert.equal(state.commits, 1); assert.equal(e.undo.length, 1); assert.equal(e.redo.length, 0);
    const act = e.undo[0], first = e.requests[0], firstVideo = first.operations.find(op => op.type === 'video-patch');
    assert.equal(firstVideo.expectedRevision, state.initialRevision); assert.equal(state.video.revision, state.initialRevision + 1); assert.equal(e.videos[0].revision, state.initialRevision);
    assert.equal(e.historyAttemptsRef.current.has(act), false, 'Acknowledged commit clears its attempt even after the display refresh fails');
    assert.equal(e.works.find(row => row.id === 'image-a').canvasX, 50); assert.equal(e.textNodes[0].canvasX, 50); assert.equal(state.video.canvasX, 50);
    assert.deepEqual(e.tips, ['布局已保存，视频节点显示稍后同步']); assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false);
    assert.deepEqual(state.refreshes.map(({ status }) => status), ['OK', 'FAIL']);
    await e.doUndo();
    assert.equal(e.requests.length, 2); assert.equal(state.commits, 2); const undo = e.requests[1], undoVideo = undo.operations.find(op => op.type === 'video-patch');
    assert.equal(undoVideo.expectedRevision, state.initialRevision + 1); assert.deepEqual(undoVideo.fields, { x: before.video.canvasX, y: before.video.canvasY });
    assert.notEqual(undo.operationId, first.operationId); assert.equal(state.video.revision, state.initialRevision + 2); assert.equal(e.videos[0].revision, state.initialRevision + 2);
    assert.deepEqual(e.works, before.works); assert.deepEqual(e.textNodes, before.textNodes); assert.deepEqual(state.works, before.works); assert.deepEqual(state.textNodes, before.textNodes);
    assert.equal(state.video.canvasX, before.video.canvasX); assert.equal(state.video.canvasY, before.video.canvasY);
    assert.equal(e.undo.length, 0); assert.equal(e.redo.length, 1); assert.equal(e.redo[0], act); assert.equal(e.historyAttemptsRef.current.has(act), false);
    assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false); assert.deepEqual(e.tips, ['布局已保存，视频节点显示稍后同步']);
    assert.deepEqual(state.refreshes.map(({ revision, status }) => ({ revision, status })), [{ revision: 10, status: 'OK' }, { revision: 11, status: 'FAIL' }, { revision: 11, status: 'OK' }, { revision: 12, status: 'OK' }]);
    assert(state.timeline.indexOf('refresh:3:11:OK') < state.timeline.indexOf(`post:${undo.operationId}:11`));
    assert(e.events.indexOf('video:flush') < e.events.indexOf('video:refresh'));
    return { revisionsPosted: [firstVideo.expectedRevision, undoVideo.expectedRevision], serverRevision: state.video.revision, refreshes: state.refreshes, timeline: state.timeline, undo: e.undo.length, redo: e.redo.length };
  });
  await test('P2 AST video: failed preflight sends zero HTTP and allocates no cached attempt', async () => {
    const { e, state } = revisionScenario({ failRefreshCalls: [1] }), act = freshVideoMove(e), before = localPositions(e);
    await assert.rejects(e.applyHistory(act, false), /local video refresh failed/);
    assertNoCommit(e); assert.deepEqual(localPositions(e), before); assert.equal(e.operationCounter, 0); assert.equal(e.historyAttemptsRef.current.has(act), false); assert.equal(state.commits, 0);
    assert.equal(e.events.includes('auth:start'), false); assert.deepEqual(state.refreshes.map(item => item.status), ['FAIL']);
    return { http: 0, cachedAttempt: false, operationIdsAllocated: 0, serverRevision: state.video.revision };
  });
  await test('P2 AST video: layout wrapper reports preflight failure without persistence or undo and releases busy', async () => {
    const { e, state } = revisionScenario({ failRefreshCalls: [1] }), before = localPositions(e);
    await e.arrangeSelection('left'); assertNoCommit(e); assert.deepEqual(localPositions(e), before); assert.equal(e.operationCounter, 0); assert.equal(state.commits, 0);
    assert.deepEqual(e.tips, ['local video refresh failed']); assert.equal(e.historyBusyRef.current, false); assert.equal(e.historySaving, false);
  });
  for (const change of ['scope', 'predicate']) await test(`P2 AST video: assertCurrentHistory blocks ${change} switch after preflight await before caching/HTTP`, async () => {
    const { e } = revisionScenario(), gate = deferred(), act = freshVideoMove(e), before = localPositions(e); let current = true;
    e.videoNodesStore.refresh = async () => { e.events.push('preflight:start'); await gate.promise; };
    const pending = e.applyHistory(act, false, () => current); await spinUntil(() => e.events.includes('preflight:start'));
    if (change === 'scope') e.historyScopeRef.current = 'other-scope'; else current = false;
    gate.resolve(); await assert.rejects(pending, /项目已切换/); assertNoCommit(e); assert.deepEqual(localPositions(e), before);
    assert.equal(e.operationCounter, 0); assert.equal(e.historyAttemptsRef.current.has(act), false);
  });
  await test('P2 AST video: cached unknown replay preserves exact operationId/body without a new preflight refresh', async () => {
    const { e, state } = revisionScenario({ unknownFirst: true }), act = freshVideoMove(e), before = localPositions(e);
    await assert.rejects(e.applyHistory(act, false), /local unknown outcome after server commit/);
    assert.equal(e.requests.length, 1); assert.equal(state.commits, 1); assert.equal(e.undo.length, 0); assert.equal(e.redo.length, 0);
    assert.deepEqual(e.works, before.works); assert.deepEqual(e.textNodes, before.textNodes); assert.equal(e.videos[0].canvasX, before.videos[0].canvasX);
    const cached = e.historyAttemptsRef.current.get(act), cachedBefore = plain(cached), originalBody = state.rawRequests[0]; assert(cached); assert.equal(state.refreshes.length, 1);
    assert.equal(cached.operations[0].expectedRevision, state.initialRevision); assert.equal(state.video.revision, state.initialRevision + 1);
    // Change both a local revision and the action's proposed target. Neither
    // may rewrite the already-accepted unknown operation on an idempotent retry.
    e.videos[0].revision = state.initialRevision + 20; act.moves[0].to.x = 9999;
    const fetch = e.fetch;
    e.fetch = async (...args) => { assert.equal(state.refreshes.length, 1, 'Cached retry must POST before another refresh'); assert.equal(e.historyAttemptsRef.current.get(act), cached); assert.deepEqual(cached, cachedBefore); return fetch(...args); };
    await e.applyHistory(act, false);
    assert.equal(e.requests.length, 2); assert.equal(state.commits, 1); assert.equal(state.rawRequests[1], originalBody); assert.deepEqual(e.requests[1], e.requests[0]);
    assert.equal(e.operationCounter, 1); assert.deepEqual(cached, cachedBefore); assert.equal(e.historyAttemptsRef.current.has(act), false);
    assert.equal(state.refreshes.length, 2, 'The only later refresh is after the replay acknowledgment'); assert.equal(e.videos[0].revision, state.initialRevision + 1); assert.equal(e.videos[0].canvasX, 50);
    assert.equal(state.video.canvasX, 50); assert.deepEqual(e.tips, []);
    return { sameActionObject: true, byteIdenticalBody: true, originalExpectedRevision: cachedBefore.operations[0].expectedRevision, localRevisionBeforeRetry: state.initialRevision + 20, serverCommits: state.commits, refreshes: state.refreshes, operationId: cachedBefore.operationId };
  });
  await test('P2 AST video: preflight after flush reads the latest revision before constructing payload', async () => {
    const { e, state } = revisionScenario();
    e.videoNodesStore.flush = async () => { e.events.push('video:flush'); state.video.revision += 3; };
    const act = freshVideoMove(e); await e.applyHistory(act, false);
    assert.equal(e.requests.length, 1); assert.equal(e.requests[0].operations[0].expectedRevision, state.initialRevision + 3); assert.equal(state.video.revision, state.initialRevision + 4);
    assert(e.events.indexOf('video:flush') < e.events.indexOf('video:refresh')); assert(e.events.indexOf('video:refresh') < e.events.indexOf('auth:start'));
    assert.equal(e.historyAttemptsRef.current.has(act), false);
    return { initialServerRevision: state.initialRevision, afterFlush: state.initialRevision + 3, expectedRevision: e.requests[0].operations[0].expectedRevision };
  });
}
function svgScene(variant) {
  const palettes = [['#d8e6d9','#8ba992','#456d5a'],['#f1e4cd','#d2b283','#927356'],['#dbe7ed','#a2bac8','#597b91']]; const [bg, mid, dark] = palettes[variant % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560"><defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#fffefa"/><stop offset="1" stop-color="${bg}"/></linearGradient><linearGradient id="cup"><stop stop-color="#fffdf8"/><stop offset=".7" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="13"/></filter></defs><path fill="url(#wall)" d="M0 0h800v560H0z"/><path fill="${mid}" opacity=".16" d="M560 0h240v560H350z"/><path fill="#fff" opacity=".5" d="M0 0h280L0 440z"/><ellipse cx="400" cy="443" rx="195" ry="29" fill="${dark}" opacity=".14" filter="url(#blur)"/><ellipse cx="391" cy="435" rx="186" ry="17" fill="#fffef9"/><ellipse cx="390" cy="432" rx="160" ry="12" fill="${mid}" opacity=".2"/><path d="M286 235h230l-23 153q-7 37-91 39-83-2-92-39z" fill="url(#cup)"/><path d="M510 259c100-13 108 125-9 115" fill="none" stroke="${mid}" stroke-width="23"/><path d="M512 259c89-8 88 113-7 111" fill="none" stroke="#f9fbf4" stroke-width="14"/><ellipse cx="400" cy="235" rx="115" ry="25" fill="#faf8ef"/><ellipse cx="400" cy="234" rx="102" ry="16" fill="#8b6b4e"/><ellipse cx="402" cy="233" rx="84" ry="11" fill="#b7966b"/><path d="M366 231q34-24 69 0-34 15-69 0" fill="#f0ddbe"/><path d="M388 224q13-16 28-4" fill="none" stroke="#f7ead3" stroke-width="4"/><path d="M143 420q60-70 39-174 63 91 11 183" fill="${dark}" opacity=".7"/><path d="M193 412q-38-85-102-83 29 66 102 83" fill="${mid}"/><path d="M180 332q51-81 91-56-41 61-91 56" fill="${mid}"/><path d="M191 429q-9-128 20-212" fill="none" stroke="${dark}" stroke-width="3"/><text x="37" y="522" font-family="Arial,sans-serif" font-size="13" letter-spacing="3" fill="${dark}" opacity=".58">LOCAL SYNTHETIC SCENE ${variant + 1}</text></svg>`;
}
async function preview() {
  fs.mkdirSync(PREVIEW, { recursive: true });
  // Recreate ignored output from tracked fixtures on a fresh checkout. The
  // fixture sources are parent-owned; this harness only reads and copies them.
  const fixtureRoot = path.join(ROOT, 'scripts/fixtures/canvas-jimeng');
  const fixtureSources = ['preview-entry.tsx', 'preview.css'].map(file => {
    const source = path.join(fixtureRoot, file), target = path.join(PREVIEW, file);
    fs.copyFileSync(source, target);
    assert.equal(hash(target), hash(source), `Preview fixture copied exactly: ${file}`);
    return { path: source, sha256: hash(source) };
  });
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(PREVIEW, `scene-${i + 1}.svg`), svgScene(i), 'utf8');
  const entry = path.join(PREVIEW, 'preview-entry.tsx'); assert(fs.existsSync(entry), 'Local preview entry must exist');
  const built = await esbuild.build({ absWorkingDir: ROOT, entryPoints: [entry], outdir: PREVIEW, entryNames: 'app', bundle: true, platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic', minify: false, sourcemap: false, metafile: true, define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.join(ROOT, 'src') }, logLevel: 'silent' });
  const inputs = Object.keys(built.metafile.inputs);
  for (const module of ['canvas-navigator.tsx', 'selection-layout-controls.tsx', 'creative-presets.tsx', 'selection-layout.ts', 'navigator.ts']) assert(inputs.some(input => input.replaceAll('\\', '/').endsWith(module)), `Actual module bundled: ${module}`);
  const html = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:"><title>Naumi · local UI fixture</title><link rel="stylesheet" href="./app.css"></head><body><div id="root"></div><script src="./app.js"></script></body></html>\n`;
  fs.writeFileSync(path.join(PREVIEW, 'index.html'), html, 'utf8');
  const manifest = { fixture: 'local UI fixture', realUserMedia: false, supplierCalls: 0, externalUploads: 0, networkGeneration: false, builtAt: new Date().toISOString(), fixtureSources, actualModules: inputs.filter(input => /(?:components\/canvas\/(?:canvas-navigator|selection-layout-controls|creative-presets)|lib\/canvas\/(?:selection-layout|navigator|creative-presets))\.(?:tsx?|css)$/.test(input.replaceAll('\\', '/'))).map(input => ({ path: input, sha256: hash(path.resolve(ROOT, input)) })), artifacts: ['index.html', 'app.js', 'app.css', 'scene-1.svg', 'scene-2.svg', 'scene-3.svg'].map(file => ({ path: path.join(PREVIEW, file), sha256: hash(path.join(PREVIEW, file)), bytes: fs.statSync(path.join(PREVIEW, file)).size })), browserAcceptance: 'PENDING_PARENT_BROWSER_CHECK' };
  json(path.join(PREVIEW, 'manifest.json'), manifest); artifacts.push(...manifest.artifacts.map(a => a.path), path.join(PREVIEW, 'manifest.json'));
  return { fixtureSources, actualModules: manifest.actualModules, localFiles: manifest.artifacts.length };
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (BASELINE) {
    await test('Baseline raw preserved: SHA256 equals recorded original', () => { const expected = JSON.parse(fs.readFileSync(path.join(OUT, 'BASELINE_HASHES.json'), 'utf8')).find(item => item.path === REL); assert(expected); assert.equal(sourceHash, expected.sha256); });
    for (const id of ['locateOutlineNode', 'fitCanvasSelection', 'arrangeSelection']) await test(`Baseline reproduces missing callback: ${id}`, () => assert.equal(walk(sf, n => ts.isFunctionDeclaration(n) && name(n) === id).length, 0));
    for (const tag of ['CanvasNavigator', 'SelectionLayoutControls', 'CreativePresets']) await test(`Baseline reproduces missing component wiring: ${tag}`, () => assert.equal(jsxAll(tag).length, 0));
  } else {
    helpers = loadPure('src/lib/canvas/selection-layout.ts');
    declarations = ['privateFetchRaw', 'flowNodeSize', 'fitCanvasSelection', 'locateOutlineNode', 'arrangeSelection', 'applyHistory', 'doUndo', 'doRedo', 'applyArtworkSelection', 'clearCanvasSelection', 'selectWorkflowGroup'].map(functionText).join('\n') + '\n' + variableCallback('pushUndo');
    if (!PREVIEW_ONLY) { await sourceTests(); await runtimeTests(); await contextTests(); await presetKeyboardTests(); await p2RegressionTests(); }
    await test('Bundle actual React components and local synthetic preview (no server)', preview);
  }
  assert.equal(hash(sourcePath), sourceHash, 'Source was not modified during this run');
  const counts = { total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length };
  const file = path.join(OUT, BASELINE ? 'INTEGRATION_BASELINE.json' : PREVIEW_ONLY ? 'INTEGRATION_PREVIEW.json' : 'INTEGRATION.json');
  const report = { mode: BASELINE ? 'BASELINE_MISSING_FEATURE_REPRODUCTION' : PREVIEW_ONLY ? 'LOCAL_REACT_PREVIEW' : 'MODIFIED_SOURCE_AST_RUNTIME_AND_LOCAL_PREVIEW', fixture: true, command: `node scripts/verify-canvas-jimeng-integration.cjs${BASELINE ? ' --baseline' : PREVIEW_ONLY ? ' --preview-only' : ''}${sourceRootIndex !== -1 ? ` --source-root ${JSON.stringify(baselineRoot)}` : ''}`, source: { path: sourcePath, sha256: sourceHash }, extracted, counts, results, artifacts, limits: ['Local AST runtime and real-component fixture; not live application acceptance', 'No supplier generation, HTTP request, server startup or production build', 'Parent must open browser, inspect and capture actual UI', 'Baseline raw was read only; source files were not edited'], exitStatus: counts.fail ? 1 : 0 };
  json(file, report); assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).counts.total, counts.total); artifacts.forEach(file => assert(fs.readFileSync(file).length > 0));
  console.log(`${BASELINE ? 'BASELINE' : 'MODIFIED'} total=${counts.total} pass=${counts.pass} fail=${counts.fail}`);
  for (const result of results.filter(r => r.status === 'FAIL')) console.error(`FAIL ${result.label}\n${result.error}`);
  console.log(`REPORT=${file}`); if (!BASELINE) console.log(`PREVIEW=${path.join(PREVIEW, 'index.html')}`);
  process.exitCode = counts.fail ? 1 : 0;
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
