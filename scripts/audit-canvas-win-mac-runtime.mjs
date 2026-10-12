import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('output/canvas-win-mac-audit-20261012/runtime');
await mkdir(out, { recursive: true });
const source = await readFile('src/components/canvas/canvas-client.tsx', 'utf8');
const annotation = await readFile('src/components/canvas/annotate-editor.tsx', 'utf8');
function extract(text, name) {
  const ast = ts.createSourceFile('fixture.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast);
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer && ts.isArrowFunction(n.initializer)) found = `const ${name} = ${n.initializer.getText(ast)};`;
    ts.forEachChild(n, visit);
  }
  visit(ast); assert.ok(found, name + ' is present in current source');
  return ts.transpileModule(found, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
}
const findings = [];
const clipboardSource = await readFile('src/lib/canvas/clipboard-files.ts', 'utf8');
const clipboardModule = { exports: {} };
const clipboardContext = vm.createContext({ module: clipboardModule, exports: clipboardModule.exports, Set, Array });
vm.runInContext(ts.transpileModule(clipboardSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, clipboardContext);
const clipboard = clipboardModule.exports;
for (const file of [{ name: '商品.PNG', type: '' }, { name: 'finder image.jpeg', type: '' }, { name: '产品.webp', type: '' }, { name: 'image', type: 'IMAGE/PNG' }]) assert.equal(clipboard.isCanvasImageFile(file), true);
assert.equal(clipboard.isCanvasImageFile({ name: '照片.heic', type: 'image/heic' }), false);
const pngFile = { name: '商品.png', type: 'image/png' };
assert.equal(clipboard.clipboardImageFiles({ items: [{ kind: 'file', getAsFile: () => pngFile }], files: [pngFile] }).length, 1);
assert.equal(clipboard.clipboardImageFiles({ items: [], files: [pngFile] }).length, 1);
let works = [{ id: 'sample', canvasX: 10, canvasY: 20 }], requests = [], undo = [], tips = [];
const context = vm.createContext({
  isNodeLocked: () => false, readOnly: false, user: { email: 'audit@local.test' },
  setWorks: f => { works = f(works); }, privateFetchRaw: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: false, status: 500 }; },
  flashTip: text => tips.push(text), textNodes: [], setTextNodes: () => {}, persistTextNode: async () => {}, pushUndo: value => undo.push(value),
  Promise, Map, Date, JSON,
});
vm.runInContext(extract(source, 'saveNodePosition'), context);
vm.runInContext("saveNodePosition('sample', 99, 88)", context); await new Promise(r => setTimeout(r, 10));
assert.equal(works[0].canvasX, 99); assert.equal(tips.length, 0); assert.equal(requests.length, 1);
findings.push({ id: 'position-http-failure-silent', observed: { localPosition: works[0], httpStatus: 500, notices: tips.length }, source: 'saveNodePosition' });
vm.runInContext(extract(source, 'saveManyNodePositions'), context);
vm.runInContext("saveManyNodePositions([{id:'sample',from:{x:99,y:88},to:{x:200,y:100}}])", context); await new Promise(r => setTimeout(r, 10));
assert.equal(works[0].canvasX, 200); assert.equal(undo.length, 1); assert.equal(tips.length, 0);
findings.push({ id: 'multi-position-http-failure-history-advanced', observed: { localPosition: works[0], undoSteps: undo.length, httpStatus: 500, notices: tips.length }, source: 'saveManyNodePositions' });
let zipped;
const zip = vm.createContext({ zipping: false, setZipping: () => {}, hasRenderableImage: () => true,
  fetch: async (_url, init) => { zipped = JSON.parse(init.body).items; return { ok: true, blob: async () => ({}) }; },
  URL: { createObjectURL: () => 'blob:audit', revokeObjectURL: () => {} }, document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
  flashTip: () => {}, locale: 'zh', JSON,
});
vm.runInContext(extract(source, 'downloadZip'), zip);
zip.members = Array.from({ length: 31 }, (_, i) => ({ image: '/media/' + i + '.png', title: '图片' + i }));
await vm.runInContext("downloadZip(members, 'audit')", zip);
assert.equal(zipped.length, 30);
findings.push({ id: 'zip-silent-truncation', observed: { selected: 31, submitted: zipped.length, warning: false }, source: 'downloadZip' });
let closes = 0;
const annotate = vm.createContext({ submitting: false, onClose: () => closes++ });
vm.runInContext(extract(annotation, 'onKey'), annotate);
vm.runInContext("onKey({key:'Escape',isComposing:true,keyCode:229})", annotate);
assert.equal(closes, 1);
findings.push({ id: 'annotation-ime-escape-discards-dialog', observed: { isComposing: true, dialogClosed: closes }, source: 'AnnotateEditorModal.onKey' });
await writeFile(path.join(out, 'results.json'), JSON.stringify({ source: 'actual source functions transpiled without changing their bodies', clipboardFileChecks: 7, findings }, null, 2));
console.log(`AUDIT_RUNTIME=PASS confirmed=${findings.length} POSITION_500=SILENT MULTI_500=UNDO_ADVANCED ZIP_31=30 IME_ESCAPE=CLOSE CLIPBOARD_FILES=7_PASS`);
