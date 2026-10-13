/** Read-only acceptance on actual 103 native account and actual saved media.
 * Candidate mode tunnels unchanged server responses, never substitutes data.
 * No model generation, artwork writes, credits, passwords or roles are changed.
 */
import assert from 'node:assert/strict';
import{readFile,writeFile,mkdtemp}from'node:fs/promises';
import path from'node:path';
import{createHash}from'node:crypto';
import{chromium}from'@playwright/test';
import{build}from'esbuild';
import JSZip from'jszip';
async function main(){
const out=path.resolve('output/browser-image-cache'),base='http://103.30.76.93';
const session=JSON.parse(await readFile(path.join(out,'live-session.json'),'utf8'));
const side=process.env.NAUMI_CACHE_SIDE==='1';
const exe=path.join(process.env.LOCALAPPDATA!,'ms-playwright/chromium-1217/chrome-win64/chrome.exe');
const entry=path.join(out,'live-probe.ts');
await writeFile(entry,`import{activateBrowserImages,cachedImageBlob,readBrowserImage}from'../../src/lib/browser-image-cache';import{browserImageArchive}from'../../src/lib/browser-image-archive';import{sha256}from'@noble/hashes/sha256';import{bytesToHex}from'@noble/hashes/utils';Object.assign(window,{cacheActivate:activateBrowserImages,cacheBlob:cachedImageBlob,cacheRead:readBrowserImage,cacheZip:browserImageArchive,cacheDigest:async(s)=>{const b=await cachedImageBlob(s);return{size:b.size,hash:bytesToHex(sha256(new Uint8Array(await b.arrayBuffer())))};}});`);
const js=(await build({entryPoints:[entry],bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env':'{}'},tsconfig:path.resolve('tsconfig.json')})).outputFiles[0].text;
let bytesRequests=0;const errors:string[]=[],results:Record<string,unknown>={};
const profile=await mkdtemp(path.join(out,'live-profile-'));
let context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:exe,viewport:{width:1440,height:1000},acceptDownloads:true});
async function setup(){
 await context.addCookies([{name:'nv_user',value:session.cookie,url:base}]);
 await context.route(base+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());
  const cache=/^\/(?:desktop\/)?api\/(?:media\/image-cache|public-image-cache|team\/media|enterprise\/media)$/.test(u.pathname);
  if(!['GET','HEAD','OPTIONS'].includes(req.method())&&!cache){results.blockedMutation=(results.blockedMutation as number||0)+1;return route.abort('blockedbyclient');}
  if(!side||u.pathname.startsWith('/api/')&&!cache||u.pathname.startsWith('/desktop/api/')&&!cache)return route.continue();
  const slot=cache||u.pathname.startsWith('/media/')?13228:u.pathname.startsWith('/desktop')?13229:u.pathname.startsWith('/enterprise')||u.pathname==='/team'?13230:13228;
  const res=await route.fetch({url:'http://127.0.0.1:'+slot+(cache&&u.pathname.startsWith('/desktop/')?u.pathname.slice(8):u.pathname)+u.search,headers:{...req.headers(),host:'103.30.76.93'},timeout:120000});await route.fulfill({response:res});
 });
 context.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/media/')||u.hostname.endsWith('.r2.cloudflarestorage.com')||u.hostname.endsWith('.r2.dev'))bytesRequests++;});
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
}
async function visibleImages(page:any){await page.waitForFunction(()=>[...document.querySelectorAll('img[data-browser-image-cache="local"]')].some(i=>(i as HTMLImageElement).naturalWidth>0)&&![...document.querySelectorAll('img[data-browser-image-cache="pending"]')].some(i=>{const b=i.getBoundingClientRect();return (i as HTMLElement).dataset.browserImageDenied!=='true'&&b.top<innerHeight+180&&b.bottom>-180&&b.width>0;}),undefined,{timeout:120000});await page.waitForTimeout(1300);}
try{
 await setup();let page=await context.newPage();
 await page.goto(base+'/works',{waitUntil:'domcontentloaded',timeout:120000});await visibleImages(page);
 const cold=bytesRequests;assert.ok(cold>0);await page.reload({waitUntil:'domcontentloaded'});await visibleImages(page);assert.equal(bytesRequests,cold,'native works refresh must not transfer image bytes');
 await page.screenshot({path:path.join(out,side?'103-side-works.png':'103-live-works.png'),fullPage:false});
 results.works={coldImageRequests:cold,refreshImageRequests:0};
 const tile=page.locator('img[data-browser-image-cache="local"]').first().locator('xpath=ancestor::*[@role="button"][1]');await tile.click({position:{x:20,y:30}});
 const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.locator('img[data-browser-image-cache="local"]').waitFor();await page.waitForFunction(()=>{const i=document.querySelector('[role="dialog"] img')as HTMLImageElement;return i&&i.naturalWidth>0;});
 const detailReads=bytesRequests;const dl=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载',exact:false}).click();const download=await dl;await download.saveAs(path.join(out,side?'103-side-original.png':'103-live-original.png'));assert.equal(bytesRequests,detailReads,'native lightbox download must reuse displayed original');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await tile.click({position:{x:20,y:30}});await dialog.waitFor();await page.waitForFunction(()=>{const i=document.querySelector('[role="dialog"] img')as HTMLImageElement;return i&&i.naturalWidth>0;});assert.equal(bytesRequests,detailReads,'native detail reopen');await dialog.getByRole('button',{name:'关闭',exact:true}).click();results.nativeLightbox={reopenImageRequests:0,downloadImageRequests:0};
 await page.addScriptTag({content:js});await page.evaluate(email=>(window as any).cacheActivate(email),session.email);
 const asset=session.assets.find((a:any)=>a.remote_ready&&a.thumbnail_key&&a.preview_key)||session.assets.find((a:any)=>a.thumbnail_key&&a.preview_key)||session.assets[0];assert.ok(asset,'actual account has stored assets');
 const source='/media/'+asset.key;const p=bytesRequests;
 const original=await page.evaluate(src=>(window as any).cacheDigest(src),source);assert.ok(original.size>0);const q=bytesRequests;assert.ok(q>=p,'original read may reuse the native lightbox bytes');
 const again=await page.evaluate(src=>(window as any).cacheDigest(src),source);assert.deepEqual(again,original);assert.equal(bytesRequests,q,'original reopen');
 const zipData=await page.evaluate(async src=>Array.from(new Uint8Array(await(await(window as any).cacheZip([{url:src,name:'actual-original'}])).arrayBuffer())),source);
 const zip=await JSZip.loadAsync(Buffer.from(zipData));const file=Object.values(zip.files).find(f=>!f.dir)!;assert.equal(createHash('sha256').update(await file.async('nodebuffer')).digest('hex'),original.hash);assert.equal(bytesRequests,q,'actual ZIP uses cached original');
 const variants=[];
 for(const variant of['thumbnail','preview']){const src=source+'?variant='+variant;const first=await page.evaluate(s=>(window as any).cacheDigest(s),src);const n=bytesRequests;assert.deepEqual(await page.evaluate(s=>(window as any).cacheDigest(s),src),first);assert.equal(bytesRequests,n);variants.push({variant,bytes:first.size});}
 results.actualMedia={driver:asset.remote_ready?'R2':'local',originalBytes:original.size,hash:original.hash,reopenImageRequests:0,zipImageRequests:0,variants};
 await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:exe,viewport:{width:1440,height:1000}});await setup();page=await context.newPage();const beforeRestart=bytesRequests;await page.goto(base+'/works',{waitUntil:'domcontentloaded',timeout:120000});await visibleImages(page);assert.equal(bytesRequests,beforeRestart,'full browser restart must restore native image cache');results.browserRestartImageRequests=0;
 for(const route of['/desktop/works','/canvas','/tools','/genchat','/suite','/aplus','/templates','/enterprise','/team']){
  const r=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(r?.status(),200,route);await page.waitForTimeout(1700);
  assert.equal(await page.locator('body').innerText().then(t=>/Application error: a client-side exception/.test(t)),false,route);
  if(route==='/desktop/works'){await visibleImages(page);const n=bytesRequests;await page.reload({waitUntil:'domcontentloaded'});await visibleImages(page);assert.equal(bytesRequests,n,'desktop refresh');}
  results[route]={status:r?.status(),cachedPixels:await page.locator('img[data-browser-image-cache="local"]').count()};
 }
 assert.deepEqual(errors,[]);results.pageErrors=errors;results.providerCalls=0;results.mode=side?'103-side-real-data':'103-public-real-data';
 await writeFile(path.join(out,side?'103-side-metrics.json':'103-live-metrics.json'),JSON.stringify(results,null,2));
 console.log('LIVE_IMAGE_CACHE=PASS MODE='+results.mode+' WORKS_REFRESH=0 BROWSER_RESTART=0 DESKTOP_REFRESH=0 ORIGINAL_REOPEN=0 ZIP_LOCAL=EXACT R2_VARIANTS=REUSED PAGE_ERRORS=0 PROVIDER_CALLS=0');
}catch(error){await writeFile(path.join(out,'103-partial-metrics.json'),JSON.stringify(results,null,2));for(const page of context.pages())await page.screenshot({path:path.join(out,'103-debug.png')}).catch(()=>{});throw error;}finally{await context.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
