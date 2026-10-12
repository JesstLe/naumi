import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const root=path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const baseline=process.argv.includes('--baseline'), out=path.resolve(process.env.BROWSER_CACHE_EVIDENCE_DIR||'output/browser-cache-20261012');
await mkdir(out,{recursive:true});
const source=path.join(root,'src/lib/browser-data-cache.ts');
let js;
if(baseline) {
  const works=await readFile(path.join(root,'src/components/works/works-client.tsx'),'utf8');
  assert.ok(works.includes('await fetch(')&&!works.includes('loadAccountSnapshot'));
  js=`window.cache={loadAccountSnapshot:async email=>(await fetch('/api/account?email='+email)).json(),activateBrowserData(){},installBrowserDataObserver(){},invalidateBrowserData(){}}`;
} else {
  const bundle=await build({stdin:{contents:`import * as cache from ${JSON.stringify(source)}; window.cache=cache;`,resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function authHeader(){return {}}',loader:'js'}));}}]});
  js=bundle.outputFiles[0].text;
}
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/cache.js'?'application/javascript':'text/html');res.end(req.url==='/cache.js'?js:'<!doctype html><script src="/cache.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${server.address().port}`;
let browser;const checks=[];
try {
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const ctx=await browser.newContext();const errors=[];let calls=0,status=200,art='one',artStatus='completed',mutationStatus=200,held=null,delay=false;
  await ctx.route('**/api/**',async route=>{
    const method=route.request().method();if(method!=='GET')return route.fulfill({status:mutationStatus,json:{ok:mutationStatus===200}});
    calls++;const result={artworks:[{id:art,image:'/media/demo.png',title:art,status:artStatus}],user:{email:'SECRET',creditsTotal:99999,invoices:['SECRET']},stats:{today:1,total:2},token:'SECRET'};
    if(delay)await new Promise(r=>held=r);
    await route.fulfill({status,json:result});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  const setup=async p=>{await p.goto(base);await p.evaluate(()=>{window.offset=0;const now=Date.now;Date.now=()=>now()+window.offset;cache.installBrowserDataObserver();cache.activateBrowserData('a@example.test');});};
  await setup(page);
  const load=(p=page,email='a@example.test',query='')=>p.evaluate(({email,query})=>cache.loadAccountSnapshot(email,query),{email,query});
  await load();await load();
  assert.equal(calls,baseline?2:1);checks.push(`REPEAT_ACCOUNT_GET=${calls}`);
  if(baseline){console.log('BASELINE=PASS REPEAT_ACCOUNT_GET=2 INPUT=two_own_account_reads CACHE=ABSENT');}
  else {
    // Persistent IDB across JS reload, not merely a process memory hit.
    await setup(page);await load();assert.equal(calls,1);checks.push('RELOAD_IDB=PASS');
    const rows=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('naumi-business-cache-v1');r.onsuccess=()=>{const tx=r.result.transaction('snapshots');const req=tx.objectStore('snapshots').getAll();req.onsuccess=()=>resolve(req.result);};}));
    assert.ok(!(JSON.stringify(await rows()).includes('SECRET')));checks.push('AUTH_BALANCE_INVOICES=EXCLUDED');
    // Stale first render while network is held, followed by authoritative update.
    art='two';delay=true;
    await page.evaluate(()=>{window.offset=31_000;window.stale=null;window.pending=cache.loadAccountSnapshot('a@example.test','',d=>window.stale=d).then(d=>window.result=d).catch(e=>window.failure=e.message);});
    await page.waitForFunction(()=>window.stale?.artworks[0]?.id==='one');
    assert.equal(calls,2);delay=false;held();held=null;await page.waitForFunction(()=>window.result?.artworks[0]?.id==='two');checks.push('STALE_THEN_REVALIDATE=PASS');
    // Inflight dedup after invalidation.
    await page.evaluate(()=>cache.invalidateBrowserData());let before=calls;
    await page.evaluate(()=>Promise.all([cache.loadAccountSnapshot('a@example.test'),cache.loadAccountSnapshot('a@example.test')]));assert.equal(calls,before+1);checks.push('CONCURRENT_DEDUP=PASS');
    // Mutation starts invalidate; a late read cannot survive mutation completion.
    delay=true;await page.evaluate(()=>{cache.invalidateBrowserData();window.late=cache.loadAccountSnapshot('a@example.test').then(()=>window.lateStatus='ACCEPTED',()=>window.lateStatus='REJECTED');});
    await new Promise(r=>setTimeout(r,100));assert.ok(held);await page.evaluate(()=>fetch('/api/artworks/delete',{method:'POST'}));
    delay=false;held();held=null;await page.waitForFunction(()=>window.lateStatus==='REJECTED');checks.push('LATE_MUTATION_RESPONSE=BLOCKED');
    before=calls;await load();assert.equal(calls,before+1);
    // Cross-account reads cannot use the active partition, even repeated.
    before=calls;await load(page,'b@example.test');await load(page,'b@example.test');assert.equal(calls,before+2);checks.push('CROSS_ACCOUNT=LIVE');
    const second=await ctx.newPage();await setup(second);before=calls;await load(second);assert.equal(calls,before);
    await page.evaluate(()=>fetch('/api/artworks/rename',{method:'POST'}));await new Promise(r=>setTimeout(r,120));before=calls;await load(second);assert.equal(calls,before+1);checks.push('CROSS_TAB_MUTATION=PASS');
    // Logout purge and pending writes/reads cannot restore prior account data.
    delay=true;await second.evaluate(()=>{cache.invalidateBrowserData();window.old=cache.loadAccountSnapshot('a@example.test').then(()=>window.oldStatus='ACCEPTED',()=>window.oldStatus='REJECTED');});await new Promise(r=>setTimeout(r,100));
    await page.evaluate(()=>cache.activateBrowserData(null));await new Promise(r=>setTimeout(r,120));delay=false;held();held=null;await second.waitForFunction(()=>window.oldStatus==='REJECTED');
    await new Promise(r=>setTimeout(r,120));assert.equal((await rows()).filter(r=>r.account==='a@example.test').length,0);checks.push('LOGOUT_LATE_WRITE=BLOCKED');
    await page.evaluate(()=>cache.activateBrowserData('b@example.test'));await load(page,'b@example.test');assert.ok((await rows()).every(r=>r.account==='b@example.test'));checks.push('ACCOUNT_SWITCH=ISOLATED');
    await page.evaluate(()=>{cache.activateBrowserData('a@example.test');cache.invalidateBrowserData();});status=401;
    const forbidden=await load().then(()=>false,()=>true);assert.ok(forbidden);status=200;before=calls;await load();await load();assert.equal(calls,before+2);checks.push('UNAUTHORIZED=PURGED_AND_DISABLED');
    // Hard count/byte budget and expiration in real IndexedDB.
    await page.evaluate(()=>cache.activateBrowserData('a@example.test'));
    for(let i=0;i<9;i++)await load(page,'a@example.test','view=workbench&day='+i);
    let stored=await rows();assert.ok(stored.length<=6);assert.ok(stored.reduce((n,r)=>n+r.bytes,0)<=12*1024*1024);checks.push('BOUNDS=PASS');
    await page.evaluate(()=>window.offset+=301_000);await load(page,'a@example.test','view=workbench&day=new');stored=await rows();assert.equal(stored.length,1);checks.push('EXPIRED_EVICTION=PASS');
    // A quota failure must not fail the page/network request.
    await page.evaluate(()=>{cache.invalidateBrowserData();IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError')};});
    assert.equal((await load()).artworks[0].id,'two');checks.push('QUOTA_FALLBACK=PASS');
    await setup(page);await page.evaluate(()=>cache.invalidateBrowserData());
    artStatus='generating';before=calls;await load();await load();assert.equal(calls,before+2);artStatus='completed';checks.push('PENDING_TASKS=NOT_CACHED');
    await load();mutationStatus=500;
    const body=await page.evaluate(async()=>{const response=await fetch('/api/artworks/delete',{method:'POST'});return {status:response.status,data:await response.json()}});
    assert.equal(body.status,500);assert.equal(body.data.ok,false);mutationStatus=200;
    before=calls;await load();assert.equal(calls,before+1);checks.push('FAILED_MUTATION=NETWORK_RECHECK_RESPONSE_INTACT');
    before=calls;await page.evaluate(()=>fetch('/api/billing/quote',{method:'POST'}));await load();assert.equal(calls,before);checks.push('QUOTE=NO_BUSINESS_INVALIDATION');
    // Completely disabled browser storage still loads from the network.
    const fallback=await ctx.newPage();await fallback.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('blocked')}});});await setup(fallback);before=calls;await load(fallback);assert.equal(calls,before+1);checks.push('DISABLED_IDB=NETWORK');
    assert.deepEqual(errors,[]);
    console.log('MODIFIED=PASS REPEAT_ACCOUNT_GET=1 RELOAD_ACCOUNT_GET=0 CHECKS='+checks.length+' PROVIDER_CALLS=0');
  }
  await writeFile(path.join(out,baseline?'baseline-cache.json':'modified-cache.json'),JSON.stringify({baseline,checks,calls},null,2));
} finally {await browser?.close();await new Promise(r=>server.close(r));}
