// Real bundled image cache + React component + Chromium. Only auth and local
// media HTTP are fixtures; product 60s/20s clocks are accelerated explicitly.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),sharp=require('sharp'),{chromium}=require('@playwright/test');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const sourceRoot=path.resolve(arg('--source-root',path.join(__dirname,'..'))),out=path.resolve(arg('--output-root','output/browser-read-deadlines-20261103/image-tests'));
const baseline=args.includes('--baseline'),selection=arg('--case',''),dependencies=path.resolve(__dirname,'../node_modules'),checks=[],loaded=[],pageErrors=[],external=[];
const owner='image-deadline@fixture.test',cases=new Map();let browser,server;
fs.mkdirSync(out,{recursive:true});const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {CachedImage} from '@/components/cached-image';import * as images from '@/lib/browser-image-cache';
 const root=createRoot(document.getElementById('root'));window.fixture={images,render:(src,identity)=>root.render(src?<CachedImage src={src} imageIdentity={identity} networkQueue="canvas" width="64" height="48" onLoad={()=>window.loaded++} onCacheSettled={()=>window.settled++}/>:null)};window.loaded=0;window.settled=0;window.fixtureReady=true;`;
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:sourceRoot,sourcefile:'image-deadline-fixture.tsx'},outfile:path.join(out,'bundle.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',metafile:true,nodePaths:[dependencies],alias:{'@':path.join(sourceRoot,'src'),react:path.join(dependencies,'react'),'react-dom':path.join(dependencies,'react-dom')},define:{'process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"'},plugins:[{name:'explicit-auth-fixture',setup(build){build.onResolve({filter:/(^|\/)supabase$/},a=>({path:a.path,namespace:'auth-fixture'}));build.onLoad({filter:/.*/,namespace:'auth-fixture'},()=>({contents:'export async function authHeader(){if(window.authHold)await window.authHold;return {"x-fixture-case":window.caseId};}',loader:'js'}));}}]});
 for(const input of Object.keys(bundle.metafile.inputs)){const absolute=path.resolve(input);if(input.includes('src/')&&!absolute.includes(`${path.sep}node_modules${path.sep}`)&&fs.existsSync(absolute))loaded.push({file:absolute,sha256:hash(fs.readFileSync(absolute))});}
 const png=await sharp({create:{width:32,height:24,channels:3,background:'#4b716c'}}).png().toBuffer();
 server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(out,'bundle.js')));}
  if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
  const c=cases.get(req.headers['x-fixture-case']);if(!c){res.statusCode=404;return res.end();}
  if(req.url==='/api/media/image-cache'){
   c.manifests++;let raw='';for await(const part of req)raw+=part;
   if(c.manifest!=='ok'){res.writeHead(c.manifest==='denied'?403:503,{'content-type':'application/json'});return res.end('{}');}
   const sources=JSON.parse(raw).sources;res.setHeader('content-type','application/json');return res.end(JSON.stringify({account:owner,results:Object.fromEntries(sources.map(source=>[source,{account:owner,source,version:c.version||'local:fixture',bytes:png.length,contentType:'image/png',fetchUrl:source}]))}));
  }
  if(req.url.startsWith('/media/')||req.url.startsWith('/native/')){
   c.media++;c.paths.push(req.url);req.on('close',()=>c.closed++);
   if(req.url.includes('hang-header'))return;
   if(req.url.includes('hang-body')){res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});res.write(png.subarray(0,10));return;}
   if(c.delay)await new Promise(r=>setTimeout(r,c.delay));
   res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});return res.end(png);
  }
  res.statusCode=404;res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
 async function fixture(manifest='error'){
  const id=crypto.randomUUID(),c={manifest,manifests:0,media:0,closed:0,paths:[]};cases.set(id,c);
  const context=await browser.newContext({extraHTTPHeaders:{'x-fixture-case':id}}),page=await context.newPage();
  await context.addInitScript(({id})=>{window.caseId=id;window.timerCalls=[];window.leaseURLs=[];window.revokedURLs=[];const timeout=window.setTimeout.bind(window),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),decode=HTMLImageElement.prototype.decode;
   window.setTimeout=(fn,ms,...xs)=>{window.timerCalls.push(ms);return timeout(fn,ms===60000?450:ms===20000?180:ms===15000?120:ms,...xs);};
   URL.createObjectURL=blob=>{const u=create(blob);window.leaseURLs.push(u);return u;};URL.revokeObjectURL=u=>{window.revokedURLs.push(u);return revoke(u);};
   HTMLImageElement.prototype.decode=function(){if(window.decodeHold)return new Promise(()=>{});return decode.call(this);};
  },{id});
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(origin);await page.waitForFunction(()=>window.fixtureReady);await page.evaluate(owner=>window.fixture.images.activateBrowserImages(owner),owner);
  return {page,c,close:()=>context.close()};
 }
 async function check(name,defect,fn){if(selection&&name!==selection)return;try{const evidence=await fn();checks.push({name,defect,pass:true,evidence});}catch(e){checks.push({name,defect,pass:false,error:String(e)});}}
 await check('DESCRIPTOR_AUTH_HANG_ALL_WAITERS_SETTLE',true,async()=>{
  const f=await fixture('ok');try{
   const result=await f.page.evaluate(async()=>{let release;window.authHold=new Promise(r=>release=r);
    const tasks=Array.from({length:6},(_,i)=>window.fixture.images.acquireBrowserImage('/media/auth-descriptor-'+i+'.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name));
    const states=await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(()=>r('pending'),1000))]);release();window.authHold=null;await new Promise(r=>setTimeout(r,50));return{states,objects:window.leaseURLs.length};});
   assert.deepEqual(result.states,Array(6).fill('TimeoutError'));assert.equal(result.objects,0);assert.equal(f.c.manifests,0);assert.equal(f.c.media,0);return{...result,calls:f.c};
  }finally{await f.close();}
 });
 await check('DESCRIPTOR_BODY_IGNORED_ABORT_FALLS_BACK_ONCE',true,async()=>{
  const f=await fixture('ok');try{
   const result=await f.page.evaluate(async()=>{const real=window.fetch;const late=[];window.fetch=async(...args)=>{const r=await real(...args);if(!String(args[0]).includes('/api/media/image-cache'))return r;const data=await r.clone().json();return{status:r.status,ok:r.ok,body:r.body,json:()=>new Promise(resolve=>late.push(()=>resolve(data)))};};
    const tasks=Array.from({length:6},(_,i)=>window.fixture.images.acquireBrowserImage('/media/descriptor-body-'+i+'.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name));
    const states=await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(()=>r('pending'),900))]);const before=window.leaseURLs.length;late.forEach(f=>f());await new Promise(r=>setTimeout(r,80));return{states,before,lateObjects:window.leaseURLs.length-before};});
   assert.deepEqual(result.states,Array(6).fill('resolved'));assert.equal(result.before,6);assert.equal(result.lateObjects,0);assert.equal(f.c.manifests,1);assert.equal(f.c.media,6);return{...result,calls:f.c};
  }finally{await f.close();}
 });
 await check('NORMAL_AUTH_HANG_SHARED_PROMISE_EXITS_AND_RETRY_WORKS',true,async()=>{
  const f=await fixture('ok');try{
   const result=await f.page.evaluate(async()=>{let release,armed=true;const real=window.fetch;window.fetch=async(...args)=>{const r=await real(...args);if(armed&&String(args[0]).includes('/api/media/image-cache')){armed=false;window.authHold=new Promise(resolve=>release=resolve);}return r;};
    const tasks=Array.from({length:3},()=>window.fixture.images.cachedImageBlob('/media/normal-auth.png').then(()=> 'resolved',e=>e.name));const states=await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(()=>r('pending'),900))]);
    release?.();window.authHold=null;await new Promise(r=>setTimeout(r,50));const after=await window.fixture.images.cachedImageBlob('/media/normal-auth.png').then(blob=>blob.size>0?'fresh':'empty',e=>e.name);return{states,after};});
   assert.deepEqual(result.states,Array(3).fill('TimeoutError'));assert.equal(result.after,'fresh');assert.equal(f.c.media,1);return{...result,calls:f.c};
  }finally{await f.close();}
 });
 await check('NORMAL_BODY_IGNORED_ABORT_RELEASES_SHARED_FLIGHT',true,async()=>{
  const f=await fixture('ok');try{
   const result=await f.page.evaluate(async()=>{const real=window.fetch;let armed=true,cancelled=0;window.fetch=async(input,init)=>{if(armed&&String(input).includes('/media/normal-body.png'))return{status:200,ok:true,type:'basic',headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{cancelled++;}})}};return real(input,init);};
    const tasks=Array.from({length:3},()=>window.fixture.images.cachedImageBlob('/media/normal-body.png').then(()=> 'resolved',e=>e.name));const states=await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(()=>r('pending'),900))]);armed=false;
    const after=await Promise.race([window.fixture.images.cachedImageBlob('/media/normal-body.png').then(blob=>blob.size>0?'fresh':'empty',e=>e.name),new Promise(r=>setTimeout(()=>r('flight-stuck'),700))]);return{states,cancelled,after};});
   assert.deepEqual(result.states,Array(3).fill('TimeoutError'));assert.equal(result.after,'fresh');assert.equal(result.cancelled,1);assert.equal(f.c.media,1);return{...result,calls:f.c};
  }finally{await f.close();}
 });
 for(const kind of ['header','body'])await check('FALLBACK_'+kind.toUpperCase()+'_TIMEOUT_RELEASES_QUEUE',true,async()=>{
  const f=await fixture();try{
   const result=await f.page.evaluate(async kind=>{const jobs=Array.from({length:6},(_,i)=>window.fixture.images.acquireBrowserImage('/media/hang-'+kind+'-'+i+'.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name));
    const settled=await Promise.race([Promise.all(jobs),new Promise(r=>setTimeout(()=>r('pending'),1000))]);
    const after=await Promise.race([window.fixture.images.acquireBrowserImage('/media/fresh.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'fresh'},e=>e.name),new Promise(r=>setTimeout(()=>r('queue-stuck'),700))]);return{settled,after};},kind);
   assert.deepEqual(result.settled,Array(6).fill('TimeoutError'));assert.equal(result.after,'fresh');return {...result,calls:f.c};
  }finally{await f.close();}
 });
 await check('FALLBACK_IGNORED_ABORT_RELEASES_QUEUE_AND_LATE_BODY',true,async()=>{
  const f=await fixture();try{
   const result=await f.page.evaluate(async()=>{
    const real=window.fetch,late=[];let cancelled=0;
    window.fetch=(input,init)=>String(input).includes('/media/ignore-abort')?new Promise(resolve=>late.push(resolve)):real(input,init);
    const jobs=Array.from({length:6},(_,i)=>window.fixture.images.acquireBrowserImage('/media/ignore-abort-'+i+'.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name));
    const settled=await Promise.race([Promise.all(jobs),new Promise(r=>setTimeout(()=>r('pending'),1000))]);
    const fresh=await Promise.race([window.fixture.images.acquireBrowserImage('/media/queue-after-ignored.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'fresh'},e=>e.name),new Promise(r=>setTimeout(()=>r('queue-stuck'),700))]);
    const before=window.leaseURLs.length;
    late.forEach(resolve=>resolve(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'image/png'}})));
    await new Promise(r=>setTimeout(r,50));return{settled,fresh,cancelled,lateObjects:window.leaseURLs.length-before};
   });
   assert.deepEqual(result.settled,Array(6).fill('TimeoutError'));assert.equal(result.fresh,'fresh');assert.equal(result.cancelled,6);assert.equal(result.lateObjects,0);return{...result,calls:f.c};
  }finally{await f.close();}
 });
 await check('FALLBACK_AUTH_LATE_RESOLUTION_DOES_NOT_FETCH',true,async()=>{
  const f=await fixture();try{
   const r=await f.page.evaluate(async()=>{let resolve;let count=0;window.authHold=null;const realFetch=window.fetch;window.fetch=async(...args)=>{const r=await realFetch(...args);if(String(args[0]).includes('/api/media/image-cache'))window.authHold=new Promise(r=>resolve=r);return r;};
    const work=window.fixture.images.acquireBrowserImage('/media/late-auth.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name);
    const state=await Promise.race([work,new Promise(r=>setTimeout(()=>r('pending'),850))]);resolve?.();await new Promise(r=>setTimeout(r,80));return state;});
   assert.equal(r,'TimeoutError');assert.equal(f.c.media,0);return{state:r,calls:f.c};
  }finally{await f.close();}
 });
 await check('DECODE_TIMEOUT_SINGLE_READ_RECLAIMS_BLOB',true,async()=>{
  const f=await fixture('ok');try{
   const r=await f.page.evaluate(async()=>{window.decodeHold=true;window.fixture.render('/media/decode.png');await new Promise(r=>setTimeout(r,650));return{settled:window.settled,created:window.leaseURLs.length,revoked:window.revokedURLs.length,denied:document.querySelector('img')?.dataset.browserImageDenied};});
   assert.equal(r.settled,1);assert.equal(r.created,1);assert.equal(r.revoked,1);assert.equal(r.denied,'true');assert.equal(f.c.manifests,1);assert.equal(f.c.media,1);return{...r,calls:f.c};
  }finally{await f.close();}
 });
 await check('DECODE_TIMEOUT_PRESERVES_OWNED_PREVIOUS_FRAME',true,async()=>{
  const f=await fixture('ok');try{
   await f.page.evaluate(()=>window.fixture.render('/media/first.png','same-asset'));await f.page.waitForFunction(()=>window.loaded===1);
   const r=await f.page.evaluate(async()=>{const before=document.querySelector('img').src;window.decodeHold=true;window.fixture.render('/media/next.png','same-asset');await new Promise(r=>setTimeout(r,650));return{same:document.querySelector('img').src===before,denied:document.querySelector('img').dataset.browserImageDenied,settled:window.settled,created:window.leaseURLs.length,revoked:window.revokedURLs.length};});
   assert.equal(r.same,true);assert.equal(r.denied,undefined);assert.equal(r.settled,2);assert.equal(r.created,2);assert.equal(r.revoked,1);return{...r,calls:f.c};
  }finally{await f.close();}
 });
 await check('SUCCESS_AUTHORIZATION_AND_RELEASE',false,async()=>{const f=await fixture('ok');try{await f.page.evaluate(()=>window.fixture.render('/media/success.png'));await f.page.waitForFunction(()=>window.loaded===1);const r=await f.page.evaluate(async()=>{window.fixture.render(null);await new Promise(r=>setTimeout(r,40));return{created:window.leaseURLs.length,revoked:window.revokedURLs.length};});assert.equal(r.created,1);assert.equal(r.revoked,1);return{...r,calls:f.c};}finally{await f.close();}});
 await check('DENIED_METADATA_NEVER_FALLS_BACK',false,async()=>{const f=await fixture('denied');try{const state=await f.page.evaluate(()=>window.fixture.images.acquireBrowserImage('/media/denied.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.constructor.name));assert.notEqual(state,'resolved');assert.equal(f.c.media,0);return{state,calls:f.c};}finally{await f.close();}});
 await check('CALLER_CANCEL_RELEASES_FALLBACK_WITHOUT_PUBLICATION',false,async()=>{const f=await fixture();try{
  const result=await f.page.evaluate(async()=>{const controller=new AbortController();const jobs=Array.from({length:6},(_,i)=>window.fixture.images.acquireBrowserImage('/media/hang-header-cancel-'+i+'.png',controller.signal,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name));setTimeout(()=>controller.abort(),90);const states=await Promise.all(jobs);const next=await window.fixture.images.acquireBrowserImage('/media/after-cancel.png',undefined,{networkQueue:'canvas'});next.release();return{states,created:window.leaseURLs.length};});
  assert(result.states.every(s=>s==='AbortError'));assert.equal(result.created,1);return{...result,calls:f.c};
 }finally{await f.close();}});
 await check('UPGRADE_DENIAL_REMOVES_PREVIOUS_FRAME',false,async()=>{const f=await fixture('ok');try{
  await f.page.evaluate(()=>window.fixture.render('/media/initial.png','same-asset'));await f.page.waitForFunction(()=>window.loaded===1);f.c.manifest='denied';
  const result=await f.page.evaluate(async()=>{window.fixture.render('/media/denied-upgrade.png','same-asset');await new Promise(r=>setTimeout(r,120));return{src:document.querySelector('img')?.getAttribute('src'),revoked:window.revokedURLs.length};});
  assert.ok(!result.src||!result.src.startsWith('blob:'));assert.equal(result.revoked,1);assert.equal(f.c.media,1);return{...result,calls:f.c};
 }finally{await f.close();}});
 await check('OWNER_RESET_CLEARS_PREVIOUS_FRAME',false,async()=>{const f=await fixture('ok');try{await f.page.evaluate(()=>window.fixture.render('/media/owner.png','same-asset'));await f.page.waitForFunction(()=>window.loaded===1);const result=await f.page.evaluate(async()=>{window.decodeHold=true;window.fixture.render('/media/next-owner.png','same-asset');await new Promise(r=>setTimeout(r,60));window.fixture.images.activateBrowserImages('other@fixture.test');await new Promise(r=>setTimeout(r,400));return document.querySelector('img')?.getAttribute('src');});assert.ok(!result||!result.startsWith('blob:'));return{result,calls:f.c};}finally{await f.close();}});
 await check('ONE_CONSUMER_CANCEL_KEEPS_SHARED_TRANSFER_FOR_OTHER',false,async()=>{const f=await fixture('ok');try{
  const result=await f.page.evaluate(async()=>{const real=window.fetch;window.fetch=async(input,init)=>{if(String(input).includes('/media/shared-cancel.png'))await new Promise(r=>setTimeout(r,120));return real(input,init);};const abort=new AbortController();
   const one=window.fixture.images.acquireBrowserImage('/media/shared-cancel.png',abort.signal,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name);const two=window.fixture.images.acquireBrowserImage('/media/shared-cancel.png',undefined,{networkQueue:'canvas'}).then(x=>{x.release();return'resolved'},e=>e.name);setTimeout(()=>abort.abort(),60);return Promise.all([one,two]);});
  assert.notEqual(result[0],'resolved');assert.equal(result[1],'resolved');assert.equal(f.c.media,1);return{result,calls:f.c};
 }finally{await f.close();}});
 await check('SAME_SHA_DIFFERENT_SOURCES_CANCEL_A_PERSIST_B_RELOAD',false,async()=>{const f=await fixture('ok');try{
  f.c.version=hash(png);f.c.delay=160;
  const a='/media/shared-sha-a.png',b='/media/shared-sha-b.png';
  const result=await f.page.evaluate(async({a,b})=>{const stop=new AbortController();const first=window.fixture.images.acquireBrowserImage(a,stop.signal,{networkQueue:'canvas'}).then(lease=>{lease.release();return'resolved'},e=>e.name);const second=window.fixture.images.acquireBrowserImage(b,undefined,{networkQueue:'canvas'}).then(lease=>{lease.release();return'resolved'},e=>e.name);setTimeout(()=>stop.abort(),70);return Promise.all([first,second]);},{a,b});
  assert.notEqual(result[0],'resolved');assert.equal(result[1],'resolved');assert.equal(f.c.media,1);
  const durable=await f.page.evaluate(async({owner,source,version})=>{
   const deadline=Date.now()+2000;
   while(Date.now()<deadline){
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('naumi-image-bytes-v1',2);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    try{const result=await new Promise((resolve,reject)=>{const tx=db.transaction(['images','metadata'],'readonly'),id=JSON.stringify([owner,source,version]);const image=tx.objectStore('images').get(id),meta=tx.objectStore('metadata').get(id),all=tx.objectStore('metadata').getAll();tx.oncomplete=()=>resolve({committed:!!image.result?.blob&&meta.result?.bytes===image.result.blob.size,metadata:all.result.map(r=>({source:r.source,version:r.version,bytes:r.bytes})),id});tx.onabort=tx.onerror=()=>reject(tx.error);});if(result.committed)return result;}finally{db.close();}
    await new Promise(r=>setTimeout(r,20));
   }throw Error('B durable transaction not observed');
  },{owner,source:b,version:f.c.version});
  const before=f.c.media,rounds=[];
  for(let round=0;round<2;round++){
   await f.page.reload();await f.page.waitForFunction(()=>window.fixtureReady);await f.page.evaluate(owner=>window.fixture.images.activateBrowserImages(owner),owner);
   const snapshot=await f.page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('naumi-image-bytes-v1',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readonly'),r=tx.objectStore('metadata').getAll();tx.oncomplete=()=>resolve(r.result.map(x=>({source:x.source,version:x.version,bytes:x.bytes})));tx.onerror=()=>reject(tx.error);});}finally{db.close();}});
   await f.page.evaluate(b=>window.fixture.render(b),b);await f.page.waitForFunction(()=>window.loaded===1);
   rounds.push({round,snapshot,media:f.c.media});assert.equal(f.c.media,before,'B reload must use persisted bytes');
  }
  return{result,durable,rounds,calls:f.c,clock:'real Date/IDB/HTTP; only product15s60s20s deadlines accelerated',extraMedia:f.c.media-before};
 }finally{await f.close();}});
 assert(checks.length>0,'selected case exists');
 assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);assert(loaded.every(x=>hash(fs.readFileSync(x.file))===x.sha256),'source unchanged');
 const failures=checks.filter(c=>!c.pass),defects=failures.filter(c=>c.defect),controls=failures.filter(c=>!c.defect);
 const status=baseline?(defects.length===10&&!controls.length?'REPRODUCED':'INVALID_BASELINE'):failures.length?'FAIL':'PASS',exit=status==='PASS'?0:status==='REPRODUCED'?1:2;
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status,sourceRoot,checks,loaded,clockScale:{60000:450,20000:180,15000:120},pageErrors,external,supplierCalls:0,exit},null,2));
 console.log(`BROWSER_IMAGE_DEADLINE=${status} CHECKS=${checks.length} DEFECTS=${defects.length} CONTROL_FAILURES=${controls.length} REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=${exit}`);process.exitCode=exit;
}
main().catch(e=>{console.error(e);process.exitCode=2}).finally(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
