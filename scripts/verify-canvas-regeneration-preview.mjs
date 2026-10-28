import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

// Real components, React commits, HTTP, IndexedDB and browser decoding.
// Only auth/locale and media services are fixture boundaries; no supplier calls.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(arg('--source-root',repo)),out=path.resolve(arg('--output-root',path.join(repo,'output/regeneration-preview')));
const baseline=args.includes('--baseline'),mode=baseline?'BASELINE':'MODIFIED',req=createRequire(path.join(repo,'package.json'));
const exists=async p=>!!await fs.stat(p).catch(()=>null),hash=b=>createHash('sha256').update(b).digest('hex');
const source=async rel=>await exists(path.join(root,rel))?path.join(root,rel):path.join(repo,rel);
await fs.mkdir(out,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import{CachedImage}from'@/components/cached-image';import{ImageReferenceComposer}from'@/components/canvas/image-reference-composer';
import{GenerationPlaceholder}from'@/components/canvas/generation-placeholder';
import*as cache from'@/lib/browser-image-cache';import*as workspace from'@/lib/saas/workspace-client';
const root=createRoot(document.getElementById('app')),noop=()=>{};
function View({sources=[],refSource,keyId='a'}){return <React.StrictMode><div className="canvas">{sources.map((s,i)=><CachedImage key={s} data-testid={'canvas-'+i} src={s} style={{width:240,height:160,objectFit:'cover'}}/>)}</div>{refSource&&<section className="panel"><ImageReferenceComposer key={keyId} references={[{key:refSource,number:1,title:'兔子飞行参考图',url:refSource,role:'edit-target',sourceNodeId:'original'}]} prompt="保留主体" onPrompt={noop} onRole={noop} onRemove={noop} onPreview={noop} onLocate={noop} textareaRef={{current:null}} placeholder=""/></section>}</React.StrictMode>}
window.fixture={...cache,...workspace,render:props=>flushSync(()=>root.render(<View {...props}/>)),empty:()=>flushSync(()=>root.render(null)),
progress:stage=>flushSync(()=>root.render(<div className="cards">{[[400,225],[225,400],[280,280],[160,108]].map(([w,h])=><section data-testid="geometry" key={w+'x'+h} style={{width:w,height:h,position:'relative',flexShrink:0}}><div style={{position:'absolute',inset:0,containerType:'size'}}><GenerationPlaceholder stage={stage} startedAt={Date.now()-18000}/></div></section>)}</div>))};`;
const bundle=await build({stdin:{contents:entry,resolveDir:repo,loader:'tsx'},absWorkingDir:repo,bundle:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),
  define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"','process.env.NEXT_PUBLIC_MEDIA_VARIANTS':'"1"','process.env.NEXT_PUBLIC_IMAGE_BASE_URL':'""'},plugins:[{name:'fixture',setup(b){
    b.onResolve({filter:/^\.\/supabase$|^@\/lib\/i18n\/locale-context$/},a=>({path:a.path.includes('locale')?'locale':'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export async function authHeader(){return {}}':'export function useI18n(){return {locale:"zh"}}',loader:'js'}));
    b.onResolve({filter:/^@\//},async a=>{for(const ext of ['.tsx','.ts']){const p=await source('src/'+a.path.slice(2)+ext);if(await exists(p))return{path:p};}throw new Error('Missing '+a.path)});
    b.onResolve({filter:/^\./},async a=>{if(!a.importer||!a.importer.startsWith(root)||root===repo)return;for(const ext of ['', '.tsx','.ts']){const local=path.resolve(path.dirname(a.importer),a.path+ext);if(await exists(local))return{path:local};const p=path.join(repo,path.relative(root,local));if(await exists(p))return{path:p};}});
    b.onResolve({filter:/^(react(?:\/|$)|react-dom(?:\/|$))/},a=>{
      // Match the existing browser fixture's actual DOM entry under a parent
      // react-server condition. This changes fixture resolution, not product code.
      const match=/^(react|react-dom)(?:\/(jsx-runtime|jsx-dev-runtime|client))?$/.exec(a.path);
      return {path:match?path.join(path.dirname(req.resolve(match[1]+'/package.json')),(match[2]||'index')+'.js'):req.resolve(a.path)};
    });
  }}]});
const loaded=[];for(const p of Object.keys(bundle.metafile.inputs)){const full=path.resolve(repo,p);if(!p.includes('node_modules')&&await exists(full))loaded.push({path:full,sha256:hash(await fs.readFile(full))});}
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const bytes=await sharp({create:{width:480,height:320,channels:3,background:'#619eaa'}}).composite([{input:Buffer.from('<svg width="480" height="320"><circle cx="240" cy="150" r="90" fill="#e7cba7"/><path d="M0 290L480 70" stroke="#d9eaf3" stroke-width="26"/></svg>')}]).png().toBuffer();
const owner='preview@fixture.test',metrics={manifests:[],images:[],external:[]},checks=[],errors=[];
let delay=0,denied=false,currentOwner=owner;
const server=createServer(async(request,response)=>{try{
  const u=new URL(request.url,'http://fixture');
  if(u.pathname==='/fixture.js'){response.setHeader('content-type','application/javascript');return response.end(js);}
  if(u.pathname==='/fixture.css'){response.setHeader('content-type','text/css');return response.end(css);}
  if(u.pathname==='/api/media/image-cache'){
    let body='';for await(const b of request)body+=b;const {sources}=JSON.parse(body);metrics.manifests.push(sources);const account=currentOwner;
    await new Promise(r=>setTimeout(r,delay));response.setHeader('content-type','application/json');
    return response.end(JSON.stringify({account,results:Object.fromEntries(sources.map(source=>[source,denied?null:{source,account,version:hash(bytes),fetchUrl:source,bytes:bytes.length,contentType:'image/png'}]))}));
  }
  if(u.pathname.startsWith('/media/')||u.pathname==='/api/team/media'||u.pathname==='/api/enterprise/media'){metrics.images.push(request.url);response.setHeader('content-type','image/png');return response.end(bytes);}
  response.setHeader('content-type','text/html');response.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>body{font-family:Arial,sans-serif;background:#f1f3f7;padding:30px;color:#334155}.canvas{display:flex;gap:30px}.panel{background:white;padding:20px;margin-top:24px;width:420px;border-radius:14px}.panel button{cursor:pointer}.panel img{width:48px;height:48px;object-fit:cover}.panel [data-reference-number]{display:flex;gap:10px}.panel textarea{display:block;margin-top:20px}.cards{display:flex;gap:20px;align-items:center}.cards section{background:white;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px #d9dee7}.relative{position:relative}.absolute{position:absolute}.h-12{height:48px}.w-12{width:48px}.h-full{height:100%}.w-full{width:100%}.object-cover{object-fit:cover}.overflow-hidden{overflow:hidden}</style><div id="app"></div><script>window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{window.revoked.push(u);revoke(u)};</script><script src="/fixture.js"></script>`);
}catch(e){response.statusCode=500;response.end(e.stack)}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1280,height:760}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){metrics.external.push(u.origin);return route.abort();}return route.continue();});
const ref='[data-testid=image-reference-composer] img',canvas='[data-testid=canvas-0]';
const frame=selector=>page.locator(selector).evaluate(i=>({src:i.getAttribute('src'),ready:i.complete&&i.naturalWidth>0,visible:getComputedStyle(i).visibility}));
const ready=selector=>page.waitForFunction(s=>{const i=document.querySelector(s);return i?.complete&&i.naturalWidth>0&&getComputedStyle(i).visibility!=='hidden'},selector);
const render=props=>page.evaluate(props=>window.fixture.render(props),props);
async function start(){delay=0;denied=false;currentOwner=owner;await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.fixture);await page.evaluate(o=>window.fixture.activateBrowserImages(o),owner);}
let result='PASS';
try{
  await start();await render({sources:['/media/one.png']});await ready(canvas);const original=await frame(canvas);delay=650;
  await render({sources:['/media/one.png'],refSource:'/media/one.png'});const first=await frame(ref);
  await page.waitForTimeout(140);const held=await frame(ref);
  if(baseline){assert.equal(first.ready,false);assert.equal(held.ready,false);await ready(ref);checks.push('REAL_REFERENCE_REMOUNT_BLANK_BEFORE_AUTH_AND_DECODE');result='REPRODUCED';}
  else{
    assert.equal(first.src,original.src);assert.equal(first.ready,true);assert.equal(held.src,original.src);checks.push('FIRST_FRAME_REUSES_DECODED_PIXELS_BEFORE_TARGET_AUTH');
    await render({sources:[],refSource:'/media/one.png'});assert.equal((await frame(ref)).src,original.src);assert.equal(await page.evaluate(u=>window.revoked.includes(u),original.src),false);checks.push('SOURCE_UNMOUNT_KEEPS_BORROWED_URL_ALIVE');
    await page.waitForFunction(old=>{const i=document.querySelector('[data-testid=image-reference-composer] img');return i?.src!==old&&i?.complete&&i.naturalWidth>0},original.src);
    assert.ok(metrics.manifests.some(s=>s.includes('/media/one.png?variant=thumbnail')));assert.equal(metrics.images.filter(s=>s==='/media/one.png').length,1);assert.equal(await page.evaluate(u=>window.revoked.includes(u),original.src),true);checks.push('THUMBNAIL_REAUTH_AND_DECODE_REPLACES_PREVIEW_NO_ORIGINAL_REDOWNLOAD');
    const thumb=await frame(ref);await render({sources:[],refSource:'/media/one.png',keyId:'b'});assert.equal((await frame(ref)).src,thumb.src);checks.push('KEYED_EDITOR_HANDOFF_RETAINS_ACTIVE_LEASE');
    await render({sources:['/media/two.png'],refSource:'/media/one.png',keyId:'b'});await ready(canvas);const two=await frame(canvas);await render({sources:['/media/two.png'],refSource:'/media/two.png',keyId:'c'});assert.equal((await frame(ref)).src,two.src);checks.push('SWITCH_NODE_USES_ITS_OWN_IMAGE');
    await render({sources:['/media/two.png'],refSource:'/media/cold.png',keyId:'cold'});const cold=await frame(ref);assert.equal(cold.ready,false);assert.equal(cold.visible,'hidden');assert.equal(await page.locator(ref).getAttribute('alt'),'');await ready(ref);checks.push('COLD_REFERENCE_NEVER_REUSES_UNRELATED_PIXELS_OR_ALT_TEXT');
    await page.evaluate(()=>window.fixture.selectWorkspace('team:other'));const blank=await frame(ref);assert.equal(blank.ready,false);await render({sources:[],refSource:'/media/two.png',keyId:'space'});assert.equal((await frame(ref)).ready,false);checks.push('WORKSPACE_CHANGE_INVALIDATES_DISPLAY_AND_BORROW');await ready(ref);
    currentOwner='other@fixture.test';await page.evaluate(o=>window.fixture.activateBrowserImages(o),currentOwner);await render({sources:[],refSource:'/media/two.png',keyId:'account'});assert.equal((await frame(ref)).ready,false);await ready(ref);checks.push('ACCOUNT_CHANGE_CANNOT_BORROW_PREVIOUS_OWNER');
    await page.evaluate(()=>window.fixture.clearBrowserImages());assert.equal((await frame(ref)).ready,false);checks.push('LOGOUT_REMOVES_PIXELS');
    await start();const team='/api/team/media?teamId=11111111-1111-1111-1111-111111111111&email=one%40test.com&id=one';await render({sources:[team]});await ready(canvas);delay=650;
    await render({sources:[team],refSource:team.replace('one%40','two%40')});assert.equal((await frame(ref)).ready,false);checks.push('RESOURCE_SCOPED_TEAM_QUERY_IS_NOT_COLLAPSED');await ready(ref);
    await start();await render({sources:['/media/one.png']});await ready(canvas);delay=400;denied=true;await render({sources:['/media/one.png'],refSource:'/media/one.png'});
    await page.waitForFunction(()=>document.querySelector('[data-testid=image-reference-composer] img')?.dataset.browserImageDenied==='true');assert.equal((await frame(ref)).ready,false);
    await render({sources:['/media/one.png'],refSource:'/media/one.png',keyId:'denied-reopen'});assert.equal((await frame(ref)).ready,false);checks.push('TARGET_AUTH_DENIAL_REMOVES_SHARED_FRAME_AND_CANNOT_REBORROW');
    denied=false;delay=0;await page.evaluate(()=>window.fixture.empty());await render({sources:['/media/focus.png'],refSource:'/media/focus.png'});await ready(canvas);await ready(ref);denied=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>![...document.querySelectorAll('img')].some(i=>i.complete&&i.naturalWidth));checks.push('FOCUS_REVOCATION_CLEARS_CANVAS_AND_PREVIEW');
    denied=false;await page.evaluate(()=>window.fixture.progress('generating'));const dimensions=await page.locator('[data-testid=geometry]').evaluateAll(nodes=>nodes.map(n=>[n.offsetWidth,n.offsetHeight]));assert.deepEqual(dimensions,[[400,225],[225,400],[280,280],[160,108]]);
    assert.equal(await page.getByRole('progressbar').count(),4);assert.equal(await page.locator('[data-stage=generating]').count(),4);assert.equal(await page.locator('[data-testid=geometry]').last().evaluate(n=>n.scrollHeight<=n.clientHeight),true);checks.push('REAL_PROGRESS_COMPONENT_FITS_LANDSCAPE_PORTRAIT_SQUARE_AND_RESIZED_NODE');
    await page.screenshot({path:path.join(out,'progress-shapes.png')});
    await page.evaluate(()=>window.fixture.progress('saving'));assert.equal(await page.locator('[data-stage=saving]').count(),4);checks.push('REAL_PROGRESS_SAVING_STAGE');
    await page.evaluate(()=>window.fixture.empty());
    const undecoded=await page.evaluate(async()=>{const lease=await window.fixture.acquireBrowserImage('/media/not-displayed.png');const preview=window.fixture.borrowActiveBrowserImage('/media/not-displayed.png');const borrowed=!!preview;preview?.release();lease.release();return borrowed});
    assert.equal(undecoded,false);checks.push('UNDECODED_BYTES_ARE_NEVER_BORROWED_AS_A_FRAME');
    checks.push('UNMOUNT_RELEASES_ACTIVE_PREVIEWS');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(metrics.external,[]);checks.push('NO_PAGE_ERRORS_OR_EXTERNAL_NETWORK');
}catch(error){result='FAIL';errors.push(error.stack);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await new Promise(r=>server.close(r));}
const exit=result==='PASS'?0:1;
await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify({result,checks,errors,metrics,loaded,supplierCalls:0,exit},null,2));
console.log(`CANVAS_REGENERATION_PREVIEW=${result} CHECKS=${checks.length} ERRORS=${errors.length} SUPPLIER_CALLS=0 EXIT=${exit}`);
if(errors.length)console.error(errors.join('\n'));process.exitCode=exit;
