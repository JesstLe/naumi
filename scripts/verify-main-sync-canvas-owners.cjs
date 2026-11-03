/** Main integration: execute the actual retained image owners, not a copied
 * Canvas loop. Only browser auth/HTTP/document ports are controlled fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {bundle,setup,root}=require('./verify-canvas-image-task-refactor.cjs');
const out=path.resolve(process.env.MAIN_SYNC_CANVAS_EVIDENCE||'output/main-sync-canvas-owners');fs.mkdirSync(out,{recursive:true});
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),rows=[];let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(plain(a),plain(b),message);checks++;};
const waitFor=async(test,label)=>{for(let n=0;n<100;n++){if(test())return;await new Promise(r=>setImmediate(r));}throw Error('FIXTURE_BOUNDARY_NOT_REACHED:'+label);};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

(async()=>{
 const built=await bundle();
 // The current replacement display can change, while accepted/recoverable
 // executions and their original operation identity remain independently owned.
 {
  const f=setup('derived','done',built),c=f.c,view=c.generationPresentation,place={preferred:{x:0,y:0},occupied:[],reserve:false};
  const task=(id,key)=>({id,operationKey:key,sourceId:'source',replaceNode:true,label:id,stage:'preparing',startedAt:1,count:1});
  const retryA=()=>Promise.resolve('original-A');view.start(task('A','attempt:A'),place);view.update('A',{failure:{kind:'uncertain',message:'ACK missing'},onRetry:retryA});
  view.start(task('B','attempt:B'),place);let tasks=view.getSnapshot().tasks;
  eq(tasks.map(t=>[t.id,!!t.displaySuperseded]),[['A',true],['B',false]],'new purchase supersedes display, not retained A');
  eq(c.projectCanvasImageAttempts([...tasks],'source').current.id,'B','display belongs to current attempt');
  eq(c.projectCanvasImageAttempts([...tasks],'source').recoverable.map(t=>t.id),['A'],'original A remains explicitly recoverable');
  view.start(task('A-retry','attempt:A'),place);tasks=view.getSnapshot().tasks;
  eq(c.projectCanvasImageAttempts([...tasks],'source').current.id,'B','original A retry never steals the current display');
  view.remove('B');eq(c.projectCanvasImageAttempts([...view.getSnapshot().tasks],'source').current,undefined,'finishing current B does not resurrect superseded A');
  rows.push({name:'replacement-display-vs-original-execution',status:'PASS'});
 }
 // Actual runGen -> image-runs -> task-controller. A and B are separately frozen
 // explicit intents; a second invocation of A is one-flight, not a third POST.
 {
  const f=setup('derived','done',built),c=f.c,a=deferred(),b=deferred(),submitted=[],originalSubmit=c.privateFetch,originalFetch=c.fetch;
  c.privateFetch=async(url,init)=>{await originalSubmit(url,init);return Response.json({jobId:submitted.length?'job-B':'job-A'});};
  c.fetch=async(url,init)=>{if(String(url).includes('/position'))return originalFetch(url,init);const job=new URL(String(url),'http://fixture').searchParams.get('job');await(job==='job-A'?a.promise:b.promise);return originalFetch(url,init);};
  const first=c.entry.runGen(f.src,'frozen A',{count:1,operationKey:'attempt:A',onSubmitted:()=>submitted.push('A')});
  await waitFor(()=>submitted.length===1,'A durable receipt');
  const duplicate=await c.entry.runGen(f.src,'same A',{count:1,operationKey:'attempt:A'});eq(duplicate,[],'same operation is in flight');eq(f.state.post,1,'same attempt does not POST twice');
  const second=c.entry.runGen(f.src,'frozen B',{count:1,operationKey:'attempt:B',onSubmitted:()=>submitted.push('B')});
  await waitFor(()=>submitted.length===2,'B durable receipt');eq(f.state.post,2,'accepted A does not block deliberate B');
  eq(f.state.forms.map(fields=>Object.fromEntries(fields).prompt),['frozen A','frozen B'],'each accepted task keeps its original prompt');
  b.resolve();await second;eq(c.generationPresentation.busy('attempt:A'),true,'B finishes while original A remains active');
  a.resolve();await first;eq(f.state.post,2,'late A completion never submits again');eq(c.generationOperationRef.current.size,0,'all original activities release their own keys');
  rows.push({name:'two-original-run-owners-and-durable-receipts',status:'PASS',posts:f.state.post,submissions:submitted});
 }
 // The actual Canvas pending action forks an accepted blank without cloning its
 // receipt/failure, and the completion owner moves the latest editable draft.
 for(const project of ['tree:source',null]){
  const f=setup('blank','done',built),c=f.c,gate=deferred(),originalFetch=c.fetch,memory=new Map(),saved=new c.ImageNodeDraftStore(()=>({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)})),copied=[];
  c.activeKey=project;c.activeProjectRef.current={key:project};f.presentation.render();
  const source={...f.pend,parentId:null,linked:false,generating:true,generationSubmitted:true,operationKey:'original-paid-A'};c.setPendNodes([source]);c.selectedPendId=source.id;c.selectedPendIdRef.current=source.id;
  const scope=c.imageDraftScope(c.user.email,null,project,'personal'),key=node=>c.imageDraftKey(scope,node);
  saved.write(key(source.id),{prompt:'latest source draft',ratio:'3:4'});
  c.imageDraft={read:(node,target=scope)=>saved.read(c.imageDraftKey(target,node)),seed:(node,patch,target=scope)=>saved.write(c.imageDraftKey(target,node),patch),referenceBindings:[],hiddenReferenceIds:[]};
  c.referenceDraft={copyTo:(target,original=key(source.id))=>copied.push([target,original])};
  c.fetch=async(url,init)=>{if(!String(url).includes('/position'))await gate.promise;return originalFetch(url,init);};
  const run=c.entry.generatePendingImage(()=>{});await waitFor(()=>c.pendNodes.some(node=>node.id!==source.id&&node.generationSubmitted),'fork durable receipt');
  const fork=c.pendNodes.find(node=>node.id!==source.id);assert(fork);checks++;
  eq(c.pendNodes.find(node=>node.id===source.id).operationKey,'original-paid-A','accepted original node is untouched');
  eq(fork.operationKey,undefined,'fork never copies paid task identity');eq(fork.generationFailure,undefined,'fork never copies original failure');
  saved.write(key(fork.id),{prompt:'edited after submit',ratio:'16:9'});gate.resolve();await run;
  eq(c.pendNodes.map(node=>node.id),[source.id],'completion removes only its own new placeholder');
  const actualProject=project||'tree:result-1',destination=c.imageDraftKey(c.imageDraftScope(c.user.email,null,actualProject,'personal'),'result-1');
  eq(saved.read(destination).prompt,'edited after submit','completed result receives the live draft, not frozen generation prompt');
  eq(saved.read(destination).ratio,'16:9','completed result keeps latest ratio edit');
  eq(Object.fromEntries(f.state.forms[0]).prompt,'fixture prompt','paid prompt stays frozen independently of latest draft');
  assert(copied.some(([target])=>target===destination));checks++;
  rows.push({name:'blank-fork-and-latest-draft-'+(project?'existing-project':'new-project'),status:'PASS',remainingPlaceholder:source.id,actualProject});
 }
 // Reuse the catalog's suite/group/tree identity and preserve an already edited
 // destination draft; never replace it with an earlier pending-node value.
 {
  const f=setup('blank','done',built),c=f.c,store=new c.ImageNodeDraftStore(),owner=c.user.email,original=c.imageDraftScope(owner,null,null,'personal'),destination=c.imageDraftScope(owner,null,'batch:suite-real','personal'),copies=[];
  store.write(c.imageDraftKey(original,'pending'),{prompt:'live pending'});store.write(c.imageDraftKey(destination,'result'),{prompt:'destination edited'});
  c.carryCompletedCanvasImageDraft({owner,project:null,workspace:'personal',pendingId:'pending',prompt:'frozen',ratio:'auto',resultId:'result',artworks:[{id:'result',batchId:'suite-real',image:'/result.png'}],currentArtworks:[]},{draft:{read:(id,scope)=>store.read(c.imageDraftKey(scope,id)),seed:(id,patch,scope)=>store.write(c.imageDraftKey(scope,id),patch)},references:{copyTo:(...args)=>copies.push(args)}});
  eq(store.read(c.imageDraftKey(destination,'result')).prompt,'destination edited','later destination edits win over pending draft');eq(copies[0][0],c.imageDraftKey(destination,'result'),'suite result uses actual batch identity');rows.push({name:'suite-project-and-destination-edit',status:'PASS'});
 }
 const inputs=['src/components/canvas/canvas-client.tsx','src/lib/canvas/image-runs.ts','src/lib/canvas/image-creation.ts','src/lib/canvas/image-task-controller.ts','src/lib/canvas/generation-presentation.ts','src/lib/canvas/image-draft-completion.ts','src/lib/canvas/project-catalog.ts'];
 const result={status:'PASS',cases:rows.length,checks,actualOwners:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')})),rows,supplierRequests:0,serverDatabase:false,transport:'fixture'};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(`MAIN_SYNC_CANVAS_OWNERS=PASS CASES=${rows.length} CHECKS=${checks} ACTUAL_RUNS=1 ORIGINAL_POSTS=2 ACK_RELEASE=1 BLANK_FORK=1 LIVE_DRAFT=1 ORIGINAL_RECEIPT=RETAINED SUPPLIER=0`);
})().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({status:'FAIL',checks,rows,error:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;});
