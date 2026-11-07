import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import ts from 'typescript';

// Real React/React Flow, product image components, IDB, HTTP and browser decode.
// Only auth/locale and the media/manifest service are isolated fixture boundaries.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', repo));
const out = path.resolve(arg('--output-root', process.env.CANVAS_IMAGE_STABILITY_EVIDENCE||path.join(repo, 'output/canvas-image-stability')));
const baseline = args.includes('--baseline'), mode = baseline ? 'BASELINE' : 'MODIFIED';
const req = createRequire(path.join(repo, 'package.json'));
const exists = async p => !!await fs.stat(p).catch(() => null);
const source = async rel => await exists(path.join(root, rel)) ? path.join(root, rel) : path.join(repo, rel);
const hash = data => createHash('sha256').update(data).digest('hex');
await fs.mkdir(out, { recursive: true });
const clientPath = await source('src/components/canvas/canvas-client.tsx'), client = await fs.readFile(clientPath, 'utf8');
const projectOwnerPath=await source('src/components/canvas/project-browser.tsx');
const projectOwner=await fs.readFile(projectOwnerPath,'utf8');
const modernProjects = projectOwner.includes('<ProjectBrowserSurface')||client.includes('<ProjectBrowserSurface');
// Load the baseline's exact production cover JSX. The surrounding visibility
// boundary mirrors its asserted browsing ternary, not a missing-new-export test.
let oldCover;
if (!modernProjects) {
  assert.match(client, /\) : browsing \? \(/);
  const ast = ts.createSourceFile(projectOwnerPath, projectOwner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'CachedImage' && node.getText(ast).includes('cdnUrl(p.cover)')) oldCover = node.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(oldCover, 'real baseline project cover was found');
} else {
  assert.match(projectOwner, /<ProjectCover source=\{p.cover\} title=\{p.name\}/);
  assert.match(client, /CanvasProjectBrowser key=\{`\$\{canvasArtworkDocument.scope.account\}:\$\{canvasArtworkDocument.scope.workspace\}/);
  assert.match(client,/visible=\{!loading && browsing\}/);
}
const projectImport = modernProjects ? "import {ProjectBrowserSurface,ProjectCover} from '@/components/canvas/project-browser-surface';" :
  `function ProjectBrowserSurface({visible,children}){return visible?<div data-testid="canvas-project-browser">{children}</div>:null}
   function ProjectCover({source,title}){const p={cover:source,name:title};return ${oldCover}}`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {ReactFlow} from '@xyflow/react';import {CanvasImage} from '@/components/canvas/canvas-image';
import {CachedImage} from '@/components/cached-image';import * as cache from '@/lib/browser-image-cache';
import {cdnUrl} from '@/lib/cdn';${projectImport}
const root=createRoot(document.getElementById('app'));
function ImageNode({data}){return <CanvasImage source={data.source} forceOriginal={false} hasDimensions={true} data-testid={data.id} width={800} height={600} style={{width:800,height:600,display:'block'}}/>}
const nodeTypes={image:ImageNode};
const nodes=[{id:'a',type:'image',position:{x:0,y:0},data:{id:'subject',source:'/media/canvas.png'},style:{width:800,height:600}},
{id:'b',type:'image',position:{x:8000,y:0},data:{id:'unseen',source:'/media/unseen.png'},style:{width:800,height:600}}];
function Projects({visible,scope}){return <ProjectBrowserSurface key={scope} visible={visible}><section className="covers">
{[0,1,2,3].map(i=><div key={i} className={'cover '+(i===3?'far':'')}><ProjectCover source={'/media/cover-'+i+'.png'} title={'Project '+i}/></div>)}
</section></ProjectBrowserSurface>}
window.fixture={...cache,canvas:()=>root.render(<ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} defaultViewport={{x:50,y:50,zoom:.4}} onInit={flow=>window.flow=flow} minZoom={.1} maxZoom={4}/>),
projects:(visible,scope='owner:personal')=>root.render(<Projects visible={visible} scope={scope}/>),
single:(src,identity)=>root.render(<CachedImage data-testid="subject" src={src} imageIdentity={identity} networkQueue="canvas" style={{width:400,height:300}}/>),
empty:()=>root.render(null)};`;
const bundle = await build({ stdin: { contents: entry, resolveDir: repo, loader: 'tsx' }, bundle: true, write: false, metafile: true,
  platform: 'browser', format: 'iife', jsx: 'automatic', absWorkingDir: repo,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE': '"0"', 'process.env.NEXT_PUBLIC_MEDIA_VARIANTS': '"1"', 'process.env.NEXT_PUBLIC_IMAGE_BASE_URL': '""' },
  plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /^\.\/supabase$|^@\/lib\/i18n\/locale-context$/ }, a => ({ path: a.path.includes('locale') ? 'locale' : 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'auth' ? 'export async function authHeader(){return {}}' : 'export function useI18n(){return {locale:"en"}}', loader: 'js' }));
    b.onResolve({ filter: /^@\// }, async a => { for (const ext of ['.tsx', '.ts']) { const p = await source('src/' + a.path.slice(2) + ext); if (await exists(p)) return { path: p }; } throw new Error('Missing source: ' + a.path); });
    b.onResolve({ filter: /^(react(?:\/|$)|react-dom(?:\/|$)|@xyflow\/react$)/ }, a => {
      // The parent core process also tests server code with react-server. These
      // actual DOM components need the package's browser entry, not an RSC stub.
      const match=/^(react|react-dom)(?:\/(jsx-runtime|jsx-dev-runtime|client))?$/.exec(a.path);
      return {path:match?path.join(path.dirname(req.resolve(match[1]+'/package.json')),(match[2]||'index')+'.js'):req.resolve(a.path)};
    });
  } }],
});
const loaded = [];
for (const p of Object.keys(bundle.metafile.inputs)) if (!p.includes('node_modules') && !p.startsWith('fixture:') && p !== '<stdin>') {
  const absolute = path.resolve(repo, p); if (await exists(absolute)) loaded.push({ path: absolute, sha256: hash(await fs.readFile(absolute)) });
}
loaded.push({ path: clientPath, sha256: hash(client), usage: 'project JSX/integration check' });
const css = await fs.readFile(req.resolve('@xyflow/react/dist/style.css'), 'utf8');
const buffers = new Map();
async function bytesFor(source) {
  const url = new URL(source, 'http://fixture.test'), variant = url.searchParams.get('variant') || 'original';
  const key = url.pathname + ':' + variant;
  if (!buffers.has(key)) {
    const width = variant === 'thumbnail' ? 512 : variant === 'preview' ? 1600 : 2048;
    const color = '#' + hash(url.pathname).slice(0, 6);
    buffers.set(key, await sharp({ create: { width, height: width * .75, channels: 3, background: color } }).png().toBuffer());
  }
  return buffers.get(key);
}
const owner = 'image-owner@fixture.test', other = 'image-other@fixture.test';
let state = { account: owner, hold: false, deny: new Set(), status: 200 }, waiting = [];
const metrics = { manifests: 0, requests: [], bytes: 0 }, pageErrors = [], checks = [], evidence = {};
function releaseGate() { state.hold = false; for (const done of waiting.splice(0)) done(); }
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/fixture.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); return; }
    if (url.pathname === '/api/media/image-cache') {
      let body = ''; for await (const c of request) body += c;
      const sources = JSON.parse(body).sources, snapshot = { ...state, deny: new Set(state.deny) };
      metrics.manifests++;
      if (snapshot.hold) await new Promise(resolve => waiting.push(resolve));
      const results = {};
      for (const source of sources) { const bytes = await bytesFor(source); results[source] = snapshot.deny.has(source) ? null : { account: snapshot.account, source, version: hash(bytes), fetchUrl: source, bytes: bytes.length, contentType: 'image/png' }; }
      response.statusCode = snapshot.status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ account: snapshot.account, results })); return;
    }
    if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/native/')) {
      const bytes = await bytesFor(request.url); metrics.requests.push(request.url); metrics.bytes += bytes.length;
      response.setHeader('content-type', 'image/png'); response.setHeader('cache-control', 'no-store'); response.end(bytes); return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><meta charset="utf-8"><style>${css}
html,body,#app{margin:0;width:100%;height:100%;background:#f5f6f8}.covers{display:flex;gap:16px;flex-wrap:wrap}.cover{width:240px;height:180px}.cover img{width:100%;height:100%;object-fit:cover}.cover.far{margin-top:1600px}[hidden]{display:none!important}[data-testid=canvas-project-browser]{height:100%;overflow:auto}</style><div id="app"></div><script>
window.probe={watch:false,blanks:0,blankFrames:0,revoked:[],created:[]};const p=window.probe;
const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{p.revoked.push(u);revoke(u)};
const create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);p.created.push(u);return u};
new MutationObserver(rs=>{for(const r of rs)if(p.watch&&r.attributeName==='src'&&r.target.dataset.testid==='subject'&&r.oldValue&&!r.target.getAttribute('src'))p.blanks++}).observe(document.getElementById('app'),{subtree:true,attributes:true,attributeOldValue:true});
function sample(){const i=document.querySelector('[data-testid=subject]');if(p.watch&&i&&(!i.getAttribute('src')||!i.complete||i.naturalWidth===0))p.blankFrames++;requestAnimationFrame(sample)}requestAnimationFrame(sample);
</script><script src="/fixture.js"></script>`);
  } catch (error) { response.statusCode = 500; response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async fn => { for (let i = 0; i < 250 && !fn(); i++) await wait(20); assert.ok(fn(), 'fixture event arrived'); };
async function start() { await page.goto(base); await page.waitForFunction(() => !!window.fixture); await page.evaluate(owner => window.fixture.activateBrowserImages(owner), owner); }
async function ready(width) { await page.waitForFunction(width => { const i = document.querySelector('[data-testid=subject]'); return i?.complete && i.naturalWidth === width; }, width); }
async function current() { return page.locator('[data-testid=subject]').evaluate(i => ({ src: i.getAttribute('src'), width: i.naturalWidth, complete: i.complete })); }
async function watch() { await page.evaluate(() => { window.probe.watch = true; window.probe.blanks = 0; window.probe.blankFrames = 0; }); }
try {
  await start(); await page.evaluate(() => window.fixture.canvas()); await ready(512);
  assert.ok(!metrics.requests.some(s => s.includes('unseen')), 'offscreen node never fetched'); checks.push('UNSEEN_NODE_NO_BYTES');
  // Old and new use identical preloaded IDB data. Block metadata, not images.
  const before = await current(), requestBefore = metrics.requests.length;
  // Accelerate only the product's 20s image timeout while holding metadata, so
  // slow upgrades also exercise the existing retry overlay rather than hiding it.
  await page.evaluate(() => { const timer = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 20000 ? 120 : ms, ...args); });
  await watch(); state.hold = true; const manifestBefore = metrics.manifests;
  await page.evaluate(() => window.flow.setViewport({ x: 50, y: 50, zoom: 1.1 }));
  await until(() => metrics.manifests > manifestBefore); await wait(180);
  const during = await current();
  await page.screenshot({ path: path.join(out, 'zoom-upgrade.png') });
  evidence.upgrade = { before, during, retained: during.src === before.src, downloadedWhileBlocked: metrics.requests.length - requestBefore };
  if (!baseline) { assert.equal(await page.locator('[role=status]').count(), 0); checks.push('SLOW_UPGRADE_NO_WHITE_TIMEOUT_OVERLAY'); }
  releaseGate(); await ready(2048); await wait(50);
  evidence.upgrade.blanks = await page.evaluate(() => ({ mutations: window.probe.blanks, frames: window.probe.blankFrames }));
  if (baseline) { assert.equal(evidence.upgrade.retained, false); assert.ok(evidence.upgrade.blanks.frames > 0); }
  else { assert.equal(evidence.upgrade.retained, true); assert.deepEqual(evidence.upgrade.blanks, { mutations: 0, frames: 0 }); }
  checks.push('QUALITY_UPGRADE_' + (baseline ? 'BLANK_REPRODUCED' : 'DECODED_SWAP_NO_BLANK'));
  const sharpFrame = await current(), stableBytes = metrics.requests.length, stableManifests = metrics.manifests;
  await page.evaluate(() => { window.probe.watch = false; return window.flow.setViewport({ x: -5000, y: 50, zoom: .4 }); });
  await page.waitForFunction(() => document.querySelector('[data-testid=subject]')?.dataset.mediaVisible === 'false');
  evidence.offscreen = await current();
  if (!baseline) assert.equal(evidence.offscreen.src, sharpFrame.src);
  await page.evaluate(() => window.flow.setViewport({ x: 50, y: 50, zoom: .4 })); await ready(2048);
  evidence.reentry = { imageRequests: metrics.requests.length - stableBytes, metadataRequests: metrics.manifests - stableManifests, sameURL: (await current()).src === sharpFrame.src };
  if (!baseline) assert.deepEqual(evidence.reentry, { imageRequests: 0, metadataRequests: 0, sameURL: true });
  checks.push('PAN_REENTRY_' + (baseline ? 'RELOAD_REPRODUCED' : 'ZERO_RELOAD'));
  await watch();
  for (const zoom of [.3, .95, 1.01, .64, 1.8, .4]) { await page.evaluate(zoom => window.flow.setViewport({ x: 50, y: 50, zoom }), zoom); await wait(35); }
  if (!baseline) { assert.equal((await current()).src, sharpFrame.src); assert.equal(metrics.requests.length, stableBytes); assert.equal(await page.evaluate(() => window.probe.blankFrames), 0); }
  checks.push('REPEATED_ZOOM_NO_DOWNGRADE');
  await page.evaluate(() => { window.probe.watch = false; window.fixture.projects(false); }); await wait(80);
  const projectStart = metrics.requests.length;
  await page.evaluate(() => window.fixture.projects(true));
  await page.waitForFunction(() => [...document.querySelectorAll('.cover:not(.far) img')].length === 3 && [...document.querySelectorAll('.cover:not(.far) img')].every(i => i.complete && i.naturalWidth > 0));
  const projectBytes = metrics.requests.slice(projectStart);
  evidence.projectInitial = { requests: projectBytes, originalRequests: projectBytes.filter(s => !s.includes('variant=')).length };
  if (!baseline) { assert.equal(evidence.projectInitial.originalRequests, 0); assert.ok(projectBytes.every(s => s.includes('variant=thumbnail'))); assert.ok(!projectBytes.some(s => s.includes('cover-3'))); }
  else assert.ok(evidence.projectInitial.originalRequests > 0);
  checks.push('PROJECT_' + (baseline ? 'ORIGINAL_FETCH_REPRODUCED' : 'LAZY_THUMBNAILS'));
  await page.evaluate(() => { window.savedCover = document.querySelector('.cover img'); window.savedSrc = window.savedCover.src; window.fixture.projects(false); });
  await wait(80); const metaBeforeReturn = metrics.manifests, bytesBeforeReturn = metrics.requests.length;
  state.hold = true; await page.evaluate(() => window.fixture.projects(true)); await wait(100);
  evidence.projectReturn = await page.evaluate(() => ({ sameElement: document.querySelector('.cover img') === window.savedCover, sameSrc: document.querySelector('.cover img')?.getAttribute('src') === window.savedSrc, decoded: document.querySelector('.cover img')?.naturalWidth > 0 }));
  await page.screenshot({ path: path.join(out, 'projects-return.png') });
  releaseGate(); await page.waitForFunction(() => [...document.querySelectorAll('.cover:not(.far) img')].every(i => i.naturalWidth > 0));
  evidence.projectReturn.metadataRequests = metrics.manifests - metaBeforeReturn;
  evidence.projectReturn.imageRequests = metrics.requests.length - bytesBeforeReturn;
  if (baseline) { assert.equal(evidence.projectReturn.sameElement, false); assert.equal(evidence.projectReturn.decoded, false); assert.equal(evidence.projectReturn.imageRequests, 0); }
  else assert.deepEqual(evidence.projectReturn, { sameElement: true, sameSrc: true, decoded: true, metadataRequests: 0, imageRequests: 0 });
  checks.push('PROJECT_RETURN_' + (baseline ? 'IDB_HIT_BUT_BLANK' : 'DECODED_DOM_REUSED'));
  if (!baseline) {
    await page.evaluate(() => window.fixture.projects(false)); await wait(30); state.deny.add('/media/cover-0.png?variant=thumbnail');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !document.querySelector('.cover img').getAttribute('src'));
    assert.ok(await page.locator('.cover img').nth(1).getAttribute('src')); checks.push('HIDDEN_COVER_REVOKE_TARGETED');
    state.deny.clear(); state.account = other;
    await page.evaluate(other => window.fixture.activateBrowserImages(other), other);
    assert.ok(await page.locator('.cover img').evaluateAll(images => images.every(i => !i.getAttribute('src')))); checks.push('ACCOUNT_SWITCH_CLEARS_HIDDEN_PIXELS');
    await page.evaluate(() => window.fixture.empty()); state.account = owner;
    await page.evaluate(owner => { window.fixture.activateBrowserImages(owner); window.fixture.single('/media/a.png?variant=thumbnail', '/media/a.png'); }, owner); await ready(512);
    const first = await current(); state.hold = true;
    await page.evaluate(() => window.fixture.single('/media/b.png', '/media/b.png')); await wait(80);
    assert.notEqual((await current()).src, first.src); assert.equal((await current()).src, null); releaseGate(); await ready(2048); checks.push('DIFFERENT_SOURCE_NEVER_SHOWS_OLD');
    // Hold the real decoder after bytes/authorization finish: display must still
    // use the old frame until the decoder itself, not merely fetch, is ready.
    await page.evaluate(() => window.fixture.single('/media/decode.png?variant=thumbnail', '/media/decode.png')); await ready(512); const small = await current();
    await page.evaluate(() => { const original = HTMLImageElement.prototype.decode; window.restoreDecode = () => { HTMLImageElement.prototype.decode = original; }; window.decodeWaiting = 0; HTMLImageElement.prototype.decode = function () { window.decodeWaiting++; return new Promise(resolve => { window.allowDecode = () => original.call(this).then(resolve); }); }; window.fixture.single('/media/decode.png', '/media/decode.png'); });
    await page.waitForFunction(() => window.decodeWaiting > 0); assert.equal((await current()).src, small.src); assert.ok(!(await page.evaluate(() => window.probe.revoked)).includes(small.src));
    await page.evaluate(() => { window.restoreDecode(); window.allowDecode(); }); await ready(2048);
    assert.ok((await page.evaluate(() => window.probe.revoked)).includes(small.src)); checks.push('DECODE_GATE_AND_POST_COMMIT_RELEASE');
    state.hold = true; await page.evaluate(() => window.fixture.single('/media/stale.png', '/media/stale.png')); await wait(60);
    await page.evaluate(() => window.fixture.empty()); releaseGate(); await wait(120); assert.equal(await page.locator('#app img').count(), 0); checks.push('UNMOUNT_DURING_REQUEST_NO_LATE_DISPLAY');
    await page.evaluate(() => window.fixture.single('/native/a.png', '/native/a.png')); await ready(2048);
    await page.evaluate(() => window.fixture.single('/native/a.png?variant=thumbnail', '/native/a.png')); await ready(512); checks.push('NATIVE_QUEUE_DECODE_COMPLETES');
    await page.evaluate(() => window.fixture.empty()); await wait(70);
    const unfreed = await page.evaluate(() => window.probe.created.filter(url => !window.probe.revoked.includes(url))); assert.deepEqual(unfreed, []); checks.push('ALL_BLOB_LEASES_RELEASED');
  }
  assert.deepEqual(pageErrors, []);
  const result = { mode, result: baseline ? 'REPRODUCED' : 'PASS', checks, evidence, loaded, react: req('react/package.json').version, reactFlow: req('@xyflow/react/package.json').version, scriptSha256: hash(await fs.readFile(fileURLToPath(import.meta.url))), pageErrors, providerCalls: 0, productionWrites: 0 };
  await fs.writeFile(path.join(out, mode + '.json'), JSON.stringify(result, null, 2));
  console.log(`${mode}=${result.result} CHECKS=${checks.length} ZOOM_BLANK_FRAMES=${evidence.upgrade.blanks.frames} PROJECT_RETURN_BLANK=${!evidence.projectReturn.decoded} IMAGE_REQUESTS_ON_RETURN=${evidence.projectReturn.imageRequests} PAGEERRORS=0 PROVIDER_CALLS=0`);
  if (baseline) process.exitCode = 1;
} catch (error) {
  await fs.writeFile(path.join(out, 'ERROR.json'), JSON.stringify({ error: error.stack, mode, checks, evidence, metrics, pageErrors, loaded }, null, 2));
  throw error;
} finally { releaseGate(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
