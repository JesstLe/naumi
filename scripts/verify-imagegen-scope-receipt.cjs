/** Narrow real-source branch tests. All persistence, auth and execution are mocks;
 * no database, network, supplier, filesystem mutation or scheduling is performed.
 * node scripts/verify-imagegen-scope-receipt.cjs [--root <raw source copy>]
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {randomUUID}=require('node:crypto');
const root=path.resolve(process.argv.includes('--root')?process.argv[process.argv.indexOf('--root')+1]:'.');
const live=path.resolve(__dirname,'..');
const owner='scope@example.test',operationId='10000000-0000-4000-8000-000000000001',quoteId='20000000-0000-4000-8000-000000000001';
let context,featureChecks=0,inputChecks=0;
const creation={currentCreationContext:()=>context,assertCurrentCreationFeature:async()=>{featureChecks++;},withCreationReceiptRoute:async(_r,run)=>run(),withFrozenCreation:async(c,run)=>{const before=context;context=c;try{return await run();}finally{context=before;}},frozenCreationScope:(value,email)=>{
 if(!value||typeof value!=='object'||!['personal','tenant'].includes(value.scopeKind)||typeof value.actorEmail!=='string'||!(value.tenantId===null||typeof value.tenantId==='string'))return undefined;
 if(value.actorEmail!==email.toLowerCase()||(value.scopeKind==='tenant')!==(value.tenantId!==null))throw Error('invalid frozen owner');return value;
}};
function load(relative,dependencies={}){
 const file=path.join(root,relative),source=fs.readFileSync(file,'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 const imports=id=>{if(id==='server-only')return {};if(id in dependencies)return dependencies[id];if(id.startsWith('node:'))return require(id);throw Error(`Unmocked import ${id} in ${relative}`);};
 const sandbox={module,exports:module.exports,require:imports,structuredClone,Buffer,Response,Request,Headers,URL,Date,process:{env:{}},console,setTimeout,clearTimeout,AbortSignal};
 vm.runInNewContext(output,sandbox,{filename:file});return module.exports;
}
const cases=[];function test(name,run){cases.push({name,run});}
const scopeFile='src/lib/imagegen/creation-scope.ts';
const scope=fs.existsSync(path.join(root,scopeFile))?load(scopeFile,{'../saas/creation-context':creation}):loadFromLiveScope();
function loadFromLiveScope(){const source=fs.readFileSync(path.join(live,scopeFile),'utf8');const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};vm.runInNewContext(out,{module:m,exports:m.exports,require:id=>id==='server-only'?{}:creation,structuredClone,Error});return m.exports;}
class Changed extends Error{code='IMAGEGEN_PLAN_CHANGED';status=409;}
const schema={parse:v=>structuredClone(v),safeParse:v=>v&&v.version===1?{success:true,data:structuredClone(v)}:{success:false}};
const fingerprint=v=>JSON.stringify(v);
const request={version:1,operationId,entry:'canvas',mode:'generate',prompt:'raw request',parameters:{ratio:'auto'},inputs:[],output:{format:'png'},variants:1};
function plan(req=request){return {request:{...structuredClone(req),parameters:{ratio:'1:1'}},fingerprint:fingerprint(req),intent:{operation:'generate'},steps:[{key:'generate',operation:'generate',credits:5,billingQuote:{private:'root'}}],totalCredits:5,modelVersion:12,billingVersion:8,warnings:[]};}
const tenantA={actorEmail:owner,scopeKind:'tenant',tenantId:'00000000-0000-4000-8000-000000000001',parentContext:'tree:project-a'};
const tenantB={...tenantA,tenantId:'00000000-0000-4000-8000-000000000002'};
const personal={actorEmail:owner,scopeKind:'personal',tenantId:null};
const scopeVariants=[undefined,null,personal,tenantA,tenantB,{...tenantA,parentContext:'tree:project-b'},{...tenantA,actorEmail:'foreign@example.test'},{scopeKind:'tenant'}];
const quoteDependencies={'../db':{dbEnabled:false},'./creation-scope':scope,'../saas/creation-context':creation,'../feature-access/server':{userFeaturePolicy:async()=>({}),FeatureAccessError:Error},'../feature-access/catalog':{allows:()=>true},'./plan':{imagegenFingerprint:fingerprint},'./schema':{imagegenRequestSchema:schema},'./inputs':{readImagegenInputs:async()=>{inputChecks++;}},'./confirmation':{ImagegenConfirmationChanged:Changed}};
const quotes=load('src/lib/imagegen/quotes.ts',quoteDependencies);
function validateReference(id,op){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)||typeof op!=='string'||!/^[a-f0-9-]{36}$/i.test(op))throw new quotes.ImagegenQuoteError();}
const reference=quotes.assertImagegenQuoteReference||validateReference;
test('new scope helper exists',()=>assert.ok(fs.existsSync(path.join(root,scopeFile))));
test('scope matrix preserves personal legacy and exact tenant/project binding',()=>{
 for(const saved of scopeVariants)for(const current of [undefined,personal,{...personal,parentContext:'tree:old'},tenantA,tenantB,{...tenantA,parentContext:'tree:project-b'}]){
  context=current;
  const validSaved=saved==null||saved===personal||saved===tenantA||saved===tenantB||saved.actorEmail===owner&&saved.parentContext==='tree:project-b';
  const expected=validSaved&&(saved==null?current?.scopeKind!=='tenant':saved.scopeKind===(current?.scopeKind||'personal')&&saved.tenantId===(current?.tenantId||null)&&(saved.parentContext||null)===(current?.parentContext||null));
  if(expected)scope.assertImagegenCreationScope(saved,owner);else assert.throws(()=>scope.assertImagegenCreationScope(saved,owner));
 }
 context={...tenantA,actorEmail:'foreign@example.test'};assert.throws(()=>scope.assertImagegenCreationScope(tenantA,owner));context=undefined;
});
test('quote projection strips root/child/grandchild facts without touching source or stored plan',async()=>{
 context=undefined;const child=plan(),grandchild=plan(),internal=plan();child.children=[{key:'grandchild',plan:grandchild}];internal.children=[{key:'child',plan:child}];
 const visible=await quotes.issueImagegenQuote(request,owner,internal);
 assert.equal(JSON.stringify(visible).includes('billingQuote'),false);
 assert.ok(internal.steps[0].billingQuote);assert.ok(internal.children[0].plan.steps[0].billingQuote);
 const stored=await quotes.readImagegenQuote(visible.quote.id,owner,operationId);assert.ok(stored.plan.children[0].plan.children[0].plan.steps[0].billingQuote);assert.equal(stored.fingerprint,fingerprint(request));
 assert.notEqual(fingerprint(stored.plan.request),stored.fingerprint);
});
test('quotes bind scope kind tenant project and owner; changed full raw request rejects',async()=>{
 context=tenantA;const visible=await quotes.issueImagegenQuote(request,owner,plan());
 for(const current of [personal,tenantB,{...tenantA,parentContext:'tree:project-b'}]){context=current;await assert.rejects(()=>quotes.readImagegenQuote(visible.quote.id,owner,operationId));}
 context=tenantA;await assert.rejects(()=>quotes.readImagegenQuote(visible.quote.id,'foreign@example.test',operationId));await assert.rejects(()=>quotes.frozenImagegenQuote({...request,prompt:'changed'},owner,{quoteId:visible.quote.id,confirmed:true}));
 featureChecks=0;inputChecks=0;const frozen=await quotes.frozenImagegenQuote(request,owner,{quoteId:visible.quote.id,confirmed:true});assert.equal(featureChecks,1);assert.equal(inputChecks,1);assert.equal(frozen.fingerprint,fingerprint(request));context=undefined;
});
test('empty null numeric and object quote references never count as absent',()=>{for(const id of ['',null,3,{},[]])assert.throws(()=>reference(id,operationId));});
function dispatchFixture(savedScope){
 if(arguments.length===0)savedScope=tenantA;
 let row={email:owner,snapshot:{status:'done',fingerprint:fingerprint(request),result:{operationId,jobId:`imagegen-${operationId}`,status:'succeeded',artifacts:[],chargedCredits:5},children:{}},scope:savedScope},kicks=0,creates=0,plans=0,createRace=false,quoteRace=false;
 const winner=()=>({email:owner,snapshot:{status:'done',fingerprint:fingerprint(request),result:{operationId,jobId:`imagegen-${operationId}`,status:'succeeded',artifacts:[],chargedCredits:5},children:{}},scope:savedScope});
 class Jobs{async get(){return row?.snapshot;}async owner(){return row?.email;}async kick(){kicks++;}async create(_id,email,snapshot){creates++;if(createRace){row=winner();throw Error('unique race');}row={email,snapshot,scope:context};}}
 const mocks={'../durable-image-jobs':{DurableImageJobs:Jobs},'../db':{dbEnabled:true,getPool:()=>({query:async()=>({rows:row?[{scope:row.scope}]:[]})})},'./plan':{imagegenFingerprint:fingerprint,planImagegen:async()=>{plans++;return plan();}},'./confirmation':{ImagegenConfirmationChanged:Changed},'./quotes':{assertImagegenQuoteReference:reference,frozenImagegenQuote:async()=>{if(quoteRace){row=winner();throw Error('permission revoked after winner');}return plan();}},'./schema':{imagegenRequestSchema:schema},'../saas/creation-context':creation,'./creation-scope':scope,'./stored-delivery':{storedDeliveryState:async()=>null},'../image-job-review':{storedImageReview:async()=>false}};
 for(const key of ['../canvas-image-input','./postprocess','../canvas-local-image-edit','./adapters','./generation-core','./cancel','./input-assets','./inputs','./mask','./output-advisory','./receipt-policy'])mocks[key]={};
 const api=load('src/lib/imagegen/dispatch.ts',mocks);
 return {api,get row(){return row;},set row(v){row=v;},counts:()=>({kicks,creates,plans}),race:()=>{row=undefined;createRace=true;},quoteRace:()=>{row=undefined;quoteRace=true;}};
}
test('single existing receipt paths reject different scope before resume and hide foreign reads',async()=>{
 for(const saved of [undefined,tenantA,tenantB,{...tenantA,parentContext:'tree:project-b'}]){
  context=tenantA;const f=dispatchFixture(saved),matching=saved===tenantA;
  if(matching){assert.ok(await f.api.submitImagegen(request,owner));assert.ok(await f.api.submitAcceptedImagegen(plan(),owner));assert.ok(await f.api.readImagegenReceipt(operationId,owner));}
  else {await assert.rejects(()=>f.api.submitImagegen(request,owner));await assert.rejects(()=>f.api.submitAcceptedImagegen(plan(),owner));assert.equal(await f.api.readImagegenReceipt(operationId,owner),null);assert.equal(await f.api.getImagegenResult(operationId,owner),null);assert.equal(f.counts().kicks,0);}
 }
 context=undefined;
});
test('single legacy absent scope stays compatible with a personal project',async()=>{context={...personal,parentContext:'tree:legacy'};const f=dispatchFixture(undefined);assert.ok(await f.api.readImagegenReceipt(operationId,owner));context=undefined;});
test('single full raw owner fingerprint checks and invalid quote presence are retained',async()=>{
 context=tenantA;const f=dispatchFixture();await assert.rejects(()=>f.api.submitImagegen({...request,prompt:'changed'},owner));await assert.rejects(()=>f.api.submitImagegen(request,'foreign@example.test'));
 for(const id of ['',null,99])await assert.rejects(()=>f.api.submitImagegen(request,owner,{quoteId:id,confirmed:true}));assert.equal(f.counts().kicks,0);context=undefined;
});
test('single create race and permission-race winners use persisted scope and original fingerprint',async()=>{
 for(const kind of ['race','quoteRace'])for(const saved of [tenantA,tenantB]){context=tenantA;const f=dispatchFixture(saved);f[kind]();if(saved===tenantA){const result=kind==='race'?await f.api.submitAcceptedImagegen(plan(),owner):await f.api.submitImagegen(request,owner,{quoteId,confirmed:true});assert.equal(result.chargedCredits,5);}else await assert.rejects(()=>kind==='race'?f.api.submitAcceptedImagegen(plan(),owner):f.api.submitImagegen(request,owner,{quoteId,confirmed:true}));}context=undefined;
});
function batchFixture(savedScope){
 if(arguments.length===0)savedScope=tenantA;
 const req={...structuredClone(request),mode:'batch',batch:{items:[{key:'one',prompt:'child',name:'one'}]}};
 const childRequest={...structuredClone(request),operationId:'child-operation-id',prompt:'child'},child=plan(childRequest),frozen={...plan(req),children:[{key:'one',plan:child}]};
 const original={id:operationId,owner,fingerprint:fingerprint(req),plan:{...frozen,creationScope:savedScope},state:'running'};
 let prior=original,transactionPrior=false,insertedPlan,insertedChild,quoteRace=false;
 const storedIds=['stored-child-operation-id'],queries=[];
 const query=async(sql,args)=>{queries.push(sql);if(sql.includes('SELECT owner,fingerprint'))return {rows:transactionPrior?[prior]:[]};if(sql.includes('SELECT state,plan')||sql.includes('SELECT state FROM app_imagegen_batches'))return {rows:prior?[prior]:[]};if(sql.includes('SELECT child_operation_id'))return {rows:storedIds.map(child_operation_id=>({child_operation_id}))};if(sql.startsWith('INSERT INTO app_imagegen_batches'))insertedPlan=JSON.parse(args[4]);if(sql.startsWith('INSERT INTO app_imagegen_batch_items'))insertedChild=JSON.parse(args[5]);return {rows:[]};};
 const tx={query,release(){}};
 const mocks={'@/lib/release-runtime/background-activity':{},'../saas/creation-context':creation,'../saas/creation-writer':{acceptCreationTx:async()=> 'creation-id'},'../saas/creation-schema':{ensureCreationSchema:async()=>{}},'../db':{},'./coordination-pool':{imageCoordinationPool:()=>({connect:async()=>tx})},'./schema':{imagegenRequestSchema:schema},'./plan':{imagegenFingerprint:fingerprint},'./confirmation':{ImagegenConfirmationChanged:Changed},'./quotes':{assertImagegenQuoteReference:reference,frozenImagegenQuote:async()=>{if(quoteRace){prior=original;throw Error('current permission revoked');}return frozen;}},'./dispatch':{},'./generation-core':{imagegenStepId:id=>id===operationId?childRequest.operationId:'retargeted-child-operation-id'},'./batch-repository':{ensureImagegenBatches:async()=>{},imagegenBatchRow:async(_id,email)=>!email||prior?.owner===email?prior:null,imagegenBatchItems:async()=>storedIds.map(child_operation_id=>({child_operation_id}))},'../feature-access/server':{},'../feature-access/catalog':{},'./creation-scope':scope};
 return {api:load('src/lib/imagegen/batch.ts',mocks),req,frozen,queries,transaction:()=>{transactionPrior=true;},set prior(v){prior=v;},get insertedPlan(){return insertedPlan;},get insertedChild(){return insertedChild;},quoteRace:()=>{prior=null;quoteRace=true;},storedIds};
}
test('batch existing path and read-only receipt enforce persisted scope',async()=>{for(const saved of [undefined,tenantA,tenantB]){context=tenantA;const f=batchFixture(saved);if(saved===tenantA){assert.equal(JSON.stringify((await f.api.submitImagegenBatch(f.req,owner)).children),JSON.stringify(f.storedIds));assert.ok(await f.api.readImagegenBatchReceipt(operationId,owner));}else{await assert.rejects(()=>f.api.submitImagegenBatch(f.req,owner));assert.equal(await f.api.readImagegenBatchReceipt(operationId,owner),null);}}context=undefined;});
test('batch transactional winner returns stored child IDs and retains raw fingerprint',async()=>{context=tenantA;const f=batchFixture();f.transaction();const r=await f.api.submitAcceptedImagegenBatch(f.frozen,owner);assert.equal(JSON.stringify(r.children),JSON.stringify(f.storedIds));context=undefined;});
test('batch transactional scope conflict and cancellation check before mutation',async()=>{context=tenantA;const f=batchFixture(tenantB);f.transaction();await assert.rejects(()=>f.api.submitAcceptedImagegenBatch(f.frozen,owner));await assert.rejects(()=>f.api.cancelImagegenBatch(operationId,owner));assert.equal(f.queries.some(q=>q.startsWith('UPDATE')),false);context=undefined;});
test('batch new frozen accept retains full root and child raw fingerprints and private billing facts',async()=>{context=personal;const f=batchFixture();f.prior=null;await f.api.submitAcceptedImagegenBatch(f.frozen,owner);assert.equal(f.insertedPlan.fingerprint,f.frozen.fingerprint);assert.equal(f.insertedChild.fingerprint,f.frozen.children[0].plan.fingerprint);assert.notEqual(f.insertedPlan.fingerprint,fingerprint(f.insertedPlan.request));assert.notEqual(f.insertedChild.fingerprint,fingerprint(f.insertedChild.request));assert.ok(f.insertedPlan.steps[0].billingQuote);assert.ok(f.insertedChild.steps[0].billingQuote);context=undefined;});
test('trusted Agent top-level retarget rebinds child IDs without hashing effective child requests',async()=>{context=personal;const f=batchFixture();f.prior=null;f.frozen.request={...f.frozen.request,operationId:'30000000-0000-4000-8000-000000000001'};await f.api.submitAcceptedImagegenBatch(f.frozen,owner);assert.equal(f.insertedChild.request.operationId,'retargeted-child-operation-id');assert.equal(f.insertedChild.fingerprint,f.frozen.children[0].plan.fingerprint);assert.equal(f.insertedPlan.fingerprint,f.frozen.fingerprint);assert.equal(f.frozen.children[0].plan.request.operationId,'child-operation-id');context=undefined;});
test('batch new-accept permission race recovers only original raw owner fingerprint and saved scope',async()=>{for(const saved of [tenantA,tenantB]){context=tenantA;const f=batchFixture(saved);f.quoteRace();if(saved===tenantA){const result=await f.api.submitImagegenBatch(f.req,owner,{quoteId,confirmed:true});assert.equal(JSON.stringify(result.children),JSON.stringify(f.storedIds));}else await assert.rejects(()=>f.api.submitImagegenBatch(f.req,owner,{quoteId,confirmed:true}));}context=undefined;});
test('batch empty null or numeric quote presence rejects before accepted fast path',async()=>{context=tenantA;const f=batchFixture();for(const id of ['',null,44])await assert.rejects(()=>f.api.submitImagegenBatch(f.req,owner,{quoteId:id,confirmed:true}));context=undefined;});
test('batch worker child polls install only valid persisted scope and clear ambient scope for legacy',async()=>{
 for(const saved of [tenantA,undefined,{scopeKind:'tenant'}]){
  const batch={id:operationId,owner,state:'running',request:{batch:{concurrency:1,maxAttempts:1}},plan:{creationScope:saved}},item={key:'one',state:'submitted',child_operation_id:'child',attempts:1};let seen='not-called';
  const query=async sql=>sql.includes('SELECT state FROM app_imagegen_batches')?{rows:[{state:'running'}]}:sql.includes('SELECT * FROM app_imagegen_batch_items')?{rows:[item]}:sql.includes('SELECT state FROM app_imagegen_batch_items')?{rows:[{state:'submitted'}]}:sql.includes('SELECT * FROM app_imagegen_batches')?{rows:[{state:'paused'}]}:{rows:[]};
  const mocks={'@/lib/release-runtime/background-activity':{withBackgroundActivity:async(_kind,_id,_stage,run)=>run()},'../saas/creation-context':creation,'../saas/creation-writer':{},'../saas/creation-schema':{},'../db':{},'./coordination-pool':{imageCoordinationPool:()=>({connect:async()=>({query,release(){}})})},'./schema':{},'./plan':{},'./confirmation':{},'./quotes':{},'./dispatch':{getImagegenResult:async()=>{seen=context;return {status:'pending'};}},'./generation-core':{},'./batch-repository':{imagegenBatchRow:async()=>batch,imagegenBatchItems:async()=>[item]},'../feature-access/server':{},'../feature-access/catalog':{},'./creation-scope':scope};
  const api=load('src/lib/imagegen/batch.ts',mocks);context=tenantB;
  if(saved&&saved.actorEmail!==owner){await assert.rejects(()=>api.runImagegenBatchTick(operationId));assert.equal(seen,'not-called');}
  else{await api.runImagegenBatchTick(operationId);assert.equal(seen,saved);assert.equal(context,tenantB);}
 }context=undefined;
});
function routeFixture(){
 let accepted={operationId,jobId:`imagegen-${operationId}`,status:'succeeded'},batchAccepted=null,quoteReads=0,submits=0,gets=0,wrappers=0,failQuote=false,receiptCalls=0,acceptAfterQuote=false;
 const mocks={'@/lib/bi/model-observer':{withBiRequest:async(_r,run)=>run()},'@/lib/admin-auth':{resolveUserEmail:async()=>owner},'@/lib/billing/access':{sameSiteBillingMutation:()=>true},'@/lib/durable-image-jobs':{imageWorkerAuthorized:()=>false},'@/lib/imagegen/schema':{imagegenRequestSchema:schema},'@/lib/imagegen/dispatch':{readImagegenReceipt:async()=>{receiptCalls++;return accepted;},submitImagegen:async()=>{submits++;return accepted;},getImagegenResult:async()=>{gets++;return accepted;}},'@/lib/imagegen/batch':{readImagegenBatchReceipt:async()=>batchAccepted,readImagegenBatch:async()=>batchAccepted,submitImagegenBatch:async()=>{submits++;return batchAccepted;}},'@/lib/rate-limit':{rateLimit:()=>true},'@/lib/imagegen/body':{readImagegenJson:r=>r.json()},'@/lib/imagegen/confirmation':{ImagegenConfirmationChanged:Changed},'@/lib/imagegen/quotes':{ImagegenQuoteError:quotes.ImagegenQuoteError,assertImagegenQuoteReference:reference,readImagegenQuote:async()=>{quoteReads++;if(acceptAfterQuote)accepted={operationId,jobId:'race-winner'};if(failQuote)throw new quotes.ImagegenQuoteError();return {request};}},'@/lib/saas/creation-context':{withCreationReceiptRoute:async(_r,run)=>{wrappers++;return run();}},'@/lib/imagegen/creation-scope':scope};
 const api=load('src/app/api/imagegen/route.ts',mocks);
 return {api,post:body=>api.POST(new Request('http://fixture/api/imagegen',{method:'POST',body:JSON.stringify(body)})),counts:()=>({quoteReads,submits,gets,wrappers,receiptCalls}),absent:()=>{accepted=null;},batch:()=>{accepted=null;batchAccepted={id:operationId,children:['stored']};},deleted:()=>{failQuote=true;},race:()=>{accepted=null;failQuote=true;acceptAfterQuote=true;}};
}
test('minimal accepted request recovers deleted quote without quote lookup or execution',async()=>{const f=routeFixture();f.deleted();const r=await f.post({operationId,quoteId,confirmed:true});assert.equal(r.status,200);assert.equal(f.counts().quoteReads,0);assert.equal(f.counts().submits,0);assert.equal(f.counts().gets,0);assert.equal(f.counts().wrappers,1);});
test('minimal accepted batch returns its read-only submission receipt',async()=>{const f=routeFixture();f.batch();f.deleted();const r=await f.post({operationId,quoteId,confirmed:true});assert.equal(r.status,200);assert.equal((await r.json()).id,operationId);assert.equal(f.counts().quoteReads,0);assert.equal(f.counts().submits,0);});
test('minimal malformed envelope rejected even when already accepted',async()=>{for(const bad of [{quoteId:''},{quoteId:null},{quoteId:4},{confirmed:'true'},{extra:true},{confirmation:{}},{operationId:'invalid'}]){const f=routeFixture();const r=await f.post({operationId,quoteId,confirmed:true,...bad});assert.equal(r.status,400,JSON.stringify(bad));assert.equal(f.counts().receiptCalls,0);assert.equal(f.counts().quoteReads,0);assert.equal(f.counts().submits,0);}});
test('minimal accepted request needs no price-confirmation echo and remains receipt-only',async()=>{const f=routeFixture();f.deleted();const r=await f.post({operationId,quoteId});assert.equal(r.status,200);assert.equal(f.counts().quoteReads,0);assert.equal(f.counts().submits,0);assert.equal(f.counts().gets,0);});
test('minimal quote-lookup concurrent winner is recovered read-only',async()=>{const f=routeFixture();f.race();const r=await f.post({operationId,quoteId,confirmed:true});assert.equal(r.status,200);assert.equal((await r.json()).jobId,'race-winner');assert.equal(f.counts().submits,0);});
test('actual GET is wrapped in current receipt authorization context',async()=>{const f=routeFixture();const r=await f.api.GET(new Request(`http://fixture/api/imagegen?operationId=${operationId}`));assert.equal(r.status,200);assert.equal(f.counts().wrappers,1);assert.equal(f.counts().gets,1);});
(async()=>{let passed=0,failed=0;for(const {name,run} of cases){context=undefined;try{await run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.log(`FAIL ${name}: ${error.message}`);}}console.log(`SCOPE_RECEIPT_TESTS passed=${passed} failed=${failed} network=0 database=0 supplier=0`);process.exitCode=failed?1:0;})();
