#!/usr/bin/env node
'use strict';

/**
 * Offline integration contract, not a browser or supplier acceptance test.
 *
 * node scripts/verify-canvas-text-image-integration.cjs
 * node scripts/verify-canvas-text-image-integration.cjs --baseline
 * node scripts/verify-canvas-text-image-integration.cjs --source-root C:/absolute/copy
 * node scripts/verify-canvas-text-image-integration.cjs --baseline --source-root C:/absolute/restored-copy
 *
 * Default baseline reads the preserved before/Canvas. An explicit baseline
 * --source-root reads THAT root's src/Canvas, allowing a restored-copy test
 * without redirecting back to the original backup. Baseline never loads the
 * newly added helper, dialog, or server module. Every baseline is SHA-pinned.
 *
 * Actual Canvas function declarations are AST-selected and transpiled without
 * replacing their bodies. React render closures are modeled by a factory;
 * generatePend is the intercepted boundary. The pure helper is loaded from
 * the selected source root. The server placement function is also AST-selected
 * and executed with in-memory query/context fixtures, never a database.
 * Dialog checks are STATIC AST checks only, not full UI interaction claims.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const BASELINE_SHA256 = '2218afacf1c50ec07f8e572768fd9055244a717ec9d58b120c07758dcc063234';
const CANVAS_PATH = 'src/components/canvas/canvas-client.tsx';
const BEFORE_PATH = 'output/canvas-general-text-image-20261023/before';
const ACTUAL_FUNCTIONS = ['textImageScopeCurrent', 'openTextImageMenu', 'textImageRequests',
  'textImageReferenceCount', 'generateImagesFromTextNodes'];
let cases = 0, assertions = 0, activeCase = 'setup', httpCalls = 0;
const eq = (actual, expected, message) => { assertions++; assert.equal(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const plain = value => JSON.parse(JSON.stringify(value));
const deep = (actual, expected, message) => { assertions++; assert.deepEqual(plain(actual), plain(expected), message); };
const matches = (actual, expected, message) => { assertions++; assert.match(actual, expected, message); };
const rejects = async (fn, expected) => { assertions++; await assert.rejects(fn, expected); };
async function test(name, fn) {
  activeCase = name;
  await fn();
  cases++;
  console.log(`CASE=${name} RESULT=PASS`);
}
function args() {
  let baseline = false, explicitRoot = false, root = path.resolve(__dirname, '..');
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--baseline') baseline = true;
    else if (arg === '--source-root' || arg.startsWith('--source-root=')) {
      const value = arg === '--source-root' ? process.argv[++i] : arg.slice('--source-root='.length);
      if (!value || !path.isAbsolute(value)) throw new Error('--source-root requires an absolute path');
      root = path.resolve(value); explicitRoot = true;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return { root, baseline, explicitRoot };
}
const read = file => fs.readFileSync(file, 'utf8');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function parse(file, source = read(file)) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, '\n')}`);
  return { file, source, ast };
}
function all(model, predicate) {
  const result = [];
  function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(model.ast); return result;
}
function oneFunction(model, name) {
  const found = all(model, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (found.length !== 1 || !found[0].body) throw new Error(`${model.file}: expected exactly one real ${name}, found ${found.length}`);
  return found[0];
}
const functionText = (model, name) => oneFunction(model, name).getText(model.ast);
function constantText(model, name) {
  const found = all(model, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  if (found.length !== 1 || !found[0].initializer) throw new Error(`Missing/ambiguous constant ${name}`);
  return `const ${name} = ${found[0].initializer.getText(model.ast)};`;
}
function transpile(source, file = 'text-image-fixture.ts') {
  const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const error = result.diagnostics?.find(item => item.category === ts.DiagnosticCategory.Error);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return result.outputText;
}
function run(context, source, file) {
  return vm.runInContext(transpile(source, file), context, { filename: file || 'text-image-fixture.ts', timeout: 5000 });
}
function loadActualHelper(root, network) {
  const file = path.join(root, 'src/lib/canvas/text-image-inputs.ts');
  const exports = {};
  const context = vm.createContext({ Error, exports, module: { exports }, fetch: network.deny,
    require: name => { throw new Error(`Unexpected dependency in pure text-image helper: ${name}`); } });
  // Transpile the complete real module, not a handwritten replacement. Avoid
  // tsx/esbuild's named-pipe service: IPC is not an HTTP/supplier request.
  run(context, read(file), file);
  return context.module.exports;
}
function blockHttp() {
  const restore = [];
  const deny = () => { httpCalls++; throw new Error('Unexpected HTTP/network access in offline text-image fixture'); };
  const patch = (object, key) => {
    const previous = object[key]; object[key] = deny; restore.push(() => { object[key] = previous; });
  };
  patch(globalThis, 'fetch');
  for (const name of ['node:http', 'node:https']) for (const method of ['request', 'get']) patch(require(name), method);
  for (const method of ['connect', 'createConnection']) patch(require('node:net'), method);
  patch(require('node:tls'), 'connect');
  return { deny, restore: () => restore.reverse().forEach(fn => fn()) };
}
const node = (id = 'text-a', content = '一只白鹭站在雨后的石桥上', extra = {}) => ({
  id, content, prompt: '', projectKey: 'tree:project-a', title: id, sourceIds: [], productIds: [],
  status: 'completed', canvasX: 20.4, canvasY: 30.6, width: 380, ...extra,
});
const art = (id, extra = {}) => ({ id, image: `/fixture/${id}.png`, source: 'upload', ...extra });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(model, helper, network, options = {}) {
  const texts = options.nodes || [node()];
  const project = { key: 'tree:project-a', members: options.members || [] };
  const c = {
    Error, console, fetch: network.deny,
    readOnly: false, user: { email: 'fixture@example.test' }, allowed: true, nodeSettingsReady: true,
    active: project, activeKey: project.key, activeProjectRef: { current: project },
    textNodes: texts, textNodesRef: { current: texts }, selectedTextId: null, textPrompt: '',
    workspace: 'workspace-a', currentWorkspace: () => c.workspace,
    canvasAccountRef: { current: 'account-a' }, canvasContextEpochRef: { current: 0 },
    textImageContextRef: { current: { key: JSON.stringify(['account-a', project.key, 'workspace-a']), revision: 0 } },
    batchRunMountedRef: { current: true }, textImageSubmittingRef: { current: false },
    textImageSubmitting: false, genImageMenu: null, menuUpdates: [], submittingUpdates: [],
    locked: new Set(), canFeature: feature => feature === 'generate' && c.allowed,
    isNodeLocked: id => c.locked.has(id),
    hasRenderableImage: value => typeof value === 'string' && value.length > 0,
    pendSeqRef: { current: 1 }, rfRef: { current: { getNodes: () => options.graph || [] } },
    pending: [], pendingUpdaters: [], pendSetterCalls: 0, calls: [], tips: [],
    t: key => key, L: (zh, en) => options.locale === 'en' ? en : zh,
    flashTip: message => c.tips.push(String(message)),
    setGenImageMenu: value => {
      c.menuUpdates.push(value); c.genImageMenu = typeof value === 'function' ? value(c.genImageMenu) : value;
      options.onMenuUpdate?.(c, value);
    },
    setTextImageSubmitting: value => { c.textImageSubmitting = value; c.submittingUpdates.push(value); },
    setPendNodes: updater => {
      c.pendSetterCalls++;
      if (options.deferPending) c.pendingUpdaters.push(updater);
      else c.pending = typeof updater === 'function' ? updater(c.pending) : updater;
    },
    generatePend: async opts => {
      c.calls.push(opts);
      return options.generatePend ? options.generatePend(opts, c, c.calls.length) : true;
    },
    ...(helper || {}),
  };
  vm.createContext(c);
  const names = options.baseline ? ['generateImagesFromTextNodes'] : ACTUAL_FUNCTIONS;
  const constants = ['MAX_TOTAL_IMAGES', 'X_GAP', 'TEXT_NODE_DEFAULT_W', 'REPLICATE_GUARD'].map(name => constantText(model, name)).join('\n');
  const legacy = options.baseline ? functionText(model, 'stripMentionLines') : '';
  let revisionCode = '';
  if (!options.baseline) {
    const revisionIf = all(model, n => ts.isIfStatement(n) && n.expression.getText(model.ast).includes('textImageContextRef.current.key !== textImageContextKey'));
    if (revisionIf.length !== 1) throw new Error('Expected the actual render-context revision branch');
    revisionCode = `${constantText(model, 'textImageContextKey')}\n${revisionIf[0].getText(model.ast)}`;
  }
  run(c, `${constants}\n${legacy}\nglobalThis.__captureRender = function(renderState) {\nconst {genImageMenu, readOnly, user, nodeSettingsReady, selectedTextId, textPrompt, active, activeKey, textNodes} = renderState;\n${revisionCode}\n${names.map(name => functionText(model, name)).join('\n')}\nreturn {${names.join(',')}}; };`, 'actual-canvas-functions.ts');
  const h = {
    c, render: () => c.__captureRender({ ...c, active: c.activeProjectRef.current,
      activeKey: c.activeProjectRef.current?.key || '', textNodes: c.textNodesRef.current }),
    open: (ids = ['text-a'], images = []) => { h.render().openTextImageMenu(ids, images); return c.genImageMenu; },
    submit: (mode = 'general', settings = {}) => h.render().generateImagesFromTextNodes(mode, { combine: true, useReferences: true, ...settings }),
    requests: (mode = 'general', settings = {}) => h.render().textImageRequests(c.genImageMenu, mode, { combine: true, useReferences: true, ...settings }),
    references: () => h.render().textImageReferenceCount(c.genImageMenu),
    flush: () => { for (const updater of c.pendingUpdaters.splice(0)) c.pending = updater(c.pending); },
  };
  return h;
}
function expectBlocked(h, tipPattern) {
  eq(h.c.calls.length, 0, 'no generatePend invocation');
  eq(h.c.pendSetterCalls, 0, 'no pending placeholder before full validation');
  eq(h.c.textImageSubmittingRef.current, false, 'submission lock is released');
  if (tipPattern) ok(h.c.tips.some(tip => tipPattern.test(tip)), `expected tip ${tipPattern}; got ${h.c.tips.join(' | ')}`);
}

async function baselineTests(config, network) {
  const file = path.join(config.explicitRoot ? config.root : path.join(config.root, BEFORE_PATH), CANVAS_PATH);
  const model = parse(file);
  await test('BASELINE_PINNED_ORIGINAL_CANVAS', () => {
    eq(hash(file), BASELINE_SHA256); ok(oneFunction(model, 'generateImagesFromTextNodes'));
  });
  await test('BASELINE_NO_PRODUCT_BLOCKS_OLD_PURE_FUNCTION', async () => {
    const h = harness(model, null, network, { baseline: true });
    await h.render().generateImagesFromTextNodes(['text-a'], 'pure');
    eq(h.c.calls.length, 0); eq(h.c.pending.length, 0);
    ok(h.c.tips.some(tip => tip.includes('canvas.textNoProduct')));
  });
  await test('BASELINE_PRODUCT_PURE_STILL_EXECUTES', async () => {
    const h = harness(model, null, network, { baseline: true,
      nodes: [node('text-a', '@产品图\n\n纯产品场景', { productIds: ['image-product'] })], members: [art('image-product')] });
    await h.render().generateImagesFromTextNodes(['text-a'], 'pure');
    eq(h.c.calls.length, 1); eq(h.c.calls[0].prompt, '纯产品场景');
    eq(h.c.calls[0].pend.parentId, 'image-product'); deep(h.c.calls[0].pend.inputs, ['image-product', 'text-a']);
    eq(h.c.calls[0].forceStandard, true);
  });
}

async function staticTests(root, model, before) {
  await test('AST_EXTRACTS_FIVE_ACTUAL_CANVAS_FUNCTION_BODIES', () => {
    for (const name of ACTUAL_FUNCTIONS) ok(oneFunction(model, name).body, name);
    const imports = all(model, n => ts.isImportDeclaration(n));
    ok(imports.some(n => n.moduleSpecifier.text === '@/lib/canvas/text-image-inputs' || n.moduleSpecifier.text.endsWith('/canvas/text-image-inputs')),
      'Canvas imports the real helper');
    ok(imports.some(n => n.moduleSpecifier.text === './text-image-generation-dialog'));
  });
  await test('SHARED_PRIVATE_FETCH_BODIES_ARE_LITERAL_BASELINE', () => {
    for (const name of ['privateFetch', 'privateFetchRaw']) eq(functionText(model, name), functionText(before, name), name);
  });
  let parentStatement;
  await test('SHARED_GENERATE_PEND_ONLY_APPROVED_TEXT_PARENT_INSERTION', () => {
    const actual = oneFunction(model, 'generatePend');
    const candidates = all({ ...model, ast: actual.body }, n => ts.isIfStatement(n) &&
      n.expression.getText(model.ast).includes('!inputArts.length') && n.thenStatement.getText(model.ast).includes('fd.set("parentId", pend.parentId)'));
    eq(candidates.length, 1, 'exactly one approved metadata-only addition');
    parentStatement = candidates[0];
    const normalized = parentStatement.getText(model.ast).replace(/\s+/g, '');
    eq(normalized, 'if(!inputArts.length&&pend.parentId?.startsWith("text-")&&inputTextNodes.some(node=>node.id===pend.parentId))fd.set("parentId",pend.parentId);');
    const start = parentStatement.getStart(model.ast);
    const lineStart = model.source.lastIndexOf('\n', start - 1) + 1;
    const precedingStart = model.source.lastIndexOf('\n', lineStart - 2) + 1;
    const comment = model.source.slice(precedingStart, lineStart).trim();
    eq(comment, '// A text-only creation anchors its original text project, never an unrelated image.');
    let end = parentStatement.end;
    if (model.source.slice(end, end + 2) === '\r\n') end += 2;
    else if (model.source[end] === '\n') end++;
    const restored = model.source.slice(actual.getStart(model.ast), precedingStart) + model.source.slice(end, actual.end);
    eq(restored, functionText(before, 'generatePend'), 'the remaining shared function is byte-for-byte unchanged');
  });
  for (const [name, images, parent, texts, expected] of [
    ['TEXT_PARENT_METADATA_WITHOUT_IMAGE_REFERENCE', [], 'text-a', [node()], 'text-a'],
    ['TEXT_PARENT_METADATA_NEVER_OVERRIDES_IMAGE_PARENT', [art('image-a')], 'text-a', [node()], null],
    ['TEXT_PARENT_METADATA_REQUIRES_ACTUAL_TEXT_INPUT', [], 'text-missing', [node()], null],
    ['TEXT_PARENT_METADATA_IGNORES_NON_TEXT_PARENT', [], 'image-a', [node()], null],
  ]) await test(name, () => {
    const context = vm.createContext({ fd: new FormData(), inputArts: images, pend: { parentId: parent }, inputTextNodes: texts });
    run(context, parentStatement.getText(model.ast), 'actual-parent-metadata.ts');
    eq(context.fd.get('parentId'), expected); eq(context.fd.getAll('image').length, 0);
  });
  const callName = n => ts.isCallExpression(n) && ts.isIdentifier(n.expression) ? n.expression.text : '';
  await test('ALL_OLD_MENU_ENTRIES_USE_ONE_OPENER', () => {
    const setters = all(model, n => callName(n) === 'setGenImageMenu');
    const nonClose = setters.filter(n => n.arguments[0]?.kind !== ts.SyntaxKind.NullKeyword);
    eq(nonClose.length, 1, 'no old direct non-null setters remain');
    let owner = nonClose[0].parent;
    while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
    eq(owner?.name?.text, 'openTextImageMenu');
    const openers = all(model, n => callName(n) === 'openTextImageMenu');
    eq(openers.length, 5, 'mixed toolbar, text batch, context, top toolbar, composer');
    const single = openers.filter(n => n.arguments[0]?.getText(model.ast).includes('selectedText.id'));
    eq(single.length, 2);
    ok(openers.some(n => n.arguments[0]?.getText(model.ast) === '[textNode.id]'));
    ok(openers.some(n => n.arguments.length === 1 && n.arguments[0].getText(model.ast).includes('selectedTextBatchNodes.map')));
  });
  await test('MIXED_TEXT_IMAGE_TOOLBAR_PRESERVES_SELECTED_IMAGES', () => {
    const mixed = all(model, n => callName(n) === 'openTextImageMenu' && n.arguments.length === 2);
    eq(mixed.length, 1); eq(mixed[0].arguments[1].getText(model.ast), 'selectedBatchIds');
    let toolbar = mixed[0].parent;
    while (toolbar && !(ts.isJsxElement(toolbar) && toolbar.openingElement.tagName.getText(model.ast) === 'BatchSelectionToolbar')) toolbar = toolbar.parent;
    ok(toolbar); matches(toolbar.getText(model.ast), /mixed-node-batch-bar/);
    matches(toolbar.getText(model.ast), /selectedTextBatchNodes\.length\s*>\s*0\s*&&\s*selectedBatchArts\.length\s*>\s*0/);
  });
  await test('DIALOG_WIRING_SCOPE_BUSY_AND_OPTIONS', () => {
    const dialogs = all(model, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(model.ast) === 'TextImageGenerationDialog');
    eq(dialogs.length, 1);
    const props = new Map(dialogs[0].attributes.properties.filter(ts.isJsxAttribute).map(n => [n.name.getText(model.ast), n.initializer?.getText(model.ast)]));
    matches(props.get('textCount'), /genImageMenu\.textNodeIds\.length/);
    matches(props.get('referenceCount'), /textImageReferenceCount\(genImageMenu\)/);
    eq(props.get('busy'), '{textImageSubmitting}');
    matches(props.get('onGenerate'), /generateImagesFromTextNodes\(mode, options\)/);
    let wrapper = dialogs[0].parent;
    while (wrapper && !ts.isJsxExpression(wrapper)) wrapper = wrapper.parent;
    matches(wrapper.getText(model.ast), /canFeature\("generate"\).*genImageMenu.*textImageScopeCurrent\(genImageMenu\)/s);
  });
  await test('RENDER_CONTEXT_REVISION_KEY_COVERS_ACCOUNT_PROJECT_WORKSPACE', () => {
    const declarations = all(model, n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'textImageContextKey');
    eq(declarations.length, 1);
    matches(declarations[0].initializer.getText(model.ast), /JSON\.stringify\(\[canvasAccountRef\.current, activeKey, currentWorkspace\(\)\]\)/);
    const increments = all(model, n => ts.isIfStatement(n) && n.expression.getText(model.ast).includes('textImageContextRef.current.key !== textImageContextKey'));
    eq(increments.length, 1); matches(increments[0].getText(model.ast), /revision:\s*textImageContextRef\.current\.revision\s*\+\s*1/);
  });
  const ui = parse(path.join(root, 'src/components/canvas/text-image-generation-dialog.tsx'));
  const elements = tag => all(ui, n => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(ui.ast) === tag);
  const hasString = text => all(ui, n => ts.isStringLiteralLike(n) && n.text === text).length > 0;
  await test('STATIC_DIALOG_TITLE_AND_LIGHT_LAYOUT', () => {
    ok(oneFunction(ui, 'TextImageGenerationDialog')); ok(hasString('生成图片')); ok(hasString('Generate images'));
    const dialogs = elements('dialog'); eq(dialogs.length, 1);
    matches(dialogs[0].getText(ui.ast), /canvas-ui-light/); matches(dialogs[0].getText(ui.ast), /bg-white/);
    matches(dialogs[0].getText(ui.ast), /aria-modal="true"/);
  });
  await test('STATIC_DIALOG_REFERENCE_SELECTION_AND_COMBINE_SEPARATE', () => {
    ok(hasString('使用参考图')); ok(hasString('纯文字')); ok(hasString('合并创作')); ok(hasString('逐条创作'));
    const checkboxes = elements('input').filter(n => n.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(ui.ast) === 'type' && p.initializer?.getText(ui.ast) === '"checkbox"'));
    eq(checkboxes.length, 1); matches(checkboxes[0].getText(ui.ast), /checked=\{useReferences\}/);
    matches(checkboxes[0].getText(ui.ast), /setUseReferences\(event\.target\.checked\)/);
    const generate = all(ui, n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'generate');
    eq(generate.length, 1); matches(generate[0].getText(ui.ast), /if\s*\(busy\)\s*return/);
    matches(generate[0].getText(ui.ast), /onGenerate\(mode,\s*\{\s*combine:/);
    matches(generate[0].getText(ui.ast), /useReferences:\s*hasReferences\s*&&\s*useReferences/);
  });
  await test('STATIC_DIALOG_PRODUCT_MODES_ARE_OPTIONAL_DETAILS', () => {
    const details = all(ui, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ui.ast) === 'details');
    eq(details.length, 1); matches(details[0].getText(ui.ast), /商品图模式/);
    matches(details[0].getText(ui.ast), /generate\("pure"\)/); matches(details[0].getText(ui.ast), /generate\("replicate"\)/);
    matches(details[0].getText(ui.ast), /需要绑定产品图/);
    ok(all(ui, n => ts.isCallExpression(n) && n.expression.getText(ui.ast) === 'generate' && n.arguments[0]?.getText(ui.ast) === '"general"').length === 1);
  });
}

async function modifiedTests(root, model, helper, network) {
  const make = options => harness(model, helper, network, options);
  await test('GENERAL_TEXT_WITHOUT_PRODUCT_SUBMITS_REAL_BODY', async () => {
    const h = make(); h.open(); await h.submit();
    eq(h.c.calls.length, 1); eq(h.c.calls[0].prompt, h.c.textNodes[0].content);
    eq(h.c.calls[0].forceStandard, true); eq(h.c.calls[0].isCurrent(), true);
    eq(h.c.calls[0].pend.parentId, 'text-a'); deep(h.c.calls[0].pend.inputs, ['text-a']);
    eq(h.c.textImageSubmittingRef.current, false); deep(h.c.submittingUpdates, [true, false]);
  });
  await test('CURRENT_DRAFT_FALLBACK_IS_SNAPSHOTTED', async () => {
    const h = make({ nodes: [node('text-a', '')] }); h.c.selectedTextId = 'text-a'; h.c.textPrompt = '菜单打开时的草稿';
    const menu = h.open(); deep(menu.drafts, { 'text-a': '菜单打开时的草稿' });
    h.c.textPrompt = '之后的新草稿'; await h.submit();
    eq(h.c.calls[0].prompt, '菜单打开时的草稿');
  });
  await test('COMPLETED_BODY_BEATS_DRAFT_AND_SAVED_PROMPT', async () => {
    const h = make({ nodes: [node('text-a', '实际输出', { prompt: '旧输入' })] });
    h.c.selectedTextId = 'text-a'; h.c.textPrompt = '当前草稿'; h.open(); await h.submit(); eq(h.c.calls[0].prompt, '实际输出');
  });
  await test('SAVED_PROMPT_FALLBACK_AND_UNSELECTED_DRAFT_ISOLATION', async () => {
    const h = make({ nodes: [node('text-a', '', { prompt: '已保存提示词' }), node('text-b', '')] });
    h.c.selectedTextId = 'text-b'; h.c.textPrompt = '另一个文字的草稿'; const menu = h.open();
    deep(menu.drafts, {}); await h.submit(); eq(h.c.calls[0].prompt, '已保存提示词');
  });
  await test('GENERAL_NATURAL_AT_LINES_ARE_PRESERVED', async () => {
    const text = '@晨间的灯光\n用户@朋友，一起看海'; const h = make({ nodes: [node('text-a', text)] });
    h.open(); await h.submit(); eq(h.c.calls[0].prompt, text);
  });
  await test('MANY_IMAGE_REFERENCES_NO_TWO_IMAGE_TRUNCATION', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `image-${i}`);
    const h = make({ nodes: [node('text-a', '八张参考图的场景', { sourceIds: ids })], members: ids.map(id => art(id)) });
    h.open(); eq(h.references(), 8); await h.submit();
    deep(h.c.calls[0].pend.inputs, [...ids, 'text-a']); eq(h.c.calls[0].pend.parentId, ids[0]);
  });
  await test('CURRENT_PROJECT_TEXT_FILTER_AND_SELECTION_ORDER', async () => {
    const h = make({ nodes: [node(), node('text-b', '第二段'), node('text-foreign', '其他项目', { projectKey: 'tree:other' })] });
    const menu = h.open(['text-b', 'text-foreign', 'text-b', 'missing', 'text-a']);
    deep(menu.textNodeIds, ['text-b', 'text-a']); await h.submit(); eq(h.c.calls[0].prompt, '第二段\n\n一只白鹭站在雨后的石桥上');
  });
  await test('COMBINED_TEXTS_ONE_REQUEST_AND_ALL_LINEAGE', async () => {
    const h = make({ nodes: [node('text-a', '甲'), node('text-b', '乙')] }); h.open(['text-a', 'text-b']);
    await h.submit('general', { combine: true }); eq(h.c.calls.length, 1); eq(h.c.calls[0].prompt, '甲\n\n乙');
    deep(h.c.calls[0].pend.inputs, ['text-a', 'text-b']);
  });
  await test('SEPARATE_TEXTS_TWO_REQUESTS_AND_TEXT_PARENTS', async () => {
    const h = make({ nodes: [node('text-a', '甲'), node('text-b', '乙')] }); h.open(['text-a', 'text-b']);
    await h.submit('general', { combine: false }); eq(h.c.calls.length, 2);
    deep(h.c.calls.map(call => [call.prompt, call.pend.parentId, call.pend.inputs]), [['甲', 'text-a', ['text-a']], ['乙', 'text-b', ['text-b']]]);
    ok(h.c.calls[0].pend.id !== h.c.calls[1].pend.id);
  });
  await test('TEXT_DEPENDENCIES_IMAGE_MAIN_PARENT_AND_ALL_TEXT_IDS', async () => {
    const h = make({ nodes: [node('text-a', '主文字', { sourceIds: ['text-b', 'image-a'] }),
      node('text-b', '上游文字', { sourceIds: ['text-c', 'image-b'] }), node('text-c', '末段', { sourceIds: ['text-a'] })], members: [art('image-a'), art('image-b')] });
    h.open(); await h.submit(); const call = h.c.calls[0];
    eq(call.prompt, '主文字\n\n上游文字\n\n末段'); eq(call.pend.parentId, 'image-a');
    deep(call.pend.inputs, ['image-a', 'image-b', 'text-a', 'text-b', 'text-c']); eq(h.c.calls.length, 1);
  });
  await test('SELECTED_IMAGES_DISTINCT_FROM_BOUND_REFERENCES', async () => {
    const h = make({ nodes: [node('text-a', '场景', { sourceIds: ['image-bound'] })], members: [art('image-bound'), art('image-selected'), art('image-unused')] });
    const menu = h.open(['text-a'], ['image-selected', 'image-selected']); deep(menu.imageIds, ['image-selected']); eq(h.references(), 2);
    await h.submit(); deep(h.c.calls[0].pend.inputs, ['image-bound', 'image-selected', 'text-a']);
  });
  await test('REFERENCE_SWITCH_OFF_IGNORES_STALE_IMAGE_BINDINGS_AND_SELECTIONS', async () => {
    const h = make({ nodes: [node('text-a', '不使用图片', { productIds: ['stale-product'], sourceIds: ['stale-image'] })] });
    h.open(['text-a'], ['stale-selected']); ok(h.references() > 0, 'reference control remains visible for stale bindings');
    await h.submit('general', { useReferences: false }); eq(h.c.calls.length, 1);
    deep(h.c.calls[0].pend.inputs, ['text-a']); eq(h.c.calls[0].pend.parentId, 'text-a');
  });
  await test('STALE_SELECTED_REFERENCE_ON_IS_VALIDATION_FAILURE', async () => {
    const h = make(); h.open(['text-a'], ['missing-image']); await h.submit(); expectBlocked(h, /引用图片已失效|reference/i);
  });
  for (const [label, invalidArt] of [
    ['VIDEO', art('image-bad', { videoUrl: '/fixture/video.mp4' })],
    ['DECORATION', art('image-bad', { source: 'workflow-decoration' })],
    ['PLACEHOLDER', art('image-bad', { source: 'workflow-placeholder' })],
    ['UNRENDERABLE', art('image-bad', { image: '' })],
  ]) await test(`IMAGE_ALLOWLIST_EXCLUDES_${label}`, async () => {
    const h = make({ members: [invalidArt] }); h.open(['text-a'], ['image-bad']); await h.submit(); expectBlocked(h);
  });
  await test('IMAGES_OUTSIDE_ACTIVE_PROJECT_ARE_NOT_ACCEPTED', async () => {
    const h = make(); h.open(['text-a'], ['foreign-project-image']); await h.submit(); expectBlocked(h);
  });
  await test('REFERENCE_COUNT_INDEPENDENT_OF_EMPTY_AND_OVERSIZE_PROMPTS', () => {
    const h = make({ nodes: [node('text-a', '', { productIds: ['image-a'] }), node('text-b', '字'.repeat(4000), { sourceIds: ['image-b'] }), node('text-c', '字'.repeat(4000))], members: [art('image-a'), art('image-b')] });
    h.open(['text-a']); eq(h.references(), 1); h.open(['text-b', 'text-c']); eq(h.references(), 1);
    eq(h.requests('general', { combine: false }).length, 2);
  });
  await test('MAX_REFERENCES_BOUNDARY_16_ACCEPTED', async () => {
    const ids = Array.from({ length: 16 }, (_, i) => `image-${i}`); const h = make({ members: ids.map(id => art(id)) });
    h.open(['text-a'], ids); await h.submit(); eq(h.c.calls.length, 1); eq(h.c.calls[0].pend.inputs.length, 17);
  });
  await test('MAX_REFERENCES_17_REJECTED_WITHOUT_TRUNCATION', async () => {
    const ids = Array.from({ length: 17 }, (_, i) => `image-${i}`); const h = make({ members: ids.map(id => art(id)) });
    h.open(['text-a'], ids); await h.submit(); expectBlocked(h, /最多使用\s*16/);
  });
  await test('MAX_PROMPT_6000_ACCEPTED', async () => {
    const h = make({ nodes: [node('text-a', '字'.repeat(6000))] }); h.open(); await h.submit(); eq(h.c.calls[0].prompt.length, 6000);
  });
  await test('MAX_PROMPT_6001_REJECTED_WITH_CORRECT_MESSAGE', async () => {
    const h = make({ nodes: [node('text-a', '字'.repeat(6001))] }); h.open(); await h.submit(); expectBlocked(h, /6000|6,000/);
    ok(h.c.tips.every(tip => !/12000|12,000/.test(tip)));
  });
  for (const [name, texts, pattern] of [
    ['EMPTY', [node('text-a', ' \n ')], /先输入|Enter a prompt/],
    ['SECOND_EMPTY_BATCH', [node('text-a', '第一段'), node('text-b', '')], /先输入|Enter a prompt/],
    ['UPSTREAM_GENERATING', [node('text-a', '根', { sourceIds: ['text-b'] }), node('text-b', '生成中', { status: 'generating' })], /仍在生成|still generating/],
    ['SECOND_OVERSIZE_BATCH', [node('text-a', '第一段'), node('text-b', '字'.repeat(6001))], /6000|6,000/],
  ]) await test(`ALL_INPUTS_PREVALIDATED_${name}`, async () => {
    const h = make({ nodes: texts });
    // A generating upstream dependency is intentionally not an explicit menu
    // selection: the opener correctly blocks an explicitly generating node.
    h.open(name === 'UPSTREAM_GENERATING' ? ['text-a'] : texts.map(item => item.id));
    await h.submit('general', { combine: false }); expectBlocked(h, pattern);
  });
  for (const mode of ['pure', 'replicate']) {
    await test(`PRODUCT_${mode.toUpperCase()}_REQUIRES_PRODUCT`, async () => {
      const h = make(); h.open(); await h.submit(mode); expectBlocked(h, /canvas\.textNoProduct/);
    });
    await test(`PRODUCT_${mode.toUpperCase()}_PRESERVES_LEGACY_INPUT_ORDER`, async () => {
      const h = make({ nodes: [node('text-a', '@产品\n\n商业画面', { productIds: ['image-product'], sourceIds: ['image-style'] })], members: [art('image-product'), art('image-style')] });
      h.open(); await h.submit(mode, { useReferences: false }); eq(h.c.calls.length, 1);
      eq(h.c.calls[0].pend.parentId, 'image-product');
      deep(h.c.calls[0].pend.inputs, mode === 'pure' ? ['image-product', 'text-a'] : ['image-product', 'image-style', 'text-a']);
      if (mode === 'pure') eq(h.c.calls[0].prompt, '商业画面');
      else matches(h.c.calls[0].prompt, /^商业画面\n产品必须完全取自第一张参考图/);
    });
  }
  const openerGates = [
    ['NO_USER', c => { c.user = null; }], ['READ_ONLY', c => { c.readOnly = true; }],
    ['NO_PROJECT', c => { c.activeProjectRef.current = null; }], ['NO_PERMISSION', c => { c.allowed = false; }],
    ['SETTINGS_NOT_READY', c => { c.nodeSettingsReady = false; }], ['REF_LOCK_BEFORE_STATE', c => { c.textImageSubmittingRef.current = true; }],
    ['LOCKED_TEXT', c => { c.locked.add('text-a'); }], ['GENERATING_TEXT', c => { c.textNodes[0].status = 'generating'; }],
  ];
  for (const [name, change] of openerGates) await test(`OPENER_BLOCKS_${name}`, () => {
    const h = make(); change(h.c); h.open(); eq(h.c.genImageMenu, null); eq(h.c.menuUpdates.length, 0); eq(h.c.calls.length, 0);
  });
  await test('OPENER_FILTERED_EMPTY_SELECTION_NO_MENU', () => {
    const h = make(); h.open(['missing']); eq(h.c.genImageMenu, null); eq(h.c.menuUpdates.length, 0);
  });
  for (const [name, change] of [
    ['PERMISSION_REVOKED', c => { c.allowed = false; }], ['SETTINGS_REVOKED', c => { c.nodeSettingsReady = false; }],
    ['READ_ONLY', c => { c.readOnly = true; }], ['LOGOUT', c => { c.user = null; }],
    ['LOCKED_AFTER_MENU', c => { c.locked.add('text-a'); }], ['GENERATING_AFTER_MENU', c => { c.textNodes[0].status = 'generating'; }],
  ]) await test(`SUBMIT_REVALIDATES_${name}`, async () => {
    const h = make(); h.open(); change(h.c); await h.submit(); expectBlocked(h);
  });
  await test('LOCKED_UPSTREAM_TEXT_BLOCKS_BEFORE_PLACEHOLDER', async () => {
    const h = make({ nodes: [node('text-a', '根', { sourceIds: ['text-b'] }), node('text-b', '父')] });
    h.open(); h.c.locked.add('text-b'); await h.submit(); expectBlocked(h);
  });
  const scopeChanges = [
    ['ACCOUNT', c => { c.canvasAccountRef.current = 'account-b'; }],
    ['PROJECT', c => { c.activeProjectRef.current = { key: 'tree:project-b', members: [] }; }],
    ['WORKSPACE', c => { c.workspace = 'workspace-b'; }],
    ['EPOCH', c => { c.canvasContextEpochRef.current++; }],
    ['RENDER_REVISION', c => { c.textImageContextRef.current.revision++; }],
    ['UNMOUNT', c => { c.batchRunMountedRef.current = false; }],
  ];
  for (const [name, change] of scopeChanges) {
    await test(`SCOPE_${name}_INVALID_BEFORE_SUBMIT`, async () => {
      const h = make(); const menu = h.open(); const render = h.render(); eq(render.textImageScopeCurrent(menu), true);
      change(h.c); eq(render.textImageScopeCurrent(menu), false); deep(render.textImageRequests(menu, 'general', { combine: true, useReferences: true }), []);
      eq(render.textImageReferenceCount(menu), 0); await render.generateImagesFromTextNodes('general', { combine: true, useReferences: true }); expectBlocked(h);
    });
    await test(`SCOPE_${name}_INVALID_AFTER_FIRST_AND_DEFERRED_SETTER`, async () => {
      const gate = deferred(); const h = make({ nodes: [node('text-a', '甲'), node('text-b', '乙')], deferPending: true, generatePend: () => gate.promise });
      h.open(['text-a', 'text-b']); const promise = h.submit('general', { combine: false });
      eq(h.c.calls.length, 1); eq(h.c.pending.length, 0); eq(h.c.pendingUpdaters.length, 1);
      const previous = [{ id: 'unrelated-new-scope-pending' }]; h.c.pending = previous;
      change(h.c); eq(h.c.calls[0].isCurrent(), false); h.flush();
      eq(h.c.pending, previous, 'deferred updater returns exact original array when stale');
      gate.resolve(true); await promise; eq(h.c.calls.length, 1); eq(h.c.textImageSubmittingRef.current, false);
      if (name === 'UNMOUNT') deep(h.c.submittingUpdates, [true]);
    });
  }
  await test('DEFERRED_PENDING_UPDATER_VALID_SCOPE_PRESERVES_OTHER_NODES', async () => {
    const h = make({ deferPending: true }); h.c.pending = [{ id: 'existing-pend' }]; h.open(); await h.submit();
    eq(h.c.calls.length, 1); eq(h.c.pending.length, 1); ok(h.c.calls[0].pend, 'explicit pending object supplied before React state commits');
    h.flush(); eq(h.c.pending.length, 2); eq(h.c.pending[0].id, 'existing-pend'); eq(h.c.pending[1], h.c.calls[0].pend);
  });
  await test('SERIAL_PURCHASE_WAIT_TRUE_THEN_SECOND', async () => {
    const gate = deferred(); const h = make({ nodes: [node('text-a', '甲'), node('text-b', '乙')], generatePend: (_opts, _c, index) => index === 1 ? gate.promise : true });
    h.open(['text-a', 'text-b']); const promise = h.submit('general', { combine: false }); eq(h.c.calls.length, 1); eq(h.c.pending.length, 1);
    gate.resolve(true); await promise; eq(h.c.calls.length, 2); eq(h.c.pending.length, 2);
  });
  for (const result of ['false', 'throw', 'unknown']) await test(`GENERATE_PEND_${result.toUpperCase()}_NEVER_STARTS_NEXT`, async () => {
    const h = make({ nodes: [node('text-a', '甲'), node('text-b', '乙')], generatePend: () => {
      if (result === 'throw') throw new Error('fixture-generation-failure'); return result === 'false' ? false : undefined;
    } });
    h.open(['text-a', 'text-b']); await h.submit('general', { combine: false });
    eq(h.c.calls.length, 1); eq(h.c.pending.length, 1); eq(h.c.textImageSubmittingRef.current, false);
    if (result === 'throw') ok(h.c.tips.includes('fixture-generation-failure'));
  });
  await test('DOUBLE_CLICK_SAME_RENDER_REF_LOCK_PREVENTS_DUPLICATE', async () => {
    const gate = deferred(); const h = make({ generatePend: () => gate.promise }); h.open(); const render = h.render();
    const first = render.generateImagesFromTextNodes('general', { combine: true, useReferences: true });
    const second = render.generateImagesFromTextNodes('general', { combine: true, useReferences: true });
    await second; eq(h.c.calls.length, 1); eq(h.c.textImageSubmittingRef.current, true);
    gate.resolve(true); await first; eq(h.c.textImageSubmittingRef.current, false);
  });
  for (const scope of ['ACCOUNT', 'PROJECT', 'WORKSPACE']) await test(`OLD_SCOPE_MENU_CALLBACK_BLOCKED_AFTER_${scope}_ABA`, async () => {
    const h = make(); h.open(); const oldRender = h.render();
    const originalProject = h.c.activeProjectRef.current;
    if (scope === 'ACCOUNT') h.c.canvasAccountRef.current = 'account-b';
    if (scope === 'PROJECT') h.c.activeProjectRef.current = { key: 'tree:project-b', members: [] };
    if (scope === 'WORKSPACE') h.c.workspace = 'workspace-b';
    h.render(); eq(h.c.textImageContextRef.current.revision, 1, 'actual render branch invalidates on scope B');
    h.c.canvasAccountRef.current = 'account-a'; h.c.activeProjectRef.current = originalProject; h.c.workspace = 'workspace-a';
    h.render(); eq(h.c.textImageContextRef.current.revision, 2, 'actual render branch also invalidates on return to A');
    h.open(); const newMenu = h.c.genImageMenu;
    await oldRender.generateImagesFromTextNodes('general', { combine: true, useReferences: true }); eq(h.c.calls.length, 0);
    eq(h.c.genImageMenu, newMenu, 'stale callback does not close or submit the new menu');
    await h.submit(); eq(h.c.calls.length, 1);
  });
  await test('SCOPE_INVALIDATION_SUPPRESSES_LATE_FAILURE_TIP', async () => {
    const gate = deferred(); const h = make({ generatePend: () => gate.promise }); h.open(); const promise = h.submit();
    h.c.canvasContextEpochRef.current++; gate.reject(new Error('old scope error')); await promise;
    deep(h.c.tips, []); eq(h.c.calls.length, 1); eq(h.c.textImageSubmittingRef.current, false);
  });
  await test('GRAPH_POSITION_AND_IMMUTABLE_INPUTS', async () => {
    const texts = [node('text-a', '甲', { sourceIds: ['image-a'] })], members = [art('image-a')];
    const snapshot = JSON.stringify({ texts, members });
    const h = make({ nodes: texts, members, graph: [{ id: 'text-a', position: { x: 100.25, y: 200.75 } }] }); h.open(); await h.submit();
    eq(h.c.calls[0].pend.x, 570); eq(h.c.calls[0].pend.y, 201); eq(JSON.stringify({ texts, members }), snapshot);
  });
  await serverTests(root, network);
}

async function serverTests(root, network) {
  const core = parse(path.join(root, 'src/lib/imagegen/generation-core.ts'));
  const placement = functionText(core, 'canvasTextImageProjectPlacement');
  function fixture(options = {}) {
    const calls = [], proofs = [];
    const c = {
      Error, exports: {}, fetch: network.deny, dbEnabled: options.dbEnabled !== false,
      currentCreationContext: () => options.scope === undefined ? { actorEmail: 'fixture@example.test', parentContext: 'tree:project-a' } : options.scope,
      getPool: () => ({ query: async (sql, params) => {
        calls.push({ sql, params: plain(params) });
        if (sql.includes('app_canvas_text_nodes')) return { rows: options.missing ? [] : [{ project_key: options.project || 'tree:project-a' }] };
        if (sql.includes('app_artworks')) return { rows: options.batchMissing ? [] : [{ id: 'suite-owned-root' }] };
        throw new Error(`Unexpected fixture SQL: ${sql}`);
      } }),
      assertCreationProjectInput: async (owner, project) => { proofs.push([owner, project]); if (options.proofError) throw new Error(options.proofError); },
    };
    vm.createContext(c); run(c, placement, 'actual-text-project-placement.ts');
    return { c, calls, proofs, call: (owner = 'Fixture@Example.Test', id = 'text-a') => c.canvasTextImageProjectPlacement(owner, id) };
  }
  await test('CORE_TREE_PLACEMENT_EXACT_EMAIL_AND_TEXT_ID', async () => {
    const h = fixture(); deep(await h.call(), { groupId: 'project-a' }); eq(h.calls.length, 1);
    deep(h.calls[0].params, ['fixture@example.test', 'text-a']);
    matches(h.calls[0].sql, /WHERE email=\$1 AND id=\$2/);
    deep(h.proofs, [['Fixture@Example.Test', 'tree:project-a']]);
  });
  await test('CORE_ACCOUNT_SCOPE_MISMATCH_NO_QUERY', async () => {
    const h = fixture({ scope: { actorEmail: 'other@example.test', parentContext: 'tree:project-a' } });
    await rejects(() => h.call(), /账号不一致/); eq(h.calls.length, 0); eq(h.proofs.length, 0);
  });
  await test('CORE_PROJECT_SCOPE_MISMATCH_REJECTS', async () => {
    const h = fixture({ scope: { actorEmail: 'fixture@example.test', parentContext: 'tree:other' } });
    await rejects(() => h.call(), /不在当前画布项目/); eq(h.calls.length, 1); eq(h.proofs.length, 0);
  });
  await test('CORE_OWNED_TEXT_MISSING_REJECTS', async () => {
    const h = fixture({ missing: true }); await rejects(() => h.call(), /不存在或无权访问/); eq(h.proofs.length, 0);
  });
  await test('CORE_TENANT_PROJECT_ASSERT_ERROR_PROPAGATES', async () => {
    const h = fixture({ proofError: 'fixture-tenant-denied' }); await rejects(() => h.call(), /fixture-tenant-denied/); eq(h.proofs.length, 1);
  });
  for (const project of ['tree:', 'tree:/invalid', 'tree:root with spaces', 'unknown:root', `tree:${'a'.repeat(161)}`]) await test(`CORE_PROJECT_FORMAT_REJECTS_${project.slice(0, 25).replace(/\W/g, '_')}_${project.length}`, async () => {
    const h = fixture({ project, scope: null }); await rejects(() => h.call(), /项目格式无效/); eq(h.calls.length, 1);
  });
  for (const [name, options, id] of [
    ['DB_OFF', { dbEnabled: false }, 'text-a'], ['NON_TEXT_ID', {}, 'image-a'], ['NO_ID', {}, null],
  ]) await test(`CORE_${name}_NO_QUERY`, async () => {
    const h = fixture(options); eq(await h.call('fixture@example.test', id), undefined); eq(h.calls.length, 0); eq(h.proofs.length, 0);
  });
  await test('CORE_BATCH_PLACEMENT_QUERIES_OWNED_UNDELETED_ROOT', async () => {
    const h = fixture({ project: 'batch:suite-a', scope: { actorEmail: 'fixture@example.test', parentContext: 'batch:suite-a' } });
    deep(await h.call(), { parentId: 'suite-owned-root' }); eq(h.calls.length, 2);
    deep(h.calls[1].params, ['fixture@example.test', 'suite-a']);
    matches(h.calls[1].sql, /WHERE email=\$1 AND batch_id=\$2 AND deleted_at IS NULL/);
    matches(h.calls[1].sql, /ORDER BY created_at,id LIMIT 1/); eq(h.proofs.length, 1);
  });
  await test('CORE_BATCH_MISSING_ROOT_REJECTS', async () => {
    const h = fixture({ project: 'batch:suite-a', scope: null, batchMissing: true });
    await rejects(() => h.call(), /套图画布不存在或无权访问/); eq(h.calls.length, 2);
  });
  await test('CORE_EXISTING_IMAGE_GROUP_PRIORITY_AND_METADATA_ONLY_FALLBACK', () => {
    const submit = oneFunction(core, 'submitGenerationCore');
    const groups = all({ ...core, ast: submit.body }, n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'projectGroupId');
    eq(groups.length, 1); eq(groups[0].initializer.getText(core.ast).replace(/\s/g, ''), 'source?.groupId||textPlacement?.groupId');
    const parents = all({ ...core, ast: submit.body }, n => ts.isIfStatement(n) && n.expression.getText(core.ast).replace(/\s/g, '') === 'textPlacement?.parentId&&!parentId');
    eq(parents.length, 1); matches(parents[0].thenStatement.getText(core.ast), /form\.set\("parentId",textPlacement\.parentId\)/);
    const placements = all({ ...core, ast: submit.body }, n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'textPlacement');
    eq(placements.length, 1); matches(placements[0].initializer.getText(core.ast), /plan\.request\.entry==="canvas"\?await canvasTextImageProjectPlacement\(owner,plan\.request\.sourceNodeId\):undefined/);
    const imageWrites = all({ ...core, ast: submit.body }, n => ts.isCallExpression(n) && n.expression.getText(core.ast) === 'form.append' && n.arguments.some(a => a.getText(core.ast).includes('textPlacement')));
    eq(imageWrites.length, 0, 'suite ancestry never becomes an image reference');
  });
  await test('CORE_SHARED_EXECUTION_FUNCTIONS_UNCHANGED', () => {
    const before = parse(path.join(root, BEFORE_PATH, 'src/lib/imagegen/generation-core.ts'));
    for (const name of ['imagegenStepId', 'imagegenInternalRequest', 'imagegenStepIntent']) eq(functionText(core, name), functionText(before, name), name);
    const original = functionText(before, 'submitGenerationCore');
    const current = functionText(core, 'submitGenerationCore');
    const oldLine = 'if(source?.groupId)form.set("projectGroupId",source.groupId);';
    const newLine = 'const textPlacement=plan.request.entry==="canvas"?await canvasTextImageProjectPlacement(owner,plan.request.sourceNodeId):undefined;const projectGroupId=source?.groupId||textPlacement?.groupId;if(projectGroupId)form.set("projectGroupId",projectGroupId);if(textPlacement?.parentId&&!parentId)form.set("parentId",textPlacement.parentId);';
    ok(original.includes(oldLine)); ok(current.includes(newLine)); eq(current.replace(newLine, oldLine), original);
  });
}

async function main() {
  const config = args(), network = blockHttp();
  try {
    if (config.baseline) await baselineTests(config, network);
    else {
      const model = parse(path.join(config.root, CANVAS_PATH));
      const beforeFile = path.join(config.root, BEFORE_PATH, CANVAS_PATH);
      eq(hash(beforeFile), BASELINE_SHA256, 'preserved original Canvas hash is pinned, independent of merges');
      const before = parse(beforeFile);
      const helper = loadActualHelper(config.root, network);
      ok(typeof helper.buildTextImageRequests === 'function', 'load the real source-root helper');
      await staticTests(config.root, model, before);
      await modifiedTests(config.root, model, helper, network);
      ok(cases >= 30, 'modified integration must cover at least 30 cases');
    }
    eq(httpCalls, 0, 'no HTTP/supplier or database transport');
    console.log('HTTP_CALLS=0 UI_VERIFICATION=STATIC_AST GENERATE_PEND=INTERCEPTED DB=IN_MEMORY_FIXTURE');
    console.log(`${config.baseline ? 'TEXT_IMAGE_BASELINE' : 'TEXT_IMAGE_INTEGRATION'}=PASS CASES=${cases} ASSERTIONS=${assertions} SUPPLIER_CALLS=0`);
  } finally { network.restore(); }
}
main().catch(error => {
  console.error(`TEXT_IMAGE_INTEGRATION=FAIL CASE=${activeCase} CASES=${cases} ASSERTIONS=${assertions} HTTP_CALLS=${httpCalls}`);
  console.error(error?.stack || error); process.exitCode = 1;
});
