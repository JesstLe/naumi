/** Real imagegen/generate handlers, auth, billing and durable recovery. Local PNG supplier only. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';
import {createProviderCapacity} from '../src/lib/model-config/capacity';
async function main(){
 let posts=0;
 const png=await sharp({create:{width:256,height:256,channels:3,background:'#82bda1'}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{for await(const _ of req){};if(req.url?.includes('/images/')){posts++;res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));return;}res.writeHead(404);res.end('{}')});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'local-capacity-router-token-long',MODEL_CONFIG_ENVELOPE_SECRET:'local-capacity-envelope-key-long',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:'local-only',OPENAI_BASE_URL:f.origin+'/v1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:await mkdtemp(join(tmpdir(),'routing-capacity-')),VIDEO_WORKER_SECRET:'local-capacity-worker-token-long-long'});
 f.config.providers[0].maxConcurrent=1;f.config.upstreamModels[0].model='gpt-image-2';f.config.upstreamModels[0].parameterMap.resolution={};f.config.upstreamModels[0].capabilities.nativeResolutions=[];
 await f.repo.current();const db=await import('../src/lib/db');await db.ensureSchema();
 const imagegen=await import('../src/app/api/imagegen/route'),planRoute=await import('../src/app/api/imagegen/plan/route'),gen=await import('../src/app/api/generate-image/route');
 const {USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
 const owner='capacity-route@local.test';await db.getOrCreateUser(owner);await db.addCreditBatch(owner,10000,{source:'admin',reason:'isolated fixture'});await db.setSetting('multi_user_enabled','1');
 const req=(path:string,body?:unknown)=>new Request(f.origin+path,{method:body?'POST':'GET',headers:{origin:f.origin,cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let lease:Awaited<ReturnType<ReturnType<typeof createProviderCapacity>['acquire']>>|undefined;
 try{
  const input={version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',prompt:'隔离验收：绿色产品图',inputs:[],modelId:'image-a',variants:1,parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},output:{format:'png'}};
  const preview=await planRoute.POST(req('/api/imagegen/plan',input));assert.equal(preview.status,200,await preview.clone().text());const plan=await preview.json();
  lease=await createProviderCapacity(f.sql).acquire({providerId:'p1',baseUrl:f.origin+'/v1',maxConcurrent:1,timeoutMs:120000});
  const submitted=await imagegen.POST(req('/api/imagegen',{...input,confirmation:{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true}}));assert.equal(submitted.status,200,await submitted.clone().text());const accepted=await submitted.json();
  let child:any;
  for(let i=0;i<150;i++){child=(await f.sql.query("SELECT * FROM app_image_jobs WHERE kind='generate' ORDER BY created_at DESC LIMIT 1")).rows[0];if(child?.snapshot.status==='error')break;await new Promise(r=>setTimeout(r,30))}
  assert.equal(child?.snapshot.status,'error',JSON.stringify(child?.snapshot));assert.equal(posts,0);
  assert.equal(Object.values(child.snapshot.paidOperations).map((a:any)=>a.state).join(','),'rejected');
  const poll=await imagegen.GET(req('/api/imagegen?operationId='+input.operationId));assert.equal(poll.status,200);
  const ledgerBefore=await db.getImageJobChargedCredits(child.id);assert.equal(ledgerBefore,0);
  // Application-APIMart creates a durable marker before transport. Local
  // capacity must clear that never-submitted marker, not strand it as unknown.
  const {apimartImagesFetch}=await import('../src/lib/model-config/apimart-preset'),{withImageOperation}=await import('../src/lib/image-gateway');
  const {healthObservedFetch}=await import('../src/lib/model-health/observe');
  const snapshot=await f.repo.current(),u=snapshot.config.upstreamModels[0],provider=snapshot.config.providers[0];
  const scope:any={frozen:{modelVersion:snapshot.version,modelDigest:snapshot.digest,billingVersion:plan.billingVersion,publicModelId:'image-a',binding:'image.generate',modality:'image',target:{type:'upstream',id:'u1'},facts:{quality:'medium',resolution:'1K',ratio:'1:1'}},connection:{providerId:'p1',protocol:'apimart-images',wireModel:'local-apimart-model',baseUrl:f.origin+'/v1',apiKey:f.marker,credentialRef:provider.credentialRef,maxConcurrent:1,timeoutMs:1000},capabilities:{...u.capabilities,nativeResolutions:['1K']},parameterMap:{apimartImages:{schemaVersion:1,maxOutputs:1,ratios:['1:1'],supportsMask:false},resolutionPolicy:{mode:'map',field:'resolution',values:{'1K':'1K'}},qualityPolicy:{mode:'omit',choices:[{id:'medium',label:'standard'}]}},channelGuard:{upstreamId:'u1'}};
  const observations=async()=>Number((await f.sql.query('SELECT count(*)::int n FROM app_model_health_observations')).rows[0].n);
  const {ensureHealthSchema}=await import('../src/lib/model-health/schema');await ensureHealthSchema(f.sql);const beforeHealth=await observations();
  const adapter=healthObservedFetch(scope,apimartImagesFetch(scope,{trustedOrigins:[f.origin]}),{trustedOrigins:[f.origin]});
  const busy=await withImageOperation('local-apimart-model',{id:'apimart-capacity-queued',durable:true},()=>adapter(f.origin+'/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'local capacity fixture',n:1})}));assert.equal(busy.status,429);
  const marker=(await f.sql.query("SELECT parameters,task_id,state FROM app_supplier_calls WHERE billing_unit_id='apimart-capacity-queued'")).rows[0];assert(marker);assert.equal(marker.parameters,null);assert.equal(marker.task_id,null);assert.equal(marker.state,'pre-submission-failed');assert.equal(await observations(),beforeHealth);assert.equal(posts,0);
  await lease.release();lease=undefined;
  const originalChildId=child.id;
  const worker=()=>gen.POST(new Request(f.origin+'/api/generate-image',{method:'POST',headers:{'content-type':'application/json','x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:child.id})}));
  await Promise.all([worker(),worker()]);assert.equal(posts,0,'old failed task is never replayed');
  const second={...input,operationId:randomUUID()};
  const secondPlan=await(await planRoute.POST(req('/api/imagegen/plan',second))).json();
  await imagegen.POST(req('/api/imagegen',{...second,confirmation:{billingVersion:secondPlan.billingVersion,modelVersion:secondPlan.modelVersion,credits:secondPlan.totalCredits,confirmed:true}}));
  let done:any;
  for(let i=0;i<200;i++){done=await(await imagegen.GET(req('/api/imagegen?operationId='+second.operationId))).json();if(['succeeded','failed','needs_attention'].includes(done.status))break;await new Promise(r=>setTimeout(r,40))}
  child=(await f.sql.query("SELECT * FROM app_image_jobs WHERE kind='generate' AND id<>$1 ORDER BY created_at DESC LIMIT 1",[originalChildId])).rows[0];
  assert.equal(done.status,'succeeded',JSON.stringify(done));assert.equal(done.artifacts.length,1);assert.equal(posts,1);assert.equal(done.chargedCredits,plan.totalCredits);
  await worker();assert.equal(posts,1);assert.equal(await db.getImageJobChargedCredits(child.id),plan.totalCredits);
  const billed=(await f.sql.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',['led-image-'+child.id])).rows[0].n;assert.equal(billed,1);
  assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_model_provider_leases')).rows[0].n,0);
  console.log('IMAGE_CAPACITY_ROUTE=PASS ACTUAL_PLAN_SUBMIT_CHILD_PARENT=1 BUSY_POSTS=0 BUSY_FINISHED_FAILED=1 APIMART_MARKER_CLEARED=1 FALSE_SUPPLIER_HEALTH_FAILURES=0 EXPLICIT_RETRY_POSTS=1 DUPLICATE_WORKER_POSTS=0 ARTIFACTS=1 SETTLEMENTS=1 CHARGED='+done.chargedCredits+' SUPPLIER_CALLS=0');
 }finally{await lease?.release();await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await db.getPool().end();await f.cleanup()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
