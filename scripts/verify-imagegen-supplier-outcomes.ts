/** Actual creation handlers, PG leases, supplier HTTP and wallet per operation.
 * No completed/UNKNOWN job is seeded. Supplier loss closes a real accepted socket. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';

async function main(){
 const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
 const root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.IMAGEGEN_SUPPLIER_OUTCOME_EVIDENCE||'output/imagegen-supplier-outcomes'),mode=arg('--mode')||'modified';
 assert.ok(['observe','baseline','modified'].includes(mode));await mkdir(out,{recursive:true});
 const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href);
 if(mode==='modified'){
  const {confirmsImageRejection}=await load('src/lib/model-config/image-rejection-policy.ts');const root='job-fixture',a=root+':image:0',b=root+':image:1',stage=(unit:string,state='rejected-not-charged')=>({operationId:root,state,imageOperationId:unit});
  const vectors:[string,string[],any[],boolean][]=[['one',[a],[stage(a)],true],['two',[a,b],[stage(a),stage(b)],true],['empty',[a],[],false],['missing-unit',[a,b],[stage(a)],false],['duplicate-proof',[a,b],[stage(a),stage(a)],false],['unknown',[a],[stage(a,'unknown')],false],['403-only',[a],[stage(a,'failed-response')],false],['accepted',[a],[stage(a,'response-received')],false],['foreign-unit',[a],[stage('foreign:image:0')],false],['foreign-root',[a],[{...stage(a),operationId:'foreign'}],false],['legacy-missing-unit',[a],[{operationId:root,state:'rejected-not-charged'}],false],['original-unindexed',[root],[{operationId:root,state:'rejected-not-charged'}],true],['mixed',[a,b],[stage(a),stage(b,'unknown')],false],['duplicate-expected',[a,a],[stage(a)],false],['wrong-binding',[a,b],[{operationId:a,state:'rejected-not-charged',imageOperationId:b}],false]];
  for(const [name,units,stages,expected]of vectors)assert.equal(confirmsImageRejection(root,units,stages),expected,name);console.log('IMAGE_REJECTION_POLICY=PASS CHECKS='+vectors.length);
 }
 const {createModelFixture}=await load('scripts/model-config-fixture.ts') as typeof import('./model-config-fixture');
 const image=await sharp({create:{width:96,height:96,channels:3,background:'#4281bd'}}).png().toBuffer();
 type Active={kind:string;posts:number;accepted:number;replyStatuses:number[];seen:()=>void;release:()=>void;gate:Promise<void>};
 let active:Active|undefined;
 const f=await createModelFixture(async(req,res)=>{
  for await(const _ of req){}
  if(!active||req.method!=='POST'||!req.url?.endsWith('/images/generations')){res.writeHead(404);res.end('{}');return;}
  const current=active;current.posts++;current.seen();await current.gate;
  if(current.kind==='accepted-socket-loss'){current.accepted++;res.destroy();return;}
  const status=current.kind.includes('403')?403:current.kind==='503-no-proof'?503:200;current.replyStatuses.push(status);
  res.setHeader('content-type','application/json');res.writeHead(status);
  res.end(JSON.stringify(status===200?{data:[{b64_json:image.toString('base64')}]}:{error:{message:'supplier quota secret fixture-only 0.008416',...(current.kind.includes('not-charged')?{billing_status:'not_charged'}:{})}}));
 });
 const media=await mkdtemp(path.join(tmpdir(),'naumi-supplier-outcomes-'));let db:typeof import('../src/lib/db')|undefined,closeLocks:(()=>Promise<void>)|undefined;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,OPENAI_API_KEY:'fixture-outcomes-only',OPENAI_BASE_URL:f.origin+'/v1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-outcomes-router-only',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-outcomes-envelope-local-only',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,VIDEO_WORKER_SECRET:'fixture-outcomes-worker-local-only'});
 const cases:any[]=[];
 try{
  f.config.upstreamModels[0].model='gpt-image-2';f.config.upstreamModels[0].capabilities.nativeResolutions=[];f.config.upstreamModels[0].parameterMap.resolution={};
  f.config.publicModels[0].supplierRouting={mode:'priority',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]};await f.repo.current();
  db=await load('src/lib/db.ts');await db!.ensureSchema();const database=db!;closeLocks=(await load('src/lib/imagegen/coordination-pool.ts')).closeImageCoordinationPool;
  const generation=await load('src/lib/imagegen/generation-runtime.ts');
  const plans=await load('src/app/api/imagegen/plan/route.ts'),route=await load('src/app/api/imagegen/route.ts'),batch=await load('src/lib/imagegen/batch.ts'),batchRoute=await load('src/app/api/imagegen/batches/[id]/route.ts');
  const {USER_COOKIE,signUserSession}=await load('src/lib/native-auth.ts'),{readManagedObject}=await load('src/lib/storage.ts');
  const billing=await(await load('src/lib/billing/runtime.ts')).getBillingRuntime(),published=await billing.config.current(),config=structuredClone(published.config);config.switches.metering='on';for(const feature of ['image.generate','canvas.image']as const){config.features[feature].pricing={mode:'fixed',credits:6};config.features[feature].rules=[];}await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'supplier outcomes exact six credits',expectedVersion:published.version,config});
  const owner=`outcomes-${randomUUID()}@fixture.test`,other=`outcomes-other-${randomUUID()}@fixture.test`;await database.getOrCreateUser(owner);await database.getOrCreateUser(other);await database.addCreditBatch(owner,1000,{source:'admin',reason:'supplier outcomes fixture'});
  const request=(body?:unknown,email=owner,operation?:string)=>new Request(`http://fixture.test/api/imagegen${operation?'?operationId='+operation:''}`,{method:body===undefined?'GET':'POST',headers:{origin:'http://fixture.test',cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const wait=async<T>(read:()=>Promise<T>,ready:(value:T)=>boolean)=>{const end=Date.now()+15000;let value:T;do{value=await read();if(ready(value))return value;await new Promise(r=>setTimeout(r,25));}while(Date.now()<end);throw Error('supplier outcome wait timed out '+JSON.stringify(value!));};
  for(const kind of ['healthy','403-no-proof','403-not-charged','503-no-proof','accepted-socket-loss','batch-403-no-proof','batch-403-not-charged']){
   await f.sql.query('DELETE FROM app_model_channel_health');let seen!:()=>void,release!:()=>void;const hit=new Promise<void>(r=>{seen=r;}),gate=new Promise<void>(r=>{release=r;});active={kind,posts:0,accepted:0,replyStatuses:[],seen,release,gate};
   const isBatch=kind.startsWith('batch-'),operationId=randomUUID(),input={version:1,operationId,entry:'canvas',mode:isBatch?'batch':'generate',modelId:'image-a',prompt:'R10B '+kind,inputs:[],parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1,...(isBatch?{batch:{items:[{key:'one',name:'One original item',prompt:'R10B '+kind}],concurrency:1,maxAttempts:2,failFast:false}}:{})};
   const preview=await plans.POST(request(input));assert.equal(preview.status,200,await preview.clone().text());const plan=await preview.json();assert.equal(plan.totalCredits,6);
   const response=await route.POST(request({operationId,quoteId:plan.quote.id}));assert.equal(response.status,200,await response.clone().text());const receipt=await response.json();if(isBatch)await batch.runImagegenBatchTick(operationId);
   let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([hit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('supplier not reached '+kind)),10000);})]);}finally{clearTimeout(timer);}release();
   let healthRecovered=false;
   const result=await wait(async()=>{if(isBatch){const state=await batch.readImagegenBatch(operationId,owner);if(state?.items[0]?.attempts===2&&!healthRecovered){await f.sql.query('DELETE FROM app_model_channel_health');healthRecovered=true;}for(const row of(await f.sql.query("SELECT id FROM app_image_jobs WHERE kind='generate' AND snapshot->>'queueState'='execution' AND payload->'p'->>'userPrompt'=$1",['R10B '+kind])).rows)await generation.kickGeneration(row.id);await batch.runImagegenBatchTick(operationId);}const r=isBatch?await batchRoute.GET(request(undefined,owner,operationId),{params:Promise.resolve({id:operationId})}):await route.GET(request(undefined,owner,operationId));assert.equal(r.status,200);return r.json();},v=>['succeeded','failed','needs_attention','partial'].includes(v.status));
   const parents=(await database.getPool().query("SELECT id,snapshot,payload FROM app_image_jobs WHERE email=$1 AND kind='imagegen' AND (id=$2 OR payload->'plan'->'request'->>'prompt'=$3) ORDER BY created_at,id",[owner,'imagegen-'+operationId,'R10B '+kind])).rows;
   const childIds=parents.flatMap(p=>Object.values(p.snapshot.children||{}).flatMap((c:any)=>c.jobId?[c.jobId]:[]));
   const children=await wait(async()=>(await database.getPool().query('SELECT id,snapshot,billing_settled,lease_token FROM app_image_jobs WHERE id=ANY($1::text[]) ORDER BY id',[childIds])).rows,v=>v.length===childIds.length&&v.every(c=>!c.lease_token));
   const operations=(await database.getPool().query('SELECT id,state,reserved_credits,charged_credits FROM app_billing_operations WHERE id=ANY($1::text[]) AND email=$2 ORDER BY id',[childIds,owner])).rows;
   const ledger=(await database.getPool().query("SELECT id,delta FROM app_ledger WHERE id=ANY($1::text[]) AND email=$2 AND kind='consume'",[childIds.map(id=>'led-image-'+id),owner])).rows;
   const stages=(await database.getPool().query("SELECT operation_id,state,status,provider_id FROM app_model_execution_stages WHERE operation_id=ANY($1::text[]) OR operation_id LIKE ANY($2::text[]) ORDER BY created_at,id",[childIds,childIds.map(id=>id+':image:%')])).rows;
   const supplier=(await database.getPool().query('SELECT operation_id,state,delivered FROM app_supplier_calls WHERE operation_id=ANY($1::text[])',[childIds])).rows;
   const reconciliations=(await database.getPool().query('SELECT operation_id,proof,result FROM app_billing_reconciliations WHERE operation_id=ANY($1::text[])',[childIds])).rows;
   const reservations=(await database.getPool().query('SELECT job_id,cost FROM app_gen_reservations WHERE job_id=ANY($1::text[])',[childIds])).rows;
   const items=isBatch?(await database.getPool().query('SELECT child_operation_id,attempts,state,result FROM app_imagegen_batch_items WHERE batch_id=$1',[operationId])).rows:[];
   const results=isBatch?parents.map(p=>p.snapshot.result):[result];const artworkIds=results.flatMap((r:any)=>r.artifacts.map((a:any)=>a.artworkId));
   const artworks=artworkIds.length?(await database.getPool().query('SELECT id,image_url FROM app_artworks WHERE id=ANY($1::text[]) AND email=$2',[artworkIds,owner])).rows:[];
   const imageHash=artworks.length?createHash('sha256').update((await readManagedObject(artworks[0].image_url,64*1024*1024)).bytes).digest('hex'):null;
   const posts=active.posts;for(let i=0;i<3;i++){if(isBatch)await batch.runImagegenBatchTick(operationId);if(isBatch)await batchRoute.GET(request(undefined,owner,operationId),{params:Promise.resolve({id:operationId})});else await route.GET(request(undefined,owner,operationId));}assert.equal(active.posts,posts,'read original receipt must never re-POST');const foreign=isBatch?await batchRoute.GET(request(undefined,other,operationId),{params:Promise.resolve({id:operationId})}):await route.GET(request(undefined,other,operationId));assert.notEqual(foreign.status,200);
   const row={kind,healthRecovered,operationId,parentIds:parents.map(p=>p.id),childIds,quote:6,supplierPosts:active.posts,supplierAccepted:active.accepted,replyStatuses:active.replyStatuses,result,childOutcomes:children.map(c=>({id:c.id,status:c.snapshot.status,paidOperations:c.snapshot.paidOperations,customerBilling:c.snapshot.customerBilling,supplierCostStatus:c.snapshot.supplierCostStatus})),operations,ledger,stages,supplier,reconciliations,reservations,items,imageHash};cases.push(row);await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'OBSERVING',mode,cases},null,2)+'\n');console.log('SUPPLIER_OUTCOME_CASE='+JSON.stringify({...row,result:result.status,childOutcomes:undefined,reconciliations:undefined,supplier:undefined,imageHash:undefined}));
   assert.equal(reservations.length,0);assert.ok(operations.every(o=>o.reserved_credits===0));
   if(kind==='healthy'){assert.equal(result.status,'succeeded');assert.equal(result.chargedCredits,6);assert.equal(ledger.length,1);assert.equal(ledger[0].delta,-6);assert.equal(imageHash,createHash('sha256').update(image).digest('hex'));}
   else{assert.equal(result.status,'failed');assert.equal(result.chargedCredits,0);assert.equal(ledger.length,0);assert.equal(artworks.length,0);assert.ok(!JSON.stringify(result).includes('0.008416'));}
   if(kind==='accepted-socket-loss'){assert.equal(active.accepted,1);assert.equal(active.posts,1);assert.ok(reconciliations.some(r=>(typeof r.proof==='string'?JSON.parse(r.proof):r.proof).supplierOutcome==='unknown'));}
   if(mode==='baseline'&&kind==='batch-403-no-proof'){assert.equal(items[0].attempts,2);assert.equal(active.posts,2);}
   if(mode==='modified'&&!kind.includes('not-charged')&&kind!=='healthy'){assert.equal(active.posts,1);assert.ok(results.every((r:any)=>r.error?.code!=='NOT_ACCEPTED'));if(isBatch)assert.equal(items[0].attempts,1);}
   if(mode==='modified'&&kind.includes('not-charged')){assert.ok(results.every((r:any)=>r.error?.code==='NOT_ACCEPTED'));assert.ok(stages.every(s=>s.state==='rejected-not-charged'));if(isBatch){assert.equal(items[0].attempts,2);assert.equal(active.posts,2);}}
  }
  const report={status:mode==='observe'?'OBSERVED':mode==='baseline'?'BASELINE_REPRODUCED':'PASS',mode,cases,realHandlers:true,realPG:true,realLease:true,supplier:'loopback',seedDone:false,externalPaidCalls:0,receiptReposts:0};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`IMAGEGEN_SUPPLIER_OUTCOMES=${report.status} CASES=7 REAL_HANDLERS=1 REAL_PG=1 REAL_LEASE=1 SEED_DONE=0 RECEIPT_REPOSTS=0 EXTERNAL_PAID=0`);
 }catch(error){
  const jobs=await f.sql.query('SELECT id,kind,snapshot FROM app_image_jobs').catch(()=>({rows:[]}));
  const batches=await f.sql.query('SELECT id,state FROM app_imagegen_batches').catch(()=>({rows:[]}));
  const items=await f.sql.query('SELECT batch_id,key,state,attempts,result FROM app_imagegen_batch_items').catch(()=>({rows:[]}));
  await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),jobs:jobs.rows,batches:batches.rows,items:items.rows},null,2)+'\n');throw error;
 }finally{active?.release();await closeLocks?.();if(db)await db.getPool().end();await f.cleanup();assert.equal(path.dirname(media),tmpdir());await rm(media,{recursive:true,force:true});console.log('SUPPLIER_OUTCOMES_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
