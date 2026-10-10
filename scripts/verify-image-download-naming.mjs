import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || '.');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const canvas = read('src/components/canvas/canvas-client.tsx');
const chat = read('src/components/genchat/genchat-client.tsx');
const competitor = read('src/components/competitors/competitor-client.tsx');
if (process.argv.includes('--baseline')) {
  assert.ok(canvas.includes('(name || "image").replace(/[^\\w.-]+/g, "_")'));
  assert.ok(chat.includes('a.download = "image.png"'));
  const title = 'GPT2.0 GPT-6Astra 图片.jpg';
  console.log(`BASELINE=PASS CANVAS=${title.replace(/[^\w.-]+/g, '_')}.png CHAT=image.png`);
  process.exit(0);
}

const source = read('src/lib/download.ts');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const anchors = [];
const sandbox = {
  exports: {}, Date, Math, Uint32Array,
  crypto: { getRandomValues: a => { a[0] = 0; return a; } },
  window: { location: { hostname: '120.27.162.85' } },
  document: { createElement: () => { const a = { click() { this.clicked = true; }, remove() { this.removed = true; } }; anchors.push(a); return a; }, body: { appendChild() {} } },
};
vm.runInNewContext(js, sandbox);
const { createImageDownloadName, downloadImage } = sandbox.exports;
const fixed = new Date(2026, 9, 10, 12);
assert.equal(createImageDownloadName(fixed), '120.27.162.85_2026_1010_000000.png');
assert.equal(createImageDownloadName(new Date(2026, 0, 2)), '120.27.162.85_2026_0102_000000.png');
sandbox.crypto.getRandomValues = a => { a[0] = 4294967295; return a; };
assert.match(createImageDownloadName(fixed), /^120\.27\.162\.85_2026_1010_[a-z0-9]{6}\.png$/);
sandbox.window.location.hostname = 'ai.example.com';
assert.match(createImageDownloadName(fixed), /^ai\.example\.com_2026_1010_[a-z0-9]{6}\.png$/);
delete sandbox.crypto;
sandbox.Math = Object.create(Math); sandbox.Math.random = () => 0;
assert.equal(createImageDownloadName(fixed), 'ai.example.com_2026_1010_000000.png');
sandbox.Math.random = () => 0.999999999999;
assert.match(createImageDownloadName(fixed), /_[a-z0-9]{6}\.png$/);
downloadImage('/media/a.jpg', 'GPT2.0 GPT-6Astra 图片.jpg');
const a = anchors.at(-1);
assert.match(a.download, /^ai\.example\.com_\d{4}_\d{4}_[a-z0-9]{6}\.png$/);
assert.equal(new URL(a.href, 'http://ai.example.com').searchParams.get('n'), a.download);
assert.equal(new URL(a.href, 'http://ai.example.com').searchParams.get('u'), '/media/a.jpg');
assert.ok(a.clicked && a.removed);
downloadImage('data:image/png;base64,AA==', 'old.jpg');
assert.equal(anchors.at(-1).href, 'data:image/png;base64,AA==');
assert.match(anchors.at(-1).download, /_[a-z0-9]{6}\.png$/);
delete sandbox.window;
assert.match(createImageDownloadName(fixed), /^naumi_2026_1010_[a-z0-9]{6}\.png$/);
for (const entry of [canvas, chat, competitor]) assert.ok(entry.includes('createImageDownloadName()'));
assert.ok(canvas.includes('a.download = filename'));
assert.ok(canvas.includes('encodeURIComponent(filename)'));
assert.ok(!canvas.includes('(name || "image").replace(/[^\\w.-]+/g, "_")'));
assert.ok(chat.includes('a.download = filename'));
assert.ok(chat.includes('encodeURIComponent(filename)'));
assert.ok(competitor.includes('a.download = createImageDownloadName()'));
console.log('MODIFIED=PASS RULE=HOST_YEAR_MMDD_RANDOM6.png ENTRIES=COMMON,CANVAS,CHAT,COMPETITOR QUERY_NAME=MATCH TITLE=IGNORED BYTES=UNCHANGED');
