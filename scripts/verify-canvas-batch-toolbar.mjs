import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || '.');
const client = readFileSync(path.join(root, 'src/components/canvas/canvas-client.tsx'), 'utf8');
const baselinePath = process.argv[3];
const rollback = process.argv.includes('--rollback');
const start = '              {selectedBatchArts.length > 1 && !readOnly && (';
function actions(source) {
  const from = source.indexOf(start);
  assert.ok(from > 0);
  const section = source.slice(from, source.indexOf('\n            </>', from));
  const file = ts.createSourceFile('batch.tsx', `const view = <>${section}</>;`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'button') {
      const attrs = node.openingElement.attributes.properties.filter(p => ts.isJsxAttribute(p));
      if (!attrs.some(a => a.name.getText(file) === 'aria-label')) {
        result.push(attrs.filter(a => ['onClick', 'disabled', 'title'].includes(a.name.getText(file)))
          .map(a => a.getText(file).replace(/\s+/g, '')).join('|'));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(result.length, 11);
  return result;
}
if (baselinePath) assert.deepEqual(actions(client), actions(readFileSync(baselinePath, 'utf8')));
if (rollback) {
  assert.ok(!client.includes('import { BatchSelectionToolbar }'));
  assert.ok(client.includes('gap-1.5 overflow-x-auto rounded-2xl'));
  console.log('ROLLBACK=PASS ORIGINAL_BATCH_LAYOUT=RESTORED ACTIONS=11_UNCHANGED');
} else {
  assert.equal((client.match(/<BatchSelectionToolbar/g) || []).length, 2);
  const css = readFileSync(path.join(root, 'src/components/canvas/batch-selection-toolbar.module.css'), 'utf8');
  const component = readFileSync(path.join(root, 'src/components/canvas/batch-selection-toolbar.tsx'), 'utf8');
  assert.match(css, /\.actions > button\s*\{[^}]*flex: none;[^}]*height: 36px;[^}]*white-space: nowrap;/);
  assert.match(css, /\.actions > button > svg\s*\{[^}]*flex: none;/);
  assert.match(css, /min-width: 0;/);
  assert.match(component, /data-batch-scroll/);
  assert.match(component, /data-testid="batch-selection-count"/);
  console.log('CONTRACT=PASS IMAGE_TEXT_SHARED_UI=PASS ACTIONS=11_UNCHANGED');
}
