import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

// Isolated loopback client fixture: real cache, IDB, React and image decode;
// synthetic manifest/auth, never connects to production or a supplier.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.argv[2]||repo),mode=process.argv[3]||'modified';
const out=path.resolve(process.argv[4]||path.join(repo,'output/image-focus'));
const req=createRequire(path.join(repo,'package.json'));
await fs.mkdir(out,{recursive:true});
const image=await sharp({create:{width:160,height:120,channels:3,background:'#8fbac8'}}).png().toBuffer();
const owner='focus-owner@fixture.test',other='focus-other@fixture.test';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';
import{CachedImage}from'@/components/cached-image';import*as cache from'@/lib/browser-image-cache';
const root=createRoot(document.getElementById('app'));
window.fixture={...cache,render:(sources)=>root.render(React.createElement('div',null,sources.map((source,index)=>React.createElement(CachedImage,{key:index,src:source,loading:'lazy',style:{width:160,height:120}})))),focus:()=>window.dispatchEvent(new Event('focus'))};`;
const bundle=await build({stdin:{contents:entry,resolveDir:repo,loader:'tsx'},absWorkingDir:repo,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"'},plugins:[{name:'fixture-imports',setup(b){
  b.onResolve({filter:/^@\//},a=>({path:path.join(root,'src',a.path.slice(2))+(/cached-image$/.test(a.path)?'.tsx':'.ts')}));
  b.onResolve({filter:/^\.\/supabase$/},()=>({path:'auth-stub',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function authHeader(){return {}}',loader:'js'}));
  b.onResolve({filter:/^\.\/(canvas\/media-loading|browser-image-source)$/},a=>({path:path.join(repo,'src/lib',a.path.slice(2)+'.ts')}));
  b.onResolve({filter:/^(react(?:\/|$)|react-dom(?:\/|$))/},a=>({path:req.resolve(a.path)}));
}}]});
let state,metrics;
function reset(){state={account:owner,status:200,deny:new Set(),delay:0,malformed:false,oversized:false};metrics={manifests:0,images:0,batches:[]};}
reset();
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://fixture.test');
  if(url.pathname==='/fixture.js'){response.setHeader('content-type','text/javascript');response.end(bundle.outputFiles[0].contents);return;}
  if(url.pathname==='/api/media/image-cache'||url.pathname==='/api/public-image-cache'){
   let body='';for await(const chunk of request)body+=chunk;
   const sources=JSON.parse(body).sources;metrics.manifests++;metrics.batches.push({count:sources.length,bytes:Buffer.byteLength(body)});
   const snapshot={...state,deny:new Set(state.deny)};
   if(snapshot.delay)await new Promise(r=>setTimeout(r,snapshot.delay));
   response.statusCode=snapshot.status;response.setHeader('content-type','application/json');
   const account=url.pathname==='/api/public-image-cache'?'public':snapshot.account;
   response.end(JSON.stringify(snapshot.malformed?{}:{account,results:Object.fromEntries(sources.map(source=>[source,snapshot.deny.has(source)?null:{account,source,version:'fixture-v1',fetchUrl:source,bytes:snapshot.oversized?256*1024*1024:image.length,contentType:'image/png'}]))}));return;
  }
  if(url.pathname.startsWith('/media/')){metrics.images++;response.setHeader('content-type','image/png');response.end(image);return;}
  response.setHeader('content-type','text/html');response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Image focus fixture</title><style>body{background:#f7f9fc}img{display:inline-block;margin:8px}</style></head><body><div id="app"></div><script>
  window.blankChanges=0;window.resets=0;window.revoked=0;
  const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked++;revoke(url)};
  window.addEventListener('naumi:image-cache-session',()=>window.resets++);
  new MutationObserver(records=>{for(const r of records)if(r.type==='attributes'&&r.attributeName==='src'&&r.oldValue?.startsWith('blob:')&&r.target.getAttribute('src')!==r.oldValue)window.blankChanges++}).observe(document.getElementById('app'),{subtree:true,attributes:true,attributeOldValue:true});
  </script><script src="/fixture.js"></script></body></html>`);
 }catch(error){response.statusCode=500;response.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
await fs.writeFile(path.join(out,mode+'-fixture-url.txt'),base);
console.log('FIXTURE_URL='+base);
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1000,height:700}}),page=await context.newPage();
const errors=[];context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
const checks=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function load(sources=['/media/one.png','/media/two.png']){
 await page.setViewportSize(sources.length>20?{width:1600,height:1500}:{width:1000,height:700});
 reset();await page.goto(base);await page.waitForFunction(()=>!!window.fixture,{},{timeout:10000});await page.evaluate(({owner,sources})=>{window.fixture.activateBrowserImages(owner);window.fixture.render(sources);},{owner,sources});
 await page.waitForFunction(count=>[...document.images].filter(img=>img.complete&&img.naturalWidth>0&&img.src.startsWith('blob:')).length===count,sources.length);
 await page.evaluate(()=>{window.blankChanges=0;window.resets=0;window.revoked=0;});
}
async function focus(){await page.evaluate(()=>window.fixture.focus());}
async function settled(){await sleep(120);}
async function stats(){return page.evaluate(()=>({blanks:window.blankChanges,resets:window.resets,revoked:window.revoked,srcs:[...document.images].map(i=>i.getAttribute('src'))}));}
async function waitManifest(before){for(let i=0;i<100&&metrics.manifests===before;i++)await sleep(10);assert.ok(metrics.manifests>before);}
try{
 await load();const initial=await stats(),initialImages=metrics.images;
 for(let i=0;i<5;i++){await focus();await settled();}
 const focused=await stats();
 if(mode==='baseline'){
  assert.ok(focused.blanks>0&&focused.resets>0&&focused.revoked>0);checks.push('FOCUS_BUG_REPRODUCED');
  await fs.writeFile(path.join(out,'baseline.json'),JSON.stringify({mode,focused,initialImages,metrics,errors},null,2));
  console.log(`BASELINE=REPRODUCED FOCUS=5 BLANK_TRANSITIONS=${focused.blanks} RESETS=${focused.resets} REVOKED=${focused.revoked} PROVIDER_CALLS=0`);
 }else{
  assert.deepEqual(focused.srcs,initial.srcs);assert.equal(focused.blanks,0);assert.equal(focused.resets,0);assert.equal(focused.revoked,0);assert.equal(metrics.images,initialImages);checks.push('FOCUS_5_NO_BLANK_NO_IMAGE_DOWNLOAD');
  // Native lazy observation must not reset decoded images on temporary hide.
  await page.evaluate(()=>document.getElementById('app').style.display='none');await sleep(100);
  await page.evaluate(()=>document.getElementById('app').style.display='');await settled();assert.deepEqual((await stats()).srcs,initial.srcs);assert.equal((await stats()).blanks,0);checks.push('HIDE_SHOW_PRESERVES_URL');
  // Coalesce focus storms, and keep pixels until authorization actually answers.
  state.delay=300;const before=metrics.manifests;await page.evaluate(()=>{for(let i=0;i<30;i++)window.fixture.focus();});await waitManifest(before);await sleep(50);assert.deepEqual((await stats()).srcs,initial.srcs);await sleep(400);assert.equal(metrics.manifests,before+1);state.delay=0;checks.push('FOCUS_STORM_COALESCED');
  for(const status of [429,503]){state.status=status;await focus();await settled();assert.deepEqual((await stats()).srcs,initial.srcs);}state.status=200;
  state.malformed=true;await focus();await settled();assert.deepEqual((await stats()).srcs,initial.srcs);state.malformed=false;
  await page.route('**/api/media/image-cache',route=>route.abort('internetdisconnected'));await focus();await settled();assert.deepEqual((await stats()).srcs,initial.srcs);await page.unroute('**/api/media/image-cache');checks.push('OFFLINE_429_503_MALFORMED_PRESERVE');
  await page.route('**/api/media/image-cache',async route=>{await sleep(15200);try{await route.fulfill({status:503,body:'{}'});}catch{}});await focus();await sleep(15500);assert.deepEqual((await stats()).srcs,initial.srcs);await page.unroute('**/api/media/image-cache');checks.push('REAL_15S_TIMEOUT_PRESERVES');
  // Per-resource revoke must not disturb another already displayed resource.
  state.deny.add('/media/one.png');await focus();await page.waitForFunction(()=>!document.images[0].getAttribute('src'));
  assert.equal((await stats()).srcs[1],initial.srcs[1]);checks.push('RESOURCE_REVOKE_TARGETED');
  for(const status of [401,403]){await load();state.status=status;await focus();await page.waitForFunction(()=>[...document.images].every(i=>!i.getAttribute('src')));assert.equal(await page.evaluate(()=>window.fixture.imageCacheAccount()),'');checks.push('AUTH_'+status+'_CLEARED');}
  await load();state.account=other;await focus();await page.waitForFunction(()=>[...document.images].every(i=>!i.getAttribute('src')));checks.push('IDENTITY_MISMATCH_CLEARED');
  await load();await page.evaluate(other=>window.fixture.activateBrowserImages(other),other);assert.equal(await page.evaluate(()=>window.revoked),2);checks.push('ACCOUNT_SWITCH_SYNCHRONOUS_REVOKE');
  // An old account's delayed denial must not clear a new verified account.
  await load();state.status=401;state.delay=350;const oldCheck=metrics.manifests;await focus();await waitManifest(oldCheck);
  state.status=200;state.delay=0;state.account=other;
  await page.evaluate(other=>{window.fixture.activateBrowserImages(other);window.fixture.render(['/media/three.png']);},other);
  await page.waitForFunction(()=>document.images.length===1&&document.images[0].src.startsWith('blob:')&&document.images[0].naturalWidth>0);const switched=(await stats()).srcs[0];await sleep(450);assert.equal((await stats()).srcs[0],switched);assert.equal(await page.evaluate(()=>window.fixture.imageCacheAccount()),other);checks.push('STALE_DENIAL_CANNOT_CLEAR_NEW_ACCOUNT');
  // Actual same-origin BroadcastChannel, then storage fallback with BC disabled.
  await load();const second=await context.newPage();await second.goto(base);await second.evaluate(owner=>window.fixture.activateBrowserImages(owner),owner);await second.evaluate(()=>window.fixture.clearBrowserImages());await page.waitForFunction(()=>[...document.images].every(i=>!i.getAttribute('src')));await second.close();checks.push('CROSS_TAB_LOGOUT_CLEARED');
  await page.addInitScript(()=>{window.BroadcastChannel=class{constructor(){throw new Error('fixture disabled')}};});
  await load();const storageTab=await context.newPage();await storageTab.goto(base);await storageTab.evaluate(owner=>{window.fixture.activateBrowserImages(owner);window.fixture.clearBrowserImages();},owner);await page.waitForFunction(()=>[...document.images].every(i=>!i.getAttribute('src')));await storageTab.close();checks.push('STORAGE_LOGOUT_CLEARED');
  // 70 distinct resources must retain existing 64-entry request bounds.
  await load(Array.from({length:70},(_,i)=>'/media/batch-'+i+'.png'));const batchesBefore=metrics.batches.length;await focus();await settled();assert.equal(metrics.batches.length,batchesBefore+2);assert.ok(metrics.batches.every(b=>b.count<=64&&b.bytes<=12000));assert.equal((await stats()).blanks,0);checks.push('BATCH_70_BOUNDED_NO_BLANK');
  await page.evaluate(()=>window.fixture.render([]));await page.waitForFunction(()=>document.images.length===0);const unmounted=metrics.manifests;await focus();await settled();assert.equal(metrics.manifests,unmounted);checks.push('UNMOUNT_RELEASES_NO_FOCUS_REQUEST');
  // Byte-sized batch bound, not just entry count.
  const longSources=Array.from({length:9},(_,i)=>'/media/'+('x'.repeat(1800))+i+'.png');await load(longSources);const longBefore=metrics.batches.length;await focus();await settled();assert.equal(metrics.batches.length,longBefore+2);assert.ok(metrics.batches.every(b=>b.count<=64&&b.bytes<=12000));checks.push('LONG_SOURCE_BATCH_BYTES_BOUNDED');
  // Native oversized images have no Blob, but are still tracked for revocation.
  await load();await page.evaluate(()=>window.fixture.render([]));await page.waitForFunction(()=>document.images.length===0);state.oversized=true;await page.evaluate(()=>window.fixture.render(['/media/oversized.png']));await page.waitForFunction(()=>document.images[0]?.naturalWidth>0&&document.images[0]?.src.includes('/media/oversized.png'));const largeSrc=(await stats()).srcs[0];await focus();await settled();assert.equal((await stats()).srcs[0],largeSrc);state.deny.add('/media/oversized.png');await focus();await page.waitForFunction(()=>!document.images[0].getAttribute('src'));checks.push('OVERSIZED_NATIVE_KEEP_AND_REVOKE');
  // Never load unseen lazy nodes; source changes never retain another source.
  await load();const beforeUnseen=metrics.images;await page.evaluate(()=>{window.fixture.render([]);const spacer=document.createElement('div');spacer.id='spacer';spacer.style.height='3000px';document.body.insertBefore(spacer,document.getElementById('app'));});await page.waitForFunction(()=>document.images.length===0);await page.evaluate(()=>window.fixture.render(['/media/unseen.png']));await settled();assert.equal(metrics.images,beforeUnseen);await page.evaluate(()=>document.getElementById('spacer').remove());await page.waitForFunction(()=>document.images[0]?.src.startsWith('blob:')&&document.images[0]?.naturalWidth>0);checks.push('UNSEEN_LAZY_NOT_DOWNLOADED');
  await load(['/media/templates/public.png']);const publicSrc=(await stats()).srcs[0],publicBefore=metrics.images;await focus();await settled();assert.equal((await stats()).srcs[0],publicSrc);assert.equal(metrics.images,publicBefore);checks.push('PUBLIC_PICTURE_PRESERVED');
  await load(['/media/change-a.png']);const sourceA=(await stats()).srcs[0];await page.evaluate(()=>window.fixture.render(['/media/change-b.png']));await page.waitForFunction(sourceA=>document.images[0]?.src.startsWith('blob:')&&document.images[0]?.getAttribute('src')!==sourceA&&document.images[0]?.naturalWidth>0,sourceA);assert.equal(metrics.images,2);checks.push('MOUNTED_SOURCE_CHANGE_RELEASES_OLD');
  await load();await page.evaluate(()=>window.fixture.clearBrowserImages());await page.waitForFunction(()=>[...document.images].every(i=>!i.getAttribute('src')));checks.push('EXPLICIT_LOGOUT_CLEARED');
  assert.deepEqual(errors,[]);
  const result={mode,checks,react:req('react/package.json').version,errors,supplierCalls:0,serverMutation:false};await fs.writeFile(path.join(out,'modified.json'),JSON.stringify(result,null,2));
  console.log(`MODIFIED=PASS CHECKS=${checks.length} FOCUS_BLANKS=0 IMAGE_DOWNLOADS_ON_FOCUS=0 AUTH_REVOKE=CLEARED CROSS_TAB=CLEARED STALE_RESPONSE=IGNORED PAGEERRORS=0 PROVIDER_CALLS=0`);
 }
}catch(error){console.error('FIXTURE_PAGE_ERRORS='+JSON.stringify(errors));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
