import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const mode = process.argv[2];
const root = path.resolve(process.argv[3] || '.');
const source = path.join(root, 'src/components/home/landing.tsx');
const originalHash = 'bc5dd07a499f5d05d6ec298ceae443f664ed3924f0df028aa1ec4605b55b99c2';
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), originalHash, 'Existing landing changed');
const file = path.join(root, 'design/folio-preview/index.html');
if (mode === 'baseline' || mode === 'rollback') {
  assert.equal(fs.existsSync(file), false);
  console.log(`${mode.toUpperCase()}=PASS; preview=absent; landing_sha256=${originalHash}; existing_home=unchanged`);
} else if (mode === 'modified') {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<title>Naumi · 创作工作空间<\/title>/);
  assert.match(html, /color-scheme: light/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /@media\s*\(max-width:\s*600px\)/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /<dialog/);
  for (const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script);
  const assets = [...html.matchAll(/(?:src|data-before|data-after)="(assets\/[^"]+)"/g)].map(m => m[1]);
  for (const asset of assets) assert.ok(fs.existsSync(path.join(path.dirname(file), asset)), asset);
  assert.ok(assets.length >= 10);
  assert.equal(/fetch\(|XMLHttpRequest|https?:\/\//.test(html), false, 'Preview must not make provider/network calls');
  console.log(`MODIFIED=PASS; preview=present; local_assets=${assets.length}; scripts=valid; light=only; existing_home=unchanged`);
} else throw new Error('Usage: node scripts/verify-folio-preview.mjs baseline|modified|rollback [root]');
