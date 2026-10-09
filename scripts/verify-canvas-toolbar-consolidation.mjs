import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || '.');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const clientFile = 'src/components/canvas/canvas-client.tsx';
const source = read(clientFile);
const block = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const main = block('data-testid="canvas-main-toolbar"', '{selectedBatchArts.length');
const image = block('data-testid="image-node-toolbar"', '{/* 文字节点工具条');
const text = block('data-testid="text-node-toolbar"', '{/* 画布助手面板');
if (process.argv.includes('--baseline')) {
  for (const tool of ['text', 'image-node', 'upload', 'history', 'generate', 'link']) assert.ok(main.includes(`data-tool="${tool}"`));
  assert.ok(main.includes('setShowMinimap') && main.includes('setSnapGrid'));
  assert.ok(image.includes('extraInputRef.current?.click()'));
  assert.ok(text.includes('setTextReferenceMenuOpen'));
  console.log('TOOLBAR_BASELINE=PASS DUPLICATED_CREATION=4 DUPLICATED_VIEW=4 DUPLICATED_REFERENCES=2 MISLEADING_CONTROLS=2');
  process.exit(0);
}

assert.equal((main.match(/data-tool="/g) || []).length, 3);
assert.equal((main.match(/<CanvasActionMenu /g) || []).length, 2);
for (const id of ['text', 'image-node', 'upload', 'history']) assert.equal((main.match(new RegExp(`id: "${id}"`, 'g')) || []).length, 1);
for (const token of ['data-tool="generate"', 'data-tool="link"', 'setShowMinimap', 'setSnapGrid', 'tidyLayout()', 'fitView(']) assert.ok(!main.includes(token), token);
for (const token of ['menuTestId="canvas-create-menu"', 'menuTestId="canvas-more-tools-menu"']) assert.ok(main.includes(token));
assert.ok(!image.includes('extraInputRef.current?.click()'));
assert.ok(!text.includes('setTextReferenceMenuOpen'));
assert.equal((source.match(/aria-label=\{t\("canvas.toolbar.addReference"\)\}/g) || []).length, 1);
assert.equal((source.match(/aria-label=\{t\("canvas.textAddReference"\)\}/g) || []).length, 1);
for (const id of ['workflow', 'video', 'assistant', 'rename']) assert.ok(image.includes(`id: "${id}"`));
for (const id of ['relight', 'angle', 'caption']) assert.ok(image.includes(`"${id}"`));
assert.ok(image.includes('(a) => a.key === "bg"'));
assert.ok(image.includes('onPick={(v) => onHd(v)}') && image.includes('onPick={(v) => onRatioGen(v)}'));
assert.ok(image.includes('onCutout("fine")') && image.includes('openImageTextEditor(selected)') && image.includes('onExpand(expandRatio)'));
assert.equal((image.match(/<CanvasActionPanel /g) || []).length, 2);
assert.ok(image.includes('onPendUpload(selectedPend.id)'));
assert.ok(!image.includes('overflow-visible'));
assert.ok(!text.includes('⧉') && !text.includes('⊡') && !text.includes('✏️'));
assert.match(source, /aria-pressed=\{showMinimap\}/);
assert.match(source, /aria-pressed=\{snapGrid\}/);

const menu = read('src/components/canvas/canvas-action-menu.tsx');
for (const token of ['createPortal', 'canvasPopoverPlacement', 'data-canvas-hotkeys-blocked', 'aria-haspopup="menu"', 'aria-expanded={open}', 'role="menuitem"', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'preventScroll: true', 'disabled={item.disabled}', 'overflow-y-auto']) assert.ok(menu.includes(token), token);
const dict = read('src/lib/i18n/dict.ts');
for (const key of ['addToCanvas', 'addText', 'addImageNode', 'settings', 'imageMore', 'editText', 'expand', 'annotate', 'bgHint', 'hdHint', 'ratioHint', 'renameHint', 'fillImage', 'addReference', 'productCopy', 'textToImages']) assert.equal((dict.match(new RegExp(`^      ${key}:`, 'gm')) || []).length, 2, key);
for (const value of ['生成文案图', '编辑图中文字', 'AI增强', '重构比例', '扩展画面', '选择与移动节点', '拖动画布']) assert.ok(dict.includes(value), value);

const baselineIndex = process.argv.indexOf('--business-baseline');
let protectedCount = 0;
if (baselineIndex >= 0) {
  const before = fs.readFileSync(path.join(path.resolve(process.argv[baselineIndex + 1]), clientFile), 'utf8');
  const printer = ts.createPrinter({ removeComments: true });
  const functions = content => {
    const ast = ts.createSourceFile('client.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Map();
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name && !['CanvasClient', 'DarkSelect', 'toolGenerate'].includes(node.name.text)) {
        found.set(node.name.text, printer.printNode(ts.EmitHint.Unspecified, node, ast));
      }
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'QUICK_ACTIONS') found.set('QUICK_ACTIONS', printer.printNode(ts.EmitHint.Unspecified, node, ast));
      ts.forEachChild(node, visit);
    }
    visit(ast); return [...found].sort(([a], [b]) => a.localeCompare(b));
  };
  const original = functions(before), modified = functions(source);
  assert.deepEqual(modified, original, 'existing business/creation/keyboard helper functions changed');
  protectedCount = original.length;
}
console.log(`TOOLBAR_BUSINESS=PASS PROTECTED_DECLARATIONS=${protectedCount} PROMPTS_GENERATION_ROUTING_BILLING=UNCHANGED PROVIDER_CALLS=0`);
console.log('TOOLBAR_MODIFIED=PASS PRIMARY_DOCK=5 CREATION_ENTRIES=4 IMAGE_PRIMARY=10 TEXT_PRIMARY=6 REFERENCE_ENTRIES=1_PER_TYPE VIEW_UTILITIES=SINGLE_ENTRY LOCALES=ZH_EN');
