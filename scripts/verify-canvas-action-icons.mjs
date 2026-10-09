import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(process.argv[2] || '.');
const file = 'src/components/canvas/canvas-client.tsx';
const read = r => fs.readFileSync(path.join(r, file), 'utf8');
const source = read(root);
const toolbar = source.slice(source.indexOf('data-testid="image-node-toolbar"'), source.indexOf('{/* 文字节点工具条'));
assert.ok(toolbar.length > 1000);
const baseline = process.argv.includes('--baseline');
if (baseline) {
  for (const token of ['{a.emoji}', '✂️', '🔍', '⤢', '✏️', '📤', '⬇️', '⛶']) assert.ok(toolbar.includes(token), token);
  console.log('ACTION_ICONS_BASELINE=PASS MIXED_EMOJI_AND_SVG=REPRODUCED');
} else {
  assert.doesNotMatch(toolbar, /a\.emoji|✂|🔍|⤢|✏|📤|⬇|⛶|text-\[15px\] leading-none">/);
  const ast = ts.createSourceFile('canvas.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const barAst = ts.createSourceFile('toolbar.tsx', `<div ${toolbar}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consolidated = toolbar.includes('<CanvasActionMenu');
  const expected = consolidated
    ? ['Pencil', 'MessageSquareText', 'a.icon', 'Scissors', 'ScanSearch', 'Maximize2', 'Type', 'Maximize2', 'PenLine', 'Download', 'Maximize', 'Upload']
    : ['a.icon', 'Scissors', 'ScanSearch', 'Maximize2', 'Type', 'Maximize2', 'PenLine', 'Workflow', 'Video', 'MessageSquareText', 'Pencil', 'Upload', 'Download', 'Maximize'];
  const icons = [];
  function collect(node) {
    if (ts.isJsxSelfClosingElement(node) && expected.includes(node.tagName.getText(barAst))) {
      icons.push(node.tagName.getText(barAst));
      const props = node.attributes.properties.map(p => p.getText(barAst)).join(' ');
      assert.match(props, /h-4 w-4 shrink-0/);
      assert.match(props, /aria-hidden="true"/);
    }
    ts.forEachChild(node, collect);
  }
  collect(barAst);
  assert.deepEqual(icons, expected);
  if (consolidated) {
    for (const label of ['canvas.toolbar.fillImage', 'canvas.toolbar.downloadImage', 'canvas.viewLarge']) assert.ok(toolbar.includes(`aria-label={t("${label}")}`), label);
    const menu = fs.readFileSync(path.join(root, 'src/components/canvas/canvas-action-menu.tsx'), 'utf8');
    assert.match(menu, /h-4 w-4 shrink-0/);
    assert.match(menu, /aria-label=\{label\}/);
  } else for (const label of ['canvas.editName', 'canvas.addImage', 'canvas.uploadImage', 'canvas.ctxDownload', 'canvas.viewLarge']) assert.ok(toolbar.includes(`aria-label={${label === 'canvas.addImage' || label === 'canvas.uploadImage' ? 'selected ? t("canvas.addImage") : t("canvas.uploadImage")' : `t("${label}")`}}`), label);
  const beforeArg = process.argv.indexOf('--business-baseline');
  if (beforeArg >= 0) {
    const original = read(path.resolve(process.argv[beforeArg + 1]));
    const before = ts.createSourceFile('before.tsx', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const printer = ts.createPrinter({ removeComments: true });
    const events = tree => {
      const found = [];
      function visit(node) { if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(tree))) found.push(printer.printNode(ts.EmitHint.Unspecified, node, tree)); ts.forEachChild(node, visit); }
      visit(tree); return found.sort();
    };
    if (!consolidated) assert.deepEqual(events(ast), events(before), 'event callbacks changed');
    const functions = tree => {
      const found = [];
      function visit(node) { if (ts.isFunctionDeclaration(node) && node.name && /^onQuickAction|onCutout|onHd|onRatioGen|runGen|runCutout$/.test(node.name.text)) found.push(printer.printNode(ts.EmitHint.Unspecified, node, tree)); ts.forEachChild(node, visit); }
      visit(tree); return found.sort();
    };
    assert.deepEqual(functions(ast), functions(before), 'generation behavior changed');
    console.log(`ACTION_ICONS_BEHAVIOR=PASS EVENT_CALLBACKS=${consolidated ? 'REORGANIZED' : 'IDENTICAL'} GENERATION_HANDLERS=IDENTICAL`);
  }
  console.log(`ACTION_ICONS_MODIFIED=PASS ICON_SLOTS=${icons.length} STYLE=LUCIDE_16PX_CURRENTCOLOR A11Y_LABELS=${consolidated ? 3 : 4} EMOJI=0`);
}
