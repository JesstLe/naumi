import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

// Real CachedImage against an isolated loopback fixture: synthetic manifest
// endpoints that can fail transiently, deny individually, or recover; a real
// browser decodes and displays. Never connects to production or a supplier.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.argv[2]||repo);
const out=path.resolve(process.argv[3]||path.join(repo,'output/agent-image-resilience'));
const req=createRequire(path.join(repo,'package.json'));
await fs.mkdir(out,{recursive:true});
const image=await sharp({create:{width:160,height:120,channels:3,background:'#8fbac8'}}).png().toBuffer();
const owner='resilience-owner@fixture.test';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';
import{CachedImage}from'@/components/cached-image';import*as cache from'@/lib/browser-image-cache';
const root=createRoot(document.getElementById('app'));
window.fixture={...cache,render:(sources)=>root.render(React.createElement('div',null,sources.map((source,index)=>React.createElement(CachedImage,{key:index,src:source,loading:'lazy',style:{width:160,height:120}})))),sessionReset:()=>window.dispatchEvent(new Event('naumi:image-cache-session'))};`;
const bundle=await build({stdin:{contents:entry,resolveDir:repo,loader:'tsx'},absWorkingDir:repo,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"'},plugins:[{name:'fixture-imports',setup(b){
  b.onResolve({filter:/^@\//},a=>({path:path.join(root,'src',a.path.slice(2))+(/cached-image$/.test(a.path)?'.tsx':'.ts')}));
  b.onResolve({filter:/^\.\/supabase$/},()=>({path:'auth-stub',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function authHeader(){return {}}',loader:'js'}));
  b.onResolve({filter:/^\.\/(canvas\/media-loading|browser-image-source)$/},a=>({path:path.join(repo,'src/lib',a.path.slice(2)+'.ts')}));
  b.onResolve({filter:/^(react(?:\/|$)|react-dom(?:\/|$))/},a=>({path:req.resolve(a.path)}));
}}]});
let state,metrics;
function reset(){state={account:owner,status:200,fail:0,mediaFail:0,deny:new Set(),delay:0};metrics={manifests:0,images:0};}
reset();
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://fixture.test');
  if(url.pathname==='/fixture.js'){response.setHeader('content-type','text/javascript');response.end(bundle.outputFiles[0].contents);return;}
  if(url.pathname==='/api/media/image-cache'){
   let body='';for await(const chunk of request)body+=chunk;
   const sources=JSON.parse(body).sources;metrics.manifests++;
   const snapshot={...state,deny:new Set(state.deny)};
   if(snapshot.delay)await new Promise(r=>setTimeout(r,snapshot.delay));
   if(snapshot.fail>0){state.fail--;response.statusCode=503;response.setHeader('content-type','application/json');response.end(JSON.stringify({error:'fixture transient'}));return;}
   response.setHeader('content-type','application/json');
   response.end(JSON.stringify({account:snapshot.account,results:Object.fromEntries(sources.map(source=>[source,snapshot.deny.has(source)?null:{account:snapshot.account,source,version:'fixture-v1',fetchUrl:source,bytes:image.length,contentType:'image/png'}]))}));return;
  }
  if(url.pathname.startsWith('/media/')){metrics.images++;if(state.mediaFail>0){state.mediaFail--;response.statusCode=503;response.setHeader('content-type','text/plain');response.end('fixture media outage');return;}response.setHeader('content-type','image/png');response.end(image);return;}
  response.setHeader('content-type','text/html');response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Agent image resilience fixture</title></head><body><div id="app"></div><script>
  window.deniedSeen=0;window.descriptorFetches=0;window.trace=[];
  const t0=performance.now();
  const of=window.fetch;window.fetch=(...a)=>{const u=String(a[0]);if(u.includes('image-cache')){window.descriptorFetches++;window.trace.push('fetch@'+Math.round(performance.now()-t0));}return of(...a)};
  new MutationObserver(()=>{for(const img of document.images){if(img.getAttribute('data-browser-image-denied')==='true')window.deniedSeen++;window.trace.push('attr:'+img.getAttribute('src')?.slice(0,24)+'@'+Math.round(performance.now()-t0));}}).observe(document.getElementById('app'),{subtree:true,attributes:true,childList:true});
  </script><script src="/fixture.js"></script></body></html>`);
 }catch(error){response.statusCode=500;response.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
console.log('FIXTURE_URL='+base);
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1000,height:700}}),page=await context.newPage();
const errors=[];context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
const checks=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function load(sources=['/media/one.png']){
 reset();await page.goto(base);await page.waitForFunction(()=>!!window.fixture,{},{timeout:10000});
 await page.evaluate(({owner,sources})=>{window.fixture.activateBrowserImages(owner);window.fixture.render(sources);},{owner,sources});
 await page.waitForFunction(count=>[...document.images].filter(img=>img.complete&&img.naturalWidth>0&&img.src.startsWith('blob:')).length===count,sources.length,{timeout:15000});
 await page.evaluate(()=>{window.deniedSeen=0;});
}
async function imgState(){return page.evaluate(()=>{const img=document.images[0];return{src:img?img.getAttribute('src'):null,denied:img?img.getAttribute('data-browser-image-denied'):null,naturalWidth:img?img.naturalWidth:0};});}
async function waitBlank(){await page.waitForFunction(()=>{const img=document.images[0];return img&&(!img.getAttribute('src')||img.getAttribute('src')==='');},{}, {timeout:5000});}
async function waitDisplayed(){await page.waitForFunction(()=>{const img=document.images[0];return img&&img.complete&&img.naturalWidth>0&&img.src.startsWith('blob:');},{},{timeout:15000});}
async function waitDenied(){await page.waitForFunction(()=>{const img=document.images[0];return img&&img.getAttribute('data-browser-image-denied')==='true';},{},{timeout:5000});}
try{
 // t1 A descriptor outage after a session reset recovers through the direct
 // authenticated-media fallback (fast), never painting a broken icon.
 await load();
 state.fail=1;
 await page.evaluate(()=>window.fixture.sessionReset());
 await waitDisplayed();
 const mid=await imgState();
 assert.notEqual(mid.denied,'true','descriptor outage must not mark the source denied');
 assert.equal(await page.evaluate(()=>window.deniedSeen),0);
 checks.push('DESCRIPTOR_OUTAGE_FALLS_BACK_AND_RECOVERS');

 // t2 Descriptor and direct media both failing exhausts the bounded retry
 // budget and leaves a blank frame; a later session event grants a fresh one.
 await load();
 state.fail=99;state.mediaFail=3;
 await page.evaluate(()=>window.fixture.sessionReset());
 await waitBlank();
 await sleep(6400);
 const exhausted=await imgState();
 assert.notEqual(exhausted.denied,'true','exhausted retries must not paint a broken icon');
 assert.equal(!!exhausted.src,false,`exhausted retries stay blank, not broken (state=${JSON.stringify(exhausted)} manifests=${metrics.manifests})`);
 state.fail=0;state.mediaFail=0;
 await page.evaluate(()=>window.fixture.sessionReset());
 await waitDisplayed();
 checks.push('RETRY_BUDGET_BOUNDED_THEN_SESSION_REPAIRS');

 // t3 A genuine per-source denial still paints the denied state (semantic kept).
 await load();
 state.deny.add('/media/one.png');
 await page.evaluate(()=>window.fixture.sessionReset());
 await waitDenied();
 const deniedState=await imgState();
 assert.equal(deniedState.denied,'true');
 assert.ok(!deniedState.src||deniedState.src.startsWith('data:image/png;base64,invalid'),'denied frame paints the invalid icon before onError strips it');
 checks.push('GENUINE_DENIAL_STILL_DENIED');

 // t4 Denial stays session-scoped: restoring authorization repairs the frame.
 state.deny.delete('/media/one.png');
 await page.evaluate(()=>window.fixture.sessionReset());
 await waitDisplayed();
 assert.equal(await page.evaluate(()=>window.deniedSeen)>0,true,'denied state was observed earlier in t3');
 checks.push('DENIAL_SESSION_SCOPED_RECOVERS');

 // t5 Focus revalidation (the 2026-10-16 fix) still preserves displayed frames.
 await load();
 const initial=await imgState(),imagesBefore=metrics.images;
 for(let i=0;i<5;i++){await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(120);}
 const after=await imgState();
 assert.equal(after.src,initial.src);
 assert.equal(after.denied,null);
 assert.equal(metrics.images,imagesBefore,'focus revalidation must not re-download displayed bytes');
 checks.push('FOCUS_REVALIDATION_STILL_PRESERVES');

 assert.deepEqual(errors,[]);
 const result={checks,react:req('react/package.json').version,errors,supplierCalls:0,serverMutation:false};
 await fs.writeFile(path.join(out,'modified.json'),JSON.stringify(result,null,2));
 console.log(`MODIFIED=PASS CHECKS=${checks.length} PAGEERRORS=0 PROVIDER_CALLS=0`);
}catch(error){console.error('FIXTURE_PAGE_ERRORS='+JSON.stringify(errors));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
