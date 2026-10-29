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
const out = path.resolve(process.argv[3] || 'output/workbench-recovery-20261029/modified');
fs.mkdirSync(out, { recursive: true });
assert.match(req('react').version, /^19\./);
assert.equal(req('react').version, req('react-dom').version);
const evidence = { tier: 'Actual React19 WorkbenchClient + Chromium + real timers/loopback HTTP; auth/backend/unrelated UI fixtures', source, react: req('react').version, checks: [], failures: [], observations: [], requests: [] };
let browser, server, context, page, origin;
let currentCase='';
const explicitSendCases=new Set(['existing explicit SSE send and save retain exact identity and payload','old SSE completion cannot overwrite recovered account or save as new actor','deferred save authorization cannot use the newly selected account','StrictMode bootstrap prompt submits once without being lost']);
let requests = [], plans = [], holds = new Map(), count = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));
const sessions = id => ({ session: { title: id, messages: [{ role: 'user', content: 'original prompt [商品图] /media/reference.png' }, { role: 'assistant', content: 'history-' + id }], steps: [{ tool: 'fixture-tool', summary: 'kept' }] } });
const summaries = ['A','B'].map(id=>({id,title:id,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',messageCount:2}));
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); }
function plan(kind, id, nth, action) { plans.push({ kind, id, nth, ...action }); }
async function snapshot() { return page.evaluate(() => ({ ...window.w.state(), resources: window.metrics() })); }
async function reset(strict = false) {
  if (context) { evidence.requests.push(...requests); await context.close(); }
  for (const resolve of holds.values()) resolve();
  holds = new Map(); requests = []; plans = []; count = new Map();
  context = await browser.newContext(); page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(s => window.mount(s), strict);
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
export const useAuth=()=>{const [,r]=React.useState(0);React.useEffect(()=>{window.authRender=()=>r(x=>x+1);return()=>{window.authRender=null}},[]);return {user:identity(),ready:true,remaining:100}};
export const authHeader=async()=>{const actor=window.actor;if(window.authGate)await window.authGate;return {'x-fixture-actor':actor||'guest'}};
export const useFeatureAccess=()=>({can:()=>true,canPage:()=>true});export const FeatureVisible=({children})=>children;
export const useSiteProfile=()=>({mode:'personal',policy:{brand:'fixture'}});
export const useI18n=()=>({t:k=>k,locale:'zh'});export const useAuthModal=()=>({openAuth:()=>{}});
export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(window.location.search),[]);export const useWorkspaceRouter=()=>({push:()=>{}});
export const loadAccountSnapshot=async()=>({artworks:[],stats:{today:0,total:0}});export const invalidateBrowserData=()=>{};
export const cn=(...a)=>a.filter(x=>typeof x==='string').join(' ');export const agentMediaUrl=x=>x;export const cdnUrl=x=>x;
export const toolBySlug=()=>undefined;export const toolImageError=()=>null;export const downloadImage=()=>{};export const useClipboardImagePaste=()=>()=>{};
export const CachedImage=()=>null,Media=()=>null,SkillBook=()=>null,TextModelSelect=()=>null,TemplatesClient=()=>null,WorkbenchSessions=()=>null;
export const Check=()=>null,MessageSquare=()=>null,Pencil=()=>null,Trash2=()=>null;export const ArrowRight=()=>null,ArrowUp=()=>null,ArrowUpRight=()=>null,Bot=()=>null,History=()=>null,LayoutGrid=()=>null,Loader2=()=>null,MessageSquarePlus=()=>null,Network=()=>null,Plus=()=>null,Upload=()=>null,Wrench=()=>null,X=()=>null;
export default function Link({children,...p}){return <a {...p}>{children}</a>}`;
  const instrument = `
  window.w={loadSession,stopRun,newConversation,send,refreshSessions,
    state:()=>({messages,busy,running,error,sessionLoadingId,sessionId:sessionIdRef.current,sessions,${fs.readFileSync(source,'utf8').includes('recoveryUnavailable') ? 'recoveryUnavailable,' : ''}})};
`;
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {WorkbenchClient} from ${JSON.stringify(source.replaceAll('\\','/'))};
window.actor='a@example.test';const root=createRoot(document.getElementById('root'));window.mount=(strict=false)=>flushSync(()=>root.render(strict?<React.StrictMode><WorkbenchClient/></React.StrictMode>:<WorkbenchClient/>));window.detach=()=>flushSync(()=>root.render(null));window.account=a=>{window.actor=a;flushSync(()=>window.authRender?.())};
const timers=new Map(),listeners=new Map(),nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);let peakTimers=0,peakListeners=0;
window.setTimeout=(fn,ms,...args)=>{let id=nativeSet(()=>{timers.delete(id);fn(...args)},ms);if(ms===1200){timers.set(id,ms);peakTimers=Math.max(peakTimers,timers.size)}return id};window.clearTimeout=id=>{timers.delete(id);nativeClear(id)};
const add=AbortSignal.prototype.addEventListener,remove=AbortSignal.prototype.removeEventListener;
AbortSignal.prototype.addEventListener=function(type,fn,opt){if(type==='abort'){let set=listeners.get(this);if(!set)listeners.set(this,set=new Set());set.add(fn);peakListeners=Math.max(peakListeners,[...listeners.values()].reduce((n,s)=>n+s.size,0))}return add.call(this,type,fn,opt)};
AbortSignal.prototype.removeEventListener=function(type,fn,opt){if(type==='abort')listeners.get(this)?.delete(fn);return remove.call(this,type,fn,opt)};
window.errors=[];window.addEventListener('unhandledrejection',e=>{window.errors.push(String(e.reason));e.preventDefault()});window.addEventListener('error',e=>window.errors.push(e.message));
const nativeFetch=window.fetch.bind(window);let active=0,peakFetch=0,bytes=0;window.fetch=async(...args)=>{active++;peakFetch=Math.max(peakFetch,active);try{const res=await nativeFetch(...args);const raw=res.json.bind(res);res.json=async()=>{const data=await raw();bytes+=new TextEncoder().encode(JSON.stringify(data)).length;if(window.jsonGate&&args[0].includes(window.jsonGate.match)){const gate=window.jsonGate;window.jsonGate=null;window.jsonWaiting=true;await gate.promise;}return data};return res}finally{active--}};
window.holdJson=match=>{let release;const promise=new Promise(r=>release=r);window.jsonGate={match,promise};window.releaseJson=()=>{window.jsonWaiting=false;release()}};
window.holdAuth=()=>{window.authGate=new Promise(r=>window.releaseAuth=()=>{window.authGate=null;r()})};
window.metrics=()=>({timers:timers.size,peakTimers,listeners:[...listeners.values()].reduce((n,s)=>n+s.size,0),peakListeners,activeFetch:active,peakFetch,jsonBytes:bytes,errors:window.errors});`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', nodePaths: [deps], define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture-boundaries', setup(b) {
    b.onLoad({ filter: /workbench-client\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replace('  // ── 对话态(沉浸式:', instrument + '\n  // ── 对话态(沉浸式:'), loader: 'tsx', resolveDir: path.dirname(args.path) }));
    b.onResolve({ filter: /^(@\/|next\/|lucide-react$)/ }, args => args.path === '@/components/home/workbench-sessions' ? ({path:path.join(root,'src/components/home/workbench-sessions.tsx')}) : ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: stubs, loader: 'tsx', resolveDir: root }));
  } }] });
  server = createServer(async (r, s) => {
    if (r.url === '/') { s.setHeader('content-type','text/html; charset=utf-8'); s.end('<meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>'); return; }
    if (r.url === '/bundle.js') { s.setHeader('content-type','text/javascript; charset=utf-8'); s.end(bundle.outputFiles[0].contents); return; }
    const url = new URL(r.url, 'http://fixture');
    const kind = r.method === 'DELETE' ? 'stop' : r.method === 'PUT' ? 'send' : r.method === 'POST' ? 'save' : url.pathname === '/api/agent/session' ? (url.searchParams.has('id') ? 'history' : 'list') : 'live';
    const id = url.searchParams.get('id') || url.searchParams.get('sessionId') || '';
    const key = kind + ':' + id; const nth = (count.get(key) || 0) + 1; count.set(key, nth);
    const record={ scenario:currentCase, intentionalSendFixture:explicitSendCases.has(currentCase), method:r.method, kind,id,nth,actor:r.headers['x-fixture-actor'],since:url.searchParams.get('since'),responseBytes:0,closed:false };
    requests.push(record);s.on('close',()=>{record.closed=true});
    const end=s.end.bind(s),write=s.write.bind(s);s.end=(chunk,...rest)=>{if(chunk)record.responseBytes+=Buffer.byteLength(chunk);return end(chunk,...rest)};s.write=(chunk,...rest)=>{if(chunk)record.responseBytes+=Buffer.byteLength(chunk);return write(chunk,...rest)};
    if(r.method!=='GET'){let raw='';for await(const part of r)raw+=part;record.input=raw}
    const action = plans.find(p=>p.kind===kind&&p.id===id&&(p.nth===nth||(p.repeat&&nth>=p.nth))) || {};
    if (action.sse) {
      s.writeHead(200,{'content-type':'text/event-stream'});
      s.write('event: open\ndata: '+JSON.stringify({sessionId:'LIVE'})+'\n\n');
      await new Promise(resolve=>holds.set(action.sse,resolve));
      if(!s.destroyed)s.end('event: final\ndata: '+JSON.stringify({reply:'original final'})+'\n\n');
      return;
    }
    if(action.bodyHold){s.writeHead(200,{'content-type':'application/json'});s.write('{"running":');await new Promise(resolve=>holds.set(action.bodyHold,resolve));if(!s.destroyed)s.end('true,"total":0,"events":[]}');return;}
    if (action.hold) await new Promise(resolve=>holds.set(action.hold,resolve));
    if (s.destroyed) return;
    if (action.disconnect) { s.destroy(); return; }
    if (action.invalid) { s.writeHead(200,{'content-type':'application/json'});s.end('{invalid');return; }
    if (action.status) { json(s,action.status,{error:'fixture-'+action.status});return; }
    if (r.method !== 'GET') { json(s,200,{ok:true});return; }
    json(s,200,action.data || (kind==='history' ? sessions(id) : kind==='list' ? {sessions:summaries} : {running:true,total:nth,events:[]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});

  await check('unmount cancels polling timer and GET',async()=>{await reset();await call('loadSession','A');await until(()=>window.w.state().running);await page.evaluate(()=>window.detach());const before=requests.length;await delay(1450);const s=await snapshot();observe('unmount',{before,after:requests.length,...s.resources});assert.equal(requests.length,before);assert.equal(s.resources.timers,0);assert.equal(s.resources.listeners,0)});
  await check('account ABA cannot continue old observer',async()=>{await reset();await call('loadSession','A');await until(()=>window.w.state().running);await page.evaluate(()=>window.account('b@example.test'));await page.evaluate(()=>window.account('a@example.test'));const before=requests.length;await delay(1450);const s=await snapshot();observe('accountABA',{before,after:requests.length,sessionId:s.sessionId});assert.equal(requests.length,before);assert.equal(s.sessionId,'');assert.equal(s.messages.length,0)});
  await check('late live.json cannot install stale A observer after B',async()=>{await reset();await page.evaluate(()=>window.holdJson('sessionId=A'));await call('loadSession','A');await until(()=>window.jsonWaiting);plan('live','B',1,{data:{running:false,total:0,events:[]}});await call('loadSession','B');await until(()=>window.w.state().sessionId==='B'&&!window.w.state().sessionLoadingId);await page.evaluate(()=>window.releaseJson());await delay(1400);const s=await snapshot();observe('lateJSON',{sessionId:s.sessionId,busy:s.busy,messages:s.messages});assert.equal(s.busy,false);assert.equal(requests.filter(r=>r.kind==='live'&&r.id==='A').length,1)});
  await check('final history remains owned through await and session ABA',async()=>{await reset();plan('live','A',2,{data:{running:false,total:2,events:[]}});plan('history','A',2,{data:{session:{messages:[{role:'assistant',content:'STALE-FINAL'}]}}});await call('loadSession','A');await until(()=>window.w.state().running);await page.evaluate(()=>window.holdJson('/api/agent/session?id=A'));await until(()=>window.jsonWaiting);await delay(50);await call('newConversation');await until(()=>window.w.state().sessionId==='');plan('live','B',1,{data:{running:false,total:0,events:[]}});await call('loadSession','B');await until(()=>window.w.state().sessionId==='B'&&!window.w.state().sessionLoadingId);plan('live','A',3,{data:{running:false,total:0,events:[]}});await call('loadSession','A');await until(()=>window.w.state().sessionId==='A'&&!window.w.state().sessionLoadingId);await page.evaluate(()=>window.releaseJson());await delay(100);const s=await snapshot();observe('finalABA',{messages:s.messages});assert.ok(!s.messages.some(m=>m.content==='STALE-FINAL'));assert.equal(requests.filter(r=>r.method!=='GET').length,0)});
  for (const [name,action] of [['HTTP',{status:503}],['JSON',{invalid:true}],['network',{disconnect:true,repeat:true}]]) {
    await check(name+' failure exposes unknown, releases busy and never replays',async()=>{await reset();plan('live','A',2,action);await call('loadSession','A');await waitRequest('live','A',2);await delay(150);const s=await snapshot();observe(name+'failure',s);assert.equal(s.busy,false);assert.ok(s.error);assert.equal(s.recoveryUnavailable,true);assert.equal(s.resources.errors.length,0);await call('send','do not replay');await delay(50);assert.equal(requests.filter(r=>['PUT','POST'].includes(r.method)).length,0);assert.equal(requests.filter(r=>r.kind==='history').length,1)});
  }
  await check('same-session explicit reopen restarts exactly one observer',async()=>{await reset();plan('live','A',2,{status:503});await call('loadSession','A');await waitRequest('live','A',2);await delay(100);await call('loadSession','A');await waitRequest('live','A',3);await call('loadSession','A');await delay(1350);const s=await snapshot();observe('reopen',s.resources);assert.equal(requests.filter(r=>r.kind==='live').length,4);assert.equal(s.resources.peakTimers,1);assert.equal(s.resources.timers,1);assert.equal(s.error,null)});
  await check('stop is one DELETE, observer cleanup never cancels backend',async()=>{await reset();await call('loadSession','A');await until(()=>window.w.state().running);await page.getByRole('button',{name:'停止',exact:true}).click();await until(()=>!window.w.state().busy);const before=requests.length;await delay(1450);assert.equal(requests.length,before);assert.deepEqual(requests.filter(r=>r.method!=='GET').map(r=>r.method),['DELETE']);assert.equal((await snapshot()).resources.timers,0);await call('loadSession','A');await waitRequest('live','A',2);assert.equal((await snapshot()).running,true)});
  await check('StrictMode success preserves prompt/media/steps and bounded resources',async()=>{await reset(true);plan('live','A',2,{data:{running:true,total:2,events:[{type:'assistant',data:{text:'intermediate'}}]}});plan('live','A',3,{data:{running:false,total:3,events:[]}});await call('loadSession','A');await until(()=>window.w.state().running);await waitRequest('history','A',2);await until(()=>!window.w.state().busy);await delay(50);const s=await snapshot();observe('success',{...s.resources,requests:requests.length});assert.equal(s.messages[0].content,sessions('A').session.messages[0].content);assert.equal(s.messages[1].steps[0].summary,'kept');assert.equal(s.resources.timers,0);assert.equal(s.resources.listeners,0);assert.equal(s.resources.peakTimers,1);assert.ok(s.resources.jsonBytes<8192);assert.equal(requests.filter(r=>r.kind==='live').length,3);assert.equal(requests.filter(r=>r.method!=='GET').length,0)});
  await check('deferred auth is checked before issuing GET after logout',async()=>{await reset();await page.evaluate(()=>window.holdAuth());await call('loadSession','A');await page.evaluate(()=>window.account(null));await page.evaluate(()=>window.releaseAuth());await delay(100);assert.equal(requests.length,0);assert.equal((await snapshot()).sessionLoadingId,'')});
  await check('unmount aborts in-flight GET without late state effects',async()=>{await reset();plan('history','A',1,{hold:'body'});await call('loadSession','A');await waitRequest('history','A');await page.evaluate(()=>window.detach());await release('body');await delay(1300);assert.equal(requests.length,1);assert.equal((await snapshot()).resources.activeFetch,0)});
  await check('duplicate clicks while initial history is pending remain single-flight',async()=>{await reset();plan('history','A',1,{hold:'duplicate'});await call('loadSession','A');await waitRequest('history','A');await call('loadSession','A');await release('duplicate');await until(()=>window.w.state().running);assert.equal(requests.filter(r=>r.kind==='history').length,1);assert.equal(requests.filter(r=>r.kind==='live').length,1);assert.equal((await snapshot()).resources.peakTimers,1)});
  await check('real slow HTTP body is aborted on account switch',async()=>{await reset();plan('live','A',1,{bodyHold:'partial'});await call('loadSession','A');await waitRequest('live','A');await page.evaluate(()=>window.account('b@example.test'));await delay(80);const live=requests.find(r=>r.kind==='live');assert.equal(live.closed,true,'HTTP body socket closed before server finishes JSON');await release('partial');await delay(100);assert.equal((await snapshot()).busy,false);assert.equal((await snapshot()).messages.length,0)});
  await check('UI running-session switch detaches only observer; A-B-A single owner',async()=>{await reset();await openUi('A');await until(()=>window.w.state().running);await openUi('B');await until(()=>window.w.state().sessionId==='B'&&window.w.state().running);await openUi('A');await until(()=>window.w.state().sessionId==='A'&&window.w.state().running);await delay(1350);const s=await snapshot();observe('sessionABA',{live:requests.filter(r=>r.kind==='live'),resources:s.resources});assert.equal(requests.filter(r=>r.kind==='live'&&r.id==='B').length,1);assert.equal(requests.filter(r=>r.kind==='live'&&r.id==='A').length,3);assert.equal(requests.filter(r=>r.method!=='GET').length,0);assert.equal(s.resources.peakTimers,1)});
  await check('live JSON ABA cannot revive first owner with same session id',async()=>{await reset();await page.evaluate(()=>window.holdJson('sessionId=A'));await call('loadSession','A');await until(()=>window.jsonWaiting);plan('live','B',1,{data:{running:false,total:0,events:[]}});await call('loadSession','B');await until(()=>window.w.state().sessionId==='B'&&!window.w.state().sessionLoadingId);await call('loadSession','A');await until(()=>window.w.state().running);await page.evaluate(()=>window.releaseJson());await delay(1350);const s=await snapshot();assert.equal(s.messages.filter(m=>m.pending).length,1);assert.equal(requests.filter(r=>r.kind==='live'&&r.id==='A').length,3);assert.equal(s.resources.peakTimers,1)});
  await check('new conversation during initial load cancels GET and stale error',async()=>{await reset();plan('history','A',1,{hold:'load',status:503});await call('loadSession','A');await waitRequest('history','A');await call('newConversation');await release('load');await delay(100);const s=await snapshot();assert.equal(s.sessionId,'');assert.equal(s.sessionLoadingId,'');assert.equal(s.error,null);assert.equal(s.messages.length,0)});
  await check('invalid initial live shape is unknown, not false completion',async()=>{await reset();plan('live','A',1,{data:{error:'missing running'}});await call('loadSession','A');await until(()=>!window.w.state().sessionLoadingId);const s=await snapshot();assert.equal(s.recoveryUnavailable,true);assert.ok(s.error);assert.equal(s.busy,false)});
  await check('initial HTTP 404 does not certify accepted task completion',async()=>{await reset();plan('live','A',1,{status:404});await call('loadSession','A');await until(()=>window.w.state().sessionId==='A'&&!window.w.state().sessionLoadingId);const s=await snapshot();assert.equal(s.recoveryUnavailable,true);assert.ok(s.error);assert.equal(requests.filter(r=>r.method!=='GET').length,0)});
  await check('final JSON failure retains last observed content with explicit error',async()=>{await reset();plan('live','A',2,{data:{running:false,total:2,events:[{type:'assistant',data:{text:'observed-final'}}]}});plan('history','A',2,{invalid:true});await call('loadSession','A');await waitRequest('history','A',2);await delay(100);const s=await snapshot();assert.equal(s.busy,false);assert.ok(s.error);assert.equal(s.messages.at(-1).content,'observed-final');assert.equal(s.recoveryUnavailable,true);assert.equal(s.resources.errors.length,0)});
  await check('failed explicit stop leaves status unknown and permits GET reopen',async()=>{await reset();plan('stop','A',1,{status:503});await call('loadSession','A');await until(()=>window.w.state().running);await call('stopRun');await until(()=>!window.w.state().busy);assert.equal((await snapshot()).recoveryUnavailable,true);await call('loadSession','A');await waitRequest('live','A',2);assert.equal((await snapshot()).resources.peakTimers,1);assert.equal(requests.filter(r=>r.method==='DELETE').length,1)});
  await check('poll assistant content keeps explicit stop accessible',async()=>{await reset();plan('live','A',2,{data:{running:true,total:2,events:[{type:'assistant',data:{text:'live text'}}]}});await call('loadSession','A');await until(()=>window.w.state().messages.at(-1)?.content==='live text');assert.equal(await page.getByRole('button',{name:'停止',exact:true}).count(),1);await page.getByRole('button',{name:'停止',exact:true}).click();await until(()=>!window.w.state().busy)});
  await check('explicit interject retains payload; deferred auth cannot cross accounts',async()=>{await reset();await call('loadSession','A');await until(()=>window.w.state().running);await page.getByPlaceholder('插话修正，如：换蓝色的').fill('keep original instruction');await page.getByRole('button',{name:'插话',exact:true}).click();await delay(60);const patch=requests.find(r=>r.method==='PATCH');assert.deepEqual(JSON.parse(patch.input),{sessionId:'A',message:'keep original instruction'});await page.getByPlaceholder('插话修正，如：换蓝色的').fill('must not cross');await page.evaluate(()=>window.holdAuth());await page.getByRole('button',{name:'插话',exact:true}).click();await page.evaluate(()=>window.account('b@example.test'));await page.evaluate(()=>window.releaseAuth());await delay(80);assert.equal(requests.filter(r=>r.method==='PATCH').length,1)});
  await check('late list JSON cannot cross accounts; list request errors are contained',async()=>{await reset();await page.evaluate(()=>window.holdJson('/api/agent/session'));await call('refreshSessions');await until(()=>window.jsonWaiting);await page.evaluate(()=>window.account('b@example.test'));await page.evaluate(()=>window.releaseJson());await delay(50);assert.equal((await snapshot()).sessions.length,0);plan('list','',2,{invalid:true});await call('refreshSessions');await delay(100);const s=await snapshot();assert.ok(s.error);assert.equal(s.resources.errors.length,0)});
  await check('bounded remount churn leaves no timers or listeners',async()=>{await reset(true);for(let i=0;i<8;i++){await call('loadSession','A');await until(()=>window.w.state().running);await page.evaluate(()=>window.detach());await page.evaluate(()=>window.mount(true));}const before=requests.length;await delay(1350);const s=await snapshot();observe('churn',{cycles:8,requests:requests.length,...s.resources});assert.equal(requests.length,before);assert.equal(s.resources.timers,0);assert.equal(s.resources.listeners,0);assert.equal(s.resources.peakTimers,1);assert.equal(requests.length,16);assert.ok(s.resources.jsonBytes<8192)});

  await check('StrictMode bootstrap prompt submits once without being lost',async()=>{await reset();await page.evaluate(()=>window.detach());plan('send','',1,{sse:'bootstrap'});await page.evaluate(()=>{window.history.replaceState(null,'','/?prompt=one-shot-original');window.mount(true)});await waitRequest('send','');await until(()=>window.w.state().sessionId==='LIVE');await release('bootstrap');await until(()=>!window.w.state().busy);assert.equal(requests.filter(r=>r.kind==='send').length,1);assert.equal(JSON.parse(requests.find(r=>r.kind==='send').input).message,'one-shot-original');assert.equal(requests.filter(r=>r.kind==='save').length,1)});
  // Deliberate mock SEND tests are separate from recovery's zero replay count.
  await check('existing explicit SSE send and save retain exact identity and payload',async()=>{await reset();plan('send','',1,{sse:'send-end'});await call('send','exact prompt [商品图] /media/reference.png');await waitRequest('send','');await until(()=>window.w.state().sessionId==='LIVE');await release('send-end');await waitRequest('save','');await until(()=>!window.w.state().busy);assert.equal(requests.filter(r=>r.kind==='send').length,1);assert.equal(requests.filter(r=>r.kind==='save').length,1);assert.equal(JSON.parse(requests.find(r=>r.kind==='send').input).message,'exact prompt [商品图] /media/reference.png');assert.equal(JSON.parse(requests.find(r=>r.kind==='save').input).id,'LIVE');assert.equal(requests.find(r=>r.kind==='save').actor,'a@example.test');evidence.explicitMockSend=(evidence.explicitMockSend||0)+1});
  await check('old SSE completion cannot overwrite recovered account or save as new actor',async()=>{await reset();plan('send','',1,{sse:'late-send'});await call('send','explicit original');await waitRequest('send','');await until(()=>window.w.state().sessionId==='LIVE');await page.evaluate(()=>window.account('b@example.test'));plan('live','B',1,{data:{running:false,total:0,events:[]}});await call('loadSession','B');await until(()=>window.w.state().sessionId==='B'&&!window.w.state().sessionLoadingId);await release('late-send');await delay(100);const s=await snapshot();assert.equal(s.messages.at(-1).content,'history-B');assert.equal(requests.filter(r=>r.kind==='save').length,0);assert.equal(requests.filter(r=>r.kind==='send').length,1);assert.equal(requests.filter(r=>r.method==='DELETE').length,0);evidence.explicitMockSend=(evidence.explicitMockSend||0)+1});
  await check('deferred save authorization cannot use the newly selected account',async()=>{await reset();plan('send','',1,{sse:'save-auth'});await call('send','original');await waitRequest('send','');await until(()=>window.w.state().sessionId==='LIVE');await page.evaluate(()=>window.holdAuth());await release('save-auth');await until(()=>window.w.state().messages.at(-1)?.content==='original final');await page.evaluate(()=>window.account('b@example.test'));await page.evaluate(()=>window.releaseAuth());await delay(100);assert.equal(requests.filter(r=>r.kind==='save').length,0);evidence.explicitMockSend=(evidence.explicitMockSend||0)+1});
}
main().catch(e=>{evidence.failures.push({name:'runner',error:e.stack});console.error(e.stack)}).finally(async()=>{
  for(const release of holds.values())release();
  if(context){evidence.requests.push(...requests);await context.close()}
  if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
  evidence.closed={browser:true,http:true};
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2));
  console.log(`WORKBENCH_RECOVERY checks=${evidence.checks.length+evidence.failures.length} passed=${evidence.checks.length} failed=${evidence.failures.length} RECOVERY_PUT_POST=${evidence.requests.filter(r=>['PUT','POST'].includes(r.method)&&!r.intentionalSendFixture).length} EXPLICIT_MOCK_PUT=${evidence.requests.filter(r=>r.kind==='send').length} MOCK_SAVE_POST=${evidence.requests.filter(r=>r.kind==='save').length} PAID_SUPPLIER_REQUESTS=0 HTTP_CLOSED=true BROWSER_CLOSED=true`);
  process.exitCode=evidence.failures.length?1:0;
});
