/* Actual WorkbenchClient (including its effects and controls), React/DOM 19,
 * Chromium and loopback HTTP. Auth, unrelated UI and backend are fixtures.
 * No production/PG/provider access; no accelerated or fake polling timers. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createServer } = require('node:http');
const deps = process.env.REVIEW_DEPS || path.resolve('node_modules');
const req = createRequire(path.join(deps, 'package.json'));
const { build } = req('esbuild');
const { chromium } = req('playwright');
const root = process.cwd();
const source = path.resolve(process.argv[2] || 'src/components/home/workbench-client.tsx');
const sourceRoot=path.resolve(path.dirname(source),'../../..');
const ownerPath=path.join(sourceRoot,'src/lib/agent/workbench-session.ts');
const recoveryOwner=fs.existsSync(ownerPath)?{path:ownerPath,sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(ownerPath)).digest('hex')}:null;
const out = path.resolve(process.argv[3] || process.env.WORKBENCH_EVIDENCE || 'output/capacity-workbench-mutations-20261030/modified');
fs.mkdirSync(out, { recursive: true });
assert.match(req('react').version, /^19\./);
assert.equal(req('react').version, req('react-dom').version);
const evidence = { tier: 'Actual React19 WorkbenchClient + Chromium + real timers/loopback HTTP; auth/backend/unrelated UI fixtures', source, sourceSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex'), react: req('react').version, checks: [], failures: [], observations: [], requests: [] };
evidence.recoveryOwner=recoveryOwner;
evidence.applicationOwners=['workbench-session.ts','workbench-contract.ts','workbench-session-catalog.ts','workbench-attachments.ts'].filter(name=>fs.existsSync(path.join(sourceRoot,'src/lib/agent',name))).map(name=>({path:path.join(sourceRoot,'src/lib/agent',name),sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,'src/lib/agent',name))).digest('hex')}));
evidence.sourceSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex');
let browser, browserServer, server, context, page, origin;
let currentCase='';
const explicitSendCases=new Set(['existing explicit SSE send and save retain exact identity and payload','old SSE completion cannot overwrite recovered account or save as new actor','deferred save authorization cannot use the newly selected account','StrictMode bootstrap prompt submits once without being lost']);
let requests = [], plans = [], holds = new Map(), count = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));
const sessions = id => ({ session: { title: id, messages: [{ role: 'user', content: 'original prompt [商品图] /media/reference.png' }, { role: 'assistant', content: 'history-' + id }], steps: [{ tool: 'fixture-tool', summary: 'kept' }] } });
const summaries = ['A','B'].map(id=>({id,title:id,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',messageCount:2}));
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); }
function plan(kind, id, nth, action) { plans.push({ kind, id, nth, ...action }); }
async function snapshot() { return page.evaluate(() => ({ ...window.w.state(), resources: window.metrics() })); }
async function reset(strict = false, options = {}) {
  if (context) { evidence.requests.push(...requests); await context.close(); }
  for (const resolve of holds.values()) resolve();
  holds = new Map(); requests = []; plans = []; count = new Map();
  context = await browser.newContext(); page = await context.newPage();page.setDefaultTimeout(5000);
  await page.goto(origin);
  await page.evaluate(({strict,options})=>{window.authReady=options.ready??true;if('actor' in options)window.actor=options.actor;if(options.prompt)window.history.replaceState(null,'','/?prompt='+encodeURIComponent(options.prompt));window.mount(strict)}, {strict,options});
  await page.waitForFunction(() => window.w);
}
async function call(name, arg) { await page.evaluate(({ name, arg }) => { void window.w[name](arg); }, { name, arg }); }
async function until(fn, timeout = 4000) { await page.waitForFunction(fn, null, { timeout }); }
async function waitRequest(kind, id, nth = 1) {
  for (let i = 0; i < 300; i++) { if ((count.get(kind + ':' + id) || 0) >= nth) return; await delay(10); }
  throw new Error('request not reached: ' + kind + ':' + id + ':' + nth);
}
async function release(key) { holds.get(key)?.(); holds.delete(key); }
async function check(name, fn) {
  currentCase=name;
  if(process.env.WORKBENCH_CASE && !name.includes(process.env.WORKBENCH_CASE)) return;
  try { await fn(); evidence.checks.push(name); console.log('PASS ' + name); }
  catch (e) { const state=page?await snapshot().catch(()=>null):null;evidence.failures.push({ name, error: e.message, state }); console.log('FAIL ' + name + ': ' + e.message); }
}
async function openUi(id) {
  await page.getByRole('button',{name:/^历史(对话)?$/}).click();
  const button=page.getByRole('button').filter({has:page.getByText(id,{exact:true})});
  await button.waitFor();assert.equal(await button.isDisabled(),false,'history selection enabled');await button.click();
}
function observe(name, value) { evidence.observations.push({ name, ...value }); console.log('OBS ' + name + ' ' + JSON.stringify(value)); }

async function main() {
  const stubs = `import React from 'react';
const identities=new Map();const identity=()=>{if(!window.actor)return null;if(!identities.has(window.actor))identities.set(window.actor,{email:window.actor,name:window.actor});return identities.get(window.actor)};
export const useAuth=()=>{const [,r]=React.useState(0);React.useEffect(()=>{window.authRender=()=>r(x=>x+1);return()=>{window.authRender=null}},[]);return {user:identity(),ready:window.authReady,remaining:100}};
export const authHeader=async()=>{const actor=window.actor;if(window.authGate)await window.authGate;return {'x-fixture-actor':actor||'guest'}};
export const useFeatureAccess=()=>({can:()=>true,canPage:()=>true});export const FeatureVisible=({children})=>children;
export const useSiteProfile=()=>({mode:'personal',policy:{brand:'fixture'}});
export const useI18n=()=>({t:k=>k,locale:'zh'});export const useAuthModal=()=>({openAuth:()=>{}});
export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(window.location.search),[]);export const useWorkspaceRouter=()=>({push:()=>{}});
export const loadAccountSnapshot=async()=>({artworks:[],stats:{today:0,total:0}});export const invalidateBrowserData=()=>{};
export const cn=(...a)=>a.filter(x=>typeof x==='string').join(' ');export const agentMediaUrl=x=>x;export const cdnUrl=x=>x;
export const toolBySlug=()=>undefined;export const toolImageError=()=>null;export const downloadImage=()=>{};export const useClipboardImagePaste=()=>()=>{};
export const currentWorkspace=()=>"personal",WORKSPACE_SELECTION="fixture:workspace";
export const CreationWorkbench=()=>null;
export const CachedImage=()=>null,Media=()=>null,SkillBook=()=>null,TextModelSelect=()=>null,TemplatesClient=()=>null,WorkbenchSessions=()=>null;
export const Check=()=>null,MessageSquare=()=>null,Pencil=()=>null,Trash2=()=>null;export const ArrowRight=()=>null,ArrowUp=()=>null,ArrowUpRight=()=>null,Bot=()=>null,History=()=>null,LayoutGrid=()=>null,Loader2=()=>null,MessageSquarePlus=()=>null,Network=()=>null,Plus=()=>null,Upload=()=>null,Wrench=()=>null,X=()=>null;
export default function Link({children,...p}){return <a {...p}>{children}</a>}`;
  const instrument = `
  window.w={loadSession,stopRun,newConversation,send,refreshSessions,renameSession,removeSession,submitComposer,resolveArtworkId,
    state:()=>({messages,busy,running,error,activeTitle,composerFilesCount:composerFiles.length,composerPreviewsCount:composerPreviews.length,artworkCache:${fs.readFileSync(source,'utf8').includes('const artworkIdRef')?'{...artworkIdRef.current}':'sessionRecovery.attachments.snapshot()'},sessionLoadingId,sessionId:sessionIdRef.current,sessions,input,attachments,composerText,composerError,composerSubmitting,uploading,${fs.readFileSync(source,'utf8').includes('recoveryUnavailable') ? (recoveryOwner?'recoveryUnavailable,owner:sessionRecovery.snapshot(),':'recoveryUnavailable,owner:recoveryRef.current?{id:recoveryRef.current.id,phase:recoveryRef.current.phase,generation:recoveryRef.current.generation}:null,') : ''}})};
`;
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {WorkbenchClient} from ${JSON.stringify(source.replaceAll('\\','/'))};
window.actor='a@example.test';window.authReady=true;const root=createRoot(document.getElementById('root'));window.mount=(strict=false)=>flushSync(()=>root.render(strict?<React.StrictMode><WorkbenchClient/></React.StrictMode>:<WorkbenchClient/>));window.detach=()=>flushSync(()=>root.render(null));window.setAuthReady=v=>{window.authReady=v;flushSync(()=>window.authRender?.())};window.account=a=>{window.actor=a;flushSync(()=>window.authRender?.())};
const timers=new Map(),listeners=new Map(),nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);let peakTimers=0,peakListeners=0;
window.setTimeout=(fn,ms,...args)=>{let id=nativeSet(()=>{timers.delete(id);fn(...args)},ms);if(ms===1200){timers.set(id,ms);peakTimers=Math.max(peakTimers,timers.size)}return id};window.clearTimeout=id=>{timers.delete(id);nativeClear(id)};
const add=AbortSignal.prototype.addEventListener,remove=AbortSignal.prototype.removeEventListener;
AbortSignal.prototype.addEventListener=function(type,fn,opt){if(type==='abort'){let set=listeners.get(this);if(!set)listeners.set(this,set=new Set());set.add(fn);peakListeners=Math.max(peakListeners,[...listeners.values()].reduce((n,s)=>n+s.size,0))}return add.call(this,type,fn,opt)};
AbortSignal.prototype.removeEventListener=function(type,fn,opt){if(type==='abort')listeners.get(this)?.delete(fn);return remove.call(this,type,fn,opt)};
window.errors=[];window.addEventListener('unhandledrejection',e=>{window.errors.push(String(e.reason));e.preventDefault()});window.addEventListener('error',e=>window.errors.push(e.message));
const nativeFetch=window.fetch.bind(window);let active=0,peakFetch=0,bytes=0;window.fetch=async(...args)=>{active++;peakFetch=Math.max(peakFetch,active);try{const res=await nativeFetch(...args);const raw=res.json.bind(res);res.json=async()=>{const data=await raw();bytes+=new TextEncoder().encode(JSON.stringify(data)).length;if(window.jsonGate&&args[0].includes(window.jsonGate.match)&&(!window.jsonGate.method||(args[1]?.method||'GET')===window.jsonGate.method)){const gate=window.jsonGate;window.jsonGate=null;window.jsonWaiting=true;await gate.promise;}return data};return res}finally{active--}};
window.holdJson=(match,method)=>{let release;const promise=new Promise(r=>release=r);window.jsonGate={match,method,promise};window.releaseJson=()=>{window.jsonWaiting=false;release()}};
window.holdAuth=()=>{window.authGate=new Promise(r=>window.releaseAuth=()=>{window.authGate=null;r()})};
window.metrics=()=>({timers:timers.size,peakTimers,listeners:[...listeners.values()].reduce((n,s)=>n+s.size,0),peakListeners,activeFetch:active,peakFetch,jsonBytes:bytes,errors:window.errors});`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', nodePaths: [deps], define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture-boundaries', setup(b) {
    b.onLoad({ filter: /.*/ }, args => path.resolve(args.path)===source ? ({ contents: fs.readFileSync(args.path, 'utf8').replace('  // ── 对话态(沉浸式:', instrument + '\n  // ── 对话态(沉浸式:'), loader: 'tsx', resolveDir: path.dirname(args.path) }) : undefined);
    b.onResolve({filter:/^\.\/creation-workbench$/},()=>({path:'creation-workbench',namespace:'fixture'}));
    b.onResolve({ filter: /^(@\/|next\/|lucide-react$)/ }, args => args.path === '@/lib/clipboard-images' ? ({path:path.join(root,'src/lib/clipboard-images.ts')}) : args.path === '@/lib/agent/workbench-session' ? ({path:ownerPath}) : args.path === '@/components/home/workbench-sessions' ? ({path:path.join(root,'src/components/home/workbench-sessions.tsx')}) : ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: stubs, loader: 'tsx', resolveDir: root }));
  } }] });
  server = createServer(async (r, s) => {
    if (r.url === '/') { s.setHeader('content-type','text/html; charset=utf-8'); s.end('<meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>'); return; }
    if (r.url === '/bundle.js') { s.setHeader('content-type','text/javascript; charset=utf-8'); s.end(bundle.outputFiles[0].contents); return; }
    const url = new URL(r.url, 'http://fixture');
    const kind = url.pathname === '/api/account' ? 'account' : r.method === 'PATCH' && url.pathname === '/api/agent/session' ? 'rename' : r.method === 'DELETE' ? 'stop' : r.method === 'PUT' ? 'send' : r.method === 'POST' ? 'save' : url.pathname === '/api/agent/session' ? (url.searchParams.has('id') ? 'history' : 'list') : 'live';
    const id = url.searchParams.get('id') || url.searchParams.get('sessionId') || url.searchParams.get('email') || '';
    const key = kind + ':' + id; const nth = (count.get(key) || 0) + 1; count.set(key, nth);
    const record={ scenario:currentCase, intentionalSendFixture:true, method:r.method,url:r.url, kind,id,nth,actor:r.headers['x-fixture-actor'],since:url.searchParams.get('since'),responseBytes:0,closed:false };
    requests.push(record);s.on('close',()=>{record.closed=true});
    const end=s.end.bind(s),write=s.write.bind(s);s.end=(chunk,...rest)=>{if(chunk)record.responseBytes+=Buffer.byteLength(chunk);return end(chunk,...rest)};s.write=(chunk,...rest)=>{if(chunk)record.responseBytes+=Buffer.byteLength(chunk);return write(chunk,...rest)};
    if(r.method!=='GET'){let raw='';for await(const part of r)raw+=part;record.input=raw}
    const action = plans.find(p=>p.kind===kind&&p.id===id&&(p.nth===nth||(p.repeat&&nth>=p.nth))) || {};
    if (action.sse) {
      s.writeHead(200,{'content-type':'text/event-stream'});
      s.write('event: open\ndata: '+JSON.stringify({sessionId:action.sessionId||'LIVE'})+'\n\n');
      for(const event of action.events||[])s.write('event: '+event.type+'\ndata: '+JSON.stringify(event.data)+'\n\n');await new Promise(resolve=>holds.set(action.sse,resolve));
      if(!s.destroyed)s.end('event: final\ndata: '+JSON.stringify({reply:action.reply||'original final'})+'\n\n');
      return;
    }
    if(action.bodyHold){const raw=JSON.stringify(action.data||{running:true,total:0,events:[]});s.writeHead(200,{'content-type':'application/json'});s.write(raw.slice(0,10));await new Promise(resolve=>holds.set(action.bodyHold,resolve));if(!s.destroyed)s.end(raw.slice(10));return;}
    if (action.hold) await new Promise(resolve=>holds.set(action.hold,resolve));
    if (s.destroyed) return;
    if (action.disconnect) { s.destroy(); return; }
    if (action.invalid) { s.writeHead(200,{'content-type':'application/json'});s.end('{invalid');return; }
    if (action.status) { json(s,action.status,{error:'fixture-'+action.status});return; }
    if (r.method !== 'GET') { json(s,200,action.data||{ok:true});return; }
    json(s,200,action.data || (kind==='history' ? sessions(id) : kind==='list' ? {sessions:summaries} : {running:true,total:nth,events:[]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); origin='http://127.0.0.1:'+server.address().port;
  browserServer=await chromium.launchServer({headless:true});evidence.resources={nodePid:process.pid,browserPid:browserServer.process().pid,httpPort:server.address().port};browser=await chromium.connect(browserServer.wsEndpoint());

  async function sendUi(text) {
    const dashboard=page.getByTestId('dashboard-textarea');
    const isDashboard=await dashboard.count();
    await (isDashboard?dashboard:page.getByTestId('chat-textarea')).fill(text);
    await page.getByRole('button',{name:isDashboard?'home.dash.composeSend':'发送',exact:true}).click();
  }
  async function closeDrawer(){const x=page.getByRole('button',{name:'关闭',exact:true});if(await x.count())await x.click();}


  const imageFile={name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')};
  const asset=(name='A')=>({artwork:{id:name+'-art',image:'/media/'+name+'-private.png'}});
  async function loaded(id='A') {plan('live',id,(count.get('live:'+id)||0)+1,{data:{running:false,total:0,events:[]}});await openUi(id);await until(()=>!window.w.state().sessionLoadingId);await closeDrawer();assert.equal((await snapshot()).sessionId,id);}
  async function renameUi(title='renamed') {await page.getByRole('button',{name:/^历史(对话)?$/}).click();await page.getByRole('button',{name:'重命名 A',exact:true}).click();await page.getByRole('textbox',{name:'会话名称',exact:true}).fill(title);await page.getByRole('button',{name:'保存会话名称',exact:true}).click();}
  async function removeUi() {await page.getByRole('button',{name:/^历史(对话)?$/}).click();await page.getByRole('button',{name:'删除 A',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();}
  async function files(n=1) {await page.locator('input[type=file]').setInputFiles(Array.from({length:n},(_,i)=>({...imageFile,name:'ref-'+i+'.png'})));}
  async function paste(n=1) {await page.getByTestId('chat-textarea').evaluate((el,n)=>{const d=new DataTransfer();for(let i=0;i<n;i++)d.items.add(new File([new Uint8Array([137,80,78,71])],'paste-'+i+'.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));},n);}
  async function changed(aba=false){await page.evaluate(aba=>{window.account('b@example.test');if(aba)window.account('a@example.test')},aba)}
  function uploadRequests(){return requests.filter(v=>v.url==='/api/artworks/add')}
  async function gateJson(match,method){await page.evaluate(({match,method})=>window.holdJson(match,method),{match,method})}
  async function releaseJson(){await page.evaluate(()=>window.releaseJson());await delay(60)}

  async function lookup(url='/media/scoped.png') {await page.evaluate(url=>{window.lookupResult='pending';void window.w.resolveArtworkId(url).then(value=>window.lookupResult=value)},url)}
  const library={artworks:[{id:'scoped-art',image:'https://origin.test/media/scoped.png?old=1'}]};
  for(const mutation of ['rename','delete']){
    await check(mutation+' success invalidates an older parsed session list',async()=>{await reset();await loaded();const nth=(count.get('list:')||0)+1;plan('list','',nth,{data:{sessions:summaries}});await gateJson('/api/agent/session','GET');await call('refreshSessions');await until(()=>window.jsonWaiting);if(mutation==='rename')await page.evaluate(()=>window.w.renameSession('A','new title'));else await page.evaluate(()=>window.w.removeSession('A'));await releaseJson();const s=await snapshot();if(mutation==='rename')assert.equal(s.sessions.find(v=>v.id==='A').title,'new title');else assert.ok(!s.sessions.some(v=>v.id==='A'));});
  }
  await check('artwork lookup cannot return or cache an old account response',async()=>{await reset();plan('account','a@example.test',1,{hold:'library',data:library});await lookup();await waitRequest('account','a@example.test');await changed();await release('library');await until(()=>window.lookupResult!=='pending');assert.equal(await page.evaluate(()=>window.lookupResult),null);assert.deepEqual((await snapshot()).artworkCache,{});});
  await check('artwork auth await cannot issue a lookup as a later account',async()=>{await reset();await page.evaluate(()=>window.holdAuth());await lookup();await changed();await page.evaluate(()=>window.releaseAuth());await until(()=>window.lookupResult!=='pending');assert.equal(requests.filter(r=>r.kind==='account').length,0);assert.equal(await page.evaluate(()=>window.lookupResult),null);});
  await check('artwork parsed response cannot revive account ABA',async()=>{await reset();plan('account','a@example.test',1,{data:library});await gateJson('/api/account');await lookup();await until(()=>window.jsonWaiting);await changed(true);await releaseJson();await until(()=>window.lookupResult!=='pending');assert.equal(await page.evaluate(()=>window.lookupResult),null);assert.deepEqual((await snapshot()).artworkCache,{});});
  await check('artwork index reset detaches lookup but keeps same account uploads',async()=>{await reset();plan('account','a@example.test',1,{data:library});await gateJson('/api/account');await lookup();await until(()=>window.jsonWaiting);await page.evaluate(()=>{window.setAuthReady(false);window.setAuthReady(true)});await releaseJson();await until(()=>window.lookupResult!=='pending');assert.equal(await page.evaluate(()=>window.lookupResult),null);assert.deepEqual((await snapshot()).artworkCache,{});});
  await check('artwork aliases reuse cache and preserve raw account identity',async()=>{await reset(false,{actor:'A.Mixed+Tag@Example.test'});plan('account','A.Mixed+Tag@Example.test',1,{data:{artworks:[{id:'encoded-art',image:'https://origin.test/media/a%20b.png?token=old'}]}});await lookup('https://cdn.test/other/a%20b.png?token=new');await until(()=>window.lookupResult!=='pending');assert.equal(await page.evaluate(()=>window.lookupResult),'encoded-art');await lookup('/another/a b.png');await until(()=>window.lookupResult!=='pending');assert.equal(await page.evaluate(()=>window.lookupResult),'encoded-art');const reads=requests.filter(r=>r.kind==='account');assert.equal(reads.length,1);assert.equal(reads[0].actor,'A.Mixed+Tag@Example.test');assert.equal(reads[0].id,'A.Mixed+Tag@Example.test');});
  await check('chat batch preserves successes after one failed reference',async()=>{await reset();await loaded();plan('save','',1,{status:503});plan('save','',2,{data:asset('second')});await files(2);await until(()=>!window.w.state().uploading);assert.deepEqual((await snapshot()).attachments,['/media/second-private.png']);assert.equal(uploadRequests().length,2);});
  await check('portal requires every reference and does not submit after upload failure',async()=>{await reset();await page.locator('input[type=file]').setInputFiles([imageFile,{...imageFile,name:'second.png'}]);await page.getByTestId('dashboard-textarea').fill('all references required');plan('save','',1,{status:503});await page.getByRole('button',{name:'home.dash.composeSend',exact:true}).click();await until(()=>!window.w.state().composerSubmitting);const s=await snapshot();assert.equal(s.composerFilesCount,2);assert.equal(s.composerError,'参考图上传失败，请重试');assert.equal(s.uploading,false);assert.equal(uploadRequests().length,1);assert.equal(requests.filter(v=>v.kind==='send').length,0);});

  await check('rename same-account success preserves normalized title and list',async()=>{await reset();await loaded();await renameUi('  exact   renamed  ');await waitRequest('rename','');await until(()=>window.w.state().activeTitle==='exact renamed');assert.equal((await snapshot()).sessions.find(s=>s.id==='A').title,'exact renamed');assert.equal(JSON.parse(requests.find(v=>v.kind==='rename').input).title,'exact renamed');});
  await check('delete same-account success removes current session',async()=>{await reset();await loaded();await removeUi();await waitRequest('stop','A');await until(()=>window.w.state().sessionId==='');assert.ok(!(await snapshot()).sessions.some(s=>s.id==='A'));});
  for(const kind of ['rename','delete']){
    const key=kind==='rename'?'rename':'stop',id=kind==='rename'?'':'A',trigger=kind==='rename'?renameUi:removeUi;
    await check(kind+' current HTTP failure stays visible',async()=>{await reset();plan(key,id,1,{status:503});await trigger();await until(()=>window.w.state().error==='fixture-503');});
    await check(kind+' current network failure has handled feedback',async()=>{await reset();plan(key,id,1,{disconnect:true,repeat:true});await trigger();await page.waitForFunction(()=>window.w.state().error!==null||window.errors.length>0);await delay(30);assert.equal((await snapshot()).error,kind==='rename'?'会话重命名失败':'会话删除失败');assert.deepEqual((await snapshot()).resources.errors,[]);});
    await check(kind+' late HTTP failure cannot touch switched account',async()=>{await reset();plan(key,id,1,{hold:'mutation',status:503});await trigger();await waitRequest(key,id);await changed();await release('mutation');await delay(70);assert.equal((await snapshot()).error,null);});
    await check(kind+' error JSON continuation cannot revive account ABA',async()=>{await reset();plan(key,id,1,{status:503});await gateJson('/api/agent/session',kind==='rename'?'PATCH':'DELETE');await trigger();await until(()=>window.jsonWaiting);await changed(true);await releaseJson();assert.equal((await snapshot()).error,null);});
    await check(kind+' auth await cannot issue mutation as a later account',async()=>{await reset();await page.getByRole('button',{name:'历史对话',exact:true}).click();await delay(40);await page.evaluate(()=>window.holdAuth());if(kind==='rename')await page.evaluate(()=>{void window.w.renameSession('A','new')});else await call('removeSession','A');await changed();await page.evaluate(()=>window.releaseAuth());await delay(70);assert.equal(requests.filter(v=>v.kind===key&&v.method!=='GET').length,0);});
    await check(kind+' response after unmount has no state effects',async()=>{await reset();plan(key,id,1,{hold:'unmounted',status:503});await trigger();await waitRequest(key,id);await page.evaluate(()=>window.detach());await release('unmounted');await delay(60);assert.equal((await snapshot()).error,null);assert.deepEqual((await snapshot()).resources.errors,[]);});
    await check(kind+' same-account readiness preserves original operation',async()=>{await reset();plan(key,id,1,{hold:'ready'});await trigger();await waitRequest(key,id);await page.evaluate(()=>{window.setAuthReady(false);window.setAuthReady(true)});await release('ready');await delay(80);const s=await snapshot();if(kind==='rename')assert.equal(s.sessions.find(v=>v.id==='A').title,'renamed');else assert.ok(!s.sessions.some(v=>v.id==='A'));});
  }
  await check('file upload normal URL artwork cache and busy lifecycle',async()=>{await reset();await loaded();plan('save','',1,{data:asset()});await files();await until(()=>!window.w.state().uploading&&window.w.state().attachments.length===1);const s=await snapshot();assert.deepEqual(s.attachments,['/media/A-private.png']);assert.equal(Object.values(s.artworkCache)[0],'A-art');assert.equal(uploadRequests()[0].actor,'a@example.test');});
  await check('native paste normal attachment',async()=>{await reset();await loaded();plan('save','',1,{data:asset()});await paste();await until(()=>!window.w.state().uploading&&window.w.state().attachments.length===1);assert.deepEqual((await snapshot()).attachments,['/media/A-private.png']);});
  for(const method of ['file','paste']){
    await check(method+' late upload cannot append to later account',async()=>{await reset();await loaded();plan('save','',1,{hold:'upload',data:asset()});await (method==='file'?files(2):paste(2));await waitRequest('save','');await changed();await release('upload');await delay(100);const s=await snapshot();assert.equal(s.attachments.length,0);assert.deepEqual(s.artworkCache,{});assert.equal(s.uploading,false);assert.equal(uploadRequests().length,1,'second file not submitted after detach');});
  }
  await check('parsed upload JSON cannot revive prior account ABA',async()=>{await reset();await loaded();plan('save','',1,{data:asset()});await gateJson('/api/artworks/add');await files();await until(()=>window.jsonWaiting);await changed(true);await releaseJson();assert.deepEqual((await snapshot()).attachments,[]);assert.deepEqual((await snapshot()).artworkCache,{});});
  await check('same-account session ABA detaches old upload but not new view',async()=>{await reset();await loaded();plan('save','',1,{data:asset()});await gateJson('/api/artworks/add');await files();await until(()=>window.jsonWaiting);await loaded('B');await loaded('A');await releaseJson();assert.deepEqual((await snapshot()).attachments,[]);assert.equal((await snapshot()).uploading,false);});
  await check('unmount releases actual pending upload response body',async()=>{await reset();await loaded();plan('save','',1,{bodyHold:'body',data:asset()});await files();await waitRequest('save','');await page.evaluate(()=>window.detach());await delay(80);assert.equal(uploadRequests()[0].closed,true);await release('body');assert.deepEqual((await snapshot()).resources.errors,[]);});
  await check('same-account ready false true keeps upload ownership',async()=>{await reset();await loaded();plan('save','',1,{data:asset()});await gateJson('/api/artworks/add');await paste();await until(()=>window.jsonWaiting);await page.evaluate(()=>{window.setAuthReady(false);window.setAuthReady(true)});await releaseJson();assert.deepEqual((await snapshot()).attachments,['/media/A-private.png']);assert.equal((await snapshot()).uploading,false);});
  await check('upload ordinary HTTP failure releases busy and reports error',async()=>{await reset();await loaded();plan('save','',1,{status:503});await files();await until(()=>!window.w.state().uploading);assert.equal((await snapshot()).error,'fixture-503');assert.deepEqual((await snapshot()).attachments,[]);});
  await check('upload error JSON cannot overwrite later account error',async()=>{await reset();await loaded();plan('save','',1,{status:503});await gateJson('/api/artworks/add');await files();await until(()=>window.jsonWaiting);await changed();await releaseJson();assert.equal((await snapshot()).error,null);});
  await check('upload auth wait issues no POST after account switch',async()=>{await reset();await loaded();await page.evaluate(()=>window.holdAuth());await files();await changed();await page.evaluate(()=>window.releaseAuth());await delay(70);assert.equal(uploadRequests().length,0);assert.equal((await snapshot()).uploading,false);});
  await check('concurrent paste batches retain busy until both settle',async()=>{await reset();await loaded();plan('save','',1,{hold:'one',data:asset('one')});plan('save','',2,{hold:'two',data:asset('two')});await paste();await waitRequest('save','');await paste();await waitRequest('save','',2);await release('one');await delay(70);assert.equal((await snapshot()).uploading,true);assert.deepEqual((await snapshot()).attachments,['/media/one-private.png']);await release('two');await until(()=>!window.w.state().uploading);assert.deepEqual((await snapshot()).attachments,['/media/one-private.png','/media/two-private.png']);});
  await check('detached older finally cannot clear a new upload busy flag',async()=>{await reset();await loaded();plan('save','',1,{data:asset('old')});await gateJson('/api/artworks/add');await files();await until(()=>window.jsonWaiting);await call('newConversation');await loaded('B');plan('save','',2,{hold:'new',data:asset('new')});await files();await waitRequest('save','',2);await releaseJson();assert.equal((await snapshot()).uploading,true);assert.deepEqual((await snapshot()).attachments,[]);await release('new');await until(()=>!window.w.state().uploading);assert.deepEqual((await snapshot()).attachments,['/media/new-private.png']);});
  await check('rename stale success does not update reused account session list',async()=>{await reset();plan('rename','',1,{hold:'rename-success'});await renameUi();await waitRequest('rename','');await changed(true);await call('refreshSessions');await delay(60);await release('rename-success');await delay(70);assert.equal((await snapshot()).sessions.find(s=>s.id==='A').title,'A');});
  await check('delete stale success does not remove reused account session list',async()=>{await reset();plan('stop','A',1,{hold:'delete-success'});await removeUi();await waitRequest('stop','A');await changed(true);await call('refreshSessions');await delay(60);await release('delete-success');await delay(70);assert.ok((await snapshot()).sessions.some(s=>s.id==='A'));});
  await check('portal staged references clear only on real account change',async()=>{await reset();await page.locator('input[type=file]').setInputFiles(imageFile);await page.getByTestId('dashboard-textarea').fill('private A draft');assert.equal((await snapshot()).composerFilesCount,1);await changed();const s=await snapshot();assert.equal(s.composerFilesCount,0);assert.equal(s.composerPreviewsCount,0);assert.equal(s.composerText,'');});
  await check('portal upload error continuation stays with originating account',async()=>{await reset();await page.locator('input[type=file]').setInputFiles(imageFile);await page.getByTestId('dashboard-textarea').fill('with reference');plan('save','',1,{status:503});await gateJson('/api/artworks/add');await page.getByRole('button',{name:'home.dash.composeSend',exact:true}).click();await until(()=>window.jsonWaiting);await changed();await releaseJson();const s=await snapshot();assert.equal(s.error,null);assert.equal(s.composerError,null);assert.equal(s.composerFilesCount,0);assert.equal(s.composerSubmitting,false);assert.equal(s.uploading,false);assert.equal(requests.filter(v=>v.kind==='send').length,0);});
  await check('portal successful reference upload retains original send contract',async()=>{await reset();await page.locator('input[type=file]').setInputFiles(imageFile);await page.getByTestId('dashboard-textarea').fill('exact portal prompt');plan('save','',1,{data:asset('portal')});plan('send','',1,{sse:'portal'});await page.getByRole('button',{name:'home.dash.composeSend',exact:true}).click();await waitRequest('send','');const body=JSON.parse(requests.find(v=>v.kind==='send').input);assert.deepEqual(body.images,['/media/portal-private.png']);assert.equal(body.message,'exact portal prompt\n[商品图] /media/portal-private.png');await release('portal');await until(()=>!window.w.state().busy);assert.equal((await snapshot()).uploading,false);});

}
main().catch(e=>{evidence.failures.push({name:'runner',error:e.stack});console.error(e.stack)}).finally(async()=>{
  for(const release of holds.values())release();
  if(context){evidence.requests.push(...requests);await context.close()}
  if(browser)await browser.close();
  if(browserServer){await browserServer.close();evidence.resources.browserExitCode=browserServer.process().exitCode;}
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
  evidence.closed={browser:true,http:true,httpListening:server?.listening};
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2));
  console.log(`WORKBENCH_MUTATIONS checks=${evidence.checks.length+evidence.failures.length} passed=${evidence.checks.length} failed=${evidence.failures.length} RECOVERY_PUT_POST=${evidence.requests.filter(r=>['PUT','POST'].includes(r.method)&&!r.intentionalSendFixture).length} EXPLICIT_MOCK_PUT=${evidence.requests.filter(r=>r.kind==='send').length} MOCK_SAVE_POST=${evidence.requests.filter(r=>r.kind==='save').length} PAID_SUPPLIER_REQUESTS=0 HTTP_CLOSED=true BROWSER_CLOSED=true`);
  if(!evidence.failures.length)console.log('WORKBENCH_SESSION_MUTATIONS=PASS OWNER='+(recoveryOwner?'ACTUAL_APPLICATION':'ORIGINAL_COMPONENT'));
  process.exitCode=evidence.failures.length?1:0;
});
