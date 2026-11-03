'use strict';
// Real ReactFlow/CanvasImage/Edge. Native observers and clock; only loopback
// authorization/media are fixtures. No provider, application DB or live account.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const esbuild=require('esbuild'),sharp=require('sharp'),{chromium,expect}=require('@playwright/test');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root',path.join(__dirname,'..'))),out=path.resolve(arg('--output-root','output/browser-stability-goal-20261103/soak/current'));
const label=arg('--label','current'),cycles=Number(arg('--cycles','20')),idleMs=Number(arg('--idle-ms','15300'));
const acceptance=cycles>=20&&idleMs>=15000,dependencies=path.resolve(__dirname,'../node_modules');
const width=3072,height=2048,count=4,owner='soak-owner@fixture.test',other='soak-other@fixture.test';
const loaded=[],checks=[],samples=[],errors=[],external=[],requests=[];let server,browser,context,started;
let state={owner,denied:false,manifests:0,media:0,bytes:0},assets=[];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'COMMAND.json'),JSON.stringify({command:[process.execPath,...process.argv.slice(1)],cwd:process.cwd(),label,root,acceptance,cycles,idleMs},null,2));
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ReactFlow,ReactFlowProvider}from'@xyflow/react';import'@xyflow/react/dist/style.css';
import{CanvasImage}from'@/components/canvas/canvas-image';import*as images from'@/lib/browser-image-cache';
function ImageNode({data}){return <div style={{width:300,height:200}}><CanvasImage data-soak-image={data.index} source={'/media/soak-'+data.index+'.png'} hasDimensions forceOriginal={false} width={300} height={200} style={{display:'block',width:'100%',height:'100%'}} alt={'fixture '+data.index}/></div>}
const types={image:ImageNode},nodes=Array.from({length:4},(_,i)=>({id:'soak-'+i,type:'image',position:{x:60+i%2*380,y:50+Math.floor(i/2)*250},data:{index:i},style:{width:300,height:200}}));
const root=createRoot(document.getElementById('app'));function App(){const[mounted,setMounted]=useState(true);window.fixture.setMounted=setMounted;return <>{mounted&&<div id="flow"><ReactFlowProvider><ReactFlow nodes={nodes} edges={[]} nodeTypes={types} defaultViewport={{x:0,y:0,zoom:1}} minZoom={0.2} maxZoom={2} nodesDraggable={false} onlyRenderVisibleElements={false} onInit={instance=>{window.fixture.flow=instance;window.flowReady=true;}}/></ReactFlowProvider></div>}</>}
window.fixture={images,unmount:()=>root.unmount()};images.activateBrowserImages(${JSON.stringify(owner)});root.render(<App/>);window.fixtureReady=true;`;
async function compile(){
 const result=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root,sourcefile:'canvas-image-soak.tsx'},outfile:path.join(out,'bundle.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',metafile:true,nodePaths:[dependencies],alias:{'@':path.join(root,'src'),react:path.join(dependencies,'react'),'react-dom':path.join(dependencies,'react-dom')},define:{'process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"','process.env.NEXT_PUBLIC_IMAGE_BASE_URL':'""','process.env':'{}'},plugins:[{name:'loopback-auth',setup(b){b.onResolve({filter:/(^|\/)supabase$/},a=>({path:a.path,namespace:'fixture-auth'}));b.onLoad({filter:/.*/,namespace:'fixture-auth'},()=>({contents:'export async function authHeader(){return {}}',loader:'js'}));}}]});
 for(const input of Object.keys(result.metafile.inputs)){const file=path.resolve(input);if(input.includes('src/')&&!file.includes(`${path.sep}node_modules${path.sep}`)&&fs.existsSync(file))loaded.push({file,relative:path.relative(root,file),sha256:hash(fs.readFileSync(file))});}
 for(const rel of['src/components/canvas/canvas-image.tsx','src/components/cached-image.tsx','src/lib/canvas/image-residency.ts','src/lib/canvas/image-observers.ts','src/lib/browser-image-cache.ts'])assert(loaded.some(x=>x.file===path.join(root,rel)),'real product module: '+rel);
}
async function main(){
 await compile();
 for(let i=0;i<count;i++){
  const colors=['#326b83','#a55571','#638444','#8c7541'];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${colors[i]}"/><path d="M0 0L3072 2048M0 2048L3072 0" stroke="#f4ece0" stroke-width="81"/><circle cx="1536" cy="1024" r="360" fill="#133248"/></svg>`;
  const png=await sharp(Buffer.from(svg)).png().toBuffer();assets.push({buffer:png,index:i,sha256:hash(png),bytes:png.length,width,height});
 }
 fs.writeFileSync(path.join(out,'ASSETS.json'),JSON.stringify(assets.map(({buffer,...x})=>x),null,2));
 server=http.createServer(async(req,res)=>{
  const url=req.url;
  if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  if(url==='/bundle.js'||url==='/bundle.css'){res.setHeader('content-type',url.endsWith('js')?'application/javascript':'text/css');return res.end(fs.readFileSync(path.join(out,url.slice(1))));}
  if(url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/bundle.css"><style>html,body{margin:0;background:white}#flow{width:900px;height:600px;background:#f6f7f9}.react-flow__node{border:0}</style><div id="app"></div><script src="/bundle.js"></script></html>');}
  requests.push({at:Date.now(),method:req.method,url,owner:state.owner});
  if(url==='/api/media/image-cache'){
   state.manifests++;let raw='';for await(const chunk of req)raw+=chunk;const sources=JSON.parse(raw).sources;
   res.setHeader('content-type','application/json');if(state.denied){res.statusCode=403;return res.end(JSON.stringify({error:'fixture owner denied'}));}
   return res.end(JSON.stringify({account:state.owner,results:Object.fromEntries(sources.map(source=>{const index=Number(source.match(/soak-(\d)/)?.[1]),asset=assets[index];assert(asset);return[source,{account:state.owner,source,version:'local:soak-v1-'+index,bytes:asset.bytes,contentType:'image/png',fetchUrl:source}];}))}));
  }
  const match=url.match(/^\/media\/soak-(\d)\.png(?:\?.*)?$/);
  if(match){if(state.denied){res.statusCode=403;return res.end();}const asset=assets[Number(match[1])];state.media++;state.bytes+=asset.bytes;res.setHeader('content-type','image/png');res.setHeader('cache-control','no-store');return res.end(asset.buffer);}
  res.statusCode=404;res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
 const browserCdp=await browser.newBrowserCDPSession();
 context=await browser.newContext({viewport:{width:1000,height:700}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin&&!['blob:','data:'].includes(u.protocol)){external.push(u.href);return route.abort();}return route.continue();});
 await context.addInitScript(()=>{
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set();
  window.soakURLs={live,created:0,revoked:0,doubleRevoke:0};
  URL.createObjectURL=blob=>{const u=create(blob);live.add(u);window.soakURLs.created++;return u;};
  URL.revokeObjectURL=u=>{if(!live.delete(u))window.soakURLs.doubleRevoke++;else window.soakURLs.revoked++;return revoke(u);};
  window.nativeAPIs={intersection:IntersectionObserver.toString(),resize:ResizeObserver.toString(),timer:setTimeout.toString()};
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 await page.goto(origin);await page.waitForFunction(()=>window.fixtureReady&&window.flowReady);
 const ready=()=>page.waitForFunction(({width,height,count})=>{const imgs=[...document.querySelectorAll('[data-soak-image]')];return imgs.length===count&&imgs.every(x=>x.naturalWidth===width&&x.naturalHeight===height&&x.dataset.mediaVisible==='true'&&x.dataset.mediaVariant==='original');},{width,height,count});
 const move=async(x,zoom=1)=>{await page.evaluate(({x,zoom})=>window.fixture.flow.setViewport({x,y:0,zoom},{duration:0}),{x,zoom});await expect.poll(()=>page.evaluate(()=>window.fixture.flow.getViewport().x)).toBe(x);};
 async function processMemory(){
  const info=await browserCdp.send('SystemInfo.getProcessInfo');
  if(process.platform!=='win32')return{available:false,reason:'Windows working set collector only',processes:info.processInfo};
  const ids=info.processInfo.map(x=>Number(x.id)).filter(Number.isSafeInteger);
  try{const cmd=`$ErrorActionPreference='Stop'; @(${ids.join(',')}) | ForEach-Object { $p=Get-Process -Id $_ -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{pid=$p.Id;workingSetBytes=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64}} } | ConvertTo-Json -Compress`;
   const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
   const parsed=raw?JSON.parse(raw):[],rows=Array.isArray(parsed)?parsed:[parsed];
   return{available:true,scope:'CDP SystemInfo.getProcessInfo PIDs for this launched Edge only; shared pages double-countable across process working sets',processes:rows.map(x=>({...x,type:info.processInfo.find(p=>Number(p.id)===x.pid)?.type})),workingSetBytes:rows.reduce((n,x)=>n+x.workingSetBytes,0),privateBytes:rows.reduce((n,x)=>n+x.privateBytes,0)};
  }catch(e){return{available:false,error:String(e),processes:info.processInfo};}
 }
 async function sample(round,phase,{gc=false,process=true}={}){
  if(gc)await cdp.send('HeapProfiler.collectGarbage');
  const dom=await cdp.send('Memory.getDOMCounters'),perf=await cdp.send('Performance.getMetrics');
  const ui=await page.evaluate(()=>({elements:document.querySelectorAll('*').length,flowNodes:document.querySelectorAll('.react-flow__node').length,liveURLs:window.soakURLs.live.size,created:window.soakURLs.created,revoked:window.soakURLs.revoked,doubleRevoke:window.soakURLs.doubleRevoke,images:[...document.querySelectorAll('[data-soak-image]')].map(x=>({id:x.dataset.soakImage,src:x.getAttribute('src'),width:x.naturalWidth,height:x.naturalHeight,visible:x.dataset.mediaVisible,variant:x.dataset.mediaVariant})),native:window.nativeAPIs}));
  const metrics=Object.fromEntries(perf.metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(x.name)).map(x=>[x.name,x.value]));
  const row={round,phase,at:new Date().toISOString(),elapsedMs:Date.now()-started,forcedGC:gc,metrics,dom,ui,traffic:{...state},processMemory:process?await processMemory():undefined};samples.push(row);fs.appendFileSync(path.join(out,'SAMPLES.jsonl'),JSON.stringify(row)+'\n');return row;
 }
 await ready();started=Date.now();
 let before=await sample(0,'warm-visible',{gc:true});
 assert.equal(before.ui.liveURLs,count);assert.equal(state.media,count);assert(before.ui.images.every(x=>x.width===width&&x.height===height));
 for(const name of ['intersection','resize','timer'])assert.match(before.ui.native[name],/native code/);
 const firstBytes=state.bytes,firstMedia=state.media,firstElements=before.ui.elements;
 await move(0,0.5);await page.waitForTimeout(200);assert((await sample(0,'zoom-out',{process:false})).ui.images.every(x=>x.variant==='original'&&x.width===width));await move(0);await ready();
 checks.push({name:'ORIGINAL_6MP_PIXELS_AND_NATIVE_OBSERVERS',pass:true,width,height,count,totalPixels:width*height*count});
 for(let round=1;round<=cycles;round++){
  await move(-2400);await page.waitForFunction(()=>[...document.querySelectorAll('[data-soak-image]')].every(x=>x.dataset.mediaVisible==='false'));
  const leftAt=Date.now();await page.waitForTimeout(idleMs);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-soak-image]')].every(x=>!x.getAttribute('src')));
  const off=await sample(round,'offscreen-idle',{process:round%5===0});assert(Date.now()-leftAt>=idleMs);assert.equal(off.ui.liveURLs,0);assert.equal(off.ui.flowNodes,count);assert.equal(off.ui.elements,firstElements);assert.equal(off.ui.doubleRevoke,0);
  await move(0);await ready();const on=await sample(round,'returned-visible',{gc:round%5===0,process:round%5===0});
  assert.equal(on.ui.liveURLs,count);assert.equal(on.ui.elements,firstElements);assert.equal(state.media,firstMedia);assert.equal(state.bytes,firstBytes);assert(on.ui.images.every(x=>x.variant==='original'&&x.width===width&&x.height===height));
  console.log(`SOAK ${label} ROUND=${round}/${cycles} ELAPSED_MS=${Date.now()-started} URLS_OFF=${off.ui.liveURLs} URLS_ON=${on.ui.liveURLs} MEDIA=${state.media} HEAP=${on.metrics.JSHeapUsedSize}`);
 }
 const durationMs=Date.now()-started;if(acceptance)assert(durationMs>=300000);
 const postGC=samples.filter(s=>s.forcedGC),last=postGC.at(-1);assert(last.metrics.JSHeapUsedSize<=before.metrics.JSHeapUsedSize+12*1024*1024,'retained JS heap bounded within fixed 12 MiB workload tolerance after explicit GC');
 checks.push({name:'REAL_IDLE_REPEAT_RETURN_FIXED_WORKLOAD',pass:true,cycles,durationMs,idleMs,media:firstMedia,bytes:firstBytes,liveURLsOffscreen:0,liveURLsVisible:count,stableElements:firstElements,retainedHeapDelta:last.metrics.JSHeapUsedSize-before.metrics.JSHeapUsedSize});
 // Leave/re-enter the component using old loaded JS/CSS, without clearing byte cache.
 await page.evaluate(()=>window.fixture.setMounted(false));await page.waitForFunction(()=>!document.querySelector('.react-flow'));
 const unmounted=await sample(cycles,'unmounted',{gc:true});assert.equal(unmounted.ui.liveURLs,0);
 await page.evaluate(()=>window.fixture.setMounted(true));await ready();assert.equal(state.media,firstMedia);
 checks.push({name:'OLD_BUNDLE_COMPONENT_REENTRY_CACHE_HIT',pass:true,media:state.media});
 // A different fixture account is denied the exact old sources. Pixels must clear
 // before that denial returns; only the original owner may reauthorize afterwards.
 state.owner=other;state.denied=true;
 const sync=await page.evaluate(other=>{window.fixture.images.activateBrowserImages(other);return[...document.querySelectorAll('[data-soak-image]')].every(x=>!x.getAttribute('src'));},other);assert(sync,'account reset revokes visible source synchronously');
 await page.waitForTimeout(500);const denied=await sample(cycles,'other-owner-denied');assert.equal(denied.ui.liveURLs,0);assert(denied.ui.images.every(x=>!x.src?.startsWith('blob:')));assert.equal(state.media,firstMedia);
 state.owner=owner;state.denied=false;await page.evaluate(owner=>window.fixture.images.activateBrowserImages(owner),owner);await ready();assert(state.manifests>0);
 checks.push({name:'ACCOUNT_ISOLATION_AND_ORIGINAL_OWNER_REAUTHORIZE',pass:true,synchronousPixelsCleared:sync,deniedLiveURLs:denied.ui.liveURLs,finalMedia:state.media});
 await page.evaluate(()=>window.fixture.unmount());const final=await sample(cycles,'final-unmounted',{gc:true});assert.equal(final.ui.liveURLs,0);assert.equal(final.ui.doubleRevoke,0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(loaded.every(x=>hash(fs.readFileSync(x.file))===x.sha256),'loaded product modules unchanged during soak');
 const processRows=samples.filter(x=>x.processMemory?.available),heaps=samples.map(x=>x.metrics.JSHeapUsedSize);
 const summary={cycles,durationMs,idleMs,pixelsEach:width*height,images:count,totalPixels:width*height*count,sourceRGBABytes:width*height*count*4,soakMedia:firstMedia,soakBytes:firstBytes,offscreenURLRange:[0,0],visibleURLRange:[count,count],elements:firstElements,heapRawMin:Math.min(...heaps),heapRawMax:Math.max(...heaps),postGCStart:before.metrics.JSHeapUsedSize,postGCEnd:last.metrics.JSHeapUsedSize,workingSetMin:processRows.length?Math.min(...processRows.map(x=>x.processMemory.workingSetBytes)):null,workingSetMax:processRows.length?Math.max(...processRows.map(x=>x.processMemory.workingSetBytes)):null,workingSetSamples:processRows.length,supplierCalls:0};
 const stdout=`CANVAS_IMAGE_SOAK=${acceptance?'PASS':'SMOKE_PASS'} LABEL=${label} CYCLES=${cycles} DURATION_MS=${durationMs} SUPPLIER_CALLS=0 EXIT=0`;
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:acceptance?'PASS':'SMOKE_PASS',stdout,exit:0,label,sourceRoot:root,summary,checks,loaded,errors,external,requests,evidence:'Native Edge ReactFlow CanvasImage/cache; fixed local 3072x2048 PNGs; real clock/IO; CDP JS heap/DOM plus Windows working sets of this Edge only; sampled forced GC explicitly marked; working-set sums may double-count shared pages, not GPU allocation or renderer-only RSS; no deployment or paid generation'},null,2));console.log(stdout);
}
main().catch(e=>{fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'FAIL',exit:2,error:e.stack||String(e),label,checks,loaded,samples,errors,external,requests},null,2));console.error(e);process.exitCode=2;}).finally(async()=>{await context?.close();await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
