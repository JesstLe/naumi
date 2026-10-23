#!/usr/bin/env node
/* Local integration harness. No production imports are executed as a component.
 * Run only after SOURCE STABLE. No HTTP requests, Git, builds or server startup.
 * node scripts/verify-canvas-jimeng-integration.cjs [--baseline|--preview-only]
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
const sourcePath = path.join(BASELINE ? path.join(OUT, 'baseline') : ROOT, REL);
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
  env.active.members = env.nodes.filter(n => !['text', 'pend', 'workflowGroup', 'workflowDecoration', 'videoGeneration'].includes(n.type) && !n.id.startsWith('task-')).map(n => ({ id: n.id, canvasX: n.position.x, canvasY: n.position.y }));
  env.active.textNodes = env.nodes.filter(n => n.type === 'text').map(n => ({ id: n.id, projectKey: env.activeKey, canvasX: n.position.x, canvasY: n.position.y }));
  env.active.videoNodes = env.nodes.filter(n => n.type === 'videoGeneration').map(n => ({ id: n.id, projectKey: env.activeKey, revision: 3, canvasX: n.position.x, canvasY: n.position.y }));
  env.works = plain(env.active.members); env.textNodes = plain(env.active.textNodes); env.textNodesRef.current = env.textNodes; env.videos = plain(env.active.videoNodes); env.videoNodesStore.nodes = env.videos;
  Object.assign(env, options.env || {});
  Object.assign(env, compile(env, declarations, ['privateFetchRaw', 'fitCanvasSelection', 'locateOutlineNode', 'arrangeSelection', 'applyHistory', 'pushUndo', 'applyArtworkSelection', 'clearCanvasSelection', 'selectWorkflowGroup', 'flowNodeSize']));
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
    const expected = helpers.arrangeCanvasSelection(selectedBefore.map(n => ({ id: n.id, ...n.position, ...e.flowNodeSize(n) })), action);
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
    e.multiSel = ['image-a', 'text-a', 'video-a']; e.refreshError = true; await e.arrangeSelection('left');
    assert.equal(e.requests.length, 1); assert(e.events.includes('persist:ack')); assert.equal(e.undo.length, 1, 'Server-committed layout must not lose undo due to a later local refresh error');
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
function svgScene(variant) {
  const palettes = [['#d8e6d9','#8ba992','#456d5a'],['#f1e4cd','#d2b283','#927356'],['#dbe7ed','#a2bac8','#597b91']]; const [bg, mid, dark] = palettes[variant % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560"><defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#fffefa"/><stop offset="1" stop-color="${bg}"/></linearGradient><linearGradient id="cup"><stop stop-color="#fffdf8"/><stop offset=".7" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="13"/></filter></defs><path fill="url(#wall)" d="M0 0h800v560H0z"/><path fill="${mid}" opacity=".16" d="M560 0h240v560H350z"/><path fill="#fff" opacity=".5" d="M0 0h280L0 440z"/><ellipse cx="400" cy="443" rx="195" ry="29" fill="${dark}" opacity=".14" filter="url(#blur)"/><ellipse cx="391" cy="435" rx="186" ry="17" fill="#fffef9"/><ellipse cx="390" cy="432" rx="160" ry="12" fill="${mid}" opacity=".2"/><path d="M286 235h230l-23 153q-7 37-91 39-83-2-92-39z" fill="url(#cup)"/><path d="M510 259c100-13 108 125-9 115" fill="none" stroke="${mid}" stroke-width="23"/><path d="M512 259c89-8 88 113-7 111" fill="none" stroke="#f9fbf4" stroke-width="14"/><ellipse cx="400" cy="235" rx="115" ry="25" fill="#faf8ef"/><ellipse cx="400" cy="234" rx="102" ry="16" fill="#8b6b4e"/><ellipse cx="402" cy="233" rx="84" ry="11" fill="#b7966b"/><path d="M366 231q34-24 69 0-34 15-69 0" fill="#f0ddbe"/><path d="M388 224q13-16 28-4" fill="none" stroke="#f7ead3" stroke-width="4"/><path d="M143 420q60-70 39-174 63 91 11 183" fill="${dark}" opacity=".7"/><path d="M193 412q-38-85-102-83 29 66 102 83" fill="${mid}"/><path d="M180 332q51-81 91-56-41 61-91 56" fill="${mid}"/><path d="M191 429q-9-128 20-212" fill="none" stroke="${dark}" stroke-width="3"/><text x="37" y="522" font-family="Arial,sans-serif" font-size="13" letter-spacing="3" fill="${dark}" opacity=".58">LOCAL SYNTHETIC SCENE ${variant + 1}</text></svg>`;
}
async function preview() {
  fs.mkdirSync(PREVIEW, { recursive: true });
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(PREVIEW, `scene-${i + 1}.svg`), svgScene(i), 'utf8');
  const entry = path.join(PREVIEW, 'preview-entry.tsx'); assert(fs.existsSync(entry), 'Local preview entry must exist');
  const built = await esbuild.build({ absWorkingDir: ROOT, entryPoints: [entry], outdir: PREVIEW, entryNames: 'app', bundle: true, platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic', minify: false, sourcemap: false, metafile: true, define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.join(ROOT, 'src') }, logLevel: 'silent' });
  const inputs = Object.keys(built.metafile.inputs);
  for (const module of ['canvas-navigator.tsx', 'selection-layout-controls.tsx', 'creative-presets.tsx', 'selection-layout.ts', 'navigator.ts']) assert(inputs.some(input => input.replaceAll('\\', '/').endsWith(module)), `Actual module bundled: ${module}`);
  const html = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:"><title>Naumi · local UI fixture</title><link rel="stylesheet" href="./app.css"></head><body><div id="root"></div><script src="./app.js"></script></body></html>\n`;
  fs.writeFileSync(path.join(PREVIEW, 'index.html'), html, 'utf8');
  const manifest = { fixture: 'local UI fixture', realUserMedia: false, supplierCalls: 0, externalUploads: 0, networkGeneration: false, builtAt: new Date().toISOString(), actualModules: inputs.filter(input => /(?:components\/canvas\/(?:canvas-navigator|selection-layout-controls|creative-presets)|lib\/canvas\/(?:selection-layout|navigator|creative-presets))\.(?:tsx?|css)$/.test(input.replaceAll('\\', '/'))).map(input => ({ path: input, sha256: hash(path.resolve(ROOT, input)) })), artifacts: ['index.html', 'app.js', 'app.css', 'scene-1.svg', 'scene-2.svg', 'scene-3.svg'].map(file => ({ path: path.join(PREVIEW, file), sha256: hash(path.join(PREVIEW, file)), bytes: fs.statSync(path.join(PREVIEW, file)).size })), browserAcceptance: 'PENDING_PARENT_BROWSER_CHECK' };
  json(path.join(PREVIEW, 'manifest.json'), manifest); artifacts.push(...manifest.artifacts.map(a => a.path), path.join(PREVIEW, 'manifest.json'));
  return { actualModules: manifest.actualModules, localFiles: manifest.artifacts.length };
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (BASELINE) {
    await test('Baseline raw preserved: SHA256 equals recorded original', () => { const expected = JSON.parse(fs.readFileSync(path.join(OUT, 'BASELINE_HASHES.json'), 'utf8')).find(item => item.path === REL); assert(expected); assert.equal(sourceHash, expected.sha256); });
    for (const id of ['locateOutlineNode', 'fitCanvasSelection', 'arrangeSelection']) await test(`Baseline reproduces missing callback: ${id}`, () => assert.equal(walk(sf, n => ts.isFunctionDeclaration(n) && name(n) === id).length, 0));
    for (const tag of ['CanvasNavigator', 'SelectionLayoutControls', 'CreativePresets']) await test(`Baseline reproduces missing component wiring: ${tag}`, () => assert.equal(jsxAll(tag).length, 0));
  } else {
    helpers = loadPure('src/lib/canvas/selection-layout.ts');
    declarations = ['privateFetchRaw', 'flowNodeSize', 'fitCanvasSelection', 'locateOutlineNode', 'arrangeSelection', 'applyHistory', 'applyArtworkSelection', 'clearCanvasSelection', 'selectWorkflowGroup'].map(functionText).join('\n') + '\n' + variableCallback('pushUndo');
    if (!PREVIEW_ONLY) { await sourceTests(); await runtimeTests(); await contextTests(); await presetKeyboardTests(); }
    await test('Bundle actual React components and local synthetic preview (no server)', preview);
  }
  assert.equal(hash(sourcePath), sourceHash, 'Source was not modified during this run');
  const counts = { total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length };
  const file = path.join(OUT, BASELINE ? 'INTEGRATION_BASELINE.json' : PREVIEW_ONLY ? 'INTEGRATION_PREVIEW.json' : 'INTEGRATION.json');
  const report = { mode: BASELINE ? 'BASELINE_MISSING_FEATURE_REPRODUCTION' : PREVIEW_ONLY ? 'LOCAL_REACT_PREVIEW' : 'MODIFIED_SOURCE_AST_RUNTIME_AND_LOCAL_PREVIEW', fixture: true, command: `node scripts/verify-canvas-jimeng-integration.cjs${BASELINE ? ' --baseline' : PREVIEW_ONLY ? ' --preview-only' : ''}`, source: { path: sourcePath, sha256: sourceHash }, extracted, counts, results, artifacts, limits: ['Local AST runtime and real-component fixture; not live application acceptance', 'No supplier generation, HTTP request, server startup or production build', 'Parent must open browser, inspect and capture actual UI', 'Baseline raw was read only; source files were not edited'], exitStatus: counts.fail ? 1 : 0 };
  json(file, report); assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).counts.total, counts.total); artifacts.forEach(file => assert(fs.readFileSync(file).length > 0));
  console.log(`${BASELINE ? 'BASELINE' : 'MODIFIED'} total=${counts.total} pass=${counts.pass} fail=${counts.fail}`);
  for (const result of results.filter(r => r.status === 'FAIL')) console.error(`FAIL ${result.label}\n${result.error}`);
  console.log(`REPORT=${file}`); if (!BASELINE) console.log(`PREVIEW=${path.join(PREVIEW, 'index.html')}`);
  process.exitCode = counts.fail ? 1 : 0;
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
