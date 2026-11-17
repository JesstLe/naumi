/* Real React hook + loopback HTTP + isolated PostgreSQL repository fixture.
 * Authentication is a fixture header, not a Next/auth/service E2E claim.
 * No extra write locks/listeners/retries are installed by this runner. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createServer} = require('node:http'), {spawnSync} = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = process.cwd(), mode = process.argv[2] || 'MODIFIED';
const hook = path.resolve(process.argv[3] || 'src/components/canvas/video/use-video-nodes.ts');
const out = path.resolve(process.argv[4] || process.env.CANVAS_SAVE_TRANSPORT_EVIDENCE || `output/capacity-canvas-transport/${mode}`);
fs.mkdirSync(out, {recursive:true});
function shell(command,args) { const p=spawnSync(command,args,{encoding:'utf8',windowsHide:true}); if(p.status!==0)throw Error(p.stderr||p.stdout); return p.stdout.trim(); }
function load(file, overrides={}) {
  const filename=path.resolve(file), m={exports:{}};
  const code=require('typescript').transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:9}}).outputText;
  vm.runInThisContext(require('node:module').wrap(code),{filename})(m.exports, name=>{
    if(name in overrides)return overrides[name]; if(name==='server-only')return {};if(name.startsWith('@/'))return load(path.resolve(root,'src',name.slice(2))+'.ts');
    if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+'.ts'));
    return require(name);
  },m,filename,path.dirname(filename));return m.exports;
}
async function child() {
  const {Pool}=require('pg'), {build}=require('esbuild'), {chromium}=require('playwright');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
  const schemaModule=load('src/lib/canvas/storage-schema.ts',{'@/platform/db/pool':{getPool:()=>pool},'@/platform/db/schema-readiness':{databaseSchemaReadiness:()=>({})},'@/lib/persistence/schema':{ensureSchema:async()=>{}}});
  const canonicalText=fs.readFileSync('src/lib/model-config/snapshot-value.ts','utf8').match(/export function canonicalConfig[\s\S]*?\n}/)[0];const canonicalConfig=vm.runInThisContext(require('typescript').transpileModule(canonicalText.replace('export ',''),{compilerOptions:{target:9}}).outputText+'\ncanonicalConfig;');
  const repo=load('src/lib/canvas/video-node-repository.ts',{'@/platform/db/pool':{getPool:()=>pool},'@/lib/canvas/storage-schema':schemaModule,'@/lib/model-config/snapshot-value':{canonicalConfig}});
  await repo.ensureVideoNodeSchema();
  const actor='canvas-fixture@example.test', key='tree:fixture', id='vnode-fixture';
  async function save(owner,input) {const c=await pool.connect();try{await c.query('BEGIN');const node=await repo.saveVideoNodeTx(c,owner,input,input.projectKey||key);await c.query('COMMIT');return node;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  let controls={},requests=[],pending=0,maxPending=0,reads=0;
  const clientPath=path.resolve(path.dirname(hook),'../canvas-client.tsx');
  const clientSource=fs.readFileSync(fs.existsSync(clientPath)?clientPath:'src/components/canvas/canvas-client.tsx','utf8');
  const start=clientSource.search(/  (?:async )?function patchVideoNode\(/);assert.ok(start>=0);
  const patchCaller=clientSource.slice(start,clientSource.indexOf('  async function saveVideoDraft(',start));
  const alertStart=clientSource.indexOf('      {(unsavedTextCount>0||videoNodesStore.unsavedCount>0)');
  const alertJsx=alertStart<0?'':clientSource.slice(alertStart,clientSource.indexOf('</div>}',alertStart)+7);
  const saveBinding=require('./verification/canvas-save-browser-binding.cjs').canvasSaveBrowserBinding(clientSource,alertJsx);
  const bundle=await build({stdin:{contents:`import React,{useRef,useSyncExternalStore} from 'react';${saveBinding.imports}import {createCanvasDocumentContext} from './src/lib/canvas/document-scope';import {createCanvasVideoNodeActions} from './src/lib/canvas/video-node-actions';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useVideoNodes} from ${JSON.stringify(hook.replaceAll('\\','/'))};import {selectWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from './src/lib/saas/workspace-client';window.switchWorkspace=selectWorkspace;
    const stringify=JSON.stringify;window.serialization={calls:0,bytes:0};JSON.stringify=function(...args){const value=stringify.apply(JSON,args);if(typeof value==='string'&&value.includes('x'.repeat(100))) {window.serialization.calls++;window.serialization.bytes+=new TextEncoder().encode(value).length;}return value;};
    window.__fixtureActor=${JSON.stringify(actor)};let options={email:${JSON.stringify(actor)},readOnly:false};const request=(url,init={})=>fetch(url,{...init,headers:{...Object.fromEntries(new Headers(init.headers)), 'x-fixture-actor':options.email}});
    const root=createRoot(document.getElementById('root'));function App(){window.__fixtureActor=options.email;useSyncExternalStore(cb=>{window.addEventListener(WORKSPACE_SELECTION,cb);return()=>window.removeEventListener(WORKSPACE_SELECTION,cb)},currentWorkspaceRevision,()=>0);const ctx=useRef(createCanvasDocumentContext()),scope=ctx.current.render(options.email,'tree:fixture');const videoNodesStore=useVideoNodes({...options,scope,request});window.store=videoNodesStore;const pushUndo=(value)=>{};const videoNodeActions=createCanvasVideoNodeActions().bind(scope,{store:videoNodesStore,history:pushUndo});${patchCaller}window.patchVideoNode=patchVideoNode;const canvasTextDocument={retry:async()=>{}},unsavedTextCount=0,unsavedTextRef={current:new Map()},persistTextNode=async n=>n,t=k=>k,flashTip=msg=>{window.tip=msg;};${saveBinding.setup}
    return <div>{window.store.nodes.length}${alertJsx}</div>;}
    window.mount=(next={})=>{options={...options,...next};flushSync(()=>root.render(React.createElement(App)));};window.detach=()=>flushSync(()=>root.render(null));window.mount();`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'copied-save-module',setup(build){build.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture-auth'}));build.onLoad({filter:/.*/,namespace:'fixture-auth'},()=>({contents:"export const authHeader=async()=>({'x-fixture-actor':window.__fixtureActor});",loader:'js'}));build.onResolve({filter:/^@\/lib\/canvas\/video-node-save-queue$/},()=>{const copy=path.resolve(path.dirname(hook),'../../../lib/canvas/video-node-save-queue.ts');return fs.existsSync(copy)?{path:copy}:undefined;});build.onResolve({filter:/^\./},args=>{const sourceRoot=path.resolve(path.dirname(hook),'../../../..');if(sourceRoot===root||!args.importer.startsWith(sourceRoot+path.sep))return;const candidate=path.resolve(path.dirname(args.importer),args.path);if(['','.ts','.tsx'].some(ext=>fs.existsSync(candidate+ext)))return;const fallback=path.resolve(root,path.relative(sourceRoot,path.dirname(args.importer)),args.path);for(const ext of ['','.ts','.tsx'])if(fs.existsSync(fallback+ext))return {path:fallback+ext};});}}]});
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');return;}
      if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
      if(!url.pathname.startsWith('/api/canvas/video-nodes')){res.writeHead(404);res.end();return;}
      const owner=req.headers['x-fixture-actor'];
      if(controls.revoked||owner!==actor){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:'fixture access revoked'}));return;}
      if(req.method==='GET'){
        reads++;
        const nodes=await repo.listVideoNodes(owner,undefined,true);if(controls.readDelay)await new Promise(r=>setTimeout(r,controls.readDelay));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,nodes}));return;
      }
      let raw='';for await(const chunk of req)raw+=chunk;
      const input=JSON.parse(raw);requests.push({input,bytes:Buffer.byteLength(raw),workspace:req.headers['x-naumi-workspace']});pending++;maxPending=Math.max(maxPending,pending);
      try {
        if(controls.delay)await new Promise(r=>setTimeout(r,controls.delay));
        if(controls.failBefore){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture offline"}');return;}
        const node=await save(owner,input);
        if(controls.dropAfter){controls.dropAfter--;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture response lost after commit"}');return;}
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(controls.badAck?{ok:true}:{ok:true,node}));
      }finally{pending--;}
    }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),page=await browser.newPage();
  const failures=[],checks=[],metrics={};const base=`http://127.0.0.1:${server.address().port}`;
  page.on('pageerror',e=>failures.push('PAGEERROR '+e.message));
  async function check(name,run){try{await run();checks.push(name);console.log('PASS '+name);}catch(e){failures.push(name+': '+e.message);console.log('FAIL '+name+': '+e.message);}}
  async function reset(){if(page.url().startsWith(base))await page.evaluate(()=>{window.detach();sessionStorage.clear();});await page.goto('about:blank');while(pending)await new Promise(r=>setTimeout(r,10));controls={};requests=[];maxPending=0;reads=0;await pool.query('TRUNCATE app_canvas_video_nodes,app_canvas_video_node_operations,app_canvas_video_projects');await save(actor,{id,projectKey:key,expectedRevision:0,operationId:crypto.randomUUID(),config:{prompt:'seed'},inputs:[]});await page.goto(base);await page.waitForFunction(()=>window.store?.ready&&window.store.nodes.length===1);}
  async function latest(){return repo.getVideoNode(actor,id);}
  try {
    await check('duplicate pending saves share one persisted ACK',async()=>{await reset();controls.delay=100;
      const result=await page.evaluate(async()=>{const patch={config:{prompt:'x'.repeat(12000)}};return Promise.allSettled(Array.from({length:20},()=>window.store.save('vnode-fixture',patch))).then(r=>r.map(x=>x.status==='fulfilled'?x.value?.revision:x.reason.message));});
      metrics.duplicate={calls:20,requests:requests.length,serializedBodyBytes:requests.reduce((n,r)=>n+r.bytes,0),serialization:await page.evaluate(()=>window.serialization),revisions:result,maxConcurrent:maxPending};
      assert.equal(requests.length,1);assert.deepEqual(new Set(result),new Set([2]));assert.equal((await latest()).config.prompt.length,12000);
    });
    await check('lost response reuses nonce and ACKs committed revision',async()=>{await reset();controls.dropAfter=1;
      const result=await page.evaluate(()=>window.store.save('vnode-fixture',{expectedRevision:1,config:{prompt:'response-lost'}}).then(n=>({revision:n.revision}),e=>({error:e.message})));
      metrics.lostResponse={requests:requests.length,nonces:new Set(requests.map(r=>r.input.operationId)).size,result};
      assert.equal(result.revision,2);assert.equal(new Set(requests.map(r=>r.input.operationId)).size,1);assert.equal((await latest()).revision,2);
    });
    await check('rapid distinct edits including save-in-flight preserve order',async()=>{await reset();controls.delay=20;
      const result=await page.evaluate(()=>Promise.all(['A','B','A'].map(title=>window.store.save('vnode-fixture',{title}))).then(r=>r.map(n=>n.title)));
      assert.deepEqual(result,['A','B','A']);assert.equal(requests.length,3);assert.equal(maxPending,1);assert.equal((await latest()).title,'A');
    });
    await check('failure keeps flush dirty and manual recovery',async()=>{await reset();controls.failBefore=true;
      const failed=await page.evaluate(async()=>{const result=await window.store.save('vnode-fixture',{title:'offline'}).then(()=>false,()=>true);return {result,dirty:await window.store.flush().then(()=>false,()=>true)};});
      assert.equal(failed.result,true);assert.equal(failed.dirty,true);assert.ok(requests.length<=3);
      controls.failBefore=false;await page.evaluate(()=>window.store.save('vnode-fixture',{title:'offline'}));assert.equal((await latest()).title,'offline');
      assert.equal(new Set(requests.map(r=>r.input.operationId)).size,1);
    });
    await check('real canvas save caller retries failed node',async()=>{await reset();controls.failBefore=true;
      assert.equal(await page.evaluate(()=>window.patchVideoNode('vnode-fixture',{title:'caller'}).then(()=>false,()=>true)),true);
      controls.failBefore=false;const result=await page.evaluate(()=>window.patchVideoNode('vnode-fixture',{title:'caller'}).then(n=>n.revision));assert.equal(result,2);assert.equal(new Set(requests.map(r=>r.input.operationId)).size,1);
    });
    await check('outage backlog does not multiply retry budget',async()=>{await reset();controls.failBefore=true;
      const results=await page.evaluate(()=>Promise.allSettled(Array.from({length:10},(_,i)=>window.store.save('vnode-fixture',{title:'edit-'+i}))).then(r=>r.map(x=>x.status)));
      assert.ok(results.every(s=>s==='rejected'));assert.ok(requests.length<=3,`requests=${requests.length}`);assert.equal(new Set(requests.map(r=>r.input.operationId)).size,1);
    });
    await check('missing persisted node is not a successful ACK',async()=>{await reset();controls.badAck=true;const failed=await page.evaluate(()=>window.store.save('vnode-fixture',{title:'bad-ack'}).then(()=>false,()=>true));assert.equal(failed,true);});
    await check('queued write cancelled on read-only transition',async()=>{await reset();controls.delay=150;
      await page.evaluate(()=>{window.results=Promise.allSettled([window.store.save('vnode-fixture',{title:'first'}),window.store.save('vnode-fixture',{title:'second'})]);});
      await new Promise(r=>setTimeout(r,30));await page.evaluate(()=>window.mount({readOnly:true}));await page.evaluate(()=>window.results);assert.ok(requests.length<=1);assert.notEqual((await latest()).title,'second');
    });
    await check('late GET cannot replace a newer save ACK',async()=>{await reset();controls.readDelay=180;
      await page.evaluate(()=>{window.oldRead=window.store.refresh();});await new Promise(r=>setTimeout(r,25));await page.evaluate(()=>window.store.save('vnode-fixture',{title:'newer'}));await page.evaluate(()=>window.oldRead);
      assert.equal(await page.evaluate(()=>window.store.getNode('vnode-fixture').title),'newer');assert.equal(await page.evaluate(()=>window.store.getNode('vnode-fixture').revision),2);
    });
    await check('in-flight response is not delivered to another owner',async()=>{await reset();controls.delay=180;
      await page.evaluate(()=>{window.oldSave=window.store.save('vnode-fixture',{title:'owner-A'}).then(()=>false,()=>true);});await new Promise(r=>setTimeout(r,30));await page.evaluate(()=>window.mount({email:'other@example.test'}));assert.equal(await page.evaluate(()=>window.oldSave),true);assert.equal(await page.evaluate(()=>window.store.nodes.length),0);
    });
    await check('workspace switch fences queued saves and old response',async()=>{await reset();controls.delay=180;
      await page.evaluate(()=>{window.oldSave=Promise.allSettled([window.store.save('vnode-fixture',{title:'space-A'}),window.store.save('vnode-fixture',{title:'space-A-late'})]);});await new Promise(r=>setTimeout(r,30));await page.evaluate(()=>window.switchWorkspace('fixture-team'));await page.evaluate(()=>window.oldSave);await new Promise(r=>setTimeout(r,200));assert.equal(requests.length,1);assert.equal(requests[0].workspace,'personal');
    });
    await check('unmount aborts reads and prevents queued writes',async()=>{await reset();controls.delay=180;
      await page.evaluate(()=>{window.oldSave=Promise.allSettled([window.store.save('vnode-fixture',{title:'detach-first'}),window.store.save('vnode-fixture',{title:'detach-second'})]);});await new Promise(r=>setTimeout(r,30));await page.evaluate(()=>window.detach());await page.evaluate(()=>window.oldSave);await new Promise(r=>setTimeout(r,210));assert.equal(requests.length,1);const count=reads;await new Promise(r=>setTimeout(r,6100));assert.equal(reads,count);
    });
    await check('explicit CAS conflict is not retried or silently rebased',async()=>{await reset();await save(actor,{id,expectedRevision:1,operationId:crypto.randomUUID(),title:'other-tab'});
      const rejected=await page.evaluate(()=>window.store.save('vnode-fixture',{expectedRevision:1,title:'stale'}).then(()=>false,e=>e.code==='VIDEO_NODE_REVISION_CONFLICT'));assert.equal(rejected,true);assert.equal(requests.length,1);assert.equal((await latest()).title,'other-tab');
    });
    await check('project mutation conflict leaves persisted project intact',async()=>{await reset();const rejected=await page.evaluate(()=>window.store.save('vnode-fixture',{expectedRevision:1,projectKey:'tree:other',title:'wrong-project'}).then(()=>false,e=>e.code==='VIDEO_NODE_PROJECT_CONFLICT'));assert.equal(rejected,true);assert.equal((await latest()).projectKey,key);assert.equal(requests.length,1);});
    await check('offline reload retains dirty draft and exact nonce for explicit recovery',async()=>{await reset();controls.failBefore=true;
      await page.evaluate(()=>window.store.save('vnode-fixture',{title:'offline-reload'}).catch(()=>{}));const first=requests[0].input.operationId;
      await page.reload();await page.waitForFunction(()=>window.store?.ready);assert.ok(await page.evaluate(()=>window.store.unsavedCount)>0);controls.failBefore=false;
      await page.getByRole('button',{name:'canvas.retrySave'}).click();await page.waitForFunction(()=>window.store.unsavedCount===0);assert.equal((await latest()).title,'offline-reload');assert.equal(new Set(requests.map(r=>r.input.operationId)).size,1);assert.equal(requests.at(-1).input.operationId,first);
      await page.waitForFunction(()=>window.store.unsavedCount===0);
    });
    await check('unmount reload recovers all queued edits without silent rebase',async()=>{await reset();controls.delay=180;
      await page.evaluate(()=>{window.oldSaves=Promise.allSettled(['draft-A','draft-B'].map(title=>window.store.save('vnode-fixture',{title})));});await new Promise(r=>setTimeout(r,30));await page.evaluate(()=>window.detach());await page.evaluate(()=>window.oldSaves);await new Promise(r=>setTimeout(r,200));controls.delay=0;
      await page.reload();await page.waitForFunction(()=>window.store?.ready);assert.equal(await page.evaluate(()=>window.store.unsavedCount),2);await page.evaluate(()=>window.store.retryPending());assert.equal((await latest()).title,'draft-B');assert.equal((await latest()).revision,3);
    });
    await check('transient failure followed by distinct queued edit preserves both',async()=>{await reset();controls.dropAfter=1;
      const result=await page.evaluate(()=>Promise.all(['first','second'].map(title=>window.store.save('vnode-fixture',{title}))).then(r=>r.map(n=>n.revision)));assert.deepEqual(result,[2,3]);assert.equal((await latest()).title,'second');
    });
    await check('recovered draft meets intervening tab CAS without overwrite',async()=>{await reset();controls.failBefore=true;await page.evaluate(()=>window.store.save('vnode-fixture',{title:'local-draft'}).catch(()=>{}));controls.failBefore=false;await save(actor,{id,expectedRevision:1,operationId:crypto.randomUUID(),title:'other-tab-wins'});
      await page.reload();await page.waitForFunction(()=>window.store?.ready);const failed=await page.evaluate(()=>window.store.retryPending().then(()=>false,e=>e.code==='VIDEO_NODE_REVISION_CONFLICT'));assert.equal(failed,true);assert.equal((await latest()).title,'other-tab-wins');assert.ok(await page.evaluate(()=>window.store.unsavedCount)>0);
    });
    await check('draft journal is isolated by owner and workspace',async()=>{await reset();controls.failBefore=true;await page.evaluate(()=>window.store.save('vnode-fixture',{title:'private-draft'}).catch(()=>{}));await page.evaluate(()=>window.mount({email:'other@example.test'}));await page.waitForFunction(()=>window.store?.ready);assert.equal(await page.evaluate(()=>window.store.unsavedCount),0);
      await page.evaluate(()=>window.mount({email:'canvas-fixture@example.test'}));await page.waitForFunction(()=>window.store?.ready);assert.equal(await page.evaluate(()=>window.store.unsavedCount),1);
      await page.evaluate(()=>window.switchWorkspace('fixture-team'));await page.waitForFunction(()=>window.store?.ready);assert.equal(await page.evaluate(()=>window.store.unsavedCount),0);
    });
    await check('storage quota failure retains in-memory edits and successful ACK',async()=>{await reset();controls.delay=80;
      const result=await page.evaluate(async()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('fixture full','QuotaExceededError');};try{return (await window.store.save('vnode-fixture',{title:'memory-retained'})).revision;}finally{Storage.prototype.setItem=original;}});assert.equal(result,2);assert.equal((await latest()).title,'memory-retained');
    });
    await check('browser offline failure stays dirty and online recovery is explicit',async()=>{await reset();await page.context().setOffline(true);
      try {assert.equal(await page.evaluate(()=>window.store.save('vnode-fixture',{title:'browser-offline'}).then(()=>false,()=>true)),true);assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>window.store.flush().then(()=>false,()=>true)),true);}
      finally {await page.context().setOffline(false);}
      assert.equal(requests.length,0);await page.getByRole('button',{name:'canvas.retrySave'}).click();await page.waitForFunction(()=>window.store.unsavedCount===0);assert.equal(requests.length,1);assert.equal((await latest()).title,'browser-offline');
    });
    await check('same revision concurrent CAS has exactly one winner',async()=>{await reset();const results=await Promise.allSettled([1,2].map(x=>save(actor,{id,expectedRevision:1,operationId:crypto.randomUUID(),x})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='VIDEO_NODE_REVISION_CONFLICT').length,1);});
    await check('persisted reload and owner isolation',async()=>{await reset();await page.evaluate(()=>window.store.save('vnode-fixture',{title:'reload'}));await page.reload();await page.waitForFunction(()=>window.store?.nodes[0]?.title==='reload');assert.equal(await repo.getVideoNode('other@example.test',id),null);controls.revoked=true;const denied=await page.evaluate(()=>window.store.save('vnode-fixture',{title:'denied'}).then(()=>false,()=>true));assert.equal(denied,true);assert.equal((await latest()).title,'reload');});
  }finally{await browser.close();await new Promise(r=>server.close(r));await pool.end();}
  const report={mode,hook,checks,failures,metrics,fixture:'actual React hook / real loopback HTTP / actual repository SQL on isolated PG; fixture auth and service boundary',suppliers:0};
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(metrics));console.log(`RESULT=${failures.length?'FAIL':'PASS'} PASS=${checks.length} FAIL=${failures.length} SUPPLIER_CALLS=0`);if(failures.length)process.exitCode=1;
}
async function main(){
  if(process.argv.includes('--child'))return child();
  const name='naumi-canvas-save-'+crypto.randomUUID(),database='canvas_transport_fixture',password=crypto.randomBytes(20).toString('hex');let container;
  try{container=shell('docker',['run','--detach','--rm','--name',name,'--label','naumi.task=canvas-save-transport','--memory','384m','--cpus','1','--tmpfs','/var/lib/postgresql/data','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB='+database,'postgres:16-alpine']);
    let ready=false;for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',container,'pg_isready','-U','postgres','-d',database],{windowsHide:true});if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
    const port=Number(shell('docker',['port',container,'5432/tcp']).split(':').at(-1));
    const allowed=new Set(['path','systemroot','windir','temp','tmp','userprofile','localappdata','appdata','comspec','pathext']);const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toLowerCase())));
    env.DATABASE_URL=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
    const r=spawnSync(process.execPath,[__filename,mode,hook,out,'--child'],{env,encoding:'utf8',windowsHide:true,timeout:180000});
    fs.writeFileSync(path.join(out,'stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(out,'stderr.txt'),r.stderr||'');console.log(r.stdout);if(r.stderr)console.error(r.stderr);process.exitCode=r.status??1;
  }finally{if(container){assert.equal(shell('docker',['inspect','--format','{{index .Config.Labels "naumi.task"}}',container]),'canvas-save-transport');shell('docker',['rm','--force',container]);console.log('FIXTURE_STOPPED=YES');}}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
