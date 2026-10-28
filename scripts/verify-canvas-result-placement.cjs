'use strict';
// Execute the real Canvas entrypoints and receipt-first submission adapter.
// Only transport/React commit timing are controlled; no provider or paid calls.
process.env.NEXT_PUBLIC_SUPABASE_URL='';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='';
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=process.cwd(),out=path.resolve(process.env.CANVAS_TEST_OUT||'output/canvas-result-placement-20261028');
const fixturePath=path.join(root,'scripts/verify-imagegen-frozen-quote-canvas.cjs');
const fixtureText=fs.readFileSync(fixturePath,'utf8'),entry=fixtureText.indexOf('(async()=>{fs.mkdirSync');
assert.ok(entry>0,'existing scoped Canvas fixture entry');
const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=Module._nodeModulePaths(path.dirname(fixturePath));
fixture._compile(fixtureText.slice(0,entry)+'\nmodule.exports={setup};\n',fixturePath);
const {setup}=fixture.exports;
const {submitCanvasImagegen}=require(root+'/src/lib/imagegen/canvas-client.ts');
const {pendingAttemptKey,readPendingAttempt}=require(root+'/src/lib/imagegen/client-recovery.ts');
const workspace=require(root+'/src/lib/saas/workspace-client.ts');
const original={fetch:global.fetch,window:global.window,storage:global.sessionStorage,workspace:workspace.currentWorkspace()};
const results=[];
function fixtureCase(){
 const f=setup('runGen','deferred-merge');f.state.entries.clear();
 global.window={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},dispatchEvent:()=>{}};
 workspace.selectWorkspace(f.state.workspace);
 const plans=new Map(),jobs=new Map(),artworks=new Map([[f.c.source.id,{...f.c.source,canvasX:20,canvasY:30}]]),positions=[],savedReceipts=new Map();
 let posts=0,originalChecks=0,serial=0,missingResult=false,partial=false,hold;
 const operationFromJob=id=>id.replace(/^imagegen-/,'');
 global.fetch=async(input,init={})=>{
  const url=String(input);
  if(url==='/api/imagegen/plan'){
   const request=JSON.parse(init.body);plans.set(request.operationId,request);
   return Response.json({request,steps:[{operation:'generate'}],intent:{background:'opaque'},warnings:[],totalCredits:6,billingVersion:8,modelVersion:152,confirmationRequired:false,quote:{id:request.operationId}});
  }
  if(url==='/api/imagegen'&&init.method==='POST'){
   const body=JSON.parse(init.body),request=plans.get(body.operationId);assert.ok(request);
   posts++;const id='result-'+(++serial);jobs.set(body.operationId,{request,id});
   artworks.set(id,{id,image:'/media/'+id+'.png',canvasX:null,canvasY:null});
   return Response.json({operationId:body.operationId,jobId:'imagegen-'+body.operationId,status:'queued'});
  }
  if(url.startsWith('/api/imagegen?operationId=')){
   originalChecks++;const operationId=new URL(url,'http://fixture').searchParams.get('operationId'),job=jobs.get(operationId);assert.ok(job);
   return Response.json({operationId,jobId:'imagegen-'+operationId,status:'succeeded',artifacts:[{artworkId:job.id}]});
  }
  throw Error('Unexpected network request '+url);
 };
 f.c.submitCanvasImagegen=submitCanvasImagegen;
 f.c.fetch=async url=>{
  const jobId=new URL(url,'http://fixture').searchParams.get('job'),operationId=operationFromJob(jobId),job=jobs.get(operationId);assert.ok(job);
  if(hold&&job.request.sourceNodeId===hold.source)await hold.promise;
  for(const [key,raw]of f.state.entries){const a=readPendingAttempt(key);if(a?.operationId===operationId)savedReceipts.set(key,raw);}
  return Response.json({status:'done',...(partial?{operationStatus:'partial',reviewRequired:true}:{}),images:[{id:job.id,url:'/media/'+job.id+'.png',width:320,height:320}]});
 };
 f.c.privateFetchRaw=async(url,init)=>{
  assert.equal(url,'/api/artworks/position');const body=JSON.parse(init.body),art=artworks.get(body.id);assert.ok(art);
  positions.push(body);
  if(body.mode!=='initialize'||art.canvasX===null&&art.canvasY===null){art.canvasX=body.x;art.canvasY=body.y;}
  return Response.json({ok:true});
 };
 f.c.mergeWorks=async ids=>{
  f.state.merges++;const rows=[...artworks.values()].map(a=>({...a}));
  return missingResult?rows.filter(a=>!ids.includes(a.id)):rows;
 };
 f.c.reserveGenerationPosition=(id)=>{const p={x:500+positions.length*450,y:200};f.c.generationTaskPosRef.current[id]=p;return p;};
 const invoke=(source=f.c.source,prompt='fixture prompt')=>f.c.runGen(source,prompt,{ratio:'3:4',referenceInputs:[],isCurrent:()=>true});
 return {f,invoke,artworks,positions,savedReceipts,jobs,plans,flush(){f.c.worksRef.current=[...artworks.values()].map(a=>({...a}));},stats:()=>({posts,originalChecks,receipts:f.state.entries.size}),missing(value){missingResult=value;},partial(value){partial=value;},hold(source){let release;const promise=new Promise(r=>release=r);hold={source,promise};return release;}};
}
async function check(name,action){try{const details=await action();results.push({name,pass:true,...details});console.log('PASS '+name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL '+name+': '+error.message);}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 try{
  await check('consecutive_generate_uses_new_operation_without_moving_first',async()=>{
   const x=fixtureCase(),first=await x.invoke();assert.equal(first.length,1);
   const firstId=first[0].id,before={...x.artworks.get(firstId)};
   const receiptAfterDeferredCommit=x.stats().receipts;
   assert.equal(x.f.c.worksRef.current.some(a=>a.id===firstId),false,'React ref is deliberately not committed yet');
   x.flush();const second=await x.invoke(x.f.c.source,'second prompt');
   const stats=x.stats(),details={...stats,receiptAfterDeferredCommit,firstId,secondId:second[0]?.id,firstPositionPreserved:JSON.stringify(x.artworks.get(firstId))===JSON.stringify(before)};
   assert.equal(stats.posts,2,JSON.stringify(details));
   assert.notEqual(second[0]?.id,firstId);assert.deepEqual(x.artworks.get(firstId),before);
   assert.equal(receiptAfterDeferredCommit,0);assert.equal(stats.receipts,0);
   return details;
  });
  await check('retained_completed_receipt_recovers_original_without_relocating_it',async()=>{
   const x=fixtureCase(),first=await x.invoke();x.flush();
   const firstId=first[0].id,before={...x.artworks.get(firstId)};
   for(const [key,raw]of x.savedReceipts)x.f.state.entries.set(key,raw);
   const recovered=await x.invoke();
   assert.equal(x.stats().posts,1,'recovery does not create another paid operation');assert.equal(recovered[0]?.id,firstId);
   assert.deepEqual(x.artworks.get(firstId),before,'original positioned result must not move to the new placeholder');
   assert.ok(x.positions.every(p=>p.mode==='initialize'));
   return {...x.stats(),firstId,position:before};
  });
  await check('reverse_order_completions_keep_other_node_and_draft',async()=>{
   const x=fixtureCase(),b={...x.f.c.source,id:'source-B',title:'B'};x.artworks.set(b.id,{...b,canvasX:1000,canvasY:30});
   x.f.c.selectedIdRef.current=b.id;x.f.c.editPrompt='B next draft';
   const release=x.hold(x.f.c.source.id),aPromise=x.invoke(),bResult=await x.invoke(b,'B prompt');release();const aResult=await aPromise;
   assert.equal(x.stats().posts,2);assert.notEqual(aResult[0]?.id,bResult[0]?.id);
   assert.equal(x.f.c.selectedIdRef.current,b.id);assert.equal(x.f.c.editPrompt,'B next draft');
   assert.equal(x.stats().receipts,0,'both completed operations retire their own receipts despite deferred React commits');
   assert.deepEqual([x.artworks.get('source').canvasX,x.artworks.get(b.id).canvasX],[20,1000]);
   return {...x.stats(),selection:x.f.c.selectedIdRef.current,draft:x.f.c.editPrompt};
  });
  await check('missing_result_retains_receipt_and_retry_only_attaches',async()=>{
   const x=fixtureCase();x.missing(true);const first=await x.invoke();assert.equal(first.length,0);assert.equal(x.stats().receipts,1);
   const task=x.f.c.generationTasks.find(t=>t.onRetry);assert.ok(task);x.missing(false);await task.onRetry();
   assert.equal(x.stats().posts,1);assert.equal(x.stats().receipts,0);return x.stats();
  });
  await check('partial_delivery_keeps_original_receipt',async()=>{
   const x=fixtureCase();x.partial(true);const images=await x.invoke();assert.equal(images.length,1);
   assert.equal(x.stats().posts,1);assert.equal(x.stats().receipts,1,'partial/needs-review is not complete delivery');return x.stats();
  });
 }finally{global.fetch=original.fetch;global.window=original.window;global.sessionStorage=original.storage;workspace.selectWorkspace(original.workspace);}
 const failed=results.filter(r=>!r.pass).length;
 const report={sourceRoot:path.resolve(process.env.CANVAS_SOURCE_ROOT||root),results,passed:results.length-failed,failed,supplierCalls:0,evidenceTier:'real AST-extracted Canvas entrypoints plus actual receipt/submission modules; controlled transport and deferred React commit; not a browser or production run'};
 fs.writeFileSync(path.join(out,'RESULT_PLACEMENT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_RESULT_PLACEMENT=${failed?'FAIL':'PASS'} CASES=${results.length} PASSED=${results.length-failed} FAILED=${failed} SUPPLIER_CALLS=0`);
 if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1});
