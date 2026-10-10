import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || '.');
const baseline = process.argv[3] && path.resolve(process.argv[3]);
const rollback = process.argv.includes('--rollback');
const read = file => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const violations = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'admin') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (file.endsWith('.tsx')) {
      const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxExpression(node) && /\bcreditHint\b/.test(node.getText(tree))) violations.push(path.relative(root, file));
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
}
scan(path.join(root, 'src/components'));
if (baseline) {
  const files = ['src/components/tools/feature-model-select.tsx', 'src/components/generate/generate-client.tsx', 'src/components/admin/model-management/model-management.tsx'];
  for (const file of files) {
    let original = readFileSync(path.join(baseline, 'baseline', file), 'utf8').replace(/\r\n/g, '\n');
    if (!rollback) {
      original = original.replace('{m.label}{m.creditHint?` · ${m.creditHint}`:""}', '{m.label}')
        .replace('                          {item.creditHint && <small className="block text-[10px] font-normal text-muted-foreground">{item.creditHint}</small>}\n', '')
        .replace('前端模型选项显示标准1K参考价，提交按钮', '提交按钮');
    }
    assert.equal(read(file), original, `Unexpected behavior change: ${file}`);
  }
  const hashes = JSON.parse(readFileSync(path.join(baseline, 'business-hashes.json'), 'utf8'));
  for (const [file, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), hash, file);
  }
}
if (rollback) {
  assert.ok(violations.some(f => f.includes('feature-model-select.tsx')));
  assert.ok(violations.some(f => f.includes('generate-client.tsx')));
  console.log('ROLLBACK=PASS ORIGINAL_MODEL_PRICE_HINTS=RESTORED BILLING_ROUTING=UNCHANGED');
} else {
  assert.deepEqual(violations, []);
  console.log('CONTRACT=PASS FRONTEND_MODEL_PRICE_HINTS=0 BRAND_SELECTION_BILLING_ROUTING=UNCHANGED');
}
