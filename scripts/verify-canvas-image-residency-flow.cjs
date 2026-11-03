'use strict';
// Real ReactFlow, native IntersectionObserver/ResizeObserver and real image
// decoding. Only auth and loopback HTTP/media are fixtures. No fake clock,
// observer replacement or product visibility injection is used.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const esbuild = require('esbuild'), sharp = require('sharp');
const { chromium, expect } = require('@playwright/test');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const out = path.resolve(arg('--output-root', 'output/canvas-image-residency-20261103/flow'));
const baseline = args.includes('--baseline'), dependencies = path.resolve(__dirname, '../node_modules');
const owner = 'residency-flow@fixture.test', loaded = [], checks = [], contexts = new Map();
const pageErrors = [], external = [], traces = [];
let server, browser;
fs.mkdirSync(out, { recursive: true });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const entry = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,ReactFlowProvider} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {CanvasImage} from '@/components/canvas/canvas-image';
import {CachedImage} from '@/components/cached-image';
import * as images from '@/lib/browser-image-cache';
const source='/media/flow-residency.png';
function ImageNode(){return <div style={{width:240,height:180}}><CanvasImage data-testid="canvas-image" source={source} hasDimensions forceOriginal={false} alt="owned canvas image" width={240} height={180} style={{display:'block',width:'100%',height:'100%'}}/></div>}
const types={image:ImageNode},nodes=[{id:'image-owned',type:'image',position:{x:80,y:100},data:{},style:{width:240,height:180}}];
const root=createRoot(document.getElementById('app'));
function App(){const[reference,setReference]=useState(false);window.fixture.setReference=setReference;return <><div id="flow"><ReactFlowProvider><ReactFlow nodes={nodes} edges={[]} nodeTypes={types} defaultViewport={{x:0,y:0,zoom:1}} minZoom={0.2} maxZoom={2} onlyRenderVisibleElements={false} nodesDraggable={false} onInit={instance=>{window.fixture.flow=instance;window.flowReady=true;}}/></ReactFlowProvider></div><div id="reference">{reference&&<CachedImage data-testid="reference-image" src={source+'?variant=thumbnail'} imageIdentity={source} reuseActivePreview width={120} height={90} alt="borrowed reference"/>}</div></>}
window.fixture={images,unmount:()=>root.unmount()};images.activateBrowserImages(${JSON.stringify(owner)});root.render(<App/>);window.fixtureReady=true;`;

async function compile() {
  const result = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root, sourcefile: 'residency-flow-entry.tsx' },
    outfile: path.join(out, 'bundle.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', metafile: true,
    nodePaths: [dependencies], alias: { '@': path.join(root, 'src'), react: path.join(dependencies, 'react'), 'react-dom': path.join(dependencies, 'react-dom') },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE': '"0"', 'process.env.NEXT_PUBLIC_IMAGE_BASE_URL': '""', 'process.env': '{}' },
    plugins: [{ name: 'explicit-auth-boundary', setup(build) {
      build.onResolve({ filter: /(^|\/)supabase$/ }, input => ({ path: input.path, namespace: 'auth-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({ contents: 'export async function authHeader(){return {"x-fixture-id":window.fixtureId}}', loader: 'js' }));
    } }],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(input);
    if (input.startsWith('auth-fixture:') || !input.includes('src/') || file.includes(`${path.sep}node_modules${path.sep}`) || !fs.existsSync(file)) continue;
    loaded.push({ file, sha256: hash(fs.readFileSync(file)) });
  }
  for (const relative of ['src/components/canvas/canvas-image.tsx','src/components/cached-image.tsx','src/lib/canvas/image-observers.ts','src/lib/browser-image-cache.ts']) {
    assert(loaded.some(row => row.file === path.join(root, relative)), `real product module loaded: ${relative}`);
  }
}

async function main() {
  await compile();
  const png = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#8bbab0' } }).png().toBuffer();
  server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') { res.statusCode=204; return res.end(); }
    if (req.url === '/bundle.js' || req.url === '/bundle.css') {
      res.setHeader('content-type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css');
      return res.end(fs.readFileSync(path.join(out, req.url.slice(1))));
    }
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/bundle.css"><style>html,body{margin:0;background:#fff}#flow{width:800px;height:560px;background:#f6f7f9}#reference{position:absolute;left:850px;top:60px;width:120px;height:90px}.react-flow__node{border:0}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>');
    }
    const state = contexts.get(req.headers['x-fixture-id']);
    if (!state) { res.statusCode = 404; return res.end(); }
    state.requests.push({ method: req.method, url: req.url });
    if (req.url === '/api/media/image-cache') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const sources = JSON.parse(raw).sources;
      state.manifests++; state.authorized.push(...sources);
      if (state.holdReference && sources.some(s => s.includes('variant=thumbnail'))) return;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ account: owner, results: Object.fromEntries(sources.map(source => [source, {
        account: owner, source, version: 'local:flow-v1', bytes: png.length, contentType: 'image/png', fetchUrl: source,
      }])) }));
    }
    if (req.url.startsWith('/media/flow-residency.png')) {
      state.media++;
      if (state.holdReference && req.url.includes('variant=thumbnail')) return;
      res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'no-store'); return res.end(png);
    }
    state.unexpected.push({ method: req.method, url: req.url }); res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function fixture() {
    const id = crypto.randomUUID(), state = { id, manifests: 0, media: 0, requests: [], authorized: [], unexpected: [], holdReference: false };
    contexts.set(id, state);
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, extraHTTPHeaders: { 'x-fixture-id': id } });
    await context.addInitScript(id => {
      window.fixtureId=id; window.createdURLs=[]; window.revokedURLs=[];
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
      URL.createObjectURL=blob=>{const url=create(blob);window.createdURLs.push(url);return url;};
      URL.revokeObjectURL=url=>{window.revokedURLs.push(url);return revoke(url);};
      // Only record the native observer identities; no observer or clock replacement.
      window.nativeVisibilityAPIs={intersection:IntersectionObserver.toString(),resize:ResizeObserver.toString()};
    }, id);
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('request', req => { if(!req.url().startsWith(origin)&&!req.url().startsWith('blob:')&&!req.url().startsWith('data:'))external.push(req.url()); });
    await page.goto(origin); await page.waitForFunction(() => window.flowReady && window.fixtureReady);
    await page.waitForFunction(() => document.querySelector('[data-testid="canvas-image"]')?.naturalWidth === 1024);
    return { page, state, close: async () => { traces.push(state); await context.close(); } };
  }
  const snapshot = page => page.evaluate(() => {
    const img=document.querySelector('[data-testid="canvas-image"]'),root=document.querySelector('.react-flow');
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    return { src:img?.getAttribute('src'), naturalWidth:img?.naturalWidth, naturalHeight:img?.naturalHeight,
      visible:img?.dataset.mediaVisible, variant:img?.dataset.mediaVariant, image:rect(img), root:rect(root),
      created:window.createdURLs.slice(), revoked:window.revokedURLs.slice(), viewport:window.fixture.flow.getViewport(), native:window.nativeVisibilityAPIs };
  });
  const move = async (page, x, zoom=1) => {
    await page.evaluate(({x,zoom}) => window.fixture.flow.setViewport({x,y:0,zoom},{duration:0}), {x,zoom});
    await expect.poll(() => page.evaluate(() => window.fixture.flow.getViewport().x)).toBe(x);
  };
  async function check(name, action) {
    const detail=await action();checks.push({name,pass:true,detail});console.log('CHECK='+name+' RESULT=PASS');
  }

  const first=await fixture();
  try {
    await check('NATIVE_FLOW_VISIBLE_100PERCENT_ORIGINAL', async () => {
      const s=await snapshot(first.page);assert.equal(s.visible,'true');assert.equal(s.variant,'original');assert.equal(s.naturalWidth,1024);
      assert.match(s.native.intersection,/native code/);assert.match(s.native.resize,/native code/);assert.equal(first.state.media,1);return s;
    });
    await check('NATIVE_ZOOM_OUT_PRESERVES_SHARPER_VISIBLE_FRAME', async () => {
      const old=await snapshot(first.page);await move(first.page,0,0.5);
      await expect.poll(() => first.page.locator('[data-testid="canvas-image"]').getAttribute('data-media-visible')).toBe('true');
      const s=await snapshot(first.page);assert.equal(s.src,old.src);assert.equal(s.variant,'original');assert.equal(s.created.length,old.created.length);return s;
    });
    await check('SHORT_NATIVE_PAN_RETURN_PRESERVES_FRAME', async () => {
      await move(first.page,0,1);const old=await snapshot(first.page);await move(first.page,-1600);
      await expect.poll(() => first.page.locator('[data-testid="canvas-image"]').getAttribute('data-media-visible')).toBe('false');
      const off=await snapshot(first.page);assert(off.image.right<off.root.x-180,'outside actual native root plus prefetch margin');
      await new Promise(r=>setTimeout(r,300));await move(first.page,0);
      await expect.poll(() => first.page.locator('[data-testid="canvas-image"]').getAttribute('data-media-visible')).toBe('true');
      const s=await snapshot(first.page);assert.equal(s.src,old.src);assert.equal(s.created.length,old.created.length);assert.equal(first.state.media,1);return {offscreen:off,returned:s};
    });
    await check(baseline?'BASELINE_NATIVE_OFFSCREEN_FRAME_REMAINS_AFTER_IDLE':'NATIVE_OFFSCREEN_IDLE_RELEASES_ONLY_IMAGE_FRAME',async()=>{
      await move(first.page,-1600);await expect.poll(()=>first.page.locator('[data-testid="canvas-image"]').getAttribute('data-media-visible')).toBe('false');
      const before=await snapshot(first.page),start=Date.now();
      if(baseline){await new Promise(r=>setTimeout(r,15400));const after=await snapshot(first.page);assert.equal(after.src,before.src);assert(!after.revoked.includes(before.src));return{before,after,elapsedMs:Date.now()-start,expectedOldDefect:true};}
      await expect.poll(()=>first.page.locator('[data-testid="canvas-image"]').getAttribute('src'),{timeout:19000,intervals:[100,200,300]}).toBeNull();
      const after=await snapshot(first.page);assert(after.revoked.includes(before.src));assert.equal(await first.page.locator('.react-flow__node').count(),1);assert(Date.now()-start>=14000,'real idle window, no fake clock');return{before,after,elapsedMs:Date.now()-start};
    });
    if(!baseline)await check('RETURN_REAUTHORIZES_REUSES_BYTES_AND_ORIGINAL_DIMENSIONS',async()=>{
      const before=await snapshot(first.page),auth=first.state.manifests,media=first.state.media;await move(first.page,0);
      await first.page.waitForFunction(()=>document.querySelector('[data-testid="canvas-image"]')?.naturalWidth===1024);
      const after=await snapshot(first.page);assert.equal(after.variant,'original');assert.equal(after.naturalHeight,768);assert(first.state.manifests>auth);assert.equal(first.state.media,media);assert(after.created.length>before.created.length);await first.page.screenshot({path:path.join(out,'native-return.png')});return{before,after,authBefore:auth,authAfter:first.state.manifests,media};
    });
  } finally { await first.close(); }
  if(!baseline){
    const borrowed=await fixture();
    try{
      await check('REFERENCE_BORROW_SURVIVES_CANVAS_IDLE_RELEASE',async()=>{
        const initial=await snapshot(borrowed.page);borrowed.state.holdReference=true;
        await borrowed.page.evaluate(()=>window.fixture.setReference(true));
        await borrowed.page.waitForFunction(()=>document.querySelector('[data-testid="reference-image"]')?.naturalWidth===1024);
        assert.equal(await borrowed.page.locator('[data-testid="reference-image"]').getAttribute('src'),initial.src);
        await move(borrowed.page,-1600);await expect.poll(()=>borrowed.page.locator('[data-testid="canvas-image"]').getAttribute('data-media-visible')).toBe('false');
        await expect.poll(()=>borrowed.page.locator('[data-testid="canvas-image"]').getAttribute('src'),{timeout:19000,intervals:[100,200,300]}).toBeNull();
        const retained=await borrowed.page.evaluate(url=>({src:document.querySelector('[data-testid="reference-image"]')?.getAttribute('src'),width:document.querySelector('[data-testid="reference-image"]')?.naturalWidth,revoked:window.revokedURLs.includes(url)}),initial.src);
        assert.equal(retained.src,initial.src);assert.equal(retained.width,1024);assert.equal(retained.revoked,false);
        await borrowed.page.evaluate(()=>window.fixture.setReference(false));
        await expect.poll(()=>borrowed.page.evaluate(url=>window.revokedURLs.includes(url),initial.src)).toBe(true);
        return{initial,retained,lastConsumerReleased:true};
      });
    }finally{await borrowed.close();}
    const reset=await fixture();
    try{
      await check('ACCOUNT_CLEAR_AND_COMPONENT_UNMOUNT_RELEASE_FRAMES',async()=>{
        const initial=await snapshot(reset.page);await reset.page.evaluate(()=>window.fixture.images.clearBrowserImages());
        await expect.poll(()=>reset.page.locator('[data-testid="canvas-image"]').getAttribute('src')).toBeNull();
        const removed=await reset.page.evaluate(url=>window.revokedURLs.includes(url),initial.src);assert(removed);
        await reset.page.evaluate(()=>window.fixture.unmount());assert.equal(await reset.page.locator('[data-testid="canvas-image"]').count(),0);return{removed,media:reset.state.media};
      });
    }finally{await reset.close();}
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);assert(traces.every(s=>s.unexpected.length===0));
  assert(loaded.every(row=>hash(fs.readFileSync(row.file))===row.sha256),'no product file changed during native Flow run');
  const status=baseline?'REPRODUCED':'PASS',exit=baseline?1:0;
  const stdout=`CANVAS_IMAGE_RESIDENCY_FLOW=${status} CHECKS=${checks.length} NATIVE_REACTFLOW=1 NATIVE_OBSERVERS=1 REAL_CLOCK=1 SUPPLIER_CALLS=0 EXIT=${exit}`;
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status,stdout,exit,sourceRoot:root,checks,loaded,pageErrors,external,traces,
    evidence:'Actual ReactFlow and native viewport IntersectionObserver/ResizeObserver; 1024x768 fixture PNG decoded; real 15second grace; no RSS/GPU-memory measurement; auth/HTTP/media fixture; no generation'},null,2));
  console.log(stdout);process.exitCode=exit;
}
main().catch(error=>{const result={status:'FAIL',error:error.stack||String(error),checks,loaded,pageErrors,external,traces};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));console.error(error);process.exitCode=2;}).finally(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
