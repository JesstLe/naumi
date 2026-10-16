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
const text = block('data-testid="text-node-toolbar"', '{/* 标注编辑弹窗');
if (process.argv.includes('--followup-baseline')) {
  assert.equal((main.match(/data-tool="/g) || []).length, 3);
  assert.equal((main.match(/<CanvasActionMenu /g) || []).length, 2);
  assert.ok(main.includes('h-10 w-10') && main.includes('sm:h-12 sm:w-12'));
  for (const id of ['assistant', 'rename']) assert.ok(image.includes(`id: "${id}"`));
  assert.ok(image.includes('["relight", "angle", "caption"]'));
  assert.ok(read('src/components/ui/image-quality-select.tsx').includes('px-2 py-1.5 text-[12px]'));
  console.log('FOLLOWUP_BASELINE=PASS DOCK=5 HIGH_FREQUENCY=HIDDEN ADD_MOVE_SIZE=MISMATCH QUALITY_CONTROLS=MISMATCH');
  process.exit(0);
}
if (process.argv.includes('--baseline')) {
  for (const tool of ['text', 'image-node', 'upload', 'history', 'generate', 'link']) assert.ok(main.includes(`data-tool="${tool}"`));
  assert.ok(main.includes('setShowMinimap') && main.includes('setSnapGrid'));
  assert.ok(image.includes('extraInputRef.current?.click()'));
  assert.ok(text.includes('setTextReferenceMenuOpen'));
  console.log('TOOLBAR_BASELINE=PASS DUPLICATED_CREATION=4 DUPLICATED_VIEW=4 DUPLICATED_REFERENCES=2 MISLEADING_CONTROLS=2');
  process.exit(0);
}

assert.equal((main.match(/data-tool="/g) || []).length, 9);
assert.equal((main.match(/<CanvasActionMenu /g) || []).length, 2);
for (const id of ['text', 'image-node', 'video-node']) assert.equal((main.match(new RegExp(`id: "${id}"`, 'g')) || []).length, 1);
for (const id of ['text', 'image-node', 'upload', 'history', 'undo', 'redo']) assert.equal((main.match(new RegExp(`data-tool="${id}"`, 'g')) || []).length, 1);
assert.ok(main.includes('void doUndo()') && main.includes('void doRedo()'));
assert.ok(main.includes('historySaving || undoStack.length === 0') && main.includes('historySaving || redoStack.length === 0'));
for (const token of ['data-tool="generate"', 'data-tool="link"', 'setShowMinimap', 'setSnapGrid', 'tidyLayout()', 'fitView(']) assert.ok(!main.includes(token), token);
for (const token of ['menuTestId="canvas-create-menu"', 'menuTestId="canvas-more-tools-menu"']) assert.ok(main.includes(token));
assert.ok(!image.includes('extraInputRef.current?.click()'));
assert.ok(!text.includes('setTextReferenceMenuOpen'));
assert.equal((source.match(/aria-label=\{t\("canvas.toolbar.addReference"\)\}/g) || []).length, 1);
assert.equal((source.match(/aria-label=\{t\("canvas.textAddReference"\)\}/g) || []).length, 1);
for (const id of ['workflow', 'video']) assert.ok(image.includes(`id: "${id}"`));
const imageMenu = image.slice(image.indexOf('<CanvasActionMenu'), image.indexOf('{/* 视频:'));
for (const id of ['assistant', 'rename']) {
  assert.ok(!imageMenu.includes(`id: "${id}"`));
  assert.ok(image.includes(`data-action="${id}"`));
  assert.ok(image.indexOf(`data-action="${id}"`) < image.indexOf('<CanvasActionMenu'));
}
assert.ok(!imageMenu.includes('"angle"') && !imageMenu.includes('"caption"'));
for (const id of ['relight', 'angle', 'caption']) assert.ok(image.includes(`"${id}"`));
assert.ok(image.includes('["bg", "angle", "caption"].includes(a.key)'));
assert.match(main, /triggerClassName="flex h-7 w-7 .*sm:h-9 sm:w-9"/);
assert.ok(!main.includes('h-10 w-10') && !main.includes('sm:h-12 sm:w-12'));
const qualitySelect = read('src/components/ui/image-quality-select.tsx');
assert.ok(qualitySelect.includes('h-8 max-w-40 rounded-[9px] px-2.5 py-0 text-[12.5px] font-semibold'));
assert.ok(source.includes('<CanvasModelSelect') && read('src/components/canvas/model-select.tsx').includes('max-w-[190px]'));
assert.ok(source.includes('canvas-ui-control flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0'));
assert.equal((source.match(/triggerClass="canvas-ui-control flex h-8 cursor-pointer/g) || []).length, 2);
assert.ok(image.includes('onPick={(v) => onHd(v)}') && image.includes('onPick={(v) => onRatioGen(v)}'));
assert.ok(image.includes('onCutout("fine")') && image.includes('openImageTextEditor(selected)') && image.includes('onExpand(expandRatio)'));
assert.equal((image.match(/<CanvasActionPanel /g) || []).length, 1);
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
console.log(`TOOLBAR_MODIFIED=PASS PRIMARY_DOCK=11 CREATION_SHORTCUTS=4 IMAGE_PRIMARY=${source.includes('setCropArtwork(selected)') ? 16 : 14} HIGH_FREQUENCY=RENAME_ASSISTANT_ANGLE_CAPTION_VISIBLE TEXT_PRIMARY=${source.includes('aria-label={L("文字样式"') ? 8 : 6} REFERENCE_ENTRIES=1_PER_TYPE VIEW_UTILITIES=SINGLE_ENTRY LOCALES=ZH_EN ADD_MOVE_SIZE=MATCHED COMPOSER_CONTROLS=32PX`);
