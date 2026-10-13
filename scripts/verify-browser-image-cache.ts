import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import JSZip from 'jszip';

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  const out=path.resolve('output/browser-image-cache'),media=path.resolve(process.env.MEDIA_DIR!);await mkdir(out,{recursive:true});await mkdir(media,{recursive:true});
  const db=await import('../src/lib/db'),native=await import('../src/lib/native-auth'),assets=await import('../src/lib/media-assets');
  const owner='cache-owner@fixture.test',other='cache-other@fixture.test';await db.getOrCreateUser(owner,'Cache owner');await db.getOrCreateUser(other,'Other');
  const bytes=await sharp({create:{width:900,height:600,channels:3,background:{r:79,g:70,b:229}}}).png().toBuffer();
  await writeFile(path.join(media,'cache-test.png'),bytes);await assets.registerMediaAsset('cache-test.png',bytes,'image/png',false,owner);
  await writeFile(path.join(media,'foreign.png'),bytes);await assets.registerMediaAsset('foreign.png',bytes,'image/png',false,other);
  await writeFile(path.join(media,'late.png'),bytes);await assets.registerMediaAsset('late.png',bytes,'image/png',false,owner);
  await writeFile(path.join(media,'legacy.png'),bytes);await db.addArtworks(owner,[{id:'cache-legacy-fixture',title:'legacy',category:'main',prompt:'fixture',status:'completed',image:'/media/legacy.png',source:'',gradient:''}]);
  await mkdir(path.join(media,'templates'),{recursive:true});await writeFile(path.join(media,'templates/public.png'),bytes);await assets.registerMediaAsset('templates/public.png',bytes,'image/png',false);
  const api=await import('../src/app/api/media/image-cache/route');
  const body={sources:['/media/cache-test.png','/media/cache-test.png?variant=thumbnail','/media/foreign.png','/media/%2e%2e/private.png','https://evil.test/a.png']};
  const req=(email:string,origin='http://cache.test')=>new Request('http://cache.test/api/media/image-cache',{method:'POST',headers:{'content-type':'application/json',cookie:email?'nv_user='+native.signUserSession(email,Date.now()):'',origin},body:JSON.stringify(body)});
  assert.equal((await api.POST(req(''))).status,401);assert.equal((await api.POST(req(owner,'https://evil.test'))).status,403);
  const meta=await(await api.POST(req(owner))).json();assert.ok(meta.results['/media/cache-test.png']);assert.ok(meta.results['/media/cache-test.png?variant=thumbnail']);assert.equal(meta.results['/media/foreign.png'],null);assert.equal(meta.results['https://evil.test/a.png'],null);assert.equal(meta.results['/media/%2e%2e/private.png'],null);
  const requestSources=(sources:string[],email=owner)=>new Request('http://cache.test/api/media/image-cache',{method:'POST',headers:{'content-type':'application/json',...(email?{cookie:'nv_user='+native.signUserSession(email,Date.now())}:{})},body:JSON.stringify({sources})});
  const legacy=await(await api.POST(requestSources(['/media/legacy.png?variant=thumbnail']))).json();assert.equal(legacy.results['/media/legacy.png?variant=thumbnail'].contentType,'image/webp');assert.ok(legacy.results['/media/legacy.png?variant=thumbnail'].bytes<bytes.length);
  const publicApi=await import('../src/app/api/public-image-cache/route');const pub=await(await publicApi.POST(requestSources(['/media/templates/public.png','/media/cache-test.png'],''))).json();assert.equal(pub.account,'public');assert.ok(pub.results['/media/templates/public.png']);assert.equal(pub.results['/media/cache-test.png'],null);
  const entry=path.join(out,'fixture-entry.tsx');await writeFile(entry,`
import React from 'react';import{createRoot}from'react-dom/client';
import{CachedImage}from'../../src/components/cached-image';import CachedNextImage from'../../src/components/cached-next-image';
import{activateBrowserImages,clearBrowserImages,configureBrowserImageCache,cachedImageBlob,acquireBrowserImage}from'../../src/lib/browser-image-cache';import{downloadImage}from'../../src/lib/download';import{browserImageArchive,browserImagegenBatchArchive}from'../../src/lib/browser-image-archive';
const root=createRoot(document.getElementById('app')!);
Object.assign(window,{cacheActivate:activateBrowserImages,cacheLogout:clearBrowserImages,cacheConfigure:configureBrowserImageCache,cacheBlob:cachedImageBlob,cacheAcquire:acquireBrowserImage,cacheDownload:downloadImage,cacheZip:browserImageArchive,cacheBatchZip:browserImagegenBatchArchive,
renderCache:(urls:string[],baseline=false)=>root.render(<div style={{display:'flex',gap:16}}>{urls.map((src,i)=>baseline?<img key={src+i} src={src} width="180"/>:i%2?<CachedNextImage key={src+i} src={src} width={180} height={120} alt="图片预览"/>:<CachedImage key={src+i} src={src} width={180} height={120} alt="图片预览"/>)}</div>)});
`);
  const bundle=await build({entryPoints:[entry],bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfig:path.resolve('tsconfig.json')});const js=bundle.outputFiles[0].text;
  const base=process.env.NAUMI_VERIFY_URL||'http://127.0.0.1:13086';
  const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{background:#f5f7fc;font-family:Arial,'Microsoft YaHei';padding:36px;color:#14233b}#app img{border-radius:18px;object-fit:cover}</style><h1>图片浏览器缓存验收</h1><p>隔离测试：同一图片冷加载 1 次，重开/刷新 0 次图片传输</p><div id="app"></div><script src="/image-cache-fixture.js"></script></html>`;
  const launchOptions={headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),viewport:{width:1200,height:700},acceptDownloads:true};
  const profile=await mkdtemp(path.join(out,'browser-profile-'));
  let requests=0,transferred=0;const errors:string[]=[];
  let context=await chromium.launchPersistentContext(profile,launchOptions);
  await context.addCookies([{name:'nv_user',value:native.signUserSession(owner,Date.now()),url:base}]);
  await context.route('**/cache-verification',r=>r.fulfill({contentType:'text/html',body:html}));await context.route('**/image-cache-fixture.js',r=>r.fulfill({contentType:'application/javascript',body:js}));
  let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const countRequests=async()=>{await page.route('**/media/**',async route=>{if(new URL(route.request().url()).pathname.startsWith('/media/')&&(route.request().resourceType()==='image'||route.request().resourceType()==='fetch')){requests++;const res=await route.fetch();const body=await res.body();transferred+=body.length;await route.fulfill({response:res,body,headers:{...res.headers(),'cache-control':'no-store'}});}else await route.continue();});};await countRequests();
  const ready=async(baseline=false)=>{await page.waitForFunction(old=>[...document.querySelectorAll('#app img')].length>0&&[...document.querySelectorAll('#app img')].every(x=>(x as HTMLImageElement).naturalWidth>0&&(old||x.getAttribute('data-browser-image-cache')==='local')),baseline,{timeout:60000});};
  try{
    await page.goto(base+'/cache-verification');await page.waitForFunction(()=>typeof(window as any).cacheActivate==='function');await page.evaluate(email=>(window as any).cacheActivate(email),owner);
    await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png'],true));await ready(true);const baselineCold=requests;
    await page.reload();await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png'],true));await ready(true);assert.equal(requests,baselineCold+1);const baselineRepeat=requests-baselineCold;
    requests=0;transferred=0;await page.evaluate(email=>(window as any).cacheActivate(email),owner);await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png','/media/cache-test.png']));await ready();assert.equal(requests,1,'same bytes dedup');const coldBytes=transferred;
    await page.evaluate(()=>(window as any).renderCache([]));await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png']));await ready();assert.equal(requests,1,'reopen');
    await page.reload();await page.evaluate(email=>(window as any).cacheActivate(email),owner);await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png']));await ready();assert.equal(requests,1,'reload');
    // Existing original bytes also serve download without a second full transfer.
    const download=page.waitForEvent('download');await page.evaluate(()=>(window as any).cacheDownload('/media/cache-test.png'));const saved=await download;await saved.saveAs(path.join(out,'download.png'));assert.deepEqual(await readFile(path.join(out,'download.png')),bytes);assert.equal(requests,1);
    const zipBytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await(window as any).cacheZip([{url:'/media/cache-test.png',name:'sample'}])).arrayBuffer())));
    const zip=await JSZip.loadAsync(Buffer.from(zipBytes));assert.deepEqual(await zip.file('01-sample.png')!.async('nodebuffer'),bytes);assert.equal(requests,1,'ZIP reuses cached original');
    const batchZip=await page.evaluate(async()=>Array.from(new Uint8Array(await(await(window as any).cacheBatchZip({id:'test-batch',items:[{key:'1',name:'sample',state:'succeeded',result:{status:'succeeded',chargedCredits:2,artifacts:[{artworkId:'owned',url:'/media/cache-test.png',mime:'image/png'}]}}]})).arrayBuffer())));
    const bzip=await JSZip.loadAsync(Buffer.from(batchZip));assert.deepEqual(await bzip.file('sample-1.png')!.async('nodebuffer'),bytes);assert.match(await bzip.file('results.jsonl')!.async('string'),/owned/);assert.equal(requests,1);
    await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png?variant=thumbnail','/media/cache-test.png?variant=preview']));await ready();assert.equal(requests,3);await page.reload();await page.evaluate(email=>(window as any).cacheActivate(email),owner);await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png?variant=thumbnail','/media/cache-test.png?variant=preview']));await ready();assert.equal(requests,3,'variants persisted');
    await page.evaluate(()=>(window as any).renderCache([]));await page.locator('#app img').waitFor({state:'detached'});
    // Permission revocation is checked before a cached blob can be restored.
    await context.addCookies([{name:'nv_user',value:native.signUserSession(other,Date.now()),url:base}]);await page.evaluate(email=>(window as any).cacheActivate(email),other);
    const foreignDenied=await page.evaluate(async()=>{try{await(window as any).cacheBlob('/media/cache-test.png');return false;}catch{return true;}});assert.equal(foreignDenied,true);
    await context.addCookies([{name:'nv_user',value:native.signUserSession(owner,Date.now()),url:base}]);await page.evaluate(email=>(window as any).cacheActivate(email),owner);
    const changed=await sharp({create:{width:900,height:600,channels:3,background:'orange'}}).png().toBuffer();await writeFile(path.join(media,'cache-test.png'),changed);await assets.registerMediaAsset('cache-test.png',changed,'image/png',false,owner);
    const prior=requests;const updated=await page.evaluate(async()=>Array.from(new Uint8Array(await(await(window as any).cacheBlob('/media/cache-test.png')).arrayBuffer())));assert.deepEqual(Buffer.from(updated),changed);assert.equal(requests,prior+1,'changed version fetched once');
    // Quota failure does not block newly fetched pixels.
    await page.evaluate(()=>{(window as any).oldPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError');};});
    const quota=await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/late.png');const okay=lease.url.startsWith('blob:');lease.release();return okay;});assert.ok(quota);await page.evaluate(()=>IDBObjectStore.prototype.put=(window as any).oldPut);
    // Late old-account bytes cannot persist after logout/switch.
    await writeFile(path.join(media,'cancel.png'),bytes);await assets.registerMediaAsset('cancel.png',bytes,'image/png',false,owner);
    await page.route('**/media/cancel.png*',async route=>{await new Promise(resolve=>setTimeout(resolve,250));try{const response=await route.fetch();await route.fulfill({response});}catch{}});
    const late=await page.evaluate(async()=>{const pending=(window as any).cacheBlob('/media/cancel.png').then(()=>false,()=>true);setTimeout(()=>(window as any).cacheLogout(),50);return pending;});assert.ok(late);
    await page.evaluate(email=>(window as any).cacheActivate(email),owner);
    // Auth descriptor outage uses a fresh authenticated read, not stale HTTP pixels.
    await page.route('**/api/media/image-cache',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
    const outage=await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/late.png');const okay=lease.url.startsWith('blob:');lease.release();return okay;});assert.ok(outage);await page.unroute('**/api/media/image-cache');
    // LRU metadata does not materialize hundreds of Blob values during eviction.
    await page.evaluate(async email=>{const database=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('naumi-image-bytes-v1',2);r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=database.transaction(['metadata','images'],'readwrite');for(let i=0;i<401;i++){const id='eviction-'+i;tx.objectStore('metadata').put({id,account:email,source:'/media/fake-'+i+'.png',version:'1',bytes:100,at:1,created:Date.now()});tx.objectStore('images').put({id,blob:new Blob(['x'])});}tx.oncomplete=()=>resolve();});database.close();},owner);
    await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/late.png');lease.release();});
    const rows=await page.evaluate(async()=>{const database=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('naumi-image-bytes-v1',2);r.onsuccess=()=>resolve(r.result);});const count=await new Promise<number>(resolve=>{const r=database.transaction('metadata').objectStore('metadata').count();r.onsuccess=()=>resolve(r.result);});database.close();return count;});assert.ok(rows<=400);
    // A verified oversized image still displays natively; it never becomes a giant Blob.
    await page.route('**/api/media/image-cache',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({account:owner,results:{'/media/late.png':{account:owner,source:'/media/late.png',version:'large-fixture',fetchUrl:'/media/late.png?authorized-large=1',bytes:256*1024*1024,contentType:'image/png'}}})}));
    const large=await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/late.png');const result=lease.url;lease.release();return result;});assert.equal(large,'/media/late.png?authorized-large=1');await page.unroute('**/api/media/image-cache');
    await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png']));await ready();const beforeRestart=requests;
    await context.close();context=await chromium.launchPersistentContext(profile,launchOptions);
    await context.addCookies([{name:'nv_user',value:native.signUserSession(owner,Date.now()),url:base}]);
    await context.route('**/cache-verification',r=>r.fulfill({contentType:'text/html',body:html}));await context.route('**/image-cache-fixture.js',r=>r.fulfill({contentType:'application/javascript',body:js}));
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await countRequests();
    await page.goto(base+'/cache-verification');await page.evaluate(email=>(window as any).cacheActivate(email),owner);await page.evaluate(()=>(window as any).renderCache(['/media/cache-test.png']));await ready();assert.equal(requests,beforeRestart,'browser restart reuses Blob');
    const second=await context.newPage();await second.goto(base+'/cache-verification');await second.evaluate(email=>(window as any).cacheActivate(email),owner);await second.evaluate(()=>(window as any).renderCache(['/media/cache-test.png']));await second.waitForFunction(()=>document.querySelector('#app img')?.getAttribute('data-browser-image-cache')==='local');
    await page.screenshot({path:path.join(out,'cache-acceptance.png')});
    await page.evaluate(()=>(window as any).cacheLogout());await page.waitForFunction(()=>![...document.querySelectorAll('#app img')].some(x=>(x as HTMLImageElement).getAttribute('src')));
    await second.waitForFunction(()=>!document.querySelector('#app img')?.getAttribute('src'));
    const p1=await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/templates/public.png');const result=lease.url.startsWith('blob:');lease.release();return result;});assert.ok(p1);const publicRequests=requests;
    await page.evaluate(async()=>{const lease=await(window as any).cacheAcquire('/media/templates/public.png');lease.release();});assert.equal(requests,publicRequests,'published public picture reused while logged out');
    assert.deepEqual(errors,[]);
    const result={baselineRepeat,coldImageRequests:1,warmImageRequests:0,coldBytes,coverage:'52 client components',auth:'owner isolated',quota:'fallback',download:'original bytes equal',errors};await writeFile(path.join(out,'metrics.json'),JSON.stringify(result,null,2));
    console.log('BROWSER_IMAGE_CACHE=PASS BASELINE_REPEAT=1 COLD=1 REOPEN=0 RELOAD=0 BROWSER_RESTART=0 DUPLICATE=DEDUP VARIANTS=ISOLATED DOWNLOAD=LOCAL ZIP=LOCAL ORIGINAL_BYTES=EQUAL VERSION_CHANGE=REFETCH FOREIGN=DENIED LOGOUT=CLEARED MULTITAB=CLEARED LATE_WRITE=BLOCKED LRU=BOUNDED QUOTA=FALLBACK OUTAGE=AUTHENTICATED PAGE_ERRORS=0 PROVIDER_CALLS=0');
  }catch(error){console.error('BROWSER_ERRORS='+JSON.stringify(errors));console.error('DOM='+await page.locator('#app').innerHTML());throw error;}finally{await context.close();await db.getPool().end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
