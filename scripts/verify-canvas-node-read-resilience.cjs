// Real six React hooks/save queues + AST-extracted Canvas project/deep-link gates.
// Auth/network/JSON and PG write replies are local explicit fixtures, not live E2E.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), esbuild = require('esbuild'), ts = require('typescript');
const { chromium, expect } = require('@playwright/test');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', path.join(__dirname, '..'))), baseline = args.includes('--baseline');
const out = path.resolve(arg('--output-root', 'output/browser-stability-goal-20261103/node-reads/' + (baseline ? 'baseline' : 'modified')));
const dependencies = path.resolve(__dirname, '../node_modules'), kinds = ['video', 'director', 'character', 'scene', 'audio', 'timeline'];
const checks = [], loaded = new Map(), pageErrors = [], external = [], consoles = [];
const hash = data => createHash('sha256').update(data).digest('hex');
let browser, server, origin;
fs.mkdirSync(out, { recursive: true });
const canvas = fs.readFileSync(path.join(root, 'src/components/canvas/canvas-client.tsx'), 'utf8');
loaded.set('src/components/canvas/canvas-client.tsx', hash(canvas));
const ast = ts.createSourceFile('canvas-client.tsx', canvas, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), effects = [], retries = [], settingsRetries = [], parsers = [];
(function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node);
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onClick' && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(ast).includes('failedNodeReads.map')) retries.push(node.initializer.expression.getText(ast));
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onClick' && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(ast).includes('setNodeSettingsAttempt')) settingsRetries.push(node.initializer.expression.getText(ast));
  if (ts.isFunctionDeclaration(node) && ['expectJsonOk','readJsonSafe'].includes(node.name?.text)) parsers.push(node.getText(ast));
  ts.forEachChild(node, visit);
})(ast);
const deletion = effects.filter(node => node.getText(ast).includes('localStorage.removeItem("nv:canvas:last")') && node.getText(ast).includes('projects.some'));
const pending = effects.filter(node => node.getText(ast).includes('pendingNodeRef.current = null') && node.getText(ast).includes('const proj = projects.find'));
const settingsRead = effects.filter(node => node.getText(ast).includes('privateFetchRaw(`/api/canvas/node-settings?email='));
const settingsPersist = effects.filter(node => node.getText(ast).includes('localStorage.setItem(`naumi:node-settings:'));
assert.equal(deletion.length, 1); assert.equal(pending.length, 1); if (!baseline) assert.equal(retries.length, 1);
assert.equal(settingsRead.length,1);assert.equal(settingsPersist.length,1);assert.equal(parsers.length,2);if(!baseline)assert.equal(settingsRetries.length,1);
const effectCode = [...deletion, ...pending].map(node => node.getText(ast) + ';').join('\n');
fs.writeFileSync(path.join(out, 'extracted-gates.tsx'), effectCode + '\n' + (retries[0] || '// baseline lacks separate read-only retry')+'\n'+settingsRead[0].getText(ast)+';\n'+settingsPersist[0].getText(ast)+';');
const entry = `import React,{useState,useRef,useEffect,useLayoutEffect,useMemo} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
${kinds.map(kind => `import {use${kind[0].toUpperCase()+kind.slice(1)}Nodes} from '@/components/canvas/${kind}/use-${kind}-nodes';`).join('\n')}
import {useVideoCatalog} from '@/components/canvas/video/use-video-catalog';
import {validNodeSettings} from '@/lib/canvas/node-settings';
${!baseline?"import {withBrowserReadDeadline} from '@/lib/browser-read-deadline';":''}
${parsers.join('\n')}
const root=createRoot(document.getElementById('root'));
function SettingsHost({email}:{email:string}){
 const user=useMemo(()=>({email}),[email]),ready=true,targetEmail='',readOnly=false;
 const canvasOwnerEpochRef=useRef({key:email,revision:0});if(canvasOwnerEpochRef.current.key!==email)canvasOwnerEpochRef.current={key:email,revision:canvasOwnerEpochRef.current.revision+1};
 const nodeSettingsOwner=canvasOwnerEpochRef.current.revision,nodeSettingsLoadedOwner=useRef(-1);
 const [nodeSettings,setNodeSettings]=useState({}),[nodeSettingsReady,setNodeSettingsReady]=useState(false),[nodeSettingsError,setNodeSettingsError]=useState(false),[nodeSettingsAttempt,setNodeSettingsAttempt]=useState(0);
 const privateFetchRaw=(window as any).fixtureRequest,flashTip=(message:string)=>{(window as any).notices.push(message);},L=(zh:string)=>zh;
 ${settingsRead[0].getText(ast)};
 ${settingsPersist[0].getText(ast)};
 useLayoutEffect(()=>{(window as any).commits++;(window as any).settingsState={email,nodeSettings,nodeSettingsReady,nodeSettingsError};(window as any).retrySettings=${settingsRetries[0]||'()=>setNodeSettingsAttempt(value=>value+1)'};});
 return <div data-testid="settings">{nodeSettingsReady?'ready':'pending'}</div>;
}
function CatalogHost({email}:{email:string}){const catalog=useVideoCatalog({email,ready:true,request:(window as any).fixtureRequest});useLayoutEffect(()=>{(window as any).commits++;(window as any).catalog=catalog;});return <div data-testid="catalog">{catalog.loading?'loading':catalog.error?'error':'ready'}</div>;}
function Host({email,request}:{email:string;request:any}){
${kinds.map(kind => `const ${kind}NodesStore=use${kind[0].toUpperCase()+kind.slice(1)}Nodes({email,readOnly:false,request});`).join('\n')}
 const stores={${kinds.map(kind => `${kind}:${kind}NodesStore`).join(',')}};
 const [activeKey,setActiveKey]=useState('restore-key'),[browsing,setBrowsing]=useState(false),[selectedId,setSelectedId]=useState('selected');
 const [creatingNew,setCreatingNew]=useState(false),[selectedTextId,setSelectedTextId]=useState(null),[focusId,setFocusId]=useState(null);
 const pendingNodeRef=useRef('pending-link'),openPendingNodeWithoutSelectionRef=useRef(false),deepFocusRef=useRef(false);
 const works=useMemo(()=>[],[]),textNodesReady=true;
 const projects=useMemo(()=>{const byId=new Map<string,any>();for(const [kind,store]of Object.entries(stores))for(const node of store.nodes){let p=byId.get(node.projectKey);if(!p){p={key:node.projectKey,members:[],textNodes:[]};byId.set(node.projectKey,p);}const field=kind+'Nodes';(p[field]||=[]).push(node);}if((window as any).config.extraProject)byId.set('other',{key:'other',members:[],textNodes:[]});return [...byId.values()];},[${kinds.map(kind => `${kind}NodesStore.nodes`).join(',')}]);
 const failedNodeReads=Object.values(stores).filter((store:any)=>!!store.readError);
 const retryReads=${retries[0] || '()=>Promise.allSettled(Object.values(stores).map(store=>store.refresh()))'};
 ${effectCode}
 useLayoutEffect(()=>{(window as any).commits++;(window as any).stores=stores;(window as any).retryReads=retryReads;(window as any).snapshot=()=>({email,activeKey,browsing,pendingNode:pendingNodeRef.current,selectedId,stores:Object.fromEntries(Object.entries(stores).map(([kind,s]:[string,any])=>[kind,{nodes:s.nodes,ready:s.ready,error:s.error,readError:s.readError,loading:s.loading,unsavedCount:s.unsavedCount}]))});});
 return <main data-email={email}><span data-testid="ready">{Object.values(stores).every(store=>store.ready)?'ready':'pending'}</span></main>;
}
window.mount=(email='a@fixture.test',strict=false)=>flushSync(()=>root.render(strict?<React.StrictMode><Host email={email} request={window.fixtureRequest}/></React.StrictMode>:<Host email={email} request={window.fixtureRequest}/>));
window.mountSettings=(email='a@fixture.test')=>flushSync(()=>root.render(<SettingsHost email={email}/>));
window.mountCatalog=(email='a@fixture.test')=>flushSync(()=>root.render(<CatalogHost email={email}/>));
window.unmount=()=>flushSync(()=>root.unmount());window.fixtureReady=true;`;
async function compile() {
  const bundle = await esbuild.build({ stdin: { contents: entry, sourcefile: 'node-read-fixture.tsx', loader: 'tsx', resolveDir: root }, outfile: path.join(out, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true, nodePaths: [dependencies], alias: { '@': path.join(root, 'src'), react: path.join(dependencies, 'react'), 'react-dom': path.join(dependencies, 'react-dom') }, define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'workspace-fixture', setup(build) { build.onResolve({ filter: /^@\/lib\/saas\/workspace-client$/ }, () => ({ path: 'workspace', namespace: 'workspace-fixture' })); build.onLoad({ filter: /.*/, namespace: 'workspace-fixture' }, () => ({ contents: 'export const WORKSPACE_SELECTION="fixture-workspace";export const currentWorkspace=()=>"personal";export const currentWorkspaceRevision=()=>0;', loader: 'js' })); } }] });
  for (const item of Object.keys(bundle.metafile.inputs)) { const file = path.resolve(item), relative = path.relative(root, file).replaceAll('\\', '/'); if (relative.startsWith('src/') && fs.existsSync(file)) loaded.set(relative, hash(fs.readFileSync(file))); }
}
async function fixture(config = {}) {
  const context = await browser.newContext(), page = await context.newPage(); page.setDefaultTimeout(4500);
  page.on('pageerror', error => pageErrors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoles.push(message.text()); });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external.push(url.href); return route.abort(); } return route.continue(); });
  await context.addInitScript(({ config, kinds }) => {
    window.config = { fault: 'ok', writeFault: 'ok', extraProject: false, pollFast: false, ...config }; window.commits = 0;
    const nativeTimer = setTimeout.bind(window); window.nativeTimer = nativeTimer;
    window.setTimeout = (fn, ms, ...rest) => nativeTimer(fn, ms === 15000 ? 150 : ms === 6000 && window.config.pollFast ? 80 : ms === 500 ? 5 : ms === 1500 ? 15 : ms, ...rest);
    window.calls = []; window.holds = []; window.writeCalls = []; window.faults = {}; window.serial = 0;window.notices=[];
    window.originalSettings='{"local-node":{"locked":true,"order":7}}';localStorage.setItem('naumi:node-settings:a@fixture.test',window.originalSettings);localStorage.setItem('naumi:node-settings:b@fixture.test','{"b-local":{"locked":true,"order":9}}');
    localStorage.setItem('nv:canvas:last', 'restore-key'); sessionStorage.setItem('fixture-accepted-task', 'original-task:UNKNOWN:paid');
    const hold = (label, kind, email, signal) => new Promise(resolve => window.holds.push({ serial: ++window.serial, label, kind, email, signal, resolve }));
    window.node = (kind, email = 'a@fixture.test', id = kind + '-saved', revision = 3) => ({ id, revision, projectKey: 'restore-key', title: kind + ':' + email, deletedAt: null, config: { prompt: 'frozen draft' }, inputs: [], taskId: 'original-task', status: 'pending' });
    window.resolveHolds = (select, payload) => { const rows = window.holds.filter(row => Object.entries(select).every(([key,value]) => row[key] === value)); window.holds = window.holds.filter(row => !rows.includes(row)); for (const row of rows) row.resolve(row.label === 'settings-body'?JSON.stringify(payload):row.label === 'body' || row.label === 'auth' ? payload : new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })); return rows.length; };
    window.fixtureRequest = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href), kind = url.pathname==='/api/canvas/node-settings'?'settings':url.pathname==='/api/video/catalog'?'catalog':kinds.find(name => url.pathname.includes('/' + name + '-nodes'));
      if (!kind) throw Error('Unexpected request: ' + url.pathname);
      const method = (init.method || 'GET').toUpperCase(), email = url.searchParams.get('email') || 'a@fixture.test';
      if (method !== 'GET') {
        const body = JSON.parse(init.body), record = { kind, method, url: url.pathname, body, raw: init.body }; window.writeCalls.push(record);
        if (window.config.writeFault === 'unknown') return new Response(JSON.stringify({ error: 'receipt unknown', code: 'UNKNOWN' }), { status: 503 });
        if (window.config.writeFault === 'cas') return new Response(JSON.stringify({ error: 'revision conflict', code: 'REVISION_CONFLICT' }), { status: 409 });
        return new Response(JSON.stringify({ node: { ...window.node(kind, email, body.id, body.expectedRevision + 1), ...body, revision: body.expectedRevision + 1 } }), { headers: { 'content-type': 'application/json' } });
      }
      const mode = window.faults[kind] || window.config.fault; window.calls.push({ kind, email, mode, method });
      if (mode === 'auth') { await hold('auth', kind, email, init.signal); init.signal?.throwIfAborted(); }
      if (mode === 'hang') return hold('request', kind, email, init.signal);
      if (mode === 'body') return { ok: true, status: 200, json: () => hold('body', kind, email, init.signal),text:()=>hold('settings-body',kind,email,init.signal) };
      if (mode === '503') return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
      if (mode === 'json') return new Response('{bad-json');
      const value = kind==='settings'?(mode==='missing'?{}:mode==='nonarray'?{persisted:true,settings:[]}:mode==='null'?{persisted:true,settings:null}:mode==='local'?{persisted:false}:{persisted:true,settings:{'server-node':{locked:true,order:12}}}):kind==='catalog'?(mode==='missing'?{}:mode==='nonarray'?{models:{}}:{models:[{id:'fixture-video',label:'Fixture Video'}]}):mode === 'missing' ? {} : mode === 'nonarray' ? { nodes: {} } : mode === 'element' ? { nodes: [{ id: '', projectKey: '', revision: -1 }] } : mode === 'empty' ? { nodes: [] } : { nodes: [window.node(kind, email)] };
      return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    };
  }, { config, kinds });
  await page.goto(origin); await page.waitForFunction(() => window.fixtureReady);
  return { page, close: () => context.close() };
}
async function state(f) { return f.page.evaluate(() => ({ ...window.snapshot(), calls: window.calls, writes: window.writeCalls, last: localStorage.getItem('nv:canvas:last'), receipt: sessionStorage.getItem('fixture-accepted-task'), commits: window.commits })); }
async function check(name, defect, run) { try { const evidence = await run(); checks.push({ name, defect, pass: true, evidence }); console.log('PASS ' + name); } catch (error) { checks.push({ name, defect, pass: false, error: error.stack }); console.error('FAIL ' + name, error.message); } }
async function main() {
  await compile(); server = http.createServer((request, response) => { response.setHeader('content-type', request.url === '/bundle.js' ? 'application/javascript' : 'text/html'); response.end(request.url === '/bundle.js' ? fs.readFileSync(path.join(out, 'bundle.js')) : '<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const fault of ['auth', 'hang', 'body', '503', 'json', 'missing', 'nonarray', 'element']) await check('SIX_READ_' + fault.toUpperCase(), true, async () => {
    const f = await fixture({ fault, extraProject: true }); try {
      await f.page.evaluate(() => window.mount()); await f.page.waitForFunction(() => window.calls.length >= 6); await f.page.waitForTimeout(270);
      const s = await state(f);
      if (baseline) {
        if (['auth','hang','body'].includes(fault)) assert(kinds.every(kind => !s.stores[kind].ready && !s.stores[kind].error));
        else { assert(kinds.every(kind => s.stores[kind].ready)); assert.equal(s.last, null); }
      } else {
        assert(kinds.every(kind => !s.stores[kind].ready && !!s.stores[kind].readError)); assert.equal(s.last, 'restore-key'); assert.equal(s.activeKey, 'restore-key'); assert.equal(s.pendingNode, 'pending-link');
      }
      assert.equal(s.writes.length, 0); assert.equal(s.receipt, 'original-task:UNKNOWN:paid'); return s;
    } finally { await f.close(); }
  });
  await check('SUCCESS_EMPTY_AUTHORITATIVE_AND_PROJECT_DISAPPEARANCE', false, async () => {
    const f = await fixture({ fault: 'empty', extraProject: true }); try { await f.page.evaluate(() => window.mount()); await f.page.waitForFunction(() => Object.values(window.stores).every(store => store.ready)); const s = await state(f); assert.equal(s.last, null); assert.equal(s.activeKey, null); assert.equal(s.pendingNode, null); assert.equal(s.writes.length, 0); return s; } finally { await f.close(); }
  });
  await check('FOCUS_VISIBILITY_AND_EXPLICIT_REFRESH_SINGLEFLIGHT', true, async () => {
    const f = await fixture({ fault: 'hang' }); try {
      await f.page.evaluate(() => window.mount()); await f.page.waitForFunction(() => window.calls.length >= 6);
      await f.page.evaluate(() => { for (let i=0;i<20;i++) { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); for (const store of Object.values(window.stores)) void store.refresh().catch(()=>{}); } });
      const s = await state(f); const counts = Object.fromEntries(kinds.map(kind => [kind, s.calls.filter(call => call.kind === kind).length]));
      if (baseline) { assert(counts.audio > 1); assert(counts.video > 1); } else assert(kinds.every(kind => counts[kind] === 1));
      assert.equal(s.writes.length, 0); return counts;
    } finally { await f.close(); }
  });
  await check('LAST_GOOD_NODES_SURVIVE_FAILED_READ', false, async () => {
    const f = await fixture(); try {
      await f.page.evaluate(() => window.mount()); await f.page.waitForFunction(() => Object.values(window.stores).every(store => store.ready)); const before = await state(f);
      await f.page.evaluate(async () => { window.config.fault='503'; await Promise.allSettled(Object.values(window.stores).map(store=>store.refresh())); });
      const after = await state(f); assert.deepEqual(kinds.map(kind=>after.stores[kind].nodes),kinds.map(kind=>before.stores[kind].nodes)); assert(kinds.every(kind=>after.stores[kind].ready)); assert.equal(after.last,'restore-key'); return after;
    } finally { await f.close(); }
  });
  await check('A_B_A_OLD_RESPONSES_NEVER_OVERWRITE_CURRENT_IDENTITY', false, async () => {
    const f = await fixture({fault:'hang'}); try {
      await f.page.evaluate(()=>window.mount('a@fixture.test'));await f.page.waitForFunction(()=>window.calls.length>=6);
      await f.page.evaluate(()=>window.mount('b@fixture.test'));await f.page.waitForFunction(()=>window.calls.length>=12);
      await f.page.evaluate(()=>{window.config.fault='ok';window.mount('a@fixture.test');});await f.page.waitForFunction(()=>Object.values(window.stores).every(store=>store.ready));
      await f.page.evaluate(()=>{for(const row of [...window.holds])window.resolveHolds({serial:row.serial},{nodes:[window.node(row.kind,row.email,'stale-'+row.kind,99)]});});await f.page.waitForTimeout(60);
      const s=await state(f);assert(kinds.every(kind=>s.stores[kind].nodes.length===1&&s.stores[kind].nodes[0].id===kind+'-saved'));return s;
    }finally{await f.close();}
  });
  await check('STRICT_MODE_AND_UNMOUNT_FENCE_LATE_READ', false, async()=>{
    const f=await fixture();try{
      await f.page.evaluate(()=>window.mount('a@fixture.test',true));await f.page.waitForFunction(()=>Object.values(window.stores).every(store=>store.ready));const loaded=await state(f);assert(kinds.every(kind=>loaded.stores[kind].nodes.length===1));
      await f.page.evaluate(()=>{window.config.fault='hang';for(const store of Object.values(window.stores))void store.refresh().catch(()=>{});});await f.page.waitForFunction(()=>window.holds.length>=6);
      const before=await f.page.evaluate(()=>{window.unmount();return window.commits;});await f.page.evaluate(()=>{for(const row of [...window.holds])window.resolveHolds({serial:row.serial},{nodes:[window.node(row.kind,row.email,'late',99)]});});await f.page.waitForTimeout(100);assert.equal(await f.page.evaluate(()=>window.commits),before);return{commitsBefore:before,commitsAfter:await f.page.evaluate(()=>window.commits)};
    }finally{await f.close();}
  });
  await check('VIDEO_POLL_CONTINUES_AFTER_TIMEOUT', true, async()=>{
    const f=await fixture({fault:'hang',pollFast:true});try{await f.page.evaluate(()=>window.mount());await f.page.waitForFunction(()=>window.calls.length>=6);await f.page.waitForTimeout(175);await f.page.evaluate(()=>{window.config.fault='ok';});await f.page.waitForTimeout(220);const s=await state(f);if(baseline){assert.equal(s.calls.filter(call=>call.kind==='video').length,1);assert.equal(s.stores.video.ready,false);}else{assert(s.calls.filter(call=>call.kind==='video').length>=2);assert.equal(s.stores.video.ready,true);assert.equal(s.stores.video.nodes.length,1);}assert.equal(s.writes.length,0);return s;}finally{await f.close();}
  });
  await check('SAVE_UNKNOWN_EXACT_OPERATION_AND_CAS_READ_ONLY_REFRESH',false,async()=>{
    const f=await fixture();try{
      await f.page.evaluate(()=>window.mount());await f.page.waitForFunction(()=>Object.values(window.stores).every(store=>store.ready));
      await f.page.evaluate(async()=>{window.config.writeFault='unknown';await Promise.allSettled(Object.entries(window.stores).map(([kind,store])=>store.save(kind+'-saved',{title:'new title',expectedRevision:3})));});
      const unknown=await state(f);assert(kinds.every(kind=>unknown.writes.some(write=>write.kind===kind)));const count=unknown.writes.length;
      await f.page.evaluate(async()=>{window.config.fault='503';await Promise.allSettled(Object.values(window.stores).map(store=>store.refresh()));});
      if(!baseline)await f.page.evaluate(()=>{window.config.fault='ok';window.retryReads();});else await f.page.evaluate(async()=>{window.config.fault='ok';await Promise.allSettled(Object.values(window.stores).map(store=>store.refresh()));});
      await f.page.waitForTimeout(50);assert.equal((await state(f)).writes.length,count);
      await f.page.evaluate(async()=>{window.config.writeFault='ok';await Promise.allSettled(Object.entries(window.stores).map(([kind,store])=>store.save(kind+'-saved',{title:'new title',expectedRevision:3})));});
      const recovered=await state(f);for(const kind of kinds){const writes=recovered.writes.filter(write=>write.kind===kind);assert(writes.length>=2);assert(writes.every(write=>write.raw===writes[0].raw));assert.equal(recovered.stores[kind].nodes[0].revision,4);}
      await f.page.evaluate(async()=>{window.config.writeFault='cas';await Promise.allSettled(Object.entries(window.stores).map(([kind,store])=>store.save(kind+'-saved',{title:'conflict',expectedRevision:3})));});const conflict=await state(f);for(const kind of kinds){const writes=conflict.writes.filter(write=>write.kind===kind&&write.body.title==='conflict');assert.equal(writes.length,1);assert.equal(writes[0].body.expectedRevision,3);}assert.equal(conflict.receipt,'original-task:UNKNOWN:paid');return{unknown,recovered,conflict};
    }finally{await f.close();}
  });
  for(const fault of ['auth','hang','body','503','json','missing','nonarray','null'])await check('NODE_SETTINGS_'+fault.toUpperCase(),true,async()=>{
    const f=await fixture({fault});try{
      await f.page.evaluate(()=>window.mountSettings());await f.page.waitForFunction(()=>window.calls.length===1);await f.page.waitForTimeout(260);
      const s=await f.page.evaluate(()=>({state:window.settingsState,local:localStorage.getItem('naumi:node-settings:a@fixture.test'),original:window.originalSettings,notices:window.notices,calls:window.calls,writes:window.writeCalls}));
      if(baseline){assert.equal(s.state.nodeSettingsError,false);assert.equal(s.state.nodeSettingsReady,['missing','nonarray','null'].includes(fault));}else{assert.equal(s.state.nodeSettingsReady,false);assert.equal(s.state.nodeSettingsError,true);assert.equal(s.local,s.original);}
      assert.equal(s.writes.length,0);return s;
    }finally{await f.close();}
  });
  await check('NODE_SETTINGS_LOCAL_MIGRATION_AND_OWNER_FENCE',true,async()=>{
    const f=await fixture({fault:'local'});try{
      await f.page.evaluate(()=>window.mountSettings());await f.page.waitForFunction(()=>window.settingsState.nodeSettingsReady);assert.equal(await f.page.evaluate(()=>window.settingsState.nodeSettings['local-node'].locked),true);
      const originalB=await f.page.evaluate(()=>localStorage.getItem('naumi:node-settings:b@fixture.test'));
      await f.page.evaluate(()=>{window.config.fault='hang';window.mountSettings('b@fixture.test');});await f.page.waitForFunction(()=>window.holds.length===1);
      const duringB=await f.page.evaluate(()=>localStorage.getItem('naumi:node-settings:b@fixture.test'));
      if(baseline)assert.notEqual(duringB,originalB);else assert.equal(duringB,originalB);
      await f.page.evaluate(()=>{window.config.fault='ok';window.mountSettings('a@fixture.test');});await f.page.waitForFunction(()=>window.settingsState.nodeSettingsReady&&!!window.settingsState.nodeSettings['server-node']);
      await f.page.evaluate(()=>window.resolveHolds({kind:'settings',email:'b@fixture.test'},{persisted:true,settings:{'stale-b':{locked:true,order:99}}}));await f.page.waitForTimeout(30);
      assert.equal(await f.page.evaluate(()=>!!window.settingsState.nodeSettings['stale-b']),false);return{originalB,duringB,final:await f.page.evaluate(()=>window.settingsState)};
    }finally{await f.close();}
  });
  if(!baseline)await check('NODE_SETTINGS_EXPLICIT_RETRY_PRESERVES_LAST_GOOD_AND_LOCAL_BYTES',false,async()=>{
    const f=await fixture();try{
      await f.page.evaluate(()=>window.mountSettings());await f.page.waitForFunction(()=>window.settingsState.nodeSettingsReady);const before=await f.page.evaluate(()=>({state:window.settingsState.nodeSettings,local:localStorage.getItem('naumi:node-settings:a@fixture.test')}));
      await f.page.evaluate(()=>{window.config.fault='body';window.retrySettings();});await f.page.waitForFunction(()=>window.settingsState.nodeSettingsError);const failed=await f.page.evaluate(()=>({state:window.settingsState.nodeSettings,local:localStorage.getItem('naumi:node-settings:a@fixture.test')}));assert.deepEqual(failed,before);
      await f.page.evaluate(()=>{window.config.fault='ok';window.retrySettings();});await f.page.waitForFunction(()=>window.settingsState.nodeSettingsReady&&!window.settingsState.nodeSettingsError);
      await f.page.evaluate(()=>window.resolveHolds({kind:'settings',label:'settings-body'},{persisted:true,settings:{'late':{locked:true,order:99}}}));await f.page.waitForTimeout(30);assert.equal(await f.page.evaluate(()=>!!window.settingsState.nodeSettings.late),false);assert.equal(await f.page.evaluate(()=>window.writeCalls.length),0);return{before,failed,calls:await f.page.evaluate(()=>window.calls.length)};
    }finally{await f.close();}
  });
  for(const fault of ['auth','hang','body'])await check('VIDEO_CATALOG_'+fault.toUpperCase()+'_BOUNDED_EXPLICIT_RETRY',true,async()=>{
    const f=await fixture({fault});try{await f.page.evaluate(()=>window.mountCatalog());await f.page.waitForFunction(()=>window.calls.length===1);await f.page.waitForTimeout(260);const failed=await f.page.evaluate(()=>({loading:window.catalog.loading,error:window.catalog.error}));if(baseline){assert.equal(failed.loading,true);assert.equal(failed.error,'');}else{assert.equal(failed.loading,false);assert(failed.error);}
      await f.page.evaluate(async()=>{window.config.fault='ok';await window.catalog.refresh();});await f.page.waitForFunction(()=>!window.catalog.loading&&window.catalog.models.length===1);await f.page.evaluate(()=>{for(const row of [...window.holds])window.resolveHolds({serial:row.serial},{models:[{id:'late-stale'}]});});await f.page.waitForTimeout(30);assert.equal(await f.page.evaluate(()=>window.catalog.models[0].id),'fixture-video');assert.equal(await f.page.evaluate(()=>window.writeCalls.length),0);return{failed,models:await f.page.evaluate(()=>window.catalog.models)};
    }finally{await f.close();}
  });
  assert.deepEqual(external,[]);assert.deepEqual(pageErrors,[]);assert(!consoles.some(value=>/unmounted component|Maximum update depth|Too many re-renders/.test(value)));
  const pass=checks.every(check=>check.pass);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:pass?(baseline?'BASELINE_REPRODUCED':'PASS'):'FAIL',baseline,checks,sourceHashes:Object.fromEntries(loaded),pageErrors,external,consoleErrors:consoles,providerCalls:0,evidence:'Actual six hooks/save queues in React+Edge; AST Canvas effects. HTTP/auth/body/PG write replies and shell are explicit fixtures; no real supplier'},null,2));
  console.log(`CANVAS_NODE_READ_RESILIENCE=${pass?(baseline?'BASELINE_REPRODUCED':'PASS'):'FAIL'} CHECKS=${checks.length} DEFECTS=${checks.filter(check=>check.defect).length} PROVIDER_CALLS=0`);if(!pass)process.exitCode=1;
}
main().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.txt'),String(error.stack||error));console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
