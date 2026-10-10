import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const root = path.resolve(process.argv[2] || '.');
const evidence = path.resolve(process.argv[3] || 'output/image-download-naming-browser');
fs.mkdirSync(evidence, { recursive: true });
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(tree); ts.forEachChild(node, visit); }
  visit(tree); assert.ok(found, name); return compile(found);
}
const helper = compile(fs.readFileSync(path.join(root, 'src/lib/download.ts'), 'utf8'));
const canvas = extract('src/components/canvas/canvas-client.tsx', 'downloadOne');
const chat = extract('src/components/genchat/genchat-client.tsx', 'exportImg');
const competitor = extract('src/components/competitors/competitor-client.tsx', 'download');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7AAAAABJRU5ErkJggg==', 'base64');
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><button id="download">下载</button>');
  }
  requests.push(url);
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${url.searchParams.get('n') || 'fixture.png'}"` });
  res.end(png);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.NAUMI_BROWSER_EXECUTABLE ? { executablePath: process.env.NAUMI_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({ content: `var exports = {}; ${helper}\n${canvas}\n${chat}\nconst item = { id: 'fixture', activeVersion: '1', path: 'GPT2.0_GPT-6Astra.jpg' }; const drafts = {}; async function authHeader() { return {}; } function setError(e) { throw new Error(e); }\n${competitor}` });
  const cases = [
    ['common', `downloadImage('/media/old.jpg', 'GPT2.0_GPT-6Astra.jpg')`],
    ['canvas', `downloadOne('/media/old.jpg')`],
    ['chat', `exportImg({ image: '/media/old.jpg' })`],
    ['competitor', `download()`],
    ['competitor-region', `download('region1')`],
    ['data', `downloadImage('data:image/png;base64,${png.toString('base64')}', 'old.jpg')`],
  ];
  for (const [label, action] of cases) {
    const index = requests.length;
    await page.evaluate(action => { document.querySelector('#download').onclick = () => { void eval(action); }; }, action);
    const pending = page.waitForEvent('download');
    await page.click('#download');
    const result = await pending;
    const name = result.suggestedFilename();
    assert.match(name, /^127\.0\.0\.1_\d{4}_\d{4}_[a-z0-9]{6}\.png$/);
    assert.ok(!name.includes('GPT') && !name.includes('.jpg'));
    const file = path.join(evidence, `${label}.png`);
    await result.saveAs(file);
    assert.deepEqual(fs.readFileSync(file), png, `${label}: unchanged bytes`);
    if (['common', 'canvas', 'chat'].includes(label)) assert.equal(requests.slice(index).find(url => url.pathname === '/api/download').searchParams.get('n'), name);
  }
  console.log('BROWSER=PASS DOWNLOADS=6 NAME=HOST_YEAR_MMDD_RANDOM6.png PROXY_NAME=MATCH BYTES=UNCHANGED');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
