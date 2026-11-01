/** Actual batch/parent/child/HTTP/PG/wallet. Restore only an old derived parent
 * label after a real completed failure; never invent supplier non-charge proof. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';
import sharp from 'sharp';

async function main(){
 const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];},root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.IMAGEGEN_BATCH_RETRY_EVIDENCE||'output/imagegen-batch-retry-evidence'),mode=arg('--mode')||'modified';
 assert.ok(['baseline','modified','observe'].includes(mode));await mkdir(out,{recursive:true});const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href);
 const {createModelFixture}=await load('scripts/model-config-fixture.ts') as typeof import('./model-config-fixture');
 const png=await sharp({create:{width:96,height:96,channels:3,background:'#daae74'}}).png().toBuffer(),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
 type Scenario={kind:string;batchId:string;childId?:string;posts:number;firstGate:ReturnType<typeof deferred>;deliveries:ReturnType<typeof deferred>;lockGate:ReturnType<typeof deferred>;lockSeen:ReturnType<typeof deferred>;pauseLock:boolean;injectProofFault:boolean;proofReadFailures:number;accepted:number};
 let active:Scenario|undefined,db:typeof import('../src/lib/db')|undefined,closeLocks:(()=>Promise<void>)|undefined;const ticks=new Set<Promise<unknown>>();
 const f=await createModelFixture(async(req,res)=>{
  for await(const _ of req){}
  if(!active||req.method!=='POST'||!req.url?.endsWith('/images/generations')){res.writeHead(404);res.end('{}');return;}
  const state=active,index=++state.posts;if(index===1)await state.firstGate.promise;else await state.deliveries.promise;
  if(index===1&&state.kind==='legacy-unknown-socket'){state.accepted++;res.destroy();return;}
  const healthy=index>1||state.kind==='stored-output-stale-label';res.setHeader('content-type','application/json');res.statusCode=healthy?200:403;
  const definite=['legacy-not-charged','legacy-unindexed-not-charged','max-attempts','proof-read-unavailable','concurrent-stale-tick'].includes(state.kind);
  res.end(JSON.stringify(healthy?{data:[{b64_json:png.toString('base64')}]}:{error:{message:'fixture supplier access denied',...(definite?{billing_status:'not_charged'}:{})}}));
 });
 const media=await mkdtemp(path.join(tmpdir(),'naumi-batch-retry-'));
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,OPENAI_API_KEY:'fixture-batch-retry-only',OPENAI_BASE_URL:f.origin+'/v1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-batch-retry-router-only',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-batch-retry-envelope-local-only',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,VIDEO_WORKER_SECRET:'fixture-batch-retry-worker-local-only'});
 const query=Client.prototype.query;
 (Client.prototype as any).query=function(...args:any[]){
  const sql=typeof args[0]==='string'?args[0]:args[0]?.text||'',values=args[1]||args[0]?.values||[];
  if(active?.injectProofFault&&sql.includes("usage->>'imageOperationId' AS image_operation_id")&&Array.isArray(values[0])&&values[0].includes(active.childId)){active.proofReadFailures++;throw Object.assign(Error('fixture original rejection evidence read failed'),{code:'FIXTURE_REJECTION_READ'});}
  if(active?.pauseLock&&sql.includes('SELECT state FROM app_imagegen_batches WHERE id=$1 FOR UPDATE')&&values[0]===active.batchId){const current=active;current.pauseLock=false;current.lockSeen.resolve();return current.lockGate.promise.then(()=>(query as any).apply(this,args));}
  return(query as any).apply(this,args);
 };
 const cases:any[]=[];
 try{
  f.config.upstreamModels[0].model='gpt-image-2';f.config.upstreamModels[0].capabilities.nativeResolutions=[];f.config.upstreamModels[0].parameterMap.resolution={};f.config.publicModels[0].supplierRouting={mode:'priority',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]};await f.repo.current();
  db=await load('src/lib/db.ts');await db!.ensureSchema();const database=db!;closeLocks=(await load('src/lib/imagegen/coordination-pool.ts')).closeImageCoordinationPool;
  const plans=await load('src/app/api/imagegen/plan/route.ts'),route=await load('src/app/api/imagegen/route.ts'),batch=await load('src/lib/imagegen/batch.ts'),dispatch=await load('src/lib/imagegen/dispatch.ts');
  const retryApi=mode==='modified'?await load('src/lib/imagegen/retry-eligibility.ts'):undefined;
  const {USER_COOKIE,signUserSession}=await load('src/lib/native-auth.ts'),{readManagedObject}=await load('src/lib/storage.ts');
  const billing=await(await load('src/lib/billing/runtime.ts')).getBillingRuntime(),published=await billing.config.current(),config=structuredClone(published.config);config.switches.metering='on';for(const feature of ['image.generate','canvas.image']as const){config.features[feature].pricing={mode:'fixed',credits:6};config.features[feature].rules=[];}await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'batch retry original six credits',expectedVersion:published.version,config});
  const owner=`batch-retry-${randomUUID()}@fixture.test`,other=`batch-retry-other-${randomUUID()}@fixture.test`;await database.getOrCreateUser(owner);await database.getOrCreateUser(other);await database.addCreditBatch(owner,1000,{source:'admin',reason:'batch retry fixture'});
  const request=(body?:unknown,email=owner,operation?:string)=>new Request('http://fixture.test/api/imagegen'+(operation?'?operationId='+operation:''),{method:body===undefined?'GET':'POST',headers:{origin:'http://fixture.test',cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const wait=async<T>(read:()=>Promise<T>,ready:(value:T)=>boolean)=>{const end=Date.now()+15000;let value:T;do{value=await read();if(ready(value))return value;await new Promise(done=>setTimeout(done,20));}while(Date.now()<end);throw Error('batch retry wait timed out '+JSON.stringify(value!));};
  const tick=(id:string)=>{const promise=batch.runImagegenBatchTick(id);ticks.add(promise);void promise.finally(()=>ticks.delete(promise)).catch(()=>{});return promise;};
  for(const kind of ['legacy-403-no-proof','legacy-403-audit-absent','legacy-not-charged','legacy-unindexed-not-charged','legacy-unknown-socket','stored-output-stale-label','max-attempts','proof-read-unavailable','concurrent-stale-tick']){
   await f.sql.query('DELETE FROM app_model_channel_health');const id=randomUUID();active={kind,batchId:id,posts:0,firstGate:deferred(),deliveries:deferred(),lockGate:deferred(),lockSeen:deferred(),pauseLock:false,injectProofFault:false,proofReadFailures:0,accepted:0};const current=active;
   if(kind!=='concurrent-stale-tick')current.deliveries.resolve();
   const input={version:1,operationId:id,entry:'canvas',mode:'batch',modelId:'image-a',prompt:'R10C '+kind,inputs:[],parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1,batch:{items:[{key:'one',name:'Original item',prompt:'R10C '+kind}],concurrency:1,maxAttempts:kind==='max-attempts'?1:kind==='concurrent-stale-tick'?3:2,failFast:false}};
   const quote=await plans.POST(request(input));assert.equal(quote.status,200,await quote.clone().text());const plan=await quote.json();assert.equal(plan.totalCredits,6);const submit=await route.POST(request({operationId:id,quoteId:plan.quote.id}));assert.equal(submit.status,200,await submit.clone().text());await tick(id);
   await wait(async()=>current.posts,n=>n===1);const originalItem=(await database.getPool().query('SELECT * FROM app_imagegen_batch_items WHERE batch_id=$1',[id])).rows;
   const op=originalItem[0].child_operation_id;current.firstGate.resolve();
   await wait(async()=>{const response=await route.GET(request(undefined,owner,op));assert.equal(response.status,200);return response.json();},v=>['failed','succeeded'].includes(v.status));
   const parentId='imagegen-'+op,parent=await wait(async()=>(await database.getPool().query('SELECT id,snapshot,payload,lease_token FROM app_image_jobs WHERE id=$1',[parentId])).rows[0],v=>v&&!v.lease_token);
   const childId=(Object.values(parent.snapshot.children)[0]as any).jobId;current.childId=childId;const child=await wait(async()=>(await database.getPool().query('SELECT snapshot,lease_token FROM app_image_jobs WHERE id=$1',[childId])).rows[0],v=>v&&!v.lease_token);
   const beforeStage=(await f.sql.query('SELECT operation_id,state,status,usage FROM app_model_execution_stages WHERE operation_id=$1',[childId])).rows;
   const beforeBilling=(await f.sql.query('SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1',[childId])).rows[0];
   const legacy=structuredClone(parent.snapshot);legacy.status='error';legacy.result={...legacy.result,status:'failed',artifacts:[],chargedCredits:0,billingStatus:'confirmed',error:{code:'NOT_ACCEPTED',message:'Original pre-upgrade failure receipt'}};
   assert.equal((await f.sql.query('UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1 AND email=$3 AND lease_token IS NULL',[parentId,JSON.stringify(legacy),owner])).rowCount,1);
   if(kind==='legacy-403-audit-absent')await f.sql.query('DELETE FROM app_model_execution_stages WHERE operation_id=$1',[childId]);
   if(kind==='legacy-unindexed-not-charged'){
    const old=structuredClone(child.snapshot);delete old.paidOperations[childId].children;await f.sql.query('UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1',[childId,JSON.stringify(old)]);await f.sql.query("UPDATE app_model_execution_stages SET usage=usage-'imageOperationId' WHERE operation_id=$1",[childId]);
   }
   assert.equal(await batch.readImagegenBatch(id,other),null);
   if(retryApi){
    assert.equal(await retryApi.canRetryImagegen(op,other),false);assert.equal(await retryApi.canRetryImagegen(randomUUID(),owner),false);
    const {withFrozenCreation}=await load('src/lib/saas/creation-scope.ts');assert.equal(await withFrozenCreation({actorEmail:owner,scopeKind:'tenant',tenantId:randomUUID(),parentContext:'tree:other-project',sourcePath:'/fixture',workspaceExplicit:true},()=>retryApi.canRetryImagegen(op,owner)),false);
    assert.equal(await retryApi.canRetryImagegen(op,owner),['legacy-not-charged','legacy-unindexed-not-charged','max-attempts','proof-read-unavailable','concurrent-stale-tick'].includes(kind),kind+' original eligibility');
    for(const malformed of [null,[],{root:{state:'started'}},{root:{state:'rejected',children:{unit:{state:'done'}}}}])assert.equal(await retryApi.hasProvenImagegenRejection(malformed),false);
   }
   current.injectProofFault=kind==='proof-read-unavailable';await f.sql.query('DELETE FROM app_model_channel_health');let stale:any;
   if(kind==='concurrent-stale-tick'){
    current.pauseLock=true;const first=tick(id);await wait(async()=>{await Promise.race([current.lockSeen.promise,new Promise(done=>setTimeout(done,10))]);return current.pauseLock;},v=>!v);
    await tick(id);await wait(async()=>current.posts,n=>n===2);const second=(await f.sql.query('SELECT child_operation_id,attempts,state,lease_token FROM app_imagegen_batch_items WHERE batch_id=$1',[id])).rows[0];assert.equal(second.attempts,2);current.lockGate.resolve();await first;
    const after=(await f.sql.query('SELECT child_operation_id,attempts,state,lease_token FROM app_imagegen_batch_items WHERE batch_id=$1',[id])).rows[0];stale={second,after};
    if(mode==='baseline'){assert.equal(after.attempts,3);assert.notEqual(after.child_operation_id,second.child_operation_id);}if(mode==='modified')assert.deepEqual(after,second);
    current.deliveries.resolve();
   }else await tick(id);
   const final=await wait(async()=>{await tick(id);return batch.readImagegenBatch(id,owner);},v=>['succeeded','failed','partial','cancelled','needs_attention'].includes(v?.status));current.injectProofFault=false;
   const parents=(await f.sql.query("SELECT id,snapshot FROM app_image_jobs WHERE email=$1 AND kind='imagegen' AND payload->'plan'->'request'->>'prompt'=$2 ORDER BY id",[owner,'R10C '+kind])).rows;
   const children=parents.flatMap(p=>Object.values(p.snapshot.children||{}).flatMap((c:any)=>c.jobId?[c.jobId]:[]));
   await wait(async()=>(await f.sql.query('SELECT count(*)::int n FROM app_image_jobs WHERE id=ANY($1::text[]) AND lease_token IS NOT NULL',[[...children,...parents.map(p=>p.id)]])).rows[0].n,n=>n===0);
   const ledger=(await f.sql.query("SELECT id,delta FROM app_ledger WHERE id=ANY($1::text[]) AND kind='consume'",[children.map(c=>'led-image-'+c)])).rows;
   const operations=(await f.sql.query('SELECT id,state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=ANY($1::text[]) ORDER BY id',[children])).rows;
   const reservations=(await f.sql.query('SELECT job_id,cost FROM app_gen_reservations WHERE job_id=ANY($1::text[])',[children])).rows;
   const savedChild=(await f.sql.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[childId])).rows[0].snapshot;
   const originalParent=(await f.sql.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[parentId])).rows[0].snapshot;
   const paidUnchanged=JSON.stringify(savedChild.paidOperations)===JSON.stringify((kind==='legacy-unindexed-not-charged'?{...child.snapshot,paidOperations:{[childId]:Object.fromEntries(Object.entries(child.snapshot.paidOperations[childId]).filter(([key])=>key!=='children'))}}:child.snapshot).paidOperations);assert.equal(paidUnchanged,true);
   assert.equal(reservations.length,0);assert.ok(operations.every(o=>o.reserved_credits===0));
   const positive=['legacy-not-charged','legacy-unindexed-not-charged','concurrent-stale-tick'].includes(kind),retryBad=!positive&&!['stored-output-stale-label','max-attempts'].includes(kind);
   const expectedPosts=kind==='stored-output-stale-label'||kind==='max-attempts'?1:kind==='concurrent-stale-tick'?(mode==='baseline'?3:2):positive?2:mode==='baseline'?2:1;
   if(mode!=='observe')assert.equal(current.posts,expectedPosts,kind);
   if(mode==='modified'&&retryBad){assert.equal(final.items[0].attempts,1);assert.equal(ledger.length,0);assert.equal(final.chargedCredits,0);assert.equal(final.status,'failed');}
   if(positive&&kind!=='concurrent-stale-tick'){assert.equal(ledger.length,1);assert.equal(ledger[0].delta,-6);assert.equal(final.chargedCredits,6);assert.equal(final.status,'succeeded');}
   if(kind==='stored-output-stale-label'){assert.equal(ledger.length,1);assert.equal(ledger[0].delta,-6);assert.equal(final.chargedCredits,6);assert.equal(final.items[0].attempts,1);const originalImage=child.snapshot.images[0];const saved=(await f.sql.query('SELECT image_url FROM app_artworks WHERE id=$1 AND email=$2',[originalImage.id,owner])).rows[0];assert.equal(sha((await readManagedObject(saved.image_url,64*1024*1024)).bytes),sha(png));}
   if(kind==='max-attempts'){assert.equal(ledger.length,0);assert.equal(final.items[0].attempts,1);}
   if(kind==='concurrent-stale-tick'){assert.equal(final.items[0].attempts,mode==='baseline'?3:2);assert.equal(ledger.length,mode==='baseline'?2:1);assert.equal(ledger.reduce((n,row)=>n-Number(row.delta),0),mode==='baseline'?12:6);assert.equal(final.chargedCredits,6);}
   if(kind==='proof-read-unavailable'&&mode==='modified')assert.ok(current.proofReadFailures>0);
   if(kind==='legacy-unknown-socket')assert.equal(current.accepted,1);
   const artifacts=final.items.flatMap((item:any)=>item.result?.artifacts||[]),hashes=[];for(const image of artifacts){const bytes=await readManagedObject(image.url,64*1024*1024);hashes.push(sha(bytes.bytes));assert.equal(hashes.at(-1),sha(png));}
   const row={kind,batchId:id,originalOperationId:op,originalParent:parentId,originalChild:childId,historicalLabelRestored:true,beforeStage,beforeBilling,supplierPosts:current.posts,acceptedThenLost:current.accepted,final,ledger,operations,reservations,proofReadFailures:current.proofReadFailures,stale,paidUnchanged,originalParentResult:originalParent.result,hashes};cases.push(row);await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'RUNNING',mode,cases},null,2)+'\n');console.log('BATCH_RETRY_CASE='+JSON.stringify({kind,posts:current.posts,attempts:final.items[0].attempts,consume:ledger.length,charged:final.chargedCredits,proofReadFailures:current.proofReadFailures,stale,paidUnchanged}));
  }
  const report={status:mode==='baseline'?'BASELINE_REPRODUCED':mode==='observe'?'OBSERVED':'PASS',mode,cases,realHandlers:true,realBatchTick:true,realPG:true,realLease:true,realSupplier:'loopback',historicalDerivedLabelRestored:true,externalPaidCalls:0};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`IMAGEGEN_BATCH_RETRY=${report.status} CASES=9 REAL_HANDLERS=1 REAL_BATCH_TICK=1 REAL_PG=1 REAL_LEASE=1 ORIGINAL_PAID_IDENTITY=RETAINED EXTERNAL_PAID=0`);
 }catch(error){await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:(error as Error).stack,cases,jobs:(await f.sql.query('SELECT id,kind,snapshot FROM app_image_jobs').catch(()=>({rows:[]}))).rows,batchItems:(await f.sql.query('SELECT batch_id,key,state,attempts,child_operation_id,result FROM app_imagegen_batch_items').catch(()=>({rows:[]}))).rows},null,2)+'\n');throw error;}
 finally{
  active?.firstGate.resolve();active?.deliveries.resolve();active?.lockGate.resolve();if(active)active.injectProofFault=false;await Promise.allSettled([...ticks]);Client.prototype.query=query;
  if(db){const end=Date.now()+15000;while((await f.sql.query('SELECT count(*)::int n FROM app_image_jobs WHERE lease_token IS NOT NULL').catch(()=>({rows:[{n:0}]}))).rows[0].n&&Date.now()<end)await new Promise(done=>setTimeout(done,20));}
  await closeLocks?.();if(db)await db.getPool().end();await f.cleanup();assert.equal(path.dirname(media),tmpdir());await rm(media,{recursive:true,force:true});console.log('BATCH_RETRY_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
