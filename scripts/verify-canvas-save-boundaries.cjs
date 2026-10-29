/* Independent targeted review: actual hook, queue, patchVideoNode,
 * privateFetchRaw and unsaved-alert JSX. Only the auth/HTTP server is a fixture.
 * No PG, Next application, production service or supplier execution. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createRequire}=require('node:module');
const deps=process.env.REVIEW_DEPS||path.resolve('node_modules');
const req=createRequire(path.join(deps,'package.json'));
const {build}=req('esbuild'),{chromium}=req('playwright'),ts=req('typescript');
const root=process.cwd(),mode=process.argv[2]||'MODIFIED',out=path.resolve('output/capacity-audit-wave2-20261029/review-followups/canvas-'+mode);fs.mkdirSync(out,{recursive:true});const fixed=mode==='MODIFIED';
const isBaseline=false;
const hook=path.resolve(process.argv[3]||'src/components/canvas/video/use-video-nodes.ts');
const client=path.resolve(process.argv[4]||'src/components/canvas/canvas-client.tsx');
const source=fs.readFileSync(client,'utf8'),ast=ts.createSourceFile(client,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){const found=[];function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);assert.equal(found.length,1,name);return found[0];}
const alertStart=source.indexOf('      {(unsavedTextCount>0||videoNodesStore.unsavedCount>0)');
const alert=alertStart<0?'':source.slice(alertStart,source.indexOf('</div>}',alertStart)+7);
const evidence={mode,hook,client,checks:[],observations:[],failures:[],tier:'Actual React hook and extracted production caller/alert, headless Chromium, loopback HTTP fixture. No PG or full Canvas/browser acceptance.'};
let nodes,receipts,requests,failStatus,holds,dropAfter,reads;
const clone=x=>JSON.parse(JSON.stringify(x));
function seed(id){return {id,projectKey:'tree:review',revision:1,title:'seed-'+id,x:0,y:0,width:384,height:216,config:{prompt:'seed-prompt'},inputs:[],lastTaskId:null,lastResultId:null,deletedAt:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};}
function resetData(){nodes=new Map(['vnode-a','vnode-b'].map(id=>[id,seed(id)]));receipts=new Map();requests=[];failStatus=new Map();holds=new Map();dropAfter=0;reads=0;}
function remote(id,patch){const n=nodes.get(id);nodes.set(id,{...n,...patch,revision:n.revision+1});}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));}
async function main(){
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useVideoNodes} from ${JSON.stringify(hook.replaceAll('\\','/'))};import {selectWorkspace} from './src/lib/saas/workspace-client';
 let options={email:'a@example.test',readOnly:false};
 const authHeader=async()=>({'x-fixture-actor':options.email});
 ${extract('privateFetchRaw')}
 const root=createRoot(document.getElementById('root'));window.undo=[];window.tip='';window.switchWorkspace=selectWorkspace;
 function App(){const videoNodesStore=useVideoNodes({...options,request:privateFetchRaw});window.store=videoNodesStore;
 const pushUndo=x=>window.undo.push(x);${extract('patchVideoNode')}
 ${extract('saveVideoDraft')}window.patchVideoNode=patchVideoNode;window.saveVideoDraft=saveVideoDraft;
 const unsavedTextCount=0,unsavedTextRef={current:new Map()},persistTextNode=async n=>n,t=k=>k,flashTip=s=>{window.tip=s;};
 return <><output data-testid="nodes">{JSON.stringify(videoNodesStore.nodes)}</output>${alert}</>;}
 window.mount=(next={},strict=false)=>{options={...options,...next};flushSync(()=>root.render(strict?<React.StrictMode><App/></React.StrictMode>:<App/>));};
 window.detach=()=>flushSync(()=>root.render(null));window.mount();`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',nodePaths:[deps],tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'exact-queue-copy',setup(b){b.onResolve({filter:/^@\/lib\/canvas\/video-node-save-queue$/},()=>({path:path.resolve(path.dirname(hook),'../../../lib/canvas/video-node-save-queue.ts')}));}}]});
 // Use the actual request schema, not a fixture that accepts impossible fields.
 await build({entryPoints:[path.join(root,'src/lib/canvas/video-node-schema.ts')],outfile:path.join(out,'schema.cjs'),bundle:true,platform:'node',nodePaths:[deps],format:'cjs'});
 const {videoNodeWriteSchema}=require(path.join(out,'schema.cjs'));
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');return;}
  if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
  if(!req.url.startsWith('/api/canvas/video-nodes')){res.writeHead(404);res.end();return;}
  if(req.method==='GET'){reads++;json(res,200,{nodes:[...nodes.values()]});return;}
  let raw='';for await(const c of req)raw+=c;
  const parsed=videoNodeWriteSchema.safeParse(JSON.parse(raw));
  if(!parsed.success){json(res,422,{error:'INVALID_VIDEO_NODE',code:'INVALID_VIDEO_NODE'});return;}
  const input=parsed.data;
  requests.push({raw,input,workspace:req.headers['x-naumi-workspace'],actor:req.headers['x-fixture-actor']});
  if(holds.has(input.id))await holds.get(input.id).promise;
  const failure=failStatus.get(input.id);
  if(failure){json(res,failure,{error:'fixture-'+failure,code:'FIXTURE_FAILURE'});return;}
  // Explicit protocol boundary only: source repository CAS/receipt behavior;
  // no additional client guard or retry is inserted here.
  let node=receipts.get(input.operationId);
  if(!node){const old=nodes.get(input.id);if(input.expectedRevision!==(old?.revision||0)){json(res,409,{error:'视频节点已更新，请重新读取后修改',code:'VIDEO_NODE_REVISION_CONFLICT'});return;}
   if(old&&input.projectKey&&input.projectKey!==old.projectKey){json(res,409,{error:'VIDEO_NODE_PROJECT_CONFLICT',code:'VIDEO_NODE_PROJECT_CONFLICT'});return;}
   const {operationId,expectedRevision,...fields}=input;node={...(old||seed(input.id)),...fields,revision:(old?.revision||0)+1};nodes.set(input.id,node);receipts.set(operationId,node);}
  if(dropAfter){dropAfter--;json(res,503,{error:'fixture-response-lost-after-commit'});return;}
  json(res,200,{ok:true,node});
 }catch(e){json(res,500,{error:e.message});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;console.log('FIXTURE='+base);
 const browser=await chromium.launch({headless:true});let context,page;
 const pageErrors=[];
 async function reset(){if(context)await context.close();resetData();context=await browser.newContext();page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.store?.ready&&window.store.nodes.length===2);}
 async function settle(fn,arg){return page.evaluate(fn,arg);}
 async function ui(){return page.evaluate(async()=>({unsaved:window.store.unsavedCount??null,error:window.store.error,alert:document.querySelector('[role=alert]')?.textContent||null,nodes:window.store.nodes,flush:await window.store.flush().then(()=>true,()=>false),journal:[...Array(sessionStorage.length)].map((_,i)=>({key:sessionStorage.key(i),value:sessionStorage.getItem(sessionStorage.key(i))}))}));}
 async function check(name,fn){try{await fn();evidence.checks.push(name);console.log('PASS '+name);}catch(e){evidence.failures.push({name,error:e.stack});console.log('FAIL '+name+': '+e.message);}}
 function observe(name,result){evidence.observations.push({name,...result});console.log('OBSERVATION '+name+' '+JSON.stringify(result));}
 function hold(id){let release;const promise=new Promise(r=>release=r);holds.set(id,{promise,release});return release;}
 try{
  await check('R1 unrelated position ACK prunes conflicted configuration draft',async()=>{
   await reset();remote('vnode-a',{config:{prompt:'remote-newer'}});
   const rejected=await settle(()=>{const node=window.store.getNode('vnode-a');return window.saveVideoDraft('vnode-a',{title:node.title,inputs:node.inputs,config:{...node.config,prompt:'local-unsaved'},expectedRevision:node.revision}).then(()=>false,e=>e.code);});assert.equal(rejected,'VIDEO_NODE_REVISION_CONFLICT');
   await page.waitForFunction(()=>window.store.getNode('vnode-a')?.revision===2);
   const before=await ui();await settle(()=>window.patchVideoNode('vnode-a',{x:128,y:64}));const after=await ui();
   await page.reload();await page.waitForFunction(()=>window.store?.ready);const reload=await ui();
   const result={beforeDirty:before.unsaved,beforeDraft:before.journal.some(x=>x.value.includes('local-unsaved')),afterDirty:after.unsaved,afterAlert:after.alert,afterFlush:after.flush,serverPrompt:nodes.get('vnode-a').config.prompt,serverX:nodes.get('vnode-a').x,afterDraft:after.journal.some(x=>x.value.includes('local-unsaved')),reloadDirty:reload.unsaved,writeStatuses:'409,200',requestFields:requests.map(r=>Object.keys(r.input).filter(k=>!['id','expectedRevision','operationId'].includes(k)))};
   observe('R1',result);assert.equal(result.serverPrompt,'remote-newer');assert.equal(result.afterDraft,fixed);assert.equal(result.afterFlush,!fixed);assert.equal(result.beforeDraft,true);assert.equal(result.beforeDirty,1);assert.equal(result.afterDirty,fixed?1:0);assert.equal(result.reloadDirty,fixed?1:0);if(fixed)assert.ok(result.afterAlert);else assert.equal(result.afterAlert,null);
  });
  if(isBaseline)return;
  await check('R2 permanent conflict starves independent recoverable node in retry button',async()=>{
   await reset();remote('vnode-a',{title:'remote'});await settle(()=>window.patchVideoNode('vnode-a',{title:'local'}).catch(()=>{}));await page.waitForFunction(()=>window.store.getNode('vnode-a')?.revision===2);
   failStatus.set('vnode-b',503);await settle(()=>window.patchVideoNode('vnode-b',{title:'recoverable-b'}).catch(()=>{}));failStatus.clear();
   const before=await ui(),start=requests.length;
   for(let i=0;i<2;i++){await page.evaluate(()=>window.tip='');await page.getByRole('button',{name:'canvas.retrySave'}).click();await page.waitForFunction(()=>window.tip.includes('视频节点已更新'));}
   const after=await ui();const result={beforeDirty:before.unsaved,afterDirty:after.unsaved,retryIds:requests.slice(start).map(r=>r.input.id),bServerTitle:nodes.get('vnode-b').title,bDraftPreserved:after.journal.some(x=>x.value.includes('recoverable-b')),flush:after.flush,alert:after.alert};observe('R2',result);
   assert.deepEqual(result.retryIds,fixed?['vnode-a','vnode-b','vnode-a']:['vnode-a','vnode-a']);assert.equal(result.bServerTitle,fixed?'recoverable-b':'seed-vnode-b');assert.equal(result.afterDirty,fixed?1:2);assert.equal(result.bDraftPreserved,!fixed);assert.equal(result.flush,false);
  });
  await check('explicit configuration replacement ACK clears the old configuration intent',async()=>{
   await reset();remote('vnode-a',{config:{prompt:'remote-newer'}});
   await settle(()=>window.saveVideoDraft('vnode-a',{title:'local',inputs:[],config:{prompt:'mine'},expectedRevision:1}).catch(()=>{}));
   await page.waitForFunction(()=>window.store.getNode('vnode-a')?.revision===2);
   await settle(()=>window.patchVideoNode('vnode-a',{x:50}));
   if(fixed)assert.equal((await ui()).unsaved,1);
   await settle(()=>{const n=window.store.getNode('vnode-a');return window.saveVideoDraft(n.id,{title:'explicit replacement',inputs:[],config:{prompt:'mine-after-review'},expectedRevision:n.revision});});
   assert.equal((await ui()).unsaved,0);assert.equal((await ui()).flush,true);assert.equal(nodes.get('vnode-a').config.prompt,'mine-after-review');
   await page.reload();await page.waitForFunction(()=>window.store?.ready);assert.equal((await ui()).unsaved,0);
  });
  await check('same tail shares promise; A-B-A keeps three distinct writes',async()=>{
   await reset();const result=await settle(async()=>{const a=window.store.save('vnode-a',{title:'A'}),dup=window.store.save('vnode-a',{title:'A'}),b=window.store.save('vnode-a',{title:'B'}),end=window.store.save('vnode-a',{title:'A'});return {same:a===dup,titles:(await Promise.all([a,b,end])).map(n=>n.title)};});assert.equal(result.same,true);assert.deepEqual(result.titles,['A','B','A']);assert.equal(requests.length,3);assert.equal((await ui()).unsaved,0);observe('ORDER',result);
  });
  await check('lost response reuses exact body and nonce through real caller',async()=>{
   await reset();dropAfter=1;await settle(()=>window.patchVideoNode('vnode-a',{title:'lost'}));assert.equal(requests.length,2);assert.equal(requests[0].raw,requests[1].raw);assert.equal(nodes.get('vnode-a').revision,2);assert.equal((await ui()).unsaved,0);observe('NONCE',{requests:requests.length,distinctBodies:new Set(requests.map(r=>r.raw)).size,revision:nodes.get('vnode-a').revision});
  });
  await check('pending backlog shares outage budget then explicit retry drains',async()=>{
   await reset();failStatus.set('vnode-a',503);const results=await settle(()=>Promise.allSettled(['A','B','A'].map(title=>window.store.save('vnode-a',{title}))).then(r=>r.map(x=>x.status)));assert.deepEqual(results,['rejected','rejected','rejected']);assert.equal(requests.length,3);const before=await ui();assert.equal(before.unsaved,3);assert.equal(before.flush,false);failStatus.clear();await page.getByRole('button',{name:'canvas.retrySave'}).click();await page.waitForFunction(()=>window.store.unsavedCount===0);assert.equal(nodes.get('vnode-a').title,'A');observe('BUDGET',{automaticRequests:3,pendingBefore:3,pendingAfter:(await ui()).unsaved,finalRevision:nodes.get('vnode-a').revision});
  });
  await check('owner and workspace ABA preserve journal isolation and fence late ACK',async()=>{
   await reset();const release=hold('vnode-a');await settle(()=>{window.old=window.store.save('vnode-a',{title:'late-A'}).then(()=> 'fulfilled',()=> 'rejected');});await page.waitForFunction(()=>sessionStorage.length>1);
   while(requests.length<1)await new Promise(r=>setImmediate(r));
   await settle(()=>window.mount({email:'b@example.test'}));assert.equal((await ui()).unsaved,0);
   await settle(()=>window.mount({email:'a@example.test'}));assert.equal((await ui()).unsaved,1);
   await settle(()=>window.switchWorkspace('review-team'));await page.waitForFunction(()=>window.store.ready);assert.equal((await ui()).unsaved,0);
   await settle(()=>window.switchWorkspace('personal'));await page.waitForFunction(()=>window.store.ready);assert.equal((await ui()).unsaved,1);
   release();holds.clear();assert.equal(await settle(()=>window.old),'rejected');assert.equal(requests.length,1);await settle(()=>window.store.retryPending());assert.equal((await ui()).unsaved,0);assert.equal(requests[0].raw,requests[1].raw);observe('ABA',{latePromise:'rejected',requests:requests.length,sameBody:true,finalDirty:0});
  });
  await check('StrictMode and unmount leave no duplicate polling or unload handlers',async()=>{
   await reset();await settle(()=>{window.detach();window.mount({},true);});await page.waitForFunction(()=>window.store.ready);const release=hold('vnode-a');await settle(()=>{window.old=Promise.allSettled([window.store.save('vnode-a',{title:'unmount-A'}),window.store.save('vnode-a',{title:'unmount-B'})]);});
   while(requests.length<1)await new Promise(r=>setImmediate(r));await settle(()=>window.detach());release();holds.clear();await settle(()=>window.old);const beforeReads=reads;await page.waitForTimeout(6200);assert.equal(reads,beforeReads);assert.equal(requests.length,1);
   const unload=await settle(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});assert.equal(unload,false);await page.reload();await page.waitForFunction(()=>window.store?.ready);assert.equal((await ui()).unsaved,2);await settle(()=>window.store.retryPending());assert.equal((await ui()).unsaved,0);assert.equal(nodes.get('vnode-a').title,'unmount-B');observe('LIFECYCLE',{pollAfterUnmount:reads-beforeReads-1,unloadPreventedAfterUnmount:unload,reloadedPending:2,finalDirty:0});
  });
 }finally{
  for(const h of holds?.values()||[])h.release();await browser.close();await new Promise(r=>server.close(r));
  evidence.pageErrors=pageErrors;assert.equal(pageErrors.length,0,JSON.stringify(pageErrors));
  evidence.exit=evidence.failures.length?1:0;fs.writeFileSync(path.join(out,mode+'-RESULT.json'),JSON.stringify(evidence,null,2));
  console.log(`REVIEW_RESULT=${evidence.failures.length?'FAIL':'PASS'} CHECKS=${evidence.checks.length} FAIL=${evidence.failures.length} PAGEERRORS=${pageErrors.length}`);console.log('FIXTURE_STOPPED=YES BROWSER_CLOSED=YES PG_STARTED=NO');process.exitCode=evidence.exit;
 }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
